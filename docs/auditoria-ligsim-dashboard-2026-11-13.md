# Fase 1 — auditoria LigSim e correções do Dashboard

Data: 2026-11-13  
Base: documento do solicitante `docs_correcao_dash.docx` (4 páginas) e inspeção do código atual da branch `main`.  
Status: **auditoria estática inicial**. Não houve chamada à API LigSim, execução de SQL, alteração do n8n, atualização de segredo, validação de produção ou deploy.

## 1. Fluxo encontrado

`LigSim -> n8n (ingestão periódica) -> public.relatorio_chamadas (Supabase) -> RPCs autenticadas -> rotas Next.js -> componentes`.

- `app/api/chamadas/route.ts` consulta `dashboard_chamadas_agregadas`.
- `app/api/chamadas/indicadores/route.ts` consulta `dashboard_chamadas_tempos_e_filas`.
- `app/api/chamadas/por-hora/route.ts` consulta `dashboard_chamadas_por_hora`.
- `components/call-dashboard.tsx` controla filtros, cartões, gráfico original e atualização.
- `components/call-period-charts.tsx` consolida meses a partir da RPC e já renderiza barras horizontais.
- `docs/sql/dashboard_chamadas_abandono_por_status.sql` é uma proposta SQL versionada; **sua presença no repositório não prova execução no Supabase**.

**Diretriz:** não trocar a fonte de dados nem passar a chamar diretamente LigSim antes de comparar mesma população, filtros, timestamps, status e corte de sincronização. O navegador não deve receber `integrationkey`. Segredos ficam no ambiente de servidor/Coolify. Não versionar `.env` real.

## 2. Divergências prioritárias

| ID | Documento solicitado | Implementação/documentação encontrada | Decisão/validação necessária |
| --- | --- | --- | --- |
| D-01 | Taxa = abandonadas / recebidas | `docs/sql/dashboard_chamadas_abandono_por_status.sql`: abandonadas / (atendidas + abandonadas) | Confirmar denominador: **total de recebidas** (todas as situações) como escrito no documento, ou somente ANSWERED + ABANDON conforme regra anterior. Não publicar ajuste até reconciliar. |
| D-02 | Abandonadas são clientes que saíram da fila | Código agrega `disposition='ABANDON'`; README antigo diverge ao exigir eventos específicos de fila | Confirmar correspondência operacional do status `ABANDON` com abandono em fila usando amostra real. |
| D-03 | TME usa `tef` (tempo de espera em fila) | SQL atual calcula `AVG(tet)` (espera geral); frontend rotula TME | Requer definição do universo de chamadas e disponibilidade de `tef`; não renomear `tet` sem prova. |
| D-04 | TMA soma `ta` e divide pelo número de chamadas atendidas | SQL usa `AVG(ta)` para ANSWERED de recebidas e efetuadas, descartando NULL | Confirmar se chamadas efetuadas pertencem ao cartão solicitado. Fórmula escrita como soma no documento é matematicamente ambígua; validar média aritmética. |
| D-05 | Gráfico por mês: atendidas, recebidas, abandonadas; sem categoria “Sem atendimento” | Componente `call-period-charts.tsx` usa atendidas, sem atendimento, abandonadas; exibido em barras horizontais | Trocar série e legenda sem confundir total recebido com série empilhável: recebidas incluem atendidas/abandonadas. Preferir barras agrupadas independentes, não empilhadas. |
| D-06 | Linha vertical de média no gráfico mensal | Sem linha de média em `call-period-charts.tsx` | Definir média por série e restringir meses sem histórico; linha vertical em barras horizontais. |
| D-07 | Gráfico por hora (três séries e linha média) | `/api/chamadas/por-hora` existe, porém depende da RPC operacional real | Confirmar disponibilidade/precisão de uma hora e período de análise. |
| D-08 | Comparativo anual percentual e média | Não confirmado completo na inspeção | Definir anos comparados, ano parcial e denominador de crescimento; médias coerentes com orientação do gráfico. |
| D-09 | Chamadas por ramal | Sem conexão comprovada à API `chartcallsipdst` | Validar contrato da API, autenticação e regra de ramal; acesso somente pelo backend. |
| D-10 | Retirar linha abaixo de “Período de consulta” | `call-dashboard.tsx` exibe subtítulo de fuso e parágrafo de sincronização | Especificar qual linha visual remover para não perder alerta de atualização/defasagem. |
| D-11 | Retirar tabela do gráfico “Evolução das chamadas recebidas” | `call-dashboard.tsx` mantém estado `tableOpen` | Remover somente a opção de tabela desse gráfico; não eliminar dados nem outras tabelas administrativas. |
| D-12 | Relatórios -> Call Center e reorganizar tópicos | Catálogo contém tópico `Relatórios`; documentação registra slug `relatorios` e vínculos/permissões | Migrar nome visível sem quebrar URL, autorização, vínculos e auditoria; não alterar slug sem estratégia. |
| D-13 | API LigSim em `.env` e arquivo de integração | Atualmente há fluxo n8n e rotas separadas de consulta Supabase | Definir se LigSim será fonte direta, de reconciliação ou de contingência; modularizar adaptador servidor sem expor segredo. |
| D-14 | Cartões de recebidas, atendidas e abandonadas | `call-dashboard.tsx` já apresenta totais, além de “Sem atendimento” e taxa de atendimento | Reorganizar sem excluir informações operacionais úteis antes de aprovação de layout. |

