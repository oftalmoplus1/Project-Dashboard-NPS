-- EDITOR VISUAL: PRE-FLIGHT DE PRODUCAO (SOMENTE LEITURA)
-- 24/11/2026. Execute no SQL Editor do Supabase SELF-HOSTED do Dashboard
-- SOMENTE apos confirmar que esta no ambiente correto.
-- Objetivo: avaliar se a migracao da Fase 1 pode ser aplicada com seguranca.
-- Nao cria nem altera objetos, dados, grants, functions ou RLS.
-- NAO substitui backup recuperavel nem autoriza migracao.
--
-- Resultados esperados ANTES de instalar a migracao:
-- - catalogo existe, seis tabelas e RLS em todas elas;
-- - coluna codigo existe, descricao ainda nao;
-- - as duas novas RPCs ainda nao existem;
-- - authenticated nao tem SELECT/INSERT direto na tabela dashboards;
-- - wrapper antigo de listar topicos e demais RPCs legadas continuam presentes.
-- Se algum item divergir, NAO executar o SQL de instalacao.

WITH report AS (
 SELECT
   current_database() AS banco,
   current_user AS executor,
   current_setting('server_version') AS pg_version,
   to_regnamespace('dashboard_catalog') IS NOT NULL AS catalogo_existe,
   to_regclass('dashboard_catalog.dashboards') IS NOT NULL AS dashboards_existe,
   to_regclass('dashboard_catalog.topicos') IS NOT NULL AS topicos_existe,
   to_regclass('dashboard_catalog.topico_dashboards') IS NOT NULL AS vinculos_existem,
   to_regclass('dashboard_catalog.auditoria') IS NOT NULL AS auditoria_existe,
   EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='dashboard_catalog'
        AND c.relname='dashboards' AND a.attname='codigo'
        AND a.attnum>0 AND NOT a.attisdropped
   ) AS coluna_codigo_existe,
   EXISTS (
      SELECT 1 FROM pg_catalog.pg_attribute a
      JOIN pg_catalog.pg_class c ON c.oid=a.attrelid
      JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='dashboard_catalog'
        AND c.relname='dashboards' AND a.attname='descricao'
        AND a.attnum>0 AND NOT a.attisdropped
   ) AS coluna_descricao_existe,
   to_regprocedure('public.dashboard_catalogo_criar_personalizado(text,text,text)') IS NOT NULL
      AS rpc_criar_nova_existe,
   to_regprocedure('public.dashboard_catalogo_listar_personalizados()') IS NOT NULL
      AS rpc_listar_nova_existe,
   to_regprocedure('public.dashboard_catalogo_listar_topicos()') IS NOT NULL
      AS rpc_legada_listar_topicos_existe,
   (SELECT count(*) FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='dashboard_catalog' AND c.relkind IN ('r','p')
      AND c.relrowsecurity) AS catalogo_tabelas_com_rls,
   (SELECT count(*) FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='dashboard_catalog' AND c.relkind IN ('r','p')) AS catalogo_total_tabelas
)
SELECT * FROM report;

-- GRANTS sobre o catalogo. Os valores precisam continuar FALSE.
SELECT
  has_schema_privilege('anon','dashboard_catalog','USAGE') AS anon_usa_schema,
  has_table_privilege('authenticated','dashboard_catalog.dashboards','SELECT')
    AS authenticated_le_dashboards,
  has_table_privilege('authenticated','dashboard_catalog.dashboards','INSERT')
    AS authenticated_insere_dashboards,
  has_table_privilege('authenticated','dashboard_catalog.topico_dashboards','INSERT')
    AS authenticated_cria_vinculo_direto,
  has_table_privilege('authenticated','dashboard_catalog.auditoria','INSERT')
    AS authenticated_cria_auditoria_direta;

-- Importante: esse SELECT nao verifica a validade das implementacoes
-- das funcoes SECURITY DEFINER existentes. Verificar autorizacao nas
-- rotas e testar o controle de acesso com sessoes reais apos implantar.
