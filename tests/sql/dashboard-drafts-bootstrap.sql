-- Banco temporario de CI, nao Supabase real.
-- Bootstrap minimo que emula somente os objetos usados pela Fase 1.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;

CREATE SCHEMA auth;
CREATE TABLE auth.users (
 id uuid PRIMARY KEY,
 raw_app_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
 raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE
AS $$
 SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

INSERT INTO auth.users (id,raw_app_meta_data,raw_user_meta_data) VALUES
 ('00000000-0000-4000-8000-000000000001','{"dashboard_role":"admin"}','{}'),
 ('00000000-0000-4000-8000-000000000002','{"dashboard_role":"manager"}','{"dashboard_role":"admin"}'),
 ('00000000-0000-4000-8000-000000000003','{"dashboard_role":"user"}','{}');

-- Usar esquema inicial real, carregado pelo script de teste logo em seguida.
