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
  /*
   * What house 1 is, in words.
   *
   * Rotating a chart counts its houses from a graha instead of from the
   * ascendant, which is how a chart is read from the Moon. A reason that still
   * said "the lagna" would then be naming a house nobody is looking at. The
   * unrotated chart keeps whatever wording the passage already used, so these
   * only ever change a sentence that would otherwise be wrong.
   *
   * Only the two luminaries take an article: "the Moon" and "the Sun", but
   * "Venus" and "Saturn".
   */
  var FIRST_HOUSE_ARTICLE = { Sun: true, Moon: true };

  function rotated(chart) {
    return !!chart.reference && chart.reference !== 'Ascendant';
  }

  function firstHouse(chart, classical) {
    if (!rotated(chart)) return classical || 'the lagna';
    return (FIRST_HOUSE_ARTICLE[chart.reference] ? 'the ' : '') + chart.reference;
  }

  /* The same house when a sentence needs its lord rather than the house. */
  function firstLord(chart, classical) {
    return rotated(chart)
      ? 'lord of the sign ' + firstHouse(chart) + ' stands in' : classical;
  }

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
          /* An exchange is two lords' doing and resolves to neither. */
          graha: null,
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
   * Full aspects live in astro.js: naturalBenefics needs them for Parashara's
   * clause about a waning Moon aspected by a benefic, and a second copy here
   * would be the same table written twice.
   */
  var aspects = Astro.aspects;

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
    /*
     * `whose` is the graha being measured. A graha is always in the 1st from
     * itself, so "in a kendra from the Moon" says nothing whatever when the graha
     * in question is the Moon - and without this the Moon's debilitation
     * cancelled itself in every chart, on a condition that is true by definition.
     */
    var inKendraFromEither = function (sign, whose) {
      if (KENDRA_HOUSES.indexOf(houseFrom(sign, lagna)) >= 0) return firstHouse(chart);
      if (whose !== 'Moon' && moonSign !== null &&
          KENDRA_HOUSES.indexOf(houseFrom(sign, moonSign)) >= 0) return 'the Moon';
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
        // Rahu exalts in Taurus and Ketu in Scorpio, so without this the node
        // would displace the Moon and Mars as the graha exalted in those signs.
        // The cancellation conditions speak of a graha that disposits or aspects,
        // which a node does neither of.
        if (Astro.NODES.indexOf(other) >= 0) return;
        if (Astro.DIGNITY[other].exalt.sign === p.sign) exaltedHere = other;
      });

      /*
       * Every clause names its own subject. These are joined with "; and ", and
       * several of them are about a different graha - the dispositor, or whoever
       * is exalted in the sign - so a trailing "it" lands next to the wrong name.
       * "Venus, exalted in this sign, is in a kendra; and it stands in a kendra"
       * reads as Venus twice when the second clause is about the debilitated
       * graha. Naming both ends costs a few words and removes the question.
       */
      var reasons = [];
      var from;

      /*
       * Each clause names the graha's role, there being at most two clauses and
       * never the same graha in both: where the lord of the sign and the graha
       * exalted in it are one, the two are reported together.
       */
      var ruler = function () { return dispositor + ', the lord of this sign,'; };
      var exalted = function () { return exaltedHere + ', exalted in this sign,'; };

      /*
       * In Virgo the lord and the graha exalted there are both Mercury, so the two
       * conditions land on one graha and reported separately they read as a
       * repetition. They are still two conditions, so they are said as two, in one
       * clause.
       */
      var bothRoles = exaltedHere === dispositor;
      if ((from = inKendraFromEither(
            positions[dispositor] ? positions[dispositor].sign : -1, dispositor))) {
        reasons.push(bothRoles
          ? dispositor + ', which both rules this sign and is exalted in it, is in a kendra ' +
            'from ' + from
          : ruler() + ' is in a kendra from ' + from);
      }
      if (!bothRoles && exaltedHere && positions[exaltedHere] &&
          (from = inKendraFromEither(positions[exaltedHere].sign, exaltedHere))) {
        reasons.push(exalted() + ' is in a kendra from ' + from);
      }
      /*
       * And that is the whole of it. Six further cancellations circulate - the
       * graha conjunct or aspected by its dispositor, aspected by the graha
       * exalted in that sign, exchanging signs with its dispositor, exalted in
       * navamsa, or itself standing in a kendra - and they are in Phaladeepika,
       * Jataka Parijata and Uttara Kalamrita between them. They are not applied
       * here. Raman's definition is the two above and no more, and accepting the
       * rest turned 72 per cent of debilitations into cancellations into 92.
       *
       * Nothing is lost by dropping the exchange: it is parivartana yoga, which
       * the Yogas tab reports in its own right on the same pair of grahas.
       */
      if (!reasons.length) return;

      var house = houseFrom(p.sign, lagna);
      var royal = KENDRA_HOUSES.indexOf(house) >= 0 || TRIKONA_HOUSES.indexOf(house) >= 0;
      found.push({
        yoga: 'Neecha Bhanga',
        kind: royal ? 'raja' : 'plain',
        /*
         * Two yogas, not one yoga read two ways. A cancelled debilitation and
         * a cancelled debilitation that makes a raja yoga are different
         * findings with different rules, different results and different
         * passages behind them, and keeping them as conditions of one subject
         * made the plain form answer to a name it does not deserve.
         */
        subject: royal ? 'Neecha Bhanga Raja Yoga' : 'Neecha Bhanga',
        condition: 'general',
        title: royal ? 'Neecha bhanga raja yoga' : 'Neecha bhanga',
        /*
         * No family label here. Neecha bhanga is the base and the raja yoga is
         * the special case of it, so both titles already say what they are -
         * and calling the plain form "a neecha bhanga raja yoga" would deny the
         * very distinction the kendra-or-trikona test draws.
         */
        family: null,
        graha: graha,
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
        graha: lord,
        grahas: [lord],
        houses: [house, placed.house],
        reasons: reasons,
        summary: summary
      });
    });
    return found;
  }

  var KENDRAS = [1, 4, 7, 10];
  var TRIKONAS = [1, 5, 9];
  var DIGNIFIED = ['Mooltrikona', 'Own Sign', 'Exalted'];
  // "in its Exalted" does not read; these are the phrases the sentences want.
  var SEAT_PHRASE = {
    Mooltrikona: 'moolatrikona', 'Own Sign': 'own sign', Exalted: 'exaltation sign'
  };

  /**
   * Lakshmi yoga.
   *
   * BPHS, verses 27-28: "If the 9th lord is in an angle identical with his
   * Moola-Trikona sign or own sign or exaltation sign while the ascendant lord is
   * endowed with strength, Lakshmi yoga occurs."
   *
   * Santhanam's wording is "an angle", and taken literally that excludes the
   * trines. It is not how the yoga is generally read: the common form allows a
   * kendra or a trikona, and charts are routinely called Lakshmi yoga with the
   * 9th lord exalted in the 5th. Both are honoured here - the yoga is reported
   * for either, and the finding says which of the two it rests on, so the wider
   * reading never quietly passes itself off as the text's own.
   *
   * "Endowed with strength" is measured rather than guessed: the lagna lord must
   * meet the Shadbala minimum Parashara sets for it, which differs by graha. That
   * is the same reading the Shadbala tab prints, from the same computation.
   *
   * Venus is Lakshmi's karaka and some formulations add its strength to the
   * conditions. Parashara does not, so it is reported alongside when it happens
   * to be dignified rather than required.
   *
   * The lagna lord and the 9th lord are always different grahas, the two signs
   * being eight apart, so there is no same-graha case to handle.
   */
  function lakshmi(chart, strengths) {
    var positions = {};
    chart.planets.forEach(function (p) { positions[p.name] = p; });
    var lagna = Astro.signOf(chart.ascendant.longitude);

    var ninthSign = (lagna + 8) % 12;
    var ninthLord = Astro.SIGN_LORDS[ninthSign];
    var lagnaLord = Astro.SIGN_LORDS[lagna];
    var placed = positions[ninthLord];
    if (!placed) return [];

    var inKendra = KENDRAS.indexOf(placed.house) >= 0;
    var inTrikona = TRIKONAS.indexOf(placed.house) >= 0;
    if (!inKendra && !inTrikona) return [];

    var dignity = Astro.dignityOf(ninthLord, placed.sign, placed.longitude % 30);
    if (DIGNIFIED.indexOf(dignity) < 0) return [];

    // Without a strength reading there is nothing to test the second half
    // against, and reporting on half the conditions is worse than silence.
    var lord = strengths && strengths[lagnaLord];
    if (!lord || !lord.strong) return [];

    var house = ordinal(placed.house);
    var seat = inKendra
      ? 'an angle, which is how Parashara words it'
      : 'a trine, which the wider reading allows and the text does not say';

    var reasons = [
      ninthLord + ' rules the 9th and stands in ' + Astro.SIGNS[placed.sign] + ', its ' +
        SEAT_PHRASE[dignity] + ', in the ' + house + ' - ' + seat,
      lagnaLord + ', ' + firstLord(chart, 'the lagna lord') + ', carries ' +
        lord.rupas.toFixed(2) + ' rupas against the ' +
        lord.required + ' Parashara asks of it, so it is strong'
    ];

    // Venus is the karaka of Lakshmi; noted when dignified, never required.
    var venus = positions.Venus;
    if (venus && ninthLord !== 'Venus') {
      var venusDignity = Astro.dignityOf('Venus', venus.sign, venus.longitude % 30);
      if (DIGNIFIED.indexOf(venusDignity) >= 0) {
        reasons.push('Venus, the karaka of Lakshmi, is itself in its ' +
          SEAT_PHRASE[venusDignity] + ' in the ' + ordinal(venus.house) +
          ', which some formulations add to the conditions and Parashara does not');
      }
    }

    return [{
      yoga: 'Lakshmi Yoga',
      kind: inKendra ? 'angle' : 'trine',
      subject: 'Lakshmi Yoga',
      /*
       * 'general' is the key the library holds the definition under, as it is
       * for every other yoga. This said 'lakshmi', which matched no passage, so
       * the card had nothing to say about it - hidden until now behind a second
       * fault that stopped the yoga reaching the card at all. The other two
       * Lakshmi passages, 'angle' and 'strength', are the contested points and
       * belong to the Lesson tab rather than to a finding.
       */
      condition: 'general',
      title: 'Lakshmi yoga',
      family: 'Lakshmi yoga',
      graha: ninthLord,
      grahas: [ninthLord, lagnaLord],
      houses: [9, placed.house],
      reasons: reasons,
      summary: Named(ninthLord) + ', lord of the 9th, is in the ' + house +
        ' in its ' + SEAT_PHRASE[dignity] + ', and ' + named(lagnaLord) +
        ', ' + firstLord(chart, 'the lagna lord') + ', is strong by Shadbala.'
    }];
  }

  /*
   * Chapter 75, verses 1-2: "When Mars, Mercury, Jupiter, Venus and Saturn being
   * in their own sign or in their sign of exaltation, be in Kendra to the
   * Ascendant, they give rise to Ruchaka, Bhadra, Hamsa, Malavya and Sasa yogas
   * respectively."
   *
   * One rule with five names, so it is one detector. Malavya is Venus's case and
   * differs from Sasa or Hamsa in nothing but which graha stands there.
   *
   * The luminaries are not in it. The text lists the five taras and stops, and
   * that is the whole membership rather than an omission to be tidied up.
   */
  var MAHAPURUSHA = {
    Mars: 'Ruchaka', Mercury: 'Bhadra', Jupiter: 'Hamsa',
    Venus: 'Malavya', Saturn: 'Sasa'
  };

  var MAHAPURUSHA_ABOUT = {
    Ruchaka: 'the warrior', Bhadra: 'the scholar', Hamsa: 'the teacher',
    Malavya: 'the refined', Sasa: 'the ruler'
  };

  /**
   * The five Mahapurusha yogas.
   *
   * "Own sign or exaltation", with no mention of moolatrikona - which costs
   * nothing, because all five of these grahas have their moolatrikona inside a
   * sign they already own. Only the Moon's lies outside its own signs, and the
   * Moon is not one of the five. A test holds that, since the day it stopped
   * being true the wording would quietly start excluding placements.
   *
   * Kendra to the ascendant, as the text says. Many modern readings also allow a
   * kendra from the Moon; that is not what is written here, so it is not counted.
   */
  function mahapurusha(chart) {
    /*
     * The house is derived from the ascendant here rather than read off the
     * planet, which is what every other detector in this file does. It came to
     * the same answer for charts built by astro.js, which fills in `house` from
     * the ascendant - but it also meant this one rule trusted a field the
     * others compute, and the lagna it worked out was never used. One of the
     * two had to go, and deriving it is the one that cannot drift.
     */
    var lagna = Astro.signOf(chart.ascendant.longitude);
    var found = [];

    chart.planets.forEach(function (p) {
      var name = MAHAPURUSHA[p.name];
      if (!name) return;
      var house = ((p.sign - lagna) % 12 + 12) % 12 + 1;
      if (KENDRAS.indexOf(house) < 0) return;
      var dignity = Astro.dignityOf(p.name, p.sign, p.longitude % 30);
      if (DIGNIFIED.indexOf(dignity) < 0) return;

      var seat = dignity === 'Exalted' ? 'its exaltation sign'
        : dignity === 'Mooltrikona' ? 'its moolatrikona, inside a sign it owns'
        : 'its own sign';

      found.push({
        yoga: 'Pancha Mahapurusha Yoga',
        kind: name.toLowerCase(),
        subject: 'Pancha Mahapurusha Yoga',
        condition: name.toLowerCase(),
        title: name + ' yoga',
        family: 'Pancha Mahapurusha yoga',
        graha: p.name,
        grahas: [p.name],
        houses: [house],
        reasons: [
          p.name + ' stands in ' + Astro.SIGNS[p.sign] + ', ' + seat + ', and in the ' +
            ordinal(house) + ' - a kendra from ' + firstHouse(chart) +
            ', which is what the rule asks',
          'the yoga takes its name from the graha: ' + p.name + ' gives ' + name +
            ', ' + MAHAPURUSHA_ABOUT[name]
        ],
        summary: p.name + ' is in ' + seat + ' in the ' + ordinal(house) +
          ', a kendra, which is ' + name + ' yoga.'
      });
    });
    return found;
  }

  /*
   * Chapter 41, verse 28: "The angles are known as Vishnu sthaanas while the
   * trines are called Lakshmi sthaanas. If the lord of an angle establishes
   * relationship with a trinal lord, a Raja-yoga will obtain."
   *
   * Santhanam's note fixes both sets and the relationships: "The 4 houses, viz.
   * the 1st, 4th, 7th and 10th are known as Vishnu sthaanas while the 5th and 9th
   * are Lakshmi sthaanas", and "The kinds of relationship between planets that
   * will be favourable are: 1. An exchange between these two lords. 2. Mutual
   * aspects between these two lords. 3. Conjunction of these two lords."
   *
   * Two details in that are easy to lose. The 1st counts as an angle and not as a
   * trine, so the lagna lord pairs with the 5th or 9th lord rather than with
   * itself. And the aspect has to be MUTUAL: the special aspects are one-way, so
   * Jupiter reaching Saturn by its 5th is not the same as the two reaching each
   * other, and only the second is this yoga.
   */
  var VISHNU_HOUSES = [1, 4, 7, 10];
  var LAKSHMI_HOUSES = [5, 9];

  function rajaYoga(chart) {
    var positions = {};
    chart.planets.forEach(function (p) { positions[p.name] = p; });
    var lagna = Astro.signOf(chart.ascendant.longitude);

    /*
     * Lordship, not dignity. The nodes have an exaltation of their own but own no
     * sign, so they can never be the lord of an angle or a trine; testing for a
     * dignity entry would now admit them.
     */
    var lords = Object.keys(positions).filter(function (g) {
      return Astro.housesOwned(g, lagna).length > 0;
    });
    var ownedIn = function (graha, set) {
      return Astro.housesOwned(graha, lagna).filter(function (h) {
        return set.indexOf(h) >= 0;
      });
    };

    var found = [];
    for (var i = 0; i < lords.length; i++) {
      for (var j = i + 1; j < lords.length; j++) {
        var a = lords[i], b = lords[j];
        var pa = positions[a], pb = positions[b];

        // Either way round: whichever of the two holds the angle.
        var angles = ownedIn(a, VISHNU_HOUSES), trines = ownedIn(b, LAKSHMI_HOUSES);
        var angleLord = a, trineLord = b;
        if (!angles.length || !trines.length) {
          angles = ownedIn(b, VISHNU_HOUSES);
          trines = ownedIn(a, LAKSHMI_HOUSES);
          angleLord = b; trineLord = a;
        }
        if (!angles.length || !trines.length) continue;

        var relation = null;
        if (Astro.SIGN_LORDS[pa.sign] === b && Astro.SIGN_LORDS[pb.sign] === a) {
          relation = 'they exchange signs, each sitting in one the other rules';
        } else if (pa.sign === pb.sign) {
          relation = 'they are conjunct in ' + Astro.SIGNS[pa.sign];
        } else if (aspects(a, pa.sign, pb.sign) && aspects(b, pb.sign, pa.sign)) {
          relation = 'they aspect each other';
        }
        if (!relation) continue;

        var houseList = function (hs) {
          return hs.map(ordinal).join(' and the ');
        };

        /*
         * One pair has a name of its own. Dharma joined to karma - the lord of
         * the 9th with the lord of the 10th - is read as the strongest of these,
         * and is the only pairing the tradition singles out this way. Every
         * other combination of an angle lord and a trine lord is a raja yoga and
         * nothing more particular, which is worth saying because the name is
         * often stretched to cover any of them.
         *
         * The name is not in Santhanam, who discusses the combination at length
         * without using it; it comes from Uttara Kalamrita and general usage.
         */
        var ninthLord = Astro.SIGN_LORDS[(lagna + 8) % 12];
        var tenthLord = Astro.SIGN_LORDS[(lagna + 9) % 12];
        var dharmaKarma = ninthLord !== tenthLord &&
          ((a === ninthLord && b === tenthLord) || (a === tenthLord && b === ninthLord));
        /*
         * Which of the two houses is the angle and which the trine, and no
         * more. The summary already names both lords and both houses, so a
         * reason repeating them said the whole thing twice in different
         * words - "Mercury, lord of the 1st and the 4th, and Venus, lord of
         * the 5th, are related" against "Mercury rules the 1st and the 4th,
         * an angle, and Venus the 5th, a trine". The classification is the
         * part the summary does not carry, and the part the rule turns on.
         */
        var reasons = [
          'the ' + houseList(angles) + (angles.length > 1 ? ' are angles' : ' is an angle') +
            ', the ' + houseList(trines) + (trines.length > 1 ? ' trines' : ' a trine'),
          relation
        ];
        if (dharmaKarma) {
          reasons.push('the 9th lord with the 10th is the one pairing the tradition ' +
            'names, dharma joined to karma, and is read as the strongest of them');
        }
        // A graha holding both on its own is the yogakaraka, a stronger thing
        // than the pairing and worth naming where it turns up inside one.
        [angleLord, trineLord].forEach(function (g) {
          if (Astro.isYogakaraka(g, lagna)) {
            reasons.push(g + ' holds an angle and a trine by itself, so it is a yogakaraka');
          }
        });

        found.push({
          yoga: 'Raja Yoga',
          kind: relation.indexOf('exchange') >= 0 ? 'exchange'
            : relation.indexOf('conjunct') >= 0 ? 'conjunction' : 'aspect',
          subject: 'Raja Yoga',
          condition: dharmaKarma ? 'dharma-karmadhipati' : 'angle-trine',
          /*
           * Named for the rule that produced it rather than for the family.
           * Bare "Raja yoga" reads as a verdict on the chart, and at 69 per
           * cent of charts it is nothing of the kind - it is the commonest
           * finding there is. Saying angle-trine puts the reader in front of
           * the actual claim: one angle lord, one trine lord, related.
           */
          title: dharmaKarma ? 'Dharma Karmadhipati yoga' : 'Angle-trine raja yoga',
          /*
           * No family label. A family groups variants under a shared name, as the
           * three vipareeta yogas are grouped; this yoga has one name, so a label
           * repeating it would only say "Raja yoga" twice.
           */
          family: null,
          /* An angle lord and a trine lord together: two grahas, one yoga. */
          graha: null,
          grahas: [angleLord, trineLord],
          houses: angles.concat(trines),
          reasons: reasons,
          summary: Named(angleLord) + ', lord of the ' + houseList(angles) +
            ', and ' + named(trineLord) + ', lord of the ' + houseList(trines) +
            ', are related: ' + relation + '.'
        });
      }
    }
    return found;
  }

  /**
   * Gaja Kesari, and the weaker Kesari it is usually confused with.
   *
   * BPHS, verses 3-4: "Should Jupiter be in an angle from the ascendant or from
   * the Moon, and be conjunct or aspected by (another) benefic, avoiding at the
   * same time debilitation, combustion and inimical sign, Gaja Kesari yoga is
   * caused."
   *
   * Five conditions, not one. The definition in common use - Jupiter in a kendra
   * from the Moon - is only the first of them, and Santhanam says outright that
   * it is a different yoga: "the Moon-Jupiter mutual angular placement is called
   * as simply Kesari Yoga, vide Phala Deepika, Ch. 6, shloka 14". Both are
   * reported here, named apart, with the unmet conditions listed on the lesser
   * one so it is clear what it is short of.
   *
   * Mutual angularity needs no separate test: the kendras are symmetric, so if
   * Jupiter is 4th from the Moon the Moon is 10th from Jupiter, and both are
   * angles.
   */
  function gajaKesari(chart) {
    var positions = {};
    chart.planets.forEach(function (p) { positions[p.name] = p; });
    var jupiter = positions.Jupiter, moon = positions.Moon, sun = positions.Sun;
    if (!jupiter || !moon) return [];

    var lagna = Astro.signOf(chart.ascendant.longitude);
    var houseFrom = function (sign, from) { return ((sign - from) % 12 + 12) % 12 + 1; };
    var fromLagna = KENDRAS.indexOf(houseFrom(jupiter.sign, lagna)) >= 0;
    var fromMoon = KENDRAS.indexOf(houseFrom(jupiter.sign, moon.sign)) >= 0;
    if (!fromLagna && !fromMoon) return [];

    var benefics = Astro.naturalBenefics(chart);
    var helpers = Object.keys(positions).filter(function (g) {
      if (g === 'Jupiter' || !benefics[g]) return false;
      return positions[g].sign === jupiter.sign ||
        aspects(g, positions[g].sign, jupiter.sign);
    });

    var dignity = Astro.dignityOf('Jupiter', jupiter.sign, jupiter.longitude % 30);
    var lord = Astro.SIGN_LORDS[jupiter.sign];
    var relation = lord === 'Jupiter' ? 'own'
      : Astro.compoundRelation('Jupiter', lord,
          ((positions[lord].sign - jupiter.sign) % 12 + 12) % 12 + 1);
    var inimical = relation === 'shatru' || relation === 'adhishatru';

    /*
     * Combustion is a fact about the nativity, so it is measured on the rashi
     * longitudes even when a division is being read. chartInDivision keeps them
     * for exactly this.
     */
    var combust = sun && Astro.isCombust('Jupiter',
      jupiter.rashiLongitude !== undefined ? jupiter.rashiLongitude : jupiter.longitude,
      sun.rashiLongitude !== undefined ? sun.rashiLongitude : sun.longitude,
      jupiter.retrograde);

    /*
     * Read from the Moon, house 1 and the Moon are the same sign and the two
     * angles are one angle, so the seat is named once instead of twice.
     */
    var first = firstHouse(chart);
    var seat = chart.reference === 'Moon' ? 'an angle from the Moon'
      : fromLagna && fromMoon ? 'an angle from both ' + first + ' and the Moon'
      : fromLagna ? 'an angle from ' + first : 'an angle from the Moon';
    var where = 'Jupiter stands in ' + Astro.SIGNS[jupiter.sign] + ', ' + seat;

    var missing = [];
    if (!helpers.length) missing.push('no other benefic is conjunct it or aspects it');
    if (dignity === 'Debilitated') missing.push('it is debilitated');
    if (combust) missing.push('it is combust, inside ' +
      Astro.COMBUSTION.Jupiter.direct + '\u00b0 of the Sun');
    if (inimical) missing.push('it stands in the sign of an enemy, ' + lord);

    if (!missing.length) {
      return [{
        yoga: 'Gaja Kesari Yoga',
        kind: 'gaja',
        subject: 'Gaja Kesari Yoga',
        condition: 'general',
        title: 'Gaja Kesari yoga',
        family: null,
        graha: 'Jupiter',
        grahas: ['Jupiter', 'Moon'],
        houses: [houseFrom(jupiter.sign, lagna)],
        reasons: [
          where,
          'it is ' + (helpers.length === 1 ? 'helped by ' : 'helped by ') +
            helpers.join(' and ') + ', benefic' + (helpers.length > 1 ? 's' : ''),
          'and it is neither debilitated, nor combust, nor in an enemy\u2019s sign, ' +
            'which is what separates this from the commoner Kesari yoga'
        ],
        summary: where + ', with a benefic on it and none of the three faults ' +
          'Parashara excludes, which is Gaja Kesari yoga.'
      }];
    }

    // Short of the full conditions. Only the lunar angle makes it Kesari at all.
    if (!fromMoon) return [];
    return [{
      yoga: 'Kesari Yoga',
      kind: 'kesari',
      subject: 'Gaja Kesari Yoga',
      condition: 'kesari',
      title: 'Kesari yoga',
      family: null,
      graha: 'Jupiter',
      grahas: ['Jupiter', 'Moon'],
      houses: [houseFrom(jupiter.sign, moon.sign)],
      reasons: [
        'Jupiter and the Moon stand in mutual angles, Jupiter in the ' +
          ordinal(houseFrom(jupiter.sign, moon.sign)) + ' from the Moon',
        'this is Phaladeepika\u2019s Kesari yoga and not Parashara\u2019s Gaja Kesari, ' +
          'which asks for more: ' + missing.join('; and ')
      ],
      summary: 'Jupiter is in the ' + ordinal(houseFrom(jupiter.sign, moon.sign)) +
        ' from the Moon, which is Kesari yoga. It falls short of Gaja Kesari because ' +
        missing.join('; and ') + '.'
    }];
  }

  /**
   * Kartari: the lagna caught between two planets, as between the blades of a
   * pair of scissors.
   *
   * De Fouw and Svoboda put it at page 297 of Light on Life, and they put it on
   * the first house and not on a graha: planets sitting simultaneously in the
   * 2nd and the 12th. Benefics there is shubha kartari, and the protection is
   * described as the flanking benefics snipping problems away before they reach
   * the native; malefics there is papa kartari, and the same scissors cut the
   * blessings off instead. Their worked case is Indira Gandhi, where Mars and
   * Ketu hem a Cancer lagna.
   *
   * Their definition adds that the benefics be unafflicted by malefics, and the
   * malefics unaspected by benefics. That is applied here as a caveat and not as
   * a gate, because their own example fails it: Venus in Sagittarius aspects the
   * Gemini that holds Ketu, and they still call the chart papa kartari. So the
   * occupancy decides whether there is a yoga and of which kind, and an aspect
   * from the other side is reported against it, which is how this module already
   * handles a Gaja Kesari that is missing one of its conditions.
   *
   * The nodes count as malefics. They keep no friendships and take no part in
   * naturalBenefics, but Ketu is half of the Gandhi example and a hemming that
   * ignored them would miss it.
   */
  function kartari(chart) {
    var lagna = Astro.signOf(chart.ascendant.longitude);
    var benefics = Astro.naturalBenefics(chart);
    var second = (lagna + 1) % 12, twelfth = (lagna + 11) % 12;
    var isBenefic = function (p) {
      return Astro.NODES.indexOf(p.name) < 0 && benefics[p.name] === true;
    };
    var inSign = function (sign, wanted) {
      return chart.planets.filter(function (p) {
        return p.sign === sign && isBenefic(p) === wanted;
      });
    };
    var reaching = function (sign, wanted) {
      return chart.planets.filter(function (p) {
        return isBenefic(p) === wanted && p.sign !== sign &&
          aspects(p.name, p.sign, sign);
      }).map(function (p) { return p.name; });
    };

    /*
     * Each kind is asked separately, and both can answer.
     *
     * This used to require that everything in the two flanking signs be of one
     * kind, so a Jupiter sitting beside Saturn in the 2nd cancelled the yoga
     * outright. No text asks for that, and two of them show it is not meant.
     * Charak defines Parvata four lines below kartari as houses "occupied only
     * by benefics" - he writes "only" when he means only, and does not write it
     * here. Mantreswara defines Susubha in the very sloka that defines kartari
     * as benefics "unaspected by malefics" - he knows the qualifier and does
     * not attach it either. Phaladeepika ch.6 sloka 8 and Charak both say
     * simply that the 2nd and 12th are occupied by the one kind.
     *
     * So a chart whose flanking signs hold both kinds carries both yogas, and
     * is reported with both. That is not a contradiction: the first house is
     * flanked by protection and by harm at once, which is a thing charts do.
     */
    var found = [];
    [true, false].forEach(function (wanted) {
      var here = inSign(second, wanted), there = inSign(twelfth, wanted);
      if (!here.length || !there.length) return;

      var all = here.concat(there);
      var mixed = chart.planets.filter(function (p) {
        return (p.sign === second || p.sign === twelfth) && isBenefic(p) !== wanted;
      }).map(function (p) { return p.name; });
      var against = reaching(second, !wanted).concat(reaching(twelfth, !wanted));

      var reasons = [(wanted ? 'benefics' : 'malefics') + ' stand in both the ' +
        '12th and the 2nd, so ' + firstHouse(chart) +
        ' is flanked on both sides at once'];
      if (mixed.length) {
        reasons.push(listOf(mixed) + ' ' + (mixed.length > 1 ? 'share' : 'shares') +
          ' one of the two signs, which does not undo the yoga: Phaladeepika ' +
          'and Charak both ask only that the two houses be occupied by the ' +
          'one kind, and Charak writes "occupied only by benefics" elsewhere ' +
          'when he means to exclude company');
      }
      if (against.length) {
        reasons.push(listOf(against) + ' ' + (against.length > 1 ? 'aspect' : 'aspects') +
          ' one of the two signs. De Fouw and Svoboda ask for benefics ' +
          'unafflicted and malefics unaspected; Mantreswara asks that only of ' +
          'Susubha, in the same sloka that defines this one, so it is reported ' +
          'rather than applied');
      } else {
        reasons.push('nothing of the opposite kind reaches either sign, which ' +
          'is the unqualified form');
      }

      found.push({
        yoga: 'Kartari',
        kind: wanted ? 'shubha' : 'papa',
        subject: 'Kartari Yoga',
        condition: wanted ? 'shubha' : 'papa',
        title: (wanted ? 'Shubha' : 'Papa') + ' kartari yoga',
        family: 'Kartari yoga',
        /* The hemming is done to a house, not by a graha to itself. */
        graha: null,
        grahas: all.map(function (p) { return p.name; }),
        houses: [12, 2],
        reasons: reasons,
        summary: listOf(here.map(function (p) { return p.name; })) + ' in the 2nd and ' +
          listOf(there.map(function (p) { return p.name; })) + ' in the 12th ' +
          (wanted ? 'flank ' + firstHouse(chart) + ', which is shubha kartari yoga.'
                  : 'close ' + firstHouse(chart) + ' in, which is papa kartari yoga.')
      });
    });
    return found;
  }

  /** "with the Moon" rather than "with Moon"; every other graha takes none. */
  function named(graha) {
    return graha === 'Sun' || graha === 'Moon' ? 'the ' + graha : graha;
  }

  /** The same, opening a sentence, where "the Moon" needs its capital. */
  function Named(graha) {
    var out = named(graha);
    return out.charAt(0).toUpperCase() + out.slice(1);
  }

  /** "Mars", "Mars and Ketu", "Mars, Saturn and Ketu". */
  function listOf(names) {
    if (names.length < 2) return names[0] || '';
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  /* ------------------------------------------------- the Moon's company */

  /*
   * The four yogas of the Moon's neighbours, Raman's combinations 2 to 5. They
   * are one detector because they are one question with four answers and a
   * chart can only give one of them: planets in the 2nd from the Moon is
   * Sunapha, in the 12th is Anapha, both is Durudhura, neither is Kemadruma.
   *
   * "Planets" here is the five tara grahas. Raman excludes the Sun outright in
   * his definition of Sunapha, and the nodes are left out with it: they are
   * shadows rather than bodies and the yoga is about the Moon having company.
   *
   * Raman gives the cancellations of Kemadruma and declines them - "some
   * authors say that if planets are in a kendra from birth or from the Moon or
   * if the Moon is in conjunction with a planet there is no Kemadruma ... these
   * observations are not generally acceptable". They are reported rather than
   * applied, so a reader who holds to them can see that the case arose.
   */
  var MOON_COMPANY = ['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

  function moonCompany(chart) {
    var positions = {};
    chart.planets.forEach(function (p) { positions[p.name] = p; });
    var moon = positions.Moon;
    if (!moon) return [];

    var inSign = function (sign) {
      return MOON_COMPANY.filter(function (g) {
        return positions[g] && positions[g].sign === sign;
      });
    };
    var second = inSign((moon.sign + 1) % 12);
    var twelfth = inSign((moon.sign + 11) % 12);

    var name, kind, why;
    if (second.length && twelfth.length) {
      name = 'Durudhura yoga'; kind = 'durudhura';
      why = listOf(twelfth) + ' in the sign before the Moon and ' + listOf(second) +
        ' in the sign after it, so the Moon is attended on both sides';
    } else if (second.length) {
      name = 'Sunapha yoga'; kind = 'sunapha';
      why = listOf(second) + ' in the 2nd from the Moon';
    } else if (twelfth.length) {
      name = 'Anapha yoga'; kind = 'anapha';
      why = listOf(twelfth) + ' in the 12th from the Moon';
    } else {
      name = 'Kemadruma yoga'; kind = 'kemadruma';
      why = 'neither the sign before the Moon nor the sign after it holds a graha';
    }

    var reasons = [why];
    if (kind === 'kemadruma') {
      var lagna = Astro.signOf(chart.ascendant.longitude);
      var withMoon = MOON_COMPANY.filter(function (g) {
        return positions[g] && positions[g].sign === moon.sign;
      });
      var inKendra = MOON_COMPANY.filter(function (g) {
        if (!positions[g]) return false;
        var fromLagna = ((positions[g].sign - lagna) % 12 + 12) % 12 + 1;
        var fromMoon = ((positions[g].sign - moon.sign) % 12 + 12) % 12 + 1;
        return KENDRAS.indexOf(fromLagna) >= 0 || KENDRAS.indexOf(fromMoon) >= 0;
      });
      var escapes = [];
      if (withMoon.length) escapes.push(listOf(withMoon) + ' sits with the Moon');
      if (inKendra.length) escapes.push(listOf(inKendra) +
        ' stands in an angle from ' + (chart.reference === 'Moon' ? 'the Moon'
          : firstHouse(chart) + ' or the Moon'));
      if (escapes.length) {
        reasons.push('some authors cancel the yoga where ' + listOf(escapes) +
          ', which is the case here; Raman gives those cancellations and calls ' +
          'them not generally acceptable, so the yoga is reported');
      }
      reasons.push('the Sun and the nodes are not counted as company, so the ' +
        'Moon can be flanked by them and still be alone by this rule');
    } else {
      reasons.push('the Sun is not counted, which is Raman’s own exclusion, ' +
        'and the nodes are left out with it as shadows rather than bodies');
    }

    return [{
      yoga: name.replace(' yoga', ''),
      kind: kind,
      subject: name.replace(' yoga', '') + ' Yoga',
      condition: 'general',
      title: name,
      family: 'The Moon’s company',
      /*
       * The mirror of the Sun's company, and it had the same fault. Grahas in
       * the 2nd or the 12th from the Moon make Sunapha, Anapha and Durudhura;
       * the Moon marks where to count from and does nothing herself, so naming
       * her put these on her card as though she had. Kemadruma is the one that
       * really is hers, being the Moon with nobody beside her at all: there is
       * no companion to name, and the absence is the yoga.
       */
      graha: kind === 'kemadruma' ? 'Moon'
        : (second.concat(twelfth).length === 1 ? second.concat(twelfth)[0] : null),
      grahas: ['Moon'].concat(second, twelfth),
      houses: [],
      reasons: reasons,
      summary: why.charAt(0).toUpperCase() + why.slice(1) + ', which is ' + name + '.'
    }];
  }

  /*
   * Combination 6. "If Mars conjoins the Moon this yoga is formed." Raman notes
   * that the older writers read it darkly and that he reads it as a yoga of
   * earning: "Chandra Mangala Yoga acts as a powerful factor in stabilising
   * one's financial worth".
   */
  function chandraMangala(chart) {
    var positions = {};
    chart.planets.forEach(function (p) { positions[p.name] = p; });
    var moon = positions.Moon, mars = positions.Mars;
    if (!moon || !mars || moon.sign !== mars.sign) return [];
    return [{
      yoga: 'Chandra Mangala Yoga',
      kind: 'general',
      subject: 'Chandra Mangala Yoga',
      condition: 'general',
      title: 'Chandra Mangala yoga',
      family: null,
      /* Named for both, and caused by their meeting. */
      graha: null,
      grahas: ['Moon', 'Mars'],
      houses: [],
      reasons: [
        'Mars stands with the Moon in ' + Astro.SIGNS[moon.sign],
        'the older writers read this darkly; Raman reads it as a yoga of ' +
          'earning, powerful in stabilising what a person is worth'
      ],
      summary: 'Mars conjoins the Moon in ' + Astro.SIGNS[moon.sign] +
        ', which is Chandra Mangala yoga.'
    }];
  }

  /*
   * Combination 7. "If benefics are situated in the 6th, 7th and 8th from the
   * Moon, the combination goes under the name of Adhi Yoga." All three houses
   * must be tenanted, and by benefics.
   */
  function adhiYoga(chart) {
    var positions = {};
    chart.planets.forEach(function (p) { positions[p.name] = p; });
    var moon = positions.Moon;
    if (!moon) return [];
    var benefics = Astro.naturalBenefics(chart);

    var found = {}, all = [];
    var ok = [6, 7, 8].every(function (house) {
      var sign = (moon.sign + house - 1) % 12;
      var here = GRAHAS.filter(function (g) {
        return g !== 'Moon' && positions[g] && positions[g].sign === sign &&
          benefics[g] === true;
      });
      if (!here.length) return false;
      found[house] = here;
      here.forEach(function (g) { if (all.indexOf(g) < 0) all.push(g); });
      return true;
    });
    if (!ok) return [];

    return [{
      yoga: 'Adhi Yoga',
      kind: 'general',
      subject: 'Adhi Yoga',
      condition: 'general',
      title: 'Adhi yoga',
      family: null,
      /*
       * Benefics in the 6th, 7th and 8th from the Moon. She is the origin those
       * three houses are counted from, not a participant, so naming her was the
       * same mistake as naming the Sun for Vesi. The rule needs all three held,
       * so it is theirs together and the dash says so.
       */
      graha: all.length === 1 ? all[0] : null,
      grahas: ['Moon'].concat(all),
      houses: [6, 7, 8],
      reasons: [
        [6, 7, 8].map(function (h) {
          return listOf(found[h]) + ' in the ' + ordinal(h);
        }).join(', ') + ', all three counted from the Moon',
        'every one of the three is benefic, which is what the rule asks; a ' +
          'malefic in any of them would leave the yoga unformed'
      ],
      summary: 'Benefics fill the 6th, 7th and 8th from the Moon, which is Adhi yoga.'
    }];
  }

  /*
   * Combination 12. "The Moon in the 12th, 6th or 8th from Jupiter gives rise to
   * Sakata Yoga." The one affliction among these, and the counting runs from
   * Jupiter to the Moon rather than the other way.
   *
   * Raman stops there. Mantreswara does not: Phaladeepika ch.6 shloka 14 gives
   * the same three houses and then takes them back in one clause - "But if the
   * Moon be in a Kendra house from the Lagna, there is no Sakata." This site
   * reported the affliction anyway, on about one chart in twelve where
   * Phaladeepika says there is none, which was simply wrong: it is not that the
   * two authorities disagree, it is that one of them states an exception and
   * the other is silent, and a rule no text affirms is not a rule.
   */
  function sakata(chart) {
    var positions = {};
    chart.planets.forEach(function (p) { positions[p.name] = p; });
    var moon = positions.Moon, jupiter = positions.Jupiter;
    if (!moon || !jupiter) return [];
    var house = ((moon.sign - jupiter.sign) % 12 + 12) % 12 + 1;
    if ([6, 8, 12].indexOf(house) < 0) return [];
    var lagna = Astro.signOf(chart.ascendant.longitude);
    var fromLagna = ((moon.sign - lagna) % 12 + 12) % 12 + 1;
    if (KENDRAS.indexOf(fromLagna) >= 0) return [];
    return [{
      yoga: 'Sakata Yoga',
      kind: 'general',
      subject: 'Sakata Yoga',
      condition: 'general',
      title: 'Sakata yoga',
      family: null,
      graha: 'Moon',
      grahas: ['Moon', 'Jupiter'],
      houses: [house],
      reasons: [
        'the Moon stands in the ' + ordinal(house) + ' from Jupiter, in ' +
          Astro.SIGNS[moon.sign],
        'read as fortune that comes and goes rather than fortune withheld: ' +
          'Raman has it that the native loses fortune and may regain it'
      ],
      summary: 'The Moon is in the ' + ordinal(house) +
        ' from Jupiter, which is Sakata yoga.'
    }];
  }

  /*
   * Combination 13. "The 10th from the Moon or Lagna should be occupied by a
   * benefic planet."
   */
  function amala(chart) {
    var positions = {};
    chart.planets.forEach(function (p) { positions[p.name] = p; });
    var moon = positions.Moon;
    if (!moon) return [];
    var lagna = Astro.signOf(chart.ascendant.longitude);
    var benefics = Astro.naturalBenefics(chart);

    var seats = [];
    var references = [[firstHouse(chart), (lagna + 9) % 12]];
    // Read from the Moon, the second reference is the first one again.
    if (chart.reference !== 'Moon') references.push(['the Moon', (moon.sign + 9) % 12]);
    references.forEach(function (from) {
        var here = GRAHAS.filter(function (g) {
          return positions[g] && positions[g].sign === from[1] && benefics[g] === true;
        });
        if (here.length) seats.push({ from: from[0], sign: from[1], grahas: here });
      });
    if (!seats.length) return [];

    var all = [];
    seats.forEach(function (seat) {
      seat.grahas.forEach(function (g) { if (all.indexOf(g) < 0) all.push(g); });
    });
    return [{
      yoga: 'Amala Yoga',
      kind: 'general',
      subject: 'Amala Yoga',
      condition: 'general',
      title: 'Amala yoga',
      family: null,
      /*
       * The benefic standing in the 10th is the one doing it, but only when
       * there is one. Taking the first of several was arbitrary: with Jupiter
       * and Mercury both there the column named whichever the list happened to
       * hold first, which is a guess wearing the clothes of an answer.
       */
      graha: all.length === 1 ? all[0] : null,
      grahas: all,
      houses: [10],
      reasons: [
        seats.map(function (seat) {
          return listOf(seat.grahas) + ' in ' + Astro.SIGNS[seat.sign] +
            ', the 10th from ' + seat.from;
        }).join(', and '),
        'the rule takes the 10th from either, so one of the two is enough'
      ],
      summary: listOf(all) + ' hold' + (all.length > 1 ? '' : 's') +
        ' the 10th from ' + listOf(seats.map(function (seat) { return seat.from; })) +
        ', which is Amala yoga.'
    }];
  }

  /*
   * Combination 24. "If Mercury combines with the Sun, the combination goes
   * under the name of Budha-Aditya Yoga."
   *
   * With Raman's qualifier, which most treatments leave out: "It should not be
   * taken for granted that irrespective of the distance between the Sun and
   * Mercury, Budha-Aditya Yoga would be present. On the contrary, Mercury
   * should not be within 10 degrees of the Sun."
   *
   * He gives the floor and no reason for it. The obvious reason - that Mercury
   * is burnt nearer in - is not one his own books support, because Hindu
   * Predictive Astrology section 54 puts Mercury's orb of combustion at 14
   * degrees direct and 12 retrograde. Two figures, two books, never reconciled.
   * So between 10 and 14 degrees Mercury is combust and gives the yoga at the
   * same time, in about one chart in sixteen. That looks like a contradiction
   * on the card, which is why the finding says so out loud when it happens
   * rather than leaving a reader to assume one of the two marks is a bug.
   *
   * K. N. Rao does not apply the floor at all. Advance Techniques of Astrology
   * Prediction, illustration one of the education chapter - October 7 1964,
   * 21:30 IST, Delhi - reads "Mercury in fifth with the Sun forming Budhaditya
   * yoga and in exaltation aspected by Jupiter" and counts it toward the
   * promise. His own printed longitudes are Sun 21 03 and Mercury 14 57, six
   * degrees apart, which is combust under every orb any of these authors give.
   * He knows the difference: the same book calls combust planets adverse by
   * Sarvarth Chintamani's Gocharastha rule. For Rao combustion is a question of
   * strength, not of whether the yoga formed.
   *
   * So the floor is a setting. Raman's ten degrees is the default because he
   * states it as a rule where Rao only declines to use one, and because without
   * a floor the yoga is claimed for every chart with Mercury in the Sun's sign,
   * which is 52 per cent of them against 28.
   */
  var BUDHA_ADITYA_FLOOR = 10;
  var BUDHA_FLOOR = { RAMAN: 'raman', NONE: 'none' };

  function budhaAditya(chart) {
    var positions = {};
    chart.planets.forEach(function (p) { positions[p.name] = p; });
    var sun = positions.Sun, mercury = positions.Mercury;
    if (!sun || !mercury || sun.sign !== mercury.sign) return [];

    // Measured on the rashi longitudes, combustion being a fact about the sky.
    var sunLon = sun.rashiLongitude !== undefined ? sun.rashiLongitude : sun.longitude;
    var merLon = mercury.rashiLongitude !== undefined
      ? mercury.rashiLongitude : mercury.longitude;
    var apart = Math.abs(Astro.norm360(merLon - sunLon));
    if (apart > 180) apart = 360 - apart;
    var floored = chart.budhaAdityaFloor !== BUDHA_FLOOR.NONE;
    if (floored && apart < BUDHA_ADITYA_FLOOR) return [];

    var combust = Astro.isCombust('Mercury', merLon, sunLon, mercury.retrograde);
    var reasons = [
      'Mercury stands with the Sun in ' + Astro.SIGNS[sun.sign] + ', ' +
        apart.toFixed(1) + '\u00b0 away'
    ];
    if (floored) {
      reasons.push('and outside the ten degrees Raman sets as the floor for ' +
        'this yoga');
      if (combust) {
        reasons.push('Mercury is combust all the same, which is not a ' +
          'contradiction: Raman puts the floor for the yoga at 10\u00b0 and the ' +
          'orb of combustion at 14\u00b0 direct, 12\u00b0 retrograde, in two ' +
          'different books. Between those figures both readings hold at once');
        reasons.push('So read the yoga as formed and discounted. That is K. N. ' +
          'Rao\u2019s division of the question - combustion bears on how much ' +
          'Mercury can deliver, not on whether the yoga is there - and it is ' +
          'the only reading that makes sense of a graha being burnt and ' +
          'outside the floor at once');
      }
    } else {
      reasons.push('which is the whole of the rule on this setting: K. N. Rao ' +
        'applies no floor, and names the yoga in a chart of his own with the ' +
        'two six degrees apart');
      if (combust) {
        reasons.push('Mercury is combust, so the yoga is formed and ' +
          'discounted. Rao separates the two questions: combustion bears on ' +
          'how much Mercury can deliver, not on whether the yoga is there. ' +
          'Raman would have this distance cancel it outright');
      }
    }

    return [{
      yoga: 'Budha Aditya Yoga',
      kind: 'general',
      subject: 'Budha Aditya Yoga',
      condition: 'general',
      title: 'Budha-Aditya yoga',
      family: null,
      graha: 'Mercury',
      grahas: ['Sun', 'Mercury'],
      houses: [],
      reasons: reasons,
      summary: 'Mercury is with the Sun in ' + Astro.SIGNS[sun.sign] + ' and ' +
        apart.toFixed(1) + '° off it, which is Budha-Aditya yoga.'
    }];
  }


  /* --------------------------------------------- Dhana and Daridra */

  /*
   * Wealth and want, Parashara's chapters 41 and 42. Between them they are the
   * most consulted question in the book and this site had nothing from either.
   *
   * Both lean on the marakas, which chapter 44 defines: "the 2nd and 7th are
   * Maraka houses ... The lords of the 2nd and the 7th, malefic in the 2nd and
   * the 7th and malefic accompanying the 2nd and the 7th lords are all known as
   * Maraka." All three kinds are counted here.
   */
  function marakasOf(c, benefics) {
    var out = [];
    var add = function (g) { if (g && c.at[g] && out.indexOf(g) < 0) out.push(g); };
    var second = c.lordOf(2), seventh = c.lordOf(7);
    add(second); add(seventh);
    GRAHAS.forEach(function (g) {
      if (benefics[g] === true) return;
      var h = c.houseOf(g);
      if (h === 2 || h === 7) add(g);                  // a malefic in either house
      if (c.together(g, second) || c.together(g, seventh)) add(g);   // or beside a lord
    });
    return out;
  }

  /* Who aspects this graha, by the full aspects used everywhere here. */
  function aspectingOf(c, graha) {
    if (!c.at[graha]) return [];
    return GRAHAS.filter(function (g) {
      return g !== graha && c.at[g] &&
        Astro.aspects(g, c.at[g].sign, c.at[graha].sign);
    });
  }

  /* "Conjunct or aspected by", which is how chapter 41 words every clause. */
  function touches(c, graha, other) {
    return c.together(graha, other) ||
      (c.at[other] && c.at[graha] &&
        Astro.aspects(other, c.at[other].sign, c.at[graha].sign));
  }

  /*
   * Chapter 41 verses 9 to 15: the lord of the ascendant standing in it, with
   * named company. Parashara gives one verse per graha and the companions
   * differ, so they are listed rather than generalised.
   */
  var DHANA_COMPANY = {
    Sun: ['Mars', 'Jupiter'], Moon: ['Mercury', 'Jupiter'],
    Mars: ['Mercury', 'Venus', 'Saturn'], Mercury: ['Saturn', 'Jupiter'],
    Jupiter: ['Mercury', 'Mars'], Venus: ['Saturn', 'Mercury'],
    Saturn: ['Mars', 'Jupiter']
  };

  /*
   * Both chapters give many separate verses for one idea, and a chart can
   * answer to several at once. They are gathered into one finding rather than
   * reported as three or four cards saying the same name, with every clause
   * that held kept as its own reason - which is what a reader wants: not that
   * the chart is poor four times, but which four ways.
   */
  function gather(subject, title, parts) {
    if (!parts.length) return [];
    var grahas = [], houses = [], reasons = [];
    parts.forEach(function (p) {
      (p.grahas || []).forEach(function (g) { if (grahas.indexOf(g) < 0) grahas.push(g); });
      (p.houses || []).forEach(function (h) { if (houses.indexOf(h) < 0) houses.push(h); });
      p.reasons.forEach(function (r) { reasons.push(r); });
    });
    return [{
      yoga: subject, kind: 'general', subject: subject, condition: 'general',
      title: title, family: 'Wealth and want', graha: null,
      grahas: grahas, houses: houses,
      reasons: reasons,
      summary: parts.length === 1 ? parts[0].summary
        : parts[0].summary + ' And ' + parts.slice(1).map(function (p) {
            return p.summary.charAt(0).toLowerCase() + p.summary.slice(1);
          }).join(' And ')
    }];
  }

  function dhana(chart) {
    var c = lordship(chart);
    if (!c.at.Sun) return [];
    var out = [];

    /*
     * Verses 2 to 8. Parashara writes seven verses, one pair of ascendants at a
     * time - Venus in the 5th with Mars in the 11th, Mercury in the 5th with
     * the Moon, Mars and Jupiter in the 11th, and so on - and Santhanam draws
     * the thread: "from shlokas 2 to 8, the formula that stands for basic
     * consideration is that the 5th lord should be in the 5th while the 11th
     * lord is in the 11th itself." Between them the seven cover all twelve
     * ascendants, so the general form is what is tested and the extra grahas
     * three of the verses ask for in the 11th are reported when they are there.
     */
    var fifth = c.lordOf(5), eleventh = c.lordOf(11);
    if (c.at[fifth] && c.at[eleventh] &&
        c.houseOf(fifth) === 5 && c.houseOf(eleventh) === 11) {
      var alsoEleventh = GRAHAS.filter(function (g) {
        return g !== eleventh && c.houseOf(g) === 11;
      });
      var reasons = [
        named(fifth) + ' rules the 5th and stands in it, while ' +
          named(eleventh) + ' rules the 11th and stands in that',
        'the 5th is the house of merit carried from before and the 11th of ' +
          'gain, and Parashara gives a verse to each of the seven ways this ' +
          'can fall, covering all twelve ascendants between them'
      ];
      if (alsoEleventh.length) {
        reasons.push(listOf(alsoEleventh) + ' stand in the 11th besides, which ' +
          'three of the seven verses ask for by name');
      }
      out.push({ reasons: reasons, grahas: [fifth, eleventh].concat(alsoEleventh),
        houses: [5, 11],
        summary: named(fifth) + ' holds the 5th it rules and ' + named(eleventh) +
          ' the 11th, which Parashara reads for great affluence.' });
    }

    /* Verses 9 to 15. */
    var lord = c.lordOf(1);
    var wanted = DHANA_COMPANY[lord] || [];
    if (c.at[lord] && c.houseOf(lord) === 1 && wanted.length &&
        wanted.every(function (g) { return touches(c, lord, g); })) {
      var how = wanted.map(function (g) {
        return named(g) + (c.together(lord, g) ? ' with him' : ' aspecting');
      });
      out.push({ grahas: [lord].concat(wanted), houses: [1],
        reasons: [
          named(lord) + ' rules ' + firstHouse(chart, 'the ascendant') +
            ' and stands in it, which is his own sign by definition',
          'and the company the verse asks for is there: ' + listOf(how),
          'Parashara names different companions for each of the seven, so the ' +
            'rule is not that any two grahas will do'
        ],
        summary: named(lord) + ' rules ' + firstHouse(chart, 'the ascendant') +
          ' and stands in it with ' + listOf(wanted) +
          ', which Parashara reads for wealth.' });
    }
    return gather('Dhana Yoga', 'Dhana yoga', out);
  }

  /*
   * Chapter 42, the other side of it. Fifteen verses; the seven tested here are
   * 2 to 8, which need nothing beyond houses, lords and aspects. The rest want
   * dispositor chains, the navamsa ascendant and the Atmakaraka, and a finding
   * has to say so rather than let a reader take silence for absence.
   */
  var DARIDRA = [
    { key: 'exchange-12', verse: 2 }, { key: 'exchange-6', verse: 3 },
    { key: 'ketu', verse: 4 }, { key: 'dusthana', verse: 5 },
    { key: 'evil-company', verse: 6 }, { key: 'trine-lords', verse: 7 },
    { key: 'malefic-lagna', verse: 8 }
  ];
  var DUSTHANAS = [6, 8, 12];

  function daridra(chart) {
    var c = lordship(chart);
    if (!c.at.Sun) return [];
    var benefics = Astro.naturalBenefics(chart);
    var marakas = marakasOf(c, benefics);
    var lord = c.lordOf(1);
    if (!c.at[lord]) return [];
    var out = [];
    var struckBy = function (graha) {
      return marakas.filter(function (m) { return m !== graha && touches(c, graha, m); });
    };
    var say = function (key, reasons, summary, grahas, houses) {
      out.push({ reasons: reasons, summary: summary, grahas: grahas,
        houses: houses || [] });
    };

    /* 2 and 3: the ascendant lord exchanged with the 12th or the 6th. */
    [[12, 'exchange-12'], [6, 'exchange-6']].forEach(function (pair) {
      var house = pair[0], other = c.lordOf(house);
      if (!c.at[other] || c.houseOf(lord) !== house || c.houseOf(other) !== 1) return;
      var hit = struckBy(lord).concat(struckBy(other).filter(function (m) {
        return struckBy(lord).indexOf(m) < 0;
      }));
      if (!hit.length) return;
      say(pair[1], [
        named(lord) + ' rules ' + firstHouse(chart, 'the ascendant') + ' and sits in the ' +
          ordinal(house) + ', while ' + named(other) + ' rules the ' + ordinal(house) +
          ' and sits in ' + firstHouse(chart, 'the ascendant') + ': the two have exchanged',
        listOf(hit) + ' is a maraka and reaches them, which the verse asks for; ' +
          'the marakas are the lords of the 2nd and the 7th, malefics standing ' +
          'in those houses, and malefics keeping their company'
      ], named(lord) + ' and ' + named(other) + ' have exchanged ' +
        firstHouse(chart, 'the ascendant') + ' and the ' + ordinal(house) +
        ', with ' + listOf(hit) + ' upon them.', [lord, other].concat(hit), [1, house]);
    });

    /* 4: the ascendant or the Moon with Ketu, the ascendant lord in the 8th. */
    if (c.houseOf(lord) === 8 && c.at.Ketu) {
      var withKetu = c.at.Ketu.sign === c.lagna ? firstHouse(chart, 'the ascendant')
        : (c.at.Moon && c.at.Moon.sign === c.at.Ketu.sign ? 'the Moon' : null);
      if (withKetu) {
        say('ketu', [
          'Ketu stands with ' + withKetu,
          named(lord) + ', who rules ' + firstHouse(chart, 'the ascendant') +
            ', is in the 8th'
        ], 'Ketu is with ' + withKetu + ' while ' + named(lord) + ', the lord of ' +
          firstHouse(chart, 'the ascendant') + ', is in the 8th.',
        ['Ketu', lord], [8]);
      }
    }

    /* 5: the ascendant lord with a malefic in a dusthana, the 2nd lord fallen. */
    var lordHouse = c.houseOf(lord);
    if (DUSTHANAS.indexOf(lordHouse) >= 0) {
      var beside = GRAHAS.filter(function (g) {
        return g !== lord && benefics[g] !== true && c.together(lord, g);
      });
      var second = c.lordOf(2);
      var seat = c.at[second] ? c.dignity(second) : null;
      var signLord = c.at[second] ? Astro.SIGN_LORDS[c.at[second].sign] : null;
      var fallen = seat === 'Debilitated' ||
        (signLord && Astro.naturalRelation(second, signLord) === -1);
      if (beside.length && fallen) {
        say('dusthana', [
          named(lord) + ' rules ' + firstHouse(chart, 'the ascendant') +
            ' and stands in the ' + ordinal(lordHouse) + ' with ' + listOf(beside) +
            ', a malefic',
          named(second) + ' rules the 2nd, the house of what is held, and is ' +
            (seat === 'Debilitated' ? 'debilitated'
              : 'in the sign of ' + signLord + ', a natural enemy'),
          'the verse says this reduces even a royal scion to pennilessness'
        ], named(lord) + ' is in the ' + ordinal(lordHouse) + ' with ' +
          listOf(beside) + ' while ' + named(second) + ', the 2nd lord, is ' +
          (seat === 'Debilitated' ? 'debilitated.' : 'in an enemy’s sign.'),
        [lord, second].concat(beside), [lordHouse, 2]);
      }
    }

    /* 6: the ascendant lord with an evil lord or Saturn and no benefic looking on. */
    var evilLords = DUSTHANAS.map(function (h) { return c.lordOf(h); });
    var bad = GRAHAS.filter(function (g) {
      return g !== lord && c.together(lord, g) &&
        (evilLords.indexOf(g) >= 0 || g === 'Saturn');
    });
    if (bad.length) {
      var helped = aspectingOf(c, lord).filter(function (g) {
        return benefics[g] === true;
      });
      if (!helped.length) {
        say('evil-company', [
          named(lord) + ' rules ' + firstHouse(chart, 'the ascendant') +
            ' and keeps company with ' + listOf(bad) +
            (bad.indexOf('Saturn') >= 0 && evilLords.indexOf('Saturn') < 0
              ? ', Saturn being named in the verse whatever he rules'
              : ', who rules one of the 6th, 8th and 12th'),
          'and no benefic aspects him, which is the clause that would have ' +
            'saved it'
        ], named(lord) + ' stands with ' + listOf(bad) +
          ' and no benefic looks on.', [lord].concat(bad), [c.houseOf(lord)]);
      }
    }

    /* 7: the 5th lord in the 6th and the 9th lord in the 12th, marakas on them. */
    var fifthLord = c.lordOf(5), ninthLord = c.lordOf(9);
    if (c.at[fifthLord] && c.at[ninthLord] &&
        c.houseOf(fifthLord) === 6 && c.houseOf(ninthLord) === 12) {
      var struck = struckBy(fifthLord).concat(struckBy(ninthLord)
        .filter(function (m) { return struckBy(fifthLord).indexOf(m) < 0; }));
      if (struck.length) {
        say('trine-lords', [
          named(fifthLord) + ' rules the 5th and is in the 6th, while ' +
            named(ninthLord) + ' rules the 9th and is in the 12th',
          'the two trine lords are the wealth-givers of the chapter before this ' +
            'one, and here both are in houses of loss',
          listOf(struck) + ' is a maraka and reaches them'
        ], 'The lords of the 5th and the 9th are in the 6th and the 12th with ' +
          listOf(struck) + ' upon them.',
        [fifthLord, ninthLord].concat(struck), [6, 12]);
      }
    }

    /* 8: malefics other than the 9th and 10th lords in the ascendant. */
    var spared = [c.lordOf(9), c.lordOf(10)];
    var inLagna = GRAHAS.filter(function (g) {
      return benefics[g] !== true && c.houseOf(g) === 1 && spared.indexOf(g) < 0;
    });
    if (inLagna.length) {
      var reached = [];
      inLagna.forEach(function (g) {
        struckBy(g).forEach(function (m) {
          if (reached.indexOf(m) < 0 && inLagna.indexOf(m) < 0) reached.push(m);
        });
      });
      if (reached.length) {
        say('malefic-lagna', [
          listOf(inLagna) + ' stands in ' + firstHouse(chart, 'the ascendant') +
            ', a malefic ruling neither the 9th nor the 10th, which the verse ' +
            'excepts',
          listOf(reached) + ' is a maraka and reaches ' +
            (inLagna.length > 1 ? 'them' : 'him')
        ], listOf(inLagna) + ' holds ' + firstHouse(chart, 'the ascendant') +
          ' with ' + listOf(reached) + ' upon it.',
        inLagna.concat(reached), [1]);
      }
    }
    if (out.length) {
      out[out.length - 1].reasons = out[out.length - 1].reasons.concat([
        'Parashara gives fifteen of these; seven are tested here, the rest ' +
          'needing the navamsa ascendant, the Atmakaraka or a chain of ' +
          'dispositors, so a chart can carry one that is not reported']);
    }
    return gather('Daridra Yoga', 'Daridra yoga', out);
  }


  /* ------------------------------------------------------- Nabhasa */

  /*
   * Parashara's chapter 35, thirty-two yogas read off one thing: which signs
   * the seven grahas occupy. No strength, no dignity, no aspect, no lordship.
   * "O excellent of the Brahmins, explained below are 32 Nabhasa yogas which
   * have a total of 1800 different varieties. These consist of 3 Asraya yogas,
   * 2 Dala yogas, 20 Akriti yogas, and 7 Sankhya yogas."
   *
   * The nodes are out. Verse 13 counts "all the .7 planets" and Jataka Parijata
   * says the seven throughout, so Rahu and Ketu neither make a figure nor break
   * one.
   *
   * Every Akriti is matched on the exact set of houses occupied rather than on
   * containment, and that is a reading worth stating because the alternative
   * makes nonsense. "All the planets should occupy the 1st, 2nd, 3rd and 4th
   * houses" is satisfied by all seven sitting in the 1st, which would then be
   * Yupa and Nauka and Gada and Sakata and Kamala at once. Jataka Parijata
   * settles it: the Akritis are "special instances" of the Sankhya yogas by
   * count - Sringataka and Hala of Sula, which is three signs; Vajra, Yava,
   * Kamala, Vapi, Yupa, Ishu, Sakti and Danda of Kedara, which is four; Nauka,
   * Koota, Chatra, Chapa and Ardhachandra of Veena, which is seven; Samudra and
   * Chakra of Dama, which is six. So the figure has to be filled, not merely
   * contained, and the sets below are exact.
   *
   * Houses are whole signs here as everywhere on this site, so an occupied
   * house and an occupied sign are the same count. The commentary on Jataka
   * Parijata notes that Maya, Yavana and Garga read these from the bhava chart
   * rather than the rasi, which would let unequal bhavas make figures the signs
   * do not; that is not the reading here.
   */
  var NABHASA_MODALITY = { Rajju: 0, Musala: 1, Nala: 2 };

  /* The exact house sets, sorted. Gada is the only one with alternatives that
     are not a rotation of a single shape, so its four runs are listed out. */
  var NABHASA_AKRITI = [
    { name: 'Gada', sets: [[1, 4], [4, 7], [7, 10], [1, 10]] },
    { name: 'Sakata', sets: [[1, 7]], collides: true },
    { name: 'Vihaga', sets: [[4, 10]] },
    { name: 'Sringataka', sets: [[1, 5, 9]] },
    { name: 'Hala', sets: [[2, 6, 10], [3, 7, 11], [4, 8, 12]] },
    { name: 'Vapi', sets: [[2, 5, 8, 11], [3, 6, 9, 12]] },
    { name: 'Yupa', sets: [[1, 2, 3, 4]] },
    { name: 'Sara', sets: [[4, 5, 6, 7]] },
    { name: 'Sakthi', sets: [[7, 8, 9, 10]] },
    { name: 'Danda', sets: [[1, 10, 11, 12]] },
    { name: 'Chakra', sets: [[1, 3, 5, 7, 9, 11]] },
    { name: 'Samudra', sets: [[2, 4, 6, 8, 10, 12]] }
  ];

  var NABHASA_SANKHYA = [null, 'Gola', 'Yuga', 'Sula', 'Kedara', 'Pasa',
    'Dama', 'Vallaki'];

  /*
   * What each is read for, from Parashara's verses 18 to 50. Kept to the head
   * of each list: the whole of Chakra is "an emperor at whose feet will be the
   * prostrating kings' heads", and the rest of them run to a line apiece.
   */
  var NABHASA_SAYS = {
    Rajju: 'fond of wandering, charming, earning in foreign countries',
    Musala: 'honour, wisdom and wealth, dear to king, firm in disposition',
    Nala: 'uneven physique, skilful, helpful to relatives, charming',
    Mala: 'ever happy, with conveyances, robes, food and pleasures',
    Sarpa: 'crooked and cruel, poor, dependent on others for food',
    Gada: 'always at work to earn, skilful in shastra and song, with gold and gems',
    Sakata: 'afflicted by disease, poor, devoid of friends and relatives',
    Vihaga: 'fond of roaming, a messenger, shameless, given to quarrels',
    Sringataka: 'fond of battle, happy, dear to king, with an auspicious wife',
    Hala: 'a farmer, very poor, miserable, given up by friends',
    Vajra: 'happy at the beginning and the end of life, valorous, charming',
    Yava: 'observing fasts, charitable and firm, happy and wealthy in mid-life',
    Kamala: 'rich and virtuous, long-lived, very famous, a king',
    Vapi: 'accumulating lasting wealth, with happiness and sons, a king',
    Yupa: 'spiritual knowledge, given to sacrifice and fasting, distinguished',
    Sara: 'head of a prison, earning through animals, given to mean handiwork',
    Sakthi: 'bereft of wealth and unsuccessful, long-lived, skilful in war',
    Danda: 'losing sons and wife, indigent, away from his own, serving mean people',
    Nauka: 'a livelihood through water, wealthy and famous, but wretched and miserly',
    Koota: 'heading a jail, poor and crafty, living in hills and fortresses',
    Chatra: 'helping his own, kind, dear to many kings, long-lived',
    Chapa: 'a keeper of secrets, fond of forests, happy in the middle of life',
    Ardhachandra: 'leading an army, dear to king, strong, with gems and gold',
    Chakra: 'an emperor, at whose feet the heads of kings are prostrate',
    Samudra: 'many precious stones and abundant wealth, dear to people',
    Gola: 'strong, but devoid of wealth, learning and intelligence',
    Yuga: 'heretic, devoid of wealth, discarded by others',
    Sula: 'sharp and indolent, valiant, famous through war',
    Kedara: 'useful to many, an agriculturist, truthful, wealthy, fickle',
    Pasa: 'liable to imprisonment, skilful in work, talkative, with many servants',
    Dama: 'helpful to others, righteously wealthy, famous, courageous',
    Vallaki: 'fond of song, dance and instruments, skilful, a leader of men'
  };

  /* A run of `length` houses starting at `from`, as a sorted set. */
  function houseRun(from, length) {
    var out = [];
    for (var i = 0; i < length; i++) out.push((from - 1 + i) % 12 + 1);
    return out.sort(function (a, b) { return a - b; });
  }

  function sameSet(a, b) {
    return a.length === b.length && a.every(function (h, i) { return h === b[i]; });
  }

  function nabhasaFinding(name, group, reasons, summary, grahas, houses) {
    /*
     * Two of the thirty-two share a name with a combination this site already
     * reports on a different rule: Sakata here is all seven grahas in the 1st
     * and the 7th, where the Sakata on the Yogas tab is Phaladeepika's Moon in
     * the 6th, 8th or 12th from Jupiter; and Chapa here is a seven-house arc
     * from the 10th, where the other is Raman's exalted lagna lord with the 4th
     * and 10th lords exchanged. Both pairs are legitimate uses of the name, so
     * the family is put in the title rather than one of them being renamed.
     */
    var collides = name === 'Sakata' || name === 'Chapa';
    return {
      yoga: 'Nabhasa Yoga',
      kind: name.toLowerCase(),
      subject: 'Nabhasa Yoga',
      /*
       * One passage for the family rather than four. The group is still on the
       * finding as `kind`, so the card can say which of the four a figure
       * belongs to; splitting the library four ways as well only made the yoga
       * topic heavier without telling a reader anything the one passage does
       * not.
       */
      condition: 'general',
      group: group,
      title: name + ' yoga' + (collides ? ' (Nabhasa)' : ''),
      family: 'Nabhasa',
      /* A figure is made of all seven at once and belongs to none of them. */
      graha: null,
      grahas: grahas,
      houses: houses,
      reasons: reasons.concat(['read for one ' + NABHASA_SAYS[name]]),
      summary: summary
    };
  }

  function nabhasa(chart) {
    var c = lordship(chart);
    var houses = [], bySign = {}, ready = true;
    GRAHAS.forEach(function (g) {
      var h = c.houseOf(g);
      if (h === null) { ready = false; return; }
      if (houses.indexOf(h) < 0) houses.push(h);
      (bySign[h] || (bySign[h] = [])).push(g);
    });
    if (!ready) return [];
    houses.sort(function (a, b) { return a - b; });
    var all = GRAHAS.slice();
    var out = [];

    /* Asraya: the quality of the signs, movable, fixed or dual. */
    var modality = Astro.signOf(c.at.Sun.longitude) % 3;
    var oneQuality = GRAHAS.every(function (g) { return c.at[g].sign % 3 === modality; });
    if (oneQuality) {
      var quality = ['movable', 'fixed', 'dual'][modality];
      Object.keys(NABHASA_MODALITY).forEach(function (name) {
        if (NABHASA_MODALITY[name] !== modality) return;
        out.push(nabhasaFinding(name, 'asraya',
          ['all seven grahas stand in ' + quality + ' signs, which is the whole ' +
            'of what this one asks'],
          'The Sun to Saturn all stand in ' + quality + ' signs, which is ' +
            name + ' yoga.', all, houses));
      });
    }

    /*
     * Dala: "If 3 angles are occupied by benefices Maala yoga is produced while
     * malefic so placed will cause Bhujanga or Sarpa yoga." Read as three of
     * the four angles held, and nothing but benefics (or nothing but malefics)
     * standing in them.
     */
    var benefics = Astro.naturalBenefics(chart);
    var angles = KENDRAS.filter(function (h) { return bySign[h]; });
    if (angles.length >= 3) {
      [[true, 'Mala', 'benefic'], [false, 'Sarpa', 'malefic']].forEach(function (side) {
        var held = angles.every(function (h) {
          return bySign[h].every(function (g) { return !!benefics[g] === side[0]; });
        });
        if (!held) return;
        var who = [];
        angles.forEach(function (h) {
          bySign[h].forEach(function (g) { if (who.indexOf(g) < 0) who.push(g); });
        });
        out.push(nabhasaFinding(side[1], 'dala',
          [angles.length + ' of the four angles are occupied, and every graha in ' +
            'them is ' + side[2] + ': ' + listOf(who)],
          listOf(who) + ' hold ' + angles.length + ' of the four angles and all ' +
            'of them are ' + side[2] + ', which is ' + side[1] + ' yoga.',
          who, angles));
      });
    }

    /* Akriti: the shape the occupied houses make, filled exactly. */
    var akriti = null;
    NABHASA_AKRITI.forEach(function (shape) {
      if (akriti) return;
      if (shape.sets.some(function (set) { return sameSet(houses, set); })) {
        akriti = shape.name;
      }
    });
    /*
     * The four angles together are Kamala, unless the benefics and the malefics
     * have sorted themselves onto the two axes, which makes it Vajra or Yava.
     */
    if (!akriti && sameSet(houses, [1, 4, 7, 10])) {
      var pure = function (list, wanted) {
        return list.every(function (h) {
          return bySign[h].every(function (g) { return !!benefics[g] === wanted; });
        });
      };
      akriti = pure([1, 7], true) && pure([4, 10], false) ? 'Vajra'
        : pure([4, 10], true) && pure([1, 7], false) ? 'Yava' : 'Kamala';
    }
    /* Seven in a row: from an angle it is named, from anywhere else it is the
       half moon. */
    if (!akriti && houses.length === 7) {
      var SEVENS = { 1: 'Nauka', 4: 'Koota', 7: 'Chatra', 10: 'Chapa' };
      for (var from = 1; from <= 12 && !akriti; from++) {
        if (!sameSet(houses, houseRun(from, 7))) continue;
        akriti = SEVENS[from] || 'Ardhachandra';
      }
    }
    if (akriti) {
      var where = listOf(houses.map(ordinal));
      out.push(nabhasaFinding(akriti, 'akriti',
        ['the seven grahas fall in the ' + where + ' and nowhere else, which is ' +
          'the figure this one is named for'],
        'The Sun to Saturn hold the ' + where + ' between them, which is ' +
          akriti + ' yoga.', all, houses));
    }

    /*
     * Sankhya, by the count of signs occupied. Parashara: "None of these seven
     * yogas will be operable, if another Nabhasa yoga explained earlier is
     * derivable." Read as the Akriti figures only, which is what Jataka
     * Parijata states and gives a reason for - the Akritis are special cases of
     * these by count, so a count reported beside its own special case says
     * nothing. Asraya and Dala are not counts of anything and do not crowd it
     * out: all seven in movable signs is a fact about the signs, and Mala is a
     * fact about the angles, where Kedara is the bare number four.
     */
    if (!akriti) {
      var name = NABHASA_SANKHYA[houses.length];
      if (name) {
        out.push(nabhasaFinding(name, 'sankhya',
          ['the seven grahas are spread over ' + houses.length + ' sign' +
            (houses.length === 1 ? '' : 's') + ' and no Akriti figure is made, ' +
            'which is what these seven count'],
          'The Sun to Saturn occupy ' + houses.length + ' sign' +
            (houses.length === 1 ? '' : 's') + ' between them, which is ' +
            name + ' yoga.', all, houses));
      }
    }
    return out;
  }


  /* ----------------------------------------------------- Saraswati */

  /*
   * Phaladeepika ch.6 sloka 26: "If Venus, Jupiter and Mercury occupy a Kendra,
   * a Trikona or the second house, and Jupiter be also in his exaltation, his
   * own or a friendly house and possess strength, the resulting Yoga is termed
   * Saraswati."
   *
   * So seven houses are open to the three - 1, 2, 4, 5, 7, 9 and 10 - and the
   * whole weight of the combination is on Jupiter, who has to be both well
   * placed by sign and strong. Mantreswara's sloka 27 is all learning: a native
   * "highly intelligent, clever, in dramaturgy, in prose composition,
   * versifying, accounts and poetics".
   *
   * "Possess strength" is read as it is everywhere else here, as meeting the
   * minimum Parashara sets for that graha in the shadbala reading. Without a
   * strength reading there is nothing to test it against, and reporting on
   * three conditions out of four would be worse than silence.
   */
  var SARASWATI_HOUSES = [1, 2, 4, 5, 7, 9, 10];
  var SARASWATI_GRAHAS = ['Venus', 'Jupiter', 'Mercury'];

  function saraswati(chart, strengths) {
    var c = lordship(chart);
    var where = {};
    var allPlaced = SARASWATI_GRAHAS.every(function (g) {
      var house = c.houseOf(g);
      if (house === null || SARASWATI_HOUSES.indexOf(house) < 0) return false;
      where[g] = house;
      return true;
    });
    if (!allPlaced) return [];

    /*
     * Mantreswara asks for exaltation, an own house or a friendly one, which is
     * three steps of one ladder and not the dignity column's two. The friendly
     * case is Jupiter's natural relation to the lord of the sign he stands in,
     * that being the relation the sloka is about; debilitation is ruled out
     * first so that a fall in a friend's sign cannot pass as a friendly house.
     */
    var seat = c.dignity('Jupiter');
    if (seat === 'Debilitated') return [];
    var signLord = Astro.SIGN_LORDS[c.at.Jupiter.sign];
    var friendly = Astro.naturalRelation('Jupiter', signLord) === 1;
    var dignified = DIGNIFIED.indexOf(seat) >= 0;
    if (!dignified && !friendly) return [];
    if (!isStrong(strengths, 'Jupiter')) return [];

    var seatSaid = seat === 'Exalted' ? 'exalted'
      : seat === 'Mooltrikona' ? 'in his moolatrikona'
      : seat === 'Own Sign' ? 'in his own sign'
      : 'in the sign of ' + signLord + ', a natural friend';
    var placed = SARASWATI_GRAHAS.map(function (g) {
      return g + ' in the ' + ordinal(where[g]);
    });

    return finding('Saraswati Yoga', 'Saraswati yoga', [
      listOf(placed) + ', all of them in an angle, a trine or the 2nd, which ' +
        'is the whole of the ground Mantreswara allows them',
      'Jupiter is ' + seatSaid + ', which is what the sloka asks of him beyond ' +
        'his placement',
      'and Jupiter is strong, meeting the minimum his shadbala is measured ' +
        'against, the sloka asking that he "possess strength" as well',
      'the combination is named for the goddess of learning, and Mantreswara ' +
        'reads it as eloquence rather than fortune'
    ],
    'Venus, Jupiter and Mercury hold the ' + ordinal(where.Venus) + ', the ' +
      ordinal(where.Jupiter) + ' and the ' + ordinal(where.Mercury) +
      ', and Jupiter is ' + seatSaid + ', strong enough to carry them. ' +
      'That is Saraswati yoga.',
    SARASWATI_GRAHAS.slice(),
    SARASWATI_GRAHAS.map(function (g) { return where[g]; }),
    /* Venus and Mercury only have to be well housed; Jupiter has to be
       dignified and strong besides, so the combination is his. */
    'Jupiter');
  }


  /* ----------------------------------------------------- Maha Raja */

  /*
   * Parashara's Raja Yogas chapter, slokas 6-7: "Should the ascendant lord and
   * the 5th lord exchange their signs or if Atmakaraka and Putra Karaka (Chara)
   * are in the ascendant, the 5th, exaltation sign, own sign or own Navamsha in
   * aspect to a benefic, Maha Raja yoga is produced. The native so born will be
   * famous and happy."
   *
   * Two clauses joined by "or", and both are tested. The first is one exchange
   * out of the sixty-six the parivartana detector already finds, and Parashara
   * gives that one a name of its own: Santhanam's note is that an exchange
   * between these two lords "will bestow a supreme Raja yoga".
   *
   * The second reaches for the chara karakas, which are read in the rashi here
   * as they are everywhere on this site - a karaka is assigned by degrees into
   * a sign, and a varga longitude is a position stretched back across thirty,
   * so recomputing them inside a division would be answering a different
   * question. The houses in the clause still move with the chart.
   *
   * "In aspect to a benefic" is read as aspect and not as company. A graha in
   * the same sign is associated rather than aspected in every other rule here,
   * and Santhanam's note says "be related to a benefice by aspect" in as many
   * words, so a chart that meets everything else with a benefic sitting beside
   * the karaka rather than looking at it is reported as not having the yoga.
   */
  function charaKarakasOf(chart) {
    return Astro.charaKarakas({ planets: chart.planets.map(function (p) {
      return { name: p.name,
        longitude: p.rashiLongitude === undefined ? p.longitude : p.rashiLongitude };
    }) });
  }

  function mahaRaja(chart) {
    var c = lordship(chart);
    var reasons = [], grahas = [], houses = [];
    var first = c.lordOf(1), fifth = c.lordOf(5);

    var exchanged = c.at[first] && c.at[fifth] &&
      c.houseOf(first) === 5 && c.houseOf(fifth) === 1;
    if (exchanged) {
      reasons.push(first + ' rules ' + firstHouse(chart, 'the ascendant') +
        ' and stands in the 5th, while ' + fifth + ' rules the 5th and stands ' +
        'in ' + firstHouse(chart, 'the ascendant') + ': the two have exchanged signs');
      grahas.push(first, fifth);
      houses.push(1, 5);
    }

    /*
     * The karaka clause. Each of the two has to be in one of the five places
     * the sloka names, and each has to be looked at by a benefic.
     */
    var karakas = charaKarakasOf(chart), byRole = {};
    Object.keys(karakas).forEach(function (g) { byRole[karakas[g]] = g; });
    var atma = byRole.Atmakaraka, putra = byRole.Putrakaraka;
    var benefics = Astro.naturalBenefics(chart);

    var seatOf = function (g) {
      var house = c.houseOf(g);
      if (house === 1) return 'in ' + firstHouse(chart, 'the ascendant');
      if (house === 5) return 'in the 5th';
      var d = c.dignity(g);
      if (d === 'Exalted') return 'exalted';
      if (d === 'Own Sign' || d === 'Mooltrikona') return 'in his own sign';
      if (c.navamsaLord(g) === g) return 'in his own navamsa';
      return null;
    };
    var seenBy = function (g) {
      if (!c.at[g]) return [];
      return GRAHAS.filter(function (b) {
        return b !== g && benefics[b] && c.at[b] &&
          Astro.aspects(b, c.at[b].sign, c.at[g].sign);
      });
    };

    var karakaClause = false;
    if (atma && putra && atma !== putra) {
      var atmaSeat = seatOf(atma), putraSeat = seatOf(putra);
      var atmaSeen = seenBy(atma), putraSeen = seenBy(putra);
      if (atmaSeat && putraSeat && atmaSeen.length && putraSeen.length) {
        karakaClause = true;
        reasons.push('the Atmakaraka is ' + named(atma) + ', ' + atmaSeat +
          ', and the Putrakaraka is ' + named(putra) + ', ' + putraSeat +
          ', which are two of the five placements the sloka names');
        reasons.push(listOf(atmaSeen) + ' aspects ' + named(atma) + ' and ' +
          listOf(putraSeen) + ' aspects ' + named(putra) + ', the clause ' +
          'asking that both be in aspect to a benefic');
        [atma, putra].forEach(function (g) {
          if (grahas.indexOf(g) < 0) grahas.push(g);
        });
      }
    }

    if (!exchanged && !karakaClause) return [];

    reasons.push('Parashara joins the two clauses with "or", so either makes ' +
      'the combination; the native "will be famous and happy"');
    if (!karakaClause) {
      reasons.push('the karaka clause does not hold here, and it would have ' +
        'made the same yoga on its own');
    }

    var summary = exchanged
      ? named(first) + ' and ' + named(fifth) + ', the lords of ' +
        firstHouse(chart, 'the ascendant') + ' and the 5th, have exchanged ' +
        signs(chart, first, fifth) + '. That is Maha Raja yoga.'
      : 'The Atmakaraka ' + named(atma) + ' and the Putrakaraka ' +
        named(putra) + ' are both well placed and aspected by a benefic. ' +
        'That is Maha Raja yoga.';

    return finding('Maha Raja Yoga', 'Maha Raja yoga', reasons, summary,
      grahas, houses);
  }

  /* The pair of signs an exchange runs between, named rather than numbered. */
  function signs(chart, a, b) {
    var at = {};
    chart.planets.forEach(function (p) { at[p.name] = p; });
    return at[a] && at[b]
      ? 'signs, ' + Astro.SIGNS[at[b].sign] + ' for ' + Astro.SIGNS[at[a].sign]
      : 'signs';
  }


  /* ------------------------------------------------- the Sun's company */

  /*
   * Raman's combinations 16 to 18, and the exact mirror of the Moon's company
   * above: grahas in the 2nd from the Sun is Vesi, in the 12th is Vasi, both is
   * Ubhayachari. Same five grahas, and Raman's exclusion is explicit -
   * "Excepting the Moon and Rahu and Kethu, any other planet or planets may
   * cause Vesi Yoga."
   *
   * The asymmetry with the Moon is worth noticing and is the reason this is a
   * separate detector rather than the same one run twice. The Moon alone has a
   * name and a dark reading; the Sun alone has neither, and Raman says why the
   * question hardly arises: "One or more of the above three Yogas caused by the
   * Sun would be present in almost every horoscope. Mercury is always confined
   * within a certain elongation from the Sun and unless the Sun is in the last
   * part of a sign and Mercury has attained his greatest elongation ... Vesi or
   * Vasi Yoga will invariably be present." Measured, one of the three holds in
   * 89 per cent of charts.
   *
   * Benefic and malefic forms are named apart, as the kartari yogas are:
   * "If malefics occupy the second from the Sun, papavesi is caused while
   * subhavesi is given rise to by the presence of benefic planets."
   */
  var SUN_COMPANY = ['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

  function sunCompany(chart) {
    var positions = {};
    chart.planets.forEach(function (p) { positions[p.name] = p; });
    var sun = positions.Sun;
    if (!sun) return [];
    var benefics = Astro.naturalBenefics(chart);

    var inSign = function (sign) {
      return SUN_COMPANY.filter(function (g) {
        return positions[g] && positions[g].sign === sign;
      });
    };
    var second = inSign((sun.sign + 1) % 12);
    var twelfth = inSign((sun.sign + 11) % 12);
    if (!second.length && !twelfth.length) return [];   // Raman names no fourth

    var all = second.concat(twelfth);
    var good = all.filter(function (g) { return benefics[g]; });
    var bad = all.filter(function (g) { return !benefics[g]; });
    /*
     * Raman's results are written for the benefic form and reversed for the
     * malefic one, so a mixture belongs to neither and is named as mixed
     * rather than forced into whichever side has the larger count.
     */
    var kind = good.length && bad.length ? 'mixed' : (bad.length ? 'papa' : 'subha');

    var name = second.length && twelfth.length ? 'Ubhayachari'
      : (second.length ? 'Vesi' : 'Vasi');
    var where = second.length && twelfth.length
      ? listOf(twelfth) + ' in the sign before the Sun and ' + listOf(second) +
        ' in the sign after it'
      : (second.length ? listOf(second) + ' in the 2nd from the Sun'
                       : listOf(twelfth) + ' in the 12th from the Sun');

    var reasons = [where];
    reasons.push(kind === 'subha'
      ? 'every one of them is benefic, which is the form Raman writes the ' +
        'results for - subha' + name.toLowerCase()
      : kind === 'papa'
      ? 'all of them are malefic, which is papa' + name.toLowerCase() +
        ': Raman gives the same results reversed'
      : listOf(good) + ' benefic against ' + listOf(bad) + ' malefic, so it is ' +
        'neither the subha form Raman writes the results for nor the papa form ' +
        'he reverses them for');
    reasons.push('the Moon is excluded by the definition and the nodes with ' +
      'her, so the Sun can be flanked by them and still have no company by ' +
      'this rule');

    /*
     * The title carries the form and the library key does not. Raman names the
     * two apart - "If malefics occupy the second from the Sun, papavesi is
     * caused while subhavesi is given rise to by the presence of benefic
     * planets" - and a reader wants that word, the results being written for
     * one form and reversed for the other. The subject stays the bare name
     * because it is what astro_readings is keyed by, and all three forms are
     * the same combination read three ways rather than three combinations.
     */
    var prefix = kind === 'subha' ? 'Shubha ' : kind === 'papa' ? 'Papa ' : '';
    return [{
      yoga: name + ' Yoga',
      kind: kind,
      subject: name + ' Yoga',
      condition: 'general',
      title: prefix + name + ' yoga',
      family: 'The Sun’s company',
      /* The Sun marks where to count from; the grahas beside him make it. This is the case that showed the problem: with the Sun first in the list the card read it as the Sun's own. */
      graha: all.length === 1 ? all[0] : null,
      grahas: ['Sun'].concat(all),
      houses: [],
      reasons: reasons,
      summary: where.charAt(0).toUpperCase() + where.slice(1) + ', which is ' +
        prefix.toLowerCase() + name + ' yoga.'
    }];
  }

  /* ------------------------------------------- the Moon from the Sun */

  /*
   * Phaladeepika ch.6 shloka 14, the same verse that cancels Sakata: "The
   * Adhama, Sama and Varishtha Yogas are formed when the Moon occupies
   * respectively a Kendra, a Panaphara and an Apoklima house counted from the
   * Sun."
   *
   * Three answers to one question and one of them is always true, so this says
   * nothing by being present - only by which of the three it is. Worst when the
   * Moon is nearest the Sun in the angles, best when furthest off in the
   * cadents, which is the waxing Moon read as a scale.
   */
  var MOON_FROM_SUN = [
    { houses: [1, 4, 7, 10], name: 'Adhama', label: 'a kendra',
      says: 'the lowest of the three' },
    { houses: [2, 5, 8, 11], name: 'Sama', label: 'a panaphara',
      says: 'the middling one' },
    { houses: [3, 6, 9, 12], name: 'Varishtha', label: 'an apoklima',
      says: 'the best of the three' }
  ];

  function moonFromSun(chart) {
    var positions = {};
    chart.planets.forEach(function (p) { positions[p.name] = p; });
    var moon = positions.Moon, sun = positions.Sun;
    if (!moon || !sun) return [];
    var house = ((moon.sign - sun.sign) % 12 + 12) % 12 + 1;
    var band = MOON_FROM_SUN.filter(function (b) {
      return b.houses.indexOf(house) >= 0;
    })[0];

    return [{
      yoga: band.name + ' Yoga',
      kind: 'general',
      subject: band.name + ' Yoga',
      condition: 'general',
      title: band.name + ' yoga',
      family: 'The Moon from the Sun',
      graha: 'Moon',
      grahas: ['Moon', 'Sun'],
      houses: [],
      reasons: [
        'the Moon stands in the ' + ordinal(house) + ' from the Sun, ' +
          band.label,
        'one of these three is true of every chart, so what it says is which ' +
          'of them holds rather than that any does: this is ' + band.says
      ],
      summary: 'The Moon is in the ' + ordinal(house) + ' from the Sun, ' +
        band.label + ', which is ' + band.name + ' yoga.'
    }];
  }


  /* ----------------------------------------------------- Mahabhagya */

  /*
   * Combination 25. One rule, and every source that has it states it the same
   * way.
   *
   * Phaladeepika ch.6 shloka 14, where the combination comes from: "If, at a
   * day-birth in the case of a male, the Sun, the Moon and the Lagna are in
   * odd signs, the Mahabhagya Yoga is formed. The same Yoga in the case of
   * females will arise when the birth is at night and the Sun, the Moon and
   * the Lagna are posited in even signs." Parashara, Uttara Kalamrita, Jataka
   * Parijata and Sripatipaddhati do not carry the yoga at all, so that sloka
   * is the only classical statement of it there is.
   *
   * Raman gives it identically. Three Hundred Important Combinations,
   * combination 25: "In the case of a man, when the birth is during daytime
   * the Sun, the Moon and the Lagna should be in odd signs. In the case of
   * women, when the birth is during night, the Sun, the Moon and Lagna must be
   * in even signs."
   *
   * This site read him as dropping the day test for men and carried a setting
   * for it. The reading came from the summary at the back of his book, which
   * compresses the rule and leaves the condition out, and from his worked
   * chart, a man born at 8-35 p.m., night, declared to have the yoga fully
   * present. Both contradict the definition he had just given two paragraphs
   * earlier. They are slips, of which the book has many, and the day test is
   * simply the rule.
   */
  function mahabhagya(chart) {
    var positions = {};
    chart.planets.forEach(function (p) { positions[p.name] = p; });
    var sun = positions.Sun, moon = positions.Moon;
    if (!sun || !moon) return [];
    var lagna = Astro.signOf(chart.ascendant.longitude);
    // Sign indices count from 0 for Aries, so the odd signs are the even ones.
    var odd = function (sign) { return sign % 2 === 0; };
    var allOdd = odd(lagna) && odd(sun.sign) && odd(moon.sign);
    var allEven = !odd(lagna) && !odd(sun.sign) && !odd(moon.sign);
    if (!allOdd && !allEven) return [];

    var gender = chart.gender;
    var day = chart.dayBirth;

    var signs = 'the Sun in ' + Astro.SIGNS[sun.sign] + ', the Moon in ' +
      Astro.SIGNS[moon.sign] + ' and the ascendant in ' + Astro.SIGNS[lagna] +
      ', all ' + (allOdd ? 'odd' : 'even') + ' signs';
    var tripod = 'the ascendant, the Sun and the Moon are the tripod of life, ' +
      'ruling the body, the soul and the mind, and the yoga asks that all ' +
      'three fall on one side of the zodiac';

    /*
     * The rule is written for a man or a woman and the form offers neither as
     * an option as well. Choosing one of them for a native who did not say
     * would be inventing a fact; reporting nothing would hide a finding that
     * may well hold. So where the sex is not given, the half that the signs
     * fit is reported with the condition it rests on said out loud.
     */
    var male = gender === 'male', female = gender === 'female';
    var known = male || female;
    var reasons = [signs, tripod];

    if (allOdd) {
      if (known && !male) return [];              // the odd-sign half is the man's
      if (day === false) return [];               // and it asks for a day birth
      if (male) {
        reasons.push(day === true
          ? 'the odd signs are the reading for a man, born by day, which this ' +
            'birth was'
          : 'the odd signs are the reading for a man, and the rule asks that ' +
            'he be born by day');
      } else {
        reasons.push('the odd signs are the reading for a man; this chart ' +
          'records no sex, so the finding holds only if the native is one, ' +
          'and the birth is by day as the rule asks');
      }
      if (day === undefined) {
        reasons.push('whether the birth was by day could not be determined ' +
          'here, and the rule asks for it');
      }
    } else {
      if (known && !female) return [];
      if (day === true) return [];                 // both authorities want night
      if (female) {
        reasons.push('the even signs are the reading for a woman born at ' +
          'night, which is what Phaladeepika asks for');
      } else {
        reasons.push('the even signs are the reading for a woman born at ' +
          'night; this chart records no sex, so the finding holds only if the ' +
          'native is one');
      }
    }

    return [{
      yoga: 'Mahabhagya Yoga',
      kind: allOdd ? 'odd' : 'even',
      subject: 'Mahabhagya Yoga',
      condition: 'general',
      title: 'Mahabhagya yoga',
      family: null,
      /* The ascendant, the Sun and the Moon together: chart-wide. */
      graha: null,
      grahas: ['Sun', 'Moon'],
      houses: [1],
      reasons: reasons,
      summary: 'The tripod of life - the ascendant, the Sun and the Moon - ' +
        'falls entirely ' +
        'in ' + (allOdd ? 'odd' : 'even') + ' signs, which is Mahabhagya yoga.'
    }];
  }

  /* --------------------------------------------- four by placement */

  /*
   * Combination 8. "Chatussagara is caused when all the kendras are occupied by
   * the planets." The seven starry grahas; the nodes are left out here as they
   * are everywhere else in this file, being shadows rather than bodies.
   *
   * Rare, which is what makes it worth reporting: four houses to fill from
   * seven grahas, and they cluster.
   */
  function chatussagara(chart) {
    var lagna = Astro.signOf(chart.ascendant.longitude);
    var held = {};
    chart.planets.forEach(function (p) {
      if (GRAHAS.indexOf(p.name) < 0) return;
      var house = ((p.sign - lagna) % 12 + 12) % 12 + 1;
      (held[house] || (held[house] = [])).push(p.name);
    });
    if (!KENDRAS.every(function (h) { return held[h]; })) return [];

    return [{
      yoga: 'Chatussagara Yoga',
      kind: 'general',
      subject: 'Chatussagara Yoga',
      condition: 'general',
      title: 'Chatussagara yoga',
      family: null,
      graha: null,
      grahas: KENDRAS.reduce(function (all, h) { return all.concat(held[h]); }, []),
      houses: KENDRAS.slice(),
      reasons: [
        KENDRAS.map(function (h) {
          return listOf(held[h]) + ' in the ' + ordinal(h);
        }).join(', '),
        'all four angles occupied, which takes at least four of the seven ' +
          'grahas spread across houses that tend to cluster - it falls in ' +
          'under one chart in a hundred'
      ],
      summary: KENDRAS.map(function (h) {
        return listOf(held[h]) + ' in the ' + ordinal(h);
      }).join(', ') + ': every angle is occupied, which is Chatussagara yoga.'
    }];
  }

  /*
   * Combination 10. "Jupiter, Venus, Mercury and the Moon should be in Lagna or
   * they should be placed in kendra." All four, which is what makes it rare.
   */
  var RAJALAKSHANA = ['Jupiter', 'Venus', 'Mercury', 'Moon'];

  function rajalakshana(chart) {
    var positions = {};
    chart.planets.forEach(function (p) { positions[p.name] = p; });
    var lagna = Astro.signOf(chart.ascendant.longitude);
    var where = {};
    var all = RAJALAKSHANA.every(function (g) {
      if (!positions[g]) return false;
      var house = ((positions[g].sign - lagna) % 12 + 12) % 12 + 1;
      where[g] = house;
      return KENDRAS.indexOf(house) >= 0;
    });
    if (!all) return [];

    return [{
      yoga: 'Rajalakshana Yoga',
      kind: 'general',
      subject: 'Rajalakshana Yoga',
      condition: 'general',
      title: 'Rajalakshana yoga',
      family: null,
      graha: null,
      grahas: RAJALAKSHANA.slice(),
      houses: RAJALAKSHANA.map(function (g) { return where[g]; }),
      reasons: [
        RAJALAKSHANA.map(function (g) {
          return g + ' in the ' + ordinal(where[g]);
        }).join(', ') + ', every one of them an angle',
        'the name means the marks of royalty, and the rule asks for all four ' +
          'together rather than any of them: it falls in about one chart in a ' +
          'hundred'
      ],
      summary: 'Jupiter, Venus, Mercury and the Moon all hold angles, which is ' +
        'Rajalakshana yoga.'
    }];
  }

  /*
   * Combinations 33 to 44. "If all the seven planets occupy the seven houses
   * contiguously, reckoned from Lagna or any particular Bhava, the appropriate
   * Malika Yoga is caused." Twelve of them, one per starting house, and Raman
   * names each after the bhava it begins from.
   *
   * The rarest thing this file looks for, by a wide margin. Seven grahas have
   * to fall in seven adjoining signs and no others, which asks them to be both
   * spread out and bounded.
   *
   * Raman records a dissent worth keeping: "Bhavartha Ratnakara makes a
   * departure and suggests that the Malika Yoga should always commence from
   * Lagna and be disposed within five to nine houses from Lagna. According to
   * this view, evidently no contiguity is implied." The general view is the one
   * implemented, as Raman implements it.
   */
  var MALIKA_NAMES = ['Lagna', 'Dhana', 'Vikrama', 'Sukha', 'Putra', 'Satru',
    'Kalatra', 'Randhra', 'Bhagya', 'Karma', 'Labha', 'Vraya'];

  function malika(chart) {
    var lagna = Astro.signOf(chart.ascendant.longitude);
    var held = {};
    chart.planets.forEach(function (p) {
      if (GRAHAS.indexOf(p.name) < 0) return;
      (held[p.sign] || (held[p.sign] = [])).push(p.name);
    });
    var signs = Object.keys(held).map(Number);
    if (signs.length !== 7) return [];          // seven signs, seven grahas

    var start = null;
    for (var s = 0; s < 12 && start === null; s++) {
      var run = true;
      for (var k = 0; k < 7; k++) {
        if (!held[(s + k) % 12]) { run = false; break; }
      }
      if (run) start = s;
    }
    if (start === null) return [];

    var house = ((start - lagna) % 12 + 12) % 12 + 1;
    var name = MALIKA_NAMES[house - 1];
    return [{
      yoga: 'Malika Yoga',
      kind: name.toLowerCase(),
      subject: 'Malika Yoga',
      condition: 'general',
      title: name + ' Malika yoga',
      family: 'Malika',
      graha: null,
      grahas: GRAHAS.slice(),
      houses: [house],
      reasons: [
        'all seven grahas stand in seven adjoining signs, running from ' +
          Astro.SIGNS[start] + ' to ' + Astro.SIGNS[(start + 6) % 12],
        'the run begins in the ' + ordinal(house) + ', so of Raman’s twelve ' +
          'it is the ' + name + ' Malika',
        'it asks the grahas to be spread across seven signs and confined to ' +
          'them at once, and falls in about one chart in five hundred'
      ],
      summary: 'All seven grahas fall in seven adjoining signs from the ' +
        ordinal(house) + ', which is ' + name + ' Malika yoga.'
    }];
  }


  /*
   * Combination 14. "Benefics being disposed in Kendras, the 6th and 8th houses
   * should either be unoccupied or occupied by benefic planets."
   *
   * Two clauses, and the second is the one usually dropped: it is not enough
   * for benefics to hold angles, the two houses of harm have to be clear of
   * malefics as well.
   */
  function parvata(chart) {
    var lagna = Astro.signOf(chart.ascendant.longitude);
    var benefics = Astro.naturalBenefics(chart);
    var houseOf = function (sign) { return ((sign - lagna) % 12 + 12) % 12 + 1; };

    var inAngles = [], spoilers = [], guests = [];
    chart.planets.forEach(function (p) {
      if (GRAHAS.indexOf(p.name) < 0) return;      // nodes are not counted
      var house = houseOf(p.sign);
      if (benefics[p.name] && KENDRAS.indexOf(house) >= 0) inAngles.push(p.name);
      if (house === 6 || house === 8) {
        guests.push(p.name);
        if (!benefics[p.name]) spoilers.push(p.name);
      }
    });
    if (!inAngles.length || spoilers.length) return [];

    return [{
      yoga: 'Parvata Yoga',
      kind: 'general',
      subject: 'Parvata Yoga',
      condition: 'general',
      title: 'Parvata yoga',
      family: null,
      graha: null,
      grahas: inAngles.concat(guests),
      houses: [6, 8],
      reasons: [
        listOf(inAngles) + ' in the angles, ' +
          (guests.length ? 'and the 6th and 8th hold only ' + listOf(guests) +
            ', benefic' : 'and the 6th and 8th are both empty'),
        'the second clause is the one usually dropped: benefics in the angles ' +
          'are not enough on their own, the two houses of harm have to be ' +
          'clear of malefics as well'
      ],
      summary: listOf(inAngles) + ' hold' + (inAngles.length > 1 ? '' : 's') +
        ' the angles and nothing malefic sits in the 6th or the 8th. That is ' +
        'Parvata yoga.'
    }];
  }

  /*
   * Combination 9. "If benefics occupy the upachayas (3, 6, 10, 11) either from
   * the ascendant or from the Moon, the combination goes under the name of
   * Vasumathi Yoga."
   *
   * Raman reads it as a scale rather than a switch - "two benefics will give
   * less wealth while only one benefic will give ordinary wealth" - so the
   * count is reported, not just the fact. He also holds the lagna form the
   * stronger: "The Vasumathi resulting from the Lagna seems to have more
   * influence than the one formed with reference to the Moon."
   *
   * Either reference point will do, which is most of why it is so common.
   * Each alone holds in about 61 per cent of charts; because either satisfies
   * the rule, one or the other holds in 84 - five charts in six, commoner than
   * the angle-trine raja yoga and the commonest finding here.
   */
  var UPACHAYAS = [3, 6, 10, 11];

  function vasumathi(chart) {
    var positions = {};
    chart.planets.forEach(function (p) { positions[p.name] = p; });
    var lagna = Astro.signOf(chart.ascendant.longitude);
    var moon = positions.Moon;
    var benefics = Astro.naturalBenefics(chart);

    var from = function (anchor) {
      return GRAHAS.filter(function (g) {
        if (!benefics[g] || !positions[g] || g === 'Moon') return false;
        var house = ((positions[g].sign - anchor) % 12 + 12) % 12 + 1;
        return UPACHAYAS.indexOf(house) >= 0;
      });
    };
    var fromLagna = from(lagna);
    var fromMoon = moon ? from(moon.sign) : [];
    if (!fromLagna.length && !fromMoon.length) return [];

    var seats = [];
    if (fromLagna.length) seats.push(listOf(fromLagna) + ' in the upachayas from ' +
      firstHouse(chart, 'the ascendant'));
    if (fromMoon.length && chart.reference !== 'Moon') {
      seats.push(listOf(fromMoon) + ' in the upachayas from the Moon');
    }
    var most = Math.max(fromLagna.length, fromMoon.length);

    return [{
      yoga: 'Vasumathi Yoga',
      kind: fromLagna.length ? 'lagna' : 'moon',
      subject: 'Vasumathi Yoga',
      condition: 'general',
      title: 'Vasumathi yoga',
      family: null,
      graha: null,
      grahas: fromLagna.concat(fromMoon.filter(function (g) {
        return fromLagna.indexOf(g) < 0;
      })),
      houses: UPACHAYAS.slice(),
      reasons: [
        seats.join(', and '),
        fromLagna.length
          ? (chart.reference === 'Moon'
              ? 'this is the form from the Moon, which Raman holds the weaker of the two'
              : 'Raman holds the form from ' + firstHouse(chart, 'the ascendant') +
                ' the stronger of the two')
          : 'only the Moon gives it here, which Raman reads as the weaker form',
        'Raman reads the count and not just the fact - "two benefics will give ' +
          'less wealth while only one benefic will give ordinary wealth", so ' +
          'more is more - and ' + most + ' stand' + (most === 1 ? 's' : '') +
          ' here',
        'the Moon is not counted among the benefics occupying them, being the ' +
          'reference point for half the rule'
      ],
      summary: seats.join(', and ') + ': that is Vasumathi yoga.'
    }];
  }


  /* ------------------------------------ combinations 11 to 48, by lordship */

  /*
   * The combinations from here on turn on lords rather than on grahas, so they
   * share a few small readings of the chart. Kept together rather than repeated
   * inside each detector.
   */
  function lordship(chart) {
    var at = {};
    chart.planets.forEach(function (p) { at[p.name] = p; });
    var lagna = Astro.signOf(chart.ascendant.longitude);
    return {
      at: at,
      lagna: lagna,
      lordOf: function (house) { return Astro.SIGN_LORDS[(lagna + house - 1) % 12]; },
      houseOf: function (name) {
        return at[name] ? ((at[name].sign - lagna) % 12 + 12) % 12 + 1 : null;
      },
      apart: function (a, b) {
        if (!at[a] || !at[b]) return null;
        return ((at[a].sign - at[b].sign) % 12 + 12) % 12 + 1;
      },
      // "In mutual kendras" is symmetric, so either direction answers it.
      mutualKendra: function (a, b) {
        var d = this.apart(a, b);
        return d !== null && KENDRAS.indexOf(d) >= 0;
      },
      dignity: function (name) {
        return at[name] ? Astro.dignityOf(name, at[name].sign,
          at[name].longitude % 30) : null;
      },
      exalted: function (name) { return this.dignity(name) === 'Exalted'; },
      together: function (a, b) {
        return at[a] && at[b] && at[a].sign === at[b].sign;
      },
      /* The lord of the navamsa a graha occupies - the D9 sign's ruler, which
         several of these combinations reach for. */
      navamsaLord: function (name) {
        if (!at[name]) return null;
        return Astro.SIGN_LORDS[Astro.vargaPosition(at[name].longitude, 9).sign];
      }
    };
  }

  // "Strongly disposed" and "powerful" are the same test Lakshmi yoga makes:
  // the graha meets the minimum Parashara sets for it in the Shadbala reading.
  function isStrong(strengths, graha) {
    return !!(strengths && strengths[graha] && strengths[graha].strong);
  }

  /*
   * `graha` is the one the yoga resolves to: whose yoga it is, as against who
   * takes part in it. They are not the same question and the page had only ever
   * asked the second, so a combination caused by Mercury standing beside the
   * Sun appeared on the Sun's card too and read as the Sun's own. Several
   * resolve to nobody - an exchange belongs to two lords, a Nabhasa figure to
   * the whole chart - and null says so rather than naming whichever graha
   * happens to be first in the list.
   */
  function finding(subject, title, reasons, summary, grahas, houses, graha) {
    return [{
      yoga: subject, kind: 'general', subject: subject, condition: 'general',
      title: title, family: null, graha: graha === undefined ? null : graha,
      grahas: grahas || [], houses: houses || [],
      reasons: reasons, summary: summary
    }];
  }

  /*
   * Combination 11. "The Lagna is occupied by a malefic with Gulika in a trine;
   * or Gulika is associated with the lords of Kendras and Thrikonas; or the
   * lord of lagna is combined with Rahu, Sani or Kethu."
   *
   * Three alternative clauses and two of them need Gulika, which this site does
   * not compute. Gulika is an upagraha found by dividing the day into eight
   * parts and taking the one Saturn rules, but the rule has variants - which
   * end of the part is taken, and which lord opens the night - and no text
   * available here states one. So only the third clause is tested, and the
   * finding says so: a chart can have this yoga by either of the other two and
   * be reported as not having it.
   */
  var VANCHANA_COMPANY = ['Rahu', 'Saturn', 'Ketu'];

  function vanchanachorabheethi(chart) {
    var c = lordship(chart);
    var lord = c.lordOf(1);
    var with_ = VANCHANA_COMPANY.filter(function (g) {
      return g !== lord && c.together(lord, g);
    });
    if (!with_.length) return [];

    return finding('Vanchanachorabheethi Yoga', 'Vanchanachorabheethi yoga', [
      lord + ', ' + firstLord(chart, 'lord of the ascendant') + ', stands with ' +
        listOf(with_) + ' in ' +
        Astro.SIGNS[c.at[lord].sign],
      'read for a turn of mind rather than an event: a person who expects to ' +
        'be cheated or robbed, and is watchful about it',
      'this is the third of Raman’s three clauses. The other two need Gulika, ' +
        'which is not computed here because no text available to this site ' +
        'states which of the competing rules for finding it to use - so a ' +
        'chart may hold this yoga by one of those and be reported without it'
    ], lord + ', ' + firstLord(chart, 'the ascendant lord') + ', is joined by ' + listOf(with_) +
       ', which is Vanchanachorabheethi yoga.', [lord].concat(with_), [1],
       /* The clause tested is about the ascendant lord's company, so it is his. */
       lord);
  }

  /*
   * Combination 15. "Lords of the fourth and ninth houses should be in Kendras
   * from each other and the lord of Lagna should be strongly disposed."
   *
   * Raman's own caution on this one is worth carrying: "No yogas should be
   * interpreted verbatim if the results are to hold good to modern life and
   * conditions." His results read a commander of a small army and a few
   * villages.
   */
  function kahala(chart, strengths) {
    var c = lordship(chart);
    var fourth = c.lordOf(4), ninth = c.lordOf(9), lagnaLord = c.lordOf(1);
    if (fourth === ninth) return [];              // one graha is not two lords apart
    if (!c.mutualKendra(fourth, ninth)) return [];
    if (!isStrong(strengths, lagnaLord)) return [];

    return finding('Kahala Yoga', 'Kahala yoga', [
      fourth + ' rules the 4th and ' + ninth + ' the 9th, and they stand in ' +
        'angles from each other',
      lagnaLord + ', ' + firstLord(chart, 'lord of the ascendant') +
        ', is strong, which the rule asks ' +
        'for and which is what keeps this from being common',
      'Raman warns against reading the old results literally: "No yogas ' +
        'should be interpreted verbatim if the results are to hold good to ' +
        'modern life and conditions"'
    ], fourth + ' and ' + ninth + ', lords of the 4th and 9th, stand in angles ' +
       'from each other, with ' + named(lagnaLord) + ' strong. That is Kahala yoga.',
       [fourth, ninth, lagnaLord], [4, 9]);
  }

  /*
   * Combination 26. "The lord of the sign occupied by the Moon (who should be
   * associated with lord of Lagna) should be in a Kendra or in the house of an
   * intimate friend aspecting Lagna and at the same time, Lagna should be
   * occupied by a powerful planet."
   *
   * Raman calls it "somewhat complicated" himself. Read as three things at
   * once: the Moon's dispositor keeping company with the ascendant lord, that
   * dispositor well placed, and the ascendant itself tenanted by something
   * strong.
   */
  function pushkala(chart, strengths) {
    var c = lordship(chart);
    if (!c.at.Moon) return [];
    var dispositor = Astro.SIGN_LORDS[c.at.Moon.sign];
    var lagnaLord = c.lordOf(1);
    if (dispositor !== lagnaLord && !c.together(dispositor, lagnaLord)) return [];
    if (!c.at[dispositor]) return [];

    var house = c.houseOf(dispositor);
    var inKendra = KENDRAS.indexOf(house) >= 0;
    /*
     * "The house of an intimate friend" is the compound relation adhimitra,
     * read between the graha and the lord of the sign it sits in - the same
     * reading the graha table prints.
     */
    var seatLord = Astro.SIGN_LORDS[c.at[dispositor].sign];
    var friendly = seatLord !== dispositor &&
      Astro.compoundRelation(dispositor, seatLord,
        ((c.at[dispositor].sign - c.at[seatLord].sign) % 12 + 12) % 12 + 1) === 'adhimitra';
    var seesLagna = aspects(dispositor, c.at[dispositor].sign, c.lagna);
    if (!inKendra && !(friendly && seesLagna)) return [];

    var tenants = GRAHAS.filter(function (g) {
      return c.houseOf(g) === 1 && isStrong(strengths, g);
    });
    if (!tenants.length) return [];

    return finding('Pushkala Yoga', 'Pushkala yoga', [
      dispositor + ' rules the sign the Moon occupies and ' +
        (dispositor === lagnaLord
          ? 'is himself ' + firstLord(chart, 'the ') + 'lord of ' + firstHouse(chart, 'the ascendant') + firstLord(chart, '')
          : 'stands with ' + lagnaLord + ', ' + firstLord(chart, 'the ascendant lord')),
      inKendra
        ? dispositor + ' holds the ' + ordinal(house) + ', an angle'
        : dispositor + ' sits in the sign of ' + seatLord + ', an intimate ' +
          'friend, and aspects ' + firstHouse(chart, 'the ascendant'),
      listOf(tenants) + ' occupies ' + firstHouse(chart, 'the ascendant') + ' and is strong, which is the ' +
        'last of the three things the rule asks at once',
      'Raman calls the combination "somewhat complicated" himself'
    ], (function () {
         var others = tenants.filter(function (g) { return g !== dispositor; });
         return dispositor + ', who rules the sign the Moon occupies, ' +
           (dispositor === lagnaLord ? 'is himself ' + firstLord(chart, 'the ascendant lord') + ' and '
             : 'stands with ' + named(lagnaLord) + ' and ') +
           (inKendra && house === 1 && !others.length
             ? 'holds ' + firstHouse(chart, 'the ascendant') + ', strong there'
             : (inKendra ? 'holds the ' + ordinal(house)
                 : 'sits in ' + named(seatLord) + '\u2019s sign aspecting ' + firstHouse(chart, 'the ascendant')) +
               (others.length
                 ? ', while ' + listOf(others) + ' holds ' + firstHouse(chart, 'the ascendant') + ' strongly'
                 : ', and is strong in ' + firstHouse(chart, 'the ascendant') + ' himself')) +
           '. That is Pushkala yoga.';
       })(), [dispositor, lagnaLord].concat(tenants), [1],
       /* Every clause of the rule is about the Moon's dispositor: who he
          stands with, where he sits, what he aspects. It is his. */
       dispositor);
  }

  /*
   * Combination 28, which Raman states three times and loosens each time.
   *
   * The definition on p.60: "The lord of the Navamsa occupied by the lord of
   * the 10th should join the 10th in exaltation and combined with the lord of
   * Lagna."
   *
   * His own remarks on the same page, choosing between the versions in
   * circulation: "We shall stick to the definition we have first propounded
   * and deem that in order to cause Gauri Yoga, the lord of the Navamsa
   * occupied by the 10th lord be in the 10th exalted." The lagna lord has
   * gone, and he adds that this "does not exclude the possibility of some
   * other planet occupying the 10th house".
   *
   * And the summary chapter: "The elevated position of the lord of the
   * Navamsa held by the lord of the 10th produces Gauri Yoga." The 10th house
   * has gone too.
   *
   * So all three are reported, as the grade that was actually met, rather than
   * one of them chosen and the others silently refused. The strict form is the
   * one his opening sentence gives; it is also the one his own illustration,
   * chart 29, fails - there the lagna lord Venus stands in Gemini while
   * Jupiter is exalted in the 10th - so a detector that tested only it would
   * reject the author's example of his own yoga.
   *
   * Raman's second definition is a separate rule and not a grade of this one:
   * "another school of Astrologers hold that Gauri Yoga is produced if the
   * lord of the 9th and the Moon be posited in their own or exaltation signs
   * identical with a trine or quadrant." He reports it without argument and
   * sets it aside. It is Phaladeepika's, sloka 21, minus that text's
   * requirement that Jupiter aspect the Moon. Neither is tested here.
   */
  var GAURI_GRADES = {
    strict: 'Gauri yoga (strict)',
    medium: 'Gauri yoga (medium)',
    weak: 'Gauri yoga (weak)'
  };

  function gauri(chart) {
    var c = lordship(chart);
    var tenth = c.lordOf(10), lagnaLord = c.lordOf(1);
    var amsaLord = c.navamsaLord(tenth);
    if (!amsaLord || !c.at[amsaLord]) return [];
    if (!c.exalted(amsaLord)) return [];

    var inTenth = c.houseOf(amsaLord) === 10;
    var withLagnaLord = amsaLord === lagnaLord || c.together(amsaLord, lagnaLord);
    var grade = inTenth && withLagnaLord ? 'strict' : inTenth ? 'medium' : 'weak';

    var holds = [
      amsaLord + ' rules the navamsa that ' + tenth + ', lord of the 10th, occupies',
      amsaLord + ' is exalted' + (inTenth ? ' in the 10th' : ' in the ' +
        ordinal(c.houseOf(amsaLord)) + ', not the 10th')
    ];
    if (grade === 'strict') {
      holds.push(amsaLord === lagnaLord
        ? amsaLord + ' is also ' + firstLord(chart, 'the ') + 'lord of ' +
          firstHouse(chart, 'the ascendant') + firstLord(chart, '') +
          ', which satisfies the last clause in one graha'
        : 'and with ' + lagnaLord + ', ' + firstLord(chart, 'the ') + 'lord of ' +
          firstHouse(chart, 'the ascendant') + firstLord(chart, ''));
      holds.push('That is the definition Raman gives first, and the strictest of ' +
        'the three he states');
    } else if (grade === 'medium') {
      holds.push('The lagna lord is elsewhere, so this is the form Raman settles ' +
        'on in his remarks rather than the one his opening sentence gives');
    } else {
      holds.push('Neither in the 10th nor with the lagna lord, so this is only ' +
        'the form his summary chapter states');
    }

    var summary = amsaLord + ', who rules the navamsa ' + tenth + ' occupies, is ' +
      'exalted' + (inTenth ? ' in the 10th' : ' in the ' + ordinal(c.houseOf(amsaLord))) +
      (grade === 'strict'
        ? (amsaLord === lagnaLord
          ? ' and rules ' + firstHouse(chart, 'the ascendant') + ' himself'
          : ' with ' + named(lagnaLord) + ', ' + firstLord(chart, 'the ascendant lord'))
        : '') + '. That is Gauri yoga, ' + grade + '.';

    /*
     * One subject and one condition for all three, so they share the passage
     * that explains the ladder; the title tells them apart, and the card takes
     * its rarity from the title where there is one.
     */
    return finding('Gauri Yoga', GAURI_GRADES[grade], holds, summary,
      [amsaLord, tenth, lagnaLord], inTenth ? [10] : []);
  }

  /*
   * Combination 29. "The lords of the Navamsas occupied by the lords of the
   * 2nd, 5th and 11th should be exalted and combined with the 9th lord."
   *
   * Raman points out that this is three yogas and not one: "Three Yogas are
   * given rise to inasmuch as the 9th lord cannot be in simultaneous
   * conjunction with all the three Navamsa lords." So any one of the three
   * forms it, and the finding names which.
   */
  var BHARATHI_HOUSES = [2, 5, 11];

  function bharathi(chart) {
    var c = lordship(chart);
    var ninth = c.lordOf(9);
    var made = [];
    BHARATHI_HOUSES.forEach(function (h) {
      var lord = c.lordOf(h);
      var amsaLord = c.navamsaLord(lord);
      if (!amsaLord || !c.at[amsaLord]) return;
      if (!c.exalted(amsaLord)) return;
      if (amsaLord !== ninth && !c.together(amsaLord, ninth)) return;
      made.push({ house: h, lord: lord, amsaLord: amsaLord });
    });
    if (!made.length) return [];

    return finding('Bharathi Yoga', 'Bharathi yoga', [
      made.map(function (m) {
        return m.amsaLord + ', lord of the navamsa ' + m.lord + ' occupies as ' +
          'lord of the ' + ordinal(m.house) + ', exalted';
      }).join('; and '),
      (made.length === 1 ? 'and standing with ' : 'each standing with ') +
        ninth + ', the lord of the 9th',
      'Raman counts this as three yogas rather than one, "inasmuch as the 9th ' +
        'lord cannot be in simultaneous conjunction with all the three ' +
        'Navamsa lords", so any one of the three forms it'
    ], (function () {
         var by = {};
         made.forEach(function (m) {
           (by[m.amsaLord] || (by[m.amsaLord] = [])).push(ordinal(m.house));
         });
         return Object.keys(by).map(function (g) {
           return g + ', exalted, rules the navamsa held by the lord of the ' +
             listOf(by[g]);
         }).join('; and ');
       })() + ', standing with ' + named(ninth) + ', lord of the 9th. That is ' +
       'Bharathi yoga.',
       made.map(function (m) { return m.amsaLord; }).concat([ninth]),
       made.map(function (m) { return m.house; }));
  }

  /*
   * Combination 30. "If Jupiter is in Lagna, the Moon in the seventh and the
   * Sun in the 2nd, the combination goes under the name of Kusuma."
   *
   * Raman gives a rival definition from elsewhere and does not adopt it:
   * "Professor Rao gives an altogether different version in his Satayoga
   * Manjari when he says that Kusuma Yoga is caused if Venus occupies a fixed
   * sign in a Kendra, the weak Moon ..." - the scan breaks there. Only Raman's
   * own is implemented.
   */
  function kusuma(chart) {
    var c = lordship(chart);
    if (c.houseOf('Jupiter') !== 1) return [];
    if (c.houseOf('Moon') !== 7) return [];
    if (c.houseOf('Sun') !== 2) return [];

    return finding('Kusuma Yoga', 'Kusuma yoga', [
      'Jupiter in ' + firstHouse(chart, 'the ascendant') + ', the Moon in the 7th and the Sun in the 2nd, ' +
        'which is the whole of the rule',
      'three fixed placements and nothing else asked, which makes it one of ' +
        'the plainest combinations in the book and one of the rarest',
      'Raman records a different version from Satayoga Manjari and does not ' +
        'adopt it; his own is what is tested here'
    ], 'Jupiter holds ' + firstHouse(chart, 'the ascendant') + ', the Moon the 7th and the Sun the 2nd, ' +
       'which is Kusuma yoga.', ['Jupiter', 'Moon', 'Sun'], [1, 2, 7]);
  }

  /*
   * Combination 31. "If the Ascendant lord is exalted and the fourth and tenth
   * lords have interchanged houses, Chapa Yoga is caused."
   *
   * Raman's own finding on it, from observation rather than text, is the
   * interesting part: "My observations extending over nearly twenty years lead
   * me to conclude that Chapa Yoga makes one control the wealth of others
   * rather than make him rich."
   */
  function chapa(chart) {
    var c = lordship(chart);
    var lagnaLord = c.lordOf(1), fourth = c.lordOf(4), tenth = c.lordOf(10);
    if (!c.exalted(lagnaLord)) return [];
    if (fourth === tenth || !c.at[fourth] || !c.at[tenth]) return [];
    var fourthSign = (c.lagna + 3) % 12, tenthSign = (c.lagna + 9) % 12;
    if (c.at[fourth].sign !== tenthSign || c.at[tenth].sign !== fourthSign) return [];

    return finding('Chapa Yoga', 'Chapa yoga', [
      lagnaLord + ', ' + firstLord(chart, 'lord of the ascendant') + ', is exalted in ' +
        Astro.SIGNS[c.at[lagnaLord].sign],
      fourth + ' and ' + tenth + ', the lords of the 4th and 10th, have ' +
        'exchanged signs',
      'Raman reports twenty years of observation against the literal reading: ' +
        '"Chapa Yoga makes one control the wealth of others rather than make ' +
        'him rich" - he found it in the charts of bank officers'
    ], lagnaLord + ', ' + firstLord(chart, 'lord of the ascendant') + ', is exalted in ' +
       Astro.SIGNS[c.at[lagnaLord].sign] + ', and ' + named(fourth) + ' and ' +
       named(tenth) + ' have exchanged the 4th and the 10th. That is Chapa yoga.',
       [lagnaLord, fourth, tenth], [1, 4, 10]);
  }

  /*
   * Combination 32. "If the exalted lord of the seventh occupies the tenth and
   * the lord of the 10th is in the 9th, Sreenatha Yoga is caused."
   *
   * Raman rates it: "Sreenatha Yoga may be said to be one of the important Raja
   * Yogas inasmuch as a point of contact is established between the 7th, the
   * 9th and the 10th."
   *
   * As stated there it cannot happen. The first clause asks the 7th lord to be
   * exalted while standing in the 10th, so the 10th sign has to be that lord's
   * exaltation sign, and across twelve ascendants that is true of exactly one -
   * Sagittarius, whose 7th is Gemini and whose 10th is Virgo, both Mercury's.
   * The second clause then asks the lord of the 10th to be in the 9th, and that
   * is the same graha, which cannot hold two houses at once.
   *
   * Raman gives a workable version in his other book. Hindu Predictive
   * Astrology: "When the exalted lord of the 7th occupies the 10th and the lord
   * of the 10th COMBINES WITH the lord of the 9th." Not in the 9th - with its
   * lord. On the one ascendant that reaches the first clause, the 9th is Leo
   * and its lord the Sun, so the rule asks Mercury exalted in Virgo with the
   * Sun beside him, and Mercury is never far from the Sun. It is satisfiable.
   *
   * That reading is the one implemented, because a rule that can be met is a
   * better reading of an author than one that cannot, and both are his.
   *
   * Phaladeepika has a Srinatha too and it is a different combination
   * altogether - ch.6 sloka 28, "If Venus, the lord of the 9th and Mercury be
   * similarly placed", meaning each in a kendra or trikona and each in
   * exaltation, own or friendly sign. But its results are Raman's almost word
   * for word, down to the marks of Vishnu on the body, which suggests the
   * definition in Three Hundred Important Combinations drifted from a source
   * whose results it kept. Not implemented here; it belongs with Srikantha and
   * Virinchi, the two combinations that share its verse.
   */
  function sreenatha(chart) {
    var c = lordship(chart);
    var seventh = c.lordOf(7), tenth = c.lordOf(10);
    /*
     * One graha ruling both the 7th and the 10th is not a disqualification
     * here - it is the only case that can reach the first clause at all, since
     * Sagittarius is the one ascendant whose 7th lord exalts in its 10th and
     * there Mercury rules both. Guarding against it, as the earlier reading
     * had to, made this unsatisfiable twice over.
     */
    if (c.houseOf(seventh) !== 10 || !c.exalted(seventh)) return [];
    var ninth = c.lordOf(9);
    if (tenth === ninth || !c.together(tenth, ninth)) return [];

    return finding('Sreenatha Yoga', 'Sreenatha yoga', [
      seventh + ', lord of the 7th, stands exalted in the 10th',
      tenth + ', lord of the 10th, stands with ' + ninth + ', lord of the 9th, ' +
        'in ' + Astro.SIGNS[c.at[tenth].sign],
      'Raman counts it among the important raja yogas, "inasmuch as a point ' +
        'of contact is established between the 7th, the 9th and the 10th"',
      'read on his Hindu Predictive Astrology wording - the 10th lord joined ' +
        'to the 9th lord. Three Hundred Important Combinations asks instead ' +
        'for the 10th lord to be in the 9th, which no chart can satisfy: the ' +
        'only ascendant whose 7th lord can exalt in the 10th is Sagittarius, ' +
        'and there one graha rules both houses'
    ], seventh + ', lord of the 7th, stands exalted in the 10th beside ' +
       named(ninth) + ', lord of the 9th. That is Sreenatha yoga.', [seventh, tenth, ninth], [7, 9, 10]);
  }

  /*
   * Combination 45. "The lords of the 5th and 6th should be in mutual kendras
   * and the lord of Lagna must be powerful."
   */
  function sankha(chart, strengths) {
    var c = lordship(chart);
    var fifth = c.lordOf(5), sixth = c.lordOf(6), lagnaLord = c.lordOf(1);
    if (fifth === sixth) return [];
    if (!c.mutualKendra(fifth, sixth)) return [];
    if (!isStrong(strengths, lagnaLord)) return [];

    return finding('Sankha Yoga', 'Sankha yoga', [
      fifth + ' rules the 5th and ' + sixth + ' the 6th, and they stand in ' +
        'angles from each other',
      lagnaLord + ', ' + firstLord(chart, 'lord of the ascendant') + ', is strong',
      'an odd pairing to read as fortunate, the 6th being a house of harm; ' +
        'what the rule joins is the house of merit to the house of effort'
    ], fifth + ' and ' + sixth + ', lords of the 5th and 6th, stand in angles ' +
       'from each other, with ' + named(lagnaLord) + ' strong. That is Sankha yoga.',
       [fifth, sixth, lagnaLord], [5, 6]);
  }

  /*
   * Combination 46. "If Venus, lord of Lagna and Jupiter are in mutual Kendras
   * and the lord of the 9th is powerfully disposed, Bheri Yoga is caused."
   */
  function bheri(chart, strengths) {
    var c = lordship(chart);
    var lagnaLord = c.lordOf(1), ninth = c.lordOf(9);
    var three = ['Venus', lagnaLord, 'Jupiter'].filter(function (g, i, all) {
      return all.indexOf(g) === i;
    });
    var mutual = true;
    for (var i = 0; i < three.length && mutual; i++) {
      for (var j = i + 1; j < three.length; j++) {
        if (!c.mutualKendra(three[i], three[j])) { mutual = false; break; }
      }
    }
    if (!mutual) return [];
    if (!isStrong(strengths, ninth)) return [];

    return finding('Bheri Yoga', 'Bheri yoga', [
      listOf(three) + ' stand in angles from one another' +
        (three.length < 3 ? ', ' + firstLord(chart, 'the ascendant lord') + ' being one of the other two' : ''),
      ninth + ', lord of the 9th, is strong, which the rule asks for',
      'read for long life free of illness and for income from several sources'
    ], listOf(three) + ' stand in angles from one another, with ' + named(ninth) +
       ', lord of the 9th, strong. That is Bheri yoga.',
       three.concat([ninth]), [1, 9]);
  }

  /*
   * Combination 47. "Malefics should be disposed in Lagna and the 9th; the
   * fifth house should contain both malefics and benefics; and the fourth and
   * 8th should be occupied by malefics."
   *
   * Four clauses, every one of them about malefics, and the results are
   * favourable: "a clever prophet, an ocean of kindness, intelligent". One of
   * the few places the book reads a chart full of malefics as a blessing.
   */
  function matsya(chart) {
    var c = lordship(chart);
    var benefics = Astro.naturalBenefics(chart);
    var inHouse = function (h) {
      return GRAHAS.concat(['Rahu', 'Ketu']).filter(function (g) {
        return c.houseOf(g) === h;
      });
    };
    var malefic = function (list) {
      return list.filter(function (g) { return !benefics[g]; });
    };
    var first = malefic(inHouse(1)), ninth = malefic(inHouse(9));
    if (!first.length || !ninth.length) return [];
    var fifth = inHouse(5);
    var fifthGood = fifth.filter(function (g) { return benefics[g]; });
    var fifthBad = malefic(fifth);
    if (!fifthGood.length || !fifthBad.length) return [];
    var fourth = malefic(inHouse(4)), eighth = malefic(inHouse(8));
    if (!fourth.length || !eighth.length) return [];

    return finding('Matsya Yoga', 'Matsya yoga', [
      listOf(first) + ' in ' + firstHouse(chart, 'the ascendant') + ' and ' + listOf(ninth) + ' in the 9th, ' +
        'both malefic',
      listOf(fifthGood) + ' and ' + listOf(fifthBad) + ' together in the 5th, ' +
        'which the rule asks to hold both kinds',
      listOf(fourth) + ' in the 4th and ' + listOf(eighth) + ' in the 8th',
      'four clauses, every one about malefics, and the reading is favourable ' +
        'throughout - "a clever prophet, an ocean of kindness". It is one of ' +
        'the few places the book reads a chart full of malefics as a blessing'
    ], listOf(first) + ' holds ' + firstHouse(chart, 'the ascendant') + ', ' + listOf(fourth) + ' the 4th, ' +
       listOf(eighth) + ' the 8th and ' + listOf(ninth) + ' the 9th, all malefic, ' +
       'with ' + listOf(fifthGood) + ' and ' + listOf(fifthBad) + ' sharing the ' +
       '5th. That is Matsya yoga.',
       first.concat(ninth, fifth, fourth, eighth), [1, 4, 5, 8, 9]);
  }

  /*
   * Combination 48. "The lord of the Navamsa occupied by an exalted planet
   * should be posited in a trine or quadrant identical with friendly or exalted
   * sign, and the lord of Lagna should be strongly disposed."
   *
   * Raman says the wording is unclear and then reads it out: "The definition of
   * the Yoga is somewhat confusing. Some planet is exalted and he occupies some
   * Navamsa. The lord of the said ..." - the scan breaks there, but the reading
   * he begins is the one taken here.
   */
  function mridanga(chart, strengths) {
    var c = lordship(chart);
    var lagnaLord = c.lordOf(1);
    if (!isStrong(strengths, lagnaLord)) return [];

    var made = null;
    GRAHAS.forEach(function (g) {
      if (made || !c.exalted(g)) return;
      var amsaLord = c.navamsaLord(g);
      if (!amsaLord || !c.at[amsaLord]) return;
      var house = c.houseOf(amsaLord);
      if (KENDRAS.indexOf(house) < 0 && TRIKONAS.indexOf(house) < 0) return;
      var dignity = c.dignity(amsaLord);
      var seatLord = Astro.SIGN_LORDS[c.at[amsaLord].sign];
      var relation = seatLord === amsaLord ? 'own'
        : Astro.compoundRelation(amsaLord, seatLord,
            ((c.at[amsaLord].sign - c.at[seatLord].sign) % 12 + 12) % 12 + 1);
      var welcome = dignity === 'Exalted' || relation === 'own' ||
        relation === 'mitra' || relation === 'adhimitra';
      if (!welcome) return;
      made = { exalted: g, amsaLord: amsaLord, house: house, relation: relation,
               dignity: dignity };
    });
    if (!made) return [];

    return finding('Mridanga Yoga', 'Mridanga yoga', [
      made.exalted + ' is exalted, and ' + made.amsaLord + ' rules the navamsa ' +
        made.exalted + ' occupies',
      made.amsaLord + ' stands in the ' + ordinal(made.house) + ', ' +
        (KENDRAS.indexOf(made.house) >= 0 ? 'an angle' : 'a trine') + ', in ' +
        (made.dignity === 'Exalted' ? 'exaltation'
          : made.relation === 'own' ? 'his own sign' : 'a friendly sign'),
      lagnaLord + ', ' + firstLord(chart, 'lord of the ascendant') + ', is strong',
      'Raman calls the wording "somewhat confusing" and begins reading it out ' +
        'before the page breaks; the reading he starts is the one taken here'
    ], made.amsaLord + ' rules the navamsa ' +
       (made.amsaLord === made.exalted ? 'he occupies himself, being the exalted graha'
         : 'the exalted ' + named(made.exalted) + ' occupies') +
       ', holds the ' + ordinal(made.house) + ' in ' +
       (made.dignity === 'Exalted' ? 'exaltation'
         : made.relation === 'own' ? 'his own sign' : 'a friendly sign') +
       (made.amsaLord === lagnaLord ? ', and rules ' + firstHouse(chart, 'the ascendant') + ' strongly'
         : ', with ' + named(lagnaLord) + ' strong') +
       '. That is Mridanga yoga.',
       [made.exalted, made.amsaLord, lagnaLord], [made.house],
       /* The navamsa lord is the graha the rule places and judges. */
       made.amsaLord);
  }

  var DETECTORS = [parivartana, neechaBhanga, vipareeta, lakshmi, mahapurusha, rajaYoga,
    moonCompany, sunCompany, moonFromSun, mahabhagya,
    chatussagara, rajalakshana, malika, parvata, vasumathi,
    vanchanachorabheethi, kahala, pushkala, gauri, bharathi, kusuma,
    chapa, sreenatha, sankha, bheri, matsya, mridanga,
    chandraMangala, adhiYoga, sakata, amala, budhaAditya,
                   gajaKesari, kartari, saraswati, mahaRaja, nabhasa,
                   dhana, daridra];

  /**
   * Every yoga this module knows how to look for, in one pass.
   *
   * `strengths` is the Shadbala reading, keyed by graha. Only Lakshmi yoga needs
   * it, and it is passed to every detector rather than special-cased so the next
   * one that needs strength does not have to change this signature again.
   */
  /*
   * `strengths` is the Shadbala reading keyed by graha. Callers had been
   * handing this two different things - the whole compute() result at two of
   * three sites in the page and in the frequency sweep, the grahas map at the
   * third - and only Lakshmi yoga reads it, so only Lakshmi noticed. It asks
   * for strengths[lagnaLord], got undefined from the wrapper object, and
   * returned nothing: the yoga showed on the Yogas tab, never on the graha
   * card, and was missing from the measured frequencies altogether.
   *
   * Normalised here rather than at each call site, so that a caller cannot get
   * it wrong again and a detector that starts reading strengths tomorrow does
   * not rediscover this.
   */
  /*
   * Detectors that read the ascendant as one of the bodies rather than as house
   * 1. Rotating re-counts the houses; it cannot re-seat the ascendant itself, so
   * these have no answer to give for a rotated chart and are not asked.
   * Mahabhagya is the only one: its test is the parity of the lagna's own sign,
   * beside the Sun's and the Moon's.
   */
  /*
   * Everything this module looks for, grouped as a reader would go looking.
   *
   * The Yogas tab used to answer only the question "what did this chart give",
   * with what it checks for buried in a thirty-name sentence under the
   * findings. That reads as coverage when it is really a list, and five yogas
   * were asked for in a row that had been implemented all along - Amala, Shubha
   * Vesi, Pushkala, Bhadra - because there was no way to see the difference
   * between a yoga absent from a chart and a yoga absent from the engine.
   *
   * The names here are the titles the detectors actually produce, so the page
   * can mark the ones a chart holds by matching on them. A sweep in the test
   * suite asserts nothing can be produced that is missing from this list; the
   * reverse is not asserted, since a few are rare enough that a sweep will not
   * turn them up and their absence from a sample is not evidence they cannot
   * form.
   */
  var CATALOGUE = [
    /*
     * Plain neecha bhanga is not among these. A cancelled debilitation is a
     * raja yoga only where the graha itself holds a kendra or a trikona;
     * otherwise the debility is merely lifted, which is the distinction the
     * detector draws in its two titles and the library in its two passages.
     * Filed under the raja yogas it was claiming in the catalogue what the
     * rest of the page is careful to deny.
     */
    { group: 'Raja yogas', names: ['Angle-trine raja yoga',
      'Dharma Karmadhipati yoga', 'Maha Raja yoga', 'Neecha bhanga raja yoga'] },
    { group: 'Vipareeta raja yogas', names: ['Harsha yoga', 'Sarala yoga',
      'Vimala yoga'] },
    { group: 'Pancha Mahapurusha', names: ['Ruchaka yoga', 'Bhadra yoga',
      'Hamsa yoga', 'Malavya yoga', 'Sasa yoga'] },
    { group: 'Exchanges', names: ['Maha parivartana yoga',
      'Khala parivartana yoga', 'Dainya parivartana yoga'] },
    { group: 'The Moon’s company', names: ['Sunapha yoga', 'Anapha yoga',
      'Durudhura yoga', 'Kemadruma yoga'] },
    { group: 'The Sun’s company', names: ['Shubha Vesi yoga', 'Papa Vesi yoga',
      'Vesi yoga', 'Shubha Vasi yoga', 'Papa Vasi yoga', 'Vasi yoga',
      'Shubha Ubhayachari yoga', 'Papa Ubhayachari yoga', 'Ubhayachari yoga'] },
    { group: 'The Moon from the Sun', names: ['Adhama yoga', 'Sama yoga',
      'Varishtha yoga'] },
    { group: 'Hemmed in', names: ['Shubha kartari yoga', 'Papa kartari yoga'] },
    { group: 'Malika', names: ['Lagna Malika yoga', 'Dhana Malika yoga',
      'Vikrama Malika yoga', 'Sukha Malika yoga', 'Putra Malika yoga',
      'Satru Malika yoga', 'Kalatra Malika yoga', 'Randhra Malika yoga',
      'Bhagya Malika yoga', 'Karma Malika yoga', 'Labha Malika yoga',
      'Vraya Malika yoga'] },
    { group: 'Raman’s combinations', names: ['Kahala yoga', 'Pushkala yoga',
      'Gauri yoga (strict)', 'Gauri yoga (medium)', 'Gauri yoga (weak)',
      'Bharathi yoga', 'Kusuma yoga', 'Chapa yoga',
      'Sreenatha yoga', 'Sankha yoga', 'Bheri yoga', 'Matsya yoga',
      'Mridanga yoga', 'Vanchanachorabheethi yoga'] },
    { group: 'Debilitation lifted', names: ['Neecha bhanga'] },
    { group: 'Wealth and want', names: ['Dhana yoga', 'Daridra yoga'] },
    { group: 'Nabhasa', names: ['Rajju yoga', 'Musala yoga', 'Nala yoga',
      'Mala yoga', 'Sarpa yoga', 'Gada yoga', 'Sakata yoga (Nabhasa)',
      'Vihaga yoga', 'Sringataka yoga', 'Hala yoga', 'Vajra yoga', 'Yava yoga',
      'Kamala yoga', 'Vapi yoga', 'Yupa yoga', 'Sara yoga', 'Sakthi yoga',
      'Danda yoga', 'Nauka yoga', 'Koota yoga', 'Chatra yoga',
      'Chapa yoga (Nabhasa)', 'Ardhachandra yoga', 'Chakra yoga',
      'Samudra yoga', 'Gola yoga', 'Yuga yoga', 'Sula yoga', 'Kedara yoga',
      'Pasa yoga', 'Dama yoga', 'Vallaki yoga'] },
    { group: 'Others', names: ['Adhi yoga', 'Amala yoga', 'Budha-Aditya yoga',
      'Chandra Mangala yoga', 'Chatussagara yoga', 'Gaja Kesari yoga',
      'Kesari yoga', 'Lakshmi yoga', 'Mahabhagya yoga', 'Parvata yoga',
      'Rajalakshana yoga', 'Sakata yoga', 'Saraswati yoga', 'Vasumathi yoga'] }
  ];

  var ASCENDANT_ONLY = [mahabhagya];

  function detect(chart, strengths) {
    var byGraha = strengths && strengths.grahas ? strengths.grahas : strengths;
    var turned = rotated(chart);
    var all = [];
    DETECTORS.forEach(function (detector) {
      if (turned && ASCENDANT_ONLY.indexOf(detector) >= 0) return;
      detector(chart, byGraha).forEach(function (finding) {
        /*
         * `reasons` is the matched-condition evidence; it is deliberately not
         * presentation copy. Every detector already closes with one coherent,
         * chart-specific summary, so give that sentence an explicit field and
         * keep the two responsibilities from being joined again in the UI.
         */
        finding.manifestation = finding.manifestation || finding.summary || '';
        all.push(finding);
      });
    });
    return all;
  }

  return { detect: detect, firstHouse: firstHouse, firstLord: firstLord,
    parivartana: parivartana, neechaBhanga: neechaBhanga,
    kartari: kartari,
    moonCompany: moonCompany, chandraMangala: chandraMangala, adhiYoga: adhiYoga,
    sakata: sakata, amala: amala, budhaAditya: budhaAditya,
    BUDHA_ADITYA_FLOOR: BUDHA_ADITYA_FLOOR, BUDHA_FLOOR: BUDHA_FLOOR,
    SUN_COMPANY: SUN_COMPANY,
    MALIKA_NAMES: MALIKA_NAMES, MOON_FROM_SUN: MOON_FROM_SUN,
    sunCompany: sunCompany, moonFromSun: moonFromSun, mahabhagya: mahabhagya,
    chatussagara: chatussagara, rajalakshana: rajalakshana, malika: malika,
    parvata: parvata, vasumathi: vasumathi, UPACHAYAS: UPACHAYAS,
    vanchanachorabheethi: vanchanachorabheethi, kahala: kahala,
    pushkala: pushkala, gauri: gauri, bharathi: bharathi, kusuma: kusuma,
    chapa: chapa, sreenatha: sreenatha, sankha: sankha, bheri: bheri,
    matsya: matsya, mridanga: mridanga,
    MOON_COMPANY: MOON_COMPANY,
    vipareeta: vipareeta, lakshmi: lakshmi, mahapurusha: mahapurusha,
    rajaYoga: rajaYoga, gajaKesari: gajaKesari,
    saraswati: saraswati, mahaRaja: mahaRaja, nabhasa: nabhasa,
    dhana: dhana, daridra: daridra, marakasOf: marakasOf,
    NABHASA_SAYS: NABHASA_SAYS,
    SARASWATI_HOUSES: SARASWATI_HOUSES, SARASWATI_GRAHAS: SARASWATI_GRAHAS,
    VISHNU_HOUSES: VISHNU_HOUSES, LAKSHMI_HOUSES: LAKSHMI_HOUSES,
    VIPAREETA_NAMES: VIPAREETA_NAMES, MAHAPURUSHA: MAHAPURUSHA,
    KENDRAS: KENDRAS, CATALOGUE: CATALOGUE,
    // Exposed so a test can notice a detector being added without being wired
    // into the test that checks detect() gathers from all of them.
    DETECTOR_COUNT: DETECTORS.length,
    aspectTable: aspectTable, aspects: aspects, ordinal: ordinal,
    raoRetrogradeAspects: raoRetrogradeAspects, RAO_MAX_DEGREE: RAO_MAX_DEGREE,
    FULL_ASPECTS: Astro.FULL_ASPECTS, GRAHAS: GRAHAS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Yogas;
