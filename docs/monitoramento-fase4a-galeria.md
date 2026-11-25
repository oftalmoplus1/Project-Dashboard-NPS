# Monitoramento / Fase 4A — galeria e leitura segura (MVP incremental)

## Objetivo
Primeiro incremento funcional do monitoramento dos dashboards personalizados, projetado
para publicação manual, visualização em tela cheia, acesso individual, atualização dos
dados a cada 30 segundos e filtros fixos por versão publicada.

**O que esta entrega REALMENTE faz**
- Endpoint GET `/api/monitoramento`: lista somente dashboards personalizados
  publicados, com **snapshot** existente, e autorizados pelo banco.
- Endpoint GET `/api/monitoramento/:uuid`: devolve apenas a última versão
  publicada autorizada, sem consultar rascunhos nem dados operacionais.
- Galeria responsiva `/monitoramento` disponível a administradores e gestores
  autenticados, com estado vazio real (sem cartões fictícios).
- Tela cheia `/monitoramento/:uuid` com retorno à galeria, documento somente leitura,
  textos seguros, grade 12 colunas e adaptação a telas menores.
- Consulta da **versão publicada** a cada 30s (sem requests concorrentes);
  bloqueio da tela ao receber 401, 403 ou 404; alerta se não for possível
  confirmar a versão por 60 segundos.
- Banco proposto: snapshots versionados em `dashboard_catalog.editor_publicacoes`,
  RLS habilitado, sem DML direto para authenticated. Reutilização de
  `dashboard_catalog.acesso_dashboards` e `acesso_topicos` existentes.
- As funções privadas avaliam `auth.users.raw_app_meta_data.dashboard_role`
  em cada requisição, com `admin` ou `manager`. Não confiam em user_metadata.
  RPC pública é SECURITY INVOKER. Nenhum EXECUTE concedido a anon.
- Nenhuma lib adicionada, tabela de Call Center modificada ou SQL livre.

**Limitações importantes (não tratar como pronto):**
- Não há função de publicação/despublicação ou de concessão/revogação por UI nesta fase.
  A tabela nova começa vazia; não popular manualmente para uso real.
- A pré-visualização atual do Editor Visual ainda mostra placeholders. A publicação
  continua DESABILITADA até validação dos componentes reais.
- A reconsulta de 30s na Fase 4A verifica **metadados do snapshot**, NÃO dados
  operacionais. Indicadores de atualização de dados ficam para a Fase 4C.
- Apenas o tipo `text` é renderizado integralmente; gráficos não apresentam números
  artificiais. Nenhuma fonte de dados operacional é chamada por esta tela.
- O sistema de login atual aceita `admin` e `manager`; suporte a outros perfis
  de usuários autorizados exige a revisão de autenticação/RBAC em etapa própria.
- Uma versão publicada existente no banco será exibida conforme ACL mesmo que
  seu conteúdo de gráfico ainda não tenha renderer: nesses casos há aviso de
  componente indisponível, não dados inventados.

## Por que um snapshot versionado separado?
`editor_layout_rascunhos` representa o documento mutável de edição; não é
seguro servir seu JSON diretamente a quem está monitorando. O histórico versionado
separa os dois ciclos de vida, permitindo que edições futuras não alterem a
última publicação. Não é possível inferir a versão publicada lendo apenas
`dashboards.estado`.

## Especificação acordada para próximos incrementos
- Publicação manual atômica e recusada se houver componente incompleto;
  republicação só após confirmar ACL. Despublicar preserva versão histórica
  e grants cadastrados, mas corta acesso e consultas.
- Gestão individual pelo admin, usando a ACL contextual já existente;
  grants são auditados na mesma transação e revogação encerra sessões abertas
  na checagem seguinte.
- Dados reais: `listar_filas` é **snapshot mutável de coletas**, NÃO histórico.
  Não usar seus contadores para últimos 7 dias ou meses.
- `relatorio_chamadas` é candidato a históricos, mas exige homologação
  de campos, evento de chamada, fila e semântica de recebidas/atendidas/abandonadas.
- Períodos do Editor Visual: últimos 7 dias, mês atual, mês anterior, personalizado
  livre; não incluir Hoje/Ontem.
- Fila: uma/várias/todas, novas filas autorizadas entram dinamicamente
  em Todas. Fila sem chamadas mantém zero e percentual `—`.
- % atendimento = atendidas / recebidas * 100, com denominador zero => N/A.
- Ordenação por nome, recebidas, atendidas, abandonadas ou taxa em
  ambas as direções; 5/10/20/todas as filas; tabelas e barras
  verticais/horizontais. Configurações fixas no publicado.
- 30s para dados reais em monitoramento (futuro), alerta aos 60s,
  falha isolada por gráfico, ausência de dados distinta de zero.
- Pré-visualização real no editor com atualização apenas manual,
  sem afetar a versão publicada.

## Validação / implantação segura
1. Testes automáticos no CI: PostgreSQL 15.8 efêmero, cenários
   admin/gestor/grant/revogação/rascunho/legado, lint/typecheck/build.
2. Rodar **somente** `monitoramento_fase4a_preflight_PROPOSTA.sql`
   no Supabase self-hosted correto e exportar CSV. Se qualquer checagem
   falhar, interromper e investigar. Não usar o outro projeto Supabase.
3. Obter autorização específica para aplicar a migração
   `monitoramento_fase4a_publicacoes_PROPOSTA.sql`. Banco real
   **não alterado pelo GitHub ou por esta etapa de desenvolvimento**.
4. Após instalação, executar `monitoramento_fase4a_posflight_PROPOSTA.sql`
   (somente leitura). Validar sessão admin/gestor sem grant.
5. Realizar merge e deploy no Coolify somente após revisões e autorização.
   Validar regressões no Call Center.
