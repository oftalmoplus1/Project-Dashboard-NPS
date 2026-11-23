-- ETAPA NOVA / 23-11-2026 - CADASTRO DE TOPICOS E CINCO VISUALIZACOES
-- SQL PREPARADO, NAO INSTALADO PELO GITHUB. Execute apenas no Supabase self-hosted
-- correto, apos verificar estado e ponto de retorno. Nao reexecute os scripts antigos.
-- Esta migracao nao modifica dados da LigSim, n8n, RPCs de chamadas, RLS ou grants
-- de tabelas operacionais. Nenhum topico e removido automaticamente.
-- Os slugs existentes permanecem invariaveis. Edicao altera somente nome.
-- Primeiro consulte docs/sql/dashboard_catalogo_admin_validacao_20261123.sql.

BEGIN;
DO $check$
BEGIN
  IF pg_catalog.to_regclass('dashboard_catalog.topicos') IS NULL
     OR pg_catalog.to_regclass('dashboard_catalog.auditoria') IS NULL
     OR pg_catalog.to_regclass('dashboard_catalog.topico_dashboards') IS NULL
     OR pg_catalog.to_regprocedure('dashboard_catalog.vincular_dashboard_existente(text,text)') IS NULL
     OR pg_catalog.to_regprocedure('public.dashboard_catalogo_listar_topicos()') IS NULL
  THEN
     RAISE EXCEPTION 'Catalogo anterior ausente: nao executar instalacao'
       USING ERRCODE='P0001';
  END IF;
END;
$check$;

-- Corrige somente o topico historico 'Relatorios' caso ainda tenha o nome legado.
-- Preserva slug, id, ACL, ordem e vinculos. Na auditoria, UUID nil identifica
-- uma migracao operacional do sistema, nao um usuario humano.
DO $rename$
DECLARE
 v_id uuid;
 v_nome_antigo text;
BEGIN
 SELECT t.id,t.nome INTO v_id,v_nome_antigo
   FROM dashboard_catalog.topicos t
   WHERE t.slug='relatorios' AND t.nome IN ('Relatórios','Relatorios')
   FOR UPDATE;
 IF v_id IS NOT NULL THEN
   UPDATE dashboard_catalog.topicos SET nome='Call Center',
      atualizado_em=pg_catalog.now() WHERE id=v_id;
   INSERT INTO dashboard_catalog.auditoria
      (operador_id,acao,tipo_objeto,objeto_id,contexto)
   VALUES (
      '00000000-0000-0000-0000-000000000000'::uuid,
      'migrar_nome','topico',v_id,
      pg_catalog.jsonb_build_object('slug','relatorios',
        'nome_anterior',v_nome_antigo,'nome_novo','Call Center',
        'origem','migracao_sql_administrativa','executor_role',current_user)
   );
 END IF;
END;
$rename$;

