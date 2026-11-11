-- PROPOSTA PARA REVISAO - NAO EXECUTADA AUTOMATICAMENTE
-- Fonte: public.relatorio_chamadas
-- Mantem dashboard_private.chamadas_agregadas existente intacta.
-- Executar somente no Supabase self-hosted da LigSim apos ponto seguro/backup
-- e confirmacao de permissoes e esquema do banco.

BEGIN;

CREATE OR REPLACE FUNCTION dashboard_private.chamadas_por_hora(
    p_inicio date, p_fim date
)
RETURNS TABLE(
    hora integer,
    total bigint,
    atendidas bigint,
    nao_atendidas bigint,
    abandonadas bigint,
    outras bigint
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

    IF p_inicio IS NULL OR p_fim IS NULL
       OR p_fim < p_inicio OR p_fim - p_inicio > 365
    THEN
        RAISE EXCEPTION 'Periodo invalido'
            USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    WITH horas AS (
        SELECT generate_series(0, 23)::integer AS hora
    ),
    chamadas AS (
        SELECT DISTINCT
            r.id,
            r.disposition,
            EXTRACT(HOUR FROM (
                r.init_time AT TIME ZONE 'America/Sao_Paulo'
            ))::integer AS hora_local
        FROM public.relatorio_chamadas AS r
        WHERE r.call_direction = 'Recebida'
          AND r.init_time >= (
              p_inicio::timestamp
              AT TIME ZONE 'America/Sao_Paulo'
          )
          AND r.init_time < (
              (p_fim + 1)::timestamp
              AT TIME ZONE 'America/Sao_Paulo'
          )
    ),
    contagens AS (
        SELECT
            c.hora_local,
            COUNT(DISTINCT c.id)::bigint AS total,
            COUNT(DISTINCT c.id) FILTER (
                WHERE c.disposition = 'ANSWERED'
            )::bigint AS atendidas,
            COUNT(DISTINCT c.id) FILTER (
                WHERE c.disposition = 'NO ANSWER'
            )::bigint AS nao_atendidas,
            COUNT(DISTINCT c.id) FILTER (
                WHERE c.disposition = 'ABANDON'
            )::bigint AS abandonadas,
            COUNT(DISTINCT c.id) FILTER (
                WHERE c.disposition IS NULL OR
                    c.disposition NOT IN (
                        'ANSWERED', 'NO ANSWER', 'ABANDON'
                    )
            )::bigint AS outras
        FROM chamadas AS c
        GROUP BY c.hora_local
    )
    SELECT
        h.hora,
        COALESCE(c.total, 0)::bigint,
        COALESCE(c.atendidas, 0)::bigint,
        COALESCE(c.nao_atendidas, 0)::bigint,
        COALESCE(c.abandonadas, 0)::bigint,
        COALESCE(c.outras, 0)::bigint
    FROM horas AS h
    LEFT JOIN contagens AS c ON c.hora_local = h.hora
    ORDER BY h.hora;
END;
$function$;

-- Nao liberar execucao implicita a PUBLIC.
REVOKE ALL ON FUNCTION dashboard_private.chamadas_por_hora(date, date)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION dashboard_private.chamadas_por_hora(date, date)
TO authenticated;

CREATE OR REPLACE FUNCTION public.dashboard_chamadas_por_hora(
    p_inicio date, p_fim date
)
RETURNS TABLE(
    hora integer,
    total bigint,
    atendidas bigint,
    nao_atendidas bigint,
    abandonadas bigint,
    outras bigint
)
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
    SELECT *
    FROM dashboard_private.chamadas_por_hora(p_inicio, p_fim);
$function$;

REVOKE ALL ON FUNCTION public.dashboard_chamadas_por_hora(date, date)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_chamadas_por_hora(date, date)
TO authenticated;

COMMIT;

-- VALIDACOES MANUAIS:
-- 1. Conferir has_function_privilege('anon', ..., 'EXECUTE') = false.
-- 2. Usuario autenticado admin/manager: 24 linhas, horas 0..23.
-- 3. Usuario autenticado sem perfil: SQLSTATE 42501.
-- 4. Comparar somas com consulta independente do dia 2026-11-10.
-- 5. Conferir que a API retorna numeros JSON (PostgREST bigint).
-- 6. Conferir role USAGE no schema dashboard_private para o wrapper:
--    sem amplia-la automaticamente; replicar o modelo da funcao existente.
