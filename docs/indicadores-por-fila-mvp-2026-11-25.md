# Indicadores por fila — MVP (25/11/2026)

## Status

Implementacao incremental **na main** do contrato de configuracao (lib/queue-indicators-config.ts). **Nao ativa** telas, consultas, publicacao nem migracoes de banco. O deploy do codigo sozinho **nao entrega** o monitoramento por fila configuravel.

## Regras de negocio definidas

- Intervalo de datas arbitrario e fixado pelo administrador no Editor Visual; sem atalhos hoje/ontem.
- Indicadores: nome da fila, recebidas, atendidas, abandonadas, percentual de atendimento.
- Percentual: atendidas / recebidas * 100; com zero recebidas, valor nao aplicavel (null).
- Selecionar uma, varias ou todas as filas autorizadas. O modo todas inclui novas filas autorizadas.
- Exibir filas sem movimento com zero nas contagens.
- Ordenar por campo e direcao; limitar 5/10/20/todas.
- Tabela ou barras horizontais/verticais.
- Configuracao fixa na visualizacao publicada, alteravel apenas no editor por administrador.

## Impedimentos de integracao verificados

1. A RPC `dashboard_ligsim_filas_ativas` e a tabela `listar_filas` entregam **ultima coleta**, sem historico confiavel para intervalos arbitrarios. Nao filtrar pelo campo `updated_at` como se fosse data da chamada.
2. O historico `relatorio_chamadas` possui `init_time`, `queuename` e `disposition`, mas ainda nao existe uma RPC de fila homologada com regras conferidas de **recebidas, atendidas e abandonadas** e permissao por fila. Nao inferir abandons apenas de registros cujo disposition difere de ANSWERED.
3. A persistencia atual do Editor Visual aceita exatamente 11 chaves por componente (validacao TypeScript e PostgreSQL). Acrescentar propriedades de datas/fila diretamente aos blocos causaria rejeicao no banco. E necessaria evolucao versionada dos contratos e SQL de forma conjunta.
4. A pagina de monitoramento personalizado ainda resolve somente dashboards preexistentes, portanto necessita renderizacao de layouts publicados e isolamento de dados por dashboard.
5. Sem acesso ao Supabase self-hosted ou ao Coolify, nao e possivel confirmar esquema real, backups, commit atualmente implantado ou realizar testes end-to-end de producao.

## Proxima fase para habilitacao

- Auditar eventos historicos e suas regras por fila; aprovar uma RPC com saida agregada, datas no fuso America/Sao_Paulo e autorizacao server-side.
- Evoluir o contrato dos blocos e a validacao SQL em migracao transacional com testes de compatibilidade retroativa.
- Adicionar os campos de configuracao ao inspetor, consulta somente no servidor, componentes visuais e publicacao com controle de acesso.
- Testar com dados sinteticos: periodos vazios, novas filas autorizadas, filas zeradas, multi-selecao, ordenacao, RLS e rollback.
- Nao alterar RPCs legadas e nao conceder acesso direto a tabelas.

## Seguranca de release

O commit de producao historicamente informado foi `e4ee559`, mas a main consultada em 25/11/2026 tinha HEAD `843b596e53ed4602ca070df1df8171af2d91ff32` antes desta entrega. Nao assumir que redeploy da main preserva a versao atualmente instalada no Coolify sem comparar o SHA de origem e os commits intermediarios.
