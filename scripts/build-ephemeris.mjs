/**
 * Builds the DynamoDB ephemeris payload from the local engine.
 *
 * WHAT IS STORED
 * Mean tropical longitude: no nutation, no ayanamsa. Both are cheap closed-form
 * expressions, so baking either into the table would freeze a choice the caller
 * should still get to make - a sidereal longitude is then just
 * `stored - ayanamsa(system)`, and all five ayanamsas keep working off one table.
 *
 * LAYOUT
 * One file per decade holding every body. Samples are Int32 little-endian in
 * units of 1e-5 degrees. That unit matters: at 1e-4 the 0.36" quantum was itself
 * the dominant error, swamping the sub-arcsecond interpolation the step sizes
 * were chosen to deliver. Int32 has the headroom, so the finer unit is free.
 *
 * Each decade carries two samples of padding at both ends so Catmull-Rom always
 * has its four points inside one item, even for a birth on 1 January.
 *
 *   node scripts/build-ephemeris.mjs out-dir
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.PERTURBATIONS = require('../data/perturbations.js');
const Astro = require('../js/astro.js');

/*
 * Step in days per body, each chosen so Catmull-Rom interpolation costs well
 * under half an arcsecond, measured across the full 1800-2100 range.
 *
 * Measuring at a single epoch is not enough and gave figures four times too
 * optimistic. These are geocentric longitudes, so each planet's curve turns
 * sharply at its retrograde stations, and that is where interpolation is worst;
 * a sample window that happens to miss a station will flatter the step size.
 */
const STEPS = {
  moon: 0.25, mercury: 0.5, venus: 1, sun: 4, mars: 2,
  jupiter: 4, saturn: 4, rahu: 32, rahuTrue: 2
};
const PAD = 2;
const FIRST_YEAR = 1800, LAST_YEAR = 2100, DECADE = 10;

/** Mean tropical longitude: apparent position with nutation taken back out. */
function meanTropical(body, jd) {
  const T = (jd + Astro.deltaT(jd) / 86400 - 2451545.0) / 36525;
  const nut = Astro.nutation(T);
  if (body === 'moon') return Astro.moonLongitude(T);
  if (body === 'rahu') return Astro.lunarNode(T, false);
  if (body === 'rahuTrue') return Astro.lunarNode(T, true);
  return Astro.norm360(Astro.apparentLongitude(body, T, nut).lon - nut.dpsi);
}

const outDir = process.argv[2] || 'ephemeris-out';
mkdirSync(outDir, { recursive: true });

const manifest = [];
let totalSamples = 0, totalBytes = 0;

for (let year = FIRST_YEAR; year <= LAST_YEAR; year += DECADE) {
  const startJd = Astro.julianDay(year, 1, 1, 0);
  const endJd = Astro.julianDay(Math.min(year + DECADE, LAST_YEAR + DECADE), 1, 1, 0);
  const item = { bucket: String(year), startJd, endJd, bodies: {} };

  for (const [body, step] of Object.entries(STEPS)) {
    const firstJd = startJd - PAD * step;
    const count = Math.ceil((endJd - firstJd) / step) + PAD + 1;
    const buf = Buffer.allocUnsafe(count * 4);
    for (let i = 0; i < count; i++) {
      const lon = Astro.norm360(meanTropical(body, firstJd + i * step));
      buf.writeInt32LE(Math.round(lon * 1e5), i * 4);
    }
    item.bodies[body] = { step, firstJd, count, data: buf.toString('base64') };
    totalSamples += count;
    totalBytes += buf.length;
  }

  const bytes = Object.values(item.bodies).reduce((n, b) => n + b.count * 4, 0);
  if (bytes > 380 * 1024) throw new Error(`decade ${year} is ${bytes} bytes, too close to the 400 KB item limit`);
  writeFileSync(join(outDir, `${year}.json`), JSON.stringify(item));
  manifest.push({ bucket: String(year), bytes });
}

writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log(`${manifest.length} decade items, ${totalSamples.toLocaleString()} samples, ` +
  `${(totalBytes / 1048576).toFixed(2)} MB of longitudes`);
console.log(`largest item: ${(Math.max(...manifest.map((m) => m.bytes)) / 1024).toFixed(1)} KB`);
