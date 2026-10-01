/*
 * How common each yoga and each graha state is, measured rather than guessed.
 *
 * A finding means more when it is rare. Raja yoga by the angle-and-trine rule
 * turns up in most charts and says correspondingly little about any one of
 * them; Adhi yoga turns up in about one in a hundred. The card prints the
 * figure beside the name so a reader can tell those apart without having to
 * have seen a thousand charts first.
 *
 * Sampled across a century and five latitudes, stepping the clock and the day
 * so the ascendant is not read off one hour or one place: a yoga that depends
 * on houses would otherwise be measured on a single rising sign.
 *
 *   node scripts/build-frequencies.mjs > data/frequencies.js
 */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);

global.PERTURBATIONS = require('../data/perturbations.js');
const Astro = (global.Astro = require('../js/astro.js'));
const Yogas = (global.Yogas = require('../js/yogas.js'));
const Shadbala = (global.Shadbala = require('../js/shadbala.js'));

const GRAHAS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn',
  'Rahu', 'Ketu'];
const PLACES = [
  [28.61, 77.21, 330], [40.71, -74.01, -300], [-33.87, 151.21, 600],
  [51.51, -0.13, 0], [-23.55, -46.63, -180]
];

let charts = 0;
const yoga = {}, state = {}, yogaNoFloor = {};
/*
 * By the name the card prints, as well as by the pair the library is keyed on.
 * A family sharing one passage shares one subject, so Nabhasa's thirty-two
 * figures would all carry the family's figure - one of them holds in every
 * chart - where Chakra is one in thousands and Pasa is two in five.
 */
const byTitle = {}, byManifestation = {};
const titleByDivision = {}, manifestationByDivision = {};

/*
 * A manifestation is the stable route by which a named yoga formed, not the
 * chart-specific sentence that describes the grahas and houses involved.  The
 * latter is deliberately prose; using it as a key would make almost every
 * chart its own "route".  Detectors with several clauses supply `route`; the
 * common one-route detectors fall back to their existing kind/condition.
 */
