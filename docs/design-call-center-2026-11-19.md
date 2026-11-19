# Call Center - primeira entrega do design aprovado

Base: `docs_correcao_dash.docx`, quatro paginas, e proposta visual aprovada na conversa. Ponto de partida no Git: `e1e789eb6fda4037cd5ed8ea52cc3459864a60ac`.

## Escopo implementado

- Rotulo do topico padrao Relatorios -> Call Center, no menu e cabecalho. O slug `relatorios`, URLs, IDs, catalogo e permissoes permanecem intactos. Nomes personalizados e outros topicos nao sao renomeados. Nao e uma migracao do nome persistido no banco.
- Cinco abas dentro de Chamadas: Visao geral, Por mes, Por hora, Comparativo anual e Por ramal. As tres primeiras usam as consultas existentes. As duas ultimas sao estados explicitos de integracao pendente, nao graficos prontos.
- Um cartao Chamadas com recebidas, atendidas e abandonadas, seguindo a referencia da pagina 4. Indicadores secundarios ficam no detalhamento expansivel.
- Tres cartoes de indicadores: taxa de abandono, TMA e TME de fila. O primeiro conserva a formula ja implementada sobre todas as recebidas; o segundo conserva os dados da RPC existente. TME de fila mostra indisponibilidade explicita enquanto TEF nao estiver habilitado. TET continua identificado como metrica legada no detalhamento, sem ser reapresentado como TEF.
- Tempos em mm:ss e, a partir de uma hora, hh:mm:ss; valores desconhecidos nao viram zero. Nenhum indicador usa o numero ilustrativo do documento.
- A secao de filtros nao usa a linha divisoria do antigo panel-head. Avisos de consulta foram deslocados para o rodape, preservando a distincao entre consultar a tela e sincronizar a origem.
- Mensal e horario reaproveitam seus componentes, series, medias e validacoes. O componente mensal recebeu somente a opcao de nao montar o grafico horario junto. Grafico anual e ramais nao recebem dados inventados.
- Layout responsivo com cartoes empilhados em telas pequenas, totais em linhas no celular, abas com rolagem horizontal, foco visivel e suporte aos temas existentes. O periodo e o ano escolhido permanecem no componente pai quando se muda de aba.
- Navegacao de abas com setas, Home/End e ativacao manual por Enter/Espaco. IDs acessiveis sao unicos por instancia.

## Limites de seguranca e de produto

Nenhum SQL, rota de API, autenticacao, papel, concessao, fluxo n8n, segredo ou dependencia do aplicativo e alterado. Esta etapa nao soluciona a integracao de ramais, o comparativo entre anos, a migracao TEF ou o painel diario legado. O nome persistido do topico continua sendo administrado pelo catalogo.

O TET mostrado no detalhe vem do contrato legado ja identificado no inventario; nao se declara que a funcao produtiva tenha sido relida nesta etapa. Para habilitar TME no futuro, a integracao deve fornecer TEF validado e um contrato explicito, nao apenas trocar o rotulo.

## Verificacao reproduzivel

`node --test tests/call-data.test.mjs tests/call-center-design.test.mjs`

`npm run lint && npm run typecheck && npm run build`

`node tests/smoke-http.mjs`

A suite `tests/smoke-call-center-design.mjs` usa Chromium/Playwright isolados em RUNNER_TEMP, Next compilado e servidor de dados sinteticos em loopback. Verifica cartoes, formula, formatacao de tempos, ausencia de TME inventado, navegacao manual, filtros preservados, abas pendentes, largura de documento em 375/768/1440 px, tema escuro, tratamento de falha e acesso negado. Produz capturas desktop/mobile/escuro como artefato do CI. Nao usa usuarios, chaves ou registros reais.

O CI instala Playwright 1.56.1 fora do projeto; package.json e package-lock.json permanecem intactos. Capturas sinteticas nao comprovam conciliacao dos dados produtivos nem deploy do Coolify.

## Criterios de aceite

1. Menu Call Center sem alterar o destino autorizado existente.
2. Um unico cartao com os tres totais, com valores inalterados para o mesmo recorte.
3. Apenas a aba selecionada monta seu grafico; o mensal nao renderiza o horario junto.
4. TME pendente nunca apresenta TET como resultado.
5. Navegacao funcional por teclado e toque; sem rolagem horizontal do documento nas larguras testadas.
6. Falha transitoria identificada; negacao de acesso remove valores da visao geral.
7. Testes de dados e HTTP anteriores preservados; teste visual automatizado aprovado antes do merge.

## Reversao

Reverter o commit de interface pelo Git. Como nao ha migracao de dados, nao e necessario apagar registros, tabelas ou politicas. Um merge nao comprova implantacao: verificar a revisao no Coolify apos publicar.
