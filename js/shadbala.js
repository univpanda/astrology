/*
 * shadbala.js - the six strengths, with every component kept separate.
 *
 * Shadbala is measured in shashtiamsas; sixty of them make one Rupa. A graha is
 * called strong when its total meets the minimum Parashara sets for it, which is
 * why the totals below are reported against those minimums rather than against
 * each other.
 *
 * CONVENTIONS CHOSEN, AND WHY THEY ARE LISTED
 * Unlike the ephemeris, Shadbala cannot be checked against a reference: Swiss
 * Ephemeris does not compute it, and implementations genuinely disagree. So
 * every place where a choice had to be made is named here and the breakdown is
 * reported component by component, so a total can be argued with rather than
 * merely believed.
 *
 *   Saptavargaja  uses D1, D2, D3, D7, D9, D12 and D30, with compound
 *                 friendship from the natural table plus temporal friendship.
 *   Abda, Masa    taken as the weekday lords of the solar year's and solar
 *                 month's first day, which is computable here; other texts
 *                 derive them from ahargana instead.
 *   Cheshta       interpolated linearly between a graha's fastest direct motion
 *                 and its deepest retrograde, rather than the eight-state
 *                 table, whose boundaries differ between authorities.
 *   Drik          graded Parashari aspects - quarter on the 3rd and 10th, half
 *                 on the 5th and 9th, three-quarters on the 4th and 8th, full
 *                 on the 7th, plus each graha's special aspects at full.
 *   Yuddha        not implemented. Planetary war needs two grahas within a
 *                 degree, and the rule for who wins differs by author.
 *
 * Rahu and Ketu are left out. Shadbala is defined for the seven grahas; the
 * nodes rule no sign, so Saptavargaja and Drik have nothing to say about them.
 */
