# Gerenciamento de dashboards — especificação viva

Status: requisitos funcionais definidos; implementação incremental em `feature/visao-geral-chamadas`. Não executar migração de banco sem inventário, backup e revisão de RLS.

## Visão do produto
Organizar visualizações em `Meus Dashboards`, com tópicos definidos por administradores, navegação por slider dentro dos tópicos e permissões individuais contextualizadas. Reutilizar dashboards e gráficos sem copiar os dados da fonte.

## Decisões confirmadas
- Menu lateral: `Meus Dashboards` (tópicos), `Administração` (só admin), `Configurações` (link direto, todos os perfis).
- Configurações: preferências pessoais para todos; configurações globais exclusivamente para admin. Tema claro/escuro persiste por usuário/navegador, sem alterar o de outros.
- Admin visualiza e gerencia todos os tópicos e dashboards e pode administrar concessões/revogações.
- Manager e usuário comum só acessam tópicos e dashboards especificamente autorizados; nenhum acesso à administração.
- A autorização é contextual: (usuário, tópico, dashboard). Conceder o mesmo dashboard em um tópico não libera outro.
- Gráficos internos herdam a autorização do dashboard; não há ACL individual por gráfico.
- Tópicos são criados apenas por admin; dashboards podem aparecer em vários tópicos, sem duplicação.
- O slider dentro de um tópico mostra somente os dashboards autorizados naquele contexto, seguindo ordem definida pelo admin.
- Ao cadastrar um gráfico, o admin pode: criar um dashboard independente (associá-lo a um tópico novo ou existente) ou inseri-lo em dashboard existente.
- Tópicos podem ser definitivamente excluídos: apagar somente tópico, vínculos e grants pertinentes. Preservar dashboards e gráficos originais.
- Dashboards podem ser desvinculados de tópicos ou excluídos definitivamente. Exclusão remove os gráficos exclusivos, preserva os compartilhados e nunca remove registros operacionais de origem.
- Gráficos compartilhados possuem definição única: edição é global, impacta todos os dashboards que usam aquele gráfico. A posição no layout pertence ao vínculo dashboard/gráfico.
- Admin pode duplicar um gráfico: nova definição independente e reutilização da mesma fonte validada, sem duplicar dados de negócio.
- Fontes são integradas e revisadas pela equipe técnica; no MVP admin não escreve SQL nem cadastra conectores arbitrários.
- Editor visual usa apenas catálogo de métricas/dimensões/filtros compatíveis e consultas validada no servidor.
- **Publicação:** novos gráficos começam obrigatoriamente como `rascunho`. Admin visualiza e testa; só ficam elegíveis para usuários comuns após publicação e concessão explícita de acesso.
- Acesso restrito por padrão para novos usuários, tópicos e dashboards; o admin não necessita grants individuais.

## Requisitos de segurança
1. Autenticar e autorizar em todas as APIs e páginas do servidor, incluindo acesso direto por URL.
2. Validar claim de função em `app_metadata` do Supabase; nunca em `user_metadata` ou apenas em estado do cliente.
3. Em cada consulta ao dashboard, verificar a tríade (usuário, tópico, dashboard), status de publicação e relações ativas. Admin tem override auditável.
4. Evitar que uma rota de dados desacoplada do contexto de tópico permita acesso lateral. Revisar todos os endpoints legados antes de liberar gerente.
5. Gravações administrativas requerem confirmação, transação, validação dos IDs e auditoria (operador, alvo, ação, timestamp e impacto), sem credenciais em logs.
6. Separar configuração do gráfico dos registros operacionais da LigSim; exclusão não remove `relatorio_chamadas` nem altera n8n.
7. Garantir capacidade de revogar acesso sem depender apenas de claims JWT atrasadas; grants devem ser consultados no banco por solicitação.
8. Bloquear por padrão quando a estrutura/consulta de permissões estiver indisponível.

## Entidades candidatas — não criar sem inventário do banco
- Tópico: id, nome, slug, ordem, autoria e timestamps.
- Dashboard: id, nome, estado rascunho/publicado, autoria e timestamps.
- Associações tópico↔dashboard: ordem de exibição por tópico.
- Gráfico: id, fonte e métrica autorizadas, configuração da visualização, estado, autoria e timestamps.
- Associações dashboard↔gráfico: layout, ordem.
- Grants usuário↔tópico↔dashboard: concessão e concedente.
- Eventos de auditoria: criação, publicação, alteração de escopo, concessão/revogação, desvinculação, exclusões.

