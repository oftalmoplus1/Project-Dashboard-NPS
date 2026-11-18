# Integracao LigSim: conciliacao e resiliencia em 2026-11-18

## Entrega efetivamente executada

Foi executada uma nova sincronizacao real, uma auditoria integral dos dias fechados de 1 a 17 de novembro de 2026, uma recuperacao aditiva das lacunas comprovadas e uma segunda auditoria independente. A coleta automatica de chamadas foi ajustada, testada contra os servicos reais e publicada no n8n. A versao ativa foi conferida e coincide com a versao testada.

Este documento publico nao contem quantidades operacionais, identificadores de chamadas, nomes de pessoas, telefones, enderecos de infraestrutura, IDs de credenciais ou segredos. As evidencias operacionais agregadas ficam na tabela privada de conciliacao do n8n e no pacote entregue ao responsavel.

## Incidente observado e limite do diagnostico

Uma execucao agendada de 18/11 retornou HTTP 503 ao gravar agentes no Supabase, antes de executar o ramo de chamadas. Na verificacao posterior, a entrada publica voltou a responder e uma sincronizacao manual completa terminou com sucesso. O endereco interno anteriormente conhecido pelo aplicativo nao era resolvido pelo ambiente do n8n; ele nao foi adotado como substituto.

Nao houve acesso ao servidor de hospedagem e nao se afirma que a causa de infraestrutura do 503 tenha sido eliminada. As tentativas adicionais reduzem impacto de falhas breves; nao substituem o diagnostico do servidor nem garantem recuperacao de interrupcoes prolongadas.

## Auditoria e recuperacao

A auditoria comparou os identificadores de cada dia e os campos `init_time`, `final_time`, `call_direction`, `disposition`, `ta`, `tef`, `tet` e `queuename`. Cada recorte usa o dia civil de America/Sao_Paulo, com inicio inclusivo e fim exclusivo.

A fonte foi consultada em intervalos de um dia pelo conjunto `reportsTotal`, cujo tamanho foi confrontado com `total`. IDs repetidos e registros fora do intervalo bloqueiam a validacao. A leitura local confere `Content-Range`; atingir um limite sem obter todos os registros nao e interpretado como ausencia de chamadas.

Foram encontradas lacunas em tres dias, sem divergencias nos registros preexistentes dos campos comparados. A recuperacao consultou a fonte e o banco novamente, validou tipos e limites e usou insercao com `ignore-duplicates`. Nao houve DELETE nem substituicao dos registros existentes durante essa recuperacao. A verificacao apos a gravacao confrontou novamente os conjuntos de IDs e os campos dos indicadores.

A segunda auditoria dos 17 dias encontrou os conjuntos conciliados, sem registros ausentes, extras, duplicados ou divergencias nos campos comparados. Isso nao comprova outros meses nem todos os campos possiveis do fornecedor. O dia 18 ainda estava em andamento e nao integra o recorte fechado homologado.

## Mudancas publicadas na coleta recorrente

- Reconsulta dos ultimos sete dias civis: hoje e os seis dias anteriores, em America/Sao_Paulo. A antiga janela de hoje e ontem nao alcancava lacunas mais antigas apos uma interrupcao.
- Mantido o agendamento existente a cada duas horas entre 7h e 21h. Nao foi criado um novo agendamento paralelo.
- O ramo de chamadas passou a ser executado antes das outras fontes na ordem v1, para que uma falha posterior em outro ramo nao impeça uma coleta de chamadas ja valida.
- GET e POST de chamadas configurados com ate tres tentativas, espera de cinco segundos entre tentativas e timeout de 30 segundos. Erros persistentes continuam interrompendo a execucao; nao foram convertidos em sucesso.
- Mantidos o limite de 5000 registros por snapshot, a rejeicao de resposta incompleta, os tipos das colunas, a lista explicita de campos e o upsert por `id`.
- Apos uma resposta HTTP bem-sucedida da gravacao, registra-se no n8n uma evidencia agregada: execucao, janela, quantidade enviada, horario e status HTTP. Essa evidencia de gravacao nao deve ser confundida com uma nova conciliacao independente por ID.

