-- FASE 3B — PREFLIGHT APENAS LEITURA. EXECUTAR NO SELF-HOSTED CORRETO.
-- Confirme PostgreSQL 15.8 e schema catalogo previamente instalado.
SELECT
 current_setting('server_version') AS postgres_version,
 to_regclass('dashboard_catalog.dashboards') IS NOT NULL AS dashboards_existe,
 to_regclass('dashboard_catalog.auditoria') IS NOT NULL AS auditoria_existe,
 to_regclass('dashboard_catalog.editor_layout_rascunhos') IS NULL AS layout_ainda_ausente,
 to_regprocedure('public.dashboard_catalogo_listar_personalizados()') IS NOT NULL AS rpc_fase1_existe,
 to_regprocedure('public.dashboard_editor_layout_ler(uuid)') IS NULL AS rpc_leitura_ainda_ausente,
 to_regprocedure('public.dashboard_editor_layout_salvar(uuid,bigint,jsonb)') IS NULL AS rpc_escrita_ainda_ausente,
 EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'dashboard_catalog'
    AND table_name = 'dashboards' AND column_name = 'codigo'
 ) AS codigo_existe,
 EXISTS (
  SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'dashboard_catalog'
    AND table_name = 'dashboards' AND column_name = 'estado'
 ) AS estado_existe,
 (
  SELECT count(*) FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='dashboard_catalog' AND c.relkind='r' AND c.relrowsecurity
 ) AS tabelas_rls;
-- Esperado antes de instalar: 8 checks booleanos TRUE, tabelas_rls >= 6.
-- Nao executar a proposta SQL em caso de divergencia sem revisar o schema.
