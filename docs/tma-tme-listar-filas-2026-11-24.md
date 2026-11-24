# TMA / TME da fonte listar_filas no painel Hoje

Data: 24/11/2026 | Estado: alteração de aplicação preparada, migração SQL manual pendente

## Necessidade confirmada
No painel **Call Center > Visão geral > Hoje**, os cartões TMA e TME devem usar os campos **`tma`** e **`tme`** da tabela `public.listar_filas`. A API `GET /v2/queues`, integrada pelo workflow n8n `Integration-LigSim-Supabase`, **já calcula esses tempos por fila**. O Dashboard deve calcular apenas a **média aritmética simples dos tempos médios das filas**, sem recalcular cada atendimento, sem multiplicar por atendidas e sem fazer média de textos.

## Evidência da fonte
Inspeção exclusivamente de leitura da execução n8n **9461** em 24/11/2026, nó `Split Out`, confirmou que os campos chegam como texto **`HH:MM:SS`**, por exemplo `00:04:47` e `00:00:39`. A resposta inclui filas com `answered = 0` e valores `00:00:00`; essas filas vazias não representam uma medição válida de atendimento e não entram nas médias.

## Regras
1. A base deve ser o **último lote atualizado e validado**, já selecionado pela RPC segura `dashboard_ligsim_filas_ativas`. Excluir as filas obsoletas fora da coleta.
2. Só uma fila com **`answered > 0`** e tempo preenchido no formato `HH:MM:SS` participa da média do indicador correspondente.
3. Converter cada duração para segundos e fazer `SUM(segundos) / COUNT(filas com tempo válido)`. TMA e TME têm contagens independentes.
4. Zero `00:00:00` é válido **se houve atendimento**. Ausência, string inválida e tipo inesperado **nunca viram zero artificial**. A API não deve publicar resumo com valores malformados.
5. **Não ponderar** o tempo médio da fila pela quantidade de chamadas. Esta é uma média entre filas, não a média real agregada de todas as chamadas.
6. Arredondar apenas para exibição: `mm:ss` ou `hh:mm:ss` para duração igual ou superior a uma hora.
7. Sem fila elegível, exibir `—`, não `00:00`.
8. No filtro **Hoje**, TMA e TME vêm da mesma fonte de snapshot `listar_filas` usada para os volumes. O endpoint de tempos históricos não deve ser chamado neste modo.
9. **Histórico inalterado**: Ontem, Últimos 7 dias, Este mês, Personalizado e gráfico diário de tempos continuam com RPCs existentes de `relatorio_chamadas`. Nunca interpretar o último snapshot como histórico do dia.
10. Manter autenticação admin, isolamento, checagem de coleta e segurança da RPC existente. Não publicar agentes, membros, segredos ou dados de chamadas.

## Alterações de código
- `docs/sql/dashboard_ligsim_filas_tempos_20261124.sql`: patch transacional e guardado da projeção de `tma` e `tme` como texto na RPC privada já instalada. Não altera tabela, índices, RLS, grants, n8n nem fonte operacional.
- `lib/ligsim-queue-snapshot.ts`: valida formato, calcula médias simples e quantifica filas elegíveis; resposta pública restrita a contagens, identificação de filas e duas métricas temporais, sem dados de membros.
- `components/call-dashboard.tsx`: seleciona a fonte `listar_filas` apenas em Hoje; preserva CDR para filtros históricos.
- `components/call-center-summary.tsx`: descreve corretamente a fonte e quantas filas formaram a média.
- Testes `tests/queue-snapshot.test.mjs`, `tests/smoke-http.mjs`, `tests/smoke-call-center-design.mjs`.

## Procedimento de homologação
1. No Supabase **self-hosted** do Dashboard (e não outro projeto), executar as consultas somente leitura indicadas no cabeçalho do SQL, confirmar que `tma` e `tme` existem e que a função instalada ainda preserva `auth.uid()`, papel em `raw_app_meta_data`, limite temporal e os filtros atuais de coorte. Confirmar ponto de retorno.
2. Revisar e executar **somente** `docs/sql/dashboard_ligsim_filas_tempos_20261124.sql`. Caso a definição da função divirja, o script aborta sem mudanças: não remover as guardas.
3. Verificar em sessão real admin `GET /api/chamadas/filas`: 200 com `tma`/`tme` por fila, `summary.tmaSeconds`/`summary.tmeSeconds` e contagens de filas elegíveis. Gestor 403, anônimo 401.
4. Comparar as médias com os valores `HH:MM:SS` de uma coleta fixa, excluindo filas com `answered=0`. Conferir ausência de associação a agentes, credenciais ou dados de filas antigas.
5. Publicar frontend por commit validado da `main` no Coolify e fazer refresh. Se frontend for publicado antes do SQL, os cartões podem apresentar `—` sem substituir pelos valores antigos do CDR.
6. Alternar entre Hoje e Ontem/Personalizado e conferir que a consulta histórica foi mantida. Testar falha e recuperação da fonte, card sem amostras, atualização periódica e responsividade.

## Limitações e risco residual
A média das médias por fila trata filas de 1 e de 100 atendimentos com **mesmo peso**. Se no futuro o objetivo for uma média por chamada, será necessário validar denominador e escopo dos tempos fornecidos pela API. A coorte é uma fotografia atualizada pelo n8n, não um histórico temporal. A troca não garante por si só que TMA e TME representem o mesmo universo do histórico.

## Critérios de aceite automatizados
- Tempo pré-calculado `00:02:00` e `00:04:00` em duas filas elegíveis produz TMA `03:00`; uma terceira fila com `answered=0` não dilui.
- `00:00:00` conta como zero legítimo quando `answered>0`.
- Dados ausentes resultam em `null`, sem falso zero.
- Duração malformada é recusada; resumo do navegador não pode adulterar médias.
- TMA/TME Hoje não recorre à RPC CDR; períodos históricos continuam com a função anterior.
- Sem alterações nos indicadores de abandono, cartões de volume, gráficos, RLS, permissões e n8n.
