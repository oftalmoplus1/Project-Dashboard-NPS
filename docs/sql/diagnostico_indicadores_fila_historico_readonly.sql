-- INVENTARIO SOMENTE LEITURA, para execucao manual no Supabase self-hosted correto.
-- NAO instala RPC, tabela, indice, permissao, ou muda dados.
-- Nao retorna numeros de telefone, nomes de agentes nem identificadores de chamada.
-- Requer conta administrativa de banco; execute no SQL Editor autorizado.
BEGIN READ ONLY;
SET LOCAL statement_timeout = '15s';

-- 1. Tipos e nulidade dos campos relevantes.
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('relatorio_chamadas', 'listar_filas')
  AND column_name IN (
    'init_time', 'queuename', 'disposition', 'call_direction',
    'name', 'id', 'received', 'answered', 'abandon_less_30s',
    'abandon_more_30s', 'updated_at'
  )
ORDER BY table_name, column_name;

-- 2. Distribuicao de estados de chamadas, sem identificadores individuais.
-- O escopo e apenas DESCRITIVO: jamais traduzir automaticamente
-- estados diferentes de ANSWERED para abandono em fila.
SELECT
  COALESCE(call_direction::text, '(nulo)') AS direcao,
  COALESCE(disposition::text, '(nulo)') AS disposicao,
  count(*)::bigint AS registros
FROM public.relatorio_chamadas
WHERE init_time >= (current_date - interval '30 days')
  AND init_time < (current_date + interval '1 day')
GROUP BY 1, 2
ORDER BY registros DESC
LIMIT 100;

-- 3. Disponibilidade de queuename e datas nos eventos do periodo.
SELECT
  count(*)::bigint AS registros,
  count(*) FILTER (WHERE NULLIF(btrim(queuename::text), '') IS NULL)::bigint
    AS sem_nome_de_fila,
  min(init_time) AS primeiro_evento,
  max(init_time) AS ultimo_evento
FROM public.relatorio_chamadas
WHERE init_time >= (current_date - interval '30 days')
  AND init_time < (current_date + interval '1 day');

-- 4. Quantas filas da fotografia nao apareceram no relatorio, sem expor nomes.
-- Nao tratar ausencia de eventos como permissao de acesso.
SELECT count(*)::bigint AS filas_sem_correspondencia
FROM public.listar_filas f
WHERE NOT EXISTS (
  SELECT 1
  FROM public.relatorio_chamadas r
  WHERE r.queuename::text = f.name::text
    AND r.init_time >= (current_date - interval '30 days')
    AND r.init_time < (current_date + interval '1 day')
);

COMMIT;
