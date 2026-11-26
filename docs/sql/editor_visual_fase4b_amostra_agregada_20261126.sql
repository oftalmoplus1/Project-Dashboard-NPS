-- Editor Visual fase 4B: AMOSTRA AGREGADA SOMENTE LEITURA.
-- RODAR APENAS DEPOIS de verificar no inventario que existe indice de init_time
-- e as colunas abaixo. Limite de 2.000 registros de um unico dia.
-- O resultado nao contem IDs, numeros, agentes nem outros dados pessoais.
-- Esta consulta NAO PROVA que uma linha equivale a uma entrada em fila.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '8s';
SET LOCAL lock_timeout = '3s';

WITH amostra AS MATERIALIZED (
 SELECT r.id, r.queuename, r.disposition, r.call_direction, r.init_time
 FROM public.relatorio_chamadas AS r
 WHERE r.init_time >= pg_catalog.now() - interval '1 day'
 ORDER BY r.init_time DESC
 LIMIT 2000
)
SELECT COUNT(*)::bigint AS linhas_amostradas,
       COUNT(DISTINCT id)::bigint AS ids_distintos,
       COUNT(*) FILTER (WHERE queuename IS NULL OR pg_catalog.btrim(queuename) = '')::bigint AS sem_fila,
       COUNT(DISTINCT queuename)::bigint AS filas_distintas,
       COUNT(*) FILTER (WHERE call_direction = 'Recebida')::bigint AS recebidas,
       COUNT(*) FILTER (WHERE disposition = 'ANSWERED')::bigint AS status_atendida,
       COUNT(*) FILTER (WHERE disposition = 'ABANDON')::bigint AS status_abandono,
       COUNT(*) FILTER (WHERE disposition = 'NO ANSWER')::bigint AS status_nao_atendeu
FROM amostra;

ROLLBACK;
