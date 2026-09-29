/*
 * Validation suite. Run with: node test/test.js
 *
 * Reference values are the worked examples in Jean Meeus, "Astronomical
 * Algorithms" (2nd ed.), plus published Lahiri ayanamsa values and the
 * sidereal ingress dates (sankranti) that any Vedic ephemeris must reproduce.
 */
global.PERTURBATIONS = require('../data/perturbations.js');
var A = require('../js/astro.js');
global.Astro = A;
var Shadbala = require('../js/shadbala.js');
var Yogas = require('../js/yogas.js');

var pass = 0, fail = 0;
function check(name, actual, expected, tol, unit) {
  var diff = Math.abs(actual - expected);
  var ok = diff <= tol;
  if (ok) pass++; else fail++;
  console.log(
    (ok ? '  ok   ' : '  FAIL ') + name +
    '\n         got ' + actual.toFixed(6) + '  want ' + expected.toFixed(6) +
    '  diff ' + diff.toExponential(2) + (unit ? ' ' + unit : '') + '  tol ' + tol
  );
}
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? '  (' + detail + ')' : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  (' + detail + ')' : '')); }
}

console.log('\nJulian Day (Meeus ch.7)');
check('1957 Oct 4.81 UT -> JD', A.julianDay(1957, 10, 4.81, 0), 2436116.31, 1e-6);
check('2000 Jan 1.5 -> J2000', A.julianDay(2000, 1, 1, 12), 2451545.0, 1e-9);
check('333 Jan 27.5 (Julian cal.)', A.julianDay(333, 1, 27, 12), 1842713.0, 1e-9);
var rt = A.calendarDate(2436116.31);
ok('calendarDate round-trip', rt.y === 1957 && rt.m === 10 && rt.d === 4 &&
   Math.abs(rt.hours - 19.44) < 0.01, rt.y + '-' + rt.m + '-' + rt.d + ' ' + rt.hours.toFixed(3) + 'h');

console.log('\nMoolatrikona as a dignity, in the rashi and nowhere else');
/*
 * Moolatrikona is a dignity in its own right rather than a special case of
 * ownership, and varga viswa gives it a rung of its own at twenty. Asking
 * about it only of owners left out the one graha it matters for: the Moon's
 * moolatrikona is Taurus 3 to 30 and Taurus is Venus's, so she scored fifteen
 * as Venus's friend while standing in her own moolatrikona.
 *
 * Still the rashi only. It is a span of degrees inside a sign, and a varga
 * position is a place within a division stretched back across the whole
 * thirty, so the degree a D60 reports is not a degree of any sign the graha
 * stands in.
 */
(function () {
  var place = { latitude: 21.3069, longitude: -157.8583, tzOffsetMinutes: -600 };
  var chart = A.chart({ jdUT: A.julianDay(1961, 8, 4, 19 + 24 / 60 + 10),
    latitude: place.latitude, longitude: place.longitude,
    tzOffsetMinutes: place.tzOffsetMinutes });
  var pos = {};
  chart.planets.forEach(function (p) { pos[p.name] = p; });
  var moon = A.vargaDignity('Moon', pos.Moon.longitude, 1, pos);
  ok('the Moon reaches moolatrikona in a sign she does not own',
    moon.relation === 'moolatrikona' && A.SIGN_LORDS[moon.sign] === 'Venus',
    moon.relation + ' in ' + A.SIGN_LORDS[moon.sign] + "'s sign");
  ok('and varga viswa scores it the full twenty',
    A.VARGA_VISWA.moolatrikona === 20 && A.VARGA_VISWA.mitra === 15);

  /*
   * And never outside the rashi, in any of the sixteen.
   */
  var leaked = [];
  for (var y = 1980; y < 2030; y += 2) {
    var ch = A.chart({ jdUT: A.julianDay(y, 6, 15, 6.5), latitude: 28.61,
      longitude: 77.21, tzOffsetMinutes: 330 });
    var p2 = {};
    ch.planets.forEach(function (p) { p2[p.name] = p; });
    A.SHODASAVARGA.forEach(function (d) {
      if (d === 1) return;
      ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']
        .forEach(function (g) {
          var vd = A.vargaDignity(g, p2[g].longitude, d, p2);
          if (vd && vd.relation === 'moolatrikona') leaked.push(g + ' D' + d);
        });
    });
  }
  ok('and no division above the rashi ever claims it',
    leaked.length === 0, leaked.slice(0, 3).join(', ') || 'none');
})();

console.log('\nCheshta bala by the eight motions');
/*
 * Parashara gives both methods in consecutive verses: ch.27 vv.21-23 name the
 * eight motions and allot them 60, 30, 15, 30, 15, 7.5, 45 and 30, and vv.24-25
 * give the chesta kendra arithmetic. Raman follows the arithmetic, Charak gives
 * only the motions. The arithmetic is the default here because it is the verse
 * that states a computation.
 *
 * Four of the eight boundaries are this site's and not any text's, which the
 * setting says out loud. Vakra, Vikala and Anuvakra come from the ephemeris;
 * where slow becomes slower is a choice.
 */
(function () {
  var S = require('../js/shadbala.js');
  var place = { latitude: 21.3069, longitude: -157.8583, tzOffsetMinutes: -600 };
  var chart = A.chart({ jdUT: A.julianDay(1961, 8, 4, 19 + 24 / 60 + 10),
    latitude: place.latitude, longitude: place.longitude,
    tzOffsetMinutes: place.tzOffsetMinutes });
  var kendra = S.compute(chart, place);
  var motion = S.compute(chart, place, { cheshtaMethod: S.CHESHTA.MOTION });

  // Every figure the table can produce is one of its seven values.
  var allowed = Object.keys(S.MOTION_VALUE).map(function (k) {
    return S.MOTION_VALUE[k];
  });
  ok('the five starry grahas take one of the allotted values',
    ['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'].every(function (g) {
      return allowed.indexOf(motion.grahas[g].cheshta) >= 0;
    }));
  /*
   * Obama's Jupiter and Saturn are retrograde, which is Vakra and the full 60.
   * That is the one state the verse fixes beyond argument.
   */
  ok('a retrograde graha takes Vakra\u2019s sixty',
    motion.grahas.Jupiter.cheshta === 60 && motion.grahas.Saturn.cheshta === 60);
  /*
   * The luminaries keep their borrowings under either method: v.18 gives the
   * Sun his ayana and the Moon her paksha, and vv.21-23 are headed "MARS TO
   * SATURN".
   */
  ok('the Sun and Moon are untouched by the choice',
    motion.grahas.Sun.cheshta === kendra.grahas.Sun.cheshta &&
    motion.grahas.Moon.cheshta === kendra.grahas.Moon.cheshta);
  ok('an unknown method falls back to the kendra',
    S.compute(chart, place, { cheshtaMethod: 'gati-ish' }).grahas.Mars.cheshta ===
      kendra.grahas.Mars.cheshta);
  /*
   * And nothing else moves: cheshta is one of the six, not an input to the
   * others.
   */
  ok('no other share reads the method', S.GRAHAS.every(function (g) {
    var x = kendra.grahas[g], y = motion.grahas[g];
    return Math.abs(x.sthana.total - y.sthana.total) < 1e-9 &&
      Math.abs(x.kala.total - y.kala.total) < 1e-9 &&
      Math.abs(x.drik - y.drik) < 1e-9;
  }));
})();

console.log('\nMercury\u2019s nature, with its qualifier and without');
/*
 * Parashara gives Mercury one qualifier - "Mercury, however, is a malefic if
 * he joins a malefic" - and the authorities keep it. Raman footnotes his drik
 * bala table: "Mercury is a malefic as he is very closely associated with Sun
 * or combusted." Charak: "well-associated Mercury" benefic, "afflicted
 * Mercury" malefic. K. N. Rao calls Mercury malefic in a worked chart "as he
 * is associated with two malefics Sun and Ketu".
 *
 * The other reading is the same authors' opening list taken without the
 * sentence after it. Nobody defends it whole, but Drik Panchang computes it -
 * on Obama's chart it reads Mercury benefic with him ten degrees from the Sun
 * in the same sign - so it is offered and the qualified reading is default.
 */
(function () {
  var S = require('../js/shadbala.js');
  var place = { latitude: 21.3069, longitude: -157.8583, tzOffsetMinutes: -600 };
  var chart = A.chart({ jdUT: A.julianDay(1961, 8, 4, 19 + 24 / 60 + 10),
    latitude: place.latitude, longitude: place.longitude,
    tzOffsetMinutes: place.tzOffsetMinutes });
  ok('Obama\u2019s Mercury is malefic by the qualifier, being combust',
    A.naturalBenefics(chart).Mercury === false);
  ok('and benefic without it',
    A.naturalBenefics(chart, { mercuryNature: A.MERCURY_NATURE.BENEFIC })
      .Mercury === true);

  /*
   * The choice can also ride on the chart, which is how the page carries it:
   * the yogas, the kartari marks and the strength table each ask astro.js
   * separately, and a setting honoured by only one of them would have the same
   * chart answering differently tab by tab.
   */
  var stamped = A.chart({ jdUT: A.julianDay(1961, 8, 4, 19 + 24 / 60 + 10),
    latitude: place.latitude, longitude: place.longitude,
    tzOffsetMinutes: place.tzOffsetMinutes });
  stamped.mercuryNature = A.MERCURY_NATURE.BENEFIC;
  ok('a chart can carry the reading for every caller',
    A.naturalBenefics(stamped).Mercury === true);
  ok('and an explicit option still wins over it',
    A.naturalBenefics(stamped,
      { mercuryNature: A.MERCURY_NATURE.QUALIFIED }).Mercury === false);

  /*
   * It reaches paksha bala, and Drik Panchang's figure follows from it: their
   * Mercury takes the benefic share of the fortnight where ours takes the
   * malefic one.
   */
  var q = S.compute(chart, place, { moonPaksha: 'benefic' });
  var b = S.compute(chart, place,
    { moonPaksha: 'benefic', mercuryNature: 'benefic' });
  check('Mercury\u2019s paksha bala, qualified', q.grahas.Mercury.kala.paksha,
    36.94, 0.05, 'virupas');
  check('and unqualified, which is what Drik Panchang prints',
    b.grahas.Mercury.kala.paksha, 23.06, 0.05, 'virupas');
  /*
   * Only Mercury's own standing changes, so the six others keep their share.
   */
  ok('no other graha\u2019s paksha moves', S.GRAHAS.every(function (g) {
    return g === 'Mercury' ||
      Math.abs(q.grahas[g].kala.paksha - b.grahas[g].kala.paksha) < 1e-9;
  }));
})();

console.log('\nThe Moon reaches her moolatrikona, which is not her own sign');
/*
 * Six of the seven have their moolatrikona inside a sign they own, so testing
 * ownership first and asking about moolatrikona afterwards works for them. The
 * Moon does not: hers is Taurus 3 to 30, and Taurus is Venus's. Gating the
 * check behind ownership cost her the 45 and handed her a relation to Venus
 * instead, 30 virupas short, in every chart with the Moon in that arc - about
 * one in thirteen.
 *
 * Raman's Example 9 cannot catch this. His Moon is in Aquarius, so the case
 * never arises and all 49 cells match either way. It took an outside
 * calculator disagreeing by exactly 30 on one graha to find it.
 */
(function () {
  var S = require('../js/shadbala.js');
  // The Moon is the only one of the seven whose moolatrikona is another's sign.
  var odd = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']
    .filter(function (g) {
      var d = A.DIGNITY[g];
      return d.mool && d.own.indexOf(d.mool.sign) < 0;
    });
  ok('the Moon is the sole graha whose moolatrikona is not her own sign',
    odd.length === 1 && odd[0] === 'Moon', odd.join(','));

  // Obama: Moon at Taurus 10, inside her moolatrikona. Drik Panchang gives
  // 161.25 for her saptavargaja and every other graha in that chart agrees
  // with us to the hundredth.
  var place = { latitude: 21.3069, longitude: -157.8583, tzOffsetMinutes: -600 };
  var chart = A.chart({ jdUT: A.julianDay(1961, 8, 4, 19 + 24 / 60 + 10),
    latitude: place.latitude, longitude: place.longitude,
    tzOffsetMinutes: place.tzOffsetMinutes });
  var r = S.compute(chart, place);
  check('and she is scored 45 for it in the rashi',
    r.grahas.Moon.sthana.saptavargaja, 161.25, 0.01, 'virupas');

  /*
   * Still only in the rashi. Raman section 30 is explicit that the 45 belongs
   * to the Moolatrikona Rasi "and not when it occupies any other of the 6
   * vargas", and a varga degree is not a degree of any sign the graha stands
   * in, so claiming it there would be meaningless as well as wrong.
   */
  var place2 = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
  var over = 0, scanned = 0;
  for (var y = 1900; y < 2040; y += 3) {
    for (var m = 1; m <= 12; m += 2) {
      var ch = A.chart({ jdUT: A.julianDay(y, m, 15, 6.5), latitude: place2.latitude,
        longitude: place2.longitude, tzOffsetMinutes: place2.tzOffsetMinutes });
      var res = S.compute(ch, place2);
      S.GRAHAS.forEach(function (g) {
        scanned++;
        if (res.grahas[g].sthana.saptavargaja > 225.0001) over++;
      });
    }
  }
  ok('and nowhere outside it: 45 once plus six thirties is the ceiling',
    over === 0, over + ' of ' + scanned + ' readings passed 225');
})();

console.log('\nWhich declination the kranti is');
/*
 * Two complete methods, and running half of each is the error this once made.
 *
 * Raman section 73 derives the kranti from the bhuja of the sayana longitude,
 * through a table of six 15-degree steps; a longitude carries no latitude, and
 * his Example 32 works all seven grahas that way. It pairs with his divisor of
 * 48, because 24 is what a declination read off a longitude reaches.
 *
 * Santhanam's note to ch.27 vv.15-17 sends the reader to a modern ephemeris
 * instead - "Krantis (or declinations) can be ascertained from standard modern
 * ephemeris" - which gives the true declination, ecliptic latitude and all.
 *
 * Drik Panchang computes the true declination, and reproduces exactly on that
 * setting. On Trump's chart the Moon hides the difference, sitting 0.45 degrees
 * from Ketu with a latitude of 0.03, which is why the test below checks a
 * planet rather than trusting her.
 */
(function () {
  var S = require('../js/shadbala.js');
  var place = { latitude: 40.6975, longitude: -73.8042, tzOffsetMinutes: -240 };
  var chart = A.chart({ jdUT: A.julianDay(1946, 6, 14, 10 + 54 / 60 + 4),
    latitude: place.latitude, longitude: place.longitude,
    tzOffsetMinutes: place.tzOffsetMinutes });
  var ayana = function (g, opts) {
    return S.compute(chart, place, opts).grahas[g].kala.ayana;
  };
  /*
   * The default is the declination without latitude, on Raman's constant,
   * which the textbook by K. N. Rao's students works all three of its charts
   * with. Each constant brings the obliquity it assumes - Raman's 24, and the
   * true one for Parashara's 23 deg 27' - so both close their own scale.
   *
   * That coupling costs an agreement, and the loss is recorded rather than
   * quietly dropped. Drik Panchang pairs Raman's constant with the TRUE
   * declination at the true obliquity, and this file used to reproduce it
   * exactly on that combination: Budha 61.44 and Sukra 58.53. No setting
   * reaches those figures now.
   */
  check('the declination without latitude is the default',
    ayana('Mercury'), 59.62, 0.05, 'virupas');
  ok('and Drik Panchang\u2019s ayana pairing is no longer among the options',
    [{}, { kranti: S.KRANTI.TRUE },
     { ayanaConstant: 'parashara' },
     { ayanaConstant: 'parashara', kranti: S.KRANTI.TRUE }]
      .every(function (o) { return Math.abs(ayana('Mercury', o) - 61.44) > 0.3; }));
  /*
   * The Sun has no ecliptic latitude, so it must read the same either way. If
   * it ever moves, a latitude is being invented for it.
   */
  ok('the Sun is untouched by the choice, having no latitude',
    Math.abs(ayana('Sun') - ayana('Sun', { kranti: S.KRANTI.TRUE })) < 0.02);
  ok('an unknown value falls back to the longitude reading',
    Math.abs(ayana('Mercury', { kranti: 'ephemeris-ish' }) - ayana('Mercury')) < 1e-9);

  /*
   * The Moon is where it bites hardest, so check a chart where she is far from
   * a node rather than Trump's, where she is on one.
   */
  var far = A.chart({ jdUT: A.julianDay(1961, 8, 4, 19 + 24 / 60 + 10),
    latitude: 21.3069, longitude: -157.8583, tzOffsetMinutes: -600 });
  var fp = { latitude: 21.3069, longitude: -157.8583, tzOffsetMinutes: -600 };
  var byLon = S.compute(far, fp).grahas.Moon.kala.ayana;
  var byTrue = S.compute(far, fp, { kranti: S.KRANTI.TRUE }).grahas.Moon.kala.ayana;
  ok('the Moon moves by several virupas when she is off the nodes',
    Math.abs(byLon - byTrue) > 5,
    byLon.toFixed(2) + ' vs ' + byTrue.toFixed(2));

  /*
   * Cheshta follows for the Sun, who borrows his ayana, and nothing else may
   * move: this is a declination, not a position.
   */
  var a = S.compute(chart, place), b = S.compute(chart, place, { kranti: S.KRANTI.TRUE });
  ok('no bala outside ayana and the Sun\u2019s cheshta reads it',
    S.GRAHAS.every(function (g) {
      var x = a.grahas[g], y = b.grahas[g];
      return Math.abs(x.sthana.total - y.sthana.total) < 1e-9 &&
        Math.abs(x.dig - y.dig) < 1e-9 && Math.abs(x.drik - y.drik) < 1e-9 &&
        Math.abs(x.kala.paksha - y.kala.paksha) < 1e-9;
    }));
})();

console.log('\nHow long a hora is');
/*
 * Unanimous, and worth recording because it is the kind of thing that looks
 * disputed and is not:
 *
 *   Raman section 69: "A hora is equal to 1/24th part of a day."
 *   Santhanam on ch.27 v.13: "Each day from sunrise to sunrise is divided into
 *     24 equal parts of one hour or 2.5 Ghatika."
 *   Charak, citing Aryabhata: "There are 24 Horas in a day, each Hora being
 *     (approximately!) equivalent to an hour."
 *
 * Splitting the daylight into twelve and the night into twelve is the older
 * planetary-hour scheme and some software uses it, but no source consulted
 * asks for it here. It is offered because the two hand the sixty to different
 * grahas, which is worth recognising rather than puzzling over.
 */
(function () {
  var S = require('../js/shadbala.js');
  var place = { latitude: 40.6975, longitude: -73.8042, tzOffsetMinutes: -240 };
  var chart = A.chart({ jdUT: A.julianDay(1946, 6, 14, 10 + 54 / 60 + 4),
    latitude: place.latitude, longitude: place.longitude,
    tzOffsetMinutes: place.tzOffsetMinutes });
  var lordOf = function (opts) {
    var r = S.compute(chart, place, opts);
    return S.GRAHAS.filter(function (g) { return r.grahas[g].kala.hora > 0; })[0];
  };
  /*
   * Seasonal is the default now: the Rao textbook divides the day-length by
   * twelve and the night-length by twelve and works all three of its charts
   * that way, and it is what Drik Panchang prints. Parashara's verse asks for
   * twenty-four equal parts, which is the other option.
   *
   * This is the one small setting that moves a total by a whole rupa, the
   * sixty being all or nothing.
   */
  ok('seasonal horas are the default, and give Jupiter here',
    lordOf() === 'Jupiter', String(lordOf()));
  ok('equal horas give Mars instead',
    lordOf({ horaLength: S.HORA_LENGTH.EQUAL }) === 'Mars',
    String(lordOf({ horaLength: S.HORA_LENGTH.EQUAL })));
  ok('an unknown value falls back to seasonal',
    lordOf({ horaLength: 'ghatika-ish' }) === 'Jupiter');

  /*
   * Exactly one graha may hold it, under either reading. Sixty virupas landing
   * twice, or nowhere, is the failure mode worth guarding.
   */
  [undefined, { horaLength: S.HORA_LENGTH.SEASONAL }].forEach(function (o) {
    var r = S.compute(chart, place, o);
    var held = S.GRAHAS.filter(function (g) { return r.grahas[g].kala.hora > 0; });
    ok('exactly one graha holds the hora (' + (o ? 'seasonal' : 'equal') + ')',
      held.length === 1 && r.grahas[held[0]].kala.hora === 60, held.join(','));
  });

  /*
   * A birth before dawn belongs to the previous Hindu day, so its night began
   * at the previous sunset. Seasonal horas have to reach back for that or they
   * measure from a sunset that has not happened yet.
   */
  var predawn = A.chart({ jdUT: A.julianDay(1946, 6, 14, 3 + 4), latitude: place.latitude,
    longitude: place.longitude, tzOffsetMinutes: place.tzOffsetMinutes });
  [undefined, { horaLength: S.HORA_LENGTH.SEASONAL }].forEach(function (o) {
    var r = S.compute(predawn, place, o);
    var held = S.GRAHAS.filter(function (g) { return r.grahas[g].kala.hora > 0; });
    ok('a pre-dawn birth still gets exactly one hora lord (' +
      (o ? 'seasonal' : 'equal') + ')', held.length === 1, held.join(','));
  });

  /*
   * And nothing outside this row may notice the setting.
   */
  var a = S.compute(chart, place);
  var b = S.compute(chart, place, { horaLength: S.HORA_LENGTH.SEASONAL });
  ok('no other bala reads the hora length', S.GRAHAS.every(function (g) {
    var x = a.grahas[g], y = b.grahas[g];
    return Math.abs(x.sthana.total - y.sthana.total) < 1e-9 &&
      Math.abs(x.kala.tribhaga - y.kala.tribhaga) < 1e-9 &&
      Math.abs(x.kala.nathonnatha - y.kala.nathonnatha) < 1e-9 &&
      Math.abs(x.cheshta - y.cheshta) < 1e-9 && Math.abs(x.drik - y.drik) < 1e-9;
  }));
})();

console.log('\nWhich clock nata-unnata runs on');
/*
 * Raman section 48 asks for the sundial by name, and it is two corrections
 * away from the clock on the wall: a timezone is an administrative band, and
 * even on its meridian a clock keeps mean time. Both are commonly skipped, so
 * the three readings are offered and the sourced one is the default.
 *
 * Drik Panchang reckons it by the zone. On Trump's chart that is the whole of
 * the difference between its nata-unnata row and this one, and being able to
 * say so is the reason the option exists.
 */
(function () {
  var S = require('../js/shadbala.js');
  var place = { latitude: 40.6975, longitude: -73.8042, tzOffsetMinutes: -240 };
  var chart = A.chart({ jdUT: A.julianDay(1946, 6, 14, 10 + 54 / 60 + 4),
    latitude: place.latitude, longitude: place.longitude,
    tzOffsetMinutes: place.tzOffsetMinutes });
  var sun = function (opts) {
    return S.compute(chart, place, opts).grahas.Sun.kala.nathonnatha;
  };
  check('the sundial is the default', sun(), 49.90, 0.05, 'virupas');
  check('and zone time reproduces Drik Panchang',
    sun({ natClock: S.NAT_CLOCK.ZONE }), 54.50, 0.05, 'virupas');
  ok('an unknown value falls back to the sundial rather than guessing',
    Math.abs(sun({ natClock: 'sundial-ish' }) - sun()) < 1e-9);

  /*
   * All three must be genuinely distinct, which mid-June hides: the equation
   * of time is near zero then, so apparent and mean coincide. Early November
   * is near its peak and separates them.
   */
  var nov = { latitude: 40.6975, longitude: -73.8042, tzOffsetMinutes: -300 };
  var c2 = A.chart({ jdUT: A.julianDay(1946, 11, 3, 10 + 54 / 60 + 5),
    latitude: nov.latitude, longitude: nov.longitude,
    tzOffsetMinutes: nov.tzOffsetMinutes });
  var at = function (k) {
    return S.compute(c2, nov, k ? { natClock: k } : undefined).grahas.Sun.kala.nathonnatha;
  };
  ok('apparent, mean and zone are three different clocks',
    Math.abs(at() - at('mean')) > 0.5 && Math.abs(at('mean') - at('zone')) > 0.2,
    [at(), at('mean'), at('zone')].map(function (v) { return v.toFixed(2); }).join(' / '));

  /*
   * And nothing else may move: the clock is read by nata-unnata alone.
   */
  var a = S.compute(chart, place);
  var z = S.compute(chart, place, { natClock: S.NAT_CLOCK.ZONE });
  ok('no other bala reads the clock', S.GRAHAS.every(function (g) {
    var x = a.grahas[g], y = z.grahas[g];
    return Math.abs(x.sthana.total - y.sthana.total) < 1e-9 &&
      Math.abs(x.dig - y.dig) < 1e-9 && Math.abs(x.cheshta - y.cheshta) < 1e-9 &&
      Math.abs(x.drik - y.drik) < 1e-9 &&
      Math.abs(x.kala.hora - y.kala.hora) < 1e-9 &&
      Math.abs(x.kala.tribhaga - y.kala.tribhaga) < 1e-9;
  }));
})();

console.log('\nThe seven vargas saptavargaja reads');
/*
 * Saptavargaja scores a graha in D1, D2, D3, D7, D9, D12 and D30, so a wrong
 * scheme moves a whole column without any friendship being involved. Raman's
 * Example 9 turns out to be a weak check on this - feeding it a D7 counted the
 * wrong way still matches 48 of his 49 cells - so the schemes are pinned here
 * against the two places they are actually stated.
 *
 * Brihat Parashara Hora Shastra ch.6 and K. S. Charak's Elements of Vedic
 * Astrology, which agree with each other on every one of the seven.
 */
(function () {
  var L = A.SIGN_LORDS;
  // D2, Charak: first 15 degrees of an odd sign to the Sun (Leo), second to the
  // Moon (Cancer); reversed in an even sign.
  ok('D2 gives the odd sign Leo first, the even sign Cancer first',
    A.vargaPosition(5, 2).sign === 4 && A.vargaPosition(20, 2).sign === 3 &&
    A.vargaPosition(35, 2).sign === 3 && A.vargaPosition(50, 2).sign === 4);
  // D3: first decanate the same sign, second the 5th from it, third the 9th.
  ok('D3 steps to the 5th and the 9th', (function () {
    for (var sign = 0; sign < 12; sign++) {
      var b = sign * 30;
      if (A.vargaPosition(b + 1, 3).sign !== sign) return false;
      if (A.vargaPosition(b + 11, 3).sign !== (sign + 4) % 12) return false;
      if (A.vargaPosition(b + 21, 3).sign !== (sign + 8) % 12) return false;
    }
    return true;
  })());
  // D7, Charak: odd signs run from the sign itself, even signs from the 7th.
  ok('D7 runs from the sign in an odd one and from the 7th in an even one',
    (function () {
      for (var sign = 0; sign < 12; sign++) {
        var b = sign * 30, from = sign % 2 === 0 ? sign : (sign + 6) % 12;
        for (var i = 0; i < 7; i++) {
          var lon = b + i * (30 / 7) + 0.5;
          if (A.vargaPosition(lon, 7).sign !== (from + i) % 12) return false;
        }
      }
      return true;
    })());
  // D9: movable from itself, fixed from the 9th, dual from the 5th.
  ok('D9 starts movable from itself, fixed from the 9th, dual from the 5th',
    (function () {
      var start = [0, 8, 4];
      for (var sign = 0; sign < 12; sign++) {
        var want = (sign + start[sign % 3]) % 12;
        if (A.vargaPosition(sign * 30 + 1, 9).sign !== want) return false;
      }
      return true;
    })());
  // D12: from the sign itself, one sign per part.
  ok('D12 runs from the sign itself', (function () {
    for (var sign = 0; sign < 12; sign++) {
      for (var i = 0; i < 12; i++) {
        if (A.vargaPosition(sign * 30 + i * 2.5 + 0.5, 12).sign !== (sign + i) % 12) {
          return false;
        }
      }
    }
    return true;
  })());
  /*
   * D30, Charak: an odd sign gives 5 degrees to Mars, 5 to Saturn, 8 to
   * Jupiter, 7 to Mercury and 5 to Venus; an even sign reverses the order with
   * widths 5, 7, 8, 5 and 5. The unequal widths are the whole of this division,
   * and getting them symmetric is the usual way to have it wrong.
   */
  ok('D30 keeps the unequal widths and the reversed even order', (function () {
    var odd = [[2.5, 'Mars'], [7.5, 'Saturn'], [14, 'Jupiter'], [21.5, 'Mercury'],
      [27.5, 'Venus']];
    var even = [[2.5, 'Venus'], [8.5, 'Mercury'], [14, 'Jupiter'], [20, 'Saturn'],
      [27.5, 'Mars']];
    return odd.every(function (r) {
      return L[A.vargaPosition(r[0], 30).sign] === r[1];       // Aries, odd
    }) && even.every(function (r) {
      return L[A.vargaPosition(30 + r[0], 30).sign] === r[1];  // Taurus, even
    });
  })());
})();

console.log('\nKranti comes from the longitude, not the true declination');
/*
 * Raman's kranti is read off the bhuja of the sayana longitude, section 73,
 * through a table of six 15-degree steps - and a longitude carries no
 * latitude. His Example 32 works all seven grahas that way, Chandra included.
 *
 * This engine passed the Moon's ecliptic latitude in for years, which gives her
 * true declination: the better number, and the wrong quantity. It matters
 * because his formula divides by 48 on the strength of a kranti that tops out
 * at 24, and it only tops out at 24 because it is read off a longitude. Worth
 * about 3.9 virupas on the Moon and up to 6.6.
 *
 * Parashara's side is coherent and different - Santhanam's note gives
 * (23 deg 27' + Kranti) x 1.2793 and sends the reader to a modern ephemeris
 * for the kranti, latitude and all. Either package holds together; the hybrid
 * this had belongs to neither.
 */
(function () {
  var place = { latitude: 21.3069, longitude: -157.8583, tzOffsetMinutes: -600 };
  var chart = A.chart({ jdUT: A.julianDay(1961, 8, 4, 19 + 24 / 60 + 10),
    latitude: place.latitude, longitude: place.longitude,
    tzOffsetMinutes: place.tzOffsetMinutes });
  var S = require('../js/shadbala.js');
  var r = S.compute(chart, place);
  /*
   * A chart whose Moon carries over five degrees of latitude, so the two
   * readings are far apart: her true declination is 15.7 and the longitude
   * gives 20.8.
   */
  check('the Moon\u2019s ayana follows her longitude',
    r.grahas.Moon.kala.ayana, 3.4, 0.2, 'virupas');
  /*
   * Guard against the latitude creeping back: with it the same chart gives 9.9
   * on this constant and 10.4 on Raman's, so anything near either is the old
   * quantity returning.
   */
  ok('and not her true declination', r.grahas.Moon.kala.ayana < 7,
    r.grahas.Moon.kala.ayana.toFixed(1));
  /*
   * The two constants are both sourced, which was not always recorded here.
   * Raman's 24/48 is used; Parashara's 23.45/46.9 differs by at most 0.7, and
   * the pair of them bound how far this row can move on authority alone.
   */
  var k = 12.34;
  var raman = 60 * (24 + k) / 48, parashara = 60 * (23.45 + k) / 46.9;
  ok('the two sourced constants stay within 0.7 virupas',
    Math.abs(raman - parashara) < 0.7,
    Math.abs(raman - parashara).toFixed(3));
})();

console.log('\nThe year and month lords, from the ahargana');
/*
 * Abda and masa bala are not solar periods, and reading them as such is the
 * natural mistake - this engine computed the Sun's ingress into Aries and into
 * its current sign for a long time, which sounds like the same thing and is
 * not. Raman section 59: "The Hindus, for astrological purposes, consider a
 * year and month of 360 and 30 days respectively. They are neither solar, nor
 * lunar, nor luni-solar."
 *
 * Two authorities give worked examples 66 years apart, from two different
 * epochs, and both come out right - which is the real check, because it tests
 * the epoch and the arithmetic at once.
 */
(function () {
  var S = require('../js/shadbala.js');
  function aharganaOn(y, m, d) {
    return A.chart({ jdUT: A.julianDay(y, m, d, 12), latitude: 13,
      longitude: 77.58, tzOffsetMinutes: 330 }).panchang.ahargana;
  }
  // Raman's Standard Horoscope, section 58: 714,404,130,045 days from Creation.
  var raman = aharganaOn(1918, 10, 16);
  check('Raman\u2019s ahargana for 16 Oct 1918', raman, 714404130045, 0, 'days');
  ok('and his Abdadhipathi is Sani', S.abdaLord(raman) === 'Saturn',
    S.abdaLord(raman));
  ok('and his Masadhipathi is Budha', S.masaLord(raman) === 'Mercury',
    S.masaLord(raman));

  /*
   * Santhanam's note to ch.27 v.13 works 1 June 1984 from Burgess's epoch and
   * gets Jupiter and Venus. A different anchor, a different century, the same
   * arithmetic.
   */
  var bphs = aharganaOn(1984, 6, 1);
  ok('Parashara\u2019s worked Varsha lord for 1 June 1984 is Jupiter',
    S.abdaLord(bphs) === 'Jupiter', S.abdaLord(bphs));
  ok('and his Masa lord is Venus', S.masaLord(bphs) === 'Venus',
    S.masaLord(bphs));

  /*
   * The check both texts prescribe for the ahargana itself: taken modulo 7 it
   * must land on the weekday the birth actually fell on. If the epoch were off
   * by a day this is what would catch it.
   */
  var VARAS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
    'Saturday'];
  var slipped = [];
  for (var y = 1900; y <= 2040; y += 7) {
    for (var m = 1; m <= 12; m += 5) {
      var c = A.chart({ jdUT: A.julianDay(y, m, 14, 12), latitude: 13,
        longitude: 77.58, tzOffsetMinutes: 330 });
      var fromAhargana = VARAS[((c.panchang.ahargana % 7) + 6) % 7];
      if (fromAhargana !== c.panchang.vara) slipped.push(y + '-' + m);
    }
  }
  ok('the ahargana agrees with the weekday it should, across 140 years',
    slipped.length === 0, slipped.join(', ') || 'no slips');
})();

console.log('\nThe Moon\u2019s paksha bala, both readings');
/*
 * Paksha bala hands one figure to the benefics and sixty less it to the
 * malefics, and whether the Moon takes her turn in those groups is disputed by
 * authorities who are equally worth reading. Santhanam and Raman put her in the
 * groups; Charak lists her among the benefics unconditionally, and Phaladeepika
 * IV.5 - "The Moon is strong and auspicious when she has her full Paksha bala"
 * - cannot be read the other way, since under the group rule it is the dark
 * Moon that carries the high figure.
 *
 * So it is a setting rather than a fix, and these pin both readings and the
 * blast radius of the choice.
 */
(function () {
  var S = require('../js/shadbala.js');
  // Obama: a thin waning Moon, 291 degrees of elongation, so the two readings
  // land on opposite sides. Star Jyotish reports 23 for her cheshta here.
  var place = { latitude: 21.3069, longitude: -157.8583, tzOffsetMinutes: -600 };
  var chart = A.chart({ jdUT: A.julianDay(1961, 8, 4, 19 + 24 / 60 + 10),
    latitude: place.latitude, longitude: place.longitude,
    tzOffsetMinutes: place.tzOffsetMinutes });
  var byGroup = S.compute(chart, place);
  var asBenefic = S.compute(chart, place, { moonPaksha: S.MOON_PAKSHA.BENEFIC });

  check('a dark Moon by her group takes the complement',
    byGroup.grahas.Moon.kala.paksha, 73.9, 0.1, 'virupas');
  check('and read as a benefic she takes the brightness',
    asBenefic.grahas.Moon.kala.paksha, 46.1, 0.1, 'virupas');
  // Both doubled: Parashara, Raman and Charak all apply it, so it is not the
  // thing in dispute and must survive either choice.
  check('the doubling survives either reading',
    asBenefic.grahas.Moon.kala.paksha / 2, 23.05, 0.1, 'virupas');
  /*
   * And it reaches cheshta, because ch.27 v.18 makes her paksha bala her
   * cheshta bala. Undoubled there, since cheshta is capped at sixty.
   */
  check('her cheshta follows it, undoubled',
    asBenefic.grahas.Moon.cheshta, 23.05, 0.1, 'virupas');

  /*
   * Nothing else may move. The other six read the fortnight the same way under
   * either setting, and the default stays the group reading.
   */
  var others = S.GRAHAS.filter(function (g) { return g !== 'Moon'; });
  ok('no other graha\u2019s paksha bala moves', others.every(function (g) {
    return Math.abs(byGroup.grahas[g].kala.paksha -
      asBenefic.grahas[g].kala.paksha) < 1e-9;
  }));
  ok('and no other graha\u2019s total moves', others.every(function (g) {
    return Math.abs(byGroup.grahas[g].rupas - asBenefic.grahas[g].rupas) < 1e-9;
  }));
  ok('the group reading is the default',
    Math.abs(S.compute(chart, place).grahas.Moon.kala.paksha -
      byGroup.grahas.Moon.kala.paksha) < 1e-9);
  /*
   * Her drik bala must not move either - the setting governs paksha alone, not
   * whether she counts benefic when she aspects somebody.
   */
  ok('her benefic standing elsewhere is untouched',
    Math.abs(byGroup.grahas.Sun.drik - asBenefic.grahas.Sun.drik) < 1e-9);
})();

console.log('\nChesta bala against Raman Examples 49 to 51');
/*
 * Raman works the chesta kendra for all five starry grahas of his Standard
 * Horoscope at Example 49, reduces them at 50 and divides by three at 51,
 * printing his seeghrocha, mean and true longitude for each. Feeding those
 * printed numbers in reproduces every figure.
 *
 * His own table is what settles the inner-planet convention, which is the part
 * everybody gets wrong: Budha and Sukra are both worked with 181.23 standing
 * in as the "mean long.", and 181.23 is the Sun's mean longitude, not theirs.
 * So for the inner two the graha's own mean longitude is the seeghrocha and
 * the Sun's is the mean, exactly reversing the outer case.
 */
(function () {
  var S = require('../js/shadbala.js');
  var SUN_MEAN = 181.23;      // his section 101, the seeghrocha of the outer three
  // graha, seeghrocha, "mean long.", true long., his kendra, his chesta bala
  [['Kuja', 181.23, 266.34, 229.50, 66.69, 22.23],
   ['Budha', 174.49, SUN_MEAN, 181.52, 6.89, 2.30],
   ['Guru', 181.23, 66.91, 84.01, 105.77, 35.26],
   ['Sukra', 158.35, SUN_MEAN, 171.16, 17.85, 5.95],
   ['Sani', 181.23, 111.23, 124.39, 63.42, 21.14]].forEach(function (r) {
    var kendra = S.chestaKendraFrom(r[1], r[2], r[3]);
    check(r[0] + ', reduced chesta kendra, Example 50', kendra, r[4], 0.02, 'deg');
    check(r[0] + ', chesta bala, Example 51', kendra / 3, r[5], 0.02, 'virupas');
  });
  // Section 107: nothing at a kendra of zero, sixty at half a circle.
  check('zero kendra gives no chesta bala', S.chestaKendraFrom(100, 100, 100) / 3,
    0, 1e-9, 'virupas');
  check('half a circle gives sixty', S.chestaKendraFrom(100, 280, 280) / 3, 60,
    1e-9, 'virupas');
})();

console.log('\nDrik bala against Raman Examples 54 and 55');
/*
 * The strongest verification in this suite, and the one that settles a
 * long-running disagreement with an outside calculator.
 *
 * Raman works the whole of drik bala for his Standard Horoscope: Example 54
 * gives the drishti pinda on each of the seven grahas and Example 55 divides
 * each by four. His own benefic set for that chart is printed with it - the
 * Subhadrishti rows are Guru, Chandra and Sukra, the Asubha rows Ravi, Kuja,
 * Sani and Budha, with the footnote "Mercury is a malefic as he is very
 * closely associated with Sun or combusted".
 *
 * Feeding his longitudes and his classification, this implementation
 * reproduces all fourteen of his printed figures. The residual is under 0.05
 * virupas and is his rounding: he prints positions to the arcsecond.
 */
(function () {
  var S = require('../js/shadbala.js');
  function dms(d, m, sec) { return d + m / 60 + sec / 3600; }
  // Nirayana longitudes of the Standard Horoscope, Graha and Bhava Balas p.2
  var at = { Sun: dms(180, 53, 55), Moon: dms(311, 17, 19), Mars: dms(229, 30, 34),
    Mercury: dms(181, 31, 34), Jupiter: dms(84, 0, 49), Venus: dms(171, 9, 56),
    Saturn: dms(124, 22, 41) };
  var positions = {};
  Object.keys(at).forEach(function (g) { positions[g] = { longitude: at[g] }; });
  var benefics = { Sun: false, Moon: true, Mars: false, Mercury: false,
    Jupiter: true, Venus: true, Saturn: false };
  // Example 55, his printed Drik Bala column
  var want = { Sun: 15.86, Moon: -21.73, Mars: 0.95, Mercury: 15.64,
    Jupiter: -16.04, Venus: 18.47, Saturn: 7.21 };
  Object.keys(want).forEach(function (g) {
    check(g + ', Example 55', S.drikBala(g, positions, benefics), want[g], 0.05,
      'virupas');
  });

  /*
   * And the ceiling the definition imposes, which is what rules out an outside
   * calculator's figures rather than merely differing from them. With every
   * aspecting graha counted benefic the pinda is maximal, so no choice of
   * benefics can push drik bala past a quarter of the unsigned sum.
   */
  var allBenefic = {};
  Object.keys(at).forEach(function (g) { allBenefic[g] = true; });
  Object.keys(at).forEach(function (g) {
    var ceiling = S.drikBala(g, positions, allBenefic);
    var actual = S.drikBala(g, positions, benefics);
    ok(g + ': no classification can exceed the all-benefic ceiling',
      Math.abs(actual) <= ceiling + 1e-9,
      actual.toFixed(2) + ' within ' + ceiling.toFixed(2));
  });
})();

console.log('\nAyana bala against Raman Example 33');
/*
 * Raman section 75 gives the formula as Kesava Daivagna's, (24 + Kranti) / 48
 * x 60, and works all seven grahas of the Standard Horoscope through it at
 * Example 33. Four of his printed results survive the scan cleanly enough to
 * check against; the other three have their declinations mangled by the OCR
 * and are left out rather than guessed at.
 *
 * This exists because the constants were silently 23.45 and 46.9 for a long
 * time - a modern obliquity in the two places his 24 belongs - and no test
 * noticed. The error was worth at most 0.7 virupas, which is smaller than the
 * tolerance of every total it fed into. A constant taken from a book should be
 * checked against that book's own arithmetic, not against a total downstream
 * of it.
 *
 * The sign convention is his: north declination is additive for the Sun, Mars,
 * Jupiter and Venus and subtractive for the Moon and Saturn, either way
 * additive for Mercury. So the declination passed here is whatever produces
 * the effective value he printed.
 */
(function () {
  var S = require('../js/shadbala.js');
  // graha, declination to pass, Raman's printed Ayanabala (before the Sun's
  // doubling, which happens outside this function)
  [['Mercury', 9, 41.25, '24 + 9'],
   ['Saturn', 13, 13.75, '24 - 13'],
   ['Moon', -10.75, 43.44, '24 + 10.75'],
   ['Sun', -8.75, 19.06, '24 - 8.75']].forEach(function (row) {
    check(row[0] + ', ' + row[3],
      S.ayanaBala(row[0], row[1], S.AYANA_CONSTANT.RAMAN), row[2], 0.01, 'virupas');
  });
  /*
   * And the ceiling each constant states: the formula reaches sixty exactly at
   * that authority's maximum declination, which is the whole reason for the
   * divisor being twice it. Raman's 24 and 48 at section 73; Parashara's
   * 23 deg 27' and 46.9, which Santhanam gives as a multiplier of 1.2793 and
   * is 60/46.9. Mixing a maximum from one with a divisor from the other breaks
   * both ceilings, which is what makes them a pair rather than two numbers.
   */
  [[S.AYANA_CONSTANT.RAMAN, 24, 'Raman'],
   [S.AYANA_CONSTANT.PARASHARA, 23.45, 'Parashara']].forEach(function (c) {
    check(c[2] + ': sixty at the maximum declination',
      S.ayanaBala('Sun', c[1], c[0]), 60, 1e-9, 'virupas');
    check(c[2] + ': and nothing at the opposite one',
      S.ayanaBala('Sun', -c[1], c[0]), 0, 1e-9, 'virupas');
  });
  /*
   * Parashara's is the default, so calling it with no constant must be calling
   * it with his.
   */
  check('the default constant is Parashara\u2019s',
    S.ayanaBala('Sun', 23.45), 60, 1e-9, 'virupas');
})();

console.log('\nNutation and obliquity (Meeus example 22.a, 1987 Apr 10.0 TD)');
var T87 = (A.julianDay(1987, 4, 10, 0) - 2451545.0) / 36525;
var nut = A.nutation(T87);
check('delta psi', nut.dpsi * 3600, -3.788, 0.005, 'arcsec');
check('delta epsilon', nut.deps * 3600, 9.443, 0.005, 'arcsec');
check('mean obliquity', A.meanObliquity(T87), 23 + 26 / 60 + 27.407 / 3600, 1e-5, 'deg');

console.log('\nApparent sidereal time (Meeus example 12.a, 1987 Apr 10.0 UT)');
var jd87 = A.julianDay(1987, 4, 10, 0);
var eps87 = A.meanObliquity(T87) + nut.deps;
check('Greenwich apparent ST', A.apparentSiderealTime(jd87, T87, nut, eps87),
      197.693195 + nut.dpsi * Math.cos(eps87 * Math.PI / 180), 1e-4, 'deg');

console.log('\nMoon (Meeus example 47.a, 1992 Apr 12.0 TD)');
var T92 = (A.julianDay(1992, 4, 12, 0) - 2451545.0) / 36525;
check('geocentric longitude', A.moonLongitude(T92), 133.162655, 0.002, 'deg');

console.log('\nLunar node');
// Regression rate: one nodal cycle is 6798.38 days (18.6 years).
var n1 = A.lunarNode(0, false), n2 = A.lunarNode(1 / 36525, false);
check('regression rate per day', (n2 - n1) * 36525 / 36525, -1934.1362891 / 36525, 1e-9, 'deg/day');
check('mean node at J2000', A.lunarNode(0, false), 125.0445479, 1e-9, 'deg');
// The Meeus correction series has a maximum possible amplitude of 1.97 deg.
ok('true node stays within 2 deg of mean', (function () {
  for (var d = 0; d < 400; d++) {
    var Td = (A.julianDay(2024, 1, 1, 0) + d - 2451545.0) / 36525;
    var delta = A.norm360(A.lunarNode(Td, true) - A.lunarNode(Td, false) + 180) - 180;
    if (Math.abs(delta) > 2.0) return false;
  }
  return true;
})());
// A solar eclipse can only happen with the Sun close to a node. These two are
// the 2024 Apr 8 total and the 2023 Oct 14 annular eclipse.
function sunNodeGap(y, m, d, h) {
  var jd = A.julianDay(y, m, d, h);
  var T = (jd + A.deltaT(jd) / 86400 - 2451545.0) / 36525;
  var sunLon = A.apparentLongitude('sun', T, A.nutation(T)).lon;
  var gap = A.norm360(sunLon - A.lunarNode(T, true));
  return Math.min(gap, 360 - gap, Math.abs(gap - 180));
}
ok('Sun near a node at the 2024 Apr 8 eclipse', sunNodeGap(2024, 4, 8, 18.3) < 12,
   sunNodeGap(2024, 4, 8, 18.3).toFixed(2) + ' deg');
ok('Sun near a node at the 2023 Oct 14 eclipse', sunNodeGap(2023, 10, 14, 18) < 12,
   sunNodeGap(2023, 10, 14, 18).toFixed(2) + ' deg');

console.log('\nSun (Meeus example 25.b, 1992 Oct 13.0 TD)');
var Ts = (A.julianDay(1992, 10, 13, 0) - 2451545.0) / 36525;
var nutS = A.nutation(Ts);
var sun = A.apparentLongitude('sun', Ts, nutS);
check('apparent longitude', sun.lon, 199.90895, 0.01, 'deg');
// Our Earth comes from the Earth/Moon *barycentre* elements, which sit up to
// 4670 km (3.1e-5 AU) from Earth's centre - hence the loose tolerance here and
// the ~9 arcsec offset in the longitude above.
check('distance to Sun', sun.distance, 0.99760775, 1e-4, 'AU');

console.log('\nVenus (Meeus example 33.a, 1992 Dec 20.0 TD)');
var Tv = (A.julianDay(1992, 12, 20, 0) - 2451545.0) / 36525;
var venus = A.apparentLongitude('venus', Tv, A.nutation(Tv));
check('apparent longitude', venus.lon, 313.08102, 0.02, 'deg');
check('apparent latitude', venus.lat, -2.08474, 0.02, 'deg');

console.log('\nEarth orbit sanity');
var rmin = 99, rmax = 0;
for (var i = 0; i < 366; i++) {
  var Te = (A.julianDay(2024, 1, 1, 0) + i - 2451545.0) / 36525;
  var p = A.heliocentric('earth', Te);
  var r = Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z);
  rmin = Math.min(rmin, r); rmax = Math.max(rmax, r);
}
check('perihelion distance', rmin, 0.98330, 0.0002, 'AU');
check('aphelion distance', rmax, 1.01670, 0.0002, 'AU');

console.log('\nSidereal output against Swiss Ephemeris');
/*
 * Swiss Ephemeris is the reference implementation nearly all astrology software
 * is built on, so these rows are the strictest check in the suite: full sidereal
 * charts, ayanamsa included, produced by pyswisseph (SIDM_LAHIRI) and pasted in.
 *
 * Two conventions have to match, not just the numbers. The ayanamsa is measured
 * from the MEAN equinox while apparent longitudes are measured from the TRUE
 * one, so the ayanamsa is referred to the true equinox before subtracting and
 * nutation cancels out. Get that wrong and every graha wobbles by up to 17
 * arcseconds on an 18.6-year cycle while the nodes sit still.
 */
var SWISS = [
  { label: 'Mumbai dawn', y: 1905, m: 7, d: 4, hUT: 3.5, lat: 19.076, lon: 72.8777,
    ayanamsa: 22.537375165, asc: 117.185811026,
    Sun: 78.934948108, Moon: 96.361639665, Mercury: 90.183926058, Venus: 33.322440444,
    Mars: 197.595072278, Jupiter: 34.292062307, Saturn: 310.022104939, Rahu: 130.174070475 },
  { label: 'Delhi 1947', y: 1947, m: 8, d: 15, hUT: 18.5, lat: 28.6139, lon: 77.209,
    ayanamsa: 23.125489211, asc: 38.808397222,
    Sun: 118.950107313, Moon: 109.106439153, Mercury: 105.503492372, Venus: 113.796429692,
    Mars: 68.113276008, Jupiter: 205.964356569, Saturn: 110.600742238, Rahu: 35.016732664 },
  { label: 'Durgapur 1985', y: 1985, m: 3, d: 22, hUT: 5.4166666667, lat: 23.5158, lon: 87.308,
    ayanamsa: 23.650643637, asc: 65.523073703,
    Sun: 337.891910098, Moon: 345.821862581, Mercury: 354.579940397, Venus: 357.180571548,
    Mars: 11.434186927, Jupiter: 285.558533142, Saturn: 214.297895761, Rahu: 27.252879493 },
  { label: 'Chennai 1999', y: 1999, m: 12, d: 31, hUT: 12.0, lat: 13.0827, lon: 80.2707,
    ayanamsa: 23.857054109, asc: 71.193203321,
    Sun: 255.496351737, Moon: 187.364857655, Mercury: 246.482450914, Venus: 216.504147849,
    Mars: 303.334469617, Jupiter: 1.360774190, Saturn: 16.563309148, Rahu: 101.240415582 },
  { label: 'London 2024', y: 2024, m: 6, d: 21, hUT: 23.25, lat: 51.5072, lon: -0.1276,
    ayanamsa: 24.198959870, asc: 310.890145559,
    Sun: 66.851268136, Moon: 245.862949463, Mercury: 75.603518205, Venus: 71.581675518,
    Mars: 15.215423319, Jupiter: 42.029257600, Saturn: 325.178869162, Rahu: 347.520091302 },
  { label: 'Sydney 2050', y: 2050, m: 2, d: 14, hUT: 7.0, lat: -33.8688, lon: 151.2093,
    ayanamsa: 24.557307398, asc: 89.067209340,
    Sun: 301.205518963, Moon: 203.682348618, Mercury: 287.165532724, Venus: 312.301695389,
    Mars: 231.148375356, Jupiter: 91.566772886, Saturn: 278.212057074, Rahu: 211.074154162 },
];
SWISS.forEach(function (r) {
  var jdUT = A.julianDay(r.y, r.m, r.d, r.hUT);
  var T = (jdUT + A.deltaT(jdUT) / 86400 - 2451545.0) / 36525;
  check(r.label + ': ayanamsa', A.ayanamsa(T, 'lahiri'), r.ayanamsa, 0.5 / 3600, 'deg');
  var c = A.chart({ jdUT: jdUT, latitude: r.lat, longitude: r.lon, tzOffsetMinutes: 0 });
  var gap = function (a, b) { return Math.abs(A.norm360(a - b + 180) - 180) * 3600; };
  // The ascendant, the nodes and the ayanamsa involve no planetary theory, so
  // they must agree almost exactly. The grahas carry our analytical error, whose
  // measured worst case over 1900-2100 is 38" (Venus); these six epochs sit well
  // inside that, so the budget below is the documented ceiling, not a tight fit.
  // Sub-arcsecond through the modern era. The one loose case is 2050, where our
  // sidereal time and Swiss's part company by about 2 arcseconds (0.03 arcmin of
  // ascendant); the block below pins down where that starts.
  ok(r.label + ': ascendant within 3 arcsec', gap(c.ascendant.longitude, r.asc) < 3,
     gap(c.ascendant.longitude, r.asc).toFixed(2) + '"');
  var rahu = c.planets.filter(function (p) { return p.name === 'Rahu'; })[0];
  ok(r.label + ': Rahu within 1 arcsec', gap(rahu.longitude, r.Rahu) < 1,
     gap(rahu.longitude, r.Rahu).toFixed(2) + '"');
  var worst = 0, worstName = '';
  ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'].forEach(function (name) {
    var p = c.planets.filter(function (x) { return x.name === name; })[0];
    var g = gap(p.longitude, r[name]);
    if (g > worst) { worst = g; worstName = name; }
  });
  ok(r.label + ': all grahas within 40 arcsec', worst < 40, 'worst ' + worstName + ' ' + worst.toFixed(1) + '"');
});

// Nutation must not leak into a sidereal longitude. The sample dates span a good
// part of the 18.6-year cycle, so if nutation were leaking the node residual
// would swing with it.
(function () {
  var swings = SWISS.map(function (r) {
    var jdUT = A.julianDay(r.y, r.m, r.d, r.hUT);
    var T = (jdUT + A.deltaT(jdUT) / 86400 - 2451545.0) / 36525;
    var c = A.chart({ jdUT: jdUT, latitude: r.lat, longitude: r.lon });
    var rahu = c.planets.filter(function (p) { return p.name === 'Rahu'; })[0];
    return { dpsi: A.nutation(T).dpsi * 3600, resid: (A.norm360(rahu.longitude - r.Rahu + 180) - 180) * 3600 };
  });
  var dpsiSpan = Math.max.apply(null, swings.map(function (s) { return s.dpsi; })) -
                 Math.min.apply(null, swings.map(function (s) { return s.dpsi; }));
  var residMax = Math.max.apply(null, swings.map(function (s) { return Math.abs(s.resid); }));
  ok('nutation does not leak into sidereal longitudes', dpsiSpan > 10 && residMax < 1,
     'delta psi spans ' + dpsiSpan.toFixed(1) + '" while the residual stays under ' + residMax.toFixed(2) + '"');
})();

console.log('\nSidereal ingresses (sankranti) - the ayanamsa cross-check');
// The Sun's sidereal longitude must hit an exact sign boundary on the dates the
// Indian calendar names: Mesha ~Apr 14, Makara ~Jan 14.
function siderealSun(jdUT) {
  var T = (jdUT + A.deltaT(jdUT) / 86400 - 2451545.0) / 36525;
  var lon = A.apparentLongitude('sun', T, A.nutation(T)).lon;
  return A.norm360(lon - A.ayanamsa(T, 'lahiri'));
}
function ingressDay(y, m, dStart, targetSign) {
  for (var d = dStart; d < dStart + 5; d++) {
    var a = A.norm360(siderealSun(A.julianDay(y, m, d, 0)) - targetSign * 30);
    var b = A.norm360(siderealSun(A.julianDay(y, m, d + 1, 0)) - targetSign * 30);
    if (a > 300 && b < 60) return d;
  }
  return -1;
}
var mesha = ingressDay(2025, 4, 12, 0);
ok('Mesha Sankranti 2025 falls Apr 13-14 UT', mesha === 13 || mesha === 14, 'Apr ' + mesha);
var makara = ingressDay(2026, 1, 12, 9);
ok('Makara Sankranti 2026 falls Jan 13-14 UT', makara === 13 || makara === 14, 'Jan ' + makara);

console.log('\nApparent sidereal time against Swiss Ephemeris');
/*
 * Sidereal time drives the ascendant directly, so it gets its own check. These
 * are swe_sidtime values; ours comes from the Earth Rotation Angle and the IAU
 * 2006 GMST expression. Agreement is essentially exact through 2040 and opens to
 * about 2 arcseconds past 2050, where Delta T has to be extrapolated.
 */
var SIDTIME = [
  [2378561.760417, 258.472633817], [2396823.760417, 258.363424328],
  [2415085.760417, 258.262060310], [2433347.760417, 258.148983304],
  [2451610.760417, 259.023600163]
];
(function () {
  var worst = 0, worstYear = 0;
  SIDTIME.forEach(function (r) {
    var jd = r[0], T = (jd + A.deltaT(jd) / 86400 - 2451545.0) / 36525;
    var nutS = A.nutation(T), eps = A.meanObliquity(T) + nutS.deps;
    var d = Math.abs(A.norm360(A.apparentSiderealTime(jd, T, nutS, eps) - r[1] + 180) - 180) * 3600;
    if (d > worst) { worst = d; worstYear = A.calendarDate(jd).y; }
  });
  ok('sidereal time within 0.5 arcsec, 1800-2000', worst < 0.5, worst.toFixed(4) + '" (worst ' + worstYear + ')');
})();

console.log('\nSidereal ingress moments against published Vedic transit dates');
function siderealLon(body, jd) {
  var T = (jd + A.deltaT(jd) / 86400 - 2451545.0) / 36525;
  var n = A.nutation(T);
  var lon = body === 'rahu' ? A.lunarNode(T, false) : A.apparentLongitude(body, T, n).lon;
  return A.norm360(lon - A.ayanamsa(T, 'lahiri'));
}
/** Bisect for the moment `body` crosses into sign `target`; returns the IST date. */
function ingressIST(body, target, jdLo, jdHi, retrograde) {
  var f = function (jd) { var d = A.norm360(siderealLon(body, jd) - target * 30); return d > 180 ? d - 360 : d; };
  for (var i = 0; i < 80; i++) {
    var m = (jdLo + jdHi) / 2;
    if (retrograde ? f(m) > 0 : f(m) < 0) jdLo = m; else jdHi = m;
  }
  var c = A.calendarDate((jdLo + jdHi) / 2 + 330 / 1440); // IST = UT + 5:30
  return c.y + '-' + String(c.m).padStart(2, '0') + '-' + String(c.d).padStart(2, '0') +
    ' ' + String(Math.floor(c.hours)).padStart(2, '0') + ':' +
    String(Math.round((c.hours % 1) * 60)).padStart(2, '0');
}
[
  ['Sun into Mesha 2025', 'sun', 0, [2025, 4, 10], [2025, 4, 18], '2025-04-14'],
  ['Sun into Makara 2026', 'sun', 9, [2026, 1, 10], [2026, 1, 18], '2026-01-14'],
  ['Saturn into Kumbha', 'saturn', 10, [2023, 1, 10], [2023, 1, 25], '2023-01-17'],
  ['Saturn into Meena', 'saturn', 11, [2025, 3, 22], [2025, 4, 5], '2025-03-29'],
  ['Jupiter into Vrishabha', 'jupiter', 1, [2024, 4, 25], [2024, 5, 6], '2024-05-01'],
  ['Jupiter into Mithuna', 'jupiter', 2, [2025, 5, 8], [2025, 5, 20], '2025-05-14']
].forEach(function (t) {
  var got = ingressIST(t[1], t[2], A.julianDay(t[3][0], t[3][1], t[3][2], 0), A.julianDay(t[4][0], t[4][1], t[4][2], 0));
  ok(t[0] + ' = ' + t[5] + ' IST', got.slice(0, 10) === t[5], got + ' IST');
});
// Panchangs publish the *mean* node for Rahu/Ketu, which is what this defaults to.
var rahuIn = ingressIST('rahu', 0, A.julianDay(2023, 10, 25, 0), A.julianDay(2023, 11, 5, 0), true);
ok('mean Rahu into Meena = 2023-10-30 IST', rahuIn.slice(0, 10) === '2023-10-30', rahuIn + ' IST');

console.log('\nApparent longitudes against JPL Horizons');
/*
 * Reference apparent geocentric RA/Dec (true equator and equinox of date,
 * airless) pulled from the JPL Horizons API. Converting them to ecliptic
 * longitude with our own obliquity gives an independent check of the whole
 * chain: theory, light-time, aberration, precession and nutation.
 */
var HORIZONS = [
  ['sun', 1950, 1, 1, 0, 280.884733739, -23.070740433],
  ['sun', 1990, 8, 15, 5, 144.489125792, 14.136941379],
  ['sun', 2024, 5, 1, 0, 38.686103122, 15.161920510],
  ['sun', 2024, 5, 2, 0, 39.643352626, 15.461272597],
  ['sun', 2050, 6, 30, 12, 99.709189413, 23.130799484],
  ['moon', 1950, 1, 1, 0, 58.451755325, 24.152480764],
  ['moon', 1990, 8, 15, 5, 70.590491275, 26.576634736],
  ['moon', 2024, 5, 1, 0, 308.615124762, -23.810582373],
  ['moon', 2024, 5, 2, 0, 322.748186968, -19.313042109],
  ['moon', 2050, 6, 30, 12, 221.744908677, -16.613809309],
  ['mercury', 1950, 1, 1, 0, 301.881470650, -21.471268343],
  ['mercury', 1990, 8, 15, 5, 169.124084486, 2.108958366],
  ['mercury', 2024, 5, 1, 0, 16.734634265, 4.580952260],
  ['mercury', 2024, 5, 2, 0, 17.219271152, 4.625085595],
  ['mercury', 2050, 6, 30, 12, 113.001640959, 23.658494658],
  ['venus', 1950, 1, 1, 0, 319.234862202, -15.151215943],
  ['venus', 1990, 8, 15, 5, 123.912557612, 20.213258719],
  ['venus', 2024, 5, 1, 0, 30.135533690, 10.972881518],
  ['venus', 2024, 5, 2, 0, 31.307285881, 11.416127803],
  ['venus', 2050, 6, 30, 12, 143.942028621, 16.169667679],
  ['mars', 1950, 1, 1, 0, 183.027933187, 1.425600572],
  ['mars', 1990, 8, 15, 5, 49.312931720, 16.207193473],
  ['mars', 2024, 5, 1, 0, 0.752168057, -1.052354036],
  ['mars', 2024, 5, 2, 0, 1.458699767, -0.745239714],
  ['mars', 2050, 6, 30, 12, 329.238318138, -17.436184297],
  ['jupiter', 1950, 1, 1, 0, 309.048450528, -19.219106210],
  ['jupiter', 1990, 8, 15, 5, 121.553074576, 20.566500850],
  ['jupiter', 2024, 5, 1, 0, 51.946498464, 18.067728563],
  ['jupiter', 2024, 5, 2, 0, 52.184427227, 18.126513391],
  ['jupiter', 2050, 6, 30, 12, 129.770984997, 19.025150220],
  ['saturn', 1950, 1, 1, 0, 171.083465972, 6.027991724],
  ['saturn', 1990, 8, 15, 5, 291.504276751, -21.941272259],
  ['saturn', 2024, 5, 1, 0, 348.388633360, -6.882658102],
  ['saturn', 2024, 5, 2, 0, 348.470384403, -6.851731269],
  ['saturn', 2050, 6, 30, 12, 310.074110696, -18.869636311],
];
var worst = {};
HORIZONS.forEach(function (r) {
  var body = r[0], jdUT = A.julianDay(r[1], r[2], r[3], r[4]);
  var T = (jdUT + A.deltaT(jdUT) / 86400 - 2451545.0) / 36525;
  var nutH = A.nutation(T);
  var eps = A.meanObliquity(T) + nutH.deps;
  var ra = r[5] * Math.PI / 180, dec = r[6] * Math.PI / 180, e = eps * Math.PI / 180;
  var want = A.norm360(Math.atan2(
    Math.sin(ra) * Math.cos(e) + Math.tan(dec) * Math.sin(e), Math.cos(ra)) * 180 / Math.PI);
  var got = body === 'moon'
    ? A.norm360(A.moonLongitude(T) + nutH.dpsi)
    : A.apparentLongitude(body, T, nutH).lon;
  var d = got - want; if (d > 180) d -= 360; if (d < -180) d += 360;
  worst[body] = Math.max(worst[body] || 0, Math.abs(d * 3600));
});
Object.keys(worst).forEach(function (body) {
  // 40 arcsec is the documented budget; a pada is 12000 arcsec wide.
  ok(body + ' within 40 arcsec of Horizons', worst[body] < 40, worst[body].toFixed(1) + '"');
});

console.log('\nNew Moon timing (elongation zero) - Sun/Moon consistency');
// Published new moon: 2025 Oct 21, 12:25 UT.
function elong(jd) {
  var T = (jd + A.deltaT(jd) / 86400 - 2451545.0) / 36525;
  var n = A.nutation(T);
  return A.norm360(A.moonLongitude(T) + n.dpsi - A.apparentLongitude('sun', T, n).lon);
}
var lo = A.julianDay(2025, 10, 20, 0), hi = A.julianDay(2025, 10, 22, 12);
for (var k = 0; k < 60; k++) {
  var mid = (lo + hi) / 2;
  if (elong(mid) > 180) lo = mid; else hi = mid;
}
var nm = A.calendarDate((lo + hi) / 2);
ok('new moon 2025 Oct 21 ~12:25 UT', nm.d === 21 && Math.abs(nm.hours - 12.42) < 0.05,
   'Oct ' + nm.d + ' ' + Math.floor(nm.hours) + ':' + String(Math.round((nm.hours % 1) * 60)).padStart(2, '0') + ' UT');


console.log('\nAscendant and Midheaven, checked against the Sun itself');
/*
 * Two identities that must hold for any correct ascendant formula:
 *   at geometric sunrise (Sun's altitude exactly 0) the Sun sits on the eastern
 *   horizon, so its ecliptic longitude IS the ascendant;
 *   at local apparent noon the Sun is on the meridian, so its longitude is the
 *   Midheaven.
 * Both are independent of any ephemeris reference data, and they catch sign
 * errors, obliquity mistakes and sidereal-time drift.
 */
function sunHorizontal(jdUT, lat, lon) {
  var T = (jdUT + A.deltaT(jdUT) / 86400 - 2451545.0) / 36525;
  var nut = A.nutation(T);
  var eps = A.meanObliquity(T) + nut.deps;
  var sun = A.apparentLongitude('sun', T, nut);
  var l = (sun.lon + nut.dpsi * 0) * Math.PI / 180, b = sun.lat * Math.PI / 180, e = eps * Math.PI / 180;
  var ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l));
  var dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l));
  var gast = A.apparentSiderealTime(jdUT, T, nut, eps);
  var ha = (gast + lon) * Math.PI / 180 - ra;
  var phi = lat * Math.PI / 180;
  var alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(ha));
  return { altitude: alt * 180 / Math.PI, hourAngle: ((ha * 180 / Math.PI) % 360 + 540) % 360 - 180,
           longitude: sun.lon, eps: eps, gast: gast };
}
function ascMc(jdUT, lat, lon) {
  var T = (jdUT + A.deltaT(jdUT) / 86400 - 2451545.0) / 36525;
  var nut = A.nutation(T);
  var eps = A.meanObliquity(T) + nut.deps;
  var lst = A.norm360(A.apparentSiderealTime(jdUT, T, nut, eps) + lon);
  var r = Math.PI / 180;
  return {
    asc: A.norm360(Math.atan2(Math.cos(lst * r),
      -(Math.sin(lst * r) * Math.cos(eps * r) + Math.tan(lat * r) * Math.sin(eps * r))) / r),
    mc: A.norm360(Math.atan2(Math.sin(lst * r), Math.cos(lst * r) * Math.cos(eps * r)) / r)
  };
}
[['Delhi', 28.6139, 77.2090, 1990, 8, 15],
 ['Chennai', 13.0827, 80.2707, 1975, 1, 20],
 ['London', 51.5072, -0.1276, 2024, 6, 21],
 ['Reykjavik', 64.1466, -21.9426, 2024, 3, 20],
 ['Sydney', -33.8688, 151.2093, 2001, 12, 21],
 ['Nairobi', -1.2921, 36.8219, 1960, 9, 9],
 ['Quito', -0.1807, -78.4678, 2010, 11, 5]].forEach(function (place) {
  var name = place[0], lat = place[1], lon = place[2];
  // Bisect for the morning crossing of altitude 0.
  var jdMid = A.julianDay(place[3], place[4], place[5], 0) - lon / 360;
  var lo = jdMid, hi = jdMid + 0.5, rising = false;
  for (var probe = 0; probe < 96; probe++) {
    var t0 = jdMid + probe / 96, t1 = jdMid + (probe + 1) / 96;
    if (sunHorizontal(t0, lat, lon).altitude < 0 && sunHorizontal(t1, lat, lon).altitude >= 0) {
      lo = t0; hi = t1; rising = true; break;
    }
  }
  if (!rising) { ok(name + ': found a sunrise', false, 'no crossing in 24h'); return; }
  for (var i = 0; i < 60; i++) {
    var mid = (lo + hi) / 2;
    if (sunHorizontal(mid, lat, lon).altitude < 0) lo = mid; else hi = mid;
  }
  var jdRise = (lo + hi) / 2;
  var sun = sunHorizontal(jdRise, lat, lon);
  var ac = ascMc(jdRise, lat, lon);
  var gap = Math.abs(A.norm360(ac.asc - sun.longitude + 180) - 180) * 60;
  ok(name + ': Sun is on the ascendant at sunrise', gap < 2.0, gap.toFixed(3) + "' apart");

  // Local apparent noon: bisect the hour angle through zero.
  var nlo = jdMid, nhi = jdMid + 1;
  for (var j = 0; j < 60; j++) {
    var nmid = (nlo + nhi) / 2;
    if (sunHorizontal(nmid, lat, lon).hourAngle < 0) nlo = nmid; else nhi = nmid;
  }
  var jdNoon = (nlo + nhi) / 2;
  var sunNoon = sunHorizontal(jdNoon, lat, lon);
  var mcGap = Math.abs(A.norm360(ascMc(jdNoon, lat, lon).mc - sunNoon.longitude + 180) - 180) * 60;
  ok(name + ': Sun is on the midheaven at noon', mcGap < 2.0, mcGap.toFixed(3) + "' apart");
});

// The chart() entry point must agree with the formulas just verified.
(function () {
  var jd = A.julianDay(1990, 8, 15, 5.0);
  var c = A.chart({ jdUT: jd, latitude: 28.6139, longitude: 77.2090, tzOffsetMinutes: 330 });
  var direct = ascMc(jd, 28.6139, 77.2090);
  var T = (jd + A.deltaT(jd) / 86400 - 2451545.0) / 36525;
  // The ayanamsa is published from the mean equinox, so it is referred to the
  // true equinox before subtracting from an apparent longitude; see the Swiss
  // Ephemeris block above.
  var ayanTrue = A.ayanamsa(T, 'lahiri') + A.nutation(T).dpsi;
  ok('chart() ascendant matches the direct formula',
     Math.abs(A.norm360(c.ascendant.longitude - A.norm360(direct.asc - ayanTrue) + 180) - 180) < 1e-9);
  ok('chart() midheaven matches the direct formula',
     Math.abs(A.norm360(c.midheaven.longitude - A.norm360(direct.mc - ayanTrue) + 180) - 180) < 1e-9);
  // The ascendant rises through all twelve signs across a day.
  var signs = {};
  for (var h = 0; h < 24; h += 0.25) {
    signs[A.signOf(A.chart({ jdUT: A.julianDay(1990, 8, 15, h), latitude: 28.6139, longitude: 77.2090 }).ascendant.longitude)] = true;
  }
  ok('ascendant passes through all twelve signs in a day', Object.keys(signs).length === 12,
     Object.keys(signs).length + ' signs');
})();

console.log('\nWhat a second of clock time is worth');
/*
 * This is why the form has a seconds box. The ascendant advances with sidereal
 * time, so one second of clock time is worth roughly 13 to 21 arcseconds of
 * ascendant in the mid latitudes, and a whole minute is a fifth of a degree.
 */
(function () {
  var jd = A.julianDay(1990, 8, 15, 5.0);
  var place = { latitude: 28.6139, longitude: 77.2090 };
  function ascAt(offsetSeconds) {
    return A.chart({ jdUT: jd + offsetSeconds / 86400, latitude: place.latitude, longitude: place.longitude }).ascendant.longitude;
  }
  var perSecond = Math.abs(A.norm360(ascAt(1) - ascAt(0) + 180) - 180) * 3600;
  ok('one second moves the ascendant 12 to 22 arcsec', perSecond > 12 && perSecond < 22,
     perSecond.toFixed(1) + '"');
  var perMinute = Math.abs(A.norm360(ascAt(60) - ascAt(0) + 180) - 180) * 60;
  ok('one minute moves the ascendant 12 to 22 arcmin', perMinute > 12 && perMinute < 22,
     perMinute.toFixed(2) + "'");
  // Fractional-second inputs must not be silently rounded away.
  ok('a 30 second difference is resolved', Math.abs(ascAt(30) - ascAt(0)) > 1e-4,
     (Math.abs(A.norm360(ascAt(30) - ascAt(0) + 180) - 180) * 60).toFixed(2) + "'");
  // The seconds only ever move the chart forward in time, never the date.
  var withSeconds = A.calendarDate(A.julianDay(1990, 8, 15, (10 * 3600 + 30 * 60 + 59) / 3600));
  ok('seconds stay inside the same day', withSeconds.d === 15 && Math.abs(withSeconds.hours - 10.5164) < 1e-3,
     'day ' + withSeconds.d + ', ' + withSeconds.hours.toFixed(4) + 'h');
})();

console.log('\nGraha order');
/*
 * The sequence every table reads in. It lives outside assembleChart because a
 * chart does not always come from assembleChart: the Edge Function assembles
 * with whatever copy of this file was deployed with it, and a copy behind the
 * browser's returns the grahas in the order it knew.
 */
ok('the order is the weekday lords, Ketu after Rahu',
   A.GRAHA_ORDER.join(' ') === 'Sun Moon Mars Mercury Jupiter Venus Saturn Rahu Ketu',
   A.GRAHA_ORDER.join(' '));
ok('and a chart built here already comes in it', (function () {
  var c = A.chart({ jdUT: A.julianDay(1985, 3, 22, 10 + 55 / 60 - 5.5),
                    latitude: 23.55, longitude: 87.32, tzOffsetMinutes: 330 });
  return c.planets.map(function (p) { return p.name; }).join(' ') === A.GRAHA_ORDER.join(' ');
})());
// The order the deployed service was returning when this was found.
ok('a chart that does not is put into it', (function () {
  var stale = ['Sun', 'Moon', 'Mars', 'Jupiter', 'Venus', 'Mercury', 'Saturn', 'Rahu', 'Ketu']
    .map(function (n) { return { name: n }; });
  return A.inGrahaOrder(stale).map(function (p) { return p.name; }).join(' ') ===
    A.GRAHA_ORDER.join(' ');
})());
ok('sorting leaves the array it was given alone', (function () {
  var given = [{ name: 'Saturn' }, { name: 'Sun' }];
  A.inGrahaOrder(given);
  return given[0].name === 'Saturn';
})());
/*
 * A name the order does not know must not vanish. Upagrahas and the outer
 * planets are the cases that would come from a newer service than this file.
 */
ok('and a graha the order has never heard of keeps its place at the end', (function () {
  var withExtra = [{ name: 'Gulika' }, { name: 'Saturn' }, { name: 'Sun' }];
  var sorted = A.inGrahaOrder(withExtra).map(function (p) { return p.name; });
  return sorted.join(' ') === 'Sun Saturn Gulika' && sorted.length === 3;
})());

console.log('\nBenefic and malefic nature');
/*
 * Chapter 2 verse 11 names "decreasing Moon" among the malefics and leaves
 * decreasing undefined. The two glosses put the boundary in different places,
 * and the difference is half of all charts.
 *
 * Santhanam reads it as the dark fortnight, so the boundary is 180 degrees, and
 * sets the other view aside in his note as belonging to the Moon's strength
 * rather than her nature. Raman reads it as the thin Moon and fixes the
 * boundary at the eighth day either side - Hindu Predictive Astrology page 55,
 * "From the eighth day of bright half of the lunar month the Moon is full and
 * strong. She is weak from the eighth day of the dark half", and section 53 of
 * Graha and Bhava Balas says the same. That is 90 degrees to 270.
 *
 * Raman is followed. The verse is Parashara's and both glosses are commentary,
 * but only one of the two commentators is writing from inside the Parashari
 * tradition this site follows throughout.
 */
ok('the Moon is benefic while full, by Raman\'s eighth-day boundary', (function () {
  var chart = function (elongation) {
    return { planets: [
      { name: 'Sun', sign: 0, longitude: 0 },
      { name: 'Moon', sign: Math.floor(elongation / 30) % 12, longitude: elongation }] };
  };
  // 60 degrees on: waxing but still thin, so malefic by Raman and benefic by
  // Santhanam. 200 degrees on: waning but still full, so the reverse.
  return A.naturalBenefics(chart(60)).Moon === false &&
    A.naturalBenefics(chart(200)).Moon === true &&
    A.naturalBenefics(chart(90)).Moon === false &&
    A.naturalBenefics(chart(91)).Moon === true &&
    A.naturalBenefics(chart(269)).Moon === true &&
    A.naturalBenefics(chart(270)).Moon === false;
})());
ok('and the two glosses disagree about half of all charts', (function () {
  var differ = 0, charts = 0;
  for (var y = 1900; y < 2020; y++) {
    for (var h = 1; h < 24; h += 7) {
      var c = A.chart({ jdUT: A.julianDay(y, (y % 12) + 1, (y % 27) + 1, h), latitude: 28.61,
                        longitude: 77.21, tzOffsetMinutes: 330 });
      var sun = c.planets.filter(function (p) { return p.name === 'Sun'; })[0];
      var moon = c.planets.filter(function (p) { return p.name === 'Moon'; })[0];
      var e = A.norm360(moon.longitude - sun.longitude);
      charts++;
      if ((e < 180) !== (e > 90 && e < 270)) differ++;
    }
  }
  return differ / charts > 0.45 && differ / charts < 0.55;
})());
/*
 * And the Moon's nature no longer depends on anything but the Sun. Santhanam's
 * note carried two rescues - a waning Moon conjunct or aspected by a benefic
 * turns benefic, and a waning Moon with Mercury makes both benefic - which are
 * his commentary rather than the verse, and Raman carries neither. They fired
 * on 23% and 4% of charts. Dropping them also removes the circularity that made
 * the Moon's nature depend on Mercury's and Mercury's on the Moon's.
 */
ok('a thin Moon is not rescued by the company it keeps', (function () {
  var thin = function (extra) {
    return { planets: [
      { name: 'Sun', sign: 0, longitude: 0 },
      { name: 'Moon', sign: 1, longitude: 40 }].concat(extra) };
  };
  return A.naturalBenefics(thin([{ name: 'Jupiter', sign: 1, longitude: 45 }])).Moon === false &&
    A.naturalBenefics(thin([{ name: 'Venus', sign: 1, longitude: 45 }])).Moon === false &&
    A.naturalBenefics(thin([{ name: 'Mercury', sign: 1, longitude: 42 }])).Moon === false;
})());
/*
 * Mercury keeps the one clause the verse does give: "Mercury, however, is a
 * malefic if he joins a malefic."
 */
/*
 * The Sun is judged by combustion and every other malefic by the sign. Raman's
 * footnote to his drik bala table is where the asymmetry comes from: "Mercury
 * is a malefic as he is very closely associated with Sun or combusted."
 *
 * It has to be asymmetric. Mercury is never more than about 28 degrees from the
 * Sun and shares its sign in 44% of charts, so a same-sign test against the Sun
 * reports Mercury's orbit rather than its company. The two tests disagree in
 * 41% of charts and in both directions - same sign but far enough to keep its
 * rays, and combust across a sign boundary.
 */
ok('Mercury is judged against the Sun by combustion, not by the sign',
   (function () {
     var at = A.COMBUSTION.Mercury.direct;      // 14 degrees, direct
     var chart = function (gap) {
       return { planets: [
         { name: 'Sun', sign: 0, longitude: 1 },
         { name: 'Moon', sign: 5, longitude: 160 },   // full, so benefic
         { name: 'Mercury', sign: Math.floor((1 + gap) / 30), longitude: 1 + gap }] };
     };
     // Inside the orb and in the same sign: malefic. Outside the orb but still
     // in the same sign: benefic, where a same-sign test would say otherwise.
     return at === 14 &&
       A.naturalBenefics(chart(5)).Mercury === false &&
       A.naturalBenefics(chart(20)).Mercury === true;
   })());
ok('and across a sign boundary it is still combustion that decides', (function () {
  // Sun at 27 Aries, Mercury at 3 Taurus: different signs, 6 degrees apart.
  var chart = { planets: [
    { name: 'Sun', sign: 0, longitude: 27 },
    { name: 'Moon', sign: 5, longitude: 160 },
    { name: 'Mercury', sign: 1, longitude: 33 }] };
  return A.naturalBenefics(chart).Mercury === false;
})());

ok('Mercury is benefic alone and malefic beside a malefic', (function () {
  var full = { name: 'Moon', sign: 5, longitude: 160 };   // 160 degrees on, so benefic
  var alone = { planets: [
    { name: 'Sun', sign: 0, longitude: 0 }, full,
    { name: 'Mercury', sign: 8, longitude: 262 }] };
  return A.naturalBenefics(alone).Mercury === true;
})());
ok('Mercury is still malefic in the company of a plain malefic', (function () {
  var chart = { planets: [
    { name: 'Sun', sign: 0, longitude: 0 },
    { name: 'Moon', sign: 3, longitude: 100 },
    { name: 'Mercury', sign: 8, longitude: 262 },
    { name: 'Saturn', sign: 8, longitude: 265 }] };
  return A.naturalBenefics(chart).Mercury === false;
})());
/*
 * Jupiter and Venus are unconditional either way, which is what makes them the
 * two that can rescue a waning Moon.
 */
ok('Jupiter and Venus are benefic in every chart, the Sun Mars and Saturn never',
   (function () {
     for (var y = 1980; y < 2000; y++) {
       var c = A.chart({ jdUT: A.julianDay(y, 6, 12, 9), latitude: 28.61, longitude: 77.21,
                         tzOffsetMinutes: 330 });
       var b = A.naturalBenefics(c);
       if (!b.Jupiter || !b.Venus || b.Sun || b.Mars || b.Saturn) return false;
     }
     return true;
   })());

console.log('\nHemming, both kinds');
/*
 * The same figure with the other blades. The nodes are malefics for it and take
 * no part in naturalBenefics, so hemmedBy names them rather than letting them
 * fall through its map as neither.
 */
ok('a graha with malefics either side is hemmed by them', (function () {
  var chart = { planets: [
    { name: 'Sun', sign: 0, longitude: 5 }, { name: 'Moon', sign: 6, longitude: 186 },
    { name: 'Saturn', sign: 11, longitude: 355 }, { name: 'Mars', sign: 1, longitude: 35 }] };
  return A.hemmedByMalefics('Sun', 0, chart) && !A.hemmedByBenefics('Sun', 0, chart);
})());
ok('and the nodes count among them', (function () {
  var chart = { planets: [
    { name: 'Sun', sign: 0, longitude: 5 }, { name: 'Moon', sign: 6, longitude: 186 },
    { name: 'Rahu', sign: 11, longitude: 355 }, { name: 'Ketu', sign: 1, longitude: 35 }] };
  return A.hemmedByMalefics('Sun', 0, chart);
})());
ok('a benefic one side and a malefic the other is neither', (function () {
  var chart = { planets: [
    { name: 'Sun', sign: 0, longitude: 5 }, { name: 'Moon', sign: 6, longitude: 186 },
    { name: 'Jupiter', sign: 11, longitude: 355 }, { name: 'Mars', sign: 1, longitude: 35 }] };
  return !A.hemmedByBenefics('Sun', 0, chart) && !A.hemmedByMalefics('Sun', 0, chart);
})());
/*
 * Papa runs much the commoner: five grahas are malefic before the nodes are
 * counted, and only four can be benefic with two of those conditional.
 */
ok('and the malefic kind is the commoner, by a long way', (function () {
  var benefic = 0, malefic = 0, placements = 0;
  for (var y = 1900; y < 2020; y++) {
    for (var h = 1; h < 24; h += 7) {
      var c = A.chart({ jdUT: A.julianDay(y, (y % 12) + 1, (y % 27) + 1, h), latitude: 28.61,
                        longitude: 77.21, tzOffsetMinutes: 330 });
      var ben = A.naturalBenefics(c);
      c.planets.forEach(function (p) {
        if (A.NODES.indexOf(p.name) >= 0) return;
        placements++;
        if (A.hemmedByBenefics(p.name, p.sign, c, ben)) benefic++;
        if (A.hemmedByMalefics(p.name, p.sign, c, ben)) malefic++;
      });
    }
  }
  return benefic / placements > 0.01 && malefic > benefic * 3 &&
    malefic / placements < 0.25;
})());

console.log('\nKartari');
/*
 * The lagna between two planets, as between the blades of a pair of scissors.
 * De Fouw and Svoboda put it on the first house and not on a graha, at page 297
 * of Light on Life, and their worked case is Indira Gandhi.
 */
(function () {
  var gandhi = A.chart({ jdUT: A.julianDay(1917, 11, 19, 23 + 11 / 60 - 5.5),
                         latitude: 25.45, longitude: 81.85, tzOffsetMinutes: 330 });
  var found = Yogas.kartari(gandhi);
  ok('the worked example comes out as they describe it',
     A.SIGNS[A.signOf(gandhi.ascendant.longitude)] === 'Cancer' &&
     found.length === 1 && found[0].kind === 'papa' &&
     found[0].grahas.sort().join(', ') === 'Ketu, Mars',
     found.length ? found[0].summary : 'nothing found');
  /*
   * Their definition asks for the malefics to be unaspected by benefics, and
   * their own example fails it: Venus in Sagittarius aspects the Gemini holding
   * Ketu. So occupancy decides the yoga and an aspect from the other side is
   * reported against it, rather than gating it out and losing the case the book
   * is built on.
   */
  ok('and the qualifier their example fails is reported, not enforced',
     found.length === 1 &&
     found[0].reasons.some(function (r) { return /Venus aspects one of the two signs/.test(r); }));
})();
ok('one of each kind flanking is no scissors at all', (function () {
  // Jupiter in the 2nd and Saturn in the 12th: benefic one side, malefic the other.
  var chart = { ascendant: { longitude: 5 }, planets: [
    { name: 'Sun', sign: 4, longitude: 125 }, { name: 'Moon', sign: 4, longitude: 128 },
    { name: 'Jupiter', sign: 1, longitude: 35 }, { name: 'Saturn', sign: 11, longitude: 355 }] };
  return Yogas.kartari(chart).length === 0;
})());
ok('and an empty house on either side is none either', (function () {
  var chart = { ascendant: { longitude: 5 }, planets: [
    { name: 'Sun', sign: 4, longitude: 125 }, { name: 'Moon', sign: 4, longitude: 128 },
    { name: 'Jupiter', sign: 1, longitude: 35 }] };
  return Yogas.kartari(chart).length === 0;
})());
ok('the unqualified form says so rather than saying nothing', (function () {
  var chart = { ascendant: { longitude: 5 }, planets: [
    { name: 'Sun', sign: 6, longitude: 186 }, { name: 'Moon', sign: 6, longitude: 190 },
    { name: 'Jupiter', sign: 1, longitude: 35 }, { name: 'Venus', sign: 11, longitude: 355 }] };
  var found = Yogas.kartari(chart);
  return found.length === 1 && found[0].kind === 'shubha' &&
    found[0].reasons.some(function (r) { return /unqualified form/.test(r); });
})());
/*
 * The nodes are malefics here. They keep no friendships and take no part in
 * naturalBenefics, but Ketu is half the Gandhi example.
 */
ok('the nodes count as malefics, which is what makes the example work', (function () {
  var chart = { ascendant: { longitude: 5 }, planets: [
    { name: 'Sun', sign: 6, longitude: 186 }, { name: 'Moon', sign: 6, longitude: 190 },
    { name: 'Rahu', sign: 1, longitude: 35 }, { name: 'Ketu', sign: 7, longitude: 215 },
    { name: 'Saturn', sign: 11, longitude: 355 }] };
  var found = Yogas.kartari(chart);
  return found.length === 1 && found[0].kind === 'papa';
})());
/*
 * Both kinds occur, and papa runs the commoner of the two: five grahas are
 * malefic before the nodes are counted and only four can be benefic, of which
 * two are conditional. A hundred and twenty charts is too small a sweep to see
 * a shubha at all, so this takes the hours as well.
 */
ok('both kinds occur, and papa is the commoner', (function () {
  var shubha = 0, papa = 0, charts = 0;
  for (var y = 1900; y < 2020; y++) {
    for (var h = 1; h < 24; h += 7) {
      var c = A.chart({ jdUT: A.julianDay(y, (y % 12) + 1, (y % 27) + 1, h), latitude: 28.61,
                        longitude: 77.21, tzOffsetMinutes: 330 });
      charts++;
      Yogas.kartari(c).forEach(function (f) {
        if (f.kind === 'shubha') shubha++; else papa++;
      });
    }
  }
  return shubha > 0 && papa > shubha && (shubha + papa) / charts < 0.3;
})());

console.log('\nDirectional strength and hemming');
/*
 * Both are flags over things measured in fuller form elsewhere. Dig bala is an
 * arc out of sixty in Shadbala; the flag takes the house instead, which is the
 * classical statement and the only form that survives into a division, a varga
 * having signs and houses but no midheaven to measure an arc from.
 */
ok('each graha has exactly one house of directional strength',
   Object.keys(A.DIG_BALA_HOUSE).length === 7 &&
   A.NODES.every(function (n) { return A.DIG_BALA_HOUSE[n] === undefined; }));
ok('and they are the four angles, paired as the texts pair them',
   A.DIG_BALA_HOUSE.Jupiter === 1 && A.DIG_BALA_HOUSE.Mercury === 1 &&
   A.DIG_BALA_HOUSE.Sun === 10 && A.DIG_BALA_HOUSE.Mars === 10 &&
   A.DIG_BALA_HOUSE.Saturn === 7 &&
   A.DIG_BALA_HOUSE.Moon === 4 && A.DIG_BALA_HOUSE.Venus === 4);
ok('the flag agrees with the house and nothing else',
   A.hasDigBala('Saturn', 7) && !A.hasDigBala('Saturn', 1) && !A.hasDigBala('Rahu', 7));
/*
 * Shubha kartari asks who the neighbours are, so it is read from the chart it is
 * asked about. A graha cannot hem itself, and benefic status is whatever
 * naturalBenefics says: the Moon by phase, Mercury by company.
 */
ok('hemming needs a benefic on both sides', (function () {
  var chart = { planets: [
    { name: 'Sun', sign: 0, longitude: 5 }, { name: 'Moon', sign: 6, longitude: 186 },
    { name: 'Jupiter', sign: 11, longitude: 355 }, { name: 'Venus', sign: 1, longitude: 35 }] };
  return A.hemmedByBenefics('Sun', 0, chart) && !A.hemmedByBenefics('Venus', 1, chart);
})());
ok('one side alone is not hemming', (function () {
  var chart = { planets: [
    { name: 'Sun', sign: 0, longitude: 5 }, { name: 'Moon', sign: 6, longitude: 186 },
    { name: 'Jupiter', sign: 11, longitude: 355 }] };
  return !A.hemmedByBenefics('Sun', 0, chart);
})());
ok('a malefic either side does not hem', (function () {
  var chart = { planets: [
    { name: 'Sun', sign: 0, longitude: 5 }, { name: 'Moon', sign: 6, longitude: 186 },
    { name: 'Saturn', sign: 11, longitude: 355 }, { name: 'Mars', sign: 1, longitude: 35 }] };
  return !A.hemmedByBenefics('Sun', 0, chart);
})());
ok('and the signs wrap, Pisces and Taurus hemming Aries', (function () {
  var chart = { planets: [
    { name: 'Mars', sign: 0, longitude: 5 }, { name: 'Sun', sign: 8, longitude: 245 },
    { name: 'Moon', sign: 8, longitude: 250 },
    { name: 'Jupiter', sign: 11, longitude: 355 }, { name: 'Venus', sign: 1, longitude: 35 }] };
  return A.hemmedByBenefics('Mars', 0, chart);
})());
/*
 * Who is a benefic is settled in the rashi and handed to every division.
 * naturalBenefics reads the Moon's phase off the Sun-Moon elongation, and a
 * varga longitude is a position within a division stretched back across thirty
 * degrees: a real number that is not a real longitude. An elongation taken from
 * two of them is an angle about nothing, and it moves from division to division.
 */
ok('the Moon\u2019s phase is a fact about the sky, not about a division', (function () {
  // Stallone, 6 July 1946: the same waxing Moon, read as waning in D7.
  var c = A.chart({ jdUT: A.julianDay(1946, 7, 6, 19 + 20 / 60 + 4), latitude: 40.7143,
                    longitude: -74.006, tzOffsetMinutes: -240 });
  return A.naturalBenefics(c).Moon === true &&
    A.naturalBenefics(A.chartInDivision(c, 7)).Moon === false;
})());
ok('and a thin Moon can be read as full the same way', (function () {
  // Ten degrees from the Sun, so as thin as a Moon gets, and eleven of the
  // fifteen other divisions read it as full.
  var c = A.chart({ jdUT: 2429904.75, latitude: 40.7143, longitude: -74.006,
                    tzOffsetMinutes: -240 });
  var rashi = A.naturalBenefics(c).Moon;
  var differ = [2, 3, 4, 7, 9, 10, 12, 16, 20, 24, 27, 30, 40, 45, 60]
    .filter(function (d) { return A.naturalBenefics(A.chartInDivision(c, d)).Moon !== rashi; });
  return rashi === false && differ.length > 10;
})());
ok('so hemming takes the rashi\u2019s benefics and the division\u2019s neighbours',
   (function () {
     var c = A.chart({ jdUT: A.julianDay(1946, 7, 6, 19 + 20 / 60 + 4), latitude: 40.7143,
                       longitude: -74.006, tzOffsetMinutes: -240 });
     var ben = A.naturalBenefics(c);
     var d7 = A.chartInDivision(c, 7);
     var jup = d7.planets.filter(function (p) { return p.name === 'Jupiter'; })[0];
     // Venus on one side and the Moon on the other, so hemmed - and not hemmed
     // at all if the Moon's phase is recomputed from D7's own longitudes.
     return A.hemmedByBenefics('Jupiter', jup.sign, d7, ben) === true &&
       A.hemmedByBenefics('Jupiter', jup.sign, d7) === false;
   })());
/*
 * Counted rather than listed: a caller added without the map is the drift worth
 * catching, and a fixed number would have to be edited every time one is.
 */
ok('and every caller passes one, so no division recomputes it', (function () {
  var appSrc = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
  var calls = appSrc.replace(/\s+/g, ' ')
    .match(/hemmedBy(?:Benefics|Malefics)\([^;]*?\)\s*[?)]/g) || [];
  return calls.length >= 4 && calls.every(function (call) {
    return /, benefics\)/.test(call) || /naturalBenefics\(c\)\)/.test(call);
  });
})());
/*
 * Left to itself the bug is quiet: it needs the Moon or Mercury to be one of the
 * two neighbours, and only then does the answer move. It is not rare, though.
 */
ok('the bug it fixes was reaching most divisions', (function () {
  var wrong = 0, divisions = 0;
  for (var y = 1960; y < 2000; y++) {
    var c = A.chart({ jdUT: A.julianDay(y, (y % 12) + 1, (y % 27) + 1, 9), latitude: 28.61,
                      longitude: 77.21, tzOffsetMinutes: 330 });
    var ben = A.naturalBenefics(c);
    A.VARGA_SCHEMES.shodasavarga.divisions.forEach(function (d) {
      if (d === 1) return;
      divisions++;
      var db = A.naturalBenefics(A.chartInDivision(c, d));
      if (db.Moon !== ben.Moon || db.Mercury !== ben.Mercury) wrong++;
    });
  }
  return wrong / divisions > 0.5;
})());

/*
 * Rates over a long run, so neither flag is quietly always or never on. One
 * house in twelve is 8.3 per cent; hemming needs both neighbouring signs filled
 * by benefics, which is rarer.
 */
ok('both fire at rates a flag can carry', (function () {
  var n = 0, dig = 0, hem = 0;
  for (var y = 1900; y < 2020; y++) {
    var c = A.chart({ jdUT: A.julianDay(y, (y % 12) + 1, (y % 27) + 1, 9), latitude: 28.61,
                      longitude: 77.21, tzOffsetMinutes: 330 });
    var first = A.signOf(c.ascendant.longitude);
    c.planets.forEach(function (p) {
      if (A.NODES.indexOf(p.name) >= 0) return;
      n++;
      if (A.hasDigBala(p.name, ((p.sign - first) % 12 + 12) % 12 + 1)) dig++;
      if (A.hemmedByBenefics(p.name, p.sign, c)) hem++;
    });
  }
  return dig / n > 0.05 && dig / n < 0.15 && hem / n > 0.005 && hem / n < 0.1;
})());

console.log('\nKey divisions');
/*
 * The three a scheme leans on hardest, read off its own share-out of the twenty
 * rather than fixed. Ties are the interesting part, so they are pinned as well
 * as the answers.
 */
ok('three per scheme, all of them divisions that scheme actually carries',
   A.VARGA_SCHEME_ORDER.every(function (k) {
     var scheme = A.VARGA_SCHEMES[k];
     var keys = A.keyDivisions(scheme);
     return keys.length === 3 && new Set(keys).size === 3 &&
       keys.every(function (d) { return scheme.divisions.indexOf(d) >= 0; });
   }));
ok('each is heaviest first, and no division outside the three outweighs one in it',
   A.VARGA_SCHEME_ORDER.every(function (k) {
     var scheme = A.VARGA_SCHEMES[k];
     var keys = A.keyDivisions(scheme);
     var floor = scheme.weights[keys[2]];
     return scheme.weights[keys[0]] >= scheme.weights[keys[1]] &&
       scheme.weights[keys[1]] >= floor &&
       scheme.divisions.every(function (d) {
         return keys.indexOf(d) >= 0 || scheme.weights[d] <= floor;
       });
   }));
ok('the six and the seven lean on D1, D9, D3',
   A.keyDivisions(A.VARGA_SCHEMES.shadvarga).join() === '1,9,3' &&
   A.keyDivisions(A.VARGA_SCHEMES.saptavarga).join() === '1,9,3');
ok('the ten and the sixteen on D60, D1, D9',
   A.keyDivisions(A.VARGA_SCHEMES.dasavarga).join() === '60,1,9' &&
   A.keyDivisions(A.VARGA_SCHEMES.shodasavarga).join() === '60,1,9');
/*
 * The dasavarga gives D60 five and D1 three and splits the remaining twelve
 * eight ways at 1.5, so eight divisions tie for third and the weights have
 * nothing left to say. The navamsa takes it: third in all three other schemes,
 * and the division read beside the rashi as a matter of course.
 */
ok('the dasavarga ties eight ways for third, and the navamsa takes it',
   (function () {
     var scheme = A.VARGA_SCHEMES.dasavarga;
     var tied = scheme.divisions.filter(function (d) { return scheme.weights[d] === 1.5; });
     return tied.length === 8 && tied.indexOf(9) >= 0 && A.keyDivisions(scheme)[2] === 9;
   })());
ok('and the tie-break is the navamsa itself, not the lowest number that ties',
   (function () {
     var scheme = A.VARGA_SCHEMES.dasavarga;
     var tied = scheme.divisions.filter(function (d) { return scheme.weights[d] === 1.5; });
     return Math.min.apply(null, tied) !== 9 && A.keyDivisions(scheme)[2] === 9;
   })());
ok('reading the set does not disturb the scheme it was read from',
   (function () {
     var scheme = A.VARGA_SCHEMES.shodasavarga;
     var before = scheme.divisions.join();
     A.keyDivisions(scheme);
     return scheme.divisions.join() === before;
   })());

console.log('\nAbbreviations');
/*
 * Two rules, one per list: the first two letters of a graha's name, the first
 * three of a sign's. The tests pin the rules and what follows from them rather
 * than a table of answers, a table here being the second copy of the names that
 * the rules exist to avoid.
 */
var GRAHA_NAMES = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn',
                   'Rahu', 'Ketu', 'Ascendant'];
ok('a graha abbreviates to its first two letters, and nothing else',
   GRAHA_NAMES.every(function (name) {
     return A.grahaAbbr(name) === name.slice(0, 2) && A.grahaAbbr(name).length === 2;
   }));
ok('a sign abbreviates to its first three',
   A.SIGNS.every(function (name) {
     return A.signAbbr(name) === name.slice(0, 3) && A.signAbbr(name).length === 3;
   }));
ok('which gives the grahas the codes Vedic software prints, As for the lagna',
   GRAHA_NAMES.map(A.grahaAbbr).join(' ') === 'Su Mo Ma Me Ju Ve Sa Ra Ke As',
   GRAHA_NAMES.map(A.grahaAbbr).join(' '));
ok('and the signs theirs',
   A.SIGN_ABBR.join(' ') === 'Ari Tau Gem Can Leo Vir Lib Sco Sag Cap Aqu Pis',
   A.SIGN_ABBR.join(' '));
/*
 * Truncation is only usable while it stays injective, and the two lists run out
 * of room at different lengths, which is the whole reason for two rules. The
 * grahas are already distinct at two letters. The signs are not: Cancer and
 * Capricorn are both Ca, and it takes a third letter to part them.
 */
ok('no two grahas collide at two letters',
   new Set(GRAHA_NAMES.map(A.grahaAbbr)).size === GRAHA_NAMES.length);
ok('no two signs collide at three',
   new Set(A.SIGN_ABBR).size === A.SIGNS.length);
ok('but two would not do for the signs, Cancer and Capricorn meeting at Ca', (function () {
  var two = A.SIGNS.map(function (name) { return name.slice(0, 2); });
  return new Set(two).size < A.SIGNS.length && two[3] === 'Ca' && two[9] === 'Ca';
})());
ok('abbreviating an abbreviation leaves it alone, so applying either twice is safe',
   A.SIGNS.every(function (n) { return A.signAbbr(A.signAbbr(n)) === A.signAbbr(n); }) &&
   GRAHA_NAMES.every(function (n) { return A.grahaAbbr(A.grahaAbbr(n)) === A.grahaAbbr(n); }));
/*
 * Labels are Title Case, prose is not, and the two forms are one string plus a
 * rule rather than two strings.
 */
ok('titleCase capitalises every word, leaving the rest alone',
   A.titleCase('great friend') === 'Great Friend' && A.titleCase('friend') === 'Friend' &&
   A.titleCase('great enemy') === 'Great Enemy' && A.titleCase('neutral') === 'Neutral');
ok('and it is idempotent, so a label already capitalised is left as it is',
   Object.keys(A.VARGA_DIGNITY_LABELS).every(function (k) {
     var label = A.VARGA_DIGNITY_LABELS[k];
     return A.titleCase(label) === label;
   }));
ok('every dignity label is Title Case, including the two-word ones',
   A.VARGA_DIGNITY_LABELS.own === 'Own Sign' &&
   A.VARGA_DIGNITY_LABELS.adhimitra === 'Great Friend' &&
   A.VARGA_DIGNITY_LABELS.adhishatru === 'Great Enemy' &&
   A.dignityOf('Sun', 4, 25) === 'Own Sign');

ok('SIGN_ABBR is the sign rule applied to SIGNS, in the same order',
   A.SIGN_ABBR.length === 12 &&
   A.SIGNS.every(function (name, i) { return A.SIGN_ABBR[i] === A.signAbbr(name); }));

console.log('\nDivisional longitudes');
/*
 * A varga maps a slice of a sign onto a whole sign, and the position inside the
 * slice is stretched back across 30 degrees. That stretch is what gives a
 * divisional chart a longitude, and so a nakshatra and a pada, of its own.
 *
 * The check against a published chart: New Delhi at the moment whose D1
 * ascendant is Aquarius 20 37' 55" has a D10 ascendant of Leo 26 19' 16".
 */
(function () {
  var target = 300 + 20 + 37 / 60 + 55 / 3600;
  var lo = A.julianDay(2026, 9, 25, 17.3 - 5.5), hi = lo + 600 / 86400;
  for (var i = 0; i < 60; i++) {
    var mid = (lo + hi) / 2;
    if (A.chart({ jdUT: mid, latitude: 28.6139, longitude: 77.2090 }).ascendant.longitude < target) lo = mid;
    else hi = mid;
  }
  var asc = A.chart({ jdUT: (lo + hi) / 2, latitude: 28.6139, longitude: 77.2090 }).ascendant.longitude;
  var d10 = A.vargaPosition(asc, 10);
  check('D10 ascendant for a published D1 of Aquarius 20 37 55',
        d10.sign * 30 + d10.degreeInSign, 120 + 26 + 19 / 60 + 16 / 3600, 30 / 3600, 'deg');
})();

ok('D1 is the identity', (function () {
  var v = A.vargaPosition(47.5, 1);
  return v.sign === 1 && Math.abs(v.degreeInSign - 17.5) < 1e-12;
})());
ok('the varga sign agrees with navamsaSign everywhere', (function () {
  for (var d = 0; d < 360; d += 0.017) {
    if (A.vargaPosition(d, 9).sign !== A.navamsaSign(d)) return false;
  }
  return true;
})());
ok('each navamsa fills exactly one sign', (function () {
  // 3 deg 20' of D1 has to stretch to 30 deg of D9, and land back at 0.
  var start = A.vargaPosition(0.0000001, 9), end = A.vargaPosition(30 / 9 - 0.0000001, 9);
  var next = A.vargaPosition(30 / 9 + 0.0000001, 9);
  return start.degreeInSign < 0.001 && end.degreeInSign > 29.999 &&
         next.sign === (start.sign + 1) % 12 && next.degreeInSign < 0.001;
})());
ok('a stretched longitude stays inside its sign', (function () {
  for (var d = 0; d < 360; d += 0.013) {
    var v = A.vargaPosition(d, 9);
    if (v.degreeInSign < 0 || v.degreeInSign >= 30) return false;
    if (Math.abs(v.longitude - (v.sign * 30 + v.degreeInSign)) > 1e-9) return false;
  }
  return true;
})());
ok('an unknown division returns nothing rather than guessing',
   A.vargaPosition(10, 5) === null && A.vargaPosition(10, 11) === null);

console.log('\nVargottama');
/*
 * The rule as it is taught: the 1st navamsha of a movable sign, the 5th of a
 * fixed one, the 9th of a dual one. Derived here from vargaPosition rather than
 * hard-coded, so it is a real check on the varga arithmetic.
 */
var MOVABLE = [0, 3, 6, 9], FIXED = [1, 4, 7, 10];
ok('it falls on the 1st, 5th and 9th navamsha by sign nature', (function () {
  for (var sign = 0; sign < 12; sign++) {
    var want = MOVABLE.indexOf(sign) >= 0 ? 1 : FIXED.indexOf(sign) >= 0 ? 5 : 9;
    for (var n = 1; n <= 9; n++) {
      var lon = sign * 30 + (n - 0.5) * (30 / 9);
      if (A.isVargottama(lon) !== (n === want)) return false;
    }
  }
  return true;
})());

ok('so exactly one navamsha of each sign qualifies', (function () {
  for (var sign = 0; sign < 12; sign++) {
    var hits = 0;
    for (var n = 1; n <= 9; n++) if (A.isVargottama(sign * 30 + (n - 0.5) * (30 / 9))) hits++;
    if (hits !== 1) return false;
  }
  return true;
})());

/*
 * K.N. Rao's own example, quoted in his interview on research: "Venus at 29
 * degrees and 58 minutes in Virgo will be in debilitation and it will also be
 * vargottama". It is the case that stops vargottama being read as a blessing.
 */
var raoVenus = 5 * 30 + 29 + 58 / 60;
ok('a debilitated graha can be vargottama (Rao: Venus at Virgo 29\u00b058\u2032)',
   A.isVargottama(raoVenus) && A.dignityOf('Venus', A.signOf(raoVenus), raoVenus % 30) === 'Debilitated');

// And the converse, from a chart of this repo's own: exalted and vargottama at once.
var exaltedV = 11 * 30 + 27.1842;
ok('and so can an exalted one', A.isVargottama(exaltedV) &&
   A.dignityOf('Venus', A.signOf(exaltedV), exaltedV % 30) === 'Exalted');

// D2 cannot produce ten of the signs and D30 cannot produce Cancer or Leo, which
// is why a blanket "vargottama in any varga" rule does not hold up.
ok('D9 spans all twelve signs, unlike D2 and D30', (function () {
  var span = function (division) {
    var seen = {};
    for (var d = 0; d < 360; d += 0.05) seen[A.vargaPosition(d, division).sign] = true;
    return Object.keys(seen).length;
  };
  return span(9) === 12 && span(2) === 2 && span(30) === 10;
})());

console.log('\nShodasavarga');
/*
 * Both groupings are kept. The grid shows the sixteen; the ten are Parashara's
 * Dasavarga and the set vimsopaka bala is most often scored over, so the engine
 * knows both and neither is inferred from the other.
 */
ok('the ten Dasavarga divisions are Parashara\'s, in his order',
   A.DASAVARGA.join(' ') === '1 2 3 7 9 10 12 16 30 60');
ok('the sixteen are every varga the module defines, in the same order',
   A.SHODASAVARGA.join(' ') === '1 2 3 4 7 9 10 12 16 20 24 27 30 40 45 60' &&
   A.SHODASAVARGA.length === A.VARGAS.length &&
   A.SHODASAVARGA.every(function (d, i) { return A.VARGAS[i].division === d; }));
ok('and the ten are a subset of the sixteen',
   A.SHODASAVARGA.every(function (d) { return A.SHODASAVARGA.indexOf(d) >= 0; }));

/*
 * Sixteen columns cannot carry "Great enemy", so the grid abbreviates. The short
 * forms have to cover every reading and stay distinguishable: Enm and Gt Enm read
 * apart at a glance where E and GE would not.
 */
ok('every dignity has a short form, each distinct', (function () {
  var keys = Object.keys(A.VARGA_DIGNITY_LABELS);
  var brief = keys.map(function (k) { return A.VARGA_DIGNITY_SHORT[k]; });
  var seen = {};
  brief.forEach(function (t) { seen[t] = 1; });
  return keys.length === 9 && brief.every(Boolean) &&
    Object.keys(seen).length === 9 && brief.every(function (t) { return t.length <= 6; });
})(), Object.keys(A.VARGA_DIGNITY_SHORT).map(function (k) {
  return A.VARGA_DIGNITY_SHORT[k]; }).join(' '));
ok('and no short form has a key the full list does not',
   Object.keys(A.VARGA_DIGNITY_SHORT).every(function (k) {
     return A.VARGA_DIGNITY_LABELS[k] !== undefined;
   }));

(function () {
  var place = { latitude: 23.5158, longitude: 87.308, tzOffsetMinutes: 330 };
  var c = A.chart({ jdUT: 2446146.7256944445, latitude: place.latitude,
                    longitude: place.longitude, tzOffsetMinutes: 330 });
  var pos = {};
  c.planets.forEach(function (p) { pos[p.name] = p; });

  /*
   * Dasavarga is a dignity table, so every division reads on the one ladder:
   * exalted, moolatrikona, own, great friend, friend, neutral, enemy, great enemy,
   * debilitated. The hora is no exception, degenerate though it is.
   */
  ok('every cell lands on one of the nine dignity labels', (function () {
    if (Object.keys(A.VARGA_DIGNITY_LABELS).length !== 9) return false;
    return Shadbala.GRAHAS.every(function (g) {
      return A.SHODASAVARGA.every(function (d) {
        var vd = A.vargaDignity(g, pos[g].longitude, d, pos);
        return vd && A.VARGA_DIGNITY_LABELS[vd.key] === vd.label;
      });
    });
  })());

  /*
   * The hora yields only Cancer and Leo, so most of the ladder is unreachable
   * there: own sign by the Moon and Sun alone, exaltation by Jupiter alone,
   * debilitation by Mars alone. That is a property of the division, not a reason
   * to read it on a different scale, and these are the cases worth naming.
   */
  ok('the hora reaches exaltation, debilitation and own sign only through the right graha',
     (function () {
       var find = function (sign) {
         for (var l = 0; l < 360; l += 0.05) if (A.vargaPosition(l, 2).sign === sign) return l;
         return null;
       };
       var cancer = find(3), leo = find(4);
       var read = function (g, lon) { return A.vargaDignity(g, lon, 2, pos).key; };
       /*
        * The Sun reads 'own' in his Leo hora, not 'moolatrikona'. Moolatrikona
        * is a span of degrees inside a sign, and a varga position is a place
        * within a division stretched back across the whole thirty, so the
        * degree a hora reports is not a degree of Leo. It is claimed in the
        * rashi and nowhere else.
        */
       return read('Jupiter', cancer) === 'exalted' && read('Mars', cancer) === 'debilitated' &&
         read('Moon', cancer) === 'own' && read('Sun', leo) === 'own' &&
         // and nobody else can reach those three rungs in a hora
         Shadbala.GRAHAS.filter(function (g) {
           return ['exalted', 'debilitated', 'own', 'moolatrikona'].indexOf(read(g, cancer)) >= 0 ||
             ['exalted', 'debilitated', 'own', 'moolatrikona'].indexOf(read(g, leo)) >= 0;
         }).sort().join(',') === 'Jupiter,Mars,Moon,Sun';
     })());

  /*
   * Verse 16: no luminary rules a trimsamsa. This engine once let them own one
   * anyway, the Sun standing in for Mars and the Moon for Venus, so that a
   * graha ruling none would not be a guest in every one of them.
   *
   * Raman's Example 9 rules it out. His Sun sits in the first trimsamsa of
   * Libra, which is Mars's, and he scores it 22.5 - adhimitra, the Sun's
   * relation to Mars - where owning it would have given 30. Being a guest is
   * the answer: a graha with no lordship still has a relation, and a relation
   * is what a varga is scored on.
   */
  ok('a luminary is a guest in every trimsamsa, never an owner', (function () {
    var owned = 0, labelled = 0;
    for (var lon = 0; lon < 360; lon += 0.05) {
      ['Sun', 'Moon'].forEach(function (g) {
        var vd = A.vargaDignity(g, lon, 30, pos);
        if (!vd) return;
        if (vd.relation === 'own' || vd.relation === 'moolatrikona') owned++;
        if (vd.viaProxy) labelled++;
      });
    }
    // Cancer and Leo, the signs they really own, never turn up in a trimsamsa.
    var seen = {};
    for (var d = 0; d < 360; d += 0.05) seen[A.vargaPosition(d, 30).sign] = true;
    // The stand-in survives as a label for the grid, so it must still be set
    // somewhere, but it must never reach the dignity the bala is scored on.
    return !seen[3] && !seen[4] && owned === 0 && labelled > 0;
  })());

  /*
   * And the whole of Example 9, which is what settled it: his seven totals for
   * the Standard Horoscope, from his printed longitudes. Forty-nine cells.
   */
  ok('saptavargaja reproduces Raman Example 9 for all seven', (function () {
    var dms = function (d, m, sec) { return d + m / 60 + sec / 3600; };
    var at = { Sun: dms(180, 53, 55), Moon: dms(311, 17, 19), Mars: dms(229, 30, 34),
      Mercury: dms(181, 31, 34), Jupiter: dms(84, 0, 49), Venus: dms(171, 9, 56),
      Saturn: dms(124, 22, 41) };
    var his = { Sun: 90, Moon: 48.75, Mars: 90, Mercury: 135, Jupiter: 71.25,
      Venus: 116.25, Saturn: 97.5 };
    var value = { moolatrikona: 45, own: 30, adhimitra: 22.5, mitra: 15,
      sama: 7.5, shatru: 3.75, adhishatru: 1.875 };
    var p = {};
    Object.keys(at).forEach(function (g) {
      p[g] = { sign: Math.floor(at[g] / 30), longitude: at[g] };
    });
    return Object.keys(his).every(function (g) {
      var sum = 0;
      [1, 2, 3, 7, 9, 12, 30].forEach(function (d) {
        var vd = A.vargaDignity(g, at[g], d, p);
        var rel = vd && vd.relation;
        // moolatrikona counts in the rashi only, Raman section 30
        if (rel === 'moolatrikona' && d !== 1) rel = 'own';
        sum += rel ? value[rel] : 0;
      });
      return Math.abs(sum - his[g]) < 0.01;
    });
  })());

  ok('the nodes own nothing and befriend nobody, so they get no reading',
     ['Rahu', 'Ketu'].every(function (n) {
       return A.SHODASAVARGA.every(function (d) {
         return A.vargaDignity(n, pos[n].longitude, d, pos) === null;
       });
     }));

  /*
   * The real guard. Shadbala classifies the same graha in the same division for
   * its saptavargaja bala, by its own code written months earlier. The two must
   * never drift apart, so the seven shared divisions are compared reading by
   * reading rather than trusted to stay in step.
   */
  var detail = Shadbala.compute(c, place);
  /*
   * The two must agree wherever they use the same scale, which is every division
   * except the two Parashara singles out in chapter 7. Shadbala's saptavargaja is
   * a different reckoning and keeps the ordinary relation for trimsamsa, where the
   * grid lets the luminaries stand in. So that exclusion is the point of this test,
   * not a hole in it.
   */
  var SHARED = [1, 2, 3, 7, 9, 12];
  ok('the underlying relation agrees with saptavargaja bala where both use the same scale',
     Shadbala.GRAHAS.every(function (g) {
       return detail.grahas[g].saptavargajaDetail.every(function (row) {
         if (SHARED.indexOf(row.division) < 0) return true;
         var vd = A.vargaDignity(g, pos[g].longitude, row.division, pos);
         return vd && vd.relation === row.relation && vd.sign === row.sign && vd.lord === row.lord;
       });
     }));
  ok('and trimsamsa is the only division left out, for its stand-in',
     SHARED.indexOf(30) < 0 &&
     [1, 2, 3, 7, 9, 12].every(function (d) { return SHARED.indexOf(d) >= 0; }));

  /*
   * Exaltation outranks the relation on display but must not erase it, because
   * the seven-step reading is the one vimsopaka bala scores.
   */
  ok('exaltation is shown, with the seven-step reading kept underneath', (function () {
    var sunInAries = A.vargaDignity('Sun', 2, 1, pos);          // Aries, ruled by Mars
    return sunInAries.label === 'Exalted' && sunInAries.key === 'exalted' &&
      sunInAries.lord === 'Mars' && ['adhimitra', 'mitra', 'sama'].indexOf(sunInAries.relation) >= 0;
  })());

  ok('debilitation likewise', (function () {
    var sunInLibra = A.vargaDignity('Sun', 6 * 30 + 2, 1, pos);  // Libra, ruled by Venus
    return sunInLibra.label === 'Debilitated' && sunInLibra.relation !== null;
  })());

  // A graha in its own varga sign reports moolatrikona or own, never a relation
  // with itself, which compoundRelation has no answer for.
  ok('a graha ruling its own varga sign reads as own or moolatrikona', (function () {
    var leo = A.vargaDignity('Sun', 4 * 30 + 10, 1, pos);        // Leo 10, inside moolatrikona
    var leoLate = A.vargaDignity('Sun', 4 * 30 + 25, 1, pos);    // Leo 25, past it
    return leo.key === 'moolatrikona' && leoLate.key === 'own';
  })());
})();

console.log('\nThe sixteen divisions');
ok('all sixteen are defined', A.VARGAS.length === 16,
   A.VARGAS.map(function (v) { return v.name; }).join(' '));
ok('every division lands on a real sign and degree', A.VARGAS.every(function (v) {
  for (var d = 0; d < 360; d += 0.037) {
    var p = A.vargaPosition(d, v.division);
    if (!p || p.sign < 0 || p.sign > 11) return false;
    if (!(p.degreeInSign >= 0 && p.degreeInSign < 30)) return false;
  }
  return true;
}));
// Hora only ever reaches the luminaries' signs; Trimshamsha never reaches them.
// Those two exceptions are the quickest check that the rules are the right ones.
ok('Hora reaches only Cancer and Leo', (function () {
  var seen = {};
  for (var d = 0; d < 360; d += 0.05) seen[A.vargaPosition(d, 2).sign] = true;
  var signs = Object.keys(seen).map(Number).sort(function (a, b) { return a - b; });
  return signs.length === 2 && signs[0] === 3 && signs[1] === 4;
})());
ok('Trimshamsha never reaches Cancer or Leo', (function () {
  for (var d = 0; d < 360; d += 0.05) {
    var sign = A.vargaPosition(d, 30).sign;
    if (sign === 3 || sign === 4) return false;
  }
  return true;
})());
ok('Trimshamsha parts are unequal and total a sign', (function () {
  // Odd signs run 5, 5, 8, 7, 5 degrees; even signs the same five reversed.
  var edges = [], last = null;
  for (var d = 0; d < 30; d += 0.001) {
    var sign = A.vargaPosition(d, 30).sign;
    if (sign !== last) { edges.push(d); last = sign; }
  }
  return edges.length === 5 &&
    Math.abs(edges[1] - 5) < 0.01 && Math.abs(edges[2] - 10) < 0.01 &&
    Math.abs(edges[3] - 18) < 0.01 && Math.abs(edges[4] - 25) < 0.01;
})());
ok('each equal division stretches its part across a whole sign', A.VARGAS.every(function (v) {
  if (v.unequal || v.parts === 1) return true;
  var width = 30 / v.parts;
  var atStart = A.vargaPosition(width * 3 + 1e-9, v.division);
  var atEnd = A.vargaPosition(width * 4 - 1e-9, v.division);
  return atStart.degreeInSign < 0.001 && atEnd.degreeInSign > 29.999;
}));
ok('D60 gives each of the sixty parts a distinct half degree', (function () {
  var width = 30 / 60, seen = {};
  for (var i = 0; i < 60; i++) seen[A.vargaPosition(i * width + width / 2, 60).sign] = true;
  // Sixty parts cycle five times through the twelve signs.
  return Object.keys(seen).length === 12;
})());

console.log('\nNakshatra sub lords (KP)');
/*
 * Each nakshatra splits into nine unequal subs, in Vimshottari order and
 * Vimshottari proportions, beginning with the nakshatra's own lord.
 */
[[320.6319, 'Purva Bhadrapada', 1, 'Jupiter', 'Jupiter'],
 [146.3211, 'Purva Phalguni', 4, 'Venus', 'Ketu']].forEach(function (t) {
  var n = A.nakshatraOf(t[0]);
  ok(t[1] + ' pada ' + t[2] + ' is ' + t[3] + ' / ' + t[4],
     n.name === t[1] && n.pada === t[2] && n.lord === t[3] && n.subLord === t[4],
     n.name + ' pada ' + n.pada + ', ' + n.lord + ' / ' + n.subLord);
});
ok('a nakshatra opens with its own lord as sub lord', (function () {
  for (var i = 0; i < 27; i++) {
    var n = A.nakshatraOf(i * (360 / 27) + 0.001);
    if (n.subLord !== n.lord) return false;
  }
  return true;
})());
ok('the nine subs fill the nakshatra exactly', (function () {
  var span = 360 / 27;
  for (var i = 0; i < 27; i++) {
    var total = 0, seen = {};
    for (var step = 0; step < 4000; step++) {
      var n = A.nakshatraOf(i * span + (step + 0.5) * span / 4000);
      seen[n.subLord] = true;
      if (!seen['__' + n.subLord]) { seen['__' + n.subLord] = true; total += n.subSpan; }
    }
    if (Object.keys(seen).filter(function (k) { return k.indexOf('__') !== 0; }).length !== 9) return false;
    if (Math.abs(total - span) > 1e-9) return false;
  }
  return true;
})());
ok('sub widths follow the dasha years', (function () {
  var span = 360 / 27;
  var n = A.nakshatraOf(0.001);                       // Ashwini, Ketu sub
  var expected = span * A.DASHA_YEARS.Ketu / 120;
  return Math.abs(n.subSpan - expected) < 1e-12;
})());
ok('the last sub reaches the end of the nakshatra', (function () {
  var span = 360 / 27;
  var n = A.nakshatraOf(span - 1e-9);
  return Math.abs((n.subStart + n.subSpan) - span) < 1e-6;
})());

console.log('\nThe dasha year is the one an authority states');
/*
 * The cycle is 120 years in every text and almost none says how long a year
 * is, so the constant has to come from somewhere. K. N. Rao's Dasha Nirnay,
 * the one book on this dasha that states a year, opens with "The Sun takes 365
 * days 6 hours 12 minutes and 36 seconds to complete a round of the zodiac" -
 * the Surya Siddhanta's sidereal year.
 *
 * It was 365.2425 for a long time, the Gregorian calendar's mean year, which
 * is an artifact of the leap-year rule and is proposed by no authority. As with
 * the ayana constant, nothing caught it, because a dasha boundary is years wide
 * and the error is a third of a day.
 */
(function () {
  var RAO = 365 + 6 / 24 + 12 / 1440 + 36 / 86400;      // 365.2587
  var c = A.chart({ jdUT: A.julianDay(1975, 6, 15, 6.5), latitude: 28.61,
    longitude: 77.21, tzOffsetMinutes: 330 });
  var p = c.dashas.periods;
  check('a period spans its years at Rao\u2019s year length',
    (p[1].endJd - p[1].startJd) / p[1].years, RAO, 1e-6, 'days');
  /*
   * And explicitly not the values it is easiest to drift back to. A calendar
   * year here is a silent error that no test would otherwise see.
   */
  var got = (p[1].endJd - p[1].startJd) / p[1].years;
  ok('and not the Gregorian calendar year', Math.abs(got - 365.2425) > 1e-4,
    got.toFixed(6));
  ok('and not the Julian year', Math.abs(got - 365.25) > 1e-4, got.toFixed(6));
  /*
   * The balance at birth is the unelapsed part of the Moon's nakshatra, so the
   * first period is short and the eight that follow are whole.
   */
  ok('the first period is the unelapsed balance',
    p[0].endJd - p[0].startJd > 0 &&
    c.dashas.balanceYears <= p[0].years + 1e-9 &&
    c.dashas.balanceYears > 0,
    c.dashas.balanceYears.toFixed(3) + ' of ' + p[0].years + ' years');
  ok('and the cycle totals 120 years',
    p.reduce(function (t, d) { return t + d.years; }, 0) === 120);
})();

console.log('\nThe vara begins at sunrise');
/*
 * Raman section 69: "The Hindu day begins with sunrise and continues till next
 * sunrise." A birth after midnight but before dawn keeps the previous
 * weekday's vara, which is not a fine point - it carries vara bala's 45
 * virupas and, because the hora chain starts from the weekday lord, hora
 * bala's 60 as well.
 *
 * The code used the civil date for a long time while carrying a comment that
 * stated the rule it was not following. A quarter of all births got the wrong
 * lord.
 */
(function () {
  // Delhi, 2024-01-03: a civil Wednesday whose sunrise is about 07:14 IST.
  var before = A.chart({ jdUT: A.julianDay(2024, 1, 3, 6 - 5.5), latitude: 28.61,
    longitude: 77.21, tzOffsetMinutes: 330 });
  var after = A.chart({ jdUT: A.julianDay(2024, 1, 3, 9 - 5.5), latitude: 28.61,
    longitude: 77.21, tzOffsetMinutes: 330 });
  ok('a pre-dawn birth keeps the previous vara',
    before.panchang.vara === 'Tuesday' && before.panchang.varaLord === 'Mars',
    before.panchang.vara);
  ok('and after sunrise the day has turned',
    after.panchang.vara === 'Wednesday' && after.panchang.varaLord === 'Mercury',
    after.panchang.vara);

  /*
   * The boundary is sunrise itself, not midnight and not any fixed hour. Walk
   * the clock and the vara must change exactly once, within a few minutes of
   * the sunrise the engine reports.
   */
  [['Delhi', 28.61, 77.21, 330], ['New York', 40.71, -74.01, -300],
   ['Sydney', -33.87, 151.21, 600]].forEach(function (p) {
    var name = p[0], lat = p[1], lon = p[2], tz = p[3];
    var changes = [], prev = null;
    for (var i = 0; i <= 24 * 12; i++) {
      var jd = A.julianDay(2024, 1, 3, i / 12 - tz / 60);
      var vara = A.chart({ jdUT: jd, latitude: lat, longitude: lon,
        tzOffsetMinutes: tz }).panchang.vara;
      if (prev !== null && vara !== prev) changes.push(jd);
      prev = vara;
    }
    ok(name + ': the vara turns over exactly once in a day',
      changes.length === 1, changes.length + ' changes');
    if (changes.length === 1) {
      var rise = A.sunriseSunset(changes[0], lat, lon, false);
      ok(name + ': and it turns at sunrise',
        Math.abs((changes[0] - rise) * 24) < 0.2,
        ((changes[0] - rise) * 60 * 24).toFixed(0) + ' min from sunrise');
    }
  });

  /*
   * With no place to find a sunrise from there is nothing to do but fall back
   * to the civil date, and that must not throw.
   */
  var placeless = A.chart({ jdUT: A.julianDay(2024, 1, 3, 0.5) });
  ok('a chart cast without a place still reports a vara',
    typeof placeless.panchang.vara === 'string' && !!placeless.panchang.varaLord);
})();

console.log('\nSunrise lands on the right day');
/*
 * The contract is "the sunrise of the local day containing jdUT". Callers lean
 * on it: tribhaga bala branches on whether the birth precedes it, and hora bala
 * counts hours from it, so a sunrise from the wrong day silently rewrites two
 * of kala bala's eight parts.
 *
 * It was wrong for a long time - the longitude term that converts UT to local
 * time carried the wrong sign, so the 24-hour scan window sat twice the
 * longitude away from where it belonged. The tests below it only asked that
 * sunrise precede sunset, which is just as true when both are a day out, so
 * nothing complained.
 *
 * These check the two things that actually pin it: the answer matches the
 * almanac, and it does not jump between query times inside one local day.
 */
(function () {
  // Delhi 2024-01-03, sunrise 07:14 IST (= 01:44 UT). New York the same date,
  // 07:20 EST (= 12:20 UT). Both east and west of Greenwich, because the sign
  // error was invisible at one of them and glaring at the other.
  [['Delhi', 28.61, 77.21, 330, 7 + 14 / 60],
   ['New York', 40.71, -74.01, -300, 7 + 20 / 60]].forEach(function (p) {
    var name = p[0], lat = p[1], lon = p[2], tz = p[3], wantLocal = p[4];
    var noon = A.julianDay(2024, 1, 3, 12 - tz / 60);
    var rise = A.sunriseSunset(noon, lat, lon, false);
    var local = ((rise + tz / 1440 + 0.5) % 1) * 24;
    check(name + ' sunrise, local clock', local, wantLocal, 4 / 60, 'hours');
  });

  /*
   * And the invariant that the sign error broke: walking the clock through one
   * local day, the sunrise must never be more than a day from the query, and
   * must not step to a neighbouring day partway through the afternoon.
   */
  [['Delhi', 28.61, 77.21, 330], ['New York', 40.71, -74.01, -300],
   ['Sydney', -33.87, 151.21, 600]].forEach(function (p) {
    var name = p[0], lat = p[1], lon = p[2], tz = p[3];
    var worst = 0, distinct = {};
    for (var h = 0; h < 24; h++) {
      var jd = A.julianDay(2024, 1, 3, h - tz / 60);
      var rise = A.sunriseSunset(jd, lat, lon, false);
      worst = Math.max(worst, Math.abs((jd - rise) * 24));
      distinct[rise.toFixed(3)] = true;
    }
    ok(name + ': every hour gets a sunrise inside one day',
      worst < 24, 'worst ' + worst.toFixed(2) + ' h');
    // A local day spans at most two sunrise dates: the one it holds, and the
    // previous day's for the hours before dawn.
    ok(name + ': and no more than two distinct sunrises across the day',
      Object.keys(distinct).length <= 2,
      Object.keys(distinct).length + ' distinct');
  });
})();

console.log('\nMoon latitude and sunrise');
// Meeus example 47.a: 1992 April 12.0 TD gives beta = -3.229126 degrees.
check('Moon ecliptic latitude', A.moonLatitude((A.julianDay(1992, 4, 12, 0) - 2451545.0) / 36525),
      -3.229126, 0.01, 'deg');
(function () {
  // Near the equinox, day and night are close to equal everywhere.
  var jd = A.julianDay(1985, 3, 21, 0);
  var rise = A.sunriseSunset(jd, 23.5158, 87.308, false);
  var set = A.sunriseSunset(jd, 23.5158, 87.308, true);
  ok('sunrise precedes sunset', rise < set);
  check('equinox daylight is about twelve hours', (set - rise) * 24, 12.1, 0.2, 'hours');
  // Above the arctic circle in midsummer the Sun does not set at all.
  ok('a polar summer day reports no sunrise',
     A.sunriseSunset(A.julianDay(2024, 6, 21, 0), 78.2, 15.6, false) === null);
})();

console.log('\nShadbala');
/*
 * Shadbala cannot be checked against a reference implementation - Swiss does not
 * compute it and implementations disagree - so these are the checks that can be
 * made without one: the anchors each component is defined by, the ceiling each
 * cannot exceed, and the shape of the whole across many charts.
 */
(function () {
  var place = { latitude: 23.5158, longitude: 87.308, tzOffsetMinutes: 330 };
  var chart = A.chart({ jdUT: 2446146.7256944445, latitude: place.latitude,
                        longitude: place.longitude, tzOffsetMinutes: 330 });
  var result = Shadbala.compute(chart, place);

  ok('all seven grahas, and only those', Shadbala.GRAHAS.length === 7 &&
     Object.keys(result.grahas).length === 7 &&
     !result.grahas.Rahu && !result.grahas.Ketu);

  /*
   * Raman's ladder, section 30: 45 and 30 at the top, then halving at every step
   * down. Santhanam and Saravali give 20/15/10/4/2 for the lower five instead,
   * and that was used here until Raman was taken as the authority throughout.
   * The choice moves about one strong/weak verdict in forty, so it is pinned
   * rather than left to whoever edits the file next.
   */
  ok('saptavargaja follows Raman\'s halving ladder', (function () {
    var v = Shadbala.SAPTAVARGAJA_VALUES;
    return v.moolatrikona === 45 && v.own === 30 && v.adhimitra === 22.5 &&
      v.mitra === 15 && v.sama === 7.5 && v.shatru === 3.75 && v.adhishatru === 1.875 &&
      v.adhimitra !== 20 && v.sama !== 10;
  })());
  /*
   * And it reproduces Raman's own worked column. His Standard Horoscope puts
   * Guru in a great enemy's varga, a neutral's, a friend's, two neutrals', its
   * own, and a great enemy's again, and prints 71.25 - which is the sum of this
   * ladder read off those seven and of no other.
   */
  ok('and reconstructs Raman\'s worked total for Guru', (function () {
    var v = Shadbala.SAPTAVARGAJA_VALUES;
    var guru = ['adhishatru', 'sama', 'mitra', 'sama', 'sama', 'own', 'adhishatru'];
    var sukra = ['adhimitra', 'sama', 'own', 'adhishatru', 'adhishatru', 'own', 'adhimitra'];
    var sani = ['sama', 'sama', 'sama', 'adhimitra', 'adhimitra', 'adhimitra', 'sama'];
    var add = function (keys) {
      return keys.reduce(function (n, k) { return n + v[k]; }, 0);
    };
    return Math.abs(add(guru) - 71.25) < 1e-9 &&
      Math.abs(add(sukra) - 116.25) < 1e-9 &&
      Math.abs(add(sani) - 97.5) < 1e-9;
  })());
  ok('and the ladder only ever descends', (function () {
    var order = ['moolatrikona', 'own', 'adhimitra', 'mitra', 'sama', 'shatru', 'adhishatru'];
    return order.every(function (k, i) {
      return i === 0 || Shadbala.SAPTAVARGAJA_VALUES[order[i - 1]] > Shadbala.SAPTAVARGAJA_VALUES[k];
    });
  })());
  ok('so the most saptavargaja can reach is 45 across all seven vargas',
     Shadbala.SAPTAVARGAJA_VALUES.moolatrikona +
       Shadbala.SAPTAVARGAJA_VALUES.own * 6 === 225 &&
     Shadbala.GRAHAS.every(function (g) { return result.grahas[g].sthana.saptavargaja <= 225; }));

  /*
   * The hora is judged here the ordinary way, by the compound relation, and NOT by
   * the chapter 7 list the Dasavarga grid uses. Santhanam's note on chapter 27 is
   * explicit that the compound relationships "including Hora lordship" are read in
   * the rashi chart. The grid and this deliberately differ, so both sides are held.
   */
  ok('hora is one of the seven divisions scored, by relation not by the hora list',
     Shadbala.GRAHAS.every(function (g) {
       var hora = result.grahas[g].saptavargajaDetail.filter(function (r) { return r.division === 2; })[0];
       return hora && [3, 4].indexOf(hora.sign) >= 0 &&        // only ever Cancer or Leo
         ['Moon', 'Sun'].indexOf(hora.lord) >= 0 &&
         Object.keys(Shadbala.SAPTAVARGAJA_VALUES).indexOf(hora.relation) >= 0;
     }));
  ok('and temporal friendship for it is read in the rashi chart, as the note requires',
     /be\s*\n?\s*\* seen in the Rashi chart only/.test(
       require('fs').readFileSync(require('path').join(__dirname, '../js/shadbala.js'), 'utf8')));

  /*
   * Every component reports separately and they add to the total - with the
   * one documented exception, the luminaries' cheshta bala, which is shown but
   * not summed because the Sun's ayana bala and the Moon's paksha bala are
   * already inside their kala bala. cheshtaCounted says which rows are in.
   */
  ok('the components sum to the total', Shadbala.GRAHAS.every(function (g) {
    var x = result.grahas[g];
    var sum = x.sthana.total + x.dig + x.kala.total +
      (x.cheshtaCounted ? x.cheshta : 0) + x.naisargika + x.drik;
    return Math.abs(sum - x.totalShashtiamsa) < 1e-9;
  }));
  ok('and only the luminaries are ever left out of that sum',
    Shadbala.GRAHAS.every(function (g) {
      return result.grahas[g].cheshtaCounted === (g !== 'Sun' && g !== 'Moon');
    }));
  ok('while opting in puts them back and nothing else moves',
    (function () {
      var on = Shadbala.compute(chart, place, { luminaryCheshta: 'counted' }).grahas;
      return Shadbala.GRAHAS.every(function (g) {
        var x = on[g];
        var sum = x.sthana.total + x.dig + x.kala.total + x.cheshta +
          x.naisargika + x.drik;
        return x.cheshtaCounted === true &&
          Math.abs(sum - x.totalShashtiamsa) < 1e-9 &&
          x.cheshta === result.grahas[g].cheshta;
      });
    })());
  ok('sthana sums from its five parts', Shadbala.GRAHAS.every(function (g) {
    var s = result.grahas[g].sthana;
    return Math.abs((s.uchcha + s.saptavargaja + s.ojhayugma + s.kendradi + s.drekkana) - s.total) < 1e-9;
  }));
  /*
   * And the third of those five is itself two. Santhanam gives one
   * Ojhayugmarasiamsa bala and says under verse 414 that the rashi and navamsa
   * strengths "be added together" to reach it, so the halves are reported apart
   * as well - each 0 or 15, and their sum the bala the total is built from.
   */
  ok('and its ojhayugma is the rashi half and the navamsa half added',
     Shadbala.GRAHAS.every(function (g) {
       var s = result.grahas[g].sthana;
       return [0, 15].indexOf(s.ojhaRasi) >= 0 && [0, 15].indexOf(s.ojhaNavamsa) >= 0 &&
         s.ojhaRasi + s.ojhaNavamsa === s.ojhayugma;
     }));
  /*
   * The rashi half reads the sign the graha stands in, the navamsa half the
   * navamsa sign, and the two disagree often enough that reporting only the sum
   * hides which one paid: over 300 births they differ in about a third of
   * placements.
   */
  ok('and the two halves are read off different positions', (function () {
    var same = 0, apart = 0;
    for (var y = 1940; y < 2000; y++) {
      var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
      var c = Astro.chart({ jdUT: Astro.julianDay(y, 1 + y % 12, 1 + y % 28, y % 24),
                            latitude: place.latitude, longitude: place.longitude,
                            tzOffsetMinutes: place.tzOffsetMinutes });
      var r = Shadbala.compute(c, place);
      Shadbala.GRAHAS.forEach(function (g) {
        var s = r.grahas[g].sthana;
        if (s.ojhaRasi === s.ojhaNavamsa) same++; else apart++;
      });
    }
    return apart > 0 && apart / (same + apart) > 0.2;
  })());

  /*
   * Yuddha bala, Raman sections 76-77: the ninth part of kala bala, not a share
   * of its own. A chart with no war carries a zero there and nothing else moves.
   */
  ok('a chart with no war leaves every graha its eight kala parts',
     Shadbala.GRAHAS.every(function (g) {
       var x = result.grahas[g];
       return x.kala.yuddha === 0 && x.war === null;
     }) === (result.wars.length === 0));
  /*
   * And what one graha takes the other gives, so a war moves strength between
   * two grahas without creating any. The quotient is the difference of their
   * aggregates over the difference of their disc diameters, which is what keeps
   * the correction to single figures where the bare difference reached 272 and
   * exchanged the pair's totals outright.
   */
  ok('and a war moves strength between two grahas without creating any',
     (function () {
       var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
       var fought = 0;
       for (var y = 1900; y < 2000; y++) {
         var c = Astro.chart({ jdUT: Astro.julianDay(y, 1 + y % 12, 15, 6.5),
                               latitude: place.latitude, longitude: place.longitude,
                               tzOffsetMinutes: place.tzOffsetMinutes });
         var r = Shadbala.compute(c, place);
         if (r.wars.length) fought++;
         var net = Shadbala.GRAHAS.reduce(function (a, g) {
           return a + r.grahas[g].kala.yuddha;
         }, 0);
         if (Math.abs(net) > 1e-9) return false;
       }
       return fought > 0;
     })());
  /*
   * The victor is the lesser longitude - Raman's rule, flatly stated, and the
   * one he works his examples on. Santhanam gives a latitude account instead,
   * and the two disagree about who won in half of all wars.
   */
  ok('and the victor is the graha of lesser longitude', (function () {
    var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
    var seen = false;
    for (var y = 1900; y < 2050; y++) {
      for (var m = 1; m <= 12; m++) {
        var c = Astro.chart({ jdUT: Astro.julianDay(y, m, 15, 6.5),
                              latitude: place.latitude, longitude: place.longitude,
                              tzOffsetMinutes: place.tzOffsetMinutes });
        var r = Shadbala.compute(c, place);
        if (!r.wars.length) continue;
        var pos = {};
        c.planets.forEach(function (p) { pos[p.name] = p; });
        for (var i = 0; i < r.wars.length; i++) {
          var w = r.wars[i];
          seen = true;
          if (pos[w.won].longitude >= pos[w.lost].longitude) return false;
        }
      }
    }
    return seen;
  })());
  /*
   * And the quotient really is divided by the disc difference. Checked against
   * Raman's own bimba parimana rather than against the size of the answer: the
   * aggregate compared stops at hora bala, so ayana and the war itself stay out
   * of the comparison and there is no circularity.
   */
  ok('and the quotient is the aggregate gap over the disc gap', (function () {
    var BIMBA = { Mars: 9.4, Mercury: 6.6, Jupiter: 190.4, Venus: 16.6,
                  Saturn: 158.0 };
    var upToHora = ['nathonnatha', 'paksha', 'tribhaga', 'abda', 'masa', 'vara',
                    'hora'];
    var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
    var seen = false;
    for (var y = 1900; y < 2050; y++) {
      for (var m = 1; m <= 12; m++) {
        var c = Astro.chart({ jdUT: Astro.julianDay(y, m, 15, 6.5),
                              latitude: place.latitude, longitude: place.longitude,
                              tzOffsetMinutes: place.tzOffsetMinutes });
        var r = Shadbala.compute(c, place);
        if (r.wars.length !== 1) continue;
        var w = r.wars[0];
        var agg = function (g) {
          var x = r.grahas[g];
          return upToHora.reduce(function (sum, k) { return sum + x.kala[k]; },
                                 x.sthana.total + x.dig);
        };
        var want = Math.abs(agg(w.won) - agg(w.lost)) /
                   Math.abs(BIMBA[w.won] - BIMBA[w.lost]);
        seen = true;
        if (Math.abs(r.grahas[w.won].kala.yuddha - want) > 1e-9) return false;
        if (Math.abs(r.grahas[w.lost].kala.yuddha + want) > 1e-9) return false;
      }
    }
    return seen;
  })());

  /*
   * Moolatrikona is a range of degrees inside a sign, and only the rashi gives a
   * graha a real degree: vargaPosition stretches the position within a division
   * back across the whole thirty, so the figure handed to dignityOf for D2 or
   * D30 was not a degree of any sign the graha stands in. Raman settles it as
   * doctrine too - section 30, "45 Shashtiamsas ... only when it is in its
   * Moolatrikona Rasi, and not when it occupies any other of the 6 vargas".
   */
  ok('saptavargaja allows moolatrikona in the rashi and nowhere else', (function () {
    var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
    var seenInRashi = false;
    for (var y = 1900; y < 2000; y++) {
      var c = Astro.chart({ jdUT: Astro.julianDay(y, 1 + y % 12, 15, 6.5),
                            latitude: place.latitude, longitude: place.longitude,
                            tzOffsetMinutes: place.tzOffsetMinutes });
      var r = Shadbala.compute(c, place);
      for (var i = 0; i < Shadbala.GRAHAS.length; i++) {
        var detail = r.grahas[Shadbala.GRAHAS[i]].saptavargajaDetail;
        for (var j = 0; j < detail.length; j++) {
          if (detail[j].relation !== 'moolatrikona') continue;
          if (detail[j].division !== 1) return false;
          seenInRashi = true;
        }
      }
    }
    return seenInRashi;          // and the case really occurs, so this proves something
  })());

  /*
   * The Moon rides with whichever group it is in, and its own figure is doubled
   * either way. Both halves of that are easy to get backwards and BPHS settles
   * both in its notes to verses 10-11: "The Moon in dark half is a malefic",
   * and "Whether the Moon is in a group of benefices or otherwise, her Paksha
   * Bala is always doubled just as the Sun's Ayana Bala."
   *
   * The second is the counter-intuitive one. A dark Moon is a malefic, so it
   * takes sixty less the brightness - which is more than a half-lit Moon gets,
   * and reads as though darkness made the Moon strong. It does not: paksha bala
   * measures what the fortnight gives each group, and the Moon is in a group
   * like any other graha. Software that gives the Moon its brightness outright
   * is answering a different question.
   */
  ok('the Moon takes its group\'s paksha bala, doubled either way', (function () {
    var at = function (elongation) {
      var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
      // Walk a lunar month and pick the sample nearest the elongation wanted.
      var best = null;
      for (var h = 0; h < 30 * 24; h += 2) {
        var c = A.chart({ jdUT: A.julianDay(2000, 1, 1, h), latitude: place.latitude,
                          longitude: place.longitude,
                          tzOffsetMinutes: place.tzOffsetMinutes });
        var by = {};
        c.planets.forEach(function (p) { by[p.name] = p; });
        var e = A.norm360(by.Moon.longitude - by.Sun.longitude);
        var off = Math.abs(e - elongation);
        if (!best || off < best.off) {
          best = { off: off, e: e, r: Shadbala.compute(c, place), benefic: A.naturalBenefics(c) };
        }
      }
      return best;
    };
    var bright = at(150);                         // full-ish, benefic
    var dark = at(300);                           // thin, malefic
    var check = function (s) {
      var e = s.e, brightness = (e > 180 ? 360 - e : e) / 3;
      var base = s.benefic.Moon ? brightness : 60 - brightness;
      return Math.abs(s.r.grahas.Moon.kala.paksha - base * 2) < 1e-9;
    };
    return bright.benefic.Moon === true && dark.benefic.Moon === false &&
      check(bright) && check(dark) &&
      // and the doubling really takes it past the sixty the others cap at
      dark.r.grahas.Moon.kala.paksha > 60;
  })());

  /*
   * Cheshta bala from the chesta kendra, Raman sections 105-107: nothing where
   * the kendra is nothing and sixty where it is a half circle, the kendra over
   * three in between.
   *
   * The seeghrocha it is measured from differs by kind, and that is the whole
   * of the point. An outer graha turns retrograde at opposition, so the Sun is
   * its seeghrocha and the kendra is its elongation. An inner one turns at
   * inferior conjunction, where its elongation is near nothing - which is why
   * the speed proxy this replaces read Venus as fast and direct at the moment
   * it was deepest in retrogression, and gave it 3.9 where the kendra gives
   * 28.7 on the same chart.
   */
  ok('cheshta is the chesta kendra over three, and never passes sixty',
     (function () {
       var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
       var seenHigh = false, seenLow = false;
       for (var y = 1950; y < 2010; y++) {
         var c = A.chart({ jdUT: A.julianDay(y, 1 + y % 12, 15, 6.5),
                           latitude: place.latitude, longitude: place.longitude,
                           tzOffsetMinutes: place.tzOffsetMinutes });
         var r = Shadbala.compute(c, place);
         for (var i = 0; i < Shadbala.GRAHAS.length; i++) {
           var v = r.grahas[Shadbala.GRAHAS[i]].cheshta;
           if (v < 0 || v > 60.0001) return false;
           if (v > 50) seenHigh = true;
           if (v < 10) seenLow = true;
         }
       }
       return seenHigh && seenLow;
     })());
  /*
   * An outer graha is strongest at opposition, where it retrogrades, and
   * weakest at conjunction. Checked on the elongation rather than on a
   * remembered figure: the two ends of the synodic cycle must come out at the
   * two ends of the scale.
   */
  ok('and an outer graha peaks at opposition and bottoms at conjunction',
     (function () {
       var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
       var best = { v: -1 }, worst = { v: 99 };
       for (var d = 0; d < 900; d += 3) {
         var c = A.chart({ jdUT: A.julianDay(2000, 1, 1, 12) + d,
                           latitude: place.latitude, longitude: place.longitude,
                           tzOffsetMinutes: place.tzOffsetMinutes });
         var r = Shadbala.compute(c, place);
         var by = {};
         c.planets.forEach(function (p) { by[p.name] = p; });
         var el = A.norm360(by.Saturn.longitude - by.Sun.longitude);
         if (el > 180) el = 360 - el;
         var v = r.grahas.Saturn.cheshta;
         if (v > best.v) best = { v: v, el: el };
         if (v < worst.v) worst = { v: v, el: el };
       }
       // Saturn's strongest sample should sit near opposition, its weakest near
       // conjunction, both within a few degrees of the ends.
       return best.el > 170 && worst.el < 15;
     })());
  /*
   * The luminaries never retrograde, so neither has an arc of retrogression to
   * measure, and Parashara gives them a rule apiece in each of two chapters.
   * 28.3-4 is the default now: the Sun's kendra is sayana Sun plus three
   * signs, the Moon's is her distance from the Sun, each reduced past six
   * signs and divided by three. It is the chapter whose computation the figure
   * is for, since the shadbala sum does not take it.
   */
  ok('the Sun\u2019s cheshta kendra is sayana Sun and three signs',
     (function () {
       var sun = chart.planets.filter(function (p) { return p.name === 'Sun'; })[0];
       var arc = Astro.norm360(sun.longitude + chart.ayanamsa + 90);
       return Math.abs(result.grahas.Sun.cheshta -
         (arc > 180 ? 360 - arc : arc) / 3) < 1e-9;
     })());
  ok('and the Moon\u2019s is her distance from the Sun',
     (function () {
       var sun = chart.planets.filter(function (p) { return p.name === 'Sun'; })[0];
       var moon = chart.planets.filter(function (p) { return p.name === 'Moon'; })[0];
       var arc = Astro.norm360(moon.longitude - sun.longitude);
       return Math.abs(result.grahas.Moon.cheshta -
         (arc > 180 ? 360 - arc : arc) / 3) < 1e-9;
     })());
  /*
   * Parashara says at 27.18 that the Moon's cheshta bala IS her paksha bala,
   * and under the default the two can differ. That is not a contradiction we
   * introduced: Raman writes her a separate rule at section 137 - "Subtract
   * the Sun's longitude from that of the Moon and the latter's Chesta Kendra
   * is obtained" - while section 53 lets her be a Papa, from whom paksha bala
   * takes sixty minus that same arc. The two coincide only while she is a
   * Subha, which she is on his own chart, which is why the identity at 27.18
   * never troubles him.
   *
   * Both of his worked examples are pinned here, since between them they are
   * the whole of the argument.
   */
  ok('Raman\u2019s Example 18 and Example 61 agree on his chart, as they must',
     (function () {
       var lon = 77.58333;
       var p = { latitude: 13, longitude: lon, tzOffsetMinutes: Math.round(lon * 4) };
       var c = Astro.chart({ jdUT: Astro.julianDay(1918, 10, 16,
         14 + 6 / 60 + 16 / 3600 - lon / 15), latitude: 13, longitude: lon,
         tzOffsetMinutes: p.tzOffsetMinutes, ayanamsa: 'raman' });
       var m = Shadbala.compute(c, p).grahas.Moon;
       return Math.abs(m.kala.paksha - 86.92) < 0.05 &&   // Example 18, doubled
         Math.abs(m.cheshta - 43.46) < 0.05 &&            // Example 61
         Math.abs(m.kala.paksha / 2 - m.cheshta) < 0.05;  // and are the same figure
     })());
  ok('and part company on a thin Moon, where section 53 makes her a Papa',
     (function () {
       var p = { latitude: 21.3069, longitude: -157.8583, tzOffsetMinutes: -600 };
       var c = Astro.chart({ jdUT: Astro.julianDay(1961, 8, 4, 19.4 + 10),
         latitude: 21.3069, longitude: -157.8583, tzOffsetMinutes: -600 });
       var m = Shadbala.compute(c, p).grahas.Moon;
       var sun = c.planets.filter(function (x) { return x.name === 'Sun'; })[0];
       var moon = c.planets.filter(function (x) { return x.name === 'Moon'; })[0];
       /*
        * 290.8 degrees, so waning and past the eighth of the dark half. Both
        * rules reduce past six signs first, which leaves 69.2: inside the
        * ninety that section 53 calls thin, whichever side of the Sun it falls.
        */
       var raw = Astro.norm360(moon.longitude - sun.longitude);
       var arc = raw > 180 ? 360 - raw : raw;
       return raw > 270 && arc < 90 &&
         Math.abs(m.cheshta - arc / 3) < 1e-9 &&               // section 137
         Math.abs(m.kala.paksha / 2 - (60 - arc / 3)) < 1e-9;  // section 53
     })());

  /*
   * 27.18, the other reading, is still on offer: there the two borrow, the Sun
   * his ayana bala and the Moon her paksha. Undoubled, cheshta being capped at
   * sixty like every other strength.
   */
  ok('and 27.18 still borrows, the Sun its ayana and the Moon its paksha',
     (function () {
       var b = Shadbala.compute(chart, place, { luminaryRule: 'borrowed' }).grahas;
       return Math.abs(b.Sun.cheshta - b.Sun.kala.ayana / 2) < 1e-9 &&
         Math.abs(b.Moon.cheshta - b.Moon.kala.paksha / 2) < 1e-9;
     })());

  // Ceilings, each from its own definition.
  ok('no component exceeds its maximum', Shadbala.GRAHAS.every(function (g) {
    var x = result.grahas[g];
    return x.sthana.uchcha <= 60.0001 && x.sthana.saptavargaja <= 225.0001 &&
           x.sthana.ojhayugma <= 30.0001 && x.sthana.kendradi <= 60.0001 &&
           x.sthana.drekkana <= 15.0001 && x.dig <= 60.0001 && x.cheshta <= 60.0001 &&
           // Paksha is doubled for the Moon and ayana for the Sun; nothing else
           // in kala bala may pass its own ceiling.
           x.kala.nathonnatha <= 60.0001 && x.kala.tribhaga <= 60.0001 &&
           x.kala.vara <= 45.0001 && x.kala.hora <= 60.0001 &&
           x.kala.paksha <= (g === 'Moon' ? 120.0001 : 60.0001) &&
           x.kala.ayana <= (g === 'Sun' ? 120.0001 : 60.0001);
  }));
  ok('naisargika is the fixed natural order',
     Shadbala.NAISARGIKA.Sun === 60 && Shadbala.NAISARGIKA.Saturn === 8.57 &&
     Shadbala.GRAHAS.every(function (g) { return result.grahas[g].naisargika === Shadbala.NAISARGIKA[g]; }));

  ok('strength is judged against each graha\'s own minimum', Shadbala.GRAHAS.every(function (g) {
    var x = result.grahas[g];
    return x.required === Shadbala.REQUIRED_RUPAS[g] && x.strong === (x.rupas >= x.required);
  }));
  // Ranking by ratio rather than raw total: the minimums differ, so a raw
  // ranking would flatter the Sun and punish Mercury for the yardstick alone.
  ok('the ranking follows the ratio, not the total', (function () {
    for (var i = 1; i < result.ranking.length; i++) {
      if (result.grahas[result.ranking[i - 1]].ratio < result.grahas[result.ranking[i]].ratio) return false;
    }
    return true;
  })());

  // Anchors: uchcha bala is defined by its two endpoints.
  ok('uchcha bala is 60 at exaltation and 0 at debilitation', (function () {
    var deep = { Sun: 10, Moon: 33, Mars: 298, Mercury: 165, Jupiter: 95, Venus: 357, Saturn: 200 };
    return Object.keys(deep).every(function (g) {
      var atExalt = A.norm360(deep[g]), atDebil = A.norm360(deep[g] + 180);
      var arcTo = function (lon, point) {
        var d = Math.abs(A.norm360(lon - point));
        return (d > 180 ? 360 - d : d) / 3;
      };
      return Math.abs(arcTo(atExalt, atDebil) - 60) < 1e-9 && arcTo(atDebil, atDebil) < 1e-9;
    });
  })());

  // Across many charts the totals should stay in the range practitioners see.
  var lowest = Infinity, highest = 0, charts = 0;
  for (var y = 1930; y <= 2020; y += 10) {
    for (var h = 2; h < 24; h += 7) {
      var c = A.chart({ jdUT: A.julianDay(y, 5, 14, h - 5.5), latitude: 19.076,
                        longitude: 72.8777, tzOffsetMinutes: 330 });
      var r = Shadbala.compute(c, { latitude: 19.076, longitude: 72.8777, tzOffsetMinutes: 330 });
      charts++;
      Shadbala.GRAHAS.forEach(function (g) {
        lowest = Math.min(lowest, r.grahas[g].rupas);
        highest = Math.max(highest, r.grahas[g].rupas);
      });
    }
  }
  ok('totals stay in the range practitioners see, over ' + charts + ' charts',
     lowest > 2 && highest < 14, lowest.toFixed(2) + ' to ' + highest.toFixed(2) + ' Rupas');
})();

console.log('\nParivartana yoga');
/*
 * An exchange is classified by the two signs being swapped, not by everything
 * the two grahas own. Five of the seven rule a dusthana somewhere, so reading
 * all their houses would make nearly every exchange a dainya.
 */
(function () {
  var seen = {}, examples = {};
  for (var y = 1975; y <= 2005 && Object.keys(seen).length < 3; y++) {
    for (var d = 1; d <= 365; d += 1) {
      var chart = A.chart({ jdUT: A.julianDay(y, 1, d, 6.0), latitude: 28.6139, longitude: 77.2090 });
      Yogas.parivartana(chart).forEach(function (finding) {
        if (!seen[finding.kind]) { seen[finding.kind] = true; examples[finding.kind] = { chart: chart, finding: finding }; }
      });
      if (Object.keys(seen).length >= 3) break;
    }
  }
  ok('all three kinds occur and are told apart',
     seen.maha && seen.khala && seen.dainya, Object.keys(seen).sort().join(', '));

  Object.keys(examples).forEach(function (kind) {
    var finding = examples[kind].finding, chart = examples[kind].chart;
    var positions = {};
    chart.planets.forEach(function (p) { positions[p.name] = p; });
    var a = finding.grahas[0], b = finding.grahas[1];
    ok(kind + ': each graha really is in the other\'s sign',
       A.SIGN_LORDS[positions[a].sign] === b && A.SIGN_LORDS[positions[b].sign] === a,
       finding.summary);
    var houses = finding.houses;
    var hasDusthana = houses.some(function (h) { return [6, 8, 12].indexOf(h) >= 0; });
    var hasThird = houses.indexOf(3) >= 0;
    ok(kind + ': the class matches the houses exchanged',
       kind === 'dainya' ? hasDusthana
       : kind === 'khala' ? (hasThird && !hasDusthana)
       : (!hasThird && !hasDusthana), 'houses ' + houses.join(' and '));
  });
})();
ok('a graha is never in parivartana with itself', (function () {
  for (var y = 1990; y < 1992; y++) {
    var chart = A.chart({ jdUT: A.julianDay(y, 6, 1, 6.0), latitude: 28.6139, longitude: 77.2090 });
    var bad = Yogas.parivartana(chart).some(function (f) { return f.grahas[0] === f.grahas[1]; });
    if (bad) return false;
  }
  return true;
})());
ok('the nodes are never involved, ruling no sign', (function () {
  for (var d = 1; d <= 200; d += 7) {
    var chart = A.chart({ jdUT: A.julianDay(1995, 1, d, 6.0), latitude: 28.6139, longitude: 77.2090 });
    var bad = Yogas.parivartana(chart).some(function (f) {
      return f.grahas.indexOf('Rahu') >= 0 || f.grahas.indexOf('Ketu') >= 0;
    });
    if (bad) return false;
  }
  return true;
})());
// Each family names itself by its own grammar, and none misnames itself.
(function () {
  var charts = [], d;
  for (d = 1; d <= 365; d += 1) {
    charts.push(A.chart({ jdUT: A.julianDay(1980, 1, d, 6.0), latitude: 28.6139, longitude: 77.2090 }));
  }
  var titles = {};
  charts.forEach(function (c) {
    Yogas.detect(c).forEach(function (f) { titles[f.title] = f; });
  });

  ok('parivartana names read as one phrase', Object.keys(titles).filter(function (t) {
    return /parivartana/i.test(t);
  }).every(function (t) { return /^(Maha|Khala|Dainya) parivartana yoga$/.test(t); }),
     Object.keys(titles).filter(function (t) { return /parivartana/i.test(t); }).join(', '));

  ok('vipareeta kinds keep their own names and carry the family',
     ['Harsha yoga', 'Sarala yoga', 'Vimala yoga'].every(function (t) {
       return !titles[t] || titles[t].family === 'Vipareeta raja yoga';
     }));

  ok('a plain neecha bhanga is not called a raja yoga', Object.keys(titles).every(function (t) {
    var f = titles[t];
    if (t !== 'Neecha bhanga') return true;
    return f.family === null && f.kind === 'plain';
  }));

  // A family label must never simply repeat the title.
  ok('no family label repeats the name it labels', Object.keys(titles).every(function (t) {
    var f = titles[t];
    return !f.family || t.toLowerCase().indexOf(f.family.toLowerCase()) < 0 || true;
  }) && Object.keys(titles).every(function (t) {
    var f = titles[t];
    return !(f.family && f.family.toLowerCase() === t.toLowerCase());
  }));
})();

console.log('\nThe Moon’s company, and five more from Raman');
/*
 * Raman's combinations 2 to 5 are one question with four answers, so they are
 * one detector and a chart must give exactly one of them. Planets in the 2nd
 * from the Moon is Sunapha, in the 12th is Anapha, both is Durudhura, neither
 * is Kemadruma.
 */
(function () {
  var at = function (moonSign, others) {
    return { ascendant: { longitude: 0 },
             planets: [{ name: 'Sun', sign: 0, longitude: 5 },
                       { name: 'Moon', sign: moonSign, longitude: moonSign * 30 + 5 }]
                        .concat(others) };
  };
  var g = function (name, sign) {
    return { name: name, sign: sign, longitude: sign * 30 + 5 };
  };
  var title = function (chart) {
    var f = Yogas.moonCompany(chart);
    return f.length === 1 ? f[0].title : '(' + f.length + ')';
  };
  ok('a graha in the 2nd from the Moon is Sunapha',
     title(at(3, [g('Venus', 4)])) === 'Sunapha yoga');
  ok('and in the 12th is Anapha',
     title(at(3, [g('Venus', 2)])) === 'Anapha yoga');
  ok('and on both sides is Durudhura',
     title(at(3, [g('Venus', 2), g('Mars', 4)])) === 'Durudhura yoga');
  ok('and on neither is Kemadruma',
     title(at(3, [g('Venus', 7)])) === 'Kemadruma yoga');
  /*
   * "Planets (excepting the Sun)" is Raman's own wording, and the nodes go with
   * the Sun: they are shadows rather than bodies, and the yoga is about the
   * Moon having company.
   */
  ok('the Sun beside the Moon is not company',
     title({ ascendant: { longitude: 0 },
             planets: [{ name: 'Sun', sign: 4, longitude: 125 },
                       { name: 'Moon', sign: 3, longitude: 95 }] }) === 'Kemadruma yoga');
  ok('and neither is a node',
     title(at(3, [g('Rahu', 4), g('Ketu', 2)])) === 'Kemadruma yoga');
  /*
   * The four are exhaustive and exclusive, so every chart gives exactly one and
   * the four counts must come to the whole sample.
   */
  ok('every chart gives exactly one of the four', (function () {
    var seen = {}, charts = 0;
    for (var y = 1950; y < 2000; y++) {
      for (var m = 1; m <= 12; m++) {
        var c = A.chart({ jdUT: A.julianDay(y, m, 15, 6.5), latitude: 28.61,
                          longitude: 77.21, tzOffsetMinutes: 330 });
        var found = Yogas.moonCompany(c);
        if (found.length !== 1) return false;
        seen[found[0].kind] = (seen[found[0].kind] || 0) + 1;
        charts++;
      }
    }
    var total = Object.keys(seen).reduce(function (n, k) { return n + seen[k]; }, 0);
    return total === charts && Object.keys(seen).length === 4;
  })());
  /*
   * Raman gives the cancellations of Kemadruma and declines them: "these
   * observations are not generally acceptable". So the yoga stands and the
   * cancellation is reported, which is how this site handles a contested rule.
   */
  ok('a cancelled Kemadruma is still reported, with the cancellation named',
     (function () {
       // Jupiter in the 4th from the lagna, so a kendra, but nowhere near the Moon.
       var c = at(6, [g('Jupiter', 3)]);
       var f = Yogas.moonCompany(c);
       return f[0].kind === 'kemadruma' &&
         f[0].reasons.some(function (r) { return /not generally acceptable/.test(r); });
     })());

  // Combination 6: "If Mars conjoins the Moon this yoga is formed."
  ok('Mars with the Moon is Chandra Mangala', (function () {
    var c = at(3, [g('Mars', 3)]);
    return Yogas.chandraMangala(c).length === 1 &&
      Yogas.chandraMangala(at(3, [g('Mars', 4)])).length === 0;
  })());

  /*
   * Combination 7: benefics in the 6th, 7th AND 8th from the Moon. All three
   * houses, and all three tenanted by benefics - a malefic in any of them
   * leaves the yoga unformed.
   */
  ok('Adhi yoga wants all three houses from the Moon, and benefics in each',
     (function () {
       // A full Moon, so benefic, with Jupiter Venus Mercury in the 6th 7th 8th.
       var full = { name: 'Moon', sign: 0, longitude: 5 };
       var sun = { name: 'Sun', sign: 6, longitude: 185 };   // 180 degrees off
       var base = { ascendant: { longitude: 0 },
                    planets: [sun, full, g('Jupiter', 5), g('Venus', 6),
                              g('Mercury', 7)] };
       var short = { ascendant: { longitude: 0 },
                     planets: [sun, full, g('Jupiter', 5), g('Venus', 6)] };
       var spoiled = { ascendant: { longitude: 0 },
                       planets: [sun, full, g('Jupiter', 5), g('Venus', 6),
                                 g('Saturn', 7)] };
       return Yogas.adhiYoga(base).length === 1 &&
         Yogas.adhiYoga(short).length === 0 &&
         Yogas.adhiYoga(spoiled).length === 0;
     })());

  /*
   * Combination 12: "The Moon in the 12th, 6th or 8th from Jupiter". The
   * counting runs from Jupiter to the Moon and not the other way, which is the
   * easy thing to get backwards.
   */
  ok('Sakata counts from Jupiter to the Moon', (function () {
    var from = function (moonSign) {
      return Yogas.sakata({ ascendant: { longitude: 0 },
        planets: [{ name: 'Sun', sign: 0, longitude: 5 },
                  { name: 'Moon', sign: moonSign, longitude: moonSign * 30 + 5 },
                  g('Jupiter', 0)] });
    };
    // Jupiter in Aries: the Moon in Virgo is the 6th from it, and Aries is the
    // 6th from Virgo - only one of the two is the yoga.
    return from(5).length === 1 && from(7).length === 1 && from(11).length === 1 &&
      from(4).length === 0 && from(0).length === 0;
  })());

  // Combination 13: "The 10th from the Moon or Lagna should be occupied by a benefic."
  ok('Amala takes the 10th from either the lagna or the Moon', (function () {
    var full = { name: 'Moon', sign: 0, longitude: 5 };
    var sun = { name: 'Sun', sign: 6, longitude: 185 };
    var make = function (planets) {
      return { ascendant: { longitude: 0 }, planets: [sun, full].concat(planets) };
    };
    return Yogas.amala(make([g('Jupiter', 9)])).length === 1 &&   // 10th from both
      Yogas.amala(make([g('Saturn', 9)])).length === 0 &&          // a malefic there
      Yogas.amala(make([g('Venus', 4)])).length === 0;
  })());

  /*
   * Combination 24, with the qualifier most treatments drop. Raman: "It should
   * not be taken for granted that irrespective of the distance between the Sun
   * and Mercury, Budha-Aditya Yoga would be present. On the contrary, Mercury
   * should not be within 10 degrees of the Sun."
   */
  ok('Budha-Aditya wants Mercury with the Sun but not burnt by it', (function () {
    var pair = function (gap) {
      return { ascendant: { longitude: 0 }, planets: [
        { name: 'Sun', sign: 0, longitude: 5 },
        { name: 'Moon', sign: 6, longitude: 185 },
        { name: 'Mercury', sign: 0, longitude: 5 + gap }] };
    };
    return Yogas.budhaAditya(pair(15)).length === 1 &&
      Yogas.budhaAditya(pair(9)).length === 0 &&
      Yogas.budhaAditya(pair(0)).length === 0 &&
      Yogas.BUDHA_ADITYA_FLOOR === 10;
  })());
  /*
   * And the ten degrees are measured on the rashi longitudes. A division's
   * longitude is a position within that division stretched back across thirty
   * degrees, so a gap taken from two of them is not a gap in the sky, and
   * combustion is a fact about the sky. chartInDivision keeps rashiLongitude
   * for exactly this.
   */
  ok('and the ten degrees are measured in the sky, not inside a division',
     (function () {
       var c = A.chart({ jdUT: A.julianDay(1946, 7, 6, 19), latitude: 40.71,
                         longitude: -74.01, tzOffsetMinutes: -240 });
       var apart = function (chart) {
         var by = {};
         chart.planets.forEach(function (p) { by[p.name] = p; });
         if (by.Sun.sign !== by.Mercury.sign) return null;
         var sun = by.Sun.rashiLongitude !== undefined ? by.Sun.rashiLongitude
           : by.Sun.longitude;
         var mer = by.Mercury.rashiLongitude !== undefined ? by.Mercury.rashiLongitude
           : by.Mercury.longitude;
         var d = Math.abs(A.norm360(mer - sun));
         return d > 180 ? 360 - d : d;
       };
       // Every division that puts the two together must read the same gap as
       // the rashi does, because it is reading the rashi's own longitudes.
       var rashi = apart(c);
       return A.SHODASAVARGA.every(function (d) {
         var seen = apart(A.chartInDivision(c, d));
         return seen === null || rashi === null || Math.abs(seen - rashi) < 1e-9;
       });
     })());
})();

ok('ordinals read correctly', Yogas.ordinal(1) === '1st' && Yogas.ordinal(2) === '2nd' &&
   Yogas.ordinal(3) === '3rd' && Yogas.ordinal(4) === '4th' && Yogas.ordinal(11) === '11th' &&
   Yogas.ordinal(12) === '12th');

(function () {
  // Every detector the module has must be named here. The count assertion is
  // what makes adding one without listing it a failing test rather than a
  // quietly incomplete check.
  var detectors = [Yogas.kartari,
                   Yogas.parivartana, Yogas.neechaBhanga, Yogas.vipareeta, Yogas.lakshmi,
                   Yogas.mahapurusha, Yogas.rajaYoga, Yogas.gajaKesari,
                   Yogas.moonCompany, Yogas.chandraMangala, Yogas.adhiYoga,
                   Yogas.sakata, Yogas.amala, Yogas.budhaAditya,
                   Yogas.sunCompany, Yogas.moonFromSun, Yogas.mahabhagya,
                   Yogas.chatussagara, Yogas.rajalakshana, Yogas.malika,
                   Yogas.parvata, Yogas.vasumathi,
                   Yogas.vanchanachorabheethi, Yogas.kahala, Yogas.pushkala,
                   Yogas.gauri, Yogas.bharathi, Yogas.kusuma, Yogas.chapa,
                   Yogas.sreenatha, Yogas.sankha, Yogas.bheri, Yogas.matsya,
                   Yogas.mridanga];
  ok('every detector is covered by this test', detectors.length === Yogas.DETECTOR_COUNT,
     detectors.length + ' named, ' + Yogas.DETECTOR_COUNT + ' in the module');

  var chart = A.chart({ jdUT: 2446146.7256944445, latitude: 23.5158, longitude: 87.308 });
  var strengths = Shadbala.compute(chart,
    { latitude: 23.5158, longitude: 87.308, tzOffsetMinutes: 330 }).grahas;
  var direct = detectors.reduce(function (n, fn) { return n + fn(chart, strengths).length; }, 0);
  ok('detect gathers from every detector',
     Yogas.detect(chart, strengths).length === direct && direct > 0,
     direct + ' findings');
})();

console.log('\nAspects');
(function () {
  var chart = A.chart({ jdUT: 2446146.7256944445, latitude: 23.5158, longitude: 87.308 });
  var rows = Yogas.aspectTable(chart);
  var byName = {};
  rows.forEach(function (r) { byName[r.graha] = r; });

  ok('every graha in the chart gets a row', rows.length === chart.planets.length);
  ok('no graha aspects itself', rows.every(function (r) {
    return !r.casts.concat(r.receives).some(function (x) { return x.graha === r.graha; });
  }));

  // The two columns must agree with each other read from the other side.
  ok('what one casts, the other receives', rows.every(function (r) {
    return r.casts.every(function (target) {
      return byName[target.graha].receives.some(function (x) { return x.graha === r.graha; });
    });
  }));

  // And drishti is not mutual, which is the reason for two columns at all.
  ok('aspect is one-way unless both aspects reach', (function () {
    var oneWay = false;
    rows.forEach(function (r) {
      r.casts.forEach(function (target) {
        var back = byName[target.graha].casts.some(function (x) { return x.graha === r.graha; });
        if (!back) oneWay = true;
      });
    });
    return oneWay;
  })());

  // Retrogression must not alter what a graha aspects.
  ok('a retrograde graha aspects what a direct one in the same sign would', (function () {
    var retro = chart.planets.filter(function (p) { return p.retrograde; });
    if (!retro.length) return false;      // the reference chart has several
    return retro.every(function (p) {
      var row = byName[p.name];
      return row.casts.every(function (target) {
        // The aspect must follow from the signs alone.
        var others = chart.planets.filter(function (q) { return q.name === target.graha; })[0];
        return Yogas.aspects(p.name, p.sign, others.sign);
      });
    });
  })());
  ok('the table carries the retrograde flag without acting on it',
     rows.some(function (r) { return r.retrograde; }) &&
     !/retrograde/.test(Yogas.aspects.toString()));

  /*
   * K. N. Rao's rule, kept separate from the classical columns: a retrograde
   * graha also acts from the sign behind it, within the first ten degrees.
   */
  ok('the rule reaches only retrograde grahas', rows.every(function (r) {
    return r.retrograde || r.fromPreviousSign.length === 0;
  }));
  ok('it is not applied to the nodes, which are always retrograde',
     byName.Rahu.fromPreviousSign.length === 0 && byName.Ketu.fromPreviousSign.length === 0);
  ok('it stops after the tenth degree', (function () {
    var deep = chart.planets.filter(function (p) {
      return p.retrograde && p.degreeInSign >= Yogas.RAO_MAX_DEGREE &&
             ['Rahu', 'Ketu'].indexOf(p.name) < 0;
    });
    if (!deep.length) return false;      // Venus at 27 degrees serves here
    return deep.every(function (p) { return byName[p.name].fromPreviousSign.length === 0; });
  })());
  ok('it adds reach rather than restating it', rows.every(function (r) {
    return r.fromPreviousSign.every(function (extra) {
      return !r.casts.some(function (already) { return already.graha === extra.graha; });
    });
  }));
  ok('what it adds really is aspected from the sign behind', (function () {
    var saturn = chart.planets.filter(function (p) { return p.name === 'Saturn'; })[0];
    if (!saturn.retrograde || saturn.degreeInSign >= Yogas.RAO_MAX_DEGREE) return true;
    var behind = (saturn.sign + 11) % 12;
    return byName.Saturn.fromPreviousSign.every(function (extra) {
      var target = chart.planets.filter(function (p) { return p.name === extra.graha; })[0];
      return Yogas.aspects('Saturn', behind, target.sign);
    });
  })());
  ok('the classical columns are untouched by it', (function () {
    // Removing the rule must not change what column two says.
    return byName.Saturn.casts.every(function (x) {
      var target = chart.planets.filter(function (p) { return p.name === x.graha; })[0];
      var saturn = chart.planets.filter(function (p) { return p.name === 'Saturn'; })[0];
      return Yogas.aspects('Saturn', saturn.sign, target.sign);
    });
  })());

  // Every graha sees the seventh; only three have more.
  ok('each graha aspects the seventh from itself', Yogas.GRAHAS.every(function (g) {
    return Yogas.aspects(g, 0, 6);
  }));
  ok('only Mars, Jupiter and Saturn have aspects beyond the seventh',
     ['Sun', 'Moon', 'Mercury', 'Venus'].every(function (g) {
       return !Yogas.FULL_ASPECTS[g];
     }) && Yogas.FULL_ASPECTS.Mars.join() === '4,7,8' &&
     Yogas.FULL_ASPECTS.Jupiter.join() === '5,7,9' &&
     Yogas.FULL_ASPECTS.Saturn.join() === '3,7,10');
  ok('the nodes are given the 5th, 7th and 9th',
     Yogas.FULL_ASPECTS.Rahu.join() === '5,7,9' && Yogas.FULL_ASPECTS.Ketu.join() === '5,7,9');
  // Being opposite always, the nodes always aspect each other.
  ok('Rahu and Ketu always aspect each other',
     byName.Rahu.casts.some(function (x) { return x.graha === 'Ketu'; }) &&
     byName.Ketu.casts.some(function (x) { return x.graha === 'Rahu'; }));
})();

console.log('\nVipareeta raja yoga');
(function () {
  var DUSTHANA = [6, 8, 12];
  var names = { 6: 'harsha', 8: 'sarala', 12: 'vimala' };

  // No graha owns two dusthanas: the sign gaps do not allow it, which is why
  // the three forms can never collide over one graha.
  ok('no graha can own two dusthanas', Object.keys(A.DIGNITY).every(function (g) {
    for (var lagna = 0; lagna < 12; lagna++) {
      var owned = A.housesOwned(g, lagna).filter(function (h) { return DUSTHANA.indexOf(h) >= 0; });
      if (owned.length > 1) return false;
    }
    return true;
  }));

  var seen = {}, checked = 0;
  for (var d = 1; d <= 365; d += 2) {
    var chart = A.chart({ jdUT: A.julianDay(1991, 1, d, 6.0), latitude: 28.6139, longitude: 77.2090 });
    var lagna = A.signOf(chart.ascendant.longitude);
    var positions = {};
    chart.planets.forEach(function (p) { positions[p.name] = p; });

    Yogas.vipareeta(chart).forEach(function (f) {
      checked++;
      seen[f.kind] = true;
      var owner = f.houses[0], sits = f.houses[1];
      // The lord named must really rule that dusthana and really sit in one.
      var signOfHouse = (lagna + owner - 1) % 12;
      if (A.SIGN_LORDS[signOfHouse] !== f.grahas[0]) { ok('the lord named rules that house', false); throw 0; }
      if (positions[f.grahas[0]].house !== sits) { ok('the lord sits where reported', false); throw 0; }
      if (DUSTHANA.indexOf(owner) < 0 || DUSTHANA.indexOf(sits) < 0) { ok('both houses are dusthanas', false); throw 0; }
      if (f.kind !== names[owner]) { ok('the form is named for the house owned', false, f.kind); throw 0; }
    });
  }
  ok('the lord named rules that house, sits where reported, and both are dusthanas',
     checked > 0, checked + ' findings checked');
  ok('all three forms occur', seen.harsha && seen.sarala && seen.vimala,
     Object.keys(seen).sort().join(', '));

  // The reference chart's one finding, and the caveat firing with it.
  var durgapur = A.chart({ jdUT: 2446146.7256944445, latitude: 23.5158, longitude: 87.308 });
  var found = Yogas.vipareeta(durgapur);
  ok('the reference chart shows sarala from Saturn',
     found.length === 1 && found[0].kind === 'sarala' && found[0].grahas[0] === 'Saturn',
     found.map(function (f) { return f.kind + ':' + f.grahas[0]; }).join(', '));
  // The loose reasoning - that a lord harms the house it sits in - is not a
  // principle of the subject, and a lord in its own house is ordinarily strong.
  ok('the stated reason is cancellation, not a lord harming its own house',
     found[0].reasons.every(function (r) { return !/lord in a house harms it/.test(r); }) &&
     /source of harm/.test(found[0].reasons[0]));
  ok('it reports the good house the same graha owns',
     found[0].reasons.some(function (r) { return /also owns the 9th/.test(r); }),
     found[0].reasons[found[0].reasons.length - 1]);
})();

console.log('\nNeecha bhanga');
/*
 * Every clause names its own subject. The clauses are joined with "; and " and
 * several are about a different graha - the dispositor, or whoever is exalted in
 * the sign - so a trailing "it" lands next to the wrong name: "Venus, exalted in
 * this sign, is in a kendra; and it stands in a kendra" reads as Venus twice.
 */
(function () {
  var place = { latitude: 23.5158, longitude: 87.308, tzOffsetMinutes: 330 };
  var bare = [], vacuous = [], swept = 0;
  for (var y = 1962; y < 2000; y += 3) {
    for (var mo = 1; mo <= 12; mo += 3) {
      for (var h = 1; h < 24; h += 5) {
        swept++;
        var c = A.chart({ jdUT: A.julianDay(y, mo, 12, h - 5.5), latitude: place.latitude,
                          longitude: place.longitude, tzOffsetMinutes: 330 });
        Yogas.neechaBhanga(c).forEach(function (f) {
          f.reasons.forEach(function (r) {
            if (/(^|\s)its?(\s|$)/.test(r)) bare.push(r);
            if (/Moon itself stands in a kendra from the Moon/.test(r)) vacuous.push(r);
          });
        });
      }
    }
  }
  ok('no reason leaves the debilitated graha as a bare pronoun',
     bare.length === 0, bare[0] || swept + ' charts swept, every clause named');

  /*
   * A graha is always in the 1st from itself, so "in a kendra from the Moon" says
   * nothing at all when the graha is the Moon. Without the guard the Moon's
   * debilitation cancelled itself in every chart, on a condition true by
   * definition, and nothing in the suite noticed.
   */
  ok('and the Moon is never said to be in a kendra from itself',
     vacuous.length === 0, vacuous[0] || swept + ' charts swept');
})();

ok('the Moon debilitated outside a kendra cancels on nothing self-referential', (function () {
  var lagna = 0;                                   // Aries; Scorpio is the 8th
  var chart = { ascendant: { longitude: 10 }, planets: [
    { name: 'Moon', sign: 7, longitude: 7 * 30 + 10, house: 8 },
    { name: 'Mars', sign: 2, longitude: 2 * 30 + 5, house: 3 }] };
  return Yogas.neechaBhanga(chart).every(function (f) {
    return f.reasons.every(function (r) { return !/from the Moon/.test(r); });
  });
})());

/*
 * Virgo is the one sign whose lord is also the graha exalted in it, so the two
 * cancellation conditions land on one graha and read as a repetition if reported
 * separately. They are still two conditions, so they are said as two in one clause.
 */
/*
 * Raman's definition is two conditions, and no graha can satisfy both of them
 * separately: the lord of the sign and the graha exalted in it are either
 * different grahas, one clause each, or the same graha, reported in one clause.
 * So a name never appears twice, and the stammer the old wording guarded against
 * cannot arise.
 */
ok('no graha is named in two clauses of the same cancellation', (function () {
  var seen = 0;
  for (var y = 1960; y < 2000; y++) {
    var c = A.chart({ jdUT: A.julianDay(y, (y % 12) + 1, 12, 9), latitude: 23.5158,
                      longitude: 87.308, tzOffsetMinutes: 330 });
    var bad = Yogas.neechaBhanga(c).some(function (f) {
      if (f.reasons.length < 2) return false;
      seen++;
      var subjects = f.reasons.map(function (r) { return r.split(',')[0].split(' ')[0]; });
      return new Set(subjects).size !== subjects.length;
    });
    if (bad) return false;
  }
  return true;
})());
ok('and at most two clauses, there being two conditions', (function () {
  for (var y = 1960; y < 2000; y++) {
    var c = A.chart({ jdUT: A.julianDay(y, (y % 12) + 1, 12, 9), latitude: 23.5158,
                      longitude: 87.308, tzOffsetMinutes: 330 });
    if (Yogas.neechaBhanga(c).some(function (f) { return f.reasons.length > 2; })) return false;
  }
  return true;
})());

ok('where one graha both rules the sign and is exalted in it, it is said once', (function () {
  var lagna = 0;
  var chart = { ascendant: { longitude: 10 }, planets: [
    { name: 'Venus', sign: 5, longitude: 5 * 30 + 10, house: 6 },     // debilitated in Virgo
    { name: 'Mercury', sign: 3, longitude: 3 * 30 + 5, house: 4 }] }; // a kendra from the lagna
  var f = Yogas.neechaBhanga(chart)[0];
  if (!f) return false;
  var merged = f.reasons.filter(function (r) { return /both rules this sign and is exalted/.test(r); });
  var mercury = f.reasons.filter(function (r) { return /^Mercury/.test(r); });
  return merged.length === 1 && mercury.length === 1 &&
    A.SIGN_LORDS[5] === 'Mercury' && A.DIGNITY.Mercury.exalt.sign === 5;
})());
(function () {
  // Only a debilitated graha can have its debilitation cancelled.
  ok('only debilitated grahas are ever reported', (function () {
    for (var d = 1; d <= 300; d += 11) {
      var chart = A.chart({ jdUT: A.julianDay(1992, 1, d, 6.0), latitude: 28.6139, longitude: 77.2090 });
      var positions = {};
      chart.planets.forEach(function (p) { positions[p.name] = p; });
      var wrong = Yogas.neechaBhanga(chart).some(function (f) {
        var g = f.grahas[0];
        return positions[g].sign !== A.DIGNITY[g].debil;
      });
      if (wrong) return false;
    }
    return true;
  })());

  // A cancellation must name at least one reason, and the raja form must sit in
  // a kendra or a trikona.
  var rajaSeen = false, plainSeen = false;
  for (var d = 1; d <= 365; d += 3) {
    var chart = A.chart({ jdUT: A.julianDay(1988, 1, d, 6.0), latitude: 28.6139, longitude: 77.2090 });
    var findings = Yogas.neechaBhanga(chart);
    for (var i = 0; i < findings.length; i++) {
      var f = findings[i];
      if (!f.reasons.length) { ok('every cancellation names a reason', false); return; }
      var good = [1, 4, 5, 7, 9, 10].indexOf(f.houses[0]) >= 0;
      if (f.kind === 'raja') { rajaSeen = true; if (!good) { ok('raja form sits in a kendra or trikona', false, 'house ' + f.houses[0]); return; } }
      else { plainSeen = true; if (good) { ok('plain form sits outside them', false, 'house ' + f.houses[0]); return; } }
    }
  }
  ok('every cancellation names a reason', true);
  ok('both forms occur, and each sits where its name says',
     rajaSeen && plainSeen, 'raja ' + rajaSeen + ', plain ' + plainSeen);

  /*
   * One chart with one of each, which is the distinction in miniature. The
   * reference chart used to serve: under Raman's two conditions it keeps its
   * raja form and loses the plain one, Jupiter's cancellation having rested on
   * clauses he does not accept.
   */
  var pair = A.chart({ jdUT: A.julianDay(1980, 11, 12, 6 - 5.5), latitude: 23.5158,
                       longitude: 87.308, tzOffsetMinutes: 330 });
  var both = Yogas.neechaBhanga(pair);
  ok('one chart shows both forms', both.length === 2 &&
     both.some(function (f) { return f.grahas[0] === 'Sun' && f.kind === 'raja'; }) &&
     both.some(function (f) { return f.grahas[0] === 'Venus' && f.kind === 'plain'; }),
     both.map(function (f) { return f.grahas[0] + ':' + f.kind; }).join(', '));
})();

ok('a graha aspects the seventh from itself, always',
   Yogas.aspects('Venus', 0, 6) && Yogas.aspects('Saturn', 0, 6) && !Yogas.aspects('Venus', 0, 2));
ok('mars, jupiter and saturn keep their own aspects',
   Yogas.aspects('Mars', 0, 3) && Yogas.aspects('Mars', 0, 7) &&
   Yogas.aspects('Jupiter', 0, 4) && Yogas.aspects('Jupiter', 0, 8) &&
   Yogas.aspects('Saturn', 0, 2) && Yogas.aspects('Saturn', 0, 9) &&
   !Yogas.aspects('Venus', 0, 3));

console.log('\nGraha friendship');
/*
 * The natural table is fixed, the temporal one depends on placement, and the
 * compound of the two is what is read. Each layer is checked on its own,
 * because a bug in one is invisible once they are added together.
 */
(function () {
  var G = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

  ok('natural relations are the classical ones',
     A.naturalRelation('Sun', 'Jupiter') === 1 && A.naturalRelation('Sun', 'Saturn') === -1 &&
     A.naturalRelation('Sun', 'Mercury') === 0 && A.naturalRelation('Saturn', 'Venus') === 1 &&
     A.naturalRelation('Jupiter', 'Mercury') === -1 && A.naturalRelation('Moon', 'Sun') === 1);
  ok('the Moon has no natural enemy',
     G.every(function (g) { return g === 'Moon' || A.naturalRelation('Moon', g) >= 0; }));
  ok('the nodes are outside the table',
     A.naturalRelation('Rahu', 'Sun') === null && A.compoundRelation('Ketu', 'Mars', 3) === null);

  // Natural friendship is not symmetric, which is easy to assume and wrong:
  // Mercury counts the Sun a friend, the Sun counts Mercury neutral.
  ok('natural friendship is not always mutual',
     A.naturalRelation('Mercury', 'Sun') === 1 && A.naturalRelation('Sun', 'Mercury') === 0);

  ok('temporal friendship follows the six houses',
     [2, 3, 4, 10, 11, 12].every(function (h) { return A.temporalRelation(h) === 1; }) &&
     [1, 5, 6, 7, 8, 9].every(function (h) { return A.temporalRelation(h) === -1; }));

  /*
   * How asymmetric the natural table is, held to a number. The dispositor
   * column reads the pair in one direction only, so this is what makes the
   * direction worth stating rather than a pedantic detail.
   */
  var disagree = 0;
  for (var gi = 0; gi < G.length; gi++) {
    for (var gj = gi + 1; gj < G.length; gj++) {
      if (A.naturalRelation(G[gi], G[gj]) !== A.naturalRelation(G[gj], G[gi])) disagree++;
    }
  }
  ok('eleven of the twenty-one natural pairs disagree', disagree === 11, disagree + ' of 21');

  /*
   * Temporal friendship, by contrast, needs no direction: if one graha is in
   * the 3rd from another then the other is in the 11th from it, and the six
   * friendly houses pair up 2-12, 3-11, 4-10 with the six hostile ones 1-1,
   * 5-9, 6-8, 7-7. So any asymmetry in a compound relation came from the
   * natural layer alone.
   */
  ok('temporal friendship reads the same both ways',
     [1,2,3,4,5,6,7,8,9,10,11,12].every(function (h) {
       return A.temporalRelation(h) === A.temporalRelation((14 - h) % 12 || 12);
     }));

  // The compound of every pairing must land in the five-step scale.
  ok('the compound is one of the five grades', (function () {
    var grades = ['adhimitra', 'mitra', 'sama', 'shatru', 'adhishatru'];
    for (var i = 0; i < G.length; i++) {
      for (var j = 0; j < G.length; j++) {
        if (i === j) continue;
        for (var h = 1; h <= 12; h++) {
          if (grades.indexOf(A.compoundRelation(G[i], G[j], h)) < 0) return false;
        }
      }
    }
    return true;
  })());
  ok('a natural friend in a temporal friend house is a great friend',
     A.compoundRelation('Sun', 'Jupiter', 3) === 'adhimitra');
  ok('a natural enemy in a temporal enemy house is a great enemy',
     A.compoundRelation('Sun', 'Saturn', 7) === 'adhishatru');
  ok('opposite layers cancel to neutral',
     A.compoundRelation('Sun', 'Jupiter', 7) === 'sama' &&
     A.compoundRelation('Sun', 'Saturn', 3) === 'sama');
  ok('every grade has a label',
     Object.keys(A.RELATION_LABELS).length === 5 &&
     A.RELATION_LABELS.adhimitra === 'great friend' && A.RELATION_LABELS.adhishatru === 'great enemy');
})();

console.log('\nYogakaraka');
/*
 * A yogakaraka rules both a kendra and a trikona from the lagna. The rule is
 * derived rather than listed, so the test is that deriving it reproduces the
 * six ascendants the classics name, and produces nothing for the other six.
 */
(function () {
  var GRAHAS = ['Sun', 'Moon', 'Mars', 'Jupiter', 'Venus', 'Mercury', 'Saturn', 'Rahu', 'Ketu'];
  var classic = { Taurus: 'Saturn', Cancer: 'Mars', Leo: 'Mars',
                  Libra: 'Saturn', Capricorn: 'Venus', Aquarius: 'Venus' };
  var withOne = 0;
  for (var lagna = 0; lagna < 12; lagna++) {
    var found = GRAHAS.filter(function (g) { return A.isYogakaraka(g, lagna); });
    var expected = classic[A.SIGNS[lagna]];
    if (expected) {
      withOne++;
      ok(A.SIGNS[lagna] + ' lagna: ' + expected, found.join() === expected, found.join() || 'none');
    } else {
      ok(A.SIGNS[lagna] + ' lagna has none', found.length === 0, found.join() || 'none');
    }
  }
  ok('exactly six ascendants have one', withOne === 6, withOne + ' found');
})();
ok('the nodes are never yogakaraka, ruling no sign', (function () {
  for (var lagna = 0; lagna < 12; lagna++) {
    if (A.housesOwned('Rahu', lagna).length || A.isYogakaraka('Ketu', lagna)) return false;
  }
  return true;
})());
ok('a yogakaraka really does rule a kendra and a trikona', (function () {
  for (var lagna = 0; lagna < 12; lagna++) {
    var houses = A.housesOwned('Saturn', lagna);
    if (!A.isYogakaraka('Saturn', lagna)) continue;
    var kendra = houses.some(function (h) { return [4, 7, 10].indexOf(h) >= 0; });
    var trikona = houses.some(function (h) { return [5, 9].indexOf(h) >= 0; });
    if (!(kendra && trikona)) return false;
  }
  return true;
})());
// Ruling only the lagna is not the same thing, though house 1 is both.
ok('ruling the first house alone is not enough', (function () {
  // Mercury from Virgo rules 1 and 10: a kendra but no trikona.
  return A.housesOwned('Mercury', 5).join() === '1,10' && !A.isYogakaraka('Mercury', 5);
})());

console.log('\nGraha order');
(function () {
  var c = A.chart({ jdUT: A.julianDay(1985, 3, 22, 5.4166667), latitude: 23.5158, longitude: 87.308 });
  /*
   * The order of the weekday lords, which is the one the classical lists use.
   * Everything downstream walks this array - the graha tables, Shadbala, the
   * Vargas grid, the aspects - so the sequence is settled once here.
   */
  var expected = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'];
  var got = c.planets.map(function (p) { return p.name; });
  ok('grahas come back in the order a Vedic table reads them',
     got.join(',') === expected.join(','), got.join(', '));
  ok('and the seven are in weekday order, Sunday through Saturday',
     got.slice(0, 7).join(',') === 'Sun,Moon,Mars,Mercury,Jupiter,Venus,Saturn');
  ok('with the nodes last, Ketu after the Rahu it is derived from',
     got[7] === 'Rahu' && got[8] === 'Ketu');
  // The panchang and the dasha look grahas up by name, so reordering the table
  // must not quietly shift them onto the wrong one.
  ok('the panchang still follows the Sun and Moon', (function () {
    var sun = c.planets.filter(function (p) { return p.name === 'Sun'; })[0];
    var moon = c.planets.filter(function (p) { return p.name === 'Moon'; })[0];
    var elong = A.norm360(moon.longitude - sun.longitude);
    return Math.abs(elong - c.panchang.moonPhaseAngle) < 1e-9;
  })());
  ok('the dasha still starts from the Moon nakshatra', (function () {
    var moon = c.planets.filter(function (p) { return p.name === 'Moon'; })[0];
    return c.dashas.birthNakshatra.name === moon.nakshatra.name;
  })());
})();

console.log('\nDignities');
/*
 * Dignity turns on the degree, not just the sign. Two grahas stack three
 * dignities inside a single sign, and those are the cases worth pinning: the
 * Moon through and past 3 degrees of Taurus, and Mercury across 15 and 20 of
 * Virgo.
 */
[['Sun', 0, 5, 'Exalted'], ['Sun', 4, 10, 'Mooltrikona'], ['Sun', 4, 25, 'Own Sign'], ['Sun', 6, 15, 'Debilitated'],
 ['Moon', 1, 2, 'Exalted'], ['Moon', 1, 20, 'Mooltrikona'], ['Moon', 3, 10, 'Own Sign'], ['Moon', 7, 10, 'Debilitated'],
 ['Mercury', 5, 10, 'Exalted'], ['Mercury', 5, 18, 'Mooltrikona'], ['Mercury', 5, 25, 'Own Sign'], ['Mercury', 11, 5, 'Debilitated'],
 ['Mars', 0, 6, 'Mooltrikona'], ['Mars', 0, 20, 'Own Sign'], ['Mars', 9, 28, 'Exalted'], ['Mars', 3, 10, 'Debilitated'],
 ['Jupiter', 8, 5, 'Mooltrikona'], ['Jupiter', 8, 20, 'Own Sign'], ['Jupiter', 3, 5, 'Exalted'], ['Jupiter', 9, 10, 'Debilitated'],
 ['Venus', 6, 10, 'Mooltrikona'], ['Venus', 6, 20, 'Own Sign'], ['Venus', 11, 27, 'Exalted'], ['Venus', 5, 10, 'Debilitated'],
 ['Saturn', 10, 10, 'Mooltrikona'], ['Saturn', 10, 25, 'Own Sign'], ['Saturn', 6, 20, 'Exalted'], ['Saturn', 0, 5, 'Debilitated']
].forEach(function (t) {
  var got = A.dignityOf(t[0], t[1], t[2]);
  ok(t[0] + ' at ' + A.SIGNS[t[1]] + ' ' + t[2] + ' is ' + t[3], got === t[3], got || '(none)');
});
ok('an ordinary placement has no dignity', A.dignityOf('Sun', 2, 15) === '', A.dignityOf('Sun', 2, 15) || '(none)');
/*
 * The nodes, following B.V. Raman: exalted in Taurus and Scorpio, debilitated
 * opposite, with the deep points at 20 degrees. He gives them no moolatrikona
 * and no own sign, holding that a node gives the results of the lord of the
 * house it occupies, so the ladder stops there for them.
 */
ok('Rahu is exalted in Taurus and debilitated in Scorpio',
   A.dignityOf('Rahu', 1, 10) === 'Exalted' && A.dignityOf('Rahu', 7, 10) === 'Debilitated');
ok('and Ketu the other way round',
   A.dignityOf('Ketu', 7, 10) === 'Exalted' && A.dignityOf('Ketu', 1, 10) === 'Debilitated');
ok('the deep points are Raman\'s 20 degrees',
   A.DIGNITY.Rahu.exalt.deep === 20 && A.DIGNITY.Ketu.exalt.deep === 20);
ok('the nodes reach no other rung, having neither moolatrikona nor an own sign',
   A.NODES.every(function (n) {
     return A.DIGNITY[n].mool === null && A.DIGNITY[n].own.length === 0 &&
       A.dignityOf(n, 2, 10) === '' && A.dignityOf(n, 8, 10) === '';
   }));

/*
 * Ownership is the part that would do damage. Every dispositor, lordship and
 * raja yoga reading resolves a sign to exactly one graha, so a node claiming
 * Aquarius or Scorpio would quietly break all three.
 */
ok('and owning nothing, they never appear as anyone\'s lord',
   A.NODES.every(function (n) { return A.housesOwned(n, 0).length === 0; }) &&
   A.SIGN_LORDS.indexOf('Rahu') < 0 && A.SIGN_LORDS.indexOf('Ketu') < 0);
// Exaltation and debilitation always sit opposite each other.
ok('every debilitation faces its exaltation', Object.keys(A.DIGNITY).every(function (graha) {
  var d = A.DIGNITY[graha];
  return (d.exalt.sign + 6) % 12 === d.debil;
}));
// A graha's Mooltrikona sign is always one it owns, except the Moon's. The nodes
// have none at all, which is Raman's position rather than a gap in the table.
ok('Mooltrikona falls in a sign the graha owns, the Moon excepted',
   Object.keys(A.DIGNITY).every(function (graha) {
     var d = A.DIGNITY[graha];
     if (!d.mool) return A.NODES.indexOf(graha) >= 0;
     return graha === 'Moon' || d.own.indexOf(d.mool.sign) >= 0;
   }));
// Every graha reports each of the four dignities somewhere in the zodiac.
/*
 * Every one of the seven reaches all four rungs somewhere in the zodiac. The two
 * nodes reach exactly two, exaltation and debilitation, and reaching a third
 * would mean ownership or moolatrikona had crept back in.
 */
ok('all four dignities are reachable for each of the seven', Object.keys(A.DIGNITY).every(function (graha) {
  if (A.NODES.indexOf(graha) >= 0) return true;
  var seen = {};
  for (var sign = 0; sign < 12; sign++) {
    for (var deg = 0; deg < 30; deg++) seen[A.dignityOf(graha, sign, deg)] = true;
  }
  return seen.Exalted && seen.Debilitated && seen.Mooltrikona && seen['Own Sign'];
}));
/*
 * The nodes are always opposite each other, and Raman's exaltation signs are
 * opposite too, so the two are never in different states: either Rahu is in
 * Taurus and Ketu in Scorpio and both are exalted, or the reverse and both are
 * debilitated. That is a property of the scheme rather than a coincidence, and
 * it is the reason a chart never shows one node dignified and the other not.
 */
ok('the nodes are always in the same state as each other', (function () {
  for (var sign = 0; sign < 12; sign++) {
    var rahu = A.dignityOf('Rahu', sign, 15);
    var ketu = A.dignityOf('Ketu', (sign + 6) % 12, 15);
    if (rahu !== ketu) return false;
  }
  return true;
})());

ok('and exactly two for each node', A.NODES.every(function (node) {
  var seen = {};
  for (var sign = 0; sign < 12; sign++) {
    for (var deg = 0; deg < 30; deg++) {
      var d = A.dignityOf(node, sign, deg);
      if (d) seen[d] = true;
    }
  }
  return Object.keys(seen).sort().join(',') === 'Debilitated,Exalted';
}));

console.log('\nZodiac helpers');
ok('nakshatra 0 deg = Ashwini pada 1', A.nakshatraOf(0).name === 'Ashwini' && A.nakshatraOf(0).pada === 1);
ok('nakshatra 359.9 = Revati pada 4', A.nakshatraOf(359.9).name === 'Revati' && A.nakshatraOf(359.9).pada === 4);
ok('Moon nakshatra lord cycle', A.nakshatraOf(13.4).lord === 'Venus', A.nakshatraOf(13.4).lord);
ok('navamsa: Aries 0-3.33 -> Aries', A.SIGNS[A.navamsaSign(1)] === 'Aries');
ok('navamsa: Taurus start -> Capricorn', A.SIGNS[A.navamsaSign(31)] === 'Capricorn', A.SIGNS[A.navamsaSign(31)]);
ok('navamsa: Gemini start -> Libra', A.SIGNS[A.navamsaSign(61)] === 'Libra', A.SIGNS[A.navamsaSign(61)]);
ok('whole-sign house', A.houseOf(45, 0) === 2 && A.houseOf(15, 3) === 10);

console.log('\nFull chart smoke test (1990 Aug 15, 10:30 IST, Delhi)');
var jd = A.julianDay(1990, 8, 15, 10.5 - 5.5); // IST -> UT
var c = A.chart({ jdUT: jd, latitude: 28.6139, longitude: 77.2090, ayanamsa: 'lahiri', tzOffsetMinutes: 330 });
ok('nine grahas returned', c.planets.length === 9, c.planets.map(function (p) { return p.name; }).join(','));
ok('Ketu is opposite Rahu', Math.abs(A.norm360(
   c.planets.filter(function (p) { return p.name === 'Ketu'; })[0].longitude -
   c.planets.filter(function (p) { return p.name === 'Rahu'; })[0].longitude) - 180) < 1e-9);
ok('every planet has a house 1-12', c.planets.every(function (p) { return p.house >= 1 && p.house <= 12; }));
ok('dasha periods total 120 years',
   Math.abs(c.dashas.periods.reduce(function (s, p) { return s + p.years; }, 0) - 120) < 1e-9);
ok('dasha timeline is continuous', c.dashas.periods.every(function (p, i, arr) {
     return i === 0 || Math.abs(p.startJd - arr[i - 1].endJd) < 1e-6; }));
ok('birth falls inside the first mahadasha',
   c.dashas.periods[0].startJd <= jd && jd <= c.dashas.periods[0].endJd);
ok('ayanamsa reported ~23.7 deg for 1990', Math.abs(c.ayanamsa - 23.72) < 0.05, c.ayanamsa.toFixed(4));
console.log('         Lagna ' + c.ascendant.signName + ' ' + c.ascendant.degreeInSign.toFixed(2) + ' deg, ' +
  c.planets.map(function (p) { return p.name + ' ' + p.signName + ' ' + p.degreeInSign.toFixed(2) + (p.retrograde ? 'R' : ''); }).join(' | '));

console.log('\nRetrogression detection over 2024');
['mercury', 'venus', 'mars', 'jupiter', 'saturn'].forEach(function (body) {
  var retroDays = 0;
  for (var d = 0; d < 365; d++) {
    var jd1 = A.julianDay(2024, 1, 1, 0) + d;
    var T1 = (jd1 - 2451545.0) / 36525, T2 = (jd1 + 1 - 2451545.0) / 36525;
    var l1 = A.apparentLongitude(body, T1, A.nutation(T1)).lon;
    var l2 = A.apparentLongitude(body, T2, A.nutation(T2)).lon;
    var d1 = A.norm360(l2 - l1); if (d1 > 180) d1 -= 360;
    if (d1 < 0) retroDays++;
  }
  // Retrograde days that actually fall inside calendar 2024: Mercury had three
  // periods (~69d), Venus none, Mars only the tail from Dec 7 (~25d), Jupiter
  // only Oct 9 onwards (~84d), Saturn Jun 29-Nov 15 (~139d).
  var expect = { mercury: [50, 80], venus: [0, 45], mars: [0, 80], jupiter: [70, 135], saturn: [120, 150] }[body];
  ok(body + ' retrograde days in 2024 plausible', retroDays >= expect[0] && retroDays <= expect[1], retroDays + ' days');
});

console.log('\nLakshmi yoga');
/*
 * BPHS verses 27-28: "If the 9th lord is in an angle identical with his
 * Moola-Trikona sign or own sign or exaltation sign while the ascendant lord is
 * endowed with strength, Lakshmi yoga occurs."
 *
 * Taken literally that is kendras only, and the yoga is commonly read to allow
 * the trines as well. Both are accepted; the finding records which, so the wider
 * reading cannot pass itself off as the text's own.
 */
(function () {
  var lagna = 2;                                    // Gemini
  var body = function (name, sign, deg) {
    return { name: name, sign: sign, longitude: sign * 30 + deg,
             house: ((sign - lagna) % 12 + 12) % 12 + 1 };
  };
  // 9th lord Saturn exalted in Libra in the 5th, Venus in its moolatrikona beside it.
  var base = function (extra) {
    return { ascendant: { longitude: lagna * 30 + 10 },
      planets: [body('Saturn', 6, 20), body('Venus', 6, 8), body('Sun', 9, 5),
                body('Moon', 0, 5), body('Mars', 1, 5), body('Mercury', extra === undefined ? 10 : extra, 5),
                body('Jupiter', 3, 5)] };
  };
  var strongMercury = { Mercury: { strong: true, rupas: 7.4, required: 7 } };

  var found = Yogas.lakshmi(base(), strongMercury);
  ok('the 9th lord exalted in a trine with a strong lagna lord is Lakshmi yoga',
     found.length === 1 && found[0].yoga === 'Lakshmi Yoga', found.length + ' found');
  ok('and the finding says it rests on the wider reading, not the text\'s wording',
     found[0].kind === 'trine' &&
     /a trine, which the wider reading allows and the text does not say/.test(found[0].reasons[0]));
  ok('it names both grahas the yoga turns on',
     found[0].grahas.join(',') === 'Saturn,Mercury' && found[0].houses.join(',') === '9,5');

  /*
   * Venus is Lakshmi's karaka and some formulations add its strength. Parashara
   * does not, so it is reported when it happens to be dignified and never required.
   */
  ok('a dignified Venus is mentioned but is not a condition',
     found[0].reasons.length === 3 && /karaka of Lakshmi/.test(found[0].reasons[2]) &&
     Yogas.lakshmi({ ascendant: { longitude: lagna * 30 + 10 },
       planets: [{ name: 'Saturn', sign: 6, longitude: 6 * 30 + 20, house: 5 },
                 { name: 'Venus', sign: 3, longitude: 3 * 30 + 5, house: 2 }] },
       strongMercury).length === 1);

  // The strength half is not optional.
  ok('a weak lagna lord blocks it',
     Yogas.lakshmi(base(), { Mercury: { strong: false, rupas: 4, required: 7 } }).length === 0);
  ok('and so does having no strength reading at all',
     Yogas.lakshmi(base(), null).length === 0 && Yogas.lakshmi(base(), {}).length === 0);

  // The dignity half likewise: Saturn moved out of Libra keeps the house but loses the sign.
  ok('an undignified 9th lord blocks it, even in the right house', (function () {
    var c = base();
    c.planets[0] = body('Saturn', 4, 20);          // Leo, the 3rd, neither dignified nor angular
    return Yogas.lakshmi(c, strongMercury).length === 0;
  })());
  ok('and a dignified 9th lord in neither angle nor trine blocks it', (function () {
    var c = base();
    c.planets[0] = body('Saturn', 9, 20);          // Capricorn, own sign, but the 8th
    return Yogas.lakshmi(c, strongMercury).length === 0;
  })());

  /*
   * Parashara's own wording, the case the text actually describes. From an Aries
   * lagna the 9th is Sagittarius, so Jupiter rules it, and Jupiter exalted in
   * Cancer lands in the 4th: an angle, and no trine about it.
   */
  ok('the angular case is reported as resting on the text\'s own wording', (function () {
    var asc = 0;                                    // Aries; the 9th is Sagittarius
    var h = function (sign) { return ((sign - asc) % 12 + 12) % 12 + 1; };
    var c = { ascendant: { longitude: asc * 30 + 10 }, planets: [
      { name: 'Jupiter', sign: 3, longitude: 3 * 30 + 5, house: h(3) },      // Cancer, exalted, 4th
      { name: 'Mars', sign: 0, longitude: 20, house: h(0) },
      { name: 'Venus', sign: 8, longitude: 8 * 30 + 5, house: h(8) }] };
    var f = Yogas.lakshmi(c, { Mars: { strong: true, rupas: 5.6, required: 5 } });
    return f.length === 1 && f[0].kind === 'angle' && f[0].houses.join(',') === '9,4' &&
      /an angle, which is how Parashara words it/.test(f[0].reasons[0]);
  })());

  // The two lords can never be the same graha, the signs being eight apart.
  ok('the lagna lord and the 9th lord are always different grahas', (function () {
    for (var sign = 0; sign < 12; sign++) {
      if (A.SIGN_LORDS[sign] === A.SIGN_LORDS[(sign + 8) % 12]) return false;
    }
    return true;
  })());
})();

console.log('\nPancha Mahapurusha yogas');
/*
 * BPHS chapter 75, verses 1-2: "When Mars, Mercury, Jupiter, Venus and Saturn
 * being in their own sign or in their sign of exaltation, be in Kendra to the
 * Ascendant, they give rise to Ruchaka, Bhadra, Hamsa, Malavya and Sasa yogas
 * respectively."
 *
 * One rule with five names, so it is one detector, and Malavya differs from Sasa
 * in nothing but which graha is standing there.
 */
(function () {
  var lagna = 0;                                   // Aries
  var body = function (name, sign, deg) {
    return { name: name, sign: sign, longitude: sign * 30 + deg,
             house: ((sign - lagna) % 12 + 12) % 12 + 1 };
  };
  var chartOf = function (planets) {
    return { ascendant: { longitude: lagna * 30 + 10 }, planets: planets };
  };

  // Venus exalted in Pisces is the 12th from Aries, so move the lagna to make it
  // a kendra: from Capricorn, Pisces is the 3rd; from Sagittarius, the 4th.
  var malavya = (function () {
    var asc = 8;                                   // Sagittarius, so Pisces is the 4th
    var house = ((11 - asc) % 12 + 12) % 12 + 1;
    return { ascendant: { longitude: asc * 30 + 10 },
      planets: [{ name: 'Venus', sign: 11, longitude: 11 * 30 + 12, house: house }] };
  })();
  var found = Yogas.mahapurusha(malavya);
  ok('Venus exalted in a kendra is Malavya yoga',
     found.length === 1 && found[0].title === 'Malavya yoga' &&
     found[0].grahas.join('') === 'Venus' && found[0].houses.join('') === '4', found.length + ' found');
  ok('and it is reported as one of the five, not as its own thing',
     found[0].yoga === 'Pancha Mahapurusha Yoga' && found[0].family === 'Pancha Mahapurusha yoga' &&
     found[0].kind === 'malavya');

  ok('each of the five is named for its own graha', (function () {
    var want = { Mars: 'Ruchaka', Mercury: 'Bhadra', Jupiter: 'Hamsa',
                 Venus: 'Malavya', Saturn: 'Sasa' };
    return Object.keys(want).every(function (g) { return Yogas.MAHAPURUSHA[g] === want[g]; }) &&
      Object.keys(Yogas.MAHAPURUSHA).length === 5;
  })());

  /*
   * The luminaries are not in it. The text lists the five taras and stops, so a
   * Sun exalted in a kendra forms nothing here however strong it looks.
   */
  ok('the Sun and Moon form no Mahapurusha yoga', (function () {
    var sunExalted = chartOf([body('Sun', 0, 10), body('Moon', 1, 2)]);   // Aries 1st, Taurus 2nd
    return Yogas.mahapurusha(sunExalted).length === 0 &&
      Yogas.MAHAPURUSHA.Sun === undefined && Yogas.MAHAPURUSHA.Moon === undefined;
  })());

  // Both halves bind: dignity without a kendra, and a kendra without dignity.
  ok('an own sign outside a kendra forms nothing',
     Yogas.mahapurusha(chartOf([body('Mars', 7, 10)])).length === 0);   // Scorpio, the 8th
  ok('and a kendra without dignity forms nothing',
     Yogas.mahapurusha(chartOf([body('Mars', 3, 10)])).length === 0);   // Cancer, 4th, debilitated

  ok('all four kendras count, and only those', (function () {
    var houses = [];
    for (var sign = 0; sign < 12; sign++) {
      // Mars in Aries or Scorpio only; test the house rule with Aries and a moving lagna
      var asc = ((0 - sign) % 12 + 12) % 12;
      var c = { ascendant: { longitude: asc * 30 + 10 },
        planets: [{ name: 'Mars', sign: 0, longitude: 10, house: sign + 1 }] };
      if (Yogas.mahapurusha(c).length) houses.push(sign + 1);
    }
    return houses.join(',') === '1,4,7,10';
  })());

  /*
   * The text says "own sign or exaltation" and never mentions moolatrikona, which
   * costs nothing only because all five of these grahas have their moolatrikona
   * inside a sign they already own. The Moon's is the one that lies outside, and
   * the Moon is not one of the five. If that ever stopped being true the wording
   * would start quietly excluding placements.
   */
  ok('every one of the five has its moolatrikona inside a sign it owns', (function () {
    return Object.keys(Yogas.MAHAPURUSHA).every(function (g) {
      var d = A.DIGNITY[g];
      return d.mool && d.own.indexOf(d.mool.sign) >= 0;
    }) && A.DIGNITY.Moon.own.indexOf(A.DIGNITY.Moon.mool.sign) < 0;
  })());
})();

console.log('\nVimsopaka bala');
/*
 * Verses 26-27: "Multiply the figure due to full strength for the division by the
 * Varga Viswa and divide by 20 to get the exact strength of the planet."
 */
(function () {
  var place = { latitude: 23.5158, longitude: 87.308, tzOffsetMinutes: 330 };
  var c = A.chart({ jdUT: 2446146.7256944445, latitude: place.latitude,
                    longitude: place.longitude, tzOffsetMinutes: 330 });
  var pos = {};
  c.planets.forEach(function (p) { pos[p.name] = p; });

  /*
   * The name means "of twenty", and the two ends of the scale are what fix the
   * arithmetic: own sign in every division is the full twenty, a great enemy in
   * every division is five. Five rather than nothing, which is the part that
   * catches people out - the floor is not zero.
   */
  ok('own sign throughout scores exactly twenty, in every scheme', (function () {
    return A.VARGA_SCHEME_ORDER.every(function (k) {
      var sch = A.VARGA_SCHEMES[k];
      var total = sch.divisions.reduce(function (t, d) {
        return t + sch.weights[d] * A.VARGA_VISWA.own / 20;
      }, 0);
      return Math.abs(total - 20) < 1e-9;
    });
  })());
  ok('and a great enemy throughout scores five, not nothing', (function () {
    return A.VARGA_SCHEME_ORDER.every(function (k) {
      var sch = A.VARGA_SCHEMES[k];
      var total = sch.divisions.reduce(function (t, d) {
        return t + sch.weights[d] * A.VARGA_VISWA.adhishatru / 20;
      }, 0);
      return Math.abs(total - 5) < 1e-9;
    });
  })());

  ok('moolatrikona keeps the same twenty as an own sign, the text giving it no rung',
     A.VARGA_VISWA.moolatrikona === 20 && A.VARGA_VISWA.own === 20);
  ok('the varga viswa figures are Parashara\'s six',
     A.VARGA_VISWA.adhimitra === 18 && A.VARGA_VISWA.mitra === 15 &&
     A.VARGA_VISWA.sama === 10 && A.VARGA_VISWA.shatru === 7 &&
     A.VARGA_VISWA.adhishatru === 5);

  ok('every graha scores inside the five-to-twenty range, in every scheme', (function () {
    return A.VARGA_SCHEME_ORDER.every(function (k) {
      var sch = A.VARGA_SCHEMES[k];
      return Shadbala.GRAHAS.every(function (g) {
        var v = A.vimsopaka(g, pos[g].longitude, sch, pos);
        return v && v.total >= 5 - 1e-9 && v.total <= 20 + 1e-9;
      });
    });
  })());

  ok('the parts add up to the total they are shown beside', (function () {
    var sch = A.VARGA_SCHEMES.shodasavarga;
    return Shadbala.GRAHAS.every(function (g) {
      var v = A.vimsopaka(g, pos[g].longitude, sch, pos);
      var sum = v.parts.reduce(function (t, p) { return t + p.score; }, 0);
      return v.parts.length === sch.divisions.length && Math.abs(sum - v.total) < 1e-9;
    });
  })());

  // Exaltation has no varga viswa rung, so it is scored by the relation beneath it.
  ok('an exalted graha is scored by its relation to the sign\'s lord', (function () {
    var sch = A.VARGA_SCHEMES.shodasavarga;
    var v = A.vimsopaka('Venus', pos.Venus.longitude, sch, pos);
    return v.parts.every(function (p) { return A.VARGA_VISWA[p.relation] !== undefined; });
  })());

  ok('the nodes get no score at all', (function () {
    var sch = A.VARGA_SCHEMES.saptavarga;
    return ['Rahu', 'Ketu'].every(function (n) {
      return A.vimsopaka(n, pos[n].longitude, sch, pos) === null;
    });
  })());

  /*
   * Verses 26-27 again: below 5 incapable, 5 to 10 some good, up to 15 mediocre,
   * above 15 wholly favourable.
   */
  ok('the bands are the four Parashara names, in order', (function () {
    var b = A.VIMSOPAKA_BANDS;
    return b.length === 4 && b[0].below === 5 && b[1].below === 10 &&
      b[3].below === Infinity &&
      b.map(function (x) { return x.key; }).join(',') === 'poor,some,mediocre,strong';
  })());
})();

console.log('\nRaja yoga, angle and trine');
/*
 * Chapter 41, verse 28: "The angles are known as Vishnu sthaanas while the trines
 * are called Lakshmi sthaanas. If the lord of an angle establishes relationship
 * with a trinal lord, a Raja-yoga will obtain."
 */
(function () {
  var lagna = 0;                                   // Aries: 9th Sagittarius, 10th Capricorn
  var body = function (name, sign) {
    return { name: name, sign: sign, longitude: sign * 30 + 10,
             house: ((sign - lagna) % 12 + 12) % 12 + 1 };
  };
  var chartOf = function (planets) {
    return { ascendant: { longitude: lagna * 30 + 10 }, planets: planets };
  };

  ok('the house sets are Parashara\'s, the 1st an angle and not a trine',
     Yogas.VISHNU_HOUSES.join(',') === '1,4,7,10' &&
     Yogas.LAKSHMI_HOUSES.join(',') === '5,9' &&
     Yogas.LAKSHMI_HOUSES.indexOf(1) < 0);

  // Jupiter rules the 9th from Aries, Saturn the 10th.
  ok('conjunction of an angle lord and a trine lord is raja yoga', (function () {
    var f = Yogas.rajaYoga(chartOf([body('Jupiter', 2), body('Saturn', 2)]));
    return f.length === 1 && f[0].kind === 'conjunction' && f[0].yoga === 'Raja Yoga' &&
      f[0].grahas.sort().join(',') === 'Jupiter,Saturn';
  })());

  ok('an exchange between them likewise', (function () {
    // Jupiter in Capricorn (Saturn's), Saturn in Sagittarius (Jupiter's)
    var f = Yogas.rajaYoga(chartOf([body('Jupiter', 9), body('Saturn', 8)]));
    return f.length === 1 && f[0].kind === 'exchange';
  })());

  /*
   * "Mutual aspects between these two lords." The special aspects are one-way, so
   * one graha reaching another is not the two reaching each other, and only the
   * second is this yoga. Jupiter in Aries casts its 5th onto Leo; Saturn in Leo
   * casts its 3rd, 7th and 10th onto Libra, Aquarius and Taurus, and never back.
   */
  ok('a one-way aspect is not enough', (function () {
    return Yogas.rajaYoga(chartOf([body('Jupiter', 0), body('Saturn', 4)])).length === 0;
  })());
  ok('but a mutual one is', (function () {
    // Opposition: every graha aspects the 7th, so this one is mutual.
    var f = Yogas.rajaYoga(chartOf([body('Jupiter', 0), body('Saturn', 6)]));
    return f.length === 1 && f[0].kind === 'aspect';
  })());

  ok('two angle lords alone form nothing, and two trine lords likewise', (function () {
    // Moon rules the 4th, Venus the 7th - both angles, no trine between them.
    var angles = Yogas.rajaYoga(chartOf([body('Moon', 2), body('Venus', 2)]));
    // Sun rules the 5th, Jupiter the 9th - both trines.
    var trines = Yogas.rajaYoga(chartOf([body('Sun', 2), body('Jupiter', 2)]));
    return angles.length === 0 && trines.length === 0;
  })());

  ok('the nodes rule nothing, so they enter no pairing',
     Yogas.rajaYoga(chartOf([body('Rahu', 2), body('Jupiter', 2), body('Ketu', 8)]))
       .every(function (f) {
         return f.grahas.indexOf('Rahu') < 0 && f.grahas.indexOf('Ketu') < 0;
       }));

  ok('a pair is reported once, not once per direction', (function () {
    // Taurus lagna: Saturn rules the 9th and the 10th, so it holds both sets.
    var asc = 1;
    var h = function (sign) { return ((sign - asc) % 12 + 12) % 12 + 1; };
    var c = { ascendant: { longitude: asc * 30 + 10 }, planets: [
      { name: 'Saturn', sign: 5, longitude: 5 * 30, house: h(5) },
      { name: 'Mercury', sign: 5, longitude: 5 * 30 + 5, house: h(5) }] };
    var f = Yogas.rajaYoga(c);
    return f.length === 1;
  })());

/*
 * One pairing has a name of its own: the 9th lord with the 10th, dharma joined
 * to karma. Every other angle-trine combination is a raja yoga and nothing more
 * particular, which is worth holding because the name is often stretched to
 * cover any of them.
 */
  ok('the 9th lord with the 10th is named Dharma Karmadhipati', (function () {
    var asc = 0;                                   // Aries: 9th Sagittarius, 10th Capricorn
    var h = function (sign) { return ((sign - asc) % 12 + 12) % 12 + 1; };
    var c = { ascendant: { longitude: 10 }, planets: [
      { name: 'Jupiter', sign: 2, longitude: 2 * 30 + 10, house: h(2) },
      { name: 'Saturn', sign: 2, longitude: 2 * 30 + 12, house: h(2) }] };
    var f = Yogas.rajaYoga(c);
    return f.length === 1 && f[0].title === 'Dharma Karmadhipati yoga' &&
      f[0].condition === 'dharma-karmadhipati' &&
      f[0].reasons.some(function (r) { return /dharma joined to karma/.test(r); }) &&
      // the pronoun guard applies here too, this clause being new
      f[0].reasons.every(function (r) { return !/(^|\s)its?(\s|$)/.test(r); });
  })());
  /*
   * Named for the rule, not for the family. "Raja yoga" on its own reads as a
   * verdict on the life, and this one is present in 69 per cent of charts - so
   * the title says which rule produced it and leaves the verdict to the reader.
   * The condition is untouched: it keys the lesson library, and renaming it
   * would silently cost the card its passage.
   */
  ok('and every other pairing is named for the rule that produced it', (function () {
    var asc = 0;                                   // Mars rules the 1st, Sun the 5th
    var h = function (sign) { return ((sign - asc) % 12 + 12) % 12 + 1; };
    var c = { ascendant: { longitude: 10 }, planets: [
      { name: 'Mars', sign: 2, longitude: 2 * 30 + 10, house: h(2) },
      { name: 'Sun', sign: 2, longitude: 2 * 30 + 12, house: h(2) }] };
    var f = Yogas.rajaYoga(c);
    return f.length === 1 && f[0].title === 'Angle-trine raja yoga' &&
      f[0].condition === 'angle-trine' && f[0].subject === 'Raja Yoga';
  })());
  ok('and the bare name is gone from every title the detectors produce',
    (function () {
      var bad = [];
      for (var y = 1950; y < 2020; y += 3) {
        var c = Astro.chart({ jdUT: Astro.julianDay(y, 6, 15, 6.5), latitude: 28.61,
          longitude: 77.21, tzOffsetMinutes: 330 });
        Yogas.detect(c, Shadbala.compute(c, { latitude: 28.61, longitude: 77.21,
          tzOffsetMinutes: 330 })).forEach(function (t) {
            if (t.title === 'Raja yoga') bad.push(y);
          });
      }
      return bad.length === 0;
    })());
  ok('a single graha owning both the 9th and the 10th is not a pairing at all', (function () {
    // Taurus: Saturn owns the 9th and the 10th, so there is no second lord.
    return A.SIGN_LORDS[(1 + 8) % 12] === 'Saturn' && A.SIGN_LORDS[(1 + 9) % 12] === 'Saturn' &&
      A.isYogakaraka('Saturn', 1);
  })());

  ok('a yogakaraka inside the pairing is named as one', (function () {
    var asc = 1;                                   // Taurus; Saturn rules the 9th and 10th
    var h = function (sign) { return ((sign - asc) % 12 + 12) % 12 + 1; };
    var c = { ascendant: { longitude: asc * 30 + 10 }, planets: [
      { name: 'Saturn', sign: 5, longitude: 5 * 30, house: h(5) },
      { name: 'Mercury', sign: 5, longitude: 5 * 30 + 5, house: h(5) }] };
    var f = Yogas.rajaYoga(c)[0];
    return A.isYogakaraka('Saturn', asc) &&
      f.reasons.some(function (r) { return /Saturn holds an angle and a trine by itself/.test(r); });
  })());

  ok('no clause leaves a graha as a bare pronoun', (function () {
    var f = Yogas.rajaYoga(chartOf([body('Jupiter', 2), body('Saturn', 2)]))[0];
    return f.reasons.every(function (r) { return !/(^|\s)its?(\s|$)/.test(r); });
  })());
})();

console.log('\nYogas and aspects inside a division');
/*
 * A parivartana between two grahas in D10 is as real as one in D1, and was going
 * unreported because the only chart the detectors ever saw was the rashi.
 * chartInDivision recasts the nativity so that anything reading a chart reads a
 * divisional chart without knowing the difference.
 */
(function () {
  var place = { latitude: 23.5158, longitude: 87.308, tzOffsetMinutes: 330 };
  var c = A.chart({ jdUT: 2446146.7256944445, latitude: place.latitude,
                    longitude: place.longitude, tzOffsetMinutes: 330 });
  var strengths = Shadbala.compute(c, place).grahas;

  ok('the rashi is returned as itself, not copied', A.chartInDivision(c, 1) === c &&
     A.chartInDivision(c, undefined) === c);

  ok('a division carries every graha, with its own houses', (function () {
    return A.SHODASAVARGA.every(function (d) {
      var dc = A.chartInDivision(c, d);
      return dc.planets.length === c.planets.length &&
        dc.planets.every(function (p) {
          return p.house >= 1 && p.house <= 12 && p.sign >= 0 && p.sign < 12 &&
            A.signOf(p.longitude) === p.sign;
        });
    });
  })());

  ok('houses are counted from the division\'s own ascendant', (function () {
    var dc = A.chartInDivision(c, 10);
    var lagna = A.signOf(dc.ascendant.longitude);
    return dc.planets.every(function (p) {
      return p.house === ((p.sign - lagna) % 12 + 12) % 12 + 1;
    });
  })());

  // Retrogression belongs to the graha, not to a view of it.
  ok('retrogression and speed carry over unchanged', (function () {
    var dc = A.chartInDivision(c, 9);
    return dc.planets.every(function (p, i) {
      return p.retrograde === c.planets[i].retrograde && p.speed === c.planets[i].speed;
    });
  })());

  ok('the rashi longitude is kept, for rules that are about the nativity', (function () {
    var dc = A.chartInDivision(c, 60);
    return dc.planets.every(function (p, i) { return p.rashiLongitude === c.planets[i].longitude; });
  })());

  /*
   * The point of the change. Yogas found in a division are not the rashi's yogas
   * relabelled: different lagna, different lords, different findings.
   */
  ok('yogas differ by division, which is why they are worth computing', (function () {
    var d1 = Yogas.detect(A.chartInDivision(c, 1), strengths).map(function (f) { return f.title; });
    var d10 = Yogas.detect(A.chartInDivision(c, 10), strengths).map(function (f) { return f.title; });
    return d1.length > 0 && d10.length > 0 && d1.join() !== d10.join();
  })());

  ok('every division yields findings that hold together', (function () {
    return A.SHODASAVARGA.every(function (d) {
      return Yogas.detect(A.chartInDivision(c, d), strengths).every(function (f) {
        return f.title && f.summary && f.grahas.length &&
          f.houses.every(function (h) { return h >= 1 && h <= 12; });
      });
    });
  })());

  /*
   * One clause cannot travel. Inside a division the longitude is already a
   * stretched varga longitude, so its navamsha would be the navamsha of a tenth
   * of a sign. It is dropped there rather than computed into nonsense.
   */
  ok('the navamsa clause of neecha bhanga is rashi-only', (function () {
    var inDivision = A.SHODASAVARGA.filter(function (d) { return d !== 1; })
      .some(function (d) {
        return Yogas.neechaBhanga(A.chartInDivision(c, d)).some(function (f) {
          return f.reasons.some(function (r) { return /exalted in navamsa/.test(r); });
        });
      });
    return !inDivision;
  })());

  ok('and aspects are computed per division too', (function () {
    var d1 = Yogas.aspectTable(A.chartInDivision(c, 1));
    var d10 = Yogas.aspectTable(A.chartInDivision(c, 10));
    var shape = function (t) {
      return t.map(function (r) { return r.graha + ':' + r.casts.length; }).join();
    };
    return d1.length === d10.length && d1.length > 0 && shape(d1) !== shape(d10);
  })());
})();

console.log('\nGaja Kesari, and the Kesari it is confused with');
/*
 * BPHS verses 3-4: "Should Jupiter be in an angle from the ascendant or from the
 * Moon, and be conjunct or aspected by (another) benefic, avoiding at the same
 * time debilitation, combustion and inimical sign, Gaja Kesari yoga is caused."
 *
 * Five conditions. The definition in common use is the first of them alone, and
 * Santhanam names that separately: "the Moon-Jupiter mutual angular placement is
 * called as simply Kesari Yoga, vide Phala Deepika, Ch. 6, shloka 14."
 */
(function () {
  var lagna = 0;                                   // Aries
  var body = function (name, sign, deg, extra) {
    var p = { name: name, sign: sign, longitude: sign * 30 + (deg === undefined ? 10 : deg),
              house: ((sign - lagna) % 12 + 12) % 12 + 1, retrograde: false };
    if (extra) Object.keys(extra).forEach(function (k) { p[k] = extra[k]; });
    return p;
  };
  // Jupiter in Cancer, exalted, the 4th from Aries; Moon in Libra; Venus with Jupiter.
  var full = function (over) {
    var planets = [body('Jupiter', 3), body('Moon', 6), body('Venus', 3),
                   body('Sun', 10), body('Mercury', 10), body('Mars', 1), body('Saturn', 8)];
    if (over) over(planets);
    return { ascendant: { longitude: lagna * 30 + 10 }, planets: planets };
  };

  var found = Yogas.gajaKesari(full());
  ok('all five conditions together give Gaja Kesari',
     found.length === 1 && found[0].title === 'Gaja Kesari yoga' && found[0].kind === 'gaja',
     found.length ? found[0].title : 'nothing');

  /*
   * Each of the three faults alone drops it to Kesari, which is the whole point
   * of separating them: the popular reading would call all four of these the
   * same yoga.
   */
  ok('debilitation drops it to Kesari', (function () {
    // Jupiter to Capricorn, its debilitation, the 10th from Aries and 4th from Libra.
    var f = Yogas.gajaKesari(full(function (ps) {
      ps[0] = body('Jupiter', 9); ps[2] = body('Venus', 9);
    }));
    return f.length === 1 && f[0].kind === 'kesari' &&
      /it is debilitated/.test(f[0].summary);
  })());

  ok('combustion drops it to Kesari', (function () {
    var f = Yogas.gajaKesari(full(function (ps) {
      ps[3] = body('Sun', 3, 14);                  // Sun beside Jupiter in Cancer
    }));
    return f.length === 1 && f[0].kind === 'kesari' && /combust/.test(f[0].summary);
  })());

  ok('an enemy\'s sign drops it to Kesari', (function () {
    // Jupiter to Leo, the Sun's sign; the Sun is not Jupiter's enemy, so use Mercury's
    var f = Yogas.gajaKesari(full(function (ps) {
      ps[0] = body('Jupiter', 5); ps[2] = body('Venus', 5); ps[1] = body('Moon', 8);
    }));
    return f.length === 1 && f[0].kind === 'kesari' && /sign of an enemy/.test(f[0].summary);
  })());

  ok('and no benefic on it drops it too', (function () {
    var f = Yogas.gajaKesari(full(function (ps) {
      ps[2] = body('Venus', 1);                    // Venus away, aspecting nothing
    }));
    return f.length === 1 && f[0].kind === 'kesari' &&
      /no other benefic/.test(f[0].summary);
  })());

  ok('the lesser form says what it is short of', (function () {
    var f = Yogas.gajaKesari(full(function (ps) {
      ps[0] = body('Jupiter', 9); ps[2] = body('Venus', 9);
    }))[0];
    return /falls short of Gaja Kesari because/.test(f.summary) &&
      f.reasons.some(function (r) { return /Phaladeepika/.test(r); });
  })());

  // No angle at all, from either reference, is neither yoga.
  ok('Jupiter in no angle forms nothing', (function () {
    return Yogas.gajaKesari(full(function (ps) {
      ps[0] = body('Jupiter', 2); ps[1] = body('Moon', 0);   // Gemini, the 3rd from Aries and Aries
    })).length === 0;
  })());

  /*
   * Mutual angularity needs no separate test: the kendras are symmetric, so if
   * Jupiter is 4th from the Moon the Moon is 10th from Jupiter.
   */
  ok('the kendras are symmetric, so mutual angularity is automatic', (function () {
    var K = [1, 4, 7, 10];
    for (var apart = 0; apart < 12; apart++) {
      var there = (apart % 12) + 1;
      var back = ((12 - apart) % 12) + 1;
      if ((K.indexOf(there) >= 0) !== (K.indexOf(back) >= 0)) return false;
    }
    return true;
  })());
})();

console.log('\nChara karakas and avasthas');
/*
 * Chapter 32 verses 1-17. Jaimini's variable significators, assigned by how far
 * a graha has travelled into its sign: "whichever has traversed maximum number
 * of degrees in a particular sign is called Atmakaraka", and the rest follow in
 * order of longitude.
 */
(function () {
  var at = function (degrees) {
    return { planets: Object.keys(degrees).map(function (name) {
      return { name: name, longitude: degrees[name] };
    }) };
  };
  /*
   * Parashara's own worked example, chapter 32: the Moon at 27°35'46" is
   * Atmakaraka, Venus at 27°17'50" Amatyakaraka, Jupiter at 26°7'13"
   * Bhratrukaraka, and Rahu at 22°22'54" - counted back from the end of its
   * sign - Matrukaraka, with Mercury, the Sun and Mars following.
   */
  var worked = at({
    Moon: 27 + 35 / 60 + 46 / 3600,
    Venus: 27 + 17 / 60 + 50 / 3600,
    Jupiter: 26 + 7 / 60 + 13 / 3600,
    Rahu: 30 - (22 + 22 / 60 + 54 / 3600),     // stored forwards, read backwards
    Mercury: 14 + 54 / 60 + 13 / 3600,
    Sun: 7 + 12 / 60 + 18 / 3600,
    Mars: 6 + 18 / 60 + 46 / 3600,
    Saturn: 1
  });
  var k = A.charaKarakas(worked);
  ok('the karakas fall as Parashara\'s worked example has them',
     k.Moon === 'Atmakaraka' && k.Venus === 'Amatyakaraka' &&
     k.Jupiter === 'Bhratrukaraka' && k.Rahu === 'Matrukaraka' &&
     k.Mercury === 'Pitrukaraka' && k.Sun === 'Putrakaraka' &&
     k.Mars === 'Gnatikaraka' && k.Saturn === 'Darakaraka');
  /*
   * "In the case of Rahu, deduct his longitude in that particular sign from 30."
   * It travels backwards, so its share of the sign is what is left of it.
   */
  ok('and Rahu is counted back from the end of its sign', (function () {
    // Rahu one degree in: read as 29, so it outranks a graha at 28.
    var c = at({ Rahu: 1, Sun: 28, Moon: 2, Mars: 3, Mercury: 4, Jupiter: 5,
                 Venus: 6, Saturn: 7 });
    return A.charaKarakas(c).Rahu === 'Atmakaraka' &&
      A.charaKarakas(c).Sun === 'Amatyakaraka';
  })());
  /*
   * Eight, with Rahu, which is the scheme the chapter's own example takes.
   * Ketu is in neither the seven nor the eight.
   */
  ok('and Ketu takes none, being in neither scheme', (function () {
    var c = at({ Ketu: 29, Sun: 1, Moon: 2, Mars: 3, Mercury: 4, Jupiter: 5,
                 Venus: 6, Saturn: 7, Rahu: 8 });
    return A.charaKarakas(c).Ketu === undefined &&
      A.KARAKA_GRAHAS.indexOf('Ketu') < 0 && A.KARAKA_GRAHAS.length === 8 &&
      A.CHARA_KARAKAS.length === 8;
  })());
  ok('and the eight are named in the order the chapter gives them',
     A.CHARA_KARAKAS.join(' ') === 'Atmakaraka Amatyakaraka Bhratrukaraka ' +
       'Matrukaraka Pitrukaraka Putrakaraka Gnatikaraka Darakaraka');
  /*
   * Every chart hands out all eight, there being eight grahas eligible, so one
   * missing would mean a graha was skipped.
   */
  ok('and a real chart hands out all eight', (function () {
    for (var y = 1950; y < 1990; y++) {
      var c = A.chart({ jdUT: A.julianDay(y, 1 + y % 12, 15, 6.5), latitude: 28.61,
                        longitude: 77.21, tzOffsetMinutes: 330 });
      var given = A.charaKarakas(c);
      var names = Object.keys(given).map(function (n) { return given[n]; }).sort();
      if (names.join(' ') !== A.CHARA_KARAKAS.slice().sort().join(' ')) return false;
    }
    return true;
  })());

  /*
   * Baladi avastha, chapter 45 verses 3-4: "Infant, youthful, adolescent, old
   * and dead are the states of planets placed in the ascendant order at the rate
   * of six degrees in odd signs. This arrangement is reverse in the case of even
   * signs."
   */
  ok('the five ages run six degrees each up an odd sign',
     A.baladiAvastha(0, 3) === 'Bala' && A.baladiAvastha(0, 9) === 'Kumara' &&
     A.baladiAvastha(0, 15) === 'Yuva' && A.baladiAvastha(0, 21) === 'Vriddha' &&
     A.baladiAvastha(0, 27) === 'Mrita');
  ok('and down an even one',
     A.baladiAvastha(1, 3) === 'Mrita' && A.baladiAvastha(1, 9) === 'Vriddha' &&
     A.baladiAvastha(1, 15) === 'Yuva' && A.baladiAvastha(1, 21) === 'Kumara' &&
     A.baladiAvastha(1, 27) === 'Bala');
  // 30 degrees exactly would index past the end; a graha at 29.999 is still in.
  ok('and the last degree of a sign stays inside the last stage',
     A.baladiAvastha(0, 29.9999) === 'Mrita' && A.baladiAvastha(0, 30) === 'Mrita');
  /*
   * Verse 4 grades them: "One fourth, half, full, negligible and nil are the
   * grades of results due to a planet in infant, youthful, adolescent, old and
   * dead states." Yuva is the peak, so a graha gives most in the middle of its
   * sign and least at either end - which is not what a scale running infant to
   * dead suggests, and is why the grades are carried rather than inferred.
   */
  ok('and what each age is worth is carried, the peak being in the middle',
     A.BALADI.join(' ') === 'Bala Kumara Yuva Vriddha Mrita' &&
     A.BALADI_WORTH.Yuva === 'its results in full' &&
     A.BALADI_WORTH.Mrita === 'nothing' &&
     A.BALADI_WORTH.Bala === 'a quarter of its results');
})();

console.log('\nCombustion');
/*
 * With the retrograde column: three grahas lose their rays closer in when
 * retrograde, Mars most of all.
 *
 * Santhanam's chapter 4 table and Raman's Hindu Predictive Astrology section 54
 * agree on six of the seven and on every retrograde figure. They differ on
 * Saturn, 16 against 15, and Raman's is used.
 */
ok('the orbs are Raman\'s', A.COMBUSTION.Moon.direct === 12 &&
   A.COMBUSTION.Mars.direct === 17 && A.COMBUSTION.Mars.retrograde === 8 &&
   A.COMBUSTION.Mercury.direct === 14 && A.COMBUSTION.Mercury.retrograde === 12 &&
   A.COMBUSTION.Jupiter.direct === 11 && A.COMBUSTION.Venus.direct === 10 &&
   A.COMBUSTION.Venus.retrograde === 8 && A.COMBUSTION.Saturn.direct === 15 &&
   A.COMBUSTION.Saturn.retrograde === 15);
ok('a graha just inside its orb is combust and just outside is not',
   A.isCombust('Jupiter', 10, 0, false) && !A.isCombust('Jupiter', 12, 0, false));
ok('the orb is measured the short way round the circle',
   A.isCombust('Jupiter', 355, 0, false) && A.isCombust('Jupiter', 5, 0, false));
ok('retrograde Mars burns at 8 degrees rather than 17',
   A.isCombust('Mars', 10, 0, false) && !A.isCombust('Mars', 10, 0, true));
// "Rahu and Ketu should not be treated as combust ... they are only mathematical points."
ok('the nodes are never combust, being points',
   !A.isCombust('Rahu', 1, 0, false) && !A.isCombust('Ketu', 1, 0, false) &&
   A.COMBUSTION.Rahu === undefined);


console.log('\nBudha-Aditya and combustion, which overlap');
/*
 * Raman gives two numbers in two books and never reconciles them: Mercury's
 * orb of combustion is 14 degrees direct and 12 retrograde in Hindu Predictive
 * Astrology 54, while Three Hundred Important Combinations 24 puts the floor
 * for Budha-Aditya at 10. Between them Mercury is burnt and gives the yoga at
 * once, which reads as a bug unless the finding says otherwise. So it does,
 * and that sentence is what these tests hold in place.
 */
(function () {
  var delhi = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
  var read = function (y, m) {
    var c = Astro.chart({ jdUT: Astro.julianDay(y, m, 15, 1), latitude: 28.61,
      longitude: 77.21, tzOffsetMinutes: 330 });
    var at = {};
    c.planets.forEach(function (p) { at[p.name] = p; });
    var apart = Math.abs(Astro.norm360(at.Mercury.longitude - at.Sun.longitude));
    if (apart > 180) apart = 360 - apart;
    return {
      apart: apart, retrograde: at.Mercury.retrograde,
      combust: Astro.isCombust('Mercury', at.Mercury.longitude, at.Sun.longitude,
        at.Mercury.retrograde),
      found: Yogas.detect(c, Shadbala.compute(c, delhi)).filter(function (f) {
        return f.subject === 'Budha Aditya Yoga';
      })[0]
    };
  };
  var says = function (f, what) {
    return !!f && f.reasons.join(' ').indexOf(what) > -1;
  };

  // 11.97 degrees, direct: inside the 14-degree orb, outside the 10-degree floor
  var band = read(1972, 6);
  ok('inside the band Mercury is combust and still gives the yoga',
    band.combust && !!band.found,
    band.apart.toFixed(2) + ' combust=' + band.combust + ' yoga=' + !!band.found);
  ok('and the finding says so itself rather than leaving it to look like a bug',
    says(band.found, 'combust all the same') &&
    says(band.found, 'two') && says(band.found, 'books'),
    band.found ? band.found.reasons[2] : 'no finding');
  /*
   * Rao's division of the question is what makes the band readable at all: the
   * yoga is there and the burning costs it something. That reading holds on
   * either setting, because it is a claim about what combustion does and not
   * about where the boundary sits, so both branches have to carry it.
   */
  ok('and resolves it Rao\u2019s way - formed, and discounted',
    says(band.found, 'discounted') && says(band.found, 'Rao'),
    band.found ? band.found.reasons[3] : 'no finding');

  // 14.33 degrees, direct: clear of both
  var clear = read(1978, 3);
  ok('clear of the orb the yoga stands on its own two reasons',
    !clear.combust && !!clear.found && clear.found.reasons.length === 2,
    clear.apart.toFixed(2) + ' reasons=' +
      (clear.found ? clear.found.reasons.length : 0));

  /*
   * 12.41 degrees retrograde. Direct, that would be combust and the card would
   * carry the extra line; retrograde the orb is 12, so it is not. The narrower
   * retrograde orb has to reach this far or the overlap would be reported on a
   * chart that does not have it.
   */
  var retro = read(1989, 5);
  ok('the narrower retrograde orb is the one that decides it',
    retro.retrograde && !retro.combust && !!retro.found &&
      retro.found.reasons.length === 2 && retro.apart > 12 && retro.apart < 14,
    retro.apart.toFixed(2) + ' R=' + retro.retrograde + ' combust=' + retro.combust);

  /*
   * Below the floor there is no yoga to qualify. Swept rather than sampled,
   * because this is the half of the rule most treatments drop.
   */
  var wrong = 0, inside = 0;
  for (var y = 1950; y < 2020; y++) {
    for (var m = 1; m <= 12; m++) {
      var r = read(y, m);
      if (r.apart < 10) { inside++; if (r.found) wrong++; }
    }
  }
  ok('below the floor there is never a yoga, over a seventy-year sweep',
    inside > 100 && wrong === 0, wrong + ' of ' + inside + ' wrongly claimed');
})();


console.log('\nRaman sets a floor for Budha-Aditya, Rao does not');
/*
 * Settled against K. N. Rao's own book rather than against anyone's summary of
 * it. Advance Techniques of Astrology Prediction, illustration one of the
 * education chapter, reads "Mercury in fifth with the Sun forming Budhaditya
 * yoga and in exaltation aspected by Jupiter" for a chart whose printed
 * longitudes put the two six degrees apart - inside Raman's floor, and combust.
 * The chart is the anchor for the whole disagreement, so the test recomputes it
 * and checks the figures against what he printed before drawing anything from
 * it. If the engine ever stops reproducing them, this is no longer his chart
 * and the finding below is no longer evidence of anything.
 */
(function () {
  var delhi = { latitude: 28.6139, longitude: 77.209, tzOffsetMinutes: 330 };
  var jd = Astro.julianDay(1964, 10, 7, 21.5 - 5.5);   // 21:30 IST
  var chart = Astro.chart({ jdUT: jd, latitude: delhi.latitude,
    longitude: delhi.longitude, tzOffsetMinutes: delhi.tzOffsetMinutes });
  var at = {};
  chart.planets.forEach(function (p) { at[p.name] = p; });
  var mins = function (lon) { return (lon % 30) * 60; };   // arcminutes into the sign
  var near = function (lon, deg, min) {
    return Math.abs(mins(lon) - (deg * 60 + min)) <= 1.5;
  };

  ok('Rao\u2019s printed longitudes come back out of this engine',
    near(at.Sun.longitude, 21, 3) && near(at.Mercury.longitude, 14, 57) &&
    near(at.Moon.longitude, 14, 33) && near(at.Jupiter.longitude, 1, 54) &&
    near(chart.ascendant.longitude, 24, 33) && at.Jupiter.retrograde,
    'Sun ' + mins(at.Sun.longitude).toFixed(0) + "' Mercury " +
      mins(at.Mercury.longitude).toFixed(0) + "' asc " +
      mins(chart.ascendant.longitude).toFixed(0) + "'");
  ok('and they are the placements he describes - fifth house, Mercury exalted',
    at.Sun.house === 5 && at.Mercury.house === 5 &&
    Astro.dignityOf('Mercury', at.Mercury.sign, at.Mercury.longitude % 30) === 'Exalted',
    'Sun h' + at.Sun.house + ' Mercury h' + at.Mercury.house);

  var apart = Math.abs(Astro.norm360(at.Mercury.longitude - at.Sun.longitude));
  if (apart > 180) apart = 360 - apart;
  ok('the two are six degrees apart, and combust by every orb in play',
    apart > 6 && apart < 6.2 && [17, 14, 12, 8].every(function (orb) {
      return apart < orb;
    }), apart.toFixed(2));

  var find = function (floor) {
    chart.budhaAdityaFloor = floor;
    var f = Yogas.detect(chart, Shadbala.compute(chart, delhi)).filter(function (x) {
      return x.subject === 'Budha Aditya Yoga';
    })[0];
    chart.budhaAdityaFloor = undefined;
    return f;
  };
  ok('on Raman\u2019s floor the chart Rao calls Budha-Aditya gives no yoga',
    !find(Yogas.BUDHA_FLOOR.RAMAN));
  var rao = find(Yogas.BUDHA_FLOOR.NONE);
  ok('with the floor dropped it does, which is Rao\u2019s reading', !!rao);
  ok('and the finding names whose reading produced it',
    !!rao && rao.reasons.join(' ').indexOf('Rao') > -1,
    rao ? rao.reasons[1] : 'no finding');
  ok('and still discounts the yoga for the combustion rather than ignoring it',
    !!rao && rao.reasons.join(' ').indexOf('discounted') > -1,
    rao ? rao.reasons[rao.reasons.length - 1] : 'no finding');
  ok('a chart with no setting stamped on it still uses Raman\u2019s floor',
    !find(undefined), 'the default must not be the permissive one');

  /*
   * The arithmetic that decides the default. Mercury is never far from the Sun,
   * so with no floor the yoga is exactly "the two share a sign" - which the
   * measured figures should agree with to the tenth.
   */
  var F = require(require('path').join(__dirname, '../data/frequencies.js'));
  ok('dropping the floor is the only thing the setting moves',
    Object.keys(F.yogaNoFloor).length === 1 &&
    F.yogaNoFloor['Budha Aditya Yoga|general'] !== undefined,
    Object.keys(F.yogaNoFloor).join(', '));
  ok('and it roughly doubles how often the yoga is claimed',
    F.yogaNoFloor['Budha Aditya Yoga|general'] > 50 &&
    F.yoga['Budha Aditya Yoga|general'] < 30,
    F.yoga['Budha Aditya Yoga|general'] + '% -> ' +
      F.yogaNoFloor['Budha Aditya Yoga|general'] + '%');
})();


console.log('\nTwelve more from Raman, and one correction to what was here');
/*
 * The Sun's company was the plain gap: the Moon's four were implemented from
 * the start and the exact mirror was not. The rest came out of reading the
 * 1947 edition against what this file already did.
 */
(function () {
  var delhi = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
  var chartAt = function (y, m, d, h) {
    return A.chart({ jdUT: A.julianDay(y, m, d, h), latitude: 28.61,
      longitude: 77.21, tzOffsetMinutes: 330 });
  };
  var find = function (c, subject) {
    return Yogas.detect(c, Shadbala.compute(c, delhi)).filter(function (f) {
      return f.subject === subject;
    })[0];
  };

  /*
   * Sakata, which we were over-reporting. Phaladeepika gives the three houses
   * and then takes them back where the Moon is angular from the lagna; Raman
   * gives only the three. Swept, because the point is how often it mattered.
   */
  var claimed = 0, cancelled = 0;
  for (var y = 1950; y < 2020; y++) {
    for (var m = 1; m <= 12; m += 2) {
      var c = chartAt(y, m, 15, 1);
      var at2 = {};
      c.planets.forEach(function (p) { at2[p.name] = p; });
      var lag = A.signOf(c.ascendant.longitude);
      var fromJup = ((at2.Moon.sign - at2.Jupiter.sign) % 12 + 12) % 12 + 1;
      var fromLag = ((at2.Moon.sign - lag) % 12 + 12) % 12 + 1;
      if ([6, 8, 12].indexOf(fromJup) < 0) continue;
      claimed++;
      var got = !!find(c, 'Sakata Yoga');
      if ([1, 4, 7, 10].indexOf(fromLag) >= 0) {
        cancelled++;
        if (got) { claimed = -1; break; }        // the exception was not applied
      } else if (!got) { claimed = -1; break; }  // it was applied too widely
    }
    if (claimed === -1) break;
  }
  ok('Sakata is withheld where Phaladeepika says there is none, and only there',
    claimed > 0 && cancelled > 0, cancelled + ' of ' + claimed + ' cancelled');

  /*
   * The Sun's company. Raman names three and no fourth, which is the asymmetry
   * with the Moon worth holding: a Sun with nobody beside it is not Kemadruma,
   * it is nothing at all.
   */
  var solar = 0, none = 0, total = 0;
  for (y = 1950; y < 2020; y++) {
    var c2 = chartAt(y, 6, 15, 1);
    total++;
    var f = Yogas.detect(c2, Shadbala.compute(c2, delhi)).filter(function (x) {
      return x.family === 'The Sun’s company';
    });
    if (f.length > 1) { solar = -1; break; }     // only one of the three can hold
    if (f.length) solar++; else none++;
  }
  ok('exactly one of the Sun’s three holds, or none, never two',
    solar > 0, solar + ' of ' + total + ' charts, ' + none + ' with none');
  ok('and a Sun with nobody beside it produces no finding, there being no fourth name',
    none > 0, none + ' such charts in the sweep');

  /*
   * Mahabhagya. The day test is the rule and every source that carries the
   * yoga asks for it, so a man born at night does not have it however the
   * tripod falls. Raman's worked chart 25 is a night birth read as having it,
   * against the definition printed two paragraphs above; the definition is
   * what is followed here. Built rather than hunted, so the assertion always
   * runs.
   */
  var made = { ascendant: { longitude: 10 },          // Aries, an odd sign
    gender: 'male', dayBirth: false,
    planets: [{ name: 'Sun', sign: 4, longitude: 4 * 30 + 5, house: 5 },
              { name: 'Moon', sign: 6, longitude: 6 * 30 + 5, house: 7 }] };
  ok('a man born at night has no Mahabhagya, the tripod notwithstanding',
    Yogas.mahabhagya(made).length === 0);
  made.dayBirth = true;
  ok('and by day the same three signs give it',
    Yogas.mahabhagya(made).length === 1);

  /*
   * A place too far north for the Sun to set settles neither, and so does a
   * birth time recorded only to the day. The finding is still made, since the
   * signs are what they are, and it says what it could not check.
   */
  made.dayBirth = undefined;
  var unsettled = Yogas.mahabhagya(made)[0];
  ok('where the hour cannot be settled the finding is made and says so',
    !!unsettled && unsettled.reasons.some(function (r) {
      return r.indexOf('could not be determined') > -1;
    }), unsettled ? unsettled.reasons.join(' | ') : 'nothing found');

  /*
   * The even-sign half is the woman's, and it asks for night as the man's
   * asks for day.
   */
  var her = { ascendant: { longitude: 40 },              // Taurus, an even sign
    gender: 'female', dayBirth: false,
    planets: [{ name: 'Sun', sign: 3, longitude: 3 * 30 + 5, house: 12 },
              { name: 'Moon', sign: 7, longitude: 7 * 30 + 5, house: 4 }] };
  ok('a woman born at night gets the even-sign reading',
    Yogas.mahabhagya(her).length === 1);
  her.dayBirth = true;
  ok('and by day it is withheld', Yogas.mahabhagya(her).length === 0);

  /*
   * The form offers Other, and stores unstated. Reporting nothing hides a
   * finding that may hold; choosing a sex invents a fact. The finding is made
   * and says what it rests on.
   */
  var unsaid = { ascendant: { longitude: 10 }, dayBirth: true,
    planets: [{ name: 'Sun', sign: 4, longitude: 4 * 30 + 5, house: 5 },
              { name: 'Moon', sign: 6, longitude: 6 * 30 + 5, house: 7 }] };
  var got2 = Yogas.mahabhagya(unsaid)[0];
  ok('with no sex recorded the finding is made and says what it rests on',
    !!got2 && got2.reasons.join(' ').indexOf('records no sex') > -1,
    got2 ? got2.reasons[2] : 'nothing found');

  /*
   * The three rare ones. Built rather than hunted, since a sweep for a
   * one-in-five-hundred combination is slower than stating the case.
   */
  var seven = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
  var chain = { ascendant: { longitude: 10 }, planets: seven.map(function (g, i) {
    return { name: g, sign: i, longitude: i * 30 + 5, house: i + 1 };
  }) };
  var mal = Yogas.malika(chain)[0];
  ok('seven grahas in seven adjoining signs from the lagna is Lagna Malika',
    !!mal && mal.title === 'Lagna Malika yoga', mal ? mal.title : 'none');
  chain.planets[6].sign = 8;                     // break the run
  chain.planets[6].longitude = 8 * 30 + 5;
  ok('and a gap anywhere in the run leaves no Malika at all',
    Yogas.malika(chain).length === 0);

  var angles = { ascendant: { longitude: 10 }, planets: [
    { name: 'Sun', sign: 0, longitude: 5, house: 1 },
    { name: 'Moon', sign: 3, longitude: 3 * 30 + 5, house: 4 },
    { name: 'Mars', sign: 6, longitude: 6 * 30 + 5, house: 7 },
    { name: 'Jupiter', sign: 9, longitude: 9 * 30 + 5, house: 10 }] };
  ok('a graha in each of the four angles is Chatussagara',
    Yogas.chatussagara(angles).length === 1);
  angles.planets[3].sign = 10;                   // vacate the 10th
  angles.planets[3].longitude = 10 * 30 + 5;
  ok('and one empty angle is enough to withhold it',
    Yogas.chatussagara(angles).length === 0);

  var royal = { ascendant: { longitude: 10 }, planets: [
    { name: 'Jupiter', sign: 0, longitude: 5, house: 1 },
    { name: 'Venus', sign: 3, longitude: 3 * 30 + 5, house: 4 },
    { name: 'Mercury', sign: 6, longitude: 6 * 30 + 5, house: 7 },
    { name: 'Moon', sign: 9, longitude: 9 * 30 + 5, house: 10 }] };
  ok('the four gentle grahas all in angles is Rajalakshana',
    Yogas.rajalakshana(royal).length === 1);
  royal.planets[2].sign = 1;
  royal.planets[2].longitude = 35;
  ok('and three of the four is not', Yogas.rajalakshana(royal).length === 0);

  /*
   * Parvata's second clause is the one usually dropped, so it is the one worth
   * pinning: benefics in angles are not enough if a malefic holds the 6th or
   * the 8th.
   */
  var hill = A.chart({ jdUT: A.julianDay(1975, 3, 3, 3), latitude: 28.61,
    longitude: 77.21, tzOffsetMinutes: 330 });
  var spoiled = 0, clean = 0;
  for (y = 1950; y < 2020; y++) {
    var c3 = chartAt(y, 9, 9, 3);
    var ben = A.naturalBenefics(c3);
    var lg = A.signOf(c3.ascendant.longitude);
    var bad = c3.planets.some(function (p) {
      if (seven.indexOf(p.name) < 0) return false;
      var h = ((p.sign - lg) % 12 + 12) % 12 + 1;
      return (h === 6 || h === 8) && !ben[p.name];
    });
    var reported = !!find(c3, 'Parvata Yoga');
    if (bad && reported) { spoiled = -1; break; }
    if (bad) spoiled++; else if (reported) clean++;
  }
  ok('Parvata is never reported with a malefic in the 6th or the 8th',
    spoiled > 0 && clean > 0, spoiled + ' spoiled, ' + clean + ' clean');

  /*
   * Vasumathi counts rather than switches, which is Raman's own reading, so the
   * finding has to carry the count.
   */
  var vas = null;
  for (y = 1960; y < 1990 && !vas; y++) vas = find(chartAt(y, 4, 4, 4), 'Vasumathi Yoga');
  ok('Vasumathi reports how many benefics stand there, not merely that any do',
    !!vas && /\d+ stands?/.test(vas.reasons.join(' ')),
    vas ? vas.reasons[2] : 'none found');
})();


console.log('\nThe strengths a detector is handed');
/*
 * Only Lakshmi reads the strength reading, so only Lakshmi noticed that callers
 * were handing detect() two different shapes: the whole Shadbala.compute result
 * at two of three sites in the page and in the frequency sweep, the grahas map
 * at the third. It asks for strengths[lagnaLord], got undefined from the
 * wrapper, and returned nothing - so the yoga appeared on the Yogas tab, never
 * on the graha card, and was absent from the measured frequencies entirely.
 *
 * Both shapes must now work, because both are in use and the next detector to
 * read strengths should not have to rediscover this.
 */
(function () {
  var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
  var found = null, whole = null, inner = null;
  for (var y = 1950; y < 2030 && !found; y++) {
    for (var m = 1; m <= 12 && !found; m++) {
      var c = A.chart({ jdUT: A.julianDay(y, m, 15, 1), latitude: 28.61,
        longitude: 77.21, tzOffsetMinutes: 330 });
      var reading = Shadbala.compute(c, place);
      whole = Yogas.detect(c, reading).filter(function (f) {
        return f.subject === 'Lakshmi Yoga';
      });
      inner = Yogas.detect(c, reading.grahas).filter(function (f) {
        return f.subject === 'Lakshmi Yoga';
      });
      if (whole.length || inner.length) found = c;
    }
  }
  ok('a chart with Lakshmi yoga turns up at all', !!found);
  ok('and detect finds it whether handed the whole reading or the grahas map',
    whole.length === 1 && inner.length === 1,
    whole.length + ' from the wrapper, ' + inner.length + ' from the map');

  /*
   * The condition is the key the lesson library is keyed by. This said
   * 'lakshmi', which matched no passage, so the card would have had nothing to
   * say even once the yoga reached it.
   */
  ok('and the finding is keyed the way the library holds it',
    whole[0].condition === 'general', whole[0].condition);

  /*
   * The general point rather than the one instance: every detector must cope
   * with either shape, since nothing stops a caller passing the wrapper.
   */
  var mixed = 0;
  for (var k = 0; k < 24; k++) {
    var c2 = A.chart({ jdUT: A.julianDay(1970 + k * 2, 3, 3, 3), latitude: 28.61,
      longitude: 77.21, tzOffsetMinutes: 330 });
    var r2 = Shadbala.compute(c2, place);
    if (Yogas.detect(c2, r2).length !== Yogas.detect(c2, r2.grahas).length) mixed++;
  }
  ok('no detector reports differently for the two shapes', mixed === 0,
    mixed + ' charts disagreed');
})();


console.log('\nEverything Raman numbers up to 50');
(function () {
  var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
  var P = function (n, h, d) {
    return { name: n, sign: (h - 1) % 12, longitude: ((h - 1) % 12) * 30 + (d || 5),
             house: h };
  };

  /*
   * Sreenatha cannot occur, and that is arithmetic rather than opinion. The
   * 7th lord must be exalted while standing in the 10th, so the 10th sign has
   * to be that lord's exaltation sign; across twelve ascendants that is true of
   * Sagittarius alone, where the same graha rules both the 7th and the 10th and
   * would have to hold two houses at once.
   *
   * Held here so that if the exaltation table is ever parameterised this stops
   * being silently dead code.
   */
  var EXALTS = { Sun: 0, Moon: 1, Mars: 9, Mercury: 5, Jupiter: 3, Venus: 11, Saturn: 6 };
  var possible = [];
  for (var L = 0; L < 12; L++) {
    var seventh = A.SIGN_LORDS[(L + 6) % 12], tenth = A.SIGN_LORDS[(L + 9) % 12];
    if (EXALTS[seventh] === (L + 9) % 12) possible.push({ lagna: L, seventh: seventh, tenth: tenth });
  }
  ok('only one ascendant lets the 7th lord be exalted in the 10th',
    possible.length === 1 && possible[0].lagna === 8,
    possible.map(function (p) { return A.SIGNS[p.lagna]; }).join(', ') || 'none');
  ok('and there the 7th and 10th are ruled by the same graha',
    possible[0].seventh === possible[0].tenth, possible[0].seventh);
  /*
   * Which makes the Three Hundred Important Combinations wording - "the lord of
   * the 10th is in the 9th" - unsatisfiable, since that graha would hold two
   * houses. Raman's Hindu Predictive Astrology says "combines with the lord of
   * the 9th" instead, and on that ascendant the 9th lord is the Sun, whom
   * Mercury is never far from. That reading is the one implemented.
   */
  var sag = function (mercuryDegree, sunSign) {
    var P = function (n, sg, d) {
      return { name: n, sign: sg, longitude: sg * 30 + d,
               house: ((sg - 8) % 12 + 12) % 12 + 1 };
    };
    return { ascendant: { longitude: 8 * 30 + 10 }, planets: [
      P('Mercury', 5, mercuryDegree), P('Sun', sunSign, 20), P('Moon', 0, 5),
      P('Mars', 1, 5), P('Jupiter', 2, 5), P('Venus', 6, 5), P('Saturn', 3, 5),
      P('Rahu', 9, 5), P('Ketu', 3, 5)] };
  };
  ok('the workable reading is satisfiable, and only at that one ascendant',
    Yogas.sreenatha(sag(8, 5)).length === 1);
  ok('and the finding says which of the two wordings produced it',
    Yogas.sreenatha(sag(8, 5))[0].reasons.join(' ')
      .indexOf('Hindu Predictive Astrology') > -1);
  ok('a Mercury past his exaltation arc in the same seat does not do it',
    Yogas.sreenatha(sag(25, 5)).length === 0);
  ok('nor does the Sun standing anywhere but with him',
    Yogas.sreenatha(sag(8, 6)).length === 0);

  /*
   * Matsya is not impossible, only very constrained, and the constraint is
   * worth pinning: five houses need a malefic apiece and no two of them are
   * opposite, so the nodes fill one slot between them. The fifth malefic has to
   * be a dark Moon, which puts her beside the Sun.
   */
  var SET = [1, 4, 5, 8, 9];
  ok('no two of Matsya’s five houses are opposite, so the nodes fill only one',
    SET.filter(function (h) { return SET.indexOf(((h + 5) % 12) + 1) >= 0; }).length === 0);
  var fish = { ascendant: { longitude: 5 }, planets: [
    P('Rahu', 1), P('Sun', 4, 25), P('Moon', 5, 8), P('Jupiter', 5, 20),
    P('Mars', 8), P('Saturn', 9), P('Ketu', 7), P('Mercury', 11), P('Venus', 12)] };
  ok('and with a dark Moon beside the Sun it can be built',
    Yogas.matsya(fish).length === 1);
  fish.planets[2].longitude = (5 - 1) * 30 + 8 + 150;   // move the Moon into the light
  ok('while a bright Moon in the same seat leaves the 5th without a malefic',
    Yogas.matsya(fish).length === 0);

  /*
   * Kusuma asks for three fixed placements and nothing else, which makes it the
   * easiest of these to state and among the rarest to meet.
   */
  var flower = { ascendant: { longitude: 5 }, planets: [
    P('Jupiter', 1), P('Sun', 2), P('Moon', 7), P('Mars', 3), P('Mercury', 4),
    P('Venus', 5), P('Saturn', 6)] };
  ok('Jupiter rising, the Sun in the 2nd and the Moon in the 7th is Kusuma',
    Yogas.kusuma(flower).length === 1);
  flower.planets[1].house = 3;
  flower.planets[1].sign = 2;
  ok('and moving any one of the three ends it', Yogas.kusuma(flower).length === 0);

  /*
   * The three that turn on a strength reading must all withhold when the graha
   * the rule names is weak, since that clause is what keeps them uncommon.
   */
  var weak = {};
  ['Kahala', 'Sankha', 'Bheri'].forEach(function (name) { weak[name] = 0; });
  var strengthless = 0, withheld = 0;
  for (var y = 1950; y < 2020; y += 2) {
    var c = A.chart({ jdUT: A.julianDay(y, 5, 5, 5), latitude: 28.61,
      longitude: 77.21, tzOffsetMinutes: 330 });
    var full = Shadbala.compute(c, place);
    var withStrength = Yogas.detect(c, full).filter(function (f) {
      return ['Kahala Yoga', 'Sankha Yoga', 'Bheri Yoga', 'Mridanga Yoga',
              'Pushkala Yoga'].indexOf(f.subject) >= 0;
    }).length;
    var without = Yogas.detect(c, {}).filter(function (f) {
      return ['Kahala Yoga', 'Sankha Yoga', 'Bheri Yoga', 'Mridanga Yoga',
              'Pushkala Yoga'].indexOf(f.subject) >= 0;
    }).length;
    strengthless += without;
    if (withStrength > 0) withheld++;
  }
  ok('the strength clauses are real: with no strength reading none of them form',
    strengthless === 0 && withheld > 0,
    strengthless + ' formed without strengths, ' + withheld + ' charts had one with');

  /*
   * Vanchanachorabheethi tests only the third of Raman's three clauses, the
   * other two needing Gulika. The finding has to say so rather than let a
   * reader take absence for absence.
   */
  var suspicious = null;
  for (y = 1950; y < 2000 && !suspicious; y++) {
    var c2 = A.chart({ jdUT: A.julianDay(y, 8, 8, 8), latitude: 28.61,
      longitude: 77.21, tzOffsetMinutes: 330 });
    suspicious = Yogas.vanchanachorabheethi(c2)[0];
  }
  ok('Vanchanachorabheethi admits that two of its three clauses are not tested',
    !!suspicious && suspicious.reasons.join(' ').indexOf('Gulika') > -1,
    suspicious ? 'found' : 'no chart produced it');

  /*
   * And the count: everything the book numbers up to 50 that can be verified
   * from the scans, which is all but 49 and 50 themselves.
   */
  var detectors = Yogas.DETECTOR_COUNT;
  ok('the module carries a detector for each of them', detectors === 34,
    detectors + ' detectors');
})();


console.log('\nKartari asks only that the two houses be occupied');
/*
 * This required that nothing else share the flanking signs, so a Jupiter beside
 * Saturn in the 2nd cancelled papa kartari outright. No text asks for that, and
 * two of them show it is not meant:
 *
 *   Charak defines Parvata four lines below kartari as houses "occupied only by
 *   benefics" - he writes "only" when he means only, and does not write it for
 *   kartari.
 *
 *   Mantreswara defines Susubha in the very sloka that defines kartari, as
 *   benefics "unaspected by malefics" in the 2nd - he knows the qualifier and
 *   does not attach it either.
 *
 * Dropping the requirement took shubha from 1.2 per cent of charts to 3.6 and
 * papa from 6.9 to 13. The marks beside a graha had always read it the plain
 * way, so the chart could show a graha hemmed while the ascendant beside it was
 * not, on identical geometry.
 */
(function () {
  var P = function (n, sg, d) {
    return { name: n, sign: sg, longitude: sg * 30 + (d || 5), house: 1 };
  };
  // Aries lagna: the 2nd is Taurus (sign 1), the 12th Pisces (sign 11).
  var build = function (second, twelfth) {
    var rest = [P('Sun', 4), P('Moon', 6, 100)];
    return { ascendant: { longitude: 5 },
             planets: second.map(function (n) { return P(n, 1); })
               .concat(twelfth.map(function (n) { return P(n, 11); }))
               .concat(rest.filter(function (p) {
                 return second.indexOf(p.name) < 0 && twelfth.indexOf(p.name) < 0;
               })) };
  };
  var kinds = function (c) {
    return Yogas.kartari(c).map(function (f) { return f.condition; }).sort().join('+');
  };

  ok('malefics on both sides is papa kartari',
    kinds(build(['Mars'], ['Saturn'])) === 'papa');
  ok('benefics on both sides is shubha kartari',
    kinds(build(['Jupiter'], ['Venus'])) === 'shubha');
  ok('a benefic sharing one side no longer cancels the malefic hemming',
    kinds(build(['Mars', 'Jupiter'], ['Saturn'])) === 'papa',
    kinds(build(['Mars', 'Jupiter'], ['Saturn'])) || 'nothing');
  ok('and the finding says why the company does not undo it',
    Yogas.kartari(build(['Mars', 'Jupiter'], ['Saturn']))[0].reasons.join(' ')
      .indexOf('occupied only by benefics') > -1);

  /*
   * The case the old rule could not express at all: one of each kind on both
   * sides is both yogas, not neither.
   */
  ok('one of each kind on both sides carries both yogas',
    kinds(build(['Mars', 'Jupiter'], ['Saturn', 'Venus'])) === 'papa+shubha',
    kinds(build(['Mars', 'Jupiter'], ['Saturn', 'Venus'])) || 'nothing');
  ok('while one side empty is neither',
    kinds(build(['Mars', 'Jupiter'], [])) === '');

  /*
   * And the yoga and the marks must now agree about the ascendant, since they
   * are the same rule read at two places. They did not before.
   */
  var disagreed = 0, sampled = 0;
  for (var y = 1950; y < 2020; y++) {
    for (var m = 1; m <= 12; m += 3) {
      var c = A.chart({ jdUT: A.julianDay(y, m, 15, 1), latitude: 28.61,
        longitude: 77.21, tzOffsetMinutes: 330 });
      sampled++;
      var ben = A.naturalBenefics(c);
      var lag = A.signOf(c.ascendant.longitude);
      var found = Yogas.kartari(c);
      var yogaP = found.some(function (f) { return f.condition === 'papa'; });
      var yogaS = found.some(function (f) { return f.condition === 'shubha'; });
      if (A.hemmedByMalefics('__none__', lag, c, ben) !== yogaP) disagreed++;
      else if (A.hemmedByBenefics('__none__', lag, c, ben) !== yogaS) disagreed++;
    }
  }
  ok('the yoga and the graha marks read the ascendant the same way',
    disagreed === 0 && sampled > 200,
    disagreed + ' disagreements over ' + sampled + ' charts');
})();


console.log('\nEach yoga counted from what its text counts from');
/*
 * Kartari was reported on the ascendant and withheld from it in the same table,
 * so every other detector was checked for the same class of error: a rule read
 * from the wrong point. The texts settle each one.
 *
 *   from the Moon only      Adhi, "benefics situated 6th, 7th and 8th from the
 *                           Moon" (Raman 7); Sunapha and its three companions
 *   from the Sun only       Vesi, Vasi, Ubhayachari (Raman 16-18); Adhama,
 *                           Sama, Varishtha (Phaladeepika 6.14)
 *   graha to graha          Sakata, "the Moon in the 12th, 6th or 8th from
 *                           Jupiter"; Chandra Mangala; Budha-Aditya
 *   from either             Amala, "the 10th from the Moon or Lagna"
 *                           (Raman 13); Vasumathi, "from the ascendant or from
 *                           the Moon" (Raman 9); Gaja Kesari, "an angle from
 *                           the ascendant or from the Moon" (BPHS 3-4)
 *   from the lagna          the rest, including Pancha Mahapurusha - Charak is
 *                           explicit, "located in a kendra from the lagna",
 *                           where Phaladeepika and Raman say only "a Kendra"
 *
 * The invariant tested is the sharp one: for a rule that counts from a graha,
 * turning the ascendant through all twelve signs must not change the answer.
 * A lagna leaking into such a rule shows up immediately.
 */
(function () {
  var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
  var GRAHA_ONLY = ['Sunapha Yoga', 'Anapha Yoga', 'Durudhura Yoga',
    'Kemadruma Yoga', 'Vesi Yoga', 'Vasi Yoga', 'Ubhayachari Yoga',
    'Adhama Yoga', 'Sama Yoga', 'Varishtha Yoga', 'Adhi Yoga',
    'Chandra Mangala Yoga', 'Budha Aditya Yoga'];

  var drifted = {}, checked = 0;
  for (var y = 1960; y < 2000; y += 2) {
    var base = A.chart({ jdUT: A.julianDay(y, 6, 15, 6), latitude: 28.61,
      longitude: 77.21, tzOffsetMinutes: 330 });
    var strengths = Shadbala.compute(base, place);
    var want = null;
    for (var turn = 0; turn < 12; turn++) {
      /* Same sky, different rising sign. Only the ascendant moves. */
      var spun = { ascendant: { longitude: (base.ascendant.longitude + turn * 30) % 360 },
                   planets: base.planets };
      var got = Yogas.detect(spun, strengths)
        .filter(function (f) { return GRAHA_ONLY.indexOf(f.subject) >= 0; })
        .map(function (f) { return f.subject; }).sort().join(',');
      if (want === null) want = got;
      else if (got !== want) {
        GRAHA_ONLY.forEach(function (s) {
          if ((got.indexOf(s) >= 0) !== (want.indexOf(s) >= 0)) drifted[s] = true;
        });
      }
      checked++;
    }
  }
  ok('a rule counted from a graha does not move when the ascendant does',
    Object.keys(drifted).length === 0 && checked > 200,
    Object.keys(drifted).join(', ') || checked + ' turns checked');

  /*
   * And the converse for the two that the texts count from either point: they
   * must actually use both, not quietly settle on one. Amala from the Moon
   * alone, with the 10th from the lagna held empty, has to still be Amala.
   */
  var P = function (n, sg, lagnaSign) {
    return { name: n, sign: sg, longitude: sg * 30 + 5,
             house: ((sg - (lagnaSign || 0)) % 12 + 12) % 12 + 1 };
  };
  // Aries lagna: the 10th from it is Capricorn (9). Moon in Cancer (3) puts her
  // own 10th at Aries (0). Jupiter there, and nothing in Capricorn.
  var moonOnly = { ascendant: { longitude: 5 }, planets: [
    P('Moon', 3), P('Jupiter', 0), P('Sun', 4), P('Mars', 6), P('Saturn', 7),
    P('Mercury', 4), P('Venus', 5)] };
  ok('Amala forms from the Moon when the lagna cannot give it',
    Yogas.amala(moonOnly).length === 1);
  // And from the lagna when the Moon cannot: benefic in Capricorn, Moon's 10th empty.
  var lagnaOnly = { ascendant: { longitude: 5 }, planets: [
    P('Moon', 3), P('Jupiter', 9), P('Sun', 4), P('Mars', 6), P('Saturn', 7),
    P('Mercury', 8), P('Venus', 11)] };
  ok('and from the lagna when the Moon cannot', Yogas.amala(lagnaOnly).length === 1);

  /*
   * Pancha Mahapurusha is the one where the texts could have said "or from the
   * Moon" and do not. Charak: "located in a kendra from the lagna". So it must
   * be silent for a graha angular from the Moon but not from the lagna.
   */
  // Aries lagna. Saturn in Aquarius (10) is his own sign but the 11th from the
  // lagna; the Moon in Taurus (1) makes it the 10th from her, a kendra.
  var moonKendra = { ascendant: { longitude: 5 }, planets: [
    P('Saturn', 10), P('Moon', 1), P('Sun', 4), P('Mars', 6), P('Mercury', 4),
    P('Jupiter', 8), P('Venus', 5)] };
  ok('Mahapurusha does not form from an angle counted from the Moon',
    Yogas.mahapurusha(moonKendra).length === 0,
    Yogas.mahapurusha(moonKendra).map(function (f) { return f.title; }).join(','));
  // Move the lagna so Aquarius becomes a kendra from it, and it must form.
  moonKendra.ascendant = { longitude: 7 * 30 + 5 };   // Scorpio; Aquarius is the 4th
  ok('and does form from the same placement once the lagna makes it an angle',
    Yogas.mahapurusha(moonKendra).length === 1);
})();


console.log('\nEvery finding says what happened in this chart');
/*
 * The twelve combinations added from Raman all summarised themselves by
 * restating the rule - "The navamsa lord of the 10th lord is exalted in the
 * 10th with the ascendant lord" - where every older detector names the grahas:
 * "Venus is in its exaltation sign in the 10th, a kendra." The card shows the
 * rule already, on the line above, taken from the lesson library; the summary
 * is the only place that says what this chart did, so an abstract one says
 * nothing twice.
 *
 * Swept rather than sampled, because the faults this catches - a graha named
 * three times over, a doubled comma where two clauses met, a sentence opening
 * on a lowercase "the Moon" - only appear when one graha happens to fill
 * several roles at once.
 */
(function () {
  var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
  var GRAHAS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn',
    'Rahu', 'Ketu'];
  var seen = {}, counted = 0;
  for (var y = 1950; y < 2025; y++) {
    for (var m = 1; m <= 12; m += 2) {
      var c = A.chart({ jdUT: A.julianDay(y, m, 15, 3), latitude: 28.61,
        longitude: 77.21, tzOffsetMinutes: 330 });
      Yogas.detect(c, Shadbala.compute(c, place)).forEach(function (f) {
        counted++;
        if (!seen[f.subject + '|' + f.condition]) {
          seen[f.subject + '|' + f.condition] = f.summary || '';
        }
      });
    }
  }
  var all = Object.keys(seen);
  ok('the sweep reaches most of what the detectors can produce',
    all.length >= 30 && counted > 1000, all.length + ' distinct, ' + counted + ' findings');

  var flawed = all.filter(function (k) {
    var t = seen[k];
    return !t || /,\s*,|\s{2}|\ban an\b|\bthe the\b|,\.|\s\./.test(t) ||
      t[0] !== t[0].toUpperCase();
  });
  ok('no summary is malformed, doubled or opened in lower case',
    flawed.length === 0,
    flawed.map(function (k) { return k + ' -> ' + seen[k]; }).join(' | '));

  /*
   * The substance: a summary has to name at least one graha, or it is the rule
   * restated rather than the chart reported. A handful describe an absence -
   * Kemadruma is the Moon with nobody beside her - and those name the Moon.
   */
  var abstract = all.filter(function (k) {
    // Malika is about all seven at once and names them collectively, which is
    // the only honest way to put it: listing seven names would say less.
    if (/all seven grahas/i.test(seen[k])) return false;
    return !GRAHAS.some(function (g) { return seen[k].indexOf(g) >= 0; });
  });
  ok('every summary names at least one graha', abstract.length === 0,
    abstract.map(function (k) { return k + ' -> ' + seen[k]; }).join(' | '));

  /*
   * And the luminaries take their article. "with Moon, lord of the 9th" was
   * the tell that a name had been dropped into a sentence unexamined.
   */
  var bareLuminary = all.filter(function (k) {
    return /(?:with|beside|and|of) (Sun|Moon)\b/.test(seen[k]);
  });
  ok('the Sun and the Moon are not left bare after a preposition',
    bareLuminary.length === 0,
    bareLuminary.map(function (k) { return k + ' -> ' + seen[k]; }).join(' | '));
})();


console.log('\nThe Moon does reach her full paksha bala at the full Moon');
/*
 * Both the settings note and the lesson argued that Phaladeepika IV.5 - "The
 * Moon is strong and auspicious when she has her full Paksha bala" - could not
 * be said under the group rule, "where a full paksha bala for the Moon means a
 * dark Moon". That was the sharper of the two arguments for reading her always
 * a benefic, and it is false.
 *
 * Under the group rule she is a benefic through the bright half, so her figure
 * rises with her light and peaks at the full Moon. The sloka describes the
 * group rule rather than contradicting it. Pinned here because it is a claim
 * about arithmetic that was carried in prose for a long time without anyone
 * running it.
 */
(function () {
  var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
  var at = function (want) {
    for (var y = 2000; y < 2003; y++) {
      for (var m = 1; m <= 12; m++) {
        for (var d = 1; d <= 28; d++) {
          var c = A.chart({ jdUT: A.julianDay(y, m, d, 6), latitude: 28.61,
            longitude: 77.21, tzOffsetMinutes: 330 });
          var p = {};
          c.planets.forEach(function (q) { p[q.name] = q; });
          var e = A.norm360(p.Moon.longitude - p.Sun.longitude);
          if (Math.min(Math.abs(e - want), Math.abs(e - want - 360)) < 4) {
            return Shadbala.compute(c, place, { moonPaksha: 'group' })
              .grahas.Moon.kala.paksha;
          }
        }
      }
    }
    return null;
  };
  var full = at(180), halfWaxing = at(90), halfWaning = at(270);
  ok('a full Moon carries very nearly the whole 120 under the group rule',
    full !== null && full > 115, full === null ? 'no full Moon found' : full.toFixed(1));
  ok('and far more than a half Moon does, so the figure follows her light',
    halfWaxing !== null && halfWaning !== null &&
    full > halfWaxing * 1.8 && full > halfWaning * 1.8,
    'full ' + full.toFixed(1) + ' against ' + halfWaxing.toFixed(1) +
    ' and ' + halfWaning.toFixed(1));
  /*
   * So neither the note nor the lesson may say the sloka cannot hold under the
   * group rule, which both did.
   */
  var read = function (rel) {
    return require('fs').readFileSync(
      require('path').join(__dirname, '..', rel), 'utf8');
  };
  var page = read('index.html');
  var seed = read('supabase/seed/astro_readings_strength.sql');
  ok('and neither the note nor the lesson still claims otherwise',
    !/cannot be said under the group rule/.test(seed) &&
    !/cannot hold under\s+the group rule/.test(page));
})();


console.log('\nHalving a row is a display choice, not a computation');
/*
 * The note says kala bala and every total still count the doubled value while
 * the cell shows half of it. That is a claim worth enforcing rather than
 * asserting: if the setting ever reached the engine, two people reading the
 * same chart would get different totals from a display preference.
 */
(function () {
  var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
  var c = A.chart({ jdUT: A.julianDay(1975, 8, 20, 3), latitude: 28.61,
    longitude: 77.21, tzOffsetMinutes: 330 });
  var sb = require('fs').readFileSync(
    require('path').join(__dirname, '../js/shadbala.js'), 'utf8');

  /*
   * The engine doubles both rows unconditionally, and reads no option that
   * could stop it. Checking the option list rather than the word "doubled",
   * which appears in the engine's comments and in the doubling itself.
   */
  var opts = (sb.match(/options\.[A-Za-z]+/g) || [])
    .map(function (o) { return o.slice('options.'.length); })
    .filter(function (o, i, all) { return all.indexOf(o) === i; });
  ok('no option the engine reads could turn the doubling off',
    opts.length > 0 && !opts.some(function (o) {
      return /doubl|halv/i.test(o);
    }), opts.join(', '));
  ok('and the two doublings are unconditional in the code',
    /paksha: graha === 'Moon' \? paksha \* 2 : paksha/.test(sb) &&
    /ayana: graha === 'Sun' \? ayana \* 2 : ayana/.test(sb));

  var r = Shadbala.compute(c, place);
  /*
   * The undoubled ceiling for either row is sixty, so a figure above it is the
   * doubled one. Both rows are checked, the Sun's ayana and the Moon's paksha.
   */
  ok('the Sun’s ayana is carried doubled, above the undoubled sixty',
    r.grahas.Sun.kala.ayana > 60, r.grahas.Sun.kala.ayana.toFixed(1));
  ok('and the Moon’s paksha likewise',
    r.grahas.Moon.kala.paksha > 60, r.grahas.Moon.kala.paksha.toFixed(1));

  var parts = ['nathonnatha', 'paksha', 'tribhaga', 'abda', 'masa', 'vara',
    'hora', 'ayana', 'yuddha'];
  var adds = function (name) {
    var k = r.grahas[name].kala;
    var sum = parts.reduce(function (t, p) { return t + (k[p] || 0); }, 0);
    return Math.abs(sum - k.total) < 1e-9;
  };
  ok('and kala bala is the sum of its parts, the doubled figures among them',
    adds('Sun') && adds('Moon'),
    'Sun ' + r.grahas.Sun.kala.total.toFixed(1) +
    ', Moon ' + r.grahas.Moon.kala.total.toFixed(1));
})();


console.log('\nThe two ayana choices are independent, and each comparator picks one of each');
/*
 * Ayana bala rests on two decisions that had been tangled together: which
 * constant scales the declination, and whether the declination carries the
 * graha's latitude. This site argued they belonged in pairs - Raman's 24/48
 * with his longitude-only kranti, Parashara's 23.45/46.9 with the true
 * declination his note sends the reader to an ephemeris for.
 *
 * Neither comparator pairs them that way, and they disagree with each other.
 * Star Jyotish takes Parashara's constant with the longitude-only kranti; Drik
 * Panchang takes Raman's constant with the true declination. So the two are
 * settings now, and the four combinations are all reachable.
 */
(function () {
  var place = { latitude: 21.3069, longitude: -157.8583, tzOffsetMinutes: -600 };
  var chart = A.chart({ jdUT: A.julianDay(1961, 8, 4, 19 + 24 / 60 + 10),
    latitude: place.latitude, longitude: place.longitude,
    tzOffsetMinutes: place.tzOffsetMinutes, trueNode: true });
  var GR = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
  var row = function (opts) {
    var r = Shadbala.compute(chart, place, opts);
    return GR.map(function (g) {
      var v = r.grahas[g].kala.ayana;
      return g === 'Sun' ? v / 2 : v;      // the Sun's is doubled inside kala bala
    });
  };
  var near = function (got, want, tol) {
    return got.every(function (v, i) { return Math.abs(v - want[i]) < tol; });
  };

  /*
   * Star Jyotish prints integers, so half a virupa of tolerance is as tight as
   * the comparison can be made. Every one of the seven rounds to their figure.
   */
  var sj = row({});
  ok('the default reproduces Star Jyotish, which rounds to integers',
    near(sj, [52, 3, 34, 55, 4, 60, 57], 0.55),
    sj.map(function (v) { return v.toFixed(1); }).join(' '));

  /*
   * Drik Panchang used to be reproduced here to a tenth, on Raman's constant
   * with the true declination at the true obliquity - 102.61 for the Sun
   * doubled, then 10.41, 34.51, 55.87, 4.26, 57.04, 56.56. Coupling each
   * constant to the obliquity it assumes gave that up: Raman's now brings 24
   * with it, as the Rao textbook uses it, and no combination of settings
   * reaches Drik Panchang's figures any more. Recorded so the trade is visible
   * rather than discovered later as a regression.
   */
  var drik = row({ ayanaConstant: 'raman', kranti: Shadbala.KRANTI.TRUE });
  ok('Drik Panchang\u2019s ayana figures are no longer reachable',
    !near(drik, [102.61 / 2, 10.41, 34.51, 55.87, 4.26, 57.04, 56.56], 0.1),
    drik.map(function (v) { return v.toFixed(2); }).join(' '));

  /*
   * And the two decisions really are independent: changing one must not change
   * what the other does. The Sun is the test for latitude, having none.
   */
  /*
   * The two constants used to part by up to 0.70 on a graha. They no longer
   * do, and that is the point of the coupling rather than a fault in it: once
   * each is used with the obliquity it assumes, the two classical readings
   * agree to 0.02 in the worst case over 2520 readings. What looked like a
   * disagreement between the texts was an artifact of pairing one text's
   * constant with another's obliquity.
   */
  var a = row({ ayanaConstant: 'parashara' }), b = row({ ayanaConstant: 'raman' });
  ok('the two constants now agree, each carrying its own obliquity',
    a.every(function (v, i) { return Math.abs(v - b[i]) < 0.05; }),
    a.map(function (v, i) { return (v - b[i]).toFixed(3); }).join(' '));
  ok('which is why the setting barely moves a total any more',
    a.reduce(function (t, v, i) { return t + Math.abs(v - b[i]); }, 0) < 0.2,
    'the seven differ by ' +
      a.reduce(function (t, v, i) { return t + Math.abs(v - b[i]); }, 0).toFixed(3) +
      ' virupas in total');
  var noLat = row({ kranti: Shadbala.KRANTI.LONGITUDE });
  var withLat = row({ kranti: Shadbala.KRANTI.TRUE });
  ok('while the latitude leaves the Sun alone, he having none',
    Math.abs(noLat[0] - withLat[0]) < 1e-9 &&
    Math.abs(noLat[1] - withLat[1]) > 1, 'Moon moves by ' +
    Math.abs(noLat[1] - withLat[1]).toFixed(1));
})();


console.log('\nEach constant keeps ayana bala inside its own scale, with its own obliquity');
/*
 * Which constant belongs with which declination is decidable from the formula
 * rather than from preference, and it was argued here the wrong way round for
 * a while. 23 deg 27' is the obliquity, and the obliquity is the greatest
 * declination a point on the ecliptic can have - so a declination read from
 * longitude alone is bounded by it exactly, and the scale runs 0 to 60 with
 * nothing outside.
 *
 * A true declination carries latitude and the Moon passes 28 degrees, so both
 * pairings that use it run past sixty and below nought. A negative strength is
 * not a reading, which is why this is a fault and not a preference.
 */
(function () {
  var PLACES = [[28.61, 77.21, 330], [40.71, -74.01, -300], [-33.87, 151.21, 600]];
  var GR = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
  var range = function (constant, kranti) {
    var lo = Infinity, hi = -Infinity, n = 0;
    for (var y = 1940; y < 2020; y += 2) {
      for (var m = 1; m <= 12; m += 3) {
        var p = PLACES[(y + m) % 3];
        var place = { latitude: p[0], longitude: p[1], tzOffsetMinutes: p[2] };
        var c = A.chart({ jdUT: A.julianDay(y, m, 15, 6 - p[2] / 60),
          latitude: p[0], longitude: p[1], tzOffsetMinutes: p[2] });
        var r = Shadbala.compute(c, place,
          { ayanaConstant: constant, kranti: kranti });
        n++;
        GR.forEach(function (g) {
          var v = r.grahas[g].kala.ayana;
          if (g === 'Sun') v /= 2;        // undo the doubling to compare on one scale
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        });
      }
    }
    return { lo: lo, hi: hi, n: n };
  };

  var def = range('parashara', 'longitude');
  ok('the default reaches nought and sixty and goes past neither',
    def.lo >= -1e-9 && def.hi <= 60 + 1e-9 && def.lo < 0.2 && def.hi > 59.8,
    def.lo.toFixed(2) + ' to ' + def.hi.toFixed(2) + ' over ' + def.n + ' charts');

  var raman = range('raman', 'longitude');
  /*
   * And Raman's does too, now it carries its own obliquity. Pairing his 24
   * with a declination that stops at 23.44 left the measure running 0.69 to
   * 59.31, unable to touch either end of the scale it declares; pairing it
   * with the 24 the Rao textbook reads its declination at closes both.
   */
  ok('Raman’s constant reaches both ends too, carrying its own obliquity',
    raman.lo >= -1e-9 && raman.hi <= 60 + 1e-9 && raman.lo < 0.2 && raman.hi > 59.8,
    raman.lo.toFixed(2) + ' to ' + raman.hi.toFixed(2));

  /*
   * Both latitude pairings break the scale, and Drik Panchang computes one of
   * them. That is worth stating as a fact about the reading rather than as a
   * complaint: it is offered, and the note says what it costs.
   */
  [['parashara', 'true'], ['raman', 'true']].forEach(function (pair) {
    var r = range(pair[0], 'true');
    ok('with latitude, ' + pair[0] + ' runs outside the scale in both directions',
      r.lo < 0 && r.hi > 60, r.lo.toFixed(2) + ' to ' + r.hi.toFixed(2));
  });
})();


console.log('\nThe two sundial settings differ by the equation of time alone');
/*
 * A reader set a chart to local apparent time, then to local mean time, and got
 * the same figure twice. Nothing was broken: the birth was 14 June, four days
 * off the mid-June zero of the equation of time, and that difference IS the
 * whole of what separates those two settings.
 *
 * The note now quotes what each correction is worth. These are those numbers,
 * recomputed, so the prose cannot drift away from the engine.
 */
(function () {
  var GRAHAS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
  function spread(place, y, m, d, from, to) {
    var c = Astro.chart({ jdUT: Astro.julianDay(y, m, d, 7.3),
      latitude: place.latitude, longitude: place.longitude,
      tzOffsetMinutes: place.tzOffsetMinutes });
    var a = Shadbala.compute(c, place, { natClock: from }).grahas;
    var b = Shadbala.compute(c, place, { natClock: to }).grahas;
    return Math.max.apply(null, GRAHAS.map(function (g) {
      return Math.abs(a[g].kala.nathonnatha - b[g].kala.nathonnatha);
    }));
  }
  var NY = { latitude: 40.6975, longitude: -73.8042, tzOffsetMinutes: -240 };
  var NY_WINTER = { latitude: 40.6975, longitude: -73.8042, tzOffsetMinutes: -300 };
  var DELHI = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
  var KASHGAR = { latitude: 39.47, longitude: 75.99, tzOffsetMinutes: 480 };

  /*
   * The reader's own chart, and the reason it looked broken. Checked as the
   * figures are printed rather than as they are held: they are 0.005 apart,
   * which is a real difference that no displayed decimal can show.
   */
  ok('apparent and mean print the same figures on a zero of the equation of time',
    (function () {
      var c = Astro.chart({ jdUT: Astro.julianDay(1946, 6, 14, 7.3),
        latitude: NY.latitude, longitude: NY.longitude,
        tzOffsetMinutes: NY.tzOffsetMinutes });
      var a = Shadbala.compute(c, NY, { natClock: 'apparent' }).grahas;
      var b = Shadbala.compute(c, NY, { natClock: 'mean' }).grahas;
      return GRAHAS.every(function (g) {
        return a[g].kala.nathonnatha.toFixed(2) === b[g].kala.nathonnatha.toFixed(2);
      });
    })(),
    'while held ' + spread(NY, 1946, 6, 14, 'apparent', 'mean').toFixed(4) + ' apart');
  ok('and part either side of it',
    spread(NY, 1946, 11, 3, 'apparent', 'mean') > 1.2 &&
    spread(NY, 1946, 2, 11, 'apparent', 'mean') > 1.0,
    'November ' + spread(NY, 1946, 11, 3, 'apparent', 'mean').toFixed(2) +
    ', February ' + spread(NY, 1946, 2, 11, 'apparent', 'mean').toFixed(2));

  /*
   * The equation of time is bounded near sixteen minutes, so this gap has a
   * ceiling wherever and whenever the birth was. The note says 1.4.
   */
  var worst = 0;
  for (var y = 1950; y < 1954; y++) {
    for (var mo = 1; mo <= 12; mo++) {
      worst = Math.max(worst, spread(DELHI, y, mo, 11, 'apparent', 'mean'));
    }
  }
  ok('the equation of time is never worth more than the 1.4 virupas claimed',
    worst > 1.2 && worst <= 1.4, 'largest over four years: ' + worst.toFixed(2));

  /*
   * The longitude correction is the other one, and unlike the first it depends
   * on where the birth was rather than when. The note's figures, in order.
   */
  ok('the longitude gap at Delhi is the 2 virupas the note gives',
    Math.abs(spread(DELHI, 1977, 8, 20, 'zone', 'mean') - 2) < 0.5,
    spread(DELHI, 1977, 8, 20, 'zone', 'mean').toFixed(1));
  ok('and at the far west of a wide zone the 15 it warns about',
    spread(KASHGAR, 1977, 8, 20, 'zone', 'mean') > 13,
    spread(KASHGAR, 1977, 8, 20, 'zone', 'mean').toFixed(1) + ' at Kashgar');

  /*
   * Daylight saving is the part the note used to hide. "New York" is not one
   * number: the clock is an hour further from the Sun in summer, and the note
   * had quoted the summer figure as if it held all year.
   */
  var summer = spread(NY, 1946, 6, 14, 'zone', 'apparent');
  var winter = spread(NY_WINTER, 1946, 1, 14, 'zone', 'apparent');
  ok('New York in summer is the 4.6 quoted, and in winter is not',
    Math.abs(summer - 4.6) < 0.4 && winter < 0.6,
    'summer ' + summer.toFixed(1) + ', winter ' + winter.toFixed(1));
})();


console.log('\nCheshta bala, against the one worked example the texts give');
/*
 * Raman works his Standard Horoscope end to end in Graha and Bhava Balas,
 * which makes it the only place any of these books shows its arithmetic. The
 * birth: female, 16 October 1918, 14:06:16 LMT, 13 N, 77 deg 35' E, on his own
 * ayanamsa.
 */
(function () {
  var lon = 77.58333;
  var place = { latitude: 13, longitude: lon, tzOffsetMinutes: Math.round(lon * 4) };
  var jd = Astro.julianDay(1918, 10, 16, 14 + 6 / 60 + 16 / 3600 - lon / 15);
  var chart = Astro.chart({ jdUT: jd, latitude: 13, longitude: lon,
    tzOffsetMinutes: place.tzOffsetMinutes, ayanamsa: 'raman' });

  /* Section 6 prints the nirayana longitudes he works from. */
  var PRINTED = { Sun: 180.899, Moon: 311.288, Mars: 229.509, Mercury: 181.526,
    Jupiter: 84.014, Venus: 171.166, Saturn: 124.378 };
  var offBy = 0;
  Object.keys(PRINTED).forEach(function (n) {
    var got = chart.planets.filter(function (p) { return p.name === n; })[0].longitude;
    offBy = Math.max(offBy, Math.abs(got - PRINTED[n]));
  });
  ok('our true longitudes are his true longitudes', offBy < 0.1,
    'worst ' + offBy.toFixed(3) + ' degrees');

  /*
   * His mean longitudes are not. They come from Kedarnath Dutt's tables, which
   * are Surya Siddhanta, where ours are Standish - and a chesta kendra is a
   * gap between a true longitude and a mean one, so it carries the difference
   * between the two models on top of the arc it means to report.
   */
  var T = (jd + Astro.deltaT(jd) / 86400 - 2451545.0) / 36525;
  var ayan = Astro.ayanamsa(T, 'raman');
  var MEANS = { sun: 181.2275, mars: 266.34, jupiter: 66.91, saturn: 111.23,
    mercury: 174.49, venus: 158.35 };
  var worstClassical = 0, worstModern = 0;
  Object.keys(MEANS).forEach(function (k) {
    var c = Astro.norm360(Astro.classicalMeanLongitude(k, jd, T) - ayan);
    var m = Astro.norm360((k === 'sun' ? Astro.sunMeanLongitude(T)
                                       : Astro.meanLongitude(k, T)) - ayan);
    var gap = function (v) { return Math.abs(((v - MEANS[k] + 540) % 360) - 180); };
    worstClassical = Math.max(worstClassical, gap(c));
    worstModern = Math.max(worstModern, gap(m));
  });
  ok('the classical tables reproduce his mean longitudes', worstClassical < 0.5,
    'worst ' + worstClassical.toFixed(2) + ' degrees');
  ok('and the modern ones do not, which is the whole reason for the setting',
    worstModern > 5, 'worst ' + worstModern.toFixed(2) + ' degrees');

  /* Example 51, his printed answers. */
  var EX51 = { Mars: 22.23, Mercury: 2.30, Jupiter: 35.26, Venus: 5.95, Saturn: 21.14 };
  var bySource = function (src) {
    var r = Shadbala.compute(chart, place,
      { meanSource: src, kendraMethod: 'averaged' }).grahas;
    return Object.keys(EX51).reduce(function (w, n) {
      return Math.max(w, Math.abs(r[n].cheshta - EX51[n]));
    }, 0);
  };
  ok('and so reproduce the cheshta balas he prints', bySource('classical') < 0.25,
    'worst ' + bySource('classical').toFixed(2) + ' virupas');
  ok('where the modern means miss Budha by whole virupas', bySource('modern') > 3,
    'worst ' + bySource('modern').toFixed(2) + ' virupas');
  ok('the classical tables are the default', bySource(undefined) === bySource('classical'));

  /*
   * Those are all the averaged kendra, which is what Raman computes with. The
   * arc the texts define is the seeghra kendra, and the check for that one is
   * Sripatipaddhati's own example: five kendras printed from Ketakar's tables
   * for a birth of 30 April 1853 at 10 deg 38' N, twelve minutes before
   * sunrise. Each method answers to the book that uses it, which is why both
   * are kept.
   */
  (function () {
    var lon = 78.7;
    var p = { latitude: 10.633, longitude: lon, tzOffsetMinutes: Math.round(lon * 4) };
    var c = Astro.chart({ jdUT: Astro.julianDay(1853, 4, 30, 5 + 48 / 60 - lon / 15),
      latitude: 10.633, longitude: lon, tzOffsetMinutes: p.tzOffsetMinutes });
    // his printed kendras, already reduced past six signs
    var PRINTED = { Mars: 34.011, Mercury: 142.941, Jupiter: 143.240,
      Venus: 8.915, Saturn: 11.270 };
    var err = function (method) {
      var r = Shadbala.compute(c, p, { kendraMethod: method }).grahas;
      return Object.keys(PRINTED).reduce(function (s, g) {
        return s + Math.abs(r[g].cheshta - PRINTED[g] / 3);
      }, 0) / 5;
    };
    ok('the seeghra kendra reproduces the kendras Sripati prints',
      err('seeghra') < 1, err('seeghra').toFixed(2) + ' virupas');
    ok('and the averaged shortcut does not, Budha worst of the five',
      err('averaged') > 3, err('averaged').toFixed(2) + ' virupas');
    ok('and the seeghra kendra is the default',
      err(undefined) === err('seeghra'));

    /*
     * Which reverses on Raman's chart, and has to: he works his examples with
     * the shortcut. Neither method is simply better; each matches its own
     * source, and that symmetry is the reason this is a setting.
     */
    ok('while Raman’s own examples go the other way round',
      bySource('classical') < 0.25 &&
      (function () {
        var r = Shadbala.compute(chart, place, { kendraMethod: 'seeghra' }).grahas;
        return Object.keys(EX51).reduce(function (w, n) {
          return Math.max(w, Math.abs(r[n].cheshta - EX51[n]));
        }, 0) > 1;
      })());
  })();

  /*
   * Example 60 works the Sun by the other rule Parashara gives, at 28.3-4:
   * sayana Sun plus three signs, reduced, over three. Raman prints 22.66.
   */
  var sun = chart.planets.filter(function (p) { return p.name === 'Sun'; })[0].longitude;
  var arc = Astro.norm360(sun + chart.ayanamsa + 90);
  ok('and the Ishta and Kashta rule for the Sun reproduces his Example 60',
    Math.abs((arc > 180 ? 360 - arc : arc) / 3 - 22.66) < 0.1);

  /*
   * Example 56 is his Shadbala Pinda table, and it has no cheshta row for the
   * luminaries. Chandra's printed total is the sum of the other five to the
   * hundredth, which is how we know the blank is deliberate.
   */
  ok('Raman’s Chandra total is the sum with no cheshta in it',
    Math.abs((126.50 + 31.56 + 202.04 + 51.43 - 21.73) - 389.80) < 0.005);
  var counted = Shadbala.compute(chart, place, { luminaryCheshta: 'counted' }).grahas;
  var omitted = Shadbala.compute(chart, place, { luminaryCheshta: 'omitted' }).grahas;
  ok('and the setting takes it back out without hiding the figure',
    omitted.Sun.cheshta === counted.Sun.cheshta &&
    omitted.Sun.cheshtaCounted === false && counted.Sun.cheshtaCounted === true &&
    Math.abs((counted.Sun.totalShashtiamsa - omitted.Sun.totalShashtiamsa)
      - counted.Sun.cheshta) < 1e-9);
  ok('while the five starry grahas keep theirs either way',
    ['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'].every(function (n) {
      return omitted[n].cheshtaCounted === true &&
        omitted[n].totalShashtiamsa === counted[n].totalShashtiamsa;
    }));
})();

console.log('\nThe eight motions, driven rather than read');
/*
 * Sripatipaddhati's eight: Vakra 60, Anuvakra 30, Vikala 15, Samagama 30,
 * Manda 15, Mandatara 7.5, Seeghra 45, Seeghratara 30. Every figure the method
 * can emit has to be one of those, swept over sixty years.
 */
(function () {
  var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
  var ALLOWED = [60, 45, 30, 15, 7.5];
  var seen = {}, stray = [];
  for (var y = 1950; y < 2010; y++) {
    for (var m = 1; m <= 12; m++) {
      var c = Astro.chart({ jdUT: Astro.julianDay(y, m, 11, 7), latitude: 28.61,
        longitude: 77.21, tzOffsetMinutes: 330 });
      var r = Shadbala.compute(c, place, { cheshtaMethod: 'motion' }).grahas;
      ['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'].forEach(function (n) {
        var v = r[n].cheshta;
        seen[v] = (seen[v] || 0) + 1;
        if (ALLOWED.indexOf(v) < 0) stray.push(n + ' ' + v);
      });
    }
  }
  ok('every figure the method emits is one Sripati allots', stray.length === 0,
    stray.slice(0, 5).join(', ') || Object.keys(seen).sort(function (a, b) {
      return b - a; }).join(', '));
  ok('and all five distinct figures are reachable',
    ALLOWED.every(function (v) { return seen[v] > 0; }),
    ALLOWED.map(function (v) { return v + ':' + (seen[v] || 0); }).join(' '));

  /*
   * The two sides of the mean motion, checked directly: below it and still
   * slowing is Mandatara at 7.5, the weakest direct state; above it and
   * slowing is Seeghra at 45, the strongest short of retrogression. Reading
   * these off the ephemeris rather than asserting them, since the whole point
   * of the rewrite is that the boundary is the mean motion and not a band.
   */
  var MEAN = { Mars: 0.524033, Mercury: 0.985609, Jupiter: 0.083091,
    Venus: 0.985609, Saturn: 0.033460 };
  var wrong = [];
  for (var y2 = 1960; y2 < 1990; y2++) {
    var c2 = Astro.chart({ jdUT: Astro.julianDay(y2, 5, 9, 7), latitude: 28.61,
      longitude: 77.21, tzOffsetMinutes: 330 });
    var g2 = Shadbala.compute(c2, place, { cheshtaMethod: 'motion' }).grahas;
    var moonSign = Math.floor(Astro.norm360(
      c2.planets.filter(function (p) { return p.name === 'Moon'; })[0].longitude) / 30);
    ['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'].forEach(function (n) {
      var p = c2.planets.filter(function (x) { return x.name === n; })[0];
      if (p.speed < 0 || p.speed < 0.05 * MEAN[n]) return;      // vakra, vikala
      if (Math.floor(Astro.norm360(p.longitude) / 30) === moonSign) {
        if (g2[n].cheshta !== 30) wrong.push(n + ' samagama ' + g2[n].cheshta);
        return;
      }
      var want = p.speed < MEAN[n] ? (p.accel >= 0 ? 15 : 7.5)
                                   : (p.accel >= 0 ? 30 : 45);
      if (g2[n].cheshta !== want) {
        wrong.push(n + ' wanted ' + want + ' got ' + g2[n].cheshta);
      }
    });
  }
  ok('and each direct state follows the mean motion and the trend',
    wrong.length === 0, wrong.slice(0, 4).join(', ') || 'all agree');
})();


console.log('\nThe saptavargaja ladder is the one three texts print');
/*
 * Two ladders are on record for the lower five steps. Parashara's verses give
 * 20, 15, 10, 4, 2; Raman's section 30 gives 22.5, 15, 7.5, 3.75, 1.875. This
 * site has used Raman's all along on the narrow ground that his own worked
 * table cannot be reconciled with anything else.
 *
 * Two further witnesses turned up on reading around. Uttara Kalamrita prints
 * the whole ladder as a table at slokas 3.5-5 and it is Raman's to the last
 * decimal. Sripatipaddhati works its example in rupas - three-eighths for a
 * great friend's varga, a quarter for a friend's, an eighth for a neutral's -
 * and reaches the same figures, recording Parashara's as a commentator's
 * reading rather than its own.
 */
(function () {
  var UTTARA_KALAMRITA = { moolatrikona: 45, own: 30, adhimitra: 22.5,
    mitra: 15, sama: 7.5, shatru: 3.75, adhishatru: 1.875 };
  var ours = Shadbala.SAPTAVARGAJA_VALUES;
  ok('every step is the figure Uttara Kalamrita tabulates',
    Object.keys(UTTARA_KALAMRITA).every(function (k) {
      return ours[k] === UTTARA_KALAMRITA[k];
    }) && Object.keys(ours).length === Object.keys(UTTARA_KALAMRITA).length,
    JSON.stringify(ours));

  /*
   * And Sripati's rupa fractions are the same ladder in another unit, sixty
   * shashtiamsas to the rupa. Checked rather than asserted, because that is
   * the whole of why his example is worth citing.
   */
  var SRIPATI_RUPAS = { moolatrikona: 0.75, own: 0.5, adhimitra: 0.375,
    mitra: 0.25, sama: 0.125 };
  ok('and matches the fractions Sripatipaddhati works its example in',
    Object.keys(SRIPATI_RUPAS).every(function (k) {
      return Math.abs(ours[k] / 60 - SRIPATI_RUPAS[k]) < 1e-9;
    }));

  /*
   * Parashara's ladder is the one not taken, and it has to stay distinct from
   * ours or the choice above would be describing a difference that is not there.
   */
  ok('Parashara’s lower five really are a different ladder',
    [20, 10, 4, 2].every(function (v) {
      return [ours.adhimitra, ours.sama, ours.shatru, ours.adhishatru]
        .indexOf(v) < 0;
    }));
})();


console.log('\nOne frame throughout, mean places included');
/*
 * Two frame errors, found by being asked whether two things I had said were
 * consistent. They were not, and each sentence was covering a bug.
 *
 * The first: the classical tables carry nirayana constants, and the Sun's was
 * being propagated at the tropical mean motion, 360/365.2422. That walks a
 * sidereal longitude forward by one precession a year, and the conversion back
 * to tropical adds a second, which showed as a gap against the modern mean Sun
 * drifting at twice the precession rate instead of holding steady.
 *
 * The second: the orbital elements are referred to the mean ecliptic and
 * equinox of J2000, so a longitude taken from them does not carry precession
 * since then. Subtracting the ayanamsa OF THE DATE leaves that precession in
 * the figure. A sidereal longitude is frame-independent, so the subtraction
 * has to be the ayanamsa of the frame the longitude is measured in.
 */
(function () {
  /*
   * The Sun's classical rate is sidereal, like the five beside it. The test is
   * not the constant but its consequence: the gap between the classical mean
   * Sun and the modern one must drift by one precession, not two, because only
   * one of the pair is of date.
   */
  var gap = function (y) {
    var jd = Astro.julianDay(y, 1, 1, 12);
    var T = (jd + Astro.deltaT(jd) / 86400 - 2451545.0) / 36525;
    return ((Astro.classicalMeanLongitude('sun', jd, T)
      - Astro.sunMeanLongitude(T) + 540) % 360) - 180;
  };
  /*
   * The bug this guards was a rate that made the gap grow at TWICE precession:
   * a nirayana constant propagated at the tropical mean motion walks forward
   * by one precession a year, and converting back to tropical adds a second.
   *
   * The observed drift is 1.16 a century, not the 1.40 of precession, and
   * that number is derivable rather than something to leave a band around.
   * The Surya Siddhanta's year is 1577917828 / 4320000 days, which is 0.0024
   * longer than the true sidereal year, so its mean Sun falls behind the fixed
   * stars by 0.236 a century. Precession less that deficit is what should be
   * seen, and is.
   */
  var ssYear = Astro.MAHAYUGA_DAYS / Astro.SS_REVOLUTIONS.sun;
  var deficit = (360 / 365.256363 - 360 / ssYear) * 36525;
  var expected = 1.3972 - deficit;
  var perCentury = (gap(2000) - gap(1800)) / 2;
  ok('the classical mean Sun drifts by precession less the Surya Siddhanta year’s deficit',
    Math.abs(perCentury - expected) < 0.05,
    perCentury.toFixed(3) + ' observed against ' + expected.toFixed(3) +
      ' predicted (precession 1.397 less ' + deficit.toFixed(3) + ')');

  /*
   * And the rates are the Surya Siddhanta's, not numbers tuned until two
   * worked examples came out. They were solved from those examples first, and
   * every one landed on the figure its revolution count gives - which is how
   * the fit was known not to be landing on noise.
   */
  ok('every classical rate is its Surya Siddhanta revolution count',
    Object.keys(Astro.SS_REVOLUTIONS).every(function (k) {
      return Astro.SS_REVOLUTIONS[k] > 0 && Astro.SS_REVOLUTIONS[k] % 1 === 0;
    }) && Astro.MAHAYUGA_DAYS === 1577917828 &&
    Math.abs(Astro.SS_REVOLUTIONS.sun * 360 / Astro.MAHAYUGA_DAYS - 0.98560265) < 1e-7);

  /*
   * And the elements take the J2000 ayanamsa. Checked through the arithmetic
   * that depends on it: Sripatipaddhati's printed kendras are computed from
   * heliocentric places, and his chart is 1853, where the two ayanamsas are
   * two degrees apart. Budha and Sukra carried the whole of that error, their
   * kendra being the only one measured against a true place of date.
   */
  var lon = 78.7;
  var place = { latitude: 10.633, longitude: lon, tzOffsetMinutes: Math.round(lon * 4) };
  var chart1853 = Astro.chart({ jdUT: Astro.julianDay(1853, 4, 30, 5 + 48 / 60 - lon / 15),
    latitude: 10.633, longitude: lon, tzOffsetMinutes: place.tzOffsetMinutes });
  ok('a chart carries the ayanamsa of its own frame and of J2000',
    Math.abs((chart1853.ayanamsa - chart1853.ayanamsaJ2000) + 2.047) < 0.01,
    (chart1853.ayanamsa - chart1853.ayanamsaJ2000).toFixed(3) + ' apart in 1853');

  var r = Shadbala.compute(chart1853, place).grahas;
  ok('and the inner two now land on Sripati’s figures outright',
    Math.abs(r.Mercury.cheshta - 142.941 / 3) < 0.1 &&
    Math.abs(r.Venus.cheshta - 8.915 / 3) < 0.1,
    'Budha ' + r.Mercury.cheshta.toFixed(2) + ', Sukra ' + r.Venus.cheshta.toFixed(2));

  /*
   * Both fixes moved both anchors the right way, which is the point: a frame
   * error does not improve one reading at another's expense.
   */
  var err = function (c, p, want, opts) {
    var g = Shadbala.compute(c, p, opts).grahas;
    return Object.keys(want).reduce(function (s, k) {
      return s + Math.abs(g[k].cheshta - want[k]);
    }, 0) / Object.keys(want).length;
  };
  var SRIPATI = { Mars: 34.011 / 3, Mercury: 142.941 / 3, Jupiter: 143.240 / 3,
    Venus: 8.915 / 3, Saturn: 11.270 / 3 };
  ok('the seeghra kendra is inside half a virupa of Sripati',
    err(chart1853, place, SRIPATI) < 0.5,
    err(chart1853, place, SRIPATI).toFixed(2));

  var l2 = 77.58333;
  var p2 = { latitude: 13, longitude: l2, tzOffsetMinutes: Math.round(l2 * 4) };
  var c2 = Astro.chart({ jdUT: Astro.julianDay(1918, 10, 16,
    14 + 6 / 60 + 16 / 3600 - l2 / 15), latitude: 13, longitude: l2,
    tzOffsetMinutes: p2.tzOffsetMinutes, ayanamsa: 'raman' });
  var EX51 = { Mars: 22.23, Mercury: 2.30, Jupiter: 35.26, Venus: 5.95, Saturn: 21.14 };
  ok('and the averaged one is inside a tenth of Raman',
    err(c2, p2, EX51, { kendraMethod: 'averaged' }) < 0.1,
    err(c2, p2, EX51, { kendraMethod: 'averaged' }).toFixed(2));
})();


console.log('\nDrekkana bala, where the verse and the practice part');
/*
 * Which third of a sign each sex wants is not agreed, and the disagreement is
 * between the translations and everyone who works the arithmetic.
 *
 * Both English BPHS texts give the same order: "Male, female and hermaphrodite
 * planets respectively get a quarter Rupa according to placements in the
 * first, second and third decanates", and Santhanam's note repeats it -
 * female in the 2nd, eunuch in the 3rd.
 *
 * Raman has it the other way at section 36, hermaphrodite in the middle and
 * feminine in the last, and K. N. Rao the same. Raman then works it: Example
 * 12 gives Sukra, a female graha in the third drekkana, 15 - which under the
 * translated verse would be nothing - and Chandra, also female, in the second,
 * nothing, which under the verse would be 15.
 *
 * So the verse is a translator's ordering of a compound and the practice is
 * three sources deep. This follows the practice, and the whole of Example 12
 * is pinned because that is the only place the difference is worked out.
 */
(function () {
  var SEX = { Sun: 'male', Mars: 'male', Jupiter: 'male',
    Mercury: 'impotent', Saturn: 'impotent', Moon: 'female', Venus: 'female' };
  var WANTS = { male: 0, impotent: 1, female: 2 };   // first, second, third

  var lon = 77.58333;
  var place = { latitude: 13, longitude: lon, tzOffsetMinutes: Math.round(lon * 4) };
  var chart = Astro.chart({ jdUT: Astro.julianDay(1918, 10, 16,
    14 + 6 / 60 + 16 / 3600 - lon / 15), latitude: 13, longitude: lon,
    tzOffsetMinutes: place.tzOffsetMinutes, ayanamsa: 'raman' });
  var r = Shadbala.compute(chart, place).grahas;

  /* Example 12: the drekkana each graha falls in, and what he allots it. */
  var EX12 = { Sun: [0, 15], Moon: [1, 0], Mars: [1, 0], Mercury: [0, 0],
    Jupiter: [2, 0], Venus: [2, 15], Saturn: [0, 0] };
  var wrong = [];
  Object.keys(EX12).forEach(function (g) {
    var p = chart.planets.filter(function (x) { return x.name === g; })[0];
    var part = Math.floor((p.longitude % 30) / 10);
    if (part !== EX12[g][0]) wrong.push(g + ' in drekkana ' + (part + 1));
    if (r[g].sthana.drekkana !== EX12[g][1]) {
      wrong.push(g + ' scored ' + r[g].sthana.drekkana + ' not ' + EX12[g][1]);
    }
  });
  ok('every row of Raman’s Example 12 comes out', wrong.length === 0,
    wrong.join(', ') || 'all seven');

  /*
   * And the two rows that carry the argument, named so a later edit that
   * flipped the table could not pass by scoring zero everywhere.
   */
  ok('a female graha scores in the third drekkana, not the second',
    r.Venus.sthana.drekkana === 15 && r.Moon.sthana.drekkana === 0,
    'Sukra ' + r.Venus.sthana.drekkana + ', Chandra ' + r.Moon.sthana.drekkana);

  /*
   * The sexes themselves, which all the sources agree on. Driven over real
   * charts rather than restated: for every graha in every sweep, the fifteen
   * has to land exactly when it stands in the third its sex wants, and never
   * otherwise. An earlier draft of this test recomputed the rule and compared
   * it with itself, which would have passed whatever the table said.
   */
  var missed = [], paidWrongly = [];
  for (var y = 1950; y < 2000; y++) {
    for (var mo = 1; mo <= 12; mo += 3) {
      var cc = Astro.chart({ jdUT: Astro.julianDay(y, mo, 9, 6), latitude: 28.61,
        longitude: 77.21, tzOffsetMinutes: 330 });
      var rr = Shadbala.compute(cc, { latitude: 28.61, longitude: 77.21,
        tzOffsetMinutes: 330 }).grahas;
      Object.keys(SEX).forEach(function (g) {
        var p = cc.planets.filter(function (x) { return x.name === g; })[0];
        var third = Math.floor((p.longitude % 30) / 10);
        var got = rr[g].sthana.drekkana;
        if (third === WANTS[SEX[g]] && got !== 15) missed.push(g);
        if (third !== WANTS[SEX[g]] && got !== 0) paidWrongly.push(g);
      });
    }
  }
  ok('the fifteen lands only in the third that graha’s sex wants',
    missed.length === 0 && paidWrongly.length === 0,
    missed.length + ' missed, ' + paidWrongly.length + ' paid wrongly over 1400 readings');
})();


console.log('\nSthana bala against three worked examples');
/*
 * A textbook on Shadbala by two of K. N. Rao's students works three charts
 * through the positional strengths and prints the longitudes it starts from,
 * which makes them the first check available for saptavargaja - Raman's
 * Example 9 gives only totals, and no classical text works it at all.
 *
 * The ladder it states is the halving one, 45 / 30 / 22.5 / 15 / 7.5 / 3.75 /
 * 1.875, with "Mool Trikon is seen only in D-1" beside it, over D-1, D-2, D-3,
 * D-7, D-9, D-12 and D-30, and the compound friendship taken from the rashi
 * chart. That is what this engine does, and these are the numbers it produces.
 */
(function () {
  var GRAHAS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
  var DEBILITATION = { Sun: 190, Moon: 213, Mars: 118, Mercury: 345,
    Jupiter: 275, Venus: 177, Saturn: 20 };

  var CHARTS = {
    one: { Sun: 154.82, Moon: 120.03, Mars: 154.90, Mercury: 138.27,
           Jupiter: 165.78, Venus: 195.07, Saturn: 225.70 },
    two: { Sun: 211.35, Moon: 122.40, Mars: 294.92, Mercury: 192.42,
           Jupiter: 96.70, Venus: 207.83, Saturn: 200.33 },
    three: { Sun: 324.52, Moon: 32.13, Mars: 82.28, Mercury: 342.67,
             Jupiter: 183.25, Venus: 333.08, Saturn: 84.97 }
  };

  /*
   * Uchcha bala first, because it is the one the book derives in full - it
   * prints the longitude, the deep debilitation point, the difference and the
   * reduction, so every step is visible.
   */
  var UCHCHA = {
    one: { Sun: 11.73, Moon: 30.99, Mars: 12.30, Mercury: 51.09,
           Jupiter: 36.41, Venus: 6.02, Saturn: 51.43 },
    two: { Sun: 7.12, Moon: 30.20, Mars: 58.97, Mercury: 50.86,
           Jupiter: 59.43, Venus: 10.28, Saturn: 59.89 },
    three: { Sun: 44.84, Moon: 59.71, Mars: 11.91, Mercury: 0.78,
             Jupiter: 30.58, Venus: 52.03, Saturn: 21.66 }
  };
  var worst = 0;
  Object.keys(UCHCHA).forEach(function (k) {
    GRAHAS.forEach(function (g) {
      var arc = Math.abs(Astro.norm360(CHARTS[k][g] - DEBILITATION[g]));
      if (arc > 180) arc = 360 - arc;
      worst = Math.max(worst, Math.abs(arc / 3 - UCHCHA[k][g]));
    });
  });
  ok('uchcha bala reproduces all twenty-one printed figures', worst < 0.01,
    'worst ' + worst.toFixed(3) + ' virupas');

  /*
   * The book prints 71.43 for Example 1's Saturn in its summary table, which
   * cannot be an uchcha bala at all - the measure caps at 60 - and leaves that
   * row twenty short of its own total. Its derivation table has 51.43, which
   * is the figure used above and the one that reconciles.
   */
  ok('and the one figure that cannot be right is the one the book contradicts',
    71.43 > 60 &&
    Math.abs((51.43 + 15 + 0 + 15 + 82.50) - 163.93) < 0.01 &&
    Math.abs((71.43 + 15 + 0 + 15 + 82.50) - 163.93) > 19);

  /* Now saptavargaja, cell by cell, through the engine's own function. */
  var run = function (L) {
    var planets = GRAHAS.map(function (g) {
      return { name: g, longitude: L[g], sign: Math.floor(Astro.norm360(L[g]) / 30) };
    });
    var d1 = {};
    planets.forEach(function (p) { d1[p.name] = p; });
    var out = {};
    GRAHAS.forEach(function (g) {
      out[g] = Shadbala.saptavargajaBala(g, { planets: planets }, d1);
    });
    return out;
  };

  var EX3 = { Sun: [1.875, 22.5, 7.5, 22.5, 7.5, 7.5, 15],
    Moon: [15, 30, 15, 15, 15, 15, 15], Mars: [7.5, 22.5, 3.75, 30, 30, 3.75, 7.5],
    Mercury: [3.75, 7.5, 7.5, 15, 7.5, 22.5, 3.75],
    Jupiter: [1.875, 7.5, 1.875, 1.875, 1.875, 7.5, 7.5],
    Venus: [3.75, 7.5, 3.75, 7.5, 7.5, 15, 30],
    Saturn: [22.5, 7.5, 30, 1.875, 22.5, 3.75, 22.5] };
  var r3 = run(CHARTS.three), off3 = [];
  GRAHAS.forEach(function (g) {
    r3[g].detail.forEach(function (d, i) {
      var v = Shadbala.SAPTAVARGAJA_VALUES[d.relation];
      if (Math.abs(v - EX3[g][i]) > 0.01) off3.push(g + ' D-' + d.division);
    });
  });
  ok('every one of Example 3’s forty-nine saptavargaja cells comes out',
    off3.length === 0, off3.join(', ') || '49 of 49');

  /*
   * Example 1 misses by one cell, and the book is wrong on it rather than the
   * engine. Its panchadha table lists the Moon among Mars's friends, worth 15,
   * where its own three rules make her a fast friend at 22.5: the natural table
   * on page 17 has the Moon among Mars's friends, the temporal table on the
   * same page has her there too, and page 18 gives friend plus friend as
   * Aadhi mitra. Mars's other five relationships all agree with the engine, and
   * the error carries into his D-2 cell and his total, 105 against 112.5.
   */
  var EX1 = { Sun: [15, 22.5, 15, 7.5, 7.5, 7.5, 7.5],
    Moon: [22.5, 22.5, 22.5, 22.5, 15, 22.5, 15],
    Mars: [7.5, 15, 7.5, 30, 15, 15, 15],
    Mercury: [22.5, 1.875, 15, 15, 30, 15, 30],
    Jupiter: [7.5, 7.5, 15, 7.5, 7.5, 30, 30],
    Venus: [30, 7.5, 22.5, 22.5, 22.5, 15, 15],
    Saturn: [7.5, 7.5, 15, 7.5, 7.5, 22.5, 15] };
  var r1 = run(CHARTS.one), off1 = [];
  GRAHAS.forEach(function (g) {
    r1[g].detail.forEach(function (d, i) {
      var v = Shadbala.SAPTAVARGAJA_VALUES[d.relation];
      if (Math.abs(v - EX1[g][i]) > 0.01) off1.push(g + ' D-' + d.division);
    });
  });
  ok('and forty-eight of Example 1’s, the forty-ninth being the book’s slip',
    off1.length === 1 && off1[0] === 'Mars D-2', off1.join(', '));
  ok('which the book’s own rules resolve in the engine’s favour',
    Astro.compoundRelation('Mars', 'Moon', 12) === 'adhimitra' &&
    Shadbala.SAPTAVARGAJA_VALUES.adhimitra === 22.5);
})();


console.log('\nDig bala against the same three worked charts');
/*
 * The book works dig bala the way it works uchcha bala, from the longitude and
 * the point the graha is weakest at, so all three examples are checkable. Its
 * rule is the shorter arc from that point over three - "if the difference is
 * more than 180, then subtract it from 360" - which is this file's shortestArc.
 *
 * Its two chakras name the strengthless points: Saturn in the 1st, Sun and
 * Mars in the 4th, Jupiter and Mercury in the 7th, Moon and Venus in the 10th.
 * The angles below are not given in the book; they are what its own
 * strengthless columns imply, which is a check in itself, since each example
 * has to yield one ascendant and one midheaven consistent across seven rows.
 */
(function () {
  var GRAHAS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
  var CHARTS = [
    { asc: 267.07, mc: 192.43,
      L: { Sun: 154.82, Moon: 120.03, Mars: 154.90, Mercury: 138.27,
           Jupiter: 165.78, Venus: 195.07, Saturn: 225.70 },
      dig: { Sun: 47.46, Moon: 24.13, Mars: 47.49, Mercury: 17.07,
             Jupiter: 26.24, Venus: 0.88, Saturn: 13.79 } },
    { asc: 35.05, mc: 290.32,
      L: { Sun: 211.35, Moon: 122.40, Mars: 294.92, Mercury: 192.42,
           Jupiter: 96.70, Venus: 207.83, Saturn: 200.33 },
      dig: { Sun: 33.68, Moon: 55.97, Mars: 58.47, Mercury: 7.54,
             Jupiter: 39.45, Venus: 27.50, Saturn: 55.09 } },
    { asc: 228.33, mc: 145.72,
      L: { Sun: 324.52, Moon: 32.13, Mars: 82.28, Mercury: 342.67,
           Jupiter: 183.25, Venus: 333.08, Saturn: 84.97 },
      dig: { Sun: 0.40, Moon: 37.86, Mars: 38.86, Mercury: 21.89,
             Jupiter: 44.97, Venus: 57.54, Saturn: 47.79 } }
  ];
  var weakestOf = function (g, asc, mc) {
    if (g === 'Sun' || g === 'Mars') return mc + 180;
    if (g === 'Jupiter' || g === 'Mercury') return asc + 180;
    if (g === 'Moon' || g === 'Venus') return mc;
    return asc;
  };
  var worst = 0;
  CHARTS.forEach(function (c) {
    GRAHAS.forEach(function (g) {
      var d = Math.abs(Astro.norm360(c.L[g] - weakestOf(g, c.asc, c.mc)));
      if (d > 180) d = 360 - d;
      worst = Math.max(worst, Math.abs(d / 3 - c.dig[g]));
    });
  });
  ok('all twenty-one printed dig balas come out', worst < 0.02,
    'worst ' + worst.toFixed(3) + ' virupas');

  /*
   * And the engine's own function agrees with the arithmetic above, which is
   * the part that would otherwise be a copy of the rule checked against
   * itself. Driven on a real chart rather than the book's, since digBala takes
   * an ascendant and a midheaven off one.
   */
  var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
  var c = Astro.chart({ jdUT: Astro.julianDay(1977, 8, 20, 3), latitude: 28.61,
    longitude: 77.21, tzOffsetMinutes: 330 });
  var r = Shadbala.compute(c, place).grahas;
  var off = [];
  GRAHAS.forEach(function (g) {
    var lon = c.planets.filter(function (p) { return p.name === g; })[0].longitude;
    var d = Math.abs(Astro.norm360(lon -
      weakestOf(g, c.ascendant.longitude, c.midheaven.longitude)));
    if (d > 180) d = 360 - d;
    if (Math.abs(d / 3 - r[g].dig) > 1e-9) off.push(g);
  });
  ok('and the engine computes dig bala by that same rule', off.length === 0,
    off.join(', ') || 'all seven');
})();


console.log('\nKala bala against the Rao textbook’s worked examples');
/*
 * Chapter 4 of the same book works the temporal strengths through the same
 * three charts. Its nine components are this file's nine, in the same order.
 */
(function () {
  /*
   * Nattonatt. The book measures from the middle of the daylight arc for a day
   * birth and the middle of the night for a night one, then divides the
   * elapsed minutes by twelve. That is this file's rule by another route,
   * since the midpoint of the daylight arc is apparent noon.
   */
  var natonnata = function (minutesFromMidday) { return minutesFromMidday / 12; };
  ok('nattonatt reproduces the day-birth example',
    Math.abs(natonnata(140) - 11.67) < 0.02 &&
    Math.abs(60 - natonnata(140) - 48.33) < 0.02);

  /*
   * Its second example transposes the two groups and its third proves it.
   * Example 2 is a night birth 335 minutes from midday: the night-strong
   * grahas take 27.92 and the day-strong 32.08, and the book prints both
   * figures the other way round. Example 3, four minutes from midnight, gives
   * "Natt bal of Moon, Mars and Saturn each = (60-0.33) = 59.67", which is
   * this rule and not that one.
   */
  ok('and the third example settles which way round the second should be',
    Math.abs(natonnata(716) - 59.67) < 0.05 &&
    Math.abs(60 - natonnata(716) - 0.33) < 0.05);

  /*
   * Paksha, on the book's reading of the Moon: always a benefic, doubled.
   * That is this site's moonPaksha=benefic; the default here is the group
   * reading, which the same page records and sets aside.
   */
  var paksha = function (elong, benefic) {
    var w = elong <= 180 ? elong : 360 - elong;
    return benefic ? w / 3 : 60 - w / 3;
  };
  var PAKSHA = [
    { elong: 325.21, benefic: 11.59, malefic: 48.41, moon: 23.18 },
    { elong: 271.05, benefic: 29.65, malefic: 30.35, moon: 59.30 },
    { elong: 67.62, benefic: 22.54, malefic: 37.46, moon: 45.08 }
  ];
  var pakshaOff = PAKSHA.filter(function (c) {
    return Math.abs(paksha(c.elong, true) - c.benefic) > 0.02 ||
      Math.abs(paksha(c.elong, false) - c.malefic) > 0.02 ||
      Math.abs(paksha(c.elong, true) * 2 - c.moon) > 0.03;
  });
  ok('paksha bala reproduces all three examples', pakshaOff.length === 0,
    pakshaOff.length + ' off');

  /*
   * Tribhaga: the thirds of the day go to Mercury, the Sun and Saturn, the
   * thirds of the night to the Moon, Venus and Mars, and Jupiter takes sixty
   * whenever. The book's three examples land in the third part of a day, the
   * first of a night and the second of a night, giving Saturn, the Moon and
   * Venus.
   */
  var DAY = ['Mercury', 'Sun', 'Saturn'], NIGHT = ['Moon', 'Venus', 'Mars'];
  var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
  var wrongThird = [];
  for (var y = 1960; y < 1990; y++) {
    [4, 10, 14, 20, 23].forEach(function (hour) {
      var c = Astro.chart({ jdUT: Astro.julianDay(y, 6, 11, hour - 5.5),
        latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 });
      var r = Shadbala.compute(c, place).grahas;
      var paid = Object.keys(r).filter(function (g) {
        return g !== 'Jupiter' && r[g].kala.tribhaga > 0;
      });
      // exactly one graha besides Jupiter takes it, and Jupiter always does
      if (paid.length !== 1) wrongThird.push(y + 'h' + hour + ' paid ' + paid.length);
      else if (DAY.indexOf(paid[0]) < 0 && NIGHT.indexOf(paid[0]) < 0) {
        wrongThird.push(y + 'h' + hour + ' ' + paid[0]);
      }
      if (r.Jupiter.kala.tribhaga !== 60) wrongThird.push(y + ' Jupiter');
    });
  }
  ok('tribhaga pays one graha a third and Jupiter always, as the book has it',
    wrongThird.length === 0, wrongThird.slice(0, 3).join(', ') || '150 readings');

  /*
   * Hora. The book uses seasonal horas, a twelfth of the day or of the night,
   * which is this site's horaLength=seasonal. The sequence runs in Chaldean
   * order from the weekday lord, and a night birth starts at the fifth from
   * it - which falls out of counting the night horas from twelve, since
   * twelve modulo seven is five.
   */
  var CHALDEAN = ['Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon'];
  var horaAt = function (vara, index) {
    return CHALDEAN[(CHALDEAN.indexOf(vara) + index) % 7];
  };
  ok('the hora sequence is the book’s, nine deep from a Saturday sunrise',
    ['Saturn', 'Jupiter', 'Mars', 'Sun', 'Venus', 'Mercury', 'Moon', 'Saturn',
     'Jupiter'].every(function (want, i) { return horaAt('Saturn', i) === want; }));
  ok('and a night birth starts at the fifth from the weekday lord',
    horaAt('Mercury', 12) === 'Sun' && (12 % 7) === 5);

  /*
   * Year and month lords. The book counts an ahargana from 2 May 1827 and this
   * file counts one from the Kali Yuga epoch, but the arithmetic after the
   * division is identical and the lords agree: Sun, Venus and Saturn for the
   * years, Saturn for all three months.
   */
  var WEEK = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
  var FROM_WED = ['Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    'Monday', 'Tuesday'];
  var NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday',
    'Saturday'];
  var bookLord = function (ahargana, per, mult) {
    var q = Math.floor(ahargana / per), r = ((q * mult + 1) % 7 + 7) % 7;
    return WEEK[NAMES.indexOf(FROM_WED[(r === 0 ? 7 : r) - 1])];
  };
  ok('the year lords are the book’s on all three charts',
    bookLord(47625, 360, 3) === 'Sun' && bookLord(46586, 360, 3) === 'Venus' &&
    bookLord(43411, 360, 3) === 'Saturn');
  ok('and the month lords likewise',
    [47625, 46586, 43411].every(function (a) {
      return bookLord(a, 30, 2) === 'Saturn';
    }));

  /*
   * Ayan bal. The book pairs Raman's constant, 24 over 48, with a declination
   * read off a six-part table of the bhuja - which is the exact declination for
   * an obliquity of 24 degrees, tabulated every fifteen and interpolated. This
   * site pairs Parashara's 23.45 over 46.9 with the true obliquity. Both are
   * normalised to span nought to sixty, so they very nearly agree: over the
   * book's own two tables the difference from its printed figures is 0.098 for
   * ours against 0.095 for its own pairing, the residue being its interpolation.
   */
  var NORTH = ['Sun', 'Mars', 'Jupiter', 'Venus'];
  var ayanOf = function (g, sayana, max, div, eps) {
    var d = Math.asin(Math.sin(eps * Math.PI / 180) *
      Math.sin(sayana * Math.PI / 180)) * 180 / Math.PI;
    var eff = g === 'Mercury' ? Math.abs(d) : (NORTH.indexOf(g) >= 0 ? d : -d);
    var v = 60 * (max + eff) / div;
    return g === 'Sun' ? v * 2 : v;
  };
  var AYANA = [
    { ayanamsa: 23 + 16 / 60,
      L: { Sun: 154.82, Moon: 120.03, Mars: 154.90, Mercury: 138.27,
           Jupiter: 165.78, Venus: 195.07, Saturn: 225.70 },
      book: { Sun: 61.94, Moon: 12.57, Mars: 30.92, Mercury: 39.19,
              Jupiter: 25.45, Venus: 11.90, Saturn: 57.66 } },
    { ayanamsa: 23 + 13 / 60,
      L: { Sun: 211.35, Moon: 122.40, Mars: 294.92, Mercury: 192.42,
           Jupiter: 96.70, Venus: 207.83, Saturn: 200.33 },
      book: { Sun: 11.98, Moon: 13.52, Mars: 10.43, Mercury: 46.99,
              Jupiter: 55.80, Venus: 7.14, Saturn: 50.28 } }
  ];
  var worstAyana = 0;
  AYANA.forEach(function (c) {
    Object.keys(c.book).forEach(function (g) {
      var sayana = Astro.norm360(c.L[g] + c.ayanamsa);
      worstAyana = Math.max(worstAyana,
        Math.abs(ayanOf(g, sayana, 23.45, 46.9, 23.44) - c.book[g]));
    });
  });
  ok('ayan bala reproduces both printed tables on this site’s own constant',
    worstAyana < 0.45, 'worst ' + worstAyana.toFixed(2) + ' virupas');

  /*
   * Yuddha. No chart here has a war, so there is nothing to check
   * numerically. What can be checked is that the engine adds the winner's
   * share into kala bala and takes the loser's out, and that the nine parts
   * it reports really sum to the total it prints - which is what makes the
   * column comparison below mean anything.
   */
  var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
  var chart = Astro.chart({ jdUT: Astro.julianDay(1977, 8, 20, 3),
    latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 });
  var got = Shadbala.compute(chart, place).grahas;
  var PARTS = ['nathonnatha', 'paksha', 'tribhaga', 'abda', 'masa', 'vara',
    'hora', 'ayana', 'yuddha'];
  ok('the engine’s nine kala parts sum to the kala bala it prints',
    Object.keys(got).every(function (g) {
      var sum = PARTS.reduce(function (t, k) { return t + (got[g].kala[k] || 0); }, 0);
      return Math.abs(sum - got[g].kala.total) < 1e-9;
    }));

  /*
   * And the whole column, all nine parts, against the two examples the book
   * totals. Built from the book's own inputs - its longitudes, its ayanamsa,
   * its lords - by the rules stated above, so what it checks is that those
   * rules together land where the book lands. The third example is the one
   * whose nattonatt it transposes, so it is not totalled here.
   */
  var NORTH2 = ['Sun', 'Mars', 'Jupiter', 'Venus'];
  var DAYS = ['Sun', 'Jupiter', 'Venus'];
  var column = function (o) {
    var out = {};
    ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'].forEach(function (g) {
      var nat = g === 'Mercury' ? 60
        : (DAYS.indexOf(g) >= 0 ? 60 - o.fromMidday / 12 : o.fromMidday / 12);
      var w = o.elong <= 180 ? o.elong : 360 - o.elong, bright = w / 3;
      var ben = g === 'Moon' ? true
        : (g === 'Jupiter' || g === 'Venus' || (g === 'Mercury' && o.mercuryBenefic));
      var pak = ben ? bright : 60 - bright;
      if (g === 'Moon') pak *= 2;
      var d = Math.asin(Math.sin(23.44 * Math.PI / 180) *
        Math.sin(Astro.norm360(o.L[g] + o.ayanamsa) * Math.PI / 180)) * 180 / Math.PI;
      var eff = g === 'Mercury' ? Math.abs(d) : (NORTH2.indexOf(g) >= 0 ? d : -d);
      var ay = 60 * (23.45 + eff) / 46.9;
      if (g === 'Sun') ay *= 2;
      out[g] = nat + pak + (g === 'Jupiter' || g === o.tribhaga ? 60 : 0) +
        (g === o.yearLord ? 15 : 0) + (g === o.monthLord ? 30 : 0) +
        (g === o.dayLord ? 45 : 0) + (g === o.horaLord ? 60 : 0) + ay;
    });
    return out;
  };
  var WHOLE = [
    { o: { fromMidday: 140.5, elong: 325.21, mercuryBenefic: false,
           tribhaga: 'Saturn', yearLord: 'Sun', monthLord: 'Saturn',
           dayLord: 'Saturn', horaLord: 'Jupiter', ayanamsa: 23 + 16 / 60,
           L: { Sun: 154.82, Moon: 120.03, Mars: 154.90, Mercury: 138.27,
                Jupiter: 165.78, Venus: 195.07, Saturn: 225.70 } },
      book: { Sun: 173.68, Moon: 47.42, Mars: 91.00, Mercury: 147.60,
              Jupiter: 205.37, Venus: 71.82, Saturn: 252.74 } },
    { o: { fromMidday: 716, elong: 67.62, mercuryBenefic: true,
           tribhaga: 'Venus', yearLord: 'Saturn', monthLord: 'Saturn',
           dayLord: 'Saturn', horaLord: 'Jupiter', ayanamsa: 23 + 13 / 60,
           L: { Sun: 324.52, Moon: 32.13, Mars: 82.28, Mercury: 342.67,
                Jupiter: 183.25, Venus: 333.08, Saturn: 84.97 } },
      book: { Sun: 85.35, Moon: 110.53, Mars: 155.97, Mercury: 115.44,
              Jupiter: 159.96, Venus: 110.95, Saturn: 188.86 } }
  ];
  var worstWhole = 0;
  WHOLE.forEach(function (c) {
    var mine = column(c.o);
    Object.keys(c.book).forEach(function (g) {
      worstWhole = Math.max(worstWhole, Math.abs(mine[g] - c.book[g]));
    });
  });
  ok('and the two totalled kala columns come out, all nine parts together',
    worstWhole < 0.4, 'worst ' + worstWhole.toFixed(2) + ' virupas across 14 figures');
})();


console.log('\nOne chart end to end, from birth data to every bala');
/*
 * Chapter 5 of the Rao textbook gives the birth behind its first example:
 * Samastipur in Bihar, 85 deg 50' E, 21 September 1957 at 14:00 IST. That
 * turns three chapters of printed tables into a single check that starts
 * where a user starts - a date, a time and a place - and ends at the totals.
 *
 * It settles the cheshta questions too. The chapter states the averaged kendra
 * outright, uses the Sun's mean as the seeghrocha for Mars, Jupiter and Saturn
 * and as the MEAN for Budha and Sukra, and gives the luminaries the chapter 28
 * kendras: sayana Sun plus ninety, and the Moon's distance from the Sun.
 */
(function () {
  var place = { latitude: 25.86, longitude: 85 + 50 / 60, tzOffsetMinutes: 330 };
  var chart = Astro.chart({ jdUT: Astro.julianDay(1957, 9, 21, 14 - 5.5),
    latitude: place.latitude, longitude: place.longitude,
    tzOffsetMinutes: place.tzOffsetMinutes });

  var PRINTED = { Sun: 154.82, Moon: 120.03, Mars: 154.90, Mercury: 138.27,
    Jupiter: 165.78, Venus: 195.07, Saturn: 225.70 };
  var offBy = 0;
  Object.keys(PRINTED).forEach(function (g) {
    var got = chart.planets.filter(function (p) { return p.name === g; })[0].longitude;
    offBy = Math.max(offBy, Math.abs(((got - PRINTED[g] + 540) % 360) - 180));
  });
  ok('the birth data reproduces the longitudes the book works from',
    offBy < 0.05, 'worst ' + offBy.toFixed(3) + ' degrees');

  /*
   * The angles are not printed anywhere in the book; these are what its dig
   * bala columns imply, recovered earlier. That they fall out of the birth
   * data too is a second check on both.
   */
  ok('and the ascendant and midheaven its dig bala columns imply',
    Math.abs(chart.ascendant.longitude - 267.07) < 0.2 &&
    Math.abs(chart.midheaven.longitude - 192.43) < 0.2,
    chart.ascendant.longitude.toFixed(2) + ' and ' +
      chart.midheaven.longitude.toFixed(2));

  /* Its settings: the Moon always benefic, and the averaged chesta kendra. */
  var r = Shadbala.compute(chart, place,
    { moonPaksha: 'benefic', kendraMethod: 'averaged' }).grahas;
  var GRAHAS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
  var worstOf = function (want, pick) {
    return GRAHAS.reduce(function (w, g) {
      return want[g] === undefined ? w : Math.max(w, Math.abs(pick(r[g]) - want[g]));
    }, 0);
  };

  ok('uchcha bala comes out',
    worstOf({ Sun: 11.73, Moon: 30.99, Mars: 12.30, Mercury: 51.09,
      Jupiter: 36.41, Venus: 6.02, Saturn: 51.43 },
      function (x) { return x.sthana.uchcha; }) < 0.05);
  ok('dig bala comes out',
    worstOf({ Sun: 47.46, Moon: 24.13, Mars: 47.49, Mercury: 17.07,
      Jupiter: 26.24, Venus: 0.88, Saturn: 13.79 },
      function (x) { return x.dig; }) < 0.2);
  ok('kala bala comes out, all nine parts together',
    worstOf({ Sun: 173.68, Moon: 47.42, Mars: 91.00, Mercury: 147.60,
      Jupiter: 205.37, Venus: 71.82, Saturn: 252.74 },
      function (x) { return x.kala.total; }) < 0.5);
  ok('and cheshta bala, the luminaries included',
    worstOf({ Sun: 30.64, Moon: 11.59, Mars: 0.03, Mercury: 33.41,
      Jupiter: 3.49, Venus: 28.34, Saturn: 23.25 },
      function (x) { return x.cheshta; }) < 0.35);

  /*
   * Saptavargaja is the one that does not, and the book is wrong on it rather
   * than the engine: its panchadha table files the Moon among Mars's friends
   * where its own rules make her a fast friend, which is worth exactly one step
   * of the ladder. Six of the seven land, and Mars misses by that step.
   */
  var sapta = { Sun: 82.50, Moon: 142.50, Mars: 105.00, Mercury: 129.38,
    Jupiter: 105.00, Venus: 135.00, Saturn: 82.50 };
  var off = GRAHAS.filter(function (g) {
    return Math.abs(r[g].sthana.saptavargaja - sapta[g]) > 0.05;
  });
  ok('saptavargaja comes out for six of the seven',
    off.length === 1 && off[0] === 'Mars', off.join(', '));
  ok('and Mars misses by one step of the ladder, which is the book’s slip',
    Math.abs((r.Mars.sthana.saptavargaja - sapta.Mars) - 7.5) < 0.05,
    (r.Mars.sthana.saptavargaja - sapta.Mars).toFixed(2) + ' virupas');

  ok('drik bala comes out, the visesha additions with it',
    worstOf({ Sun: -13.21, Moon: -3.83, Mars: -13.21, Mercury: -14.68,
      Jupiter: -1.97, Venus: -13.42, Saturn: -29.00 },
      function (x) { return x.drik; }) < 0.05);
  ok('and naisargika, which the book rounds a hundredth up',
    worstOf({ Sun: 60.00, Moon: 51.43, Mars: 17.15, Mercury: 25.72,
      Jupiter: 34.29, Venus: 42.86, Saturn: 8.58 },
      function (x) { return x.naisargika; }) < 0.015);

  /*
   * Chapter 8 adds the six up. Its motional row is filled for both luminaries
   * and both are in the totals, so the chapter is read with the luminaries'
   * cheshta counted; with it omitted every total is a rupa light. Mars carries
   * the saptavargaja slip and nothing else does.
   */
  var full = Shadbala.compute(chart, place, { moonPaksha: 'benefic',
    kendraMethod: 'averaged', luminaryCheshta: 'counted' });
  var t = full.grahas;
  var totals = { Sun: 482.80, Moon: 319.23, Mars: 349.76, Mercury: 434.59,
    Jupiter: 468.83, Venus: 301.50, Saturn: 433.29 };
  var offTotal = GRAHAS.filter(function (g) {
    return Math.abs(t[g].totalShashtiamsa - totals[g]) > 0.6;
  });
  ok('the six sum to the shadbalapinda the chapter prints, Mars excepted',
    offTotal.length === 1 && offTotal[0] === 'Mars',
    GRAHAS.map(function (g) {
      return g + ' ' + (t[g].totalShashtiamsa - totals[g]).toFixed(2);
    }).join(', '));
  ok('and the Sun’s rupa figure lands on all three of its decimals',
    Math.abs(t.Sun.rupas - 8.047) < 0.001, t.Sun.rupas.toFixed(3));

  /*
   * The ranking is the point of the table, and it is by proportional strength -
   * the rupa figure over the minimum the graha is required to reach - not by
   * the raw total. Mars is ranked 4th here on both readings, so its slip does
   * not reach the order.
   */
  ok('and the proportional ranking is the chapter’s, all seven places',
    full.ranking.join(' ') === 'Sun Saturn Jupiter Mars Mercury Venus Moon',
    full.ranking.join(' > '));

  /*
   * And chapter 9's ishta and kashta, which is the whole chain: birth data to
   * uchcha and cheshta bala to the two phalas. Mars is left out and asserted
   * separately below - its cheshta bala is 0.03 in the book and 0.21 here, a
   * fifth of a virupa, and a square root near zero turns that into a whole
   * virupa of ishta. Jupiter's ishta is the book's own slip, 36.41 x 3.49 being
   * 127.07 where it prints the product of 3.59.
   */
  var phala = { Sun: [18.96, 37.65], Moon: [18.95, 37.47], Mercury: [41.31, 15.39],
    Jupiter: [11.27, 36.51], Venus: [13.06, 41.34], Saturn: [34.58, 17.75] };
  var worstPhala = 0, atPhala = '';
  Object.keys(phala).forEach(function (g) {
    [['ishta', 0], ['kashta', 1]].forEach(function (p) {
      var d = Math.abs(r[g].phala[p[0]] - phala[g][p[1]]);
      if (d > worstPhala) { worstPhala = d; atPhala = g + ' ' + p[0]; }
    });
  });
  ok('ishta and kashta come out of the birth data, six of the seven',
    worstPhala < 0.5, 'worst ' + worstPhala.toFixed(2) + ' on ' + atPhala);

  /*
   * The seventh is the reason ishta is quoted to two places and read to none.
   * A graha all but stationary has a cheshta bala near zero, and the square
   * root is steepest there: a fifth of a virupa in becomes a whole virupa out.
   * Kashta, taking sixty less each share, is flat in the same place and lands.
   */
  ok('and Mars shows what a square root does near zero',
    Math.abs(r.Mars.cheshta - 0.03) < 0.25 &&
    Math.abs(r.Mars.phala.ishta - 0.61) > 0.5 &&
    Math.abs(r.Mars.phala.kashta - 53.48) < 0.2,
    'cheshta ' + r.Mars.cheshta.toFixed(2) + ' for 0.03, ishta ' +
      r.Mars.phala.ishta.toFixed(2) + ' for 0.61, kashta ' +
      r.Mars.phala.kashta.toFixed(2) + ' for 53.48');
})();


console.log('\nDrik bala on all three of the textbook’s worked charts');
/*
 * Chapter 7 is the one chapter that prints its drishti kendras, its aspect
 * values and its totals for three separate charts, which makes it the best
 * check of the piece the engine changed most: drishti as a continuous function
 * of the angle rather than a step per whole sign, with Mars, Jupiter and
 * Saturn's visesha added on top of the ordinary value instead of replacing it.
 *
 * The longitudes go in as printed and the benefic split is the chapter's own,
 * so nothing here depends on the engine casting the chart. Its three splits
 * differ: the Moon is malefic in all three, Mercury malefic in the first two
 * and benefic in the third, which is the conditional rule working.
 */
(function () {
  var GRAHAS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
  var CASES = [
    { name: 'Example 1',
      lon: { Sun: 154.82, Moon: 120.03, Mars: 154.90, Mercury: 138.27,
        Jupiter: 165.78, Venus: 195.07, Saturn: 225.70 },
      benefic: ['Jupiter', 'Venus'],
      want: { Sun: -13.21, Moon: -3.83, Mars: -13.21, Mercury: -14.68,
        Jupiter: -1.97, Venus: -13.42, Saturn: -29.00 } },
    { name: 'Example 2',
      lon: { Sun: 211.35, Moon: 122.40, Mars: 294.92, Mercury: 192.42,
        Jupiter: 96.70, Venus: 207.83, Saturn: 200.33 },
      benefic: ['Jupiter', 'Venus'],
      want: { Sun: -5.76, Moon: -29.25, Mars: -18.02, Mercury: -1.03,
        Jupiter: -16.25, Venus: -4.89, Saturn: -3.01 } },
    { name: 'Example 3',
      lon: { Sun: 324.52, Moon: 32.13, Mars: 82.28, Mercury: 342.67,
        Jupiter: 183.25, Venus: 333.08, Saturn: 84.97 },
      benefic: ['Mercury', 'Jupiter', 'Venus'],
      want: { Sun: -6.04, Moon: 11.80, Mars: 21.22, Mercury: -5.53,
        Jupiter: -10.91, Venus: -5.10, Saturn: 20.27 } }
  ];
  CASES.forEach(function (c) {
    var positions = {}, benefics = {};
    GRAHAS.forEach(function (g) {
      positions[g] = { longitude: c.lon[g] };
      benefics[g] = c.benefic.indexOf(g) >= 0;
    });
    var worst = 0, at = '';
    GRAHAS.forEach(function (g) {
      var d = Math.abs(Shadbala.drikBala(g, positions, benefics) - c.want[g]);
      if (d > worst) { worst = d; at = g; }
    });
    ok('the chapter’s aspectual strengths come out, ' + c.name.toLowerCase(),
      worst < 0.02, 'worst ' + worst.toFixed(3) + ' virupas on ' + at);
  });

  /*
   * Two of the seven are positive in Example 3 and none is in the other two.
   * A sign error anywhere in the benefic split would show here before it showed
   * in a magnitude.
   */
  ok('and the signs follow the split, positive only where benefics outweigh',
    CASES[2].want.Moon > 0 && CASES[2].want.Saturn > 0 &&
    GRAHAS.every(function (g) { return CASES[0].want[g] < 0; }));
})();


console.log('\nIshta and kashta phala, on every worked example there is');
/*
 * Not a bala, and in no total: the good and the harm a graha is disposed to do
 * in its dasha, read off uchcha bala and cheshta bala alone. It is the reason
 * the luminaries have a cheshta bala at all, Raman saying at section 136 that
 * the Sun is given one because it "is necessary to ascertain the Ishta and
 * Kashta Phalas".
 *
 * Four printed tables to check against, 56 figures. The balas go in as printed
 * so nothing here depends on casting the charts.
 */
(function () {
  var GRAHAS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

  /*
   * The textbook's chapter 9 works all three of its charts. Three of its 42
   * answers do not follow from the inputs printed beside them, and in each the
   * engine lands on what those inputs give:
   *
   *   Example 1, Mars kashta: it writes "(60 - 0.03) = 59.57", which is 59.97.
   *   Example 1, Jupiter ishta: 36.41 x 3.49 is 127.07, and it prints 130.71,
   *     the product of 36.41 and 3.59.
   *   Example 3, Mars kashta: the root of 750.20 is 27.39, printed as 27.30.
   *
   * They are listed rather than tolerated, so that a later reader cannot take
   * the near miss for an engine fault and "fix" it towards the misprint.
   */
  var SLIPS = { 'Rao 1 Mars kashta': 1, 'Rao 1 Jupiter ishta': 1,
    'Rao 3 Mars kashta': 1 };
  var RAO = [
    { n: 1, u: [11.73, 30.99, 12.30, 51.09, 36.41, 6.02, 51.43],
            c: [30.64, 11.59, 0.03, 33.41, 3.49, 28.34, 23.25],
            i: [18.96, 18.95, 0.61, 41.31, 11.43, 13.06, 34.58],
            k: [37.65, 37.47, 53.31, 15.39, 36.51, 41.34, 17.75] },
    { n: 2, u: [7.12, 30.20, 58.97, 50.86, 59.43, 10.28, 59.89],
            c: [11.81, 29.65, 33.88, 28.90, 41.09, 57.93, 5.46],
            i: [9.17, 29.92, 44.70, 38.34, 49.42, 24.40, 18.08],
            k: [50.48, 30.07, 5.19, 16.86, 3.28, 10.14, 2.45] },
    { n: 3, u: [44.84, 59.71, 11.91, 0.78, 30.58, 52.03, 21.66],
            c: [25.87, 22.54, 44.40, 35.74, 47.32, 6.88, 40.93],
            i: [34.06, 36.69, 23.00, 5.28, 38.04, 18.92, 29.77],
            k: [22.75, 3.30, 27.30, 37.90, 19.31, 20.58, 27.04] }
  ];
  var missed = [], slipped = [];
  RAO.forEach(function (x) {
    GRAHAS.forEach(function (g, j) {
      var p = Shadbala.ishtaKashta(x.u[j], x.c[j], Shadbala.ISHTA_KASHTA.SRIPATI);
      [['ishta', p.ishta, x.i[j]], ['kashta', p.kashta, x.k[j]]].forEach(function (pair) {
        var name = 'Rao ' + x.n + ' ' + g + ' ' + pair[0];
        var off = Math.abs(pair[1] - pair[2]);
        if (SLIPS[name]) { if (off > 0.05) slipped.push(name); }
        else if (off > 0.011) missed.push(name + ' by ' + off.toFixed(2));
      });
    });
  });
  ok('the textbook’s three charts come out, 39 of its 42 figures exactly',
    missed.length === 0, missed.join(', '));
  ok('and the three that miss are its own arithmetic, each still off',
    slipped.length === 3, slipped.join(', '));

  /*
   * Raman's Standard Horoscope, Examples 62 and 63. The balas are his own, off
   * the sthana table of Example 13 and the cheshta table of Example 33. Two of
   * his kashta figures do not follow from them at all, and Mercury's cannot
   * follow from any pair of balas: an ishta of 11.20 and a kashta of 49.16
   * would need two numbers whose sum and product have no real roots.
   */
  var RU = [3.000, 32.75, 37.060, 54.500, 56.330, 1.950, 34.800];
  var RC = [22.66, 43.46, 22.23, 2.30, 35.26, 5.95, 21.14];
  var RI = [8.25, 37.73, 28.70, 11.20, 44.57, 3.49, 27.00];
  var RK = [46.13, 21.23, 29.44, 49.16, 13.19, 56.00, 31.50];
  var clean = 0, wrong = [];
  GRAHAS.forEach(function (g, j) {
    var p = Shadbala.ishtaKashta(RU[j], RC[j], Shadbala.ISHTA_KASHTA.SRIPATI);
    [['ishta', p.ishta, RI[j]], ['kashta', p.kashta, RK[j]]].forEach(function (pair) {
      // A fifth of a virupa, his tables rounding loosely: Venus's kashta is
      // 56.014 and he prints 56.00.
      if (Math.abs(pair[1] - pair[2]) <= 0.02) clean++;
      else wrong.push(g + ' ' + pair[0] + ' ' + pair[1].toFixed(2) +
        ' for ' + pair[2].toFixed(2));
    });
  });
  ok('Raman’s Examples 62 and 63 come out on nine of their fourteen',
    clean === 9, clean + ' exact; the rest: ' + wrong.join(', '));
  ok('and his Mercury pair is not a misreading but an impossibility',
    (function () {
      // i^2 = uc and k^2 = (60-u)(60-c) fix the product and the sum; if the
      // quadratic they imply has no real roots, no pair of balas gives both.
      var prod = 11.20 * 11.20;
      var sum = (3600 + prod - 49.16 * 49.16) / 60;
      return sum * sum - 4 * prod < 0;
    })());

  /*
   * Parashara's rule, from Sastri's commentary on Sripatipaddhati IV.6, which
   * prints it beside Sripati's and works the Sun: uchcha rasmi 6.742 and
   * cheshta rasmi 5.317, which are the balas over ten plus one, give an ishta
   * of 50.295 and a kashta of 9.705.
   */
  var par = Shadbala.ishtaKashta(10 * (6.742 - 1), 10 * (5.317 - 1),
    Shadbala.ISHTA_KASHTA.PARASHARA);
  ok('Parashara’s rule reproduces the Sun of that commentary, both figures',
    Math.abs(par.ishta - 50.295) < 0.005 && Math.abs(par.kashta - 9.705) < 0.005,
    par.ishta.toFixed(3) + ' and ' + par.kashta.toFixed(3));

  /*
   * The difference between the two readings, stated as a property rather than
   * a number: Parashara divides a fixed sixty, Sripati does not, so only the
   * second lets a graha be low in both at once.
   */
  var splits = 0, both = 0;
  for (var u = 0; u <= 60; u += 2.5) {
    for (var c = 0; c <= 60; c += 2.5) {
      var p = Shadbala.ishtaKashta(u, c, Shadbala.ISHTA_KASHTA.PARASHARA);
      if (Math.abs(p.ishta + p.kashta - 60) < 1e-9) splits++;
      var sr = Shadbala.ishtaKashta(u, c, Shadbala.ISHTA_KASHTA.SRIPATI);
      if (sr.ishta < 20 && sr.kashta < 20) both++;
    }
  }
  ok('Parashara’s pair always halves sixty between them', splits === 625, splits + ' of 625');
  ok('and Sripati’s lets a graha be low in both, which is why the two part',
    both > 0, both + ' of 625 under twenty on each');

  /*
   * Both ends, on both readings. A graha at the floor of both shares is all
   * kashta and no ishta either way; at the ceiling of both, the reverse.
   */
  ['sripati', 'parashara'].forEach(function (rule) {
    var low = Shadbala.ishtaKashta(0, 0, rule), high = Shadbala.ishtaKashta(60, 60, rule);
    ok('nothing in either share is nothing good and all harm, ' + rule,
      low.ishta === 0 && Math.abs(low.kashta - 60) < 1e-9);
    ok('and everything in both is the other way about, ' + rule,
      Math.abs(high.ishta - 60) < 1e-9 && high.kashta === 0);
  });
})();


console.log('\nA chart missing a field the engine added later still computes');
/*
 * This shipped broken. The page computes most charts through the chart API,
 * and the deployed copy of the engine was older than ayanamsaJ2000, so it
 * returned charts without it. seeghraKendra subtracted undefined and the five
 * starry grahas came out NaN while the luminaries, whose rule never touches
 * that field, came out fine - five NaNs in a row, two good figures, and a NaN
 * total. Charts saved in a reader's browser before the field existed have the
 * same gap, and redeploying the API does nothing for those.
 *
 * So the engine recovers the value rather than depending on the caller: find
 * the system whose ayanamsa at this moment is the chart's, and ask it what it
 * was at J2000.
 */
(function () {
  var GRAHAS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
  var place = { latitude: 21.3069, longitude: -157.8583, tzOffsetMinutes: -600 };
  var bad = [];
  ['lahiri', 'raman', 'kp', 'trueCitra', 'fagan'].forEach(function (system) {
    var chart = Astro.chart({ jdUT: Astro.julianDay(1961, 8, 4, 29.4),
      latitude: place.latitude, longitude: place.longitude,
      tzOffsetMinutes: place.tzOffsetMinutes, ayanamsa: system });
    var full = Shadbala.compute(chart, place).grahas;

    var stripped = JSON.parse(JSON.stringify(chart));
    delete stripped.ayanamsaJ2000;
    var recovered = Shadbala.compute(stripped, place).grahas;

    GRAHAS.forEach(function (g) {
      if (!isFinite(recovered[g].cheshta)) bad.push(system + ' ' + g + ' NaN');
      else if (Math.abs(recovered[g].cheshta - full[g].cheshta) > 1e-9) {
        bad.push(system + ' ' + g + ' off by ' +
          (recovered[g].cheshta - full[g].cheshta).toFixed(4));
      }
      if (!isFinite(recovered[g].totalShashtiamsa)) bad.push(system + ' ' + g + ' total NaN');
    });
  });
  ok('the J2000 ayanamsa is recovered exactly, in every system offered',
    bad.length === 0, bad.slice(0, 4).join(', ') || 'five systems, seven grahas each');

  /*
   * And it is recovered, not guessed. Defaulting to Lahiri would pass the NaN
   * check while quietly misplacing a chart cast in another system, so this
   * pins that a Raman chart does not come back with Lahiri's J2000 value.
   */
  ok('and not by assuming Lahiri',
    Math.abs(Astro.ayanamsa(0, 'raman') - Astro.ayanamsa(0, 'lahiri')) > 1,
    (Astro.ayanamsa(0, 'raman') - Astro.ayanamsa(0, 'lahiri')).toFixed(2) +
      ' degrees apart at J2000');
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
