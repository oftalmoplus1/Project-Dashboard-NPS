# dashboard_tools — documentação do projeto

Aplicativo Next.js / TypeScript para dashboards gerenciais. Este documento descreve **o que está implementado**, a origem dos dados e as fórmulas utilizadas. Outros módulos permanecem demonstrativos ou planejados.

## Execução local

Requisitos: Node.js 20+ e npm.

```bash
npm install
npm run dev
```

Acesse http://localhost:3000. A rota `/chamadas` exige uma sessão autorizada.

## Verificações antes de integrar ou publicar

```bash
npm run typecheck
npm run lint
npm run build
```

## Situação dos módulos

| Módulo | Situação |
| --- | --- |
| Chamadas (`/chamadas`) | Integração real com Supabase via API do servidor |
| Visão geral e catálogo de dashboards | Conteúdo ilustrativo; números fictícios |
| Fontes, monitoramento, alertas, operações, usuários, auditoria e configurações | Telas planejadas, sem integração operacional completa |

Não utilizar dados demonstrativos como indicadores oficiais.

## Origem dos dados de chamadas

Fluxo: **LigSim → automação n8n → Supabase PostgreSQL → RPC de agregação → API Next.js → dashboard**.

- Fonte: `public.relatorio_chamadas`, alimentada pelo n8n por atualização de registros com conflito em `id`.
- Agendamento informado no fluxo n8n: `0 7-21/2 * * *`, fuso `America/Sao_Paulo` (7h, 9h, 11h, 13h, 15h, 17h, 19h e 21h).
- O navegador consulta `GET /api/chamadas?start=AAAA-MM-DD&end=AAAA-MM-DD` a cada 60 segundos enquanto a página estiver visível. **Isso não significa atualização da LigSim a cada minuto**.
- A API invoca a RPC `public.dashboard_chamadas_agregadas(p_inicio, p_fim)`, que encaminha a agregação protegida. A API retorna apenas contagens por período, nunca registros de chamadas individuais.
- O horário exibido como “última atualização bem-sucedida” corresponde à última consulta bem-sucedida **do dashboard**, não à última execução do n8n.

## Regras e cálculos dos indicadores de chamadas

**População analisada:** chamadas com `call_direction = 'Recebida'`, dentro do período selecionado no fuso `America/Sao_Paulo`. A agregação considera o identificador operacional `id` para não contar a mesma chamada repetidamente. A lógica de classificação é definida pela `disposition`:

| Indicador | Definição / fórmula |
| --- | --- |
| Registros recebidos (total) | Quantidade de chamadas recebidas distintas no período, incluindo todas as situações |
| Atendidas | Chamadas recebidas com `disposition = 'ANSWERED'` |
| Sem atendimento | Chamadas recebidas com `disposition = 'NO ANSWER'` |
| Abandonadas | Chamadas recebidas com `disposition = 'ABANDON'` |
| Outras | Chamadas recebidas com outras situações, não classificadas nas três categorias anteriores |
| Taxa de atendimento | `(atendidas / total) × 100` |
| Taxa de atendimento sem chamadas | Exibida como `—`, evitando divisão por zero |

**Invariante de conferência:** `total = atendidas + sem atendimento + abandonadas + outras`.

**Exemplo ilustrativo da fórmula:** para 100 chamadas recebidas, das quais 75 atendidas, 10 sem atendimento, 12 abandonadas e 3 em outras situações, a taxa de atendimento é `75 / 100 × 100 = 75%`. Os valores do exemplo não são dados reais.

### Como o gráfico é calculado

1. A RPC fornece contagens por intervalos de tempo; o frontend valida que cada linha possui contagens inteiras não negativas e que a soma das categorias coincide com o total.
2. **Um dia selecionado:** a implementação atual utiliza **12 intervalos de 2 horas**, de 00h–02h até 22h–24h. O gráfico **exibe apenas os intervalos iniciados a partir das 8h**; os cartões e o total geral continuam incluindo o dia completo.
3. **Períodos de vários dias:** o frontend consolida as linhas por dia; em períodos personalizados maiores que 62 dias, consolida por mês.
4. Cada coluna é **empilhada** com atendidas, sem atendimento e abandonadas. A altura total corresponde à soma dessas três categorias, **não necessariamente ao total de chamadas** quando existem registros em `outras`.
5. A altura visual é normalizada pelo maior valor entre os intervalos exibidos: `altura_da_coluna = (atendidas + sem_atendimento + abandonadas) / maior_soma_visível × altura_máxima`. Cada segmento ocupa a fração correspondente à sua categoria.
6. O gráfico apresenta marcações horárias intermediárias, mas **não dispõe ainda de agregação de uma hora por coluna**. Isso exige revisão da RPC e validação da regra antes da mudança.
7. A tabela detalhada apresenta todos os intervalos agregados, inclusive os anteriores às 8h.



### Cartões: abandono em fila, TMA e TME

Os três cartões foram adicionados à tela de chamadas. **Não existem valores fictícios nem cálculo por aproximação a partir das contagens**: quando a fonte ainda não estiver configurada ou retornar valor ausente, a interface apresenta `—` e informa que a fonte precisa ser validada.

