-- EDITOR VISUAL / FASE 0 - INVENTARIO DO SUPABASE SELF-HOSTED
-- Data: 2026-11-24
-- SOMENTE LEITURA. Nenhum CREATE, ALTER, DROP, INSERT, UPDATE, DELETE ou EXECUTE de RPC.
-- Execute exclusivamente no SQL Editor do Supabase self-hosted da aplicacao,
-- nunca em outro projeto cloud conectado ao ChatGPT.
-- A consulta NAO retorna registros de usuarios, ligacoes, filas ou secrets.
-- Execute os 6 blocos SELECT separadamente e exporte os resultados para CSV.
-- Se algum bloco falhar, registre o erro. NAO altere policies, tabelas ou funcoes.

-- BLOCO 1: IDENTIFICAR O BANCO E PRESENCA DOS OBJETOS ESPERADOS.
SELECT
  pg_catalog.current_database() AS banco,
  CURRENT_USER AS executor,
  pg_catalog.current_setting('server_version') AS versao_postgresql,
  pg_catalog.to_regnamespace('dashboard_catalog') IS NOT NULL AS schema_catalogo_existe,
  pg_catalog.to_regclass('dashboard_catalog.topicos') IS NOT NULL AS topicos_existe,
  pg_catalog.to_regclass('dashboard_catalog.dashboards') IS NOT NULL AS dashboards_existe,
  pg_catalog.to_regclass('dashboard_catalog.topico_dashboards') IS NOT NULL AS vinculos_existe,
  pg_catalog.to_regclass('dashboard_catalog.acesso_topicos') IS NOT NULL AS grants_topicos_existe,
  pg_catalog.to_regclass('dashboard_catalog.acesso_dashboards') IS NOT NULL AS grants_dashboards_existe,
  pg_catalog.to_regclass('dashboard_catalog.auditoria') IS NOT NULL AS auditoria_existe,
  pg_catalog.to_regclass('public.relatorio_chamadas') IS NOT NULL AS relatorio_chamadas_existe,
  pg_catalog.to_regclass('public.listar_filas') IS NOT NULL AS listar_filas_existe,
  pg_catalog.to_regprocedure('public.dashboard_catalogo_listar_topicos()') IS NOT NULL AS rpc_listar_topicos_existe,
  pg_catalog.to_regprocedure('public.dashboard_catalogo_criar_topico(text,text)') IS NOT NULL AS rpc_criar_topico_existe,
  pg_catalog.to_regprocedure('public.dashboard_catalogo_listar_dashboards_topico(text)') IS NOT NULL AS rpc_listar_dashboards_existe,
  pg_catalog.to_regprocedure('public.dashboard_catalogo_vincular_existente(text,text)') IS NOT NULL AS rpc_vincular_existente_existe,
  pg_catalog.to_regprocedure('public.dashboard_catalogo_desvincular_dashboard_topico(text,text)') IS NOT NULL AS rpc_desvincular_existe,
  pg_catalog.to_regprocedure('public.dashboard_catalogo_atualizar_topico(text,text)') IS NOT NULL AS rpc_atualizar_topico_existe,
  pg_catalog.to_regprocedure('public.dashboard_catalogo_excluir_topico(text,text)') IS NOT NULL AS rpc_excluir_topico_existe;

-- BLOCO 2: TABELAS, COLUNAS, NULABILIDADE E RLS DO CATALOGO.
-- Nenhum dado dos registros e consultado.
SELECT
  n.nspname AS esquema,
  c.relname AS tabela,
  CASE c.relkind WHEN 'r' THEN 'tabela' WHEN 'p' THEN 'particionada'
    WHEN 'v' THEN 'view' WHEN 'm' THEN 'materialized view' ELSE c.relkind::text END AS tipo_objeto,
  c.relrowsecurity AS rls_habilitada,
  c.relforcerowsecurity AS rls_forcada,
  a.attnum AS posicao_coluna,
  a.attname AS coluna,
  pg_catalog.format_type(a.atttypid, a.atttypmod) AS tipo_dado,
  a.attnotnull AS obrigatoria
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid=c.relnamespace
LEFT JOIN pg_catalog.pg_attribute AS a
  ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
WHERE n.nspname='dashboard_catalog' AND c.relkind IN ('r','p','v','m')
ORDER BY c.relname,a.attnum;

