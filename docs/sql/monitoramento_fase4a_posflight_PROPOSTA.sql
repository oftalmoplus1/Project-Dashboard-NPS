-- SOMENTE LEITURA apos instalacao MANUAL revisada.
-- Esperado: todos os booleanos TRUE; nunca mostrar dados sensiveis.
SELECT
 pg_catalog.to_regclass('dashboard_catalog.editor_publicacoes') IS NOT NULL AS snapshots_existem,
 pg_catalog.to_regprocedure('public.dashboard_monitoramento_listar()') IS NOT NULL AS listar_existe,
 pg_catalog.to_regprocedure('public.dashboard_monitoramento_obter(uuid)') IS NOT NULL AS obter_existe,
 (SELECT c.relrowsecurity FROM pg_catalog.pg_class c
  WHERE c.oid = pg_catalog.to_regclass('dashboard_catalog.editor_publicacoes')) AS snapshots_rls,
 NOT pg_catalog.has_table_privilege('authenticated','dashboard_catalog.editor_publicacoes','SELECT') AS sem_select_direto,
 NOT pg_catalog.has_table_privilege('authenticated','dashboard_catalog.editor_publicacoes','INSERT') AS sem_insert_direto,
 NOT pg_catalog.has_function_privilege('anon','public.dashboard_monitoramento_listar()','EXECUTE') AS anon_sem_listar,
 NOT pg_catalog.has_function_privilege('anon','public.dashboard_monitoramento_obter(uuid)','EXECUTE') AS anon_sem_obter,
 pg_catalog.has_function_privilege('authenticated','public.dashboard_monitoramento_listar()','EXECUTE') AS auth_pode_listar,
 pg_catalog.has_function_privilege('authenticated','public.dashboard_monitoramento_obter(uuid)','EXECUTE') AS auth_pode_obter,
 pg_catalog.to_regprocedure('public.dashboard_editor_layout_salvar(uuid,bigint,jsonb)') IS NOT NULL AS autosave_preservado,
 pg_catalog.to_regprocedure('public.dashboard_ligsim_filas_ativas()') IS NOT NULL AS call_center_preservado;
