# Editor Visual de Dashboards — especificação funcional do MVP

Data: 24/11/2026. Status: **decisões funcionais confirmadas; implementação técnica ainda não iniciada neste documento**.
Escopo: novos dashboards personalizados na área `Administração > Gerenciar Dashboards`. Preservar os dashboards legados, APIs e dados operacionais em produção.

## 1. Objetivo e usuários

Permitir que administradores criem dashboards personalizados sem programação, usando fontes de dados autorizadas do Supabase, com controles de segurança, rascunho e publicação. Gerentes e usuários comuns visualizam apenas dashboards explicitamente autorizados no contexto do tópico; não editam dashboards nem filtros. O modelo de concessão continua contextual: usuário + tópico + dashboard. Publicar **não** concede acesso automaticamente.

## 2. Funcionalidades confirmadas para o MVP

1. Criar dashboards com nome, descrição e associação a tópico permitido. Iniciar sempre como rascunho.
2. Editor de computador em tela única: catálogo à esquerda, área editável ao centro e propriedades do item selecionado à direita.
3. Catálogo de componentes: cartão KPI, linhas, barras horizontais/verticais, área, pizza, rosca, tabela e texto.
4. Arrastar e redimensionar componentes em grade com alinhamento e sem sobreposição. Posições e dimensões pertencem à associação dashboard/gráfico. Incluir desfazer/refazer no estado da sessão.
5. Cada gráfico utiliza **uma fonte autorizada**; o dashboard pode conter gráficos de diferentes fontes.
6. Fontes iniciais candidatas: `relatorio_chamadas` (histórico) e `listar_filas` (última coleta). Outras fontes Supabase entram no catálogo após validação técnica. Não disponibilizar tabelas automaticamente só por existirem no banco.
7. Fontes e campos são selecionados de catálogo controlado. Métricas: indicadores homologados e operações compatíveis de contagem, soma, média, mínimo e máximo. Não oferecer SQL livre, junções arbitrárias ou fórmulas personalizadas.
8. **Somente filtros individuais por gráfico**. Apenas administrador configura os filtros no editor; consumidores autorizados visualizam resultados sem alterar filtros. Períodos dinâmicos e intervalos de data fixos em fontes que tenham suporte temporal; usar `America/Sao_Paulo`. A fonte `listar_filas` não oferece histórico artificial.
9. Ao abrir o dashboard, carregar dados disponíveis. Atualização automática por frequência aprovada da fonte e atualização manual sob limites de carga. Diferenciar horário de consulta do horário de atualização real da origem; indicar dado desatualizado/erro e preservar último valor válido de forma identificável.
10. Editor somente no computador. No celular, visualização responsiva e somente leitura.
11. Rascunhos são salvos automaticamente com estados visíveis: salvando, salvo, erro. Uma falha nunca deve ser comunicada como sucesso.
12. A publicação é explícita, restrita a administradores e requer revisão/prévia. Alterações no rascunho não afetam o conteúdo publicado. Sem histórico e restauração de versões no MVP.
13. Remover um gráfico de um dashboard **somente desvincula** a definição, preservando-a no catálogo e nos demais dashboards.
14. Um gráfico compartilhado tem **definição única**; sua edição é global e pode afetar todos os dashboards que o utilizam, sem modificar o layout independente em cada dashboard.
15. Antes de publicar alteração de gráfico compartilhado, mostrar todos os dashboards impactados, validar a nova configuração e solicitar confirmação. Publicar simultaneamente para todos os dashboards afetados, em operação atômica; não publicar outros rascunhos pendentes desses dashboards.

## 3. Fluxo de criação

Administrador -> Novo dashboard -> informa nome/descrição/tópico -> cria rascunho -> adiciona componentes -> seleciona fontes, métricas e filtros individuais -> organiza layout -> salvamento automático -> prévia -> validação -> confirmação explícita de publicação -> dashboard disponível **somente** para perfis que possuam grants adequados.

A configuração de cada gráfico pode ser reutilizada em vários dashboards sem duplicação de dados de negócio.

## 4. Fluxo de alteração compartilhada e publicação atômica

1. Administrador edita a definição de um gráfico compartilhado. O autosave persiste apenas a configuração pendente, sem alterar a configuração publicada.
2. O sistema localiza todos os dashboards que usam a definição e apresenta impacto, incluindo os publicados e os ainda em rascunho.
3. Antes da confirmação, o servidor valida fonte/colunas/métricas/filtros, compatibilidade, privilégios, estado dos vínculos e eventuais edições concorrentes.
4. Um único comando transacional no banco publica **a definição comum** de modo que todas as leituras subsequentes dos dashboards publicados passem a usar a nova configuração ao mesmo tempo. Não efetivar parte da operação em caso de falha. A revisão e confirmação referem-se explicitamente a todos os dashboards afetados.
5. Não incluir automaticamente nas mudanças publicadas alterações de layout, filtros de outros gráficos ou rascunhos independentes de dashboards afetados.
6. Manter auditoria do administrador, definição, escopo impactado, resultado e data, sem conteúdo sensível. Um erro preserva a configuração publicada anterior.

**Nota de implementação:** "atômica" significa uma transação consistente na publicação da definição compartilhada, não um mecanismo de histórico de versões. Uma representação técnica possível é manter somente as configurações `rascunho` e `publicada` da definição compartilhada e trocar a configuração publicada sob uma transação. A escolha de tabelas/colunas será feita apenas após inventário real do banco. Se as visualizações consultarem APIs em solicitações separadas, considerar controle de revisão da configuração para evitar telas com resultados inconsistentes durante a troca.

