# Integração do painel Hoje com `listar_filas` — 23/11/2026

## Objetivo

Exibir na aba **Chamadas > Visão geral > Hoje** a fotografia mais recente das filas da LigSim, a partir da tabela `public.listar_filas`, já abastecida pelo workflow n8n **Integration-LigSim-Supabase**. Remover a aba e a rota de ramais, sem alterar o histórico de chamadas ou a segurança existente.

## Fonte verificada

No workflow ativo, a API `/v2/queues` entrega `queues[]`; após o tratamento atual dos campos de metas, o n8n faz upsert por `id` em `/rest/v1/listar_filas?on_conflict=id`. Os campos observados na execução: `id`, `name`, `received`, `answered`, `abandon_more_30s`, `abandon_less_30s`, `waiting_calls`, `tma`, `tme`, campos operacionais de agentes, e outros.

**Limite essencial:** a tabela apresenta a última fotografia por fila. Não registra histórico temporal das amostras. O endpoint do Dashboard retorna `kind: latest_snapshot`, a hora da **consulta** (`consultedAt`) e a última atualização observada na origem (`sourceUpdatedAt`). A frequência efetiva depende do n8n; o navegador reconsulta periodicamente, mas isso não torna a origem "tempo real".

## Regras de exibição

- Só `Visão geral > Hoje` usa `listar_filas`. Os filtros Ontem, Últimos 7 dias, Este mês e Personalizado, além das abas Por mês, Por hora e Comparativo anual, continuam com `relatorio_chamadas` e RPCs existentes.
- Recebidas = soma de `received`; atendidas = soma de `answered`; abandonadas = soma de `abandon_more_30s + abandon_less_30s`. Percentuais usam os totais da MESMA fonte. `waiting_calls` aparece por fila; não integrar espera à contagem de abandonos.
- `NO ANSWER` e `Outras` não existem na tabela: mostrar traço, não zero. TMA e TME continuam nas RPCs CDR porque as médias de fila em string não têm população/ponderação validada; as origens ficam explicitadas.
- Se não houver linhas, o tipo de um campo divergir, contagens forem negativas/duplicadas/inconsistentes, a fonte estiver atrasada ou uma fila pertencer a outra coleta, não exibir resumo parcial como resultado válido. A interface pode preservar o último snapshot **do mesmo dia** em falhas transitórias, sinalizando isso, mas limpa os totais se a sessão ou permissão for negada.
- O botão Atualizar e o ciclo existente de 60 segundos reconsultam o endpoint autenticado `/api/chamadas/filas`. O cache é desativado.

## Segurança

- Autorização de papel administrador via `verifySupabaseUser` e cookie de sessão no servidor.
- A leitura da tabela **não é direta**: o backend usa a RPC `public.dashboard_ligsim_filas_ativas()`, delegando à função privada `dashboard_private.ligsim_filas_ativas()` com guarda de `auth.uid()` e `auth.users.raw_app_meta_data.dashboard_role = 'admin'`. O wrapper público é `SECURITY INVOKER`; a função privada, `SECURITY DEFINER`, tem `search_path` vazio, `EXECUTE` revogado de `PUBLIC`/`anon`, e autorização server-side. Nunca utilizar `service_role` nem conceder nova política de SELECT indiscriminado para `authenticated`.
- Projeção estrita de identificador, nome, contadores e `updated_at`; `member` e agentes nunca saem da função privada.
- Limite de 200 filas, exigência de atualização em até **3 horas** (o workflow está agendado a cada 2h), e associação à mesma coleta por uma janela de **5 minutos** a partir de `MAX(updated_at)`. Erro seguro se houver atraso ou lote inconsistente.
- Removidos a aba, o componente e o endpoint `/api/chamadas/ramais`; URLs antigas retornam 404 após deploy.
- Nenhuma alteração de grants, RLS, schema, Supabase, n8n ou segredos nesta entrega.

## Diagnóstico de 23/11/2026 e decisão operacional

No CSV da tabela, **11 linhas** estavam persistidas; 8 tinham `updated_at` de 23/11 às 09:00 (America/Sao_Paulo), enquanto IDs 5, 16 e 17 ainda tinham `updated_at` de 17/09. Na execução n8n 9430 (23/11 09:00, bem-sucedida), o `GET-Listar-Filas` retornou **exatamente os IDs 1,2,3,4,6,13,14,15**. Portanto a soma do último lote é **80 recebidas, 63 atendidas, 15 abandonadas**, não 83/64/16 incluindo as três filas antigas. Isso não demonstra que a API defina esses contadores como chamadas individuais do dia; não conciliar automaticamente com CDR.

As políticas RLS existentes permitem `SELECT` somente para `powerbi_user` e `mcp_readonly`; `authenticated` não herda esses papéis. Embora `authenticated` tenha ACL de leitura da tabela (inclusive `member`), a política RLS atual impede seu acesso direto. A solução é **não abrir uma política ampla**: instalar a RPC protegida em `docs/sql/dashboard_ligsim_filas_ativas_rpc.sql` e somente depois publicar o PR. O usuário decidiu prosseguir sem backup nesta etapa: a instalação cria exclusivamente duas funções dentro de transação, sem alterações na tabela ou RLS. O rollback restrito está em `docs/sql/dashboard_ligsim_filas_ativas_rollback.sql`. A ausência de backup reduz as opções de recuperação e foi explicitamente registrada.

## Verificação no Supabase self-hosted antes de homologar produção

Executar **somente leitura** no SQL Editor correto:

```sql
SELECT
  to_regclass('public.listar_filas') IS NOT NULL AS existe,
  has_table_privilege('authenticated', 'public.listar_filas', 'SELECT') AS authenticated_select,
  c.relrowsecurity AS rls_ativo
FROM pg_class c
WHERE c.oid = to_regclass('public.listar_filas');
```

OBS: este SELECT confere permissões de tabela, não substitui o teste da política RLS com JWT real. O teste final é instalar e auditar as RPCs, validar a rota `/api/chamadas/filas` na sessão de administrador (HTTP 200, dados válidos e fonte recente), gestor (403) e sem login (401). A função privada também precisa negar acesso ao gestor por conta própria. O SQL Editor com função administrativa não substitui chamadas autenticadas.

Os contadores de filas NÃO foram homologados como equivalentes aos totais CDR históricos. Uma conciliação deve comparar as duas fontes no mesmo instante e estabelecer se o snapshot LigSim se refere ao dia corrente ou a outro intervalo. Não intitular "total do dia" sem confirmar essa semântica.

## Risco de segurança identificado (n8n)

Uma configuração existente do workflow mantém um segredo de integração literal em um nó HTTP não relacionado à mudança aqui executada. Não registrar, divulgar ou replicar esse valor. Recomenda-se rotacionar a credencial e migrar para o cofre de credenciais do n8n, em intervenção isolada e com teste da integração afetada.

## Critérios de aceite

1. Dados da visão geral Hoje vêm somente da RPC restrita sobre `listar_filas`, incluindo o último lote válido de filas e totais, com hora da coleta explícita.
2. Períodos históricos preservam a mesma origem anterior, sem perda de filtros.
3. A ausência de históricos na fonte de filas é informada.
4. Tab Por ramal e endpoint `/api/chamadas/ramais` inexistentes.
5. Testes de payload, integridade, autorização, XSS via saída React, zero vs sem dados e responsividade aprovados.
6. Lint, TypeScript, build, testes HTTP e testes de navegador aprovados; RPC instalada com autorização administrativa, validação real de permissões e rollback documentado antes do deploy. Instalação sem backup por decisão do responsável, com risco residual registrado. A alteração de código sozinha não muda o banco.
