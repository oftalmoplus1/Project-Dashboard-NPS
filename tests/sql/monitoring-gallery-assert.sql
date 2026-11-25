-- Banco EFEMERO de CI: RLS, exposicao, publicacao e ACL contextual existente.
\set ON_ERROR_STOP on
DO $test$
BEGIN
 IF pg_catalog.to_regclass('dashboard_catalog.editor_publicacoes') IS NULL
   OR NOT (SELECT c.relrowsecurity
            FROM pg_catalog.pg_class c
           WHERE c.oid = 'dashboard_catalog.editor_publicacoes'::regclass)
   OR pg_catalog.has_table_privilege('authenticated','dashboard_catalog.editor_publicacoes','SELECT')
   OR pg_catalog.has_table_privilege('authenticated','dashboard_catalog.editor_publicacoes','INSERT')
   OR pg_catalog.has_table_privilege('authenticated','dashboard_catalog.editor_publicacoes','UPDATE')
   OR pg_catalog.has_function_privilege('anon','public.dashboard_monitoramento_listar()','EXECUTE')
   OR pg_catalog.has_function_privilege('anon','public.dashboard_monitoramento_obter(uuid)','EXECUTE')
   OR NOT pg_catalog.has_function_privilege('authenticated','public.dashboard_monitoramento_listar()','EXECUTE')
   OR NOT pg_catalog.has_function_privilege('authenticated','public.dashboard_monitoramento_obter(uuid)','EXECUTE')
 THEN RAISE EXCEPTION 'Seguranca/RLS de monitoramento incorreta'; END IF;
END $test$;

INSERT INTO dashboard_catalog.dashboards
 (id,nome,descricao,estado,codigo,publicado_em,criado_por)
VALUES
 ('00000000-0000-4000-8000-000000000031','Publicacao sintetica','Exemplo CI',
  'publicado',NULL,pg_catalog.now(),'00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000032','Sem snapshot',NULL,
  'publicado',NULL,pg_catalog.now(),'00000000-0000-4000-8000-000000000001');

INSERT INTO dashboard_catalog.topico_dashboards
 (topico_id,dashboard_id,posicao,vinculado_por)
VALUES
 ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000031',10,'00000000-0000-4000-8000-000000000001');

INSERT INTO dashboard_catalog.editor_publicacoes
 (dashboard_id,versao,blocos,publicado_por)
VALUES
 ('00000000-0000-4000-8000-000000000031',1,
 '[{"id":"titulo","kind":"text","title":"Monitoramento","x":0,"y":0,"w":4,"h":2,"source":null,"metric":"","chartOrientation":"vertical","text":"Versão 1"}]'::jsonb,
 '00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000031',2,
 '[{"id":"titulo","kind":"text","title":"Monitoramento","x":0,"y":0,"w":4,"h":2,"source":null,"metric":"","chartOrientation":"vertical","text":"Versão 2"}]'::jsonb,
 '00000000-0000-4000-8000-000000000001');

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
DO $test$
BEGIN
 IF (SELECT count(*) FROM public.dashboard_monitoramento_listar()) <> 0
 THEN RAISE EXCEPTION 'Gestor sem concessao visualizou galeria'; END IF;
 BEGIN
  PERFORM 1 FROM public.dashboard_monitoramento_obter('00000000-0000-4000-8000-000000000031');
  RAISE EXCEPTION 'Gestor sem concessao abriu dashboard por URL';
 EXCEPTION WHEN no_data_found THEN NULL;
 END;
END $test$;

SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
DO $test$
DECLARE
 v_versao bigint;
BEGIN
 IF (SELECT count(*) FROM public.dashboard_monitoramento_listar()) <> 1
 THEN RAISE EXCEPTION 'Admin nao viu apenas o personalizado publicado com snapshot'; END IF;
 SELECT versao INTO v_versao
 FROM public.dashboard_monitoramento_obter('00000000-0000-4000-8000-000000000031');
 IF v_versao <> 2 THEN RAISE EXCEPTION 'Ultima versao publicada nao foi selecionada'; END IF;
 BEGIN
  PERFORM 1 FROM public.dashboard_monitoramento_obter('00000000-0000-4000-8000-000000000020');
  RAISE EXCEPTION 'Legado foi exposto como personalizado';
 EXCEPTION WHEN no_data_found THEN NULL;
 END;
 BEGIN
  PERFORM 1 FROM public.dashboard_monitoramento_obter('00000000-0000-4000-8000-000000000030');
  RAISE EXCEPTION 'Rascunho foi exposto';
 EXCEPTION WHEN no_data_found THEN NULL;
 END;
END $test$;
RESET ROLE;

-- Simula concessao contextual existente (rotina administrativa sera etapa posterior).
INSERT INTO dashboard_catalog.acesso_topicos
 (usuario_id,topico_id,concedido_por)
VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000001');
INSERT INTO dashboard_catalog.acesso_dashboards
 (usuario_id,topico_id,dashboard_id,concedido_por)
VALUES ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000010',
 '00000000-0000-4000-8000-000000000031','00000000-0000-4000-8000-000000000001');

SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
DO $test$
BEGIN
 IF (SELECT count(*) FROM public.dashboard_monitoramento_listar()) <> 1
 THEN RAISE EXCEPTION 'Gestor com grant nao recebeu dashboard'; END IF;
 IF (SELECT versao FROM public.dashboard_monitoramento_obter('00000000-0000-4000-8000-000000000031')) <> 2
 THEN RAISE EXCEPTION 'Grant deveria dar acesso a versao 2'; END IF;
END $test$;
RESET ROLE;

DELETE FROM dashboard_catalog.acesso_dashboards
 WHERE usuario_id = '00000000-0000-4000-8000-000000000002';
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000002',false);
DO $test$
BEGIN
 IF (SELECT count(*) FROM public.dashboard_monitoramento_listar()) <> 0
 THEN RAISE EXCEPTION 'Revogacao nao removeu o dashboard da galeria'; END IF;
 BEGIN
  PERFORM 1 FROM public.dashboard_monitoramento_obter('00000000-0000-4000-8000-000000000031');
  RAISE EXCEPTION 'Revogacao nao bloqueou acesso por URL';
 EXCEPTION WHEN no_data_found THEN NULL;
 END;
END $test$;
RESET ROLE;

UPDATE dashboard_catalog.dashboards SET estado='rascunho',publicado_em=NULL
 WHERE id='00000000-0000-4000-8000-000000000031';
SET ROLE authenticated;
SELECT pg_catalog.set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
DO $test$
BEGIN
 IF (SELECT count(*) FROM public.dashboard_monitoramento_listar()) <> 0
 THEN RAISE EXCEPTION 'Despublicacao manteve dashboard na galeria'; END IF;
 BEGIN
  PERFORM 1 FROM public.dashboard_monitoramento_obter('00000000-0000-4000-8000-000000000031');
  RAISE EXCEPTION 'Despublicacao manteve URL publica';
 EXCEPTION WHEN no_data_found THEN NULL;
 END;
END $test$;
RESET ROLE;
\echo 'MONITORAMENTO_FASE4A_ACL_E_SNAPSHOTS_OK'
