/**
 * Type-only bridge for Next.js standalone TypeScript builds.
 * At runtime, Vinext/Cloudflare resolves "cloudflare:workers" natively.
 * Do not import this file or put any secrets here.
 */
declare module "cloudflare:workers" {
  export const env: Record<string, unknown>;
}