## Plano incremental
### Fase 1 — navegação e bloqueio seguro
- Reorganizar menu; proteger administração no servidor; configuração pessoal de tema.
- Preservar chamada existente para admin como etapa de migração.
- Sem ACL no banco, não liberar manager nos endpoints operacionais.
- Verificar lint, typecheck, build e navegação por perfil.

### Fase 2 — inventário e catálogo persistente
- Levantar schemas/tabelas/policies existentes por consulta SQL somente leitura.
- Escolher nomes sem conflito, revisar DDL, políticas RLS e auditoria, testar em staging.
- Implementar APIs de leitura e gestão de tópicos/vínculos, com recusa segura por padrão.
- Configurar associação inicial dos dashboards existentes em tópico via operação administrativa explícita.
- Testar autorização cruzada por URL, revogação e auditoria.

### Fase 3 — concessões individuais
- Tela de usuário × tópico × dashboard; server-side ACL nas APIs agregadas.
- Nunca conceder automaticamente acesso a novos tópicos/dashboards.
- Testes específicos de gestor, usuário comum e admin (incluindo requests diretas).

### Fase 4 — editor visual e publicação
- Integrar catálogo fechado de fontes/indicadores/dimensões aprovado tecnicamente.
- Rascunho → prévia → validação → publicação; controlar atualização de gráficos compartilhados.
- Duplicação de gráficos, inserção em dashboards existentes e criação independente.
- Desvinculação e exclusão transacionais, com simulação de impacto e confirmação.

## Critérios de aceite iniciais
- Administração não é visível nem acessível a manager por URL direta.
- Configurações não tem dropdown, fica visível para usuários autenticados e tema persiste entre rotas.
- Operações de alteração de tópicos e permissões não estão disponíveis enquanto a migração não estiver aplicada.
- Nenhum endpoint de chamadas concede acesso a manager só por possuir role manager.
- Nenhum dashboard demonstrativo é interpretado como registro real do catálogo.
- Registros operacionais e RPCs existentes não são alterados durante fase 1.

## Pendências para implementação segura
- Inventário real do Supabase self-hosted e políticas existentes.
- Validação de papel para usuários comuns: o autenticador atual só reconhece `admin` e `manager`; exigirá extensão antes de disponibilizar o terceiro perfil.
- Plano de migração sem interrupção: avaliar grants existentes e manter ponto de retorno.
- Testes funcionais reais no banco e no deploy, além do CI.

## Resultado do inventario — 2026-11-11
O CSV da consulta unificada retornou apenas 3 funcoes em `public`:
`dashboard_chamadas_agregadas`, `dashboard_chamadas_por_hora` e `dashboard_chamadas_tempos_por_dia`.
Nao apareceram tabelas, colunas ou politicas com os nomes candidatos utilizados na busca.
**Limite:** esse inventario nao prova a inexistencia de estruturas com nomes diferentes nem valida o estado das funcoes privadas.

## Implementacao incremental da Fase 2 — em codigo, ainda nao instalada no banco
Arquivos versionados:
1. `docs/sql/dashboard_catalogo_fase2_estrutura.sql`: esquema privado isolado e tabelas `topicos`, `dashboards`, `topico_dashboards`, `acesso_topicos`, `acesso_dashboards`, `auditoria`, com FKs, indices e RLS sem politicas de acesso direto.
2. `docs/sql/dashboard_catalogo_fase2_topicos_api.sql`: RPC privada de listagem/criacao com verificacao de identidade e papel atual em `auth.users.raw_app_meta_data`, wrappers publicos `SECURITY INVOKER`, revogacao de `PUBLIC`/`anon`.
3. `docs/sql/dashboard_catalogo_fase2_validacao.sql`: consultas read-only para verificar existencia, RLS e grants.
4. `app/api/catalogo/topicos/route.ts`: GET por usuario autenticado e POST apenas para admin; sem `service_role`.
5. `components/manage-topics.tsx`: listagem e criacao com estado de indisponibilidade segura caso a RPC nao esteja instalada.

