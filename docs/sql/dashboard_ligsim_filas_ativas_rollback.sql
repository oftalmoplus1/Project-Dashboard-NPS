-- Reversao segura da RPC criada por dashboard_ligsim_filas_ativas_rpc.sql
-- Aplicar SOMENTE se a integracao for desfeita e antes de retornar o codigo antigo.
-- Nao toca em listar_filas, membros, n8n, politicas RLS, grants de tabela ou dados.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $check$
DECLARE
  v_private oid := pg_catalog.to_regprocedure('dashboard_private.ligsim_filas_ativas()');
  v_public oid := pg_catalog.to_regprocedure('public.dashboard_ligsim_filas_ativas()');
  v_private_def text;
  v_public_def text;
  v_private_security boolean;
  v_public_security boolean;
BEGIN
  IF v_private IS NULL OR v_public IS NULL THEN
    RAISE EXCEPTION 'Funcoes nao encontradas; rollback cancelado';
  END IF;
  SELECT p.prosecdef INTO v_private_security FROM pg_catalog.pg_proc p WHERE p.oid = v_private;
  SELECT p.prosecdef INTO v_public_security FROM pg_catalog.pg_proc p WHERE p.oid = v_public;
  v_private_def := pg_catalog.pg_get_functiondef(v_private);
  v_public_def := pg_catalog.pg_get_functiondef(v_public);
  IF v_private_security IS DISTINCT FROM TRUE
     OR v_public_security IS DISTINCT FROM FALSE
     OR position('latest_successful_batch' IN v_private_def) = 0
     OR position('auth.uid()' IN v_private_def) = 0
     OR position('raw_app_meta_data' IN v_private_def) = 0
     OR position('dashboard_private.ligsim_filas_ativas()' IN v_public_def) = 0 THEN
    RAISE EXCEPTION 'Definicoes divergentes; rollback bloqueado para revisao';
  END IF;
END
$check$;

DROP FUNCTION public.dashboard_ligsim_filas_ativas();
DROP FUNCTION dashboard_private.ligsim_filas_ativas();
COMMIT;
NOTIFY pgrst, 'reload schema';

-- Confirmacao somente leitura:
-- SELECT to_regprocedure('public.dashboard_ligsim_filas_ativas()') IS NULL AS publica_removida,
--        to_regprocedure('dashboard_private.ligsim_filas_ativas()') IS NULL AS privada_removida;
