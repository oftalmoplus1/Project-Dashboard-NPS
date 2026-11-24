# Fase 2B — Prévia administrativa segura dos indicadores de filas

Data: 24/11/2026. Estado: implementação preparada em branch, **não implantada em produção**.

## Evidência real já obtida

O responsável informou que o dashboard personalizado `teste` continuou listado após F5 na aplicação produtiva. Isto confirma persistência e recuperação administrativa do cadastro no fluxo testado. **Não valida** ainda controle de acesso de gestor/usuário, segurança de sessão, publicação ou configuração de gráficos.

## Escopo desta entrega

Construir uma **prévia administrativa sob demanda** dos indicadores consolidados da última coleta de `listar_filas`, dentro de `Administração > Fontes de dados`, sem alterar as tabelas, as RPCs existentes ou o editor visual.

**Componentes:**
- Módulo `lib/server/validated-queue-snapshot.ts`: extrai a lógica já usada no endpoint `/api/chamadas/filas`, preservando os controles de frescor, coorte de coleta, consistência e anonimização. O endpoint legado passa a reutilizar o módulo, sem alterar seu contrato.
- Nova rota fixa `GET /api/catalogo/fontes-editor/listar-filas/previa`: exige sessão administrativa tanto no Next.js quanto na RPC existente `dashboard_ligsim_filas_ativas`. Nunca aceita SQL ou identificador de tabela arbitrário.
- Interface de fontes com botão **Consultar prévia**: apenas quando solicitado, exibe valores agregados e a data/hora da coleta e da consulta, sem armazenamento persistente.
- Testes sintéticos no smoke HTTP: manager/anon/expirado negados antes de atingir a RPC, retorno mínimo, dados obsoletos/coortes inconsistentes recusados, zero permissões novas, apenas GET.

## Indicadores exibidos

| Indicador | Semântica |
| --- | --- |
| Recebidas | Soma dos contadores `received` do último lote de filas validado |
| Atendidas | Soma dos contadores `answered` |
| Abandonadas | Soma da divisão de abandono `abandon_less_30s` + `abandon_more_30s` já consolidada no parser |
| Em espera | Soma pontual de `waiting_calls` no último lote; **não** é um total diário |
| TMA / TME | Média aritmética simples dos tempos pré-calculados **entre filas elegíveis** com `answered > 0`; não é média ponderada por chamada |

Sem histórico artificial, sem contagem por intervalo arbitrário, sem publicação de dashboards, sem leitura de registros brutos. A saída não inclui identificadores de chamadas, ramais, telefones, nomes de agentes ou nomes das filas.

O catálogo continua com `consultasHabilitadas=false`, pois **a consulta genérica do editor de gráficos não foi habilitada**. Apenas a prévia agregada para administrador está disponível.

## Contrato de segurança

- A API verifica o usuário através do Supabase Auth em cada requisição e exige `app_metadata.dashboard_role = 'admin'` sob interpretação do servidor.
- A RPC existente reforça autorização com `auth.uid()` e `raw_app_meta_data`, em schema privado; nenhum `service_role` no navegador.
- Toda resposta usa `Cache-Control: private, no-store`; não aceita POST.
- Restringir resultados a valores agregados com fonte e frescor explícitos; falhas e dados obsoletos resultam em erro, não um valor zero fictício.
- Ao negar acesso, impedir a consulta à RPC, não apenas ocultar botão no navegador.
- A chamada só pode ser utilizada como prévia do administrador; futuras visualizações para consumidores precisam verificar ACL de tópico/dashboard e status publicado **em cada consulta**.

## Critérios de aceite

