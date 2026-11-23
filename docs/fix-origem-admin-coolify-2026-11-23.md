# Correção: origem inválida nas ações administrativas sob Coolify

Data: 2026-11-23
Evidência: navegador recebe HTTP 403 com `{"error":"Origem inválida."}` ao tentar vincular "Chamadas por mês" a Call Center.

## Causa-raiz
As rotas de escrita do catálogo comparavam o cabeçalho `Origin` do navegador com `new URL(request.url).origin`. No Coolify, o proxy reverso expõe a aplicação por uma URL externa, mas encaminha a requisição ao Next.js por um endereço interno distinto. Assim, uma ação legítima era negada **antes de consultar a função do Supabase**, mesmo com RPC e grants instalados.

A aplicação já configura `APP_ORIGIN` no `compose.dashboard.yml`, variável utilizada pela rota de login e obrigatória no Coolify. Ela é a fonte confiável da origem pública.

## Solução
- Novo helper `lib/server/public-origin.ts` valida `APP_ORIGIN` como URL http/https sem caminho, credenciais, query ou fragmento. Sem `APP_ORIGIN` aplica o comportamento anterior da URL do request apenas para contextos locais.
- POST de criar tópico, PATCH de editar tópico, DELETE de excluir tópico e POST de vincular dashboard comparam o `Origin` à origem pública configurada; também rejeitam `Sec-Fetch-Site: cross-site`.
- Configuração inválida gera erro 503 explícito; origem externa gera 403. Não inferir origens confiáveis a partir de `Host` ou `X-Forwarded-Host` recebidos do cliente.
- Mantidas autenticação, papel administrativo no servidor, token do usuário, regras do PostgREST e RLS, validação de payload e estado `Cache-Control: private, no-store`.
- Nenhuma mudança em dados LigSim, Supabase, schema, RPC, grants, indicadores, dependências ou frontend. Nenhum dashboard será associado automaticamente.

## Implantação e aceite
1. Confira no Coolify `APP_ORIGIN`: deve ser **exatamente** a origem pública exibida no navegador, com o protocolo correto e porta quando aplicável, sem caminho final. Ex.: `http://dashboard.exemplo.com` ou `https://dashboard.exemplo.com`.
2. Fazer deploy do commit aprovado da `main`; não usar somente Restart.
3. Abrir Gerenciar Tópicos > Call Center > Adicionar dashboard existente > Chamadas por mês.
4. Esperado: requisição POST `/api/catalogo/topicos/relatorios/dashboards` responde HTTP 200 com `id`, contagem do tópico sobe para 3 e o link aparece.
5. Associar Chamadas por hora e Comparativo anual; conferir cinco dashboards ao final. Se surgir outro erro, inspecionar a resposta, pois não será mais erro de origem.
6. Validar PATCH e DELETE com conta admin em um tópico descartável **sem excluir Call Center**. Gestor deve continuar bloqueado (403); origem diferente e `Sec-Fetch-Site: cross-site` devem continuar bloqueados (403).

## Teste automatizado
`node tests/smoke-admin-catalog.mjs` simula Supabase e simula proxy reverso com `APP_ORIGIN` diferente da URL interna do Next.js. Verifica POST real de associação, PATCH, rejeição de origem externa, `X-Forwarded-Host` falso e Fetch Metadata cross-site. Testes são sintéticos, não prova de deploy.

## Reversão
Reverter o commit de código que introduziu a correção. Nenhum SQL ou ajuste de banco é necessário para revertê-la.
