# Editor Visual — Fase 3A: construtor de layout em três painéis

Data: 24/11/2026. Estado: **primeira implementação de interface; não implantada em produção**.

## Escopo implementado

O editor está disponível exclusivamente para administradores que abram um cadastro personalizado **já existente e em estado rascunho**. O ponto de entrada é `Administração → Gerenciar dashboards → Cadastros personalizados → Abrir editor experimental`. Os dashboards legados continuam usando o renderizador existente.

A rota `/editor/dashboards/[id]` verifica:
1. Sessão Supabase Auth válida, com papel `admin` em `app_metadata.dashboard_role`.
2. UUID corretamente formatado.
3. Existência de rascunho com esse UUID na RPC administrativa protegida `dashboard_catalogo_listar_personalizados`.
4. Estado `rascunho` (dashboards publicados não passam por esse editor experimental).

A página não usa `service_role`, não libera acesso direto às tabelas privadas e não executa consultas de dados. Erros do catálogo não são interpretados como rascunhos válidos.

### Interface

- Barra superior: nome e tópico do rascunho, controles de desfazer, refazer, pré-visualizar, salvar e publicar.
- Painel esquerdo: 8 tipos de componente — cartão KPI, linhas, barras, área, pizza, rosca, tabela e texto. Adição pelo clique ou arrastar.
- Canvas central: 12 colunas, posicionamento por arrastar e soltar, seleção, redimensionamento por alça e limite de 40 componentes; não permite sobreposição.
- Painel direito: título, texto estático, fonte/indicador *candidato*, orientação de barras, dimensões e movimentação por botões acessíveis.
- Desfazer/refazer com histórico de até 50 ações e pré-visualização que oculta os painéis de edição.
- Layout para edição no computador; em telas menores, exibição compacta não editável com aviso apropriado.
- Componentes não exibem dados inventados: utilizam placeholders explícitos, sem consultas ao Supabase de chamadas.

## Limites obrigatórios desta fatia

**Não existe persistência do layout nesta entrega.** O backend já permite cadastro de rascunho, mas **não** armazenar blocos do editor. Portanto:
- Todos os blocos e configurações existem apenas na memória da aba enquanto ela permanece aberta.
- Os controles `Salvar` e `Publicar` ficam **desabilitados** e com explicação. O editor mostra aviso de dados não salvos e alerta ao tentar recarregar a página.
- Não há salvamento automático, sincronização entre sessões, compartilhamento de gráficos, publicação, histórico persistente, nem consultas/configurações de filtros.
- `listar_filas` e `relatorio_chamadas` são opções de configuração **candidatas**, não fontes liberadas para qualquer gráfico. A API `/api/catalogo/fontes-editor` permanece com `consultasHabilitadas=false`.
- Nenhuma alteração em RLS, tabelas, funções SQL, Supabase self-hosted, Coolify, n8n ou produção neste PR.
- A prévia de indicadores agregados por `listar_filas` do PR #29 é independente e não foi adicionada automaticamente a esta branch.

Essas limitações impedem que uma prévia de layout seja confundida com publicação operacional.

## Arquivos envolvidos

- `lib/editor-visual-layout.ts` — modelos, dimensões iniciais, ocupação de grade, prevenção de colisões, posições, atualização imutável dos blocos.
- `app/editor/dashboards/[id]/page.tsx` — autorização na renderização server-side e verificação do rascunho no catálogo.
- `components/dashboard-visual-editor.tsx` e CSS — três painéis, interações locais e estados de indisponibilidade.
- `components/manage-dashboard-drafts.tsx` — link seguro para o editor experimental.
- `tests/smoke-visual-editor.mjs` — navegador isolado: anonimato, manager com user_metadata adulterado, rascunho ausente/publicado, edição local, oito tipos, ausência de sobreposição, controles desabilitados, undo/redo, ausência de escrita.
- `.github/workflows/verify.yml` — executa o novo smoke com Playwright já instalado para os testes existentes.

## Critérios de aceite

1. A URL direta não concede acesso a anônimo, gestor ou usuário sem rascunho autorizado.
2. Oito componentes disponíveis; nenhum componente novo se sobrepõe a outro.
3. O administrador adiciona, move, redimensiona, seleciona, edita e remove blocos; desfazer/refazer reconstitui alterações.
4. Sem fonte real aprovada, nenhum bloco inventa valores.
5. O botão salvar/publicar é indisponível e o aviso de ausência de persistência é inequívoco.
6. Nenhuma tabela operacional é consultada, nenhum SQL arbitrário é possível e nenhuma mutação é enviada ao Supabase.
7. O renderizador legado e o CRUD administrativo existente não sofrem regressão.
8. CI com lint, typecheck, build e testes de interface/cadastro/segurança aprovados antes de integração.

## Próxima entrega planejada: Fase 3B

Implementar salvamento automático REAL com estado de revisão e concorrência, preservando a publicação existente. Antes de modificar o banco:
1. Revisar o schema instalado e os RPCs realmente aplicados no Supabase self-hosted.
2. Desenhar entidade `definicao_grafico` e vínculo `dashboard_grafico` (ou equivalentes apropriados após inventário), com definição compartilhada e layout próprio do dashboard.
3. Manter rascunho e publicado distintos, preparar transações e auditoria e impedir qualquer publicação parcial.
4. Criar API/RPC admin-only com validação estrita de todos os tipos, limites, posições, fontes, métricas e IDs; versionar para impedir sobrescrita silenciosa por outra aba.
5. Executar testes locais/CI e pré-verificações read-only antes de pedir aprovação específica da instalação em produção.
6. Somente depois habilitar o salvamento automático do editor; não simular sucesso com dados só de navegador.

## Segurança operacional separada

O proprietário decidiu adiar HTTPS. A ausência de TLS permanece um risco de interceptação de credenciais e dados em trânsito; o editor NÃO corrige esse risco. Não alterar o Coolify ou `APP_ORIGIN` nesta entrega.
