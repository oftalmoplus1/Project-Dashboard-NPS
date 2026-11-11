-- CARTAO: TAXA DE ABANDONO EM FILA (REGRA DE NEGOCIO CONFIRMADA)
-- NOVA ETAPA. Executar uma unica vez, apos revisar resultado do
-- diagnostico e conferir backup. Nao executar o script antigo de TMA/TME.
--
-- Fonte: public.relatorio_chamadas, chamadas RECEBIDAS.
-- Decisao do negocio: registros cujo status disposition='ABANDON'
-- representam clientes que sairam da fila antes do atendimento.
-- Denominador: RECEBIDAS ANSWERED + RECEBIDAS ABANDON.
-- NO ANSWER nao equivale a abandono e nao entra no denominador.
-- TMA e TME continuam incluindo chamadas externas atendidas
-- RECEBIDAS + EFETUADAS, como ja foi validado anteriormente.
-- Nao altera tabelas, dados, n8n, API diaria nem grants existentes.
-- OBS: esta regra pressupoe que o status ABANDON no relatorio geral
-- realmente representa saida da fila; confirmar com o painel LigSim.

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
        RAISE EXCEPTION 'Sessao nao autenticada' USING ERRCODE='42501';
    END IF;

    SELECT u.raw_app_meta_data ->> 'dashboard_role'
      INTO v_papel
    FROM auth.users AS u
    WHERE u.id = v_usuario;

    IF v_papel IS DISTINCT FROM 'admin' THEN
        RAISE EXCEPTION 'Acesso nao autorizado' USING ERRCODE='42501';
    END IF;

    IF p_inicio IS NULL OR p_fim IS NULL
       OR p_fim < p_inicio OR p_fim - p_inicio > 365 THEN
        RAISE EXCEPTION 'Periodo invalido' USING ERRCODE='22023';
    END IF;

    RETURN QUERY
    WITH resumo AS (
        SELECT
            COUNT(*) FILTER (
                WHERE r.call_direction='Recebida'
                  AND r.disposition='ABANDON'
            )::numeric AS abandonadas,
            COUNT(*) FILTER (
                WHERE r.call_direction='Recebida'
                  AND r.disposition='ANSWERED'
            )::numeric AS atendidas,
            AVG(r.ta) FILTER (
                WHERE r.disposition='ANSWERED'
                  AND r.call_direction IN ('Recebida','Efetuada')
            ) AS tma,
            AVG(r.tet) FILTER (
                WHERE r.disposition='ANSWERED'
                  AND r.call_direction IN ('Recebida','Efetuada')
            ) AS tme
        FROM public.relatorio_chamadas r
        WHERE r.init_time >= (
            p_inicio::timestamp AT TIME ZONE 'America/Sao_Paulo'
        )
          AND r.init_time < (
            (p_fim+1)::timestamp AT TIME ZONE 'America/Sao_Paulo'
        )
    )
    SELECT
        ROUND(
            100.0 * abandonadas /
            NULLIF(abandonadas+atendidas,0),2
        )::double precision,
        ROUND(tma::numeric,2)::double precision,
        ROUND(tme::numeric,2)::double precision
    FROM resumo;
END;
$function$;

-- Nao e necessario substituir a funcao public existente, pois o
-- contrato permanece igual (taxa_abandono_fila, tma_segundos, tme_segundos).
-- A RPC publica SECURITY INVOKER usa esta funcao privada.
-- Reforcar revogacao anonima e autorizacao autenticada na funcao privada.
REVOKE ALL ON FUNCTION dashboard_private.chamadas_tempos_e_filas(date,date)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION dashboard_private.chamadas_tempos_e_filas(date,date)
TO authenticated;

COMMIT;

NOTIFY pgrst,'reload schema';

-- TESTE AUTENTICADO:
-- GET /api/chamadas/indicadores?start=2026-10-01&end=2026-10-31
-- tasa_abandono_fila = percentagem de ABANDON / (ANSWERED+ABANDON)
-- apenas em chamadas Recebidas; TMA=177.14, TME=124.08.
-- Denominador zero => NULL, sem afirmar abandono 0%.
-- Testar conta gerente (403 na API) e anon (EXECUTE negado).
