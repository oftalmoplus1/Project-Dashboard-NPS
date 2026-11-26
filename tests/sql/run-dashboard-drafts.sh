#!/usr/bin/env bash
# Teste destrutivo APENAS no banco Postgres temporario criado pelo GitHub Actions.
set -euo pipefail
: "${PGHOST:?Configurar PGHOST do servico Postgres temporario}"
: "${PGDATABASE:?Configurar PGDATABASE do servico Postgres temporario}"
: "${PGUSER:?Configurar PGUSER do servico Postgres temporario}"
: "${PGPASSWORD:?Configurar PGPASSWORD do servico Postgres temporario}"
if [[ "${PGHOST}" != "127.0.0.1" || "${PGDATABASE}" != "dashboard_drafts_ci" ]]; then
  echo "ERRO: recusado executar contra banco nao temporario" >&2
  exit 2
fi

psql -X -v ON_ERROR_STOP=1 -f tests/sql/dashboard-drafts-bootstrap.sql
psql -X -v ON_ERROR_STOP=1 -f docs/sql/dashboard_catalogo_fase2_estrutura.sql
psql -X -v ON_ERROR_STOP=1 -f tests/sql/dashboard-drafts-seed.sql
psql -X -v ON_ERROR_STOP=1 -f docs/sql/editor_visual_fase1_criar_rascunho_20261124.sql
psql -X -v ON_ERROR_STOP=1 -f tests/sql/dashboard-drafts-assert.sql

# Duas sessoes distintas criam rascunhos simultaneamente no mesmo topico.
# O SELECT FOR UPDATE do topico precisa serializar a alocacao de posicao.
psql -X -v ON_ERROR_STOP=1 -c  "SET ROLE authenticated;
  SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
  SELECT public.dashboard_catalogo_criar_personalizado('Simultaneo A',NULL,'relatorios');"   >/tmp/dashboard-drafts-parallel-a.log 2>&1 &
pid_a=$!
psql -X -v ON_ERROR_STOP=1 -c  "SET ROLE authenticated;
  SELECT set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000001',false);
  SELECT public.dashboard_catalogo_criar_personalizado('Simultaneo B',NULL,'relatorios');"   >/tmp/dashboard-drafts-parallel-b.log 2>&1 &
pid_b=$!
failed=0
wait "$pid_a" || { cat /tmp/dashboard-drafts-parallel-a.log; failed=1; }
wait "$pid_b" || { cat /tmp/dashboard-drafts-parallel-b.log; failed=1; }
if (( failed != 0 )); then exit 1; fi

psql -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  v_count bigint;
  v_unique bigint;
BEGIN
  SELECT COUNT(*),COUNT(DISTINCT posicao)
  INTO v_count,v_unique
  FROM dashboard_catalog.topico_dashboards
  WHERE topico_id='00000000-0000-4000-8000-000000000010';

  IF v_count <> 4 OR v_unique <> 4 THEN
    RAISE EXCEPTION 'Concorrencia nao atribuiu posicoes unicas: % e %', v_count, v_unique;
  END IF;
  IF (SELECT count(*) FROM dashboard_catalog.auditoria WHERE acao='criar_rascunho') <> 3 THEN
    RAISE EXCEPTION 'Eventos de auditoria ausentes apos concorrencia';
  END IF;
  IF (SELECT count(*) FROM dashboard_catalog.dashboards WHERE estado='publicado') <> 1
     OR (SELECT count(*) FROM dashboard_catalog.acesso_dashboards) <> 0 THEN
    RAISE EXCEPTION 'Publicacao ou grant inesperado';
  END IF;
END
$$;
SQL
# Fase 3B: executar preflight/posflight no banco EFEMERO de CI.
psql -X -v ON_ERROR_STOP=1 -f docs/sql/editor_visual_fase3b_preflight_PROPOSTA.sql
psql -X -v ON_ERROR_STOP=1 -f docs/sql/editor_visual_fase3b_layout_rascunho_PROPOSTA.sql
psql -X -v ON_ERROR_STOP=1 -f docs/sql/editor_visual_fase3b_posflight_PROPOSTA.sql
psql -X -v ON_ERROR_STOP=1 -f tests/sql/editor-layout-assert.sql
# Fase 4D: contrato V2 aplicado SOMENTE no Postgres efemero da CI.
psql -X -v ON_ERROR_STOP=1 -f docs/sql/editor_visual_fase4d_queue_config_PROPOSTA.sql
psql -X -v ON_ERROR_STOP=1 -f tests/sql/editor-queue-config-assert.sql
# Exercicio de rollback, depois que o layout V2 foi substituido por legado no teste.
psql -X -v ON_ERROR_STOP=1 -f docs/sql/editor_visual_fase4d_queue_config_ROLLBACK_PROPOSTA.sql
psql -X -v ON_ERROR_STOP=1 -f tests/sql/editor-queue-rollback-assert.sql
echo "POSTGRESQL_DRAFTS_INTEGRATION_PASSED"
echo "POSTGRESQL_EDITOR_LAYOUT_INTEGRATION_PASSED"
echo "POSTGRESQL_EDITOR_QUEUE_CONFIG_V2_PASSED"
echo "POSTGRESQL_EDITOR_QUEUE_CONFIG_ROLLBACK_PASSED"
