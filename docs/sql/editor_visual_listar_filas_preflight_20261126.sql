-- Editor Visual / listar_filas: preflight SOMENTE LEITURA.
-- Executar exclusivamente no Supabase self-hosted do Dashboard NPS.
-- Nao materializa historico, nao altera tabelas/RPCs/workflows.
-- Os valores representam a ultima fotografia, NAO chamados por dia.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '8s';
SET LOCAL lock_timeout = '3s';

WITH latest AS (
 SELECT MAX(updated_at) AS max_updated
 FROM public.listar_filas
), cohort AS (
 SELECT
  f.id, f.received, f.answered,
  f.abandon_less_30s, f.abandon_more_30s,
  f.updated_at,
  (f.updated_at BETWEEN latest.max_updated - INTERVAL '5 minutes'
                     AND latest.max_updated) AS in_latest_batch
 FROM public.listar_filas f CROSS JOIN latest
)
SELECT COUNT(*) AS registros_persistidos,
       COUNT(*) FILTER (WHERE in_latest_batch) AS filas_na_ultima_coleta,
       COUNT(*) FILTER (WHERE NOT in_latest_batch) AS filas_fora_da_coleta,
       MIN(updated_at) FILTER (WHERE in_latest_batch) AS primeira_atualizacao_da_coleta,
       MAX(updated_at) FILTER (WHERE in_latest_batch) AS ultima_atualizacao_da_coleta,
       SUM(received) FILTER (WHERE in_latest_batch) AS recebidas_na_coleta,
       SUM(answered) FILTER (WHERE in_latest_batch) AS atendidas_na_coleta,
       SUM(abandon_less_30s + abandon_more_30s)
         FILTER (WHERE in_latest_batch) AS abandonadas_na_coleta,
       COUNT(*) FILTER (WHERE in_latest_batch AND received = 0) AS filas_sem_movimento
FROM cohort;

ROLLBACK;

-- Importante: uma unica fotografia nao permite definir se houve reset
-- dos contadores, nem recuperar volumes de um intervalo de datas.
