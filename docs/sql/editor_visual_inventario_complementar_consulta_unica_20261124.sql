-- EDITOR VISUAL - COMPLEMENTO DO INVENTARIO (CONSULTA UNICA)
-- Somente leitura. Data: 2026-11-24.
-- USAR NO SQL EDITOR DO SUPABASE SELF-HOSTED DA APLICACAO.
-- O CSV 239 ja cobriu as colunas das fontes (bloco 6).
-- Esta consulta concentra o que falta: estrutura do catalogo, RLS,
-- constraints, indices, assinaturas e privilegios das RPCs.
--
-- Cole e execute TODO ESTE SELECT de uma unica vez.
-- O resultado sera uma unica tabela com 7 linhas (bloco,resultado).
-- Exporte APENAS esta tabela como CSV e envie para analise.
-- Nao ha escrita, mudanca de privilegios, leitura de registros, nem
-- chamada de qualquer RPC. Nao exporte secrets ou linhas de auth.users.

WITH inventario AS (
  -- 01: identificar ambiente e existencia de objetos importantes.
  SELECT
    '01-ambiente'::text AS bloco,
    pg_catalog.jsonb_build_object(
      'banco', pg_catalog.current_database(),
      'executor', CURRENT_USER,
      'postgres_version', pg_catalog.current_setting('server_version'),
      'schema_catalogo', pg_catalog.to_regnamespace('dashboard_catalog') IS NOT NULL,
      'topicos', pg_catalog.to_regclass('dashboard_catalog.topicos') IS NOT NULL,
      'dashboards', pg_catalog.to_regclass('dashboard_catalog.dashboards') IS NOT NULL,
      'topico_dashboards', pg_catalog.to_regclass('dashboard_catalog.topico_dashboards') IS NOT NULL,
      'acesso_topicos', pg_catalog.to_regclass('dashboard_catalog.acesso_topicos') IS NOT NULL,
      'acesso_dashboards', pg_catalog.to_regclass('dashboard_catalog.acesso_dashboards') IS NOT NULL,
      'auditoria', pg_catalog.to_regclass('dashboard_catalog.auditoria') IS NOT NULL,
      'rpc_listar_topicos', pg_catalog.to_regprocedure('public.dashboard_catalogo_listar_topicos()') IS NOT NULL,
      'rpc_criar_topico', pg_catalog.to_regprocedure('public.dashboard_catalogo_criar_topico(text,text)') IS NOT NULL,
      'rpc_listar_dashboards', pg_catalog.to_regprocedure('public.dashboard_catalogo_listar_dashboards_topico(text)') IS NOT NULL,
      'rpc_vincular_existente', pg_catalog.to_regprocedure('public.dashboard_catalogo_vincular_existente(text,text)') IS NOT NULL,
      'rpc_desvincular', pg_catalog.to_regprocedure('public.dashboard_catalogo_desvincular_dashboard_topico(text,text)') IS NOT NULL,
      'rpc_editar_topico', pg_catalog.to_regprocedure('public.dashboard_catalogo_atualizar_topico(text,text)') IS NOT NULL,
      'rpc_excluir_topico', pg_catalog.to_regprocedure('public.dashboard_catalogo_excluir_topico(text,text)') IS NOT NULL
    ) AS resultado

  UNION ALL

  -- 02: somente estrutura do catalogo, sem consultar registros.
  SELECT
    '02-colunas-catalogo',
    COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'tabela', c.relname,
        'coluna', a.attname,
        'tipo', pg_catalog.format_type(a.atttypid, a.atttypmod),
        'obrigatoria', a.attnotnull,
        'rls', c.relrowsecurity
      ) ORDER BY c.relname, a.attnum
    ), '[]'::jsonb)
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_catalog.pg_attribute a
    ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
  WHERE n.nspname='dashboard_catalog' AND c.relkind IN ('r','p')

  UNION ALL

  -- 03: constraints do catalogo.
  SELECT
    '03-constraints',
    COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'tabela', c.relname,
        'nome', ct.conname,
        'definicao', pg_catalog.pg_get_constraintdef(ct.oid, true)
      ) ORDER BY c.relname, ct.conname
    ), '[]'::jsonb)
  FROM pg_catalog.pg_constraint ct
  JOIN pg_catalog.pg_class c ON c.oid=ct.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='dashboard_catalog'

  UNION ALL

  -- 04: indices do catalogo.
  SELECT
    '04-indices',
    COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'tabela', c.relname,
        'nome', idx.relname,
        'definicao', pg_catalog.pg_get_indexdef(idx.oid)
      ) ORDER BY c.relname, idx.relname
    ), '[]'::jsonb)
  FROM pg_catalog.pg_index i
  JOIN pg_catalog.pg_class c ON c.oid=i.indrelid
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid
  WHERE n.nspname='dashboard_catalog'

  UNION ALL

  -- 05: assinaturas, contexto de execucao e grants de funcoes.
  -- Nao consulta nem revela o corpo das funcoes.
  SELECT
    '05-rpcs',
    COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'schema', n.nspname,
        'nome', p.proname,
        'argumentos', pg_catalog.pg_get_function_identity_arguments(p.oid),
        'retorno', pg_catalog.pg_get_function_result(p.oid),
        'security_definer', p.prosecdef,
        'anon_execute', pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE'),
        'authenticated_execute', pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE')
      ) ORDER BY n.nspname, p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid)
    ), '[]'::jsonb)
  FROM pg_catalog.pg_proc p
  JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='dashboard_catalog'
    OR (n.nspname='public' AND p.proname LIKE 'dashboard_catalogo_%')

  UNION ALL

  -- 06: controle de acesso direto ao catalogo, sem acessar dados.
  SELECT
    '06-rls-grants',
    COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'tabela', c.relname,
        'rls', c.relrowsecurity,
        'force_rls', c.relforcerowsecurity,
        'anon_select', pg_catalog.has_table_privilege('anon',c.oid,'SELECT'),
        'authenticated_select', pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT'),
        'authenticated_insert', pg_catalog.has_table_privilege('authenticated',c.oid,'INSERT'),
        'authenticated_update', pg_catalog.has_table_privilege('authenticated',c.oid,'UPDATE'),
        'authenticated_delete', pg_catalog.has_table_privilege('authenticated',c.oid,'DELETE')
      ) ORDER BY c.relname
    ), '[]'::jsonb)
  FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='dashboard_catalog' AND c.relkind IN ('r','p')

  UNION ALL

  -- 07: politicas do catalogo, se houver.
  SELECT
    '07-policies',
    COALESCE(pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'tabela', p.tablename,
        'policy', p.policyname,
        'papeis', p.roles,
        'operacao', p.cmd,
        'permissive', p.permissive,
        'qual', p.qual,
        'with_check', p.with_check
      ) ORDER BY p.tablename, p.policyname
    ), '[]'::jsonb)
  FROM pg_catalog.pg_policies p
  WHERE p.schemaname='dashboard_catalog'
)
SELECT bloco,resultado FROM inventario ORDER BY bloco;
