# Administração / Desvincular um dashboard de um tópico

Data: 2026-11-23. Status: implementação de aplicação e script SQL versionados; a instalação no Supabase self-hosted da aplicação deve ser feita separadamente.

## Necessidade e regra de negócio
Em Administração > Gerenciar Tópicos, o administrador pode **remover um dashboard de um tópico já cadastrado**, sem excluir sua definição ou seus gráficos. O mesmo dashboard pode continuar ligado a outros tópicos. O nome na interface é “Remover” e a confirmação deixa claro que se trata de **desvincular**, não excluir globalmente.

- **RB-001**: apenas administrador pode remover vínculo; APIs também validam o papel no servidor, e a RPC consulta `auth.users.raw_app_meta_data` no momento da operação.
- **RB-002**: identificar explicitamente o par `(slug do tópico, código do dashboard)`. Operação não pode afetar outro tópico.
- **RB-003**: antes de enviar a exclusão, confirmar digitando o código exato do dashboard.
- **RB-004**: apagar apenas `dashboard_catalog.topico_dashboards` e, pelo `ON DELETE CASCADE` já existente, os registros de `acesso_dashboards` que dependem daquele par. Preservar `acesso_topicos` e todos os dashboards originais.
- **RB-005**: auditar operador, alvo, tópico e número de permissões contextuais revogadas na mesma transação.
- **RB-006**: ausência do vínculo retorna erro (404) em vez de alegar remoção efetuada.
- **RB-007**: manter os bloqueios de origem externa com `APP_ORIGIN` no Coolify e `Sec-Fetch-Site` cross-site.

## Implementação
- `components/manage-topics.tsx`: botão “Remover” em cada dashboard do tópico; confirmação inline por código; atualização da listagem, contagem e mensagens depois da gravação.
- `app/api/catalogo/topicos/[slug]/dashboards/route.ts`: `DELETE` admin-only com confirmação, validação de formato, origem, sessão e delegação para RPC com token do próprio usuário.
- `docs/sql/dashboard_catalogo_desvincular_dashboard_20261123.sql`: função privada `dashboard_catalog.desvincular_dashboard_topico`, wrapper pública `dashboard_catalogo_desvincular_dashboard_topico`, grants restritos, preflight da FK CASCADE e auditoria.
- CSS reutiliza tokens, botões e layout responsivo existentes.
- Nenhuma tabela, gráfico, consulta LigSim ou integração n8n será alterada.

## Ativação no banco
1. Antes de executar SQL, selecionar o Supabase **self-hosted** real do dashboard (não outro projeto), verificar permissões e ter ponto de retorno seguro.
2. Conferir **somente leitura** que `dashboard_catalog.topico_dashboards`, `dashboard_catalog.acesso_dashboards` e `dashboard_catalog.auditoria` existem e que a FK `acesso_dashboard_vinculo_fk` usa ON DELETE CASCADE.
3. Executar apenas o novo arquivo `docs/sql/dashboard_catalogo_desvincular_dashboard_20261123.sql`. O preflight aborta a transação se a estrutura não corresponder.
4. Rodar a consulta de validação no final do arquivo: função existe, `anon_executa=false`, `authenticated_executa=true`. Testar que manager recebe 403/42501.
5. Publicar a versão da `main` que contém a interface, atualizar navegador, verificar a remoção em tópico **descartável**.
6. Conferir visualmente a contagem reduzida, o dashboard ainda no catálogo e preservação de associações em outros tópicos.

## Critérios de aceite
- Botão de remoção aparece ao lado de um dashboard associado em Gerenciar Tópicos.
- Cancelamento não produz requisições de escrita nem altera a listagem.
- Confirmação incorreta e payload inválido retornam 400 sem executar RPC.
- Sem sessão retorna 401; gestor/usuário sem permissão retorna 403; origem externa 403.
- RPC ausente retorna 503 e vínculo inexistente retorna 404.
- Remover `tma-tme-diario` de um tópico não remove seu registro em `dashboard_catalog.dashboards` nem suas associações com outros tópicos, e não modifica as tabelas operacionais.
- Permissões contextuais são revogadas pela FK e auditoria registra o evento.
- Rodar lint, typecheck, build, smoke admin e regressão do Call Center.

## Escopo excluído
Não existe ainda editor de gráficos individuais dentro de um dashboard. Esta ação remove a **visualização/dashboard do tópico**, não um elemento interno de gráfico do dashboard. A remoção de gráficos internos será especificada quando o editor visual estiver implementado.
