-- TMA E TME: INDICADORES GERAIS DA VISAO DE CHAMADAS
-- Instalar SOMENTE apos backup e revisao no Supabase self-hosted.
-- Nao executar o script antigo dashboard_chamadas_tempos_e_filas.sql:
-- ele tambem substituiria a RPC diaria que ja esta funcionando.
--
-- Objetivo: disponibilizar a RPC consolidada que o app ja consulta.
-- TMA = AVG(ta) e TME = AVG(tet), para chamadas externas ANSWERED.
-- Abandono em fila continua NULL ate haver fonte de eventos de fila valida.
-- Restringe acesso ao papel admin ate a ACL por topico/dashboard ser implantada.
-- Nao altera dados, views, tabelas, RLS ou funcoes diarias existentes.

BEGIN;

CREATE OR REPLACE FUNCTION dashboard_private.chamadas_tempos_e_filas(
    p_inicio date, p_fim date
)
RETURNS TABLE (
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
    v_usuario uuid := auth.uid();
    v_papel text;
BEGIN
    IF v_usuario IS NULL THEN
        RAISE EXCEPTION 'Sessao nao autenticada'
            USING ERRCODE = '42501';
    END IF;

    -- Consultar papel atual no servidor de Auth em vez de confiar
    -- somente em claims de tokens que podem estar desatualizados.
    SELECT u.raw_app_meta_data ->> 'dashboard_role'
      INTO v_papel
    FROM auth.users AS u
    WHERE u.id = v_usuario;

    IF v_papel IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Somente administradores podem consultar esta RPC'
            USING ERRCODE = '42501';
    END IF;

    IF p_inicio IS NULL OR p_fim IS NULL
       OR p_fim < p_inicio OR p_fim - p_inicio > 365 THEN
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

CREATE OR REPLACE FUNCTION public.dashboard_chamadas_tempos_e_filas(
    p_inicio date, p_fim date
)
RETURNS TABLE (
    taxa_abandono_fila double precision,
    tma_segundos double precision,
    tme_segundos double precision
)
LANGUAGE sql
SECURITY INVOKER
SET search_path TO ''
AS $function$
    SELECT taxa_abandono_fila, tma_segundos, tme_segundos
    FROM dashboard_private.chamadas_tempos_e_filas(p_inicio, p_fim);
$function$;

-- EXECUTE em funcoes novas e concedido ao PUBLIC por padrao.
-- Retirar a concessao das duas camadas antes de liberar authenticated.
REVOKE ALL ON FUNCTION dashboard_private.chamadas_tempos_e_filas(date,date)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.dashboard_chamadas_tempos_e_filas(date,date)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION dashboard_private.chamadas_tempos_e_filas(date,date)
    TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_chamadas_tempos_e_filas(date,date)
    TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- VALIDE SEPARADAMENTE:
-- 1. Verifique ambas as assinaturas com to_regprocedure.
-- 2. anon EXECUTE = false; authenticated EXECUTE = true.
-- 3. Admin autenticado /api/chamadas/indicadores?start=2026-10-01&end=2026-10-31
--    deve retornar TMA=177.14 e TME=124.08; abandono em fila = null.
-- 4. Manager nao autorizado deve receber 403 (nao inferir permissao por EXECUTE).
-- 5. Sem chamadas externas atendidas: TMA/TME NULL, nunca zero ficticio.
