# Correção administrativa — Call Center, CRUD de tópicos e inventário de dashboards

Data: 23/11/2026. Base: código existente em `main`. Esta alteração **não executa comandos no Supabase self-hosted** nem altera fonte operacional da LigSim.

## Diagnóstico reproduzido
- O tópico histórico usa `nome='Relatórios'` e `slug='relatorios'`. O apelido “Call Center” só era aplicado na navegação e no cabeçalho.
- A administração dos tópicos implementava GET/POST, mas não editar ou excluir.
- O inventário dos dashboards percorria somente vínculos existentes e o registro do frontend conhecia só dois códigos. O Call Center já possui cinco visualizações: Visão geral, Por mês, Por hora, Comparativo anual, TMA e TME diário. A visualização Por ramal foi removida do sistema e não deve voltar.

## Mudanças de aplicação
- Lista fechada `lib/dashboard-registry.ts` com os cinco códigos, cada um apontando à sua própria visualização já implementada (sem criar um gráfico novo).
- `GET /api/catalogo/dashboards`: apenas admin, reúne todas as cinco visualizações registradas e os vínculos reais, inclusive sem vínculo. Falha integralmente em caso de erro em qualquer fonte, sem sugerir lista parcial. Itens não vinculados têm estado `disponivel`, nunca `publicado` fictício.
- `Gerenciar Dashboards`: pesquisa, filtro de estado, contadores, links ao tópico ou à gestão de tópicos.
- `Gerenciar Tópicos`: criação existente mantida; edição de nome sem mudança de `slug`; exclusão definitiva apenas após digitar o `slug`, com aviso de impacto. A navegação é atualizada sem reload.
- Rotas `PATCH /api/catalogo/topicos/[slug]` e `DELETE /api/catalogo/topicos/[slug]`: admin-only, validação de origem e JSON, identidade confirmada via Supabase Auth, RPC com token da sessão, retorno sem informações pessoais.
- Nome “Call Center” apresentado de forma consistente para o legado `relatorios`. A correção persistente acontece quando o SQL abaixo for instalado ou quando um admin salvar a edição depois de instalar as RPCs.

## Migração manual necessária no Supabase self-hosted
1. Confirme que está no banco do aplicativo (não no `patrimind-dev`) e faça um ponto de retorno antes de executar DDL.
2. Execute as consultas **somente leitura** em `docs/sql/dashboard_catalogo_admin_validacao_20261123.sql`; confira tabelas, funções e contagem de vínculos.
3. Revise e execute **somente** `docs/sql/dashboard_catalogo_admin_crud_20261123.sql`, não os scripts antigos de instalação. A transação instala as RPCs, amplia a whitelist de vínculo para cinco códigos e normaliza o nome do tópico legado para “Call Center” se ainda for exatamente “Relatórios/Relatorios”.
4. Reexecute a validação. Confira que `slug='relatorios'`, `nome='Call Center'`, os vínculos, grants e a ordem foram mantidos. Valide edição de um tópico de teste e exclusão de um tópico descartável em homologação.
5. Teste a autorização real com contas admin e gerente: gerente/anon nunca podem editar, excluir ou chamar as RPCs de gestão. Revise registro em `dashboard_catalog.auditoria`.
6. Abra Gerenciar Tópicos, vincule as visualizações faltantes a Call Center e confira as cinco abas na navegação do tópico.

Não aplicar DDL sem homologação. **A publicação na `main` do frontend não instala automaticamente o SQL em um Supabase self-hosted**.

## Sem alteração dos dados fonte
- O slug `relatorios`, IDs, URLs, permissões existentes e vínculos não mudam quando o nome é corrigido.
- A exclusão de tópicos usa as FKs existentes para excluir somente o tópico, seus vínculos e grants; preserva as definições de dashboards, gráficos compartilhados e todos os registros operacionais de `relatorio_chamadas` e `listar_filas`.
- As novas funções de escrita trabalham em transação, verificam `auth.uid()` e o papel em `auth.users.raw_app_meta_data`, registram impacto em auditoria, e não aceitam chamadas `anon`. Nenhuma `service_role` é enviada ao navegador.
- A listagem “todas as visualizações” significa o escopo **já implementado** do Call Center. Não representa dashboards arbitrários sem renderizador. O editor visual é etapa futura.

## Verificação automatizada e manual
- `npm run lint`, `npm run typecheck`, `npm run build`.
- `node --test tests/call-center-design.test.mjs` para os cinco códigos.
- `node tests/smoke-admin-catalog.mjs` com serviço Supabase *sintético*: autenticação, duplicidade de associações, ausência de vínculo, edição, exclusão confirmada, negar acesso a gerente e resposta de RPC ausente.
- Navegação real: Call Center em Meus Dashboards e Administração, criar e editar tópico, confirmar exclusão em tópico descartável, pesquisar em Gerenciar Dashboards, verificar os cinco painéis e tema claro/escuro.
- O smoke sintético **não confirma** que a migração foi aplicada ou que a produção está atualizada.

## Reversão
- Para código: reverter o commit do recurso no Git.
- Para SQL: antes de reverter, revisar se houve edições/exclusões feitas depois da migração. Restaurar exclusões exige ponto de retorno recuperável; reversão de código NÃO restaura dados. As RPCs novas podem ser desabilitadas revogando EXECUTE somente após validar dependências; não reexecutar migrações antigas com CREATE sem IF NOT EXISTS.
