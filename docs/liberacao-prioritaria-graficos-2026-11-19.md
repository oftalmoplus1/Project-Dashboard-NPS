# Liberacao prioritaria de volume e abandono

## Escopo e limites

Correcoes prioritarias do PR #3: integridade de consulta, recebidas/atendidas/abandonadas, barras agrupadas, medias identificadas, dia completo e abandono sobre todas as recebidas. Mantidos autenticacao, JWT do usuario, RLS e contratos SQL. Nenhum acesso anonimo adicional ou service_role foi introduzido.

O acesso administrativo ao PostgreSQL self-hosted segue indisponivel. A mudanca para TME de fila TEF e a correcao da formula na RPC de tempos nao foram aplicadas. O cartao novo de abandono usa as contagens agregadas; outros consumidores da RPC legada nao sao corrigidos por este PR. A tela diaria legada de tempos permanece pendente. Nao declarar todos os indicadores temporais homologados.

## Dependencia

O audit de producao identificou PostCSS vulneravel. Foi aplicado override exato para 8.5.23 e regenerado o lockfile por npm, sem atualizar a versao principal do Next.js e sem audit fix --force. A tarefa temporaria que gravou exclusivamente manifest/lockfile na branch foi removida. O CI permanente tem apenas contents: read e bloqueia alertas high/critical de producao. Alertas moderados de desenvolvimento continuam sendo relatados para tratamento separado.

Referencias do mantenedor: GHSA-r28c-9q8g-f849 e GHSA-fxqj-rqcc-2cmp, corrigidas em versoes anteriores ou iguais a 8.5.23.

## Validacao

A suite de 54 testes e mantida. O novo smoke HTTP inicia o aplicativo compilado contra um Supabase sintetico em loopback e verifica sessao obrigatoria, negacao de perfis, datas, paginacao, contagem obrigatoria, vazio confirmado e compatibilidade das rotas. Nao usa dados operacionais ou credenciais reais. Nao substitui teste autenticado no Supabase real nem validacao visual em navegador.

A publicacao em main e a implantacao no Coolify sao eventos distintos. Um merge confirmado nao comprova que o ambiente ja esteja usando o novo commit. Registrar o SHA de merge e validar a implantacao antes de anunciar disponibilidade em producao. Ponto anterior de rollback: main 1a821b673c955517ba991713e2e9077794eb0ff8; nao reverter os registros recuperados no banco.
