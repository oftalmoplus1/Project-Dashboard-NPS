-- FASE 3B / PROPOSTA DE INSTALACAO: rascunho de layout por dashboard
-- NAO EXECUTADO NO SUPABASE SELF-HOSTED. Requer preflight antes da instalacao.
-- Um documento de EDICAO, nao uma definicao de grafico compartilhado/publicado.
-- Nao altera dados de chamadas, RPCs legadas, grants existentes ou dashboards publicados.
-- Para instalar: executar a transacao completa UMA vez, somente apos revisao.

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE TABLE dashboard_catalog.editor_layout_rascunhos (
 dashboard_id uuid PRIMARY KEY REFERENCES dashboard_catalog.dashboards(id) ON DELETE CASCADE,
 blocos jsonb NOT NULL DEFAULT '[]'::jsonb,
 revisao bigint NOT NULL DEFAULT 0 CHECK (revisao >= 0),
 atualizado_por uuid NOT NULL,
 atualizado_em timestamptz NOT NULL DEFAULT pg_catalog.now(),
 CONSTRAINT editor_blocos_formato CHECK (
  pg_catalog.jsonb_typeof(blocos) = 'array'
  AND pg_catalog.jsonb_array_length(blocos) <= 40
  AND pg_catalog.octet_length(blocos::text) <= 131072
 )
);
ALTER TABLE dashboard_catalog.editor_layout_rascunhos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE dashboard_catalog.editor_layout_rascunhos FROM PUBLIC, anon, authenticated;

-- SECURITY DEFINER SOMENTE NO SCHEMA PRIVADO. Rele papel de auth.users a
-- cada operacao: jamais confia em user_metadata/JSON recebido do navegador.
CREATE FUNCTION dashboard_catalog.editor_layout_ler(p_dashboard_id uuid)
RETURNS TABLE (revisao bigint, blocos jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
 v_user uuid := auth.uid();
 v_role text;
BEGIN
 IF v_user IS NULL THEN
  RAISE EXCEPTION 'Sessao obrigatoria' USING ERRCODE = '42501';
 END IF;
 SELECT u.raw_app_meta_data->>'dashboard_role' INTO v_role
 FROM auth.users u WHERE u.id = v_user;
 IF v_role IS DISTINCT FROM 'admin' THEN
  RAISE EXCEPTION 'Somente admin' USING ERRCODE = '42501';
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM dashboard_catalog.dashboards d
  WHERE d.id = p_dashboard_id AND d.estado = 'rascunho'
   AND d.codigo IS NULL AND d.publicado_em IS NULL
 ) THEN
  RAISE EXCEPTION 'Rascunho nao localizado' USING ERRCODE = 'P0002';
 END IF;
 RETURN QUERY
 SELECT COALESCE(l.revisao, 0)::bigint, COALESCE(l.blocos, '[]'::jsonb)
 FROM (SELECT 1) AS singleton
 LEFT JOIN dashboard_catalog.editor_layout_rascunhos l
 ON l.dashboard_id = p_dashboard_id;
END;
$$;

