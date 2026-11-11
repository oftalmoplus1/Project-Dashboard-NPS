-- FASE 2 / ETAPA 2: listar e criar topicos com autorizacao no servidor.
-- DEPENDE DE docs/sql/dashboard_catalogo_fase2_estrutura.sql aplicado e validado.
-- Instalar SOMENTE em staging apos revisao e backup; nao altera a RPC de chamadas.
--
-- As tabelas ficam em esquema nao exposto. As unicas rotas PostgREST novas
-- sao as funcoes PUBLICAS SECURITY INVOKER, delegando a rotinas privadas.
-- A rotina privilegiada consulta a funcao atual do usuario em auth.users
-- (nao depende de claim JWT possivelmente desatualizada para conferir admin).

BEGIN;

CREATE FUNCTION dashboard_catalog.listar_topicos()
RETURNS TABLE (
    id uuid,
    nome text,
    slug text,
    posicao integer,
    quantidade_dashboards bigint
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_usuario uuid := auth.uid();
    v_papel text;
BEGIN
    IF v_usuario IS NULL THEN
        RAISE EXCEPTION 'Sessao nao autenticada' USING ERRCODE = '42501';
    END IF;

    SELECT u.raw_app_meta_data ->> 'dashboard_role'
      INTO v_papel
    FROM auth.users u
    WHERE u.id = v_usuario;

    IF v_papel IS NULL OR v_papel NOT IN ('admin','manager','user') THEN
        RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT t.id, t.nome, t.slug, t.posicao,
        (
            SELECT count(*)::bigint
            FROM dashboard_catalog.topico_dashboards td
            JOIN dashboard_catalog.dashboards d ON d.id = td.dashboard_id
            WHERE td.topico_id = t.id
              AND (
                v_papel = 'admin'
                OR (
                  d.estado = 'publicado'
                  AND EXISTS (
                    SELECT 1
                    FROM dashboard_catalog.acesso_dashboards grant_dashboard
                    WHERE grant_dashboard.usuario_id = v_usuario
                      AND grant_dashboard.topico_id = td.topico_id
                      AND grant_dashboard.dashboard_id = td.dashboard_id
                  )
                )
              )
        ) AS quantidade_dashboards
    FROM dashboard_catalog.topicos t
    WHERE v_papel = 'admin'
       OR EXISTS (
         SELECT 1
         FROM dashboard_catalog.acesso_dashboards grant_dashboard
         JOIN dashboard_catalog.dashboards d
           ON d.id = grant_dashboard.dashboard_id
         WHERE grant_dashboard.usuario_id = v_usuario
           AND grant_dashboard.topico_id = t.id
           AND d.estado = 'publicado'
       )
    ORDER BY t.posicao, t.nome, t.id;
END;
$$;

CREATE FUNCTION dashboard_catalog.criar_topico(p_nome text, p_slug text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_usuario uuid := auth.uid();
    v_papel text;
    v_nome text := pg_catalog.btrim(p_nome);
    v_slug text := pg_catalog.btrim(p_slug);
    v_id uuid;
BEGIN
    IF v_usuario IS NULL THEN
        RAISE EXCEPTION 'Sessao nao autenticada' USING ERRCODE = '42501';
    END IF;

    SELECT u.raw_app_meta_data ->> 'dashboard_role'
      INTO v_papel
    FROM auth.users u
    WHERE u.id = v_usuario;

    IF v_papel IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Somente administradores podem criar topicos'
            USING ERRCODE = '42501';
    END IF;

    IF v_nome IS NULL OR pg_catalog.char_length(v_nome) NOT BETWEEN 1 AND 120
       OR v_slug IS NULL OR pg_catalog.char_length(v_slug) NOT BETWEEN 1 AND 120
       OR v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
        RAISE EXCEPTION 'Nome ou identificador de topico invalido'
            USING ERRCODE = '22023';
    END IF;

    INSERT INTO dashboard_catalog.topicos (nome,slug,posicao,criado_por)
    VALUES (
        v_nome, v_slug,
        COALESCE((SELECT MAX(t.posicao)+1 FROM dashboard_catalog.topicos t),0),
        v_usuario
    ) RETURNING dashboard_catalog.topicos.id INTO v_id;

    INSERT INTO dashboard_catalog.auditoria (
        operador_id, acao, tipo_objeto, objeto_id, contexto
    ) VALUES (
        v_usuario, 'criar', 'topico', v_id,
        pg_catalog.jsonb_build_object('nome',v_nome,'slug',v_slug)
    );

    RETURN v_id;
END;
$$;

-- Wrappers expostos no schema PUBLIC, mas sem privilégios de owner.
CREATE FUNCTION public.dashboard_catalogo_listar_topicos()
RETURNS TABLE (
    id uuid,
    nome text,
    slug text,
    posicao integer,
    quantidade_dashboards bigint
)
LANGUAGE sql SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT id, nome, slug, posicao, quantidade_dashboards
    FROM dashboard_catalog.listar_topicos();
$$;

CREATE FUNCTION public.dashboard_catalogo_criar_topico(p_nome text, p_slug text)
RETURNS uuid
LANGUAGE sql SECURITY INVOKER
SET search_path = ''
AS $$
    SELECT dashboard_catalog.criar_topico(p_nome, p_slug);
$$;

-- Postgres concede EXECUTE a PUBLIC para novas funcoes por padrao;
-- revogar explicitamente de ambas as camadas antes de permitir autenticados.
REVOKE ALL ON FUNCTION dashboard_catalog.listar_topicos()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION dashboard_catalog.criar_topico(text,text)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dashboard_catalogo_listar_topicos()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dashboard_catalogo_criar_topico(text,text)
    FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA dashboard_catalog TO authenticated;
GRANT EXECUTE ON FUNCTION dashboard_catalog.listar_topicos()
    TO authenticated;
GRANT EXECUTE ON FUNCTION dashboard_catalog.criar_topico(text,text)
    TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_catalogo_listar_topicos()
    TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_catalogo_criar_topico(text,text)
    TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- TESTES SOMENTE LEITURA no SQL Editor:
-- SELECT
--   to_regprocedure('public.dashboard_catalogo_listar_topicos()') IS NOT NULL AS listar_publica,
--   to_regprocedure('public.dashboard_catalogo_criar_topico(text,text)') IS NOT NULL AS criar_publica;
-- SELECT
--   has_function_privilege('anon','public.dashboard_catalogo_listar_topicos()','EXECUTE') AS anon_listar,
--   has_function_privilege('authenticated','public.dashboard_catalogo_listar_topicos()','EXECUTE') AS auth_listar,
--   has_function_privilege('anon','public.dashboard_catalogo_criar_topico(text,text)','EXECUTE') AS anon_criar,
--   has_function_privilege('authenticated','public.dashboard_catalogo_criar_topico(text,text)','EXECUTE') AS auth_criar;
-- Esperado: ambas funcoes existem; anon FALSE; authenticated TRUE.
--
-- TESTES DE INTEGRACAO (NAO executar como postgres no SQL Editor):
-- - usuario admin autenticado: GET lista topicos; POST cria e audita.
-- - gerente autenticado sem grants: GET retorna [] e POST gera 403.
-- - usuario anonimo: EXECUTE nao permitido.
-- - mesmo slug duas vezes: segunda tentativa falha sem criar registro.
-- - as tabelas privadas continuam sem SELECT direto para authenticated.
