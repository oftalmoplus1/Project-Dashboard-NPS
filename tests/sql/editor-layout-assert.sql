-- PostgreSQL isolado de CI: CRUD atomico de layout, RBAC, revisao e auditoria.
\set ON_ERROR_STOP on

INSERT INTO dashboard_catalog.dashboards (id,nome,estado,codigo,criado_por)
VALUES ('00000000-0000-4000-8000-000000000030','Editor teste','rascunho',NULL,
 '00000000-0000-4000-8000-000000000001');

DO $$
BEGIN
 IF to_regclass('dashboard_catalog.editor_layout_rascunhos') IS NULL
  OR NOT has_function_privilege('authenticated',
     'public.dashboard_editor_layout_salvar(uuid,bigint,jsonb)','EXECUTE')
  OR has_function_privilege('anon',
     'public.dashboard_editor_layout_salvar(uuid,bigint,jsonb)','EXECUTE')
  OR has_table_privilege('authenticated',
     'dashboard_catalog.editor_layout_rascunhos','SELECT')
  OR has_table_privilege('authenticated',
     'dashboard_catalog.editor_layout_rascunhos','INSERT')
  OR has_table_privilege('authenticated',
     'dashboard_catalog.editor_layout_rascunhos','UPDATE')
  OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='dashboard_catalog.editor_layout_rascunhos'::regclass)
 THEN
  RAISE EXCEPTION 'Grants/RLS indevidos no editor';
 END IF;
END
$$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
DO $$
BEGIN
 PERFORM 1 FROM public.dashboard_editor_layout_ler('00000000-0000-4000-8000-000000000030');
 RAISE EXCEPTION 'Manager conseguiu ler layout';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;
DO $$
BEGIN
 PERFORM 1 FROM public.dashboard_editor_layout_salvar(
 '00000000-0000-4000-8000-000000000030',0,'[]'::jsonb);
 RAISE EXCEPTION 'Manager conseguiu gravar layout';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

SELECT set_config('request.jwt.claim.sub','',false);
DO $$
BEGIN
 PERFORM 1 FROM public.dashboard_editor_layout_ler('00000000-0000-4000-8000-000000000030');
 RAISE EXCEPTION 'Anon sem sub conseguiu ler';
EXCEPTION WHEN insufficient_privilege THEN NULL;
END $$;

SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
DO $$
DECLARE
 v_rev bigint;
 v_blocks jsonb;
BEGIN
 SELECT revisao,blocos INTO v_rev,v_blocks FROM public.dashboard_editor_layout_ler(
 '00000000-0000-4000-8000-000000000030');
 IF v_rev <> 0 OR v_blocks <> '[]'::jsonb THEN
  RAISE EXCEPTION 'Layout inicial incorreto';
 END IF;
END $$;

SELECT revisao,pg_catalog.jsonb_array_length(blocos) AS blocos
FROM public.dashboard_editor_layout_salvar(
 '00000000-0000-4000-8000-000000000030',0,
 '[{"id":"local-1","kind":"kpi","title":"Recebidas","x":0,"y":0,"w":3,"h":2,"source":"listar_filas","metric":"received","chartOrientation":"vertical","text":""}]'::jsonb);

DO $$
DECLARE
 v_rev bigint;
BEGIN
 SELECT revisao INTO v_rev FROM public.dashboard_editor_layout_ler(
 '00000000-0000-4000-8000-000000000030');
 IF v_rev <> 1 THEN RAISE EXCEPTION 'Revisao nao persistiu'; END IF;
END $$;

-- Duas abas com revisao 0: a segunda deve receber conflito e NAO gravar.
DO $$
BEGIN
 PERFORM 1 FROM public.dashboard_editor_layout_salvar(
  '00000000-0000-4000-8000-000000000030',0,'[]'::jsonb);
 RAISE EXCEPTION 'Conflito de revisao foi aceito';
EXCEPTION WHEN SQLSTATE '40001' THEN NULL;
END $$;

-- Conteudo SQL arbitrario, componentes fora da grade e overlap negados.
DO $$
BEGIN
 PERFORM 1 FROM public.dashboard_editor_layout_salvar(
  '00000000-0000-4000-8000-000000000030',1,
  '[{"id":"local-1","kind":"kpi","title":"Teste","x":0,"y":0,"w":3,"h":2,"source":null,"metric":"","chartOrientation":"vertical","text":"","sql":"SELECT * FROM auth.users"}]'::jsonb);
 RAISE EXCEPTION 'Campos SQL inesperados foram aceitos';
EXCEPTION WHEN invalid_parameter_value THEN NULL;
END $$;
DO $$
BEGIN
 PERFORM 1 FROM public.dashboard_editor_layout_salvar(
  '00000000-0000-4000-8000-000000000030',1,
  '[{"id":"local-1","kind":"kpi","title":"Teste","x":11,"y":0,"w":3,"h":2,"source":null,"metric":"","chartOrientation":"vertical","text":""}]'::jsonb);
 RAISE EXCEPTION 'Frame fora da grade foi aceito';
EXCEPTION WHEN invalid_parameter_value THEN NULL;
END $$;
DO $$
BEGIN
 PERFORM 1 FROM public.dashboard_editor_layout_salvar(
  '00000000-0000-4000-8000-000000000030',1,
  '[{"id":"a","kind":"kpi","title":"A","x":0,"y":0,"w":3,"h":2,"source":null,"metric":"","chartOrientation":"vertical","text":""},{"id":"b","kind":"text","title":"B","x":1,"y":0,"w":3,"h":2,"source":null,"metric":"","chartOrientation":"vertical","text":"ok"}]'::jsonb);
 RAISE EXCEPTION 'Sobreposicao foi aceita';
EXCEPTION WHEN invalid_parameter_value THEN NULL;
END $$;

-- Um rascunho nunca pode ser salvo no dashboard legado PUBLICADO.
DO $$
BEGIN
 PERFORM 1 FROM public.dashboard_editor_layout_salvar(
 '00000000-0000-4000-8000-000000000020',0,'[]'::jsonb);
 RAISE EXCEPTION 'Legado publicado recebeu layout';
EXCEPTION WHEN no_data_found THEN NULL;
END $$;

SELECT revisao,pg_catalog.jsonb_array_length(blocos) AS blocos
FROM public.dashboard_editor_layout_salvar(
 '00000000-0000-4000-8000-000000000030',1,'[]'::jsonb);
RESET ROLE;

DO $$
BEGIN
 IF (SELECT revisao FROM dashboard_catalog.editor_layout_rascunhos
  WHERE dashboard_id='00000000-0000-4000-8000-000000000030') <> 2
 OR (SELECT count(*) FROM dashboard_catalog.auditoria
  WHERE acao='salvar_layout_rascunho'
  AND objeto_id='00000000-0000-4000-8000-000000000030') <> 2
 OR EXISTS (SELECT 1 FROM dashboard_catalog.editor_layout_rascunhos
  WHERE dashboard_id='00000000-0000-4000-8000-000000000020')
 OR EXISTS (SELECT 1 FROM dashboard_catalog.acesso_dashboards)
 OR EXISTS (SELECT 1 FROM dashboard_catalog.acesso_topicos)
 THEN
  RAISE EXCEPTION 'Auditoria, revisoes ou grants divergentes';
 END IF;
END
$$;
\echo 'SQL_EDITOR_LAYOUT_CAS_RBAC_PASSED'
