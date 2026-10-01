/*
 * graha-view.js - shared presentation facts for a graha.
 *
 * The chart card and graha table are different views of the same facts. Keep
 * their compact vocabulary and the calculations that feed it here so a change
 * cannot make one surface disagree with the other.
 */
var GrahaView = (function () {
  'use strict';

  var RELATION_SHORT = {
    'great friend': 'GF', friend: 'Fr', neutral: 'Neu',
    enemy: 'En', 'great enemy': 'GE'
  };

  var RELATION_WORD = {
    GF: 'great friend', Fr: 'friend', Neu: 'neutral',
    En: 'enemy', GE: 'great enemy', Own: 'own sign'
  };

  var NAKSHATRA_SHORT = {
    'Purva Bhadrapada': 'P Bhadra', 'Uttara Bhadrapada': 'U Bhadra',
    'Purva Phalguni': 'P Phalguni', 'Uttara Phalguni': 'U Phalguni',
    'Purva Ashadha': 'P Ashadha', 'Uttara Ashadha': 'U Ashadha'
  };

  var JAGRATADI_ENGLISH = {
    Jagrat: 'Waking', Swapna: 'Dreaming', Sushupta: 'Sleeping'
  };

  var BALADI_ENGLISH = {
    Bala: 'Child', Kumara: 'Teen', Yuva: 'Youth',
    Vriddha: 'Old', Mrita: 'Dead'
  };

  function relationShort(relation) {
    return relation ? RELATION_SHORT[Astro.RELATION_LABELS[relation]] || '' : '';
  }

  function relationBetween(planet, other, positions) {
    if (!other) return '';
    /*
     * A graha that lords the frame it is standing in. That is not a friendship
     * but identity, and it is the same reading the dispositor is given when a
     * graha occupies its own sign, so it is written the same way. Left blank
     * before, which made the one case worth noticing the one that said
     * nothing: Saturn in Pushya read "N Lord Sa" and looked like a gap.
     */
    if (other === planet.name) return 'Own';
    if (!positions[other]) return '';
    var apart = ((Astro.signOf(positions[other].longitude) -
      Astro.signOf(planet.longitude)) % 12 + 12) % 12 + 1;
    return relationShort(Astro.compoundRelation(planet.name, other, apart));
  }

  function dignitiesByGraha(state, division, tatkalika, horaRule, horaMercury) {
    var d1 = {};
    state.chart.planets.forEach(function (planet) { d1[planet.name] = planet; });

    var map = {};
    state.chart.planets.forEach(function (planet) {
      var displayed = Astro.vargaPosition(planet.longitude, division);
      var displayedDignity = Astro.dignityOf(planet.name, displayed.sign,
        displayed.degreeInSign);
      var standing = Astro.vargaDignity(planet.name, planet.longitude, division,
        d1, tatkalika, horaRule, horaMercury);
      var nakshatra = Astro.nakshatraOf(planet.longitude);
      var shared = {
        formal: displayedDignity === 'Own Sign' ? 'Own sign' : displayedDignity || '',
        nakLordRelation: relationBetween(planet, nakshatra.lord, d1),
        subLordRelation: relationBetween(planet, nakshatra.subLord, d1)
      };

      // Nodes have positional dignity but no rung on the varga-viswa scale.
      if (!standing) {
        if (Astro.NODES.indexOf(planet.name) < 0) return;
        shared.lord = '';
        shared.relation = '';
        map[planet.name] = shared;
        return;
      }

      shared.lord = standing.lord || '';
      shared.relation = standing.lord === planet.name ? 'Own'
        : standing.relation === 'moolatrikona' ? '' : relationShort(standing.relation);
      map[planet.name] = shared;
    });
    return map;
  }

  function dispositorOf(sign) {
    return Astro.grahaAbbr(Astro.SIGN_LORDS[sign]);
  }

  function dispositorRelation(graha, sign, positionsD1) {
    var lord = Astro.SIGN_LORDS[sign];
    if (lord === graha) return 'Own';
    if (!positionsD1[lord] || !positionsD1[graha]) return '\u2013';
    var apart = ((positionsD1[lord].sign - positionsD1[graha].sign) % 12 + 12) % 12 + 1;
    return relationShort(Astro.compoundRelation(graha, lord, apart)) || '\u2013';
  }

  function withArticle(label) {
    if (label === 'neutral') return 'neutral';
    return (label.charAt(0) === 'e' ? 'an ' : 'a ') + label;
  }

  function dispositorDetail(graha, sign, positionsD1) {
    var lord = Astro.SIGN_LORDS[sign];
    var signName = Astro.SIGNS[sign];
    if (lord === graha) return graha + ' rules ' + signName + ', so this is its own sign.';
    if (!positionsD1[lord] || !positionsD1[graha]) return lord + ' rules ' + signName + '.';
    var apart = function (from, to) {
      return ((positionsD1[to].sign - positionsD1[from].sign) % 12 + 12) % 12 + 1;
    };
    var out = Astro.compoundRelation(graha, lord, apart(graha, lord));
    var back = Astro.compoundRelation(lord, graha, apart(lord, graha));
    if (!out) return lord + ' rules ' + signName + '. ' + graha + ' keeps no friendships.';
    var text = signName + ' belongs to ' + lord + ', and ' + graha + ' regards ' + lord +
      ' as ' + withArticle(Astro.RELATION_LABELS[out]) + '. This is the direction shown.';
    if (back && back !== out) {
      text += ' Read the other way it differs: ' + lord + ' regards ' + graha + ' as ' +
        withArticle(Astro.RELATION_LABELS[back]) + '.';
    }
    return text;
  }

  function karakaShort(name) {
    return name.replace(/karaka$/, '');
  }

  function shortNakshatra(name) {
    return NAKSHATRA_SHORT[name] || name;
  }

  return {
    RELATION_SHORT: RELATION_SHORT,
    RELATION_WORD: RELATION_WORD,
    NAKSHATRA_SHORT: NAKSHATRA_SHORT,
    JAGRATADI_ENGLISH: JAGRATADI_ENGLISH,
    BALADI_ENGLISH: BALADI_ENGLISH,
    dignitiesByGraha: dignitiesByGraha,
    dispositorOf: dispositorOf,
    dispositorRelation: dispositorRelation,
    dispositorDetail: dispositorDetail,
    withArticle: withArticle,
    karakaShort: karakaShort,
    shortNakshatra: shortNakshatra
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = GrahaView;
