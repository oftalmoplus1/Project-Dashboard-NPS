# Correcao de leitura e representacao de chamadas - 2026-11-19

## Escopo

Implementacao em branch isolada, baseada em main 1a821b6. Esta alteracao nao executa SQL administrativo nem altera o n8n, a RLS, os papeis de acesso ou as credenciais. Mantem a RPC agregadora como fonte do aplicativo e o JWT do usuario nas consultas.

## Correcao dos dados apresentados

- A leitura da RPC agregadora percorre todas as paginas com ordem explicita, offset, limite e contagem exata. Rejeita contagem desconhecida, paginas incompletas, repeticoes e mudanca do total durante a leitura. Usa prazo global de 15 segundos, no maximo 50 paginas e 4392 intervalos. Nao entrega lotes parciais como resultados completos.
- Validacao comum de datas civis, intervalos SQL locais de duas horas, numeros inteiros seguros, somas e duplicatas, compartilhada por API e componentes.
- Abandono na tela = ABANDON das recebidas / todas as recebidas * 100, usando o MESMO conjunto agregado dos cartoes. Denominador zero = indisponivel. NO ANSWER nao entra no numerador, mas pertence ao total. Nenhum filtro adicional exige nome da fila para contar ABANDON.
- A formula antiga dentro da RPC de tempos NAO e alterada por este commit. O novo cartao nao usa aquele campo legado. Consumidores diretos da RPC continuam pendentes da migracao SQL.
- A media de espera ainda retornada pela RPC existente e identificada como espera total TET (legado), nao como TME de fila. Essa identificacao parte da definicao exportada no inventario recebido. Antes de liberar em producao, reler a definicao instalada para evitar rotular uma RPC alterada externamente. TMA preservado. TME de fila TEF e a serie diaria dependem da migracao SQL e de testes autenticados.

## Graficos

- Mensal: barras horizontais agrupadas para atendidas, recebidas e abandonadas. Recebidas nao sao empilhadas com suas partes. NO ANSWER continua nos totais e no detalhamento, mas sai das series mensais.
- Media mensal: uma linha vertical por serie selecionada. Considera apenas meses civilmente encerrados com registros; exclui o mes corrente, meses futuros e lacunas sem registros. O rodape informa a base da media e nao afirma completude historica. As consultas nao pedem dias futuros.
- Horario: linhas de atendidas, recebidas e abandonadas e media selecionavel entre as 24 faixas acumuladas do periodo. Nao e media por dia. A RPC deve fornecer todas as 24 horas; uma resposta com horas faltantes e rejeitada, nunca preenchida artificialmente com zeros.
- Evolucao: inclui o dia completo e a categoria outras para que a soma visual corresponda ao total de recebidas. Remove a visualizacao tabular solicitada. Mantem detalhamento por selecao e teclado.
- Erros transitorios preservam a ultima consulta valida do mesmo recorte com aviso. Negacao de acesso remove dados previamente mostrados nos componentes de volume. O horario da tela nao e apresentado como horario de importacao.

## Testes e aceite

Suite nativa Node, sem nova dependencia, usando somente dados sinteticos. Executar `node --test tests/call-data.test.mjs`; o workflow de CI tambem executa lint, typecheck e build. Os testes locais nao substituem validacao autenticada da RPC e do navegador.

Antes do merge/deploy: conferir CI do head final; validar Content-Range e count=exact na RPC real com usuario autorizado; conferir limites do dia e filtros; testar perfis sem acesso; reler a semantica da RPC de tempos; conferir os totais dos recortes conciliados. Sem esses testes, nao declarar homologacao ponta a ponta.

Sem alteracao de dependencias ou lockfile. Nenhum host privado, quantidade operacional real, telefone ou segredo e publicado neste documento ou nos testes. Historico anterior a novembro, comparativo entre anos, chamadas por ramal, migracao SQL e autorizacao fina permanecem fora desta entrega.
