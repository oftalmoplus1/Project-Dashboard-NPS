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