A rota `GET /api/chamadas/indicadores?start=AAAA-MM-DD&end=AAAA-MM-DD` exige autenticação, valida período e consulta uma **RPC futura** `dashboard_chamadas_tempos_e_filas(p_inicio,p_fim)`. O Supabase self-hosted real não estava disponível nesta sessão; a RPC **não foi criada nem alterada**.

Contrato esperado da RPC (uma linha): `taxa_abandono_fila` (percentual de 0 a 100 ou NULL), `tma_segundos` (média em segundos ou NULL), `tme_segundos` (média em segundos ou NULL). Os valores só devem ser disponibilizados após revisão de RLS/autorização, teste de reconciliação e confirmação da fonte de eventos de fila.

- **Taxa de abandono em fila:** abandonos comprovados após entrar na fila / (atendimentos na fila + abandonos na fila) × 100. Nunca usar todos os `ABANDON` da tabela geral como numerador.
- **TMA:** `AVG(ta)` para `disposition = 'ANSWERED'`, `call_direction IN ('Recebida','Efetuada')`, `ta IS NOT NULL`. Inclui ligações administrativas externas e exclui ramais.
- **TME geral:** média de `tet` em chamadas externas atendidas com `tet` válido, usando a interpretação documentada da API; distingue-se do `tef` (espera específica em fila).
- O período deve ser interpretado em `America/Sao_Paulo`, com inclusividade equivalente ao filtro existente.
- O endpoint do aplicativo usa a sessão do usuário e chave pública, nunca `service_role` no cliente. Uma falha na RPC não deve apresentar zero como resultado.

Critérios antes de publicar valores reais: conciliar com SQL na fonte para um dia, um mês e período personalizado; validar ausência de dados; validar autorização de gestor/admin; verificar inexistência de dados de ligação identificáveis no retorno; executar lint, typecheck e build.

### Gráficos adicionais de chamadas

- **Chamadas por mês:** comparação de janeiro a dezembro do ano selecionado em barras horizontais empilhadas (atendidas, sem atendimento e abandonadas). Consulta o mesmo endpoint autenticado em seis intervalos bimestrais para evitar truncamento da resposta agregada; não modifica a RPC.
- **Chamadas por hora:** distribuição dos mesmos registros recebidos em faixas de **duas horas**, preservando a resolução existente na RPC. A interface declara explicitamente essa limitação; não interpola valores para cada hora.
- O gráfico diário/original, os indicadores e os filtros permanecem inalterados. O gráfico horário segue o intervalo do filtro principal; o gráfico mensal possui seletor de ano próprio.
- Os dados são contagens reais agregadas retornadas por `/api/chamadas`, nunca dados simulados. Meses anteriores ao primeiro registro disponível no ano e meses futuros não são exibidos como zeros operacionais.
- Para evoluir o gráfico horário para **uma hora exata**, será necessária uma nova versão da agregação na RPC, revisada quanto a permissões, desempenho e compatibilidade.

### Períodos disponíveis

- **Hoje** e **Ontem:** data local em `America/Sao_Paulo`, com agrupamento de 2 horas.
- **Últimos 7 dias:** hoje e os seis dias anteriores, por dia.
- **Este mês:** primeiro dia do mês até hoje, por dia.
- **Personalizado:** um dia usa agrupamento de 2 horas; de 2 a 62 dias, por dia; acima de 62 dias, por mês.
- A API valida datas e rejeita intervalos inválidos ou acima do limite permitido (diferença entre datas superior a 365 dias).

### Conciliação com a LigSim

Os números da LigSim podem diferir dos números no Supabase durante a janela de sincronização do n8n. Comparar somente **mesma data, mesmo fuso, mesmo horário de corte e mesmas definições de situação**. Não ajustar fórmulas para forçar coincidência sem identificar a causa da diferença.

## Segurança e privacidade

- A API de chamadas exige sessão e verifica o usuário antes de consultar a RPC.
- A consulta utiliza o token do usuário autenticado; não disponibilizar `service_role` no navegador.
- A agregação privilegiada fica em schema privado e deve verificar identidade e perfil autorizado (`admin` ou `manager`), conforme configuração do banco.
- Os dados de chamadas individuais e identificadores pessoais não são devolvidos à interface.
- A configuração e as permissões do banco devem ser verificadas no ambiente antes de alterações em novas tabelas ou schemas.
- Credenciais de integração do n8n devem permanecer no cofre de credenciais, nunca em arquivos JSON versionados.

## Integrações futuras: procedimento obrigatório

Para cada nova tabela ou schema, registrar antes da implementação: finalidade do dashboard; schema/tabela e colunas; significado de cada situação; chave de unicidade; fuso e campo de data; filtros; fórmula de cada KPI e gráfico; frequência de ingestão; perfis autorizados; RLS/permissões; critérios de aceite e exemplos para conferência.

Sequência: **descoberta → especificação das métricas → revisão de segurança → implementação incremental → testes → documentação → commit**.

Não criar tabelas, alterar políticas RLS, modificar funções existentes ou ampliar permissões sem autorização explícita.
