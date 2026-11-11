-- TMA / TME — VALIDACAO SOMENTE LEITURA
-- Pode ser executado antes ou depois de instalar a RPC consolidada.
-- NAO grava dados nem altera funcoes, permissoes ou registros.

-- 1. Verificar existencia e permissoes da nova RPC sem assumir que ja exista.
WITH funcoes AS (
 SELECT
  to_regprocedure(
   'public.dashboard_chamadas_tempos_e_filas(date,date)'
  ) AS publica,
  to_regprocedure(
   'dashboard_private.chamadas_tempos_e_filas(date,date)'
  ) AS privada
)
SELECT
 publica IS NOT NULL AS rpc_publica_existe,
 privada IS NOT NULL AS rpc_privada_existe,
 CASE WHEN publica IS NULL THEN NULL
  ELSE has_function_privilege('anon', publica, 'EXECUTE')
 END AS anon_pode_executar,
 CASE WHEN publica IS NULL THEN NULL
  ELSE has_function_privilege('authenticated', publica, 'EXECUTE')
 END AS autenticado_pode_executar
FROM funcoes;

-- 2. Comparacao direta com os dados operacionais, horario de Brasilia.
-- Outubro/2026 previamente validado:
-- TMA=177.14 segundos; TME=124.08 segundos;
-- chamadas externas atendidas=6602; TA valido=6597; TET valido=6602.
SELECT
 COUNT(*) AS chamadas_externas_atendidas,
 COUNT(ta) AS registros_ta_validos,
 COUNT(tet) AS registros_tet_validos,
 ROUND(AVG(ta)::numeric, 2) AS tma_segundos,
 ROUND(AVG(tet)::numeric, 2) AS tme_segundos
FROM public.relatorio_chamadas
WHERE disposition='ANSWERED'
  AND call_direction IN ('Recebida','Efetuada')
  AND init_time >= (
   '2026-10-01'::timestamp AT TIME ZONE 'America/Sao_Paulo'
  )
  AND init_time < (
   '2026-11-01'::timestamp AT TIME ZONE 'America/Sao_Paulo'
  );

-- 3. Depois de instalar a RPC e autenticar como admin no aplicativo:
-- http://localhost:3000/api/chamadas/indicadores?start=2026-10-01&end=2026-10-31
-- Esperado: status=ready, metrics.tma_segundos=177.14,
--           metrics.tme_segundos=124.08, taxa_abandono_fila=null.
-- Teste manager: POST na RPC deve ser negado ate ACL contextual estar pronta.
-- Teste anon: nao deve conseguir executar.
