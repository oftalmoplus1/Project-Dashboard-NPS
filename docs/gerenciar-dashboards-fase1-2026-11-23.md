# Administração — Gerenciar dashboards (primeira entrega)

Data: 2026-11-23

## Objetivo
Substituir a tabela demonstrativa da aba `/dashboards` por uma listagem real dos dashboards já associados a tópicos, reutilizando as rotas autenticadas e os tokens visuais do projeto.

## Escopo desta entrega
- Consulta de `GET /api/catalogo/topicos` e, para cada tópico retornado, `GET /api/catalogo/topicos/[slug]/dashboards`.
- Agregação no navegador por código estável do dashboard, sem duplicar a definição quando o mesmo dashboard aparece em vários tópicos.
- Pesquisa por nome, código e tópico; filtro por estado rascunho/publicado; totalizadores do conjunto carregado; links para abrir cada dashboard no tópico.
- Carregamento, ausência de vínculos, ausência de resultados e indisponibilidade da API com mensagens distintas.
- Sem nova dependência, SQL, tabela, migração, papel, grant ou alteração de dados operacionais.

## Limites conscientemente mantidos
- Esta é a lista de **dashboards vinculados aos tópicos acessíveis pela API**, e não o inventário completo da tabela `dashboard_catalog.dashboards`. Itens ainda sem vínculo não aparecem. Como a API atual só aceita os códigos legados registrados em `lib/dashboard-registry.ts`, o editor visual futuro necessita um contrato novo antes de cadastrar dashboards dinâmicos.
- O botão Novo dashboard fica desabilitado; criar ou publicar sem validação de fontes, ACL contextual e auditoria seria prematuro.
- Nenhuma concessão de acesso é gerada. A rota `/dashboards` permanece protegida no servidor para administradores.
- Se alguma consulta de tópico falhar, a listagem inteira fica indisponível para não sugerir que o catálogo incompleto está correto.
- Carga de todas as associações por tópico é adequada ao catálogo pequeno atual; uma API de listagem administrativa paginada será necessária quando o catálogo crescer.
- O cadastro existente de tópicos e as métricas do Call Center não foram alterados.
- A identidade visual aproveita as cores, tipografia, cartões, tabela e estados escuros já existentes.

## Aceite em homologação
1. Admin: listar um dashboard associado a dois tópicos uma só vez e mostrar ambos os links.
2. Filtrar por nome e tópico; alternar rascunho/publicado sem recarregar a página.
3. Admin: sem tópicos/vínculos, informar ausência sem inventar linhas.
4. Indisponibilidade de um endpoint: não exibir conjunto parcial como catálogo completo.
5. Gestor e usuário sem permissão: acesso direto a `/dashboards` negado pelo servidor.
6. Conferir funcionamento com tema claro/escuro e em 375, 768 e 1440 px.
7. Executar `npm run lint`, `npm run typecheck` e `npm run build`; realizar teste de navegação com Supabase simulado.

## Próximas etapas — ainda não implementadas
1. Especificar API administrativa para listar todos os dashboards, inclusive sem vínculos, com paginação.
2. Validar catálogo de fontes técnicas e modelo de gráfico/dashboard dinâmico.
3. Criar rascunho, editor visual, prévia, publicação, edição, duplicação e exclusão com avaliação de impacto e auditoria.
4. Homologar ACL contextual no Supabase self-hosted e testar revogações.

## Segurança de publicação
A branch de trabalho não é `main`. Não executar deploy, SQL ou merge automático. O commit previamente informado como produção foi `e4ee559`; a `main` consultada já estava um commit à frente. Confirmar o revision ID efetivamente implantado no Coolify antes de promover esta alteração.
