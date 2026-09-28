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
      if (KENDRA_HOUSES.indexOf(houseFrom(sign, lagna)) >= 0) return 'the lagna';
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
      lagnaLord + ', the lagna lord, carries ' + lord.rupas.toFixed(2) + ' rupas against the ' +
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
      grahas: [ninthLord, lagnaLord],
      houses: [9, placed.house],
      reasons: reasons,
      summary: ninthLord + ', lord of the 9th, is in the ' + house + ' in its ' +
        SEAT_PHRASE[dignity] + ', and the lagna lord ' + lagnaLord + ' is strong by Shadbala.'
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
    var lagna = Astro.signOf(chart.ascendant.longitude);
    var found = [];

    chart.planets.forEach(function (p) {
      var name = MAHAPURUSHA[p.name];
      if (!name) return;
      if (KENDRAS.indexOf(p.house) < 0) return;
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
        grahas: [p.name],
        houses: [p.house],
        reasons: [
          p.name + ' stands in ' + Astro.SIGNS[p.sign] + ', ' + seat + ', and in the ' +
            ordinal(p.house) + ' - a kendra from the lagna, which is what the rule asks',
          'the yoga takes its name from the graha: ' + p.name + ' gives ' + name +
            ', ' + MAHAPURUSHA_ABOUT[name]
        ],
        summary: p.name + ' is in ' + seat + ' in the ' + ordinal(p.house) +
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
        var reasons = [
          angleLord + ' rules the ' + houseList(angles) + ', an angle, and ' +
            trineLord + ' the ' + houseList(trines) + ', a trine',
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
          grahas: [angleLord, trineLord],
          houses: angles.concat(trines),
          reasons: reasons,
          summary: angleLord + ', lord of the ' + houseList(angles) + ', and ' + trineLord +
            ', lord of the ' + houseList(trines) + ', are related: ' + relation + '.'
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

    var seat = fromLagna && fromMoon ? 'an angle from both the lagna and the Moon'
      : fromLagna ? 'an angle from the lagna' : 'an angle from the Moon';
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
    var inSign = function (sign) {
      return chart.planets.filter(function (p) { return p.sign === sign; });
    };
    var isBenefic = function (p) {
      return Astro.NODES.indexOf(p.name) < 0 && benefics[p.name] === true;
    };
    var reaching = function (sign, wanted) {
      return chart.planets.filter(function (p) {
        return isBenefic(p) === wanted && p.sign !== sign &&
          aspects(p.name, p.sign, sign);
      }).map(function (p) { return p.name; });
    };

    var here = inSign(second), there = inSign(twelfth);
    if (!here.length || !there.length) return [];
    var all = here.concat(there);
    var shubha = all.every(isBenefic);
    var papa = all.every(function (p) { return !isBenefic(p); });
    if (!shubha && !papa) return [];        // one of each is no scissors at all

    var against = reaching(second, !shubha).concat(reaching(twelfth, !shubha));
    var reasons = [(shubha ? 'benefics' : 'malefics') + ' stand in both the 12th and the ' +
      '2nd, so the lagna is flanked on both sides at once'];
    if (against.length) {
      reasons.push(listOf(against) + ' ' + (against.length > 1 ? 'aspect' : 'aspects') +
        ' one of the two signs, which the classical wording counts against the yoga - ' +
        'de Fouw and Svoboda ask for benefics unafflicted and malefics unaspected, and ' +
        'read the yoga in a chart of their own where that does not hold');
    } else {
      reasons.push('nothing of the opposite kind reaches either sign, which is the ' +
        'unqualified form');
    }

    return [{
      yoga: 'Kartari',
      kind: shubha ? 'shubha' : 'papa',
      subject: 'Kartari Yoga',
      condition: shubha ? 'shubha' : 'papa',
      title: (shubha ? 'Shubha' : 'Papa') + ' kartari yoga',
      family: 'Kartari yoga',
      grahas: all.map(function (p) { return p.name; }),
      houses: [12, 2],
      reasons: reasons,
      summary: listOf(here.map(function (p) { return p.name; })) + ' in the 2nd and ' +
        listOf(there.map(function (p) { return p.name; })) + ' in the 12th ' +
        (shubha ? 'flank the lagna, which is shubha kartari yoga.'
                : 'close the lagna in, which is papa kartari yoga.')
    }];
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
        ' stands in an angle from the lagna or the Moon');
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
    [['the lagna', (lagna + 9) % 12], ['the Moon', (moon.sign + 9) % 12]]
      .forEach(function (from) {
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
      grahas: all,
      houses: [10],
      reasons: [
        seats.map(function (seat) {
          return listOf(seat.grahas) + ' in ' + Astro.SIGNS[seat.sign] +
            ', the 10th from ' + seat.from;
        }).join(', and '),
        'the rule takes the 10th from either, so one of the two is enough'
      ],
      summary: 'A benefic holds the 10th from ' +
        listOf(seats.map(function (seat) { return seat.from; })) +
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
      grahas: ['Sun', 'Mercury'],
      houses: [],
      reasons: reasons,
      summary: 'Mercury is with the Sun in ' + Astro.SIGNS[sun.sign] + ' and ' +
        apart.toFixed(1) + '° off it, which is Budha-Aditya yoga.'
    }];
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

    return [{
      yoga: name + ' Yoga',
      kind: kind,
      subject: name + ' Yoga',
      condition: 'general',
      title: name + ' yoga',
      family: 'The Sun’s company',
      grahas: ['Sun'].concat(all),
      houses: [],
      reasons: reasons,
      summary: where.charAt(0).toUpperCase() + where.slice(1) + ', which is ' +
        name + ' yoga.'
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
   * Combination 25, and the one place where Raman and his own source part.
   *
   * Raman: "In the case of a man, the Sun, the Moon and the Lagna should be in
   * odd signs. In case of women, when the birth is during night, the Sun, the
   * Moon and Lagna must be in even signs." Night for women, nothing for men -
   * and both scans of the 1947 edition read the same, so it is not the OCR.
   *
   * Phaladeepika ch.6 shloka 14, which is where the combination comes from, is
   * symmetric: "If, at a day-birth in the case of a male, the Sun, the Moon and
   * the Lagna are in odd signs, the Mahabhagya Yoga is formed. The same Yoga in
   * the case of females will arise when the birth is at night and the Sun, the
   * Moon and the Lagna are posited in even signs."
   *
   * Raman means it. His own worked chart for the combination - No. 25, a male
   * born at 8-15 p.m., which is night - reads "the Lagna is Aries, the Sun is
   * in Leo and the Moon is in Libra - all odd signs, consequently Mahabhagya
   * Yoga is fully present." Under Phaladeepika's rule that birth fails the day
   * test and there is no yoga.
   *
   * So it is a setting, defaulting to Phaladeepika: he states the fuller rule,
   * the two halves are symmetric in a way Raman's are not, and the day test
   * halves how often the male form is claimed, from 12.5 per cent of charts to
   * 6.2.
   */
  var MAHABHAGYA_DAY = { PHALADEEPIKA: 'phaladeepika', RAMAN: 'raman' };

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
    var ramanReading = chart.mahabhagyaDay === MAHABHAGYA_DAY.RAMAN;

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
      if (!ramanReading && day === false) {
        return [];                                 // Phaladeepika wants a day birth
      }
      if (male) {
        reasons.push(ramanReading
          ? 'the odd signs are the reading for a man, and on Raman’s ' +
            'wording that is the whole of it'
          : 'the odd signs are the reading for a man, born by day, which this ' +
            'birth was');
      } else {
        reasons.push('the odd signs are the reading for a man; this chart ' +
          'records no sex, so the finding holds only if the native is one' +
          (ramanReading ? '' : ', and the birth is by day as the rule asks'));
      }
      if (!ramanReading && day === undefined) {
        reasons.push('whether the birth was by day could not be determined ' +
          'here, and Phaladeepika asks for it');
      }
    } else {
      if (known && !female) return [];
      if (day === true) return [];                 // both authorities want night
      if (female) {
        reasons.push('the even signs are the reading for a woman born at ' +
          'night, which both Raman and Phaladeepika ask for');
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
      grahas: ['Sun', 'Moon'],
      houses: [1],
      reasons: reasons,
      summary: 'The tripod of life - ascendant, Sun and Moon - falls entirely ' +
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
      summary: 'Every angle is occupied, which is Chatussagara yoga.'
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
      summary: 'Benefics hold the angles and nothing malefic sits in the 6th ' +
        'or 8th, which is Parvata yoga.'
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
    if (fromLagna.length) seats.push(listOf(fromLagna) + ' in the upachayas from the ascendant');
    if (fromMoon.length) seats.push(listOf(fromMoon) + ' in the upachayas from the Moon');
    var most = Math.max(fromLagna.length, fromMoon.length);

    return [{
      yoga: 'Vasumathi Yoga',
      kind: fromLagna.length ? 'lagna' : 'moon',
      subject: 'Vasumathi Yoga',
      condition: 'general',
      title: 'Vasumathi yoga',
      family: null,
      grahas: fromLagna.concat(fromMoon.filter(function (g) {
        return fromLagna.indexOf(g) < 0;
      })),
      houses: UPACHAYAS.slice(),
      reasons: [
        seats.join(', and '),
        fromLagna.length
          ? 'Raman holds the form from the ascendant the stronger of the two'
          : 'only the Moon gives it here, which Raman reads as the weaker form',
        'Raman reads the count and not just the fact - "two benefics will give ' +
          'less wealth while only one benefic will give ordinary wealth", so ' +
          'more is more - and ' + most + ' stand' + (most === 1 ? 's' : '') +
          ' here',
        'the Moon is not counted among the benefics occupying them, being the ' +
          'reference point for half the rule'
      ],
      summary: 'Benefics occupy the upachayas, which is Vasumathi yoga.'
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

  function finding(subject, title, reasons, summary, grahas, houses) {
    return [{
      yoga: subject, kind: 'general', subject: subject, condition: 'general',
      title: title, family: null, grahas: grahas || [], houses: houses || [],
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
      lord + ', lord of the ascendant, stands with ' + listOf(with_) + ' in ' +
        Astro.SIGNS[c.at[lord].sign],
      'read for a turn of mind rather than an event: a person who expects to ' +
        'be cheated or robbed, and is watchful about it',
      'this is the third of Raman’s three clauses. The other two need Gulika, ' +
        'which is not computed here because no text available to this site ' +
        'states which of the competing rules for finding it to use - so a ' +
        'chart may hold this yoga by one of those and be reported without it'
    ], lord + ', the ascendant lord, is joined by ' + listOf(with_) +
       ', which is Vanchanachorabheethi yoga.', [lord].concat(with_), [1]);
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
      lagnaLord + ', lord of the ascendant, is strong, which the rule asks ' +
        'for and which is what keeps this from being common',
      'Raman warns against reading the old results literally: "No yogas ' +
        'should be interpreted verbatim if the results are to hold good to ' +
        'modern life and conditions"'
    ], 'The lords of the 4th and 9th stand in angles from each other with a ' +
       'strong ascendant lord, which is Kahala yoga.',
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
          ? 'is himself the lord of the ascendant'
          : 'stands with ' + lagnaLord + ', the ascendant lord'),
      inKendra
        ? dispositor + ' holds the ' + ordinal(house) + ', an angle'
        : dispositor + ' sits in the sign of ' + seatLord + ', an intimate ' +
          'friend, and aspects the ascendant',
      listOf(tenants) + ' occupies the ascendant and is strong, which is the ' +
        'last of the three things the rule asks at once',
      'Raman calls the combination "somewhat complicated" himself'
    ], 'The Moon’s dispositor keeps company with the ascendant lord and is ' +
       'well placed, with a strong graha in the ascendant, which is Pushkala ' +
       'yoga.', [dispositor, lagnaLord].concat(tenants), [1]);
  }

  /*
   * Combination 28. "The lord of the Navamsa occupied by the lord of the 10th
   * should join the 10th in exaltation and combined with the lord of Lagna."
   *
   * Raman notes a second definition in circulation - "Here again two
   * definitions are to be found" - but the scan breaks before giving it, so
   * only the one above is implemented.
   */
  function gauri(chart) {
    var c = lordship(chart);
    var tenth = c.lordOf(10), lagnaLord = c.lordOf(1);
    var amsaLord = c.navamsaLord(tenth);
    if (!amsaLord || !c.at[amsaLord]) return [];
    if (c.houseOf(amsaLord) !== 10) return [];
    if (!c.exalted(amsaLord)) return [];
    if (amsaLord !== lagnaLord && !c.together(amsaLord, lagnaLord)) return [];

    return finding('Gauri Yoga', 'Gauri yoga', [
      amsaLord + ' rules the navamsa that ' + tenth + ', lord of the 10th, ' +
        'occupies',
      amsaLord + ' stands in the 10th himself and exalted there',
      amsaLord === lagnaLord
        ? amsaLord + ' is also the lord of the ascendant, which satisfies the ' +
          'last clause in one graha'
        : 'and with ' + lagnaLord + ', the lord of the ascendant',
      'Raman records a second definition in circulation without giving it in ' +
        'the text available here, so only this one is tested'
    ], 'The navamsa lord of the 10th lord is exalted in the 10th with the ' +
       'ascendant lord, which is Gauri yoga.', [amsaLord, tenth, lagnaLord], [10]);
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
    ], 'An exalted navamsa lord of the 2nd, 5th or 11th lord stands with the ' +
       '9th lord, which is Bharathi yoga.',
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
      'Jupiter in the ascendant, the Moon in the 7th and the Sun in the 2nd, ' +
        'which is the whole of the rule',
      'three fixed placements and nothing else asked, which makes it one of ' +
        'the plainest combinations in the book and one of the rarest',
      'Raman records a different version from Satayoga Manjari and does not ' +
        'adopt it; his own is what is tested here'
    ], 'Jupiter holds the ascendant, the Moon the 7th and the Sun the 2nd, ' +
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
      lagnaLord + ', lord of the ascendant, is exalted in ' +
        Astro.SIGNS[c.at[lagnaLord].sign],
      fourth + ' and ' + tenth + ', the lords of the 4th and 10th, have ' +
        'exchanged signs',
      'Raman reports twenty years of observation against the literal reading: ' +
        '"Chapa Yoga makes one control the wealth of others rather than make ' +
        'him rich" - he found it in the charts of bank officers'
    ], 'The ascendant lord is exalted and the 4th and 10th lords have ' +
       'exchanged signs, which is Chapa yoga.',
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
    ], 'The exalted 7th lord holds the 10th and the 10th lord stands with the ' +
       '9th lord, which is Sreenatha yoga.', [seventh, tenth, ninth], [7, 9, 10]);
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
      lagnaLord + ', lord of the ascendant, is strong',
      'an odd pairing to read as fortunate, the 6th being a house of harm; ' +
        'what the rule joins is the house of merit to the house of effort'
    ], 'The lords of the 5th and 6th stand in angles from each other with a ' +
       'strong ascendant lord, which is Sankha yoga.',
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
        (three.length < 3 ? ', the ascendant lord being one of the other two' : ''),
      ninth + ', lord of the 9th, is strong, which the rule asks for',
      'read for long life free of illness and for income from several sources'
    ], 'Venus, the ascendant lord and Jupiter stand in angles from one another ' +
       'with a strong 9th lord, which is Bheri yoga.',
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
      listOf(first) + ' in the ascendant and ' + listOf(ninth) + ' in the 9th, ' +
        'both malefic',
      listOf(fifthGood) + ' and ' + listOf(fifthBad) + ' together in the 5th, ' +
        'which the rule asks to hold both kinds',
      listOf(fourth) + ' in the 4th and ' + listOf(eighth) + ' in the 8th',
      'four clauses, every one about malefics, and the reading is favourable ' +
        'throughout - "a clever prophet, an ocean of kindness". It is one of ' +
        'the few places the book reads a chart full of malefics as a blessing'
    ], 'Malefics hold the ascendant, the 4th, the 8th and the 9th with the 5th ' +
       'mixed, which is Matsya yoga.',
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
      lagnaLord + ', lord of the ascendant, is strong',
      'Raman calls the wording "somewhat confusing" and begins reading it out ' +
        'before the page breaks; the reading he starts is the one taken here'
    ], 'The navamsa lord of an exalted graha stands well placed in an angle or ' +
       'trine with a strong ascendant lord, which is Mridanga yoga.',
       [made.exalted, made.amsaLord, lagnaLord], [made.house]);
  }

  var DETECTORS = [parivartana, neechaBhanga, vipareeta, lakshmi, mahapurusha, rajaYoga,
    moonCompany, sunCompany, moonFromSun, mahabhagya,
    chatussagara, rajalakshana, malika, parvata, vasumathi,
    vanchanachorabheethi, kahala, pushkala, gauri, bharathi, kusuma,
    chapa, sreenatha, sankha, bheri, matsya, mridanga,
    chandraMangala, adhiYoga, sakata, amala, budhaAditya,
                   gajaKesari, kartari];

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
  function detect(chart, strengths) {
    var byGraha = strengths && strengths.grahas ? strengths.grahas : strengths;
    var all = [];
    DETECTORS.forEach(function (detector) {
      detector(chart, byGraha).forEach(function (finding) { all.push(finding); });
    });
    return all;
  }

  return { detect: detect, parivartana: parivartana, neechaBhanga: neechaBhanga,
    kartari: kartari,
    moonCompany: moonCompany, chandraMangala: chandraMangala, adhiYoga: adhiYoga,
    sakata: sakata, amala: amala, budhaAditya: budhaAditya,
    BUDHA_ADITYA_FLOOR: BUDHA_ADITYA_FLOOR, BUDHA_FLOOR: BUDHA_FLOOR,
    MAHABHAGYA_DAY: MAHABHAGYA_DAY, SUN_COMPANY: SUN_COMPANY,
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
    VISHNU_HOUSES: VISHNU_HOUSES, LAKSHMI_HOUSES: LAKSHMI_HOUSES,
    VIPAREETA_NAMES: VIPAREETA_NAMES, MAHAPURUSHA: MAHAPURUSHA,
    KENDRAS: KENDRAS,
    // Exposed so a test can notice a detector being added without being wired
    // into the test that checks detect() gathers from all of them.
    DETECTOR_COUNT: DETECTORS.length,
    aspectTable: aspectTable, aspects: aspects, ordinal: ordinal,
    raoRetrogradeAspects: raoRetrogradeAspects, RAO_MAX_DEGREE: RAO_MAX_DEGREE,
    FULL_ASPECTS: Astro.FULL_ASPECTS, GRAHAS: GRAHAS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Yogas;
