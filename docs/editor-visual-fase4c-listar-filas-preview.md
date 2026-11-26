# Editor Visual — fase 4C: prévia atual por \`listar_filas\`

Data: 26/11/2026. **Código em PR, não publicado.**

## Decisão e fonte
A fonte escolhida para este incremento é exclusivamente \`public.listar_filas\`, via RPC já instalada no projeto (\`dashboard_ligsim_filas_ativas\`) e rota já protegida \`GET /api/chamadas/filas\`. Não realizar investigação adicional nem usar \`relatorio_fila_exame\` nesta implementação.

O n8n faz **upsert por \`id\`** em \`listar_filas\`. Portanto a tabela contém **a última coleta**, não dados históricos por intervalo. \`updated_at\` indica atualização, não entrada individual de chamada. Nenhum código pode derivar séries por dia/semana/mês, incrementos ou horas dos snapshots, pois reinícios e transferências não estão comprovados.

## Implementado nesta fatia
- Prévia no canvas do Editor Visual com dados reais somente para blocos \`kpi\`, \`table\` e \`bar\` com fonte \`listar_filas\`. Gráficos temporais (\`line\`, \`area\`) e outras visualizações sem semântica validada continuam com aviso de indisponibilidade.
- O tipo do layout **não é alterado**: 11 campos e controle de revisões continuam compatíveis com a RPC de autosave instalada. \`metric = ''\` mostra as **três métricas** (recebidas, atendidas e abandonadas); \`received\` e \`answered\` continuam suportadas como filtro de visualização. O novo identificador \`abandoned\` e filtros persistentes dependem de versão coordenada do contrato TypeScript + SQL e não são salvos nesta etapa.
- A contagem de abandonadas é calculada pelo parser já existente como \`abandon_less_30s + abandon_more_30s\`, independentemente da espera. A prévia não adiciona uma métrica de transferência.
- Valores por fila e percentuais mostram \`N/A\` quando recebidas é zero. Ordenação por nome, as primeiras **10 filas** visíveis nos gráficos/tabelas; total consolidado calculado sobre **todas** as filas devolvidas pela RPC.
- Um único GET autenticado por atualização, compartilhado pelos blocos que precisam de dados, refetch a cada 5 minutos com aba visível e quando a aba volta; falha, ausência de sessão, coorte inválida ou fonte vencida **limpam os dados**. Sem dados inventados.
- \`src\`, \`dst\`, agentes e \`member\` não trafegam na projeção; o editor não recebe chave de serviço nem executa SQL livre. O Admin do Editor já é validado no backend, e a RPC realiza autorização novamente.

## Limites reconhecidos
- Somente **prévia administrativa** do estado atual, sem publicar para gestores. Publicação permanece desativada.
- Os modos \`Consolidado\` e \`Separado por fila\`, os limites 5/10/20/todas, seleção persistente de filas, ordenação configurável e intervalo fixo/dinâmico por componente ainda exigem versionamento do contrato do layout e revisão da migração. O limite 10 da prévia é explícito e não representa configuração publicada.
- Não introduzir captura artificial de histórico somando snapshots sucessivos. Para períodos históricos será necessária uma fonte homologada de eventos por passagem na fila, ou decisão explícita de mudar o requisito.
- Nenhuma alteração em banco de produção, grants, RLS, n8n, ingestão, Coolify ou \`main\`.
- O arquivo \`docs/sql/editor_visual_listar_filas_preflight_20261126.sql\` é opcional e **somente leitura** para verificar a coorte, a origem temporal e os totais agregados sem exportar dados pessoais.

## Verificação
Executar testes unitários da projeção de filas, smoke de UI com mock da RPC, lint, typecheck, build e outros smokes. A CI isolada não garante que a consulta à RPC produtiva já esteja instalada nem que os contadores da LigSim sejam diários ou individuais. Confirmar implantação real e permissões antes de qualquer release.