CREATE FUNCTION dashboard_catalog.editor_layout_salvar(
 p_dashboard_id uuid, p_revisao_esperada bigint, p_blocos jsonb
)
RETURNS TABLE (revisao bigint, blocos jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
 v_user uuid := auth.uid();
 v_role text;
 v_dashboard uuid;
 v_current bigint := 0;
 v_next bigint;
 v_item jsonb;
 v_old jsonb;
 v_frames jsonb := '[]'::jsonb;
 v_ids text[] := ARRAY[]::text[];
 v_id text;
 v_kind text;
 v_source text;
 v_metric text;
 v_x int;
 v_y int;
 v_w int;
 v_h int;
 v_name text;
 v_key text;
BEGIN
 IF v_user IS NULL THEN
  RAISE EXCEPTION 'Sessao obrigatoria' USING ERRCODE = '42501';
 END IF;
 SELECT u.raw_app_meta_data->>'dashboard_role' INTO v_role
 FROM auth.users u WHERE u.id = v_user;
 IF v_role IS DISTINCT FROM 'admin' THEN
  RAISE EXCEPTION 'Somente admin' USING ERRCODE = '42501';
 END IF;
 IF p_revisao_esperada IS NULL OR p_revisao_esperada < 0 OR
    p_blocos IS NULL OR pg_catalog.jsonb_typeof(p_blocos) <> 'array' OR
    pg_catalog.jsonb_array_length(p_blocos) > 40 OR
    pg_catalog.octet_length(p_blocos::text) > 131072 THEN
  RAISE EXCEPTION 'Layout ou revisao invalido' USING ERRCODE = '22023';
 END IF;

 -- Defende o banco mesmo se a aplicacao for contornada.
 FOR v_item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_blocos)
 LOOP
  IF pg_catalog.jsonb_typeof(v_item) IS DISTINCT FROM 'object' THEN
   RAISE EXCEPTION 'Componente invalido' USING ERRCODE = '22023';
  END IF;
  IF (SELECT COUNT(*) FROM pg_catalog.jsonb_object_keys(v_item)) <> 11 OR
     EXISTS (
      SELECT 1 FROM pg_catalog.jsonb_object_keys(v_item) AS k
      WHERE k NOT IN ('id','kind','title','x','y','w','h',
       'source','metric','chartOrientation','text')
     ) THEN
   RAISE EXCEPTION 'Campos nao permitidos' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.jsonb_typeof(v_item->'id') IS DISTINCT FROM 'string' OR
     pg_catalog.jsonb_typeof(v_item->'kind') IS DISTINCT FROM 'string' OR
     pg_catalog.jsonb_typeof(v_item->'title') IS DISTINCT FROM 'string' OR
     pg_catalog.jsonb_typeof(v_item->'metric') IS DISTINCT FROM 'string' OR
     pg_catalog.jsonb_typeof(v_item->'chartOrientation') IS DISTINCT FROM 'string' OR
     pg_catalog.jsonb_typeof(v_item->'text') IS DISTINCT FROM 'string' THEN
   RAISE EXCEPTION 'Tipos nao permitidos' USING ERRCODE = '22023';
  END IF;
  v_id := v_item->>'id';
  v_kind := v_item->>'kind';
  v_name := v_item->>'title';
  v_source := v_item->>'source';
  v_metric := v_item->>'metric';
  IF v_id !~ '^[a-zA-Z0-9_-]{1,64}$' OR v_id = ANY(v_ids)
   OR v_kind NOT IN ('kpi','line','bar','area','pie','donut','table','text')
   OR pg_catalog.char_length(v_name) > 80 OR
   pg_catalog.char_length(v_item->>'text') > 2000 OR
   v_item->>'chartOrientation' NOT IN ('vertical','horizontal') OR
   pg_catalog.jsonb_typeof(v_item->'source') NOT IN ('null','string') OR
   (v_source IS NOT NULL AND v_source NOT IN ('listar_filas','relatorio_chamadas')) OR
   (v_source IS NULL AND v_metric <> '') OR
   (v_source = 'listar_filas' AND v_metric NOT IN (
     '', 'received','answered','waiting_calls','abandon_less_30s',
     'abandon_more_30s','tma','tme')) OR
   (v_source = 'relatorio_chamadas' AND v_metric NOT IN ('','quantidade_chamadas')) OR
   (v_kind = 'text' AND (v_source IS NOT NULL OR v_metric <> '')) THEN
   RAISE EXCEPTION 'Componente nao permitido' USING ERRCODE = '22023';
  END IF;
  v_ids := pg_catalog.array_append(v_ids, v_id);
  FOR v_key IN SELECT pg_catalog.unnest(ARRAY['x','y','w','h']) LOOP
   IF pg_catalog.jsonb_typeof(v_item->v_key) IS DISTINCT FROM 'number'
     OR COALESCE((v_item->>v_key) ~ '^[0-9]{1,2}$', false) IS NOT TRUE THEN
    RAISE EXCEPTION 'Coordenada invalida' USING ERRCODE = '22023';
   END IF;
  END LOOP;
  v_x := (v_item->>'x')::int;
  v_y := (v_item->>'y')::int;
  v_w := (v_item->>'w')::int;
  v_h := (v_item->>'h')::int;
  IF v_w < 2 OR v_h < 2 OR v_x + v_w > 12 OR v_y + v_h > 50 THEN
   RAISE EXCEPTION 'Componente fora da grade' USING ERRCODE = '22023';
  END IF;
  FOR v_old IN SELECT value FROM pg_catalog.jsonb_array_elements(v_frames) LOOP
   IF v_x < (v_old->>'x')::int + (v_old->>'w')::int
    AND v_x + v_w > (v_old->>'x')::int
    AND v_y < (v_old->>'y')::int + (v_old->>'h')::int
    AND v_y + v_h > (v_old->>'y')::int THEN
    RAISE EXCEPTION 'Blocos sobrepostos' USING ERRCODE = '22023';
   END IF;
  END LOOP;
  v_frames := v_frames || pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('x',v_x,'y',v_y,'w',v_w,'h',v_h)
  );
 END LOOP;

 -- Lock do dashboard serializa escritas, inclusive se nao houver linha de layout.
 SELECT d.id INTO v_dashboard FROM dashboard_catalog.dashboards d
 WHERE d.id = p_dashboard_id AND d.estado = 'rascunho'
   AND d.codigo IS NULL AND d.publicado_em IS NULL
 FOR UPDATE;
 IF v_dashboard IS NULL THEN
  RAISE EXCEPTION 'Rascunho nao localizado' USING ERRCODE = 'P0002';
 END IF;
 SELECT l.revisao INTO v_current FROM dashboard_catalog.editor_layout_rascunhos l
 WHERE l.dashboard_id = p_dashboard_id;
 v_current := COALESCE(v_current, 0);
 IF v_current <> p_revisao_esperada THEN
  RAISE EXCEPTION 'Revisao modificada em outra sessao'
   USING ERRCODE = '40001';
 END IF;
 IF v_current >= 9223372036854775806::bigint THEN
  RAISE EXCEPTION 'Limite de revisoes atingido' USING ERRCODE = '22023';
 END IF;
 v_next := v_current + 1;
 INSERT INTO dashboard_catalog.editor_layout_rascunhos AS l
  (dashboard_id,blocos,revisao,atualizado_por,atualizado_em)
 VALUES (p_dashboard_id,p_blocos,v_next,v_user,pg_catalog.clock_timestamp())
 ON CONFLICT (dashboard_id) DO UPDATE SET
  blocos = excluded.blocos,
  revisao = excluded.revisao,
  atualizado_por = excluded.atualizado_por,
  atualizado_em = excluded.atualizado_em;

 INSERT INTO dashboard_catalog.auditoria
  (operador_id,acao,tipo_objeto,objeto_id,contexto)
 VALUES (v_user,'salvar_layout_rascunho','dashboard',p_dashboard_id,
  pg_catalog.jsonb_build_object('revisao',v_next,
   'quantidade_blocos',pg_catalog.jsonb_array_length(p_blocos)));
 RETURN QUERY SELECT v_next, p_blocos;
END;
$$;

CREATE FUNCTION public.dashboard_editor_layout_ler(p_dashboard_id uuid)
RETURNS TABLE (revisao bigint, blocos jsonb)
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$
 SELECT revisao,blocos FROM dashboard_catalog.editor_layout_ler(p_dashboard_id);
$$;
CREATE FUNCTION public.dashboard_editor_layout_salvar(
 p_dashboard_id uuid, p_revisao_esperada bigint, p_blocos jsonb
)
RETURNS TABLE (revisao bigint, blocos jsonb)
LANGUAGE sql SECURITY INVOKER SET search_path = ''
AS $$
 SELECT revisao,blocos
 FROM dashboard_catalog.editor_layout_salvar(p_dashboard_id,p_revisao_esperada,p_blocos);
$$;

REVOKE ALL ON FUNCTION dashboard_catalog.editor_layout_ler(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION dashboard_catalog.editor_layout_salvar(uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.dashboard_editor_layout_ler(uuid) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.dashboard_editor_layout_salvar(uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION dashboard_catalog.editor_layout_ler(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION dashboard_catalog.editor_layout_salvar(uuid,bigint,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_editor_layout_ler(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.dashboard_editor_layout_salvar(uuid,bigint,jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
