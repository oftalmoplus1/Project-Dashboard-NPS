-- EDITOR VISUAL - FASE 1: CADASTRO SEGURO DE RASCUNHO PERSONALIZADO
-- PREPARADO, NAO INSTALADO. PostgreSQL 15 / Supabase self-hosted.
--
-- PRECONDICOES:
-- 1. O responsavel optou por implantacao direta SEM homologacao e SEM backup.
--    RISCO ACEITO: em caso de problema apos COMMIT, nao ha restauracao garantida.
--    Confirmar preflight e revisar o SQL completo antes de executar.
-- 2. Confirmar o schema real com o CSV de inventario (24/11/2026).
-- 3. Executar SOMENTE no banco self-hosted desta aplicacao.
-- 4. Aplicar uma unica vez. Uma falha causa ROLLBACK desta transacao.
-- 5. Nao altera public.relatorio_chamadas, public.listar_filas,
--    funcoes de chamadas, ACL existente nem dashboards legados.
-- 6. Nao habilita editor, compartilhamento ou publicacao de rascunhos.
--
-- PRE-FLIGHT SOMENTE LEITURA (executar antes, em outra query):
-- SELECT to_regclass('dashboard_catalog.dashboards') IS NOT NULL AS dashboards_existe,
--        to_regclass('dashboard_catalog.topicos') IS NOT NULL AS topicos_existe,
--        to_regclass('dashboard_catalog.topico_dashboards') IS NOT NULL AS vinculos_existem,
--        to_regclass('dashboard_catalog.auditoria') IS NOT NULL AS auditoria_existe,
--        to_regprocedure('public.dashboard_catalogo_criar_personalizado(text,text,text)')
--          IS NULL AS nova_rpc_ainda_nao_instalada;

BEGIN;
-- Evita manter lock exclusivo da tabela por tempo indefinido.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Apenas metadado descritivo do novo dashboard.
ALTER TABLE dashboard_catalog.dashboards
  ADD COLUMN descricao text;

ALTER TABLE dashboard_catalog.dashboards
  ADD CONSTRAINT dashboards_descricao_limite
  CHECK (descricao IS NULL OR pg_catalog.char_length(descricao) <= 500);

