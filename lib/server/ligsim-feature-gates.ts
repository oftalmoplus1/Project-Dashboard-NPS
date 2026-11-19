import 'server-only';

/**
 * Activate only AFTER applying docs/sql/tef-2026-11-19-guarded.sql
 * to the dashboard's self-hosted PostgreSQL AND verifying the
 * authenticated summary + daily RPCs with a real administrator.
 * Default false prevents legacy TET from being mislabeled as TEF.
 */
export function isTefVerified(): boolean {
  return process.env.LIGSIM_TME_TEF_ENABLED === 'true';
}
