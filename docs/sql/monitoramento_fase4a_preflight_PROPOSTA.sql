-- SOMENTE LEITURA. Executar apenas no SQL Editor Supabase self-hosted correto.
-- Nao executar migracao se algum teste retornar FALSE.
WITH checks AS (
 SELECT
  pg_catalog.to_regclass('dashboard_catalog.dashboards') IS NOT NULL AS dashboards_existe,
  pg_catalog.to_regclass('dashboard_catalog.editor_layout_rascunhos') IS NOT NULL AS layouts_existem,
  pg_catalog.to_regclass('dashboard_catalog.acesso_dashboards') IS NOT NULL AS acl_existente,
  pg_catalog.to_regclass('dashboard_catalog.topico_dashboards') IS NOT NULL AS vinculos_existem,
  pg_catalog.to_regclass('dashboard_catalog.topicos') IS NOT NULL AS topicos_existem,
  pg_catalog.to_regclass('dashboard_catalog.auditoria') IS NOT NULL AS auditoria_existe,
  pg_catalog.to_regprocedure('public.dashboard_editor_layout_ler(uuid)') IS NOT NULL AS fase3b_rpc_existe,
  pg_catalog.to_regclass('dashboard_catalog.editor_publicacoes') IS NULL AS nova_tabela_ausente,
  pg_catalog.to_regprocedure('public.dashboard_monitoramento_listar()') IS NULL AS nova_lista_ausente,
  pg_catalog.to_regprocedure('public.dashboard_monitoramento_obter(uuid)') IS NULL AS nova_leitura_ausente,
  pg_catalog.has_schema_privilege(current_user,'dashboard_catalog','CREATE') AS executor_cria_schema,
  pg_catalog.has_schema_privilege(current_user,'public','CREATE') AS executor_cria_rpc,
  pg_catalog.has_table_privilege(current_user,'auth.users','SELECT') AS executor_le_auth,
  EXISTS(SELECT 1 FROM information_schema.columns
   WHERE table_schema='dashboard_catalog' AND table_name='dashboards'
   AND column_name='descricao' AND data_type='text') AS descricao_existe,
  EXISTS(SELECT 1 FROM information_schema.columns
   WHERE table_schema='dashboard_catalog' AND table_name='dashboards'
   AND column_name='publicado_em' AND data_type='timestamp with time zone') AS publicado_em_existe,
  EXISTS(SELECT 1 FROM information_schema.columns
   WHERE table_schema='dashboard_catalog' AND table_name='acesso_dashboards'
   AND column_name='usuario_id' AND udt_name='uuid') AS acl_usuario_uuid,
  EXISTS(SELECT 1 FROM pg_catalog.pg_class c
   WHERE c.oid=pg_catalog.to_regclass('dashboard_catalog.acesso_dashboards')
    AND c.relrowsecurity) AS acl_rls
)
SELECT pg_catalog.current_database() AS banco,current_user AS executor,
 pg_catalog.current_setting('server_version') AS postgres,
 checks.*,
 (dashboards_existe AND layouts_existem AND acl_existente AND vinculos_existem
 AND topicos_existem AND auditoria_existe AND fase3b_rpc_existe
 AND nova_tabela_ausente AND nova_lista_ausente AND nova_leitura_ausente
 AND executor_cria_schema AND executor_cria_rpc AND executor_le_auth
 AND descricao_existe AND publicado_em_existe AND acl_usuario_uuid AND acl_rls) AS preflight_compativel
FROM checks;