A tabela de evidencias e os fluxos auxiliares pertencem ao projeto pessoal do responsavel no n8n. A tabela guarda resultados agregados, nao uma copia dos registros individuais. Os fluxos de diagnostico, auditoria historica e recuperacao continuam manuais e inativos.

## Testes realizados nesta etapa

- 21 testes locais da preparacao e verificacao da recuperacao aditiva.
- 16 testes locais das protecoes do normalizador de coleta.
- 6 testes locais dos limites da janela de sete dias e do registro de seus limites.
- Um teste simulado no n8n do recuperador, com fontes, escritas e persistencia de evidencias substituidas por dados de teste.
- Recuperacao real seguida de releitura e auditoria independente.
- Execucao real da nova coleta antes da publicacao e conferencia da versao ativa apos publicar.

Total: 43 testes locais aprovados, alem dos testes de fluxo e verificacoes reais. Nao houve alteracao do codigo do aplicativo nesta etapa; lint, typecheck, build e teste autenticado no navegador nao foram executados e nao sao apresentados como aprovados.

## Graficos e formulas: separacao de responsabilidades

A base operacional de chamadas dos dias auditados esta conciliada. Isso e necessario para os graficos de volume, mas nao equivale a homologacao visual ou ponta a ponta do aplicativo. A rota de chamadas continua consultando a RPC agregadora existente; a rota de indicadores continua usando a RPC de tempos existente.

Nenhuma alteracao SQL das formulas foi instalada nesta etapa. O inventario de 13/11 havia mostrado abandono dividido apenas por atendidas mais abandonadas e espera baseada em `tet`. As correcoes propostas continuam exigindo leitura atual das definicoes, instalacao transacional controlada e testes autenticados.

Contrato de homologacao pretendido: abandono operacional = recebidas com `ABANDON` dividido por todas as recebidas; TMA preserva a populacao de externas atendidas; TME de fila usa `tef` de recebidas atendidas com fila informada, com zero valido e sem converter nulos em zero. A documentacao LigSim distingue `tef` (fila) de `tet` (tempo total menos atendimento). Rotulos de fila nao devem ser aplicados automaticamente a todo `ABANDON` sem essa distincao.

A conexao PostgreSQL disponivel no n8n foi examinada apenas por metadados e pertence a outro banco, sem a tabela e a funcao alvo. Nenhuma alteracao foi feita nesse banco e a referencia temporaria foi retirada do diagnostico. A ferramenta Supabase conectada tambem nao expõe o projeto self-hosted do dashboard. Falta uma conexao administrativa autorizada para esse PostgreSQL; nao foi criado um atalho de SQL arbitrario, ampliada a RLS ou usado outro banco como substituto.

## Proximos criterios de aceite

1. Obter a conexao correta, reler funcoes, privilegios e policies atuais e conferir os hashes antes de usar qualquer proposta SQL anterior.
2. Aplicar as formulas em transacao e testar com perfis autorizados e nao autorizados, sem aumentar privilegios.
3. Conciliar as RPCs e as rotas autenticadas com os mesmos recortes ja verificados, recalculando medias por soma e quantidade, nunca por media simples de medias diarias.
4. Ajustar os rotulos dos cartoes e series junto do contrato SQL; testar filtros, limites do dia, periodos sem base e estados indisponiveis.
5. Auditar os meses anteriores antes de declarar o historico anual completo.

## Reversao e limites

O historico do n8n preserva a versao anterior. Restaurar uma versao como rascunho nao a publica automaticamente. A recuperacao de registros nao deve ser revertida por exclusao em massa: os registros foram comprovados na origem, e futuras sincronizacoes podem atualiza-los.

Sete dias nao cobrem interrupcoes maiores nem correcoes feitas pelo fornecedor em registros mais antigos. O limite de 5000 causa falha explicita; caso o volume o alcance, revisar a estrategia para janelas menores antes de aumentar limites. O historico anterior a novembro, as formulas SQL, a autorizacao das RPCs, a retirada de chaves antigas dos demais nos e a homologacao visual continuam pendentes. Nenhum deploy pelo Coolify foi realizado.
