-- FASE 3B — POSTFLIGHT APENAS LEITURA. NAO CRIA/ALTERA REGISTROS.
SELECT
 to_regclass('dashboard_catalog.editor_layout_rascunhos') IS NOT NULL AS tabela_layout_existe,
 to_regprocedure('dashboard_catalog.editor_layout_ler(uuid)') IS NOT NULL AS privada_ler_existe,
 to_regprocedure('dashboard_catalog.editor_layout_salvar(uuid,bigint,jsonb)') IS NOT NULL AS privada_salvar_existe,
 to_regprocedure('public.dashboard_editor_layout_ler(uuid)') IS NOT NULL AS rpc_ler_existe,
 to_regprocedure('public.dashboard_editor_layout_salvar(uuid,bigint,jsonb)') IS NOT NULL AS rpc_salvar_existe,
 (
  SELECT c.relrowsecurity FROM pg_catalog.pg_class c
  WHERE c.oid=to_regclass('dashboard_catalog.editor_layout_rascunhos')
 ) AS tabela_rls_ativa,
 NOT has_table_privilege('authenticated','dashboard_catalog.editor_layout_rascunhos','SELECT')
  AND NOT has_table_privilege('authenticated','dashboard_catalog.editor_layout_rascunhos','INSERT')
  AND NOT has_table_privilege('authenticated','dashboard_catalog.editor_layout_rascunhos','UPDATE') AS sem_dml_direto,
 NOT has_function_privilege('anon','public.dashboard_editor_layout_ler(uuid)','EXECUTE')
  AND NOT has_function_privilege('anon','public.dashboard_editor_layout_salvar(uuid,bigint,jsonb)','EXECUTE') AS anon_sem_execute,
 has_function_privilege('authenticated','public.dashboard_editor_layout_ler(uuid)','EXECUTE')
  AND has_function_privilege('authenticated','public.dashboard_editor_layout_salvar(uuid,bigint,jsonb)','EXECUTE') AS auth_wrapper_execute,
 (
  SELECT NOT p.prosecdef FROM pg_catalog.pg_proc p
  WHERE p.oid=to_regprocedure('public.dashboard_editor_layout_salvar(uuid,bigint,jsonb)')
 ) AS wrapper_security_invoker,
 (
  SELECT p.prosecdef FROM pg_catalog.pg_proc p
  WHERE p.oid=to_regprocedure('dashboard_catalog.editor_layout_salvar(uuid,bigint,jsonb)')
 ) AS privado_security_definer,
 to_regprocedure('public.dashboard_catalogo_listar_personalizados()') IS NOT NULL AS rpc_antiga_preservada;
-- Esperado: 12 campos TRUE. Ainda exige teste autenticado admin/manager no aplicativo.
