# Editor Visual — fase 4B: contrato de fonte histórica e consulta protegida

Data: 26/11/2026. **Entrega de integração preparada, não ativada em produção.**
Depende da fase 4A (PR #41). Esta fase não reintroduz o módulo Monitoramento.

## Resultado implementado

- \`lib/editor-evolution-verified.ts\`: validação estrita das configurações; parser da resposta da fonte homologada; agrupamentos diário, semanal e mensal com lacunas zero apenas quando existe movimentação; seleção dinâmica de filas autorizadas; 5/10/20/todas com ordenação determinística; bloqueia duplicatas, datas fora do período, dados extraviados e campos extras.
- \`app/api/editor/dashboards/[id]/evolution/route.ts\`: POST para prévia de administrador em um dashboard rascunho. Exige cookie com token verificado no Supabase Auth e papel administrador, origem confiável, JSON fechado, intervalo de no máximo 366 dias e limite de tamanho. Chama uma única RPC parametrizada com JWT do usuário; nenhuma consulta direta aos dados de chamadas; não usa \`service_role\`.
- O recurso começa **desativado**: \`EDITOR_EVOLUTION_SOURCE_VERIFIED\` ausente ou diferente de \`true\` retorna 503, sem usar dados fictícios. Não ativar essa variável enquanto o banco e a RPC não estiverem verificados.
- Testes de domínio e rotina CI, sem dados produtivos e sem migrations nesta fase.

## Contrato da futura RPC (NAO INSTALADA)

Nome: \`public.dashboard_editor_filas_evolucao\`. Parâmetros exatos:

\`\`\`text
p_dashboard_id uuid
p_inicio date
p_fim date
p_agrupamento text       -- day | week | month
p_todas_filas boolean
p_fila_ids text[]        -- [] quando todas; ids especificos quando selecionadas
\`\`\`

Retorno PostgREST esperado: uma linha contendo **apenas** \`queues\` e \`rows\` em JSON:

\`\`\`json
[
  {
    "queues": [{"id": "1", "name": "Atendimento Geral"}],
    "rows": [{"queueId": "1", "bucket": "2026-11-23",
              "received": 3, "answered": 2, "abandoned": 1}]
  }
]
\`\`\`

Campos \`bucket\`: data civil local \`YYYY-MM-DD\`; no agrupamento semanal, segunda-feira; no mensal, primeiro dia do mês. A RPC deverá devolver apenas períodos **com ao menos uma entrada**, pois a aplicação preencherá lacunas internas com zero. Um período inteiro sem registros gera \`rows=[]\`, estado vazio, não série de zeros. Sem registros no primeiro dia do mês/ano atual, a RPC deve validar escopo do rascunho e retornar sem linhas, mesmo que \`p_inicio > p_fim\`. O backend limita a 200 filas e 75.000 linhas agregadas; impedir excesso e consultas caras no próprio SQL.

**Autorização obrigatória da RPC** (não satisfeita apenas pelo endpoint):
1. \`auth.uid()\` existente, perfil \`admin\` atual lido de \`auth.users.raw_app_meta_data\`; nunca \`raw_user_meta_data\`.
2. \`p_dashboard_id\` precisa existir como rascunho acessível ao administrador; não autorizar publicada/ID arbitrário.
3. Resolver filas permitidas no servidor e no banco, com checagem das \`p_fila_ids\` explícitas. Quando \`p_todas_filas=true\`, incluir novas filas autorizadas automaticamente. Caso alguma ID não autorizada seja solicitada, **negar a operação**, não ocultá-la.
4. Fonte de fatos individualizados: cada passagem em fila é um evento independente, incluindo retorno. Atribuir ao dia de **entrada** da passagem, não ao dia de conclusão. Atendimento só na fila atendida; transferências sem atendimento não são abandono. Abandonos incluem todas as durações.
5. Agrupar e projetar exclusivamente fila/periodo/contagens, sem telefone, nome de agente, dst, src ou identificadores de chamada. Limitar cardinalidade, duração, colunas, tempo de execução e carga.
6. Função pública deve ser \`SECURITY INVOKER\`; eventual função \`SECURITY DEFINER\` fica em schema privado com \`search_path\` fixo, papel verificado, GRANTs restritos e justificativa. Nunca conceder SELECT amplo de dados de origem para solucionar ACL.
7. Validação de total: \`received >= answered + abandoned\` em cada fila/intervalo; sem valores negativos ou duplicidade de pares fila+período. Cada conjunto deve permanecer consistente com contagem de passagens individualizadas.

**Não criar essa função antes de identificar a fonte real e aprovar uma migração específica.** \`listar_filas\` é apenas snapshot atual por fila; \`relatorio_chamadas\` histórico CDR por registro não prova, por si, que há um evento para cada transferência/retorno. A RPC atual de duas horas não pode substituir eventos individuais de fila.

## Diagnóstico sem escrita (operador do self-hosted)

1. Executar **somente** \`docs/sql/editor_visual_fase4b_preflight_eventos_fila_20261126.sql\` na instância Supabase self-hosted correta. O projeto cloud conectado a esta conversa é outro banco.
2. Compartilhar resultados do inventário de colunas, índices e RPCs, sem exportar dados operacionais ou credenciais.
3. Somente se houver índice adequado e os tipos conhecidos, executar \`docs/sql/editor_visual_fase4b_amostra_agregada_20261126.sql\` para uma amostra limitada de 24h; não enviar IDs ou registros brutos.
4. Conferir se existe identificação confiável de passagem por fila (inclusive retorno à mesma fila), classificação dos desfechos e associação a filas autorizadas. Se não existir, o requisito depende de uma fonte adicional/captura histórica no n8n/LigSim; não simular.
5. Com resultados confirmados, elaborar SQL seguro, testar com conta admin e gestor, aprovar migração e só então liberar \`EDITOR_EVOLUTION_SOURCE_VERIFIED=true\` e conectar os componentes da UI ao endpoint.

## Limites

A rota e o parser foram escritos sem acesso ao banco self-hosted e não foram executados com dados reais. SQL de diagnóstico é read-only. Nenhum deploy, grants, RLS, schema ou rascunho atual foram alterados. A tela existente ainda usa componentes ilustrativos: a persistência atual exige 11 chaves por bloco, inclusive na validação SQL, e uma migração de contrato versionado precisa ser aprovada antes de salvar \`EvolutionConfig\`. Publicação permanece desabilitada.

Critérios técnicos: CI verde com testes unitários, lint, typecheck, build, smoke de autenticação e persistência antiga, além de contrato de erro seguro no caso de RPC ausente (503). Teste autenticado real depende da homologação da origem.
