# Editor Visual — Fase 4A: modelo de apresentação de filas (MVP)

Data: 25/11/2026. Implementação isolada em branch, sem alteração no banco, deploy ou publicação.

## Entregue nesta fase

O módulo puro `lib/editor-queue-view.ts` prepara as linhas de uma visualização
a partir de um snapshot **já validado e autorizado pelo servidor**. Aceita:
- todas as filas autorizadas (incluindo filas adicionadas posteriormente), ou seleção por IDs;
- indicadores recebidas, atendidas, abandonadas e percentual de atendimento;
- ordenação por nome ou métrica, ascendente/descendente;
- limite de 5, 10, 20 ou todas;
- inclusão de filas autorizadas sem movimento com contagens zero;
- modo tabela ou barras e orientação vertical/horizontal como configurações para a futura UI.

Taxa de atendimento = atendidas / recebidas × 100; sem recebidas o resultado é
`null` (não 0%), sempre exibido como indisponível. Filas removidas da autorização
não são reintroduzidas pela seleção persistida. Dados não são registrados nem transmitidos
a serviços externos por este módulo.

## Limites importantes

`public.listar_filas` representa a **última coleta**, não um histórico.
Assim, a seleção de intervalo personalizado **ainda não pode ser vinculada a esta fonte**.
O desenvolvimento da consulta histórica precisa de modelo temporal auditável e
validação de significado dos contadores antes de disponibilizar períodos.

Este módulo é lógica de apresentação testável, **não uma nova API nem integração
ativa no Editor Visual**. Ainda faltam: revisão da ACL específica para dashboards
configurados, persistência segura das novas opções com contrato SQL atualizado,
componente de tabela/barras, ligação a uma consulta autorizada, testes integrados
e publicação. O botão Publicar continua desabilitado.

Não executar migrações nem fazer deploy para esta fase. Preservar o histórico
da branch principal e o ambiente produtivo.
