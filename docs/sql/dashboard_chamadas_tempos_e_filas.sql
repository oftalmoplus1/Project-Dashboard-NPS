-- PROPOSTA PARA REVISAO - NAO EXECUTADA NO SUPABASE
-- Indicadores TMA/TME: chamadas externas atendidas; abandono em fila
-- permanece NULL ate validar sua fonte especifica.
-- A aplicacao ja espera a RPC consolidada em /api/chamadas/indicadores.
-- A RPC _por_dia e uma alternativa, retornando SOMENTE data, TMA e TME
-- por dia. Sua exibicao na interface requer integracao posterior.
-- Revisar em ponto seguro/backup antes da execucao no banco self-hosted.

BEGIN;

CREATE OR REPLACE FUNCTION dashboard_private.chamadas_tempos_e_filas(
    p_inicio date, p_fim date
)
RETURNS TABLE(
    taxa_abandono_fila double precision,
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
    SELECT
        NULL::double precision AS taxa_abandono_fila,
        ROUND(AVG(r.ta)::numeric, 2)::double precision AS tma_segundos,
        ROUND(AVG(r.tet)::numeric, 2)::double precision AS tme_segundos
    FROM public.relatorio_chamadas AS r
    WHERE r.disposition = 'ANSWERED'
      AND r.call_direction IN ('Recebida', 'Efetuada')
      AND r.init_time >= (
          p_inicio::timestamp AT TIME ZONE 'America/Sao_Paulo'
      )
      AND r.init_time < (
          (p_fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'
      );
END;
$function$;

REVOKE ALL ON FUNCTION dashboard_private.chamadas_tempos_e_filas(date, date)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION dashboard_private.chamadas_tempos_e_filas(date, date)
TO authenticated;

CREATE OR REPLACE FUNCTION public.dashboard_chamadas_tempos_e_filas(
    p_inicio date, p_fim date
)
RETURNS TABLE(
    taxa_abandono_fila double precision,
    tma_segundos double precision,
    tme_segundos double precision
)
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
    SELECT * FROM dashboard_private.chamadas_tempos_e_filas(p_inicio, p_fim);
$function$;

REVOKE ALL ON FUNCTION public.dashboard_chamadas_tempos_e_filas(date, date)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dashboard_chamadas_tempos_e_filas(date, date)
TO authenticated;


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

-- Validacoes apos criacao:
-- 1. Testar com sessao admin/manager pela rota /api/chamadas/indicadores.
-- 2. Outubro de 2026: tma_segundos=177.14, tme_segundos=124.08;
--    taxa_abandono_fila=NULL.
-- 3. Verificar acesso anonimo e perfil sem permissao (nega).
-- 4. Verificar periodo sem chamadas: NULL, nao zero ficticio.
-- 5. Validar retorno como objeto JSON unico pela rota Next.js.
-- 6. Confirmar configuracao do schema privado e grants existentes.

-- VALIDACAO DA OPCAO DIARIA (via chamada autenticada, perfil admin/manager):
-- POST /rest/v1/rpc/dashboard_chamadas_tempos_por_dia
-- {"p_inicio":"2026-10-01","p_fim":"2026-10-31"}
-- Esperado: 31 linhas, dia 2026-10-01..2026-10-31;
-- dias sem chamadas: TMA e TME NULL. Comparar um dia com SQL direto.
-- Nao executar essa RPC anonimamente: deve retornar erro 42501 ou 403.
-- A RPC consolidada continua retornando as tres colunas antigas.
