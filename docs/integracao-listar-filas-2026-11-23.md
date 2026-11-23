# Integração do painel Hoje com `listar_filas` — 23/11/2026

## Objetivo

Exibir na aba **Chamadas > Visão geral > Hoje** a fotografia mais recente das filas da LigSim, a partir da tabela `public.listar_filas`, já abastecida pelo workflow n8n **Integration-LigSim-Supabase**. Remover a aba e a rota de ramais, sem alterar o histórico de chamadas ou a segurança existente.

## Fonte verificada

No workflow ativo, a API `/v2/queues` entrega `queues[]`; após o tratamento atual dos campos de metas, o n8n faz upsert por `id` em `/rest/v1/listar_filas?on_conflict=id`. Os campos observados na execução: `id`, `name`, `received`, `answered`, `abandon_more_30s`, `abandon_less_30s`, `waiting_calls`, `tma`, `tme`, campos operacionais de agentes, e outros.

**Limite essencial:** a tabela apresenta a última fotografia por fila. Não registra histórico temporal das amostras. O endpoint do Dashboard retorna `kind: latest_snapshot`, e informa a hora da **consulta**, não da coleta original. A frequência efetiva depende do n8n; o navegador reconsulta periodicamente, mas isso não torna a origem "tempo real".

## Regras de exibição

- Só `Visão geral > Hoje` usa `listar_filas`. Os filtros Ontem, Últimos 7 dias, Este mês e Personalizado, além das abas Por mês, Por hora e Comparativo anual, continuam com `relatorio_chamadas` e RPCs existentes.
- Recebidas = soma de `received`; atendidas = soma de `answered`; abandonadas = soma de `abandon_more_30s + abandon_less_30s`. Percentuais usam os totais da MESMA fonte. `waiting_calls` aparece por fila; não integrar espera à contagem de abandonos.
- `NO ANSWER` e `Outras` não existem na tabela: mostrar traço, não zero. TMA e TME continuam nas RPCs CDR porque as médias de fila em string não têm população/ponderação validada; as origens ficam explicitadas.
- Se não houver linhas, o tipo de um campo divergir, contagens forem negativas/duplicadas/inconsistentes ou a resposta for truncada, não exibir resumo parcial como resultado válido. A interface pode preservar o último snapshot **do mesmo dia** em falhas transitórias, sinalizando isso, mas limpa os totais se a sessão ou permissão for negada.
- O botão Atualizar e o ciclo existente de 60 segundos reconsultam o endpoint autenticado `/api/chamadas/filas`. O cache é desativado.

## Segurança

- Autorização de papel administrador via `verifySupabaseUser` e cookie de sessão no servidor.
- Supabase consultado via JWT do usuário e chave pública configurada. Nunca utilizar `service_role` para contornar RLS. Se o banco negar SELECT, a rota devolve 403 sem expor registros.
- Projeção estrita de 7 colunas: `id,name,received,answered,abandon_more_30s,abandon_less_30s,waiting_calls`. Campos de membros/agentes nunca saem do servidor.
- Limite máximo 200 linhas e exigência de `Content-Range` com contagem exata; erro seguro para dados inconsistentes.
- Removidos a aba, o componente e o endpoint `/api/chamadas/ramais`; URLs antigas retornam 404 após deploy.
- Nenhuma alteração de grants, RLS, schema, Supabase, n8n ou segredos nesta entrega.

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

OBS: este SELECT confere permissões de tabela, não substitui o teste da política RLS com JWT real. O teste final é a rota `/api/chamadas/filas` na sessão de administrador (HTTP 200, dados válidos), gestor (403) e sem login (401).

Os contadores de filas NÃO foram homologados como equivalentes aos totais CDR históricos. Uma conciliação deve comparar as duas fontes no mesmo instante e estabelecer se o snapshot LigSim se refere ao dia corrente ou a outro intervalo. Não intitular "total do dia" sem confirmar essa semântica.

## Risco de segurança identificado (n8n)

Uma configuração existente do workflow mantém um segredo de integração literal em um nó HTTP não relacionado à mudança aqui executada. Não registrar, divulgar ou replicar esse valor. Recomenda-se rotacionar a credencial e migrar para o cofre de credenciais do n8n, em intervenção isolada e com teste da integração afetada.

## Critérios de aceite

1. Dados da visão geral Hoje vêm somente de `listar_filas`, incluindo a tabela de filas e totais.
2. Períodos históricos preservam a mesma origem anterior, sem perda de filtros.
3. A ausência de históricos na fonte de filas é informada.
4. Tab Por ramal e endpoint `/api/chamadas/ramais` inexistentes.
5. Testes de payload, integridade, autorização, XSS via saída React, zero vs sem dados e responsividade aprovados.
6. Lint, TypeScript, build, testes HTTP e testes de navegador aprovados, sem mudanças no banco real.