### Dependencias para ativacao
- Conferir backup testado, permissao de implantacao e homologacao em staging.
- Executar os dois scripts de instalacao, nessa ordem. Nao executar apenas o segundo.
- Validar no SQL Editor com o terceiro script e testar GET/POST com conta admin, manager, anon.
- Nao publicar o branch na producao antes de revisar a compatibilidade com o self-hosted e o fluxo de concessoes.
- Catalogo de dashboards e grants continuam sem interface de criacao; tarefas seguintes da fase 2.
- O projeto ainda nao oferece permissao a perfil de usuario comum; exige extensao do autenticador para `dashboard_role=user` com testes de regressao.

### Testes ainda pendentes
Aprovacao de lint, TypeScript e build no commit mais recente, e testes de integracao reais contra staging. A existencia dos arquivos nao equivale a instalacao do banco nem a criacao automatica de topicos.


## Fase 2 / Etapa 3 — associar dashboards existentes a topicos (2026-11-11)
**Registro de evidencias:** CSV de verificacao do topico `Relatórios` apontou slug `relatorios`, 0 associacoes, 0 grants para usuarios, 0 grants para dashboards e 1 evento de auditoria `criar`.

**Alteracoes versionadas, NAO instaladas no banco desta sessao:**
- `docs/sql/dashboard_catalogo_fase2_vincular_existentes.sql`: acrescenta identificador estavel `codigo` a `dashboards` e funcoes de listar/vincular apenas os dois renderizadores existentes. Verificacao de `auth.uid()` e papel `admin` lido do `auth.users.raw_app_meta_data`; comandos transacionais com auditoria e idempotencia.
- `docs/sql/dashboard_catalogo_fase2_vinculos_validacao.sql`: testes de existencia, grants, associacoes e auditoria.
- `lib/dashboard-registry.ts`: codigos `visao-geral-chamadas` e `tma-tme-diario`.
- `app/api/catalogo/topicos/[slug]/dashboards/route.ts`: consulta e vinculo com validacao no servidor; escrita apenas para admin.
- `components/manage-topics.tsx`: gerenciador de associacoes no detalhe de cada topico.
- `app/meus-dashboards/[slug]/page.tsx`: navega por topico usando dashboard contextual; temporariamente apenas admin ate a ACL ser integrada as APIs de chamadas.
- `components/app-shell.tsx`: itens de Meus Dashboards oriundos do catalogo e menu slider no interior do topico.

**Excecao explicitamente documentada:** os dois dashboards legados ja funcionavam/publicados antes do editor visual, portanto seu registro no catalogo pode assumir `publicado` somente apos acao administrativa explicita de vinculacao. O fluxo para **novos** graficos segue `rascunho -> revisao -> publicacao`. Nenhum vinculo cria grants para gerente ou usuario comum.

**Ativacao segura:** ambiente de homologacao + backup recuperavel + revisao do SQL; executar somente o script novo, nunca os scripts antigos da estrutura (ja instalados), validar existencia e grants, vincular pelo app e verificar auditoria. Nao unir a `main` antes de homologar as rotas e bloqueio de gerente.

**Proxima etapa:** interface de concessao individual contextual e verificacao end-to-end da autorizacao de APIs e graficos; depois editor visual de graficos e fluxo de publicacao.

## Ajuste dos cartoes operacionais — TMA, TME e abandono em fila (2026-11-11)

**Diagnostico:** os cartoes de "Visao geral de Chamadas" consultam `/api/chamadas/indicadores`, cuja RPC consolidada `public.dashboard_chamadas_tempos_e_filas(date,date)` nao figurou no ultimo inventario de funcoes publicas. A RPC diaria `dashboard_chamadas_tempos_por_dia` nao deve ser usada para calcular a media do periodo por media de medias diarias: isso criaria vies quando o numero de chamadas difere entre dias.

