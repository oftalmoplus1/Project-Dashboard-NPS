# LigSim: entrega em ordem de prioridades (19/11/2026)

## 1. TME de fila por TEF

O campo `tef` da API LigSim mede espera em fila. `tet` mede espera total e nao e intercambiavel. TMA continua sendo media de `ta` das chamadas externas atendidas com valor nao nulo.

Criado `docs/sql/tef-2026-11-19-guarded.sql` para as funcoes privadas consolidada e diaria. Nao altera contrato, owners, grants, tabelas ou RLS. Se as definicoes SQL do banco divergirem da exportacao de 13/11/2026, aborta integralmente: os hashes sao um mecanismo de protecao e NAO devem ser removidos. O patch muda:
- TME consolidado para media de `tef`, em recebidas atendidas com `queuename` nao vazio e `tef >= 0`.
- TME diario para a MESMA populacao; 0 valido e mantido.
- Abandono legado consolidado para `ABANDON / todas as recebidas` como no cartao existente. Sem filtro de fila no abandono.
- TMA permanece igual.

**Obrigatorio antes da instalacao:** conferir backup recuperavel, conexao administrativa ao Supabase self-hosted do Dashboard, reler `pg_get_functiondef` das duas funcoes e confirmar que os hashes esperados continuam atuais. Testar 12/11, 01-12/11 e outubro (recuperacoes posteriores alteram contagens), testar admin/gestor/anonimo, comparar TMA antes/depois e validar as duas RPCs autenticadas. Em seguida, configurar `LIGSIM_TME_TEF_ENABLED=true` no Coolify e fazer deploy. Sem essa validacao, manter a variavel ausente/false: TME exibira `—`, sem rotular TET como TEF, e o grafico diario indicara explicitamente o TET legado.

**NAO executado automaticamente:** o MCP Supabase disponivel nesta sessao aponta para `patrimind-dev`, nao para o Supabase do Dashboard. Nao executar a migracao no projeto errado.

## 2. Comparativo anual

A aba compara recebidas, atendidas e abandonadas entre o ano escolhido e o anterior, consultando as RPCs agregadas existentes por periodos curtos. Se o ano corrente esta em andamento, compara os mesmos intervalos de calendario (p.ex. 01/01-19/11 em ambos os anos); se encerrado, compara anos inteiros. Crescimento ou queda = (atual - anterior) / anterior * 100. Base anterior zero = percentual indisponivel, nao infinito/zero. Linha horizontal de media entre os dois volumes anuais para uma serie selecionada, em grafico unico de colunas verticais agrupadas: tres categorias no eixo X (Recebidas, Atendidas, Abandonadas), volume no eixo Y, uma coluna por ano. As cores distinguem ano selecionado e anterior.

A consulta da RPC pode estar completa sem comprovar que a integracao historica LigSim esta completa. A interface informa esse limite. Nao inferir historico ausente como dados corretos. Ano sem historico e representado por 'Sem dados', sem desenhar coluna de valor zero; nao exibir media nem variacao quando faltar um dos anos. Quando ambos os anos tem dados e o anterior tem zero chamadas validas, manter a variacao indefinida. Valores exibidos sobre as colunas; titulo acessivel e detalhes para mouse/teclado. A area do grafico pode rolar horizontalmente no celular, sem rolagem horizontal do documento.

## 3. Atendidas por ramal

A LigSim documenta `GET /v2/reports/chartcallsipdst/{start}/{end}`, cuja resposta esperada e `data.data: [{answered: string, total: number}]`. Esta rota agora e acessada **somente no servidor**, mediante sessao do Dashboard com papel `administrador`. A interface apenas solicita a rota interna `/api/chamadas/ramais`, com datas validas e no maximo 365 dias. Chave e URL ficam no ambiente do Coolify.

Variaveis necessarias (somente server-side; nunca `NEXT_PUBLIC_`):

```env
LIGSIM_API_BASE_URL=https://app-vta.drcall.com.br:3030/v2
LIGSIM_INTEGRATION_KEY=<definir na configuracao secreta do Coolify>
LIGSIM_TME_TEF_ENABLED=false
```

Nao adicionar chave verdadeira em commits, logs, screenshots ou mensagens. A rota exige HTTPS com base terminada em `/v2`, timeout e esquema estrito, e retorna somente identificador + quantidade; nao passa gravacoes, senhas SIP, telefonia detalhada ou metadados privados. Se a API nao estiver acessivel a partir do container, nao trocar por valores de exemplo.

## 4. Conciliacao

A homologacao dos numeros deve usar o mesmo fuso (`America/Sao_Paulo`), a mesma janela e a mesma populacao, com atencao a paginacao e lacunas historicas. Verificar a taxa de abandono e a composicao por status, as medias de TA/TEF por somas e contagens, a serie diaria e a equivalencia de periodos anuais. O workflow ativo `Integration-LigSim-Supabase` nao foi modificado nesta etapa.

## Validacao e rollout

- Suite `node --test tests/call-data.test.mjs tests/call-center-design.test.mjs tests/ligsim-reports.test.mjs`.
- CI: lint, typecheck, build, smoke HTTP e navegador com dados sinteticos.
- O teste sintetico nao comprova retorno real da API LigSim, SQL instalado ou implantacao no Coolify.
- Reversao de codigo pelo Git; para SQL a reversao exige reavaliar a definicao do banco e restaurar o snapshot validado, nunca executar o antigo script sem checagem de estado.

## Limites

O status "implementado no codigo" nao equivale a "integrado e homologado em producao". A variavel TEF deve permanecer desligada ate instalacao SQL e testes reais. O endpoint de ramais depende de nova credencial server-side e conectividade HTTPS do ambiente. Nunca publicar a `main` antes dos gates e da revisao de CI.
