# Coleta LigSim: alteracao operacional de 2026-11-13

## Escopo efetivamente executado

A integracao de chamadas no n8n foi corrigida, testada com a API e o banco reais, e publicada. Foi recuperado um dia fechado por insercao exclusiva dos IDs ausentes, seguida de nova leitura e conciliacao por identificador e campos de negocio. O workflow de recuperacao permanece manual e inativo, no projeto pessoal; nao executa recorrencia.

Este registro publico omite quantidades operacionais, identificadores de chamadas, hosts privados e credenciais. As evidencias detalhadas permanecem no historico privado do n8n e no relatorio entregue ao responsavel.

## Causa verificada

O coletor anterior solicitava a primeira pagina e persistia somente `data.reports`. A consulta completa de um dia fechado, seguida de comparacao por ID com a tabela, confirmou registros ausentes. O sucesso de uma execucao antiga nao assegurava completude.

## Estrategia publicada

- Janela explicita de hoje e ontem em America/Sao_Paulo, sem alterar o agendamento preexistente.
- Para essa janela curta, usar `data.reportsTotal`, documentado pelo fornecedor como conjunto completo do filtro, em uma unica resposta.
- Validar quantidade declarada versus tamanho do conjunto, IDs unicos, datas do recorte, tipos e limites das colunas. Rejeitar lote acima de 5000 registros ou resposta inconsistente antes de qualquer escrita no ramo de chamadas.
- Preservar o upsert por `id`, com lista explicita de campos e timestamp de importacao. Campos nao incluidos no contrato, como `has_intelligence` quando ausente de `reportsTotal`, nao sao apagados dos registros existentes.
- Nao persistir caminhos de gravacao, listas de gravacoes adicionais ou campos arbitrarios da resposta.
- Para recuperacao de historicos fechados, usar paginacao e conciliar antes de gravar. A recuperacao realizada usou `ignore-duplicates`: nao substituiu os registros que ja existiam.

Uma tentativa inicial de paginar o periodo que incluia o dia em andamento detectou mudanca dos totais entre paginas e interrompeu a escrita, conforme a protecao prevista. Essa versao nao foi publicada. A estrategia final evita combinar paginas obtidas em instantes diferentes durante a chegada de novas chamadas. Mesmo em resposta unica, divergencia entre `total` e registros bloqueia a escrita; nao ha fallback silencioso para a primeira pagina.

## Verificacoes

- Testes locais da recuperacao aditiva: 15 casos aprovados.
- Testes locais do normalizador final: 16 casos aprovados.
- Teste simulado completo do recuperador no n8n: aprovado, sem executar servicos externos nesse teste.
- Recuperacao real do recorte fechado: concluida, seguida de comparacao por ID, direcao, situacao, tempos e fila.
- Execucao real do coletor final: sucesso antes de publicar.
- Publicacao confirmada; a versao ativa coincide com a versao testada. A versao anterior continua no historico para reversao.

## Limites que permanecem

Esta entrega corrige a coleta; nao instala os SQLs de formulas, nao modifica autorizacao das RPCs, nao muda o frontend, nao renomeia topicos e nao publica versao do aplicativo pelo Coolify. Lint, typecheck e build do aplicativo nao foram executados nesta etapa. A alteracao de credenciais foi bloqueada pela ferramenta e nao foi aplicada. Nao foi feita rotacao de chaves.

O historico anterior ao dia recuperado ainda necessita conciliacao e recuperacao controlada. A janela de dois dias nao garante reparo de interrupcoes superiores a esse intervalo. O limite de 5000 registros gera erro explicito e exige revisao se for alcancado. O coletor nao atualiza chamadas antigas que forem corrigidas na origem fora dessa janela.

As referencias numericas anteriores extraidas de um banco incompleto nao devem continuar sendo utilizadas como resultados esperados apos recuperacao. Recalcular os indicadores na mesma fonte, periodo e corte, e registrar a nova referencia antes de homologar as formulas.

## Reversao

O historico do n8n preserva a configuracao anterior; restaurar uma versao exige publicacao explicita. Nao apagar automaticamente os registros recuperados: sao registros da fonte cuja ausencia foi comprovada. A execucao de recuperacao preserva os IDs inseridos para auditoria privada. Qualquer reversao de dados deve conferir autoria da importacao e alteracoes subsequentes, evitando remover registros atualizados posteriormente.
