/*
 * yogas.js - combinations found in a chart.
 *
 * One yoga so far, deliberately: the shape here is meant to take more. Each
 * detector returns zero or more findings of the same form, so the page renders
 * them without knowing which yoga produced which.
 */
var Yogas = (function () {
  'use strict';

  var GRAHAS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

  // The 3rd is the house that makes an exchange mixed rather than good; the
  // 6th, 8th and 12th are the ones that spoil it.
  var DUSTHANA = [6, 8, 12];
  var UPACHAYA_MIXED = 3;

  /**
   * Parivartana: two grahas in each other's signs.
   *
   * Classified by the two signs being exchanged, not by everything the two
   * grahas own. A graha may rule two houses, and only the house whose sign is
   * actually part of the swap is in the exchange - reading both would make
   * almost every parivartana a dainya, since five of the seven grahas rule a
   * dusthana somewhere.
   */
  function parivartana(chart) {
    var positions = {};
    chart.planets.forEach(function (p) { positions[p.name] = p; });
    var lagna = Astro.signOf(chart.ascendant.longitude);
    var houseOf = function (sign) { return ((sign - lagna) % 12 + 12) % 12 + 1; };

    var found = [];
    for (var i = 0; i < GRAHAS.length; i++) {
      for (var j = i + 1; j < GRAHAS.length; j++) {
        var a = GRAHAS[i], b = GRAHAS[j];
        if (!positions[a] || !positions[b]) continue;
        var signOfA = positions[a].sign, signOfB = positions[b].sign;
        // Each must sit in a sign the other rules.
        if (Astro.SIGN_LORDS[signOfA] !== b || Astro.SIGN_LORDS[signOfB] !== a) continue;

        var houseA = houseOf(signOfA), houseB = houseOf(signOfB);
        var houses = [houseA, houseB].sort(function (x, y) { return x - y; });
        var kind = houses.some(function (h) { return DUSTHANA.indexOf(h) >= 0; }) ? 'dainya'
          : houses.indexOf(UPACHAYA_MIXED) >= 0 ? 'khala' : 'maha';

        found.push({
          yoga: 'Parivartana',
          kind: kind,
          // Subject and condition, the same pair astro_readings is keyed by, so
          // a finding can ask the library for its own passage without either
          // side knowing how the other spells things.
          subject: 'Parivartana',
          condition: kind,
          /*
           * Maha, khala and dainya are adjectives on parivartana, so they read
           * as one name: "maha parivartana yoga". Harsha, sarala and vimala are
           * proper names in their own right, so those carry their family in
           * parentheses instead. Same relationship, different grammar, and
           * forcing one shape on both would misname one of them.
           */
          title: kind.charAt(0).toUpperCase() + kind.slice(1) + ' parivartana yoga',
          family: 'Parivartana',
          grahas: [a, b],
          houses: houses,
          summary: a + ' in ' + Astro.SIGNS[signOfA] + ' and ' + b + ' in ' +
            Astro.SIGNS[signOfB] + ', exchanging the ' + ordinal(houses[0]) +
            ' and the ' + ordinal(houses[1])
        });
      }
    }
    return found;
  }

  /*
   * Which house-distances a graha aspects fully. Every graha sees the 7th;
   * Mars, Jupiter and Saturn have their own besides. Partial aspects are not
   * used here - for cancelling a debilitation the classical texts speak of
   * being aspected, not of being aspected a quarter.
   */
  var FULL_ASPECTS = {
    Mars: [4, 7, 8], Jupiter: [5, 7, 9], Saturn: [3, 7, 10],
    // Parashara gives the nodes no aspects; most modern practice gives them the
    // 5th, 7th and 9th, as Jupiter has. Named here rather than assumed.
    Rahu: [5, 7, 9], Ketu: [5, 7, 9]
  };
  function aspects(graha, fromSign, toSign) {
    var apart = ((toSign - fromSign) % 12 + 12) % 12 + 1;
    return (FULL_ASPECTS[graha] || [7]).indexOf(apart) >= 0;
  }

  var KENDRA_HOUSES = [1, 4, 7, 10];
  var TRIKONA_HOUSES = [1, 5, 9];

  /**
   * Neecha bhanga: a debilitation cancelled.
   *
   * Authorities list different cancellations and few list all of them, so each
   * is checked separately and the ones that fired are reported. A single
   * yes-or-no would hide which rule did the work, and the rules are not equally
   * persuasive - a debilitated graha exalted in navamsa is a stronger claim than
   * its dispositor merely sitting in a kendra.
   *
   * The raja yoga part is the stricter reading: a cancelled debilitation is
   * called a raja yoga when the graha also sits in a kendra or a trikona, where
   * it has the standing to act on what the cancellation gives it. Cancellations
   * without that placement are reported as neecha bhanga alone.
   */
  function neechaBhanga(chart) {
    var positions = {};
    chart.planets.forEach(function (p) { positions[p.name] = p; });
    var lagna = Astro.signOf(chart.ascendant.longitude);
    var moonSign = positions.Moon ? positions.Moon.sign : null;

    var houseFrom = function (sign, from) { return ((sign - from) % 12 + 12) % 12 + 1; };
    var inKendraFromEither = function (sign) {
      if (KENDRA_HOUSES.indexOf(houseFrom(sign, lagna)) >= 0) return 'the lagna';
      if (moonSign !== null && KENDRA_HOUSES.indexOf(houseFrom(sign, moonSign)) >= 0) return 'the Moon';
      return null;
    };

    var found = [];
    GRAHAS.forEach(function (graha) {
      var p = positions[graha];
      if (!p) return;
      var dignity = Astro.DIGNITY[graha];
      if (!dignity || p.sign !== dignity.debil) return;      // not debilitated

      var dispositor = Astro.SIGN_LORDS[p.sign];
      // Whichever graha is exalted in the sign this one is debilitated in.
      var exaltedHere = null;
      Object.keys(Astro.DIGNITY).forEach(function (other) {
        if (Astro.DIGNITY[other].exalt.sign === p.sign) exaltedHere = other;
      });

      var reasons = [];
      var from;

      if ((from = inKendraFromEither(positions[dispositor] ? positions[dispositor].sign : -1))) {
        reasons.push('its dispositor ' + dispositor + ' is in a kendra from ' + from);
      }
      if (exaltedHere && positions[exaltedHere] &&
          (from = inKendraFromEither(positions[exaltedHere].sign))) {
        reasons.push(exaltedHere + ', exalted in this sign, is in a kendra from ' + from);
      }
      if (positions[dispositor] && positions[dispositor].sign === p.sign) {
        reasons.push('it is conjunct its dispositor ' + dispositor);
      }
      if (positions[dispositor] &&
          aspects(dispositor, positions[dispositor].sign, p.sign)) {
        reasons.push('its dispositor ' + dispositor + ' aspects it');
      }
      if (exaltedHere && positions[exaltedHere] &&
          aspects(exaltedHere, positions[exaltedHere].sign, p.sign)) {
        reasons.push(exaltedHere + ', exalted in this sign, aspects it');
      }
      if (positions[dispositor] &&
          Astro.SIGN_LORDS[positions[dispositor].sign] === graha) {
        reasons.push('it exchanges signs with its dispositor ' + dispositor);
      }
      if (Astro.vargaPosition(p.longitude, 9).sign === dignity.exalt.sign) {
        reasons.push('it is exalted in navamsa');
      }
      if ((from = inKendraFromEither(p.sign))) {
        reasons.push('it stands in a kendra from ' + from);
      }

      if (!reasons.length) return;

      var house = houseFrom(p.sign, lagna);
      var royal = KENDRA_HOUSES.indexOf(house) >= 0 || TRIKONA_HOUSES.indexOf(house) >= 0;
      found.push({
        yoga: 'Neecha Bhanga',
        kind: royal ? 'raja' : 'plain',
        subject: 'Neecha Bhanga Raja Yoga',
        condition: royal ? 'raja' : 'general',
        title: royal ? 'Neecha bhanga raja yoga' : 'Neecha bhanga',
        /*
         * No family label here. Neecha bhanga is the base and the raja yoga is
         * the special case of it, so both titles already say what they are -
         * and calling the plain form "a neecha bhanga raja yoga" would deny the
         * very distinction the kendra-or-trikona test draws.
         */
        family: null,
        grahas: [graha],
        houses: [house],
        reasons: reasons,
        summary: graha + ' is debilitated in ' + Astro.SIGNS[p.sign] + ', in the ' +
          ordinal(house) + ', and the debilitation is cancelled because ' +
          reasons.join('; and ') + '.'
      });
    });
    return found;
  }

  function ordinal(n) {
    var suffix = (n % 10 === 1 && n !== 11) ? 'st'
      : (n % 10 === 2 && n !== 12) ? 'nd'
      : (n % 10 === 3 && n !== 13) ? 'rd' : 'th';
    return n + suffix;
  }

  /*
   * K. N. Rao's rule for retrograde grahas: a retrograde graha also gives its
   * results, and casts its aspects, from the sign behind the one it occupies -
   * "Saturn retrograde is not merely in the 8th house, but giving results from
   * the 7th house (because retrograde)".
   *
   * Two qualifications come with it. It applies while the graha is within the
   * first ten degrees of its sign, that being as far back as retrogression
   * could actually carry it; past ten degrees it stays where it is. And it is
   * not applied to Rahu and Ketu, which are retrograde always and would
   * otherwise pick up a second set of aspects permanently.
   *
   * Kept apart from the classical columns rather than folded into them. No
   * Parashari text gives this rule, so it is reported as an addition, under the
   * name of the astrologer who teaches it, for a reader to take or leave.
   */
  var RAO_MAX_DEGREE = 10;
  var RAO_EXCLUDED = ['Rahu', 'Ketu'];

  function raoRetrogradeAspects(source, all) {
    if (!source.retrograde) return [];
    if (RAO_EXCLUDED.indexOf(source.name) >= 0) return [];
    if (source.degreeInSign >= RAO_MAX_DEGREE) return [];

    var behind = (source.sign + 11) % 12;
    var found = [];
    all.forEach(function (other) {
      if (other.name === source.name) return;
      if (!aspects(source.name, behind, other.sign)) return;
      // Skip what it already aspects from where it stands: the rule adds
      // reach, it does not restate it.
      if (aspects(source.name, source.sign, other.sign)) return;
      found.push({
        graha: other.name,
        apart: ((other.sign - behind) % 12 + 12) % 12 + 1,
        retrograde: other.retrograde
      });
    });
    return found;
  }

  /**
   * Who aspects whom, both ways round.
   *
   * Read in the rashi chart. Aspect is counted whole-sign from the graha's
   * sign, which is the Parashari reading; partial aspects are not shown,
   * because a list of everything partly aspecting everything says little.
   *
   * Not symmetric, and that is the point: Saturn in the 3rd from Mars aspects
   * it without being aspected back, since Saturn has the 3rd aspect and Mars
   * does not.
   */
  function aspectTable(chart) {
    var rows = [];
    var bySign = chart.planets.map(function (p) {
      return {
        name: p.name, sign: p.sign, retrograde: p.retrograde,
        degreeInSign: p.degreeInSign
      };
    });

    bySign.forEach(function (source) {
      var casts = [], receives = [];
      bySign.forEach(function (other) {
        if (other.name === source.name) return;
        var apartOut = ((other.sign - source.sign) % 12 + 12) % 12 + 1;
        var apartIn = ((source.sign - other.sign) % 12 + 12) % 12 + 1;
        /*
         * Retrogression is not consulted. Drishti is counted from the position
         * a graha occupies, and Parashara's rules do not mention direction of
         * motion; retrogression acts on strength instead, through cheshta bala.
         */
        if (aspects(source.name, source.sign, other.sign)) {
          casts.push({ graha: other.name, apart: apartOut, retrograde: other.retrograde });
        }
        if (aspects(other.name, other.sign, source.sign)) {
          receives.push({ graha: other.name, apart: apartIn, retrograde: other.retrograde });
        }
      });
      rows.push({
        graha: source.name, retrograde: source.retrograde,
        casts: casts, receives: receives,
        fromPreviousSign: raoRetrogradeAspects(source, bySign)
      });
    });
    return rows;
  }

  /**
   * Vipareeta raja yoga: a dusthana lord placed in a dusthana.
   *
   * The reasoning is mutual cancellation, not that a lord harms its own house -
   * a lord in its own house is ordinarily strong. The lords of the 6th, 8th and
   * 12th are themselves sources of harm; placed in a dusthana, that harm falls
   * on a house whose significations are unwanted anyway, so the two work
   * against each other instead of compounding. The placement also keeps the
   * lord away from the houses it could otherwise damage. Hence reverse, and
   * hence a good result from an arrangement that reads badly.
   *
   * Named for the house whose lord it is: harsha from the 6th, sarala from the
   * 8th, vimala from the 12th. No graha owns two dusthanas - the sign gaps do
   * not allow it - so the three never collide.
   *
   * One caveat is reported rather than judged. A dusthana lord often owns a good
   * house too, and placing it in a dusthana damages that house along with the
   * bad one. Whether that spoils the yoga is disputed, so the fact is given and
   * the conclusion left.
   */
  var VIPAREETA_NAMES = { 6: 'Harsha', 8: 'Sarala', 12: 'Vimala' };
  var DUSTHANA_HOUSES = [6, 8, 12];

  function vipareeta(chart) {
    var positions = {};
    chart.planets.forEach(function (p) { positions[p.name] = p; });
    var lagna = Astro.signOf(chart.ascendant.longitude);

    var found = [];
    DUSTHANA_HOUSES.forEach(function (house) {
      var sign = (lagna + house - 1) % 12;
      var lord = Astro.SIGN_LORDS[sign];
      var placed = positions[lord];
      if (!placed || DUSTHANA_HOUSES.indexOf(placed.house) < 0) return;

      var name = VIPAREETA_NAMES[house];
      var alsoOwns = Astro.housesOwned(lord, lagna).filter(function (h) {
        return DUSTHANA_HOUSES.indexOf(h) < 0;
      });

      var summary = lord + ', lord of the ' + ordinal(house) + ', is placed in the ' +
        ordinal(placed.house) + (placed.house === house ? ' - its own house' : '') + '.';
      var reasons = ['the ' + ordinal(house) + ' lord is itself a source of harm, and in the ' +
        ordinal(placed.house) + ' that harm falls on a house whose significations are ' +
        'unwanted anyway, rather than on a house worth protecting'];
      if (alsoOwns.length) {
        reasons.push(lord + ' also owns the ' + alsoOwns.map(ordinal).join(' and the ') +
          ', which the same placement damages - some authorities count this against the yoga');
      }

      found.push({
        yoga: 'Vipareeta Raja Yoga',
        kind: name.toLowerCase(),
        subject: 'Vipareeta Raja Yoga',
        condition: name.toLowerCase(),
        title: name + ' yoga',
        family: 'Vipareeta raja yoga',
        grahas: [lord],
        houses: [house, placed.house],
        reasons: reasons,
        summary: summary
      });
    });
    return found;
  }

  var DETECTORS = [parivartana, neechaBhanga, vipareeta];

  /** Every yoga this module knows how to look for, in one pass. */
  function detect(chart) {
    var all = [];
    DETECTORS.forEach(function (detector) {
      detector(chart).forEach(function (finding) { all.push(finding); });
    });
    return all;
  }

  return { detect: detect, parivartana: parivartana, neechaBhanga: neechaBhanga,
    vipareeta: vipareeta, VIPAREETA_NAMES: VIPAREETA_NAMES,
    // Exposed so a test can notice a detector being added without being wired
    // into the test that checks detect() gathers from all of them.
    DETECTOR_COUNT: DETECTORS.length,
    aspectTable: aspectTable, aspects: aspects, ordinal: ordinal,
    raoRetrogradeAspects: raoRetrogradeAspects, RAO_MAX_DEGREE: RAO_MAX_DEGREE,
    FULL_ASPECTS: FULL_ASPECTS, GRAHAS: GRAHAS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Yogas;
