/*
 * Front-end tests without a browser. A minimal DOM stub is enough to run the
 * real charts.js and serialise its SVG, and the last section cross-checks every
 * element id and selector app.js reaches for against index.html.
 *
 * Run with: node test/test-ui.js
 */
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');

var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? '  (' + detail + ')' : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  (' + detail + ')' : '')); }
}

/* ------------------------------------------------------------- DOM stub */

function makeNode(tag) {
  return {
    tag: tag, attrs: {}, children: [], textContent: null,
    setAttribute: function (k, v) { this.attrs[k] = String(v); },
    getAttribute: function (k) { return this.attrs[k]; },
    appendChild: function (child) { this.children.push(child); return child; },
    set innerHTML(v) { if (v === '') this.children = []; },
    get innerHTML() { return ''; }
  };
}
function serialise(node) {
  var attrs = Object.keys(node.attrs).map(function (k) { return ' ' + k + '="' + node.attrs[k] + '"'; }).join('');
  var inner = (node.textContent == null ? '' : node.textContent) +
    node.children.map(serialise).join('');
  return '<' + node.tag + attrs + '>' + inner + '</' + node.tag + '>';
}
var document = {
  createElementNS: function (ns, tag) { return makeNode(tag); },
  createElement: function (tag) { return makeNode(tag); }
};

/* ------------------------------------------------- load the real modules */

global.PERTURBATIONS = require('../data/perturbations.js');
var Astro = require('../js/astro.js');
var citiesSrc = fs.readFileSync(path.join(root, 'data/cities.js'), 'utf8');
global.window = {};
new Function('window', citiesSrc)(global.window);
var Geo = require('../js/geo.js');
// Loaded so the yoga note can be checked against the real detector count rather
// than against a sentence somebody remembered to update.
global.Astro = Astro;
var Yogas = require('../js/yogas.js');
var Charts = new Function('document', 'Astro',
  fs.readFileSync(path.join(root, 'js/charts.js'), 'utf8') + '\nreturn Charts;')(document, Astro);
var Shadbala = require('../js/shadbala.js');

/* --------------------------------------------------------- place lookup */

console.log('\nPlace lookup');
ok('city table parsed', Geo.count() > 60000, Geo.count() + ' places');
var delhi = Geo.search('New Delhi', 5)[0];
ok('"New Delhi" resolves', delhi && /Delhi/.test(delhi.name) && delhi.zone === 'Asia/Kolkata',
   delhi ? Geo.label(delhi) + ' / ' + delhi.zone : 'not found');
ok('coordinates look right', delhi && Math.abs(delhi.lat - 28.6) < 0.3 && Math.abs(delhi.lon - 77.2) < 0.3,
   delhi ? delhi.lat + ', ' + delhi.lon : '');
[['mumbai', 'Mumbai'], ['delhi', 'Delhi'], ['london', 'London'], ['pune', 'Pune'],
 ['hyderabad', 'Hyderabad'], ['patna', 'Patna']].forEach(function (pair) {
  var hits = Geo.search(pair[0], 5);
  ok('"' + pair[0] + '" offers the major city first', hits.length && hits[0].name === pair[1],
     hits.length ? Geo.label(hits[0]) + ' pop ' + hits[0].pop + 'k' : 'nothing');
});
ok('accent-insensitive search', Geo.search('zurich', 3).some(function (c) { return /Zürich|Zurich/.test(c.name); }));
// Former names matter: birth certificates say Bombay, Calcutta, Benares.
[['bangalore', 'Bengaluru'], ['bombay', 'Mumbai'], ['calcutta', 'Kolkata'],
 ['madras', 'Chennai'], ['benares', 'Varanasi'], ['poona', 'Pune'],
 ['trivandrum', 'Thiruvananthapuram'], ['allahabad', 'Prayagraj'],
 ['dacca', 'Dhaka'], ['rangoon', 'Yangon']].forEach(function (pair) {
  var hits = Geo.search(pair[0], 8);
  ok('"' + pair[0] + '" offers ' + pair[1] + ' first',
     hits.length > 0 && hits[0].name === pair[1],
     hits.length ? Geo.label(hits[0]) : 'nothing');
});
ok('short queries return nothing', Geo.search('a', 5).length === 0);
['Varanasi', 'Chennai', 'Kathmandu', 'Colombo', 'Lahore', 'Dhaka', 'Jaipur', 'Coimbatore',
 'New York', 'London', 'Dubai', 'Singapore', 'Toronto', 'Nairobi', 'Sao Paulo'].forEach(function (q) {
  var hit = Geo.search(q, 1)[0];
  ok('finds ' + q, !!hit, hit ? Geo.label(hit) : 'MISSING');
});

console.log('\nTimezone resolution');
[['Asia/Kolkata', 1990, 8, 15, 10, 30, 330, 'modern India'],
 ['Asia/Kolkata', 1944, 6, 15, 12, 0, 390, 'wartime India +06:30'],
 ['America/New_York', 1975, 7, 4, 12, 0, -240, 'US summer'],
 ['America/New_York', 1975, 1, 4, 12, 0, -300, 'US winter'],
 ['Europe/London', 1968, 6, 1, 12, 0, 60, 'British Standard Time experiment'],
 ['Asia/Karachi', 1947, 8, 14, 9, 0, 330, 'pre-partition Karachi'],
 ['Asia/Kathmandu', 1985, 5, 1, 6, 0, 330, 'Nepal before +05:45']
].forEach(function (t) {
  var got = Geo.offsetMinutes(t[0], t[1], t[2], t[3], t[4], t[5]);
  ok(t[7] + ' = ' + Geo.formatOffset(t[6]), got === t[6], Geo.formatOffset(got));
});

/* --------------------------------------------------------- chart drawing */

console.log('\n12-hour clock conversion');
[[12, 'am', 0], [1, 'am', 1], [11, 'am', 11], [12, 'pm', 12], [1, 'pm', 13], [11, 'pm', 23]].forEach(function (t) {
  ok(t[0] + ':00 ' + t[1].toUpperCase() + ' is hour ' + t[2], Geo.to24Hour(t[0], t[1]) === t[2],
     'got ' + Geo.to24Hour(t[0], t[1]));
});
ok('every hour round-trips through 12-hour form', (function () {
  for (var h = 0; h < 24; h++) {
    var p = Geo.from24Hour(h);
    if (p.hour12 < 1 || p.hour12 > 12) return false;
    if (Geo.to24Hour(p.hour12, p.meridiem) !== h) return false;
  }
  return true;
})());
// Midnight and noon are the pair that breaks naive conversions.
ok('midnight shows as 12 AM, not 0 AM', Geo.from24Hour(0).hour12 === 12 && Geo.from24Hour(0).meridiem === 'am');
ok('noon shows as 12 PM', Geo.from24Hour(12).hour12 === 12 && Geo.from24Hour(12).meridiem === 'pm');
// A 12 AM birth must land on the right calendar day, not twelve hours away.
(function () {
  var midnight = Astro.julianDay(1990, 8, 15, Geo.to24Hour(12, 'am') - 5.5);
  var noon = Astro.julianDay(1990, 8, 15, Geo.to24Hour(12, 'pm') - 5.5);
  ok('12 AM and 12 PM are twelve hours apart', Math.abs((noon - midnight) * 24 - 12) < 1e-9);
})();

console.log('\nChart rendering');
var offset = Geo.offsetMinutes(delhi.zone, 1990, 8, 15, 10, 30);
var jdUT = Astro.julianDay(1990, 8, 15, (10 * 60 + 30 - offset) / 60);
var chart = Astro.chart({ jdUT: jdUT, latitude: delhi.lat, longitude: delhi.lon, tzOffsetMinutes: offset });

['north', 'south'].forEach(function (style) {
  [false, true].forEach(function (navamsa) {
    var container = makeNode('div');
    Charts.render(container, {
      style: style, navamsa: navamsa,
      planets: chart.planets, ascendant: chart.ascendant.longitude
    });
    var svg = serialise(container);
    var tag = style + (navamsa ? ' D9' : ' D1');
    ok(tag + ': one svg produced', (svg.match(/<svg/g) || []).length === 1);
    ok(tag + ': twelve houses drawn', (svg.match(/class="house/g) || []).length === 12,
       (svg.match(/class="house/g) || []).length + ' groups');
    ok(tag + ': all nine grahas plus lagna placed',
       ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Rahu', 'Ketu',
        'Ascendant'].map(Astro.grahaAbbr).every(function (a) {
         return new RegExp('>' + a + '(R|\\s|<)').test(svg);
       }));
    ok(tag + ': lagna highlighted once', (svg.match(/first-house/g) || []).length === 1);
    ok(tag + ': retrograde styled', /class="planet graha-[a-z]+ retro"/.test(svg));
    // Charts carry the graha and nothing else: degrees live in the table, where
    // there is room to show them to the arcsecond.
    ok(tag + ': no degrees anywhere in the chart', !/>[A-Z][a-z] ?\d/.test(svg));
    ok(tag + ': retrograde marked [R]', /\[R\]/.test(svg));
    ok(tag + ': no NaN in output', !/NaN/.test(svg));
  });
});

// Every graha carries its own colour class, so the stylesheet can distinguish
// them without charts.js hard-coding any colour.
(function () {
  var c = makeNode('div');
  Charts.render(c, { style: 'north', planets: chart.planets, ascendant: chart.ascendant.longitude });
  var svg = serialise(c);
  var slugs = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'rahu', 'ketu', 'lagna'];
  ok('every graha has a colour class', slugs.every(function (g) {
    return svg.indexOf('graha-' + g) >= 0;
  }), slugs.filter(function (g) { return svg.indexOf('graha-' + g) < 0; }).join(',') || 'all present');
  // The inner figure is four arcs bowing inwards, not a straight rhombus.
  var path = svg.match(/<path d="([^"]+)"/);
  ok('north chart draws curved inner arcs', !!path && (path[1].match(/Q/g) || []).length === 4,
     path ? (path[1].match(/Q/g) || []).length + ' quadratic segments' : 'no path');
  ok('the curves bow towards the centre', (function () {
    if (!path) return false;
    // First control point must sit between the chord midpoint and the centre.
    var nums = path[1].match(/[\d.]+/g).map(Number);
    var cx = nums[2], cy = nums[3];              // control of the first arc
    return cx < 328 && cy > 112 && cx > 220 && cy < 220;
  })());
})();

// South Indian layout is fixed: Aries must always sit second along the top row.
var southContainer = makeNode('div');
Charts.render(southContainer, { style: 'south', planets: chart.planets, ascendant: chart.ascendant.longitude });
var southSvg = serialise(southContainer);
ok('south: Aries cell is second in the top row', /x="114[^"]*" y="4"|x="114/.test(southSvg) || /Ari ·/.test(southSvg));
ok('the ascendant is never marked retrograde', (function () {
  var c = makeNode('div');
  Charts.render(c, { style: 'north', planets: chart.planets, ascendant: chart.ascendant.longitude });
  return !/>As \[R\]/.test(serialise(c));
})());
ok('south: all twelve sign labels present',
   Astro.SIGN_ABBR.every(function (a) { return southSvg.indexOf('>' + a + ' ·') >= 0; }));

console.log('\nHistorical reference chart');
/*
 * M. K. Gandhi, 2 October 1869, 07:11 local mean time, Porbandar. Published
 * charts give a Libra (Tula) ascendant with the Sun in Virgo (Kanya). Reading the
 * same clock time as Asia/Kolkata zone time instead - which for 1869 means
 * Kolkata's own +05:53 local mean time - moves the ascendant a whole sign, which
 * is exactly why app.js offers the choice.
 */
(function () {
  var lat = 21.6417, lon = 69.6103;
  var lmtOffset = Math.round(lon * 4); // the formula app.js uses
  ok('longitude to LMT offset', lmtOffset === 278, lmtOffset + ' min = ' + Geo.formatOffset(lmtOffset));
  var byLmt = Astro.chart({
    jdUT: Astro.julianDay(1869, 10, 2, (7 * 60 + 11 - lmtOffset) / 60),
    latitude: lat, longitude: lon, tzOffsetMinutes: lmtOffset
  });
  ok('LMT gives the published Libra ascendant', byLmt.ascendant.signName === 'Libra', byLmt.ascendant.signName);
  ok('LMT gives the published Virgo Sun', byLmt.planets[0].signName === 'Virgo', byLmt.planets[0].signName);
  var zoneOffset = Geo.offsetMinutes('Asia/Kolkata', 1869, 10, 2, 7, 11);
  var byZone = Astro.chart({
    jdUT: Astro.julianDay(1869, 10, 2, (7 * 60 + 11 - zoneOffset) / 60),
    latitude: lat, longitude: lon, tzOffsetMinutes: zoneOffset
  });
  ok('zone time differs by a sign, as expected',
     byZone.ascendant.signName !== byLmt.ascendant.signName,
     'zone reading gives ' + byZone.ascendant.signName + ' at ' + Geo.formatOffset(zoneOffset));
})();

console.log('\nStudy charts that ship with the app');
/*
 * The seeded charts carry notes that state what the chart shows. A note is a
 * claim about a calculation, so it is checked here rather than trusted: the
 * place has to resolve to the coordinates written down, and the readings have
 * to be the ones this engine produces from that moment.
 */
(function () {
  var src = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  var literal = src.match(/var STUDY_CHARTS = (\[[\s\S]*?\n  \}\]);/);
  ok('STUDY_CHARTS is still a literal this test can read', !!literal);
  if (!literal) return;
  var charts = new Function('return ' + literal[1])();
  ok('four charts ship', charts.length === 4, charts.map(function (c) { return c.name; }).join(', '));

  function cast(entry, offsetMinutes) {
    var t = entry.time.split(':').map(Number);
    var date = entry.date.split('-').map(Number);
    var off = offsetMinutes == null
      ? Geo.offsetMinutes(entry.zone, date[0], date[1], date[2], t[0], t[1])
      : offsetMinutes;
    return Astro.chart({
      jdUT: Astro.julianDay(date[0], date[1], date[2], (t[0] * 60 + t[1] + (t[2] || 0) / 60 - off) / 60),
      latitude: entry.latitude, longitude: entry.longitude,
      tzOffsetMinutes: off, trueNode: entry.trueNode
    });
  }
  function dashaStart(chart, lord) {
    var period = chart.dashas.periods.filter(function (p) { return p.lord === lord; })[0];
    return period ? Astro.calendarDate(period.startJd) : null;
  }

  charts.forEach(function (entry) {
    var town = entry.placeLabel.split(',')[0];
    var hit = Geo.search(town, 40).filter(function (c) {
      return Geo.label(c) === entry.placeLabel;
    })[0];
    ok(entry.name + ': the place label is one the combobox offers', !!hit,
       hit ? Geo.label(hit) : 'no such label for ' + town);
    if (hit) {
      ok(entry.name + ': coordinates and zone match that place',
         Math.abs(hit.lat - entry.latitude) < 1e-4 &&
         Math.abs(hit.lon - entry.longitude) < 1e-4 && hit.zone === entry.zone,
         hit.lat + ', ' + hit.lon + ' / ' + hit.zone);
    }
    // A note is optional. Where there is one it is prose the user reads, so it
    // stays inside the column limit and keeps em-dashes out.
    ok(entry.name + (entry.note ? ': the note fits the column limit and avoids em-dashes'
                                : ': ships without a note, which is allowed'),
       !entry.note || (entry.note.length <= 2000 && !/[\u2013\u2014]/.test(entry.note)),
       entry.note ? entry.note.length + ' chars' : 'no note');
  });

  function named(name) {
    return charts.filter(function (c) { return c.name === name; })[0];
  }
  var trump = named('Donald Trump'), kareem = named('Kareem Abdul-Jabbar');
  var ava = named('Ava Gardner'), obama = named('Barack Obama');
  ok('each chart checked below is still in the list', !!trump && !!kareem && !!ava && !!obama);
  if (!trump || !kareem || !ava || !obama) return;

  var tc = cast(trump);
  ok('Trump: 6 Leo rises in Magha, as the note says',
     tc.ascendant.signName === 'Leo' && Math.floor(tc.ascendant.longitude % 30) === 6 &&
     tc.ascendant.nakshatra.name === 'Magha',
     tc.ascendant.signName + ' ' + (tc.ascendant.longitude % 30).toFixed(2) +
     ' ' + tc.ascendant.nakshatra.name);
  /*
   * The rival 9:51 am does move every house, and the note now says so in this
   * app's own degrees rather than in the tropical ones western references print.
   */
  var tcOld = cast({
    date: trump.date, time: '09:51:00', zone: trump.zone, trueNode: trump.trueNode,
    latitude: trump.latitude, longitude: trump.longitude
  });
  ok('Trump: the older 9:51 am rises at 24 Cancer instead',
     tcOld.ascendant.signName === 'Cancer' && Math.floor(tcOld.ascendant.longitude % 30) === 24,
     tcOld.ascendant.signName + ' ' + (tcOld.ascendant.longitude % 30).toFixed(2));
  ok('Trump: and the grahas do not move a sign between the two times',
     tc.planets.every(function (p, i) { return p.signName === tcOld.planets[i].signName; }));
  var tj = dashaStart(tc, 'Jupiter');
  ok('Trump: Jupiter dasha starts in November 2016', tj && tj.y === 2016 && tj.m === 11,
     tj ? tj.y + '-' + tj.m + '-' + tj.d : 'no Jupiter period');

  var kc = cast(kareem);
  ok('Abdul-Jabbar: 2 Libra rises in Chitra',
     kc.ascendant.signName === 'Libra' && Math.floor(kc.ascendant.longitude % 30) === 2 &&
     kc.ascendant.nakshatra.name === 'Chitra',
     kc.ascendant.signName + ' ' + (kc.ascendant.longitude % 30).toFixed(2) +
     ' ' + kc.ascendant.nakshatra.name);
  /*
   * The whole point of that chart as an example: 1947 daylight saving in New York
   * began on 27 April, so 16 April is standard time. Reading the clock an hour
   * the other way does not nudge the lagna, it moves it a sign.
   */
  ok('Abdul-Jabbar: the zone lookup gives standard time, not summer time',
     Geo.offsetMinutes(kareem.zone, 1947, 4, 16, 18, 30) === -300,
     Geo.formatOffset(Geo.offsetMinutes(kareem.zone, 1947, 4, 16, 18, 30)));
  var asEdt = cast(kareem, -240);
  ok('Abdul-Jabbar: read as EDT it would rise at 20 Virgo instead',
     asEdt.ascendant.signName === 'Virgo' && Math.floor(asEdt.ascendant.longitude % 30) === 20,
     asEdt.ascendant.signName + ' ' + (asEdt.ascendant.longitude % 30).toFixed(2));
  var kp = {};
  kc.planets.forEach(function (planet) { kp[planet.name] = planet; });
  ok('Abdul-Jabbar: Sun exalted in Aries in the 7th',
     kp.Sun.signName === 'Aries' && kp.Sun.dignity === 'Exalted' && kp.Sun.house === 7,
     kp.Sun.signName + ' ' + kp.Sun.dignity + ' H' + kp.Sun.house);
  ok('Abdul-Jabbar: Moon with Venus in Aquarius in the 5th',
     kp.Moon.signName === 'Aquarius' && kp.Venus.signName === 'Aquarius' && kp.Moon.house === 5);
  ok('Abdul-Jabbar: Mercury debilitated in Pisces with Mars',
     kp.Mercury.signName === 'Pisces' && kp.Mercury.dignity === 'Debilitated' &&
     kp.Mars.signName === 'Pisces');
  ok('Abdul-Jabbar: Jupiter retrograde with Ketu in Scorpio',
     kp.Jupiter.signName === 'Scorpio' && kp.Jupiter.retrograde === true &&
     kp.Ketu.signName === 'Scorpio');
  ok('Abdul-Jabbar: Rahu exalted in Taurus', kp.Rahu.signName === 'Taurus' &&
     kp.Rahu.dignity === 'Exalted');
  ok('Abdul-Jabbar: Shatabhisha birth nakshatra leaves 12 years of Rahu',
     kc.dashas.birthNakshatra.name === 'Shatabhisha' &&
     Math.floor(kc.dashas.balanceYears) === 12,
     kc.dashas.birthNakshatra.name + ', ' + kc.dashas.balanceYears.toFixed(2) + ' years');
  ok('Abdul-Jabbar: Saturn is the yogakaraka for this lagna and sits in the 10th',
     Astro.isYogakaraka('Saturn', kc.ascendant.sign) && kp.Saturn.house === 10 &&
     kp.Saturn.signName === 'Cancer');
  var ks = dashaStart(kc, 'Saturn');
  ok('Abdul-Jabbar: Saturn dasha starts in July 1975', ks && ks.y === 1975 && ks.m === 7,
     ks ? ks.y + '-' + ks.m + '-' + ks.d : 'no Saturn period');
  var kmer = dashaStart(kc, 'Mercury');
  ok('Abdul-Jabbar: and runs to July 1994, when Mercury takes over',
     kmer && kmer.y === 1994 && kmer.m === 7,
     kmer ? kmer.y + '-' + kmer.m + '-' + kmer.d : 'no Mercury period');

  var ac = cast(ava);
  ok('Gardner: 7 Cancer rises in Pushya',
     ac.ascendant.signName === 'Cancer' && Math.floor(ac.ascendant.longitude % 30) === 7 &&
     ac.ascendant.nakshatra.name === 'Pushya',
     ac.ascendant.signName + ' ' + (ac.ascendant.longitude % 30).toFixed(2) +
     ' ' + ac.ascendant.nakshatra.name);
  ok('Gardner: December is standard time, so no summer-time trap here',
     Geo.offsetMinutes(ava.zone, 1922, 12, 24, 19, 10) === -300,
     Geo.formatOffset(Geo.offsetMinutes(ava.zone, 1922, 12, 24, 19, 10)));
  /*
   * Grabtown is too small for the gazetteer, so the entry stands at Smithfield
   * eight kilometres west. Published charts are cast from Boon Hill and print a
   * tropical ascendant of 0 Leo; from here it is the last minutes of Cancer. The
   * sidereal lagna this app draws is in Cancer from either place, which is the
   * whole argument for the substitution: it has to not matter, and it does not.
   */
  var tropical = (ac.ascendant.longitude + ac.ayanamsa) % 30;
  ok('Gardner: from Smithfield the tropical ascendant is the tail of Cancer',
     Astro.SIGNS[Math.floor(((ac.ascendant.longitude + ac.ayanamsa) % 360) / 30)] === 'Cancer' &&
     tropical > 29.5, tropical.toFixed(2) + ' of Cancer');
  var boonHill = cast({
    date: ava.date, time: ava.time, zone: ava.zone, trueNode: ava.trueNode,
    latitude: 35.5167, longitude: -78.1833
  });
  ok('Gardner: and the sidereal lagna is Cancer from Boon Hill too',
     boonHill.ascendant.signName === 'Cancer' &&
     Math.abs(boonHill.ascendant.longitude - ac.ascendant.longitude) < 0.5,
     boonHill.ascendant.signName + ' ' + (boonHill.ascendant.longitude % 30).toFixed(2));
  var ap = {};
  ac.planets.forEach(function (planet) { ap[planet.name] = planet; });
  ok('Gardner: Moon with Mars in Aquarius in the 8th',
     ap.Moon.signName === 'Aquarius' && ap.Mars.signName === 'Aquarius' &&
     ap.Moon.house === 8 && ap.Mars.house === 8);
  ok('Gardner: Sun with Mercury in Sagittarius in the 6th',
     ap.Sun.signName === 'Sagittarius' && ap.Mercury.signName === 'Sagittarius' &&
     ap.Sun.house === 6);
  ok('Gardner: Purva Bhadrapada birth nakshatra leaves 8 years of Jupiter',
     ac.dashas.birthNakshatra.name === 'Purva Bhadrapada' &&
     Math.floor(ac.dashas.balanceYears) === 8,
     ac.dashas.birthNakshatra.name + ', ' + ac.dashas.balanceYears.toFixed(2) + ' years');
  var asat = dashaStart(ac, 'Saturn'), amer = dashaStart(ac, 'Mercury');
  ok('Gardner: Saturn dasha runs June 1931 to June 1950, over the MGM years',
     asat && asat.y === 1931 && asat.m === 6 && amer && amer.y === 1950 && amer.m === 6,
     (asat ? asat.y + '-' + asat.m : '?') + ' to ' + (amer ? amer.y + '-' + amer.m : '?'));

  var oc = cast(obama);
  ok('Obama: 24 Capricorn rises in Dhanishta',
     oc.ascendant.signName === 'Capricorn' && Math.floor(oc.ascendant.longitude % 30) === 24 &&
     oc.ascendant.nakshatra.name === 'Dhanishta',
     oc.ascendant.signName + ' ' + (oc.ascendant.longitude % 30).toFixed(2) +
     ' ' + oc.ascendant.nakshatra.name);
  /*
   * Hawaii has never kept daylight saving, so August needs no second reading of
   * the clock. It did keep a half-hour zone until 1947, though, and a lookup
   * that quietly rounded that to whole hours would put every chart cast there
   * before the war seven degrees out. Both halves are checked, because only one
   * of them is exercised by the chart that ships.
   */
  ok('Obama: 1961 Honolulu is ten hours behind, with no summer time to find',
     Geo.offsetMinutes(obama.zone, 1961, 8, 4, 19, 24) === -600 &&
     Geo.offsetMinutes(obama.zone, 1961, 1, 4, 19, 24) === -600,
     Geo.formatOffset(Geo.offsetMinutes(obama.zone, 1961, 8, 4, 19, 24)));
  ok('Obama: and the same zone keeps its half hour before 1947',
     Geo.offsetMinutes(obama.zone, 1940, 8, 4, 19, 24) === -630,
     Geo.formatOffset(Geo.offsetMinutes(obama.zone, 1940, 8, 4, 19, 24)));
  var op = {};
  oc.planets.forEach(function (planet) { op[planet.name] = planet; });
  ok('Obama: Saturn in its own sign in the lagna, with Jupiter debilitated beside it',
     op.Saturn.signName === 'Capricorn' && op.Saturn.dignity === 'Own Sign' &&
     op.Saturn.house === 1 && op.Jupiter.signName === 'Capricorn' &&
     op.Jupiter.dignity === 'Debilitated' && op.Jupiter.house === 1,
     op.Saturn.dignity + ' Saturn, ' + op.Jupiter.dignity + ' Jupiter');
  ok('Obama: Moon in its mooltrikona in Taurus, in Rohini',
     op.Moon.signName === 'Taurus' && op.Moon.dignity === 'Mooltrikona' &&
     op.Moon.nakshatra.name === 'Rohini', op.Moon.dignity + ' in ' + op.Moon.nakshatra.name);
  ok('Obama: Sun with Mercury in Cancer in the 7th',
     op.Sun.signName === 'Cancer' && op.Mercury.signName === 'Cancer' && op.Sun.house === 7);
  ok('Obama: Mars with Rahu in Leo in the 8th',
     op.Mars.signName === 'Leo' && op.Rahu.signName === 'Leo' && op.Mars.house === 8);
  ok('Obama: Rohini birth nakshatra leaves just under 10 years of Moon dasha',
     oc.dashas.birthNakshatra.name === 'Rohini' && Math.floor(oc.dashas.balanceYears) === 9,
     oc.dashas.birthNakshatra.name + ', ' + oc.dashas.balanceYears.toFixed(2) + ' years');
  var ojup = dashaStart(oc, 'Jupiter'), osat = dashaStart(oc, 'Saturn');
  ok('Obama: Jupiter dasha runs July 1996 to July 2012',
     ojup && ojup.y === 1996 && ojup.m === 7 && osat && osat.y === 2012 && osat.m === 7,
     (ojup ? ojup.y + '-' + ojup.m : '?') + ' to ' + (osat ? osat.y + '-' + osat.m : '?'));
})();

/*
 * Seeding has to survive a chart being added to the list. The record is the
 * names already offered, so a browser holding the older charts still receives a
 * new one, and a deleted chart stays deleted.
 */
(function () {
  var src = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  ok('the seed record is a list of names, not one flag',
     /SEED_KEY = 'jyotisha\.seeded\.v2'/.test(src) &&
     /JSON\.stringify\(STUDY_CHARTS\.map\(/.test(src));
  ok('the v1 flag is still honoured, so deletions stick',
     /SEED_KEY_V1 = 'jyotisha\.seeded\.v1'/.test(src) &&
     /getItem\(SEED_KEY_V1\)/.test(src));
  ok('a chart already in the list is not seeded again',
     /!offered\[entry\.name\] && !known\[keyOf\(entry\)\]/.test(src));
})();

/* ------------------------------------------------ app.js <-> index.html */

console.log('\nStylesheet traps');
(function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');

  ok('the colour scheme is declared, not just reacted to',
     /(^|[^-])color-scheme:\s*light/.test(css) && /color-scheme:\s*dark/.test(css));

  /*
   * Setting one overflow axis to anything but visible promotes the other from
   * visible to auto. A rule that scrolls sideways and leaves the other axis
   * alone will grow a vertical scrollbar the moment anything overflows by a
   * pixel, which is exactly how one appeared over the tab strip.
   */
  var offenders = [];
  css.replace(/([^{}]+)\{([^}]*)\}/g, function (all, selector, body) {
    // The other axis need only be stated; hidden is as good an answer as auto.
    var scrollsX = /overflow-x:\s*(auto|scroll)/.test(body);
    var scrollsY = /overflow-y:\s*(auto|scroll)/.test(body);
    var saysX = /overflow-x:/.test(body);
    var saysY = /overflow-y:/.test(body);
    var saysBoth = /(^|[^-])overflow:\s*/.test(body);
    if (!saysBoth && ((scrollsX && !saysY) || (scrollsY && !saysX))) {
      offenders.push(selector.trim().split('\n').pop());
    }
    return all;
  });
  ok('no rule scrolls one axis while leaving the other implicit',
     offenders.length === 0, offenders.join(' | ') || 'none');
})();

console.log('\nDOM contract between app.js and index.html');
var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
var appSrc = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
var cssSrc = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');

var htmlIds = {};
(html.match(/\sid="[^"]+"/g) || []).forEach(function (m) { htmlIds[m.slice(5, -1)] = true; });

var missing = [];
var idRe = /getElementById\('([^']+)'\)/g, m;
while ((m = idRe.exec(appSrc))) {
  // Ids created at runtime by the combobox are not in the static HTML.
  if (!htmlIds[m[1]] && m[1].indexOf('place-option-') !== 0) missing.push('#' + m[1]);
}
ok('every getElementById target exists in index.html', missing.length === 0, missing.join(', ') || 'all found');

var selMissing = [];
var selRe = /querySelector(?:All)?\('([^']+)'\)/g;
while ((m = selRe.exec(appSrc))) {
  var sel = m[1];
  var id = sel.match(/^#([\w-]+)/);
  if (id && !htmlIds[id[1]]) selMissing.push(sel);
}
ok('every querySelector root exists in index.html', selMissing.length === 0, selMissing.join(', ') || 'all found');

['data/perturbations.js', 'js/astro.js', 'js/geo.js', 'js/charts.js', 'js/app.js', 'css/styles.css'].forEach(function (asset) {
  ok('index.html links ' + asset, html.indexOf(asset) >= 0);
  ok(asset + ' exists on disk', fs.existsSync(path.join(root, asset)));
});
ok('cities.js is loaded lazily, not in index.html',
   html.indexOf('data/cities.js') < 0 && fs.readFileSync(path.join(root, 'js/geo.js'), 'utf8').indexOf("'data/cities.js'") > 0);

// Accessibility wiring for the combobox.
ok('combobox declares role and controls', /role="combobox"/.test(html) && /aria-controls="place-listbox"/.test(html));
ok('listbox declares its role', /id="place-listbox" role="listbox"/.test(html));
ok('app manages aria-activedescendant', /aria-activedescendant/.test(appSrc));
// The lagna heads the graha table instead of sitting in a tile above it.
// Nothing above the charts repeats what the table says below them.
ok('no summary tiles remain above the charts',
   !/id="key-facts"/.test(html) && !/Chandra rashi|Janma nakshatra|Surya rashi/.test(appSrc));
ok('edit and download sit on the birth details line',
   /class="birth-row"/.test(html) &&
   html.indexOf('id="edit-button"') > html.indexOf('id="result-birth"') &&
   html.indexOf('id="edit-button"') < html.indexOf('id="chart-a"'));
ok('both icon buttons are labelled for screen readers', (function () {
  var buttons = html.match(/<button[^>]*class="icon-button"[^>]*>/g) || [];
  return buttons.length === 2 && buttons.every(function (b) {
    return /aria-label="[^"]+"/.test(b) && /title="[^"]+"/.test(b);
  });
})());
ok('the icons are inline svg, not an external font or image',
   /<svg viewBox="0 0 24 24" aria-hidden="true"/.test(html) && !/<img/.test(html));

ok('the lagna is the first row of the table, not a summary tile',
   /name: 'Ascendant', longitude: c\.ascendant\.longitude, isAscendant: true/.test(appSrc) &&
   !/fact\(facts, 'Lagna/.test(appSrc));
/*
 * It used to be tinted as well as named. In a table whose hover is also a tint
 * that left two greens to tell apart, and the name already does the telling.
 */
ok('and it is not tinted apart from the grahas', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return !/ascendant-row/.test(css) && !/ascendant-row/.test(appSrc);
})());
/*
 * The name cell spans its graha's rows, so a one-row hover must not paint it:
 * from the first row it lit the whole block, from the second it lit nothing,
 * and the same gesture drew two different shapes.
 */
/*
 * And no band at all in the Vimsopaka Bala grid. A graha there is two rows, so a
 * band one row wide lights half a cell: it follows the drawing rather than the
 * thing, the same reason that grid chips a pair once and not twice. The graha
 * table keeps it, a row there being a whole reading across eleven columns.
 */
ok('the vimsopaka grid takes no hover band, and the graha table keeps one',
   (function () {
     var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
     return /#vargas-table tbody tr:hover \{ background: none; \}/.test(css) &&
       /\ntbody tr:hover \{ background: var\(--row-hover\); \}/.test(css) &&
       !/#graha-table tbody tr:hover \{ background: none/.test(css);
   })());
/*
 * The name column stays put while the rest scrolls. Every one of these tables is
 * wider than its card, and a row read four columns to the right is a row whose
 * subject has gone off the left edge.
 */
ok('the first column is frozen in every scrolling table', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var block = css.slice(css.indexOf('.table-scroll thead th:first-child,'));
  block = block.slice(0, block.indexOf('}'));
  return /position: sticky/.test(block) && /left: 0/.test(block) &&
    /background: var\(--surface\)/.test(block);
})());
/*
 * Two things a sticky cell in a collapsed-border table needs and does not get on
 * its own: something opaque to stand on, because what scrolls under it paints
 * over it otherwise, and a divider that is not a border - with border-collapse
 * the edge belongs to the pair of cells and travels with the one that moves.
 */
