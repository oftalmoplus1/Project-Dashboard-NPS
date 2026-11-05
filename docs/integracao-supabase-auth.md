# Autenticação mínima — incremento de login

Implementado no código da branch de desenvolvimento:
- Login via POST servidor para `/auth/v1/token?grant_type=password` no Supabase self-hosted.
- Validação de identidade via `/auth/v1/user` e autorização por `app_metadata.dashboard_role`.
- Valores aceitos: `admin` (administrador) e `manager` (gestor).
- Cookie de acesso `HttpOnly`, `SameSite=Lax`, `Secure` em produção.
- Proteção no servidor de `/[section]`; redirecionamento de visitantes para `/login`.
- Logout local que apaga o cookie.

## Configuração local
Criar `.env.local` apenas na máquina de desenvolvimento (ignorado pelo Git):

```dotenv
SUPABASE_URL=https://supabase.oftalmoplus.com.br
SUPABASE_PUBLISHABLE_KEY=<chave-publicavel-ou-anon-do-self-hosted>
```

Não usar `service_role` nem chave secreta. Não compartilhar chaves no chat.
O hostname precisa apontar ao serviço Supabase self-hosted correto.

## Limitações e validações pendentes
- A sessão **não é renovada automaticamente**. Ao expirar o access token,
  é necessário entrar novamente. Isto evita armazenar refresh token antes
  de especificar renovação e revogação adequadas.
- O logout remove o cookie local; não revoga tokens já emitidos no Auth.
- Não há controle de tentativas de login próprio; depende dos limites do Auth.
- O dashboard de chamadas **continua simulado**. Nenhuma rota de telefonia real foi criada.
- A UI de outras seções permanece demonstrativa e protegida pelo mesmo login.
- O nome exibido na interface ainda é 'Administrador demo' e deve ser
  substituído em um incremento posterior.
- É necessário validar `npm run typecheck`, `npm run lint`, `npm run build`
  e testes manuais com conta autorizada, senha errada e sessão ausente.
- Se `SUPABASE_PUBLISHABLE_KEY` for uma chave nova incompatível com a
  versão self-hosted, usar a chave pública `anon` existente, nunca `service_role`.
- Antes de dados reais, confirmar permissões de leitura e RLS da fonte,
  além de proteger o endpoint agregado no servidor.

Nenhuma tabela, política, infraestrutura ou usuário foi alterado por este incremento.
