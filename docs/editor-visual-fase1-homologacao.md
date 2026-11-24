# Editor Visual — homologação da Fase 1 (criação de rascunhos)

Data: 24/11/2026. Estado: **testes de PostgreSQL isolado concluídos; homologação real de Supabase/Auth/PostgREST ainda não executada**.

## Contexto

Esta fase habilita exclusivamente **cadastro de dashboards em rascunho**. Não publica nem libera gráficos, não acessa fontes operacionais e não atribui grants. O PR de implementação é o [#26](https://github.com/oftalmoplus1/Project-Dashboard-NPS/pull/26).

A migração foi construída após inventário do PostgreSQL 15.8 do catálogo real (ver PR #25), mas **não foi aplicada** no self-hosted. O projeto conectado pelas ferramentas de Supabase nesta conversa é outro, `patrimind-dev` (Postgres 17), e não deve ser usado para esta homologação.

## Portão A — validação automatizada (GitHub Actions)

Executar os dois jobs do CI, incluindo `validar-sql-rascunhos`. O job de SQL carrega DDL de catálogo, instala a migração proposta em PostgreSQL **descartável 15.8**, testa SQLSTATE de autorização, funções/grants, criação por admin, não concessão de acesso, auditoria, rollback quando auditoria falha e duas transações concorrentes no mesmo tópico.

Os testes HTTP de `tests/smoke-dashboard-drafts.mjs` simulam Auth e PostgREST, sem usar o servidor real. **Ambos** precisam estar verdes. Isto não substitui o portão B.

## Portão B — homologação real (dependência externa)

Pré-requisitos: ambiente de homologação separado do banco de produção, conta administrativa do banco, acesso à aplicação de homologação, ponto de restauração testado e usuários de teste anon/admin/manager. Nenhum token deve ser compartilhado em mensagens, issues ou commits.

1. Identificar e registrar o endereço/ambiente, o PostgreSQL instalado e o hash do commit implantado na **homologação**. Não considerar a instância conectada `patrimind-dev` como ambiente de teste desta aplicação.
2. Executar **somente consultas de leitura** de preflight para confirmar a existência de `dashboard_catalog.dashboards`, `topicos`, `topico_dashboards` e `auditoria`; constraints de estado, coluna `codigo` e RLS/grants. Confirmar que `descricao` e as novas RPCs **ainda não existem**, para não reaplicar DDL.
3. Verificar ownership das funções SECURITY DEFINER atuais, que o papel executor da migração poderá acessar `auth.users` e escrever nas tabelas do catálogo. Se o esquema real divergir, parar para revisar, não remover checks nem conceder privilégios amplos.
4. Confirmar **backup/restore testado** e um ponto seguro de código no Git. É necessário porque a migração acrescenta coluna e funções. Não alterar o banco real sem essa verificação.
5. Aplicar **uma única vez em homologação** `docs/sql/editor_visual_fase1_criar_rascunho_20261124.sql`; registrar sucesso/erro; verificar que transação falha por completo se qualquer comando falhar.
6. Rodar pós-flight de leitura e verificar: RPCs existem; `anon` não pode executar; `authenticated` pode invocar o wrapper, mas não inserir/ler tabelas diretamente; nenhuma tabela/campo de chamadas e filas foi alterada; nenhuma policy nova foi aplicada.
7. Implantar o código do PR em homologação, **não produção**, mantendo o papel administrativo restrito.
8. Usando sessões **reais de Auth** (não via SQL Editor com `SET ROLE`), conferir:
   - Admin: GET retorna lista; formulário cria em tópico de teste, estado `rascunho`, auditoria e vínculo corretos; nenhuma permissão de leitura é concedida.
   - Gestor: GET/POST de personalizados negados (403); tentativa de chamar diretamente a RPC também negada.
   - Sem sessão e papel anon: endpoint POST retorna 401; função RPC sem grant.
   - Cross-site/Origin inválida: POST retorna 403, sem criação.
   - Topico inexistente e entradas inválidas: erro sem registros órfãos.
   - RPC ausente/indisponível (ambiente de ensaio): exibir erro e desabilitar cadastro, nunca afirmar que salvou.
9. Conferir no navegador e nos logs: dashboard criado é visível apenas no inventário de administrador, e não abre renderizador legado; os cinco dashboards do Call Center e a ingestão de chamadas e filas permanecem intactos. Não passar um rascunho para `publicado`.
10. Registrar aprovação, evidências dos testes, plano de retorno, responsáveis e eventual janela de mudança antes de considerar implementação em produção.

## Observações e riscos conhecidos

- A RPC legada `dashboard_catalogo_listar_dashboards_topico` filtra `codigo IS NOT NULL`: o rascunho personalizado fica em **listagem administrativa separada**. Não alterar a navegação pública para exibir rascunhos sem renderizador.
- A simulação local valida sintaxe e privilégios efetivos do PostgreSQL, mas não cobre JWT válido, emissor Auth, PostgREST, configuração de schema exposto, proxy Coolify nem concorrência em produção.
- Um pedido repetido após timeout HTTP pode gerar duas criações. A interface avisa para conferir a lista; deduplicação por chave de idempotência é melhoria candidata antes de fluxos mais complexos.
- O catálogo possui RLS sem políticas para usuários comuns; a função privilegiada deve **sempre** verificar `auth.users.raw_app_meta_data` e retornar apenas o necessário.
- Evitar revelar corpos de funções e conteúdo de auth.users durante testes de diagnóstico.
- Caso seja necessária reversão da aplicação, voltar ao commit anterior **não desfaz** DDL. As funções/coluna podem permanecer inertes; qualquer rollback de schema deve ser revisado com plano de preservação de dados e restauração. Não fazer `DROP COLUMN descricao` às cegas.

## Estado e responsável pelo próximo passo

A execução em PostgreSQL isolado e o CI podem ser acompanhados no PR #26. A homologação real depende de um **ambiente de teste do sistema** identificado e autorizado pelo responsável; nenhuma mudança no banco de produção é permitida antes da conclusão.
