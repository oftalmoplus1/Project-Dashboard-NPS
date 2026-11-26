-- Only for ephemeral PostgreSQL in CI; validates V2 and legacy layout contracts.
\set ON_ERROR_STOP on

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);

-- Existing legacy layout read and V2 write remain compatible.
SELECT revisao,pg_catalog.jsonb_array_length(blocos) AS blocos
FROM public.dashboard_editor_layout_salvar(
 '00000000-0000-4000-8000-000000000030',2,
 '[{"id":"local-1","kind":"table","title":"Filas","x":0,"y":0,"w":8,"h":4,
 "source":"listar_filas","metric":"abandoned","chartOrientation":"horizontal","text":"",
 "queueConfig":{"selection":{"mode":"selected","ids":[2,1]},
  "sortBy":"answered","direction":"desc","limit":20}}]'::jsonb);

DO $$
DECLARE v_rev bigint; v_blocks jsonb;
BEGIN
 SELECT revisao,blocos INTO v_rev,v_blocks
 FROM public.dashboard_editor_layout_ler('00000000-0000-4000-8000-000000000030');
 IF v_rev<>3 OR v_blocks#>>'{0,queueConfig,selection,mode}'<>'selected'
 OR v_blocks#>>'{0,queueConfig,sortBy}'<>'answered'
 OR v_blocks#>>'{0,metric}'<>'abandoned' THEN
  RAISE EXCEPTION 'V2 nao persistiu a configuracao';
 END IF;
END $$;

-- Unauthorized manager must still fail after CREATE OR REPLACE.
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
DO $$
BEGIN
 PERFORM 1 FROM public.dashboard_editor_layout_salvar(
  '00000000-0000-4000-8000-000000000030',3,'[]'::jsonb);
 RAISE EXCEPTION 'Manager conseguiu gravar V2';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);

-- Repeat-invalid payloads: no extra SQL, no wrong types, no leaked/missing IDs.
DO $$
DECLARE
 v_base jsonb := '[{"id":"local-1","kind":"table","title":"Filas","x":0,"y":0,"w":8,"h":4,
   "source":"listar_filas","metric":"received","chartOrientation":"horizontal","text":"",
   "queueConfig":{"selection":{"mode":"selected","ids":[1,2]},
    "sortBy":"answered","direction":"desc","limit":20}}]'::jsonb;
 v_bad jsonb;
BEGIN
 FOR v_bad IN
 SELECT value FROM pg_catalog.jsonb_array_elements(
  pg_catalog.jsonb_build_array(
   pg_catalog.jsonb_set(v_base,'{0,queueConfig,selection,ids}','[]'::jsonb),
   pg_catalog.jsonb_set(v_base,'{0,queueConfig,selection,ids}','[1,1]'::jsonb),
   pg_catalog.jsonb_set(v_base,'{0,queueConfig,selection,ids}','[0]'::jsonb),
   pg_catalog.jsonb_set(v_base,'{0,queueConfig,selection,ids}','["1"]'::jsonb),
   pg_catalog.jsonb_set(v_base,'{0,queueConfig,selection,ids}','[2147483648]'::jsonb),
   pg_catalog.jsonb_set(v_base,'{0,queueConfig,direction}','"sideways"'::jsonb),
   pg_catalog.jsonb_set(v_base,'{0,queueConfig,limit}','7'::jsonb),
   pg_catalog.jsonb_set(v_base,'{0,queueConfig,sql}','"SELECT secret"'::jsonb,true),
   pg_catalog.jsonb_set(v_base,'{0,queueConfig,selection,where}','"true"'::jsonb,true),
   pg_catalog.jsonb_set(v_base,'{0,source}','"relatorio_chamadas"'::jsonb),
   pg_catalog.jsonb_set(v_base,'{0,kind}','"line"'::jsonb)
  )
 ) LOOP
  BEGIN
   PERFORM 1 FROM public.dashboard_editor_layout_salvar(
    '00000000-0000-4000-8000-000000000030',3,v_bad);
   RAISE EXCEPTION 'Configuracao V2 invalida foi aceita';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
 END LOOP;
END $$;

-- Legacy 11-key write still works without queueConfig.
SELECT revisao,pg_catalog.jsonb_array_length(blocos) AS blocos
FROM public.dashboard_editor_layout_salvar(
 '00000000-0000-4000-8000-000000000030',3,
 '[{"id":"legacy","kind":"kpi","title":"Anterior","x":0,"y":0,"w":3,"h":2,
  "source":"listar_filas","metric":"received","chartOrientation":"vertical","text":""}]'::jsonb);

RESET ROLE;
DO $$
BEGIN
 IF (SELECT revisao FROM dashboard_catalog.editor_layout_rascunhos
  WHERE dashboard_id='00000000-0000-4000-8000-000000000030') <> 4 THEN
  RAISE EXCEPTION 'Revisao ou CAS apos V2 incorreto';
 END IF;
 IF (SELECT COUNT(*) FROM dashboard_catalog.auditoria
  WHERE acao='salvar_layout_rascunho'
   AND objeto_id='00000000-0000-4000-8000-000000000030') <> 4 THEN
  RAISE EXCEPTION 'Auditoria V2 ausente';
 END IF;
 IF has_table_privilege('authenticated','dashboard_catalog.editor_layout_rascunhos','SELECT')
   OR has_function_privilege('anon','public.dashboard_editor_layout_salvar(uuid,bigint,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'Grants V2 inseguros'; END IF;
END $$;
\echo 'SQL_EDITOR_QUEUE_CONFIG_V2_PASSED'
