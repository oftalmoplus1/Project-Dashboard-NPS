-- Fase 3B: diagnostico SOMENTE LEITURA no Supabase self-hosted correto.
-- Uma linha para exportacao CSV. Nao executar a migracao se qualquer teste falhar.
WITH schema_checks AS (
 SELECT
   to_regclass('dashboard_catalog.dashboards') IS NOT NULL AS dashboards_existe,
   to_regclass('dashboard_catalog.auditoria') IS NOT NULL AS auditoria_existe,
   to_regclass('dashboard_catalog.editor_layout_rascunhos') IS NULL AS editor_tabela_ainda_ausente,
   to_regprocedure('auth.uid()') IS NOT NULL AS auth_uid_existe,
   to_regprocedure('public.dashboard_catalogo_listar_personalizados()') IS NOT NULL AS catalogo_fase1_existe,
   to_regprocedure('public.dashboard_editor_layout_ler(uuid)') IS NULL AS editor_rpc_ler_ainda_ausente,
   to_regprocedure('public.dashboard_editor_layout_salvar(uuid,bigint,jsonb)') IS NULL AS editor_rpc_salvar_ainda_ausente,
   EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='anon') AS anon_existe,
   EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname='authenticated') AS authenticated_existe,
   (SELECT count(*) FROM pg_catalog.pg_class c
     JOIN pg_catalog.pg_namespace n ON c.relnamespace=n.oid
     WHERE n.nspname='dashboard_catalog' AND c.relkind='r' AND c.relrowsecurity) >= 6
     AS seis_tabelas_com_rls,
   EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
     WHERE c.conrelid=to_regclass('dashboard_catalog.dashboards') AND c.contype='p')
     AS dashboards_tem_pk,
   EXISTS (SELECT 1 FROM pg_catalog.pg_constraint c
     WHERE c.conrelid=to_regclass('dashboard_catalog.auditoria') AND c.contype='p')
     AS auditoria_tem_pk
),
column_checks AS (
 SELECT
   EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='dashboard_catalog' AND table_name='dashboards'
       AND column_name='id' AND udt_name='uuid') AS dashboard_id_uuid,
   EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='dashboard_catalog' AND table_name='dashboards'
       AND column_name='estado' AND data_type='text') AS dashboard_estado_texto,
   EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='dashboard_catalog' AND table_name='dashboards'
       AND column_name='codigo' AND data_type='text') AS dashboard_codigo_texto,
   EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='dashboard_catalog' AND table_name='dashboards'
       AND column_name='publicado_em' AND data_type='timestamp with time zone')
       AS dashboard_publicacao_timestamptz,
   EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='dashboard_catalog' AND table_name='auditoria'
       AND column_name='operador_id' AND udt_name='uuid') AS auditoria_operador_uuid,
   EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='dashboard_catalog' AND table_name='auditoria'
       AND column_name='acao' AND data_type='text') AS auditoria_acao_texto,
   EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='dashboard_catalog' AND table_name='auditoria'
       AND column_name='tipo_objeto' AND data_type='text') AS auditoria_tipo_texto,
   EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='dashboard_catalog' AND table_name='auditoria'
       AND column_name='objeto_id' AND udt_name='uuid') AS auditoria_objeto_uuid,
   EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='dashboard_catalog' AND table_name='auditoria'
       AND column_name='contexto' AND udt_name='jsonb') AS auditoria_contexto_jsonb,
   EXISTS (SELECT 1 FROM information_schema.columns
     WHERE table_schema='auth' AND table_name='users'
       AND column_name='raw_app_meta_data' AND udt_name='jsonb') AS auth_app_meta_jsonb
)
SELECT current_database() AS banco, current_setting('server_version') AS versao_postgres,
 current_user AS executor_sql,
 s.*, c.*,
 (s.dashboards_existe AND s.auditoria_existe AND s.editor_tabela_ainda_ausente
  AND s.auth_uid_existe AND s.catalogo_fase1_existe AND s.editor_rpc_ler_ainda_ausente
  AND s.editor_rpc_salvar_ainda_ausente AND s.anon_existe AND s.authenticated_existe
  AND s.seis_tabelas_com_rls AND s.dashboards_tem_pk AND s.auditoria_tem_pk
  AND c.dashboard_id_uuid AND c.dashboard_estado_texto AND c.dashboard_codigo_texto
  AND c.dashboard_publicacao_timestamptz AND c.auditoria_operador_uuid
  AND c.auditoria_acao_texto AND c.auditoria_tipo_texto AND c.auditoria_objeto_uuid
  AND c.auditoria_contexto_jsonb AND c.auth_app_meta_jsonb) AS preflight_compativel
FROM schema_checks AS s CROSS JOIN column_checks AS c;
-- Esperado: todos os booleans TRUE. Falhas exigem revisao antes da migracao.