const manifestationKey = function (f) {
  const route = Array.isArray(f.route) ? f.route.slice().sort().join('+')
    : f.route || f.kind || f.condition || 'general';
  return f.title + '|' + route;
};
for (let y = 1930; y < 2030; y++) {
  for (let m = 1; m <= 12; m++) {
    for (let step = 0; step < 8; step++) {
      const place = PLACES[(y + m + step) % PLACES.length];
      // Walk the clock and the date by coprime strides, so a century of
      // samples does not land on the same hour or the same day of the month.
      const hour = ((y * 7 + m * 5 + step * 3) % 24) + 0.5;
      const day = ((y * 3 + m * 11 + step * 7) % 28) + 1;
      const chart = Astro.chart({
        jdUT: Astro.julianDay(y, m, day, hour - place[2] / 60),
        latitude: place[0], longitude: place[1], tzOffsetMinutes: place[2]
      });
      /*
       * Two facts about the native that some readings turn on. Mahabhagya is
       * defined for a man or a woman and tests the birth against sunrise, so a
       * sweep that left both unset would measure the undetermined case - which
       * reports both halves - and print a figure no real chart can have. The
       * sexes alternate because roughly half of people are each.
       */
      chart.gender = step % 2 ? 'female' : 'male';
      const up = Astro.sunriseSunset(chart.julianDay, place[0], place[1], false);
      const down = Astro.sunriseSunset(chart.julianDay, place[0], place[1], true);
      chart.dayBirth = up === null || down === null ? undefined
        : chart.julianDay > up && chart.julianDay < down;
      charts++;

      const at = {};
      chart.planets.forEach(function (p) { at[p.name] = p; });
      const sun = at.Sun;
      GRAHAS.forEach(function (g) {
        if (!at[g]) return;
        const bump = function (k) { state[k] = (state[k] || 0) + 1; };
        if (at[g].retrograde) bump(g + '/R');
        if (g !== 'Sun' &&
            Astro.isCombust(g, at[g].longitude, sun.longitude, at[g].retrograde)) {
          bump(g + '/C');
        }
        if (Astro.isYogakaraka(g, chart.ascendant.sign)) bump(g + '/Y');
        if (Astro.isVargottama(at[g].longitude)) bump(g + '/V');
        // Hemmed between one kind on both sides - the [P] and [S] the card
        // shows, which had no measured figure because nothing swept for them.
        const ben = Astro.naturalBenefics(chart);
        if (Astro.hemmedByMalefics(g, at[g].sign, chart, ben)) bump(g + '/P');
        if (Astro.hemmedByBenefics(g, at[g].sign, chart, ben)) bump(g + '/S');
      });

      // Once per chart, not once per graha: the question is how often a chart
      // holds the yoga at all.
      const strengths = Shadbala.compute(chart, {
        latitude: place[0], longitude: place[1], tzOffsetMinutes: place[2]
      });
      const sweep = function (into, titles, manifestations) {
        const seen = {}, seenTitle = {}, seenManifestation = {};
        Yogas.detect(chart, strengths).forEach(function (f) {
          const k = (f.subject || '?') + '|' + (f.condition || '?');
          if (!seen[k]) { seen[k] = 1; into[k] = (into[k] || 0) + 1; }
          if (!f.title) return;
          if (titles && !seenTitle[f.title]) {
            seenTitle[f.title] = 1;
            titles[f.title] = (titles[f.title] || 0) + 1;
          }
          if (manifestations) {
            const mk = manifestationKey(f);
            if (!seenManifestation[mk]) {
              seenManifestation[mk] = 1;
              manifestations[mk] = (manifestations[mk] || 0) + 1;
            }
          }
        });
      };
      sweep(yoga, byTitle, byManifestation);
      /*
       * Reference is evidence for where a yoga was found in this chart, not a
       * different route by which the yoga forms and not another opportunity
       * for it to enter the sample. Measure the canonical divisional chart
       * once. The same rate is then shown whether this chart happened to
       * expose that route from the ascendant, Moon, Sun or several of them.
       */
      Astro.SHODASAVARGA.forEach(function (division) {
        const inDivision = Astro.chartInDivision(chart, division);
        const seenTitle = {}, seenManifestation = {};
        Yogas.detect(inDivision, strengths).forEach(function (f) {
          if (!f.title) return;
          seenTitle[f.title] = 1;
          seenManifestation[manifestationKey(f)] = 1;
        });
        Object.keys(seenTitle).forEach(function (title) {
          const key = division + '|' + title;
          titleByDivision[key] = (titleByDivision[key] || 0) + 1;
        });
        Object.keys(seenManifestation).forEach(function (manifestation) {
          const key = division + '|' + manifestation;
          manifestationByDivision[key] = (manifestationByDivision[key] || 0) + 1;
        });
      });
      /*
       * Again with Raman's floor dropped, because a setting that changes what
       * forms changes how often it forms, and the card would otherwise print a
       * figure measured under a rule the reader has turned off. Only the pairs
       * that actually move are kept.
       */
      chart.budhaAdityaFloor = Yogas.BUDHA_FLOOR.NONE;
      sweep(yogaNoFloor);
      chart.budhaAdityaFloor = undefined;
    }
  }
}

const pct = function (n) { return Math.round((1000 * n) / charts) / 10; };
const moved = {};
Object.keys(yogaNoFloor).forEach(function (k) {
  if (yogaNoFloor[k] !== yoga[k]) moved[k] = yogaNoFloor[k];
});
const dump = function (o) {
  return Object.keys(o).sort().map(function (k) {
    return '    ' + JSON.stringify(k) + ': ' + pct(o[k]);
  }).join(',\n');
};

process.stdout.write(`/*
 * Generated by scripts/build-frequencies.mjs - do not edit by hand.
 *
 * How often each yoga and each graha state turns up, as a percentage of
 * ${charts} charts sampled across 1930-2029 and five latitudes, stepping the
 * clock and the day so the ascendant is not read off one hour or one place.
 *
 * The card prints these beside a finding because rarity is most of what makes
 * one worth noticing, and it is not something a reader can judge unaided.
 */
var FREQUENCIES = {
  charts: ${charts},
  yoga: {
${dump(yoga)}
  },
  state: {
${dump(state)}
  },
  /*
   * Overrides for the Budha-Aditya setting when Raman's floor is dropped for
   * Rao's reading. Only the pairs the setting actually moves appear here.
   */
  yogaNoFloor: {
${dump(moved)}
  },
  /*
   * By the name printed on the card. Preferred over the pair above, so a family
   * sharing one passage still reports each figure at its own rate.
   */
  yogaTitle: {
${dump(byTitle)}
  },
  /*
   * By named yoga and the route that made it. A chart is counted once for a
   * route even when several graha pairs make that route in the same chart.
   */
  yogaManifestation: {
${dump(byManifestation)}
  },
  yogaTitleByDivision: {
${dump(titleByDivision)}
  },
  yogaManifestationByDivision: {
${dump(manifestationByDivision)}
  }
};

if (typeof module !== 'undefined' && module.exports) module.exports = FREQUENCIES;
`);
