# Integração Supabase Auth — preparação (não ativada)

Esta etapa adiciona apenas utilitários de validação de configuração e verificação
de identidade no servidor. Não cria usuários, não altera políticas RLS,
não modifica tabelas, não consulta telefonia e não ativa rotas públicas.

## Regras de segurança

- A fonte é o Supabase self-hosted autorizado, não outro projeto conectado.
- O token deve ser validado com o endpoint Auth `/auth/v1/user`.
- A autorização requer `app_metadata.dashboard_tools_role` igual a
  `administrador` ou `gestor`; `user_metadata` não é confiável.
- A existência desse metadado e o provisionamento de usuários **não foram verificados**.
- A aplicação ainda não tem fluxo de login ou cookie de sessão.
- Nenhuma rota de dados reais pode ser ativada sem autenticação e autorização
  aplicadas no servidor e sem testes de acesso negado.
- Nunca enviar service_role, credenciais de banco, números telefônicos ou
  registros individuais ao cliente.

## Pendências antes da ativação

1. Confirmar a disponibilidade e o modo de provisionamento de usuários no Auth
   self-hosted, sem executar operações administrativas nesta etapa.
2. Definir como os perfis serão atribuídos com segurança no lado administrativo.
3. Implementar login, renovação e logout de sessão com armazenamento seguro.
4. Implementar consulta agregada somente leitura com escopo temporal validado.
5. Verificar bloqueio de usuários não autenticados, sem perfil e com sessão inválida.
6. Validar typecheck, lint e build localmente.

As regras avançadas de administração e sessões continuam adiadas.
