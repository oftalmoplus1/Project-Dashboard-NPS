import 'server-only';

/**
 * External origin of the dashboard, independent of the Next.js internal URL.
 * Coolify's compose.dashboard.yml requires APP_ORIGIN for deployments.
 *
 * Never build the trusted origin from Host / X-Forwarded-* headers, since those
 * can be influenced by clients when proxy trust rules are misconfigured.
 */
export function getPublicOrigin(request: Request): string {
 const configured = process.env.APP_ORIGIN?.trim();
 if (!configured) return new URL(request.url).origin;

 const url = new URL(configured);
 if (!['http:', 'https:'].includes(url.protocol) ||
     url.username || url.password ||
     url.pathname !== '/' || url.search || url.hash) {
  throw new Error('Invalid APP_ORIGIN.');
 }
 return url.origin;
}

/**
 * Origin and Fetch Metadata check for authenticated state-changing requests.
 * Missing Origin remains supported for non-browser clients as in the legacy
 * endpoints; cross-site requests are still rejected via Sec-Fetch-Site.
 */
export function allowedMutationOrigin(request: Request): boolean {
 const publicOrigin = getPublicOrigin(request);
 if (request.headers.get('sec-fetch-site') === 'cross-site') return false;
 const origin = request.headers.get('origin');
 return origin === null || origin === publicOrigin;
}