-- BLOCO 3: CONSTRAINTS E INDICES, SEM DADOS OPERACIONAIS.
SELECT
  'constraint' AS classe,
  n.nspname AS esquema,
  c.relname AS tabela,
  ct.conname AS nome,
  pg_catalog.pg_get_constraintdef(ct.oid, true) AS definicao
FROM pg_catalog.pg_constraint ct
JOIN pg_catalog.pg_class c ON c.oid=ct.conrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='dashboard_catalog'
UNION ALL
SELECT
  'indice', n.nspname, c.relname, idx.relname,
  pg_catalog.pg_get_indexdef(idx.oid)
FROM pg_catalog.pg_index i
JOIN pg_catalog.pg_class c ON c.oid=i.indrelid
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid
WHERE n.nspname='dashboard_catalog'
ORDER BY classe,tabela,nome;

-- BLOCO 4: FUNCOES DO CATALOGO E WRAPPERS PUBLICOS - METADADOS APENAS.
-- Nao retorna o corpo de funcoes, que poderia conter informacoes sensiveis.
SELECT
  n.nspname AS esquema,
  p.proname AS funcao,
  pg_catalog.pg_get_function_identity_arguments(p.oid) AS argumentos,
  pg_catalog.pg_get_function_result(p.oid) AS resultado,
  p.prosecdef AS security_definer,
  pg_catalog.has_function_privilege('anon',p.oid,'EXECUTE') AS anon_executa,
  pg_catalog.has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated_executa
FROM pg_catalog.pg_proc p
JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='dashboard_catalog'
   OR (n.nspname='public' AND p.proname LIKE 'dashboard_catalogo_%')
ORDER BY esquema,funcao,argumentos;

-- BLOCO 5: POLICIES E GRANTS DIRETOS DO CATALOGO.
SELECT
  c.relname AS tabela,
  c.relrowsecurity AS rls_habilitada,
  pg_catalog.has_table_privilege('anon',c.oid,'SELECT') AS anon_select,
  pg_catalog.has_table_privilege('authenticated',c.oid,'SELECT') AS authenticated_select,
  pg_catalog.has_table_privilege('anon',c.oid,'INSERT') AS anon_insert,
  pg_catalog.has_table_privilege('authenticated',c.oid,'INSERT') AS authenticated_insert,
  pg_catalog.has_table_privilege('authenticated',c.oid,'UPDATE') AS authenticated_update,
  pg_catalog.has_table_privilege('authenticated',c.oid,'DELETE') AS authenticated_delete
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='dashboard_catalog' AND c.relkind IN ('r','p')
ORDER BY c.relname;

-- BLOCO 5B: POLICIES EXISTENTES (SE HOUVER) - EXPRESSOES METADADOS.
SELECT
  schemaname AS esquema,
  tablename AS tabela,
  policyname AS policy,
  permissive AS permissiva,
  roles::text AS papeis,
  cmd AS operacao,
  qual AS predicado_leitura,
  with_check AS predicado_escrita
FROM pg_catalog.pg_policies
WHERE schemaname='dashboard_catalog'
ORDER BY tablename, policyname;

-- BLOCO 6: METADADOS DAS FONTES INICIAIS - SEM CONSULTAR REGISTROS.
-- Campos nao serao liberados automaticamente no editor: exigem aprovacao.
SELECT
  n.nspname AS esquema,
  c.relname AS fonte,
  c.relkind AS tipo_objeto,
  a.attnum AS posicao,
  a.attname AS coluna,
  pg_catalog.format_type(a.atttypid,a.atttypmod) AS tipo_dado,
  a.attnotnull AS obrigatoria
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
JOIN pg_catalog.pg_attribute a
  ON a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped
WHERE n.nspname='public'
  AND c.relname IN ('relatorio_chamadas','listar_filas')
  AND c.relkind IN ('r','p','v','m')
ORDER BY fonte,posicao;

-- INTERPRETACAO:
-- 1) Se dashboard_catalog.* estiver ausente, NAO instalar scripts antigos
--    automaticamente; revisar previamente o estado e plano de recuperacao.
-- 2) A existencia de uma RPC nao demonstra que esteja segura ou funcional.
-- 3) Mesmo que RLS=true, revisar grants, SECURITY DEFINER e validacao de role.
-- 4) Nenhum resultado deste inventario autoriza liberar acesso aos dados de origem.
-- 5) Envie os CSVs para revisao; o proximo passo sera preparar migration/RPC
--    de cadastro de rascunho compativel com o schema efetivamente instalado.
