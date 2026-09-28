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
      if (lord === graha) {
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
        var dignity = division === 1
          ? Astro.dignityOf(graha, position.sign, position.degreeInSign) : null;
        relation = dignity === 'Mooltrikona' ? 'moolatrikona' : 'own';
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

  /** Also undoubled; see the note on paksha bala above. */
  function ayanaBala(graha, dec) {
    var north = NORTH_STRONG.indexOf(graha) >= 0;
    var effective = graha === 'Mercury' ? Math.abs(dec) : (north ? dec : -dec);
    return 60 * (23.45 + effective) / 46.9;
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
  function chestaKendra(graha, longitude, T, ayanamsa) {
    var key = MEAN_KEY[graha];
    if (!key) return 0;
    var sidereal = function (tropical) { return Astro.norm360(tropical - ayanamsa); };
    var sunMean = sidereal(Astro.sunMeanLongitude(T));
    var own = sidereal(Astro.meanLongitude(key, T));
    var kendra = INNER.indexOf(graha) >= 0
      ? Astro.norm360(own - midpoint(longitude, sunMean))
      : Astro.norm360(sunMean - midpoint(longitude, own));
    return kendra > 180 ? 360 - kendra : kendra;
  }

  function cheshtaBala(graha, longitude, T, ayanamsa, ayana, paksha) {
    // The luminaries never retrograde, so they borrow another strength.
    if (graha === 'Sun') return ayana;
    if (graha === 'Moon') return paksha;
    return chestaKendra(graha, longitude, T, ayanamsa) / 3;
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
  function compute(chart, place) {
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
    var benefics = Astro.naturalBenefics(chart);

    /*
     * Sundial time at the birthplace, not clock time. Raman section 48 asks for
     * the local apparent noon by name, and a timezone is the wrong clock twice
     * over: it is an administrative band, and it gives mean time rather than
     * apparent. Honolulu is half an hour of time west of its own zone meridian,
     * which is three virupas of nata bala.
     */
    var localHours = Astro.localApparentTime(jd, place.longitude);

    var results = {};
    GRAHAS.forEach(function (graha) {
      var p = positions[graha];
      var tropical = p.longitude + chart.ayanamsa;
      var latitude = graha === 'Moon' ? Astro.moonLatitude(T) : 0;
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

      var paksha = pakshaBala(elongation, benefics[graha]);
      var ayana = ayanaBala(graha, dec);
      var kala = {
        nathonnatha: nathonnathaBala(graha, localHours),
        paksha: graha === 'Moon' ? paksha * 2 : paksha,   // doubled for the Moon
        tribhaga: (sunrise && sunset && nextSunrise)
          ? tribhagaBala(graha, jd, sunrise, sunset, nextSunrise) : 0,
        // The year's and the month's lords, taken as the weekday lords of the
        // days those solar periods began.
        abda: WEEKDAY_LORDS[solarPeriodWeekday(jd, 360)] === graha ? 15 : 0,
        masa: WEEKDAY_LORDS[solarPeriodWeekday(jd, 30)] === graha ? 30 : 0,
        vara: chart.panchang.varaLord === graha ? 45 : 0,
        hora: horaLord(jd, sunrise, chart.panchang.varaLord) === graha ? 60 : 0,
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
      var cheshta = cheshtaBala(graha, p.longitude, T, chart.ayanamsa, ayana, paksha);
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
      x.totalShashtiamsa = x.sthana.total + x.dig + x.kala.total + x.cheshta +
        x.naisargika + x.drik;
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

  /** Weekday index of the day a solar period of `arc` degrees began. */
  function solarPeriodWeekday(jd, arc) {
    var T = (jd + Astro.deltaT(jd) / 86400 - 2451545.0) / 36525;
    var sunNow = Astro.norm360(Astro.apparentLongitude('sun', T, Astro.nutation(T)).lon -
      Astro.ayanamsa(T, 'lahiri'));
    var into = arc === 360 ? sunNow : sunNow % arc;
    // The Sun covers close to a degree a day, so stepping back that many days
    // lands within a day of the boundary; then walk to the exact crossing.
    var guess = jd - into / 0.9856;
    for (var i = 0; i < 40; i++) {
      var Tg = (guess + Astro.deltaT(guess) / 86400 - 2451545.0) / 36525;
      var lon = Astro.norm360(Astro.apparentLongitude('sun', Tg, Astro.nutation(Tg)).lon -
        Astro.ayanamsa(Tg, 'lahiri'));
      var excess = arc === 360 ? lon : lon % arc;
      if (excess > arc / 2) excess -= arc;
      if (Math.abs(excess) < 1e-6) break;
      guess -= excess / 0.9856;
    }
    return Math.floor(guess + 1.5) % 7;
  }

  /** Which graha rules the hour; hours run from sunrise in the weekday order. */
  function horaLord(jd, sunrise, varaLord) {
    if (!sunrise) return null;
    var elapsed = (jd - sunrise) * 24;
    if (elapsed < 0) elapsed += 24;
    var start = WEEKDAY_LORDS.indexOf(varaLord);
    // Hora lords step by two each hour through the weekday order.
    var CHALDEAN = ['Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon'];
    var from = CHALDEAN.indexOf(WEEKDAY_LORDS[start < 0 ? 0 : start]);
    return CHALDEAN[(from + Math.floor(elapsed)) % 7];
  }

  return {
    compute: compute,
    GRAHAS: GRAHAS,
    SAPTAVARGAJA_VALUES: RELATION_VALUE,
    REQUIRED_RUPAS: REQUIRED_RUPAS,
    NAISARGIKA: NAISARGIKA
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Shadbala;