-- Mantem o contrato e a auditoria da RPC existente; amplia apenas a lista
-- fechada para as cinco visualizacoes efetivamente implementadas.
CREATE OR REPLACE FUNCTION dashboard_catalog.vincular_dashboard_existente(
    p_topico_slug text, p_codigo text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
    v_usuario uuid := auth.uid();
    v_papel text;
    v_nome text;
    v_topico_id uuid;
    v_dashboard_id uuid;
    v_novo_vinculo uuid;
BEGIN
    IF v_usuario IS NULL THEN
        RAISE EXCEPTION 'Sessao nao autenticada' USING ERRCODE='42501';
    END IF;

    SELECT u.raw_app_meta_data->>'dashboard_role'
      INTO v_papel
    FROM auth.users AS u WHERE u.id=v_usuario;

    IF v_papel IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Somente administradores podem associar dashboards'
            USING ERRCODE='42501';
    END IF;

    -- Lista fechada de renderizadores atualmente implementados.
    v_nome := CASE p_codigo
        WHEN 'visao-geral-chamadas' THEN 'Visão geral de Chamadas'
        WHEN 'chamadas-por-mes' THEN 'Chamadas por mês'
        WHEN 'chamadas-por-hora' THEN 'Chamadas por hora'
        WHEN 'comparativo-anual-chamadas' THEN 'Comparativo anual'
        WHEN 'tma-tme-diario' THEN 'TMA e TME diário'
        ELSE NULL
    END;
    IF v_nome IS NULL THEN
        RAISE EXCEPTION 'Dashboard nao reconhecido'
            USING ERRCODE='22023';
    END IF;

    SELECT t.id INTO v_topico_id
    FROM dashboard_catalog.topicos t
    WHERE t.slug=p_topico_slug;
    IF v_topico_id IS NULL THEN
        RAISE EXCEPTION 'Topico nao encontrado'
            USING ERRCODE='22023';
    END IF;

    INSERT INTO dashboard_catalog.dashboards (
        codigo,nome,estado,publicado_em,criado_por
    ) VALUES (
        p_codigo,v_nome,'publicado',pg_catalog.now(),v_usuario
    )
    ON CONFLICT (codigo) DO NOTHING;

    SELECT d.id INTO v_dashboard_id
    FROM dashboard_catalog.dashboards d WHERE d.codigo=p_codigo;

    IF v_dashboard_id IS NULL THEN
        RAISE EXCEPTION 'Falha ao localizar dashboard'
            USING ERRCODE='P0001';
    END IF;

    INSERT INTO dashboard_catalog.topico_dashboards (
        topico_id,dashboard_id,posicao,vinculado_por
    ) VALUES (
        v_topico_id,v_dashboard_id,
        COALESCE((
            SELECT MAX(td.posicao)+1
            FROM dashboard_catalog.topico_dashboards td
            WHERE td.topico_id=v_topico_id
        ),0),
        v_usuario
    )
    ON CONFLICT (topico_id,dashboard_id) DO NOTHING
    RETURNING dashboard_id INTO v_novo_vinculo;

    IF v_novo_vinculo IS NOT NULL THEN
        INSERT INTO dashboard_catalog.auditoria (
            operador_id,acao,tipo_objeto,objeto_id,contexto
        ) VALUES (
            v_usuario,'vincular','dashboard',v_dashboard_id,
            pg_catalog.jsonb_build_object(
                'topico_id',v_topico_id,'codigo',p_codigo
            )
        );
    END IF;

    RETURN v_dashboard_id;
END;
$$;


-- Editar SOMENTE nome; preserve slug e chaves das ACLs, URLs e associacoes.
CREATE OR REPLACE FUNCTION dashboard_catalog.atualizar_topico(p_slug text, p_nome text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_usuario uuid := auth.uid();
  v_papel text;
  v_nome text := pg_catalog.btrim(p_nome);
  v_id uuid;
  v_antigo text;
BEGIN
  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'Sessao necessaria' USING ERRCODE='42501';
  END IF;
  SELECT u.raw_app_meta_data->>'dashboard_role' INTO v_papel
    FROM auth.users u WHERE u.id=v_usuario;
  IF v_papel IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Somente administrador pode editar topicos'
      USING ERRCODE='42501';
  END IF;
  IF v_nome IS NULL OR pg_catalog.char_length(v_nome) NOT BETWEEN 1 AND 120
     OR p_slug IS NULL OR pg_catalog.char_length(p_slug) NOT BETWEEN 1 AND 120
     OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'Nome ou topico invalido' USING ERRCODE='22023';
  END IF;

  SELECT t.id,t.nome INTO v_id,v_antigo
    FROM dashboard_catalog.topicos t WHERE t.slug=p_slug FOR UPDATE;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Topico nao encontrado' USING ERRCODE='P0002';
  END IF;
  IF v_antigo=v_nome THEN RETURN v_id; END IF;
  IF EXISTS (
      SELECT 1 FROM dashboard_catalog.topicos t
      WHERE t.id<>v_id AND pg_catalog.lower(pg_catalog.btrim(t.nome))=pg_catalog.lower(v_nome)
  ) THEN
    RAISE EXCEPTION 'Ja existe topico com este nome' USING ERRCODE='23505';
  END IF;
  UPDATE dashboard_catalog.topicos SET nome=v_nome,atualizado_em=pg_catalog.now()
    WHERE id=v_id;

  INSERT INTO dashboard_catalog.auditoria
    (operador_id,acao,tipo_objeto,objeto_id,contexto)
  VALUES (v_usuario,'editar','topico',v_id,
    pg_catalog.jsonb_build_object('slug',p_slug,'nome_anterior',v_antigo,'nome_novo',v_nome));
  RETURN v_id;
END;
$function$;

-- Exclusao transacional: CASCADE somente nos vinculos/grants que referenciam
-- este topico, preservando registros dashboard_catalog.dashboards e graficos.
CREATE OR REPLACE FUNCTION dashboard_catalog.excluir_topico(
  p_slug text, p_confirmar_slug text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=''
AS $function$
DECLARE
  v_usuario uuid := auth.uid();
  v_papel text;
  v_id uuid;
  v_nome text;
  v_vinculos bigint;
  v_grants_topicos bigint;
  v_grants_dashboards bigint;
  v_impacto jsonb;
BEGIN
  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'Sessao necessaria' USING ERRCODE='42501';
  END IF;
  SELECT u.raw_app_meta_data->>'dashboard_role' INTO v_papel
    FROM auth.users u WHERE u.id=v_usuario;
  IF v_papel IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Somente administrador pode excluir topicos'
      USING ERRCODE='42501';
  END IF;
  IF p_slug IS NULL OR p_slug IS DISTINCT FROM p_confirmar_slug
    OR pg_catalog.char_length(p_slug) NOT BETWEEN 1 AND 120
    OR p_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'Confirmacao invalida' USING ERRCODE='22023';
  END IF;
  SELECT t.id,t.nome INTO v_id,v_nome FROM dashboard_catalog.topicos t
    WHERE t.slug=p_slug FOR UPDATE;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Topico nao encontrado' USING ERRCODE='P0002';
  END IF;
  SELECT count(*) INTO v_vinculos FROM dashboard_catalog.topico_dashboards td
    WHERE td.topico_id=v_id;
  SELECT count(*) INTO v_grants_topicos FROM dashboard_catalog.acesso_topicos a
    WHERE a.topico_id=v_id;
  SELECT count(*) INTO v_grants_dashboards FROM dashboard_catalog.acesso_dashboards a
    WHERE a.topico_id=v_id;

  v_impacto:=pg_catalog.jsonb_build_object(
    'slug',p_slug,'nome',v_nome,'vinculos_removidos',v_vinculos,
    'grants_topicos_removidos',v_grants_topicos,
    'grants_dashboards_removidos',v_grants_dashboards,
    'dashboards_originais_preservados',true);

  DELETE FROM dashboard_catalog.topicos WHERE id=v_id;
  INSERT INTO dashboard_catalog.auditoria
   (operador_id,acao,tipo_objeto,objeto_id,contexto)
  VALUES (v_usuario,'excluir','topico',v_id,v_impacto);
  RETURN v_impacto;
END;
$function$;

-- Somente wrappers publicos INVOKER. O privilegio efetivo depende da
-- autenticacao/autorizacao interna verificada contra auth.users em cada chamada.
CREATE OR REPLACE FUNCTION public.dashboard_catalogo_atualizar_topico(
 p_slug text, p_nome text
)
RETURNS uuid LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
 SELECT dashboard_catalog.atualizar_topico(p_slug,p_nome);
$function$;

CREATE OR REPLACE FUNCTION public.dashboard_catalogo_excluir_topico(
 p_slug text, p_confirmar_slug text
)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path=''
AS $function$
 SELECT dashboard_catalog.excluir_topico(p_slug,p_confirmar_slug);
$function$;

REVOKE ALL ON FUNCTION dashboard_catalog.atualizar_topico(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION dashboard_catalog.excluir_topico(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.dashboard_catalogo_atualizar_topico(text,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.dashboard_catalogo_excluir_topico(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dashboard_catalog.atualizar_topico(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION dashboard_catalog.excluir_topico(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_catalogo_atualizar_topico(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_catalogo_excluir_topico(text,text) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';
