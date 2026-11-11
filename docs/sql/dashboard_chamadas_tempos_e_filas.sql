-- PROPOSTA PARA REVISAO - NAO EXECUTADA NO SUPABASE
-- Indicadores TMA/TME: chamadas externas atendidas; abandono em fila
-- permanece NULL ate validar sua fonte especifica.
-- A aplicacao ja espera esta RPC em /api/chamadas/indicadores.
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

COMMIT;

-- Validacoes apos criacao:
-- 1. Testar com sessao admin/manager pela rota /api/chamadas/indicadores.
-- 2. Outubro de 2026: tma_segundos=177.14, tme_segundos=124.08;
--    taxa_abandono_fila=NULL.
-- 3. Verificar acesso anonimo e perfil sem permissao (nega).
-- 4. Verificar periodo sem chamadas: NULL, nao zero ficticio.
-- 5. Validar retorno como objeto JSON unico pela rota Next.js.
-- 6. Confirmar configuracao do schema privado e grants existentes.
