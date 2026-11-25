-- FASE 4A / PROPOSTA: leitura segura de snapshots publicados.
-- NAO EXECUTADO no Supabase self-hosted. Nao altera Call Center, tabelas de chamadas
-- nem o layout de rascunho (Fase 3B).
-- As publicacoes NAO sao criadas nesta fase; a funcao de publicar sera
-- implementada somente apos homologar consultas/filtros dos componentes.
-- Ja existe ACL contextual: dashboard_catalog.acesso_dashboards; nao duplicar.
-- Exige schema da Fase 3B, PostgreSQL 15.8 e preflight do ambiente real.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $guard$
BEGIN
 IF pg_catalog.to_regclass('dashboard_catalog.dashboards') IS NULL
  OR pg_catalog.to_regclass('dashboard_catalog.editor_layout_rascunhos') IS NULL
  OR pg_catalog.to_regclass('dashboard_catalog.acesso_dashboards') IS NULL
  OR pg_catalog.to_regclass('dashboard_catalog.topico_dashboards') IS NULL
  OR pg_catalog.to_regclass('dashboard_catalog.topicos') IS NULL
  OR pg_catalog.to_regclass('dashboard_catalog.auditoria') IS NULL
  OR pg_catalog.to_regprocedure('public.dashboard_editor_layout_ler(uuid)') IS NULL
  OR pg_catalog.to_regclass('dashboard_catalog.editor_publicacoes') IS NOT NULL
  OR pg_catalog.to_regprocedure('public.dashboard_monitoramento_listar()') IS NOT NULL
  OR pg_catalog.to_regprocedure('public.dashboard_monitoramento_obter(uuid)') IS NOT NULL
 THEN
  RAISE EXCEPTION 'Precondicoes nao atendidas: revisar schema, NAO reaplicar'
   USING ERRCODE = 'P0001';
 END IF;
END
$guard$;

-- Historico imutavel por versao: uma publicacao NAO reutiliza o documento
-- editavel do rascunho. (A escrita atomica fica reservada a outra fase.)
CREATE TABLE dashboard_catalog.editor_publicacoes (
 dashboard_id uuid NOT NULL REFERENCES dashboard_catalog.dashboards(id) ON DELETE CASCADE,
 versao bigint NOT NULL CHECK (versao >= 1),
 blocos jsonb NOT NULL CHECK (
  pg_catalog.jsonb_typeof(blocos) = 'array'
  AND pg_catalog.jsonb_array_length(blocos) <= 40
  AND pg_catalog.octet_length(blocos::text) <= 131072
 ),
 publicado_por uuid NOT NULL REFERENCES auth.users(id),
 publicado_em timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
 PRIMARY KEY (dashboard_id, versao)
);
ALTER TABLE dashboard_catalog.editor_publicacoes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON dashboard_catalog.editor_publicacoes FROM PUBLIC, anon, authenticated;

