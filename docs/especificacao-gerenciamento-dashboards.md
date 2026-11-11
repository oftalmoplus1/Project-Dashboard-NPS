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
