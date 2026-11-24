# Editor Visual — Fase 2A: catálogo administrativo de fontes candidatas

Data: 24/11/2026. Status: implementação inicial em PR isolado, **sem consulta a dados e sem alteração de banco**.
Dependência de produto: [especificação do MVP](https://github.com/oftalmoplus1/Project-Dashboard-NPS/pull/24).
Dependência funcional: criação de rascunhos proposta no [PR #26](https://github.com/oftalmoplus1/Project-Dashboard-NPS/pull/26), ainda não necessária para ler esta lista.

## 1. Objetivo e recorte

Abrir a primeira parte da Fase 2 com uma lista fechada de fontes candidatas para o Editor Visual, visível exclusivamente ao administrador na tela existente **Administração > Fontes de dados**.

Esta entrega NÃO habilita gráficos, não gera SQL, não grava configurações nem abre permissões de leitura. Os nomes de tabelas/colunas são metadados descritivos obtidos de inventário anterior, não entradas dinâmicas usadas para consultas.

## 2. Fontes inventariadas

| Fonte | Origem | Natureza | Tempo | Indicadores para validação |
| --- | --- | --- | --- | --- |
| Filas de atendimento | `public.listar_filas` | Fotografia da última coleta | `updated_at` é horário de atualização do registro, não histórico | `received`, `answered`, `waiting_calls`, `abandon_less_30s`, `abandon_more_30s`, `tma`, `tme` |
| Histórico de chamadas | `public.relatorio_chamadas` | Registros de eventos | `init_time` é candidato ao eixo temporal em America/Sao_Paulo | Contagem de chamadas após conferência de unicidade e granularidade dos registros |

Dimensões candidatas: `name` para filas; `disposition`, `call_direction` e `queuename` para chamadas. **Não autorizadas ainda** para execução, agrupamento ou visualização de dados.

Campos de telefone, agentes ou membros (`src`, `dst`, `agent_name`, `dstchannel`, `member`) NÃO entram como identificadores de campos disponíveis no catálogo. Os avisos podem citar esses nomes para explicar exclusões.

Métricas de duração `tma` e `tme` da `listar_filas` vêm de campos `time without time zone`; antes de implementar média ponderada ou séries, validar semântica, fuso, valores ausentes e divisão por zero. `ta` e `tet` do histórico requerem homologação conceitual e foram mantidos fora de indicadores candidatos automáticos.

## 3. Alterações

- `lib/server/editor-source-catalog.ts`: lista estática tipada, com cópia dos metadados entregue para API; nenhum método de busca ou execução SQL.
- `app/api/catalogo/fontes-editor/route.ts`: GET com sessão e papel administrador conferidos pelo Auth, `Cache-Control: private, no-store`; sem acesso a tabelas/RPCs de dados, POST não permitido.
- `components/editor-source-catalog.tsx` e CSS: tela de inventário, indicador de consultas desabilitadas e observações semânticas.
- `components/section-content.tsx`: substitui apenas o placeholder da seção `fontes`.
- `tests/smoke-editor-source-catalog.mjs`: Auth sintético, negação de anônimo/gestor, proteção contra `user_metadata` forjado, resposta fechada, nenhuma chamada a Data API e recusa de POST.
- `.github/workflows/verify.yml`: incorpora novo smoke após build.

## 4. Critérios de aceite

1. Administrador autenticado vê somente as duas fontes candidatas inventariadas.
2. Usuário anônimo recebe 401; gestor/usuário não autorizado recebe 403, inclusive por URL direta.
3. GET apresenta apenas metadados, `consultasHabilitadas=false`; nenhuma consulta de dados é executada.
4. Nenhum parâmetro de URL escolhe uma tabela, coluna ou SQL arbitrário.
5. `POST` ou alterações de catálogo não são suportadas por esta API.
6. A tela distingue snapshot de histórico e alerta sobre `updated_at`, duração e semântica de médias.
7. Rotas e renderizadores de chamadas legados permanecem intactos.
8. CI passa: testes unitários, lint, typecheck, build, smoke de catálogo administrativo e interface existente.

## 5. Condições para a próxima entrega (Fase 2B)

A consulta real de indicadores **não** deverá aceitar SQL livre, nome de tabela/coluna enviado pelo navegador ou operações matemáticas arbitrárias. Deverá:

- Utilizar apenas RPCs/consultas parametrizadas com saída agregada, revisão de custo e limites de cardinalidade.
- Confirmar semântica de cada indicador, incluindo snapshot de filas e taxas/médias ponderadas.
- Verificar a ACL contextual do dashboard publicado ou autorização de prévia do admin **em cada consulta**, não apenas na página do editor.
- Não reusar endpoints administrativos de chamadas para conceder leitura ampla a managers.
- Manter limites de período, formato de data, timezone, paginação e frequência de atualização.
- Distinguir fontes atualmente indisponíveis de resultados vazios; não exibir histórico inventado.
- Separar `rascunho` e `publicado`, com revisão e publicação posterior.
- Exigir aprovação explícita antes de alterações SQL/deploy em produção. O responsável decidiu não usar ambiente de homologação; permanecem obrigatórios testes automatizados e plano de recuperação.

## 6. Limites da evidência

O inventário das fontes foi documentado após CSV de 44 colunas e o catálogo foi confirmado em CSV complementar com sete blocos. O estado das **consultas reais e suas permissões de produção não foi verificado nesta entrega**. Por isso, as duas fontes estão classificadas como *inventariadas/candidatas*, não como consultas homologadas. A publicação de gráficos continua bloqueada.
