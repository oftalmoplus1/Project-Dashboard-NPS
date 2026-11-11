-- INVENTARIO UNIFICADO - SOMENTE LEITURA
-- Execute TODO este arquivo no SQL Editor do Supabase self-hosted.
-- Ha apenas UMA consulta SELECT no fim: exporte UM CSV que inclui tabelas,
-- colunas, RLS, politicas e funcoes. Nao apresenta dados pessoais ou registros.
-- Nenhum CREATE, ALTER, GRANT, REVOKE, INSERT, UPDATE ou DELETE.
--
-- Objetivo: avaliar se ja existe estrutura para topicos, dashboards, graficos
-- e grants por usuario + topico + dashboard ANTES de desenhar uma migracao.
--
WITH tabelas_candidatas AS (
    SELECT n.nspname AS esquema,
           c.relname AS tabela,
           c.oid AS oid_tabela,
           c.relrowsecurity AS rls_ativo,
           c.relforcerowsecurity AS rls_forcado
    FROM pg_catalog.pg_class AS c
    JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
    WHERE c.relkind IN ('r','p')
      AND n.nspname NOT IN (
          'pg_catalog','information_schema','auth','storage',
          'realtime','extensions','vault'
      )
      AND c.relname ~* '(dashboard|topico|tópico|topic|chart|grafico|gráfico|permis|audit|usuario|profile|perfil)'
),
inventario AS (
    SELECT
        '01_TABELA'::text AS tipo,
        t.esquema::text AS esquema,
        t.tabela::text AS objeto,
        ('RLS ativo=' || t.rls_ativo::text
          || '; RLS forçado=' || t.rls_forcado::text) AS detalhe
    FROM tabelas_candidatas t

    UNION ALL

    SELECT
        '02_COLUNA', c.table_schema, c.table_name,
        (c.column_name || ': ' || c.data_type
         || '; NULL=' || c.is_nullable
         || CASE WHEN c.column_default IS NOT NULL
                 THEN '; DEFAULT configurado' ELSE '' END)
    FROM information_schema.columns AS c
    JOIN tabelas_candidatas AS t
      ON t.esquema = c.table_schema AND t.tabela = c.table_name

    UNION ALL

    SELECT
        '03_POLITICA', p.schemaname, p.tablename,
        (p.policyname || '; comando=' || p.cmd
          || '; papeis=' || array_to_string(p.roles, ','))::text
    FROM pg_catalog.pg_policies AS p
    JOIN tabelas_candidatas AS t
      ON t.esquema = p.schemaname AND t.tabela = p.tablename

    UNION ALL

    SELECT
        '04_FUNCAO', n.nspname::text, p.proname::text,
        pg_catalog.pg_get_function_identity_arguments(p.oid)::text
    FROM pg_catalog.pg_proc AS p
    JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
    WHERE n.nspname NOT IN (
        'pg_catalog','information_schema','auth','storage',
        'realtime','extensions','vault'
    )
      AND p.proname ~* '(dashboard|topico|tópico|topic|chart|grafico|gráfico|permis)'
)
SELECT tipo, esquema, objeto, detalhe
FROM inventario
ORDER BY tipo, esquema, objeto, detalhe;
