# Editor Visual — Fase 3B: rascunho persistente com revisao

Data: 24/11/2026. **Proposta integrada em PR #31. Nenhuma instalacao de SQL ou deploy foi feita em producao.**

## Escopo desta etapa

A fase 3A (PR #30) entregou a tela de tres paines com componentes em memoria. Esta fase acrescenta um *documento de edicao persistente* por dashboard personalizado em estado `rascunho`, sem publicar graficos ou habilitar consultas operacionais.

**O que passa a existir quando a proposta SQL for instalada:**
- Ao abrir `/editor/dashboards/[id]`, o administrador recebe o layout salvo ou uma grade vazia com revisao 0.
- Apos editar, o aplicativo espera aproximadamente 1,1 segundo e envia o documento completo com a revisao esperada.
- O banco serializa a escrita no dashboard, valida o payload, grava todos os blocos ou nenhum e registra auditoria na mesma transacao.
- O servidor confirma a nova revisao; somente entao o editor informa que nao ha alteracoes pendentes.
- Um segundo acesso com revisao antiga recebe conflito HTTP 409. Em conflito, erro desconhecido ou falha de confirmacao, o editor bloqueia novas escritas. Nunca faz retry cego.
- Ao recarregar a pagina, um layout efetivamente salvo reaparece.

## Modelo de dados proposto

`dashboard_catalog.editor_layout_rascunhos`:
- `dashboard_id`: UUID FK para `dashboard_catalog.dashboards`, chave primaria, com CASCADE apenas do cadastro de dashboard.
- `blocos`: JSONB de configuracoes de autoracao, 0 a 40 blocos; tamanho maximo 131072 bytes.
- `revisao`: BIGINT >= 0, incremento em transacao a cada salvamento.
- `atualizado_por`: UUID do administrador autenticado.
- `atualizado_em`: TIMESTAMPTZ.

**Distincao arquitetural:** estes blocos sao o documento de edicao local do dashboard. Eles **nao sao ainda definicoes de grafico compartilhado**. A futura fase de publicacao devera converter/referenciar definicoes normalizadas (graficos unicos + vinculos por dashboard), com analise de impacto e publicacao atomica. Nao utilizar este JSONB como fonte de visualizacoes publicadas ou permissao de usuarios finais.

## API

`GET /api/editor/dashboards/[id]/layout`:
- Cookie `HttpOnly` da sessao de administrador, verificacao por Supabase Auth.
- Chama somente a RPC publica `dashboard_editor_layout_ler(uuid)`, wrapper SECURITY INVOKER de funcao privada SECURITY DEFINER.
- Retorna `{revision,blocks}` e `Cache-Control: private, no-store`. Falha se as RPCs nao estiverem instaladas.

`PUT /api/editor/dashboards/[id]/layout`:
- Mesmo controle de administrador; check de `APP_ORIGIN` / Fetch Metadata para CSRF.
- Limite de 131072 bytes e objeto estrito `{revision,blocks}`. Nao aceita SQL arbitrario nem campos extras.
- Enum fechado de oito componentes, duas fontes **candidatas**, metricas aprovaveis de forma explicita, textos limitados, grade 12x50, limites de colisoes e identificadores unicos.
- Chama `dashboard_editor_layout_salvar(uuid,bigint,jsonb)`; o SQL revalida payload e status do dashboard, faz compare-and-swap da revisao e registra auditoria.
- Mapeia `40001` para HTTP 409, `42501` para 403, `P0002` para 404 e `22023` para 400. Na ausencia de RPC ou falha imprevisivel, responde 503 sem afirmar salvamento.

## Camadas de seguranca

1. O codigo e o banco checam que o usuario e administrador; o papel e derivado de `auth.users.raw_app_meta_data`, nunca `user_metadata`.
2. As RPCs de escrita so aceitam dashboards `estado='rascunho'`, com `codigo=NULL`, `publicado_em=NULL`, e ID existente.
3. Tabela privada tem RLS ativa e nao possui GRANT direto para `anon` ou `authenticated`.
4. Funcoes privadas vivem em `dashboard_catalog` e restringem EXECUTE ao papel autenticado; wrappers publicos nao elevam privilegio.
5. Nenhum campo de registro operacional, ramal, agente ou numero de telefone e gravado.
6. Nenhuma RPC de consulta operacional ou publicacao e habilitada por esta etapa.
7. Logs de auditoria contêm apenas dashboard, revisao, quantidade de blocos e operador, nao o JSON completo.

## SQL e verificacao

- `docs/sql/editor_visual_fase3b_preflight_PROPOSTA.sql`: somente leitura; inspeciona versao, tabelas, RPCs e dependencias antes de instalar.
- `docs/sql/editor_visual_fase3b_layout_rascunho_PROPOSTA.sql`: transacao SQL de instalacao, **NAO EXECUTAR automaticamente**.
- `docs/sql/editor_visual_fase3b_posflight_PROPOSTA.sql`: somente leitura; confere 12 provas de existencia, SECURITY INVOKER/DEFINER, RLS e GRANTs.
- `tests/sql/editor-layout-assert.sql`: cria dados sinteticos no PostgreSQL temporario CI e testa manager, admin, anon, concorrencia, revisao, bloqueio de publicado, rollback, campos extras, sobreposicao, auditoria e ausencia de grants.
- `tests/smoke-visual-editor.mjs`: navegador com Supabase ficticio verifica persistencia apos recarga, bloqueio de concorrencia e negacao de acesso/CSRF.

**Precondicoes reais:** executar preflight no Supabase self-hosted correto e conferir o inventario e ownership antes da proposta de migracao. Se houver divergencia, NAO aplicar. A autorizacao anterior para migracao Fase 1 nao implica autorizacao para instalar nova Fase 3B. Deploy e migracao de producao precisam de aprovacao propria.

## Critérios de aceite

- Rascunho salvo retorna apos recarga, sem valores inventados.
- Salvar atualizado em duas abas nao perde alteracoes silenciosamente; a segunda aba recebe conflito e para.
- Manager, anon e IDs ausentes/publicados nao leem nem gravam; API e RPC verificam isso separadamente.
- CSRF, payload invalido, duracoes fora de formato e campos de SQL arbitrario sao rejeitados.
- Se SQL nao estiver instalado, a interface nao permite edicao e mostra erro de carregamento, sem falsa confirmacao.
- Lint, typecheck, build, smoke HTTP e visual e Postgres isolado passam.
- Dashboard legado e Call Center nao sao modificados.

## Exclusoes desta entrega

Sem publicacao, sem compartilhamento de graficos, sem ACL contextual para consumidores, sem visualizacoes que consultam as tabelas `listar_filas`/`relatorio_chamadas`, sem historico persistente de versoes, sem alterações no Coolify. O responsavel adiou HTTPS: manter o alerta de risco de trafego nao criptografado e limitar a exposicao ate configuracao posterior.
