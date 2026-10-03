import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
globalThis.PERTURBATIONS = require('../data/perturbations.js');
const A = require('../js/astro.js');
const { buildCatalogue } = await import('../scripts/archive-settings.mjs');

// Independent references: pyswisseph / Swiss Ephemeris 2.10.03, no external
// ephemeris files, set_sid_mode(SIDM_TRUE_PUSHYA), get_ayanamsa_ut(julday(...)).
// Seasons are essential: a January-only fit misses annual aberration.
const references = [
  [1800, 1, 19.932317487915384], [1800, 4, 19.933005176582213],
  [1800, 7, 19.929028952950972], [1800, 10, 19.93491545105077],
  [1900, 1, 21.32937968148842], [1900, 4, 21.33028967833964],
  [1900, 7, 21.326237908165837], [1900, 10, 21.331916092979995],
  [1927, 1, 21.706648550151783], [1927, 4, 21.707685667621334],
  [1927, 7, 21.703593859610905], [1927, 10, 21.709152503342935],
  [1953, 1, 22.070088855242574], [1953, 4, 22.071082844466304],
  [1953, 7, 22.067011584750475], [1953, 10, 22.072606526016358],
  [2000, 1, 22.72704803453314], [2000, 4, 22.72813653302981],
  [2000, 7, 22.7240570348487], [2000, 10, 22.72965288249162],
  [2026, 1, 23.090607256448266], [2026, 4, 23.091697461813823],
  [2026, 7, 23.08759851963373], [2026, 10, 23.09310325971657],
  [2100, 1, 24.125414891760045], [2100, 4, 24.126642498001416],
  [2100, 7, 24.12250169715881], [2100, 10, 24.127881402131976]
].map(([y, m, value]) => [A.julianDay(y, m, 1, 0), value]);
references.push(
  [2424986.6354166665, 21.70687678268243], // Benedict
  [2434503.715277778, 22.06911532955644], // Blair
  // Largest errors in a 109,938-day independent sweep, 1800-01-01..2100-12-31.
  [2389663.5, 20.34936596932407], [2388202.5, 20.293457094752526],
  [2391124.5, 20.405223882234964], [2403908.5, 20.89426266397703],
  [2405369.5, 20.95014415585328]
);
for (const [jd, expected] of references) {
  const T = (jd + A.deltaT(jd) / 86400 - 2451545) / 36525;
  const error = Math.abs(A.ayanamsa(T, 'pushya') - expected) * 3600;
  assert(error < 4, `Pushya JD ${jd}: ${error} arcseconds`);
}
const setting = buildCatalogue().settings.find(s => s.id === 'ayanamsa');
assert.equal(setting.defaultValue, 'lahiri');
const entry = setting.options.find(o => o.value === 'pushya');
assert.equal(entry.label, 'Pushya Paksha');
assert.deepEqual(entry.definition, A.AYANAMSA.pushya);
assert.equal(entry.definition.siderealLongitude, 106);
assert.equal(A.ayanamsa(0, 'lahiri'), 23.857092);
assert.equal(A.ayanamsa(0), A.ayanamsa(0, 'lahiri'));

const params = { jdUT: 2434503.715277778, latitude: 55.9521, longitude: -3.1965,
  tzOffsetMinutes: 60, trueNode: false, ayanamsa: 'pushya' };
const pushya = A.chart(params), lahiri = A.chart({ ...params, ayanamsa: 'lahiri' });
assert.equal(pushya.ayanamsaName, 'Pushya Paksha');
assert.equal(pushya.ayanamsaJ2000, A.ayanamsa(0, 'pushya'));
assert(pushya.planets.every(p => Number.isFinite(p.longitude)));
assert(Math.abs(pushya.ayanamsa - lahiri.ayanamsa) > 1);
// The database-backed chart uses this same assembly path. Reconstruct the
// tropical sampler to verify that selecting Pushya applies the same offset.
const sampled = A.assembleChart((body, jd) => A.meanTropicalOf(body, jd, false), params);
assert.deepEqual(sampled, pushya);
const edge = (await import('../supabase/functions/chart/_astro.mjs')).default;
assert.deepEqual(edge.chart(params), pushya);
console.log(`Pushya: ${references.length} independent references, chart/edge parity, catalogue and Lahiri default pass.`);
