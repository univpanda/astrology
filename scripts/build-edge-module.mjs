import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/*
 * The browser engine is a classic script so index.html also works from file://.
 * Supabase's Deno runtime needs ESM, so generate its ignored wrapper whenever
 * tests or deployment need it rather than relying on a file left by an earlier
 * deployment.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'js/astro.js'), 'utf8');
writeFileSync(resolve(root, 'supabase/functions/chart/_astro.mjs'),
  source + '\nexport default Astro;\n');