- Sem sessão: HTTP 401; manager/usuário sem role: HTTP 403; nenhum deles alcança a RPC.
- Admin: prévia retornada sem registros por fila; métricas e durações coerentes com o parser já validado.
- Dados obsoletos, filas de lotes distintos, payload vazio e contagens inválidas: HTTP 503; acesso à RPC negado: HTTP 403.
- Nenhuma métrica contém dados pessoais; não existem filtros SQL arbitrários; nenhuma mutação do banco.
- `/api/chamadas/filas` segue retornando o mesmo contrato testado; Call Center não sofre regressão.
- `npm run lint`, `npm run typecheck`, `npm run build` e toda a suíte HTTP/visual seguem aprovados no CI da nova branch.
- A experiência real de gestor e admin será conferida após eventual deploy manual aprovado no Coolify.

## Segurança operacional pendente — HTTPS

A última captura exibiu a aplicação em HTTP, com aviso **Não seguro**. A análise do código demonstra que `app/api/auth/login/route.ts` configura `Secure` no cookie de acesso **somente quando `APP_ORIGIN` aponta para HTTPS**. Em HTTP, o navegador pode transmitir credenciais e cookies sem proteção de transporte. Corrigir o acesso HTTPS é uma prioridade independente de criar dashboards.

Passos recomendados para o administrador da infraestrutura:

1. Escolher hostname de produção (por exemplo, `dashboards.seu-dominio.com.br`) e configurar o DNS para o servidor em que o recurso `dash-hub` está instalado. Não presumir que o hostname sugerido já exista.
2. Em Coolify `dash-hub > Domains`, configurar a URL iniciada por `https://` e TLS automático. Verificar proxy e acesso público às portas 80/443.
3. Ajustar `APP_ORIGIN` no Coolify para o **mesmo origin HTTPS**, mantendo as demais variáveis sem exposição. A mudança afeta validação da origem em POST de login e APIs administrativas; não aplicar antes de a rota HTTPS estar operacional.
4. Publicar manualmente, testar certificado válido e autenticação num novo navegador, verificar `Secure`, `HttpOnly`, `SameSite=Lax` no cookie, testar criar rascunho e encerrar sessão; conferir também proteção CSRF.
5. Somente após HTTPS validado, redirecionar HTTP para HTTPS, evitando interromper o acesso atual no meio do ajuste. Não alterar o proxy inteiro sem necessidade.
6. Não colocar segredos, JWT ou capturas de cookies em PRs ou mensagens.

Referência: https://coolify.io/docs/core/networking/domains

**Importante:** a decisão de não fazer homologação/backup foi registrada anteriormente. Esta fase modifica somente código em branch e não requer SQL. Nenhuma atualização de Coolify ou Supabase foi executada nesta entrega.

## Decisão atual do responsável — HTTPS adiado

O responsável decidiu **não configurar HTTPS nesta etapa**, deixando a melhoria para uma fase futura. Essa decisão substitui a recomendação anterior de concluir o HTTPS antes do avanço funcional.

**Consequências e restrições:**
- Não realizar agora mudanças em `Domains`, certificados, proxy ou `APP_ORIGIN` no Coolify.
- É possível continuar desenvolvendo o Editor Visual em branches e executando testes automatizados sem modificar o acesso atual.
- HTTP **não protege o tráfego contra interceptação ou alteração na rede**. Se o sistema é acessível pela Internet, login, sessão e dados em trânsito ficam expostos a riscos relevantes. Testes, permissões do Supabase, cookies `HttpOnly` e RLS não substituem criptografia de transporte.
- Até instalar HTTPS, evitar ampliar o número de usuários ou o acesso externo e não transmitir dados sensíveis nesse endereço. Recomenda-se restringir o acesso à rede confiável/VPN enquanto o risco persistir.
- Para eventual deploy funcional solicitado, explicitar novamente esse risco e conferir autorização, dados retornados e regressões, sem declarar o ambiente seguro.
- A correção futura deverá configurar URL `https://`, certificado confiável, `APP_ORIGIN` idêntico ao domínio HTTPS, cookies `Secure`, redirecionamento HTTP e testes de autenticação.

**Nenhuma mudança de infraestrutura, banco ou produção foi feita ao registrar essa decisão.**
