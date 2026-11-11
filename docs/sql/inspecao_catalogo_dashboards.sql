-- Diagnostico SOMENTE LEITURA para planejar o catalogo e as permissoes.
-- Rodar no SQL Editor do Supabase self-hosted, sem modificar o banco.
-- Compartilhe o resultado sem dados pessoais de usuarios.

-- 1. Identificar schemas/tabelas relevantes sem depender de nomes presumidos.
SELECT table_schema, table_name, table_type
FROM information_schema.tables
WHERE table_schema NOT IN ('pg_catalog','information_schema','auth','storage','realtime','extensions','vault')
  AND (table_name ILIKE '%dashboard%' OR table_name ILIKE '%topico%'
    OR table_name ILIKE '%chart%' OR table_name ILIKE '%grafico%'
    OR table_name ILIKE '%permis%' OR table_name ILIKE '%audit%'
    OR table_name ILIKE '%usuario%' OR table_name ILIKE '%profile%')
ORDER BY table_schema, table_name;

-- 2. Revisar apenas metadados de colunas dessas tabelas.
SELECT c.table_schema, c.table_name, c.column_name, c.data_type, c.is_nullable
FROM information_schema.columns c
WHERE c.table_schema NOT IN ('pg_catalog','information_schema','auth','storage','realtime','extensions','vault')
 AND (c.table_name ILIKE '%dashboard%' OR c.table_name ILIKE '%topico%'
    OR c.table_name ILIKE '%chart%' OR c.table_name ILIKE '%grafico%'
    OR c.table_name ILIKE '%permis%' OR c.table_name ILIKE '%audit%'
    OR c.table_name ILIKE '%usuario%' OR c.table_name ILIKE '%profile%')
ORDER BY c.table_schema, c.table_name, c.ordinal_position;

-- 3. Verificar RLS e politicas das tabelas candidatas.
SELECT schemaname, tablename, rowsecurity, forcerowsecurity
FROM (
 SELECT n.nspname AS schemaname, t.relname AS tablename,
        t.relrowsecurity AS rowsecurity, t.relforcerowsecurity AS forcerowsecurity
 FROM pg_catalog.pg_class t
 JOIN pg_catalog.pg_namespace n ON n.oid=t.relnamespace
 WHERE t.relkind='r'
) t
WHERE schemaname NOT IN ('pg_catalog','information_schema','auth','storage','realtime','extensions','vault')
 AND (tablename ILIKE '%dashboard%' OR tablename ILIKE '%topico%' OR tablename ILIKE '%chart%'
 OR tablename ILIKE '%grafico%' OR tablename ILIKE '%permis%' OR tablename ILIKE '%audit%')
ORDER BY schemaname,tablename;

SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_catalog.pg_policies
WHERE schemaname NOT IN ('pg_catalog','information_schema','auth','storage','realtime','extensions','vault')
 AND (tablename ILIKE '%dashboard%' OR tablename ILIKE '%topico%' OR tablename ILIKE '%chart%'
 OR tablename ILIKE '%grafico%' OR tablename ILIKE '%permis%' OR tablename ILIKE '%audit%')
ORDER BY schemaname,tablename,policyname;

-- 4. Identificar funcoes existentes do catalogo, SEM expor seus corpos.
SELECT n.nspname AS schema, p.proname AS nome, pg_catalog.pg_get_function_identity_arguments(p.oid) AS argumentos
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema','auth','storage','realtime','extensions','vault')
 AND (p.proname ILIKE '%dashboard%' OR p.proname ILIKE '%topico%'
 OR p.proname ILIKE '%chart%' OR p.proname ILIKE '%permis%')
ORDER BY n.nspname,p.proname;
