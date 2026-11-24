-- Executado somente no PostgreSQL temporario do CI.
\set ON_ERROR_STOP on

-- Preflight: os objetos da fase 1 existem, roles publicas nao recebem DML.
DO $$
BEGIN
 IF to_regprocedure('public.dashboard_catalogo_criar_personalizado(text,text,text)') IS NULL
    OR to_regprocedure('public.dashboard_catalogo_listar_personalizados()') IS NULL THEN
   RAISE EXCEPTION 'RPCs novas ausentes';
 END IF;
 IF has_function_privilege('anon','public.dashboard_catalogo_criar_personalizado(text,text,text)','EXECUTE')
    OR has_function_privilege('anon','public.dashboard_catalogo_listar_personalizados()','EXECUTE') THEN
   RAISE EXCEPTION 'Anon nao pode executar as RPCs';
 END IF;
 IF NOT has_function_privilege('authenticated','public.dashboard_catalogo_criar_personalizado(text,text,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.dashboard_catalogo_listar_personalizados()','EXECUTE') THEN
   RAISE EXCEPTION 'Role authenticated deve poder invocar wrapper com verificacao interna';
 END IF;
 IF has_table_privilege('authenticated','dashboard_catalog.dashboards','INSERT')
    OR has_table_privilege('authenticated','dashboard_catalog.dashboards','SELECT')
    OR has_table_privilege('authenticated','dashboard_catalog.topico_dashboards','INSERT')
    OR has_table_privilege('authenticated','dashboard_catalog.auditoria','INSERT') THEN
   RAISE EXCEPTION 'Sem DML direto nas tabelas privadas';
 END IF;
 IF EXISTS (
  SELECT 1 FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='dashboard_catalog' AND c.relkind='r' AND NOT c.relrowsecurity
 ) THEN
   RAISE EXCEPTION 'RLS deve estar ativo';
 END IF;
END
$$;

SET ROLE authenticated;

-- Sem sessao: erro de autorizacao.
SELECT set_config('request.jwt.claim.sub','',false);
DO $$
BEGIN
 PERFORM public.dashboard_catalogo_criar_personalizado('Sem sessao',null,'relatorios');
 RAISE EXCEPTION 'Sem sessao conseguiu criar';
EXCEPTION WHEN insufficient_privilege THEN
 NULL;
END
$$;

-- Gestor com user_metadata falsificado como admin continua negado.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
DO $$
BEGIN
 PERFORM public.dashboard_catalogo_criar_personalizado('Gestor',null,'relatorios');
 RAISE EXCEPTION 'Manager conseguiu criar';
EXCEPTION WHEN insufficient_privilege THEN
 NULL;
END
$$;
DO $$
BEGIN
 PERFORM 1 FROM public.dashboard_catalogo_listar_personalizados();
 RAISE EXCEPTION 'Manager conseguiu listar';
EXCEPTION WHEN insufficient_privilege THEN
 NULL;
END
$$;

-- Admin: uma criacao legitima com descricao.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
SELECT public.dashboard_catalogo_criar_personalizado(
 'Indicadores Operacionais','Indicadores consolidados','relatorios'
) AS novo_id;

-- Falhas devem abortar sem criar dashboard, vinculo nem auditoria.
DO $$
BEGIN
 PERFORM public.dashboard_catalogo_criar_personalizado('Desconhecido',null,'nao-existe');
 RAISE EXCEPTION 'Topico inexistente foi aceito';
EXCEPTION WHEN SQLSTATE 'P0002' THEN
 NULL;
END
$$;
DO $$
BEGIN
 PERFORM public.dashboard_catalogo_criar_personalizado(' ',null,'relatorios');
 RAISE EXCEPTION 'Nome vazio foi aceito';
EXCEPTION WHEN invalid_parameter_value THEN
 NULL;
END
$$;
DO $$
BEGIN
 PERFORM public.dashboard_catalogo_criar_personalizado(
  'Nome valido',repeat('X',501),'relatorios'
 );
 RAISE EXCEPTION 'Descricao acima do limite foi aceita';
EXCEPTION WHEN invalid_parameter_value THEN
 NULL;
END
$$;
DO $$
DECLARE
 v_count bigint;
BEGIN
 SELECT count(*) INTO v_count FROM public.dashboard_catalogo_listar_personalizados();
 IF v_count <> 1 THEN
   RAISE EXCEPTION 'Admin esperava 1 cadastro, recebeu %',v_count;
 END IF;
END
$$;

RESET ROLE;

-- Confirmar identidade, status, auditoria e ausencia de grants.
DO $$
BEGIN
 IF (SELECT count(*) FROM dashboard_catalog.dashboards WHERE codigo IS NULL) <> 1 THEN
   RAISE EXCEPTION 'Falhas criaram linhas orfas';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM dashboard_catalog.dashboards d
  JOIN dashboard_catalog.topico_dashboards td ON td.dashboard_id=d.id
  JOIN dashboard_catalog.topicos t ON t.id=td.topico_id
  WHERE d.codigo IS NULL AND d.estado='rascunho'
    AND d.publicado_em IS NULL AND d.descricao='Indicadores consolidados'
    AND t.slug='relatorios' AND td.posicao=1
 ) THEN
   RAISE EXCEPTION 'Rascunho novo nao foi vinculado corretamente';
 END IF;
 IF (SELECT count(*) FROM dashboard_catalog.auditoria WHERE acao='criar_rascunho') <> 1 THEN
   RAISE EXCEPTION 'Auditoria nao gravada';
 END IF;
 IF EXISTS (SELECT 1 FROM dashboard_catalog.acesso_dashboards)
    OR EXISTS (SELECT 1 FROM dashboard_catalog.acesso_topicos) THEN
   RAISE EXCEPTION 'Criacao concedeu permissao implicitamente';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM dashboard_catalog.dashboards
  WHERE codigo='visao-geral-chamadas' AND estado='publicado'
 ) THEN
   RAISE EXCEPTION 'Dashboard legado foi alterado';
 END IF;
END
$$;

-- Induz erro no ultimo INSERT da funcao para demonstrar ROLLBACK atomico.
ALTER TABLE dashboard_catalog.auditoria
 ADD CONSTRAINT test_forcar_falha_auditoria
 CHECK (acao <> 'criar_rascunho') NOT VALID;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
DO $$
BEGIN
 PERFORM public.dashboard_catalogo_criar_personalizado('Rollback',null,'relatorios');
 RAISE EXCEPTION 'Criacao com falha de auditoria deveria abortar';
EXCEPTION WHEN check_violation THEN
 NULL;
END
$$;
RESET ROLE;
ALTER TABLE dashboard_catalog.auditoria DROP CONSTRAINT test_forcar_falha_auditoria;

DO $$
BEGIN
 IF (SELECT count(*) FROM dashboard_catalog.dashboards WHERE codigo IS NULL) <> 1
    OR (SELECT count(*) FROM dashboard_catalog.topico_dashboards) <> 2
    OR (SELECT count(*) FROM dashboard_catalog.auditoria) <> 1 THEN
   RAISE EXCEPTION 'Rollback da criacao nao foi atomico';
 END IF;
END
$$;

\echo 'SQL_DRAFTS_SECURITY_AND_ROLLBACK_PASSED'
