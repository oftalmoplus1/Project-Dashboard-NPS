-- FASE 2 / ETAPA 1 — ESTRUTURA DO CATALOGO (NAO EXECUTAR SEM REVISAR BACKUP E STAGING)
-- Supabase self-hosted / PostgreSQL. Executar como administrador do banco.
-- Este arquivo NAO ALTERA tabelas de chamadas, funcoes RPC preexistentes
-- nem os grants de acesso existentes aos dashboards operacionais.
--
-- PRE-CONDICOES:
-- (1) backup recuperavel e ponto seguro de versionamento confirmados;
-- (2) schema dashboard_catalog NAO EXISTE (CREATE SCHEMA falha se existir);
-- (3) revisao por responsavel do banco; aplicar inicialmente em staging;
-- (4) confirmar schema auth.users e role anon/authenticated no ambiente.
--
-- Esta etapa e deliberadamente fechada: NAO cria endpoints/API nem grants.
-- Nenhum usuario comum passa a enxergar dados ou a criar topicos automaticamente.

BEGIN;

CREATE SCHEMA dashboard_catalog;
REVOKE ALL ON SCHEMA dashboard_catalog FROM PUBLIC, anon, authenticated;

CREATE TABLE dashboard_catalog.topicos (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    nome text NOT NULL,
    slug text NOT NULL UNIQUE,
    posicao integer NOT NULL DEFAULT 0 CHECK (posicao >= 0),
    criado_por uuid NOT NULL,
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT topicos_nome_valido CHECK (
        char_length(pg_catalog.btrim(nome)) BETWEEN 1 AND 120
    ),
    CONSTRAINT topicos_slug_valido CHECK (
        char_length(slug) BETWEEN 1 AND 120
        AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    )
);

CREATE TABLE dashboard_catalog.dashboards (
    id uuid PRIMARY KEY DEFAULT pg_catalog.gen_random_uuid(),
    nome text NOT NULL,
    estado text NOT NULL DEFAULT 'rascunho'
        CHECK (estado IN ('rascunho', 'publicado')),
    publicado_em timestamptz,
    criado_por uuid NOT NULL,
    criado_em timestamptz NOT NULL DEFAULT now(),
    atualizado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT dashboards_nome_valido CHECK (
        char_length(pg_catalog.btrim(nome)) BETWEEN 1 AND 120
    ),
    CONSTRAINT dashboards_publicacao_consistente CHECK (
        (estado = 'rascunho' AND publicado_em IS NULL)
        OR (estado = 'publicado' AND publicado_em IS NOT NULL)
    )
);

-- Um mesmo dashboard pode aparecer em diversos topicos sem copias.
-- Remover o vinculo nao exclui o cadastro do dashboard original.
CREATE TABLE dashboard_catalog.topico_dashboards (
    topico_id uuid NOT NULL
        REFERENCES dashboard_catalog.topicos(id) ON DELETE CASCADE,
    dashboard_id uuid NOT NULL
        REFERENCES dashboard_catalog.dashboards(id) ON DELETE CASCADE,
    posicao integer NOT NULL DEFAULT 0 CHECK (posicao >= 0),
    vinculado_por uuid NOT NULL,
    vinculado_em timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (topico_id, dashboard_id)
);

-- Acesso explicito ao topico (mas NAO aos dashboards automaticamente).
CREATE TABLE dashboard_catalog.acesso_topicos (
    usuario_id uuid NOT NULL
        REFERENCES auth.users(id) ON DELETE CASCADE,
    topico_id uuid NOT NULL
        REFERENCES dashboard_catalog.topicos(id) ON DELETE CASCADE,
    concedido_por uuid NOT NULL,
    concedido_em timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, topico_id)
);

-- Concessao contextual: usuario + topico + dashboard.
-- Duas FKs compostas impedem grants para topicos sem acesso ou
-- para dashboards nao vinculados ao respectivo topico.
CREATE TABLE dashboard_catalog.acesso_dashboards (
    usuario_id uuid NOT NULL,
    topico_id uuid NOT NULL,
    dashboard_id uuid NOT NULL,
    concedido_por uuid NOT NULL,
    concedido_em timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (usuario_id, topico_id, dashboard_id),
    CONSTRAINT acesso_dashboard_topico_fk FOREIGN KEY (usuario_id, topico_id)
        REFERENCES dashboard_catalog.acesso_topicos(usuario_id, topico_id)
        ON DELETE CASCADE,
    CONSTRAINT acesso_dashboard_vinculo_fk FOREIGN KEY (topico_id, dashboard_id)
        REFERENCES dashboard_catalog.topico_dashboards(topico_id, dashboard_id)
        ON DELETE CASCADE
);

-- Auditoria persiste mesmo apos exclusao de topicos e dashboards.
-- Detalhes devem conter apenas identificadores/configuracao nao sensivel.
CREATE TABLE dashboard_catalog.auditoria (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operador_id uuid NOT NULL,
    acao text NOT NULL CHECK (char_length(acao) BETWEEN 1 AND 80),
    tipo_objeto text NOT NULL CHECK (char_length(tipo_objeto) BETWEEN 1 AND 80),
    objeto_id uuid,
    contexto jsonb NOT NULL DEFAULT '{}'::jsonb,
    registrado_em timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT auditoria_contexto_objeto CHECK (
        jsonb_typeof(contexto) = 'object'
    )
);

CREATE INDEX topico_dashboards_dashboard_idx
    ON dashboard_catalog.topico_dashboards (dashboard_id);
CREATE INDEX acesso_topicos_topico_idx
    ON dashboard_catalog.acesso_topicos (topico_id);
CREATE INDEX acesso_dashboards_topico_dashboard_idx
    ON dashboard_catalog.acesso_dashboards (topico_id, dashboard_id);
CREATE INDEX auditoria_registrado_em_idx
    ON dashboard_catalog.auditoria (registrado_em DESC);

-- Defesa em profundidade. Nenhuma politica e criada nesta etapa:
-- acesso direto para anon/authenticated fica negado por padrao.
ALTER TABLE dashboard_catalog.topicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_catalog.dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_catalog.topico_dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_catalog.acesso_topicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_catalog.acesso_dashboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_catalog.auditoria ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON ALL TABLES IN SCHEMA dashboard_catalog
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA dashboard_catalog
    FROM PUBLIC, anon, authenticated;

COMMIT;

-- VALIDACAO SOMENTE LEITURA: executar APOS instalacao, em uma query separada:
-- SELECT n.nspname, c.relname, c.relrowsecurity
-- FROM pg_catalog.pg_class c
-- JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
-- WHERE n.nspname='dashboard_catalog' AND c.relkind IN ('r','p')
-- ORDER BY c.relname;
--
-- SELECT has_schema_privilege('authenticated','dashboard_catalog','USAGE')
--    AS autenticado_tem_acesso_direto,
--        has_table_privilege('authenticated','dashboard_catalog.topicos','SELECT')
--    AS autenticado_le_topicos;
-- Ambas as permissoes devem ser FALSE ate a implementacao da API controlada.
