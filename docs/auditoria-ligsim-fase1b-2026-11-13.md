# Fase 1B - inventario e recomendacoes de conciliacao

Data: 2026-11-13. Branch: `audit/ligsim-dashboard-correcao-20261113`.
Base da etapa: `25b73be123ff515dd66d071bd5f6a52d001591c9`.
Referencia da main consultada: `1a821b673c955517ba991713e2e9077794eb0ff8`.

## Status e alcance

**Parcial: configuracao e metadados de execucoes n8n inspecionados; banco
self-hosted e conciliacao numerica ainda nao verificados.**
Foram lidos configuracoes, conexoes e esquemas de saidas historicas, sem
executar workflows, obter senhas de ramais ou copiar registros de chamadas.
O conector Supabase desta sessao nao disponibilizou o banco self-hosted do
Dashboard. Nenhum outro projeto foi usado como substituto.

Nao houve alteracao de main, workflow ativo, banco, segredo ou deploy.
Resultados operacionais detalhados e achados sensiveis nao sao publicados
neste repositorio publico.

## Evidencias e limites

1. O coletor de chamadas configurado solicita `current_page=1&per_page=25`.
   Nao foi encontrada paginacao no no HTTP nem nas conexoes inspecionadas.
   Isso evidencia risco de cobertura incompleta, nao o numero de chamadas
   ausentes no banco. Uma execucao com status success nao prova completude.
2. Esquemas derivados de execucoes anteriores apresentam `data.reports`,
   `data.reportsTotal`, metadados de paginacao e campos `ta`, `tef`, `tet`.
   Sao evidencias de campos observados, nao um contrato formal do fornecedor.
   Nao assumir que `reportsTotal` substitui paginacao ou contem todo o historico.
3. Existe outro fluxo LigSim inativo, com endpoints de filas diferentes dos
   exemplos do documento. Sua existencia nao valida os quatro endpoints
   solicitados nem equivale a integracao em producao.
4. O SQL versionado de abandono usa `ABANDON / (ANSWERED + ABANDON)`;
   o documento solicita abandonadas / recebidas. O SQL tambem usa `AVG(tet)`.
   A presenca desse arquivo nao comprova qual definicao esta instalada.

## Recomendacao registrada - ainda nao aplicada em producao

- Preservar o fluxo atual ate validar completude, seguranca e corte temporal.
  Corrigir a coleta e planejar recuperacao do historico antes de confiar em
  alteracoes visuais ou de formulas. Reprocessamento exige teste idempotente
  e nao sera disparado durante o inventario.
- Revisar uso do cofre de credenciais e limitar cada payload aos campos
  necessarios ao dashboard antes de ampliar a coleta.
- Manter a regra de negocio ja definida: `ABANDON` representa abandono.
  Para seguir o documento, recomendar que a taxa use o mesmo total de
  recebidas do cartao e os mesmos filtros. Nao trocar o denominador sem
  conciliacao e registro da mudanca de regra.
- Tratar TME de fila (`tef`) e espera geral (`tet`) como indicadores distintos.
  Nao substituir um campo pelo outro, nem alterar a inclusao de efetuadas,
  sem registrar a populacao e validar valores ausentes/invalidos.
- Integrar os endpoints solicitados pelo servidor apos verificar os
  contratos. Nao misturar silenciosamente totais de fontes ou cortes distintos.

## Consulta preparada

Arquivo: `docs/sql/dashboard_ligsim_inventario_somente_leitura.sql`.

Executar **somente esse arquivo**, sozinho, no SQL Editor do Supabase
self-hosted utilizado pelo aplicativo. Nao executar os scripts antigos de
instalacao, abandono, TMA/TME ou catalogo nesta etapa.

A consulta devolve uma grade com `secao`, `objeto`, `detalhes`:
ambiente, tabelas, colunas, indices, privilegios, politicas e funcoes esperadas.
Usa apenas catalogos PostgreSQL; nao le registros de chamadas nem invoca as
RPCs. Objetos ausentes aparecem como ausentes. Corpos de funcoes nao sao
retornados; mencoes a `ta/tef/tet` sao apenas indicios textuais e podem vir de
comentarios. Privilegios nao substituem testes de autorizacao por perfil.

Exportar o resultado em CSV e compartilhar pelo canal privado do projeto;
nao versionar o resultado, dados de clientes, hosts privados ou credenciais.

## Verificacoes desta entrega

- Oito verificacoes estaticas locais do script passaram: consulta unica;
  ausencia de comandos de escrita/sessao; ausencia de leitura de tabelas
  operacionais e de execucao de RPCs; tratamento estrutural de objetos
  ausentes; omissao dos corpos completos; oito secoes; ausencia de segredos
  ou enderecos externos no script.
- **Nao houve parser PostgreSQL, execucao SQL real ou teste de integracao.**
  Essas verificacoes nao atestam sintaxe/compatibilidade do banco implantado.
- Nenhum codigo TypeScript ou dependencia foi alterado. Lint, typecheck e
  build do aplicativo nao foram executados nem declarados aprovados.

## Para concluir a Fase 1B

Obter o inventario real, revisar definicoes instaladas e contratos de API,
comparar um dia fechado, um mes fechado e um intervalo personalizado sob
os mesmos filtros/corte temporal, e registrar diferencas de contagens,
populacoes e duracoes. Sem isso nao afirmar que os indicadores foram corrigidos.
