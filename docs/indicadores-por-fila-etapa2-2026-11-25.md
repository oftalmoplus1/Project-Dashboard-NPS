# Etapa 2 — visualizacao dos indicadores por fila

Data: 25/11/2026.

## Entregue na main

- `components/queue-indicators-view.tsx`: componente de apresentacao que recebe linhas **ja agregadas e autorizadas pelo servidor**; permite tabela e barras verticais/horizontais, contagens, percentual de atendimento e estados loading/erro/vazio.
- `components/queue-indicators-view.module.css`: estilos responsivos sem introduzir bibliotecas de graficos.
- `docs/sql/diagnostico_indicadores_fila_historico_readonly.sql`: diagnostico READ ONLY para identificar contratos de `relatorio_chamadas` e correspondencia com `listar_filas`. Nao executado no banco.

## Decisoes importantes

1. Essa camada **nao consulta o banco diretamente** e nao autoriza filas. Deve receber apenas linhas que uma rota autenticada e autorizada obtiver de RPC historica homologada.
2. A configuracao e `QueueIndicatorsConfig` (em `lib/queue-indicators-config.ts`). O periodo definido pelo administrador nao e editavel na visualizacao final.
3. A porcentagem de atendimento e calculada sobre recebidas. Quando recebidas=0, exibe N/A.
4. O grafico apresenta recebidas, atendidas e abandonadas na mesma escala por componente. Percentual aparece como rotulo separado, nao mistura porcentagem com contagem no eixo.
5. As novas estruturas **nao foram conectadas ao layout do editor**; a persistencia atual aceita 11 chaves por bloco, e adicionar campos sem atualizar o PostgreSQL quebraria o salvamento.
6. A renderizacao nao deve ser ativada com a ultima coleta de `listar_filas` para periodos arbitrarios, pois isto associaria valores de data incorretos.

## Proximos passos

- Executar o diagnostico somente de leitura no banco self-hosted correto e validar os estados que representam recebidas/atendidas/abandonadas, duplicidades, nomes e identidade estavel de filas.
- Confirmar a autorizacao por fila (ACL) e semantica de todas as filas.
- Versionar RPC historica agregada e migracao de configuracao do editor com testes SQL e regressao.
- Apos testes, conectar o inspetor e a visualizacao ao monitoramento publicado.

**Situacao:** componente de interface preparado; fonte historica, ACL, publicacao e integracao persistida pendentes. Nao anunciar MVP como implantado nem disparar deploy automatico sem conferir o commit ativo no Coolify.