**Regra consolidada:**
- TMA = `AVG(ta)` em `public.relatorio_chamadas` para `disposition='ANSWERED'`, `call_direction IN ('Recebida','Efetuada')`, apenas `ta` nao nulo. Intervalo local `America/Sao_Paulo`.
- TME = `AVG(tet)` no mesmo universo; `tet` nao nulo. As medias sao calculadas separadamente e arredondadas a 2 casas somente no retorno.
- Nao incluir `Entre ramais` nessas medias.
- **Taxa de abandono em fila**: sem fonte de eventos validada, manter `null`. Nao calcular usando `ABANDON` generico. A taxa so sera homologada com entrada em fila inequívoca, separando chamadas atendidas em fila e abandonadas apos entrada em fila.
- Sem chamadas validas em um periodo, exibir estado "Sem chamadas externas atendidas" e nao `00:00` ficticio.
- Falha de RPC deve produzir HTTP 503 (ou 502 para formato invalido) em vez de sucesso 200 com valores nulos; a tela distingue falha, carregamento e ausencia real de registros.
- Até a implantacao da ACL contextual, acesso a RPC de indicadores somente para admin autenticado. Manager deve ser bloqueado inclusive por chamada direta da RPC.

**Codigo e SQL versionados:**
- `docs/sql/dashboard_chamadas_indicadores_resumo.sql`: cria/substitui SOMENTE a RPC de TMA/TME consolidados, sem alterar a RPC diaria ja homologada; acesso privado seguro e wrapper no schema `public`.
- `docs/sql/dashboard_chamadas_indicadores_resumo_validacao.sql`: preflight, grants e comparacao direta dos resultados de outubro/2026.
- `app/api/chamadas/indicadores/route.ts`: falhas sem mascaramento como HTTP 200.
- `components/call-dashboard.tsx`: mensagens diferenciadas e tempo em `mm:ss`.

**Baseline** (2026-10-01 a 2026-10-31): 6602 externas atendidas, 6597 `ta` validos, 6602 `tet` validos; TMA 177.14s (02:57), TME 124.08s (02:04). Validar em navegador admin com intervalo Personalizado e JSON da rota.

**Status:** implementacao em GitHub; RPC consolidada ainda nao confirmada/instalada no Supabase self-hosted desta conversa. Nao reexecutar o script antigo de TMA/TME diario nem mexer nas funcoes de chamadas ja funcionando.

## Indicador: Taxa de abandono em fila — descoberta e auditoria da fonte (2026-11-11)

**Objetivo:** ativar o cartão existente `Taxa de abandono em fila` na Visão geral de Chamadas, usando exclusivamente eventos que comprovem entrada na fila, abandono na fila ou atendimento na fila. Enquanto a fonte não for homologada, valor `NULL`/traço, sem estimativa.

### Fórmula de negócio proposta
`taxa = 100 * abandonos_apos_entrada_na_fila / (atendimentos_na_fila + abandonos_apos_entrada_na_fila)`.
A unidade de contagem deverá ser **ocorrência de atendimento na fila**, com evento único verificável e deduplicação, para evitar misturar eventos de transferência/reencaminhamento. Quando o denominador for zero, retornar `NULL`.

### Evidências verificadas
- Em CSV histórico da tabela `relatorio_chamadas` havia 7.316 chamadas `ABANDON`, todas com `queuename` não preenchido; o período desse levantamento não foi revalidado neste turno. Não atribuir abandonos a filas usando apenas `disposition='ABANDON'`.
- A tabela `relatorio_fila_exame` foi observada em um CSV com colunas `time, queue_name, event, src, waiting, speaking, incoming_position, phone_answer` e amostra de 10 eventos do tipo `COMPLETECALLER`/`COMPLETEAGENT`, todos da `FILA-EXAME`. Não há evidência suficiente de abandono por fila no material analisado.
- Workflow n8n ativo `Integration-LigSim-Supabase`: `GET-Relatório-Filas` chama endpoint de relatório por fila com `type=answer` e fila fixa `FILA-EXAME`; conectado a `Split Out2 -> POST-Relatório-Filas`, que envia ao Supabase `relatorio_fila_exame`.
- O nó `POST-Relatório-Filas1` foi encontrado **desconectado** do workflow ativo. Ele menciona `report_type='abandon'` e um nome de tabela diferente; não ativar nem reutilizar sem confirmar schema/contrato.
- Uma execução bem-sucedida no n8n retornou resposta com estrutura `data.reports` e 25 itens de atendimento na amostra. A coleta atual não comprova paginação nem cobertura de todas as filas.
- Detectada configuração de chave de integração diretamente em cabeçalhos de nós do n8n. Recomenda-se migrar para credenciais gerenciadas e rotacionar a chave após planejamento; nunca versionar ou exibir secrets.