-- SECURITY DEFINER fica no schema PRIVADO; nao recebe acesso de tabela ao cliente.
-- Conferir ownership e privilegios do executor no preflight ANTES de executar.
CREATE FUNCTION dashboard_catalog.criar_personalizado(
  p_nome text, p_descricao text, p_topico_slug text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario uuid := auth.uid();
  v_role text;
  v_nome text := pg_catalog.btrim(p_nome);
  v_descricao text := NULLIF(pg_catalog.btrim(COALESCE(p_descricao, '')), '');
  v_slug text := pg_catalog.btrim(p_topico_slug);
  v_topico uuid;
  v_dashboard uuid;
  v_posicao integer;
BEGIN
  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'Sessao nao autenticada' USING ERRCODE = '42501';
  END IF;

  SELECT u.raw_app_meta_data->>'dashboard_role' INTO v_role
  FROM auth.users u WHERE u.id = v_usuario;

  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Somente administradores podem criar dashboards'
      USING ERRCODE = '42501';
  END IF;

  IF v_nome IS NULL OR pg_catalog.char_length(v_nome) NOT BETWEEN 1 AND 120
     OR v_descricao IS NOT NULL AND pg_catalog.char_length(v_descricao) > 500
     OR v_slug IS NULL OR pg_catalog.char_length(v_slug) NOT BETWEEN 1 AND 120
     OR v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'Parametros invalidos' USING ERRCODE = '22023';
  END IF;

  -- Serializa criacoes para o mesmo topico, evitando posicao duplicada.
  SELECT t.id INTO v_topico
  FROM dashboard_catalog.topicos t
  WHERE t.slug = v_slug
  FOR UPDATE;

  IF v_topico IS NULL THEN
    RAISE EXCEPTION 'Topico nao encontrado' USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(MAX(td.posicao) + 1, 0)
  INTO v_posicao
  FROM dashboard_catalog.topico_dashboards td
  WHERE td.topico_id = v_topico;

  INSERT INTO dashboard_catalog.dashboards (
    nome, descricao, estado, codigo, publicado_em, criado_por
  )
  VALUES (
    v_nome, v_descricao, 'rascunho', NULL, NULL, v_usuario
  )
  RETURNING id INTO v_dashboard;

  INSERT INTO dashboard_catalog.topico_dashboards (
    topico_id, dashboard_id, posicao, vinculado_por
  )
  VALUES (v_topico, v_dashboard, v_posicao, v_usuario);

  INSERT INTO dashboard_catalog.auditoria (
    operador_id, acao, tipo_objeto, objeto_id, contexto
  )
  VALUES (
    v_usuario, 'criar_rascunho', 'dashboard', v_dashboard,
    pg_catalog.jsonb_build_object('topico_id', v_topico, 'tipo', 'personalizado')
  );

  RETURN v_dashboard;
END;
$$;

-- Listagem somente administrativa dos personalizados. Nao toca ACL de leitura
-- dos dashboards publicados nem expande a navegacao dos usuarios comuns.
CREATE FUNCTION dashboard_catalog.listar_personalizados()
RETURNS TABLE (
  id uuid, nome text, descricao text, estado text,
  topico_slug text, topico_nome text, criado_em timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_usuario uuid := auth.uid();
  v_role text;
BEGIN
  IF v_usuario IS NULL THEN
    RAISE EXCEPTION 'Sessao nao autenticada' USING ERRCODE = '42501';
  END IF;

  SELECT u.raw_app_meta_data->>'dashboard_role' INTO v_role
  FROM auth.users u WHERE u.id = v_usuario;

  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Acesso restrito a administradores'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT d.id, d.nome, d.descricao, d.estado,
         t.slug, t.nome, d.criado_em
  FROM dashboard_catalog.dashboards AS d
  JOIN dashboard_catalog.topico_dashboards AS td ON td.dashboard_id = d.id
  JOIN dashboard_catalog.topicos AS t ON t.id = td.topico_id
  WHERE d.codigo IS NULL
  ORDER BY d.criado_em DESC, d.id, t.slug;
END;
$$;

-- Wrappers publicos sem elevacao de privileges: acesso pela RPC com JWT.
CREATE FUNCTION public.dashboard_catalogo_criar_personalizado(
  p_nome text, p_descricao text, p_topico_slug text
)
RETURNS uuid
LANGUAGE sql SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT dashboard_catalog.criar_personalizado(p_nome,p_descricao,p_topico_slug);
$$;

CREATE FUNCTION public.dashboard_catalogo_listar_personalizados()
RETURNS TABLE (
  id uuid, nome text, descricao text, estado text,
  topico_slug text, topico_nome text, criado_em timestamptz
)
LANGUAGE sql SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT id,nome,descricao,estado,topico_slug,topico_nome,criado_em
  FROM dashboard_catalog.listar_personalizados();
$$;

-- Nao depender do grant default EXECUTE TO PUBLIC para funcoes novas.
REVOKE ALL ON FUNCTION dashboard_catalog.criar_personalizado(text,text,text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION dashboard_catalog.listar_personalizados()
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.dashboard_catalogo_criar_personalizado(text,text,text)
  FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.dashboard_catalogo_listar_personalizados()
  FROM PUBLIC,anon,authenticated;

GRANT USAGE ON SCHEMA dashboard_catalog TO authenticated;
GRANT EXECUTE ON FUNCTION dashboard_catalog.criar_personalizado(text,text,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION dashboard_catalog.listar_personalizados()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_catalogo_criar_personalizado(text,text,text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_catalogo_listar_personalizados()
  TO authenticated;

-- RLS e grants das tabelas originais permanecem inalterados.
-- A notificacao sera entregue apenas se a transacao inteira for confirmada.
NOTIFY pgrst, 'reload schema';
COMMIT;

-- POS-FLIGHT SOMENTE LEITURA (executar separadamente):
-- SELECT
--  to_regprocedure('public.dashboard_catalogo_criar_personalizado(text,text,text)')
--     IS NOT NULL AS criar_existe,
--  to_regprocedure('public.dashboard_catalogo_listar_personalizados()')
--     IS NOT NULL AS listar_existe,
--  has_function_privilege(
--    'anon','public.dashboard_catalogo_criar_personalizado(text,text,text)','EXECUTE'
--  ) AS anon_cria,
--  has_function_privilege(
--    'authenticated','public.dashboard_catalogo_criar_personalizado(text,text,text)','EXECUTE'
--  ) AS autenticado_pode_chamar,
--  has_table_privilege('authenticated','dashboard_catalog.dashboards','INSERT')
--    AS autenticado_tem_insert_direto;
-- Esperado: true, true, false, true, false.
-- TESTES POR SESSAO REAL: admin cria e lista; manager/anon nao;
-- topico inexistente nao deixa registro orfao; auditoria criada.
-- NAO executar INSERT de teste em producao.