## 5. Regras de segurança e integridade

- Autenticar e autorizar em **cada** página, API, RPC e consulta. Somente admin edita e publica; consumidores verificam grant contextual e status publicado no servidor. Bloquear quando a ACL estiver indisponível.
- Validar função usando `app_metadata`, nunca `user_metadata` ou estado do cliente. Não expor secrets ou `service_role` no navegador.
- Usar catálogo de fontes/colunas/indicadores previamente aprovados; validar tipos, agregações, filtros, limites de linhas, frequência e custo no servidor. Não interpolar identificadores SQL provenientes diretamente do cliente.
- Preservar RLS, revogações e princípios de menor privilégio. Nenhuma permissão será concedida automaticamente a partir da publicação.
- Não modificar registros de `relatorio_chamadas`, `listar_filas`, n8n, seus processos de ingestão ou RPCs legadas durante a construção do editor.
- Validar e registrar autoria, concorrência (evitar edição silenciosamente sobrescrita), erros, auditoria de publicação e desvinculação.
- Um gráfico pode ser reutilizado entre dashboards, mas seu acesso à consulta não pode ser ampliado só pelo compartilhamento. Bloquear consulta direta de dados sem contexto autorizado.
- Para métricas pré-agregadas e taxas, evitar cálculos semanticamente errados (como média de médias sem ponderação válida ou soma de percentuais). Revisar cada indicador homologado.
- Campos sensíveis, pessoais ou desnecessários não devem integrar o catálogo de maneira automática.

## 6. Critérios mínimos de aceite

- Um admin cria dashboard rascunho, adiciona ao menos um componente de cada tipo previsto, configura uma fonte aprovada, salva automaticamente e reabre sem perder layout/filtros.
- Um usuário não admin não consegue editar/publicar nem chamar as rotas administrativas diretamente. Usuário sem grant não acessa dados por URL ou RPC.
- Editar rascunho de dashboard já publicado não muda a visualização pública até publicação explícita.
- Remover um gráfico do dashboard não apaga sua definição nem dados de origem; outros dashboards continuam funcionando.
- Editar definição compartilhada identifica todos os consumidores, solicita confirmação e publica consistentemente para todos. Simulação de falha aborta tudo, sem publicação parcial.
- Publicar um gráfico compartilhado não publica rascunhos não relacionados; os respectivos layouts continuam independentes.
- Períodos dinâmicos se movem com o calendário no fuso correto; datas fixas permanecem constantes; fontes sem histórico não mostram períodos históricos fictícios.
- Atualizações manual e automática respeitam a frequência configurada; erros e dados desatualizados são sinalizados.
- Editor desktop funciona; visualização no celular reorganiza componentes sem alterar o layout persistido.
- Lint, typecheck, build, testes unitários, integração de APIs/RPCs, autorização cruzada e smoke tests passam antes de merge/deploy.

## 7. Fora do MVP

- Histórico/consulta/restauração de publicações anteriores.
- Fórmulas personalizadas.
- Junção de múltiplas fontes no mesmo gráfico.
- Editor de arrastar/redimensionar no celular.
- Cadastro irrestrito de fontes, SQL livre ou conexões externas arbitrárias.
- Filtros globais ou filtros interativos editáveis por consumidores.

## 8. Plano de implementação incremental (proposto)

**Fase 0 — Inventário e desenho técnico.** Inspecionar estrutura real do `dashboard_catalog` e APIs no Supabase self-hosted correto, catalogar fontes autorizáveis, revisar permissões/RLS e preparar migrações e plano de retorno. Não executar SQL de instalação no projeto errado; não presumir que scripts versionados estejam aplicados.

**Fase 1 — Cadastro e rascunhos.** Fluxo `Novo dashboard`, nome/descrição/tópico, salvamento persistente, estado rascunho e autorização admin. Preservar catálogo e dashboards legados.

**Fase 2 — Catálogo de fontes e consultas seguras.** Seleção fechada de fontes, métricas e filtros individuais, consultas parametrizadas e testes de compatibilidade, desempenho e segurança.

**Fase 3 — Editor e visualizações.** Três painéis, oito componentes, drag-and-drop, redimensionamento, prévia, estados de erro, desfazer/refazer e responsividade de leitura.

**Fase 4 — Publicação e acesso.** Separar rascunho/publicado, validar prévia, publicar sob confirmação, integrar grants contextuais, atualização manual/automática, auditoria.

**Fase 5 — Reutilização e publicação compartilhada.** Catálogo de gráficos, desvinculação sem exclusão, detecção de impactos, validação global e troca atômica de definição compartilhada sem publicar rascunhos alheios.

Cada fase exige revisão do repositório, alterações pequenas em branch, CI, testes de regressão e validação em homologação antes de produção. Não realizar migrações nem deploy sem confirmação das dependências relevantes.

## 9. Pendências técnicas, sem necessidade de decisão de produto agora

- Conferir esquema realmente instalado (incluindo códigos de dashboards legados, objetos privados, ACL e grants) no **Supabase self-hosted do sistema**, e não em outro projeto conectado.
- Validar a forma mais simples de armazenar configuração publicada, rascunho e associação gráfico-dashboard, garantindo atualização atômica de definição compartilhada.
- Determinar contratos e limites das fontes, frequências reais de atualização e regras de cache, inclusive dados de snapshot da LigSim.
- Detalhar tratamento de edições simultâneas, consistência de prévias, estados vazios e limites de componentes por dashboard.
- Planejar como os cinco renderizadores legados serão preservados e quais, se algum, podem ser convertidos ao catálogo configurável, sem alteração silenciosa de comportamento.
