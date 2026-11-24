-- Estrutura e registros sinteticos representativos do inventario (24/11/2026).
-- Nao ha acesso ao Supabase self-hosted durante este teste.
ALTER TABLE dashboard_catalog.dashboards
 ADD COLUMN codigo text;
ALTER TABLE dashboard_catalog.dashboards
 ADD CONSTRAINT dashboards_codigo_unico UNIQUE (codigo);
ALTER TABLE dashboard_catalog.dashboards
 ADD CONSTRAINT dashboards_codigo_formato CHECK (
  codigo IS NULL OR (
   pg_catalog.char_length(codigo) BETWEEN 1 AND 100
   AND codigo ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  )
 );

INSERT INTO dashboard_catalog.topicos (id, nome, slug, criado_por, posicao)
VALUES
 ('00000000-0000-4000-8000-000000000010', 'Relatórios', 'relatorios',
  '00000000-0000-4000-8000-000000000001',0),
 ('00000000-0000-4000-8000-000000000011', 'Financeiro', 'financeiro',
  '00000000-0000-4000-8000-000000000001',1);

INSERT INTO dashboard_catalog.dashboards
 (id,nome,codigo,estado,publicado_em,criado_por)
VALUES
 ('00000000-0000-4000-8000-000000000020','Visão geral de Chamadas',
  'visao-geral-chamadas','publicado',now(),'00000000-0000-4000-8000-000000000001');

INSERT INTO dashboard_catalog.topico_dashboards
 (topico_id,dashboard_id,posicao,vinculado_por)
VALUES
 ('00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000020',0,
  '00000000-0000-4000-8000-000000000001');
