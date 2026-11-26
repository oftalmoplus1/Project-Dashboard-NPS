-- Isolated PostgreSQL only. Rollback must restore strict legacy 11-key layout.
\set ON_ERROR_STOP on
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
DO $$
BEGIN
 PERFORM 1 FROM public.dashboard_editor_layout_salvar(
  '00000000-0000-4000-8000-000000000030',4,
  '[{"id":"v2","kind":"kpi","title":"V2","x":0,"y":0,"w":3,"h":2,
   "source":"listar_filas","metric":"received","chartOrientation":"vertical","text":"",
   "queueConfig":{"selection":{"mode":"all"},"sortBy":"name","direction":"asc","limit":10}}]'::jsonb);
 RAISE EXCEPTION 'Rollback aceitou campo V2';
EXCEPTION WHEN invalid_parameter_value THEN NULL;
END $$;
DO $$
DECLARE v_rev bigint;
BEGIN
 SELECT revisao INTO v_rev FROM public.dashboard_editor_layout_ler(
  '00000000-0000-4000-8000-000000000030');
 IF v_rev<>4 THEN RAISE EXCEPTION 'Rollback modificou revisao'; END IF;
END $$;
RESET ROLE;
\echo 'SQL_EDITOR_QUEUE_CONFIG_ROLLBACK_PASSED'