CREATE FUNCTION dashboard_catalog.monitoramento_listar()
RETURNS TABLE (
 dashboard_id uuid, nome text, descricao text, topico_nome text,
 versao bigint, publicado_em timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
 v_usuario uuid := auth.uid();
 v_papel text;
BEGIN
 IF v_usuario IS NULL THEN
  RAISE EXCEPTION 'Sessao necessaria' USING ERRCODE = '42501';
 END IF;
 SELECT u.raw_app_meta_data->>'dashboard_role' INTO v_papel
 FROM auth.users u WHERE u.id = v_usuario;
 IF v_papel NOT IN ('admin','manager') OR v_papel IS NULL THEN
  RAISE EXCEPTION 'Perfil nao autorizado' USING ERRCODE = '42501';
 END IF;
 RETURN QUERY
 SELECT d.id, d.nome, d.descricao,
  COALESCE((
   SELECT t.nome
   FROM dashboard_catalog.topico_dashboards td
   JOIN dashboard_catalog.topicos t ON t.id = td.topico_id
   WHERE td.dashboard_id = d.id
   ORDER BY t.posicao,t.nome,t.id LIMIT 1
  ), 'Sem topico')::text,
  pub.versao, pub.publicado_em
 FROM dashboard_catalog.dashboards d
 JOIN LATERAL (
  SELECT p.versao,p.publicado_em
  FROM dashboard_catalog.editor_publicacoes p
  WHERE p.dashboard_id = d.id
  ORDER BY p.versao DESC LIMIT 1
 ) pub ON TRUE
 WHERE d.codigo IS NULL AND d.estado = 'publicado'
  AND d.publicado_em IS NOT NULL
  AND (v_papel = 'admin' OR EXISTS (
   SELECT 1 FROM dashboard_catalog.acesso_dashboards a
   WHERE a.usuario_id = v_usuario AND a.dashboard_id = d.id
  ))
 ORDER BY d.nome,d.id LIMIT 201;
END
$fn$;

CREATE FUNCTION dashboard_catalog.monitoramento_obter(p_dashboard_id uuid)
RETURNS TABLE (
 dashboard_id uuid, nome text, descricao text, topico_nome text,
 versao bigint, publicado_em timestamptz, blocos jsonb
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $fn$
DECLARE
 v_usuario uuid := auth.uid();
 v_papel text;
BEGIN
 IF v_usuario IS NULL THEN
  RAISE EXCEPTION 'Sessao necessaria' USING ERRCODE = '42501';
 END IF;
 SELECT u.raw_app_meta_data->>'dashboard_role' INTO v_papel
 FROM auth.users u WHERE u.id = v_usuario;
 IF v_papel NOT IN ('admin','manager') OR v_papel IS NULL THEN
  RAISE EXCEPTION 'Perfil nao autorizado' USING ERRCODE = '42501';
 END IF;
 RETURN QUERY
 SELECT d.id, d.nome, d.descricao,
  COALESCE((
   SELECT t.nome
   FROM dashboard_catalog.topico_dashboards td
   JOIN dashboard_catalog.topicos t ON t.id = td.topico_id
   WHERE td.dashboard_id = d.id
   ORDER BY t.posicao,t.nome,t.id LIMIT 1
  ), 'Sem topico')::text,
  pub.versao, pub.publicado_em, pub.blocos
 FROM dashboard_catalog.dashboards d
 JOIN LATERAL (
  SELECT p.versao,p.publicado_em,p.blocos
  FROM dashboard_catalog.editor_publicacoes p
  WHERE p.dashboard_id = d.id
  ORDER BY p.versao DESC LIMIT 1
 ) pub ON TRUE
 WHERE d.id = p_dashboard_id AND d.codigo IS NULL
  AND d.estado = 'publicado' AND d.publicado_em IS NOT NULL
  AND (v_papel = 'admin' OR EXISTS (
   SELECT 1 FROM dashboard_catalog.acesso_dashboards a
   WHERE a.usuario_id = v_usuario AND a.dashboard_id = d.id
  ));
 IF NOT FOUND THEN
  -- Nao revelar se o UUID existe mas nao esta autorizado.
  RAISE EXCEPTION 'Dashboard indisponivel' USING ERRCODE = 'P0002';
 END IF;
END
$fn$;

CREATE FUNCTION public.dashboard_monitoramento_listar()
RETURNS TABLE (
 dashboard_id uuid, nome text, descricao text, topico_nome text,
 versao bigint, publicado_em timestamptz
)
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$
 SELECT * FROM dashboard_catalog.monitoramento_listar();
$fn$;

CREATE FUNCTION public.dashboard_monitoramento_obter(p_dashboard_id uuid)
RETURNS TABLE (
 dashboard_id uuid, nome text, descricao text, topico_nome text,
 versao bigint, publicado_em timestamptz, blocos jsonb
)
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $fn$
 SELECT * FROM dashboard_catalog.monitoramento_obter(p_dashboard_id);
$fn$;

REVOKE ALL ON FUNCTION dashboard_catalog.monitoramento_listar() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION dashboard_catalog.monitoramento_obter(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.dashboard_monitoramento_listar() FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.dashboard_monitoramento_obter(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dashboard_catalog.monitoramento_listar() TO authenticated;
GRANT EXECUTE ON FUNCTION dashboard_catalog.monitoramento_obter(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_monitoramento_listar() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_monitoramento_obter(uuid) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
