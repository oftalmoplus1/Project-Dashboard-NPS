-- 2026-11-19 | LigSim: TEF (espera em fila) nas RPCs consolidada e diaria
-- PREPARADO PARA HOMOLOGACAO; NAO EXECUTAR SEM BACKUP E CHECKPOINT.
-- Fonte de hash: exportacao do banco do Dashboard de 13/11/2026.
-- A transacao aborta se QUALQUER definicao mudou; nao remover os guards.
-- Preserva TMA, autenticacao, grants, owner, contrato e dados operacionais.
-- Condicao TEF: chamada Recebida, ANSWERED, nome de fila informado, tef >= 0.
-- Abandono RPC consolidada: ABANDON / todas as Recebidas (sem filtro de fila).
-- Apos instalar e validar as duas RPCs com admin, configurar
-- LIGSIM_TME_TEF_ENABLED=true no dash-hub, depois redeploy do aplicativo.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $migration$
DECLARE
  v_summary text;
  v_daily text;
  v_old_summary text := $old_summary$AVG(r.tet) FILTER (
                WHERE r.disposition='ANSWERED'
                  AND r.call_direction IN ('Recebida','Efetuada')
            ) AS tme$old_summary$;
  v_new_summary text := $new_summary$AVG(r.tef) FILTER (
                WHERE r.disposition='ANSWERED'
                  AND r.call_direction='Recebida'
                  AND NULLIF(pg_catalog.btrim(r.queuename),'') IS NOT NULL
                  AND r.tef >= 0
            ) AS tme$new_summary$;
  v_old_count text := $old_count$COUNT(*) FILTER (
                WHERE r.call_direction='Recebida'
                  AND r.disposition='ANSWERED'
            )::numeric AS atendidas$old_count$;
  v_new_count text := $new_count$COUNT(*) FILTER (
                WHERE r.call_direction='Recebida'
            )::numeric AS recebidas$new_count$;
  v_old_daily text := 'ROUND(AVG(r.tet)::numeric, 2)::double precision AS tme';
  v_new_daily text := $daily$ROUND(
                (AVG(r.tef) FILTER (
                    WHERE r.call_direction='Recebida'
                      AND NULLIF(pg_catalog.btrim(r.queuename),'') IS NOT NULL
                      AND r.tef >= 0
                ))::numeric, 2
            )::double precision AS tme$daily$;
BEGIN
  IF pg_catalog.to_regprocedure('dashboard_private.chamadas_tempos_e_filas(date,date)') IS NULL
     OR pg_catalog.to_regprocedure('dashboard_private.chamadas_tempos_por_dia(date,date)') IS NULL THEN
    RAISE EXCEPTION 'Funcoes privadas ausentes; nenhuma alteracao autorizada';
  END IF;
  v_summary := replace(
    pg_catalog.pg_get_functiondef('dashboard_private.chamadas_tempos_e_filas(date,date)'::regprocedure),
    chr(13),''
  );
  v_daily := replace(
    pg_catalog.pg_get_functiondef('dashboard_private.chamadas_tempos_por_dia(date,date)'::regprocedure),
    chr(13),''
  );
  IF pg_catalog.md5(v_summary) <> '90378552c08708ba38716db9001a0a6e'
     OR pg_catalog.md5(v_daily) <> '7452654f11956d5718f4f2bbfd651562' THEN
    RAISE EXCEPTION 'Definicoes divergentes da exportacao 13/11; pare e revise SQL atual';
  END IF;
  IF position(v_old_summary IN v_summary)=0
     OR position(v_old_count IN v_summary)=0
     OR position('NULLIF(abandonadas+atendidas,0)' IN v_summary)=0
     OR position(v_old_daily IN v_daily)=0 THEN
    RAISE EXCEPTION 'Padroes esperados ausentes; transacao revertida';
  END IF;

  v_summary := replace(v_summary, v_old_summary, v_new_summary);
  v_summary := replace(v_summary, v_old_count, v_new_count);
  v_summary := replace(v_summary,'NULLIF(abandonadas+atendidas,0)','NULLIF(recebidas,0)');
  v_daily := replace(v_daily, v_old_daily, v_new_daily);
  EXECUTE v_summary;
  EXECUTE v_daily;

  IF position('AVG(r.tet)' IN pg_catalog.pg_get_functiondef(
       'dashboard_private.chamadas_tempos_e_filas(date,date)'::regprocedure))>0
     OR position('AVG(r.tet)' IN pg_catalog.pg_get_functiondef(
       'dashboard_private.chamadas_tempos_por_dia(date,date)'::regprocedure))>0 THEN
    RAISE EXCEPTION 'Verificacao de TEF falhou; transacao revertida';
  END IF;
END
$migration$;
COMMIT;

-- VERIFICACAO SOMENTE LEITURA: confirma que TEF foi inserido nas duas funcoes.
SELECT 'consolidada' AS funcao,
  position('AVG(r.tef)' IN pg_catalog.pg_get_functiondef(
    'dashboard_private.chamadas_tempos_e_filas(date,date)'::regprocedure))>0 AS usa_tef
UNION ALL
SELECT 'diaria',
  position('AVG(r.tef)' IN pg_catalog.pg_get_functiondef(
    'dashboard_private.chamadas_tempos_por_dia(date,date)'::regprocedure))>0;

-- Testar com usuario admin: /api/chamadas/indicadores e
-- /api/chamadas/tempos-por-dia; TMA deve permanecer igual para mesmo periodo.
-- Nao habilitar LIGSIM_TME_TEF_ENABLED se os testes reais falharem.
