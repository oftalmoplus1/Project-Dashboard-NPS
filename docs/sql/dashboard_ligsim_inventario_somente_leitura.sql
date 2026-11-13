-- Fase 1B: executar SOZINHO no SQL Editor do Supabase self-hosted do Dashboard.
-- Uma unica consulta a catalogos. Nao le chamadas nem executa RPCs do aplicativo.
-- Nao cria/altera objetos, dados, politicas, permissoes ou configuracoes.
-- Objetos ausentes sao informados; nao sao criados automaticamente.
-- Exporte a grade secao/objeto/detalhes como CSV. Nao publique o resultado no Git.
-- Validacao local: revisao estatica; execucao no banco real ainda pendente.
WITH
alvos_tabelas(schema_nome, tabela_nome) AS (
  VALUES ('public', 'relatorio_chamadas'),
         ('public', 'relatorio_fila_exame'),
         ('public', 'listar_ramais')
),
tabelas AS (
  SELECT a.*, n.oid AS schema_oid, c.oid AS tabela_oid,
         c.relkind, c.relrowsecurity, c.relforcerowsecurity
  FROM alvos_tabelas a
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = a.schema_nome
  LEFT JOIN pg_catalog.pg_class c
    ON c.relnamespace = n.oid AND c.relname = a.tabela_nome
),
alvos_funcoes(schema_nome, funcao_nome) AS (
  VALUES ('public', 'dashboard_chamadas_agregadas'),
         ('dashboard_private', 'chamadas_agregadas'),
         ('public', 'dashboard_chamadas_por_hora'),
         ('dashboard_private', 'chamadas_por_hora'),
         ('public', 'dashboard_chamadas_tempos_e_filas'),
         ('dashboard_private', 'chamadas_tempos_e_filas'),
         ('public', 'dashboard_chamadas_tempos_por_dia'),
         ('dashboard_private', 'chamadas_tempos_por_dia')
),
funcoes AS (
  SELECT a.*, n.oid AS schema_oid, p.oid AS funcao_oid,
         p.prosecdef, p.proowner, p.proconfig,
         CASE WHEN p.oid IS NOT NULL
              THEN pg_catalog.pg_get_functiondef(p.oid) END AS definicao
  FROM alvos_funcoes a
  LEFT JOIN pg_catalog.pg_namespace n ON n.nspname = a.schema_nome
  LEFT JOIN pg_catalog.pg_proc p
    ON p.pronamespace = n.oid AND p.proname = a.funcao_nome AND p.prokind = 'f'
),
papeis AS (
  SELECT a.papel, r.oid AS papel_oid
  FROM (VALUES ('anon'), ('authenticated')) a(papel)
  LEFT JOIN pg_catalog.pg_roles r ON r.rolname = a.papel
),
relatorio AS (
  SELECT '01_ambiente'::text AS secao, 'sessao_atual'::text AS objeto,
    pg_catalog.jsonb_build_object(
      'coletado_em', CURRENT_TIMESTAMP,
      'postgres_version', pg_catalog.current_setting('server_version'),
      'timezone_sessao', pg_catalog.current_setting('TimeZone'),
      'escopo', 'somente metadados; nao valida dados, deploy ou acesso HTTP'
    ) AS detalhes
  UNION ALL
  SELECT '02_tabelas', t.schema_nome || '.' || t.tabela_nome,
    pg_catalog.jsonb_build_object(
      'existe', t.tabela_oid IS NOT NULL, 'tipo_relacao', t.relkind,
      'rls_ativo', t.relrowsecurity, 'rls_forcado', t.relforcerowsecurity)
  FROM tabelas t
  UNION ALL
  SELECT '03_colunas', t.schema_nome || '.' || t.tabela_nome || '.' || a.attname,
    pg_catalog.jsonb_build_object(
      'tipo', pg_catalog.format_type(a.atttypid, a.atttypmod),
      'aceita_null', NOT a.attnotnull, 'posicao', a.attnum)
  FROM tabelas t JOIN pg_catalog.pg_attribute a ON a.attrelid = t.tabela_oid
  WHERE a.attnum > 0 AND NOT a.attisdropped
  UNION ALL
  SELECT '04_indices', t.schema_nome || '.' || t.tabela_nome || '.' || ci.relname,
    pg_catalog.jsonb_build_object(
      'primario', i.indisprimary, 'unico', i.indisunique, 'valido', i.indisvalid,
      'parcial', i.indpred IS NOT NULL,
      'colunas', (SELECT pg_catalog.jsonb_agg(a.attname ORDER BY k.ord)
                 FROM pg_catalog.unnest(i.indkey::smallint[]) WITH ORDINALITY k(num, ord)
                 LEFT JOIN pg_catalog.pg_attribute a
                   ON a.attrelid = t.tabela_oid AND a.attnum = k.num),
      'nota', 'null na lista pode indicar expressao; includes tambem podem constar')
  FROM tabelas t JOIN pg_catalog.pg_index i ON i.indrelid = t.tabela_oid
  JOIN pg_catalog.pg_class ci ON ci.oid = i.indexrelid
  UNION ALL
  SELECT '05_acesso_tabelas', t.schema_nome || '.' || t.tabela_nome || ':' || r.papel,
    pg_catalog.jsonb_build_object(
      'papel_existe', r.papel_oid IS NOT NULL,
      'schema_usage', CASE WHEN r.papel_oid IS NOT NULL AND t.schema_oid IS NOT NULL
        THEN pg_catalog.has_schema_privilege(r.papel_oid, t.schema_oid, 'USAGE') END,
      'select_tabela', CASE WHEN r.papel_oid IS NOT NULL AND t.tabela_oid IS NOT NULL
        THEN pg_catalog.has_table_privilege(r.papel_oid, t.tabela_oid, 'SELECT') END,
      'select_alguma_coluna', CASE WHEN r.papel_oid IS NOT NULL AND t.tabela_oid IS NOT NULL
        THEN pg_catalog.has_any_column_privilege(r.papel_oid, t.tabela_oid, 'SELECT') END,
      'nota', 'privilegio isolado nao comprova acesso; revisar RLS e schemas expostos')
  FROM tabelas t CROSS JOIN papeis r
  UNION ALL
  SELECT '06_politicas', p.schemaname || '.' || p.tablename || '.' || p.policyname,
    pg_catalog.jsonb_build_object(
      'comando', p.cmd, 'papeis', p.roles, 'permissiva', p.permissive,
      'tem_using', p.qual IS NOT NULL, 'tem_with_check', p.with_check IS NOT NULL,
      'nota', 'expressoes omitidas; existencia de politica nao prova seguranca')
  FROM pg_catalog.pg_policies p
  JOIN alvos_tabelas t ON t.schema_nome = p.schemaname AND t.tabela_nome = p.tablename
  UNION ALL
  SELECT '07_funcoes', f.schema_nome || '.' || f.funcao_nome ||
    CASE WHEN f.funcao_oid IS NULL THEN ''
         ELSE '(' || pg_catalog.pg_get_function_identity_arguments(f.funcao_oid) || ')' END,
    pg_catalog.jsonb_build_object(
      'existe', f.funcao_oid IS NOT NULL,
      'retorno', CASE WHEN f.funcao_oid IS NOT NULL
        THEN pg_catalog.pg_get_function_result(f.funcao_oid) END,
      'security_definer', f.prosecdef,
      'proprietario_bypassrls', owner.rolbypassrls,
      'proprietario_superuser', owner.rolsuper,
      'configuracao_relevante', (SELECT pg_catalog.jsonb_agg(s)
        FROM pg_catalog.unnest(f.proconfig) s
        WHERE s LIKE 'search_path=%' OR s LIKE 'statement_timeout=%'),
      'definicao_md5', pg_catalog.md5(f.definicao),
      'texto_menciona_ta', f.definicao ~* '(^|[^a-z_0-9])ta([^a-z_0-9]|$)',
      'texto_menciona_tef', f.definicao ~* '(^|[^a-z_0-9])tef([^a-z_0-9]|$)',
      'texto_menciona_tet', f.definicao ~* '(^|[^a-z_0-9])tet([^a-z_0-9]|$)',
      'nota', 'mencoes podem vir de comentarios; nao comprovam a formula executada')
  FROM funcoes f LEFT JOIN pg_catalog.pg_roles owner ON owner.oid = f.proowner
  UNION ALL
  SELECT '08_acesso_funcoes', f.schema_nome || '.' || f.funcao_nome ||
    CASE WHEN f.funcao_oid IS NULL THEN ''
         ELSE '(' || pg_catalog.pg_get_function_identity_arguments(f.funcao_oid) || ')' END || ':' || r.papel,
    pg_catalog.jsonb_build_object(
      'papel_existe', r.papel_oid IS NOT NULL,
      'schema_usage', CASE WHEN r.papel_oid IS NOT NULL AND f.schema_oid IS NOT NULL
        THEN pg_catalog.has_schema_privilege(r.papel_oid, f.schema_oid, 'USAGE') END,
      'execute', CASE WHEN r.papel_oid IS NOT NULL AND f.funcao_oid IS NOT NULL
        THEN pg_catalog.has_function_privilege(r.papel_oid, f.funcao_oid, 'EXECUTE') END,
      'nota', 'nao executa a funcao; nao substitui teste com sessao de cada perfil')
  FROM funcoes f CROSS JOIN papeis r
)
SELECT secao, objeto, detalhes
FROM relatorio
ORDER BY secao, objeto;
