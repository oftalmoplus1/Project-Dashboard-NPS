-- Editor Visual fase 4B: INVENTARIO SOMENTE LEITURA.
-- Executar EXCLUSIVAMENTE no SQL Editor do Supabase self-hosted do Dashboard NPS.
-- NAO usar no projeto Supabase cloud patrimind-dev. Nenhum comando altera dados.
-- Enviar somente o resultado sem credenciais nem linhas telefonicas.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '8s';
SET LOCAL lock_timeout = '3s';

-- 1. Confirme qual banco e versao estao conectados.
SELECT current_database() AS banco, current_setting('server_version') AS versao,
       current_user AS usuario_execucao, pg_catalog.now() AS coletado_em;

-- 2. Confira existencias, natureza e isolamento; nao muda RLS.
SELECT n.nspname AS esquema, c.relname AS objeto, c.relkind AS tipo,
       c.relrowsecurity AS rls_ativo, c.relforcerowsecurity AS rls_forcado
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('listar_filas', 'relatorio_chamadas')
ORDER BY c.relname;

-- 2b. Descoberta de outras tabelas/views candidatas a EVENTOS de filas.
-- Apenas nomes de objetos: nenhuma linha operacional e consultada.
SELECT n.nspname AS esquema, c.relname AS objeto, c.relkind AS tipo
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE c.relkind IN ('r','p','v','m')
  AND n.nspname NOT IN ('pg_catalog','information_schema','auth','storage',
                       'pg_toast','realtime','supabase_functions')
  AND c.relname ~* '(fila|queue|transfer|evento|event|chamada|call|ligsim)'
ORDER BY n.nspname,c.relname
LIMIT 80;

-- 3. Catalogo de colunas: verificar se existe uma tabela/coluna com
-- identificador ESTAVEL de chamada e EVENTO de cada passagem em fila.
-- Nomes sao metadados; nao retorna valores telefonicos.
SELECT c.table_schema AS esquema, c.table_name AS objeto, c.column_name AS coluna,
       c.data_type AS tipo, c.is_nullable AS permite_nulo
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.table_name IN ('listar_filas', 'relatorio_chamadas')
ORDER BY c.table_name, c.ordinal_position;

-- 4. Indices: revisar custo antes de qualquer agregacao historica.
SELECT indexname AS indice, tablename AS tabela, indexdef AS definicao
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('listar_filas', 'relatorio_chamadas')
ORDER BY tablename,indexname;

-- 5. Funcoes de consulta ja instaladas no schema exposto.
-- Apenas identidade e flags; NAO retorna codigo nem segredos.
SELECT n.nspname AS esquema, p.proname AS funcao,
       pg_catalog.pg_get_function_identity_arguments(p.oid) AS argumentos,
       p.prosecdef AS security_definer
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public','dashboard_private')
  AND (p.proname ILIKE '%fila%' OR p.proname ILIKE '%chamada%')
ORDER BY n.nspname,p.proname;

ROLLBACK;