## 3. Contratos de API informados pelo documento (ainda não verificados)

- `GET /v2/reports/{month}/{year}`
- `GET /v2/reports/chartcall/{date}`
- `GET /v2/reports/chartcallsipdst/{start}/{end}`
- `GET /v2/reports/chartcallsipsrc/{start}/{end}`

Os exemplos apontam cabeçalho `integrationkey` e `Accept: application/json`. **Faltam** payloads reais, documentação do significado de cada campo, limites de chamadas, paginação, timeouts e tratamento de falhas. Não presumir formatos, não enviar credenciais para o browser e não incluir chaves em logs.

## 4. Matriz mínima de conciliação

Comparar para **um dia fechado**, **um mês fechado** e **período personalizado**:

1. Mesmo intervalo `America/Sao_Paulo` e mesmo horário de corte da última sincronização n8n.
2. Contagem de IDs operacionais distintos no Supabase versus contagem da API LigSim.
3. `Recebidas = ANSWERED + ABANDON + NO ANSWER + OUTRAS` somente se as categorias forem exclusivas e exaustivas na população selecionada.
4. Chamadas atendidas = `Recebida` com `ANSWERED`, evitando incluir transferências/etapas duplicadas.
5. Abandonadas = `Recebida` com `ABANDON` após verificação de significado operacional.
6. Taxa com denominador acordado; denominador zero deve produzir indisponível, jamais 0% artificial.
7. TMA: `SUM(ta) / COUNT(ta válido)` na população acordada; não somar duração ao número de chamadas.
8. TME de fila: `SUM(tef) / COUNT(tef válido)` na população acordada; `tet` não é substituto automático.
9. Meses futuros/sem histórico não são chamados de zero; meses correntes devem ser sinalizados como incompletos.
10. Mostrar erro de integração sem substituir valores ausentes por números fictícios.

## 5. Sequência de execução

- **1A (esta etapa):** inventário de código e documentação de divergências, sem impacto produtivo.
- **1B:** obtenção de amostras sanitizadas da LigSim e verificação, por consultas somente leitura, das RPCs/tabelas realmente instaladas.
- **1C:** decisão explícita sobre denominador, universo TMA/TME, `tef` e fonte de referência.
- **1D:** preparar mudanças pequenas em branch, com testes de unidade, integração e autorização.
- **1E:** executar `npm run lint`, `npm run typecheck` e `npm run build` em ambiente adequado e homologar comparativos.
- **1F:** revisar PR e só então considerar merge/deploy via Coolify.

## 6. Segurança e rollback

- Branch isolada; nenhum commit direto em `main`.
- Não executar SQL ou mudar o n8n até haver inventário do banco, backup recuperável, revisão RLS/grants e testes em homologação.
- Manter autenticação/autorização nas rotas Next.js.
- Não adicionar variáveis públicas `NEXT_PUBLIC_*` para segredos da LigSim.
- Registrar SHA de base e preparar rollback por commit/PR antes do merge.
- Documentar diferenças entre análise estática e testes executados.

## 7. Estado nesta auditoria

**Confirmado por código:** fluxo Supabase/n8n documentado; rotas e cálculos acima; barras horizontais já presentes no componente mensal; lógica vigente de `AVG(tet)`; proposta SQL com denominador `ANSWERED + ABANDON`.

**Não confirmado:** existência das funções no banco implantado, valores reais de API, acesso ao endpoint LigSim, estado de configuração no Coolify, execução do SQL de abandono, situação do deploy, conformidade dos números com o painel externo, testes automatizados nesta branch.

**Critério de conclusão da Fase 1:** divergências resolvidas com evidências de origem, contratos verificados, fontes e fórmulas acordadas, e plano de alterações revisado antes de editar a lógica produtiva.
