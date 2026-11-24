-- EDITOR VISUAL - POS-FLIGHT DA FASE 1 (SOMENTE LEITURA)
-- Executar SOMENTE depois de instalar a migração transacional no
-- Supabase self-hosted CORRETO, usando o SQL Editor.
-- Nao consulta registros de chamadas, usuarios, filas ou auditoria.
-- Nao cria, altera ou elimina registros/objetos/permissoes.
--
-- Interpretacao esperada: true para *_existe / *_ok;
-- false para anon_executa_*, authenticated_dml_direto.
SELECT
 current_database() AS banco,
 to_regclass('dashboard_catalog.dashboards') IS NOT NULL AS dashboards_existe,
 EXISTS (
   SELECT 1 FROM pg_catalog.pg_attribute a
   JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
   JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='dashboard_catalog'
     AND c.relname='dashboards'
     AND a.attname='descricao'
     AND a.attnum>0 AND NOT a.attisdropped
 ) AS descricao_existe,
 to_regprocedure('public.dashboard_catalogo_criar_personalizado(text,text,text)')
   IS NOT NULL AS criar_rpc_existe,
 to_regprocedure('public.dashboard_catalogo_listar_personalizados()')
   IS NOT NULL AS listar_rpc_existe,
 to_regprocedure('public.dashboard_catalogo_listar_topicos()')
   IS NOT NULL AS legacy_rpc_existe,
 COALESCE(
   (SELECT NOT p.prosecdef FROM pg_catalog.pg_proc p
     WHERE p.oid=to_regprocedure('public.dashboard_catalogo_criar_personalizado(text,text,text)')),
   false
 ) AS wrapper_criar_invoker_ok,
 COALESCE(
   (SELECT NOT p.prosecdef FROM pg_catalog.pg_proc p
     WHERE p.oid=to_regprocedure('public.dashboard_catalogo_listar_personalizados()')),
   false
 ) AS wrapper_listar_invoker_ok,
 COALESCE(
   (SELECT p.prosecdef FROM pg_catalog.pg_proc p
     WHERE p.oid=to_regprocedure('dashboard_catalog.criar_personalizado(text,text,text)')),
   false
 ) AS privada_criar_definer_ok,
 COALESCE(
   (SELECT p.prosecdef FROM pg_catalog.pg_proc p
     WHERE p.oid=to_regprocedure('dashboard_catalog.listar_personalizados()')),
   false
 ) AS privada_listar_definer_ok,
 CASE WHEN to_regprocedure('public.dashboard_catalogo_criar_personalizado(text,text,text)') IS NOT NULL
   THEN pg_catalog.has_function_privilege(
      'anon','public.dashboard_catalogo_criar_personalizado(text,text,text)','EXECUTE')
   ELSE true END AS anon_executa_criar,
 CASE WHEN to_regprocedure('public.dashboard_catalogo_listar_personalizados()') IS NOT NULL
   THEN pg_catalog.has_function_privilege(
      'anon','public.dashboard_catalogo_listar_personalizados()','EXECUTE')
   ELSE true END AS anon_executa_listar,
 CASE WHEN to_regprocedure('public.dashboard_catalogo_criar_personalizado(text,text,text)') IS NOT NULL
   THEN pg_catalog.has_function_privilege(
      'authenticated','public.dashboard_catalogo_criar_personalizado(text,text,text)','EXECUTE')
   ELSE false END AS authenticated_invoca_criar,
 CASE WHEN to_regprocedure('public.dashboard_catalogo_listar_personalizados()') IS NOT NULL
   THEN pg_catalog.has_function_privilege(
      'authenticated','public.dashboard_catalogo_listar_personalizados()','EXECUTE')
   ELSE false END AS authenticated_invoca_listar,
 pg_catalog.has_table_privilege('authenticated','dashboard_catalog.dashboards','SELECT')
   OR pg_catalog.has_table_privilege('authenticated','dashboard_catalog.dashboards','INSERT')
   OR pg_catalog.has_table_privilege('authenticated','dashboard_catalog.dashboards','UPDATE')
   OR pg_catalog.has_table_privilege('authenticated','dashboard_catalog.dashboards','DELETE')
   AS authenticated_dml_direto,
 (SELECT count(*) FROM pg_catalog.pg_class c
  JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='dashboard_catalog' AND c.relkind IN ('r','p')
    AND c.relrowsecurity) AS total_tabelas_com_rls;
-- O esperado: 6 tabelas com RLS, duas novas RPCs presentes,
-- wrappers INVOKER, funcoes privadas DEFINER, anon sem EXECUTE,
-- authenticated so pode invocar as RPCs, sem DML direto.
-- Uma chamada com role authenticated NAO prova autorizacao de admin;
-- a validacao de app_metadata ocorre dentro da funcao privilegiada.
