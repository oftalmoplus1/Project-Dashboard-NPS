# Editor Visual — Fase 0: auditoria técnica e contrato da primeira implementação

Data: 24/11/2026.
Status: **auditoria estática do repositório concluída; inventário do Supabase self-hosted pendente de resultado real**.
Escopo deste PR: documentação + SQL estritamente de leitura. Não altera aplicação, banco, permissões nem deploy.

## 1. Dependência funcional

A especificação do MVP está registrada na proposta [PR #24](https://github.com/oftalmoplus1/Project-Dashboard-NPS/pull/24) (ainda não pressuposta como aprovada ou mesclada).
O objetivo da primeira implementação será criar um dashboard personalizado em **rascunho**, associado a um tópico, com administração exclusiva, sem liberar acesso de leitura a outros perfis.

## 2. Achados verificados no código do branch `main`

| Componente | Estado observado | Impacto para o editor |
| --- | --- | --- |
| `dashboard_catalog.dashboards` (DDL versionado) | Campos `id`, `nome`, `estado`, `criado_por`, `publicado_em` e timestamps; migração posterior adiciona `codigo` nulo permitido | Base aproveitável para rascunhos, sujeito a inventário real. Ainda não há `descricao` confirmada. |
| `dashboard_catalog.topico_dashboards` (DDL versionado) | Relação N:N com posição de exibição e autoria | Reutilizar para associar rascunho ao tópico sem copiar dados operacionais. |
| `dashboard_catalog.auditoria` (DDL versionado) | Eventos administrativos com operador, alvo e contexto | Reutilizar para registrar criação/publicação, respeitando segurança e retenção. |
| `app/api/catalogo/topicos/route.ts` | Sessão obrigatória, validação da origem no POST, checagem de administrador, RPC com token do usuário | Padrão reutilizável para API administrativa de cadastro. |
| `components/manage-dashboards.tsx` | Botão `Novo dashboard` desabilitado; lista validada apenas para códigos existentes | Necessita fluxo de criação e suporte a itens dinâmicos; não habilitar botão antes da API funcionar. |
| `lib/dashboard-registry.ts` | Lista fechada de cinco códigos; `isDashboardItem` rejeita quaisquer outros | Novos dashboards exigem contrato tipado separado, preservando renderizadores legados. |
| `app/api/catalogo/dashboards/route.ts` | `GET` monta lista apenas a partir da lista fechada e falha se receber código desconhecido | Precisa passar a listar corretamente dashboards personalizados, sem falsos positivos. |
| `dashboard_catalog.listar_dashboards_topico` (SQL versionado) | Filtra `d.codigo IS NOT NULL` e retorna apenas código/nome/estado/posição | Rascunhos personalizados com `codigo` nulo ficariam invisíveis nesse contrato; criar novo contrato antes de expô-los. |
| `app/meus-dashboards/[slug]/page.tsx` | Recusa gestores; seleciona apenas `existingDashboards` | Criar novo renderizador configurável e autorização contextual antes de liberar outro perfil. |
| `components/app-shell.tsx` | Slider e conteúdo ligados ao `CallCenterView` ou `SectionContent` existente | Separar navegação/estrutura do shell do conteúdo configurável. |
| `lib/server/verify-supabase-user.ts` | Interpreta apenas `admin` e `manager` de `app_metadata` | Perfil `user` deve ser tratado somente quando autorização contextual do restante do sistema estiver pronta. |

**Limite importante:** a existência de arquivos SQL no GitHub **não prova que foram instalados** no banco self-hosted. O banco cloud vinculado a ferramentas de terceiros não é automaticamente o banco operacional desta aplicação.

## 3. Riscos de segurança e compatibilidade

1. **Não substituir a lista fechada de renderizadores legados por uma lista permissiva** sem validar a origem e o tipo do dashboard. Usar um discriminador explícito entre `legado` e `personalizado`, escolhido após o inventário.
2. Evitar que um dashboard ainda em rascunho seja tratado como `publicado` ou associado a grants automáticos.
3. Nenhuma escrita em `dashboard_catalog` deve depender apenas da role no frontend; verificar admin no servidor e novamente na RPC. Seguir `app_metadata` atual do Auth e controle transacional.
4. Os novos endpoints não podem tornar dados de `listar_filas` ou `relatorio_chamadas` acessíveis por consulta direta fora do tópico/dashboard autorizado.
5. `listar_filas` representa último snapshot, não uma série histórica. Não gerar histórico por inferência.
6. Não reaplicar scripts de estrutura antigos em produção; inventariar assinaturas atuais, constraints, RLS, grants e dependências primeiro.
7. Não habilitar visualização de dashboards personalizados por gestores antes de integrar integralmente ACL contextual em todas as APIs relevantes.
8. Há migrações de funcionalidades existentes que podem ainda depender de execução manual no self-hosted; não inferir presença apenas pelo status de commits.

## 4. Inventário que falta executar

Arquivo: `docs/sql/editor_visual_inventario_selfhosted_20261124.sql`.

Executar no **SQL Editor do Supabase self-hosted da aplicação**, em modo somente leitura, exportando cada bloco. O roteiro consulta apenas:
- existência dos objetos e das RPCs administrativas;
- estrutura de tabelas, tipos, nulabilidade, constraints e índices;
- configuração de RLS, grants e policies;
- assinaturas e visibilidade das funções, sem seus corpos;
- colunas (não registros) das fontes `listar_filas` e `relatorio_chamadas`.

Não encaminhar tokens, senhas, conteúdo de `auth.users`, IDs de usuários ou linhas operacionais. Se um bloco falhar, relatar o erro; não executar reparos por tentativa.

## 5. Contrato proposto para a Fase 1 (depende da validação do inventário)

**Interação:** botão `Novo dashboard` -> formulário com nome, descrição opcional e tópico existente -> `Criar rascunho` -> dashboard incluído na lista administrativa e associado ao tópico. A criação não concede acesso a outros usuários e não abre renderizador de gráfico inexistente.

**API prevista:** `POST /api/catalogo/dashboards` com JSON estrito e validação de `nome` (1–120 caracteres após trim), `descricao` opcional com tamanho limitado e `topico_slug` válido. Retorna ID estável (UUID) e estado `rascunho` após confirmação da escrita. Esta rota já possui GET; adicionar POST sem quebrar leitura existente.

**RPC prevista:** uma operação transacional, admin-only, que valida sessão/role no Auth e tópico existente, cadastra dashboard personalizado, vincula-o ao tópico, registra auditoria e retorna ID. Falha integral, sem cadastro órfão. Preservar nomes/assinaturas das RPCs existentes e usar nova função separada, evitando mudanças inesperadas.

**Separação de identidade:** renderizadores legados continuam sendo identificados por `codigo`; dashboards personalizados devem ter ID persistente próprio e tipo reconhecível. Detalhes de colunas/constraints dependem do estado real do banco.

**Contrato de leitura:** separar o inventário administrativo (inclui rascunhos) da navegação publicada/autorizada por contexto; adaptar validações TypeScript sem aceitar itens arbitrários. Não apresentar rascunho para consumidores sem permissão.

**Validações antes de habilitar botão:** testar admin autenticado (201 e auditoria), manager (403), anônimo (401), origem inválida (403), corpo inválido (400/415), tópico inexistente (falha segura), banco/RPC ausente (503), dupla submissão e falha intermediária transacional.

## 6. Sequência recomendada

1. **Agora:** executar somente o inventário real e confrontar os resultados com o DDL versionado.
2. Preparar migração incremental isolada do catálogo (nunca tocar nas fontes operacionais), com preflight, estratégia de recuperação e testes em homologação.
3. Implementar RPC e API de `Criar rascunho` com testes de permissão/concorrência.
4. Implementar formulário administrativo e lista com dashboards personalizados, habilitando `Novo dashboard` **somente** quando o backend estiver operacional.
5. Acrescentar editor visual, fontes seguras, publicação e autorização contextual conforme PR #24, em PRs pequenos e testados.

## 7. Estado desta entrega

- Revisão do código versionado: **concluída**.
- SQL de inventário só leitura: **preparado no GitHub**, sem execução externa.
- Schema real de produção: **não verificado nesta sessão**; depende dos resultados do SQL no self-hosted correto.
- Migrations de criação de rascunhos: **não geradas nem executadas**, até confirmação do schema.
- Código Next.js, banco de produção, integrações, CI/deploy: **inalterados nesta etapa**.
