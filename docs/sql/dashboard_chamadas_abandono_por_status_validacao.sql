-- VALIDACAO LEITURA - TAXA DE ABANDONO POR STATUS (LIGSIM)
-- Uma consulta, um CSV, sem dados pessoais e sem alterar registros.
-- Compare a taxa calculada com o relatorio oficial da LigSim por periodo.
-- A regra e: cada chamada recebida com disposition ABANDON = fila abandonada,
-- e cada chamada recebida ANSWERED = atendimento. NO ANSWER nao e abandono.
-- TMA/TME devem ficar identicos aos valores existentes.

WITH base AS (
 SELECT
   COUNT(*) FILTER (
     WHERE call_direction='Recebida' AND disposition='ABANDON'
   )::numeric AS abandonadas,
   COUNT(*) FILTER (
     WHERE call_direction='Recebida' AND disposition='ANSWERED'
   )::numeric AS atendidas,
   COUNT(*) FILTER (
     WHERE call_direction='Recebida' AND disposition='NO ANSWER'
   )::numeric AS sem_atendimento,
   ROUND(AVG(ta) FILTER (
     WHERE call_direction IN ('Recebida','Efetuada') AND disposition='ANSWERED'
   )::numeric,2) AS tma_segundos,
   ROUND(AVG(tet) FILTER (
     WHERE call_direction IN ('Recebida','Efetuada') AND disposition='ANSWERED'
   )::numeric,2) AS tme_segundos
 FROM public.relatorio_chamadas
 WHERE init_time >= (
    '2026-10-01'::timestamp AT TIME ZONE 'America/Sao_Paulo'
 )
 AND init_time < (
    '2026-11-01'::timestamp AT TIME ZONE 'America/Sao_Paulo'
 )
)
SELECT
  abandonadas,
  atendidas,
  sem_atendimento,
  abandonadas+atendidas AS denominador,
  ROUND(
    100.0*abandonadas/NULLIF(abandonadas+atendidas,0),2
  ) AS taxa_abandono_fila_percentual,
  tma_segundos,
  tme_segundos
FROM base;

-- VALIDE ANTES DE PUBLICAR:
-- (a) Conferir que o status ABANDON representa especificamente
--     saida da fila sem atendimento no relatório LigSim da operação.
-- (b) O denominador EXCLUI NO ANSWER. O numerador inclui SOMENTE Recebida ABANDON.
-- (c) TMA deve continuar 177.14 e TME 124.08 para outubro/2026.
-- (d) Na RPC autenticada, testar o mesmo periodo e comparar a taxa.
-- (e) Caso sejam encontradas chamadas ABANDON antes da fila, suspender
--     a publicacao e filtrar com dados de evento de fila.
