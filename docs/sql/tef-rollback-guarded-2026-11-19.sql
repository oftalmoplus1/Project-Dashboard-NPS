-- Rollback guardado para a migracao docs/sql/tef-2026-11-19-guarded.sql.
-- NAO executar automaticamente: a reversao reintroduz o calculo legado de TET.
-- Requer operacao autorizada, backup e confirmacao de que as duas funcoes
-- correspondem EXATAMENTE as versoes propostas em 19/11/2026.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $rollback$
DECLARE
  v_summary text;
  v_daily text;
  v_new_summary text := $tef_summary$AVG(r.tef) FILTER (
                WHERE r.disposition='ANSWERED'
                  AND r.call_direction='Recebida'
                  AND NULLIF(pg_catalog.btrim(r.queuename),'') IS NOT NULL
                  AND r.tef >= 0
            ) AS tme$tef_summary$;
  v_old_summary text := $tet_summary$AVG(r.tet) FILTER (
                WHERE r.disposition='ANSWERED'
                  AND r.call_direction IN ('Recebida','Efetuada')
            ) AS tme$tet_summary$;
  v_new_count text := $recv$COUNT(*) FILTER (
                WHERE r.call_direction='Recebida'
            )::numeric AS recebidas$recv$;
  v_old_count text := $answered$COUNT(*) FILTER (
                WHERE r.call_direction='Recebida'
                  AND r.disposition='ANSWERED'
            )::numeric AS atendidas$answered$;
  v_new_daily text := $tef_daily$ROUND(
                (AVG(r.tef) FILTER (
                    WHERE r.call_direction='Recebida'
                      AND NULLIF(pg_catalog.btrim(r.queuename),'') IS NOT NULL
                      AND r.tef >= 0
                ))::numeric, 2
            )::double precision AS tme$tef_daily$;
  v_old_daily text := 'ROUND(AVG(r.tet)::numeric, 2)::double precision AS tme';
BEGIN
  IF pg_catalog.to_regprocedure('dashboard_private.chamadas_tempos_e_filas(date,date)') IS NULL
     OR pg_catalog.to_regprocedure('dashboard_private.chamadas_tempos_por_dia(date,date)') IS NULL THEN
    RAISE EXCEPTION 'Funcoes ausentes; rollback cancelado';
  END IF;
  v_summary := replace(pg_catalog.pg_get_functiondef(
    'dashboard_private.chamadas_tempos_e_filas(date,date)'::regprocedure), chr(13), '');
  v_daily := replace(pg_catalog.pg_get_functiondef(
    'dashboard_private.chamadas_tempos_por_dia(date,date)'::regprocedure), chr(13), '');
  IF pg_catalog.md5(v_summary) <> 'dfc28e632dfcd10160f45bdf44431be0'
     OR pg_catalog.md5(v_daily) <> '7ac4c7ca75ce51c5e13297e39021ecfa' THEN
    RAISE EXCEPTION 'Definicoes divergem da migracao TEF; rollback bloqueado';
  END IF;
  v_summary := replace(v_summary, v_new_summary, v_old_summary);
  v_summary := replace(v_summary, v_new_count, v_old_count);
  v_summary := replace(v_summary, 'NULLIF(recebidas,0)', 'NULLIF(abandonadas+atendidas,0)');
  v_daily := replace(v_daily, v_new_daily, v_old_daily);
  EXECUTE v_summary;
  EXECUTE v_daily;
  IF pg_catalog.md5(replace(pg_catalog.pg_get_functiondef(
       'dashboard_private.chamadas_tempos_e_filas(date,date)'::regprocedure), chr(13), ''))
       <> '90378552c08708ba38716db9001a0a6e'
     OR pg_catalog.md5(replace(pg_catalog.pg_get_functiondef(
       'dashboard_private.chamadas_tempos_por_dia(date,date)'::regprocedure), chr(13), ''))
       <> '7452654f11956d5718f4f2bbfd651562' THEN
    RAISE EXCEPTION 'Verificacao pos-rollback falhou; operacao revertida';
  END IF;
END
$rollback$;
COMMIT;

-- Depois de executar rollback, DESLIGAR LIGSIM_TME_TEF_ENABLED e redeploy.
-- Isso impede apresentar o TET legado como se fosse TEF.