var Shadbala = (function () {
  'use strict';

  var GRAHAS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

  // Deep exaltation, in absolute sidereal degrees. Debilitation is opposite.
  var EXALTATION = {
    Sun: 10, Moon: 33, Mars: 298, Mercury: 165, Jupiter: 95, Venus: 357, Saturn: 200
  };

  // Parashara's minimum for each graha, in Rupas.
  var REQUIRED_RUPAS = {
    Sun: 5, Moon: 6, Mars: 5, Mercury: 7, Jupiter: 6.5, Venus: 5.5, Saturn: 5
  };

  var NAISARGIKA = {
    Sun: 60, Moon: 51.43, Venus: 42.86, Jupiter: 34.29,
    Mercury: 25.71, Mars: 17.14, Saturn: 8.57
  };

  // Sun, Mars and Jupiter are reckoned male, Mercury and Saturn neuter, the Moon
  // and Venus female; each is strong in the matching third of a sign.
  var DREKKANA_PART = { Sun: 0, Mars: 0, Jupiter: 0, Mercury: 1, Saturn: 1, Moon: 2, Venus: 2 };

  var ODD_STRONG = ['Sun', 'Mars', 'Jupiter', 'Mercury', 'Saturn'];
  var DAY_STRONG = ['Sun', 'Jupiter', 'Venus'];
  var NORTH_STRONG = ['Sun', 'Mars', 'Jupiter', 'Venus'];

  var SAPTAVARGA = [1, 2, 3, 7, 9, 12, 30];
  var WEEKDAY_LORDS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

  var shortestArc = function (a, b) {
    var d = Math.abs(Astro.norm360(a - b));
    return d > 180 ? 360 - d : d;
  };

  /* ------------------------------------------------------- sthana bala */

  function uchchaBala(graha, longitude) {
    // Zero at the debilitation point, sixty a half-circle away from it.
    return shortestArc(longitude, EXALTATION[graha] + 180) / 3;
  }

  /*
   * Chapter 27, verses 2-4. Two ladders circulate for this and they are not
   * equivalent.
   *
   * Raman's, section 30: 45 in moolatrikona, 30 in an own sign, then halving at
   * every step down - 22.5 in a great friend's, 15 in a friend's, 7.5 in a
   * neutral's, 3.75 in an enemy's, 1.875 in a great enemy's. His worked table
   * for the Standard Horoscope is built entirely from those figures, and the
   * totals reconcile: Guru 1.875 + 7.5 + 15 + 7.5 + 7.5 + 30 + 1.875 = 71.25.
   *
   * Santhanam's translation reads "45 Virupas, in own Rashi 30 Virupas, extreme
   * friend's Rashi 20 Virupas, friend's Rashi 15 Virupas, neutral's Rashi 10
   * Virupas, enemy's Rashi 4 Virupas and in extreme enemy's Rashi 2 Virupas",
   * with Saravali corroborating, and that was used here until it was not.
   *
   * Raman is followed, as everywhere else on this page where the two differ.
   * The choice is not cosmetic: across 1800 sample births the two ladders differ
   * by a mean of 5.1 virupas and move one strong/weak verdict in forty.
   */
  var RELATION_VALUE = {
    moolatrikona: 45, own: 30, adhimitra: 22.5, mitra: 15,
    sama: 7.5, shatru: 3.75, adhishatru: 1.875
  };

  function saptavargajaBala(graha, chart, positionsD1) {
    var planet = chart.planets.filter(function (p) { return p.name === graha; })[0];
    var total = 0, detail = [];
    SAPTAVARGA.forEach(function (division) {
      var position = Astro.vargaPosition(planet.longitude, division);
      var lord = Astro.SIGN_LORDS[position.sign];
      var relation;
      /*
       * Moolatrikona first, and not behind ownership, because for one graha the
       * two part company. The Moon's moolatrikona is Taurus 3 to 30, and Taurus
       * is Venus's sign - she is the only one of the seven whose moolatrikona
       * sits in somebody else's house. Testing ownership first cost her the 45
       * and handed her a relation to Venus instead, 30 virupas short, in every
       * chart with the Moon in that arc.
       *
       * Raman's Example 9 could not catch it: his Moon is in Aquarius, so the
       * case never arises, and all 49 of his cells matched regardless.
       */
      var mool = division === 1 && Astro.dignityOf(graha, position.sign,
        position.degreeInSign) === 'Mooltrikona';
      if (mool) {
        relation = 'moolatrikona';
      } else if (lord === graha) {
        /*
         * Moolatrikona counts in the rashi and nowhere else. Raman section 30:
         * "45 Shashtiamsas have to be allotted for a planet only when it is in
         * its Moolatrikona Rasi, and not when it occupies any other of the 6
         * vargas (than Rasi)."
         *
         * It was tested in all seven, and the test could not have meant anything
         * in the other six: moolatrikona is a range of degrees within a sign,
         * and vargaPosition stretches the position within a division back across
         * the whole thirty, so the degree handed to dignityOf was not a degree
         * of any sign the graha stands in. It claimed moolatrikona in 2.4% of
         * varga cells outside the rashi.
         */
        relation = 'own';
      } else if (!positionsD1[lord]) {
        relation = 'sama';           // the nodes disposit nothing; treat as neutral
      } else {
        /*
         * Hora included, and judged the ordinary way rather than by the rule in
         * chapter 7. Santhanam's note on these verses is explicit: "The compound
         * relationships of two given planets ... (including Hora lordship etc.) be
         * seen in the Rashi chart only and not in the concerned divisional chart."
         * The chapter 7 list of which grahas tell in which hora governs how varga
         * effects are read, not this arithmetic, so the Dasavarga grid follows that
         * and this does not.
         */
        var apart = ((positionsD1[lord].sign - positionsD1[graha].sign) % 12 + 12) % 12 + 1;
        relation = Astro.compoundRelation(graha, lord, apart);
      }
      total += RELATION_VALUE[relation];
      detail.push({ division: division, sign: position.sign, lord: lord, relation: relation });
    });
    return { value: total, detail: detail };
  }

  /*
   * Verse 414. Fifteen virupas for the rashi and fifteen for the navamsa, and
   * Santhanam's instruction is that the two "be added together to know the
   * Ojhayugmarasiamsa bala" - so the bala is one figure made of two, and the two
   * are returned apart as well as added. Venus and the Moon want even signs,
   * being reckoned female; the other five want odd.
   */
  function ojhayugmaBala(graha, planet) {
    var wantsOdd = ODD_STRONG.indexOf(graha) >= 0;
    var navamsa = Astro.vargaPosition(planet.longitude, 9).sign;
    return {
      rasi: (planet.sign % 2 === 0) === wantsOdd ? 15 : 0,
      navamsa: (navamsa % 2 === 0) === wantsOdd ? 15 : 0
    };
  }

  function kendradiBala(house) {
    if ([1, 4, 7, 10].indexOf(house) >= 0) return 60;
    if ([2, 5, 8, 11].indexOf(house) >= 0) return 30;
    return 15;
  }

  function drekkanaBala(graha, degreeInSign) {
    return Math.floor(degreeInSign / 10) === DREKKANA_PART[graha] ? 15 : 0;
  }

  /* ---------------------------------------------------------- dig bala */

  function digBala(graha, longitude, ascendant, midheaven) {
    // Each graha is weakest opposite the angle it is strongest on.
    var weakest = graha === 'Sun' || graha === 'Mars' ? midheaven + 180
      : graha === 'Jupiter' || graha === 'Mercury' ? ascendant + 180
      : graha === 'Moon' || graha === 'Venus' ? midheaven
      : ascendant;
    return shortestArc(longitude, weakest) / 3;
  }

  /* --------------------------------------------------------- kala bala */

  /**
   * @param {number} hoursFromMidnight  local apparent time, 0 at the Sun's
   *   lower meridian and 12 at its upper one - sundial time at the birthplace.
   */
  function nathonnathaBala(graha, hoursFromMidnight) {
    if (graha === 'Mercury') return 60;          // strong by day and by night
    var fromMidnight = Math.abs(hoursFromMidnight - 12) / 12;   // 1 at midnight, 0 at noon
    return 60 * (DAY_STRONG.indexOf(graha) >= 0 ? 1 - fromMidnight : fromMidnight);
  }

  /*
   * Returned undoubled. The Moon's paksha bala and the Sun's ayana bala are
   * doubled where they enter Kala Bala, but the luminaries also borrow those
   * two for Cheshta Bala, and a borrowed value must not carry the doubling with
   * it - Cheshta is capped at sixty like every other strength.
   */
  function pakshaBala(elongation, benefic) {
    var waxing = elongation <= 180 ? elongation : 360 - elongation;
    var brightness = waxing / 180 * 60;
    return benefic ? brightness : 60 - brightness;
  }

  function tribhagaBala(graha, jd, sunrise, sunset, nextSunrise) {
    if (graha === 'Jupiter') return 60;           // Jupiter takes it always
    var byDay = ['Mercury', 'Sun', 'Saturn'], byNight = ['Moon', 'Venus', 'Mars'];
    if (jd >= sunrise && jd < sunset) {
      var part = Math.floor((jd - sunrise) / ((sunset - sunrise) / 3));
      return byDay[Math.min(2, part)] === graha ? 60 : 0;
    }
    var start = jd < sunrise ? sunrise - (nextSunrise - sunset) : sunset;
    var length = (nextSunrise - sunset) / 3;
    var nightPart = Math.floor((jd - start) / length);
    return byNight[Math.max(0, Math.min(2, nightPart))] === graha ? 60 : 0;
  }

  /*
   * Raman section 75, the formula he gives as Kesava Daivagna's:
   *
   *     (24 + Kranti) / 48 x 60
   *
   * The 24 is the maximum declination and the 48 is twice it, so both constants
   * are one obliquity, stated at section 73: "The maximum declination of 24 is
   * reached when the planet has advanced 90 from any one of the equinoctial
   * points."
   *
   * This used 23.45 and 46.9, which was recorded here for a while as a modern
   * obliquity smuggled into a classical formula. That was wrong: it is
   * Parashara's figure, in Santhanam's note to ch.27 vv.15-17, where the
   * formula is given as (23 deg 27' + Kranti) x 1.2793 - and 23 deg 27' is
   * 23.45, while 1.2793 is 60/46.9 exactly.
   *
   * So both constants are sourced and the choice is between two authorities
   * rather than between a text and an invention. They differ by at most 0.70
   * virupas.
   *
   * Which constant belongs with which declination was argued here the wrong way
   * round for a while, and the formula settles it. 23 deg 27' is the obliquity,
   * and the obliquity is exactly the greatest declination a point on the
   * ecliptic can have - so a declination read from longitude alone runs from
   * -23.45 to +23.45 and the formula runs from 0 to 60, touching both ends and
   * leaving neither. Measured over 1,800 charts it does exactly that.
   *
   * Every other pairing sits wrong. Raman's 24 with the same declination never
   * lets the formula reach the sixty it declares, 0.69 to 59.31. And a true
   * declination carries the graha's latitude, so the Moon passes 28 degrees and
   * the formula breaks its own bounds either way: -6.70 to 66.13 on Parashara's
   * constant, -5.86 to 65.30 on Raman's. Negative strength is not a reading.
   *
   * Parashara's constant with the longitude-only declination is the default for
   * that reason, and it is what Star Jyotish computes.
   *
   * Worth up to 0.70 virupas, and double that for the Sun.
   *
   * Also undoubled; see the note on paksha bala above.
   */
  function ayanaBala(graha, dec, constant) {
    var c = constant || AYANA_CONSTANT.PARASHARA;
    var north = NORTH_STRONG.indexOf(graha) >= 0;
    var effective = graha === 'Mercury' ? Math.abs(dec) : (north ? dec : -dec);
    return 60 * (c.max + effective) / c.divisor;
  }

  /* ------------------------------------------------------ cheshta bala */

  /*
   * Motional strength, from the chesta kendra - Raman sections 105 to 107.
   *
   * "The Chesta kendra is also called Seeghra kendra. According to Sripathi it
   * is obtained by applying the formula: Graha's Seeghrochcha minus (its mean
   * long. + its true long.) / 2." And section 107: "The Chesta Bala is zero when
   * the Chesta kendra is also zero. When it is 180 the Chesta Bala is 60
   * Shashtiamsas. In intermediate position ... Reduced Chesta kendra / 3."
   *
   * This was a proxy: how fast the graha was moving against its own mean and
   * extremes. The two track each other for the outer three - 0.99 for Saturn
   * and Jupiter - and not at all for Venus, which retrogrades at inferior
   * conjunction where the proxy reads it as fast and direct. On one sample
   * chart the proxy gave Venus 3.9 where the kendra gives 28.7.
   *
   * The seeghrocha differs by kind, which is the whole of why the proxy failed.
   * An outer graha turns retrograde at opposition, so the Sun is its seeghrocha
   * and the kendra is the elongation. An inner one turns at inferior
   * conjunction, where its elongation is near nothing; its own mean longitude
   * is the seeghrocha and the Sun's stands in as its mean, which is the Indian
   * convention - Mercury and Venus share the Sun's mean motion as seen from
   * here.
   *
   * The Sun and the Moon never retrograde and borrow instead, section 106: "For
   * the Sun and the Moon, there is no separate method of Cheshta Bala
   * computation. The Sun's Ayana Bala will itself be his Cheshta Bala while the
   * Moon's Paksha Bala is her Cheshta Bala."
   *
   * One caveat, recorded rather than hidden. Raman's mean longitudes come from
   * the Surya Siddhanta motions his Tables IV to IX tabulate, and these come
   * from Standish; the two models do not agree to the degree. Against one
   * worked reference this reproduces Jupiter, Venus and Saturn to about a
   * virupa and a half and misses Mars and Mercury by rather more, which is what
   * that difference looks like.
   */
  /*
   * Which mean longitudes the kendra is measured against.
   *
   * The chesta kendra is a gap between a true longitude and a mean one, and a
   * mean longitude belongs to whichever model defines it. Reading a modern
   * mean against a modern true is internally consistent but is not what any
   * text computes; reading the classical tables against a modern true is what
   * Raman does throughout his Standard Horoscope, and it is the only one of
   * the two that reproduces his worked answers.
   *
   * Measured against his Examples 49 to 51: the classical tables land every
   * graha within 0.11 virupas, where the modern means miss Budha by 4.1
   * because the two models put his mean longitude 11 degrees apart. The outer
   * three barely move either way, the Sun's error there cancelling most of
   * each graha's own.
   */
  var MEAN_SOURCE = { CLASSICAL: 'classical', MODERN: 'modern' };

  /*
   * Where the luminaries' cheshta bala comes from. Parashara answers twice,
   * once in each chapter, and the two answers are a pair.
   *
   * Chapter 27.18, among the shadbalas: "The Sun's Cheshta Bala will
   * correspond to his Ayana Bala. The Moon's Paksha Bala will itself be her
   * Cheshta Bala." Chapter 28.3-4, opening Ishta and Kashta, gives each of
   * them a kendra of its own instead: "Add 3 Rashis to Sayana Sun, which will
   * be the Cheshta Kendra for the Sun. The sidereal longitude of the Sun
   * should be deducted from the Moon to get the Moon's Cheshta Kendra."
   * Reduced past six signs and divided by three, as every cheshta kendra is.
   *
   * The second is the default, for the reason the figure is computed at all:
   * it is not added to the shadbala sum, where it would count a strength that
   * kala bala already carries, so what is left for it to be is the chapter 28
   * quantity. Raman works the Sun exactly this way at Example 60 - sayana
   * 202 10', add 90, reduce, divide by three, 22.66 - and never from his ayana
   * bala, which on that chart is 18.95.
   *
   * For the Moon the two agree while she is read as a benefic, her paksha bala
   * then being that same elongation over three. They part under the group
   * reading, where a waning Moon takes sixty minus it, and there they are
   * complements.
   */
  var LUMINARY_RULE = { KENDRA: 'kendra', BORROWED: 'borrowed' };

  /*
   * Whether the luminaries' cheshta bala is added to the shadbala total.
   *
   * It is not, by default, because adding it counts the same figure twice. The
   * Sun's ayana bala already sits inside his kala bala, doubled; adding it
   * again as cheshta puts it in at three times its base where the text's
   * doubling asks for twice. The same for the Moon's paksha bala. That is
   * worth about a rupa on each.
   *
   * Raman does not add it either. Example 56 leaves both rows of his table
   * empty, and the totals he prints are the sums without them - Chandra's
   * 389.80 to the hundredth, Budha's and Sukra's likewise. His reason is at
   * section 136, that the figure is "necessary to ascertain the Ishta and
   * Kashta Phalas", which is the subject of chapter 28, where Parashara's own
   * second rule for the two appears.
   *
   * The other reading is offered because Parashara does give them a cheshta
   * bala at 27.18 and does list cheshta among the six at 27.24-25, so someone
   * reading that chapter alone would sum all six for all seven.
   */
  var LUMINARY_CHESHTA = { COUNTED: 'counted', OMITTED: 'omitted' };

  var INNER = ['Mercury', 'Venus'];
  var MEAN_KEY = { Mars: 'mars', Mercury: 'mercury', Jupiter: 'jupiter',
    Venus: 'venus', Saturn: 'saturn' };

  /** Halfway between two longitudes, the short way round. */
  function midpoint(a, b) {
    return Astro.norm360(a + (Astro.norm360(b - a + 180) - 180) / 2);
  }

  /**
   * The chesta kendra, 0 to 180: nothing where the graha is at its fastest and
   * a half circle where it is deepest in retrogression.
   */
  /*
   * The formula alone, section 105: "Graha's Seeghrochcha minus (its mean long.
   * + its true long.) / 2", reduced by section 106 to at most 180.
   *
   * Kept separate from the ephemeris that feeds it so the two can fail
   * separately. Raman works all five grahas of his Standard Horoscope at
   * Examples 49 to 51 and this reproduces every one of them exactly - but only
   * because his printed longitudes go in. What this engine computes for those
   * same longitudes is a different question, and the answer is that Surya
   * Siddhanta mean motions and Standish's elements part by a few degrees.
   */
  function chestaKendraFrom(seeghrocha, meanLong, trueLong) {
    var kendra = Astro.norm360(seeghrocha - midpoint(trueLong, meanLong));
    return kendra > 180 ? 360 - kendra : kendra;
  }

  /*
   * Which longitude plays which part depends on the kind of graha, and that is
   * the whole of the difference. For Mars, Jupiter and Saturn the seeghrocha is
   * the Sun's mean longitude and the "mean long." of the formula is the graha's
   * own. For Mercury and Venus it is the other way about: the graha's own mean
   * longitude is the seeghrocha and the Sun's stands in as the mean. Raman's
   * Example 49 shows it plainly - Budha and Sukra are both worked with 181.23,
   * the Sun's mean, where Kuja, Guru and Sani use their own.
   */
  function chestaKendra(graha, longitude, T, ayanamsa, source, jd) {
    var key = MEAN_KEY[graha];
    if (!key) return 0;
    var sidereal = function (tropical) { return Astro.norm360(tropical - ayanamsa); };
    var classical = source === MEAN_SOURCE.CLASSICAL;
    var meanOf = function (k) {
      return sidereal(classical ? Astro.classicalMeanLongitude(k, jd, T)
                                : Astro.meanLongitude(k, T));
    };
    var sunMean = classical ? sidereal(Astro.classicalMeanLongitude('sun', jd, T))
                            : sidereal(Astro.sunMeanLongitude(T));
    var own = meanOf(key);
    return INNER.indexOf(graha) >= 0
      ? chestaKendraFrom(own, sunMean, longitude)
      : chestaKendraFrom(sunMean, own, longitude);
  }

  /*
   * The eight motions, Brihat Parashara Hora Shastra ch.27 vv.21-23, which the
   * verse heads "PLANETARY MOTIONS (MARS TO SATURN)" and Charak repeats as the
   * whole of his cheshta bala. The Sun and Moon keep their borrowings either
   * way, v.18 being silent about motion for them.
   *
   * The names below and the value each carries are the text's, checked in two
   * independent English translations which agree word for word on the pairing:
   * Manda 30, Mandatara 15, Sama 7.5, Chara 45, Atichara 30. An earlier
   * reading here took the translators to have slid the words by a slot,
   * because it puts Sama - the average speed, and much the commonest state -
   * at the bottom of the scale, and reassigned the values to climb with speed.
   * That was the wrong call. The list is not a ranking of speed: read down the
   * figures and they fall in halves, 60 30 15, then 30 15 7.5, then 45 30,
   * which is a deliberate shape rather than a translator's slip. This method
   * does not agree with the chesta kendra either way - the kendra gives sixty
   * at retrogression and nothing at the fastest direct motion, where this list
   * pays Chara 45 - so making it monotonic did not reconcile them.
   *
   * Four states come straight out of the ephemeris. Vakra is retrograde,
   * Vikala is stationary, Anuvakra is retrograde across a sign boundary, and
   * Atichara is its mirror, "entering next sign in accelerated motion".
   * THE REMAINING BOUNDARIES ARE NOT IN ANY TEXT. Neither Parashara nor
   * Charak says where slow becomes slower, so the ratios below are a choice,
   * and the only honest thing to do is say so here rather than let them pass
   * as received.
   */
  var MOTION_VALUE = { vakra: 60, anuvakra: 30, vikala: 15, manda: 30,
    mandatara: 15, sama: 7.5, chara: 45, atichara: 30 };

  /*
   * Mean geocentric daily motion. The inner two take the Sun's, not their own
   * heliocentric figure: against its own 4.09 a day, Mercury's apparent motion
   * never reaches even a tenth over half of mean, so it could never be counted
   * fast at all. This is the same substitution the seeghrocha makes.
   */
  var MEAN_MOTION = { Mars: 0.524033, Mercury: 0.985609, Jupiter: 0.083091,
    Venus: 0.985609, Saturn: 0.033460 };

  var MOTION_BANDS = [[0.05, 'vikala'], [0.50, 'mandatara'], [1.00, 'manda'],
    [1.50, 'sama']];

  /** Whether a day's travel carries the graha out of the sign it is in. */
  function crossesSign(longitude, speed) {
    return Math.floor(Astro.norm360(longitude) / 30) !==
      Math.floor(Astro.norm360(longitude + speed) / 30);
  }

  function motionState(graha, longitude, speed) {
    var mean = MEAN_MOTION[graha];
    if (!mean) return null;
    if (speed < 0) {
      return crossesSign(longitude, speed) ? 'anuvakra' : 'vakra';
    }
    var ratio = speed / mean;
    for (var i = 0; i < MOTION_BANDS.length; i++) {
      if (ratio < MOTION_BANDS[i][0]) return MOTION_BANDS[i][1];
    }
    // Chara is fast; Atichara is fast and over the boundary with it.
    return crossesSign(longitude, speed) ? 'atichara' : 'chara';
  }

  /** "If the Cheshta Kendra is in excess of 6 signs, deduct it from 12." */
  function reducedKendra(arc) {
    var a = Astro.norm360(arc);
    return a > 180 ? 360 - a : a;
  }

  function cheshtaBala(graha, longitude, o) {
    // The luminaries never retrograde, so neither has an arc of retrogression.
    if (graha === 'Sun') {
      return o.luminaryRule === LUMINARY_RULE.BORROWED ? o.ayana
        : reducedKendra(o.longitude + o.ayanamsa + 90) / 3;
    }
    if (graha === 'Moon') {
      return o.luminaryRule === LUMINARY_RULE.BORROWED ? o.paksha
        : reducedKendra(o.elongation) / 3;
    }
    if (o.method === CHESHTA.MOTION) {
      var state = motionState(graha, longitude, o.speed);
      return state ? MOTION_VALUE[state] : 0;
    }
    return chestaKendra(graha, longitude, o.T, o.ayanamsa, o.meanSource, o.jd) / 3;
  }

  /* -------------------------------------------------------- yuddha bala */

  /*
   * Planetary war, as B. V. Raman sets it out in sections 76 and 77 of Graha
   * and Bhava Balas - the standard English treatment of this chapter, and the
   * one followed here in preference to the bare verse.
   *
   * "Two planets are said to be in Yuddha or fight when they are in conjunction
   * and the distance between them is less than one degree. All the planets
   * excepting Ravi and Chandra may enter into war. The conquering planet is the
   * one whose longitude is less. ... ascertain the aggregate of the various
   * Balas, viz., Sthanabala, the Dikbala and the Kalabala (up to Horabala) ...
   * Find out the difference between the two aggregates ... Divide this
   * difference by the difference between the diameters of the discs of the two
   * fighting planets. And the resulting quotient which is the Yuddhabala must be
   * added to the total of the Kalabala of the victorious planet and must be
   * subtracted from the total Kalabala of the vanquished planet."
   *
   * Three things that differ from Santhanam's verse 20, and why Raman wins each.
   *
   * THE VICTOR is the lesser longitude, not the more northerly. Santhanam gives
   * the latitude account at length and calls the longitude rule what we are
   * "normally taught"; Raman states the longitude rule flatly and works his
   * examples on it. The two disagree about who won in half of all wars.
   *
   * THE SIZE is divided by the difference of the planetary disc diameters, which
   * Santhanam's verse does not mention at all. This is the whole of the
   * difference between the two readings: applied raw it is a median 83 virupas
   * and can reach 272, which exchanges the two grahas' totals outright; divided,
   * it is a median of 1 and reaches 58.
   *
   * WHERE IT LANDS is inside Kala bala, which is where Raman lists it - his
   * ninth kala component, after ayana - rather than outside the six. The
   * aggregate it is computed from stops at hora bala, so ayana and the war
   * itself are both outside the comparison and there is no circularity.
   */
  var WAR_ORB = 1;
  var WARRING = ['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

  /*
   * Bimba parimana, section 77: the diameters of the planetary discs, in arc.
   * These are the figures Raman tabulates, and nothing else in Shadbala uses
   * them - a war is the only place a graha's apparent size is asked about.
   */
  var BIMBA = { Mars: 9.4, Mercury: 6.6, Jupiter: 190.4, Venus: 16.6, Saturn: 158.0 };

  /** The aggregate a war is judged on: sthana, dig, and kala as far as hora. */
  var WAR_KALA_PARTS = ['nathonnatha', 'paksha', 'tribhaga', 'abda', 'masa',
    'vara', 'hora'];

  function warAggregate(x) {
    return WAR_KALA_PARTS.reduce(function (sum, key) {
      return sum + x.kala[key];
    }, x.sthana.total + x.dig);
  }

  /** Every war in the chart, each as {won, lost, separation}. */
  function planetaryWars(positions) {
    var found = [];
    for (var i = 0; i < WARRING.length; i++) {
      for (var j = i + 1; j < WARRING.length; j++) {
        var a = positions[WARRING[i]], b = positions[WARRING[j]];
        if (!a || !b) continue;
        var separation = Math.abs(Astro.norm360(a.longitude - b.longitude + 180) - 180);
        if (separation >= WAR_ORB) continue;
        var aWins = a.longitude < b.longitude;     // the lesser longitude conquers
        found.push({
          won: aWins ? a.name : b.name,
          lost: aWins ? b.name : a.name,
          separation: separation
        });
      }
    }
    return found;
  }

  /* --------------------------------------------------------- drik bala */

  /*
   * Drishti as a continuous function of the exact angle between two grahas, not
   * a value per whole sign.
   *
   * Raman gives it in sections 114-115, quoting Sripathi and noting that
   * Parashara gives the same rules: the drishti kendra is the aspected graha's
   * longitude less the aspecting one's, and the value rises and falls in six
   * straight segments across the circle. The joints are continuous - 0 at 30
   * degrees, 15 at 60, 45 at 90, 30 at 120, 0 at 150, 60 at 180, 0 again at 300
   * - so a graha's drishti changes with every degree it moves.
   *
   * This was a step table keyed on whole-sign distance: 15 on the 3rd and 10th,
   * 30 on the 5th and 9th, 45 on the 4th and 8th, 60 on the 7th. Those are
   * exactly the values of this function at the cusps, so the table was right at
   * seven points of the circle and an approximation everywhere between them -
   * and silent over 150 to 180 degrees, where the curve climbs from 0 to 60 and
   * the table gave nothing at all because the 6th house is not in it.
   */
  function drishtiValue(dk) {
    dk = Astro.norm360(dk);
    if (dk >= 30 && dk < 60) return (dk - 30) / 2;
    if (dk >= 60 && dk < 90) return dk - 60 + 15;
    if (dk >= 90 && dk < 120) return (120 - dk) / 2 + 30;
    if (dk >= 120 && dk < 150) return 150 - dk;
    if (dk >= 150 && dk < 180) return (dk - 150) * 2;
    if (dk >= 180 && dk <= 300) return (300 - dk) / 2;
    return 0;
  }

  /*
   * Visesha drishti, section 115: added to the ordinary drishti rather than
   * replacing it. Mars gets 15 more on the 4th and 8th, Jupiter 30 on the 5th
   * and 9th, Saturn 45 on the 3rd and 10th - each of which brings the total to
   * exactly 60 at the cusp, which is why replacing it with 60 looked right for
   * as long as only cusps were tested.
   */
  var VISESHA = {
    Mars: { at: [[90, 120], [210, 240]], value: 15 },
    Jupiter: { at: [[120, 150], [240, 270]], value: 30 },
    Saturn: { at: [[60, 90], [270, 300]], value: 45 }
  };

  /*
   * Section 120: "The Drik Bala of a Graha is one-fourth of the Drishti Pinda on
   * it. It is positive or negative according as the Drishti Pinda is positive or
   * negative." Nothing else - Santhanam's verse 19 adds "super add the entire
   * aspect of Mercury and Jupiter", and Raman's own worked example rules it out:
   * his Sun takes a drishti pinda of +63.45 and a drik bala of +15.86, which is
   * the quarter exactly, with Jupiter among the grahas aspecting it.
   */
  function drikBala(graha, positions, benefics) {
    var pinda = 0;
    GRAHAS.forEach(function (other) {
      if (other === graha) return;
      var dk = Astro.norm360(positions[graha].longitude - positions[other].longitude);
      var value = drishtiValue(dk);
      var special = VISESHA[other];
      if (special && special.at.some(function (span) {
        return dk >= span[0] && dk < span[1];
      })) value += special.value;
      if (!value) return;
      pinda += benefics[other] ? value : -value;
    });
    return pinda / 4;
  }

  /* ------------------------------------------------------------ totals */

  /**
   * Compute Shadbala for a chart.
   *
   * @param {Object} chart   from Astro.chart
   * @param {Object} place   { latitude, longitude, tzOffsetMinutes }
   */
  /*
   * Which group the Moon joins for her own paksha bala. The authorities split,
   * and both readings are held by people on the same shelf.
   *
   *   'group'   - she joins the benefics or the malefics like anyone else, so a
   *               thin Moon takes sixty less the brightness. Santhanam's note to
   *               ch.27 vv.10-11 has "The Moon in dark half is a malefic" and
   *               then "Whether the Moon is in a group of benefices or
   *               otherwise, her Paksha Bala is always doubled", which only
   *               needs saying if she can fall in either. Raman puts the rule
   *               inside the paksha chapter itself, section 53.
   *
   *   'benefic' - she is always counted a benefic and takes the brightness
   *               outright. K. S. Charak lists her among the natural benefics
   *               for this bala without qualification, and Phaladeepika IV.5
   *               reads the same way: "The Moon is strong and auspicious when
   *               she has her full Paksha bala" - which cannot be right under
   *               the group rule, where a dark Moon is the one with the high
   *               figure.
   *
   * It reaches further than its own row, because the Moon's cheshta bala is her
   * paksha bala (ch.27 v.18), so the choice shows up twice in the table.
   *
   * Only the Moon's own figure moves. The other six are unaffected, and so is
   * her benefic standing everywhere else - drik bala and the yogas still read
   * her by the ordinary rule.
   *
   * Called with no options this keeps 'group', the reading Parashara's verse
   * and Raman both give, so a caller who expresses no preference gets the
   * conservative answer. The page defaults the other way and says so in
   * settings; it always passes its choice explicitly rather than relying on
   * this.
   */
  /*
   * Which clock nata-unnata measures the day by. Nothing else reads it.
   *
   * Raman asks for the sundial, by name, at section 48: "Midday of any place is
   * the local noon when the Sun passes over its meridian. The Hindus consider
   * the apparent noon ... if birth time is marked in local mean time, it must
   * be converted into the apparent time by applying equation of time."
   *
   * That is two corrections away from the clock on the wall, and both are
   * commonly skipped. A timezone is an administrative band, so a place can sit
   * an hour or more from the meridian it keeps time by; and even on that
   * meridian a clock keeps mean time, which the equation of time parts from
   * the Sun by up to sixteen minutes either way.
   *
   *   'apparent' - the hour angle of the true Sun. Raman's reading, the default.
   *   'mean'     - local mean time: the longitude correction but not the
   *                equation of time. The halfway house Raman describes and
   *                then tells the reader to finish.
   *   'zone'     - the clock on the wall. No authority asks for this; it is
   *                what a program does when it treats the birth time as given.
   *                Offered because widely used software does it, and a row
   *                that differs for this reason is easy to mistake for a
   *                difference of method.
   */
  var KRANTI = { LONGITUDE: 'longitude', TRUE: 'true' };

  /*
   * The two constants the scaling can use, and they are two authorities rather
   * than a text and an invention. Parashara's is 23 deg 27' with a divisor of
   * 46.9, which Santhanam gives as "(23 deg 27' + Kranti) x 1.2793" in his note
   * to ch.27 vv.15-17, 1.2793 being 60/46.9 exactly. Raman's is 24 and 48,
   * section 73.
   *
   * They differ by at most 0.70 virupas, doubled for the Sun. Parashara's is
   * the default, being the older of the two and the one a reader checking
   * against a panchang is likelier to meet.
   */
  var AYANA_CONSTANT = {
    PARASHARA: { key: 'parashara', max: 23.45, divisor: 46.9 },
    RAMAN: { key: 'raman', max: 24, divisor: 48 }
  };

  var CHESHTA = { KENDRA: 'kendra', MOTION: 'motion' };

  /*
   * MEAN is not offered on the settings panel. Nothing asks for it - Uttara
   * Kalamrita allows the clock outright, Raman asks for the sundial - and a
   * birth time genuinely recorded in local mean time is a question the birth
   * form already asks under its time standard, which sets the offset from
   * longitude and makes the clock reading mean time anyway.
   *
   * It stays here because it is the seam between the two corrections that
   * separate the clock from the sundial, and the note on that setting quotes
   * what each of them is worth. Computing from MEAN is how those figures are
   * checked.
   */
  var NAT_CLOCK = { APPARENT: 'apparent', MEAN: 'mean', ZONE: 'zone' };

  function natHours(clock, jd, place) {
    if (clock === NAT_CLOCK.ZONE) {
      var local = jd + (place.tzOffsetMinutes || 0) / 1440 + 0.5;
      return (local - Math.floor(local)) * 24;
    }
    if (clock === NAT_CLOCK.MEAN) {
      var lmt = jd + place.longitude / 360 + 0.5;
      return (lmt - Math.floor(lmt)) * 24;
    }
    return Astro.localApparentTime(jd, place.longitude);
  }

  var MOON_PAKSHA = { GROUP: 'group', BENEFIC: 'benefic' };

  function compute(chart, place, options) {
    var moonPaksha = (options && options.moonPaksha) === MOON_PAKSHA.BENEFIC
      ? MOON_PAKSHA.BENEFIC : MOON_PAKSHA.GROUP;
    var cheshtaMethod = (options && options.cheshtaMethod) === CHESHTA.MOTION
      ? CHESHTA.MOTION : CHESHTA.KENDRA;
    var meanSource = (options && options.meanSource) === MEAN_SOURCE.MODERN
      ? MEAN_SOURCE.MODERN : MEAN_SOURCE.CLASSICAL;
    var luminaryRule = (options && options.luminaryRule) === LUMINARY_RULE.BORROWED
      ? LUMINARY_RULE.BORROWED : LUMINARY_RULE.KENDRA;
    var luminaryCheshta = (options && options.luminaryCheshta) === LUMINARY_CHESHTA.COUNTED
      ? LUMINARY_CHESHTA.COUNTED : LUMINARY_CHESHTA.OMITTED;
    var mercuryNature = (options && options.mercuryNature) === 'benefic'
      ? 'benefic' : 'qualified';
    var kranti = (options && options.kranti) === KRANTI.TRUE
      ? KRANTI.TRUE : KRANTI.LONGITUDE;
    var ayanaConstant = (options && options.ayanaConstant) === AYANA_CONSTANT.RAMAN.key
      ? AYANA_CONSTANT.RAMAN : AYANA_CONSTANT.PARASHARA;
    var horaLength = (options && options.horaLength) === HORA_LENGTH.SEASONAL
      ? HORA_LENGTH.SEASONAL : HORA_LENGTH.EQUAL;
    var wanted = options && options.natClock;
    var natClock = wanted === NAT_CLOCK.ZONE || wanted === NAT_CLOCK.MEAN
      ? wanted : NAT_CLOCK.APPARENT;
    var jd = chart.julianDay;
    var T = (jd + Astro.deltaT(jd) / 86400 - 2451545.0) / 36525;
    var nut = Astro.nutation(T);
    var eps = Astro.meanObliquity(T) + nut.deps;

    var sunrise = Astro.sunriseSunset(jd, place.latitude, place.longitude, false);
    var sunset = Astro.sunriseSunset(jd, place.latitude, place.longitude, true);
    var nextSunrise = Astro.sunriseSunset(jd + 1, place.latitude, place.longitude, false);

    var positions = {};
    chart.planets.forEach(function (p) { positions[p.name] = p; });

    var sun = positions.Sun, moon = positions.Moon;
    var elongation = Astro.norm360(moon.longitude - sun.longitude);

    // Benefic or malefic, which decides the sign of every aspect below. Shared
    // with the yoga detectors rather than computed twice and left to drift.
    var benefics = Astro.naturalBenefics(chart, { mercuryNature: mercuryNature });

    /*
     * Sundial time at the birthplace, not clock time. Raman section 48 asks for
     * the local apparent noon by name, and a timezone is the wrong clock twice
     * over: it is an administrative band, and it gives mean time rather than
     * apparent. Honolulu is half an hour of time west of its own zone meridian,
     * which is three virupas of nata bala.
     */
    var localHours = natHours(natClock, jd, place);
    /*
     * The sunrise that opened the Hindu day, with the sunset and sunrise that
     * bracket it. For a birth before dawn that is yesterday's sunrise, and the
     * night it falls in began at yesterday's sunset.
     */
    var horaSpan = sunrise !== null && sunrise > jd
      ? { sunrise: Astro.sunriseSunset(jd - 1, place.latitude, place.longitude, false),
          sunset: Astro.sunriseSunset(jd - 1, place.latitude, place.longitude, true),
          nextSunrise: sunrise }
      : { sunrise: sunrise, sunset: sunset, nextSunrise: nextSunrise };

    var results = {};
    GRAHAS.forEach(function (graha) {
      var p = positions[graha];
      var tropical = p.longitude + chart.ayanamsa;
      /*
       * Which declination the kranti is. Two complete methods, and mixing them
       * is the error this once made.
       *
       * 'longitude' - from the bhuja of the sayana longitude, Raman section 73,
       *   through a table of six 15-degree steps. A longitude carries no
       *   latitude, and his Example 32 works all seven grahas that way,
       *   Chandra included. This pairs with his 24 and 48, because 24 is what a
       *   declination read off a longitude reaches.
       *
       * 'true' - the real declination, latitude and all. Santhanam's note to
       *   ch.27 vv.15-17 sends the reader straight to one: "Krantis (or
       *   declinations) can be ascertained from standard modern ephemeris",
       *   and gives the formula as (23 deg 27' + Kranti) x 1.2793, a 23.45
       *   maximum to match. Drik Panchang computes the true declination and
       *   reproduces exactly under this setting.
       *
       * Worth up to 2.5 virupas on a planet and 6.6 on the Moon, who carries
       * the largest latitude of the nine.
       */
      var latitude = 0;
      if (kranti === KRANTI.TRUE) {
        latitude = graha === 'Moon' ? Astro.moonLatitude(T)
          : graha === 'Sun' ? 0
          : (Astro.apparentLongitude(MEAN_KEY[graha], T, nut) || {}).lat || 0;
      }
      var dec = Astro.declination(tropical, latitude, eps);

      var saptavargaja = saptavargajaBala(graha, chart, positions);
      var ojha = ojhayugmaBala(graha, p);
      var sthana = {
        uchcha: uchchaBala(graha, p.longitude),
        saptavargaja: saptavargaja.value,
        // The two halves of the one bala, kept apart for anything that shows
        // where its 15 or 30 came from, and added for anything that does not.
        ojhaRasi: ojha.rasi,
        ojhaNavamsa: ojha.navamsa,
        ojhayugma: ojha.rasi + ojha.navamsa,
        kendradi: kendradiBala(p.house),
        drekkana: drekkanaBala(graha, p.degreeInSign)
      };
      sthana.total = sthana.uchcha + sthana.saptavargaja + sthana.ojhayugma +
        sthana.kendradi + sthana.drekkana;

      var paksha = pakshaBala(elongation,
        graha === 'Moon' && moonPaksha === MOON_PAKSHA.BENEFIC
          ? true : benefics[graha]);
      var ayana = ayanaBala(graha, dec, ayanaConstant);
      var kala = {
        nathonnatha: nathonnathaBala(graha, localHours),
        paksha: graha === 'Moon' ? paksha * 2 : paksha,   // doubled for the Moon
        tribhaga: (sunrise && sunset && nextSunrise)
          ? tribhagaBala(graha, jd, sunrise, sunset, nextSunrise) : 0,
        // The lords of the weekdays the astrological year and month opened on,
        // counted from the ahargana rather than from any solar ingress.
        abda: abdaLord(chart.panchang.ahargana) === graha ? 15 : 0,
        masa: masaLord(chart.panchang.ahargana) === graha ? 30 : 0,
        vara: chart.panchang.varaLord === graha ? 45 : 0,
        hora: horaLord(jd, horaSpan, chart.panchang.varaLord, horaLength) === graha
          ? 60 : 0,
        ayana: graha === 'Sun' ? ayana * 2 : ayana        // doubled for the Sun
      };
      /*
       * Eight parts here and a ninth after the war is settled. Raman lists
       * yuddha bala as the ninth kala component and has it added to or taken
       * from the total kala bala, so the total cannot be closed until every
       * graha's aggregate is known.
       */
      kala.yuddha = 0;
      kala.total = kala.nathonnatha + kala.paksha + kala.tribhaga + kala.abda +
        kala.masa + kala.vara + kala.hora + kala.ayana;

      var dig = digBala(graha, p.longitude, chart.ascendant.longitude, chart.midheaven.longitude);
      var cheshta = cheshtaBala(graha, p.longitude, {
        T: T, jd: jd, ayanamsa: chart.ayanamsa, ayana: ayana, paksha: paksha,
        method: cheshtaMethod, speed: p.speed, meanSource: meanSource,
        luminaryRule: luminaryRule, elongation: elongation,
        longitude: p.longitude
      });
      var naisargika = NAISARGIKA[graha];
      var drik = drikBala(graha, positions, benefics);

      results[graha] = {
        sthana: sthana,
        saptavargajaDetail: saptavargaja.detail,
        dig: dig,
        kala: kala,
        cheshta: cheshta,
        naisargika: naisargika,
        drik: drik,
        war: null,
        benefic: benefics[graha]
      };
    });

    /*
     * The war, then the totals. The quotient is added to the victor's kala bala
     * and taken from the vanquished's, so a graha in two wars carries both.
     */
    var wars = planetaryWars(positions);
    wars.forEach(function (war) {
      var gap = Math.abs(warAggregate(results[war.won]) - warAggregate(results[war.lost]));
      var discs = Math.abs(BIMBA[war.won] - BIMBA[war.lost]);
      war.value = discs ? gap / discs : gap;
      war.gap = gap;
      results[war.won].kala.yuddha += war.value;
      results[war.lost].kala.yuddha -= war.value;
      [[war.won, war.lost, true], [war.lost, war.won, false]].forEach(function (side) {
        var me = results[side[0]];
        (me.war || (me.war = [])).push({
          against: side[1], won: side[2], value: war.value,
          separation: war.separation
        });
      });
    });

    GRAHAS.forEach(function (graha) {
      var x = results[graha];
      x.kala.total += x.kala.yuddha;
      /*
       * The figure is still computed and still shown for the luminaries, since
       * chapter 28 wants it. It is only kept out of this sum, where it would
       * count the Sun's ayana bala or the Moon's paksha bala a second time.
       */
      var counted = luminaryCheshta === LUMINARY_CHESHTA.COUNTED ||
        (graha !== 'Sun' && graha !== 'Moon');
      x.cheshtaCounted = counted;
      x.totalShashtiamsa = x.sthana.total + x.dig + x.kala.total +
        (counted ? x.cheshta : 0) + x.naisargika + x.drik;
      x.rupas = x.totalShashtiamsa / 60;
      x.required = REQUIRED_RUPAS[graha];
      x.ratio = x.rupas / x.required;
      x.strong = x.rupas >= x.required;
    });

    // Rank by how far each clears its own minimum, not by raw total: the
    // minimums differ, so comparing totals would flatter the Sun and punish
    // Mercury for no reason but the yardstick.
    var ranked = GRAHAS.slice().sort(function (a, b) { return results[b].ratio - results[a].ratio; });
    return { grahas: results, ranking: ranked, wars: wars, sunrise: sunrise, sunset: sunset };
  }

  /*
   * The lords of the astrological year and month, from the ahargana.
   *
   * These are not solar periods, and reading them as such is the natural
   * mistake - this code computed the Sun's ingress into Aries and into the
   * current sign for a long time, which is a different quantity that happens to
   * sound like the same one. Raman is blunt at section 59: "The Hindus, for
   * astrological purposes, consider a year and month of 360 and 30 days
   * respectively. They are neither solar, nor lunar, nor luni-solar."
   *
   * So both are pure arithmetic on days elapsed since Creation. A 360-day year
   * advances its opening weekday by 3 each time and a 30-day month by 2, which
   * is where the multipliers come from; the +1 makes the count inclusive, and
   * the remainder is counted from Sunday.
   *
   * Parashara's method, in Santhanam's note to ch.27 v.13, is the same
   * arithmetic to the letter, and his worked example for 1 June 1984 and
   * Raman's for 16 October 1918 both come out right from either epoch.
   */
  function lordFromRemainder(remainder) {
    return WEEKDAY_LORDS[((remainder % 7) + 6) % 7];   // remainder 1 is Sunday
  }

  function abdaLord(ahargana) {
    return lordFromRemainder((Math.floor(ahargana / 360) * 3 + 1) % 7);
  }

  function masaLord(ahargana) {
    return lordFromRemainder((Math.floor(ahargana / 30) * 2 + 1) % 7);
  }

  /*
   * How long a hora is. The authorities are unanimous and say the same thing
   * three different ways.
   *
   *   Raman section 69: "A hora is equal to 1/24th part of a day."
   *   Santhanam, note to ch.27 v.13: "Each day from sunrise to sunrise is
   *     divided into 24 equal parts of one hour or 2.5 Ghatika."
   *   Charak, citing Aryabhata: "There are 24 Horas in a day, each Hora being
   *     (approximately!) equivalent to an hour."
   *
   * So 'equal' is the only reading with a text behind it, and it is the
   * default. 'seasonal' divides the daylight into twelve and the night into
   * twelve, which is the older planetary-hour scheme and is what some software
   * does; no source consulted here asks for it in this bala. It is offered so
   * that a hora lord differing for that reason can be recognised rather than
   * mistaken for an error, which is exactly what happened on one chart checked
   * against Drik Panchang.
   */
  var HORA_LENGTH = { EQUAL: 'equal', SEASONAL: 'seasonal' };

  // Hora lords step by two each hour through the weekday order.
  var CHALDEAN = ['Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon'];

  function horaLord(jd, span, varaLord, length) {
    if (!span || span.sunrise === null) return null;
    var index;
    if (length === HORA_LENGTH.SEASONAL && span.sunset !== null &&
        span.nextSunrise !== null) {
      if (jd < span.sunset) {
        var dayHora = (span.sunset - span.sunrise) / 12;
        index = Math.min(11, Math.max(0, Math.floor((jd - span.sunrise) / dayHora)));
      } else {
        var nightHora = (span.nextSunrise - span.sunset) / 12;
        index = 12 + Math.min(11, Math.max(0,
          Math.floor((jd - span.sunset) / nightHora)));
      }
    } else {
      var elapsed = (jd - span.sunrise) * 24;
      if (elapsed < 0) elapsed += 24;
      index = Math.floor(elapsed);
    }
    var start = WEEKDAY_LORDS.indexOf(varaLord);
    var from = CHALDEAN.indexOf(WEEKDAY_LORDS[start < 0 ? 0 : start]);
    return CHALDEAN[(from + index) % 7];
  }

  return {
    compute: compute,
    // Exported only so Raman's Example 33 can be checked against it directly.
    // The constants in it were wrong for a long time and nothing caught it,
    // because every test went through a total that the error was too small to
    // move past its tolerance.
    ayanaBala: ayanaBala,
    // Exported so Raman's Examples 54 and 55 can be run against it directly.
    // It takes a map of {graha: {longitude}} and a map of {graha: boolean}, so
    // his Standard Horoscope can be fed in as printed without casting a chart.
    drikBala: drikBala,
    // Exported for Raman's Examples 49-51, as drikBala is for 54-55.
    chestaKendraFrom: chestaKendraFrom,
    MOON_PAKSHA: MOON_PAKSHA,
    NAT_CLOCK: NAT_CLOCK,
    MEAN_SOURCE: MEAN_SOURCE,
    LUMINARY_RULE: LUMINARY_RULE,
    LUMINARY_CHESHTA: LUMINARY_CHESHTA,
    HORA_LENGTH: HORA_LENGTH,
    KRANTI: KRANTI, AYANA_CONSTANT: AYANA_CONSTANT,
    CHESHTA: CHESHTA, MOTION_VALUE: MOTION_VALUE,
    // Exported for the worked examples in Raman s60-61 and BPHS ch.27 v.13.
    abdaLord: abdaLord, masaLord: masaLord,
    GRAHAS: GRAHAS,
    SAPTAVARGAJA_VALUES: RELATION_VALUE,
    REQUIRED_RUPAS: REQUIRED_RUPAS,
    NAISARGIKA: NAISARGIKA
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Shadbala;
