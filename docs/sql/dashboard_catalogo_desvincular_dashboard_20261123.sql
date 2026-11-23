-- ADMINISTRACAO / DESVINCULAR UM DASHBOARD DE UM TOPICO (2026-11-23)
-- Arquivo preparado para instalacao MANUAL no Supabase self-hosted correto.
-- Nao executar no projeto Supabase de outra aplicacao.
-- Confirmar estrutura existente e ponto de retorno antes da execucao.
-- Nenhuma alteracao em relatorio_chamadas, listar_filas, dashboards ou graficos originais.
--
-- Pre-condicao: dashboard_catalog e suas FKs conforme
-- docs/sql/dashboard_catalogo_fase2_estrutura.sql (ja instaladas).
-- A FK acesso_dashboard_vinculo_fk deve ter ON DELETE CASCADE para que as
-- concessoes contextuais do vinculo sejam revogadas atomicamente.

BEGIN;

DO $preflight$
BEGIN
 IF pg_catalog.to_regclass('dashboard_catalog.topicos') IS NULL
    OR pg_catalog.to_regclass('dashboard_catalog.dashboards') IS NULL
    OR pg_catalog.to_regclass('dashboard_catalog.topico_dashboards') IS NULL
    OR pg_catalog.to_regclass('dashboard_catalog.acesso_dashboards') IS NULL
    OR pg_catalog.to_regclass('dashboard_catalog.auditoria') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_constraint c
      WHERE c.conrelid=pg_catalog.to_regclass('dashboard_catalog.acesso_dashboards')
        AND c.confrelid=pg_catalog.to_regclass('dashboard_catalog.topico_dashboards')
        AND c.conname='acesso_dashboard_vinculo_fk'
        AND c.confdeltype='c'
    )
 THEN
  RAISE EXCEPTION 'Catalogo ou FK CASCADE nao corresponde ao esquema esperado. Nenhuma alteracao realizada.'
    USING ERRCODE='P0001';
 END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION dashboard_catalog.desvincular_dashboard_topico(
  p_topico_slug text, p_codigo text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=''
AS $function$
DECLARE
  v_usuario uuid := auth.uid();
  v_papel text;
  v_topico_id uuid;
  v_dashboard_id uuid;
  v_permissoes bigint;
  v_contexto jsonb;
BEGIN
  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'Sessao necessaria' USING ERRCODE='42501';
  END IF;
  SELECT u.raw_app_meta_data ->> 'dashboard_role' INTO v_papel
  FROM auth.users u WHERE u.id=v_usuario;
  IF v_papel IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Somente administradores podem desvincular dashboards'
      USING ERRCODE='42501';
  END IF;

  IF p_topico_slug IS NULL
    OR pg_catalog.char_length(p_topico_slug) NOT BETWEEN 1 AND 120
    OR p_topico_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    OR p_codigo IS NULL
    OR pg_catalog.char_length(p_codigo) NOT BETWEEN 1 AND 100
    OR p_codigo !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  THEN
    RAISE EXCEPTION 'Identificador invalido' USING ERRCODE='22023';
  END IF;

  -- Lock somente no vinculo especifico. Ausencia nao e sucesso ficticio.
  SELECT td.topico_id,td.dashboard_id INTO v_topico_id,v_dashboard_id
  FROM dashboard_catalog.topicos t
  JOIN dashboard_catalog.topico_dashboards td ON td.topico_id=t.id
  JOIN dashboard_catalog.dashboards d ON d.id=td.dashboard_id
  WHERE t.slug=p_topico_slug AND d.codigo=p_codigo
  FOR UPDATE OF td;

  IF v_topico_id IS NULL THEN
    RAISE EXCEPTION 'Dashboard nao vinculado a este topico' USING ERRCODE='P0002';
  END IF;

  SELECT count(*)::bigint INTO v_permissoes
  FROM dashboard_catalog.acesso_dashboards a
  WHERE a.topico_id=v_topico_id AND a.dashboard_id=v_dashboard_id;

  -- A FK composta remove SOMENTE as permissoes deste contexto, nao as de
  -- outros topicos. O dashboard original jamais e removido.
  DELETE FROM dashboard_catalog.topico_dashboards td
  WHERE td.topico_id=v_topico_id AND td.dashboard_id=v_dashboard_id;

  v_contexto:=pg_catalog.jsonb_build_object(
     'topico_id',v_topico_id,'topico_slug',p_topico_slug,
     'codigo',p_codigo,'permissoes_contextuais_revogadas',v_permissoes,
     'dashboard_preservado',true
  );
  INSERT INTO dashboard_catalog.auditoria
    (operador_id,acao,tipo_objeto,objeto_id,contexto)
  VALUES (v_usuario,'desvincular','dashboard',v_dashboard_id,v_contexto);

  RETURN v_contexto;
END;
$function$;

-- O PostgREST acessa somente a wrapper INVOKER, sem role privilegiada.
CREATE OR REPLACE FUNCTION public.dashboard_catalogo_desvincular_dashboard_topico(
  p_topico_slug text, p_codigo text
)
RETURNS jsonb
LANGUAGE sql SECURITY INVOKER
SET search_path=''
AS $function$
  SELECT dashboard_catalog.desvincular_dashboard_topico(p_topico_slug,p_codigo);
$function$;

REVOKE ALL ON FUNCTION dashboard_catalog.desvincular_dashboard_topico(text,text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.dashboard_catalogo_desvincular_dashboard_topico(text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dashboard_catalog.desvincular_dashboard_topico(text,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_catalogo_desvincular_dashboard_topico(text,text)
  TO authenticated;

COMMIT;

NOTIFY pgrst,'reload schema';

-- TESTES SOMENTE LEITURA (em comando separado, apos instalar):
-- SELECT
--   to_regprocedure('public.dashboard_catalogo_desvincular_dashboard_topico(text,text)') IS NOT NULL AS funcao_existe,
--   has_function_privilege('anon','public.dashboard_catalogo_desvincular_dashboard_topico(text,text)','EXECUTE') AS anon_executa,
--   has_function_privilege('authenticated','public.dashboard_catalogo_desvincular_dashboard_topico(text,text)','EXECUTE') AS authenticated_executa;
-- Esperado: true,false,true. Manager autenticado deve receber 403/42501.
-- Testar com um dashboard de topico DESCARTAVEL, nunca um painel critico.
