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
          title: 'Parivartana ' + kind.charAt(0).toUpperCase() + kind.slice(1),
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

  function ordinal(n) {
    var suffix = (n % 10 === 1 && n !== 11) ? 'st'
      : (n % 10 === 2 && n !== 12) ? 'nd'
      : (n % 10 === 3 && n !== 13) ? 'rd' : 'th';
    return n + suffix;
  }

  var DETECTORS = [parivartana];

  /** Every yoga this module knows how to look for, in one pass. */
  function detect(chart) {
    var all = [];
    DETECTORS.forEach(function (detector) {
      detector(chart).forEach(function (finding) { all.push(finding); });
    });
    return all;
  }

  return { detect: detect, parivartana: parivartana, ordinal: ordinal, GRAHAS: GRAHAS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Yogas;
