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

  // Mean daily motion, and the deepest retrograde each graha reaches, degrees.
  var MOTION = {
    Sun: { mean: 0.9856, slowest: 0.9530, fastest: 1.0200 },
    Moon: { mean: 13.176, slowest: 11.76, fastest: 15.39 },
    Mars: { mean: 0.5240, slowest: -0.4010, fastest: 0.7920 },
    Mercury: { mean: 4.0923, slowest: -1.3900, fastest: 2.2020 },
    Jupiter: { mean: 0.0831, slowest: -0.1360, fastest: 0.2420 },
    Venus: { mean: 1.6021, slowest: -0.6350, fastest: 1.2580 },
    Saturn: { mean: 0.0335, slowest: -0.0800, fastest: 0.1340 }
  };

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
   * Santhanam's translation reads "45 Virupas, in own Rashi 30 Virupas, extreme
   * friend's Rashi 20 Virupas, friend's Rashi 15 Virupas, neutral's Rashi 10
   * Virupas, enemy's Rashi 4 Virupas and in extreme enemy's Rashi 2 Virupas", and
   * Saravali gives the same seven figures independently. Much of the web, and
   * several calculators, instead use a halving series: 45, 30, 22.5, 15, 7.5,
   * 3.75, 1.875. That series is attributed to the same verses but traces only to
   * secondary compilations, and no worked example in Santhanam settles it.
   *
   * The choice is not cosmetic. Measured across 480 sample births it moves about
   * 1.9% of strong/weak verdicts and reorders the grahas by strength in roughly a
   * third of charts, so it cannot be left implicit. Santhanam's reading is used
   * here, being the one in the standard translation of the source.
   */
  var RELATION_VALUE = {
    moolatrikona: 45, own: 30, adhimitra: 20, mitra: 15,
    sama: 10, shatru: 4, adhishatru: 2
  };

  function saptavargajaBala(graha, chart, positionsD1) {
    var planet = chart.planets.filter(function (p) { return p.name === graha; })[0];
    var total = 0, detail = [];
    SAPTAVARGA.forEach(function (division) {
      var position = Astro.vargaPosition(planet.longitude, division);
      var lord = Astro.SIGN_LORDS[position.sign];
      var relation;
      if (lord === graha) {
        var dignity = Astro.dignityOf(graha, position.sign, position.degreeInSign);
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

  function cheshtaBala(graha, speed, ayana, paksha) {
    // The luminaries never retrograde, so they borrow another strength: the Sun
    // its ayana bala, the Moon its paksha bala.
    if (graha === 'Sun') return ayana;
    if (graha === 'Moon') return paksha;
    var motion = MOTION[graha];
    var span = motion.fastest - motion.slowest;
    var fromFastest = (motion.fastest - speed) / span;
    return Math.max(0, Math.min(1, fromFastest)) * 60;
  }

  /* -------------------------------------------------------- yuddha bala */

  /*
   * Planetary war. Chapter 27 verse 20: "Should there be a war between the
   * starry planets, the difference between the Shad-balas of the two should be
   * added to the victor's Shad-bala and deducted from the Shad-bala of the
   * vanquished."
   *
   * Three things the text leaves to be settled, and what is settled here.
   *
   * WHO. "Starry planets", which Santhanam glosses as two planets from Mars to
   * Saturn, and chapter 79 verse 9 names as the same five. The luminaries are
   * out. His note in chapter 7 says "the luminaries do enter into war", but that
   * is a remark about houses rather than about this reckoning, and C. G. Rajan,
   * whom he endorses there, excludes them outright.
   *
   * HOW CLOSE. Chapter 79 verse 9 says within one degree, which is the figure
   * used. Two other readings circulate: the same whole degree, and Rajan's
   * identical longitudes to the arcminute. The choice is not cosmetic and the
   * arcminute reading is not usable - across 1800 sample births a war at one
   * degree occurs in 7.9% of charts, at the same whole degree in 4.6%, and to
   * the arcminute in none at all.
   *
   * WHO WINS. Chapter 79 verse 9: Venus conquers whether it stands north or
   * south, and among the other four the northern one conquers and the southern
   * is defeated. Rajan's rule, which Santhanam prefers "for practical purposes",
   * is that the higher latitude wins, and the two agree wherever both grahas lie
   * on the same side. The older "lesser longitude wins" reading is the one
   * Santhanam introduces as what we are "normally taught" before setting out the
   * latitude account at length, so it is not the one followed.
   *
   * This is a large correction and it is meant to be. Over the same 1800 births
   * the median swing is 83 virupas and the worst 272, which is 4.5 rupas - more
   * than any graha's whole requirement - and it moves 94 strong/weak verdicts.
   * Calculators that quietly drop yuddha bala will not reconcile with this one
   * on the 8% of charts that have a war.
   */
  var WAR_ORB = 1;
  var WARRING = [['Mars', 'mars'], ['Mercury', 'mercury'], ['Jupiter', 'jupiter'],
    ['Venus', 'venus'], ['Saturn', 'saturn']];

  /**
   * Every war in the chart, each as {won, lost, separation, latitudes}.
   *
   * Latitude is asked of the engine by Julian day rather than read off the
   * chart: a chart assembled from the stored ephemeris carries longitudes only.
   */
  function planetaryWars(chart, positions, T) {
    var found = [];
    for (var i = 0; i < WARRING.length; i++) {
      for (var j = i + 1; j < WARRING.length; j++) {
        var a = positions[WARRING[i][0]], b = positions[WARRING[j][0]];
        if (!a || !b) continue;
        var separation = Math.abs(Astro.norm360(a.longitude - b.longitude + 180) - 180);
        if (separation >= WAR_ORB) continue;
        var la = Astro.eclipticLatitude(WARRING[i][1], T);
        var lb = Astro.eclipticLatitude(WARRING[j][1], T);
        var aWins = a.name === 'Venus' ? true
          : b.name === 'Venus' ? false
          : la > lb;                       // the more northerly conquers
        found.push({
          won: aWins ? a.name : b.name,
          lost: aWins ? b.name : a.name,
          separation: separation,
          latitudes: aWins ? [la, lb] : [lb, la]
        });
      }
    }
    return found;
  }

  /* --------------------------------------------------------- drik bala */

  // Quarter on the 3rd and 10th, half on the 5th and 9th, three-quarters on the
  // 4th and 8th, full on the 7th, and each graha's own aspects at full.
  var ASPECT_BY_HOUSE = { 3: 15, 10: 15, 5: 30, 9: 30, 4: 45, 8: 45, 7: 60 };
  var SPECIAL_ASPECTS = { Mars: [4, 8], Jupiter: [5, 9], Saturn: [3, 10] };

  function drikBala(graha, positions, benefics) {
    var total = 0;
    GRAHAS.forEach(function (other) {
      if (other === graha) return;
      var apart = ((positions[graha].sign - positions[other].sign) % 12 + 12) % 12 + 1;
      var strength = ASPECT_BY_HOUSE[apart] || 0;
      if ((SPECIAL_ASPECTS[other] || []).indexOf(apart) >= 0) strength = 60;
      if (!strength) return;
      total += benefics[other] ? strength : -strength;
    });
    return total / 4;
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

    var localHours = ((jd + (place.tzOffsetMinutes || 0) / 1440) + 0.5) % 1 * 24;

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
      kala.total = kala.nathonnatha + kala.paksha + kala.tribhaga + kala.abda +
        kala.masa + kala.vara + kala.hora + kala.ayana;

      var dig = digBala(graha, p.longitude, chart.ascendant.longitude, chart.midheaven.longitude);
      var cheshta = cheshtaBala(graha, p.speed, ayana, paksha);
      var naisargika = NAISARGIKA[graha];
      var drik = drikBala(graha, positions, benefics);

      /*
       * The six shares, before any war is settled. Yuddha bala is the difference
       * between two of these totals, so it cannot be one of them without the
       * sum defining itself: the six are closed first and the war applied to
       * what they come to.
       */
      var sixShares = sthana.total + dig + kala.total + cheshta + naisargika + drik;
      results[graha] = {
        sthana: sthana,
        saptavargajaDetail: saptavargaja.detail,
        dig: dig,
        kala: kala,
        cheshta: cheshta,
        naisargika: naisargika,
        drik: drik,
        sixShares: sixShares,
        yuddha: 0,
        war: null,
        benefic: benefics[graha]
      };
    });

    /*
     * The war, and then the totals. Verse 20 adds the difference to the victor
     * and deducts it from the vanquished, so a graha in two wars carries both.
     */
    var wars = planetaryWars(chart, positions, T);
    wars.forEach(function (war) {
      var gap = Math.abs(results[war.won].sixShares - results[war.lost].sixShares);
      results[war.won].yuddha += gap;
      results[war.lost].yuddha -= gap;
      [['won', war.lost], ['lost', war.won]].forEach(function (side) {
        var me = results[side[0] === 'won' ? war.won : war.lost];
        (me.war || (me.war = [])).push({
          against: side[1], won: side[0] === 'won', gap: gap,
          separation: war.separation
        });
      });
    });

    GRAHAS.forEach(function (graha) {
      var x = results[graha];
      x.totalShashtiamsa = x.sixShares + x.yuddha;
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
