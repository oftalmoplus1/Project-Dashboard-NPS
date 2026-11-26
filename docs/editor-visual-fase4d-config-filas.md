# Editor Visual — Fase 4D: configurações por fila persistentes (26/11/2026)

## Decisão

O usuário aprovou iniciar a configuração **por componente** para a fonte \`public.listar_filas\`, com:
- Seleção de uma/várias/todas as filas autorizadas. O modo \`all\` inclui automaticamente novas filas da RPC protegida.
- Ordenação por nome, recebidas, atendidas, abandonadas ou percentual atendido; crescente/decrescente e desempate alfabético.
- Exibição 5/10/20/todas após ordenação, para tabelas e barras; KPI consolidado soma todas as filas selecionadas.
- Mantidas as três métricas: \`received\`, \`answered\`, \`abandoned\` (ambas as faixas de tempo). Filas zeradas continuam exibidas; taxa com denominador zero fica N/A.
- Fonte: \`GET /api/chamadas/filas\` existente, protegida; apenas a **última coleta**, sem série histórica por intervalo de datas.

## Contrato V2 sem alteração de tabela

Os 11 campos de cada bloco do layout v1 permanecem. Um 12º campo **opcional**, \`queueConfig\`, pode ser usado só em \`kpi\`, \`bar\` e \`table\` cuja fonte seja \`listar_filas\`. Este objeto tem whitelist exata:
\`\`\`json
{
 "selection":{"mode":"all"},
 "sortBy":"name",
 "direction":"asc",
 "limit":10
}
\`\`\`
Ou \`{"selection":{"mode":"selected","ids":[1,6,13]},"sortBy":"answered","direction":"desc","limit":5}\`.
Filas selecionadas exigem IDs numéricos positivos, sem repetição e até 200 registros; o servidor filtra somente as filas autorizadas pela RPC, sem leitura direta. Configurações legadas sem \`queueConfig\` continuam válidas. A escolha \`abandoned\` como métrica individual passa a ser permitida pelo contrato V2.

O controle de revisão compare-and-swap, o autosave, a autorização dupla por app_metadata, a auditoria e a proibição de publicar não mudam.

## Release seguro — obrigatoriamente em etapas

1. Revisar a PR #45 (prévia da última coleta) e integrar/testar separadamente, pois esta PR depende dela.
2. Confirmar que a fase 3B está instalada no **Supabase self-hosted correto**; verificar definição instalada de \`dashboard_catalog.editor_layout_salvar(uuid,bigint,jsonb)\` contra a versão auditada no repositório.
3. Antes de aplicar SQL em produção: backup verificado, plano de rollback e ponto seguro no Git. **Não** executar a proposta se a função instalada tiver alterações não documentadas.
4. Instalar o script \`docs/sql/editor_visual_fase4d_queue_config_PROPOSTA.sql\` no banco correto. Ele executa \`CREATE OR REPLACE FUNCTION\` na função PRIVADA existente, sem novas tabelas, grants ou acesso a chamadas. O wrapper público mantém \`SECURITY INVOKER\`.
5. Somente depois implantar o código desta PR e testar admin, gestor, usuário anônimo, filtros, concorrência entre abas e persistência após recarga.
6. Se falhar, reverter o aplicativo. Para reverter a função, usar o script \`docs/sql/editor_visual_fase4d_queue_config_ROLLBACK_PROPOSTA.sql\` apenas se não houver blocos V2 persistidos; caso haja, migrar esses dados com aprovação específica antes do rollback (nunca excluir silenciosamente).
7. Publicação e períodos históricos **continuam bloqueados**. Verificação de fatos de entrada em fila não foi homologada; \`updated_at\` não é horário de chamada.

## Testes e limitações

A CI aplica V1 e depois V2 exclusivamente em PostgreSQL efêmero, valida RBAC, concorrência, rollback condicionado e rejeição de payloads adulterados. Testes TypeScript, lint, build e Playwright verificam dados autorizados e autosave/refresh com ambiente sintético.

**Nenhuma alteração foi feita no Supabase produtivo, n8n, RLS, filas, permissões ou \`main\`.** A instalação real exige verificação explícita das funções existentes e execução controlada no self-hosted.