### Critérios de homologação da origem
1. Descobrir e documentar o contrato dos endpoints de relatório de fila (inclusive abandono) e sua semântica real, sem supor códigos de evento.
2. Capturar **todas as filas do escopo**; quando o provedor implementar paginação, percorrer páginas até a conclusão e tratar intervalos de datas.
3. Persistir eventos com identificador natural/estável adequado (definido após analisar payload real) e ingestão idempotente, sem registrar dados pessoais desnecessários.
4. Validar classificação de pelo menos uma amostra do próprio provedor de cada classe: atendida na fila, abandonada na fila e abandono antes da fila. Verificar transferências/transbordos.
5. Conferir contagens por fila e dia contra o painel oficial LigSim; comparar somatório global com soma dos escopos sem duplicidade.
6. Aplicar `America/Sao_Paulo`, mesmos filtros de período do dashboard, retorno `NULL` com denominador zero e sem cobertura.
7. Só então criar tabela/consulta/RPC nova de eventos com acesso autenticado e ACL contextual; não ampliar privilégios legados.
8. Manter TMA/TME e gráfico diário inalterados. Cobrir testes, typecheck, build, segurança e auditoria antes de implantação.

### Entrega inicial
- `docs/sql/diagnostico_taxa_abandono_fila.sql`: consulta única, somente leitura, identifica tabelas e colunas relacionadas a filas, e agrega cobertura de nome da fila/TEF por disposição e mês (sem PII).
- Workflow e banco existentes **não foram alterados**; nenhuma taxa foi calculada nem publicada.
- Próxima decisão após resultado: confirmar fonte de eventos de abandono e escopo de todas as filas ou filas específicas, sem inventar valores.

## Regra de negocio revisada — indicador ABANDON (2026-11-11)

**Especificacao mais recente, prevalece sobre a descoberta anterior:** usuario responsavel confirmou que o status `ABANDON` no relatorio de chamadas representa clientes que sairam da fila sem atendimento e **deve entrar no calculo**.

- Universo da taxa: somente chamadas `call_direction = 'Recebida'`, no periodo selecionado em horario local de Brasilia.
- Numerador: `COUNT(*) FILTER (WHERE disposition = 'ABANDON')`.
- Denominador: `COUNT(*) FILTER (WHERE disposition IN ('ANSWERED','ABANDON'))`.
- `NO ANSWER` nao e sinonimo de abandono e fica fora do denominador. Chamadas `Efetuada`/`Entre ramais` ficam fora da taxa.
- Resultado: `100 * abandonadas / NULLIF(atendidas+abandonadas,0)`, arredondado a 2 casas; denominador zero => `NULL`, nunca `0%` artificial.
- TMA e TME **nao mudam**: seguem `AVG(ta)` e `AVG(tet)` com chamadas externas `ANSWERED` (`Recebida` + `Efetuada`).
- A autorizacao permanece admin-only por enquanto; gestores dependem da futura ACL contextual.
- Criterio de aceite pendente: conferir contagem e taxa com o relatorio oficial LigSim para o mesmo periodo, pois houve evidencias historicas de `queuename` ausente. Caso aparecam eventos `ABANDON` anteriores a entrada na fila, rever a regra imediatamente.

**Arquivos implementados:**
- `docs/sql/dashboard_chamadas_abandono_por_status.sql` — atualiza SOMENTE a funcao privada consolidada, mantendo o contrato da RPC publica e as funcoes diarias intactas.
- `docs/sql/dashboard_chamadas_abandono_por_status_validacao.sql` — consulta read-only de contagens e medias de outubro.
- `components/call-dashboard.tsx` — apresenta formula e estados honestos para a taxa.

**Ativacao:** nao executar o script legado de TMA/TME. Primeiro validar a consulta read-only e os totais no LigSim; conferir backup; aplicar o script novo em homologacao e conferir que `/api/chamadas/indicadores` exibe taxa, TMA/TME e autentica corretamente. Nao modificar workflow n8n para este calculo sem necessidade demonstrada.
