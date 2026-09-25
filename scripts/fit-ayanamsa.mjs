/**
 * Calibrates the ayanamsa constants in js/astro.js against Swiss Ephemeris.
 *
 * Our precession polynomial (Meeus ch.21) is not identical to the one Swiss
 * Ephemeris uses, so each ayanamsa needs its J2000 value and a small rate
 * correction fitted rather than guessed. This fits `resid = a + b*T` by least
 * squares over 1800-2100 and prints the constants to paste into AYANAMSA.
 *
 *   python3 -m venv env && ./env/bin/pip install pyswisseph
 *   ./env/bin/python -c "
 * import swisseph as swe, json
 * modes = {'lahiri':swe.SIDM_LAHIRI,'kp':swe.SIDM_KRISHNAMURTI,'raman':swe.SIDM_RAMAN,
 *          'fagan':swe.SIDM_FAGAN_BRADLEY,'trueCitra':swe.SIDM_TRUE_CITRA}
 * out={}
 * for name,m in modes.items():
 *     swe.set_sid_mode(m)
 *     out[name]=[[swe.julday(y,1,1,0.0), swe.get_ayanamsa_ut(swe.julday(y,1,1,0.0))]
 *                for y in range(1800,2102,2)]
 * open('ayan-all.json','w').write(json.dumps(out))"
 *   node scripts/fit-ayanamsa.mjs ayan-all.json
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
globalThis.PERTURBATIONS = require('../data/perturbations.js');
const Astro = require('../js/astro.js');

const reference = JSON.parse(readFileSync(process.argv[2] || 'ayan-all.json', 'utf8'));

for (const [mode, rows] of Object.entries(reference)) {
  const entry = Astro.AYANAMSA[mode];
  if (!entry) { console.log(`${mode}: not in AYANAMSA, skipping`); continue; }
  // Residual against the current constants, which we then re-fit.
  const points = rows.map(([jd, swiss]) => {
    const T = (jd + Astro.deltaT(jd) / 86400 - 2451545.0) / 36525;
    return { T, resid: swiss - Astro.ayanamsa(T, mode) };
  });
  const n = points.length;
  let sT = 0, sR = 0, sTT = 0, sTR = 0;
  for (const p of points) { sT += p.T; sR += p.resid; sTT += p.T * p.T; sTR += p.T * p.resid; }
  const b = (n * sTR - sT * sR) / (n * sTT - sT * sT);
  const a = (sR - b * sT) / n;
  const worst = Math.max(...points.map((p) => Math.abs(p.resid - (a + b * p.T))));
  console.log(`${mode.padEnd(10)} j2000: ${(entry.j2000 + a).toFixed(6)}  ` +
    `rate: ${(entry.rate + b * 3600).toFixed(3)}"/cy  residual: ${(worst * 3600).toFixed(3)}"`);
}
