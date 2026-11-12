-- FASE 2: VALIDACAO ESTRUTURAL SOMENTE LEITURA
-- Executar apos os dois scripts de instalacao; nenhum dado e modificado.

SELECT
   to_regnamespace('dashboard_catalog') IS NOT NULL AS esquema_existe,
   to_regclass('dashboard_catalog.topicos') IS NOT NULL AS topicos_existe,
   to_regclass('dashboard_catalog.dashboards') IS NOT NULL AS dashboards_existe,
   to_regclass('dashboard_catalog.topico_dashboards') IS NOT NULL AS associacoes_existem,
   to_regclass('dashboard_catalog.acesso_topicos') IS NOT NULL AS acessos_topicos_existem,
   to_regclass('dashboard_catalog.acesso_dashboards') IS NOT NULL AS acessos_dashboards_existem,
   to_regclass('dashboard_catalog.auditoria') IS NOT NULL AS auditoria_existe,
   to_regprocedure('public.dashboard_catalogo_listar_topicos()') IS NOT NULL AS listar_rpc_existe,
   to_regprocedure('public.dashboard_catalogo_criar_topico(text,text)') IS NOT NULL AS criar_rpc_existe;

SELECT n.nspname AS esquema, c.relname AS tabela, c.relrowsecurity AS rls_ativo
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='dashboard_catalog' AND c.relkind IN ('r','p')
ORDER BY c.relname;

SELECT
   has_schema_privilege('anon','dashboard_catalog','USAGE') AS anon_schema,
   has_schema_privilege('authenticated','dashboard_catalog','USAGE') AS auth_schema,
   has_table_privilege('anon','dashboard_catalog.topicos','SELECT') AS anon_select_topicos,
   has_table_privilege('authenticated','dashboard_catalog.topicos','SELECT') AS auth_select_topicos,
   has_function_privilege('anon','public.dashboard_catalogo_listar_topicos()','EXECUTE') AS anon_listar,
   has_function_privilege('authenticated','public.dashboard_catalogo_listar_topicos()','EXECUTE') AS auth_listar,
   has_function_privilege('anon','public.dashboard_catalogo_criar_topico(text,text)','EXECUTE') AS anon_criar,
   has_function_privilege('authenticated','public.dashboard_catalogo_criar_topico(text,text)','EXECUTE') AS auth_criar;

-- Esperado:
-- * Todos os objetos existem.
-- * Todas as 6 tabelas tem RLS ativo.
-- * anon_schema=false, auth_schema=true (execucao de funcoes privadas).
-- * anon_select_topicos=false, auth_select_topicos=false.
-- * anon_listar=false, auth_listar=true; anon_criar=false, auth_criar=true.
-- * Conta admin cria um topico pela interface; titulo e auditoria conferidos.
-- * Manager sem grants recebe [] no GET e 403 no POST.
--
-- Nao liberar ambientes de producao antes de executar os testes autenticados
-- e revisar as politicas de autorizacao existentes.
