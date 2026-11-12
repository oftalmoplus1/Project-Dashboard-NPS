-- FASE 2 / ETAPA 3 - VINCULAR DASHBOARDS EXISTENTES A TOPICOS
-- REVISAO OBRIGATORIA. Executar em homologacao com backup testado antes de producao.
-- DEPENDE dos dois scripts anteriores da Fase 2, ja validados.
-- Esta instalacao NAO insere topicos ou associacoes automaticamente.
-- O admin decide, pela interface, quais dos dois dashboards existentes vincular.
-- Nunca copia nem altera public.relatorio_chamadas, RPCs de chamadas ou seus dados.

BEGIN;

-- Identificador estavel do renderer para dashboards existentes.
-- NULL continua permitido para futuros cadastros em rascunho.
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

-- Lista apenas os dashboards associados ao topico para os quais ha acesso.
-- Admin tem visao completa, inclusive rascunhos.
CREATE FUNCTION dashboard_catalog.listar_dashboards_topico(p_slug text)
RETURNS TABLE (codigo text, nome text, estado text, posicao integer)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_usuario uuid := auth.uid();
    v_papel text;
BEGIN
    IF v_usuario IS NULL THEN
        RAISE EXCEPTION 'Sessao nao autenticada' USING ERRCODE='42501';
    END IF;

    SELECT u.raw_app_meta_data->>'dashboard_role'
      INTO v_papel
    FROM auth.users AS u
    WHERE u.id = v_usuario;

    IF v_papel NOT IN ('admin','manager','user') OR v_papel IS NULL THEN
        RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501';
    END IF;

    RETURN QUERY
    SELECT d.codigo, d.nome, d.estado, td.posicao
    FROM dashboard_catalog.topicos AS t
    JOIN dashboard_catalog.topico_dashboards AS td ON td.topico_id=t.id
    JOIN dashboard_catalog.dashboards AS d ON d.id=td.dashboard_id
    WHERE t.slug=p_slug
      AND d.codigo IS NOT NULL
      AND (
        v_papel='admin'
        OR (
          d.estado='publicado'
          AND EXISTS (
            SELECT 1
            FROM dashboard_catalog.acesso_dashboards AS g
            WHERE g.usuario_id=v_usuario
              AND g.topico_id=t.id
              AND g.dashboard_id=d.id
          )
        )
      )
    ORDER BY td.posicao, d.nome, d.codigo;
END;
$$;

