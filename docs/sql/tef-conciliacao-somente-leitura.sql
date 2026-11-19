-- SOMENTE LEITURA: conciliacao de volumes, TEF e TMA por janela.
-- Executar apenas no banco self-hosted correto do Dashboard.
-- Os recortes sao referencias de verificacao, nao valores esperados imutaveis.
-- Quando houver recuperacao de historico, os totais devem acompanhar a origem.
WITH janelas AS (
  SELECT 'dia'::text AS periodo, date '2026-11-12' AS inicio, date '2026-11-12' AS fim
  UNION ALL
  SELECT 'outubro', date '2026-10-01', date '2026-10-31'
  UNION ALL
  SELECT 'novembro_01_17', date '2026-11-01', date '2026-11-17'
), contagens AS (
  SELECT
    j.periodo, j.inicio, j.fim,
    COUNT(*) FILTER (WHERE r.call_direction='Recebida') AS recebidas,
    COUNT(*) FILTER (WHERE r.call_direction='Recebida' AND r.disposition='ANSWERED') AS atendidas,
    COUNT(*) FILTER (WHERE r.call_direction='Recebida' AND r.disposition='ABANDON') AS abandonadas,
    COUNT(*) FILTER (WHERE r.call_direction='Recebida' AND r.disposition='NO ANSWER') AS nao_atendidas,
    COUNT(*) FILTER (WHERE r.call_direction='Recebida' AND r.disposition='ABANDON'
                        AND NULLIF(pg_catalog.btrim(r.queuename),'') IS NULL) AS abandono_sem_fila_informada,
    COUNT(r.ta) FILTER (WHERE r.disposition='ANSWERED'
                       AND r.call_direction IN ('Recebida','Efetuada') AND r.ta >= 0) AS n_ta,
    SUM(r.ta) FILTER (WHERE r.disposition='ANSWERED'
                     AND r.call_direction IN ('Recebida','Efetuada') AND r.ta >= 0) AS soma_ta,
    COUNT(r.tef) FILTER (WHERE r.disposition='ANSWERED'
                        AND r.call_direction='Recebida'
                        AND NULLIF(pg_catalog.btrim(r.queuename),'') IS NOT NULL
                        AND r.tef >= 0) AS n_tef,
    SUM(r.tef) FILTER (WHERE r.disposition='ANSWERED'
                      AND r.call_direction='Recebida'
                      AND NULLIF(pg_catalog.btrim(r.queuename),'') IS NOT NULL
                      AND r.tef >= 0) AS soma_tef
  FROM janelas j
  LEFT JOIN public.relatorio_chamadas r
    ON r.init_time >= (j.inicio::timestamp AT TIME ZONE 'America/Sao_Paulo')
   AND r.init_time < ((j.fim + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
  GROUP BY j.periodo, j.inicio, j.fim
)
SELECT periodo, inicio, fim, recebidas, atendidas, abandonadas, nao_atendidas,
       (recebidas - atendidas - abandonadas - nao_atendidas) AS outras_recebidas,
       abandono_sem_fila_informada,
       ROUND(100.0 * abandonadas / NULLIF(recebidas, 0), 2) AS taxa_abandono_pct,
       n_ta, soma_ta, ROUND(soma_ta::numeric / NULLIF(n_ta,0), 2) AS tma_segundos,
       n_tef, soma_tef, ROUND(soma_tef::numeric / NULLIF(n_tef,0), 2) AS tme_fila_tef_segundos
FROM contagens ORDER BY inicio;

-- Diagnostico estrutural: confirmar DEPOIS da migracao.
-- Nenhuma funcao e executada nem alterada por este SELECT.
SELECT
  pg_catalog.to_regprocedure('dashboard_private.chamadas_tempos_e_filas(date,date)') IS NOT NULL AS resumo_existe,
  pg_catalog.to_regprocedure('dashboard_private.chamadas_tempos_por_dia(date,date)') IS NOT NULL AS diaria_existe,
  position('AVG(r.tef)' IN pg_catalog.pg_get_functiondef(
    'dashboard_private.chamadas_tempos_e_filas(date,date)'::regprocedure)) > 0 AS resumo_usa_tef,
  position('AVG(r.tef)' IN pg_catalog.pg_get_functiondef(
    'dashboard_private.chamadas_tempos_por_dia(date,date)'::regprocedure)) > 0 AS diaria_usa_tef;
