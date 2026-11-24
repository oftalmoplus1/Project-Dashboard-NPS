-- 24/11/2026 | TMA/TME precomputados da LigSim /v2/queues
-- SQL PREPARADO; NAO EXECUTADO no Supabase self-hosted.
-- Revisar definicao real da funcao e ter ponto de retorno antes de instalar.
-- Nao altera listar_filas, RLS, grants, roles, n8n ou fontes operacionais.
-- Apenas adiciona 'tma' e 'tme' (strings HH:MM:SS) a projecao ja
-- autenticada e limitada ao ULTIMO LOTE de filas.
--
-- PRE-CHECK somente leitura:
-- SELECT a.attname, pg_catalog.format_type(a.atttypid,a.atttypmod) AS tipo
-- FROM pg_catalog.pg_attribute a
-- WHERE a.attrelid='public.listar_filas'::regclass
--   AND a.attname IN ('tma','tme') AND a.attnum>0 AND NOT a.attisdropped;
-- SELECT pg_catalog.pg_get_functiondef(
--  'dashboard_private.ligsim_filas_ativas()'::regprocedure
-- );
-- Esperado: a projecao da funcao inclui "waiting_calls", "updated_at" e
-- usa auth.uid + raw_app_meta_data.dashboard_role='admin'.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $patch$
DECLARE
  v_source text;
  v_changed text;
  v_needle text := $needle$'waiting_calls', f.waiting_calls,$needle$;
  v_replacement text := $replace$'waiting_calls', f.waiting_calls,
             'tma', f.tma::text,
             'tme', f.tme::text,$replace$;
BEGIN
  IF pg_catalog.to_regclass('public.listar_filas') IS NULL OR
     pg_catalog.to_regprocedure('dashboard_private.ligsim_filas_ativas()') IS NULL OR
     pg_catalog.to_regprocedure('public.dashboard_ligsim_filas_ativas()') IS NULL THEN
    RAISE EXCEPTION 'RPC de filas ou tabela ausente; abortando sem alteracao';
  END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_attribute a
      WHERE a.attrelid='public.listar_filas'::regclass
        AND a.attname IN ('tma','tme')
        AND a.attnum>0 AND NOT a.attisdropped) <> 2 THEN
    RAISE EXCEPTION 'Campos TMA/TME nao encontrados; abortando';
  END IF;

  v_source := pg_catalog.pg_get_functiondef(
      'dashboard_private.ligsim_filas_ativas()'::regprocedure);
  -- Nao sobrescrever alteracoes manuais nem remover checks de seguranca.
  IF pg_catalog.strpos(v_source,v_needle)=0
     OR pg_catalog.strpos(pg_catalog.substr(v_source,
        pg_catalog.strpos(v_source,v_needle)+pg_catalog.length(v_needle)),v_needle)>0
     OR pg_catalog.strpos(v_source, 'raw_app_meta_data')=0
     OR pg_catalog.strpos(v_source, 'auth.uid()')=0
     OR pg_catalog.strpos(v_source, 'sourceUpdatedAt')=0
     OR pg_catalog.strpos(v_source, 'SECURITY DEFINER')=0
     OR pg_catalog.strpos(v_source, 'latest_successful_batch')=0
     OR pg_catalog.strpos(v_source, 'tma''')>0 THEN
    RAISE EXCEPTION 'RPC de filas diverge da versao esperada. Revisar em vez de substituir';
  END IF;

  v_changed := pg_catalog.replace(v_source,v_needle,v_replacement);
  EXECUTE v_changed;

  IF pg_catalog.strpos(pg_catalog.pg_get_functiondef(
      'dashboard_private.ligsim_filas_ativas()'::regprocedure),
      $verify$'tma', f.tma::text,$verify$)=0 THEN
    RAISE EXCEPTION 'TMA/TME nao apareceram na definicao; rollback automatico';
  END IF;
END;
$patch$;
COMMIT;
NOTIFY pgrst, 'reload schema';

-- POS-CHECK (separado, somente leitura):
-- SELECT pg_catalog.strpos(pg_catalog.pg_get_functiondef(
-- 'dashboard_private.ligsim_filas_ativas()'::regprocedure),
-- $verify$'tme', f.tme::text,$verify$)>0 AS projeta_tme;
-- Testar admin e manager pelo GET /api/chamadas/filas depois do deploy.
