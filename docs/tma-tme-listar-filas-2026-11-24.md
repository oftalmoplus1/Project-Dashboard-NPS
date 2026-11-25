# TMA / TME da fonte listar_filas no painel Hoje

Data: 24/11/2026 | Regra TME revisada em 25/11/2026 | Instalação da projeção SQL deve ser verificada no Supabase correto.

## Necessidade confirmada
No painel **Call Center > Visão geral > Hoje**, os cartões TMA e TME devem usar os campos **`tma`** e **`tme`** da tabela `public.listar_filas`. A API `GET /v2/queues`, integrada pelo workflow n8n `Integration-LigSim-Supabase`, **já calcula esses tempos por fila**. Por decisão de produto em 25/11/2026, o **TMA permanece como média simples entre filas**, mas o **TME de Hoje é ponderado pelas chamadas atendidas**: `SUM(tme_segundos_fila * answered_fila) / SUM(answered_fila)`, considerando apenas filas com TME válido e `answered > 0`. Não inferir histórico individual da fotografia de filas.

## Evidência da fonte
Inspeção exclusivamente de leitura da execução n8n **9461** em 24/11/2026, nó `Split Out`, confirmou que os campos chegam como texto **`HH:MM:SS`**, por exemplo `00:04:47` e `00:00:39`. A resposta inclui filas com `answered = 0` e valores `00:00:00`; essas filas vazias não representam uma medição válida de atendimento e não entram nas médias.

## Regras
1. A base deve ser o **último lote atualizado e validado**, já selecionado pela RPC segura `dashboard_ligsim_filas_ativas`. Excluir as filas obsoletas fora da coleta.
2. Só uma fila com **`answered > 0`** e tempo preenchido no formato `HH:MM:SS` participa da média do indicador correspondente.
3. Converter as durações para segundos. **TMA:** `SUM(tma_segundos_fila) / COUNT(filas com TMA válido e answered > 0)` (média simples preservada). **TME:** `SUM(tme_segundos_fila * answered_fila) / SUM(answered_fila)` nas filas com TME válido e `answered > 0` (média ponderada). Cada indicador considera suas próprias filas elegíveis.
4. Zero `00:00:00` é válido **se houve atendimento**. Ausência, string inválida e tipo inesperado **nunca viram zero artificial**. A API não deve publicar resumo com valores malformados.
5. **Ponderar somente TME** pelo número de chamadas atendidas (`answered`) da própria fila. Filas sem TME válido ou sem atendimentos não compõem o numerador nem o denominador. O TMA continua sem ponderação. Rejeitar produtos e somas fora dos limites de precisão numérica.
6. Arredondar apenas para exibição: `mm:ss` ou `hh:mm:ss` para duração igual ou superior a uma hora.
7. Sem fila elegível, exibir `—`, não `00:00`.
8. No filtro **Hoje**, TMA e TME vêm da mesma fonte de snapshot `listar_filas` usada para os volumes. O endpoint de tempos históricos não deve ser chamado neste modo.
9. **Histórico inalterado**: Ontem, Últimos 7 dias, Este mês, Personalizado e gráfico diário de tempos continuam com RPCs existentes de `relatorio_chamadas`. Nunca interpretar o último snapshot como histórico do dia.
10. Manter autenticação admin, isolamento, checagem de coleta e segurança da RPC existente. Não publicar agentes, membros, segredos ou dados de chamadas.

## Alterações de código
- `docs/sql/dashboard_ligsim_filas_tempos_20261124.sql`: patch transacional e guardado da projeção de `tma` e `tme` como texto na RPC privada já instalada. Não altera tabela, índices, RLS, grants, n8n nem fonte operacional.
- `lib/ligsim-queue-snapshot.ts`: valida formato, mantém TMA simples, calcula TME ponderado por atendidas e quantifica filas elegíveis; resposta pública restrita a contagens, identificação de filas e duas métricas temporais, sem dados de membros.
- `components/call-dashboard.tsx`: seleciona a fonte `listar_filas` apenas em Hoje; preserva CDR para filtros históricos.
- `components/call-center-summary.tsx`: descreve corretamente a fonte e quantas filas formaram a média.
- Testes `tests/queue-snapshot.test.mjs`, `tests/smoke-http.mjs`, `tests/smoke-call-center-design.mjs`.

## Procedimento de homologação
1. No Supabase **self-hosted** do Dashboard (e não outro projeto), executar as consultas somente leitura indicadas no cabeçalho do SQL, confirmar que `tma` e `tme` existem e que a função instalada ainda preserva `auth.uid()`, papel em `raw_app_meta_data`, limite temporal e os filtros atuais de coorte. Confirmar ponto de retorno.
2. Revisar e executar **somente** `docs/sql/dashboard_ligsim_filas_tempos_20261124.sql`. Caso a definição da função divirja, o script aborta sem mudanças: não remover as guardas.
3. Verificar em sessão real admin `GET /api/chamadas/filas`: 200 com `tma`/`tme` por fila, `summary.tmaSeconds`/`summary.tmeSeconds` e contagens de filas elegíveis. Gestor 403, anônimo 401.
4. Comparar TMA simples e TME ponderado com `HH:MM:SS` e `answered` de uma coleta fixa, excluindo filas sem atendimento e tempos ausentes. Conferir ausência de associação a agentes, credenciais ou dados de filas antigas.
5. Publicar frontend por commit validado da `main` no Coolify e fazer refresh. Se frontend for publicado antes do SQL, os cartões podem apresentar `—` sem substituir pelos valores antigos do CDR.
6. Alternar entre Hoje e Ontem/Personalizado e conferir que a consulta histórica foi mantida. Testar falha e recuperação da fonte, card sem amostras, atualização periódica e responsividade.

## Limitações e risco residual
O TME ponderado é uma **estimativa** com base nos tempos médios já fornecidos pela LigSim. Pode divergir do TME sobre eventos individuais, caso `tme` da API tenha denominador diferente de `answered` ou tempos já arredondados. A amostra verificada com oito filas e 186 atendimentos resulta em `01:02` arredondado. Para calcular TME real por chamada, será necessário validar os eventos e a semântica da fonte. O TMA permanece média simples; o snapshot não é histórico consolidado.

## Critérios de aceite automatizados
- Tempo pré-calculado `00:02:00` e `00:04:00` em duas filas elegíveis produz TMA `03:00`; uma terceira fila com `answered=0` não dilui.
- TME `00:01:00` com 30 atendidas e `00:03:00` com uma atendida deve resultar aproximadamente `01:04`, não `02:00`.
- Oito filas com 186 atendidas e 11.589 segundos ponderados resultam em `01:02` arredondado.
- `00:00:00` conta como zero legítimo quando `answered>0`.
- Dados ausentes resultam em `null`, sem falso zero.
- Duração malformada é recusada; resumo do navegador não pode adulterar médias.
- TMA/TME Hoje não recorre à RPC CDR; períodos históricos continuam com a função anterior.
- Sem alterações nos indicadores de abandono, cartões de volume, gráficos, RLS, permissões e n8n.
