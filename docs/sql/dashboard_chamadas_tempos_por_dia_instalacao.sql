-- INSTALACAO ISOLADA: TMA e TME por dia.
-- Executar apenas no Supabase self-hosted da LigSim apos backup/ponto seguro.
-- Nao altera a RPC consolidada de TMA/TME nem a tabela operacional.
-- Permissoes: execucao autenticada, validacao do JWT admin/manager na funcao privada.
-- Confirme que o schema dashboard_private segue a mesma configuracao das RPCs existentes.

BEGIN;

-- ALTERNATIVA DIARIA: somente TMA/TME por dia, sem taxa de abandono.
-- Retorna uma linha por dia, mesmo sem chamadas (medias NULL).
-- Mantem a RPC consolidada anterior e seu contrato inalterados.
CREATE OR REPLACE FUNCTION dashboard_private.chamadas_tempos_por_dia(
    p_inicio date, p_fim date
)
RETURNS TABLE(
    dia date,
    tma_segundos double precision,
    tme_segundos double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
SET statement_timeout TO '15s'
AS $function$
DECLARE
    v_perfil text;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Acesso nao autorizado'
            USING ERRCODE = '42501';
    END IF;
    v_perfil := auth.jwt() -> 'app_metadata' ->> 'dashboard_role';
    IF v_perfil IS NULL OR v_perfil NOT IN ('admin', 'manager') THEN
        RAISE EXCEPTION 'Perfil nao autorizado'
            USING ERRCODE = '42501';
    END IF;
    IF p_inicio IS NULL OR p_fim IS NULL OR p_fim < p_inicio
       OR p_fim - p_inicio > 365 THEN
        RAISE EXCEPTION 'Periodo invalido'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    WITH dias AS (
        SELECT gs::date AS dia_local
        FROM pg_catalog.generate_series(
            p_inicio::timestamp, p_fim::timestamp, INTERVAL '1 day'
        ) AS gs
    ),
    medias AS (
        SELECT
            (r.init_time AT TIME ZONE 'America/Sao_Paulo')::date AS dia_local,
            ROUND(AVG(r.ta)::numeric, 2)::double precision AS tma,
            ROUND(AVG(r.tet)::numeric, 2)::double precision AS tme
        FROM public.relatorio_chamadas AS r
        WHERE r.disposition = 'ANSWERED'
          AND r.call_direction IN ('Recebida', 'Efetuada')
          AND r.init_time >= (
              p_inicio::timestamp AT TIME ZONE 'America/Sao_Paulo'
          )
          AND r.init_time < (
              (p_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'
          )
        GROUP BY (r.init_time AT TIME ZONE 'America/Sao_Paulo')::date
    )
    SELECT d.dia_local, m.tma, m.tme
    FROM dias AS d
    LEFT JOIN medias AS m ON m.dia_local = d.dia_local
    ORDER BY d.dia_local;
END;
$function$;

REVOKE ALL ON FUNCTION dashboard_private.chamadas_tempos_por_dia(date, date)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION dashboard_private.chamadas_tempos_por_dia(date, date)
TO authenticated;

CREATE OR REPLACE FUNCTION public.dashboard_chamadas_tempos_por_dia(
    p_inicio date, p_fim date
)
RETURNS TABLE(
    dia date,
    tma_segundos double precision,
    tme_segundos double precision
)
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
    SELECT * FROM dashboard_private.chamadas_tempos_por_dia(p_inicio, p_fim);
$function$;

REVOKE ALL ON FUNCTION public.dashboard_chamadas_tempos_por_dia(date, date)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_chamadas_tempos_por_dia(date, date)
TO authenticated;

COMMIT;

-- TESTE 1: confirmar existencia das funcoes (SQL Editor, somente leitura)
-- SELECT to_regprocedure('public.dashboard_chamadas_tempos_por_dia(date,date)') IS NOT NULL AS publica,
--        to_regprocedure('dashboard_private.chamadas_tempos_por_dia(date,date)') IS NOT NULL AS privada;
-- TESTE 2: conferir permissoes (somente leitura)
-- SELECT has_function_privilege('anon', 'public.dashboard_chamadas_tempos_por_dia(date,date)', 'EXECUTE') AS anon_execute,
--        has_function_privilege('authenticated', 'public.dashboard_chamadas_tempos_por_dia(date,date)', 'EXECUTE') AS authenticated_execute;
-- TESTE 3: chamada autenticada admin/manager, outubro/2026: 31 linhas,
--         valores individuais devem conciliar com consulta direta de outubro.
-- TESTE 4: usuario sem perfil permitido deve receber 42501;
--         chamada anonima deve ser bloqueada.