-- Registra somente dashboards que JA EXISTEM no aplicativo, nao um
-- construtor arbitrario de novos graficos. Funcao transacional + auditavel.
CREATE FUNCTION dashboard_catalog.vincular_dashboard_existente(
    p_topico_slug text, p_codigo text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=''
AS $$
DECLARE
    v_usuario uuid := auth.uid();
    v_papel text;
    v_nome text;
    v_topico_id uuid;
    v_dashboard_id uuid;
    v_novo_vinculo uuid;
BEGIN
    IF v_usuario IS NULL THEN
        RAISE EXCEPTION 'Sessao nao autenticada' USING ERRCODE='42501';
    END IF;

    SELECT u.raw_app_meta_data->>'dashboard_role'
      INTO v_papel
    FROM auth.users AS u WHERE u.id=v_usuario;

    IF v_papel IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Somente administradores podem associar dashboards'
            USING ERRCODE='42501';
    END IF;

    -- Lista fechada de renderizadores atualmente implementados.
    v_nome := CASE p_codigo
        WHEN 'visao-geral-chamadas' THEN 'Visão geral de Chamadas'
        WHEN 'tma-tme-diario' THEN 'TMA e TME diário'
        ELSE NULL
    END;
    IF v_nome IS NULL THEN
        RAISE EXCEPTION 'Dashboard nao reconhecido'
            USING ERRCODE='22023';
    END IF;

    SELECT t.id INTO v_topico_id
    FROM dashboard_catalog.topicos t
    WHERE t.slug=p_topico_slug;
    IF v_topico_id IS NULL THEN
        RAISE EXCEPTION 'Topico nao encontrado'
            USING ERRCODE='22023';
    END IF;

    INSERT INTO dashboard_catalog.dashboards (
        codigo,nome,estado,publicado_em,criado_por
    ) VALUES (
        p_codigo,v_nome,'publicado',pg_catalog.now(),v_usuario
    )
    ON CONFLICT (codigo) DO NOTHING;

    SELECT d.id INTO v_dashboard_id
    FROM dashboard_catalog.dashboards d WHERE d.codigo=p_codigo;

    IF v_dashboard_id IS NULL THEN
        RAISE EXCEPTION 'Falha ao localizar dashboard'
            USING ERRCODE='P0001';
    END IF;

    INSERT INTO dashboard_catalog.topico_dashboards (
        topico_id,dashboard_id,posicao,vinculado_por
    ) VALUES (
        v_topico_id,v_dashboard_id,
        COALESCE((
            SELECT MAX(td.posicao)+1
            FROM dashboard_catalog.topico_dashboards td
            WHERE td.topico_id=v_topico_id
        ),0),
        v_usuario
    )
    ON CONFLICT (topico_id,dashboard_id) DO NOTHING
    RETURNING dashboard_id INTO v_novo_vinculo;

    IF v_novo_vinculo IS NOT NULL THEN
        INSERT INTO dashboard_catalog.auditoria (
            operador_id,acao,tipo_objeto,objeto_id,contexto
        ) VALUES (
            v_usuario,'vincular','dashboard',v_dashboard_id,
            pg_catalog.jsonb_build_object(
                'topico_id',v_topico_id,'codigo',p_codigo
            )
        );
    END IF;

    RETURN v_dashboard_id;
END;
$$;

-- Wrappers sem elevacao de privilegios em public.
CREATE FUNCTION public.dashboard_catalogo_listar_dashboards_topico(p_slug text)
RETURNS TABLE (codigo text, nome text, estado text, posicao integer)
LANGUAGE sql SECURITY INVOKER
SET search_path=''
AS $$
    SELECT codigo,nome,estado,posicao
    FROM dashboard_catalog.listar_dashboards_topico(p_slug);
$$;

CREATE FUNCTION public.dashboard_catalogo_vincular_existente(
    p_topico_slug text, p_codigo text
)
RETURNS uuid
LANGUAGE sql SECURITY INVOKER
SET search_path=''
AS $$
    SELECT dashboard_catalog.vincular_dashboard_existente(
        p_topico_slug,p_codigo
    );
$$;

REVOKE ALL ON FUNCTION dashboard_catalog.listar_dashboards_topico(text)
    FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION dashboard_catalog.vincular_dashboard_existente(text,text)
    FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.dashboard_catalogo_listar_dashboards_topico(text)
    FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.dashboard_catalogo_vincular_existente(text,text)
    FROM PUBLIC,anon,authenticated;

GRANT EXECUTE ON FUNCTION dashboard_catalog.listar_dashboards_topico(text)
    TO authenticated;
GRANT EXECUTE ON FUNCTION dashboard_catalog.vincular_dashboard_existente(text,text)
    TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_catalogo_listar_dashboards_topico(text)
    TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_catalogo_vincular_existente(text,text)
    TO authenticated;

COMMIT;

NOTIFY pgrst,'reload schema';

-- VALIDACAO APOS INSTALACAO - leitura apenas:
-- SELECT
--   to_regprocedure('public.dashboard_catalogo_listar_dashboards_topico(text)') IS NOT NULL AS listar_existe,
--   to_regprocedure('public.dashboard_catalogo_vincular_existente(text,text)') IS NOT NULL AS vincular_existe,
--   has_function_privilege('anon','public.dashboard_catalogo_vincular_existente(text,text)','EXECUTE') AS anon_vincula,
--   has_function_privilege('authenticated','public.dashboard_catalogo_vincular_existente(text,text)','EXECUTE') AS auth_vincula;
-- Esperado: true,true,false,true.
-- Testes autenticados: admin pode vincular, manager nao; admin nao
-- pode criar duas associacoes iguais; grants continuam vazios.