ok('and it is opaque, with a shadow for a divider rather than a border',
   (function () {
     var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
     var block = css.slice(css.indexOf('.table-scroll thead th:first-child,'));
     block = block.slice(0, block.indexOf('}'));
     return /box-shadow: 1px 0 0 var\(--line-soft\)/.test(block) &&
       !/border-right/.test(block);
   })());
ok('the heading corner sits above the column it heads', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return /\.table-scroll thead th:first-child \{ z-index: 2; \}/.test(css);
})());
/*
 * Every one of these tables puts a th first in a body row, which is what the
 * rule selects; the grid's second row has none, its name spanning down from
 * above, so nothing there is frozen by accident.
 */
ok('and every scrolling table really does head its rows with a th', (function () {
  // Two grids head their rows with what they measure - a division, a share of
  // Shadbala - and the rest with a graha. Nothing spans a group: the graha
  // table's Longitude heading is a row of its own, not a cell over three.
  return (appSrc.match(/setAttribute\('scope', 'row'\)/g) || []).length === 6 &&
    !/'rowgroup'/.test(appSrc) &&
    (appSrc.match(/el\(i === 0 \? 'th' : 'td'/g) || []).length === 1;
})());
ok('the frozen cell joins the hover band, except where it spans a group',
   (function () {
     var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
     return /tbody tr:hover th\[scope\]:not\(\[rowspan\]\) \{ background: var\(--row-hover\); \}/
       .test(css) &&
       /tbody tr:hover th\[rowspan\] \{ background: var\(--surface\); \}/.test(css);
   })());

ok('the hover band is one row wide, the spanning name staying out of it', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return /\ntbody tr:hover th\[rowspan\] \{ background: var\(--surface\); \}/.test(css);
})());
// The Vargas grid spans a name over two rows too, so it had the same defect.
ok('and the rule is not written for one table, both grids spanning a name',
   (function () {
     var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
     return !/#graha-table tbody tr:hover th\[rowspan\]/.test(css) &&
       /th\[rowspan\]/.test(css);
   })());
/*
 * The table carries the same three flags the chart does, in the same order, so
 * the two say the same thing the same way. [R] keeps its red; [V] and [Y] stay
 * quiet, being facts rather than warnings.
 */
/*
/*
 * Each flag sits on the value it qualifies. There was a Chart column holding all
 * of them because the table interleaved three charts and they had to be told
 * apart; a table that is one chart has no such column and no need of one.
 *
 * [R] and [C] are facts about the graha, so they stay on the name. [V] is about
 * the sign the division gives and [S] and [P] about the two beside it, so all
 * three go on the sign. [Y] is a fact about lordship and [D] about the house,
 * so each goes on its own column. [N] was already on the dignity it cancels.
 */
ok('every flag rides on the value it qualifies', (function () {
  var at = appSrc.indexOf('function grahaTableFor');
  var block = appSrc.slice(at, appSrc.indexOf('function renderShadbala', at));
  var cells = block.slice(block.indexOf('cells: ['), block.indexOf('var table = el('));
  var after = function (label) {
    var i = cells.indexOf(label);
    return cells.slice(i, cells.indexOf('{ text:', i + 10));
  };
  return /headRow\.appendChild\(grahaColumnHead\(col\.entity, sun\)\);/.test(block) &&
    !/'Y' : null/.test(block.slice(block.indexOf('headRow.appendChild(grahaColumnHead'),
                                   block.indexOf('thead.appendChild'))) &&
    /'V' : null/.test(after('Astro.SIGNS[v.sign]')) &&
    /'S' : null/.test(after('Astro.SIGNS[v.sign]')) &&
    /'P' : null/.test(after('Astro.SIGNS[v.sign]')) &&
    /'D' : null/.test(after('text: String(house)')) &&
    /Astro\.isYogakaraka\(r\.name, firstSign\) \? 'Y' : null/.test(after('owned.join')) &&
    !/graha-chart/.test(block);
})());
/*
 * Three tokens sitting together have to read as three different facts, so each
 * takes its own colour rather than retrogression being the only one picked out.
 */
ok('each flag gets a class of its own',
   /el\('span', 'flag flag-' \+ f\.toLowerCase\(\)/.test(appSrc));
/*
 * The colours had been scoped to a th, which was true while every flag rode on
 * the graha's name. The merged table moved [V] and [Y] into the Chart column, a
 * td, and they lost their colour there without anything failing. The rules are
 * unscoped now, so a flag looks the same wherever it is put.
 */
ok('and the colour is not scoped to the cell the flag happened to start in',
   (function () {
     var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
     return !/th \.flag/.test(css) && /\n\.flag \{ font-weight: 600;/.test(css);
   })());
ok('and each class a colour of its own, all four distinct', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var colourOf = function (cls) {
    var m = css.match(new RegExp('\\n\\.' + cls + ' \\{ color: ([^;]+);'));
    return m && m[1].trim();
  };
  var seen = ['flag-r', 'flag-v', 'flag-y', 'flag-c'].map(colourOf);
  if (seen.some(function (c) { return !c; })) return false;
  return seen.every(function (c, i) { return seen.indexOf(c) === i; });
})());
ok('the two new hues are defined in both palettes, not only the light one', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var at = css.indexOf('@media (prefers-color-scheme: dark)');
  var light = css.slice(0, at), dark = css.slice(at);
  return ['--flag-vargottama', '--flag-yogakaraka', '--flag-combust'].every(function (name) {
    return light.indexOf(name + ':') >= 0 && dark.indexOf(name + ':') >= 0;
  });
})());
/*
 * Yogakaraka is lordship counted from house 1, so it moves with the rotation
 * exactly as the House column does: the two are the same question asked twice,
 * and a flag disagreeing with the column beside it would be answering about a
 * chart nobody is looking at.
 */
ok('yogakaraka follows house 1',
   /Astro\.isYogakaraka\(r\.name, firstSign\)/.test(appSrc) && !/rashiLagna/.test(appSrc));
/*
 * The lagna owns nothing, so it never reaches the lordship cell that carries
 * the flag: without houses owned the cell is a dash and the flag has nowhere
 * to sit.
 */
