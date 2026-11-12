# Validacao da agregacao exata por hora

**Fase:** leitura/diagnostico. Nenhum dos comandos abaixo cria ou modifica funcoes, tabelas, roles, politicas ou dados.

## 1. Diagnosticar a RPC atual e suas permissoes

Executar no SQL Editor do **Supabase self-hosted da LigSim**, e nao em outro projeto:

```sql
SELECT
  n.nspname AS schema_funcao,
  p.proname AS funcao,
  pg_get_function_identity_arguments(p.oid) AS argumentos,
  pg_get_function_result(p.oid) AS retorno,
  p.prosecdef AS security_definer,
  p.proacl AS grants_explicitos,
  pg_get_functiondef(p.oid) AS definicao
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN (
  'dashboard_chamadas_agregadas',
  'dashboard_chamadas_por_hora'
)
ORDER BY n.nspname, p.proname;
```

Verificar também a política/estrutura de acesso da fonte:

```sql
SELECT
  n.nspname AS esquema,
  c.relname AS tabela,
  c.relrowsecurity AS rls_ativo,
  c.relforcerowsecurity AS rls_forcado
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname='public'
  AND c.relname='relatorio_chamadas';

SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'relatorio_chamadas';
```

## 2. Validar as 24 horas em um dia fechado

Altere somente a data em `parametros`. A classificação reproduz o dashboard existente: chamadas **Recebida** e status `ANSWERED`, `NO ANSWER`, `ABANDON` ou demais.

```sql
WITH parametros AS (
  SELECT DATE '2026-11-10' AS dia
), chamadas AS (
  SELECT
    id,
    EXTRACT(HOUR FROM init_time AT TIME ZONE 'America/Sao_Paulo')::int AS hora,
    disposition
  FROM public.relatorio_chamadas c
  CROSS JOIN parametros p
  WHERE c.call_direction = 'Recebida'
    AND (c.init_time AT TIME ZONE 'America/Sao_Paulo')::date = p.dia
), horas AS (
  SELECT generate_series(0,23)::int AS hora
), contagem AS (
  SELECT
    hora,
    COUNT(DISTINCT id)::bigint AS total,
    COUNT(DISTINCT id) FILTER (WHERE disposition = 'ANSWERED')::bigint AS atendidas,
    COUNT(DISTINCT id) FILTER (WHERE disposition = 'NO ANSWER')::bigint AS nao_atendidas,
    COUNT(DISTINCT id) FILTER (WHERE disposition = 'ABANDON')::bigint AS abandonadas,
    COUNT(DISTINCT id) FILTER (
      WHERE disposition IS NULL
         OR disposition NOT IN ('ANSWERED','NO ANSWER','ABANDON')
    )::bigint AS outras
  FROM chamadas
  GROUP BY hora
)
SELECT
  h.hora,
  COALESCE(c.total, 0) AS total,
  COALESCE(c.atendidas, 0) AS atendidas,
  COALESCE(c.nao_atendidas, 0) AS nao_atendidas,
  COALESCE(c.abandonadas, 0) AS abandonadas,
  COALESCE(c.outras, 0) AS outras
FROM horas h
LEFT JOIN contagem c USING (hora)
ORDER BY h.hora;
```

### 3. Conferir o total diario de forma independente

```sql
SELECT
  COUNT(DISTINCT id) AS recebidas_no_dia,
  COUNT(DISTINCT id) FILTER (WHERE disposition = 'ANSWERED') AS atendidas,
  COUNT(DISTINCT id) FILTER (WHERE disposition = 'NO ANSWER') AS nao_atendidas,
  COUNT(DISTINCT id) FILTER (WHERE disposition = 'ABANDON') AS abandonadas,
  COUNT(DISTINCT id) FILTER (
    WHERE disposition IS NULL OR disposition NOT IN ('ANSWERED','NO ANSWER','ABANDON')
  ) AS outras
FROM public.relatorio_chamadas
WHERE call_direction = 'Recebida'
  AND (init_time AT TIME ZONE 'America/Sao_Paulo')::date = DATE '2026-11-10';
```

A soma das 24 linhas da consulta anterior deve coincidir, coluna por coluna, com essa consulta.

## 4. Contrato a publicar apos revisao

A API Next.js `/api/chamadas/por-hora` espera a RPC `dashboard_chamadas_por_hora(p_inicio,p_fim)`, com resposta no formato:
`hora` (0..23), `total`, `atendidas`, `nao_atendidas`, `abandonadas`, `outras`. Os registros devem ser contagens inteiras nao negativas, e cada hora deve aparecer no maximo uma vez.

**Nao criar a RPC automaticamente:** primeiro reproduzir a estrutura de autorizacao da RPC atual, impedir acesso anonimo e retorno de registros individuais, revisar grants e RLS, conferir desempenho e comparar resultados por data e periodo. Evitar mudar a funcao existente de 2 horas: introduzir uma nova agregacao compativel, sujeita a revisao.
