# Publicação direta em produção — Editor Visual, releases 1 e 2A

Data: 24/11/2026. **Plano de implantação, NÃO é uma implantação executada.**
Decisão do responsável: sem homologação; prosseguir com CI/testes isolados e implantação diretamente no único Supabase produtivo após checagens de recuperação e autorização de mudança.

## 1. Estado verificado antes da publicação

- Última revisão de produção **informada pelo responsável**: `e4ee559` (confirmar revisão efetiva no Coolify).
- Branch `main` do GitHub estava **dez commits à frente** desse SHA (comparação feita em 24/11/2026), com alterações em chamadas, fila `listar_filas`, componentes e APIs administrativas.
- **Não realizar deploy de `main` de forma automática ou sem revisar os dez commits intermediários**. Isso publicaria mudanças além dos dois PRs específicos do editor.
- [PR #26](https://github.com/oftalmoplus1/Project-Dashboard-NPS/pull/26): cadastro de rascunhos, API e formulário, mais uma migração de banco **ainda não executada**.
- [PR #27](https://github.com/oftalmoplus1/Project-Dashboard-NPS/pull/27): catálogo administrativo fechado de fontes **somente metadados**, sem migração ou leitura de linhas de chamadas.
- [PR #24](https://github.com/oftalmoplus1/Project-Dashboard-NPS/pull/24) e [PR #25](https://github.com/oftalmoplus1/Project-Dashboard-NPS/pull/25): especificação e auditoria, sem funcionalidades de execução.
- O Editor Visual com drag-and-drop, consulta de métricas, filtros e publicação de gráficos **não faz parte** desta liberação e **não pode** ser anunciado como pronto.

## 2. Portões obrigatórios para implantação direta

### Portão A — código e compatibilidade

- Confirmar no Coolify qual branch/tag/commit está **realmente rodando** e se qualquer atualização na `main` dispara *auto deploy*.
- Revisar a lista de alterações entre a revisão implantada e a candidata. Não considerar o commit de produção informado como verificação suficiente da instalação atual.
- Determinar um SHA de release revisado e imutável; incluir PR #26/#27 e dependências necessárias **sem publicar por acidente alterações fora do escopo**.
- Exigir CI verde **na revisão exata do release** (não apenas no HEAD antigo de cada PR).
- Registrar o SHA anterior para rollback de aplicação e proteger alterações com branch/PR rastreável.

### Portão B — banco de dados

- Confirmar que o endereço do banco é o **Supabase self-hosted usado pelo Dashboard**, não o projeto cloud `patrimind-dev`.
- Confirmar um **backup recuperável e restaurável**, com quem executará a restauração se a mudança falhar. Não exigir novo servidor de homologação, mas não omitir um ponto de recuperação para a única instância produtiva.
- Executar `docs/sql/editor_visual_fase1_preflight_producao_20261124.sql` (somente SELECTs). Conferir inventário e invariantes existentes; divergência bloqueia migração.
- Revisar o SQL `docs/sql/editor_visual_fase1_criar_rascunho_20261124.sql`: só muda `dashboard_catalog.dashboards` e adiciona RPCs; não altera `relatorio_chamadas`, `listar_filas` ou ingestão n8n.
- O SQL contém `BEGIN/COMMIT`, mas o `NOTIFY pgrst` posterior é operacional; verificar se PostgREST está disponível.
- Verificar proprietário da função privilegiada, o acesso real a `auth.users`, e os grants do schema privado. Não habilitar acesso direto às tabelas, não incluir `service_role` no frontend.
- Se a migração ou configuração diferir do inventário, **interromper**. Não adaptar SQL diretamente no console de produção por tentativa/erro.

### Portão C — sequência de disponibilização

1. Selecionar e revisar SHA de release; garantir que apenas alterações autorizadas estejam nele.
2. Capturar backup/estado atual e registrar resultado do preflight read-only.
3. Implantar código compatível, com sessão/revisões de autorização íntegras. A tela de rascunho fica **bloqueada** enquanto novas RPCs não existirem; o catálogo de fontes é só metadados.
4. Aplicar a migração transacional **uma única vez** no banco correto, conforme procedimento revisado.
5. Verificar consulta de integridade pós-migração (RPCs, grants, coluna, RLS), sem expor dados de origem.
6. Smoke manual de usuário **administrador**: criar um rascunho em tópico descartável, verificar auditoria e associação, sem publicar nem conceder acesso. Verificar lista após POST.
7. Smoke de **gestor e não autenticado**: administração e funções não podem ser acessadas indevidamente. A verificação deve usar sessões reais sem compartilhar os tokens.
8. Smoke de operações existentes: `/chamadas`, gráficos horário/anuais, fila `listar_filas`, tópicos, vínculos, autenticação, n8n e logs; comparar valores conhecidos antes e depois da mudança.
9. Se qualquer autorização, métrica existente ou ingestão sofrer regressão, interromper a implantação e iniciar plano de recuperação.

### Portão D — retorno

- **Aplicação:** voltar a imagem/commit anterior no Coolify e verificar a navegação/API legadas.
- **Banco:** retornar o código **não desfaz** colunas ou funções. Se o código antigo não usa as novas funções, pode ser mais seguro mantê-las inertes e reverter apenas a aplicação. Qualquer DROP ou restauração requer revisão dos dados criados após a implantação, risco de perda de dados e plano explícito.
- **Falha intermediária:** guardar logs de SQL/HTTP sem credenciais. Não repetir cegamente a migração ou o POST, pois chamadas repetidas podem criar rascunhos duplicados.
- O teste PostgreSQL em GitHub Actions e os mocks de API **não substituem** o teste com Auth e PostgREST de produção, motivo pelo qual o risco residual deve ser aceito conscientemente.

## 3. Bloqueios atuais

- Não há acesso conectado ao **Coolify** ou à instância **Supabase self-hosted** neste ambiente de ChatGPT; a conexão Supabase disponível aponta para **outro projeto**. Não usar essa conexão.
- Não foi possível verificar aqui o commit ativo no Coolify nem seu gatilho de deploy automático.
- Não há comprovação nesta sessão de backup/restauração recuperável para a única instância produtiva.
- PRs #26 e #27 ainda estão separados, em rascunho, e `main` diverge do último SHA produtivo informado. Não acionar merge e deploy sem resolver a diferença de escopo.

## 4. Estado da tarefa

A publicação direta **foi solicitada**, mas **nenhuma implantação/SQL de produção foi executada por este plano**. O próximo ato operacional depende de confirmar os portões A e B, em especial o SHA real implantado no Coolify e um ponto de recuperação.
