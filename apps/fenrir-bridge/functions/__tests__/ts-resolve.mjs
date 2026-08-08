/**
 * Node ESM resolve hook so `node --test` can run the Pages Functions sources directly.
 *
 * The functions/ tree is written for the Cloudflare/esbuild bundler, which resolves
 * extensionless relative imports (`from "./auth"`). Node's ESM resolver does not, so this
 * hook retries a failed relative specifier as `.ts`, then `/index.ts`. Node ≥22.6 strips
 * the types itself, which keeps the test run dependency-free.
 *
 * Registered via `--import ./functions/__tests__/register-ts-resolve.mjs`.
 */
export function resolve(specifier, context, nextResolve) {
  try {
    return nextResolve(specifier, context);
  } catch (error) {
    if (!specifier.startsWith(".")) throw error;
    for (const candidate of [`${specifier}.ts`, `${specifier}/index.ts`]) {
      try {
        return nextResolve(candidate, context);
      } catch {
        // try the next candidate
      }
    }
    throw error;
  }
}
