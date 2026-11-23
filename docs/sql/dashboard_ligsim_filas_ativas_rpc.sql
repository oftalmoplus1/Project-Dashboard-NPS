-- 23/11/2026 | LigSim listar_filas | RPC com escopo restrito ao painel Hoje.
-- NAO EXECUTAR AUTOMATICAMENTE. Revisar backup/owner e testar em ambiente correto.
-- Nao altera tabela, RLS, ACLs atuais de Power BI ou MCP, nem o n8n.
-- A resposta inclui SOMENTE colunas de contagem e identificacao das filas.
-- O ultimo upsert n8n encontrado atualizou 8 filas com o mesmo updated_at;
-- as tres filas antigas (IDs 5,16,17) nao constavam na resposta GET /v2/queues.
-- Ingestao e agendada a cada 2h; tolerancia de atraso = 3h.
-- Coorte atual = registros atualizados nos 5 minutos anteriores ao maior updated_at.
-- Se a aplicacao nao puder identificar a coorte, ela devera falhar fechada.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $guard$
DECLARE
  v_table oid;
BEGIN
  v_table := pg_catalog.to_regclass('public.listar_filas');
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'Tabela public.listar_filas ausente';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_class WHERE oid = v_table AND relrowsecurity) THEN
    RAISE EXCEPTION 'RLS nao habilitado em listar_filas';
  END IF;
  IF pg_catalog.to_regprocedure('dashboard_private.ligsim_filas_ativas()') IS NOT NULL
      OR pg_catalog.to_regprocedure('public.dashboard_ligsim_filas_ativas()') IS NOT NULL THEN
    RAISE EXCEPTION 'RPC ja existe; nao substituir sem revisao da versao instalada';
  END IF;
  IF NOT pg_catalog.has_schema_privilege('authenticated', 'dashboard_private', 'USAGE') THEN
    RAISE EXCEPTION 'authenticated nao tem USAGE no schema privado; investigar o ambiente';
  END IF;
END
$guard$;

CREATE FUNCTION dashboard_private.ligsim_filas_ativas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
SET statement_timeout TO '10s'
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_role text;
  v_updated timestamptz;
  v_rows jsonb;
  v_count bigint;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessao necessaria' USING ERRCODE = '42501';
  END IF;

  -- Autoriza contra app_metadata do Auth, nao contra user_metadata editavel.
  SELECT u.raw_app_meta_data ->> 'dashboard_role' INTO v_role
    FROM auth.users AS u WHERE u.id = v_user;
  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Perfil sem permissao para filas'
      USING ERRCODE = '42501';
  END IF;

  SELECT pg_catalog.max(f.updated_at) INTO v_updated
    FROM public.listar_filas AS f;
  IF v_updated IS NULL
      OR v_updated < pg_catalog.now() - INTERVAL '3 hours'
      OR v_updated > pg_catalog.now() + INTERVAL '5 minutes' THEN
    RAISE EXCEPTION 'Ultima coleta de filas desatualizada ou invalida'
      USING ERRCODE = '22023';
  END IF;

  SELECT pg_catalog.count(*),
         COALESCE(pg_catalog.jsonb_agg(
           pg_catalog.jsonb_build_object(
             'id', f.id,
             'name', f.name,
             'received', f.received,
             'answered', f.answered,
             'abandon_less_30s', f.abandon_less_30s,
             'abandon_more_30s', f.abandon_more_30s,
             'waiting_calls', f.waiting_calls,
             'updated_at', f.updated_at
           ) ORDER BY f.id
         ), '[]'::jsonb)
    INTO v_count, v_rows
    FROM public.listar_filas AS f
    WHERE f.updated_at >= v_updated - INTERVAL '5 minutes'
      AND f.updated_at <= v_updated;

  IF v_count < 1 OR v_count > 200 THEN
    RAISE EXCEPTION 'Quantidade de filas da ultima coleta invalida'
      USING ERRCODE = '22023';
  END IF;
  RETURN pg_catalog.jsonb_build_object(
    'rows', v_rows,
    'sourceUpdatedAt', v_updated,
    'snapshotKind', 'latest_successful_batch'
  );
END
$fn$;

REVOKE ALL ON FUNCTION dashboard_private.ligsim_filas_ativas()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION dashboard_private.ligsim_filas_ativas()
  TO authenticated;

CREATE FUNCTION public.dashboard_ligsim_filas_ativas()
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $fn$
  SELECT dashboard_private.ligsim_filas_ativas();
$fn$;

REVOKE ALL ON FUNCTION public.dashboard_ligsim_filas_ativas()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_ligsim_filas_ativas()
  TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';

-- POS-VERIFICACAO (somente leitura), apos instalacao:
-- SELECT to_regprocedure('public.dashboard_ligsim_filas_ativas()') IS NOT NULL AS publica,
--        to_regprocedure('dashboard_private.ligsim_filas_ativas()') IS NOT NULL AS privada,
--        has_function_privilege('anon','public.dashboard_ligsim_filas_ativas()','EXECUTE') AS anon_execute,
--        has_function_privilege('authenticated','public.dashboard_ligsim_filas_ativas()','EXECUTE') AS authenticated_execute;
-- Testes reais obrigatorios: admin 200 com 8 filas e sourceUpdatedAt, gestor 403,
-- anon 401; 3 filas antigas devem permanecer no banco e fora do resumo.
-- Executar sob conta administrativa autenticada, NUNCA alterar para
-- SECURITY DEFINER no wrapper publico ou conceder SELECT geral na tabela.
