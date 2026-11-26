# Editor Visual — inicio da implementacao dos graficos de evolucao

Data: 25/11/2026. Fase incremental 4A: **motor puro de periodos e agregacao, sem acesso ao banco**.

## Decisoes de negocio fechadas

Somente tres metricas: `received` (entradas recebidas), `answered` (atendimentos ocorridos na fila) e `abandoned` (todos os abandonos, sem limite de espera). Nao adicionar metricas de transferencia.

- Periodo individual por grafico: fixo, com hoje permitido e aviso de parcialidade, ou dinamico (ultimos 7/30/90 dias, mes atual/anterior, ano atual/anterior). Periodos dinamicos excluem hoje, em `America/Sao_Paulo`.
- Agrupamentos diario, semanal (segunda a domingo) ou mensal; lacunas internas de um intervalo com registros recebem zero. Intervalo inteiro sem ocorrencias gera estado vazio, nao uma serie artificial de zeros.
- Linhas ou barras agrupadas lado a lado. Uma ou varias metricas no consolidado; uma unica metrica no modo separado por fila.
- Selecao independente de uma, varias ou todas as filas autorizadas. O modo todas e dinamico, sem congelar IDs.
- Separado por fila: 5, 10, 20 ou todas; ordenacao crescente/decrescente por nome ou total acumulado da metrica no intervalo. Primeiro classifica, depois aplica limite; desempate por nome e ID.
- Uma entrada por passagem em cada fila, inclusive retorno a mesma fila. Transferencia sem atendimento nao e abandono. Cada atendimento pertence apenas a fila em que aconteceu. O dia e o da entrada na fila, mesmo se o desfecho ocorrer depois.
- Na interface: carregamento imediato, reconsulta individual a cada 5 minutos, pausa em aba oculta e reconsulta ao retornar; erros ocultam dados afetados; rascunho guarda configuracao, nao resultados. Dados reais tambem durante a edicao.

## Implementado nesta fase

`lib/editor-evolution.ts` resolve intervalos dinamicos e fixos no fuso correto, gera grupos calendarios, valida o conjunto de filas autorizado recebido do servidor, contabiliza *visitas individuais a filas*, aplica ordenacao/limites e produz series agregadas para apresentacao. Funcao pura testavel, sem alterar SQL, endpoints atuais, editor existente ou dados.

`tests/editor-evolution.test.mjs` cobre datas, vazios vs zeros, fuso, transferencias e retorno, autorizacao, selecao dinamica, agrupamentos e ordenacao.

## Bloqueios e proximas entregas

1. **Fonte e semantica**: `public.listar_filas` guarda apenas o ultimo snapshot por fila; `dashboard_chamadas_agregadas` agrupa chamadas CDR e nao comprova multiplas entradas da mesma chamada em filas. Nenhuma dessas fontes pode alimentar o motor como se fossem visitas historicas verificadas.
2. Executar diagnostico **somente leitura** no Supabase self-hosted correto para comprovar fonte ou log de cada entrada em fila, carimbo de entrada, desfecho e autorizacao contextual. Se nao houver tal fonte, projetar captura historica de eventos antes de qualquer grafico real por fila. Nao inferir transferencias de totais.
3. Elaborar RPC de leitura agregada segura, sujeita a aprovacao de instalacao. Projetar autorizacao no servidor e PostgreSQL (nao confiar no filtro do cliente).
4. Evoluir versao do contrato de rascunho e a RPC `dashboard_editor_layout_salvar` **em conjunto**: atualmente ambas exigem exatamente 11 campos por bloco; campos novos quebrariam salvamento. Manter compatibilidade de layouts existentes e testes de concorrencia.
5. Integrar propriedades e visualizacao no Editor Visual, com estados de carregamento/erro/vazio e ciclo de 5 minutos. Somente depois habilitar graficos reais. Publicacao e controle de acessos dos usuarios finais sao fases separadas.

**Nesta entrega, nao alegar que graficos reais foram conectados, nao habilitar metricas de snapshot para periodos historicos e nao reintroduzir Monitoramento.** 