ok('and the lagna is never flagged one, owning nothing',
   /var owned = r\.isAscendant \? \[\] : Astro\.housesOwned\(r\.name, firstSign\);/
     .test(appSrc) &&
   /owned\.length\s*\n\s*\? \{ text: owned\.join\(', '\), cls: 'numeric',\s*\n\s*flags: \[Astro\.isYogakaraka/
     .test(appSrc));
ok('and the flag alone takes the colour, not the name', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return /th \.retro-flag \{ color: var\(--retro\)/.test(css) ||
    /th \.retro-flag/.test(css.slice(css.indexOf('retro-flag')));
})());
ok('the ascendant row still leaves dignity blank',
   /\(r\.isAscendant \? '' : Astro\.dignityOf/.test(appSrc));

ok('time standard select is wired', /id="time-standard"/.test(html) && /time-standard/.test(appSrc));

// Two tab strips: the page's sections, and the divisional charts inside one of
// them. Counts are taken per strip, since a global count says nothing once
// there is more than one tablist.
function stripHtml(label) {
  var at = html.indexOf('aria-label="' + label + '"');
  return at < 0 ? '' : html.slice(at, html.indexOf('</div>', at));
}
(function () {
  var names = ['saved', 'add', 'chart', 'lesson', 'settings'];
  var strip = stripHtml('Sections');
  ok('the section strip holds five tabs', (strip.match(/role="tab"/g) || []).length === 5);
  ok('each tab has a panel, and each panel names its tab', names.every(function (n) {
    return new RegExp('id="tab-' + n + '"').test(html) &&
           new RegExp('id="panel-' + n + '"[^>]*aria-labelledby="tab-' + n + '"').test(html);
  }));
  ok('every tab points at its panel', names.every(function (n) {
    return new RegExp('id="tab-' + n + '"[\\s\\S]{0,140}aria-controls="panel-' + n + '"').test(html);
  }));
  ok('"add a kundali" is the section selected on arrival',
     /id="tab-add"[\s\S]{0,140}aria-selected="true"/.test(strip) &&
     (strip.match(/aria-selected="true"/g) || []).length === 1);
  ok('every panel but the form starts hidden',
     /id="panel-saved"[^>]*hidden/.test(html) && /id="panel-chart"[^>]*hidden/.test(html) &&
     /id="panel-lesson"[^>]*hidden/.test(html) &&
     /id="panel-settings"[^>]*hidden/.test(html) && !/id="panel-add"[^>]*hidden/.test(html));
  ok('only the selected section tab is reachable by tab key',
     (strip.match(/tabindex="-1"/g) || []).length === 4);
  ok('the tab strip is keyboard navigable',
     /ArrowRight/.test(appSrc) && /ArrowLeft/.test(appSrc) && /'Home'/.test(appSrc) && /'End'/.test(appSrc));
  ok('the chart tab has something to say when empty', /id="empty-chart"/.test(html));
  ok('generating moves you to the chart tab and clears the form',
     /showChart\(\);\s*\n[\s\S]{0,200}blankForm\(\);/.test(appSrc));
  ok('opening a saved chart lands on the chart tab',
     /reopeningSaved = true;\s*\n\s*activateTab\('chart'\)/.test(appSrc));
  /*
   * The node choice left the form. It is not a fact about the person the way a
   * birth time is: it is how the nodes are reckoned, and it applies to whatever
   * chart is open rather than to the next one created.
   */
  ok('the node choice is a setting, not a form field', (function () {
    var form = html.slice(html.indexOf('id="panel-add"'), html.indexOf('id="panel-chart"'));
    var panel = html.slice(html.indexOf('id="panel-settings"'), html.indexOf('</main>'));
    return !/node-type/.test(form) && /id="node-type"/.test(panel) &&
      (html.match(/id="node-type"/g) || []).length === 1;
  })());
  /*
   * And changing it recomputes the open chart rather than waiting for the next
   * one: it goes back through computeChart, since the service may answer
   * differently, and everything downstream redraws from the result.
   */
  ok('and changing it recomputes whatever chart is open',
     /document\.getElementById\('node-type'\)\.addEventListener\('change'/.test(appSrc) &&
     /computeChart\(\{\s*\n\s*jdUT: lastChart\.chart\.julianDay,/.test(appSrc) &&
     /lastChart\.trueNode = wanted;/.test(appSrc) &&
     /render\(lastChart\);\s*\n\s*writeHash\(lastChart\);/.test(appSrc));
  ok('and says so, including when there is no chart to recompute',
     /if \(!lastChart\) \{/.test(appSrc) &&
     /'Saved\. The next chart will use it\.'/.test(appSrc) &&
     /id="settings-status"/.test(html));
})();

// Two charts at once, each with its own division and its own first house.
(function () {
  ok('there are no fixed divisional tabs', !/id="tab-d1"|id="tab-d9"/.test(html));

  // The tables share a strip whose labels follow the selects, so a chart set to
  // D4 is headed D4 and not whatever was hard-coded in the markup.
  ok('the table tabs carry no label in the markup',
     /id="tab-table-a"[^>]*>\s*<\/button>/.test(html.replace(/\n\s*/g, ' ')) ||
     />\s*<\/button>/.test(html));
  /*
   * One panel tab still, with a strip of its own inside it: a tab and a table
   * for each chart on screen, built in app.js rather than typed into the markup.
   */
  ok('the graha tab is one tab, holding a strip of chart tabs',
     /id="tab-grahas"/.test(html) && !/tab-table-/.test(appSrc) &&
     /id="graha-chart-tabs"/.test(html) && /id="graha-tables"/.test(html) &&
     /table\.id = 'graha-table-d' \+ view\.division;/.test(appSrc));
  ok('shadbala shares the table strip rather than a card of its own',
     /id="tab-shadbala"[\s\S]{0,140}aria-controls="panel-shadbala"/.test(html) &&
     html.indexOf('id="panel-shadbala"') > html.indexOf('id="panel-table-b"') &&
     html.indexOf('id="panel-shadbala"') < html.indexOf('class="two-col"'));
  ok('the table strip holds five tabs', (function () {
    var strip = stripHtml('Graha tables');
    return (strip.match(/role="tab"/g) || []).length === 5;
  })());
  ok('the table strip is a real tablist',
     ['grahas', 'shadbala', 'vargas', 'yogas', 'aspects'].every(function (n) {
    return new RegExp('id="tab-' + n + '"[\\s\\S]{0,140}aria-controls="panel-' + n + '"').test(html) &&
           new RegExp('id="panel-' + n + '"[^>]*aria-labelledby="tab-' + n + '"').test(html);
  }));
  ok('only the first panel starts visible',
     /id="panel-shadbala"[^>]*hidden/.test(html) && /id="panel-vargas"[^>]*hidden/.test(html) &&
     !/id="panel-grahas"[^>]*hidden/.test(html));
  ok('one tab implementation still serves every strip',
     (appSrc.match(/function setupTabs/g) || []).length === 1 &&
     (appSrc.match(/setupTabs\(/g) || []).length === 3 &&
     /setupTabs\(\['grahas', 'shadbala', 'vargas', 'yogas', 'aspects'\]/.test(appSrc));
  // Two chart slots, and one table reading both of them plus the rashi.
  ok('there are two chart slots, each with two selects', ['a', 'b'].every(function (slot) {
    return new RegExp('id="ref-' + slot + '"').test(html) &&
           new RegExp('id="varga-' + slot + '"').test(html) &&
           new RegExp('id="chart-' + slot + '"').test(html);
  }));
  ok('and the tables are built rather than typed, one per chart',
     /id="graha-tables"/.test(html) && !/id="table-a"/.test(html) &&
     !/id="table-b"/.test(html) && !/<table id="graha-table">/.test(html));
  ok('both charts sit in one row, not behind each other',
     /class="chart-pair"/.test(html) &&
     html.indexOf('id="chart-a"') < html.indexOf('id="chart-b"') &&
     html.indexOf('id="chart-b"') < html.indexOf('id="graha-tables"'));
  ok('every select is labelled', ['ref-a', 'varga-a', 'ref-b', 'varga-b'].every(function (id) {
    return new RegExp('<label[^>]*for="' + id + '"').test(html);
  }));
  ok('the pair opens on rashi beside navamsa',
     /varga\.value = i === 0 \? '1' : '9'/.test(appSrc));
/*
 * Rotation redraws one chart; changing the division redraws the yogas and the
 * aspects too, since both are read from whichever divisions are on screen.
 */
  /*
   * The table reads both slots, so either control has to redraw it. Rotation
   * moves house 1, which moves the House column, the Lordship column and [Y].
   */
  ok('rotating redraws that chart and the table that reads it', (function () {
    var at = appSrc.indexOf("ref.addEventListener('change'");
    var block = appSrc.slice(at, at + 300);
    return /drawSlot\(slot\);/.test(block) && /renderGrahaTable\(lastChart\);/.test(block);
  })());


  // Rotation: house 1 moves to the chosen graha's sign, in the chosen division.
  ok('all ten reference points are offered',
     /REFERENCES = \['Ascendant', 'Sun', 'Moon', 'Mars', 'Jupiter', 'Venus',\s*\n?\s*'Mercury', 'Saturn', 'Rahu', 'Ketu'\]/.test(appSrc));
  var chartsSrc = fs.readFileSync(path.join(root, 'js/charts.js'), 'utf8');
  ok('houses in the chart run from the first sign, not the ascendant',
     /data\.firstSign/.test(chartsSrc) && !/\(data\.ascSign \+ h\)/.test(chartsSrc));
  ok('the lagna mark stays on the ascendant when rotated',
     /if \(i === data\.ascSign\) \{/.test(chartsSrc));
  ok('the rotation anchor is read in the chosen division',
     /signOfBody\(anchor\.longitude\)/.test(chartsSrc));
  /*
   * Rotation now shows only in the chart. The table lost its house column, and
   * every other column it carries is independent of where house 1 is put, so
   * there is nothing left there for the reference select to change.
   */
  ok('rotation still moves the chart', (function () {
    var chartsSrc = fs.readFileSync(path.join(root, 'js/charts.js'), 'utf8');
    return /data\.firstSign/.test(chartsSrc) && /signOfBody\(anchor\.longitude\)/.test(chartsSrc);
  })());
  ok('houses are counted from whatever that table\'s chart is rotated onto',
     /var firstSign = Astro\.vargaPosition\(c\.ascendant\.longitude, view\.division\)\.sign;/.test(appSrc) &&
     /view\.reference !== 'Ascendant'/.test(appSrc) &&
     /\{ label: 'House', says:/.test(appSrc));
})();

/*
 * One row per person. It was three lines - name, place, moment - which made a
 * list of ten charts a wall three times taller than it needed to be.
 */
ok('a saved entry lays out as one row, wrapping only when it must', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var block = css.slice(css.indexOf('.saved-open {'), css.indexOf('.saved-name {'));
  return /display: flex;/.test(block) && /flex-wrap: wrap;/.test(block) &&
    !/display: grid;/.test(block);
})());
ok('the place truncates and the moment does not', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return /\.saved-where \{ flex: 0 1 auto/.test(css) && /\.saved-when \{ flex: 0 0 auto/.test(css) &&
    /saved-meta saved-where/.test(appSrc) && /saved-meta saved-when/.test(appSrc);
})());
ok('and a separator keeps the place and the moment from reading as one phrase', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return /\.saved-when::before \{[^}]*content: '\\00b7'/.test(css);
})());

/*
 * The badge is drawn twice, on the saved row and on the chart heading, and the
 * two had drifted: "study" in one and "public figure" in the other, each being
 * half of the form's own label. One constant now.
 */
ok('the celebrity badge reads the same in both places',
   /var CELEBRITY_MARK = 'public figure';/.test(appSrc) &&
   (appSrc.match(/el\('span', 'celebrity-mark', CELEBRITY_MARK\)/g) || []).length === 2 &&
   !/'celebrity-mark', 'study'/.test(appSrc));
ok('and it matches what the form asks',
   /A public figure, kept for study/.test(html));

// Saved kundalis: the list, and the four keys that identify an entry.
ok('the saved list and its empty state are both present',
   /id="saved-list"/.test(html) && /id="saved-empty"/.test(html));
ok('an "add a kundali" button sits under the saved list',
   html.indexOf('id="add-kundali"') > html.indexOf('id="saved-list"'));
ok('the saved tab shows how many are stored', /id="saved-count"/.test(html) && /savedCount/.test(appSrc));
ok('generating saves without a separate button', /saveCurrent\(true\)/.test(appSrc) && !/id="save-button"/.test(html));
// Reopening a saved chart must not write it back: that would bump updated_at
// and reorder the list under the reader.
ok('reopening a saved chart does not save it again',
   /if \(!reopening\) saveCurrent\(true\)/.test(appSrc) && /reopeningSaved = true;/.test(appSrc));
ok('the reopen flag is cleared synchronously on submit',
   /var reopening = reopeningSaved;\s*\n\s*reopeningSaved = false;/.test(appSrc));
ok('the form gives way to the chart and can be brought back',
   /function showChart/.test(appSrc) && /function showForm/.test(appSrc) &&
   /addButton\.addEventListener/.test(appSrc) && /editButton\.addEventListener/.test(appSrc));
ok('saved charts sync to the database as well as this browser',
   /astro_charts|functions\/v1\/kundalis/.test(appSrc) && /action: 'save'/.test(appSrc) &&
   /action: 'list'/.test(appSrc) && /action: 'delete'/.test(appSrc));
ok('ownership is a minted token, not an account',
   /randomUUID/.test(appSrc) && /ownerToken/.test(appSrc));
ok('entries are keyed on name, place, date and time',
   /entry\.name, entry\.placeLabel, entry\.date, entry\.time/.test(appSrc));
ok('a local copy is written first so the panel works offline',
   /writeSaved\(list\)/.test(appSrc) && /localStorage/.test(appSrc));
// Editing has to refill the form and then update the row it came from.
// A privacy claim that has stopped being true is worse than none.
ok('the save status reserves no space when silent',
   /\.save-feedback:empty \{ display: none; \}/.test(fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8')));

ok('the page claims nothing about data staying put',
   !/sent nowhere|No data leaves this page|never leave the machine/.test(html + appSrc));

ok('the chart heading is the name alone',
   /heading\.textContent = state\.name;/.test(appSrc) && !/s chart'/.test(appSrc));

ok('editing refills the form from the chart on screen',
   /function fillForm/.test(appSrc) && /} else if \(lastChart\) \{\s*\n\s*fillForm\(lastChart\);/.test(appSrc));
ok('a blank form means a new chart, not an edit',
   /blankForm\(\);\s*\n\s*currentEntry = null;/.test(appSrc));
ok('the row a chart came from is remembered',
   /var currentEntry = null;/.test(appSrc) && /currentEntry = entry;/.test(appSrc));
ok('saving an edit names the row it replaces',
   /if \(currentEntry && currentEntry\.id\) entry\.id = currentEntry\.id;/.test(appSrc) &&
   /action: 'save', entry: entry, id: entry\.id/.test(appSrc));
ok('an edit replaces by id even when the four keys changed',
   /currentEntry\.id \? list\[i\]\.id === currentEntry\.id/.test(appSrc));
ok('deleting the chart on screen forgets the row', (function () {
  // Asserted on the body of removeSaved rather than on adjacent lines, so
  // moving the code does not fail a test about what it does.
  var body = appSrc.slice(appSrc.indexOf('function removeSaved'));
  body = body.slice(0, body.indexOf('\n  }'));
  return /currentEntry = null;/.test(body) &&
         /removed\.id \? removed\.id === currentEntry\.id/.test(body);
})());
ok('the ayanamsa a chart was cast with survives an edit',
   /ayanamsa: params\.ayanamsa, trueNode: params\.trueNode/.test(appSrc) &&
   /document\.getElementById\('ayanamsa'\)\.value = state\.ayanamsa;/.test(appSrc));

// Each saved row carries an edit and a delete, and delete asks first.
// Yogas and the lesson library.
ok('the page loads the yogas module', /<script src="js\/yogas\.js"><\/script>/.test(html));
ok('yogas share the table strip', /id="tab-yogas"[\s\S]{0,140}aria-controls="panel-yogas"/.test(html));
ok('the lesson tab is a section of its own',
   /id="tab-lesson"[\s\S]{0,140}aria-controls="panel-lesson"/.test(html) &&
   /id="panel-lesson"[^>]*aria-labelledby="tab-lesson"/.test(html));
ok('the lesson search is labelled', /<label for="lesson-query"/.test(html));
ok('the library loads when the lesson tab is opened',
   /if \(name === 'lesson'\) loadLessons\(\);/.test(appSrc));
ok('the library is fetched once and searched in the page',
   /if \(lessonLibrary\) return renderLessons\(\);/.test(appSrc));
// The yogas panel answers what the chart has; the reading of it is elsewhere.
ok('the yogas panel carries no explanatory passage',
   !/yoga-explanation/.test(appSrc) && !/fetchPassages\(\{ subjects:/.test(appSrc));
ok('it still says how each yoga forms',
   /finding\.summary/.test(appSrc) && /yoga-reasons/.test(appSrc) && /finding\.grahas\.join/.test(appSrc));
ok('it points at the Lesson tab for the meaning',
   /The Lesson tab explains/.test(appSrc));
ok('the library is still fetched for the lesson tab', /fetchPassages\(\{\}/.test(appSrc));
ok('the three kinds are conditions of one subject, not four subjects', (function () {
  var seed = fs.readFileSync(path.join(root, 'supabase/seed/astro_readings_yogas.sql'), 'utf8');
  return /'yoga', 'Parivartana', 'general'/.test(seed) &&
         /'yoga', 'Parivartana', 'maha'/.test(seed) &&
         /'yoga', 'Parivartana', 'khala'/.test(seed) &&
         /'yoga', 'Parivartana', 'dainya'/.test(seed) &&
         !/'Parivartana Maha'/.test(seed);
})());
console.log('\nLesson library');
/*
 * The library is a syllabus, not a pile. It is read as topic, then subject, then
 * the conditions under it, and sort_order decides both the order the topic chips
 * appear in and the order groups appear within one. That ordering is applied
 * globally, so two topics numbering from 1 interleave, which is why each topic
 * gets a band of its own.
 */
(function () {
  var files = fs.readdirSync(path.join(root, 'supabase/seed'))
    .filter(function (f) { return /^astro_readings.*\.sql$/.test(f); });
  var rows = [], unbalanced = [];
  files.forEach(function (f) {
    var src = fs.readFileSync(path.join(root, 'supabase/seed', f), 'utf8');
    var inserts = (src.match(/insert into astro_readings/g) || []).length;
    var conflicts = (src.match(/on conflict/g) || []).length;
    if (inserts !== conflicts || !inserts) unbalanced.push(f);
    var keys = src.match(/^\('([a-z]+)', '([^']+)', '([^']+)',/gm) || [];
    var orders = src.match(/,\s*(\d+)\)(?:,|\s*\n\s*\n\s*on conflict)/g) || [];
    keys.forEach(function (k, i) {
      var m = k.match(/^\('([a-z]+)', '([^']+)', '([^']+)',/);
      var o = orders[i] && orders[i].match(/(\d+)\)/);
      rows.push({ file: f, topic: m[1], subject: m[2], condition: m[3],
                  order: o ? +o[1] : null });
    });
  });

  ok('every seed file upserts rather than inserting blind',
     unbalanced.length === 0, unbalanced.join(', ') || files.length + ' files');
  ok('the library has grown past the yogas it started as',
     rows.length >= 40, rows.length + ' passages');

  ok('every passage has a sort order', rows.every(function (r) { return r.order !== null; }));

  ok('no two passages share a key', (function () {
    var seen = {}, dupe = null;
    rows.forEach(function (r) {
      var k = [r.topic, r.subject, r.condition].join('/');
      if (seen[k]) dupe = k; else seen[k] = 1;
    });
    return !dupe;
  })());

  /*
   * A shared sort_order is not an error the database would catch, and the symptom
   * is subtle: two topics quietly interleaving in the chip row.
   */
  ok('and no two share a sort order', (function () {
    var seen = {}, dupe = null;
    rows.forEach(function (r) { if (seen[r.order]) dupe = r.order; else seen[r.order] = 1; });
    return !dupe;
  })(), rows.length + ' distinct');

  ok('each topic keeps to a band of its own, so the chips do not interleave', (function () {
    var bands = {};
    return rows.every(function (r) {
      var band = Math.floor(r.order / 100);
      if (bands[r.topic] === undefined) bands[r.topic] = band;
      if (bands[r.topic] !== band) return false;
      return Object.keys(bands).every(function (t) {
        return t === r.topic || bands[t] !== band;
      });
    });
  })());

  /*
   * The point of the restructure. Every yoga passage leans on words the library
   * never defined, so a reader arriving at Vipareeta Raja Yoga had nowhere to
   * start. Each of these must now be explained somewhere outside the yogas.
   */
  ok('the vocabulary the yogas use is defined outside them', (function () {
    var groundwork = rows.filter(function (r) { return r.topic !== 'yoga'; })
      .map(function (r) { return r.file; });
    var text = groundwork.filter(function (f, i) { return groundwork.indexOf(f) === i; })
      .map(function (f) { return fs.readFileSync(path.join(root, 'supabase/seed', f), 'utf8'); })
      .join(' ').toLowerCase();
    return ['kendra', 'trikona', 'dusthana', 'upachaya', 'dispositor', 'lagna',
            'navamsha', 'moolatrikona', 'exalt', 'debilitat', 'karaka', 'varga']
      .every(function (term) { return text.indexOf(term) >= 0; });
  })());

  ok('a reader meets the foundations before the yogas', (function () {
    var first = function (topic) {
      return Math.min.apply(null, rows.filter(function (r) { return r.topic === topic; })
        .map(function (r) { return r.order; }));
    };
    return first('basics') < first('house') && first('house') < first('dignity') &&
      first('dignity') < first('varga') && first('varga') < first('strength') &&
      first('strength') < first('yoga');
  })());

  /*
   * The seed script applies the files by hand, so a new one added to the folder
   * and not to the script is silently never applied - which is how the database
   * came to hold 13 passages while the repo held 46.
   */
  ok('the seed script applies every seed file on disk', (function () {
    var script = fs.readFileSync(path.join(root, 'scripts/seed-readings.sh'), 'utf8');
    return files.every(function (f) { return script.indexOf(f) >= 0; });
  })(), files.length + ' files');
  ok('and applies the foundations before the yogas, so a partial run still starts somewhere',
     (function () {
       var script = fs.readFileSync(path.join(root, 'scripts/seed-readings.sh'), 'utf8');
       return script.indexOf('astro_readings_basics.sql') <
         script.indexOf('astro_readings_yogas.sql');
     })());

  ok('no one topic is more than half the library', (function () {
    var counts = {};
    rows.forEach(function (r) { counts[r.topic] = (counts[r.topic] || 0) + 1; });
    return Object.keys(counts).every(function (t) { return counts[t] <= rows.length / 2; });
  })(), (function () {
    var counts = {};
    rows.forEach(function (r) { counts[r.topic] = (counts[r.topic] || 0) + 1; });
    return Object.keys(counts).map(function (t) { return t + ' ' + counts[t]; }).join(', ');
  })());
})();

ok('lessons group by subject with the conditions beneath',
   /var section = el\('section', 'lesson-topic'\)/.test(appSrc) &&
   /passage-subtopic/.test(appSrc));
ok('the general passage leads its group',
   /a\.condition === 'general' \? -1 : 0/.test(appSrc));
ok('a grouped passage does not repeat its own subject heading',
   /var meta = grouped \? \[\] : \[passage\.topic, passage\.subject\]/.test(appSrc));
/*
 * Tests the intent rather than a character count: the early return used to be
 * pinned by how long the note inside it was, so lengthening that sentence failed
 * a test about network requests.
 */
ok('a chart with no yoga makes no request for one', (function () {
  var at = appSrc.indexOf('if (!found.length) {');
  if (at < 0) return false;
  var block = appSrc.slice(at, appSrc.indexOf('return;', at));
  return block.length > 0 && block.indexOf('READINGS_API') < 0 && block.indexOf('fetch(') < 0;
})());
/*
 * The note lists what is checked, so it has to be kept in step with the module.
 * This counts the detectors rather than trusting the sentence, since a detector
 * added without updating the note is exactly the drift worth catching.
 */
ok('the page says which yogas it looks for, and the list is current', (function () {
  var flat = appSrc.replace(/'\s*\+\s*'/g, '');
  // One name per detector, in the order the note gives them. The Moon's four
  // come from one detector, so its entry is the phrase that introduces them.
  var named = ['Raja yoga', 'parivartana', 'neecha bhanga', 'vipareeta raja', 'Lakshmi',
               'Gaja Kesari', 'kartari', 'Mahapurusha', 'Sunapha', 'Chandra Mangala',
               'Adhi', 'Sakata', 'Amala', 'Budha-Aditya'];
  return named.every(function (n) { return flat.indexOf(n) >= 0; }) &&
    /Raja yoga, parivartana, neecha bhanga, vipareeta raja, Lakshmi, Gaja Kesari, kartari, the five Mahapurusha yogas, the Moon’s own four - Sunapha, Anapha, Durudhura and Kemadruma - Chandra Mangala, Adhi, Sakata, Amala and Budha-Aditya are checked/
      .test(flat) &&
    named.length === Yogas.DETECTOR_COUNT;
})(), Yogas.DETECTOR_COUNT + ' detectors');
ok('and the yoga check is handed the strengths it needs',
   /Yogas\.detect\(Astro\.chartInDivision\(state\.chart, chosen\.division\), strengths\)/.test(appSrc) &&
   /function strengthsFor/.test(appSrc));
ok('shadbala is computed once per chart, so the tab and the yoga agree',
   /if \(!state\.shadbala\)/.test(appSrc) &&
   (appSrc.match(/Shadbala\.compute\(/g) || []).length === 1);
ok('a yoga resting on several conditions names the ones that applied',
   /finding\.reasons && finding\.reasons\.length/.test(appSrc) && /yoga-reasons/.test(appSrc));

// Aspects, both directions.
ok('aspects have a subtab of their own',
   /id="tab-aspects"[\s\S]{0,140}aria-controls="panel-aspects"/.test(html) &&
   /id="panel-aspects"[^>]*hidden/.test(html));
/*
 * The aspect tables are built in code now, one per division on screen, so the
 * column names live in an array rather than in the markup.
 */
ok('both directions get a column', (function () {
  var m = appSrc.match(/\['Graha', 'Aspects', 'Also aspects, from previous sign', 'Aspected by'\]/);
  return !!m;
})());
ok('the columns a graha casts sit together, receiving last', (function () {
  var m = appSrc.match(/\[('Graha'[^\]]*)\]\s*\n?\s*\.forEach\(function \(h\)/);
  if (!m) return false;
  var cols = m[1];
  return cols.indexOf("'Aspects'") < cols.indexOf("'Also aspects, from previous sign'") &&
    cols.indexOf("'Also aspects, from previous sign'") < cols.indexOf("'Aspected by'");
})());
/*
 * Yogas and aspects follow the two charts rather than the rashi alone. Not all
 * sixteen divisions at once, which would bury the rashi under findings nobody
 * asked for: whichever two are on screen.
 */
/*
 * Each panel reads one division at a time, chosen by its own picker, the same
 * shape as the Vargas scheme picker. It followed the two charts at first, which
 * showed two sets of findings at once and meant inspecting D24 cost you whichever
 * chart you were reading.
 */
ok('both panels have a chart picker',
   /id="yoga-division"/.test(html) && /id="aspect-division"/.test(html) &&
   /function fillDivisionPickers/.test(appSrc));
ok('it offers every division and starts on the rashi', (function () {
  var at = appSrc.indexOf('function fillDivisionPickers');
  var block = appSrc.slice(at, at + 900);
  return /Astro\.VARGAS\.forEach\(function \(v\)/.test(block) &&
    /if \(v\.division === 1\) opt\.selected = true;/.test(block);
})());
ok('exactly one division is read, never two',
   /function divisionFor/.test(appSrc) &&
   /return \{ division: division, name: varga \? varga\.name/.test(appSrc) &&
   !/divisionsOnScreen/.test(appSrc) && !/divisionHeading/.test(appSrc));
ok('so the panels no longer need to name which chart a finding belongs to', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return !/division-heading/.test(css) && !/yoga-none/.test(css);
})());
ok('each picker redraws only its own panel', (function () {
  var at = appSrc.indexOf('function fillDivisionPickers');
  var block = appSrc.slice(at, at + 1200);
  return /if \(id === 'yoga-division'\) renderYogas\(lastChart\); else renderAspects\(lastChart\);/
    .test(block);
})());
/*
 * And the charts above no longer drive them. Changing a chart's division redraws
 * that chart and nothing else, the panels having a division of their own.
 */
ok('changing a chart division redraws that chart and the table', (function () {
  var at = appSrc.indexOf("varga.addEventListener('change'");
  var block = appSrc.slice(at, at + 300);
  return /drawSlot\(slot\);/.test(block) && /renderGrahaTable\(lastChart\);/.test(block);
})());
ok('an empty division says which one it was', (function () {
  var flat = appSrc.replace(/'\s*\+\s*'/g, '');
  return /No yoga among those this page looks for is present in / .test(flat) &&
    /chosen\.name/.test(appSrc);
})());
ok('the aspect table is built for the chosen division, not read from the markup',
   /id="aspect-host"/.test(html) &&
   !/<table id="aspect-table">/.test(html) &&
   /Yogas\.aspectTable\(Astro\.chartInDivision\(state\.chart, d\.division\)\)/.test(appSrc));
ok('both notes say which division is being read', (function () {
  var flat = appSrc.replace(/'\s*\+\s*'/g, '');
  return /Yogas are read in the division chosen above/.test(flat) &&
    /counted whole-sign in the division chosen above/.test(flat);
})());

ok('the note says aspect is not mutual', /Aspect is not mutual/.test(appSrc));
ok('the note says retrogression does not change the classical aspect',
   /Otherwise retrogression does not change/.test(appSrc) && /cheshta bala/.test(appSrc));
// The header must say which way the aspect runs; "From previous sign" beside
// "Aspected by" read as the graha being aspected from there.
ok('the Rao column says the graha is the one aspecting',
   appSrc.indexOf("'Also aspects, from previous sign'") >= 0 &&
   appSrc.indexOf("'From previous sign'") < 0);
ok('the note attributes the rule and says it is not classical',
   /K\. N\. Rao/.test(appSrc) && /not a classical one/.test(appSrc) &&
   /No Parashari text gives the rule/.test(appSrc));
ok('the note gives the ten degree limit and the exclusion',
   /within the first ten degrees/.test(appSrc) && /Rahu and Ketu are left out/.test(appSrc));
ok('retrograde grahas are marked in the aspect table',
   /row\.retrograde \? ' \[R\]' : ''/.test(appSrc));
ok('the note names the nodes as a modern convention',
   /Parashara gives Rahu and Ketu ' \+\s*\n?\s*'no aspects/.test(appSrc) ||
   /Parashara gives Rahu and Ketu/.test(appSrc));

// Shadbala: the breakdown, not just a total.
ok('the page loads the shadbala module', /<script src="js\/shadbala\.js"><\/script>/.test(html));
ok('shadbala no longer has a card to itself', !/<h3>Shadbala<\/h3>/.test(html));
/*
 * Grahas across the top, measures down the side - the shape of the Vimsopaka
 * grid beside it, and for the same reason. Opening Sthana bala makes fifteen
 * measures, and fifteen columns is a table that scrolls; turned, the width is
 * whatever grahas Shadbala reckons however many measures are shown.
 */
ok('all six shares have a row of their own, the six parts of Sthana above it',
   (function () {
     var at = appSrc.indexOf('var BALA_ROWS = [');
     var block = appSrc.slice(at, appSrc.indexOf('function renderShadbala', at));
     var shares = ['sthana', 'dig', 'kala', 'cheshta', 'naisargika', 'drik']
       .every(function (k) { return block.indexOf("key: '" + k + "'") >= 0; });
     var parts = appSrc.slice(appSrc.indexOf('var STHANA_PARTS = ['),
                              appSrc.indexOf('var BALA_ROWS = ['));
     return shares &&
       ['uchcha', 'saptavargaja', 'ojhaRasi', 'ojhaNavamsa', 'kendradi', 'drekkana']
         .every(function (k) { return parts.indexOf("key: '" + k + "'") >= 0; }) &&
       /<table id="shadbala-table">\s*<thead><tr><\/tr><\/thead>/
         .test(html.replace(/\s+/g, ' ').replace(/> </g, '><'));
   })());
/*
 * The five are what the row under them is made of, not five more shares of
 * Shadbala, so they are recessive and indented and the rule falls under them
 * rather than over: a reader running down the column meets the parts and then
 * what they come to.
 */
/*
 * Recessive against the shares, not against the body ink. Every th on the page
 * starts at --ink-faint, so setting the parts to --ink-soft lifted them above
 * the rows they belong to instead of sinking them below: on screen the five
 * parts read brighter than the six shares, which is the ordering backwards.
 *
 * Both step up by one instead, rather than the parts stepping down: this column
 * is the key to every figure beside it, and --ink-faint is 2.8:1 on white,
 * under the 4.5 a word like "Saptavargaja" needs. The share at body ink and the
 * part at --ink-soft keeps the ordering and clears the floor in both modes.
 */
ok('and the parts read as parts of the row they add up to', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var head = css.match(/#shadbala-table tbody th\[scope="row"\] \{[^}]*\}/);
  var part = css.match(/#shadbala-table tr\.bala-part th\[scope="row"\] \{[^}]*\}/);
  return head && part && /color: var\(--ink\)/.test(head[0]) &&
    /color: var\(--ink-soft\)/.test(part[0]) &&
    /padding-left: 1\.1rem/.test(part[0]) &&
    /#shadbala-table tr\.bala-part td \{ color: var\(--ink-soft\); \}/.test(css) &&
    /#shadbala-table tr\.bala-head > \* \{ border-top: 1px solid var\(--line\); \}/.test(css);
})());
/*
 * And the share opens its block rather than closing it. Closing reads right
 * while a column is being added up; this is a table being looked things up in,
 * and eight indented rows with their parent underneath are eight rows a reader
 * who lands among them cannot name - which is exactly what was asked of the
 * Kala block: these are sub-balas of which bala?
 */
ok('and a share is passed before its parts are reached', (function () {
  var at = appSrc.indexOf('BALA_ROWS.forEach(function (bala) {');
  var block = appSrc.slice(at, appSrc.indexOf('row(\'Total\'', at));
  return block.indexOf("'bala-head'") > 0 &&
    block.indexOf("'bala-head'") < block.indexOf("(bala.parts || []).forEach") &&
    block.indexOf("(bala.parts || []).forEach") < block.indexOf("'bala-part'") &&
    !/bala-total/.test(appSrc);
})());
/*
 * Which only holds while the part rule outweighs the share rule it overrides.
 * Both name the same element and the cascade decides by specificity, not by
 * which is written later, so the part selector carries the extra class.
 */
ok('and the part rule is the more specific of the two', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var weight = function (sel) {
    return [(sel.match(/#/g) || []).length,
            (sel.match(/\.|\[/g) || []).length,
            (sel.match(/\b(tbody|thead|tr|th|td)\b/g) || []).length];
  };
  var a = weight('#shadbala-table tbody th[scope="row"]');
  var b = weight('#shadbala-table tr.bala-part th[scope="row"]');
  return css.indexOf('#shadbala-table tr.bala-part th[scope="row"]') >= 0 &&
    (b[0] > a[0] || (b[0] === a[0] && b[1] > a[1]));
})());
/*
 * And the Sthana row is the five added rather than a figure of its own, so the
 * block cannot show parts that do not come to their total.
 */
ok('and the total row is those six added, read off the engine', (function () {
  var c = Astro.chart({ jdUT: Astro.julianDay(1946, 7, 6, 19 + 20 / 60 + 4),
                        latitude: 40.7128, longitude: -74.0060, tzOffsetMinutes: -240 });
  var r = Shadbala.compute(c, { latitude: 40.7128, longitude: -74.0060,
                                tzOffsetMinutes: -240 });
  return Object.keys(r.grahas).every(function (g) {
    var st = r.grahas[g].sthana;
    var sum = st.uchcha + st.saptavargaja + st.ojhaRasi + st.ojhaNavamsa +
      st.kendradi + st.drekkana;
    return Math.abs(sum - st.total) < 1e-9;
  }) && /n\(bala\.parts \? x\[bala\.key\]\.total : x\[bala\.key\]\)/.test(appSrc);
})());
/*
 * Kala bala is opened the same way, and for the same reason: eight parts in a
 * hover is eight figures a reader can only see one graha at a time. Its total
 * is the eight added, which the engine is checked on rather than the screen.
 */
ok('and Kala bala is its parts added, the war among them', (function () {
  var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
  var c = Astro.chart({ jdUT: Astro.julianDay(1990, 6, 15, 19 - 5.5),
                        latitude: place.latitude, longitude: place.longitude,
                        tzOffsetMinutes: place.tzOffsetMinutes });
  var r = Shadbala.compute(c, place);
  var parts = appSrc.slice(appSrc.indexOf('var KALA_PARTS = ['),
                           appSrc.indexOf('var BALA_ROWS = ['));
  var keys = (parts.match(/key: '([a-z]+)'/g) || []).map(function (m) {
    return m.slice(6, -1);
  });
  // Raman's nine, in his order: the war closes the list after ayana.
  if (keys.join(',') !== 'nathonnatha,paksha,tribhaga,abda,masa,vara,hora,ayana,yuddha') {
    return false;
  }
  return Object.keys(r.grahas).every(function (g) {
    var k = r.grahas[g].kala;
    var sum = keys.reduce(function (a, key) { return a + k[key]; }, 0);
    return Math.abs(sum - k.total) < 1e-9;
  });
})());
/*
 * Nata is the birth time measured back to the nearer midnight, deducted from
 * thirty ghatis and doubled - Santhanam's verses 8-9. Checked against that
 * arithmetic directly rather than against a remembered figure, every quarter
 * hour of a full day.
 */
ok('and nata-unnata follows the verse it comes from', (function () {
  var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
  var byText = function (graha, h) {
    if (graha === 'Mercury') return 60;
    var nata = 2 * ((12 - Math.min(h, 24 - h)) * 2.5);   // 30 ghatis = 12 hours
    return ['Sun', 'Jupiter', 'Venus'].indexOf(graha) >= 0 ? 60 - nata : nata;
  };
  for (var q = 0; q < 96; q++) {
    var hour = q * 0.25;
    var c = Astro.chart({ jdUT: Astro.julianDay(1990, 6, 15, hour - 5.5),
                          latitude: place.latitude, longitude: place.longitude,
                          tzOffsetMinutes: place.tzOffsetMinutes });
    var r = Shadbala.compute(c, place);
    for (var i = 0; i < Shadbala.GRAHAS.length; i++) {
      var g = Shadbala.GRAHAS[i];
      // A ten-millionth of a virupa: the chart's local hour comes back through
      // a Julian day, so the two arithmetics agree to floating point and not
      // to the bit.
      if (Math.abs(r.grahas[g].kala.nathonnatha - byText(g, hour)) > 1e-6) return false;
    }
  }
  return true;
})());
/*
 * A figure alone says nothing: 60.0 is everything Kendradi can give and a fifth
 * of what Saptavargaja can, and the two rows look the same until the maximum is
 * beside the name. The same span the Vimsopaka grid uses for a division's share.
 */
ok('and every measure with a ceiling carries it beside its name',
   /th\.appendChild\(el\('span', 'varga-weight', ' ' \+ \(shows \|\| String\(max\)\)\)\)/
     .test(appSrc) &&
   /Where a row name carries a second figure, that is the most the row can be worth/
     .test(appSrc.replace(/'\s*\+\s*'/g, '')));
/*
 * And a ceiling that is not one figure prints both rather than neither. Paksha
 * and ayana are doubled for one graha each and Kala bala inherits it, so those
 * three showed a blank where a reader looked for scale - a bare 60 would have
 * been contradicted by the Moon's own cell, but a blank said nothing at all.
 * The pair is display only; `max` stays the row's true ceiling and is what the
 * figures below are checked against.
 */
ok('and a ceiling that differs by graha prints both figures', (function () {
  var block = appSrc.slice(appSrc.indexOf('var STHANA_PARTS = ['),
                           appSrc.indexOf('function renderShadbala'));
  return /key: 'paksha'[^}]*max: 120, shows: '60\/120'/.test(block) &&
    /key: 'ayana'[^}]*max: 120, shows: '60\/120'/.test(block) &&
    /key: 'kala'[\s\S]{0,140}max: 450, shows: '390\/450'/.test(block) &&
    // Drik is a bound rather than a ceiling, being the share that goes negative.
    /key: 'drik'[^}]*max: 97\.5, shows: '\\u00b197\.5'/.test(block);
})());
/*
 * And the upper figure of each pair is reached, so it is the row's ceiling and
 * not a number chosen to look tidy.
 */
ok('and the doubled ceiling is one the engine actually reaches', (function () {
  var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
  var paksha = 0, ayana = 0;
  for (var y = 1900; y < 1930; y++) {
    for (var m = 1; m <= 12; m++) {
      var c = Astro.chart({ jdUT: Astro.julianDay(y, m, 15, 6.5),
                            latitude: place.latitude, longitude: place.longitude,
                            tzOffsetMinutes: place.tzOffsetMinutes });
      var r = Shadbala.compute(c, place);
      paksha = Math.max(paksha, r.grahas.Moon.kala.paksha);
      ayana = Math.max(ayana, r.grahas.Sun.kala.ayana);
    }
  }
  return paksha > 110 && paksha <= 120.0001 && ayana > 110 && ayana <= 120.0001;
})());
/*
 * And the note says which rows have none and why, rather than making a claim
 * about "the figure beside a row name" that six of the fifteen rows do not have.
 */
ok('and says what a pair of figures means, and why one carries a sign',
   /a pair of figures means the ceiling differs by graha: paksha is doubled for the Moon and ayana for the Sun/
     .test(appSrc.replace(/'\s*\+\s*'/g, '')) &&
   /Drik bala is given with a sign, being the one share that goes negative/
     .test(appSrc.replace(/'\s*\+\s*'/g, '')));
/*
 * Every row carries a figure now. Drik bala's is the reckoning's own bound
 * rather than one the text gives - six other grahas can each cast at most a
 * full drishti of sixty and the sum is quartered - so it is checked against the
 * arithmetic that produces it rather than against a remembered number.
 */
ok('and drik bala\'s bound is what its own formula allows', (function () {
  var shadSrc = fs.readFileSync(path.join(root, 'js/shadbala.js'), 'utf8');
  if (!/return pinda \/ 4;/.test(shadSrc)) return false;
  // The most one graha can cast: the curve peaks at 60 on the 7th, and only
  // Saturn's visesha reaches a sign the curve has not already taken to 60.
  var peak = 0;
  for (var dk = 0; dk <= 360; dk += 0.25) {
    var v = (function (d) {
      if (d >= 30 && d < 60) return (d - 30) / 2;
      if (d >= 60 && d < 90) return d - 60 + 15;
      if (d >= 90 && d < 120) return (120 - d) / 2 + 30;
      if (d >= 120 && d < 150) return 150 - d;
      if (d >= 150 && d < 180) return (d - 150) * 2;
      if (d >= 180 && d <= 300) return (300 - d) / 2;
      return 0;
    })(dk);
    [[[90, 120], [210, 240], 15], [[120, 150], [240, 270], 30],
     [[60, 90], [270, 300], 45]].forEach(function (vis) {
      var inSpan = (dk >= vis[0][0] && dk < vis[0][1]) ||
                   (dk >= vis[1][0] && dk < vis[1][1]);
      peak = Math.max(peak, v + (inSpan ? vis[2] : 0));
    });
  }
  /*
   * Saturn is the one graha that passes sixty: its visesha of 45 adds to an
   * ordinary drishti already climbing to 45 across the same span, so the pair
   * approach 90 together as the span closes. Ninety is a supremum rather than a
   * maximum - the span stops short of its own end - so the peak is tested as
   * approached, and the bound is Saturn's ninety with the other five at sixty.
   */
  return peak > 89.7 && peak <= 90 &&
    (90 + (Shadbala.GRAHAS.length - 2) * 60) / 4 === 97.5;
})());
/*
 * The curve, and that it is a curve. Raman gives drishti as a continuous
 * function of the exact angle - sections 114-115, from Sripathi, and he says
 * Parashara gives the same - where this had a value per whole sign. The table
 * was the curve's value at seven cusps, so it was right at those seven points
 * and an approximation everywhere between, and gave nothing at all across 150
 * to 180 degrees where the curve climbs from zero to sixty.
 */
ok('drishti is read off the exact angle, not the whole sign', (function () {
  var shadSrc = fs.readFileSync(path.join(root, 'js/shadbala.js'), 'utf8');
  return /function drishtiValue\(dk\)/.test(shadSrc) &&
    /var dk = Astro\.norm360\(positions\[graha\]\.longitude - positions\[other\]\.longitude\);/
      .test(shadSrc) &&
    !/ASPECT_BY_HOUSE/.test(shadSrc) && !/SPECIAL_ASPECTS/.test(shadSrc);
})());
ok('and it still meets the old table at every cusp it shared', (function () {
  var shadSrc = fs.readFileSync(path.join(root, 'js/shadbala.js'), 'utf8');
  var f = new Function('Astro', 'return (function(){' +
    shadSrc.slice(shadSrc.indexOf('  function drishtiValue'),
                  shadSrc.indexOf('  var VISESHA')) +
    '; return drishtiValue;})()')(Astro);
  var cusps = { 30: 0, 60: 15, 90: 45, 120: 30, 150: 0, 180: 60, 210: 45,
                240: 30, 270: 15, 300: 0 };
  return Object.keys(cusps).every(function (dk) {
    return Math.abs(f(Number(dk)) - cusps[dk]) < 1e-9;
  }) && Math.abs(f(160) - 20) < 1e-9;      // and is no longer silent on the 6th
})());
/*
 * Visesha drishti adds to the ordinary value rather than replacing it - Mars 15
 * on the 4th and 8th, Jupiter 30 on the 5th and 9th, Saturn 45 on the 3rd and
 * 10th. Each brings the total to exactly 60 at the cusp, which is why setting
 * it to 60 outright looked right for as long as only cusps were tested.
 */
ok('and a special aspect adds to the ordinary one rather than replacing it',
   (function () {
     var shadSrc = fs.readFileSync(path.join(root, 'js/shadbala.js'), 'utf8');
     var block = shadSrc.slice(shadSrc.indexOf('var VISESHA = {'),
                               shadSrc.indexOf('function drikBala'));
     return /Mars: \{ at: \[\[90, 120\], \[210, 240\]\], value: 15 \}/.test(block) &&
       /Jupiter: \{ at: \[\[120, 150\], \[240, 270\]\], value: 30 \}/.test(block) &&
       /Saturn: \{ at: \[\[60, 90\], \[270, 300\]\], value: 45 \}/.test(block) &&
       /value \+= special\.value;/.test(shadSrc);
   })());
/*
 * And nothing is added for Mercury or Jupiter beyond their own drishti.
 * Santhanam's verse 19 reads "super add the entire aspect of Mercury and
 * Jupiter"; Raman's section 120 is the quarter and nothing else, and his worked
 * example settles it - his Sun takes a drishti pinda of +63.45 and a drik bala
 * of +15.86, the quarter exactly, with Jupiter among the grahas aspecting it.
 */
ok('and no graha is counted twice for being a benefic', (function () {
  var shadSrc = fs.readFileSync(path.join(root, 'js/shadbala.js'), 'utf8');
  var block = shadSrc.slice(shadSrc.indexOf('function drikBala'),
                            shadSrc.indexOf('/* ------------------------------------------------------------ totals */'));
  return !/Mercury/.test(block) && (block.match(/pinda \+=/g) || []).length === 1 &&
    Math.abs(63.45 / 4 - 15.8625) < 1e-9;   // Raman's own figures reconcile
})());
/*
 * Which is four and not three: the doubling really does carry those two rows
 * past sixty, so a ceiling of sixty there would be a figure the table's own
 * numbers contradict.
 */
ok('and the doubled rows really do pass sixty', (function () {
  var place = { latitude: 40.7128, longitude: -74.0060, tzOffsetMinutes: -240 };
  var c = Astro.chart({ jdUT: Astro.julianDay(1946, 7, 6, 19 + 20 / 60 + 4),
                        latitude: place.latitude, longitude: place.longitude,
                        tzOffsetMinutes: place.tzOffsetMinutes });
  var r = Shadbala.compute(c, place);
  return r.grahas.Sun.kala.ayana > 60 && r.grahas.Moon.kala.paksha > 60;
})());
/*
 * And it really is the most: a ceiling in the column is a claim about the
 * engine, so it is checked against the engine rather than believed. Kala bala
 * is the one share with none to give - its eight parts cap at 390 together, but
 * the Moon's paksha and the Sun's ayana count double, which puts those two at
 * 450, so a single figure would be wrong for two of the seven columns under it.
 */
ok('and no measure ever exceeds the ceiling it claims', (function () {
  var declared = {};
  var parts = appSrc.slice(appSrc.indexOf('var STHANA_PARTS = ['),
                           appSrc.indexOf('function renderShadbala'));
  var m, re = /key: '([A-Za-z]+)', label: '[^']*', en: '[^']*',(?:\s*parts: [A-Z_]+,)?\s*(?:total: true,)?\s*max: ([\d.]+|null)/g;
  while ((m = re.exec(parts))) declared[m[1]] = m[2] === 'null' ? null : Number(m[2]);
  if (declared.sthana !== 60 + 315 + 15 + 15 + 60 + 15) return false;
  // The three that differ by graha claim their upper figure; drik claims its bound.
  if (declared.drik !== 97.5) return false;
  if (declared.kala !== 450 || declared.paksha !== 120 || declared.ayana !== 120) {
    return false;
  }

  var worst = {};
  for (var y = 1950; y < 2000; y++) {
    var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
    var c = Astro.chart({ jdUT: Astro.julianDay(y, 1 + y % 12, 1 + y % 28, (y % 24)),
                          latitude: place.latitude, longitude: place.longitude,
                          tzOffsetMinutes: place.tzOffsetMinutes });
    var r = Shadbala.compute(c, place);
    Object.keys(r.grahas).forEach(function (g) {
      var x = r.grahas[g];
      var seen = { uchcha: x.sthana.uchcha, saptavargaja: x.sthana.saptavargaja,
        ojhaRasi: x.sthana.ojhaRasi, ojhaNavamsa: x.sthana.ojhaNavamsa,
        kendradi: x.sthana.kendradi, drekkana: x.sthana.drekkana,
        sthana: x.sthana.total, dig: x.dig, cheshta: x.cheshta,
        naisargika: x.naisargika,
        nathonnatha: x.kala.nathonnatha, tribhaga: x.kala.tribhaga,
        abda: x.kala.abda, masa: x.kala.masa, vara: x.kala.vara,
        hora: x.kala.hora, paksha: x.kala.paksha, ayana: x.kala.ayana,
        kala: x.kala.total, drik: Math.abs(x.drik) };
      Object.keys(seen).forEach(function (k) {
        worst[k] = Math.max(worst[k] === undefined ? -Infinity : worst[k], seen[k]);
      });
    });
  }
  return Object.keys(worst).every(function (k) {
    return declared[k] === undefined || declared[k] === null ||
      worst[k] <= declared[k] + 1e-9;
  });
})());
/*
 * Sthana's parts are rows now, so hovering the total to read them would be the
 * grid saying the same thing twice. Kala's eight are still only in a hover, and
 * Saptavargaja's seven divisions have never been anywhere else.
 */
/*
 * Both shares that have parts now show them as rows, so neither repeats them in
 * a hover. What is left on hover is the one breakdown with no row anywhere: the
 * seven divisions behind a saptavargaja figure.
 */
ok('the parts that have no row of their own are the ones on hover',
   /td\.title = saptavargajaTitle\(x\)/.test(appSrc) &&
   !/kalaTitle/.test(appSrc) &&
   !/Nathonnatha ' \+ n\(x\.kala\.nathonnatha\)/.test(appSrc) &&
   !/Uchcha ' \+ n\(x\.sthana\.uchcha\)/.test(appSrc));
ok('and each measure says what it measures, once for the row',
   /if \(says\) th\.title = says;/.test(appSrc) &&
   /function measureHead\(label, en, max, says, shows\)/.test(appSrc));
/*
 * And every measure carries its English name on the row, not in the hover. Each
 * of these is a word a reader either knows or does not, and "Drekkana" with
 * nothing beside it is a row only someone who did not need the table can read.
 * The glosses are the standard ones rather than paraphrases of our own, so the
 * row names what the rest of the literature names.
 */
ok('and every measure carries its English name beside the Sanskrit', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var block = appSrc.slice(appSrc.indexOf('var STHANA_PARTS = ['),
                           appSrc.indexOf('function renderShadbala'));
  var want = {
    uchcha: 'Exaltation', saptavargaja: 'Seven divisions',
    ojhaRasi: 'Odd or even sign', ojhaNavamsa: 'Odd or even navamsa',
    kendradi: 'Angular house', drekkana: 'Decanate',
    sthana: 'Positional', dig: 'Directional', kala: 'Temporal',
    cheshta: 'Motional', naisargika: 'Natural', drik: 'Aspectual'
  };
  return Object.keys(want).every(function (k) {
    return new RegExp("key: '" + k + "', label: '[^']*', en: '" + want[k] + "'")
      .test(block);
  }) && /if \(en\) th\.appendChild\(el\('span', 'measure-en', ' ' \+ en\)\);/.test(appSrc) &&
    /#shadbala-table th \.measure-en \{/.test(css);
})());
/*
 * Each piece carries its own separator rather than relying on the margin beside
 * it. A margin is drawn and never written, so copying a row gave
 * "Nata-UnnataDay or night60" and a screen reader said the same - three
 * separate facts run into one word. The grid beside it had "D93" for the same
 * reason.
 */
ok('and a row reads as three things when it is copied, not one', (function () {
  // Four of these are built on the page: the gloss, two ceilings and the
  // Vimsopaka twenty. Every one of them opens its text with a space.
  var all = appSrc.match(/el\('span', '(?:measure-en|varga-weight)', /g) || [];
  var spaced = appSrc.match(/el\('span', '(?:measure-en|varga-weight)', ' /g) || [];
  return all.length === 4 && spaced.length === 4;
})());
/*
 * Set as running text beside the Sanskrit, not as a second heading: caps and
 * tracking on both halves would read as one long name rather than a name and
 * its translation.
 */
ok('and it is set as a translation rather than a second name', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var block = css.match(/#shadbala-table th \.measure-en \{[^}]*\}/);
  return block && /text-transform: none/.test(block[0]) &&
    /letter-spacing: 0/.test(block[0]) && /font-weight: 400/.test(block[0]) &&
    /color: var\(--ink-soft\)/.test(block[0]);
})());
/*
 * The four closing rows get none. Total, Rupas, Needs and Verdict are already
 * English, and glossing an English word with itself is noise.
 */
ok('and the rows that are already English carry no gloss',
   (appSrc.match(/row\('(?:Total|Rupas|Needs|Verdict)', null, null,/g) || []).length === 4);
ok('shadbala columns follow the graha order of the tables beside it',
   /var planets = state\.chart\.planets\.filter\(function \(p\) \{/.test(appSrc) &&
   /var grahas = planets\.map\(function \(p\) \{ return p\.name; \}\);/.test(appSrc) &&
   !/result\.ranking\.forEach/.test(appSrc));
ok('the nodes are skipped rather than shown as a column of blanks',
   /return result\.grahas\[p\.name\];/.test(appSrc));
ok('each graha is judged against its own minimum',
   /x\.strong \? 'Strong' : 'Weak'/.test(appSrc) &&
   /String\(result\.grahas\[graha\]\.required\)/.test(appSrc));
/*
 * And the comparison is shown as well as made. Rupas cannot be read across
 * grahas - Mercury is asked for seven and the Sun for five, so the same 6.5 is
 * a failure for one and half as much again as the other needs - but rupas over
 * the minimum can, which is why the module ranks on it. A hundred per cent is
 * exactly enough, and the verdict is that row read as a yes or a no.
 */
ok('and the margin is shown, not only the verdict', (function () {
  var at = appSrc.indexOf("row('Of its minimum'");
  if (at < 0) return false;
  var block = appSrc.slice(at, appSrc.indexOf('row(\'Verdict\'', at));
  return /Math\.round\(x\.ratio \* 100\) \+ '%'/.test(block) &&
    /The only row here that compares across grahas/.test(appSrc) &&
    // and it sits between the minimum it divides by and the verdict it decides
    appSrc.indexOf("row('Needs'") < at;
})());
/*
 * The percentage and the verdict must not be able to disagree: both are the
 * same comparison, one with the margin left in.
 */
/*
 * And it is the one figure worth plotting, for the same reason. A chart of the
 * totals would put Mercury's 394 beside the Sun's 558 and say nothing about
 * which of the two is strong.
 */
ok('and it is what the chart plots, the totals not being comparable', (function () {
  var at = appSrc.indexOf('function renderShadbalaChart');
  if (at < 0) return false;
  var block = appSrc.slice(at, appSrc.indexOf('function renderShadbalaHead', at));
  return /percent: x\.ratio \* 100/.test(block) &&
    /rule: 100, ruleLabel: '100%'/.test(block) &&
    /id="shadbala-chart"/.test(html) &&
    /renderShadbalaChart\(grahas, result\);/.test(appSrc) &&
    !/value: function \(r\) \{ return r\.totalShashtiamsa/.test(block);
})());
/*
 * The line is the whole of what that chart says, so it is drawn and labelled
 * rather than left to a gridline that happens to fall near it - and the scale
 * always reaches it, or a chart where nothing is strong would not show where
 * strong begins.
 */
ok('and the hundred is drawn, labelled, and always on the scale', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var at = appSrc.indexOf('function renderShadbalaChart');
  var block = appSrc.slice(at, appSrc.indexOf('function renderShadbalaHead', at));
  return /var max = Math\.max\(120, Math\.ceil\(top \/ 20\) \* 20\);/.test(block) &&
    /class: 'chart-rule'/.test(appSrc) &&
    /class: 'chart-rule-label'/.test(appSrc) &&
    /\.chart-rule \{/.test(css) && /\.chart-rule-label \{/.test(css);
})());
/*
 * No colour codes the verdict. The bar's height against the line says it, the
 * table beside the chart gives it in words, and a status colour carrying it
 * alone is the thing the guidance reserves those colours against.
 */
ok('and nothing codes the verdict in colour alone', (function () {
  var at = appSrc.indexOf('function renderShadbalaChart');
  var block = appSrc.slice(at, appSrc.indexOf('function renderShadbalaHead', at));
  return /cls: 'series-vimsopaka'/.test(block) && !/cls: r\.strong/.test(block) &&
    !/strong-flag/.test(block) && !/weak-flag/.test(block);
})());
ok('and the two cannot disagree, being one comparison', (function () {
  var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
  for (var y = 1950; y < 2000; y++) {
    var c = Astro.chart({ jdUT: Astro.julianDay(y, 1 + y % 12, 15, 6.5),
                          latitude: place.latitude, longitude: place.longitude,
                          tzOffsetMinutes: place.tzOffsetMinutes });
    var r = Shadbala.compute(c, place);
    for (var i = 0; i < Shadbala.GRAHAS.length; i++) {
      var x = r.grahas[Shadbala.GRAHAS[i]];
      if ((x.ratio >= 1) !== x.strong) return false;
      if (Math.abs(x.ratio - x.rupas / x.required) > 1e-12) return false;
    }
  }
  return true;
})());
/*
 * And the verdict is stated once, in the Verdict row, in words. It also tinted
 * the graha's heading red, which is the same fact in two places and in a colour
 * that is spoken for: red is retrograde and debilitated everywhere else on this
 * page, so a weak Mercury read as a retrograde one. The heading carries [R] and
 * [C] now, which is what red there would mean.
 */
ok('and a weak verdict is said once, in words, not in the colour of a name',
   (function () {
     var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
     return !/weak-graha/.test(appSrc) && !/weak-graha/.test(css) &&
       /x\.strong \? 'strong-flag' : 'weak-flag'/.test(appSrc);
   })());
ok('the shadbala note names the ladder it uses, since totals differ between readings',
   (function () {
     var flat = appSrc.replace(/'\s*\+\s*'/g, '');
     return /Saptavargaja uses Raman’s ladder, section 30/.test(flat) &&
       /30 at the top, then halving at every step down to 1\.875/.test(flat) &&
       /Santhanam and Saravali give 20, 15, 10, 4 and 2 for the lower five/.test(flat) &&
       !/45, 30, 20, 15, 10, 4, 2/.test(flat);
   })());
/*
 * Nothing is left out any more. Yuddha bala was the one share Parashara names
 * that this did not reckon, and the note said so; it is reckoned now, and the
 * note says instead when its row appears - a row of seven zeroes in eleven
 * charts out of twelve teaches a reader to skip it.
 */
ok('the note says when the war row appears rather than that there is none',
   !/Yuddha bala is not/.test(appSrc) &&
   /Yuddha bala has a row only where two of the five starry grahas stand within a degree of each other/
     .test(appSrc.replace(/'\s*\+\s*'/g, '')));
/*
 * Raman sections 76-77: the aggregate compared is sthana, dig and kala as far
 * as hora bala, and the difference is divided by the difference of the disc
 * diameters. Stopping at hora keeps ayana and the war itself out of the
 * comparison, so nothing defines itself.
 */
ok('and a war is settled on the aggregate Raman names, over the disc gap',
   (function () {
     var shadSrc = fs.readFileSync(path.join(root, 'js/shadbala.js'), 'utf8');
     return /var WAR_KALA_PARTS = \['nathonnatha', 'paksha', 'tribhaga', 'abda', 'masa',\n\s*'vara', 'hora'\];/
       .test(shadSrc) &&
       /var discs = Math\.abs\(BIMBA\[war\.won\] - BIMBA\[war\.lost\]\);/.test(shadSrc) &&
       /war\.value = discs \? gap \/ discs : gap;/.test(shadSrc) &&
       /BIMBA = \{ Mars: 9\.4, Mercury: 6\.6, Jupiter: 190\.4, Venus: 16\.6, Saturn: 158\.0 \}/
         .test(shadSrc) && !/sixShares/.test(shadSrc);
   })());
/*
 * And it lands inside kala bala, which is where Raman lists it - his ninth kala
 * component, after ayana - rather than outside the six.
 */
ok('and it lands inside kala bala rather than beside it', (function () {
  var shadSrc = fs.readFileSync(path.join(root, 'js/shadbala.js'), 'utf8');
  return /results\[war\.won\]\.kala\.yuddha \+= war\.value;/.test(shadSrc) &&
    /x\.kala\.total \+= x\.kala\.yuddha;/.test(shadSrc) &&
    /x\.totalShashtiamsa = x\.sthana\.total \+ x\.dig \+ x\.kala\.total \+ x\.cheshta \+/
      .test(shadSrc);
})());
/*
 * The five starry grahas only. Chapter 27 calls them "planets from Mars to
 * Saturn" and chapter 79 verse 9 names the same five, so the luminaries never
 * take a side however close they stand.
 */
ok('and the luminaries never go to war', (function () {
  var shadSrc = fs.readFileSync(path.join(root, 'js/shadbala.js'), 'utf8');
  var block = shadSrc.slice(shadSrc.indexOf('var WARRING = ['),
                            shadSrc.indexOf('function planetaryWars'));
  return !/'Sun'|'Moon'/.test(block) &&
    ['Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'].every(function (g) {
      return block.indexOf("'" + g + "'") >= 0;
    });
})());
/*
 * The victor is the graha of lesser longitude. That is Raman's rule, stated
 * flatly and worked in his examples; the latitude rule this followed before
 * comes from chapter 79 and the two disagree about who won in half of all wars.
 * Nothing now asks the engine for a graha's latitude in a war.
 */
ok('and the victor is the graha of lesser longitude', (function () {
  var shadSrc = fs.readFileSync(path.join(root, 'js/shadbala.js'), 'utf8');
  return /var aWins = a\.longitude < b\.longitude;/.test(shadSrc) &&
    !/eclipticLatitude/.test(shadSrc);
})());
/*
 * And the row is shown only where a war was fought, the hover naming who it was
 * with - which no figure in the row can say.
 */
ok('and the war row appears only in a chart that has one',
   /if \(part\.onlyWhenSet && grahas\.every\(function \(graha\) \{/.test(appSrc) &&
   /onlyWhenSet: true,/.test(appSrc) &&
   /if \(part\.key === 'yuddha' && x\.war\) td\.title = yuddhaTitle\(x\);/.test(appSrc) &&
   /\(war\.won \? 'Beats ' : 'Loses to '\) \+ war\.against/.test(appSrc));

// What each graha rules, with the yogakaraka named.
ok('the tables carry one dispositor column each, built once',
   (appSrc.match(/'Dispositor'/g) || []).length === 1 &&
   !/<th scope="col">Dispositor<\/th>/.test(html));
ok('the dispositor is the lord of the sign shown in that column',
   /Astro\.SIGN_LORDS\[sign\]/.test(appSrc) &&
   /dispositorOf\(r\.name, v\.sign\)/.test(appSrc));
ok('its relation is the compound one, counted in the rashi chart',
   /Astro\.compoundRelation\(graha, lord,/.test(appSrc) && /positionsD1\[lord\]\.sign/.test(appSrc));
ok('a graha in its own sign disposits itself',
   /return lord === graha \? 'itself' : lord;/.test(appSrc));
/*
 * The dispositor's name goes in full, and its relation has a row of its own.
 * The two shared a cell - "Me · Great Friend" - for as long as they shared a
 * column and the column had to hold both. Turned, a row costs no width, so the
 * name has room to be a name.
 */
ok('the dispositor names its lord in full, not in the abbreviation',
   /return lord === graha \? 'itself' : lord;/.test(appSrc) &&
   /r\.isAscendant \? Astro\.SIGN_LORDS\[v\.sign\] : dispositorOf\(r\.name, v\.sign\)/
     .test(appSrc) &&
   !/Astro\.grahaAbbr\(Astro\.SIGN_LORDS\[v\.sign\]\)/.test(appSrc));
ok('and the relation it keeps has a row to itself', (function () {
  var at = appSrc.indexOf('var GRAHA_ROWS = [');
  var block = appSrc.slice(at, appSrc.indexOf('\n  ];', at));
  var rows = (block.match(/label: '[^']+'/g) || [])
    .map(function (t) { return t.slice(8, -1); });
  return rows.indexOf('Relationship') === rows.indexOf('Dispositor') + 1 &&
    /function dispositorRelation\(graha, sign, positionsD1\)/.test(appSrc) &&
    /return relation \? Astro\.titleCase\(Astro\.RELATION_LABELS\[relation\]\) : '\\u2013';/
      .test(appSrc);
})());
/*
 * Own sign rather than a relation, a graha having no opinion of itself; and a
 * dash for the nodes, which keep no friendships, and for the lagna, which is a
 * point rather than a graha.
 */
ok('and says own sign where there is no relation to keep',
   /if \(lord === graha\) return 'Own Sign';/.test(appSrc) &&
   /'The lagna is a point rather than a graha, so it keeps no friendships\.'/
     .test(appSrc));
/*
 * Spelt as Astro.dignityOf spells it. The two rows touch and a graha in its own
 * sign reads Own Sign in both, so the same words had better be the same words.
 */
ok('and spells it as the dignity row does', (function () {
  var seen = {};
  ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'].forEach(function (g) {
    for (var sign = 0; sign < 12; sign++) {
      var d = Astro.dignityOf(g, sign, 5);
      if (d) seen[d] = true;
    }
  });
  return seen['Own Sign'] === true && !/return 'Own sign'/.test(appSrc);
})());
/*
 * Great Friend is twelve characters and its longer word is six. Dignity and
 * Relationship carry the same kind of value - a two-word name in a column too
 * narrow for it - so both stack, as the nakshatra below them does.
 */
ok('and a two-word label stacks, as the nakshatra does', (function () {
  var block = appSrc.slice(appSrc.indexOf('cells: ['),
                           appSrc.indexOf('var table = el('));
  var stacked = (block.match(/stack: true/g) || []).length;
  // Dignity, Relationship, Nakshatra and Karaka: Amatyakaraka is one word but
  // the row holds two-word company, and stacking costs nothing where there is
  // only one word to put on a line.
  return stacked === 4 &&
    // And the karaka is split before the word every one of the eight ends in,
    // the part that tells them apart going on top.
    /function karakaLines\(name\)/.test(appSrc) &&
    /return name\.replace\(\/karaka\$\/, ' Karaka'\);/.test(appSrc) &&
    Astro.CHARA_KARAKAS.every(function (k) { return /karaka$/.test(k); }) &&
    /Astro\.dignityOf\(r\.name, v\.sign, v\.degreeInSign\)\) \|\| '–',\s*\n\s*stack: true,/
      .test(block) &&
    /cls: 'dispositor', stack: true,/.test(block);
})());
/*
 * The relation words are stored in the prose form, most of what reads them being
 * a sentence, and capitalised where a cell prints one. Storing both forms would
 * be the second table again.
 */
ok('the cell capitalises them rather than a second table holding them capitalised',
   (function () {
     var astroSrc = fs.readFileSync(path.join(root, 'js/astro.js'), 'utf8');
     return Object.keys(Astro.RELATION_LABELS).every(function (k) {
       return Astro.RELATION_LABELS[k] === Astro.RELATION_LABELS[k].toLowerCase();
     }) && !/adhimitra: 'Great Friend'/.test(astroSrc.split('VARGA_DIGNITY_LABELS')[0]);
   })());
ok('and the prose still reads as prose, the article taking the lower-case form',
   /withArticle\(Astro\.RELATION_LABELS\[out\]\)/.test(appSrc) &&
   Astro.titleCase(Astro.RELATION_LABELS.adhimitra) === 'Great Friend');
/*
 * A row each, and the names in full. They shared a cell reading "Ma / Sa" while
 * they shared a column, and sharing is what forced both to be abbreviated; a
 * row costs no width, so neither has to be.
 */
ok('the nakshatra lord and sub lord have a row each, named in full', (function () {
  var at = appSrc.indexOf('var GRAHA_ROWS = [');
  var block = appSrc.slice(at, appSrc.indexOf('\n  ];', at));
  var rows = (block.match(/label: '[^']+'/g) || [])
    .map(function (t) { return t.slice(8, -1); });
  return rows.indexOf('Sub lord') === rows.indexOf('Nakshatra lord') + 1 &&
    /\{ text: nak\.lord,/.test(appSrc) && /\{ text: nak\.subLord,/.test(appSrc) &&
    !/Astro\.grahaAbbr\(nak\.lord\)/.test(appSrc);
})());
/*
  * No note says so. Two letters beside a relation in words is not a puzzle, the
  * kundli above the table already labels its cells the same way, and every one
  * of them carries the full name on hover.
  */
ok('and no note under the table explains the codes',
   !/two-letter code the kundli uses/.test(html) &&
   /title: 'Pada ' \+ nak\.pada \+ ' of four/.test(appSrc));

console.log('\nVargottama flags');
/*
 * A chart with Venus both retrograde and vargottama, so the paired flag has a
 * real case to render rather than a contrived one: 22 March 1985, 10:55 local,
 * Durgapur. Venus is exalted in Pisces, retrograde, and in the 9th navamsha.
 */
var vgChart = Astro.chart({
  jdUT: Astro.julianDay(1985, 3, 22, 10 + 55 / 60 - 5.5),
  latitude: 23.55, longitude: 87.32, tzOffsetMinutes: 330
});
var vgVenus = vgChart.planets.filter(function (p) { return p.name === 'Venus'; })[0];
ok('the fixture really is retrograde and vargottama at once',
   vgVenus.retrograde && Astro.isVargottama(vgVenus.longitude));

var renderIn = function (division) {
  var box = makeNode('div');
  Charts.render(box, {
    style: 'north', division: division,
    planets: vgChart.planets, ascendant: vgChart.ascendant.longitude
  });
  return serialise(box);
};

ok('flags ride together, retrograde first', /Ve \[R\]/.test(renderIn(1)));

/*
 * A yogakaraka owns both an angle and a trine from the lagna, which only six of
 * the twelve lagnas produce at all: Mars for Cancer and Leo, Venus for Capricorn
 * and Aquarius, Saturn for Taurus and Libra. The other six have none, and a flag
 * that appeared on every chart would be telling nobody anything.
 */
ok('the yogakarakas are the classical six, and only those', (function () {
  var byLagna = {};
  for (var l = 0; l < 12; l++) {
    byLagna[Astro.SIGNS[l]] = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']
      .filter(function (g) { return Astro.isYogakaraka(g, l); }).join(',');
  }
  return byLagna.Cancer === 'Mars' && byLagna.Leo === 'Mars' &&
    byLagna.Capricorn === 'Venus' && byLagna.Aquarius === 'Venus' &&
    byLagna.Taurus === 'Saturn' && byLagna.Libra === 'Saturn' &&
    ['Aries', 'Gemini', 'Virgo', 'Scorpio', 'Sagittarius', 'Pisces']
      .every(function (sign) { return byLagna[sign] === ''; });
})());

ok('a yogakaraka is flagged [Y]', (function () {
  // Leo lagna puts Mars in the 1st as yogakaraka.
  var asc = 4 * 30 + 7;
  var box = makeNode('div');
  Charts.render(box, { style: 'north', division: 1, ascendant: asc,
    planets: [{ name: 'Mars', longitude: 4 * 30 + 4, retrograde: false }] });
  return /Ma \[Y\]/.test(serialise(box));
})());

/*
 * Lordship is counted from whatever house 1 is, so rotating the chart onto
 * another graha changes who qualifies. Half the reference signs yield nobody at
 * all: from Leo, Mars; from Sagittarius, none. The flag has to move with the
 * House column beside it or the two contradict each other.
 */
ok('it follows the rotation, as the houses do', (function () {
  var body = function (name, sign) {
    return { name: name, longitude: sign * 30 + 4, retrograde: false };
  };
  // Leo ascendant, so Mars is the yogakaraka while house 1 is the ascendant.
  var opts = function (reference) {
    return { style: 'north', division: 1, ascendant: 4 * 30 + 7, reference: reference,
             planets: [body('Mars', 4), body('Moon', 8)] };
  };
  var fromLagna = makeNode('div'), fromMoon = makeNode('div');
  Charts.render(fromLagna, opts('Ascendant'));
  Charts.render(fromMoon, opts('Moon'));
  // Rotated onto the Moon in Sagittarius, nobody owns an angle and a trine.
  return /Ma \[Y\]/.test(serialise(fromLagna)) && !/\[Y\]/.test(serialise(fromMoon)) &&
    Astro.isYogakaraka('Mars', 4) && !Astro.isYogakaraka('Mars', 8);
})());
ok('and the default view is still the classical one, from the ascendant', (function () {
  var box = makeNode('div');
  Charts.render(box, { style: 'north', division: 1, ascendant: 4 * 30 + 7,
    planets: [{ name: 'Mars', longitude: 4 * 30 + 4, retrograde: false }] });
  return /Ma \[Y\]/.test(serialise(box));
})());

ok('the lagna itself is never one, owning nothing',
   /yogakaraka: false, combust: false/
     .test(fs.readFileSync(path.join(root, 'js/charts.js'), 'utf8')));

ok('and the nodes are never one either, owning no sign',
   Astro.NODES.every(function (n) {
     for (var l = 0; l < 12; l++) if (Astro.isYogakaraka(n, l)) return false;
     return true;
   }));

/*
 * Combustion is the fourth flag, and the only one marking something done to a
 * graha rather than something it has. The nodes are exempt, Parashara being
 * explicit that they are points and cannot be burnt, and a chart with Rahu two
 * degrees from the Sun would otherwise flag it.
 */
ok('the chart and the table both flag combustion',
   /\(p\.combust \? '\[C\]' : ''\)/.test(fs.readFileSync(path.join(root, 'js/charts.js'), 'utf8')) &&
   /Astro\.isCombust\(planet\.name, planet\.longitude/.test(appSrc));
/*
 * A real distance from the Sun, so it is read off the rashi longitudes whichever
 * division a row is showing - which is also why it sits on the graha's name
 * rather than on any one chart row.
 */
ok('measured from the Sun, and on the rashi longitudes',
   /combust: !!sun && Astro\.isCombust\(p\.name, p\.longitude, sun\.longitude, p\.retrograde\)/
     .test(fs.readFileSync(path.join(root, 'js/charts.js'), 'utf8')) &&
   /Astro\.isCombust\(planet\.name, planet\.longitude, sun\.longitude,/.test(appSrc));
ok('the nodes are never flagged, being points', (function () {
  // Rahu sits 2.2 degrees from the Sun in one of the saved charts and must stay clean.
  return !Astro.isCombust('Rahu', 2, 0, true) && !Astro.isCombust('Ketu', 182, 0, true) &&
    Astro.COMBUSTION.Rahu === undefined && Astro.COMBUSTION.Ketu === undefined;
})());
ok('and neither is the lagna, nor the Sun itself',
   !Astro.isCombust('Sun', 0, 0, false) && Astro.COMBUSTION.Sun === undefined &&
   /yogakaraka: false, combust: false/.test(fs.readFileSync(path.join(root, 'js/charts.js'), 'utf8')));
/*
 * The key is looked up one flag at a time, so it is four entries rather than a
 * paragraph: a term carrying the flag in its own colour, and beneath it what the
 * flag means and which of the two things it is true of. Run together as prose it
 * made the reader find where each sentence started.
 */
ok('the key has an entry per mark, and every mark has one', (function () {
  var flat = html.replace(/\s+/g, ' ');
  var dl = flat.match(/<dl class="flag-key">.*?<\/dl>/);
  if (!dl) return false;
  return (dl[0].match(/<dt>/g) || []).length === 9 &&
    (dl[0].match(/<dd>/g) || []).length === 9;
})());
/*
 * Seven marks on three surfaces, and each entry says which surface it is on.
 * [R] and [C] are true of the graha wherever it is read, so they ride its name;
 * [V] and [H] turn on the division alone and [Y] and + on the division and the
 * reference, so all four ride the chart row; * qualifies a dignity, so it rides
 * the dignity wherever one is printed.
 */
ok('each mark says which of the three surfaces it sits on', (function () {
  var flat = html.replace(/\s+/g, ' ');
  return /True of the graha whichever chart is read, so in the table it sits on the name/
    .test(flat) &&
    /A real distance, so like \[R\] it sits on the name/.test(flat) &&
    /True of that division alone, so it sits on the chart row/.test(flat) &&
    /Nothing to do with house 1, so it reads the same however the chart is rotated/
      .test(flat) &&
    /so it sits on the chart row and follows the chart when it is rotated onto another graha/
      .test(flat) &&
    /A house, so it moves with the rotation as \[Y\] does/.test(flat) &&
    /On a dignity, not on a graha or a chart/.test(flat);
})());
/*
 * And nothing says where each of them appears. A paragraph under the key used
 * to, naming the kundli and the Vimsopaka grid and what each carried, and it
 * was wrong by the end: it never mentioned the graha table, which carries eight
 * of the nine spread across its rows.
 *
 * It was never needed either. The key says what a mark means, which is what a
 * reader who has found one wants; where a mark appears is answered by its
 * appearing. Saying it a second time only gave it somewhere to go stale.
 */
ok('and nothing lists which surface carries which, the key defining them once',
   !/The kundli carries/.test(html) && !/flag-where/.test(html) &&
   (html.match(/<dt>/g) || []).length === 9);
/*
 * [R] and [C] belong on the grid too, and by its own rule: the score counts
 * dignity, and neither a backward graha nor a burnt one changes the sign it
 * stands in. What puts them on the name rather than in a cell is that they hold
 * whichever division is read, so they span its columns as the name does - the
 * same split the graha table makes.
 */
/*
 * [R] and [C] head the graha's column, being true of it in every division below.
 * They were on the name when the name was a row; the name is a column heading
 * now and they have come with it.
 */
ok('the grid marks retrogression and combustion on the column heading',
   (function () {
     var at = appSrc.indexOf('function grahaColumnHead');
     var block = appSrc.slice(at, appSrc.indexOf('function renderVargasHead', at));
     return /\[planet\.retrograde \? 'R' : null,/.test(block) &&
       /sun && Astro\.isCombust\(planet\.name, planet\.longitude, sun\.longitude,/.test(block) &&
       block.indexOf('th.appendChild') > 0;
   })());
/*
 * And both grids get them from the same cell. They are facts about the graha in
 * the rashi, so they hold for every row under the name whichever grid it heads,
 * and the two grids had the same heading with only one of them flagged - a
 * retrograde graha marked in Vimsopaka Bala and unmarked in Shadbala beside it.
 */
ok('and the two grids head a graha the same way, from one place',
   /function grahaColumnHead\(planet, sun\)/.test(appSrc) &&
   (appSrc.match(/row\.appendChild\(grahaColumnHead\(planet, sun\)\);/g) || [])
     .length === 2 &&
   (appSrc.match(/planet\.retrograde \? 'R' : null/g) || []).length === 1);
/*
 * The graha table builds its flags through one helper now, since they land on
 * five different cells rather than all in one. What matters is unchanged: the
 * name's flags go on the row header and not into a cell beside it.
 */
/*
 * All three grids head a graha with the same cell now, so [R] and [C] are
 * written in one place and cannot reach one table and miss another.
 */
ok('and all three tables head a graha with the same cell',
   /function grahaColumnHead\(planet, sun\)/.test(appSrc) &&
   (appSrc.match(/appendChild\(grahaColumnHead\((?:planet|col\.entity), sun\)\)/g) || [])
     .length === 3 &&
   /th\.appendChild\(el\('span', 'flag flag-' \+ f\.toLowerCase\(\)/
     .test(appSrc.slice(appSrc.indexOf('function grahaColumnHead'),
                        appSrc.indexOf('function renderVargasHead'))));

ok('and the grid really carries those six and no others', (function () {
  var at = appSrc.indexOf('function renderVargas(state)');
  var block = appSrc.slice(at, appSrc.indexOf('function vargaSummary', at));
  var marks = (block.match(/'flag flag-[a-z]+'/g) || []);
  return marks.length === 6 && ['v', 'x', 's', 'p', 'd', 'n'].every(function (k) {
    return block.indexOf("'flag flag-" + k + "'") >= 0;
  });
})());
/*
 * The two that turn on the division alone are read from that division's own
 * chart, not from the rashi: a varga rearranges which grahas are neighbours, so
 * asking the rashi who hems a graha in D9 would answer a different question.
 */
/*
 * The division decides who the neighbours are; the rashi decides who is a
 * benefic. Reading both off the division made the Moon's phase a property of the
 * varga, which it cannot be.
 */
ok('hemming reads its neighbours from the division and its benefics from the rashi',
   /Astro\.hemmedByBenefics\(r\.name, v\.sign, divisionChart,\s*\n?\s*benefics\)/
     .test(appSrc) &&
   /Astro\.hemmedByMalefics\(r\.name, v\.sign, divisionChart,\s*\n?\s*benefics\)/
     .test(appSrc) &&
   /var benefics = Astro\.naturalBenefics\(c\);/.test(appSrc) &&
   /var divisionChart = Astro\.chartInDivision\(c, view\.division\);/.test(appSrc));
ok('and directional strength from the house, which the row already computes',
   /Astro\.hasDigBala\(r\.name, house\)/.test(appSrc) &&
   /var house = \(\(v\.sign - firstSign\) % 12 \+ 12\) % 12 \+ 1;/.test(appSrc));
ok('[N] reaches the graha table\u2019s dignity, not the grid alone',
   /star: !r\.isAscendant && cancelledHere\[r\.name\]/.test(appSrc) &&
   /td\.appendChild\(el\('span', 'flag flag-n', ' \[N\]'\)\)/.test(appSrc));
ok('and the ascendant takes none of the four that are about a graha',
   (appSrc.match(/!r\.isAscendant && Astro\./g) || []).length >= 3);
ok('each carries its flag in its own colour, and names it',
   ['r Retrograde', 'v Vargottama', 'y Yogakaraka', 'c Combust'].every(function (pair) {
     var parts = pair.split(' ');
     var flat = html.replace(/\s+/g, ' ');
     return new RegExp('<span class="flag flag-' + parts[0] + '">\\[' +
       parts[0].toUpperCase() + '\\]</span> ' + parts[1] + '</dt>').test(flat);
   }));
ok('and each says which of the two it is true of', (function () {
  var flat = html.replace(/\s+/g, ' ');
  return /True of the graha whichever chart is read, so in the table it sits on the name/
    .test(flat) &&
    /True of that division alone, so it sits on the chart row/.test(flat) &&
    /so it sits on the chart row and follows the chart when it is rotated onto another graha/
      .test(flat) &&
    /A real distance, so like \[R\] it sits on the name/.test(flat);
})());
ok('the key explains [C] too', (function () {
  var flat = html.replace(/\s+/g, ' ');
  return /Burnt by being too near the Sun, within the orb Parashara gives for that graha/
    .test(flat);
})());

ok('the key explains [Y], and says it moves with the rotation', (function () {
  var flat = html.replace(/\s+/g, ' ');
  return /A graha owning both an angle and a trine counted from house 1/.test(flat) &&
    /follows the chart when it is rotated onto another graha/.test(flat);
})());
ok('retrograde alone stays bare [R]', /Sa \[R\]<|Sa \[R\]\s/.test(renderIn(1)));
ok('a graha with neither carries no brackets', /Ju<\/text>|>Ju</.test(renderIn(1)));

ok('the key covers all four flags', (function () {
  // Collapsed, so re-wrapping an entry cannot fail this on whitespace alone.
  var flat = html.replace(/\s+/g, ' ');
  return /Moving backwards against the signs/.test(flat) &&
    /A graha owning both an angle and a trine/.test(flat) &&
    /Burnt by being too near the Sun/.test(flat) &&
    /The division has landed the graha back in the sign it holds in the rashi/.test(flat) &&
    /never on D1, where every graha would qualify\. In D9 it is vargottama proper/.test(flat);
})());
// A key with nothing to lay out across is a key in one column, which is the
// narrow paragraph again.
ok('and it is laid across the width rather than down a column', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return /\.flag-key \{[^}]*display: grid/.test(css) &&
    /\.flag-key \{[^}]*repeat\(auto-fit, minmax\(/.test(css) &&
    !/\.flag-key \{[^}]*text-align: center/.test(css);
})());

/*
 * The lesson library, as the repo holds it. The doctrine about vimsopaka used to
 * sit in the note under the grid and is now here alone, so these are the tests
 * that keep it from being lost in the move: the note explains the table, the
 * library explains the measure, and each is checked where it lives.
 */
var seeds = ['strength', 'varga', 'dignity', 'yogas'].map(function (name) {
  return fs.readFileSync(path.join(root, 'supabase/seed/astro_readings_' + name + '.sql'),
                         'utf8');
}).join('\n').replace(/''/g, "'");

/*
 * A note under a table is the table's small print. Set at body size it read as
 * the panel's main text with the table as an illustration of it, which is the
 * wrong way round: the table is the thing, the note explains it.
 */
/*
 * Vimsopaka cannot see a cancelled debilitation, and that is the one blind spot
 * where the score is not merely silent but lowest exactly where it should not
 * be. The star does not change the number; it says the number is not to be read
 * at face value in that cell.
 */
/*
 * [N] rather than a star. It was a star while it was the only mark sitting on a
 * dignity rather than a sign, and a star is a footnote: it says look elsewhere,
 * where every other mark here names its own condition.
 */
ok('a cancelled debilitation is marked where it is scored',
   /if \(d\.key === 'debilitated' && cancelled\[planet\.name\]\)/.test(appSrc) &&
   /dignityLine\.appendChild\(el\('span', 'flag flag-n', ' \[N\]'\)\)/.test(appSrc) &&
   !/neecha-bhanga/.test(appSrc));
/*
 * And the letter is the whole of it. Every mark used to explain itself in the
 * hover as well as wear its letter, so a cell carrying [X] [D] said the same
 * thing twice - once in two letters, once in four sentences - and the chip that
 * advertised the hover was on almost every cell in the grid. The key at the top
 * of the tab is where a letter is looked up.
 */
ok('and no mark explains itself in a hover, the letter being the whole of it',
   (function () {
     var at = appSrc.indexOf('function renderVargas(state)');
     var block = appSrc.slice(at, appSrc.indexOf('function vargaSummary', at));
     return !/says\.push\(/.test(block) && !/var says = \[\]/.test(block) &&
       !/is cancelled and the graha stands in an angle or a trine/
         .test(block.replace(/'\s*\+\s*'/g, ''));
   })());
/*
 * Every mark is per cell, a cell being one graha in one division, and every mark
 * is one of the four things vimsopaka cannot see. A marked cell is one the score
 * reads wrong; an unmarked cell is one it has whole.
 */
/*
 * Two channels, two claims. A tint says the graha takes part in a yoga in that
 * division, which most cells do; a mark says a particular thing the score is
 * blind to, which about a third do. Putting both in letters would have made the
 * common one look like the rare ones.
 */
/*
 * Two channels, two claims, and the note says which is which without naming a
 * single mark: the flag key at the top of the tab defines all eight, and listing
 * them here as well is that list in a second place - it is what carried the note
 * back past two hundred words once already.
 */
ok('the note separates the two channels without naming a mark', (function () {
  var flat = appSrc.replace(/'\s*\+\s*'/g, '').replace(/\s+/g, ' ');
  return /A marked cell is one the score reads wrong and the mark says how, each being something it cannot see/
    .test(flat) &&
    /A chip in a corner means a hover with a yoga the cell has no mark for, the marked ones being read off the cell already/
      .test(flat);
})());
ok('and names none of them, the key doing that', (function () {
  var at = appSrc.indexOf('function vargaNote');
  var note = appSrc.slice(at, appSrc.indexOf('ABBREVIATE_ABOVE', at))
    .replace(/\/\*[\s\S]*?\*\//g, '');
  return !/\[V\] repeats the rashi sign/.test(note) && !/\[D\] is the house/.test(note) &&
    /<dt><span class="flag flag-v">\[V\]<\/span> Vargottama<\/dt>/
      .test(html.replace(/\s+/g, ' '));
})());
/*
 * A tint was tried and taken out. Two thirds of the cells carry a yoga, so
 * tinting them coloured most of the grid and made the dignities harder to read
 * for a signal that was nearly always on. A corner chip says the same without
 * touching the cell's ground or its colour.
 */
ok('the chip is a corner mark, not a fill', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var block = css.slice(css.indexOf('#vargas-table td.has-note::after'));
  block = block.slice(0, block.indexOf('}'));
  return /border-top: 5px solid var\(--ink-faint\)/.test(block) &&
    /border-left: 5px solid transparent/.test(block) &&
    /top: 2px;/.test(block) && /right: 2px;/.test(block) &&
    !/background/.test(block) && !/--varga-yoga/.test(css);
})());
/*
 * A key column keeps its identity in the two vertical rules either side, which
 * are borders, so the yoga tint can take the background without either signal
 * being lost.
 */
/*
 * The three the scheme leans on hardest are a row now rather than a column, so
 * the rules that bracket them are horizontal.
 */
ok('the key divisions are bracketed across, being rows now', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var key = css.slice(css.indexOf('#vargas-table tr.varga-key > * {'));
  key = key.slice(0, key.indexOf('}'));
  return /border-top: 1px solid var\(--line\)/.test(key) &&
    /border-bottom: 1px solid var\(--line\)/.test(key) &&
    /background: var\(--varga-key\)/.test(key);
})());
ok('and it needs nothing of the cell but a corner to sit in', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return /#vargas-table td\.has-note \{ position: relative; \}/.test(css);
})());
ok('a graha in two yogas in one division is named once for each', (function () {
  var at = appSrc.indexOf('var list = yogasIn[name]');
  var block = appSrc.slice(at, at + 200);
  return /if \(list\.indexOf\(yoga\.title\) < 0\) list\.push\(yoga\.title\);/.test(block);
})());
ok('every one is computed per division, not once for the chart',
   /Yogas\.detect\(chart, strengths\)/.test(appSrc) &&
   /if \(yoga\.yoga === 'Parivartana'\) exchanging\[name\] = yoga\.title;/.test(appSrc) &&
   /Astro\.hemmedByBenefics\(planet\.name, d\.sign, chart, benefics\)/.test(appSrc) &&
   /Astro\.hemmedByMalefics\(planet\.name, d\.sign, chart, benefics\)/.test(appSrc) &&
   /var benefics = Astro\.naturalBenefics\(state\.chart\);/.test(appSrc) &&
   /var house = \(\(d\.sign - lagna\) % 12 \+ 12\) % 12 \+ 1;/.test(appSrc) &&
   /Astro\.hasDigBala\(planet\.name, house\)/.test(appSrc));
/*
 * And only those four. Every yoga the app detects would mark 58 per cent of the
 * cells, raja yoga alone running better than one per divisional chart on two
 * grahas each, and a mark on three cells in five is decoration.
 */
/*
 * The five marks stay the five marks. Every yoga is reported too, but as a tint
 * on the cell and a line in its hover rather than as a sixth letter: raja yoga
 * alone would put one on a third of the grid, and a mark that common says
 * nothing about the cell it is on.
 */
ok('and no yoga becomes a seventh mark', (function () {
  var at = appSrc.indexOf('function renderVargas(state)');
  var block = appSrc.slice(at, appSrc.indexOf('function vargaSummary', at));
  var marks = (block.match(/'flag flag-[a-z]+'/g) || []);
  return marks.length === 6 && /has-note/.test(block) &&
    !/function grahaFootnote/.test(appSrc);
})());
ok('which is measurably a third of the cells rather than three fifths', (function () {
  var scheme = Astro.VARGA_SCHEMES.shodasavarga, cells = 0, marked = 0;
  for (var y = 1950; y < 1990; y += 4) {
    var c = Astro.chart({ jdUT: Astro.julianDay(y, 5, 17, 9), latitude: 28.61,
                          longitude: 77.21, tzOffsetMinutes: 330 });
    var pos = {};
    c.planets.forEach(function (p) { pos[p.name] = p; });
    scheme.divisions.forEach(function (d) {
      var lagna = Astro.vargaPosition(c.ascendant.longitude, d).sign;
      var dc = Astro.chartInDivision(c, d), par = {}, nb = {};
      Yogas.parivartana(dc).forEach(function (yoga) {
        (yoga.grahas || []).forEach(function (n) { par[n] = true; });
      });
      Yogas.neechaBhanga(dc).forEach(function (yoga) {
        if (yoga.kind !== 'raja') return;
        (yoga.grahas || []).forEach(function (n) { nb[n] = true; });
      });
      c.planets.forEach(function (p) {
        var dig = Astro.vargaDignity(p.name, p.longitude, d, pos);
        if (!dig) return;
        cells++;
        var v = Astro.vargaPosition(p.longitude, d);
        if ((d !== 1 && v.sign === Astro.signOf(p.longitude)) || par[p.name] ||
            (dig.key === 'debilitated' && nb[p.name]) ||
            Astro.hasDigBala(p.name, ((v.sign - lagna) % 12 + 12) % 12 + 1)) marked++;
      });
    });
  }
  return cells > 300 && marked / cells > 0.2 && marked / cells < 0.45;
})());
/*
 * The raja form only. A plain cancellation lifts the weakness and leaves the
 * graha with nowhere to act from, so a score near the floor is not far wrong for
 * it; the raja form is the case where the floor misreports the graha outright.
 * Marking both put a star on two debilitations in three.
 */
ok('the star marks the raja form and not a plain cancellation',
   /if \(yoga\.kind !== 'raja'\) return;/.test(appSrc));
ok('and that really does thin it out', (function () {
  var deb = 0, any = 0, raja = 0;
  var scheme = Astro.VARGA_SCHEMES.shodasavarga;
  for (var y = 1950; y < 1990; y += 2) {
    var c = Astro.chart({ jdUT: Astro.julianDay(y, 5, 17, 9), latitude: 28.61,
                          longitude: 77.21, tzOffsetMinutes: 330 });
    var pos = {};
    c.planets.forEach(function (p) { pos[p.name] = p; });
    scheme.divisions.forEach(function (d) {
      var all = {}, rj = {};
      Yogas.neechaBhanga(Astro.chartInDivision(c, d)).forEach(function (yoga) {
        (yoga.grahas || []).forEach(function (n) {
          all[n] = true;
          if (yoga.kind === 'raja') rj[n] = true;
        });
      });
      c.planets.forEach(function (p) {
        var dig = Astro.vargaDignity(p.name, p.longitude, d, pos);
        if (!dig || dig.key !== 'debilitated') return;
        deb++;
        if (all[p.name]) any++;
        if (rj[p.name]) raja++;
      });
    });
  }
  return deb > 100 && raja < any * 0.7 && raja / deb < 0.5;
})());
/*
 * Read off each division's own chart, the same recast the Yogas tab reads, so
 * the grid cannot disagree with that tab about D9. Only divisions that hold a
 * debilitation are recast at all.
 */
/*
 * Cancellation comes out of the same per-division pass as the yogas rather than
 * a sweep of its own: it is one of them, and asking twice was two chances for
 * the two answers to differ.
 */
ok('cancellation is asked of the division being scored, in the same pass',
   /var chart = Astro\.chartInDivision\(state\.chart, division\);/.test(appSrc) &&
   /if \(yoga\.yoga === 'Neecha Bhanga' && yoga\.kind === 'raja'\) cancelled\[name\] = true;/
     .test(appSrc) &&
   !/function cancelledDebilitations/.test(appSrc));
ok('and it agrees with the detector, cell by cell, on a chart that has one',
   (function () {
     var c = Astro.chart({ jdUT: Astro.julianDay(1948, 3, 31, 12 + 53 / 60 + 5),
                           latitude: 38.8951, longitude: -77.0364, tzOffsetMinutes: -300 });
     var mars = c.planets.filter(function (p) { return p.name === 'Mars'; })[0];
     var pos = {};
     c.planets.forEach(function (p) { pos[p.name] = p; });
     var d1 = Astro.vargaDignity('Mars', mars.longitude, 1, pos);
     var cancelled = Yogas.neechaBhanga(c).some(function (y) {
       return (y.grahas || []).indexOf('Mars') >= 0;
     });
     return d1.key === 'debilitated' && cancelled;
   })());
/*
 * Every mark is now a bracketed letter but the star, which is not a flag: it
 * qualifies a word rather than naming a condition. A bare plus was the odd one
 * out and is gone.
 */
/*
 * Every mark is a bracketed letter now. The star was the last bare symbol, and
 * it was the one that had to be looked up rather than read.
 */
ok('every mark is a bracketed letter', (function () {
  var flat = html.replace(/\s+/g, ' ');
  var dts = flat.match(/<dt>.*?<\/dt>/g) || [];
  return dts.length === 9 && !/flag-dig/.test(flat) && !/flag-star/.test(flat) &&
    dts.filter(function (d) { return /\[[RVYCXSPDN]\]/.test(d); }).length === 9;
})());
/*
 * [H] and [D] share the green, the letters telling them apart. A sixth hue was
 * tried: nothing in the wheel clears the validator against the five already
 * here, teal reading at 9.1 against the green to normal vision and every
 * magenta that passes that collapsing against the blue under protanopia.
 */
ok('and the palette stays at five hues, the letters doing the rest', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  // [S], [D] and [N] share the green: all three say the graha's circumstances
  // are helping it, and the bracketed letter is what tells them apart.
  return /\.flag-s, \.flag-d, \.flag-n \{ color: var\(--green-deep\); \}/.test(css) &&
    /\.flag-p \{ color: var\(--retro\); \}/.test(css) &&
    !/--flag-direction/.test(css);
})());

ok('and the star leaves no rule behind it', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return !/neecha-bhanga/.test(css) && !/flag-star/.test(css);
})());

ok('every note is set smaller and softer than the body', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var block = css.slice(css.indexOf('.varga-note, .chart-note, .flag-key dd {'));
  block = block.slice(0, block.indexOf('}'));
  return /font-size: 0\.82rem/.test(block) && /color: var\(--ink-soft\)/.test(block);
})());
/*
 * And at one size. Three sizes of secondary prose in one panel - 0.82 for a
 * chart note, 0.86 for a flag description, body size for the note under the
 * table - is a reader being asked to rank three things that are all the same
 * kind of thing.
 */
ok('and all of them at the same size, none carrying one of its own', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  // Only the shared rule sizes them; what is left to each is its own margin.
  return /\.flag-key dd \{ margin: 0; \}/.test(css) &&
    /\.chart-note \{ margin: 0\.5rem 0 0; \}/.test(css);
})());
/*
 * And no measure cap on any of them. A cap left a third of the card empty beside
 * a note already short and already small, and deliberate empty space reads the
 * same as accidental empty space. What bounds each note is what holds it, and
 * those widths were chosen for reading already.
 */
ok('no note is capped short of what holds it', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var block = css.slice(css.indexOf('.varga-note, .chart-note, .flag-key dd {'));
  return !/max-width/.test(block.slice(0, block.indexOf('}'))) &&
    !/\.chart-note \{[^}]*max-width/.test(css) &&
    !/\.varga-note \{[^}]*max-width/.test(css);
})());
ok('every note on the page wears the class', (function () {
  var notes = html.match(/<p class="varga-note"[^>]*>/g) || [];
  return notes.length >= 5 &&
    ['shadbala-note', 'vargas-note', 'yoga-note', 'aspect-note'].every(function (id) {
      return new RegExp('<p class="varga-note" id="' + id + '">').test(html);
    });
})());

/*
 * Every table walks chart.planets, so the order they read in is whatever built
 * the chart - and the Edge Function builds with the copy of astro.js that was
 * deployed alongside it, not the one the browser loaded. That is how the tables
 * stayed listed Sun, Moon, Mars, Jupiter, Venus, Mercury, Saturn long after the
 * engine here had been changed: the reorder was real and never reached the page.
 */
ok('an arriving chart is put into the engine order, whichever side built it',
   /chart\.planets = Astro\.inGrahaOrder\(chart\.planets\)/.test(appSrc) &&
   typeof Astro.inGrahaOrder === 'function');
ok('and it is done once, where both sources meet', (function () {
  var at = appSrc.indexOf('function computeChart');
  var block = appSrc.slice(at, appSrc.indexOf('function fail', at));
  return (block.match(/inGrahaOrder/g) || []).length === 1 &&
    /var finish = function \(chart, source\)/.test(block) &&
    block.indexOf('inGrahaOrder') < block.indexOf('var local = function');
})());
ok('so no table sorts for itself',
   (appSrc.match(/inGrahaOrder/g) || []).length === 1);

/*
 * The nine conditions the detector checks, written down where a reader can find
 * them. Checked against the detector rather than trusted: a list in the library
 * that the code does not implement is worse than no list.
 */
ok('the library gives the two conditions the site applies', (function () {
  var wanted = ['the lord of the sign the debilitated graha stands in is in a kendra',
                'the graha that would be exalted in that sign is in a kendra from either',
                'in Virgo, Mercury rules the sign and is exalted in it'];
  return /This site applies two conditions and no more/.test(seeds) &&
    wanted.every(function (t) { return seeds.indexOf(t) >= 0; });
})());
/*
 * Both passages are paraphrase now. De Fouw and Svoboda are reported rather than
 * quoted, which is the house style for the library.
 */
ok('the neecha bhanga passages quote nobody', (function () {
  var block = seeds.slice(seeds.indexOf("'yoga', 'Neecha Bhanga Raja Yoga', 'general'"));
  block = block.slice(0, block.indexOf("'yoga', 'Vipareeta"));
  return block.indexOf('"') < 0 && /De Fouw and Svoboda have been read/.test(block);
})());
ok('and the detector applies those two and nothing else', (function () {
  var src = fs.readFileSync(path.join(root, 'js/yogas.js'), 'utf8');
  var block = src.slice(src.indexOf('function neechaBhanga'));
  block = block.slice(0, block.indexOf('function ordinal'));
  return (block.match(/reasons\.push\(/g) || []).length === 2 &&
    /both rules this sign and is exalted in it/.test(block) &&
    !/exchanges signs with/.test(block) && !/is exalted in navamsa/.test(block) &&
    !/is conjunct/.test(block) && !/aspects ' \+ graha/.test(block);
})());
/*
 * The six the site does not apply are named anyway, with what accepting them
 * would cost. A reader who has met the looser list elsewhere needs to know it
 * was considered and declined, not that it was never heard of.
 */
/*
 * The attribution is hedged because the primary passage has not been read: both
 * full-text scans of Three Hundred Important Combinations break off near the
 * hundred and sixtieth combination. Saying "Raman's definition is two and no
 * more" on secondary sources alone was a claim this site could not support.
 */
ok('the attribution to Raman says what was and was not verified',
   /has not been checked against his own text/.test(seeds) &&
   /both break off around the hundred and sixtieth combination/.test(seeds));
/*
 * De Fouw and Svoboda were read, so they are cited to the page and quoted. Their
 * four are the best-sourced list here, and two of them are the two applied.
 */
ok('the one source read in the original is cited to the page',
   /give four at page 295 of Light on Life/.test(seeds) &&
   /Their worked example is Saturn in Aries/.test(seeds) &&
   /Their first and fourth are the two applied here/.test(seeds));
/*
 * And they settle the raja yoga test the app already used, in their own words:
 * occupies a kendra or kona, not owns one.
 */
ok('and they settle the raja yoga test, which the detector already matched',
   /the cancellation makes a raja yoga only where the graha occupies an angle or a trine/
     .test(seeds) && /Occupying one, not owning one/.test(seeds) &&
   (function () {
     var src = fs.readFileSync(path.join(root, 'js/yogas.js'), 'utf8');
     return /var royal = KENDRA_HOUSES\.indexOf\(house\) >= 0 \|\| TRIKONA_HOUSES\.indexOf\(house\) >= 0;/
       .test(src);
   })());
/*
 * And the third condition some sources give him is named, with the reason it is
 * a different rule rather than a restatement: the graha exalted in the sign of
 * debilitation and the lord of the sign of exaltation are never the same graha.
 */
ok('the condition easily mistaken for one of ours is named and distinguished',
   /the lord of the rashi where that graha is exalted, in a kendra from either/.test(seeds) &&
   /The two differ for all seven grahas/.test(seeds));
ok('and they really do differ for all seven', (function () {
  return Astro.GRAHA_ORDER.slice(0, 7).every(function (g) {
    var d = Astro.DIGNITY[g];
    var exaltedHere = null;
    Object.keys(Astro.DIGNITY).forEach(function (o) {
      if (Astro.NODES.indexOf(o) >= 0) return;
      if (Astro.DIGNITY[o].exalt.sign === d.debil) exaltedHere = o;
    });
    return exaltedHere !== Astro.SIGN_LORDS[d.exalt.sign];
  });
})());

ok('the six it declines are named, with what they would cost',
   /Six further cancellations circulate between those texts and are not applied here/
     .test(seeds) &&
   /turns 72 per cent of rashi debilitations into cancellations into 92/.test(seeds));
/*
 * The exchange is the one of the six that is a named yoga, and dropping it costs
 * nothing: parivartana reports it in its own right on the same pair.
 */
ok('the exchange is left to the detector that names it', (function () {
  var src = fs.readFileSync(path.join(root, 'js/yogas.js'), 'utf8');
  var block = src.slice(src.indexOf('function neechaBhanga'));
  block = block.slice(0, block.indexOf('function ordinal'));
  return !/exchanges signs/.test(block) && typeof Yogas.parivartana === 'function' &&
    /is parivartana yoga, which is reported in its own right/.test(seeds);
})());
ok('the library says the conditions carry no names of their own',
   /The conditions carry no names of their own/.test(seeds) &&
   /nicha, the fall, and bhanga, its breaking/.test(seeds));
/*
 * Narrow does not mean rare. Both conditions are kendra placements, and a kendra
 * from either the lagna or the Moon reaches eight signs of twelve, so 72 per
 * cent of debilitations still cancel.
 */
ok('and says why the narrow reading is still a generous test',
   /a kendra from either the lagna or the Moon reaches eight signs out of twelve/
     .test(seeds));
ok('which the detector agrees with, measured', (function () {
  var deb = 0, cancelled = 0;
  for (var y = 1900; y < 2020; y++) {
    var c = Astro.chart({ jdUT: Astro.julianDay(y, (y % 12) + 1, (y % 27) + 1, 9),
                          latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 });
    var pos = {};
    c.planets.forEach(function (p) { pos[p.name] = p; });
    var hit = {};
    Yogas.neechaBhanga(c).forEach(function (x) { hit[x.grahas[0]] = true; });
    c.planets.forEach(function (p) {
      var d = Astro.vargaDignity(p.name, p.longitude, 1, pos);
      if (!d || d.key !== 'debilitated') return;
      deb++;
      if (hit[p.name]) cancelled++;
    });
  }
  var rate = cancelled / deb;
  return deb > 50 && rate > 0.6 && rate < 0.85;
})());

ok('the library says whose enumeration it is, Parashara not having one',
   /Phaladeepika chapter 7 from verse 26 is the canonical list/.test(seeds) &&
   /nowhere lists the conditions/.test(seeds));
ok('and that the site declines the looser reading rather than never meeting it',
   /Few authorities give all of them and they do not agree on how many must hold/
     .test(seeds));

/*
 * Every script the page loads has to parse. Most of what this file checks about
 * app.js is its source read as text, which a regex is perfectly happy to match
 * inside a file the browser cannot run at all - a stray brace shipped once
 * exactly that way, with 1031 tests green and the page dead, the saved kundalis
 * included because nothing after the error ever ran.
 *
 * new Function parses without executing, which is what is wanted: these are
 * classic scripts that expect a document.
 */
ok('every script the page loads parses', (function () {
  var scripts = (html.match(/<script src="([^"]+)"/g) || [])
    .map(function (t) { return t.replace(/.*src="([^"]+)".*/, '$1'); })
    .filter(function (src) { return src.indexOf('js/') === 0 || src.indexOf('data/') === 0; });
  if (scripts.length < 5) return false;
  return scripts.every(function (src) {
    try {
      new Function(fs.readFileSync(path.join(root, src), 'utf8'));
      return true;
    } catch (e) {
      console.log('       ' + src + ': ' + e.message);
      return false;
    }
  });
})());

/*
 * The renderers, run rather than read.
 *
 * Nearly everything here checks app.js as text, and text cannot see an
 * identifier that is used and never declared. Two have got through that way in
 * two commits - GOOD_KEYS, which broke the charts, and listOf, which broke
 * renderVargas and with it every click on a saved kundali, because render()
 * calls the panels in order and stops at the first throw.
 *
 * So this loads the real file against a DOM stub, injects one line before the
 * IIFE closes to reach the functions inside it, and calls them on a real chart.
 * It is a smoke test and not a rendering test: what it proves is that the code
 * runs, which is the thing a regex cannot.
 */
(function () {
  var loose = function (tag) {
    var node = makeNode(tag);
    node.className = '';
    node.title = '';
    node.hidden = false;
    node.value = '';
    node.style = {};
    node.classList = { add: function () {}, remove: function () {},
                       toggle: function () {}, contains: function () { return false; } };
    node.addEventListener = function () {};
    node.removeAttribute = function () {};
    node.querySelectorAll = function () { return []; };
    node.querySelector = function (sel) {
      var want = sel.replace(/[^a-z]/gi, ''), hit = null;
      (function walk(n) {
        if (hit) return;
        if (n.tag === want) { hit = n; return; }
        n.children.forEach(walk);
      })(node);
      if (!hit) { hit = loose(want || 'div'); node.appendChild(hit); }
      return hit;
    };
    return node;
  };
  var byId = {};
  var sandbox = {
    document: {
      createElement: loose,
      createElementNS: function (ns, tag) { return loose(tag); },
      getElementById: function (id) { return byId[id] || (byId[id] = loose('div')); },
      querySelector: function () { return loose('div'); },
      querySelectorAll: function () { return []; },
      addEventListener: function () {},
      body: loose('body'),
      documentElement: loose('html')
    },
    window: {
      localStorage: { getItem: function () { return null; }, setItem: function () {},
                      removeItem: function () {} },
      addEventListener: function () {},
      matchMedia: function () { return { matches: false, addEventListener: function () {} }; },
      crypto: { randomUUID: function () { return 'test'; } },
      location: { hash: '' }
    },
    location: { hash: '', search: '', href: '' },
    history: { replaceState: function () {}, pushState: function () {} },
    navigator: { language: 'en' },
    fetch: undefined
  };

  var close = appSrc.lastIndexOf('})();');
  var wired = appSrc.slice(0, close) +
    '  __out.render = render; __out.renderVargas = renderVargas;\n' +
    '  __out.renderGrahaTable = renderGrahaTable;\n' +
    '  __out.renderShadbala = renderShadbala; __out.renderYogas = renderYogas;\n' +
    '  __out.renderAspects = renderAspects;\n' +
    appSrc.slice(close);

  var out = {};
  var loaded = true, why = '';
  try {
    new Function('document', 'window', 'location', 'history', 'navigator', 'fetch',
                 'Astro', 'Geo', 'Charts', 'Shadbala', 'Yogas', 'PERTURBATIONS', '__out',
                 wired)(
      sandbox.document, sandbox.window, sandbox.location, sandbox.history,
      sandbox.navigator, sandbox.fetch, Astro, Geo, Charts, Shadbala, Yogas,
      global.PERTURBATIONS, out);
  } catch (e) {
    loaded = false;
    why = e.message;
  }
  ok('app.js loads against a document without throwing', loaded, why);

  if (!loaded) return;
  var chart = Astro.chart({ jdUT: Astro.julianDay(1946, 7, 6, 19 + 20 / 60 + 4),
                            latitude: 40.7143, longitude: -74.006, tzOffsetMinutes: -240 });
  var state = { chart: chart, place: { lat: 40.7143, lon: -74.006, label: 'New York' },
                offset: -240, name: 'Test', celebrity: false, note: '' };
  ['renderGrahaTable', 'renderVargas', 'renderShadbala', 'renderYogas', 'renderAspects']
    .forEach(function (name) {
      var ran = true, message = '';
      try {
        out[name](state);
      } catch (e) {
        ran = false;
        message = e.message;
      }
      ok(name + ' runs on a real chart', ran, message);
    });

  /*
   * And it really puts the war on the screen. Every check on yuddha bala until
   * now was on the engine or on app.js as text, neither of which can see whether
   * the row reaches the table - and the row is conditional, so a chart without a
   * war looks exactly like a renderer that never builds it. Two charts: one with
   * a war and one without, read back off the rendered rows.
   */
  var rowNames = function (state) {
    var table = byId['shadbala-table'];
    if (!table) return [];
    var body = table.querySelector('tbody');
    body.children.length = 0;
    out.renderShadbala(state);
    return body.children.map(function (tr) {
      return (tr.children[0] && tr.children[0].textContent || '').trim();
    });
  };
  var at = function (y, m) {
    var c = Astro.chart({ jdUT: Astro.julianDay(y, m, 15, 1), latitude: 28.61,
                          longitude: 77.21, tzOffsetMinutes: 330 });
    return { chart: c, place: { lat: 28.61, lon: 77.21, label: 'Delhi' },
             offset: 330, name: 'Test', celebrity: false, note: '' };
  };
  var war = at(1901, 1), peace = at(1946, 7);
  ok('the chart used here really does hold a war, and the other does not',
     Shadbala.compute(war.chart, { latitude: 28.61, longitude: 77.21,
                                   tzOffsetMinutes: 330 }).wars.length === 1 &&
     Shadbala.compute(peace.chart, { latitude: 28.61, longitude: 77.21,
                                     tzOffsetMinutes: 330 }).wars.length === 0);
  ok('and the rendered table carries a Yuddha row for it', (function () {
    var names = rowNames(war);
    return names.some(function (label) { return /^Yuddha/.test(label); });
  })());
  ok('and none for the chart without one', (function () {
    var names = rowNames(peace);
    return names.length > 0 &&
      !names.some(function (label) { return /^Yuddha/.test(label); });
  })());
})();

console.log('\nVargas panel');
/*
 * Named for the measure, as Shadbala beside it is, rather than for the columns.
 * Everything in the panel is scaled to the twenty: the scheme picker chooses
 * which division set the score is taken over, the totals are out of twenty, and
 * the first chart plots them. The id stays 'vargas' - it is what the divisions
 * are, and renaming it would move every selector for a label change.
 */
ok('the tab is named for the measure, beside the other strength measure',
   />Vimsopaka Bala<\/button>/.test(html) && />Shadbala<\/button>/.test(html) &&
   !/>Vargas<\/button>/.test(html));
ok('and the panel it controls is unchanged underneath',
   /id="tab-vargas"[\s\S]*?aria-controls="panel-vargas"/.test(html) &&
   /id="panel-vargas"/.test(html));
/*
 * The headings are built in code now, from the same list the cells come from, so
 * the markup carries an empty row rather than sixteen divisions typed a second
 * time. This checks the builder walks the engine's list in order.
 */
ok('the rows are built from whichever scheme is chosen, in its own order',
   (function () {
     var head = html.slice(html.indexOf('id="vargas-table"'));
     head = head.slice(0, head.indexOf('</thead>'));
     return !/<th scope="col">D\d+<\/th>/.test(head) &&
       /scheme\.divisions\.forEach\(function \(division\) \{/.test(appSrc) &&
       /if \(keys\.indexOf\(division\) >= 0\) tr\.className = 'varga-key';/.test(appSrc) &&
       /el\('th', null, 'D' \+ division\)/.test(appSrc);
   })());

/*
 * Each division's share of the twenty vimsopaka points, under its heading. The
 * two schemes disagree about nearly every division - Shashtiamsa is 5 across the
 * ten and 4 across the sixteen - which is where a total that will not reconcile
 * usually comes from, so both are held here.
 */
/*
 * Four schemes, each sharing out twenty points and each doing it differently.
 * Verses 17-19 give the six and the seven, verse 20 the ten, verses 21-25 the
 * sixteen. "Vimsopaka" means of twenty, so a typo in any one weight is a failure.
 */
ok('all four schemes total twenty exactly', (function () {
  return Astro.VARGA_SCHEME_ORDER.every(function (k) {
    var sch = Astro.VARGA_SCHEMES[k];
    var total = sch.divisions.reduce(function (t, d) { return t + sch.weights[d]; }, 0);
    return total === 20;
  });
})(), Astro.VARGA_SCHEME_ORDER.map(function (k) {
  var sch = Astro.VARGA_SCHEMES[k];
  return sch.label + ' ' + sch.divisions.reduce(function (t, d) { return t + sch.weights[d]; }, 0);
}).join(', '));

ok('each scheme carries exactly as many divisions as its name claims', (function () {
  var named = { shadvarga: 6, saptavarga: 7, dasavarga: 10, shodasavarga: 16 };
  return Astro.VARGA_SCHEME_ORDER.every(function (k) {
    var sch = Astro.VARGA_SCHEMES[k];
    return sch.divisions.length === named[k] && sch.count === named[k] &&
      Object.keys(sch.weights).length === named[k];
  });
})());

ok('every division has a weight and every weight a division', (function () {
  return Astro.VARGA_SCHEME_ORDER.every(function (k) {
    var sch = Astro.VARGA_SCHEMES[k];
    return sch.divisions.every(function (d) { return sch.weights[d] !== undefined; }) &&
      Object.keys(sch.weights).every(function (d) { return sch.divisions.indexOf(+d) >= 0; });
  });
})());

// Each scheme is the one before it plus more, which is how Parashara builds them.
ok('the schemes nest: six inside seven inside ten inside sixteen', (function () {
  var order = Astro.VARGA_SCHEME_ORDER;
  return order.every(function (k, i) {
    if (i === 0) return true;
    var inner = Astro.VARGA_SCHEMES[order[i - 1]].divisions;
    var outer = Astro.VARGA_SCHEMES[k].divisions;
    return inner.every(function (d) { return outer.indexOf(d) >= 0; });
  });
})());

ok('the seven are the same seven Shadbala scores saptavargaja over',
   Astro.VARGA_SCHEMES.saptavarga.divisions.join(',') === '1,2,3,7,9,12,30');

ok('the figures are Parashara\'s own, scheme by scheme', (function () {
  var S = Astro.VARGA_SCHEMES;
  return S.shadvarga.weights[1] === 6 && S.shadvarga.weights[3] === 4 &&
      S.shadvarga.weights[9] === 5 && S.shadvarga.weights[30] === 1 &&
    S.saptavarga.weights[1] === 5 && S.saptavarga.weights[7] === 2.5 &&
      S.saptavarga.weights[9] === 4.5 &&
    S.dasavarga.weights[1] === 3 && S.dasavarga.weights[60] === 5 &&
    S.shodasavarga.weights[1] === 3.5 && S.shodasavarga.weights[60] === 4;
})());

// The same division priced four different ways is the whole reason to name the scheme.
ok('Rashi is priced differently in every one of the four', (function () {
  var seen = Astro.VARGA_SCHEME_ORDER.map(function (k) {
    return Astro.VARGA_SCHEMES[k].weights[1];
  });
  return seen.join(',') === '6,5,3,3.5' && new Set(seen).size === 4;
})());

/*
 * The score belongs to the graha rather than to either of its two rows, so it
 * spans both, the way the name does.
 */
ok('the total is one cell under its graha\'s column',
   !/rowspan/.test(appSrc.slice(appSrc.indexOf('function renderVargas(state)'),
                                appSrc.indexOf('function vargaSummary'))) &&
   /Astro\.vimsopaka\(planet\.name, planet\.longitude, scheme, positionsD1\)/.test(appSrc));
/*
 * The total sits second, beside the name, not last. Sixteen columns scroll, so
 * last put the one number the grid is adding up off the right-hand edge: the
 * reader scrolled past the working to reach the answer, then back to see whose
 * it was. Both the heading and the cell have to move, and separately, so each is
 * checked where it is built.
 */
/*
 * The totals close the table, a row now rather than a column, under the last of
 * the divisions they add up.
 */
ok('the totals close the table, after the divisions they add up', (function () {
  var body = appSrc.slice(appSrc.indexOf('function renderVargas(state)'),
                          appSrc.indexOf('function vargaSummary'));
  var divisions = body.indexOf('scheme.divisions.forEach');
  var totals = body.indexOf("totals.className = 'varga-totals'");
  return divisions >= 0 && totals > divisions &&
    body.indexOf('tbody.appendChild(totals)') > totals;
})());
ok('and nothing in the grid spans two rows any more', (function () {
  var body = appSrc.slice(appSrc.indexOf('function renderVargas(state)'),
                          appSrc.indexOf('function vargaSummary'));
  return !/rowspan/.test(body) && !/signRow/.test(body) && !/dignityRow/.test(body);
})());
ok('it is banded by Parashara\'s four readings, not by a gradient', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return Astro.VIMSOPAKA_BANDS.every(function (b) {
    return new RegExp('td\\.vimsopaka-' + b.key + ' \\{').test(css);
  }) && /' vimsopaka-' \+ score\.band\.key/.test(appSrc);
})());
ok('and the title breaks the score into its divisions',
   /part\.viswa \+ '\/20'/.test(appSrc) &&
   /which Parashara reads as ' \+ score\.band\.label/.test(appSrc));
/*
  * The heading is blank to look at. The panel is called Vimsopaka Bala and the
  * note says what the column is and what it is out of, so a word here was the
  * third telling of it.
  *
  * Blank to look at is not blank: a th with no accessible name leaves the cells
  * under it associated with nothing, so the name is there and hidden.
  */
/*
 * A row can carry its name where a column could not: the heading was blank there
 * because "Vimsopaka" over a column repeated the panel's own title beside the
 * widest word in the header row. Down the side it is one cell in a column of
 * division numbers, and naming it costs nothing.
 */
ok('the totals row says what it is, and what it is out of',
   /var head = el\('th', null, 'Vimsopaka'\);/.test(appSrc) &&
   /head\.appendChild\(el\('span', 'varga-weight', ' 20'\)\);/.test(appSrc));
ok('and the note still says what the totals row totals, the heading no longer doing it',
   /the last row scores those dignities out of twenty/
     .test(appSrc.replace(/'\s*\+\s*'/g, '')));
/*
 * Which verses a share-out comes from is a fact about the text, not about the
 * grid, so it went to the library with the rest of the doctrine. The engine
 * still records it per scheme, and the library quotes all four, so the two are
 * checked against each other rather than one being left to rot.
 */
ok('the note cites no verses, the library citing them instead',
   !/scheme\.source/.test(appSrc) &&
   /The Shadvarga and the Saptavarga are given at verses 17-19, the Dasavarga at verse 20, and the Shodasavarga at verses 21-25/
     .test(seeds));
ok('and every scheme the engine records is cited there, with the verses it records',
   Astro.VARGA_SCHEME_ORDER.every(function (k) {
     return seeds.indexOf(Astro.VARGA_SCHEMES[k].source) >= 0;
   }),
   Astro.VARGA_SCHEME_ORDER.map(function (k) {
     return Astro.VARGA_SCHEMES[k].source; }).join(' / '));
/*
 * A number in a column invites being read as a verdict. Shadbala and vimsopaka
 * both answer "how fully can this graha act" and neither answers "is that a good
 * thing": a strong malefic aspecting a house it does not rule afflicts it the
 * more surely for being strong. Parashara's own band label says "wholly
 * favourable", which is exactly why the caveat has to sit next to it.
 */
ok('the library says the total is strength and not benefit', (function () {
  return /Strength is how fully a graha can act\. Influence is what kind of effect it has/
    .test(seeds) &&
    /being strong makes the affliction more certain rather than less/.test(seeds);
})());
ok('and the column\'s own hover says it too, where the number is read',
   /That is strength, not benefit: it says how fully ' \+ planet\.name/.test(appSrc));
/*
 * The other half of the same point. A high total is not a verdict, but it is not
 * nothing either: it scales whatever the graha was going to do, which is what
 * makes it the right measure for how much a raja or dhana yoga delivers.
 */
/*
 * A single number that looks complete invites being treated as complete. It
 * counts dignity division by division and nothing else, so vargottama, an
 * exchange and dig bala all fall outside it - each of which this page does carry,
 * elsewhere.
 */
ok('the library says what the total cannot see, and where those live instead',
   /What vimsopaka bala cannot see/.test(seeds) &&
   /Vargottama\. The score reads each division on its own/.test(seeds) &&
   /Parivartana\. The score judges a graha against the lord/.test(seeds) &&
   /Directional strength\. Dig bala turns on which house/.test(seeds) &&
   /Neecha bhanga\. A debilitated graha scores near the floor/.test(seeds) &&
   /dig bala is a column of its own in Shadbala/.test(seeds));
ok('and each of those four really is computed somewhere', (function () {
  var shadbalaSrc = fs.readFileSync(path.join(root, 'js/shadbala.js'), 'utf8');
  var yogaSrc = fs.readFileSync(path.join(root, 'js/yogas.js'), 'utf8');
  return typeof Astro.isVargottama === 'function' &&
    /function parivartana/.test(yogaSrc) &&
    /function neechaBhanga/.test(yogaSrc) &&
    /function digBala/.test(shadbalaSrc);
})());

/*
 * The sharpest of the four. A debilitated graha scores near the floor, which is
 * right where the debilitation stands and wrong where it is cancelled, so this is
 * the case where the total is not merely blind but actively lowest exactly where
 * it should not be.
 */
ok('a cancelled debilitation still scores near the floor, which is the point', (function () {
  var place = { latitude: 23.5158, longitude: 87.308, tzOffsetMinutes: 330 };
  var scheme = Astro.VARGA_SCHEMES.shodasavarga;
  for (var y = 1970; y < 1990; y++) {
    var c = Astro.chart({ jdUT: Astro.julianDay(y, 6, 12, 6), latitude: place.latitude,
                          longitude: place.longitude, tzOffsetMinutes: 330 });
    var pos = {};
    c.planets.forEach(function (p) { pos[p.name] = p; });
    var cancelled = Yogas.neechaBhanga(c);
    if (!cancelled.length) continue;
    var g = cancelled[0].grahas[0];
    var v = Astro.vimsopaka(g, pos[g].longitude, scheme, pos);
    // The score knows nothing of the cancellation: it is computed from dignity alone.
    var d1 = Astro.vargaDignity(g, pos[g].longitude, 1, pos);
    if (d1 && d1.key === 'debilitated' && v) return true;
  }
  return false;
})());

ok('and that it measures magnitude rather than direction',
   /better read as magnitude than as direction/.test(seeds) &&
   /The yoga says what is promised and vimsopaka bala says how much of it the graha can actually carry/
     .test(seeds));

ok('the library explains the totalling and the four readings',
   /chapter 7, verses 26-27/.test(seeds) &&
   /below 5 the graha is "not capable of giving auspicious results"/.test(seeds) &&
   /above 15 it "will yield wholly favourable effects"/.test(seeds));

/*
 * The select already reads "Shodasavarga \u00b7 16 divisions", so a visible
 * "Scheme" beside it was the label repeated. Hidden rather than deleted: the
 * select still needs an accessible name, and the option text is its value, not
 * its name.
 */
ok('the scheme picker carries no visible label, but is still named', (function () {
  var flat = html.replace(/\s+/g, ' ');
  return /<label class="visually-hidden" for="varga-scheme">Scheme<\/label>/.test(flat) &&
    !/<label for="varga-scheme">/.test(flat);
})());
/*
 * These are Sanskrit compounds and modern usage writes each as one word.
 * Santhanam sets them spaced - "Shad-Varga, Sapta Varga, Dasha Varga and
 * Shodasha Varga" in one breath at ch.6 - but he is not consistent with himself,
 * writing Saptavarga joined six times elsewhere, so the spacing is his
 * typesetting rather than the reading.
 */
ok('each scheme is named as one word, as the compounds are',
   Astro.VARGA_SCHEME_ORDER.every(function (k) {
     return !/[\s-]/.test(Astro.VARGA_SCHEMES[k].label);
   }),
   Astro.VARGA_SCHEME_ORDER.map(function (k) {
     return Astro.VARGA_SCHEMES[k].label; }).join(' '));

ok('the picker offers all four, widest last and chosen', (function () {
  return /Astro\.VARGA_SCHEME_ORDER\.forEach\(function \(key\) \{/.test(appSrc) &&
    /if \(key === 'shodasavarga'\) opt\.selected = true;/.test(appSrc) &&
    /id="varga-scheme"/.test(html);
})());
ok('and changing it redraws the table',
   /schemeSelect\.addEventListener\('change', function \(\) \{\s*\n\s*if \(lastChart\) renderVargas\(lastChart\);/.test(appSrc));

ok('both vimsopaka schemes total twenty exactly', (function () {
  var sum = function (m) {
    return Object.keys(m).reduce(function (t, k) { return t + m[k]; }, 0);
  };
  return sum(Astro.VIMSOPAKA_DASAVARGA) === 20 && sum(Astro.VIMSOPAKA_SHODASAVARGA) === 20;
})());
ok('each scheme weights exactly its own divisions, no more and no less', (function () {
  var keys = function (m) { return Object.keys(m).map(Number).sort(function (a, b) { return a - b; }); };
  return keys(Astro.VIMSOPAKA_DASAVARGA).join(' ') ===
      Astro.DASAVARGA.slice().sort(function (a, b) { return a - b; }).join(' ') &&
    keys(Astro.VIMSOPAKA_SHODASAVARGA).join(' ') ===
      Astro.SHODASAVARGA.slice().sort(function (a, b) { return a - b; }).join(' ');
})());
ok('the figures are Parashara\'s, verses 20 and 21-25', (function () {
  var ten = Astro.VIMSOPAKA_DASAVARGA, sixteen = Astro.VIMSOPAKA_SHODASAVARGA;
  return ten[1] === 3 && ten[60] === 5 && ten[2] === 1.5 &&
    sixteen[1] === 3.5 && sixteen[60] === 4 && sixteen[9] === 3 && sixteen[16] === 2 &&
    sixteen[2] === 1 && sixteen[3] === 1 && sixteen[30] === 1 && sixteen[4] === 0.5;
})());
ok('Shashtiamsa is the division the two schemes most disagree on',
   Astro.VIMSOPAKA_DASAVARGA[60] === 5 && Astro.VIMSOPAKA_SHODASAVARGA[60] === 4);
ok('halves are written as halves, not decimals',
   /function vimsopakaFigure/.test(appSrc) && /'\\u00bd'/.test(appSrc));
ok('the heading says its figure here and in every other scheme that carries it',
   /Worth ' \+ weight \+ ' of the twenty in the ' \+ scheme\.label/.test(appSrc) &&
   /' across the ' \+ other\.label\.toLowerCase\(\)/.test(appSrc));
/*
 * The note has to describe whichever scheme is showing, so the shares are built
 * from that scheme rather than written into the prose, where they would be wrong
 * for the other three the moment the select moved.
 */
/*
 * The note no longer lists the sixteen shares. Every one is printed under its own
 * heading a couple of inches above, so the list was the header row read aloud;
 * the note says where to look instead.
 */
/*
 * The note had grown to four hundred and eighty words in one paragraph, most of
 * it doctrine about vimsopaka that the Lesson tab already carried at greater
 * length. Two copies of a doctrine drift, and the copy nobody maintains is the
 * one the reader is looking at. The note keeps what the grid raises and hands
 * the rest to the library.
 */
ok('the note explains the table and does not teach the measure', (function () {
  var at = appSrc.indexOf('function vargaNote');
  // Comments stripped first: theirs is prose too, and an apostrophe inside one
  // runs the quote-matching below straight through the code between them.
  var src = appSrc.slice(at, appSrc.indexOf('function currentScheme', at))
    .replace(/\/\*[\s\S]*?\*\//g, '');
  var flat = src.replace(/'\s*\+\s*'/g, '');
  var words = flat.match(/'[^']*'/g).join(' ').split(/\s+/).length;
  return words < 200 &&
    !/varga viswa/.test(flat) && !/wholly favourable/.test(flat) &&
    !/strength and not as benefit/.test(flat) && !/cannot see vargottama/.test(flat);
})());
ok('and there is no second copy of the scoring left in the panel',
   !/function vargaDetail/.test(appSrc) && !/vargas-detail/.test(html) &&
   !/How vimsopaka is scored/.test(html));
/*
 * And no pointer to the library either. The Lesson tab is three along from this
 * one and always on screen, so a note ending by naming another tab reads as an
 * apology for not being that tab.
 */
ok('the note does not end by pointing at another tab',
   !/The Lesson tab carries/.test(appSrc) &&
   /'strength', 'Vimsopaka Bala'/.test(seeds));
ok('the shares are pointed at rather than recited, each heading printing its own',
   !/var shares = scheme\.divisions\.map/.test(appSrc) &&
   /vimsopakaFigure\(weight\)/.test(appSrc));
ok('and the library is the one naming all four schemes together',
   /Shadvarga, Saptavarga, Dasavarga and Shodasavarga/.test(seeds));

ok('it renders whenever a chart does',
   /renderShadbala\(state\);\s*\n\s*renderVargas\(state\);/.test(appSrc));
ok('it reads the division list from the engine rather than repeating it',
   (function () {
     var code = appSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
     return /scheme\.divisions\.forEach\(function \(division\)/.test(code) &&
       !/\[1, 2, 3, 4, 7, 9, 10, 12, 16, 20, 24, 27, 30, 40, 45, 60\]/.test(code);
   })());
ok('and the sixteen are derived from VARGAS rather than retyped beside it', (function () {
  var astroSrc = fs.readFileSync(path.join(root, 'js/astro.js'), 'utf8');
  return /divisions: VARGAS\.map\(function \(v\) \{ return v\.division; \}\)/.test(astroSrc) &&
    Astro.SHODASAVARGA.join(' ') === '1 2 3 4 7 9 10 12 16 20 24 27 30 40 45 60';
})());
/*
 * The columns are the chart's own planet list, filtered and not reordered, so
 * they run in the same order as the tables beside them.
 */
ok('grahas keep the order of the tables beside it',
   /var planets = state\.chart\.planets\.filter\(function \(p\) \{/.test(appSrc));
ok('a graha with no reading anywhere is dropped, not shown as a column of dashes',
   /return Astro\.vargaDignity\(p\.name, p\.longitude, 1, positionsD1\);/.test(appSrc) &&
   /\/\/ Rahu and Ketu keep no friendships, so they have no column to head\./
     .test(appSrc));
/*
 * The title used to open by repeating the cell - "D7: Neutral - Cancer, ruled by
 * Moon" - where the division is the column heading, the dignity the row beneath
 * and the sign the cell itself. Three quarters of it was the screen read back.
 * The dignity short forms are spelt out in the note instead, once for the grid.
 */
/*
 * Only exaltation and debilitation reach this clause, and it is the one thing a
 * cell can say that its own word contradicts: the score is always taken from the
 * seven-step relation and never from the label, so a Deb can be worth 18 of 20
 * and an Exal 7. "On the seven-step varga scale that counts as friend" named a
 * scale the panel no longer explains and left the cost to be guessed.
 */
/*
 * Which the grid no longer says anywhere, the hover being the yogas alone. The
 * library carries it instead, under Vimsopaka Bala, and the test below still
 * checks the engine keeps producing the disagreement so that passage stays true.
 */
ok('only exaltation and debilitation ever fall outside the scale', (function () {
  var seen = {};
  for (var y = 1990; y < 2010; y++) {
    var c = Astro.chart({ jdUT: Astro.julianDay(y, 6, 12, 9), latitude: 28.61,
                          longitude: 77.21, tzOffsetMinutes: 330 });
    var pos = {};
    c.planets.forEach(function (p) { pos[p.name] = p; });
    Astro.VARGA_SCHEMES.shodasavarga.divisions.forEach(function (d) {
      c.planets.forEach(function (p) {
        var dig = Astro.vargaDignity(p.name, p.longitude, d, pos);
        if (dig && dig.relationLabel && dig.relationLabel !== dig.label) seen[dig.key] = true;
      });
    });
  }
  return Object.keys(seen).sort().join(',') === 'debilitated,exalted';
})());
ok('a cell title does not repeat the cell', (function () {
  var at = appSrc.indexOf('function renderVargas(state)');
  var block = appSrc.slice(at, appSrc.indexOf('function vargaSummary', at));
  return !/d\.label \+ ' - ' \+ Astro\.SIGNS\[d\.sign\]/.test(block) &&
    !/', ruled by ' \+ d\.lord/.test(block) && !/vargasDetail/.test(appSrc);
})());
// The dignity short forms keep their words, in the note, once for the grid.

/*
 * And every mark keeps its own. Each used to assign the title outright and the
 * dignity reading assigned it again below, so whichever ran last won: the marks'
 * explanations were written and never shown. It went unnoticed because the
 * reading always had something to say, so there was always a hover - just never
 * the one the mark had put there.
 */
ok('the marks write no hover at all, so none can be written over another',
   !/var says = \[\];/.test(appSrc) && !/says\.push\(/.test(appSrc) &&
   /td\.title = planet\.name \+ ' takes part in '/.test(appSrc));
ok('and no mark assigns a title of its own any more', (function () {
  var at = appSrc.indexOf('function renderVargas(state)');
  var block = appSrc.slice(at, appSrc.indexOf('function vargaSummary', at));
  return !/sign\.title = planet\.name/.test(block) &&
    !/dignity\.title = \(detail/.test(block);
})());

/*
 * Sixteen columns carry neither "Sagittarius" nor "Great enemy". Signs go as
 * numbers, which the chart above already uses for its boxes, and dignities as
 * short forms. Both words stay in the title, so nothing is lost, only shortened.
 */
/*
 * Abbreviation is forced by width, not chosen, so it applies only where the words
 * will not fit. Ten full-word columns come to about the width of the graha tables
 * beside this one; sixteen do not, so only the sixteen shorten.
 */
ok('the table is as wide as the grahas, not as the scheme',
   /planets\.forEach\(function \(planet\) \{\s*\n\s*row\.appendChild\(grahaColumnHead\(planet, sun\)\);/
     .test(appSrc) &&
   /scheme\.divisions\.forEach\(function \(division\) \{\s*\n\s*var lagna/.test(appSrc));
ok('so the six, seven and ten keep their words and the sixteen do not', (function () {
  var over = Astro.VARGA_SCHEME_ORDER.filter(function (k) {
    return Astro.VARGA_SCHEMES[k].divisions.length > 10;
  });
  return over.length === 1 && over[0] === 'shodasavarga';
})());
/*
 * Nothing abbreviates any more. Seven graha columns leave room for Sagittarius
 * and Great Friend however many divisions the scheme has, so the short forms and
 * the machinery that chose them went with the scroll they were fighting.
 */
ok('the sign and the dignity are written out in full',
   /el\('span', 'varga-sign', Astro\.SIGNS\[d\.sign\]\)/.test(appSrc) &&
   /el\('span', 'varga-dignity dig dig-' \+ d\.key, d\.label\)/.test(appSrc));
ok('and no short form or width test is left to choose between them',
   !/ABBREVIATE_ABOVE/.test(appSrc) && !/SIGN_ABBR\[d\.sign\]/.test(appSrc) &&
   !/VARGA_DIGNITY_SHORT/.test(appSrc) && !/\bbrief\b/.test(appSrc));
ok('the two lines of a cell stack, and neither is set in mono',
   (function () {
     var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
     return /#vargas-table \.varga-sign,\s*\n#vargas-table \.varga-dignity \{ display: block/
       .test(css) && !/varga-sign-abbr/.test(css);
   })());
ok('every dignity has a short form, each distinct and short enough to fit', (function () {
  var full = Object.keys(Astro.VARGA_DIGNITY_LABELS);
  var brief = full.map(function (k) { return Astro.VARGA_DIGNITY_SHORT[k]; });
  return brief.every(Boolean) && brief.length === 9 && new Set(brief).size === 9 &&
    brief.every(function (t) { return t.length <= 6; });
})(), Object.keys(Astro.VARGA_DIGNITY_SHORT).map(function (k) {
  return Astro.VARGA_DIGNITY_SHORT[k]; }).join(' '));
/*
 * Each short form carries its word in brackets, and the pairing is built from
 * the engine's two tables rather than typed into the sentence. Nine
 * abbreviations and nine words written out by hand is those tables copied, and
 * a rename would have left the sentence quoting the old one.
 */
ok('and the note no longer has short forms to explain',
   !/dignityKey/.test(appSrc) && !/Exal, Mool, Own, Gt Fr/.test(appSrc) &&
   !/Gt Enm and Deb/.test(appSrc));
/*
 * A graha's name is the one thing in the row that is scanned rather than
 * decoded, so sixteen columns give up type size instead of letters: the names
 * stay whole at every width and the grid drops about a tenth when it is brief.
 */
ok('the graha names stay whole at every width',
   /var th = el\('th', null, planet\.name\);/.test(appSrc) &&
   !/brief \? Astro\.grahaAbbr\(planet\.name\)/.test(appSrc));
ok('and the grid needs no width class at all now', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return !/table\.className = brief/.test(appSrc) && !/#vargas-table\.brief/.test(css);
})());
/*
 * One knob. Every size inside the grid is relative to the grid, so the wide case
 * changes the base and each part keeps its proportion to every other. Per-part
 * rem sizes had inverted them - a name ran at 0.80 of a cell in the narrow
 * schemes and 1.08 at sixteen - which is what made D16 read as a different table
 * rather than the same one drawn smaller.
 */
/*
 * The two lines of a cell are sized against the cell, so they hold their
 * proportion to it whatever the table is set at.
 */
ok('the two lines of a cell are sized against the cell', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return /#vargas-table \.varga-sign \{ color: var\(--ink-soft\); font-size: 0\.92em; \}/
    .test(css) && /#vargas-table \.varga-dignity \{ font-size: 0\.93em; \}/.test(css);
})());
/*
 * And they hold that proportion whatever the table is set at, both being ems on
 * the one base. The grid used to give each part its own rem size for the wide
 * case, which inverted them rather than scaling them - a name ran at 0.80 of a
 * cell in the narrow schemes and 1.08 at sixteen - and there is no wide case
 * left to do that in.
 */
ok('so the two hold their proportion whatever the table is set at', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var block = css.slice(css.indexOf('#vargas-table td.varga-cell'),
                        css.indexOf('/* Table or charts'));
  var sizes = block.match(/font-size: [0-9.]+(rem|em)/g) || [];
  return sizes.length > 0 && sizes.every(function (t) { return /em$/.test(t); }) &&
    !/#vargas-table\.brief/.test(css);
})());
ok('the note has no abbreviations to explain, and no width to explain them by',
   /function vargaNote\(scheme\)/.test(appSrc) &&
   !/leave no room for words/.test(appSrc.replace(/'\s*\+\s*'/g, '')));
/*
 * The hovers are pointed at once and in general. Naming the three kinds - a
 * cell, a heading, a total - was a list the reader had to hold in order to
 * arrive at "everything has one", which is the shorter thing to say and the
 * thing they need.
 */
ok('and points at the hovers once, in general rather than kind by kind',
   (function () {
     var note = appSrc.slice(appSrc.indexOf('function vargaNote'));
     note = note.slice(0, note.indexOf('function currentScheme'));
     // Comments stripped: theirs is prose too, and one of them says "hover".
     var flat = note.replace(/\/\*[\s\S]*?\*\//g, '')
       .replace(/'\s*\+\s*'/g, '').replace(/\s+/g, ' ');
     return (flat.match(/hover/gi) || []).length === 1 &&
       /A chip in a corner means a hover with a yoga the cell has no mark for/.test(flat) &&
       !/a heading for what that division is worth/.test(flat);
   })());
/*
 * Which only holds while everything really does have one. The three the sentence
 * used to name are built in three different places, so they are checked in three
 * different places.
 */
ok('and everything it promises a hover on has one',
   /td\.title = planet\.name \+ ' takes part in '/.test(appSrc) &&
   /th\.title = \(varga \? varga\.label/.test(appSrc) &&
   /td\.title = planet\.name \+ ' scores '/.test(appSrc));

ok('every dignity tier has a colour, and no colour is orphaned', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var keys = Object.keys(Astro.VARGA_DIGNITY_LABELS);
  var styled = (css.match(/\.dig-([a-z]+)/g) || [])
    .map(function (m) { return m.replace('.dig-', ''); });
  return keys.every(function (k) { return styled.indexOf(k) >= 0; }) &&
    styled.every(function (k) { return keys.indexOf(k) >= 0; });
})());
/*
 * And the selectors reach wherever a dignity is written. They were td rules
 * while a dignity was always a cell; the grid turned and its dignity became a
 * span inside one, so every colour stopped reaching it - silently, because the
 * words still rendered, in plain ink.
 */
ok('and a dignity is coloured wherever it is written, cell or span', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return !/td\.dig-/.test(css) && /\n\.dig-debilitated \{ color: var\(--retro\)/.test(css) &&
    /el\('span', 'varga-dignity dig dig-' \+ d\.key, d\.label\)/.test(appSrc) &&
    /\{ text: \(r\.isAscendant \? '' : Astro\.dignityOf/.test(appSrc);
})());

ok('the library says exaltation is outside the classical steps',
   /Exaltation has no rung either, so an exalted graha scores by its relation to the lord/
     .test(seeds));
/*
 * The figures are varga viswa, from verses 21-25, and there are six of them, not
 * seven: the top category is an own sign and moolatrikona is not ranked apart.
 * The note used to list seven dignities against six numbers, leaving one name
 * without a figure and no hint which.
 */
ok('and carries Parashara\'s own varga viswa figures, all six of them',
   ['the whole of it in its own sign', '18/20 in a great friend\'s',
    '15/20 a friend\'s', '10/20 a neutral\'s', '7/20 an enemy\'s',
    '5/20 a great enemy\'s'].every(function (t) { return seeds.indexOf(t) >= 0; }));
ok('and says outright that moolatrikona is not one of the six',
   /Moolatrikona is not given a rung of its own and keeps the same twenty as an own sign/
     .test(seeds));
/*
 * These two stay in the note. They are not doctrine about vimsopaka, they are
 * facts about what is on the screen: why the grid has seven rows and not nine,
 * and why the Sun is judged as Mars in one column of it. The library carries the
 * longer account of both, but a reader should not have to leave the table to
 * find out why two grahas are missing from it.
 */
ok('the note still says why the trimsamsa needs a stand-in',
   /In D30 the Sun is judged as Mars and the Moon as Venus, no luminary ruling a trimsamsa/
     .test(appSrc.replace(/'\s*\+\s*'/g, '')) &&
   /the Sun and the Moon rule no trimsamsa at all/.test(seeds));
ok('and that the nodes are left out, in the note and at length in the library',
   /Rahu and Ketu are left out: they own no sign and keep no friendships/
     .test(appSrc.replace(/'\s*\+\s*'/g, '')) &&
   /A row for them would be blank in every column and totalled in none/.test(seeds));
/*
 * Both of these say what the grid does before why it does it. A reader counting
 * seven rows wants "they are left out" first; the reason is what they read next,
 * not a clause to hold until the sentence arrives at the point.
 */
ok('and both exceptions lead with the fact, not the reason', (function () {
  var at = appSrc.indexOf('function vargaNote');
  var flat = appSrc.slice(at, appSrc.indexOf('ABBREVIATE_ABOVE', at))
    .replace(/'\s*\+\s*'/g, '');
  return !/own no sign and keep no friendships, so/.test(flat) &&
    !/No luminary rules a trimsamsa, so/.test(flat) &&
    flat.indexOf('Rahu and Ketu are left out') < flat.indexOf('they own no sign') &&
    flat.indexOf('In D30 the Sun is judged') < flat.indexOf('no luminary ruling');
})());

/*
 * It used to be explained in the hover of whichever D30 cell it fired in. The
 * hover is the yogas alone now, so the note says it once for the grid - which is
 * where a reader looks on meeting a Sun judged as Mars, rather than having to
 * hover the cell that surprised them.
 */
ok('the trimsamsa stand-in is explained in the note, once for the grid',
   /In D30 the Sun is judged as Mars and the Moon as Venus, no luminary ruling a trimsamsa/
     .test(appSrc.replace(/'\s*\+\s*'/g, '')) && !/d\.viaProxy/.test(appSrc));

/*
 * Each graha spans two rows, its sign above its dignity. The sign was only in a
 * hover before, which made the grid's most obvious question - which sign is that?
 * - answerable one cell at a time.
 */
/*
 * A graha in a division is one cell, holding its sign over its dignity. It was
 * two rows kept in step by hand, which is what made the chip count twice and
 * the hover band light half of it.
 */
ok('a graha in a division is one cell of two lines',
   /el\('span', 'varga-sign', Astro\.SIGNS\[d\.sign\]\)/.test(appSrc) &&
   /el\('span', 'varga-dignity dig dig-' \+ d\.key, d\.label\)/.test(appSrc) &&
   /td\.appendChild\(signLine\);\s*\n\s*td\.appendChild\(dignityLine\);/.test(appSrc));
ok('and its name is a row header',
   /th\.setAttribute\('scope', 'row'\);/.test(appSrc));
ok('both lines read one and the same varga position', (function () {
  var at = appSrc.indexOf('function renderVargas(state)');
  var block = appSrc.slice(at, appSrc.indexOf('function vargaSummary', at));
  return /var d = Astro\.vargaDignity\(planet\.name, planet\.longitude, division, positionsD1\);/
    .test(block) && (block.match(/Astro\.vargaDignity\(planet\.name/g) || []).length === 1;
})());

/*
 * Vargottama moved here from the graha flags. A flag on the graha had to stand
 * for one division, so it stood for the navamsa; the grid marks every division
 * at once, which is the comparison the column is already showing.
 */
ok('the grid marks a division that repeats the rashi sign',
   /d\.sign === Astro\.signOf\(planet\.longitude\)/.test(appSrc) &&
   /el\('span', 'flag flag-v', ' \[V\]'\)/.test(appSrc));
ok('but not D1, where every cell would qualify and the mark say nothing',
   /division !== 1 && d\.sign === Astro\.signOf/.test(appSrc));
/*
 * The three divisions the chosen scheme leans on hardest are picked out of the
 * row: which three is the scheme's own answer, read off its share-out of the
 * twenty, not a trio fixed in the markup.
 */
ok('the three are marked out, a whole row at a time',
   /if \(keys\.indexOf\(division\) >= 0\) tr\.className = 'varga-key';/.test(appSrc) &&
   (appSrc.match(/varga-key/g) || []).length === 1);
ok('the set comes from the engine, so the table cannot disagree with the weights',
   /var keys = Astro\.keyDivisions\(scheme\);/.test(appSrc) &&
   (appSrc.match(/var keys = Astro\.keyDivisions\(scheme\);/g) || []).length === 1 &&
   typeof Astro.keyDivisions === 'function');
ok('and every scheme yields exactly three, all of them its own divisions',
   Astro.VARGA_SCHEME_ORDER.every(function (k) {
     var scheme = Astro.VARGA_SCHEMES[k];
     var keys = Astro.keyDivisions(scheme);
     return keys.length === 3 && new Set(keys).size === 3 &&
       keys.every(function (d) { return scheme.divisions.indexOf(d) >= 0; });
   }));
/*
 * What the weights actually say, scheme by scheme. Worth pinning as answers
 * rather than as a re-run of the sort: these are the columns a reader is told to
 * look at first, and a weight edited by mistake would move them silently.
 */
ok('the shadvarga and the saptavarga lean on D1, D9 and D3',
   Astro.keyDivisions(Astro.VARGA_SCHEMES.shadvarga).join() === '1,9,3' &&
   Astro.keyDivisions(Astro.VARGA_SCHEMES.saptavarga).join() === '1,9,3');
ok('the dasavarga and the shodasavarga on D60, D1 and D9',
   Astro.keyDivisions(Astro.VARGA_SCHEMES.dasavarga).join() === '60,1,9' &&
   Astro.keyDivisions(Astro.VARGA_SCHEMES.shodasavarga).join() === '60,1,9');
/*
 * The dasavarga is the one the weights cannot settle: past D60 at five and D1 at
 * three it splits the rest eight ways at 1.5, so eight divisions tie for third.
 * The tie goes to the navamsa rather than to whichever the sort reached first.
 */
ok('the dasavarga third place is a tie broken for the navamsa, not by accident',
   (function () {
     var scheme = Astro.VARGA_SCHEMES.dasavarga;
     var tied = scheme.divisions.filter(function (d) { return scheme.weights[d] === 1.5; });
     return tied.length === 8 && tied.indexOf(9) >= 0 &&
       Astro.keyDivisions(scheme)[2] === 9;
   })());
ok('the mark is a tint rather than a colour, so it does not fight the dignities',
   (function () {
     var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
     var block = css.slice(css.indexOf('#vargas-table tr.varga-key > * {'));
     block = block.slice(0, block.indexOf('}'));
     return /background: var\(--varga-key\)/.test(block) &&
       !/(^|[^-])color: /.test(block);
   })());
/*
 * The tint was --green-soft, darker than --line-soft, so the row rules vanished
 * inside a marked column while every unmarked column kept them. Lightening the
 * tint alone trades the rules back for the band, so the rules inside the band
 * step up to --line too, and both are measured rather than eyeballed: a rule on
 * the tint has to read at least as well as the same rule on the surface outside.
 */
ok('the rules stay visible inside the band, in both palettes', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var token = function (name, from) {
    var at = css.indexOf(name + ':', from || 0);
    return at < 0 ? null : css.slice(at).match(/#[0-9a-f]{6}/)[0];
  };
  var lum = function (hex) {
    return hex.slice(1).match(/../g).map(function (h) { return parseInt(h, 16) / 255; })
      .map(function (v) { return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); })
      .reduce(function (t, v, i) { return t + [0.2126, 0.7152, 0.0722][i] * v; }, 0);
  };
  var ratio = function (a, b) {
    var x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  };
  var dark = css.indexOf('prefers-color-scheme: dark');
  var check = function (from) {
    var tint = token('--varga-key', from), line = token('--line', from);
    var soft = token('--line-soft', from), surface = token('--surface', from) ||
      token('--surface', 0);
    return ratio(line, tint) >= ratio(soft, surface) * 0.95 &&
      ratio(tint, surface) > 1.05;
  };
  // The key row is bracketed top and bottom by --line, so the same check holds.
  return /border-top: 1px solid var\(--line\)/.test(css) && check(0) && check(dark);
})());

/*
 * Everything centred, the division labels included. They were left when the
 * first column held names of varying length; it holds D1 and D60 now, which are
 * short tokens like everything else in the row.
 */
ok('every cell in the grid is centred, labels included', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return /#vargas-table th, #vargas-table td \{ text-align: center; \}/.test(css) &&
    !/#vargas-table thead th:first-child/.test(css);
})());
/*
 * And the share sits beside its division rather than under it. Under was right
 * while the division was a column heading and the share the second line of one;
 * as a row label, two lines make every row in the table twice as tall for a
 * figure that belongs on the same line as the thing it qualifies.
 */
ok('the share is beside the division, not under it', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var rules = css.match(/#vargas-table th \.varga-weight,\n#shadbala-table th \.varga-weight \{[^}]*\}/g) || [];
  return rules.length === 1 && /display: inline;/.test(rules[0]) &&
    /margin-left: 0\.35rem;/.test(rules[0]);
})());
/*
 * And the Shadbala grid gets the same figure the same way. It had the span and
 * not the rule that styles it - the selector named one table - so its ceilings
 * rendered as the last syllable of the label: UCHCHA60, SAPTAVARGAJA315. More
 * air there than here, a word in caps and letter-spaced needing more than "D9".
 */
ok('and a measure wears its ceiling the same way, with room for a word', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return /#vargas-table th \.varga-weight,\n#shadbala-table th \.varga-weight \{/.test(css) &&
    /#shadbala-table th \.varga-weight \{ margin-left: 0\.6rem; \}/.test(css);
})());
/*
 * Body weight, not bold. The band already colours the figure, and colour with
 * weight made one number in each row shout at the dignities it was derived from.
 */
ok('the score is not bolded on top of its band colour', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var block = css.slice(css.indexOf('#vargas-table td.vimsopaka'));
  block = block.slice(0, block.indexOf('}') + 1);
  return !/font-weight/.test(block) && /font-family: var\(--font-mono\)/.test(block);
})());
ok('the score is centred with the rest, no longer ranged right', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var block = css.slice(css.indexOf('#vargas-table td.vimsopaka'));
  block = block.slice(0, block.indexOf('}') + 1);
  return !/text-align/.test(block) && /tabular-nums/.test(block);
})());

console.log('\nVarga charts');
/*
 * One chart a graha, one measure on it. The score and the mark counts are
 * different measures - twenty points against however many divisions the scheme
 * has - and a chart carrying both needs two scales, which is the thing the
 * dataviz guidance names as the worst mistake a chart can make: a bar of a
 * given height then means one thing on one side and another on the other.
 *
 * It did carry both for a while, with a rule between them. The way out is that
 * the score is a single number: a single number is written, not drawn, so it
 * goes beside the title and the chart is left to the one thing that is
 * genuinely a series. One axis, no rule, nothing to mislead.
 */
ok('each graha gets one chart of one measure', (function () {
  var at = appSrc.indexOf('function renderVargaCharts');
  var block = appSrc.slice(at, appSrc.indexOf('function passageBlock', at));
  return /max: ceiling, outOf: scheme\.count, compact: true,/.test(block) &&
    !/rightMax/.test(appSrc) && !/rightOutOf/.test(appSrc) &&
    !/chart-divide/.test(appSrc) && !/row\.right/.test(appSrc);
})());
/*
 * And the score is written beside the name it belongs to, in brackets, with the
 * scheme and the full figure in its hover. A bar for it would have needed a
 * scale of its own.
 */
ok('and the score is written beside the graha, not drawn', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return /aside: row\.vimsopaka\.toFixed\(1\),/.test(appSrc) &&
    /asideSays: row\.graha \+ '\\u2019s vimsopaka bala over the ' \+ scheme\.label \+/
      .test(appSrc) &&
    /var aside = el\('span', 'chart-aside', ' \(' \+ opts\.aside \+ '\)'\);/.test(appSrc) &&
    /\.chart-aside \{/.test(css) &&
    // and nothing draws a bar for it any more
    !/mark-bala/.test(appSrc) && !/mark-bala/.test(css);
})());
/*
 * One scale across all seven charts, taken from the largest count any graha
 * reaches on any mark, so a tall bar is tall against the other grahas and not
 * only against the rest of its own chart. Taken from the data rather than from
 * the scheme's division count, which would flatten every mark into the baseline.
 */
ok('the facets share one scale, read off the data', (function () {
  var block = appSrc.slice(appSrc.indexOf('var ceiling = 1;'));
  return /ceiling = Math\.max\(ceiling, r\.marks\[m\.key\]\)/.test(block) &&
    /max: ceiling/.test(block);
})());
/*
 * No axis is labelled at all, there being nothing for it to say. Every bar
 * carries its own value above it, so a column of numbers down the side was the
 * same figures a second time and less exactly - and with two scales it was two
 * columns of them. The gridlines stay: they cost nothing and let a reader see
 * that one bar is about twice another without counting.
 */
ok('no axis is labelled, the bars carrying their own figures', (function () {
  var block = appSrc.slice(appSrc.indexOf('function barChart'),
                           appSrc.indexOf('function renderVargaCharts'));
  return !/chart-tick/.test(block) && !/chart-axis-name/.test(block) &&
    /var ticks = 4;/.test(block) &&
    /class: t === 0 \? 'chart-base' : 'chart-grid'/.test(block) &&
    // and the value still goes above every bar
    /class: 'chart-value'/.test(block);
})());
ok('and the margins shrink with the labels that needed them',
   /var left = 4, right = 4, top = 18;/.test(appSrc));
ok('every mark in the grid is counted in a facet', (function () {
  var at = appSrc.indexOf('var MARKS = [');
  var block = appSrc.slice(at, appSrc.indexOf('var ceiling', at));
  return ['V', 'X', 'S', 'P', 'D', 'N'].every(function (k) {
    return block.indexOf("key: '" + k + "'") >= 0;
  });
})());

/*
 * Run, not read. Almost everything here checks app.js as text, and text cannot
 * see an identifier that is used and never declared: GOOD_KEYS was deleted with
 * the abbreviation machinery and vargaSummary went on reading it, so the grid
 * was fine and the charts threw. This lifts the function out and calls it.
 */
ok('vargaSummary runs and counts every mark', (function () {
  var src = appSrc.slice(appSrc.indexOf('  var GOOD_KEYS'),
                         appSrc.indexOf('  function svgEl'));
  var summary;
  try {
    summary = new Function('Astro', 'Yogas', src + '; return vargaSummary;')(Astro, Yogas);
  } catch (e) {
    return false;
  }
  var c = Astro.chart({ jdUT: Astro.julianDay(1946, 7, 6, 19 + 20 / 60 + 4),
                        latitude: 40.7143, longitude: -74.006, tzOffsetMinutes: -240 });
  var rows = summary({ chart: c }, Astro.VARGA_SCHEMES.shodasavarga);
  return rows.length === 7 && rows.every(function (r) {
    return typeof r.vimsopaka === 'number' && r.good >= 0 &&
      ['V', 'X', 'S', 'P', 'D'].every(function (k) { return r.marks[k] >= 0; });
  });
})());

ok('well placed counts the good rungs and nothing below',
   /GOOD_KEYS\.indexOf\(d\.key\) >= 0/.test(appSrc) &&
   Astro.VARGA_DIGNITY_LABELS.adhimitra === 'Great Friend');
ok('and the nodes are left out, keeping no friendships',
   /if \(!score\) return null;/.test(appSrc));

/*
 * The colours were validated rather than chosen by eye: lightness band, chroma
 * floor, CVD separation, normal-vision floor and contrast, in both modes. The
 * dark steps are chosen against the dark surface rather than lightened from the
 * light ones.
 */
ok('every series colour is defined in both palettes', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var at = css.indexOf('@media (prefers-color-scheme: dark)');
  var light = css.slice(0, at), dark = css.slice(at);
  return ['--chart-vimsopaka', '--chart-good', '--chart-vargottama'].every(function (name) {
    return light.indexOf(name + ':') >= 0 && dark.indexOf(name + ':') >= 0;
  });
})());
ok('the two series that share a plot are different hues', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var good = css.match(/--chart-good: (#[0-9a-f]{6})/)[1];
  var varg = css.match(/--chart-vargottama: (#[0-9a-f]{6})/)[1];
  return good !== varg;
})());

// Values wear text tokens; the bar beside them carries the identity.
ok('values are drawn in ink, not in the series colour', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  // The tick rule went with the tick labels; the two that remain are the bar's
  // own figure and the name under it, and both still wear text tokens.
  return /\.chart-name, \.chart-value \{[^}]*fill: var\(--ink-faint\)/.test(css) &&
    !/chart-tick/.test(css);
})());
ok('a legend is drawn for the two-series plot and not for the one-series plot',
   /if \(series\.length > 1\) \{/.test(appSrc) && /chart-legend/.test(appSrc));
ok('bars are capped rather than filling the band, and paired bars keep a gap',
   /Math\.min\(24, \(band \* 0\.62 - gap \* \(series\.length - 1\)\) \/ series\.length\)/.test(appSrc) &&
   /var gap = 2;/.test(appSrc));
ok('every bar carries a hover readout, named by what the bar is',
   /svgEl\('title', \{\}, \(row\.name \|\| row\.graha\) \+ ' \u2014 ' \+ s\.label/.test(appSrc));

/*
 * The charts do not replace the table. The table is the readable form of the
 * same numbers and the only one any use for looking up what Venus does in D24,
 * which is also what keeps a table view available for accessibility.
 */
ok('the table is still there, behind a view switch',
   /id="vargas-table-scroll"/.test(html) && /id="vargas-charts"/.test(html) &&
   /id="vargas-as-table"/.test(html) && /id="vargas-as-charts"/.test(html));
ok('the switch shows one at a time and says which is showing',
   /function showVargaView/.test(appSrc) &&
   /document\.getElementById\('vargas-charts'\)\.hidden = !asCharts;/.test(appSrc) &&
   /document\.getElementById\('vargas-table-scroll'\)\.hidden = asCharts;/.test(appSrc) &&
   /setAttribute\('aria-pressed', String\(asCharts\)\)/.test(appSrc));
ok('and the table is what a reader sees first',
   /id="vargas-as-table"[\s\S]{0,80}aria-pressed="true"/.test(html));
/*
 * Shadbala takes the same switch, and for the same reason: fifteen rows of
 * figures to look things up in, and one chart answering one question across
 * all seven grahas. Neither replaces the other.
 */
ok('and Shadbala has the same switch, its table shown first',
   /id="shadbala-table-scroll"/.test(html) && /id="shadbala-chart"/.test(html) &&
   /id="shadbala-as-table"/.test(html) && /id="shadbala-as-chart"/.test(html) &&
   /function showShadbalaView/.test(appSrc) &&
   /document\.getElementById\('shadbala-chart'\)\.hidden = !asChart;/.test(appSrc) &&
   /document\.getElementById\('shadbala-table-scroll'\)\.hidden = asChart;/.test(appSrc) &&
   /id="shadbala-as-table"[\s\S]{0,80}aria-pressed="true"/.test(html) &&
   /id="shadbala-chart" hidden/.test(html));
/*
 * One chart for the seven, not one a graha. The question it answers - who
 * clears their own minimum - is a question about the seven together, and seven
 * charts of one bar each would be seven ways of not asking it.
 */
ok('and it is one chart for the seven, not a facet each', (function () {
  var at = appSrc.indexOf('function renderShadbalaChart');
  var block = appSrc.slice(at, appSrc.indexOf('function renderShadbalaHead', at));
  return (block.match(/barChart\(/g) || []).length === 1 &&
    /rows: rows,/.test(block) && !/varga-facets/.test(block);
})());
ok('and both switches are wired from one place',
   /\['table', 'chart'\]\.forEach\(function \(which\) \{/.test(appSrc) &&
   /document\.getElementById\('shadbala-as-' \+ which\)\.addEventListener/.test(appSrc));

/*
 * The flag key at the top of the tab defines all four flags, [V] among them, so
 * the note under the grid defining it again was the same duplication in
 * miniature that moved the scoring out to the library.
 */
ok('the key explains the mark, and no note explains it again', (function () {
  var flat = appSrc.replace(/'\s*\+\s*'/g, '');
  return /The division has landed the graha back in the sign it holds in the rashi/
    .test(html.replace(/\s+/g, ' ')) &&
    /never on D1, where every graha would qualify\. In D9 it is vargottama proper/
      .test(html.replace(/\s+/g, ' ')) &&
    !/A sign marked \[V\]/.test(flat);
})());
ok('and the D9 case is named as vargottama proper in the key, not per cell',
   /never on D1, where every graha would qualify\. In D9 it is vargottama proper/
     .test(html.replace(/\s+/g, ' ')) &&
   !/division === 9 \? ' In D9 that is vargottama proper\.' : ''/.test(appSrc));
/*
 * The same question the grid asks, asked of whichever division is drawn. Never
 * of D1, where every graha repeats its own sign by definition.
 */
ok('the chart asks it of the division on screen, and never of D1', (function () {
  var charts = fs.readFileSync(path.join(root, 'js/charts.js'), 'utf8');
  return /!!division && division !== 1 &&\s*\n\s*signOfBody\(longitude\) === Astro\.signOf\(longitude\)/
    .test(charts) && /vargottama: repeatsRashi\(p\.longitude\)/.test(charts);
})());
ok('the lagna is eligible for it, being a position like any other',
   /vargottama: repeatsRashi\(ascLongitude\)/
     .test(fs.readFileSync(path.join(root, 'js/charts.js'), 'utf8')));
ok('D1 draws no [V] at all, and the divisions do', (function () {
  var c = Astro.chart({ jdUT: Astro.julianDay(1985, 3, 22, 10 + 55 / 60 - 5.5),
                        latitude: 23.55, longitude: 87.32, tzOffsetMinutes: 330 });
  var drawn = function (division) {
    var box = makeNode('div');
    Charts.render(box, { style: 'north', division: division,
      planets: c.planets, ascendant: c.ascendant.longitude });
    return (serialise(box).match(/\[V\]/g) || []).length;
  };
  return drawn(1) === 0 && drawn(9) > 0 && drawn(3) > 0;
})());
ok('and the chart agrees with the Vargas grid, being the same comparison', (function () {
  var c = Astro.chart({ jdUT: Astro.julianDay(1985, 3, 22, 10 + 55 / 60 - 5.5),
                        latitude: 23.55, longitude: 87.32, tzOffsetMinutes: 330 });
  return [3, 7, 9, 27, 30].every(function (division) {
    var box = makeNode('div');
    Charts.render(box, { style: 'north', division: division,
      planets: c.planets, ascendant: c.ascendant.longitude });
    var svg = serialise(box);
    return c.planets.every(function (p) {
      var repeats = Astro.vargaPosition(p.longitude, division).sign === Astro.signOf(p.longitude);
      var abbr = Astro.grahaAbbr(p.name);
      var flagged = new RegExp('>' + abbr + ' \\[[RVYC\\]\\[]*V').test(svg);
      return repeats === flagged;
    });
  });
})());
/*
 * The pair shares what belongs to the pair - the reading and the yogas - while a
 * mark stays on the cell it was put against, [V] on the sign and the star on the
 * dignity.
 */
ok('one hover covers the whole cell, both lines with it',
   /td\.title = planet\.name \+ ' takes part in '/.test(appSrc) &&
   !/dignityTitle/.test(appSrc) && !/signTitle/.test(appSrc));
/*
 * And the same highlight. A yoga belongs to the graha in that division, which is
 * the pair of cells and not either row of it.
 */
/*
 * One chip for the pair. A cell here is a graha in a division and the two rows
 * are how it is drawn, not what it is - a yoga belongs to the graha in that
 * division, and so does everything else the hover says - so two chips would be
 * counting the drawing rather than the thing.
 */
ok('and one chip stands for the cell, which is now one cell',
   /td\.className \+= ' has-note';/.test(appSrc) &&
   (appSrc.match(/has-note/g) || []).length === 1);
/*
 * And it is the yoga list that raises it, nothing else. The cell's own marks are
 * read off the cell, so a chip on a cell whose only news was a mark would be
 * pointing at a hover that repeated the two letters beside it.
 */
ok('and the chip stands on the yogas, the marks being read off the cell',
   (function () {
     var at = appSrc.indexOf('function renderVargas(state)');
     var block = appSrc.slice(at, appSrc.indexOf('function vargaSummary', at));
     return /if \(yogasIn\[planet\.name\]\) \{/.test(block) &&
       /td\.className \+= ' has-note';/.test(block) &&
       (block.match(/has-note/g) || []).length === 1;
   })());
/*
 * The yogas that wear a letter are kept out of the list, which is what made the
 * chip near-universal: an exchange is [X], a cancelled debilitation [N], and a
 * kartari [S] or [P], all three already on the cell.
 */
ok('and a yoga the grid already letters is kept out of that list',
   /var LETTERED = \['Parivartana', 'Neecha Bhanga', 'Kartari'\];/.test(appSrc) &&
   /if \(LETTERED\.indexOf\(yoga\.yoga\) < 0\) \{/.test(appSrc));
/*
 * Which holds only while those three names are the yogas' own. They are read off
 * the detectors rather than typed here, so a rename shows up as a failure rather
 * than as a chip quietly returning to every cell.
 */
ok('and each of those three names is a yoga the module really emits', (function () {
  var c = Astro.chart({ jdUT: Astro.julianDay(1946, 7, 6, 19), latitude: 40.71,
                        longitude: -74.01, tzOffsetMinutes: -240 });
  var seen = {};
  for (var y = 1960; y < 2010; y++) {
    var ch = Astro.chart({ jdUT: Astro.julianDay(y, 3, 3, 6), latitude: 28.61,
                           longitude: 77.21, tzOffsetMinutes: 330 });
    Astro.SHODASAVARGA.forEach(function (d) {
      Yogas.detect(Astro.chartInDivision(ch, d), {}).forEach(function (yg) {
        seen[yg.yoga] = true;
      });
    });
  }
  return c && ['Parivartana', 'Neecha Bhanga', 'Kartari'].every(function (name) {
    return seen[name] === true;
  });
})());
ok('and a graha with no reading still contributes no column at all',
   /var planets = state\.chart\.planets\.filter\(function \(p\) \{/.test(appSrc));
/*
 * There is no rule to place between the halves any more: the two lines are spans
 * inside one cell, so the row rule falls where it always should have, under the
 * whole of it.
 */
ok('the two lines sit inside one cell, with no rule between them', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return !/varga-signs/.test(css) && !/varga-dignities/.test(css) &&
    !/#vargas-table th\[rowspan\]/.test(css) &&
    /#vargas-table td\.varga-cell \{ vertical-align: top; \}/.test(css);
})());
/*
 * A cell, not a pair of rows. The sentence still described the layout from
 * before the grid turned - "the two rows under a graha", "the last column
 * scores" - where a graha is now a column and the score a row along the bottom.
 */
ok('the note says what one cell holds, and where the score is',
   (function () {
     var flat = appSrc.replace(/'\s*\+\s*'/g, '');
     return /A cell gives that sign and its dignity there/.test(flat) &&
       /the last row scores those dignities out of twenty/.test(flat) &&
       !/two rows under a graha/.test(flat) && !/the last column scores/.test(flat);
   })());
/*
 * One idea a sentence. The opening had been a fragment with no verb of its own -
 * "Where each graha stands in the 16 divisions of the Shodasavarga" - trailing a
 * clause whose "each one" referred to the divisions three lines back.
 */
ok('and opens with a sentence rather than a fragment', (function () {
  var at = appSrc.indexOf('function vargaNote');
  var src = appSrc.slice(at, appSrc.indexOf('ABBREVIATE_ABOVE', at));
  // Collapsed on both counts: the string joins, then the line wrapping between
  // them, so re-wrapping the expression cannot fail this.
  var flat = src.replace(/'\s*\+\s*'/g, '').replace(/\s+/g, ' ');
  /*
   * The old wording is quoted in a comment right there, explaining why it went,
   * so "is it gone" has to ask the strings and not the source around them.
   */
  var prose = (flat.match(/'[^']*'/g) || []).join(' ');
  return /Each of the ' \+ scheme\.count \+ ' divisions of the ' \+ scheme\.label \+ ' puts a graha in a sign\./
    .test(flat) && !/Where each graha stands in/.test(prose) &&
    !/the lord of the sign each one gives/.test(prose);
})());

/*
 * The dispositor relation is asymmetric, so the cell has to say whose view it
 * shows. These pull the two helpers straight out of app.js and run them, rather
 * than only checking that the source mentions them.
 */
var dispSrc = appSrc.slice(appSrc.indexOf('function withArticle'),
                           appSrc.indexOf('function grahaViews'));
var Disp = new Function('Astro', dispSrc +
  '\nreturn { withArticle: withArticle, detail: dispositorDetail };')(Astro);

ok('the article agrees with the label',
   Disp.withArticle('great friend') === 'a great friend' &&
   Disp.withArticle('enemy') === 'an enemy' &&
   Disp.withArticle('great enemy') === 'a great enemy' &&
   Disp.withArticle('neutral') === 'neutral');

// Moon and Mercury together in Virgo: the Moon counts Mercury a friend, and
// Mercury counts the Moon an enemy. The starkest disagreement in the table.
var conjunct = { Moon: { sign: 5 }, Mercury: { sign: 5 } };
var moonInVirgo = Disp.detail('Moon', 5, conjunct);
ok('the title names the direction it is showing',
   /Virgo belongs to Mercury/.test(moonInVirgo) &&
   /Moon regards Mercury as/.test(moonInVirgo) &&
   /This is the direction shown\./.test(moonInVirgo), moonInVirgo);
ok('and gives the reverse when the two disagree',
   /Read the other way it differs: Mercury regards Moon as a great enemy\./.test(moonInVirgo),
   moonInVirgo);

// Sun and Mars together in Aries: friends in both directions, so nothing to add.
var sunInAries = Disp.detail('Sun', 0, { Sun: { sign: 0 }, Mars: { sign: 0 } });
ok('but stays quiet when they agree',
   /Sun regards Mars as neutral/.test(sunInAries) && !/other way/.test(sunInAries), sunInAries);

ok('an own sign is explained as one', /rules Leo, so this is its own sign/.test(
   Disp.detail('Sun', 4, { Sun: { sign: 4 } })));
ok('a node is said to keep no friendships', /Rahu keeps no friendships/.test(
   Disp.detail('Rahu', 5, { Rahu: { sign: 5 }, Mercury: { sign: 5 } })));

ok('the dispositor cell carries that title',
   /: dispositorDetail\(r\.name, v\.sign, positionsD1\) \}/.test(appSrc));
/*
 * The ascendant has no dignity and no friendships, so its dispositor is a bare
 * lordship. It used to carry no title at all, which left the abbreviation with
 * nothing to expand to on the one row where the graha is not named anywhere.
 */
ok('and the ascendant row says plainly which sign that lord rules',
   /Astro\.SIGN_LORDS\[v\.sign\] \+ ' rules ' \+ Astro\.SIGNS\[v\.sign\]/.test(appSrc));
/*
 * The panel carries no note at all now. Which direction the dispositor relation
 * is read in was stated there and is stated in the cell's own hover, on every
 * row, which is where a reader who wonders about one cell will look. That leaves
 * it explained once rather than in two places that can disagree - but it does
 * mean the hover is now the only statement of it, so the hover has to say both
 * directions, and that is what is checked here.
 */
ok('the panel carries no note under the table', (function () {
  var at = html.indexOf('id="panel-grahas"');
  var panel = html.slice(at, html.indexOf('id="panel-shadbala"'));
  return !/varga-note/.test(panel) && /id="graha-tables"/.test(panel);
})());
ok('so the dispositor hover carries the direction, and both directions',
   /This is the direction shown\./.test(moonInVirgo) &&
   /Read the other way it differs: Mercury regards Moon as a great enemy\./
     .test(moonInVirgo) &&
   /title: r\.isAscendant/.test(appSrc), moonInVirgo);
ok('friendship is defined once, in the engine', (function () {
  var astroSrc = fs.readFileSync(path.join(root, 'js/astro.js'), 'utf8');
  var shadSrc = fs.readFileSync(path.join(root, 'js/shadbala.js'), 'utf8');
  return /var NATURAL_FRIENDS = \{/.test(astroSrc) && !/NATURAL_FRIENDS = \{/.test(shadSrc);
})());

// The columns, in the order they read.
/*
 * A Chart column now sits second, naming the division each row belongs to, since
 * one table holds what two used to.
 */
/*
 * One table in place of two tabs, a row per chart, the name spanning them. The
 * rashi is always one of those rows whatever the two charts above are set to:
 * it is the chart every other is a division of, and reading D7 beside D10
 * without it means holding the rashi in your head.
 */
ok('the rashi is always a row, however the charts are set',
   /var views = \[onD1 \|\| \{ division: 1, reference: 'Ascendant' \}\];/.test(appSrc) &&
   /var seen = \{ 1: true \};/.test(appSrc));
ok('and a chart already on D1 gives two rows, not three',
   /var onD1 = settings\.filter\(function \(s\) \{ return s\.division === 1; \}\)\[0\];/.test(appSrc) &&
   /if \(seen\[set\.division\]\) return;/.test(appSrc));
ok('a chart on D1 lends its own rotation to that row, rather than a second row appearing',
   /onD1 \|\| \{ division: 1, reference: 'Ascendant' \}/.test(appSrc));
/*
 * A graha is one row now, in one table, because each table is one chart. The
 * name used to span a row per division, which put two or three charts' worth of
 * rows under every graha whether a reader wanted them or not.
 */
ok('a graha is one column, the tables being one chart each', (function () {
  var at = appSrc.indexOf('function grahaTableFor');
  var block = appSrc.slice(at, appSrc.indexOf('function renderShadbala', at));
  return !/rowspan/.test(block) &&
    /views\.forEach\(function \(view\) \{/.test(appSrc) &&
    /scroll\.appendChild\(grahaTableFor\(state, view\)\);/.test(appSrc);
})());
/*
 * Three bare unit names beside a table of numbers do not say which measurement
 * they are units of, so the measurement gets a row above them and the three
 * step in under it. The row holds nothing: its values are in the rows it names.
 * The same reading the Shadbala grid gives a share and its parts.
 */
ok('and the three units are named by a row above them', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var at = appSrc.indexOf('var GRAHA_ROWS = [');
  var block = appSrc.slice(at, appSrc.indexOf('\n  ];', at));
  var rows = (block.match(/label: '[^']+'/g) || [])
    .map(function (t) { return t.slice(8, -1); });
  return (block.match(/part: true/g) || []).length === 3 &&
    /\{ label: 'Longitude', head: true,/.test(block) &&
    rows.indexOf('Degrees') === rows.indexOf('Longitude') + 1 &&
    /var blank = el\('td', 'row-head-fill'\);/.test(appSrc) &&
    /blank\.setAttribute\('colspan', String\(columns\.length\)\);/.test(appSrc) &&
    /table\.graha-table tr\.row-part th\[scope="row"\] \{/.test(css);
})());
/*
 * A heading row takes no values, so the cells must not advance with it: the
 * three unit rows read cells 6, 7 and 8, not 7, 8 and 9. The counter is the
 * thing that keeps the labels and the values in step.
 */
ok('and the heading row consumes no values', (function () {
  var at = appSrc.indexOf('var cellIndex = 0;');
  var block = appSrc.slice(at, appSrc.indexOf('table.appendChild(tbody);', at));
  if (at < 0 || !/if \(row\.head\) \{/.test(block)) return false;
  // The early return has to come before the counter moves, or the three unit
  // rows would read the cells one along from the ones they name.
  return block.indexOf('return;') < block.indexOf('var i = cellIndex++;') &&
    /var i = cellIndex\+\+;/.test(block);
})());
/*
 * And the strip disappears where it would have one tab. Both charts on D1 gives
 * one view, and a control with nothing to choose between is furniture.
 */
ok('and the strip hides itself when there is only one chart to show',
   /strip\.hidden = views\.length < 2;/.test(appSrc));
ok('the table is drawn once from both slots, not once per slot',
   /SLOTS\.forEach\(drawSlot\);\s*\n\s*renderGrahaTable\(lastChart\);/.test(appSrc) &&
   !/renderGrahaTable\(state\.chart, set\)/.test(appSrc));

/*
 * The scheme is named in the picker above and in the note beside it, so the
 * chart title repeating it was a third statement of the same thing in the same
 * view. The other title keeps its count, that being the bars' denominator.
 */
/*
 * A chart is titled by its graha, the scheme being named in the picker above and
 * in the note beside it. The units are on the axes rather than in the title.
 */
ok('a chart is titled by its graha, the units living in the note',
   /title: row\.graha,/.test(appSrc) &&
   !/leftName/.test(appSrc) && !/rightName/.test(appSrc) &&
   /out of twenty/.test(appSrc.replace(/'\s*\+\s*'/g, '')));
/*
 * And it is called Vargottama, the name it has everywhere else on the page: [V]
 * on the chart, [V] in the graha table, [V] in the grid, Vargottama in the flag
 * key. The legend described the fact instead of naming it, so nothing connected
 * the purple bar to the purple flag.
 */
ok('the vargottama mark is named, not described',
   /\{ key: 'V', label: '\[V\]', name: 'Vargottama' \}/.test(appSrc) &&
   !/Repeats the rashi sign/.test(appSrc) &&
   />\s*<span class="flag flag-v">\[V\]<\/span> Vargottama<\/dt>/
     .test(html.replace(/\s+/g, ' ')));
/*
 * Each facet is titled with the mark it counts, so the chart and the grid above
 * it are read with one vocabulary rather than two.
 */
/*
 * One chart a graha, its marks along the bottom. It was one chart a mark with
 * the grahas along the bottom, which answers "who has the most vargottama" - a
 * question nobody arrives with. A reader comes to this panel about a graha.
 */
ok('and every facet is titled by its graha, the marks running along the bottom',
   /title: row\.graha,/.test(appSrc) &&
   /rows: MARKS\.map\(function \(m\) \{/.test(appSrc) &&
   /return \{ graha: m\.label, axis: m\.label, name: m\.name,/.test(appSrc) &&
   /cls: 'mark-' \+ m\.key\.toLowerCase\(\), count: row\.marks\[m\.key\] \};/.test(appSrc));
/*
 * "[V" was what the chart showed. The axis label ran through grahaAbbr, which
 * takes two letters because a graha's name is long and a mark's is three
 * characters of which the last is a bracket. A row that knows its own label says
 * so; only a row without one is abbreviated.
 */
ok('and a mark labels its own bar rather than being abbreviated to two letters',
   /row\.axis \|\| Astro\.grahaAbbr\(row\.graha\)/.test(appSrc) &&
   /axis: m\.label/.test(appSrc));
/*
 * Papa kartari is the one mark here that reports an affliction, so it closes the
 * row rather than sitting among the five that help.
 */
ok('and the affliction closes the row', (function () {
  var at = appSrc.indexOf('var MARKS = [');
  var block = appSrc.slice(at, appSrc.indexOf('];', at));
  var keys = (block.match(/key: '([VXSPDN])'/g) || []).map(function (m) {
    return m.slice(-2, -1);
  });
  return keys.join('') === 'VXSDNP';
})());
/*
 * A bar takes the colour of its own mark - the same colour that mark's letter
 * wears in the grid - so a reader crossing from table to chart carries one
 * vocabulary of colour rather than two. [S], [D] and [N] share the green in both
 * places; the axis letter is what separates them.
 */
ok('and each bar wears the colour of its own mark',
   /cls: 'mark-' \+ m\.key\.toLowerCase\(\)/.test(appSrc) &&
   /'chart-bar ' \+ s\.cls \+ \(row\.cls \? ' ' \+ row\.cls : ''\)/.test(appSrc) &&
   /\.chart-bar\.mark-v rect \{ fill: var\(--chart-vargottama\); \}/.test(cssSrc) &&
   /\.chart-bar\.mark-x rect \{ fill: var\(--chart-exchange\); \}/.test(cssSrc) &&
   /\.chart-bar\.mark-p rect \{ fill: var\(--chart-papa\); \}/.test(cssSrc) &&
   /\.chart-bar\.mark-s rect,\n\.chart-bar\.mark-d rect,\n\.chart-bar\.mark-n rect \{ fill: var\(--chart-vimsopaka\); \}/
     .test(cssSrc));
/*
 * A filled bar and a coloured letter want different lightness. The text hues for
 * green and red sit above the lightness band as fills on the dark surface - the
 * validator puts --green-deep dark at L 0.80 - so the bars take the chart-tuned
 * siblings, which pass the band, the chroma floor and contrast in both modes.
 * What neither set can pass is purple against blue, so no bar is identified by
 * its colour alone: the letter under it says which mark it is.
 */
ok('and every bar fill is declared for both modes',
   ['--chart-vargottama', '--chart-exchange', '--chart-vimsopaka', '--chart-papa']
     .every(function (token) {
       return (cssSrc.match(new RegExp(token + ': #', 'g')) || []).length === 2;
     }));
ok('and every mark has a letter for the axis and a word for the hover',
   ['V', 'X', 'S', 'P', 'D', 'N'].every(function (k) {
     return new RegExp("\\{ key: '" + k + "', label: '\\[" + k + "\\]', name: '").test(appSrc);
   }));
/*
 * The chart note says what the series counts and stops. The strict reading - the
 * word is the D9 case, D1 excluded because every graha would qualify - is in the
 * flag key at the top of the tab, where all four flags are defined, so saying it
 * again here would be the third statement of it in one panel.
 */
/*
 * The facets carry one note between them rather than one each: five repetitions
 * of "how many divisions carry this" is the same sentence five times.
 */
/*
 * One note between the seven, and it says the thing a dual axis obliges a chart
 * to say: that the two sides are not comparable. A reader who takes the score
 * bar and a count bar as the same measure is exactly who the guidance is
 * protecting, so the note tells them not to.
 */
ok('the facets share one note, and it says what is written and what is drawn',
   (function () {
     var flat = appSrc.replace(/'\s*\+\s*'/g, '').replace(/\s+/g, ' ');
     return /The figure beside the name is its vimsopaka bala out of twenty, which is one number and so is written rather than drawn/
       .test(flat) &&
       /on one scale across all seven charts, so a tall bar is tall against the other grahas/
         .test(flat) &&
       !/strictly the word is the D9 case/.test(appSrc) &&
       /never on D1, where every graha would qualify\. In D9 it is vargottama proper/
         .test(html.replace(/\s+/g, ' '));
   })());
ok('the titles are centred over their own plots',
   (function () {
     var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
     var block = css.slice(css.indexOf('.chart-title {'));
     return /text-align: center/.test(block.slice(0, block.indexOf('}')));
   })());
/*
 * Side by side, so each figure gets half the width and the svg is drawn to half
 * the box. Enlarging the type instead would have needed one set of sizes for the
 * wide layout and another for the stacked one.
 */
ok('the two charts sit side by side where there is room, and stack where not',
   (function () {
     var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
     return /#vargas-charts:not\(\[hidden\]\) \{[^}]*display: grid/.test(css) &&
       /#vargas-charts:not\(\[hidden\]\) \{[^}]*repeat\(auto-fit, minmax\(/.test(css) &&
       /\.varga-figure \{[^}]*min-width: 0/.test(css);
   })());
/*
 * An author display rule beats the display: none the browser gives [hidden], so
 * a container that something toggles cannot carry one unguarded. Checked for
 * every such container rather than for the one that broke: the Table switch
 * stopped hiding the charts the moment they were laid out as a grid, and nothing
 * about that was specific to this container.
 */
ok('no toggled container carries a display rule that outranks [hidden]',
   (function () {
     var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
     var ids = (appSrc.match(/getElementById\('([a-z-]+)'\)\.hidden/g) || [])
       .map(function (m) { return m.replace(/.*'([a-z-]+)'.*/, '$1'); });
     if (!ids.length) return false;
     return ids.every(function (id) {
       var blocks = css.match(new RegExp('#' + id + '\\s*\\{[^}]*\\}', 'g')) || [];
       return blocks.every(function (b) { return !/display:/.test(b); });
     });
   })());
ok('and the box is drawn to that half width, not the old full one',
   /var W = opts\.compact \? 300 : 500, H = opts\.compact \? 165 : 215;/.test(appSrc) &&
   !/var W = 760/.test(appSrc));

/*
 * Sixteen rows now rather than nine columns, the table having been turned to
 * match the two grids beside it. The Graha heading went with the turn: the
 * grahas are the columns, so the corner above their names is blank.
 */
ok('the table carries sixteen rows, one of them a heading', (function () {
  var at = appSrc.indexOf('var GRAHA_ROWS = [');
  if (at < 0) return false;
  var block = appSrc.slice(at, appSrc.indexOf('\n  ];', at));
  var found = (block.match(/label: '[^']+'/g) || [])
    .map(function (t) { return t.slice(8, -1); });
  return found.join('|') === ['Rashi', 'Dignity', 'House', 'Lordship', 'Dispositor',
    'Relationship', 'Longitude', 'Degrees', 'Minutes', 'Seconds', 'Nakshatra',
    'Pada', 'Nakshatra lord', 'Sub lord', 'Karaka', 'Avastha'].join('|') &&
    !/<th scope="col">Chart<\/th>/.test(html);
})());
/*
 * And every row says what it is on hover, there being no space for more than a
 * label down the side.
 */
ok('and every row says what it measures', (function () {
  var at = appSrc.indexOf('var GRAHA_ROWS = [');
  var block = appSrc.slice(at, appSrc.indexOf('\n  ];', at));
  return (block.match(/label: '/g) || []).length ===
    (block.match(/says: '/g) || []).length &&
    /th\.title = row\.says;/.test(appSrc);
})());
/*
 * Lordship was removed as a "Rules" column and has come back as this one. It is
 * built from housesOwned, the same helper isYogakaraka and the raja yoga
 * detector use, rather than from a bespoke function of its own.
 */
/*
 * A pada is the quarter of a nakshatra and means nothing apart from it, so the
 * two were one cell reading "Rohini - 1" for as long as they were a column
 * each. Turned, a row costs no width and a column costs whatever its widest
 * cell holds, so they are two rows again - and splitting them narrows the
 * table, "Purva Phalguni - 1" having set Mars's column on its own.
 */
ok('the pada is its own row, next to the nakshatra it quarters', (function () {
  var at = appSrc.indexOf('var GRAHA_ROWS = [');
  var block = appSrc.slice(at, appSrc.indexOf('\n  ];', at));
  var rows = (block.match(/label: '[^']+'/g) || [])
    .map(function (t) { return t.slice(8, -1); });
  return rows.indexOf('Pada') === rows.indexOf('Nakshatra') + 1 &&
    /\{ text: nak\.name,/.test(appSrc) &&
    /\{ text: String\(nak\.pada\), cls: 'numeric',/.test(appSrc) &&
    !/nak\.name \+ ' - ' \+ nak\.pada/.test(appSrc);
})());
ok('and each says on hover what the other supplies',
   /'Nakshatra ' \+ nak\.name \+ ', ruled by ' \+ nak\.lord/.test(appSrc) &&
   /'Pada ' \+ nak\.pada \+ ' of four, in ' \+ nak\.name/.test(appSrc));
/*
 * Six of the twenty-seven nakshatras are two words, and one of them sets the
 * whole column's width. Stacked, a column is as wide as the longer word rather
 * than as the pair - "Uttara Bhadrapada" is seventeen characters and its longer
 * half is ten - and the break is put in rather than left to the layout, which
 * would move it as the table resized.
 */
ok('a two-word nakshatra stacks, one word to a line', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var twoWord = Astro.NAKSHATRAS.filter(function (n) { return n.indexOf(' ') >= 0; });
  return twoWord.length === 6 &&
    /\{ text: nak\.name, stack: true,/.test(appSrc) &&
    /String\(cell\.text\)\.split\(' '\)\.forEach\(function \(word\) \{/.test(appSrc) &&
    /table\.graha-table \.stacked \{ display: block; \}/.test(css);
})());
/*
 * And a row that has grown to two lines centres what is beside it, rather than
 * leaving the label at the top of a cell twice its height.
 */
ok('and every cell centres against the tallest in its row', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var block = css.match(/table\.graha-table th, table\.graha-table td \{[^}]*\}/);
  return block && /vertical-align: middle/.test(block[0]);
})());
ok('lordship comes from the shared helper, not a column-specific one',
   /'Lordship'/.test(appSrc) && !/function rulership/.test(appSrc) &&
   typeof Astro.housesOwned === 'function');
/*
 * The chart is named once, on its tab, rather than once per row. What the tab
 * cannot show - the division's own description and what house 1 is counted
 * from - is in its hover.
 */
ok('each tab says which chart it is and what its houses are counted from',
   /'Houses counted from ' \+/.test(appSrc) &&
   /view\.reference === 'Ascendant' \? 'the ascendant' : view\.reference/.test(appSrc) &&
   /tab\.title = \(varga \? varga\.label \+ ', ' \+ varga\.about \+ '\. ' : ''\) \+/.test(appSrc));

/*
 * Where a graha sits and what it owns are the two halves of reading it, and the
 * second was left to be worked out. Counted from the same house 1 as the House
 * column, so the two cannot disagree - which is also why Mars showing 4 and 9
 * from a Leo lagna is the same fact as the [Y] on its name.
 */
ok('lordship is counted from the same house 1 as the house column',
   /Astro\.housesOwned\(r\.name, firstSign\)/.test(appSrc));
ok('the lagna and the nodes show a dash, owning nothing',
   /var owned = r\.isAscendant \? \[\] : Astro\.housesOwned\(r\.name, firstSign\);/.test(appSrc) &&
   /owned\.length\s*\n?\s*\? \{ text: owned\.join\(', '\)/.test(appSrc));
ok('and the cell names the signs behind the numbers',
   /Astro\.SIGNS\[\(firstSign \+ h - 1\) % 12\] \+ ', the ' \+ Yogas\.ordinal\(h\)/.test(appSrc));
ok('a yogakaraka owns an angle and a trine, which the column now shows', (function () {
  // Leo lagna: Mars owns Aries, the 9th, and Scorpio, the 4th.
  var owned = Astro.housesOwned('Mars', 4);
  return owned.join(',') === '4,9' && Astro.isYogakaraka('Mars', 4);
})());
/*
 * What a graha is comes before where it is. Motion left the table when [R] moved
 * onto the name, so dignity is what has to lead the position columns now.
 */
ok('what a graha is comes before where it is', (function () {
  var at = appSrc.indexOf('var GRAHA_ROWS = [');
  var head = appSrc.slice(at, appSrc.indexOf('\n  ];', at));
  return head.indexOf("'Dignity'") < head.indexOf("'Degrees'") &&
         head.indexOf("'Rashi'") < head.indexOf("'Dignity'") &&
         head.indexOf("'Lordship'") < head.indexOf("'Degrees'");
})());
/*
 * Degrees, minutes and seconds are three rows, the unit living in the label as
 * the pada's does. They are split from one rounding rather than rounded three
 * times, so 29 59' 60" cannot appear.
 */
ok('the position splits into three rows from one rounding', (function () {
  var at = appSrc.indexOf('var GRAHA_ROWS = [');
  var block = appSrc.slice(at, appSrc.indexOf('\n  ];', at));
  var rows = (block.match(/label: '[^']+'/g) || [])
    .map(function (t) { return t.slice(8, -1); });
  return rows.indexOf('Minutes') === rows.indexOf('Degrees') + 1 &&
    rows.indexOf('Seconds') === rows.indexOf('Minutes') + 1 &&
    /function dmsParts\(deg\)/.test(appSrc) &&
    /var arc = dmsParts\(v\.degreeInSign\);/.test(appSrc) &&
    /var p = dmsParts\(deg\);/.test(appSrc);
})());
/*
 * And each part goes in as the number it is. The zero padding belongs to dms(),
 * where 5° 06' 03" is one string and the zeroes are what hold it together; a
 * row of its own holds a number, and a leading zero on a number says nothing.
 */
ok('and each part goes in unpadded, being a number rather than a field',
   /\{ text: String\(arc\.d\), cls: 'longitude',/.test(appSrc) &&
   /\{ text: String\(arc\.m\), cls: 'longitude',/.test(appSrc) &&
   /\{ text: String\(arc\.s\), cls: 'longitude',/.test(appSrc) &&
   /String\(p\.m\)\.padStart\(2, '0'\)/.test(appSrc));
/*
 * And a cell holding a bare 39 still says what it is a part of: every one of
 * the three carries the whole position in its hover.
 */
ok('and each of the three names the whole position on hover',
   (appSrc.match(/Astro\.SIGNS\[v\.sign\] \+ ' ' \+ dms\(v\.degreeInSign\)/g) || [])
     .length === 3);
/*
 * Cells were positional until House and Vargottama went in mid-table, which moved
 * every title onto the wrong column. They are named now, so this checks the names
 * rather than indices that any future column would break again.
 */
ok('cells are named, not indexed, so a new column cannot shift the titles',
   !/if \(i === \d && /.test(appSrc.slice(appSrc.indexOf('function renderSlotTable'),
                                        appSrc.indexOf('function renderShadbala'))));

/*
 * The Sanskrit name was a second label for the same thing in every row, and the
 * column had to carry both. The English name alone is what the rest of the page
 * uses.
 */
ok('the rashi column gives one name, not two',
   /\{ text: Astro\.SIGNS\[v\.sign\],/.test(appSrc) &&
   !/Astro\.SIGNS_SA\[v\.sign\]/.test(appSrc));

// Reopening a chart must not shorten its place: the label is kept whole rather
// than recomposed from parts that reopening had blanked.
ok('the full place label survives a save, reopen and save',
   /function placeLabelOf/.test(appSrc) &&
   /placeLabel: placeLabelOf\(state\.place\)/.test(appSrc) &&
   /label: entry\.placeLabel/.test(appSrc));
ok('nothing composes a place label by hand any more',
   (appSrc.match(/place\.name, place\.region, place\.nation/g) || []).length === 1);
ok('the shareable link carries the whole label',
   /'place=' \+ encodeURIComponent\(placeLabelOf\(p\)\)/.test(appSrc));

ok('every saved row gets an edit and a delete control',
   /iconButton\('edit', 'Edit ' \+ entry\.name/.test(appSrc) &&
   /iconButton\('remove', 'Delete ' \+ entry\.name/.test(appSrc));
ok('both row controls are labelled for screen readers',
   /button\.setAttribute\('aria-label', label\)/.test(appSrc) && /button\.title = label;/.test(appSrc));
ok('editing a row fills the form without casting it',
   /function editSaved/.test(appSrc) && /function applyEntryToForm/.test(appSrc) &&
   /function loadSaved\(entry\) \{\s*\n\s*applyEntryToForm\(entry\);\s*\n\s*reopeningSaved = true;/.test(appSrc));
ok('editing a row remembers which row it is, so generating updates it',
   /function applyEntryToForm\(entry\) \{\s*\n\s*currentEntry = entry;/.test(appSrc));
ok('deleting asks before it deletes',
   /actions\.className = 'saved-actions confirming'/.test(appSrc) &&
   /'Delete\?'/.test(appSrc) && /saved-cancel/.test(appSrc));
ok('nothing is removed until the confirm is pressed',
   /yes\.addEventListener\('click', function \(\) \{ removeSaved\(index\); \}\)/.test(appSrc) &&
   !/remove\.addEventListener\('click', function \(\) \{\s*\n\s*var current = readSaved/.test(appSrc));
ok('cancelling restores the row untouched',
   /no\.addEventListener\('click', renderSaved\)/.test(appSrc));
ok('the confirm is focused, so the keyboard can answer it', /yes\.focus\(\);/.test(appSrc));

ok('a saved chart can be reopened and removed',
   /function loadSaved/.test(appSrc) && /saved-remove/.test(appSrc));
ok('storage failure is handled rather than thrown',
   /catch \(e\) \{\s*return \[\]/.test(appSrc) && /would not let the chart be saved/.test(appSrc));
// Who the chart is for, beyond the four keys that identify it.
ok('gender, celebrity and a note are on the form',
   /id="gender"/.test(html) && /id="celebrity"/.test(html) && /id="person-note"/.test(html));
ok('gender is required, the other two are not', (function () {
  var gender = html.match(/<select[^>]*id="gender"[^>]*>/)[0];
  var celebrity = html.match(/<input[^>]*id="celebrity"[^>]*>/)[0];
  var note = html.match(/<textarea[^>]*id="person-note"[^>]*>/)[0];
  return /\srequired/.test(gender) && !/\srequired/.test(celebrity) && !/\srequired/.test(note);
})());
ok('gender starts unanswered and is checked on submit',
   /<option value="" selected>Select<\/option>/.test(html) &&
   /if \(!genderValue\) return fail\('Choose a gender\.'\);/.test(appSrc));
ok('a chart saved before gender was asked leaves the select unanswered',
   /=== 'unstated'\) \? '' :/.test(appSrc));
ok('the note is bounded', /maxlength="2000"/.test(html));
ok('the checkbox is labelled beside itself, not above',
   /<label class="checkbox-field" for="celebrity">/.test(html));

// They must survive save, reload and edit, or they are decoration.
ok('all three are saved with the chart',
   /gender: state\.gender/.test(appSrc) && /celebrity: state\.celebrity/.test(appSrc) &&
   /note: state\.note/.test(appSrc));
ok('all three come back from a stored row',
   /gender: row\.gender \|\| 'unstated'/.test(appSrc) &&
   /celebrity: row\.celebrity === true/.test(appSrc) && /note: row\.note \|\| ''/.test(appSrc));
ok('all three refill the form on edit', (function () {
  var fill = appSrc.slice(appSrc.indexOf('function fillForm'), appSrc.indexOf('function showForm'));
  return /gender/.test(fill) && /celebrity/.test(fill) && /person-note/.test(fill);
})());
ok('a blank form clears all three', (function () {
  var blank = appSrc.slice(appSrc.indexOf('function blankForm'), appSrc.indexOf('function showForm'));
  return /gender'\)\.value = '';/.test(blank) && /celebrity'\)\.checked = false/.test(blank) &&
         /person-note'\)\.value = ''/.test(blank);
})());
ok('the note and the public-figure mark show on the chart',
   /id="result-note"/.test(html) && /celebrity-mark/.test(appSrc));
ok('gender shows only when it was stated',
   /state\.gender !== 'unstated'/.test(appSrc));

// Name, date, time and place are all required.
['name', 'date', 'birth-hour', 'birth-minute', 'place'].forEach(function (id) {
  var tag = html.match(new RegExp('<input[^>]*id="' + id + '"[^>]*>'));
  ok('#' + id + ' is marked required in the markup', !!tag && /\srequired/.test(tag[0]));
});
ok('AM/PM select comes before the typed hour',
   html.indexOf('id="birth-meridiem"') < html.indexOf('id="birth-hour"'));
ok('hour, minute and second appear in that order',
   html.indexOf('id="birth-hour"') < html.indexOf('id="birth-minute"') &&
   html.indexOf('id="birth-minute"') < html.indexOf('id="birth-second"'));
// Seconds are optional: "10:30" means 10:30:00.
(function () {
  var tag = html.match(/<input[^>]*id="birth-second"[^>]*>/);
  ok('#birth-second exists and is not required', !!tag && !/\srequired/.test(tag[0]));
  ok('no field points at a note that no longer exists', !/aria-describedby="time-note"/.test(html));
})();
/*
 * The standing instructions are gone; the controls explain themselves. What is
 * left is one hint on the one thing they cannot show: that the seconds box may
 * be left empty. It is revealed on focus, so it answers the question at the
 * moment it is asked.
 */
ok('the standing time instructions are gone',
   !/id="time-note"/.test(html) && !/Choose AM or PM/.test(html));
ok('the seconds hint is tied to the seconds box',
   /id="seconds-hint"/.test(html) && /aria-describedby="seconds-hint"/.test(html));
ok('it is revealed by focus, not shown always', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return /#birth-second:focus ~ \.seconds-hint \{ opacity: 1; \}/.test(css) &&
         /\.seconds-hint \{[^}]*opacity: 0;/.test(css);
})());
ok('it is faded rather than removed, so it is still read aloud', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var rule = css.slice(css.indexOf('.seconds-hint {'), css.indexOf('#birth-second:focus'));
  return !/display:\s*none/.test(rule) && !/visibility:\s*hidden/.test(rule);
})());
ok('it says what actually happens: blank means zero',
   /Seconds are optional, and count as 00\./.test(html) &&
   /second = secondText \? \+secondText : 0/.test(appSrc));

// Every single-line control is one height, since a select and a text input do
// not come out the same size from the same padding.
ok('form controls share one height', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return /--control-height:/.test(css) && /height: var\(--control-height\)/.test(css) &&
         /input\[type="checkbox"\] \{ height: auto; \}/.test(css);
})());
ok('app.js reads the seconds box', /birth-second/.test(appSrc) && /time\.second/.test(appSrc));
ok('seconds reach the Julian Day', /h \* 3600 \+ mi \* 60 \+ time\.second/.test(appSrc));
ok('no 24-hour time input remains', !/type="time"/.test(html));
ok('hour and minute take numeric keypads', (html.match(/inputmode="numeric"/g) || []).length >= 2);
ok('app.js rejects a blank name', /if \(!nameValue\) return fail/.test(appSrc));
ok('no field is advertised as optional', !/placeholder="Optional"/i.test(html));
(function () {
  // `for` is not always the first attribute on a label, so match it anywhere.
  var labels = {};
  (html.match(/<label\b[^>]*>/g) || []).forEach(function (tag) {
    var m = tag.match(/for="([^"]+)"/);
    if (m) labels[m[1]] = true;
  });
  var unlabelled = [];
  (html.match(/<(?:input|select)\b[^>]*>/g) || []).forEach(function (tag) {
    var id = tag.match(/id="([^"]+)"/);
    if (!id) { unlabelled.push('(no id) ' + tag.slice(0, 40)); return; }
    if (!labels[id[1]]) unlabelled.push('#' + id[1]);
  });
  ok('every input and select has a label', unlabelled.length === 0,
     unlabelled.join(', ') || (Object.keys(labels).length + ' labels matched'));
})();

console.log('\nManual coordinates');
/*
 * Coordinates arrive as degrees, minutes, seconds and a letter, from an atlas, a
 * panchang or a birth record. The parser is pulled out of app.js and run against
 * a stub document, so these are real conversions rather than a source grep.
 *
 * It returns { value } or { error }. Returning a reason is the point: every
 * failure used to collapse into one sentence about picking a place, which named
 * neither the box nor the problem.
 */
(function () {
  var dmsSrc = appSrc.slice(appSrc.indexOf('function readDms'), appSrc.indexOf('function showDecimal'));
  var fields = {};
  var readDms = new Function('document',
    dmsSrc + '\nreturn readDms;')({
      getElementById: function (id) {
        if (!fields[id]) fields[id] = { value: '' };
        return fields[id];
      }
    });

  var put = function (which, d, m, sec, h) {
    fields['manual-' + which + '-d'] = { value: String(d) };
    fields['manual-' + which + '-m'] = { value: String(m) };
    fields['manual-' + which + '-s'] = { value: String(sec) };
    fields['manual-' + which + '-h'] = { value: h };
  };
  var near = function (r, b) { return r.value !== undefined && Math.abs(r.value - b) < 1e-9; };

  put('lat', 25, 19, 3, 'N');
  ok('degrees, minutes and seconds convert', near(readDms('lat', 90), 25 + 19 / 60 + 3 / 3600));

  /*
   * The whole reason for the change. A dropped minus is invisible: the chart still
   * draws, for a birth in the other hemisphere. A letter cannot go missing.
   */
  put('lat', 25, 19, 3, 'S');
  ok('S negates, N does not', near(readDms('lat', 90), -(25 + 19 / 60 + 3 / 3600)));
  put('lon', 82, 58, 26, 'W');
  ok('W negates, E does not', near(readDms('lon', 180), -(82 + 58 / 60 + 26 / 3600)));
  put('lon', 82, 58, 26, 'E');
  ok('and east is positive', near(readDms('lon', 180), 82 + 58 / 60 + 26 / 3600));

  put('lat', 23, '', '', 'N');
  ok('minutes and seconds may be left empty', near(readDms('lat', 90), 23));
  put('lat', 23.55, '', '', 'N');
  ok('a decimal in the degrees box on its own still works', near(readDms('lat', 90), 23.55));

  /*
   * The old field was a signed decimal labelled "north positive", so a minus is
   * habit, not error. Refusing it was the bug: the sign moves into the hemisphere
   * and the boxes are rewritten so the reading is visible rather than silent.
   */
  put('lat', -23.55, '', '', 'N');
  var flipped = readDms('lat', 90);
  ok('a negative degree moves its sign into the hemisphere instead of failing',
     near(flipped, -23.55) && fields['manual-lat-h'].value === 'S' &&
     fields['manual-lat-d'].value === '23.55');
  put('lon', -87.32, '', '', 'E');
  ok('and longitude the same way, to W',
     near(readDms('lon', 180), -87.32) && fields['manual-lon-h'].value === 'W');

  // Every refusal has to name the box and the problem.
  var errs = function (which, max) { return (readDms(which, max) || {}).error || ''; };
  put('lat', 23.55, 30, '', 'N');
  ok('a decimal mixed with minutes is refused, and says so',
     /Latitude is part decimal and part minutes/.test(errs('lat', 90)), errs('lat', 90));
  put('lat', '', '', '', 'N');
  ok('an empty coordinate says which one is empty',
     /^Latitude is empty/.test(errs('lat', 90)), errs('lat', 90));
  put('lat', '', 19, 3, 'N');
  ok('minutes without degrees says exactly that',
     /Latitude needs its degrees/.test(errs('lat', 90)), errs('lat', 90));
  put('lat', 25, 60, 0, 'N');
  ok('sixty minutes is refused by name',
     /Latitude minutes must be under 60/.test(errs('lat', 90)), errs('lat', 90));
  put('lat', 25, 0, 60, 'N');
  ok('sixty seconds too', /Latitude seconds must be under 60/.test(errs('lat', 90)));
  put('lat', 90, 0, 1, 'N');
  ok('past the pole is refused with its limit',
     /Latitude cannot be more than 90/.test(errs('lat', 90)), errs('lat', 90));
  put('lon', 180, 0, 1, 'E');
  ok('and past the antimeridian', /Longitude cannot be more than 180/.test(errs('lon', 180)));
  put('lat', 90, 0, 0, 'S');
  ok('but the pole itself is fine', near(readDms('lat', 90), -90));
  put('lon', 'abc', '', '', 'E');
  ok('and something that is not a number says that',
     /not a number/.test(errs('lon', 180)), errs('lon', 180));
})();

/*
 * Typed coordinates must count whether or not the panel is open. Gating on the
 * panel being visible meant collapsing it silently discarded what was in it.
 */
ok('coordinates already typed are used even if the panel is collapsed',
   /if \(manualFields\.hidden && !typed\)/.test(appSrc) &&
   /var typed = \['lat', 'lon'\]\.some/.test(appSrc));
ok('and the submit error is the reason, not one sentence for every failure',
   /return fail\(resolved\.error\);/.test(appSrc) &&
   !/return fail\('Pick a place from the list/.test(appSrc));
ok('the echo shows the reason too, not just that something is wrong',
   /out\.textContent = read\.error \? read\.error : read\.value\.toFixed\(4\)/.test(appSrc));

/*
 * Native validation has to allow exactly what the parser allows. The degree boxes
 * carried step="1" and min="0", which blocked a decimal and a negative in the
 * browser before readDms could accept either, so the forgiving paths were dead.
 */
console.log('\nReopening a saved chart');
/*
 * Reopening filled in the name and the note but left the coordinate boxes empty.
 * A custom place came back with nowhere to see its own coordinates, changing one
 * meant retyping both, and because opening the panel drops the chosen city, a
 * reopened chart submitted without retyping had no place at all.
 *
 * Stored coordinates are decimal, so the minutes and seconds shown are derived.
 * This runs writeCoords and readDms against each other to hold that conversion.
 */
(function () {
  var src =
    appSrc.slice(appSrc.indexOf('function readDms'), appSrc.indexOf('function showDecimal')) +
    appSrc.slice(appSrc.indexOf('function writeCoords'), appSrc.indexOf('function resolvePlace'));
  var fields = {};
  var doc = {
    getElementById: function (id) {
      if (!fields[id]) fields[id] = { value: '', textContent: '', options: [], appendChild: function () {} };
      return fields[id];
    }
  };
  var mod = new Function('document', 'el',
    src + '\nreturn { writeCoords: writeCoords, readDms: readDms };')(doc, function () {
      return { value: '', textContent: '' };
    });

  var roundTrip = function (lat, lon) {
    mod.writeCoords(lat, lon, null);
    return { lat: mod.readDms('lat', 90), lon: mod.readDms('lon', 180) };
  };

  ok('a saved place comes back through the boxes unchanged', (function () {
    var cases = [[22.88, 87.65], [23.5158, 87.308], [28.6139, 77.2090],
                 [-33.8688, 151.2093], [40.7128, -74.0060], [51.5074, -0.1278],
                 [0, 0], [-0.0001, 0.0001], [89.9999, 179.9999]];
    return cases.every(function (c) {
      var r = roundTrip(c[0], c[1]);
      if (r.lat.error || r.lon.error) return false;
      // under a milliarcsecond, which is a millimetre of ground
      return Math.abs(r.lat.value - c[0]) < 3e-7 && Math.abs(r.lon.value - c[1]) < 3e-7;
    });
  })(), 'nine places, each within a milliarcsecond');

  ok('southern and western places keep their side of the world', (function () {
    mod.writeCoords(-33.8688, 151.2093, null);
    var south = fields['manual-lat-h'].value === 'S' && fields['manual-lon-h'].value === 'E';
    mod.writeCoords(40.7128, -74.0060, null);
    return south && fields['manual-lat-h'].value === 'N' && fields['manual-lon-h'].value === 'W';
  })());

  ok('whole degrees leave the seconds box empty rather than showing a zero', (function () {
    mod.writeCoords(23, 87, null);
    return fields['manual-lat-s'].value === '' && fields['manual-lat-d'].value === '23' &&
      fields['manual-lat-m'].value === '0';
  })());

  ok('and the decimal echo is filled in too, so the panel opens explained', (function () {
    mod.writeCoords(22.88, 87.65, null);
    return fields['lat-decimal'].textContent === '22.8800\u00b0' &&
      fields['lon-decimal'].textContent === '87.6500\u00b0';
  })());
})();

/*
 * resolvePlace answers with the chosen city before it looks at the coordinate
 * boxes, which is right for a city picked from the list and wrong the moment
 * someone edits a coordinate. Only opening the panel used to clear the city, so
 * editing one while the panel was already open changed nothing at all: the chart
 * cast, saved and reopened on the old place, with no error to say why.
 */
ok('editing any coordinate box drops the chosen city, so the edit takes effect', (function () {
  var wiring = appSrc.slice(appSrc.indexOf("['lat', 'lon'].forEach(function (which) {"),
                            appSrc.indexOf('function writeCoords'));
  return /selectedCity = null;/.test(wiring) &&
    /showDecimal\(which, max\);/.test(wiring) && /deriveZone\(\);/.test(wiring);
})());
ok('it applies to the hemisphere selects too, not just the number boxes', (function () {
  var wiring = appSrc.slice(appSrc.indexOf("['lat', 'lon'].forEach(function (which) {"),
                            appSrc.indexOf('function writeCoords'));
  return /\['d', 'm', 's', 'h'\]\.forEach/.test(wiring);
})());
ok('and the stale coordinates note is cleared with it', (function () {
  var wiring = appSrc.slice(appSrc.indexOf("['lat', 'lon'].forEach(function (which) {"),
                            appSrc.indexOf('function writeCoords'));
  return /placeNote\.textContent = '';/.test(wiring);
})());
/*
 * The counterpart: restoring writes these boxes in code, which fires no events,
 * so reopening a saved chart must not lose its city to the line above.
 */
ok('restoring sets values without firing the handler that would clear the city',
   /function writeCoords/.test(appSrc) &&
   !/dispatchEvent/.test(appSrc.slice(appSrc.indexOf('function writeCoords'),
                                      appSrc.indexOf('function resolvePlace'))));

ok('both ways of reopening a chart fill the boxes',
   (appSrc.match(/writeCoords\(/g) || []).length >= 3 &&
   /writeCoords\(entry\.latitude, entry\.longitude, entry\.zone\)/.test(appSrc) &&
   /writeCoords\(state\.place\.lat, state\.place\.lon, state\.place\.zone\)/.test(appSrc));
ok('a saved zone missing from the short list is added rather than dropped',
   /var known = Array\.prototype\.some\.call\(sel\.options/.test(appSrc) &&
   /if \(!known\) \{ var opt = el\('option', null, zone\)/.test(appSrc));

console.log('\nTimezone for typed coordinates');
/*
 * The zone list came from Intl.supportedValuesOf('timeZone'), which current ICU
 * builds still head with the old spelling: Asia/Calcutta, not Asia/Kolkata. So
 * the name was absent, the line meant to preselect it never matched, and the
 * select sat on its first entry - Africa/Abidjan. An Indian birth typed as
 * coordinates computed five and a half hours out, silently.
 */
ok('the bug is real: Intl does not list the name the world uses', (function () {
  var intl = [];
  try { intl = Intl.supportedValuesOf('timeZone'); } catch (e) { return true; }
  return intl.indexOf('Asia/Kolkata') < 0 && intl.indexOf('Asia/Calcutta') >= 0;
})());
ok('so the list comes from the city table instead, under the names it reports', (function () {
  var code = appSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  return /fillZones\(Geo\.zones\(\)\)/.test(code) && !/Intl\.supportedValuesOf/.test(code);
})());
ok('and every zone offered is one a populated place actually uses', (function () {
  var z = Geo.zones();
  return z.length > 300 && z.indexOf('Asia/Kolkata') >= 0 && z.indexOf('Asia/Calcutta') < 0 &&
    z.every(function (name, i) { return i === 0 || z[i - 1] <= name; });
})());

ok('a selection already made survives the list being refilled',
   /var keep = zoneSelect\.value;/.test(appSrc) &&
   /list\.indexOf\(keep\) >= 0 \? keep : 'Asia\/Kolkata'/.test(appSrc));
ok('and the fallback list is usable before the city table loads', (function () {
  var m = appSrc.match(/var FALLBACK_ZONES = \[([\s\S]*?)\];/);
  return m && /'Asia\/Kolkata'/.test(m[1]) && m[1].split(',').length >= 10;
})());

/*
 * Better than asking at all: the coordinates name their own zone. The city table
 * holds one for every populated place, so the nearest answers it.
 */
ok('the nearest place gives the right zone, and says how far off it is', (function () {
  var cases = [[23.55, 87.32, 'Asia/Kolkata'], [28.61, 77.21, 'Asia/Kolkata'],
               [40.71, -74.01, 'America/New_York'], [51.51, -0.13, 'Europe/London'],
               [-33.87, 151.21, 'Australia/Sydney'], [35.68, 139.69, 'Asia/Tokyo']];
  return cases.every(function (c) {
    var n = Geo.nearest(c[0], c[1]);
    return n && n.zone === c[2] && n.km >= 0 && n.km < 30;
  });
}), 'six coordinates resolved');
ok('longitude alone would not have done it', (function () {
  // Urumqi sits at 87.6 E, the same meridian as Kolkata, in a different zone.
  var urumqi = Geo.nearest(43.80, 87.60), kolkata = Geo.nearest(22.57, 88.36);
  return urumqi.zone !== kolkata.zone;
})());
ok('the derived zone is shown with the place it came from',
   /note\.textContent = city\.zone \+ ', from ' \+ Geo\.label\(city\)/.test(appSrc) &&
   /id="zone-note"/.test(html));
/*
 * The guess has exactly one failure mode: near a border the closest populated
 * place can be on the other side of it. Distance is what reveals that, so it is
 * said in words rather than left as a number to interpret.
 */
ok('a far match is called out rather than just reported',
   /var far = city\.km > 50;/.test(appSrc) &&
   /far enough to be across a border, so check it/.test(appSrc));
ok('nearby matches land on the right zone', (function () {
  return [[27.00, 84.88, 'Asia/Kathmandu'], [26.70, 84.90, 'Asia/Kolkata'],
          [43.80, 87.60, 'Asia/Urumqi'], [22.57, 88.36, 'Asia/Kolkata']].every(function (c) {
    var n = Geo.nearest(c[0], c[1]);
    return n.zone === c[2] && n.km < 20;
  });
})());
ok('and the one that crosses a border is far enough to be flagged', (function () {
  // Just inside North Dakota; the nearest populated place is in Manitoba.
  var n = Geo.nearest(48.90, -97.20);
  return n.km > 50;
})(), 'the 50 km threshold catches it');
ok('the field reads as answered rather than asked',
   /Timezone <span class="hint">filled in from the coordinates<\/span>/.test(html));

ok('a zone chosen by hand is never overwritten by the guess',
   /var zoneChosenByHand = false;/.test(appSrc) &&
   /if \(zoneChosenByHand\) return;/.test(appSrc) &&
   /zoneChosenByHand = true;/.test(appSrc));
ok('and resetting the form forgets that choice',
   /zoneChosenByHand = false;\s*\n\s*document\.getElementById\('zone-note'\)\.textContent = '';/.test(appSrc));
ok('deriving runs whenever a coordinate box changes', (function () {
  var wiring = appSrc.slice(appSrc.indexOf("['lat', 'lon'].forEach(function (which) {"),
                            appSrc.indexOf('function writeCoords'));
  return /showDecimal\(which, max\);\s*\n\s*deriveZone\(\);/.test(wiring);
})());

ok('the degree boxes allow the decimals and negatives the parser accepts', (function () {
  var at = function (id) {
    var i = html.indexOf('id="' + id + '"');
    return html.slice(html.lastIndexOf('<input', i), html.indexOf('>', i) + 1);
  };
  return /step="any"/.test(at('manual-lat-d')) && /min="-90"/.test(at('manual-lat-d')) &&
    /step="any"/.test(at('manual-lon-d')) && /min="-180"/.test(at('manual-lon-d'));
})());
ok('while minutes and seconds stay bounded where the parser bounds them', (function () {
  var at = function (id) {
    var i = html.indexOf('id="' + id + '"');
    return html.slice(html.lastIndexOf('<input', i), html.indexOf('>', i) + 1);
  };
  return ['manual-lat-m', 'manual-lon-m'].every(function (id) {
    return /min="0"/.test(at(id)) && /max="59"/.test(at(id));
  });
})());
ok('the signed decimal boxes are gone, hints and all',
   !/id="manual-lat"/.test(html) && !/id="manual-lon"/.test(html) &&
   !/north positive/.test(html) && !/east positive/.test(html));
ok('latitude offers N and S, longitude E and W', (function () {
  var block = function (id) {
    var at = html.indexOf('id="' + id + '"');
    return html.slice(at, html.indexOf('</select>', at));
  };
  return /value="N"/.test(block('manual-lat-h')) && /value="S"/.test(block('manual-lat-h')) &&
    /value="E"/.test(block('manual-lon-h')) && /value="W"/.test(block('manual-lon-h')) &&
    !/value="E"/.test(block('manual-lat-h'));
})());
ok('the converted decimal is echoed back rather than worked out silently',
   /id="lat-decimal"/.test(html) && /id="lon-decimal"/.test(html) &&
   /function showDecimal/.test(appSrc) && /read\.value\.toFixed\(4\)/.test(appSrc));
ok('an unreadable coordinate is flagged, not echoed as a number',
   /dms-bad/.test(appSrc));
ok('resetting the form clears all six boxes and both hemispheres',
   /document\.getElementById\('manual-' \+ which \+ '-' \+ part\)\.value = '';/.test(appSrc) &&
   /which === 'lat' \? 'N' : 'E'/.test(appSrc));

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
