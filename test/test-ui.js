/*
 * Front-end tests without a browser. A minimal DOM stub is enough to run the
 * real charts.js and serialise its SVG, and the last section cross-checks every
 * element id and selector app.js reaches for against index.html.
 *
 * Run with: node test/test-ui.js
 */
var fs = require('fs');
var path = require('path');
var os = require('os');
var childProcess = require('child_process');
var root = path.join(__dirname, '..');

// This suite is documented as directly runnable. Generate the ignored Deno
// wrapper here as well as in `npm test`, so a clean checkout honours that.
childProcess.execFileSync(process.execPath,
  [path.join(root, 'scripts/build-edge-module.mjs')], { cwd: root });

var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? '  (' + detail + ')' : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  (' + detail + ')' : '')); }
}

/* ------------------------------------------------------------- DOM stub */

function makeNode(tag) {
  var node = {
    tag: tag, attrs: {}, children: [], textContent: null, parentNode: null,
    setAttribute: function (k, v) { this.attrs[k] = String(v); },
    getAttribute: function (k) { return this.attrs[k]; },
    /*
     * Parentage is modelled because the code depends on it: the chart renderer
     * empties its container on every draw, and whether a node survived that is
     * exactly the question a stub that ignores parentNode cannot be asked.
     * appendChild moves rather than copies, as the real one does.
     */
    appendChild: function (child) {
      if (child.parentNode) {
        var at = child.parentNode.children.indexOf(child);
        if (at >= 0) child.parentNode.children.splice(at, 1);
      }
      child.parentNode = this;
      this.children.push(child);
      return child;
    },
    set innerHTML(v) {
      if (v !== '') return;
      this.children.forEach(function (c) { c.parentNode = null; });
      this.children = [];
    },
    get innerHTML() { return ''; },
    /*
     * Enough of an element to hover over. The card positions itself from the
     * rendered box and measures its own width, so those have to answer
     * something; the numbers do not matter, only that asking does not throw.
     */
    dataset: {}, style: {}, hidden: false, offsetWidth: 0, offsetHeight: 0,
    getBoundingClientRect: function () {
      return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
    },
    listeners: {},
    addEventListener: function (type, fn) {
      (this.listeners[type] || (this.listeners[type] = [])).push(fn);
    },
    fire: function (type, event) {
      (this.listeners[type] || []).forEach(function (fn) { fn(event); });
    }
  };
  node.dataset = {};
  node.style = {};
  node.listeners = {};
  return node;
}
function serialise(node) {
  var attrs = Object.keys(node.attrs).map(function (k) { return ' ' + k + '="' + node.attrs[k] + '"'; }).join('');
  var inner = (node.textContent == null ? '' : node.textContent) +
    node.children.map(serialise).join('');
  return '<' + node.tag + attrs + '>' + inner + '</' + node.tag + '>';
}
var document = {
  createElementNS: function (ns, tag) { return makeNode(tag); },
  createElement: function (tag) { return makeNode(tag); },
  // A text node is a child like any other here; only its text is ever read.
  createTextNode: function (text) {
    var n = makeNode('#text'); n.textContent = text; return n;
  }
};

/* ------------------------------------------------- load the real modules */

global.PERTURBATIONS = require('../data/perturbations.js');
global.FREQUENCIES = require('../data/frequencies.js');
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
    /*
     * A retrograde graha keeps its own colour. Repainting the label put two
     * facts on one channel and let the second erase the first: four retrograde
     * grahas came out the same red with their own colours gone, while a direct
     * Mars wore a near-identical red meaning something else. The nodes, always
     * retrograde, never showed their colours at all. [R] carries it now, as
     * [V], [Y] and [C] carry theirs - asserted on the line below.
     */
    ok(tag + ': a retrograde graha keeps its own colour',
       !/ retro"/.test(svg) && /class="planet graha-[a-z]+"/.test(svg));
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

console.log('\nWhat a chart slot recomputes when it is rotated');
/*
 * The bug this guards: a slot rotated onto a graha moved its houses, its House
 * column and its [Y] flag, but went on marking the yogas it had found from the
 * ascendant. The hover card then carried "counted from house 1 of this chart"
 * directly above a list counted from a different house 1.
 */
(function () {
  var src = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  ok('the slot hands its rotation to the yogas, not just its division',
     /yogas: yogasByGraha\(state, set\.division, set\.reference\)/.test(src));
  ok('and yogasByGraha detects from the chosen reference, Moon and Sun',
     /function yogasByGraha\(state, division, reference\)/.test(src) &&
     /\[reference \|\| 'Ascendant', 'Moon', 'Sun'\]/.test(src) &&
     /rotatedOnto\(base, from\)/.test(src));
  ok('coincident reference houses are detected only once',
     /var seenSigns = \{\}/.test(src) && /if \(seenSigns\[sign\]\) return/.test(src));
  /*
   * Dignity, friendship and hemming are facts about a graha and its neighbours,
   * not about where the houses are counted from, so they take the division only.
   * Stated as a test so a later change does not rotate them by symmetry.
   */
  ok('dignity and hemming stay out of it, being rotation-independent',
     /dignities: dignitiesByGraha\(state, set\.division, tatkalikaSetting\(\), horaSetting\(\),\s*\n?\s*horaMercurySetting\(\)\)/.test(src) &&
     /hemming: hemmingByGraha\(state, set\.division\)/.test(src));
  ok('the Yogas tab is unaffected, reading the whole chart from the ascendant',
     /function renderYogas\(state\)/.test(src) &&
     !/renderYogas\(state, [a-z]/.test(src));
})();

console.log('\nThe tatkalika setting, end to end');
(function () {
  var src = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  var page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  ok('the page offers the setting and opens on the division',
     /<select id="tatkalika"/.test(page) &&
     /<option value="varga" selected>/.test(page.slice(page.indexOf('id="tatkalika"'))));
  ok('and the rashi is the other option, not a third state',
     (page.slice(page.indexOf('id="tatkalika"'), page.indexOf('</select>',
       page.indexOf('id="tatkalika"'))).match(/<option /g) || []).length === 2);
  ok('the page reads it in one place',
     /function tatkalikaSetting\(\) \{\s*\n\s*return document\.getElementById\('tatkalika'\)\.value;/.test(src));
  /*
   * The grid, the chart card and shadbala all have to move together, or the
   * page would show one reading and score another.
   */
  ok('the vimsopaka grid takes it',
     /Astro\.vargaDignity\(planet\.name, planet\.longitude, division, positionsD1,\s*\n\s*tatkalikaSetting\(\), horaSetting\(\),\s*\n?\s*horaMercurySetting\(\)\)/.test(src));
  ok('the chart card takes it', /dignitiesByGraha\(state, set\.division, tatkalikaSetting\(\), horaSetting\(\),\s*\n?\s*horaMercurySetting\(\)\)/.test(src));
  ok('the varga summary takes it', /vargaSummary\(state, scheme, tatkalikaSetting\(\), horaSetting\(\),\s*\n?\s*horaMercurySetting\(\)\)/.test(src));
  // Including the figure at the foot of the grid, which is scored over the
  // same cells and would otherwise be a total of a column nobody is looking at.
  ok('and so does the vimsopaka total beneath the cells',
     (src.match(/Astro\.vimsopaka\(planet\.name, planet\.longitude, scheme, positionsD1,/g) || [])
       .length === 2 &&
     !/Astro\.vimsopaka\(planet\.name, planet\.longitude, scheme, positionsD1\)/.test(src));
  ok('and shadbala takes it', /tatkalika: tatkalikaSetting\(\)/.test(src));
  /*
   * Changing it changes figures rather than wording, so the cached strengths
   * have to be dropped. It rides with the settings that already do that.
   */
  /* The hora setting rides the same wiring, and has to reach the same places. */
  ok('the page offers the hora reading too, opening on the verse',
     /<select id="hora-dignity"/.test(page) &&
     /<option value="effects" selected>/.test(page.slice(page.indexOf('id="hora-dignity"'))));
  ok('and it is read in one place, like the other',
     /function horaSetting\(\) \{\s*\n\s*return document\.getElementById\('hora-dignity'\)\.value;/.test(src));
  ok('the grid, the card, the summary and the total all take it',
     /positionsD1,\s*\n\s*tatkalikaSetting\(\), horaSetting\(\),\s*\n?\s*horaMercurySetting\(\)\)/.test(src) &&
     /dignitiesByGraha\(state, set\.division, tatkalikaSetting\(\), horaSetting\(\),\s*\n?\s*horaMercurySetting\(\)\)/.test(src) &&
     /vargaSummary\(state, scheme, tatkalikaSetting\(\), horaSetting\(\),\s*\n?\s*horaMercurySetting\(\)\)/.test(src));
  // Shadbala takes it too, so saptavargaja grades its hora the way the grid does.
  ok('and shadbala takes the hora reading as well as the tatkalika one',
     /tatkalika: tatkalikaSetting\(\),\s*\n\s*horaDignity: horaSetting\(\),\s*\n\s*horaMercury: horaMercurySetting\(\)/.test(src));
  ok('changing the hora reading redraws too', /\['hora-dignity', \{ effects:/.test(src));
  /* Mercury's own clause is a setting of its own, in the test tab. */
  ok('Mercury in the hora is offered too, defaulting to the verse\u2019s wording',
     /<select id="hora-mercury"/.test(page) &&
     /<option value="friend" selected>/.test(page.slice(page.indexOf('id="hora-mercury"'))) &&
     (page.slice(page.indexOf('id="hora-mercury"'),
       page.indexOf('</select>', page.indexOf('id="hora-mercury"'))).match(/<option /g) || [])
       .length === 4);
  /*
   * The default is the verse's wording now, so the warning belongs to the
   * option that has no text behind it rather than to the default. Both halves
   * are asserted: the unsourced reading still says so, and the note still
   * admits that the reference charts do not agree with each other.
   */
  ok('the unsourced reading still says no text asks for it', (function () {
    // Whitespace-normalised: the sentence wraps across lines in the markup.
    var at = page.indexOf('id="why-hora-mercury"');
    var note = page.slice(at, page.indexOf('</p>', at)).replace(/\s+/g, ' ');
    return /no classical text asks for it/i.test(note) &&
      /fitted to observation rather than taken from an authority/.test(note);
  })());
  ok('and it says the reference charts disagree rather than hiding it', (function () {
    var at = page.indexOf('id="why-hora-mercury"');
    var note = page.slice(at, page.indexOf('</p>', at)).replace(/\s+/g, ' ');
    return /do not agree/.test(note) &&
      /no reading of the clause satisfies all three/.test(note);
  })());
  /*
   * The fourth reading is the verse's own wording against its translator's
   * note: the six "give pronounced effects" where Budh "is effective", which is
   * a weaker claim and not a stronger one. Both are offered because the two
   * disagree inside one book.
   */
  ok('and the note on it is offered against the verse',
     /<option value="both">/.test(page) && /<option value="solar">/.test(page) &&
     Astro.HORA_MERCURY.FRIEND === 'friend' &&
     Astro.horaEffect('Mercury', 3, 3, 'friend') === 'mitra' &&
     Astro.horaEffect('Mercury', 4, 3, 'friend') === 'mitra' &&
     Astro.horaEffect('Mercury', 3, 3, 'both') === 'adhimitra');
  ok('the page reads it, and hands it everywhere the hora reading goes',
     /function horaMercurySetting\(\)/.test(src) &&
     (src.match(/horaMercurySetting\(\)/g) || []).length >= 6);
  ok('changing it drops the cached strengths and redraws',
     /\['tatkalika', \{ varga:/.test(src) &&
     src.indexOf("['tatkalika', { varga:") < src.indexOf('lastChart.shadbala = null;',
       src.indexOf("['tatkalika', { varga:")));
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
  ok('seven charts ship', charts.length === 7, charts.map(function (c) { return c.name; }).join(', '));

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
    if (hit) {
      // A label the combobox offers has to carry that place's own numbers, or
      // a digit lost out of a coordinate would never be noticed.
      ok(entry.name + ': coordinates and zone match the place the combobox offers',
         Math.abs(hit.lat - entry.latitude) < 1e-4 &&
         Math.abs(hit.lon - entry.longitude) < 1e-4 && hit.zone === entry.zone,
         hit.lat + ', ' + hit.lon + ' / ' + hit.zone);
    } else {
      /*
       * Villages below the gazetteer's floor are entered by coordinate, which is
       * a supported way to use the app rather than a lapse. There is no row to
       * check them against, so the test is that they land where they claim to:
       * near a town this table does carry, in that town's zone.
       */
      var near = Geo.nearest(entry.latitude, entry.longitude);
      ok(entry.name + ': the place is off the gazetteer but lands beside a town on it',
         !!near && near.km < 25 && near.zone === entry.zone,
         near ? Geo.label(near) + ' ' + near.km.toFixed(1) + ' km, ' + near.zone : 'nothing near');
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
  var ratzinger = named('Pope Benedict XVI'), nixon = named('Richard Nixon');
  var blair = named('Tony Blair');
  ok('each chart checked below is still in the list',
     !!trump && !!kareem && !!ava && !!obama && !!ratzinger && !!nixon && !!blair);
  if (!trump || !kareem || !ava || !obama || !ratzinger || !nixon || !blair) return;

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

  var rc = cast(ratzinger);
  ok('Benedict: 26 Aquarius rises in Purva Bhadrapada',
     rc.ascendant.signName === 'Aquarius' && Math.floor(rc.ascendant.longitude % 30) === 26 &&
     rc.ascendant.nakshatra.name === 'Purva Bhadrapada',
     rc.ascendant.signName + ' ' + (rc.ascendant.longitude % 30).toFixed(2) +
     ' ' + rc.ascendant.nakshatra.name);
  /*
   * Keeping the village rather than the nearest town is only worth the trouble
   * if it is right, so it is checked the one way it can be: against what the
   * published charts print. They give a tropical ascendant of 19 Pisces 12, and
   * two arcminutes is the whole disagreement.
   */
  var rTropical = (rc.ascendant.longitude + rc.ayanamsa) % 30;
  ok('Benedict: the tropical ascendant agrees with the references to two arcminutes',
     Astro.SIGNS[Math.floor(((rc.ascendant.longitude + rc.ayanamsa) % 360) / 30)] === 'Pisces' &&
     Math.abs(rTropical - (19 + 12 / 60)) < 2 / 60,
     rTropical.toFixed(4) + ' of Pisces, references give ' + (19 + 12 / 60).toFixed(4));
  ok('Benedict: 1927 Bavaria keeps Central European Time, with no summer time',
     Geo.offsetMinutes(ratzinger.zone, 1927, 4, 16, 4, 15) === 60,
     Geo.formatOffset(Geo.offsetMinutes(ratzinger.zone, 1927, 4, 16, 4, 15)));
  var rp = {};
  rc.planets.forEach(function (planet) { rp[planet.name] = planet; });
  ok('Benedict: Jupiter in the lagna, a degree and a half above the rising point',
     rp.Jupiter.signName === 'Aquarius' && rp.Jupiter.house === 1 &&
     rp.Jupiter.longitude - rc.ascendant.longitude > 0 &&
     rp.Jupiter.longitude - rc.ascendant.longitude < 2,
     (rp.Jupiter.longitude - rc.ascendant.longitude).toFixed(2) + ' degrees');
  ok('Benedict: Sun exalted in Aries, Venus in its own sign in Taurus',
     rp.Sun.signName === 'Aries' && rp.Sun.dignity === 'Exalted' &&
     rp.Venus.signName === 'Taurus' && rp.Venus.dignity === 'Own Sign');
  ok('Benedict: Mercury debilitated in Pisces in the 2nd',
     rp.Mercury.signName === 'Pisces' && rp.Mercury.dignity === 'Debilitated' &&
     rp.Mercury.house === 2);
  ok('Benedict: Saturn retrograde in Scorpio in the 10th',
     rp.Saturn.signName === 'Scorpio' && rp.Saturn.house === 10 && rp.Saturn.retrograde === true);
  ok('Benedict: Hasta birth nakshatra leaves under two years of Moon dasha',
     rc.dashas.birthNakshatra.name === 'Hasta' && rc.dashas.balanceYears < 2,
     rc.dashas.birthNakshatra.name + ', ' + rc.dashas.balanceYears.toFixed(2) + ' years');
  /*
   * Elected April 2005, resigned February 2013. The Ketu mahadasha sits inside
   * that almost exactly, which is the reason this chart is worth shipping.
   */
  var rket = dashaStart(rc, 'Ketu'), rven = dashaStart(rc, 'Venus');
  ok('Benedict: Ketu dasha runs November 2005 to November 2012',
     rket && rket.y === 2005 && rket.m === 11 && rven && rven.y === 2012 && rven.m === 11,
     (rket ? rket.y + '-' + rket.m : '?') + ' to ' + (rven ? rven.y + '-' + rven.m : '?'));

  var nc = cast(nixon);
  ok('Nixon: 24 Leo rises in Purva Phalguni',
     nc.ascendant.signName === 'Leo' && Math.floor(nc.ascendant.longitude % 30) === 24 &&
     nc.ascendant.nakshatra.name === 'Purva Phalguni',
     nc.ascendant.signName + ' ' + (nc.ascendant.longitude % 30).toFixed(2) +
     ' ' + nc.ascendant.nakshatra.name);
  var nTropical = (nc.ascendant.longitude + nc.ayanamsa) % 30;
  ok('Nixon: the tropical ascendant agrees with the references to an arcminute',
     Astro.SIGNS[Math.floor(((nc.ascendant.longitude + nc.ayanamsa) % 360) / 30)] === 'Virgo' &&
     Math.abs(nTropical - (17 + 25 / 60)) < 2 / 60,
     nTropical.toFixed(4) + ' of Virgo, references give ' + (17 + 25 / 60).toFixed(4));
  ok('Nixon: January 1913 California is eight hours behind, before any summer time',
     Geo.offsetMinutes(nixon.zone, 1913, 1, 9, 21, 35) === -480,
     Geo.formatOffset(Geo.offsetMinutes(nixon.zone, 1913, 1, 9, 21, 35)));
  /*
   * Four grahas in one sign is why this chart is in the set: it is the only one
   * that makes a house stack two columns, so the layout is exercised by
   * something that ships rather than only by a chart somebody types in.
   */
  var np = {};
  nc.planets.forEach(function (planet) { np[planet.name] = planet; });
  var stellium = ['Sun', 'Mars', 'Mercury', 'Jupiter'];
  ok('Nixon: the Sun, Mars, Mercury and Jupiter all stand in Sagittarius, in the 5th',
     stellium.every(function (g) {
       return np[g].signName === 'Sagittarius' && np[g].house === 5;
     }), stellium.map(function (g) { return np[g].signName; }).join(', '));
  ok('and no other shipped chart crowds a house that hard', (function () {
    var most = 0;
    charts.forEach(function (entry) {
      if (entry.name === 'Richard Nixon') return;
      var count = {};
      cast(entry).planets.forEach(function (planet) {
        count[planet.sign] = (count[planet.sign] || 0) + 1;
        if (count[planet.sign] > most) most = count[planet.sign];
      });
    });
    return most < 4;
  })(), 'the rest peak below four to a sign');
  ok('Nixon: Jupiter is in its mooltrikona there',
     np.Jupiter.dignity === 'Mooltrikona', np.Jupiter.dignity);
  ok('Nixon: Dhanishta birth nakshatra leaves under five years of Mars dasha',
     nc.dashas.birthNakshatra.name === 'Dhanishta' && nc.dashas.balanceYears < 5,
     nc.dashas.birthNakshatra.name + ', ' + nc.dashas.balanceYears.toFixed(2) + ' years');
  /*
   * Mercury opens in November 1970. The break-in was June 1972 and the
   * resignation August 1974, so the whole of it falls inside that mahadasha.
   */
  var nmer = dashaStart(nc, 'Mercury'), nket = dashaStart(nc, 'Ketu');
  ok('Nixon: Mercury dasha runs November 1970 to November 1987',
     nmer && nmer.y === 1970 && nmer.m === 11 && nket && nket.y === 1987 && nket.m === 11,
     (nmer ? nmer.y + '-' + nmer.m : '?') + ' to ' + (nket ? nket.y + '-' + nket.m : '?'));

  var bc = cast(blair);
  ok('Blair: 11 Taurus rises in Rohini',
     bc.ascendant.signName === 'Taurus' && Math.floor(bc.ascendant.longitude % 30) === 11 &&
     bc.ascendant.nakshatra.name === 'Rohini',
     bc.ascendant.signName + ' ' + (bc.ascendant.longitude % 30).toFixed(2) +
     ' ' + bc.ascendant.nakshatra.name);
  var bTropical = (bc.ascendant.longitude + bc.ayanamsa) % 30;
  ok('Blair: the tropical ascendant agrees with the references to three arcminutes',
     Astro.SIGNS[Math.floor(((bc.ascendant.longitude + bc.ayanamsa) % 360) / 30)] === 'Gemini' &&
     Math.abs(bTropical - (4 + 50 / 60)) < 3 / 60,
     bTropical.toFixed(4) + ' of Gemini, references give ' + (4 + 50 / 60).toFixed(4));
  /*
   * May is inside British Summer Time, so this clock is an hour ahead of GMT.
   * The zone lookup has to know that, and has to know that January is not.
   */
  ok('Blair: May 1953 in Britain is summer time, and January is not',
     Geo.offsetMinutes(blair.zone, 1953, 5, 6, 6, 10) === 60 &&
     Geo.offsetMinutes(blair.zone, 1953, 1, 6, 6, 10) === 0,
     Geo.formatOffset(Geo.offsetMinutes(blair.zone, 1953, 5, 6, 6, 10)));
  /*
   * Taking the clock as GMT does not merely move the lagna a sign, it drops it
   * two arcminutes inside the next one. This is the sharpest case in the set for
   * why the reading of a clock time is a question worth asking.
   */
  var asGmt = cast(blair, 0);
  ok('Blair: read as GMT the lagna lands two arcminutes into Gemini',
     asGmt.ascendant.signName === 'Gemini' && asGmt.ascendant.longitude % 30 < 3 / 60,
     asGmt.ascendant.signName + ' ' + ((asGmt.ascendant.longitude % 30) * 60).toFixed(1) +
     ' arcminutes in');
  var bp = {};
  bc.planets.forEach(function (planet) { bp[planet.name] = planet; });
  ok('Blair: the Sun exalted in Aries and Venus exalted in Pisces',
     bp.Sun.signName === 'Aries' && bp.Sun.dignity === 'Exalted' &&
     bp.Venus.signName === 'Pisces' && bp.Venus.dignity === 'Exalted');
  ok('Blair: Mars with Jupiter in Taurus in the lagna',
     bp.Mars.signName === 'Taurus' && bp.Jupiter.signName === 'Taurus' &&
     bp.Mars.house === 1 && bp.Jupiter.house === 1);
  ok('Blair: Moon with Rahu in Capricorn in the 9th',
     bp.Moon.signName === 'Capricorn' && bp.Rahu.signName === 'Capricorn' &&
     bp.Moon.house === 9);
  ok('Blair: Shravana birth nakshatra leaves under four years of Moon dasha',
     bc.dashas.birthNakshatra.name === 'Shravana' && bc.dashas.balanceYears < 4,
     bc.dashas.birthNakshatra.name + ', ' + bc.dashas.balanceYears.toFixed(2) + ' years');
  /*
   * Jupiter to February 1998, so the seat in 1983, the leadership in 1994 and
   * the election of May 1997 all fall in it, with Saturn taking the premiership.
   */
  var bjup = dashaStart(bc, 'Jupiter'), bsat = dashaStart(bc, 'Saturn');
  ok('Blair: Jupiter dasha runs February 1982 to February 1998',
     bjup && bjup.y === 1982 && bjup.m === 2 && bsat && bsat.y === 1998 && bsat.m === 2,
     (bjup ? bjup.y + '-' + bjup.m : '?') + ' to ' + (bsat ? bsat.y + '-' + bsat.m : '?'));
})();

(function () {
  var src = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  ok('reference charts are not inserted into a database-backed saved list',
     !/seedStudyCharts\(\)/.test(src) && !/SEED_KEY/.test(src));
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
// The table is 60,000 places. What matters is that no script tag pulls it in
// at load; naming the file in a comment is not loading it.
ok('cities.js is loaded lazily, not in index.html',
   !/<script[^>]*src="[^"]*cities\.js/.test(html) &&
   fs.readFileSync(path.join(root, 'js/geo.js'), 'utf8').indexOf("'data/cities.js'") > 0);

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
ok('every icon button is labelled for screen readers', (function () {
  var buttons = html.match(/<button[^>]*class="icon-button"[^>]*>/g) || [];
  return buttons.length === 3 && buttons.every(function (b) {
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
  // Seven since the yogas became a table, its rows headed by the yoga's name.
  return (appSrc.match(/setAttribute\('scope', 'row'\)/g) || []).length === 7 &&
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
 * three go on the sign.
 *
 * [Y], [D] and [N] used to hang off the lordship, house and dignity cells. Four
 * rows each carrying a bracketed letter is a lot of punctuation to scan past
 * for signs and house numbers, and all three are now said in full on the
 * graha's card, where there is room for the reason. What is left here is what
 * is about the sign the cell names.
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
    /'V' : null/.test(after('Astro.SIGNS[v.sign]')) &&
    !/graha-chart/.test(block);
})());
ok('and the three that qualified a graha rather than a sign are gone from it',
   (function () {
     var at = appSrc.indexOf('function grahaTableFor');
     var block = appSrc.slice(at, appSrc.indexOf('function renderShadbala', at));
     return !/'Y' : null/.test(block) && !/'D' : null/.test(block) &&
       !/'S' : null/.test(block) && !/'P' : null/.test(block) &&
       !/cell\.star/.test(appSrc) && !/star: /.test(block) &&
       // and the work those marks needed is not done for nothing
       !/Yogas\.neechaBhanga/.test(block) && !/chartInDivision/.test(block);
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
ok('yogakaraka follows house 1 of the chart being drawn',
   /yogakaraka: Astro\.isYogakaraka\(p\.name, firstSign\)/.test(
     fs.readFileSync(path.join(root, 'js/charts.js'), 'utf8')) &&
   !/rashiLagna/.test(appSrc));
/*
 * The lagna owns nothing, so it never reaches the lordship cell that carries
 * the flag: without houses owned the cell is a dash and the flag has nowhere
 * to sit.
 */
ok('and the lagna owns nothing, so its lordship cell is a dash',
   /var owned = r\.isAscendant \? \[\] : Astro\.housesOwned\(r\.name, firstSign\);/
     .test(appSrc) &&
   /: \{ text: '–', cls: 'numeric' \}/.test(appSrc));
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
  var names = ['saved', 'add', 'chart', 'lesson', 'settings', 'testing'];
  var strip = stripHtml('Sections');
  ok('the section strip holds six tabs', (strip.match(/role="tab"/g) || []).length === 6);
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
     (strip.match(/tabindex="-1"/g) || []).length === 5);
  ok('the tab strip is keyboard navigable',
     /ArrowRight/.test(appSrc) && /ArrowLeft/.test(appSrc) && /'Home'/.test(appSrc) && /'End'/.test(appSrc));
  ok('the chart tab has something to say when empty', /id="empty-chart"/.test(html));
  ok('generating moves you to the chart tab and clears the form',
     /showChart\(\);\s*\n[\s\S]{0,200}blankForm\(\);/.test(appSrc));
  /*
   * The chart opens the tab, not the click. Opening it up front meant a submit
   * that was refused left the reader on an empty chart panel with the reason
   * written into a box on the tab they had just been taken off.
   */
  ok('opening a saved chart lands on the chart tab, once there is a chart',
     /reopeningSaved = true;\s*\n\s*recordOpening\(entry\);/.test(appSrc) &&
     !/reopeningSaved = true;[\s\S]{0,120}activateTab\('chart'\)/.test(appSrc) &&
     /function showChart\(\) \{[\s\S]{0,140}activateTab\('chart'\);/.test(appSrc));
  ok('and a refusal follows the reader to the tab that can answer it',
     /var panel = document\.getElementById\('panel-add'\);\s*\n\s*if \(panel && panel\.hidden\) activateTab\('add'\);/
       .test(appSrc));
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
     (appSrc.match(/setupTabs\(/g) || []).length === 4 &&
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
/*
 * A card, not a row. Three short facts given a whole screen width made a list
 * of ten into ten lines of mostly empty space, with the edit and the delete at
 * the far edge of each. The cards find their own number per row.
 */
ok('saved charts are cards that fit several to a row', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var block = css.slice(css.indexOf('.saved-list {'), css.indexOf('.saved-card {'));
  return /display: grid;/.test(block) &&
    /grid-template-columns: repeat\(auto-fill, minmax\(14rem, 1fr\)\);/.test(block) &&
    /el\('li', 'saved-card'\)/.test(appSrc);
})());
/*
 * Who, when, where, reading down in the order anyone asks them.
 */
ok('and each card stacks the name, the moment and the place in that order',
  (function () {
    var at = appSrc.indexOf('function savedCard(entry)');
    var block = appSrc.slice(at, appSrc.indexOf('function renderSaved()', at));
    var name = block.indexOf("el('span', 'saved-name', entry.name)");
    var born = block.indexOf("el('p', 'saved-born', formatSavedMoment(entry))");
    var place = block.indexOf("el('p', 'saved-place', entry.placeLabel)");
    return name > 0 && born > name && place > born;
  })());
/*
 * The three icons sit over the card's corner rather than taking a column, so
 * the card's own padding keeps the name clear of them - except while the delete
 * is asking, when the pair needs the width of a sentence and takes the card.
 */
ok('and the icons sit on the card rather than in a column of their own',
  (function () {
    var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
    var block = css.slice(css.indexOf('.saved-actions {'), css.indexOf('.saved-icon {'));
    return /position: absolute;/.test(block) &&
      /\.saved-actions\.confirming \{[^}]*position: static;/.test(css) &&
      /\.saved-card \{[^}]*padding-right: 5\.4rem;/.test(css.replace(/\n/g, ''));
  })());
/* The keyboard gets a real name button; a pointer gets the whole visible card. */
ok('the whole card opens, while the name remains a keyboard button',
   (function () {
     var at = appSrc.indexOf('function savedCard(entry)');
     var block = appSrc.slice(at, appSrc.indexOf('function renderSaved()', at));
     return /open\.appendChild\(el\('span', 'saved-name', entry\.name\)\)/.test(block) &&
       /li\.addEventListener\('click'/.test(block) && /loadSaved\(entry\);/.test(block) &&
       /closest\('\.saved-actions'\)/.test(block) &&
       !/saved-meta/.test(block);
   })());

/*
 * The card lights up, and the name underlines. The card is the thing being
 * pointed at; the name is the thing that will act on a click, and the two
 * affordances say so separately.
 */
ok('the card marks the hover and carries the pointer', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return /\.saved-open:hover,\n\.saved-open:focus-visible \{ border-bottom-color: currentColor; \}/
    .test(css) && /\.saved-card:hover \{ border-color: var\(--green\)/.test(css) &&
    /\.saved-card \{[\s\S]*?cursor: pointer;/.test(css) &&
    !/\.saved-item/.test(css);
})());

/*
 * Searching the list, and only once there are enough rows for finding one to be
 * work. A box that never helps is a control taking space from what it filters.
 */
/*
  * By name, which is what the row shows. Matching a hidden field would
  * highlight a row with nothing in it to explain why it matched.
  */
ok('saved kundalis can be searched, by the one thing the row shows', (function () {
  var at = appSrc.indexOf('function renderSaved()');
  var block = appSrc.slice(at, appSrc.indexOf('function removeSaved', at));
  return /id="saved-filter"/.test(html) && /id="saved-search"/.test(html) &&
    /\(entry\.name \|\| ''\)\.toLowerCase\(\)\.indexOf\(term\) >= 0/.test(block) &&
    !/placeLabel \|\| ''\)\.toLowerCase\(\)\.indexOf\(term\)/.test(block) &&
    /field\.addEventListener\('input', renderSaved\)/.test(appSrc);
})());
ok('and the box stays hidden until the list is long enough to need it', (function () {
  var at = appSrc.indexOf('function renderSaved()');
  var block = appSrc.slice(at, appSrc.indexOf('function removeSaved', at));
  return /var SEARCH_FROM = 6;/.test(appSrc) &&
    /box\.hidden = all\.length < SEARCH_FROM/.test(block);
})());
/*
 * The delete finds its row rather than counting to it. The list is drawn
 * sorted and filtered, so a row's place on screen has not been its place in
 * storage since either of those existed, and an index taken off the drawn list
 * deletes whoever happens to sit at that position in the stored one: the worst
 * kind of bug here, silent and on the only copy of the data.
 */
ok('deleting while searching removes the row that was asked for', (function () {
  var at = appSrc.indexOf('function removeSaved');
  var block = appSrc.slice(at, appSrc.indexOf('function formatSavedMoment', at));
  return /function removeSaved\(entry\)/.test(block) &&
    /if \(sameRecord\(current\[i\], entry\)\) at = i;/.test(block) &&
    /if \(at < 0\) \{ renderSaved\(\); return; \}/.test(block) &&
    !/function removeSaved\(index\)/.test(appSrc);
})());
/*
  * And the rules that sized those two went with them. A selector nothing emits
  * is a claim about a layout that is gone.
  */
ok('no rule is left for the two the row no longer prints', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return !/\.saved-where \{/.test(css) && !/\.saved-when \{/.test(css) &&
    !/\.saved-meta \{/.test(css) && !/saved-meta/.test(appSrc);
})());
/*
 * Including the separator that kept them from reading as one phrase. There is
 * no phrase any more: the title spells both out with its own commas.
 */
ok('and the separator between them went with them', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return !/\.saved-when::before/.test(css) && !/saved-when/.test(css);
})());

/*
 * The flag is drawn twice and no longer the same way: a star on the card, the
 * words on the chart. The pill was the width of some of the names beside it,
 * which on a card is most of a line spent on something true of a third of them.
 *
 * Both still come from one constant, which is what stopped them drifting when
 * one said "study" and the other "public figure" - each half of the form's own
 * label - and the star's title and label spell the same words out for anyone
 * who cannot see it or does not know what it means.
 */
/*
 * The chart says it in words; the list says it by which tab the card is in.
 *
 * The star is gone, and so is the key line that explained it. A mark that is
 * true of every card in a tab and of none in the other carries no information:
 * it was answering the question the tab now answers, in a second place and in
 * a way that needed a legend underneath to be read at all.
 */
ok('the chart spells it out and the list sorts by it instead',
   /var CELEBRITY_MARK = 'public figure';/.test(appSrc) &&
   (appSrc.match(/el\('span', 'celebrity-mark', CELEBRITY_MARK\)/g) || []).length === 1 &&
   !/CELEBRITY_STAR/.test(appSrc) && !/celebrity-star/.test(appSrc + cssSrc) &&
   !/'celebrity-mark', 'study'/.test(appSrc));
/*
 * The key explains the marks that are on the cards and no others: a line about
 * the star when something is starred, a line about the flag when something is
 * flagged, and nothing at all when neither is.
 */
ok('and the key explains the one mark that is left',
   /key\.hidden = !key\.firstChild;/.test(appSrc) &&
   /list\.some\(function \(entry\) \{ return entry\.flagged; \}\)/.test(appSrc) &&
   /\.saved-key-item \{ display: block; \}/.test(cssSrc));
/*
 * The form, the star's tooltip and the key all say the same three words. The
 * qualification that used to follow - "kept for study" - said the same thing a
 * second time in a longer way, and said it three times over.
 */
ok('and it matches what the form asks and the tab that collects them',
   /<span>A public figure<\/span>/.test(html) &&
   // What a reader can see: markup outside comments, and quoted strings. The
   // phrase still explains the split in the comments, which is where it earns
   // its keep.
   !/kept for study/.test(html.replace(/<!--[\s\S]*?-->/g, '') +
     (appSrc.match(/'[^'\n]*'/g) || []).join(' ')) &&
   /id="tab-figures"[^>]*>Public figures/.test(html.replace(/\s+/g, ' ')) &&
   /id="tab-mine"[^>]*>Your kundalis/.test(html.replace(/\s+/g, ' ')));
/*
 * And the tick shares the place's row rather than trailing the note. It is one
 * of the things a chart is filed by, not an afterthought to a paragraph.
 */
ok('the public figure tick sits beside the place, not under the note',
   html.indexOf('id="celebrity"') > html.indexOf('id="place"') &&
   html.indexOf('id="celebrity"') < html.indexOf('id="person-note"') &&
   /\.field-place \{ grid-column: span 2; \}/.test(cssSrc));
/*
 * A tick carries no label, so without a stand-in for the row a label occupies
 * it would ride up level with the labels beside it instead of the inputs.
 */
ok('and it is levelled against the inputs rather than the labels',
   /<span class="label-spacer" aria-hidden="true"><\/span>/.test(html) &&
   /\.label-spacer \{ display: block; height: 0\.9rem; margin-bottom: 0\.4rem; \}/.test(cssSrc) &&
   /\.field-mark \.checkbox-field \{ margin: 0; min-height: var\(--control-height\); \}/.test(cssSrc));

// Saved kundalis: the list, and the four keys that identify an entry.
ok('the saved list and its empty state are both present',
   /id="saved-list"/.test(html) && /id="saved-empty"/.test(html));
/*
 * The button under the saved list is gone: the tab strip already carries "Add
 * a kundali", and two ways in that look different and do the same thing is one
 * too many.
 *
 * What it uniquely did has to survive it, though. It was the only caller of
 * showForm(true), which clears currentEntry; without that, generating after an
 * edit would have patched the row the last chart came from instead of making
 * its own, silently rewriting somebody else's record. Reaching for the tab
 * yourself now does it, and only then - editSaved and the chart's edit button
 * arrive in code and both mean to keep the row they came from.
 */
/*
 * Reset, beside Generate, for a chart begun and thought better of.
 *
 * Deliberately not <button type="reset">. The browser's own reset restores the
 * values written in the markup and knows nothing of the city chosen, the zone
 * looked up, or the saved row being edited - it would leave a form that looks
 * empty while still carrying all three, and the next chart generated would be
 * written over that row.
 */
ok('a reset sits beside generate and is not the browser\'s own',
   /<button type="button" class="secondary" id="reset-form">Reset<\/button>/.test(html) &&
   // Outside comments: the comment above the button explains why it is not one.
   !/type="reset"/.test(html.replace(/<!--[\s\S]*?-->/g, '')) &&
   html.indexOf('id="reset-form"') > html.indexOf('>Generate chart<') &&
   /getElementById\('reset-form'\)\.addEventListener\('click', startFreshChart\)/.test(appSrc));
ok('and it clears the same three things the tab does, from one place',
   (appSrc.match(/function startFreshChart\(\)/g) || []).length === 1 &&
   (appSrc.match(/startFreshChart\(\)/g) || []).length === 2 &&
   /button\.secondary \{/.test(cssSrc));

ok('the add button is gone, the tab having always been there',
   !/id="add-kundali"/.test(html) && !/add-kundali/.test(cssSrc) &&
   !/addButton/.test(appSrc));
ok('and asking for the form yourself still starts a new chart',
   /if \(name === 'add' && byUser\) startFreshChart\(\);/.test(appSrc) &&
   /function startFreshChart\(\) \{\s*\n\s*blankForm\(\);\s*\n\s*currentEntry = null;/
     .test(appSrc) &&
   /buttons\[name\]\.addEventListener\('click', function \(\) \{ activate\(name, false, true\); \}\)/
     .test(appSrc) &&
   /options\.onChange\(name, byUser === true\)/.test(appSrc));
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
   /editButton\.addEventListener/.test(appSrc));
ok('saved charts sync to the database as well as this browser',
   /astro_charts|functions\/v1\/kundalis/.test(appSrc) && /action: 'save'/.test(appSrc) &&
   /action: 'list'/.test(appSrc) && /action: 'delete'/.test(appSrc));
ok('ownership is a minted token, not an account',
   /randomUUID/.test(appSrc) && /ownerToken/.test(appSrc));
ok('the ownership capability never falls back to predictable randomness',
   /getRandomValues/.test(appSrc) &&
   !/Date\.now\(\)\.toString\(36\) \+ Math\.random/.test(appSrc));
ok('saved-list mutations run one at a time in the order they were made',
   /var kundaliMutations = \[\];/.test(appSrc) &&
   /if \(kundaliMutationRunning \|\| !kundaliMutations\.length\) return;/.test(appSrc) &&
   /kundaliMutations\.push\(\{ payload: payload, done: done \}\)/.test(appSrc));
ok('the startup list cannot overwrite a mutation begun while it was in flight',
   /var beforeMutations = kundaliMutationGeneration;/.test(appSrc) &&
   /if \(beforeMutations !== kundaliMutationGeneration\) return;/.test(appSrc));
ok('a flag cannot be toggled again while its first change is unresolved',
   /if \(pendingFlagChanges\[pendingKey\]\) return;/.test(appSrc) &&
   /flag\.disabled = !!pendingFlagChanges/.test(appSrc));
ok('the database replaces the cache instead of uploading old local-only charts', (function () {
  var sync = appSrc.slice(appSrc.indexOf('(function syncSavedCharts()'),
                          appSrc.indexOf('if (!Geo.historicalZonesSupported())'));
  return /action: 'list'/.test(sync) && /writeSaved\(entries\.map\(fromRow\)\)/.test(sync) &&
    !/action: 'save'/.test(sync) && !/orphans|failed|merged/.test(sync);
})());
ok('if the database cannot answer, the last cache stays visible', (function () {
  var sync = appSrc.slice(appSrc.indexOf('(function syncSavedCharts()'),
                          appSrc.indexOf('if (!Geo.historicalZonesSupported())'));
  return /if \(!entries\) return;/.test(sync);
})());
ok('the failed-save message no longer promises a browser-only save',
   !/Saved in this browser\. Syncing was not possible\./.test(appSrc) &&
   /saveFeedback\.textContent = 'Save not confirmed\.';/.test(appSrc));
ok('entries are keyed on name, place, date and time',
   /entry\.name, entry\.placeLabel, entry\.date, entry\.time/.test(appSrc));
ok('a local copy is written first so the panel works offline',
   /writeSaved\(list\)/.test(appSrc) && /localStorage/.test(appSrc));
// Editing has to refill the form and then update the row it came from.
// A privacy claim that has stopped being true is worse than none.
ok('the save status reserves no space when silent',
   /\.save-feedback:empty \{ display: none; \}/.test(fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8')));

/*
 * The credit is a licence condition, not a footnote. data/cities.js is the
 * GeoNames table, used under CC BY 4.0, which requires attribution wherever
 * the data goes. The rest of what stood in the footer was discretionary and is
 * gone; this line cannot be.
 */
ok('the GeoNames credit survives whatever else leaves the footer',
   /Place data from <a href="https:\/\/www\.geonames\.org\/"[^>]*>GeoNames<\/a>, CC BY 4\.0\./
     .test(html) &&
   !/Whole-sign \(Parashari\) houses/.test(html) &&
   !/clearing site data unlinks them/.test(html));

ok('the page claims nothing about data staying put',
   !/sent nowhere|No data leaves this page|never leave the machine/.test(html + appSrc));

// The guard is against a possessive heading, "Barack Obama's chart", which is
// what the page is anyway. Matched on the apostrophe rather than on the letter
// before the space, which any sentence ending in "this chart" tripped.
ok('the chart heading is the name alone',
   /heading\.textContent = state\.name;/.test(appSrc) && !/'s chart/.test(appSrc));

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
   /yogaName\.title = finding\.manifestation/.test(appSrc) &&
   /finding\.manifestation = articleOpening\(/.test(
     fs.readFileSync(path.join(root, 'js/yogas.js'), 'utf8')));
/*
 * The column the redesign is for. Whose yoga it is and who takes part in it are
 * different questions, and the page only ever asked the second: Shubha Vesi is
 * Mercury's doing, the Sun only marking where to count from, and listing both
 * put it on the Sun's card as though the Sun had done something.
 */
/*
 * Graha first. The question the table is read with is "what has this graha
 * got", and the column answering it was third, behind two that describe the
 * finding rather than place it.
 */
ok('the table names the graha a yoga resolves to, apart from its participants',
   /\['Graha', 'Chart', 'From', 'Yoga', 'Result'\]\.forEach/.test(appSrc) &&
   /el\('th', 'yoga-group', 'Yoga probability'\)/.test(appSrc) &&
   /\['This manifestation', 'Overall'\]\.forEach/.test(appSrc) &&
   /finding\.graha \? 'yoga-graha' : 'yoga-graha is-shared'/.test(appSrc) &&
   /\(finding\.grahas \|\| \[\]\)\.join\(', '\)/.test(appSrc));
ok('family remains detector metadata and is not rendered as a user-facing column',
   !/'Family', 'Result'/.test(appSrc) && !/'yoga-family'/.test(appSrc));
ok('the yoga result comes from the database’s constrained effect field', (function () {
  var migration = fs.readFileSync(path.join(root,
    'supabase/migrations/20261001000100_astro_readings_effect.sql'), 'utf8');
  var seed = fs.readFileSync(path.join(root, 'supabase/seed/astro_readings_yogas.sql'), 'utf8');
  var api = fs.readFileSync(path.join(root, 'supabase/functions/readings/index.ts'), 'utf8');
  return /effect in \('good', 'bad', 'mixed'\)/.test(migration) &&
    /update astro_readings set effect = case/.test(seed) &&
    /source,effect/.test(api) && /passage\.effect/.test(appSrc);
})());
ok('the Yogas tab offers graha, chart and reference filters in that order',
   html.indexOf('for="yoga-graha"') < html.indexOf('for="yoga-division"') &&
   html.indexOf('for="yoga-division"') < html.indexOf('for="yoga-reference"') &&
   /rotatedOnto\(inDivision, from\)/.test(appSrc));
/*
 * And the labels are gone from sight, each control saying what it is in the
 * option it is showing. They stay in the document for a screen reader, which
 * has no option text to read until the control is reached.
 */
ok('the filters carry no visible labels, only readable ones',
   /<label class="visually-hidden" for="yoga-graha">/.test(html) &&
   /<label class="visually-hidden" for="yoga-division">/.test(html) &&
   /<label class="visually-hidden" for="yoga-reference">/.test(html) &&
   /'Every divisional chart'/.test(appSrc) && /'From every planet'/.test(appSrc) &&
   /'From the ascendant'/.test(appSrc));
ok('the findings note does not explain the folded catalogue or point elsewhere',
   !/Everything this page checks for is listed under the findings/.test(appSrc) &&
   !/The Lesson tab explains/.test(appSrc));
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
  var rows = [], unbalanced = [], misaligned = [];
  files.forEach(function (f) {
    var src = fs.readFileSync(path.join(root, 'supabase/seed', f), 'utf8');
    var inserts = (src.match(/insert into astro_readings/g) || []).length;
    var conflicts = (src.match(/on conflict/g) || []).length;
    if (inserts !== conflicts || !inserts) unbalanced.push(f);
    var keys = src.match(/^\('([a-z]+)', '([^']+)', '([^']+)',/gm) || [];
    var orders = src.match(/,\s*(\d+)\)(?:,|\s*\n\s*\n\s*on conflict)/g) || [];
    /*
     * Both patterns are positional, so a row whose terminator is spelt
     * "700)\n," instead of "700)," silently drops an order and shifts every
     * row after it. That has happened three times while hand-editing these
     * files; counting per file names the culprit instead of leaving a bare
     * "some passage has no sort order" to hunt down.
     */
    if (keys.length !== orders.length) misaligned.push(
      f + ' (' + keys.length + ' rows, ' + orders.length + ' sort orders)');
    keys.forEach(function (k, i) {
      var m = k.match(/^\('([a-z]+)', '([^']+)', '([^']+)',/);
      var o = orders[i] && orders[i].match(/(\d+)\)/);
      rows.push({ file: f, topic: m[1], subject: m[2], condition: m[3],
                  order: o ? +o[1] : null });
    });
  });

  ok('every seed row terminator parses, so orders line up with rows',
     misaligned.length === 0, misaligned.join('; ') || files.length + ' files');
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

  /*
   * This asked that no topic hold more than half the passages, and yogas passed
   * it until twelve combinations from Raman were added at once. The count is a
   * poor proxy for dominance: yogas are subdivided one passage per named
   * combination, where twelve houses share six passages and the whole of
   * shadbala shares seventeen. Granularity is not weight.
   *
   * What the rule was protecting is that the library not become a yoga
   * encyclopaedia with token coverage of everything else, so that is what is
   * asserted now - every topic carries real coverage, and no topic is so large
   * that the rest together are a footnote to it.
   */
  ok('every topic carries real coverage rather than a token passage', (function () {
    var counts = {};
    rows.forEach(function (r) { counts[r.topic] = (counts[r.topic] || 0) + 1; });
    return Object.keys(counts).every(function (t) { return counts[t] >= 2; });
  })(), (function () {
    var counts = {};
    rows.forEach(function (r) { counts[r.topic] = (counts[r.topic] || 0) + 1; });
    return Object.keys(counts).map(function (t) { return t + ' ' + counts[t]; }).join(', ');
  })());
  ok('and no topic outweighs everything else put together', (function () {
    var counts = {};
    rows.forEach(function (r) { counts[r.topic] = (counts[r.topic] || 0) + 1; });
    return Object.keys(counts).every(function (t) {
      return counts[t] <= (rows.length - counts[t]) * 1.5;
    });
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
ok('the Yogas tab does not show the detector catalogue',
   !/id="yoga-catalogue"/.test(html) &&
   !/function renderYogaCatalogue/.test(appSrc));
ok('and the yoga check is handed the strengths it needs',
   /Yogas\.detect\(rotatedOnto\(inDivision, from\), strengths\)/.test(appSrc) &&
   /var inDivision = Astro\.chartInDivision\(state\.chart, division\)/.test(appSrc) &&
   /function strengthsFor/.test(appSrc));
/*
 * And a finding carries where it was read rather than the table printing the
 * selection into every row. The same yoga found in D1 from the ascendant and
 * in D9 from the Moon are two statements, and a column showing the picker
 * would claim they were one.
 */
ok('each finding records the chart and the reference it was found in',
   /f\.inChart = varga \? varga\.name : 'D' \+ division;/.test(appSrc) &&
   /f\.from = from === 'Ascendant' \? 'Asc' : from;/.test(appSrc) &&
   /el\('td', 'yoga-chart', finding\.inChart\)/.test(appSrc) &&
   /el\('td', 'yoga-from', finding\.from\)/.test(appSrc));
ok('shadbala is computed once per chart, so the tab and the yoga agree',
   /if \(!state\.shadbala\)/.test(appSrc) &&
   (appSrc.match(/Shadbala\.compute\(/g) || []).length === 1);
ok('matched conditions and user-facing prose are separate fields',
   /finding\.manifestation = articleOpening\(/.test(
     fs.readFileSync(path.join(root, 'js/yogas.js'), 'utf8')) &&
   /reasons: reasons/.test(fs.readFileSync(path.join(root, 'js/yogas.js'), 'utf8')));
/*
 * And a condition already stated in the summary is not stated again under it.
 *
 * A one-condition finding usually gives its condition in the summary and
 * lists it again below, so the two run together as a sentence said twice.
 * Over a sweep of 4,332 reason lines, 711 - one in six, across twenty-two
 * different findings - are contained in their own summary, so this is a shape
 * the detectors fall into rather than a fault in one of them.
 */
ok('and presentation never joins the matched-condition bullets',
   !/finding\.reasons.*join/.test(appSrc) &&
   /yogaName\.title = finding\.manifestation/.test(appSrc));
/*
 * And the fragments are set as sentences. They are written to be read in a
 * list, so a bare space ran them into one another: "rather than on a house
 * worth protecting Saturn also owns the 9th".
 */
ok('and the manifestation is the Yoga cell’s hover, never assembled at render time',
   /yogaName\.title = finding\.manifestation/.test(appSrc) &&
   !/'Manifestation'/.test(appSrc));
/*
 * And the commonest finding of all does not say its condition twice in two
 * different wordings. Its summary names both lords and both houses, so the
 * reason carries only what the summary leaves out, which is which of them is
 * the angle and which the trine - the part the rule turns on.
 *
 * Only this one is cut. The overlap is the shape of summary-and-reasons
 * generally: over 4,332 reason lines, 958 share four fifths of their words
 * with their own summary. A threshold that dropped them would also drop the
 * Kesari note that this is Phaladeepika's yoga and not Parashara's, which
 * shares every word with its summary and says something the summary does not.
 */
ok('the angle-trine reason adds the classification rather than restating', (function () {
  var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
  var seen = 0, restated = 0;
  for (var y = 1950; y < 2025; y += 6) {
    var c = Astro.chart({ jdUT: Astro.julianDay(y, 6, 15, 3), latitude: 28.61,
      longitude: 77.21, tzOffsetMinutes: 330 });
    Yogas.detect(c, Shadbala.compute(c, place)).forEach(function (f) {
      if (f.subject !== 'Raja Yoga') return;
      seen++;
      // The lords are named once, in the summary, and not again below it.
      (f.reasons || []).forEach(function (r) {
        if (/\brules the\b/.test(r)) restated++;
      });
    });
  }
  return seen > 0 && restated === 0;
})());
ok('and still says which houses are the angles and which the trines',
  /' are angles' : ' is an angle'/.test(fs.readFileSync(path.join(root, 'js/yogas.js'), 'utf8')));

/* The manifestation field serves every division and reference frame. */
ok('and the other yogas read cleanly across divisions and reference frames', (function () {
  var bad = [], seen = {};
  var rotate = function (chart, reference) {
    if (reference === 'Ascendant') return chart;
    var anchor = chart.planets.filter(function (p) { return p.name === reference; })[0];
    var turned = Object.assign({}, chart, { reference: reference,
      ascendant: Object.assign({}, anchor) });
    turned.planets = chart.planets.map(function (p) {
      return Object.assign({}, p, { house: ((p.sign - anchor.sign + 12) % 12) + 1 });
    });
    return turned;
  };
  for (var y = 1930; y < 2030; y += 11) {
    var rashi = Astro.chart({ jdUT: Astro.julianDay(y, 6, 15, 3), latitude: 28.61,
      longitude: 77.21, tzOffsetMinutes: 330 });
    var strength = Shadbala.compute(rashi,
      { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 });
    [1, 9, 30].forEach(function (division) {
      var chart = division === 1 ? rashi : Astro.chartInDivision(rashi, division);
      ['Ascendant', 'Moon', 'Sun'].forEach(function (reference) {
        Yogas.detect(rotate(chart, reference), strength)
          .forEach(function (finding) {
            var account = finding.manifestation;
            seen[finding.title] = true;
            if (!account || /\.\s+[a-z]|[.!?]{2,}|\s[.,;]/.test(account)) {
              bad.push(finding.title + ': ' + account);
            }
          });
      });
    });
  }
  return Object.keys(seen).length > 40 && bad.length === 0;
})());

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
  // The aspects table, which is the one with an Aspects column.
  var m = appSrc.match(/\[('Graha'[^\]]*'Aspects'[^\]]*)\]\s*\n?\s*\.forEach\(function \(h\)/);
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
    var jd = Astro.julianDay(1990, 6, 15, q * 0.25 - 5.5);
    var c = Astro.chart({ jdUT: jd, latitude: place.latitude,
                          longitude: place.longitude,
                          tzOffsetMinutes: place.tzOffsetMinutes });
    var r = Shadbala.compute(c, place);
    // Against the sundial at that longitude, which is the clock the rule means.
    var hour = Astro.localApparentTime(jd, place.longitude);
    for (var i = 0; i < Shadbala.GRAHAS.length; i++) {
      var g = Shadbala.GRAHAS[i];
      if (Math.abs(r.grahas[g].kala.nathonnatha - byText(g, hour)) > 1e-6) return false;
    }
  }
  return true;
})());
/*
 * And the clock is the sundial at the birthplace, not the timezone. Raman
 * section 48 asks for both corrections by name: "Midday of any place is the
 * local noon when the Sun passes over its meridian. The Hindus consider the
 * apparent noon ... if birth time is marked in local mean time, it must be
 * converted into the apparent time by applying equation of time."
 *
 * A timezone is the wrong clock twice over - an administrative band, and mean
 * time rather than apparent. It was worth up to 14 virupas at the western edge
 * of a wide zone.
 */
ok('and it is measured by the sundial, not the timezone', (function () {
  var shadSrc = fs.readFileSync(path.join(root, 'js/shadbala.js'), 'utf8');
  /*
   * The clock is a setting now, since widely used software reckons it by the
   * zone and a row differing for that reason is easy to mistake for a
   * difference of method. But the sundial is what Raman asks for at section
   * 48, so it has to be what you get without asking.
   */
  if (!/return Astro\.localApparentTime\(jd, place\.longitude\);/.test(shadSrc)) {
    return false;
  }
  if (!/\? wanted : NAT_CLOCK\.APPARENT;/.test(shadSrc)) return false;
  // Two places on one timezone, far apart in longitude, must disagree.
  var jd = Astro.julianDay(2000, 6, 15, 6);
  var at = function (lon) {
    var p = { latitude: 20, longitude: lon, tzOffsetMinutes: 330 };
    var c = Astro.chart({ jdUT: jd, latitude: p.latitude, longitude: p.longitude,
                          tzOffsetMinutes: p.tzOffsetMinutes });
    return Shadbala.compute(c, p).grahas.Moon.kala.nathonnatha;
  };
  return Math.abs(at(72.88) - at(88.36)) > 2;
})());
/*
 * And apparent noon really is where the Sun crosses the meridian: on the
 * Greenwich meridian the apparent clock differs from the UT clock by the
 * equation of time alone, which reaches a quarter of an hour either way.
 */
ok('and apparent noon is the Sun\'s own noon', (function () {
  var worst = 0, zero = 0;
  for (var d = 0; d < 365; d += 3) {
    var jd = Astro.julianDay(2000, 1, 1, 12) + d;
    var eot = Astro.localApparentTime(jd, 0) - 12;
    worst = Math.max(worst, Math.abs(eot));
    zero = Math.max(zero, eot > 0 ? 1 : 0);
  }
  // The equation of time runs to about 16 minutes and changes sign in the year.
  return worst * 60 > 13 && worst * 60 < 18 && zero === 1;
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
  /*
   * Saptavargaja claimed 315, seven times the 45 of moolatrikona, and cannot
   * reach it: moolatrikona counts in the rashi alone, so the ceiling is 45
   * once and an own sign's 30 in each of the other six. Sthana bala inherited
   * the error, claiming 480 where its parts sum to 390.
   */
  if (declared.saptavargaja !== 45 + 30 * 6) return false;
  if (declared.sthana !== 60 + 225 + 15 + 15 + 60 + 15) return false;
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
    /x\.totalShashtiamsa = x\.sthana\.total \+ x\.dig \+ x\.kala\.total \+/
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
// Twice now: the table's column and the card's own line, which is the same
// fact put where the eye already is. Neither is typed into the markup.
// Twice: the table's column and the card's own line, which is the same fact
// put where the eye already is. Neither is typed into the markup.
ok('the tables carry one dispositor column each, built once',
   (appSrc.match(/'Dispositor'/g) || []).length === 2 &&
   /fact\(seat, 'Dispositor',/.test(appSrc) &&
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
    /Astro\.dignityOf\(r\.name, v\.sign, v\.degreeInSign\)\) \|\| '–',\s*\n\s*stack: true \}/
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
 * Which pair of longitudes the distance is measured between is now a setting,
 * so the claim this used to make about one line of source is made about the
 * behaviour instead.
 *
 * The default is the rashi, and Parashara's phrasing is why. Chapter 6, on the
 * divisions: "The divisions of a combust planet, defeated planet, weak planet
 * and a planet in bad Avasthas like Sayana be all ignored to be auspicious."
 * A combust graha has divisions; the divisions do not each have a combustion.
 */
ok('the default measures inside the division, against the texts and knowingly so',
   /<select id="combustion"/.test(html) &&
   /<option value="division" selected>/.test(html) &&
   /combustion: document\.getElementById\('combustion'\)\.value/.test(appSrc));
/*
 * A default chosen against the sources has to say so where the choice is made,
 * or the page is quietly asserting that the texts back it.
 */
ok('and the note says plainly that the texts ask for the other reading',
   /That is a choice against the texts/.test(html) &&
   /divisions of a combust planet/.test(html) &&
   /the reading the texts ask for/.test(html));
ok('and the column head on the two strength grids stays a rashi fact either way',
   /Astro\.isCombust\(planet\.name, planet\.longitude, sun\.longitude,/.test(appSrc));
/*
 * And the two readings really do differ, on the chart rather than in the source.
 * Rendered twice, at D1 and at D9, with the setting the only thing changed.
 *
 * The rashi reading has to be identical at D1 and D9, that being what carrying
 * the mark in means; the division reading has to differ at D9 and agree at D1,
 * a division of one being the rashi.
 */
(function () {
  /*
   * Hunted rather than assumed: the two readings can only be compared on a
   * chart that carries the mark at all, and most do not carry it on both.
   */
  var c = null;
  for (var yy = 1950; yy < 2010 && !c; yy++) {
    for (var mm = 1; mm <= 12 && !c; mm++) {
      var k = Astro.chart({ jdUT: Astro.julianDay(yy, mm, 15, 3), latitude: 28.61,
        longitude: 77.21, tzOffsetMinutes: 330 });
      var pos = {};
      k.planets.forEach(function (p) { pos[p.name] = p; });
      var s9 = Astro.vargaPosition(pos.Sun.longitude, 9).longitude;
      var differs = ['Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']
        .some(function (g) {
          return Astro.isCombust(g, pos[g].longitude, pos.Sun.longitude, pos[g].retrograde) !==
            Astro.isCombust(g, Astro.vargaPosition(pos[g].longitude, 9).longitude,
              s9, pos[g].retrograde);
        });
      if (differs) c = k;
    }
  }
  var burnt = function (division, combustion) {
    var box = makeNode('div');
    Charts.render(box, { style: 'north', division: division, combustion: combustion,
      planets: c.planets, ascendant: c.ascendant.longitude });
    return (serialise(box).match(/\S\S \[[A-Z\]\[]*\]/g) || [])
      .filter(function (t) { return t.indexOf('[C]') >= 0; }).sort().join(' ');
  };
  ok('a chart was found where the two readings part, or nothing below means anything',
    !!c && burnt(9, 'rashi') !== '' || (!!c && burnt(9, 'division') !== ''),
    c ? 'rashi "' + burnt(9, 'rashi') + '" division "' + burnt(9, 'division') + '"'
      : 'none found');
  ok('carrying the mark in means the rashi reading is the same in every division',
    burnt(1, 'rashi') === burnt(9, 'rashi') && burnt(9, 'rashi') === burnt(10, 'rashi'),
    'D1 "' + burnt(1, 'rashi') + '" D9 "' + burnt(9, 'rashi') + '"');
  ok('and a division of one is the rashi, so the two readings agree there',
    burnt(1, 'rashi') === burnt(1, 'division'));
  ok('while inside a division the second reading answers differently',
    burnt(9, 'division') !== burnt(9, 'rashi'),
    'rashi "' + burnt(9, 'rashi') + '" division "' + burnt(9, 'division') + '"');

  /*
   * The figures behind the default, measured rather than argued. A varga
   * longitude is a rashi position stretched and wrapped, so two of them land
   * near each other about as often as two unrelated numbers do: every graha
   * comes out combust in a narrow band whatever its orb, and Mercury loses the
   * one fact everybody knows about it, that it is never far from the Sun.
   */
  var GR = ['Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
  var rate = {}, charts = 0;
  GR.forEach(function (g) { rate[g] = { rashi: 0, d9: 0 }; });
  for (var y = 1950; y < 2010; y += 2) {
    for (var m = 1; m <= 12; m += 2) {
      var k = Astro.chart({ jdUT: Astro.julianDay(y, m, 15, 3), latitude: 28.61,
        longitude: 77.21, tzOffsetMinutes: 330 });
      var at = {};
      k.planets.forEach(function (p) { at[p.name] = p; });
      var sun9 = Astro.vargaPosition(at.Sun.longitude, 9).longitude;
      charts++;
      GR.forEach(function (g) {
        if (Astro.isCombust(g, at[g].longitude, at.Sun.longitude, at[g].retrograde)) {
          rate[g].rashi++;
        }
        if (Astro.isCombust(g, Astro.vargaPosition(at[g].longitude, 9).longitude,
            sun9, at[g].retrograde)) rate[g].d9++;
      });
    }
  }
  var pct = function (g, which) { return 100 * rate[g][which] / charts; };
  ok('Mercury is really burnt in two charts in five, and in D9 in about one in twenty',
    pct('Mercury', 'rashi') > 35 && pct('Mercury', 'd9') < 12,
    pct('Mercury', 'rashi').toFixed(0) + '% against ' + pct('Mercury', 'd9').toFixed(0) + '%');
  ok('and inside D9 every graha lands in the same narrow band, orbits notwithstanding',
    (function () {
      var all = GR.map(function (g) { return pct(g, 'd9'); });
      return Math.max.apply(null, all) - Math.min.apply(null, all) < 6;
    })(),
    GR.map(function (g) { return g + ' ' + pct(g, 'd9').toFixed(0) + '%'; }).join(', '));
})();

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
/*
 * The key was nine entries under the charts, covering marks drawn in three
 * places. The graha card names every mark a chart carries, in words and with
 * the reason beneath, so a block of definitions under the charts was saying
 * again what the thing itself says better. What a key was still needed for is
 * the Vimsopaka Bala grid, which draws its marks as bare letters on purpose
 * and has no hover to fall back on - so the key moved there and covers those.
 */
ok('the key names every mark the grid draws', (function () {
  var flat = html.replace(/\s+/g, ' ');
  var key = flat.match(/<p class="varga-key">.*?<\/p>/);
  if (!key) return false;
  return ['v', 'x', 's', 'p', 'd', 'n'].every(function (c) {
    return new RegExp('<span class="flag flag-' + c + '">\\[' +
      c.toUpperCase() + '\\]</span>').test(key[0]);
  });
})());
ok('and sits with the grid it explains, not under the charts', (function () {
  var flat = html.replace(/\s+/g, ' ');
  return !/flag-legend/.test(flat) &&
    flat.indexOf('<p class="varga-key">') > flat.indexOf('id="varga-scheme"') &&
    flat.indexOf('<p class="varga-key">') < flat.indexOf('id="vargas-table"');
})());
/*
 * Every entry says where its mark is drawn, and the marks have moved between
 * surfaces more than once: [N], [D], [Y] and then [S] and [P] all came off the
 * graha table, and a legend still pointing at the table would send a reader
 * looking for a letter that is not there. Asserted as a property of every
 * entry rather than as a set of sentences, so the wording can change and the
 * promise cannot quietly lapse.
 */
/*
 * Nothing is left unexplained by the move. Every mark the app draws is either
 * named in the grid's key or named on the graha card, which is the whole point
 * of having dropped the block that tried to cover both at once.
 */
ok('every mark drawn anywhere is explained in one place or the other',
   (function () {
     var flat = html.replace(/\s+/g, ' ');
     var key = (flat.match(/<p class="varga-key">.*?<\/p>/) || [''])[0];
     var drawn = {};
     (appSrc.match(/'flag flag-([a-z])'/g) || []).forEach(function (m) {
       drawn[m.charAt(m.length - 2).toUpperCase()] = true;
     });
     var card = appSrc.match(/var STATE_NAMES = \{[^}]*\}/)[0];
     var orphans = Object.keys(drawn).filter(function (letter) {
       return key.indexOf('[' + letter + ']') < 0 &&
         !new RegExp("\\b" + letter + ": '").test(card);
     });
     return Object.keys(drawn).length >= 6 && orphans.length === 0;
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
   !/The kundli carries/.test(html) && !/flag-where/.test(html));
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
 * benefic. Reading both off the division made the Moon's phase a property of
 * the varga, which it cannot be. The graha table no longer draws these marks,
 * so the rule is kept where they are still drawn - the card's builder and the
 * varga grid.
 */
ok('hemming still reads neighbours from the division and benefics from the rashi',
   /var chart = division === 1 \? state\.chart\s*\n?\s*: Astro\.chartInDivision\(state\.chart, division\);\s*\n\s*var benefics = Astro\.naturalBenefics\(state\.chart\);/
     .test(appSrc));
/*
 * Dig bala and neecha bhanga came off the graha table with the yogakaraka mark.
 * Both still have somewhere to be said: the varga grid marks them per division,
 * and the card says them in words. Dropping a mark from one surface should not
 * mean losing the fact.
 */
ok('dig bala and neecha bhanga are still reported, on the varga grid',
   /Astro\.hasDigBala\(planet\.name, house\)/.test(appSrc) &&
   /signLine\.appendChild\(el\('span', 'flag flag-d', ' \[D\]'\)\)/.test(appSrc) &&
   /dignityLine\.appendChild\(el\('span', 'flag flag-n', ' \[N\]'\)\)/.test(appSrc));
ok('and the two still drawn on the grid are still named in its key',
   /flag-d">\[D\]/.test(html) && /flag-n">\[N\]/.test(html));
ok('while yogakaraka, drawn only in the chart, is named only on the card',
   !/flag-y">\[Y\]/.test(html) && /Y: 'Yogakaraka'/.test(appSrc));
/*
 * The ascendant is a point, so what is about a graha is withheld from it:
 * ownership, dignity, the neecha-bhanga star, dig bala.
 *
 * Hemming is not on that list and used to be. Kartari is defined on the lagna
 * first - Phaladeepika ch.6 sloka 8 puts the 2nd and 12th "from the Lagna" -
 * and reading the same shape around a graha is the extension, licensed by
 * Charak's "the lagna or the lagna lord" and Raman's "in the navamsa, Saturn
 * has Shubhakarthari Yoga". So the one row the texts actually define it on was
 * the only row not showing it.
 */
ok('the ascendant takes none of what is about a graha',
   /var owned = r\.isAscendant \? \[\] : Astro\.housesOwned/.test(appSrc) &&
   /r\.isAscendant \? '' : Astro\.dignityOf/.test(appSrc));
/*
 * The graha table used to withhold the hemming marks from the ascendant, the
 * one placement the texts define kartari on. That is moot now the table draws
 * no hemming at all - but the rule still matters where hemming is drawn, so
 * what is asserted is that nothing anywhere excludes the ascendant from it.
 */
ok('and nothing excludes the ascendant from the hemming, defined on it first',
   !/isAscendant[^\n]*hemmedBy/.test(appSrc) &&
   !/hemmedBy[^\n]*isAscendant/.test(appSrc));
ok('each mark in the key carries its own colour',
   ['v', 'x', 's', 'p', 'd', 'n'].every(function (c) {
     return new RegExp('<span class="flag flag-' + c + '">\\[' +
       c.toUpperCase() + '\\]</span>').test(html.replace(/\s+/g, ' '));
   }));
ok('and the card says which of the two each of its own marks is true of',
   /True of the graha whichever chart is read/.test(appSrc) ||
   /R: 'Retrograde'/.test(appSrc));
/*
 * And the card is where a reader is sent for the whole of it, since it names
 * every mark in words with the reason underneath - which a bracketed letter
 * cannot do, and which is why four of the nine came off the table.
 */
ok('the key points at the card for the long form',
   /Hovering a graha in either chart above names every mark it carries in words/
     .test(html.replace(/\s+/g, ' ')));
ok('the card explains [C], which the grid does not draw',
   /C: 'Combust'/.test(appSrc) && /inside the ' \+ orb \+/.test(
     fs.readFileSync(path.join(root, 'js/charts.js'), 'utf8')));

ok('the card explains [Y], and says which house 1 it is counted from',
   /Owns both an angle and a trine, counted from house 1 of this chart\./.test(
     fs.readFileSync(path.join(root, 'js/charts.js'), 'utf8')));
ok('retrograde alone stays bare [R]', /Sa \[R\]<|Sa \[R\]\s/.test(renderIn(1)));
ok('a graha with neither carries no brackets', /Ju<\/text>|>Ju</.test(renderIn(1)));

ok('the four a chart label can carry are all covered somewhere', (function () {
  var flat = html.replace(/\s+/g, ' ');
  var charts = fs.readFileSync(path.join(root, 'js/charts.js'), 'utf8');
  return /division has landed the graha back in the sign it holds in the rashi/
      .test(flat) &&
    /Never on D1, where every graha would qualify\. In D9 it is vargottama proper/
      .test(flat) &&
    /R: 'Retrograde'/.test(charts) && /C: 'Combust'/.test(charts) &&
    /Y: 'Yogakaraka'/.test(charts);
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
   /if \(d\.dignity === 'debilitated' && cancelled\[planet\.name\]\)/.test(appSrc) &&
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
    /<span class="flag flag-v">\[V\]<\/span> vargottama:/
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
ok('the mark is the raja form and not a plain cancellation',
   /if \(yoga\.yoga === 'Neecha Bhanga' && yoga\.kind === 'raja'\) cancelled\[name\] = true;/
     .test(appSrc));
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
  var key = (flat.match(/<p class="varga-key">.*?<\/p>/) || [''])[0];
  var marks = key.match(/<span class="flag flag-[a-z]">[^<]*<\/span>/g) || [];
  return marks.length === 6 && !/flag-dig/.test(flat) && !/flag-star/.test(flat) &&
    marks.every(function (m) { return /\[[RVYCXSPDN]\]/.test(m); });
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
  var block = seeds.slice(seeds.indexOf("'yoga', 'Neecha Bhanga', 'general'"));
  block = block.slice(0, block.indexOf("'yoga', 'Vipareeta"));
  return block.indexOf('"') < 0 && /De Fouw and Svoboda have been read/.test(block);
})());
/*
 * And they are two subjects, not two conditions of one. A cancelled
 * debilitation and a cancelled debilitation that raises are different
 * findings with different rules and different results; as conditions of a
 * subject named for the raja yoga, the plain form answered to a name the
 * page is otherwise careful to deny it.
 */
ok('and the two are separate yogas rather than conditions of one', (function () {
  var src = fs.readFileSync(path.join(root, 'js/yogas.js'), 'utf8');
  return /subject: royal \? 'Neecha Bhanga Raja Yoga' : 'Neecha Bhanga',/.test(src) &&
    seeds.indexOf("('yoga', 'Neecha Bhanga', 'general',") >= 0 &&
    seeds.indexOf("('yoga', 'Neecha Bhanga Raja Yoga', 'general',") >= 0 &&
    seeds.indexOf("'Neecha Bhanga Raja Yoga', 'raja'") < 0;
})());
/* The plain form is not filed among the raja yogas it is not one of. */
ok('and the catalogue does not file the plain form under raja yogas', (function () {
  var src = fs.readFileSync(path.join(root, 'js/yogas.js'), 'utf8');
  var group = src.slice(src.indexOf("{ group: 'Raja yogas'"));
  group = group.slice(0, group.indexOf('] }'));
  return group.indexOf("'Neecha bhanga'") < 0 &&
    group.indexOf("'Neecha bhanga raja yoga'") >= 0 &&
    /\{ group: 'Debilitation lifted', names: \['Neecha bhanga'\] \}/.test(src);
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
      // The card sets a flag and its name as siblings inside one line.
      createTextNode: function (text) {
        var n = loose('#text'); n.textContent = text; return n;
      },
      getElementById: function (id) { return byId[id] || (byId[id] = loose('div')); },
      querySelector: function () { return loose('div'); },
      querySelectorAll: function () { return []; },
      addEventListener: function () {},
      body: loose('body'),
      documentElement: loose('html')
    },
    window: {
      localStorage: (function () {
        var store = {};
        return {
          getItem: function (k) { return Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null; },
          setItem: function (k, v) { store[k] = String(v); },
          removeItem: function (k) { delete store[k]; }
        };
      })(),
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
    '  __out.wireGrahaCard = wireGrahaCard;\n' +
    '  __out.renderShadbala = renderShadbala; __out.renderYogas = renderYogas;\n' +
    '  __out.renderAspects = renderAspects;\n' +
    '  __out.rotatedOnto = rotatedOnto;\n' +
    '  __out.yogasByGraha = yogasByGraha;\n' +
    '  __out.rulingAndAspects = rulingAndAspects;\n' +
    '  __out.renderSaved = renderSaved; __out.setFlag = setFlag; __out.removeSaved = removeSaved;\n' +
    '  __out.saveCurrent = saveCurrent; __out.setLastChart = function (v) { lastChart = v; };\n' +
    '  __out.savedNote = savedNote;\n' +
    '  __out.readSaved = readSaved; __out.writeSaved = writeSaved;\n' +
    '  __out.savedList = savedList; __out.STORAGE_KEY = STORAGE_KEY;\n' +
    '  __out.figuresList = document.getElementById("figures-list");\n' +
    '  __out.byId = function (id) { return document.getElementById(id); };\n' +
    '  __out.readDate = readDate; __out.writeDate = writeDate;\n' +
    '  __out.dateBoxes = function () { return [dayInput, monthInput, yearInput]; };\n' +
    appSrc.slice(close);

  var out = {};
  var loaded = true, why = '';
  try {
    new Function('document', 'window', 'location', 'history', 'navigator', 'fetch',
                 'Astro', 'Geo', 'Charts', 'Shadbala', 'Yogas', 'PERTURBATIONS',
                 'FREQUENCIES', '__out',
                 wired)(
      sandbox.document, sandbox.window, sandbox.location, sandbox.history,
      sandbox.navigator, sandbox.fetch, Astro, Geo, Charts, Shadbala, Yogas,
      global.PERTURBATIONS, global.FREQUENCIES, out);
  } catch (e) {
    loaded = false;
    why = e.message;
  }
  ok('app.js loads against a document without throwing', loaded, why);
  // Kept for the later tests that drive the app's own functions rather than
  // reading its source.
  global.appExports = out;

  if (!loaded) return;
  ok('a new chart whose database save fails is removed from the optimistic cache', (function () {
    out.writeSaved([]);
    out.setLastChart({
      name: 'Offline Chart', y: 1990, mo: 1, d: 2, h: 3, mi: 4,
      time: { second: 5 }, place: { label: 'Delhi, India', lat: 28.6, lon: 77.2,
        zone: 'Asia/Kolkata' }, standard: 'zone', ayanamsa: 'lahiri', trueNode: true,
      gender: 'male', celebrity: false, flagged: false, note: ''
    });
    out.saveCurrent(true); // this harness has no fetch, so the API fails synchronously
    return out.readSaved().length === 0 && /could not be confirmed/.test(out.savedNote.textContent);
  })());
  ok('a deletion the database cannot confirm restores the row', (function () {
    var row = { id: 'kept-id', name: 'Kept', placeLabel: 'Delhi, India',
      date: '1990-01-02', time: '03:04:05', latitude: 28.6, longitude: 77.2,
      zone: 'Asia/Kolkata', standard: 'zone', ayanamsa: 'lahiri', trueNode: true,
      gender: 'male', celebrity: false, flagged: false, note: '' };
    out.writeSaved([row]);
    out.removeSaved(row); // this harness has no fetch, so deletion is unconfirmed
    return out.readSaved().length === 1 && out.readSaved()[0].id === 'kept-id' &&
      /deletion could not be confirmed/.test(out.savedNote.textContent);
  })());
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

  /*
   * Driven rather than read off the source, which is what the old form of this
   * did: it matched the one assignment that moved the ascendant, and so went on
   * passing when the function was doing half a rotation.
   *
   * Moving the ascendant is not by itself the rotation. Every graha carries a
   * house number worked out from the real lagna when the chart was cast, and a
   * detector is as likely to read that as to count signs - vipareeta raja yoga
   * asks which house the 6th, 8th or 12th lord is placed in and reads it
   * straight off the graha. Leaving the numbers alone left the chart holding
   * two frames at once.
   */
  ok('rotating puts the graha in the first house and counts the rest from it',
     (function () {
       var c = Astro.chart({ jdUT: Astro.julianDay(1977, 11, 15, 3),
         latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 });
       var moon = out.rotatedOnto(c, 'Moon');
       if (!moon || moon.reference !== 'Moon') return false;
       var lagna = Astro.signOf(moon.ascendant.longitude);
       return moon.planets.every(function (p) {
         return p.house === ((p.sign - lagna) % 12 + 12) % 12 + 1;
       }) && moon.planets.filter(function (p) {
         return p.name === 'Moon';
       })[0].house === 1;
     })());
  /*
   * And it really is a different set of house numbers, or the check above would
   * pass on a chart that happened to rise in the Moon's own sign.
   */
  ok('and those numbers differ from the ones the lagna gave',
     (function () {
       var c = Astro.chart({ jdUT: Astro.julianDay(1977, 11, 15, 3),
         latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 });
       var moon = out.rotatedOnto(c, 'Moon');
       return c.planets.some(function (p, i) {
         return p.house !== moon.planets[i].house;
       });
     })());
  /*
   * The original is left alone. It is the chart every other panel is reading.
   */
  ok('and the chart it was made from is not touched',
     (function () {
       var c = Astro.chart({ jdUT: Astro.julianDay(1977, 11, 15, 3),
         latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 });
       var before = c.planets.map(function (p) { return p.house; }).join(',');
       var ascBefore = c.ascendant.longitude;
       out.rotatedOnto(c, 'Moon');
       return c.planets.map(function (p) { return p.house; }).join(',') === before &&
         c.ascendant.longitude === ascBefore;
     })());
  /*
   * Rotating onto the ascendant is not a rotation, and rotating onto a graha
   * the chart does not carry has to be a no-op rather than a half-built chart.
   */
  ok('and a rotation onto nothing hands back the chart it was given',
     (function () {
       var c = Astro.chart({ jdUT: Astro.julianDay(1977, 11, 15, 3),
         latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 });
       return out.rotatedOnto(c, 'Ascendant') === c &&
         out.rotatedOnto(c, '') === c && out.rotatedOnto(c, 'Pluto') === c;
     })());
  /*
   * And the point of all of it: the same chart read from somewhere else is a
   * different reading. Houses move, so the yogas that turn on houses move with
   * them. Swept rather than sampled, because a single chart that happened to
   * give the same set would look like proof of the opposite.
   */
  ok('reading a chart from the Moon finds a different set of yogas',
    (function () {
      var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
      var differed = 0, tried = 0, gained = 0, lost = 0;
      for (var y = 1950; y < 2000; y += 5) {
        for (var m = 1; m <= 12; m += 4) {
          var c = Astro.chart({ jdUT: Astro.julianDay(y, m, 15, 3),
            latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 });
          var st = Shadbala.compute(c, place);
          var titles = function (chart) {
            return Yogas.detect(chart, st).map(function (f) { return f.title; });
          };
          var from = titles(c), moon = titles(out.rotatedOnto(c, 'Moon'));
          tried++;
          gained += moon.filter(function (t) { return from.indexOf(t) < 0; }).length;
          lost += from.filter(function (t) { return moon.indexOf(t) < 0; }).length;
          if (from.slice().sort().join('|') !== moon.slice().sort().join('|')) differed++;
        }
      }
      // Not every chart: one rising in the Moon's own sign is not rotated at
      // all, and a few hold only yogas that no house decides.
      return tried > 20 && differed > tried * 0.8 && gained > 0 && lost > 0;
    })());

  /*
   * The card was where the complaint came from and the table fix did not reach
   * it. A graha is still listed for every yoga it takes part in, which is worth
   * knowing; what was missing is the line saying whose the combination is, so
   * the Sun's card carried Shubha Vesi with nothing to show Mercury had made
   * it.
   */
  var chartsSrc = fs.readFileSync(path.join(root, 'js/charts.js'), 'utf8');
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var src = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  ok('the card carries the yoga’s reference through the renderer',
    /\(y\.from \|\| \[\]\)\.join\(','\)/.test(chartsSrc) &&
    /from: bits\[5\] \|\| ''/.test(src) &&
    /name === 'Ascendant' \? 'asc' : name/.test(src) &&
    /graha-card-whose/.test(src) && /\.graha-card-whose \{/.test(css));
  ok('and the map clubs matching yogas from distinct reference houses',
    /same\.from\.push\(from\)/.test(src) &&
    /graha: yoga\.graha \|\| '', from: \[from\]/.test(src));
  /*
   * And spoken, not only shown. A label that read the titles out flat would
   * leave a listener with exactly the fault the card had just lost.
   */
  ok('the graha’s accessible label says where each yoga is read from too',
    /name === 'Ascendant' \? 'asc' : name/.test(chartsSrc) &&
    /\.join\(' and '\)/.test(chartsSrc));
  /*
   * The stacked cards are gone, and their rules went with them rather than
   * sitting in the sheet unreferenced. A selector nothing produces is a claim
   * about a layout that no longer exists.
   */
  ok('no rule is left for the card layout the table replaced',
    !/\.yoga-finding \{/.test(css) && !/\.yoga-grahas \{/.test(css) &&
    !/'yoga-finding'/.test(src) && !/'yoga-grahas'/.test(src));
  /*
   * Driven, on the chart that shows it: the Sun and Mercury placed so Vesi
   * forms, then the Sun's own entry read back. It has to name Mercury.
   */
  ok('the Sun’s entry for Shubha Vesi says the yoga is Mercury’s',
    (function () {
      var vesi = { ascendant: { longitude: 5 }, planets: [
        { name: 'Sun', sign: 1, longitude: 35, house: 2 },
        { name: 'Mercury', sign: 2, longitude: 65, house: 3 },
        { name: 'Moon', sign: 6, longitude: 185, house: 7 },
        { name: 'Mars', sign: 8, longitude: 245, house: 9 },
        { name: 'Jupiter', sign: 9, longitude: 275, house: 10 },
        { name: 'Venus', sign: 10, longitude: 305, house: 11 },
        { name: 'Saturn', sign: 11, longitude: 335, house: 12 }] };
      var f = Yogas.sunCompany(vesi)[0];
      if (!f || f.graha !== 'Mercury') return false;
      // the Sun is a participant and so is listed, but the yoga is not its own
      return f.grahas.indexOf('Sun') >= 0 && f.graha !== 'Sun';
    })());

  /*
   * The Graha column, driven. A source match would not catch the column being
   * filled from the wrong field, which is the fault this replaces.
   */
  ok('the rendered table carries the requested columns and both probabilities',
    (function () {
      var host = byId['yoga-list'];
      if (!host) return false;
      host.children.length = 0;
      out.renderYogas(peace);
      var heads = [];
      (function walk(n) {
        if (!n || !n.children) return;
        n.children.forEach(function (kid) {
          if (kid.tag === 'th' && kid.attrs && kid.attrs.scope === 'col') {
            heads.push(kid.textContent);
          }
          walk(kid);
        });
      })(host);
      return heads.join(',') === 'Graha,Chart,From,Yoga,Result,This manifestation,Overall';
    })());
  /*
   * The last two columns are one question asked against two backgrounds, so
   * they sit under one heading rather than beside each other as if they
   * measured different things. "Manifestation probability" next to "Yoga
   * probability" read as two unrelated measures.
   */
  ok('and the two probabilities sit under one heading that pairs them',
    (function () {
      var host = byId['yoga-list'];
      host.children.length = 0;
      out.renderYogas(peace);
      var group = null;
      (function walk(n) {
        if (!n || !n.children) return;
        n.children.forEach(function (kid) {
          if (kid.tag === 'th' && kid.attrs && kid.attrs.scope === 'colgroup') group = kid;
          walk(kid);
        });
      })(host);
      return !!group && group.textContent === 'Yoga probability' &&
        group.attrs.colspan === '2';
    })());
  /* And the columns beside them span both rows, so the header is one block. */
  ok('and the single columns span both header rows',
    (function () {
      var host = byId['yoga-list'];
      var spanned = 0;
      (function walk(n) {
        if (!n || !n.children) return;
        n.children.forEach(function (kid) {
          if (kid.tag === 'th' && kid.attrs && kid.attrs.rowspan === '2') spanned++;
          walk(kid);
        });
      })(host);
      return spanned === 5;
    })());
  ok('and headings are centred both ways except the left-aligned Graha heading',
    (function () {
      var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
      return /\.yoga-table thead th \{[\s\S]{0,100}?text-align: center;[\s\S]{0,100}?vertical-align: middle;/.test(css) &&
        /\.yoga-table thead tr:first-child th:first-child \{ text-align: left; \}/.test(css);
    })());
  /*
   * And the table narrows to one graha.
   *
   * The options are built from whoever this chart actually gave a finding to,
   * so the control can never offer a name that would empty the table, and a
   * name the next chart has nothing for falls back to every graha rather than
   * leaving an empty table under a heading still selected.
   *
   * The shared findings stay in every view. An exchange belongs to two lords,
   * a Nabhasa figure to all seven: they are as true of the graha being looked
   * at as of any other, and dropping them would answer "what has Venus got"
   * by leaving out things Venus is in.
   */
  ok('the filter offers every graha this chart names in a finding',
    (function () {
      var pick = byId['yoga-graha'];
      if (!pick) return false;
      pick.value = '';
      out.renderYogas(peace);
      var offered = pick.children.map(function (o) { return o.textContent; });
      var strengths = Shadbala.compute(peace.chart,
        { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 });
      var real = {};
      Yogas.detect(peace.chart, strengths).forEach(function (f) {
        (f.graha ? [f.graha] : (f.grahas || [])).forEach(function (n) {
          if (n) real[n] = true;
        });
      });
      return offered[0] === 'Every graha' &&
        offered.slice(1).every(function (n) { return real[n]; }) &&
        Object.keys(real).every(function (n) { return offered.indexOf(n) > 0; });
    })(),
    (byId['yoga-graha'].children || []).map(function (o) { return o.textContent; }).join(', '));

  /*
   * And every row a filtered table shows names the graha asked for, whether
   * as the one the finding resolves to or as one of the several that make it.
   * There is no third case: over 1,804 findings, not one fails to name a
   * graha, so the dash that used to stand for "the chart as a whole" stood
   * for nothing.
   */
  /*
   * Either as the graha the finding is for, or among those taking part in it.
   * Shubha Vesi is Mercury's and the Sun marks where to count from, so asking
   * for the Sun keeps it and the columns still say whose it is.
   */
  ok('and choosing one shows only rows that name it',
    (function () {
      var pick = byId['yoga-graha'], host = byId['yoga-list'];
      var who = pick.children.length > 1 ? pick.children[1].value : '';
      if (!who) return false;
      pick.value = who;
      host.children.length = 0;
      out.renderYogas(peace);
      var rows = [];
      (function walk(n) {
        if (!n || !n.children) return;
        n.children.forEach(function (kid) {
          if (kid.tag === 'tr') {
            var cells = [];
            kid.children.forEach(function (cell) {
              // The row's own heading and the participants; not the table's.
              var isRowHead = cell.tag === 'th' && cell.attrs && cell.attrs.scope === 'row';
              if (isRowHead || (cell.className || '').indexOf('yoga-part') === 0) {
                cells.push(cell.textContent || '');
              }
            });
            if (cells.length) rows.push(cells.join(', '));
          }
          walk(kid);
        });
      })(host);
      pick.value = '';
      return rows.length > 0 && rows.every(function (names) {
        return names.split(', ').indexOf(who) >= 0;
      });
    })());
  ok('and no row is left with a dash where a graha was named',
    (function () {
      var host = byId['yoga-list'];
      host.children.length = 0;
      out.renderYogas(peace);
      var bare = [];
      (function walk(n) {
        if (!n || !n.children) return;
        n.children.forEach(function (kid) {
          if (kid.tag === 'th' && kid.attrs && kid.attrs.scope === 'row' &&
              kid.textContent === '–') bare.push(kid);
          walk(kid);
        });
      })(host);
      return bare.length === 0;
    })());

  ok('and a name the chart has nothing for falls back to every graha',
    (function () {
      var pick = byId['yoga-graha'], host = byId['yoga-list'];
      pick.value = 'NotAGraha';
      host.children.length = 0;
      out.renderYogas(peace);
      return pick.value === '';
    })());

  ok('and a graha never appears in both the Graha column and Taking part',
    (function () {
      var strengths = Shadbala.compute(peace.chart,
        { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 });
      var found = Yogas.detect(peace.chart, strengths);
      return found.length > 0 && found.every(function (f) {
        var part = f.grahas.filter(function (g) { return g !== f.graha; });
        return part.indexOf(f.graha) < 0;
      });
    })());

  /*
   * The four lords of the birth, above the table rather than in it. Each hands
   * its whole bala to one graha, so its row is six zeros and a number, and
   * which graha took it was legible only by hunting for the cell.
   */
  ok('the strip is above the table, not another row in it',
    /<p class="lords-strip" id="shadbala-lords"><\/p>/.test(html) &&
    html.indexOf('id="shadbala-lords"') < html.indexOf('id="shadbala-table-scroll"'));
  ok('and it is filled from the engine’s own names, all four labelled',
    (function () {
      var strip = byId['shadbala-lords'];
      if (!strip) return false;
      strip.children.length = 0;
      out.renderShadbala(peace);
      // The label and the graha are separate nodes on purpose, the label
      // receding and the graha carrying the weight, so they are read apart.
      var labels = strip.children.map(function (c) { return c.textContent; }).join(' ');
      var named = strip.children.map(function (c) {
        return (c.children[0] && c.children[0].textContent) || '';
      });
      return strip.children.length === 4 &&
        /Year lord/.test(labels) && /Month lord/.test(labels) &&
        /Day lord/.test(labels) && /Hour lord/.test(labels) &&
        named.length === 4 && named.every(function (g) {
          return Shadbala.GRAHAS.indexOf(g) >= 0;
        });
    })());
  /*
   * And it empties rather than going stale. A strip left over from the last
   * chart would name four lords of somebody else's birth, which is worse than
   * naming none.
   */
  ok('and it is rebuilt from scratch on each render, never appended to',
    (function () {
      var strip = byId['shadbala-lords'];
      out.renderShadbala(peace);
      var first = strip.children.length;
      out.renderShadbala(war);
      return first === 4 && strip.children.length === 4;
    })());

  /*
   * Ishta and kashta phala, the one pair of rows in the table that is in no
   * total above it. They sit under the verdict rather than among the shares,
   * because they are not a seventh share: they are what the graha is disposed
   * to do in its dasha, read off uchcha and cheshta bala alone, and they are
   * the reason the luminaries' cheshta row is computed at all.
   */
  var names = rowNames(peace);
  ok('the table closes on the two phalas, below the verdict and not among the shares',
    names.indexOf('Ishta phala') > names.indexOf('Verdict') &&
    names.indexOf('Kashta phala') === names.indexOf('Ishta phala') + 1,
    names.slice(-4).join(', '));

  /*
   * And the setting reaches the figures. Both readings are computed from the
   * same two shares, so a chart where they agree would say nothing; this one is
   * chosen for a graha where they are far apart.
   */
  var phalaOf = function (reading) {
    byId['ishta-kashta'].value = reading;
    var got = Shadbala.compute(peace.chart,
      { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 },
      { ishtaKashta: reading }).grahas;
    return got;
  };
  var sri = phalaOf('sripati'), par = phalaOf('parashara');
  byId['ishta-kashta'].value = 'sripati';
  ok('the two readings really do give different figures',
    Shadbala.GRAHAS.some(function (g) {
      return Math.abs(sri[g].phala.ishta - par[g].phala.ishta) > 1;
    }),
    Shadbala.GRAHAS.map(function (g) {
      return g + ' ' + sri[g].phala.ishta.toFixed(1) + '/' + par[g].phala.ishta.toFixed(1);
    }).join(' '));
  ok('and only Parashara’s halves a fixed sixty between them',
    Shadbala.GRAHAS.every(function (g) {
      return Math.abs(par[g].phala.ishta + par[g].phala.kashta - 60) < 1e-9;
    }) &&
    Shadbala.GRAHAS.some(function (g) {
      return Math.abs(sri[g].phala.ishta + sri[g].phala.kashta - 60) > 1;
    }));

  /*
   * The luminaries are the point. Their cheshta bala is shown and not counted,
   * and this is the computation it is kept for, so an empty phala cell for the
   * Sun or the Moon would be the bug that reading fixes.
   */
  ok('and the Sun and the Moon have both phalas, which is what their cheshta is for',
    ['Sun', 'Moon'].every(function (g) {
      return isFinite(sri[g].phala.ishta) && isFinite(sri[g].phala.kashta) &&
        sri[g].phala.ishta + sri[g].phala.kashta > 0;
    }));
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
   /Astro\.vimsopaka\(planet\.name, planet\.longitude, scheme, positionsD1,\s*\n\s*tatkalikaSetting\(\), horaSetting\(\),\s*\n?\s*horaMercurySetting\(\)\)/.test(appSrc));
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
   /return Astro\.vargaDignity\(p\.name, p\.longitude, 1, positionsD1, tatkalikaSetting\(\),\s*\n\s*horaSetting\(\), horaMercurySetting\(\)\);/.test(appSrc) &&
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
  /*
   * Three now, not two. Moolatrikona joined them when the varga viswa lost the
   * rung it never had in chapter 6: a Moon in Taurus 3 to 30 is shown in her
   * moolatrikona, which is true, and scored as Venus's friend, which is what
   * the ladder pays. Saptavargaja bala still pays her the 45 from its own
   * chapter, so the word on the cell is not idle - it is worth something in one
   * reckoning and nothing in the other.
   */
  return Object.keys(seen).sort().join(',') === 'debilitated,exalted,moolatrikona';
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
/*
 * The rung, not the dignity. This grid is scored on the varga viswa, whose six
 * steps run from own down to sworn enemy; printing Exal or Mool over a cell
 * worth seven or fifteen named a different reckoning from the one the column
 * adds up.
 */
ok('the sign and the scored rung are written out in full',
   /el\('span', 'varga-sign', Astro\.SIGNS\[d\.sign\]\)/.test(appSrc) &&
   /dig-' \+ d\.relation,\s*\n?\s*d\.relationLabel\)/.test(appSrc));
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
    /dig-' \+ d\.relation,\s*\n?\s*d\.relationLabel\)/.test(appSrc) &&
    /\{ text: \(r\.isAscendant \? '' : Astro\.dignityOf/.test(appSrc);
})());

ok('the library says exaltation is outside the classical steps',
   /Exaltation has no rung at all, so an exalted graha scores by its relation to the lord/
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
/*
 * Moolatrikona shares the top figure with an own sign rather than ranking
 * apart, so it adds nothing to a graha already in its own. But it is a dignity
 * rather than a kind of ownership, and the passage has to say so, because for
 * the Moon the two part company: hers is in Venus's sign.
 */
ok('and says moolatrikona shares the top figure without being ownership',
   /keeps the same twenty as an own sign/.test(seeds) &&
   /the Moon's moolatrikona is Taurus 3 to 30, and Taurus is Venus's/.test(seeds));
/*
 * And that it belongs to the rashi, which is the part that was silently wrong
 * in the grid for a long time.
 */
ok('and that it is claimed in the rashi only',
   /And in the rashi only\. Moolatrikona is a span of degrees inside a sign/.test(seeds));
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
   /dig-' \+ d\.relation,\s*\n?\s*d\.relationLabel\)/.test(appSrc) &&
   /td\.appendChild\(signLine\);\s*\n\s*td\.appendChild\(dignityLine\);/.test(appSrc));
ok('and its name is a row header',
   /th\.setAttribute\('scope', 'row'\);/.test(appSrc));
ok('both lines read one and the same varga position', (function () {
  var at = appSrc.indexOf('function renderVargas(state)');
  var block = appSrc.slice(at, appSrc.indexOf('function vargaSummary', at));
  return /var d = Astro\.vargaDignity\(planet\.name, planet\.longitude, division, positionsD1,\s*\n\s*tatkalikaSetting\(\), horaSetting\(\), horaMercurySetting\(\)\);/
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

console.log('\nThe chart service runs the same engine');
/*
 * Charts are built by a Supabase Edge Function by default and only fall back to
 * this browser when the service is slow or absent. The function cannot import a
 * classic script, so scripts/deploy-edge.sh appends an ESM export to a copy of
 * js/astro.js - and a copy is a copy, which drifts the moment the original
 * changes and the script is not run.
 *
 * It drifted for days across four engine changes: the sunrise window, the vara
 * boundary, the ahargana and the Vimshottari year. The visible symptom was abda
 * and masa bala reading zero for every graha, because the service's panchang
 * had no ahargana for shadbala.js to count from - and nothing failed, because
 * every test here runs the local engine, which was right.
 *
 * The file header already warned that this had happened once before, with the
 * graha order. A comment is not a check.
 */
ok('the deployed engine copy matches js/astro.js', (function () {
  var src = fs.readFileSync(path.join(root, 'js/astro.js'), 'utf8');
  var copyPath = path.join(root, 'supabase/functions/chart/_astro.mjs');
  if (!fs.existsSync(copyPath)) return false;
  var copy = fs.readFileSync(copyPath, 'utf8');
  // deploy-edge.sh appends exactly a blank line and the default export.
  var expected = src + '\n' + 'export default Astro;\n';
  return copy === expected;
})());
/*
 * And the thing whose absence caused the symptom, named directly, so a future
 * reader knows what the check is really protecting.
 */
ok('and carries the ahargana the year and month lords need', (function () {
  var copy = fs.readFileSync(
    path.join(root, 'supabase/functions/chart/_astro.mjs'), 'utf8');
  return /ahargana: ahargana,/.test(copy) && /AHARGANA_EPOCH/.test(copy);
})());

ok('the ignored edge wrapper is generated before the suite reads it', (function () {
  var pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  return /build-edge-module\.mjs/.test(pkg.scripts.test) &&
    fs.existsSync(path.join(root, 'scripts/build-edge-module.mjs'));
})());
ok('the API deploy command ships every function the page calls', (function () {
  var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'astrology-deploy-test-'));
  var calls = path.join(tmp, 'calls');
  var stub = path.join(tmp, 'supabase');
  fs.writeFileSync(stub, '#!/bin/sh\nprintf \'%s\\n\' "$*" >> "$DEPLOY_CALLS"\n');
  fs.chmodSync(stub, 0o755);
  try {
    childProcess.execFileSync('bash', [path.join(root, 'scripts/deploy-edge.sh')], {
      cwd: os.tmpdir(),
      env: Object.assign({}, process.env, { PATH: tmp + path.delimiter + process.env.PATH,
        DEPLOY_CALLS: calls, SUPABASE_PROJECT_REF: 'test-project' })
    });
    var invoked = fs.readFileSync(calls, 'utf8').trim().split('\n');
    return ['chart', 'readings', 'kundalis'].every(function (name) {
      return invoked.some(function (line) {
        return line.indexOf('functions deploy ' + name + ' ') === 0 &&
          /--project-ref test-project --no-verify-jwt$/.test(line);
      });
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})());
ok('the chart API rejects malformed moments and non-finite coordinates', (function () {
  var edge = fs.readFileSync(path.join(root, 'supabase/functions/chart/index.ts'), 'utf8');
  return /Date\.UTC/.test(edge) && /h > 23/.test(edge) && /mi > 59/.test(edge) &&
    /every\(Number\.isFinite\)/.test(edge) && /14 \* 60/.test(edge);
})());
ok('saved-chart identity matching treats names as text, not patterns', (function () {
  var edge = fs.readFileSync(path.join(root, 'supabase/functions/kundalis/index.ts'), 'utf8');
  return !/name=ilike|place_label=ilike/.test(edge) &&
    /lower\(candidate\.name\) === lower\(row\.name\)/.test(edge);
})());

console.log('\nThe doubled rows can be shown halved');
/*
 * The Sun's ayana bala and the Moon's paksha bala are doubled before they are
 * counted, and nothing about that is disputed - Parashara, Raman and Charak
 * all say so. Some software prints the two rows undoubled anyway, which makes
 * a row-by-row comparison awkward because they differ by a factor rather than
 * by a figure.
 *
 * So this halves the DISPLAY and nothing else. The arithmetic must stay where
 * the texts put it, which is the whole reason it is a display switch rather
 * than an option on compute().
 */
ok('a switch is offered for each row, not one for both', (function () {
  var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var at = html.indexOf('id="panel-settings"');
  var panel = html.slice(at, html.indexOf('</section>', html.indexOf('id="panel-testing"')));
  return !/<select id="doubled-rows"/.test(panel) &&
    ['paksha-doubled', 'ayana-doubled'].every(function (id) {
      var sel = panel.slice(panel.indexOf('<select id="' + id + '"'));
      sel = sel.slice(0, sel.indexOf('</select>'));
      return /<option value="undoubled" selected>/.test(sel) &&
        /<option value="doubled">/.test(sel);
    });
})());
/*
 * They were one control while they looked like one question. They are not:
 * separate rules, on separate grahas, from separate texts. The reason to show a
 * row undoubled is to line it up against another table, and a table may well
 * print one of them doubled and the other not, which a single switch cannot be
 * set to match.
 */
ok('and each row reads its own control', (function () {
  return /ayana: \{ graha: 'Sun', control: 'ayana-doubled' \}/.test(appSrc) &&
    /paksha: \{ graha: 'Moon', control: 'paksha-doubled' \}/.test(appSrc) &&
    /function halvingDoubled\(key\)/.test(appSrc) &&
    /halvingDoubled\(part\.key\)/.test(appSrc);
})());
ok('so one can be halved while the other stands', (function () {
  var reads = { 'paksha-doubled': 'undoubled', 'ayana-doubled': 'doubled' };
  var block = appSrc.slice(appSrc.indexOf('function halvingDoubled(key)'));
  block = block.slice(0, block.indexOf('\n  }') + 4);
  var DOUBLED = { ayana: { graha: 'Sun', control: 'ayana-doubled' },
                  paksha: { graha: 'Moon', control: 'paksha-doubled' } };
  var fn = new Function('DOUBLED', 'document',
    block + '; return halvingDoubled;')(DOUBLED,
    { getElementById: function (id) {
        return reads[id] ? { value: reads[id] } : null; } });
  return fn('paksha') === true && fn('ayana') === false &&
    fn('tribhaga') === false;
})());
/*
 * Only the two named grahas are halved, and only in their own row. Halving a
 * whole row would take the other six with it.
 */
ok('only the Sun\u2019s ayana and the Moon\u2019s paksha are halved',
  /var doubled = !!DOUBLED\[part\.key\] && DOUBLED\[part\.key\]\.graha === graha;/
    .test(appSrc) &&
  /halved && doubled \? raw \/ 2 : raw/.test(appSrc));
/*
 * The totals must not move. If this ever reaches compute() the setting has
 * stopped being cosmetic and started disagreeing with three authorities.
 */
ok('the arithmetic is untouched', (function () {
  return !/moonPaksha: .*doubled/.test(appSrc) &&
    !/kala\.total \/ 2/.test(appSrc) && !/rupas \/ 2/.test(appSrc) &&
    !/\.ayana \/ 2;/.test(appSrc);
})());
/*
 * A halved cell will not appear to add up to the Kala bala above it, so it has
 * to say what the total is really counting.
 */
ok('and a halved cell names the figure the total uses', (function () {
  var at = appSrc.indexOf('if (halved && doubled) {');
  if (at < 0) return false;
  var block = appSrc.slice(at, at + 400);
  return /td\.title =/.test(block) && /doubled, which is what Kala bala/.test(block);
})());
/*
 * The row ceiling has to follow the display, or the header would promise 120
 * on a row that now tops out at 60.
 */
ok('the ceiling follows what is shown',
  /row\(part\.label, part\.en, halved \? 60 : part\.max,/.test(appSrc) &&
  /var shows = halved \? '60' : part\.shows;/.test(appSrc));
/*
 * Nothing is recomputed: not the chart, not even the strengths.
 */
ok('changing either only redraws', (function () {
  var at = appSrc.indexOf("[['paksha-doubled',");
  if (at < 0) return false;
  var block = appSrc.slice(at, appSrc.indexOf('});\n  });', at));
  return /render\(lastChart\);/.test(block) && !/computeChart\(/.test(block) &&
    !/shadbala = null/.test(block) &&
    /'ayana-doubled'/.test(block);
})());

console.log('\nThe Moon\u2019s paksha bala is a setting');
/*
 * Two authorities on each side, so the page offers both rather than picking.
 * The control belongs with the ayanamsa and the node: all three are choices
 * about how to read a chart rather than facts about one.
 */
/*
 * The default was always-benefic while the only source for it was Phaladeepika,
 * which does not assign the Moon a group rather than saying she is always a
 * benefic. Three texts put her in the groups - chapter 2 through Santhanam,
 * Raman at section 53, and Uttara Kalamrita stating it outright with the same
 * eighth-day boundary - so the group reading is the default now, and the page
 * agrees with the engine, which had defaulted that way all along.
 */
ok('the reading is offered in settings, defaulting to her fortnight group',
  (function () {
    var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    var at = html.indexOf('id="panel-settings"');
    var panel = html.slice(at, html.indexOf('</section>', html.indexOf('id="panel-testing"')));
    return /<select id="moon-paksha"/.test(panel) &&
      /<option value="group" selected>/.test(panel) &&
      /<option value="benefic">/.test(panel);
  })());
ok('and the page and the engine now default the same way',
  (function () {
    var sb = fs.readFileSync(path.join(root, 'js/shadbala.js'), 'utf8');
    return /=== MOON_PAKSHA\.BENEFIC\s*\n?\s*\? MOON_PAKSHA\.BENEFIC : MOON_PAKSHA\.GROUP/
      .test(sb);
  })());
/*
 * The page and the engine default differently, on purpose. shadbala.js keeps
 * the group reading when called with no options, because that is the one
 * Parashara's verse and Raman both give and a library caller should get the
 * conservative answer. The page ships the other because it was asked for. The
 * two never disagree in practice, because the page always passes its choice
 * explicitly rather than relying on the engine's default.
 */
ok('and the page never leans on the engine default',
  /moonPaksha: document\.getElementById\('moon-paksha'\)\.value,\s*\n\s*natClock: document\.getElementById\('nat-clock'\)\.value/
    .test(appSrc));
/*
 * The note has to name who holds each reading, or the choice is just a
 * preference with no way to decide it.
 */
/*
 * The note is for somebody meeting the setting, not for somebody auditing it:
 * what the measure is, which way the texts go, what the other option costs.
 * The argument in full - five texts, the IV.5 misreading, the arithmetic that
 * settles it - is in the Lesson tab, which is where an argument belongs.
 *
 * Classical sources only. Raman and Santhanam carried this note while Uttara
 * Kalamrita had not been found; it gives the same boundary, so the moderns are
 * no longer needed to state it.
 */
ok('the note names the classical sources and not the moderns', (function () {
  var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var at = html.indexOf('id="why-moon-paksha"');
  var block = html.slice(at, html.indexOf('</div>', at));
  return /Brihat Jataka 21/.test(block) && /Phaladeepika IV\.1/.test(block) &&
    /Uttara Kalamrita/.test(block) &&
    !/Raman/.test(block) && !/Santhanam/.test(block) && !/Charak/.test(block);
})());
ok('and stays short enough to read at a hover', (function () {
  var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var at = html.indexOf('id="why-moon-paksha"');
  var block = html.slice(at, html.indexOf('</div>', at));
  var words = block.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
  return words < 220;
})());
ok('while the Lesson tab still carries the argument in full', (function () {
  var seed = fs.readFileSync(path.join(root,
    'supabase/seed/astro_readings_strength.sql'), 'utf8');
  return /119\.5 of a possible 120/.test(seed) && /Charak/.test(seed) &&
    /Brihat Jataka 21/.test(seed);
})());
/*
 * It changes no position, so the chart is not recast - the cached Shadbala is
 * dropped and the page redrawn.
 */
ok('changing it drops the cached strengths and redraws', (function () {
  var at = appSrc.indexOf("getElementById('moon-paksha').addEventListener");
  if (at < 0) return false;
  var block = appSrc.slice(at, appSrc.indexOf('});\n\n', at));
  return /lastChart\.shadbala = null;/.test(block) &&
    /render\(lastChart\);/.test(block) && !/computeChart\(/.test(block);
})());
ok('and the choice reaches the engine', (function () {
  return /moonPaksha: document\.getElementById\('moon-paksha'\)\.value,\s*\n\s*natClock: document\.getElementById\('nat-clock'\)\.value/
    .test(appSrc);
})());

console.log('\nHovering a graha describes it');
/*
 * The chart used to put a tooltip on the house, naming its sign - which told a
 * reader what the chart already showed and nothing about the graha they were
 * pointing at. Now the label carries everything true of that graha in that
 * chart and that rotation, and a card renders it: name, sign and house, the
 * states as the marks they are written with, and the yogas as a list.
 */
(function () {
  var chartsSrc = fs.readFileSync(path.join(root, 'js/charts.js'), 'utf8');
  ok('the house no longer explains itself',
    !/House ' \+ \(h \+ 1\)/.test(chartsSrc) &&
    !/' \(' \+ Astro\.SIGNS_SA\[i\] \+ '\) - house '/.test(chartsSrc));

  // Render a real chart through the stub and read what the labels carry.
  var container = makeNode('div');
  var chart = Astro.chart({ jdUT: Astro.julianDay(1961, 8, 4, 19 + 24 / 60 + 10),
    latitude: 21.3069, longitude: -157.8583, tzOffsetMinutes: -600 });
  var yogas = { Saturn: [
    { title: 'Sasa yoga',
      summary: 'Saturn is in its own sign in the 1st, a kendra, which is Sasa yoga.' },
    { title: 'Raja yoga',
      summary: 'Saturn, lord of the 1st, and Mercury, lord of the 9th, are related: they aspect each other.' }
  ] };
  Charts.render(container, { style: 'north', planets: chart.planets,
    ascendant: chart.ascendant.longitude, division: 1, reference: 'Ascendant',
    yogas: yogas });
  var labels = [];
  (function walk(n) {
    if (n.attrs && n.attrs['data-graha']) labels.push(n.attrs);
    (n.children || []).forEach(walk);
  })(container);

  ok('every graha and the lagna carries card data', labels.length === 10,
    labels.length + ' labels');
  var sat = labels.filter(function (a) { return a['data-graha'] === 'Saturn'; })[0];
  ok('the card data names the sign and house',
    /^Capricorn \(Makara\), house \d+$/.test(sat['data-where']), sat['data-where']);
  /*
   * Each item is a statement and the reason it holds, packed as two fields.
   * Control characters separate them because a yoga's own account of itself
   * contains commas, pipes and semicolons and any of those would cut it in
   * half.
   */
  var REC = String.fromCharCode(30), FLD = String.fromCharCode(31);
  var parse = function (raw) {
    return (raw || '').split(REC).filter(Boolean).map(function (r) {
      var bits = r.split(FLD);
      return { term: bits[0], why: bits[1] || '' };
    });
  };
  var states = parse(sat['data-states']);
  ok('and the states it is in, each with its reason',
    states.length === 1 && states[0].term === 'R' &&
    /Moving backwards/.test(states[0].why), states[0].why);
  var mine = parse(sat['data-yogas']);
  ok('and the yogas it takes part in, each with its reason',
    mine.length === 2 && mine[0].term === 'Sasa yoga' &&
    /own sign/.test(mine[0].why) && mine[1].term === 'Raja yoga',
    mine.map(function (y) { return y.term; }).join(' + '));
  /*
   * A summary contains punctuation that would break a naive separator, which
   * is why the control characters are there. Guard it.
   */
  ok('and a reason survives its own punctuation',
    mine[1].why.indexOf(',') >= 0 && mine[1].why.indexOf(':') >= 0,
    mine[1].why);
  /*
   * The ascendant is a point, not a graha: it has a sign but no house of its
   * own to be in, and owns nothing to be yogakaraka of.
   */
  var asc = labels.filter(function (a) { return a['data-graha'] === 'Ascendant'; })[0];
  ok('the ascendant gets a sign but no house', asc['data-where'].indexOf('house') < 0,
    asc['data-where']);

  /*
   * Reachable without a mouse, and legible to a reader who cannot see the card
   * at all.
   */
  ok('the label is focusable and carries a spoken description',
    sat['tabindex'] === '0' && /Saturn in Capricorn/.test(sat['aria-label']),
    sat['aria-label']);

  /*
   * The card must not sit under the pointer it was opened by, or hovering it
   * would close it.
   */
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  ok('the card never steals the hover that opened it',
    /\.graha-card \{[^}]*pointer-events: none/.test(css));
  ok('and the chart box is a positioning context for it',
    /#chart-a, #chart-b \{ position: relative; \}/.test(css));
})();

console.log('\nThe card says what a yoga is and what it did here');
/*
 * Two lines under each yoga: the rule, and this chart. The rule comes from the
 * library's heading for that passage, which is already a one-line definition;
 * the points run to a paragraph apiece and would bury the line that says what
 * the chart actually did.
 */
ok('the definition is taken from the heading, not the first point',
  /return p && p\.heading \? p\.heading : '';/.test(appSrc) &&
  !/p\.points\[0\]/.test(appSrc));
/*
 * Matched on subject AND condition. A family with several members must answer
 * about the one that formed - Pancha Mahapurusha has five, and Sasa is not
 * Ruchaka.
 */
ok('and matched on the condition, not the subject alone',
  /x\.subject === item\.subject && x\.condition === item\.condition/.test(appSrc));
/*
 * The library is fetched once in the background, so a hover does not wait on
 * the network and the Lesson tab finds it already there.
 */
ok('the library is fetched once, ahead of the hover',
  /function ensureLibrary\(\)/.test(appSrc) &&
  /if \(lessonLibrary \|\| libraryPending\) return;/.test(appSrc));
/*
 * One line per finding on the card: the name, whose it is where that is not
 * obvious, and how rare it is. Nothing else.
 *
 * Eight findings at three lines apiece ran the card past the height of the
 * chart it was drawn over. The two lines under each name were the rule and
 * the reason, and the Yogas tab already gives both in full along with the
 * conditions behind them, which the card never had room for. So they are kept
 * where they cost no height - on the item's title - and the card is left with
 * what only it can offer: what this graha is in, at a glance, without leaving
 * the chart.
 */
ok('the card lists findings one line each, name and rarity',
   !/graha-card-why|graha-card-means/.test(appSrc + cssSrc) &&
   /li\.title = \[means, item\.why\]\.filter\(Boolean\)\.join\(' '\);/.test(appSrc) &&
   /\.graha-card-list li \+ li \{[^}]*margin-top: 0\.2rem;/.test(cssSrc.replace(/\n/g, '')));
/*
 * The line holds conditions the graha is in; the list holds combinations it
 * takes part in. Retrograde among the yogas read as though being retrograde
 * were one, and hemming on the conditions line read as though being caught
 * between two other grahas were not.
 *
 * Both kartari yogas make the crossing, though only the papa one was asked
 * about: they are one rule read two ways, and splitting them would put the
 * same fact in two places depending on which side of it a chart fell.
 */
ok('the states line holds conditions and the list holds combinations',
   /var KARTARI = \{ P: 'Papa kartari yoga', S: 'Shubha kartari yoga' \};/.test(appSrc) &&
   /if \(KARTARI\[item\.term\]\) return;   \/\/ a combination, listed with the yogas/
     .test(appSrc) &&
   /if \(!KARTARI\[item\.term\]\) return;/.test(appSrc) &&
   /head\.appendChild\(el\('span', 'graha-card-label', KARTARI\[item\.term\]\)\)/.test(appSrc) &&
   /rarity\(head, 'state', key\)/.test(appSrc));
/*
 * And the detail is not merely dropped: the Yogas tab carries the summary and
 * the reasons for every finding, so the card is a shorter view of something
 * complete rather than the only view of something trimmed.
 */
ok('and the Yogas tab carries one coherent manifestation instead of the bullets',
   /yogaName\.title = finding\.manifestation/.test(appSrc) &&
   !/yogaAccount/.test(appSrc));

/*
 * And the card survives the library being absent: it loses a line, not its
 * contents.
 */
ok('and a missing library costs one line, not the card',
  /if \(!lessonLibrary \|\| !item\.subject\) return '';/.test(appSrc));

console.log('\nEvery finding can explain itself');
/*
 * A finding carries the subject and condition astro_readings is keyed by, so
 * the graha card can ask the library what the yoga is - as against the summary,
 * which says why it holds in this chart. A pair with no passage left the card
 * saying a yoga was present and not what it was, and seven of them did: a third
 * of all findings by count, the commonest being plain raja yoga.
 */
(function () {
  var seeds = fs.readFileSync(path.join(root,
    'supabase/seed/astro_readings_yogas.sql'), 'utf8');
  var keyed = {};
  (seeds.match(/^\('yoga', '([^']+)', '([^']+)',/gm) || []).forEach(function (m) {
    var bits = m.match(/^\('yoga', '([^']+)', '([^']+)',/);
    keyed[bits[1] + ' / ' + bits[2]] = true;
  });
  // Every pair the detectors can produce, swept over charts rather than guessed
  var missing = {};
  for (var y = 1950; y < 2025; y += 5) {
    for (var m = 1; m <= 12; m += 4) {
      var c = Astro.chart({ jdUT: Astro.julianDay(y, m, 15, 6.5), latitude: 28.61,
        longitude: 77.21, tzOffsetMinutes: 330 });
      Yogas.detect(c, Shadbala.compute(c,
        { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 }))
        .forEach(function (f) {
          var k = (f.subject || '?') + ' / ' + (f.condition || '?');
          if (!keyed[k]) missing[k] = true;
        });
    }
  }
  ok('every yoga a chart can produce has a passage of its own',
    Object.keys(missing).length === 0,
    Object.keys(missing).join(', ') || 'none unaccounted for');
})();

console.log('\nThe tab strip opens where it starts');
/*
 * "Add a kundali" was the tab selected on load but sat second in the strip,
 * so the page opened on a tab that was not the first one. Saved kundalis is
 * also an empty list until something is saved, which is a poor first thing to
 * land on.
 */
(function () {
  var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var strip = html.slice(html.indexOf('<div class="tabs" role="tablist"'),
    html.indexOf('</div>', html.indexOf('<div class="tabs" role="tablist"')));
  var ids = (strip.match(/id="tab-([a-z]+)"/g) || []).map(function (m) {
    return m.slice(8, -1);
  });
  ok('add comes first and saved second',
    ids[0] === 'add' && ids[1] === 'saved', ids.join(' > '));
  ok('and the first tab is the one selected on load',
    /id="tab-add"[^>]*aria-selected="true"/.test(strip) &&
    !/id="tab-saved"[^>]*aria-selected="true"/.test(strip));
  /*
   * The keyboard order has to follow the strip, or arrow keys walk the tabs in
   * a different order than the eye does.
   */
  ok('and the arrow-key order matches the strip',
    /setupTabs\(\['add', 'saved', 'chart', 'lesson', 'settings', 'testing'\]/.test(appSrc));
})();

console.log('\nThe North chart groups sign numbers at its four junctions');
(function () {
  var src = fs.readFileSync(path.join(root, 'js/charts.js'), 'utf8');
  var literal = src.match(/var NORTH_SIGN_ANCHORS = (\[[\s\S]*?\n  \]);/);
  var anchors = literal ? new Function('return ' + literal[1])() : [];
  ok('there is one fixed edge anchor for every North-chart house', anchors.length === 12);
  ok('each side has two signs on its rim and its angle sign just inside',
    anchors[1][1] === anchors[11][1] && anchors[0][1] > anchors[1][1] &&
    anchors[2][0] === anchors[4][0] && anchors[3][0] > anchors[2][0] &&
    anchors[5][1] === anchors[7][1] && anchors[6][1] < anchors[5][1] &&
    anchors[8][0] === anchors[10][0] && anchors[9][0] < anchors[8][0]);
  ok('the four junction patterns are rotations of one another',
    anchors[0][0] === 0.5 && anchors[3][1] === 0.5 &&
    anchors[6][0] === 0.5 && anchors[9][1] === 0.5 &&
    anchors[1][0] + anchors[11][0] === 1 &&
    anchors[2][1] + anchors[4][1] === 1);
  ok('crowding no longer moves either the sign number or the graha stack',
    /var numberAt = NORTH_SIGN_ANCHORS\[h\];/.test(src) &&
    /drawOccupants\(g, occ, cx, cy \+ 4,/.test(src) &&
    !/shortfall|idealTop|numY/.test(src));
})();

console.log('\nSettings show the choice and fold the argument');
/*
 * Nine choices, each needing a paragraph or two to say why anybody would pick
 * differently. Printed out they buried the controls: the panel read as an
 * essay with selects in it. So the label and the select stay visible and the
 * reasoning folds behind a summary, for whoever is deciding rather than
 * reading.
 */
(function () {
  var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var at = html.indexOf('id="panel-settings"');
  var panel = html.slice(at, html.indexOf('</section>', html.indexOf('id="panel-testing"')));
  var fields = (panel.match(/<div class="field">/g) || []).length;
  var whys = (panel.match(/<div class="field-why"/g) || []).length;
  ok('every setting carries its own explanation',
    fields === whys && fields >= 9, fields + ' fields, ' + whys + ' notes');
  /*
   * Each fold must sit AFTER its control, or the argument still comes first.
   */
  ok('and the control comes before the explanation', (function () {
    var blocks = panel.split('<div class="field">').slice(1);
    return blocks.every(function (b) {
      var sel = b.indexOf('</select>'), why = b.indexOf('<div class="field-why"');
      return sel >= 0 && why > sel;
    });
  })());
  /*
   * The status line is a field-note too and must not have been swept into a
   * fold, or the page would stop reporting what it just did.
   */
  ok('each panel keeps its own status line, in the open',
    (panel.match(/<p class="field-note settings-status" id="[a-z]+-status"><\/p>/g) || [])
      .length === 2 &&
    panel.lastIndexOf('-status') > panel.lastIndexOf('</details>'));
  /*
   * And the code writes to the one in the panel the setting sits in. Two tabs
   * means a message put in the other one is a message nobody sees.
   */
  ok('and the code finds the status line beside the setting that changed',
    /function statusFor\(select\)/.test(appSrc) &&
    !/getElementById\('settings-status'\)/.test(appSrc) &&
    (appSrc.match(/var status = statusFor\(this\);/g) || []).length === 14);
  /*
   * And the reasoning is still there: each note argues from a named authority
   * rather than asserting. The ayanamsa note used to carry Raman's own figure
   * too, which is now only in the Lesson tab - the settings note says which
   * ayanamsa to use and the lesson says what it costs, which is the right
   * division of a short note and a long one.
   */
  ok('and the arguments survived the wrapping',
    /Parashara/.test(panel) && /Phaladeepika/.test(panel) &&
    /Santhanam/.test(panel) && /Raman/.test(panel));
})();

console.log('\nThe mark legend folds away');
/*
 * Nine entries of prose sit under every chart, and they are the kind of thing
 * read twice and then never again. Closed by default, opened when wanted, and
 * native <details> so it needs no script and keeps its keyboard behaviour.
 */
ok('the key is one line beside the grid, not a folded block of its own',
   (function () {
     var page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
     return !/flag-legend/.test(page) && /<p class="varga-key">/.test(page);
   })());
/*
 * All nine marks must still be inside it. Wrapping a list in a new element is
 * an easy way to strand an entry outside the fold.
 */
ok('and holds the six the grid draws, the other three being the card\u2019s',
   (function () {
     var page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
     var flat = page.replace(/\s+/g, ' ');
     var key = (flat.match(/<p class="varga-key">.*?<\/p>/) || [''])[0];
     return ['flag-v', 'flag-x', 'flag-s', 'flag-p', 'flag-d', 'flag-n']
         .every(function (f) { return key.indexOf(f) >= 0; }) &&
       ['flag-r', 'flag-y', 'flag-c']
         .every(function (f) { return key.indexOf(f) < 0; });
   })());
/*
 * And it borrows the summary styling the other folds already use, rather than
 * growing a look of its own. Four of them share the rule now, the catalogue
 * having joined them.
 */
ok('and wears the same summary as the other folds', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return /\.options summary, \.technical summary, \.flag-legend summary \{/
      .test(css) &&
    /\.flag-legend \{/.test(css);
})());

/*
 * The control rows fill their width instead of packing to the left. The Yogas
 * tab carries three selects - graha, chart, reference - and at a fixed width
 * they bunched at one end with a third of the line empty beside them.
 *
 * Bounded rather than unbounded: two of the four rows hold a single select,
 * and one control stretched across the page reads as a mistake. At three the
 * container binds first and the row fills; at one the cap holds it.
 */
ok('the selects in a control row share its width, within a limit',
  /\.varga-scheme-row select \{ width: auto; flex: 1 1 15rem; max-width: 24rem; \}/
    .test(cssSrc) &&
  /\.varga-scheme-row \{ display: flex;/.test(cssSrc));

/*
 * Every column in the yoga table is centred under its own label, except the
 * first. The headings were centred and the cells were not, so a figure sat at
 * the left of a column whose name sat in the middle of it.
 *
 * The graha column stays left: it is a list of names of varying length - one
 * graha or seven - and centring those ragged both edges where reading down
 * them wants one straight.
 */
ok('the yoga table centres its columns under their labels, the first excepted',
  /\.yoga-table td \{ vertical-align: top; text-align: center; \}/.test(cssSrc) &&
  /\.yoga-table th\[scope="row"\], \.yoga-table thead tr:first-child th:first-child \{\s*text-align: left;/
    .test(cssSrc) &&
  /\.yoga-table thead th \{\s*text-align: center;/.test(cssSrc));

/*
 * The findings on a graha card read as three columns: the name, where it was
 * read from, how rare it is.
 *
 * space-between with three children puts the middle one halfway along,
 * wherever halfway falls for that row, so the "from" was a ragged line of its
 * own down the middle of the card. The name takes the slack instead, and the
 * two that qualify it sit right in columns wide enough for the longest.
 */
ok('the card’s findings line up in columns rather than drifting',
  /\.graha-card-term \{[^}]*display: flex;[^}]*gap: 0\.75rem;[^}]*\}/
    .test(cssSrc.replace(/\n/g, '')) &&
  !/\.graha-card-term \{[^}]*justify-content: space-between/
    .test(cssSrc.replace(/\n/g, '')) &&
  /\.graha-card-label \{ flex: 1; \}/.test(cssSrc) &&
  /\.graha-card-whose \{[^}]*min-width: 8\.5rem;[^}]*text-align: right;/
    .test(cssSrc.replace(/\n/g, '')) &&
  /\.graha-card-freq \{[^}]*min-width: 7rem;[^}]*text-align: right;/
    .test(cssSrc.replace(/\n/g, '')));
/*
 * And the heading's dots are spaced the same on both sides.
 *
 * Measured rather than matched. The trail is a flex container, so its ::before
 * is a flex item and the container's gap spaces its right side; a right margin
 * on top of that put 1.05rem after the first dot against 0.35rem before, where
 * every other dot on the card has the same on both sides.
 */
ok('and the dots in the heading are spaced on both sides', (function () {
  var flat = cssSrc.replace(/\n/g, ' ');
  var trail = /\.graha-card-trail \{([^}]*)\}/.exec(flat);
  var dot = /\.graha-card-trail::before \{([^}]*)\}/.exec(flat);
  if (!trail || !dot) return false;
  var gap = /gap: 0 ([\d.]+)rem/.exec(trail[1]);
  var lead = /margin-left: ([\d.]+)rem/.exec(trail[1]);
  // The dot itself must carry no horizontal margin: the gap is doing that job.
  var dotMargin = /margin[^:]*: [^;]*/.exec(dot[1]);
  return !!gap && !!lead && !dotMargin &&
    Number(gap[1]) === Number(lead[1]) &&
    /display: inline-flex/.test(trail[1]);
})());

/*
 * And the reserved columns fit the narrowest screen the card is drawn on.
 *
 * Arithmetic, from the stylesheet's own numbers, because the declarations
 * existing says nothing about whether they leave room for a name. At 320px
 * the card is capped at 100vw minus its margin and its padding takes more,
 * and the two reserved columns plus the gaps between them came to exactly
 * what was left - nothing at all for the yoga's name.
 */
ok('and the reserved columns leave room for a name at every width', (function () {
  var flat = cssSrc.replace(/\s+/g, ' ');
  var num = function (re, from) { var m = re.exec(from); return m ? Number(m[1]) : null; };
  var card = /\.graha-card \{([\s\S]*?)\}/.exec(flat)[1];
  var viewportMargin = num(/max-width: min\([\d.]+rem, calc\(100vw - ([\d.]+)rem\)\)/, card);
  var padding = num(/padding: [\d.]+rem ([\d.]+)rem/, card);
  var term = /\.graha-card-term \{([^}]*)\}/.exec(flat)[1];
  var gap = num(/gap: ([\d.]+)rem/, term);
  var whose = num(/\.graha-card-whose \{[^}]*min-width: ([\d.]+)rem/, flat);
  var freq = num(/\.graha-card-freq \{[^}]*min-width: ([\d.]+)rem/, flat);
  var breakpoint = num(/@media \(max-width: ([\d.]+)rem\) \{ \.graha-card-term \{ flex-wrap: wrap/, flat);
  if ([viewportMargin, padding, gap, whose, freq, breakpoint].some(function (v) { return v === null; })) {
    return false;
  }
  // Below the breakpoint the reservations are given back and the row wraps.
  var released = /@media \(max-width: [\d.]+rem\) \{[^@]*\.graha-card-term \.graha-card-whose, \.graha-card-term \.graha-card-freq \{ min-width: 0; \}/
    .test(flat);
  // At and above it, the name must still have a readable share.
  var content = breakpoint - viewportMargin - 2 * padding;
  var reserved = whose + freq + 2 * gap;
  return released && content - reserved >= 8;
})());

console.log('\nAyanamsa lives in settings');
/*
 * The ayanamsa is not a fact about a nativity. It is a choice about how every
 * nativity is read, and while it sat in the per-chart calculation options it
 * looked like the former. It is now in Chart settings beside the node, which is
 * the other control of the same kind.
 */
ok('the ayanamsa select sits in the settings panel', (function () {
  var html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var at = html.indexOf('id="panel-settings"');
  var panel = html.slice(at, html.indexOf('</section>', html.indexOf('id="panel-testing"')));
  // The form itself, which is where it used to sit. The fold it sat in is gone
  // as well, so the check is against the whole form rather than that slice.
  var form = html.slice(html.indexOf('id="birth-form"'), html.indexOf('</form>'));
  return at > 0 &&
    /<select id="ayanamsa"/.test(panel) &&
    !/id="ayanamsa"/.test(form) &&
    !/id="node-type"/.test(form) &&
    /id="node-type"/.test(panel);
})());
/*
 * And changing it recasts what is on screen. A chart drawn from one zero point
 * while the select shows another is wrong by more than a degree, which is far
 * too much to leave standing until something else happens to redraw.
 */
ok('and changing it recomputes the open chart', (function () {
  var at = appSrc.indexOf("getElementById('ayanamsa').addEventListener");
  if (at < 0) return false;
  var block = appSrc.slice(at, appSrc.indexOf('});\n\n', at));
  return /ayanamsa: wanted, trueNode: lastChart\.trueNode/.test(block) &&
    /lastChart\.ayanamsa = wanted;/.test(block) &&
    /render\(lastChart\);/.test(block) &&
    /writeHash\(lastChart\);/.test(block) &&
    /if \(!lastChart\)/.test(block);
})());
/*
 * Moving it must not cost the per-chart record. A saved chart still carries the
 * ayanamsa it was cast with, and opening one still puts the select where that
 * chart put it, or the settings panel would lie about what is on screen.
 */
ok('and a saved chart still carries and restores its own', (function () {
  return /ayanamsa: params\.ayanamsa, trueNode: params\.trueNode/.test(appSrc) &&
    /document\.getElementById\('ayanamsa'\)\.value = entry\.ayanamsa \|\| 'lahiri';/
      .test(appSrc) &&
    /document\.getElementById\('ayanamsa'\)\.value = state\.ayanamsa;/.test(appSrc);
})());
/*
 * That the Shadbala tab runs Raman's arithmetic on positions he did not use is
 * a pairing in no book, so the site has to be the one to say it. It was said
 * twice, in a long second paragraph under the ayanamsa setting and again in
 * the lesson on checking a disagreement. The settings note is the wrong place
 * for it: a reader there is choosing an ayanamsa, not auditing a total. The
 * lesson keeps it, with the measurements and the order to check things in.
 */
ok('the lesson says whose positions Raman-method Shadbala is running on',
  (function () {
    var seed = fs.readFileSync(path.join(root,
      'supabase/seed/astro_readings_strength.sql'), 'utf8');
    return /If you are checking against Raman''s own book, his ayanamsa is the one to set, not Lahiri/
      .test(seed) &&
      /19 shashtiamsas on the average total, as much as three rupas/.test(seed);
  })());

console.log('\nPassage sources');
/*
 * A passage that says two authorities read a verse differently is an assertion
 * about books, and an assertion about books that does not name them cannot be
 * checked. The column was on the table from the start and went unused; the
 * lesson only became falsifiable once it rendered.
 */
ok('a passage renders the works it was read out of', (function () {
  var at = appSrc.indexOf('function passageBlock');
  var block = appSrc.slice(at, appSrc.indexOf('return block;', at));
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return /if \(passage\.source\) \{/.test(block) &&
    /el\('p', 'passage-source', passage\.source\)/.test(block) &&
    /\.passage-source \{/.test(css);
})());
/*
 * And the citation sits below the note rather than above the points: it is
 * there to be checked afterwards, not read on the way in.
 */
ok('and it comes last, under the note', (function () {
  var at = appSrc.indexOf('function passageBlock');
  var block = appSrc.slice(at, appSrc.indexOf('return block;', at));
  return block.indexOf('passage-note') < block.indexOf('passage-source');
})());
/*
 * Every strength passage carries one. The seed is the only place the claim can
 * be checked without a database, and a passage added later without a source
 * would slip through silently otherwise.
 */
ok('every strength passage in the seed names its sources', (function () {
  var sql = fs.readFileSync(path.join(root,
    'supabase/seed/astro_readings_strength.sql'), 'utf8');
  var rows = sql.split(/\n\('strength', /).slice(1);
  // Against the sort orders rather than against a number typed here: a row
  // added later should be checked, not counted, and a literal only ever gets
  // bumped to make the suite quiet again.
  if (!rows.length || rows.length !== (sql.match(/\n \d{3}\)/g) || []).length) {
    return false;
  }
  return rows.every(function (row) {
    // the source is the literal between the note and the sort order
    var tail = row.slice(row.indexOf(' ],\n') + 4);
    tail = tail.slice(0, tail.search(/\n \d{3}\)/) + 6);
    var cited = /(Parashara|Raman|Phaladeepika|Santhanam|Mantreswara|Sastri)/
      .test(tail);
    return cited && /,\s*7\d\d\)/.test(tail);
  });
})());
/*
 * A work reached at second hand has to say so, or the citation claims a check
 * that was never made. Saravali still is: it comes by way of Santhanam's note,
 * only Devanagari scans of the text itself being available.
 *
 * Sripatipaddhati no longer is, and that is worth pinning in both directions.
 * Its cheshta chapter was read here, and it is the source that makes sense of
 * the eight motions. Its drishti chapter was not, so the curve in this code
 * still descends from Raman, and the passage that cites it has to keep saying
 * so rather than inheriting the other's promotion.
 */
ok('and works cited at second hand are marked as such', (function () {
  var sql = fs.readFileSync(path.join(root,
    'supabase/seed/astro_readings_strength.sql'), 'utf8');
  return /Kalyana Varma''s text has not been consulted directly/.test(sql) &&
    !/Sripatipaddhati has not been read directly here/.test(sql);
})());
ok('and a work read for one thing is not claimed for another', (function () {
  var sql = fs.readFileSync(path.join(root,
    'supabase/seed/astro_readings_strength.sql'), 'utf8');
  return /has not been re-derived from those slokas/.test(sql) &&
    /The drishti curve is the part still taken at second hand/.test(sql);
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
   /GOOD_KEYS\.indexOf\(d\.relation\) >= 0/.test(appSrc) &&
   Astro.VARGA_DIGNITY_LABELS.adhimitra === 'Great Friend');
/*
 * And the good ones are rungs of this ladder. Exalted and moolatrikona were in
 * the list and are not steps of the varga viswa at all, so a cell could be
 * counted well placed while scoring seven out of twenty.
 */
ok('and the list holds only steps the varga viswa has',
   /var GOOD_KEYS = \['own', 'adhimitra', 'mitra'\];/.test(appSrc) &&
   ['own', 'adhimitra', 'mitra'].every(function (k) {
     return Astro.VARGA_VISWA[k] !== undefined;
   }));
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
   /svgEl\('title', \{\}, \(row\.name \|\| row\.graha\) \+ ', ' \+ s\.label/.test(appSrc));

/*
 * House style, and a standing preference: hyphens, commas and colons carry
 * these sentences. The seed files are already held to this; the code writes
 * just as much of what a reader sees - captions, tooltips, status lines - so
 * it is held to the same rule, and the setting explanations in the page with
 * it. Checked on the source rather than on any one rendered string, since the
 * point is that none of them can reintroduce it.
 */
ok('nothing the interface says uses an em-dash', (function () {
  var dashed = ['js/app.js', 'js/charts.js', 'js/yogas.js', 'js/astro.js',
    'js/shadbala.js', 'js/geo.js', 'index.html'].filter(function (n) {
      var text = fs.readFileSync(path.join(root, n), 'utf8');
      return text.indexOf('\u2014') > -1 || text.indexOf('&mdash;') > -1;
    });
  return dashed.length === 0;
})());

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
  return /division has landed the graha back in the sign it holds in the rashi/
    .test(html.replace(/\s+/g, ' ')) &&
    /Never on D1, where every graha would qualify\. In D9 it is vargottama proper/
      .test(html.replace(/\s+/g, ' ')) &&
    !/A sign marked \[V\]/.test(flat);
})());
ok('and the D9 case is named as vargottama proper in the key, not per cell',
   /Never on D1, where every graha would qualify\. In D9 it is vargottama proper/
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
   /<span class="flag flag-v">\[V\]<\/span> vargottama:/
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
       /Never on D1, where every graha would qualify\. In D9 it is vargottama proper/
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
   /yes\.addEventListener\('click', function \(\) \{ removeSaved\(entry\); \}\)/.test(appSrc) &&
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
/*
 * Asked of a new chart and not of an old one. Gender changes no calculation
 * here and the stored record allows it to be unstated, so a chart saved
 * without one could not be reopened at all: the refusal went to a box on a tab
 * the reader had just been taken off, and the chart panel sat empty with
 * nothing to say why. One of the 30 stored charts was in that state.
 */
ok('gender starts unanswered and is checked on submit',
   /<option value="" selected>Select<\/option>/.test(html) &&
   /if \(!genderValue && !reopening\) return fail\('Choose a gender\.'\);/.test(appSrc));
/*
 * Which needs the reopening flag read before anything can return. Its own
 * comment always claimed it was read synchronously; it was read after the
 * validation, so a refused submit left it standing and swallowed the save of
 * whatever was generated next.
 */
ok('and the reopening flag is read before the first refusal can return',
   appSrc.indexOf('var reopening = reopeningSaved;') <
     appSrc.indexOf("return fail('Enter the name this chart belongs to.')") &&
   appSrc.indexOf('var flagged = pendingFlagged;') <
     appSrc.indexOf("return fail('Enter the name this chart belongs to.')"));
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
['name', 'birth-day', 'birth-month', 'birth-year', 'birth-hour', 'birth-minute', 'place']
  .forEach(function (id) {
  var tag = html.match(new RegExp('<input[^>]*id="' + id + '"[^>]*>'));
  ok('#' + id + ' is marked required in the markup', !!tag && /\srequired/.test(tag[0]));
});
/*
 * Typed, in one order, with a gap between the boxes. A date picker opens on
 * this month, which is a month of clicking away from a birth in 1938, and it
 * draws its own separators in its own order: the same form showed dd/mm/yyyy
 * in one browser and mm/dd/yyyy in another, over an input whose value is
 * neither. Three boxes say which is which and cannot be read the other way.
 */
/*
 * The way out of the place search sits with the label, not under the box. It
 * is an alternative to the field rather than a step after it, and below the
 * combobox it read as something to reach for once the search had already
 * failed - half a field away from the box it replaces.
 */
/*
 * And the boxes it opens sit between the place and the note. They are the
 * place, entered another way; after the note they were a field away from the
 * thing they replace, with something unrelated in between.
 */
/*
 * And their legend sits inside the panel rather than over its edge. A legend
 * straddles the top border by default, which is right for a plain rule and
 * wrong for a panel with a fill: half of every letter stood on the tint and
 * half on the card behind it, with the dashed border passing through the
 * words. Floated, it is an ordinary block inside the panel.
 */
/*
 * And the three labels in that panel are one style. Latitude and Longitude
 * name a group of four boxes rather than one control, so they are spans rather
 * than <label for>, and having missed the label rule they had drifted: bigger,
 * darker, less spaced and lighter in weight than the timezone label beside
 * them and the legend above them.
 */
ok('latitude and longitude are labelled like every other label',
   /label, legend, \.dms-label \{/.test(cssSrc) &&
   /\.dms-label \{ display: block; \}/.test(cssSrc) &&
   // Nothing of its own left to diverge with.
   (cssSrc.match(/^\.dms-label \{[^}]*\}/m) || [''])[0] === '.dms-label { display: block; }');

ok('the legend sits on one colour, not across the panel edge',
   /\.manual-coords legend \{[^}]*float: left;[^}]*width: 100%;/
     .test(cssSrc.replace(/\n/g, '')) &&
   /\.manual-coords::after \{ content: ''; display: table; clear: both; \}/.test(cssSrc));

ok('the manual coordinates sit between the place and the note',
   html.indexOf('id="manual-coords"') > html.indexOf('id="place-combobox"') &&
   html.indexOf('id="manual-coords"') < html.indexOf('id="person-note"'));

ok('the coordinates link sits beside the place label',
   html.indexOf('id="manual-toggle"') > html.indexOf('<label for="place">') &&
   html.indexOf('id="manual-toggle"') < html.indexOf('id="place-combobox"') &&
   /<div class="label-row">/.test(html));
/*
 * Baselines, not boxes. The label is 0.74rem uppercase and the link 0.8rem
 * sentence case, so aligning their boxes would read as two lines that happen
 * to overlap. And align-self is named because .link-button sets flex-start
 * for the column it usually sits in, which would beat the row.
 */
ok('and the two are aligned on their baselines',
   /\.label-row \{[^}]*align-items: baseline;/.test(cssSrc.replace(/\n/g, '')) &&
   /\.label-row \.link-button \{[^}]*align-self: baseline;/.test(cssSrc) &&
   /\.label-row label \{ margin-bottom: 0; \}/.test(cssSrc));

ok('the date is typed rather than picked',
   !/<input type="date"/.test(html) &&
   html.indexOf('id="birth-day"') < html.indexOf('id="birth-month"') &&
   html.indexOf('id="birth-month"') < html.indexOf('id="birth-year"'));
ok('and the boxes say what goes in them, without a slash between',
   /placeholder="dd"/.test(html) && /placeholder="mm"/.test(html) &&
   /placeholder="yyyy"/.test(html) &&
   /<legend>Date of birth <span class="hint">day month year<\/span><\/legend>/.test(html) &&
   /\.date-grid \{[^}]*gap: 0\.45rem;/.test(cssSrc));
/*
 * A picker would have refused 31 February on its own. Typed boxes take it, so
 * the day is checked against the month and the year beside it - a leap year is
 * the case that makes a fixed table of month lengths wrong one year in four.
 */
ok('an impossible date is caught rather than cast',
   /31, \(y % 4 === 0 && y % 100 !== 0\) \|\| y % 400 === 0 \? 29 : 28,/.test(appSrc) &&
   /'The day must be from 1 to ' \+ last \+ ' in that month\.'/.test(appSrc) &&
   /The year must be from 1800 to 2100/.test(appSrc));
ok('and the day and month hand focus along like the hour and minute do',
   /\[dayInput, monthInput, 3\], \[monthInput, yearInput, 1\]/.test(appSrc));

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

  put('lat', 23, 19, '', 'N');
  ok('the seconds may be left empty', near(readDms('lat', 90), 23 + 19 / 60));

  /*
   * The minutes may not. A whole degree on its own is up to 60 nautical miles
   * from the birthplace: measured over 13,992 charts, that moves the lagna
   * about half a degree, the lagna sign in 2% of them and the navamsa lagna in
   * one in six, which is the same error as being three minutes out about the
   * birth time. Far too much to take from a box left empty because nothing
   * said it mattered.
   */
  put('lat', 23, '', '', 'N');
  ok('the minutes may not', /needs its minutes/.test(readDms('lat', 90).error || ''),
    readDms('lat', 90).error);
  ok('and the refusal says what it costs and how to mean it',
    /can be 60 miles from the birthplace/.test(readDms('lat', 90).error || '') &&
    /Type 0 if the record gives none/.test(readDms('lat', 90).error || ''));

  /*
   * Zero, typed, is accepted. A record that really gives a whole degree is a
   * real thing and refusing it outright would leave no way to say so.
   */
  put('lat', 23, 0, '', 'N');
  ok('a typed zero is taken at its word', near(readDms('lat', 90), 23));

  /*
   * And a decimal is exempt, carrying its own minutes. Requiring them of it
   * would have broken the one shorthand the note advertises.
   */
  put('lat', 23.3176, '', '', 'N');
  ok('a decimal in the degrees box still stands on its own',
    near(readDms('lat', 90), 23.3176));
  /*
   * And the note under the boxes says only what the boxes cannot. It used to
   * open by arguing for the design - degrees and a letter rather than a signed
   * decimal, so no minus can be dropped - which is a reason to have built it
   * this way and not a thing a reader needs while filling it in. The marks and
   * the N/E selects say the format.
   *
   * It also used to offer the minutes and the seconds as equally droppable,
   * which they are not, by three orders of magnitude. Measured over 13,992
   * charts across eleven latitudes: dropping the seconds moves the lagna by
   * 0.008 degrees and changes the navamsa lagna in 0.1% of them, while
   * dropping the minutes moves it half a degree and changes the navamsa lagna
   * in one chart in six. One is free and the other is a real loss, and a note
   * that waves at both invites the wrong one.
   */
  ok('the note offers the seconds and not the minutes',
    /<p class="varga-note">Seconds may be left empty; the minutes are worth half a\s+degree of lagna, so they are not\. A decimal typed into the degrees box on its\s+own works too\.<\/p>/
      .test(html) &&
    /id="manual-lat-m"[^>]* required>/.test(html) &&
    /id="manual-lon-m"[^>]* required>/.test(html) &&
    !/the way an atlas or a birth record/.test(html) &&
    !/Minutes and seconds may be left empty/.test(html));
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
   /function blankForm[\s\S]*?zoneChosenByHand = false;[\s\S]*?zoneResolvedFor = '';/.test(appSrc));
ok('restoring either kind of chart also forgets an older manual zone choice',
   /function applyEntryToForm[\s\S]*?zoneChosenByHand = false;/.test(appSrc) &&
   /function fillForm[\s\S]*?zoneChosenByHand = false;/.test(appSrc));
ok('manual coordinates cannot submit before their timezone belongs to those coordinates',
   /zoneResolvedFor !== coordinateKey\(lat\.value, lon\.value\)/.test(appSrc) &&
   /Wait for the timezone to be filled in/.test(appSrc));
ok('an older timezone lookup cannot overwrite a newer coordinate or a hand choice',
   /var request = \+\+zoneRequest;/.test(appSrc) &&
   /request !== zoneRequest \|\| zoneChosenByHand/.test(appSrc));
ok('deriving runs whenever a coordinate box changes', (function () {
  var wiring = appSrc.slice(appSrc.indexOf("['lat', 'lon'].forEach(function (which) {"),
                            appSrc.indexOf('function writeCoords'));
  return /showDecimal\(which, max\);\s*\n\s*deriveZone\(\);/.test(wiring);
})());

console.log('\nShareable chart URLs');
ok('a shared chart carries every input that changes its calculation or readings',
   /'ay=' \+ encodeURIComponent\(state\.ayanamsa\)/.test(appSrc) &&
   /'node=' \+ \(state\.trueNode \? 'true' : 'mean'\)/.test(appSrc) &&
   /'g=' \+ encodeURIComponent\(state\.gender \|\| 'unstated'\)/.test(appSrc));
ok('and a written URL restores those choices before it submits', (function () {
  var share = appSrc.slice(appSrc.indexOf('function writeHash'),
                           appSrc.indexOf('/* ------------------------------------------------------------------ init'));
  var fields = {
    name: { value: '', focus: function () {} },
    'time-standard': { value: 'zone' },
    ayanamsa: { value: 'lahiri', options: [{ value: 'lahiri' }, { value: 'raman' }] },
    'node-type': { value: 'true' }, gender: { value: '' }
  };
  var location = { hash: '' }, submitted = 0, restoredDate = '', restoredTime = [];
  var history = { replaceState: function (_a, _b, hash) { location.hash = hash; } };
  var document = { getElementById: function (id) { return fields[id]; } };
  var placeInput = { value: '' }, placeNote = { textContent: '' };
  var form = { requestSubmit: function () { submitted += 1; } };
  var mod = new Function('history', 'location', 'document', 'placeInput', 'placeNote', 'form',
    'var selectedCity = null, reopeningSaved = false;\n' +
    'function placeLabelOf(p) { return p.label; }\n' +
    'function writeDate(v) { restoredDate = v; }\n' +
    'function writeTime(h, m, s) { restoredTime = [h, m, s]; }\n' +
    'var restoredDate = "", restoredTime = [];\n' + share +
    '\nreturn { writeHash: writeHash, readHash: readHash, result: function () {' +
    'return { selectedCity: selectedCity, reopeningSaved: reopeningSaved,' +
    'restoredDate: restoredDate, restoredTime: restoredTime }; } };')(
      history, location, document, placeInput, placeNote, form);
  mod.writeHash({ y: 1946, mo: 6, d: 14, h: 10, mi: 54, time: { second: 12 },
    place: { lat: 40.6915, lon: -73.8057, zone: 'America/New_York', label: 'Queens, New York' },
    standard: 'lmt', name: 'Donald Trump', ayanamsa: 'raman', trueNode: false, gender: 'female' });
  fields.ayanamsa.value = 'lahiri'; fields['node-type'].value = 'true'; fields.gender.value = '';
  mod.readHash();
  var result = mod.result();
  return submitted === 1 && result.restoredDate === '1946-06-14' &&
    result.restoredTime.join(':') === '10:54:12' && fields.ayanamsa.value === 'raman' &&
    fields['node-type'].value === 'mean' && fields.gender.value === 'female' &&
    fields['time-standard'].value === 'lmt' && result.selectedCity.zone === 'America/New_York';
})());
ok('old shared links stop and ask for the gender their readings are missing', (function () {
  var restore = appSrc.slice(appSrc.indexOf('function readHash'), appSrc.indexOf('/* ------------------------------------------------------------------ init'));
  return /if \(!document\.getElementById\('gender'\)\.value\) \{[\s\S]*?fail\('Choose a gender to restore this older link\.'\);[\s\S]*?getElementById\('gender'\)\.focus\(\);[\s\S]*?return;/.test(restore);
})());
ok('merely opening manual coordinates does not discard a city already chosen', (function () {
  var toggle = appSrc.slice(appSrc.indexOf("manualToggle.addEventListener('click'"),
                            appSrc.indexOf('/* ------------------------------------------------------------ date field'));
  return !/selectedCity = null;/.test(toggle);
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

console.log('\nHow rare a finding is, said out loud');
/*
 * Every line on the card carries how often it is true at all. Without it the
 * card ranks a yoga holding in two charts out of three level with one holding
 * in three out of a thousand, and a reader with one chart in front of them has
 * no way to tell. The figures are measured, not asserted, so what the tests
 * have to protect is that the measurement covers what the card can print and
 * that the page actually loads it.
 */
(function () {
  var F = global.FREQUENCIES;
  ok('the frequency table is generated and shaped as the card expects',
    F && F.charts > 1000 && F.yoga && F.state,
    F ? 'charts=' + (F && F.charts) : 'absent');

  var page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  ok('the page loads the table before the code that reads it',
    page.indexOf('data/frequencies.js') > -1 &&
    page.indexOf('data/frequencies.js') < page.indexOf('js/app.js'));

  /*
   * A yoga added to the detectors without rebuilding the table would lose its
   * figure silently - the line would simply render bare, which looks like a
   * design choice rather than a gap. Sweep for the pairs and demand each one.
   */
  var missingYoga = {}, missingManifestation = {}, missingState = {};
  var manifestationKey = function (f) {
    var route = Array.isArray(f.route) ? f.route.slice().sort().join('+')
      : f.route || f.kind || f.condition || 'general';
    return f.title + '|' + route;
  };
  var STATES = ['R', 'C', 'Y', 'V'];
  for (var y = 1950; y < 2025; y += 5) {
    for (var m = 1; m <= 12; m += 4) {
      var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };
      var c = Astro.chart({ jdUT: Astro.julianDay(y, m, 15, 6.5), latitude: 28.61,
        longitude: 77.21, tzOffsetMinutes: 330 });
      Yogas.detect(c, Shadbala.compute(c, place)).forEach(function (f) {
        var k = (f.subject || '?') + '|' + (f.condition || '?');
        if (typeof F.yoga[k] !== 'number') missingYoga[k] = true;
        var mk = manifestationKey(f);
        if (typeof F.yogaManifestation[mk] !== 'number') missingManifestation[mk] = true;
      });
      var at = {};
      c.planets.forEach(function (p) { at[p.name] = p; });
      c.planets.forEach(function (p) {
        var holds = {
          R: p.retrograde,
          C: p.name !== 'Sun' && Astro.isCombust(p.name, p.longitude,
            at.Sun.longitude, p.retrograde),
          Y: Astro.isYogakaraka(p.name, c.ascendant.sign),
          V: Astro.isVargottama(p.longitude)
        };
        STATES.forEach(function (s) {
          if (holds[s] && typeof F.state[p.name + '/' + s] !== 'number') {
            missingState[p.name + '/' + s] = true;
          }
        });
      });
    }
  }
  ok('every yoga a chart can produce has a measured frequency',
    Object.keys(missingYoga).length === 0, Object.keys(missingYoga).join(', '));
  ok('every yoga route a chart can produce has a manifestation frequency',
    Object.keys(missingManifestation).length === 0,
    Object.keys(missingManifestation).join(', '));
  ok('every state a graha can be in has a measured frequency',
    Object.keys(missingState).length === 0, Object.keys(missingState).join(', '));

  /*
   * The figures have to be believable as probabilities, and the two ends have to
   * be right: a node is retrograde always, and nothing the detectors report is
   * so rare it never occurred in the sample - a zero would mean the sweep was
   * too small for that finding rather than that the finding is impossible.
   */
  var outOfRange = Object.keys(F.yoga).concat(Object.keys(F.state))
    .filter(function (k) {
      var v = F.yoga[k] === undefined ? F.state[k] : F.yoga[k];
      return !(v > 0 && v <= 100);
    });
  ok('every frequency is a real percentage that the sweep actually saw',
    outOfRange.length === 0, outOfRange.join(', '));
  ok('a node is retrograde in every chart',
    F.state['Rahu/R'] === 100 && F.state['Ketu/R'] === 100,
    F.state['Rahu/R'] + ' / ' + F.state['Ketu/R']);
  /*
   * The headline result, and the reason the feature exists: the commonest raja
   * yoga is a majority event. If this ever stops being true the detector has
   * changed, not the sky.
   */
  ok('raja yoga by angle-and-trine is reported as the common thing it is',
    F.yoga['Raja Yoga|angle-trine'] > 50, String(F.yoga['Raja Yoga|angle-trine']));
  ok('its routes are measured apart while the named yoga remains their union',
    F.yogaManifestation['Angle-trine raja yoga|exchange'] > 0 &&
    F.yogaManifestation['Angle-trine raja yoga|conjunction'] >
      F.yogaManifestation['Angle-trine raja yoga|exchange'] &&
    F.yogaManifestation['Angle-trine raja yoga|aspect'] > 0 &&
    F.yogaTitle['Angle-trine raja yoga'] >
      F.yogaManifestation['Angle-trine raja yoga|conjunction']);
  ok('reference frames neither split nor multiply a yoga probability',
    F.yogaTitleByDivision['1|Gaja Kesari yoga'] ===
      F.yogaTitle['Gaja Kesari yoga'] &&
    F.yogaManifestationByDivision['1|Gaja Kesari yoga|gaja'] ===
      F.yogaManifestation['Gaja Kesari yoga|gaja'] &&
    !F.yogaTitleByContext && !F.yogaManifestationByContext &&
    !F.yogaManifestationByCardContext);
})();

console.log('\nThe card prints the figure beside the finding');
(function () {
  var src = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  var F = global.FREQUENCIES;
/*
 * Both kinds still ask, but they ask for different places to put the answer.
 * A yoga prints its figure beside its name; a state has no line of its own
 * any more, so its figure goes on the title with its reason.
 */
ok('the card asks the table for both kinds of line',
    /chanceOf\('state', at \+ '\/' \+ item\.term\)/.test(src) &&
    /FREQUENCIES\.yogaManifestationByDivision\[cardKey\]/.test(src) &&
    /typeof manifestationChance === 'number'/.test(src) &&
    /'In ' \+\s*\n?\s*\(chance >= 10 \? Math\.round\(chance\) : chance\) \+ '% of charts\.'/
      .test(src));
  /*
   * A yoga asks by the name printed on it first and by the library key second.
   * Nabhasa's thirty-two figures share one passage and so one subject, and one
   * of them holds in every chart: keyed on the subject they would all have read
   * "every chart", where Chakra is one in thousands and Pasa two in five.
   */
  ok('and a highlighted yoga asks for its route and division, never its reference frame',
    /item\.division \+ '\|' \+ item\.term \+ '\|' \+ item\.route/.test(src) &&
    !/item\.primaryReference \+ '\|'/.test(src) &&
    !/item\.route \+ '\|' \+ item\.from/.test(src) &&
    typeof F.yogaManifestationByDivision === 'object');
  ok('and the two really do differ where a family shares a passage',
    F.yoga['Nabhasa Yoga|general'] > 95 &&
    F.yogaTitle['Rajju yoga'] < 2 && F.yogaTitle['Pasa yoga'] > 30,
    'family ' + F.yoga['Nabhasa Yoga|general'] + '%, Rajju ' +
      F.yogaTitle['Rajju yoga'] + '%, Pasa ' + F.yogaTitle['Pasa yoga'] + '%');
  /*
   * Eight of the thirty-two never appeared in the sample - Gada, Vihaga, Vajra,
   * Yava, Kamala, Chakra, Samudra and Gola all need the slow grahas to gather -
   * so they carry no figure at all, and the card drops the line rather than
   * printing a nought. Absence from a sample of this size is not a measurement
   * of nought, and saying so would be the one reading the number cannot bear.
   */
  ok('and a figure too rare for the sample carries no line rather than a nought',
    F.yogaTitle['Chakra yoga'] === undefined &&
    /if \(typeof pct !== 'number'\) return;/.test(src));

  /*
   * Run the renderer rather than trust the source: pull the formatter out of
   * app.js and check both ends of the scale read as English.
   */
  /* The formatter reads the table through chanceOf, so both come out together. */
  var body = src.match(/var chanceOf = function \(kind, key\) \{[\s\S]*?var rarity = function \(head, kind, key\) \{[\s\S]*?\n    \};/)[0];
  var said = [];
  var fake = { appendChild: function (n) { said.push(n); } };
  // The formatter consults the Budha-Aditya setting, so it needs a page to ask.
  var pageWith = function (floor) {
    return { getElementById: function (id) {
      return id === 'budha-floor' ? { value: floor } : null;
    } };
  };
  var run = function (floor, calls) {
    said = [];
    new Function('el', 'FREQUENCIES', 'document', 'head', body + '\n' + calls)(
      function (tag, cls, text) { return text; }, global.FREQUENCIES,
      pageWith(floor), fake);
    return said;
  };
  run('raman', ' rarity(head, "state", "Rahu/R");' +
    ' rarity(head, "yoga", "Adhi Yoga|general");' +
    ' rarity(head, "yoga", "Budha Aditya Yoga|general");' +
    ' rarity(head, "yoga", "no such yoga");');

  ok('a mark true of every chart says so in words rather than as 100%',
    said[0] === 'every chart', said[0]);
  ok('a rare yoga keeps the decimal that makes it rare',
    said[1] === global.FREQUENCIES.yoga['Adhi Yoga|general'] + '% of charts', said[1]);
  ok('a common one is rounded to a whole number',
    said[2] === Math.round(global.FREQUENCIES.yoga['Budha Aditya Yoga|general']) +
      '% of charts', said[2]);
  ok('an unmeasured key prints no line at all rather than a wrong one',
    said.length === 3, said.join(' | '));

  /*
   * And the figure moves with the setting that changes what forms. Under
   * Raman's floor Budha-Aditya is a quarter of charts; with the floor dropped
   * the same finding is half of them, and printing the first while the second
   * is in force would argue for the wrong reading.
   */
  var strict = run('raman', ' rarity(head, "yoga", "Budha Aditya Yoga|general");')[0];
  var open = run('none', ' rarity(head, "yoga", "Budha Aditya Yoga|general");')[0];
  ok('the figure follows the reading the chart is actually being read under',
    strict === '28% of charts' && open === '52% of charts',
    strict + ' vs ' + open);
  var unmoved = run('none', ' rarity(head, "yoga", "Adhi Yoga|general");')[0];
  ok('while a yoga the setting does not touch keeps its own figure',
    unmoved === global.FREQUENCIES.yoga['Adhi Yoga|general'] + '% of charts',
    unmoved);
})();



console.log('\nThe Budha-Aditya floor is a setting, defaulting to Raman');
(function () {
  var page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var src = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');

  ok('the page offers both readings and preselects the sourced one',
    /<select id="budha-floor"/.test(page) &&
    /<option value="raman" selected>/.test(page) &&
    /<option value="none">/.test(page));
  ok('and says who reads it each way',
    /Raman/.test(page) && /K\. N\. Rao/.test(page) &&
    /Advance Techniques of Astrology/.test(page));
  ok('the reason to choose one over the other is carried with the field',
    /<label for="budha-floor">[\s\S]{0,400}?<div class="field-why"/.test(page));

  /*
   * Stamped on the chart rather than passed to one caller. The yogas are
   * detected in three places and a floor honoured by one of them would have the
   * Yogas tab and the graha card disagreeing about the same chart.
   */
  ok('the setting is stamped on the chart, where every detector call sees it',
    /c\.budhaAdityaFloor = document\.getElementById\('budha-floor'\)\.value/.test(src));
  ok('changing it redraws rather than waiting for the next chart',
    /getElementById\('budha-floor'\)\.addEventListener\('change'/.test(src));

  /*
   * The figure beside the yoga has to follow the setting. Measured under
   * Raman's floor it says one in four; with the floor dropped the same finding
   * is one in two, and printing the first under the second argues for the
   * wrong reading.
   */
  ok('and the frequency beside the finding follows the setting too',
    /FREQUENCIES\.yogaNoFloor\[key\]/.test(src) &&
    /floor\.value === 'none'/.test(src));
})();

console.log('\nEvery member of a family defines itself');
/*
 * Sunapha, Anapha, Durudhura and Kemadruma are four answers to one question, so
 * the four passages were once one passage. When they were split, three got
 * headings of their own and Sunapha kept the family's: the card showed "Sunapha
 * yoga" over "The Moon's company, and the four answers to it", which names the
 * question rather than the answer and tells a reader nothing about the finding
 * in front of them. The heading is the one line the card has room for, so it
 * has to be about the member.
 */
(function () {
  var seeds = fs.readFileSync(path.join(root,
    'supabase/seed/astro_readings_yogas.sql'), 'utf8');
  var headingFor = function (subject) {
    var m = seeds.match(new RegExp("\\('yoga', '" + subject +
      "', '[^']+',\\s*\n '((?:[^']|'')+)'"));
    return m ? m[1].replace(/''/g, "'") : null;
  };
  var FOUR = ['Sunapha Yoga', 'Anapha Yoga', 'Durudhura Yoga', 'Kemadruma Yoga'];
  var bad = FOUR.filter(function (s) {
    var h = headingFor(s);
    return !h || h.indexOf(s.replace(' Yoga', '')) !== 0;
  });
  ok('each of the Moon\u2019s four answers is headed by its own name',
    bad.length === 0, bad.map(function (s) {
      return s + ': ' + headingFor(s);
    }).join(' | '));

  /*
   * And the heading has to say what the placement is, since that is the whole
   * of what the card can show before the reader has to go looking.
   */
  ok('and by what the placement actually is',
    /Sunapha - grahas in the sign after the Moon/.test(seeds) &&
    /Anapha - grahas in the sign before the Moon/.test(seeds) &&
    /Durudhura - grahas on both sides of the Moon/.test(seeds));

  /*
   * House style, and a standing preference: hyphens, commas and colons carry
   * these sentences. The rest of the library has never used an em-dash.
   */
  var dashed = fs.readdirSync(path.join(root, 'supabase/seed'))
    .filter(function (n) { return /\.sql$/.test(n); })
    .filter(function (n) {
      return fs.readFileSync(path.join(root, 'supabase/seed', n), 'utf8')
        .indexOf('\u2014') > -1;
    });
  ok('no passage in the library uses an em-dash', dashed.length === 0,
    dashed.join(', '));
})();

console.log('\nThe graha card survives the chart being redrawn');
console.log('\nNothing marked hidden is drawn anyway');
/*
 * The browser hides [hidden] with display: none, and that rule comes from the
 * UA stylesheet, so any class rule in this file that sets a display of its own
 * beats it. Two elements were caught by it at once: the manual coordinates sat
 * open under the form, and an empty saved list still showed a count of zero.
 *
 * Swept rather than spot-checked. The fault is invisible in the source - the
 * markup says hidden and means it - and it arrives whenever somebody gives a
 * class a display, which is most of them.
 */
(function () {
  var display = {};
  cssSrc.replace(/([^{}]+)\{([^{}]*)\}/g, function (all, sel, body) {
    var d = /(?:^|;|\s)display\s*:\s*([a-z-]+)/.exec(body);
    if (!d) return all;
    sel.split(',').forEach(function (one) {
      one = one.trim();
      if (/^\.[A-Za-z0-9_-]+$/.test(one)) {
        (display[one.slice(1)] || (display[one.slice(1)] = [])).push(d[1]);
      }
    });
    return all;
  });
  var drawn = [];
  html.replace(/<\w+([^>]*\bhidden\b[^>]*)>/g, function (all, attrs) {
    var cls = /class="([^"]+)"/.exec(attrs);
    var id = /id="([^"]+)"/.exec(attrs);
    if (!cls) return all;
    cls[1].split(/\s+/).forEach(function (c) {
      var set = display[c] || [];
      var shown = set.length > 0 && set.indexOf('none') < 0;
      // Unless the class says outright what to do when it is hidden.
      var answered = new RegExp('\\.' + c + '\\[hidden\\][^{]*\\{[^}]*display: none').test(cssSrc);
      if (shown && !answered) drawn.push((id ? '#' + id[1] : '?') + ' by .' + c);
    });
    return all;
  });
  ok('every element marked hidden is actually hidden', drawn.length === 0, drawn.join(', '));
  ok('and the two that were not are answered by name',
    /\.field\[hidden\], \.tab-count\[hidden\] \{ display: none; \}/.test(cssSrc));
  /*
   * Narrowly, not with !important on [hidden]: printing deliberately opens
   * every panel at once, and an !important here would take that away.
   */
  ok('and printing can still open what the page keeps shut',
    !/\[hidden\] \{ display: none !important/.test(cssSrc) &&
    /#panel-chart\[hidden\] \{ display: block; \}/.test(cssSrc));
})();

console.log('\nThe typed date is checked the way a picker would have been');
/*
 * A date picker refuses 31 February by construction. Three typed boxes will
 * take it, and an impossible date that casts anyway is worse than one that is
 * refused: the chart looks ordinary and is for a day that never happened.
 *
 * The century rule is the case worth driving rather than reading. 1900 is not
 * a leap year and 2000 is, and a month-length table that does not know the
 * difference is wrong one year in four and then wrong again the other way.
 */
(function () {
  var out = global.appExports || {};
  if (!out.readDate) { ok('the date field is reachable from the tests', false); return; }
  var boxes = out.dateBoxes();
  var read = function (d, m, y) {
    boxes[0].value = d; boxes[1].value = m; boxes[2].value = y;
    return out.readDate();
  };
  ok('a real date reads back as the day it was typed',
    read('04', '03', '1948').iso === '1948-03-04' &&
    read('4', '3', '1948').iso === '1948-03-04',
    read('4', '3', '1948').iso);
  ok('29 February is allowed in a leap year and refused otherwise',
    read('29', '02', '2000').iso === '2000-02-29' &&
    /from 1 to 28/.test(read('29', '02', '1900').error || '') &&
    /from 1 to 29/.test(read('31', '02', '1948').error || ''));
  ok('and each box is faulted by name rather than all together',
    /Enter a date of birth/.test(read('', '', '').error || '') &&
    /month must be from 1 to 12/.test(read('04', '13', '1948').error || '') &&
    /year in full, all four digits/.test(read('04', '03', '48').error || '') &&
    /from 1800 to 2100/.test(read('04', '03', '1799').error || ''));
  out.writeDate('1938-09-01');
  ok('and what is written into the boxes reads back unchanged',
    boxes[0].value === '01' && boxes[1].value === '09' && boxes[2].value === '1938' &&
    out.readDate().iso === '1938-09-01');
  out.writeDate('');
  ok('and a blank date empties all three', boxes.every(function (b) { return b.value === ''; }));
})();

var fnSrc = fs.readFileSync(path.join(root, 'supabase/functions/kundalis/index.ts'), 'utf8');
ok('a failed post-mutation refresh is an error, never an authoritative empty list',
   (fnSrc.match(/if \(!listed\.ok\) return json\(\{ error: await listed\.text\(\) \}, 502\);/g) || []).length === 4 &&
   !/listed\.ok \? await listed\.json\(\) : \[\]/.test(fnSrc));
console.log('\nYour own kundalis and the public figures sit apart');
/*
 * Twenty-six charts kept for study against three of your own, all in one list:
 * the few that matter most to the person who saved them were the hardest to
 * find. Two tabs split them on the one fact that already distinguishes them.
 *
 * Yours open first. They are the reason the list exists; the study charts are
 * material to check a technique against, and they are the crowd.
 */
(function () {
  var page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var panel = page.slice(page.indexOf('id="panel-saved"'),
                         page.indexOf('</section>', page.indexOf('id="panel-saved"')));
  ok('the saved panel carries two tabs, yours selected',
    /<div class="tabs subtabs" role="tablist" aria-label="Saved kundalis">/.test(panel) &&
    /id="tab-mine"[^>]*aria-selected="true"/.test(panel.replace(/\s+/g, ' ')) &&
    /id="tab-figures"[^>]*aria-selected="false"/.test(panel.replace(/\s+/g, ' ')) &&
    /id="panel-figures"[^>]*hidden/.test(panel.replace(/\s+/g, ' ')) &&
    !/id="panel-mine"[^>]*hidden/.test(panel.replace(/\s+/g, ' ')));
  ok('and they are driven by the same tab code as every other strip',
    /setupTabs\(\['mine', 'figures'\]/.test(appSrc) &&
    /document\.querySelector\('#panel-saved \.subtabs'\)/.test(appSrc));

  var out = global.appExports || {};
  if (!out.renderSaved || !out.figuresList) {
    ok('the two lists are reachable from the tests', false);
    return;
  }
  var row = function (name, celebrity) {
    return { name: name, placeLabel: 'Delhi, India', date: '1970-01-01', time: '06:00:00',
      latitude: 28.6, longitude: 77.2, zone: 'Asia/Kolkata', standard: 'zone',
      ayanamsa: 'lahiri', trueNode: true, gender: 'male', celebrity: celebrity,
      flagged: false, note: '', openedAt: null };
  };
  var drawn = function (ul) {
    return ul.children.map(function (card) {
      return card.children.filter(function (c) { return c.className === 'saved-open'; })[0]
        .children[0].textContent;
    }).join(' ') || '(none)';
  };
  // Six, so the search box is past the threshold that hides it.
  out.writeSaved([row('Priyanka', false), row('Barack Obama', true),
    row('Sumit', false), row('Donald Trump', true),
    row('Anita', false), row('Tony Blair', true)]);
  out.renderSaved();
  ok('a card goes to one list or the other, never both',
    drawn(out.savedList) === 'Priyanka Sumit Anita' &&
    drawn(out.figuresList) === 'Barack Obama Donald Trump Tony Blair',
    drawn(out.savedList) + ' | ' + drawn(out.figuresList));
  ok('and each tab counts what is under it, the outer one the lot',
    String(out.byId('mine-count').textContent) === '3' &&
    String(out.byId('figures-count').textContent) === '3' &&
    String(out.byId('saved-count').textContent) === '6');

  /*
   * The case the split creates: a reader searches, the tab they are on empties,
   * and what they asked for is sitting one tab away with nothing on screen to
   * say so. The count on the other tab says how many, and so does the line
   * where the list would have been.
   */
  var field = out.byId('saved-filter');
  field.value = 'obama';
  out.renderSaved();
  ok('a search that empties one tab says where the matches went',
    drawn(out.savedList) === '(none)' &&
    drawn(out.figuresList) === 'Barack Obama' &&
    /Nothing here matches “obama”\. 1 match is under Public figures\./
      .test(out.byId('mine-none').textContent),
    out.byId('mine-none').textContent);
  field.value = 'zzz';
  out.renderSaved();
  ok('and says nothing about the other tab when there is nothing there either',
    /^Nothing here matches “zzz”\.$/.test(out.byId('mine-none').textContent) &&
    /^Nothing here matches “zzz”\.$/.test(out.byId('figures-none').textContent));
  field.value = '';
  out.writeSaved([]);
  out.renderSaved();
})();

console.log('\nThe saved list puts the last chart read at the top');
/*
 * The order a reader wants is the one they were working in. updated_at answers
 * a different question - when the record was last written - and reopening a
 * chart deliberately does not save it, so it could not carry this.
 *
 * Rows never opened fall in behind, keeping the order the database gave them.
 * That is the honest answer for them: nothing is known about when they were
 * last read, and guessing would put a chart nobody has looked at above one
 * somebody read last week.
 */
(function () {
  var out = global.appExports || {};
  if (!out.renderSaved) { ok('the saved list is reachable from the tests', false); return; }
  var row = function (name, openedAt) {
    return { name: name, placeLabel: 'Delhi, India', date: '1970-01-01', time: '06:00:00',
      latitude: 28.6, longitude: 77.2, zone: 'Asia/Kolkata', standard: 'zone',
      ayanamsa: 'lahiri', trueNode: true, gender: 'male', celebrity: false,
      flagged: false, note: '', openedAt: openedAt };
  };
  var drawn = function () {
    return out.savedList.children.map(function (card) {
      return card.children.filter(function (c) { return c.className === 'saved-open'; })[0]
        .children[0].textContent;
    }).join(' ');
  };
  out.writeSaved([row('Sept', '2026-09-01T00:00:00Z'), row('Never', null),
    row('Latest', '2026-09-29T00:00:00Z'), row('AlsoNever', null),
    row('Middle', '2026-09-15T00:00:00Z')]);
  out.renderSaved();
  ok('the last read comes first and the unread keep their order',
    drawn() === 'Latest Middle Sept Never AlsoNever', drawn());

  /* And the sort is on a copy: the stored order is not rewritten by drawing. */
  ok('drawing the list does not reorder what is stored',
    out.readSaved().map(function (e) { return e.name; }).join(' ') ===
      'Sept Never Latest AlsoNever Middle');
  out.writeSaved([]);
  out.renderSaved();
})();

console.log('\nA chart whose details are in doubt can be flagged');
/*
 * The flag is about the record and not the reading: a birth time taken from
 * memory, a place that is one of two of that name, a date off a document nobody
 * has checked. Nothing it says changes a calculation, which is the point - the
 * chart still draws, and the flag is the note that it may be drawn from the
 * wrong moment.
 *
 * Driven rather than read, because the thing worth checking is that raising it
 * on a card writes to the row and not to the copy the card was drawn from.
 */
(function () {
  var out = global.appExports || {};
  if (!out.renderSaved || !out.setFlag) {
    ok('the saved list is reachable from the tests', false);
    return;
  }
  var rows = [
    { name: 'Uncertain', placeLabel: 'Varanasi, India', date: '1948-03-04',
      time: '10:15:00', latitude: 25.3, longitude: 83, zone: 'Asia/Kolkata',
      standard: 'zone', ayanamsa: 'lahiri', trueNode: true, gender: 'unstated',
      celebrity: false, flagged: false, note: '' },
    { name: 'Certain', placeLabel: 'Delhi, India', date: '1970-01-01',
      time: '06:00:00', latitude: 28.6, longitude: 77.2, zone: 'Asia/Kolkata',
      standard: 'zone', ayanamsa: 'lahiri', trueNode: true, gender: 'unstated',
      celebrity: true, flagged: false, note: '' }
  ];
  out.writeSaved(rows);
  out.renderSaved();

  var cards = out.savedList.children;
  // Split across the two tabs now: Certain is a public figure, Uncertain is not.
  var figures = (out.figuresList || { children: [] }).children;
  cards = cards.concat(figures);
  ok('every card carries three icons: flag, edit, delete', cards.length === 2 &&
    cards.every(function (card) {
      var actions = card.children.filter(function (c) { return c.tag === 'div'; })[0];
      return actions && actions.children.length === 3;
    }), cards.length + ' cards');

  /*
   * Raised from the card, it is the stored row that changes. Writing only to
   * the object the card closed over would show a raised flag until the next
   * redraw and lose it after, which is the worst of both.
   */
  out.setFlag(rows[0], true);
  var stored = out.readSaved();
  ok('a flag the database cannot confirm rolls back in the stored row',
    stored[0].flagged === false && stored[1].flagged === false &&
    /could not be confirmed/.test(out.savedNote.textContent));

  /*
   * And it draws as a state rather than as a third identical outline. The icon
   * fills; nothing else on the card does.
   */
  var flagOf = function (card) {
    return card.children.filter(function (c) { return c.tag === 'div'; })[0].children[0];
  };
  out.renderSaved();
  // One to a tab: Uncertain is your own, Certain is a public figure.
  var mine = out.savedList.children[0], figure = out.figuresList.children[0];
  ok('and the rolled-back flag is drawn lowered again',
    !/is-flagged/.test(flagOf(mine).className) &&
    !/is-flagged/.test(flagOf(figure).className) &&
    flagOf(mine).attrs['aria-pressed'] === 'false');

  ok('and it is again a button a reader can find by name',
    /Flag Uncertain as needs checking/.test(flagOf(mine).attrs['aria-label']) &&
    /Flag Certain as needs checking/.test(flagOf(figure).attrs['aria-label']));

  // Lowered again, it leaves nothing behind.
  out.setFlag(rows[0], false);
  ok('and lowering it clears the row', out.readSaved()[0].flagged === false);
  out.writeSaved([]);
  out.renderSaved();
})();

/*
 * The same flag on the chart, where the doubt usually arrives. It says the
 * words there rather than drawing the icon twice: there is room for them, and
 * no second chart to tell it apart from.
 */
ok('the chart heading answers the flag too',
   /var FLAG_MARK = 'needs checking';/.test(appSrc) &&
   /el\('button', 'flag-mark', FLAG_MARK\)/.test(appSrc) &&
   /id="flag-button"/.test(html) &&
   /showFlagOnChart\(\);/.test(appSrc));
/*
 * And the words are the way to take it back. Anyone wanting the flag gone
 * reaches for the thing they can see saying it is there, not for an icon in
 * the line below it, so the mark clears the flag itself. Both it and the icon
 * go through one function, so there is one way the state can change.
 */
ok('the mark on the heading clears the flag it reports',
   /mark\.addEventListener\('click', function \(\) \{ flagThisChart\(false\); \}\)/.test(appSrc) &&
   /mark\.setAttribute\('aria-label', 'Clear the flag on this chart'\)/.test(appSrc) &&
   /if \(lastChart\) flagThisChart\(!lastChart\.flagged\);/.test(appSrc) &&
   (appSrc.match(/function flagThisChart\(on\)/g) || []).length === 1);
ok('and it reads as something to press, not as a label',
   /\.flag-mark \{[^}]*cursor: pointer;/.test(cssSrc.replace(/\n/g, '')) &&
   /\.flag-mark:hover, \.flag-mark:focus-visible \{/.test(cssSrc) &&
   /mark\.type = 'button';/.test(appSrc));
ok('and the button on the chart says which way it is set',
   /button\.setAttribute\('aria-pressed', on \? 'true' : 'false'\)/.test(appSrc) &&
   /aria-pressed="false"/.test(html));
/*
 * Both drawings are one control, so both fill the same path when raised. The
 * banner is the second path in either, which is why the CSS reaches it by
 * position rather than by a class the inline copy would have to repeat.
 */
ok('the card icon and the chart icon are the same drawing',
   /flag: \['M6 21V3\.5', 'M6 4\.5h11l-2\.5 4 2\.5 4H6z'\]/.test(appSrc) &&
   /<path d="M6 21V3\.5"\/>/.test(html) &&
   /\.saved-flag\.is-flagged svg path \+ path \{ fill: currentColor; \}/.test(cssSrc) &&
   /\.icon-button\.is-flagged svg path \+ path \{ fill: currentColor; \}/.test(cssSrc));
/*
 * And it survives being cast again. The form has no flag on it, so a state
 * built from the form says nothing about one; taking the form's word for it
 * would drop the flag the moment anybody regenerated the chart.
 */
ok('casting the same chart again does not drop the flag',
   /if \(at >= 0\) entry\.flagged = list\[at\]\.flagged === true;/.test(appSrc) &&
   /var flagged = pendingFlagged;/.test(appSrc) &&
   /pendingFlagged = entry\.flagged === true;/.test(appSrc));
// It reaches the database as a column of its own, not as a word inside the note.
/*
 * Reading is not editing, so it touches opened_at alone. A save would have
 * bumped updated_at too and lost the difference between the two.
 */
/*
 * Generating a chart is reading it. Saved with no opened_at, the chart just
 * made sorted last among the ones nobody had ever opened - which is the
 * opposite of where the person who just made it is looking.
 *
 * The browser asks for the stamp and the server supplies the time. A clock
 * that is wrong, or lying, would otherwise decide the order of somebody's
 * list.
 */
ok('saving a chart counts as reading it',
   /callKundaliApi\(\{ action: 'save', entry: entry, id: entry\.id, touch: true \}/.test(appSrc) &&
   /openedAt: new Date\(\)\.toISOString\(\),/.test(appSrc) &&
   /function clean\(entry: Record<string, unknown>, token: string, touch = false\)/.test(fnSrc) &&
   /\.\.\.\(touch \? \{ opened_at: new Date\(\)\.toISOString\(\) \} : \{\}\),/.test(fnSrc) &&
   /clean\(body\.entry, token, body\.touch === true\)/.test(fnSrc));
/*
 * Flagging is not. It also goes through save, but it is an annotation made
 * while looking down the list, and a card that jumped to the top the moment it
 * was flagged would move out from under the pointer that flagged it.
 */
ok('but flagging one does not',
   /callKundaliApi\(\{ action: 'save', entry: list\[at\], id: list\[at\]\.id \}/.test(appSrc) &&
   (appSrc.match(/touch: true/g) || []).length === 1);

ok('opening a chart is recorded without saving it',
   /function recordOpening\(entry\)/.test(appSrc) &&
   /callKundaliApi\(\{ action: 'open', id: entry\.id \}/.test(appSrc) &&
   /openedAt: row\.opened_at \|\| null,/.test(appSrc) &&
   /if \(body\.action === 'open'\)/.test(fnSrc) &&
   /JSON\.stringify\(\{ opened_at: new Date\(\)\.toISOString\(\) \}\)/.test(fnSrc) &&
   /'&order=opened_at\.desc\.nullslast,updated_at\.desc&limit=200'/.test(fnSrc));

ok('the flag is stored and synced beside the rest of the record',
   /flagged: row\.flagged === true,/.test(appSrc) &&
   /flagged: state\.flagged === true,/.test(appSrc) &&
   /flagged: entry\.flagged === true,/.test(fnSrc) &&
   /ayanamsa,true_node,gender,celebrity,flagged,note/.test(fnSrc));

/*
 * It did not. The renderer empties its container on every draw and the card
 * lives in that container, so each redraw threw the card away - while the
 * guard that stops the listeners being attached twice also stopped the card
 * being rebuilt. The result was a card that worked once and then went quietly
 * dead: rotating onto the Moon, changing division, or changing any setting
 * left the hover doing nothing, with no error to say why.
 *
 * Drawn twice here, because drawing once was always fine and is what the old
 * tests did.
 */
(function () {
  var out = global.appExports || {};
  if (!out.wireGrahaCard) { ok('the card wiring is reachable from the tests', false); return; }
  var chart = Astro.chart({ jdUT: Astro.julianDay(1964, 10, 7, 21.5 - 5.5),
    latitude: 28.6139, longitude: 77.209, tzOffsetMinutes: 330 });
  var box = makeNode('div');
  var draw = function (reference) {
    Charts.render(box, { style: 'north', planets: chart.planets,
      ascendant: chart.ascendant.longitude, division: 1, reference: reference,
      yogas: {} });
    out.wireGrahaCard(box);
  };
  var cardIn = function () {
    return box.children.filter(function (c) { return c.className === 'graha-card'; });
  };

  draw('Ascendant');
  ok('the card is there on the first draw', cardIn().length === 1,
    cardIn().length + ' found');

  draw('Moon');                                    // the rotation that broke it
  ok('and still there after the chart is rotated onto the Moon',
    cardIn().length === 1, cardIn().length + ' found');
  draw('Moon');
  draw('Ascendant');
  ok('and after several more draws, without piling up copies',
    cardIn().length === 1, cardIn().length + ' found');

  /*
   * Present in the document is not the same as working: the listeners were
   * attached to the container on the first draw and must still reach the card
   * that is in the page now, rather than the one the first draw created.
   */
  var found = null;
  (function walk(n) {
    if (found || !n.children) return;
    n.children.forEach(function (c) {
      if (!found && c.attrs && c.attrs['data-graha'] &&
          c.attrs['data-graha'] !== 'Ascendant') found = c;
      walk(c);
    });
  })(box);
  ok('a rotated chart still labels its grahas for the hover to find',
    !!found, found ? found.attrs['data-graha'] : 'none');

  if (found) {
    var card = cardIn()[0];
    card.children = [];
    box.fire('mouseover', { target: found });
    ok('and hovering one fills the card that is actually on the page',
      card.children.length > 0 && card.hidden === false,
      card.children.length + ' lines, hidden=' + card.hidden);
    box.fire('mouseout', {});
    ok('leaving hides it again', card.hidden === true);
  }

  /*
   * The lagna is drawn as an occupant too and carries the same attributes, so
   * it is hoverable. It has no states and no yogas - it is a point, not a
   * graha - and the card must still say where it is rather than opening blank.
   */
  var asc = null;
  (function walk(n) {
    if (asc || !n.children) return;
    n.children.forEach(function (c) {
      if (!asc && c.attrs && c.attrs['data-graha'] === 'Ascendant') asc = c;
      walk(c);
    });
  })(box);
  if (asc) {
    var card2 = cardIn()[0];
    card2.children = [];
    box.fire('mouseover', { target: asc });
    ok('hovering the lagna opens a card that says where it is, not an empty one',
      card2.children.length >= 2 && !!asc.attrs['data-where'],
      card2.children.length + ' lines, where="' + asc.attrs['data-where'] + '"');
  }
})();

console.log('\nMahabhagya needs two things the sky does not supply');
(function () {
  var page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var src = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');

  /*
   * The setting is gone. It offered a reading with no source behind it: the
   * note said Raman drops the day test for men, and he does not. His
   * definition at combination 25 of Three Hundred Important Combinations reads
   * "In the case of a man, when the birth is during daytime", which is
   * Mantreswara's rule exactly. What was taken for the definition is the
   * summary at the back of the book, which compresses the rule and leaves the
   * condition out; the worked chart that seemed to confirm it, a man born at
   * 8-35 p.m. read as having the yoga, contradicts the page it sits on.
   */
  ok('the day test is not offered as a choice, there being nothing to choose',
    !/mahabhagya-day/.test(page) && !/mahabhagyaDay/.test(src));
  ok('and the lessons no longer send a reader to a setting that is gone',
    !/mahabhagya/i.test(page.slice(page.indexOf('id="panel-settings"'),
      page.indexOf('</section>', page.indexOf('id="panel-testing"')))));

  /*
   * The sex comes off the form and the day comes off the real sunrise for the
   * place. Neither is guessed: a chart that records no sex leaves it undefined
   * so the finding can say so, rather than being handed a default that would
   * read as a fact about the native.
   */
  ok('the native’s sex reaches the chart, and absence stays absent',
    /c\.gender = state\.gender && state\.gender !== 'unstated' \? state\.gender : undefined/
      .test(src));
  ok('and day or night is taken from the real sunrise, not from the clock',
    /Astro\.sunriseSunset\(c\.julianDay, place\.lat, place\.lon, false\)/.test(src) &&
    /Astro\.sunriseSunset\(c\.julianDay, place\.lat, place\.lon, true\)/.test(src));

  /*
   * A division moves the grahas; it does not move the native's sex, the hour
   * they were born, or which authority the reader chose. Those were being
   * dropped, so a setting picked on the Chart tab reverted the moment a varga
   * was read and the same chart answered differently in D1 and D9.
   */
  var chart = Astro.chart({ jdUT: Astro.julianDay(1964, 10, 7, 16),
    latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 });
  chart.gender = 'male';
  chart.dayBirth = false;
  chart.budhaAdityaFloor = 'none';
  chart.mercuryNature = 'benefic';
  var d9 = Astro.chartInDivision(chart, 9);
  ok('the nativity and the chosen readings survive into a division',
    d9.gender === 'male' && d9.dayBirth === false &&
    d9.budhaAdityaFloor === 'none' && d9.mercuryNature === 'benefic',
    [d9.gender, d9.dayBirth, d9.budhaAdityaFloor, d9.mercuryNature].join(' / '));
  ok('and the division is still a division, not a copy of the rashi',
    d9.division === 9 && d9.planets.length === chart.planets.length &&
    d9.planets.some(function (p, i) { return p.sign !== chart.planets[i].sign; }));

  /*
   * The frequency table has to be measured on charts that have a sex and an
   * hour, or Mahabhagya's figure is the undetermined case - both halves at
   * once - which no real chart can show.
   */
  var F = global.FREQUENCIES;
  ok('Mahabhagya’s measured figure is one a real chart could have',
    F.yoga['Mahabhagya Yoga|general'] < 10,
    F.yoga['Mahabhagya Yoga|general'] + '%');
})();


console.log('\nThe card says how the graha stands in its sign');
/*
 * Dignity alone answers only the minority of placements - exalted, debilitated,
 * own sign, moolatrikona - and says nothing for the rest. The relation with the
 * lord of the sign answers those, and is most of what dignity means when there
 * is no formal dignity to report. The card carries both.
 */
(function () {
  var src = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  var chartsSrc = fs.readFileSync(path.join(root, 'js/charts.js'), 'utf8');
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  // The wired copy of app.js, built where the harness is put together above.
  var out = global.appExports || {};

  ok('the map is built and handed to the renderer with the yogas',
    /function dignitiesByGraha\(state, division, tatkalika, horaRule, horaMercury\)/.test(src) &&
    /dignities: dignitiesByGraha\(state, set\.division, tatkalikaSetting\(\), horaSetting\(\),\s*\n?\s*horaMercurySetting\(\)\)/.test(src));
  ok('and the renderer carries it onto the graha',
    /ctx\.division, ctx\.dignities, ctx\.hemming, ctx\.ruling, ctx\.karakas\)/.test(chartsSrc) &&
    /t\.setAttribute\('data-dignity', d\.dignity\)/.test(chartsSrc));
  /*
   * What a graha rules and what looks at it, both on the card. Lordship is a
   * row in the graha table and aspects are a tab of their own, and neither is
   * where the eye is when it is on a graha in a kundli.
   *
   * Both are counted from house 1 of the chart on screen, so both move with the
   * division and with the rotation, which is why they are worked out in app.js
   * beside the dignities rather than in the renderer.
   */
  ok('what a graha rules and what aspects it are built beside the dignities',
    /function rulingAndAspects\(state, division, reference\)/.test(src) &&
    /ruling: rulingAndAspects\(state, set\.division, set\.reference\)/.test(src));
  ok('and the renderer carries both onto the graha',
    /t\.setAttribute\('data-rules', d\.rules\)/.test(chartsSrc) &&
    /t\.setAttribute\('data-seen-by', d\.seenBy\)/.test(chartsSrc));
  /*
   * The card in three lines, coarse to fine: which graha and where exactly,
   * then the three frames it sits in at once, then the grahas that have a say
   * over it and what it has a say over.
   *
   * Driven, because the point is what a reader ends up looking at. One fact
   * per line ran the card to eight before the yogas began, and a placement
   * that is one thought was spread down the height of it.
   */
  (function () {
    var chart = Astro.chart({ jdUT: Astro.julianDay(1980, 9, 21, 8 + 39 / 60 - 5.5),
      latitude: 19.0728, longitude: 72.8826, tzOffsetMinutes: 330 });
    var dignityBody = appSrc.match(/function dignitiesByGraha\(state, division, tatkalika, horaRule, horaMercury\) \{[\s\S]*?\n  \}/)[0];
    var dig = new Function('Astro', dignityBody + '\nreturn dignitiesByGraha;')(Astro)(
      { chart: chart }, 1, 'rashi', 'lord');
    var box = makeNode('div');
    Charts.render(box, { style: 'north', planets: chart.planets,
      ascendant: chart.ascendant.longitude, division: 1, reference: 'Ascendant',
      yogas: {}, dignities: dig, ruling: {}, karakas: Astro.charaKarakas(chart) });
    var marks = [];
    (function walk(n) {
      if (n.tag === 'text' && n.attrs['data-graha']) marks.push(n);
      n.children.forEach(walk);
    })(box);
    var by = {};
    marks.forEach(function (t) { by[t.attrs['data-graha']] = t.attrs; });

    ok('the degree rides with the name, to the second',
      /^\d{1,2}°\d{2}′\d{2}″$/.test(by.Moon['data-degree'] || ''), by.Moon['data-degree']);
    /*
     * And the chara karaka beside it, which is the word the degree decides:
     * the karakas are assigned by how far into its sign each graha has
     * travelled. Ketu is outside the scheme and the ascendant is not a graha,
     * so neither carries one.
     */
    ok('the card reads the four frames in order, each naming its own lord',
      by.Venus['data-house'] === 'House 10' &&
      by.Venus['data-sign'] === 'Cancer' &&
      /^Ashlesha [1-4]$/.test(by.Venus['data-nakshatra'] || '') &&
      by.Venus['data-dispositor'] === 'Moon' &&
      by.Venus['data-nak-lord'] === 'Mercury' &&
      by.Venus['data-sub-lord'] === 'Venus',
      [by.Venus['data-house'], by.Venus['data-sign'], by.Venus['data-nakshatra']].join(' / '));
    ok('and the nakshatra lord is read as a relation, as the dispositor is',
      by.Venus['data-nak-lord-relation'] === 'great friend' &&
      by.Venus['data-dispositor-relation'] === 'great enemy',
      by.Venus['data-nak-lord-relation'] + ' / ' + by.Venus['data-dispositor-relation']);
    ok('the sub lord is read as a relationship from the graha too',
      by.Venus['data-sub-lord-relation'] === undefined &&
      Object.keys(by).some(function (g) { return by[g]['data-sub-lord-relation']; }),
      Object.keys(by).map(function (g) {
        return by[g]['data-sub-lord-relation']
          ? g + ':' + by[g]['data-sub-lord-relation'] : '';
      }).filter(Boolean).join(', '));
    /*
     * Ketu keeps no friendships, so its nakshatra lord is named without one,
     * the way its dispositor is.
     */
    ok('a node names its lords without inventing a friendship for them',
      !!by.Ketu['data-nak-lord'] && by.Ketu['data-nak-lord-relation'] === undefined);

    ok('the chara karaka is carried as the graha’s role',
      by.Jupiter['data-karaka'] === 'Atmakaraka' &&
      by.Ketu['data-karaka'] === undefined &&
      by.Ascendant['data-karaka'] === undefined,
      by.Jupiter['data-karaka']);
    ok('and it is read in the rashi, so it does not move with the division',
      /karakas: Astro\.charaKarakas\(state\.chart\)/.test(src));
    ok('house, sign and nakshatra are all carried',
      by.Moon['data-house'] === 'House 4' &&
      by.Moon['data-sign'] === 'Capricorn' &&
      /^Shravana [1-4]$/.test(by.Moon['data-nakshatra'] || ''),
      [by.Moon['data-house'], by.Moon['data-sign'], by.Moon['data-nakshatra']].join(' / '));
    ok('and the nakshatra is read from the rashi, which is the only place it exists',
      by.Moon['data-nak-lord'] === 'Moon' && !!by.Moon['data-sub-lord']);
    ok('the dispositor is named with how the graha regards it',
      by.Moon['data-dispositor'] === 'Saturn' &&
      by.Moon['data-dispositor-relation'] === 'enemy',
      by.Moon['data-dispositor'] + ' (' + by.Moon['data-dispositor-relation'] + ')');

    /*
     * The nodes and the ascendant have a dispositor like anything else - it is
     * the lord of the sign they occupy - and no friendship with it, being
     * outside the scheme the relation is read from. They used to get no line
     * at all, and the lagnesha is not a thing to leave a reader to work out.
     */
    ok('the nodes and the ascendant get one too, without a friendship',
      by.Rahu['data-dispositor'] === 'Moon' && !by.Rahu['data-dispositor-relation'] &&
      by.Ascendant['data-dispositor'] === 'Venus' &&
      !by.Ascendant['data-dispositor-relation'],
      by.Rahu['data-dispositor'] + ' / ' + by.Ascendant['data-dispositor']);
    ok('and the ascendant is not given a house, being the one houses start from',
      by.Ascendant['data-house'] === undefined);
    ok('a formal dignity is carried apart from the dispositor',
      by.Mercury['data-dignity'] === 'Own sign' &&
      by.Moon['data-dignity'] === undefined, by.Mercury['data-dignity']);
    ok('directional strength is carried only where the graha attains it',
      Object.keys(by).every(function (g) {
        var house = by[g]['data-house'];
        var n = house ? Number(house.replace('House ', '')) : 0;
        return (by[g]['data-directional'] === 'true') === Astro.hasDigBala(g, n);
      }));
  })();

  /*
   * On a line of their own, below the three lords. Those are grahas a reading
   * passes through to reach this one; these two are what this one reaches.
   */
  /*
   * Identity, then what is remarkable, then the zodiacal position whole, then
   * the chart position with the lords of ownership, then the finer lords, then
   * what looks at it.
   */
  ok('and the card follows identity, position, seat, lords, aspects, conditions',
    /fact\(seat, 'Rules', t\.getAttribute\('data-rules'\)\)/.test(src) &&
    /fact\(over, 'Aspected by', t\.getAttribute\('data-seen-by'\)\)/.test(src) &&
    /\.graha-card-fact-label \{/.test(css) &&
    src.indexOf("fact(trail, '', t.getAttribute('data-nakshatra'))") <
      src.indexOf("fact(seat, 'Dispositor'") &&
    src.indexOf("fact(seat, 'Dispositor'") < src.indexOf("fact(seat, 'Rules'") &&
    src.indexOf("fact(seat, 'Rules'") < src.indexOf("fact(inNak, 'Nakshatra lord'") &&
    src.indexOf("fact(inNak, 'Sub lord'") < src.indexOf("fact(over, 'Aspected by'") &&
    src.indexOf("fact(over, 'Aspected by'") < src.indexOf("'graha-card-conditions'"));
  /*
   * Retrograde, combust and yogakaraka are not on the conditions line. The
   * list below gives each with how rare it is, which is more than the line can
   * say, and saying it twice cost the card a line for nothing.
   */
/*
 * The states are on that line and nowhere else, so nothing on the card is
 * said twice. It is ruled off above and below by the same line the findings
 * draw between themselves: the placement is one thing, how the graha stands
 * another, the combinations a third.
 */
/*
 * Each state carries the mark the chart draws for it, so the letter beside a
 * graha in the kundli and the line on its card read as the same fact. Only
 * the states have one: directional strength and a dignity are not marked on
 * the chart, so neither takes a bracket.
 */
  ok('each state names itself and shows the mark the chart uses',
    /STATE_NAMES\[item\.term\] \+ ' \[' \+ item\.term \+ '\]'/.test(src));
  /*
   * And the two the chart does not draw are cut to match, so the line reads
   * as one set rather than as marked and unmarked halves. None of E, D, M or
   * Dr collides with a mark the chart uses, which are R, C, V, Y, P and S.
   */
  ok('and the conditions with no chart mark are given one of their own',
    /var DIGNITY_MARKS = \{ Exalted: 'E', Debilitated: 'D', Mooltrikona: 'M' \};/.test(src) &&
    /dignity \+ ' \[' \+ DIGNITY_MARKS\[dignity\] \+ '\]'/.test(src) &&
    /'Directional strength \[Dr\]'/.test(src) &&
    (function () {
      var chart = Object.keys({ R: 1, C: 1, V: 1, Y: 1, P: 1, S: 1 });
      return ['E', 'D', 'M', 'Dr'].every(function (m) { return chart.indexOf(m) < 0; });
    })());
  ok('and the conditions line carries the states, ruled off from both sides',
    /if \(t\.getAttribute\('data-directional'\) === 'true'\) \{/.test(src) &&
    // Ruled off, and set like every other line: no weight, no colour of its own.
    /\.graha-card-conditions \{[^}]*border-top: 1px solid var\(--line-soft\);\s*\}/
      .test(css.replace(/\n/g, '')) &&
    /\.graha-card-conditions,\s*\.graha-card-lords \{ font-size: 0\.8rem; color: var\(--ink\); \}/
      .test(css) &&
    /\.graha-card-conditions \{[^}]*border-top: 1px solid var\(--line-soft\)/
      .test(css.replace(/\n/g, '')) &&
    /\.graha-card-list \{[^}]*border-top: 1px solid var\(--line-soft\)/
      .test(css.replace(/\n/g, '')));
  /*
   * And the karaka takes neither the name's weight nor the graha's colour: it
   * is a role the graha holds, not part of what it is called.
   */
/*
 * Who it is and where exactly, on one line. The karaka follows from the
 * degree and the nakshatra is the degree said finer, so the three are one
 * answer and were being given as two.
 *
 * All of it trails the name without taking its weight or the graha's colour:
 * these are things true of the graha, not part of what it is called.
 */
  ok('the karaka and the position trail the name without joining it',
    /var trail = el\('span', 'graha-card-trail'\);/.test(src) &&
    /fact\(trail, '', t\.getAttribute\('data-karaka'\)\)/.test(src) &&
    /fact\(trail, '', t\.getAttribute\('data-sign'\) \+ ' ' \+ t\.getAttribute\('data-degree'\)\)/
      .test(src) &&
    /fact\(trail, '', t\.getAttribute\('data-nakshatra'\)\)/.test(src) &&
    /head\.appendChild\(trail\)/.test(src) &&
    /\.graha-card-trail \{[^}]*font-weight: 400;/.test(css.replace(/\n/g, '')) &&
    !/graha-card-karaka/.test(src + css));
  /*
   * Two readings new to the card, both about grahas other than the one being
   * pointed at. The nakshatra lord is read as a relation, the way the
   * dispositor is. The sub lord is not: a sub is a slice of a nakshatra and
   * the graha has no standing in it, so what is worth saying is how that lord
   * is itself placed.
   */
  ok('the nakshatra lord and sub lord both carry their relationship',
    /nakLordRelation: relationBetween\(p, nakOf\(p\)\.lord, d1\)/.test(src) &&
    /subLordRelation: relationBetween\(p, nakOf\(p\)\.subLord, d1\)/.test(src) &&
    /data-nak-lord-relation/.test(chartsSrc) && /data-sub-lord-relation/.test(chartsSrc));

  ok('Moon is not repeated when it occupies the selected reference house',
    (function () {
      var original = Yogas.detect, calls = [];
      Yogas.detect = function (chart) {
        calls.push(chart.reference);
        return [{ title: 'Test yoga', subject: 'Test', condition: 'general',
          grahas: ['Mars'] }];
      };
      var fake = { ascendant: { longitude: 5 }, planets: [
        { name: 'Moon', longitude: 41, sign: 1 },
        { name: 'Sun', longitude: 75, sign: 2 },
        { name: 'Venus', longitude: 48, sign: 1 },
        { name: 'Mars', longitude: 105, sign: 3 }
      ] };
      var map;
      try { map = out.yogasByGraha({ chart: fake, shadbala: {} }, 1, 'Venus'); }
      finally { Yogas.detect = original; }
      return calls.join(',') === 'Venus,Sun' && map.Mars.length === 1 &&
        map.Mars[0].from.join(',') === 'Venus,Sun';
    })());

  /*
   * And the figures are real. Driven through the same function the page calls,
   * on a chart rotated onto the Moon, because the houses a graha rules are the
   * half of this that a rotation moves.
   */
  ok('the houses named are the ones the graha really rules, from this house 1',
    (function () {
      var state = { chart: Astro.chart({ jdUT: Astro.julianDay(1977, 11, 15, 3),
        latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 }) };
      var fromLagna = out.rulingAndAspects(state, 1, 'Ascendant');
      var fromMoon = out.rulingAndAspects(state, 1, 'Moon');
      var lagna = Astro.signOf(state.chart.ascendant.longitude);
      var moonSign = state.chart.planets.filter(function (p) {
        return p.name === 'Moon';
      })[0].sign;
      var said = function (map, graha, reference) {
        return Astro.housesOwned(graha, reference)
          .map(function (h) { return Yogas.ordinal(h); }).join(', ') ===
          map[graha].rules;
      };
      return said(fromLagna, 'Saturn', lagna) && said(fromMoon, 'Saturn', moonSign) &&
        fromLagna.Saturn.rules !== fromMoon.Saturn.rules &&
        fromLagna.Rahu.rules === '' && fromLagna.Ketu.rules === '';
    })());
  ok('and the grahas named as aspecting really do aspect it, by the full rule',
    (function () {
      var state = { chart: Astro.chart({ jdUT: Astro.julianDay(1977, 11, 15, 3),
        latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 }) };
      var map = out.rulingAndAspects(state, 1, 'Ascendant');
      var at = {};
      state.chart.planets.forEach(function (p) { at[p.name] = p; });
      var wrong = [], any = 0;
      Object.keys(map).forEach(function (name) {
        if (!map[name].seenBy) return;
        map[name].seenBy.split(', ').forEach(function (entry) {
          any++;
          var who = entry.split(' ')[0];
          if (!Astro.aspects(who, at[who].sign, at[name].sign)) wrong.push(entry);
        });
      });
      return any > 0 && wrong.length === 0;
    })());

  ok('special dignity closes the plain-English condition line',
    /var dignity = t\.getAttribute\('data-dignity'\)/.test(src) &&
    /\^\(Exalted\|Debilitated\|Mooltrikona\)\$/.test(src) &&
    /conditions\.appendChild\(el\('span', 'graha-card-item',\s*\n?\s*dignity \+ ' \[' \+ DIGNITY_MARKS\[dignity\] \+ '\]'\)\)/.test(src) &&
    !/graha-card-dignity/.test(src + css));
  /*
   * And is divided from the findings by the same line the findings use between
   * themselves: the placement and its dignity are one thing, each finding
   * below another, and the card should show where that boundary is.
   */
  ok('a rule divides the placement from the findings, as between findings',
    /\.graha-card-list \{[^}]*border-top: 1px solid var\(--line-soft\)/.test(css) &&
    /\.graha-card-list li \+ li \{[^}]*border-top: 1px solid var\(--line-soft\)/.test(css));

  /*
   * Friendship is read from the rashi even when a division is on screen, which
   * is where the classical rule puts it. Computing it from the recast chart
   * would give a different and wrong answer, so the map is built from the D1
   * positions whatever division is being drawn.
   */
  ok('friendship is read from the rashi even for a division',
    /var d1 = \{\};\s*\n\s*state\.chart\.planets\.forEach/.test(src));

  /*
   * Run the real thing rather than trust the source. Pull the builder out of
   * app.js and check both halves answer on a chart that has each case.
   */
  var body = src.match(/function dignitiesByGraha\(state, division, tatkalika, horaRule, horaMercury\) \{[\s\S]*?\n  \}/)[0];
  ok('the card reads the same varga dignity as the grid',
    /Astro\.vargaDignity\(p\.name, p\.longitude, division, d1, tatkalika, horaRule,\s*\n\s*horaMercury\)/.test(body));
  var build = new Function('Astro', body + '\n return dignitiesByGraha;')(Astro);
  // Every assertion below is about dignity, not about tatkalika, so it names
  // the reading rather than inheriting whichever way the default happens to go.
  var built = function (state, division) { return build(state, division, 'rashi', 'lord'); };

  var chart = Astro.chart({ jdUT: Astro.julianDay(1975, 8, 20, 3), latitude: 28.61,
    longitude: 77.21, tzOffsetMinutes: 330 });
  var got = built({ chart: chart }, 1);

  /*
   * The parts, not a sentence. The card names the dispositor on its own line
   * and stands the dignity beside the sign, so a string reading "In Mars's
   * sign, an enemy" would only have to be taken apart again at the other end.
   */
  ok('a graha in its moolatrikona is named as such, with no relation to report',
    got.Sun.formal === 'Mooltrikona' && got.Sun.relation === '',
    JSON.stringify(got.Sun));
  ok('a graha with no formal dignity reports the lord of its sign instead',
    got.Moon.formal === '' && got.Moon.lord === 'Saturn' && !!got.Moon.relation,
    JSON.stringify(got.Moon));
  ok('and the dispositor is named even where it is the graha itself',
    !!got.Mercury.lord, JSON.stringify(got.Mercury));
  ok('and a debilitated node keeps its separate, sign-wide dignity',
    (got.Rahu || {}).formal === 'Debilitated', JSON.stringify(got.Rahu));

  /*
   * Every graha should get something: either it holds a dignity, or it sits in
   * somebody's sign and has a view of them. A blank line would mean a case the
   * builder does not cover.
   */
  var silent = chart.planets.filter(function (p) {
    var g = got[p.name];
    return !g || (!g.formal && !g.lord);
  }).map(function (p) { return p.name; });
  ok('no graha is left with nothing said about where it stands',
    silent.length === 0, silent.join(', ') || 'all nine covered');

  /*
   * A divisional degree is the fraction of one division stretched over a
   * whole sign. It can accidentally fall in a moolatrikona degree range, but
   * that is not a degree the graha occupies. The card used to read it while
   * the grid correctly refused it.
   */
  var falseMool = null;
  Astro.SHODASAVARGA.some(function (division) {
    if (division === 1) return false;
    var recast = Astro.chartInDivision(chart, division);
    return recast.planets.some(function (p) {
      if (['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn']
          .indexOf(p.name) < 0) return false;
      if (Astro.dignityOf(p.name, p.sign, p.longitude % 30) !== 'Mooltrikona') return false;
      falseMool = { division: division, name: p.name };
      return true;
    });
  });
  if (falseMool) {
    var divided = built({ chart: chart }, falseMool.division);
    ok('a stretched varga degree cannot put moolatrikona on the card',
      !/Mooltrikona/.test(divided[falseMool.name] || ''),
      falseMool.name + ' D' + falseMool.division + ': ' + divided[falseMool.name]);
  } else {
    ok('the regression fixture contains a false divisional moolatrikona', false);
  }

  /*
   * The ascendant is a point and holds no dignity, so it must not appear -
   * the card would otherwise claim a friendship for something that owns
   * nothing and befriends nobody.
   */
  ok('the ascendant is not given a dignity', got.Ascendant === undefined);
})();


console.log('\nThe card carries the hemming the table already showed');
/*
 * The graha table has marked [P] and [S] since they existed and the hover card
 * never did, so the same chart could say Venus was hemmed in one place and stay
 * silent about it in the other. The card is where the reason fits, so it is the
 * place the omission mattered most.
 */
(function () {
  var out = global.appExports || {};
  var src = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  var chartsSrc = fs.readFileSync(path.join(root, 'js/charts.js'), 'utf8');

  ok('both mark tables know the two hemming letters',
    /P: 'Papa kartari', S: 'Shubha kartari'/.test(src) &&
    /P: 'Papa kartari', S: 'Shubha kartari'/.test(chartsSrc));
  ok('the hemming is computed per division and handed to the renderer',
    /function hemmingByGraha\(state, division\)/.test(src) &&
    /hemming: hemmingByGraha\(state, set\.division\)/.test(src));
  ok('and pushed as a state with its reason',
    /states\.push\(hemmed\.mark\)/.test(chartsSrc) &&
    /why\[hemmed\.mark\] = hemmed\.why/.test(chartsSrc));
  /*
   * Nature is judged in the rashi and company in the division: a graha's
   * neighbours change with the recast, what it is does not.
   */
  ok('benefics are judged in the rashi while neighbours come from the division',
    /var benefics = Astro\.naturalBenefics\(state\.chart\);/.test(src));

  /*
   * Measured, or the card prints a mark with no figure beside it while every
   * other line has one. Nothing swept for these before.
   */
  var F = global.FREQUENCIES;
  var missing = ['Venus/P', 'Mercury/P', 'Sun/S', 'Jupiter/S']
    .filter(function (k) { return typeof F.state[k] !== 'number'; });
  ok('and the hemming marks have measured frequencies like the rest',
    missing.length === 0, missing.join(', ') || 'Venus/P at ' + F.state['Venus/P'] + '%');

  /*
   * Run it: draw a chart, hover a hemmed graha, and check the card says so.
   * Then check the card and the table cannot disagree, since both now read the
   * same helper over the same division.
   */
  if (!out.wireGrahaCard) { ok('the card wiring is reachable', false); return; }
  var chart = Astro.chart({ jdUT: Astro.julianDay(1977, 8, 20, 3), latitude: 28.61,
    longitude: 77.21, tzOffsetMinutes: 330 });
  var benefics = Astro.naturalBenefics(chart);
  var hemmed = chart.planets.filter(function (p) {
    return Astro.hemmedByMalefics(p.name, p.sign, chart, benefics) ||
           Astro.hemmedByBenefics(p.name, p.sign, chart, benefics);
  });
  ok('the sample chart has something hemmed to look at', hemmed.length > 0,
    hemmed.map(function (p) { return p.name; }).join(', '));

  var box = makeNode('div');
  Charts.render(box, { style: 'north', planets: chart.planets,
    ascendant: chart.ascendant.longitude, division: 1, reference: 'Ascendant',
    yogas: {}, dignities: {},
    hemming: (function () {
      var marks = {};
      hemmed.forEach(function (p) {
        marks[p.name] = {
          mark: Astro.hemmedByMalefics(p.name, p.sign, chart, benefics) ? 'P' : 'S',
          why: 'flanked on both sides.'
        };
      });
      return marks;
    })() });

  var labels = [];
  (function walk(n) {
    (n.children || []).forEach(function (c) {
      if (c.attrs && c.attrs['data-graha']) labels.push(c);
      walk(c);
    });
  })(box);
  var target = labels.filter(function (n) {
    return n.attrs['data-graha'] === hemmed[0].name;
  })[0];
  /* The states field packs "letter FLD reason", records joined by REC, so the
     letters have to be parsed out rather than matched anywhere in the string -
     a reason mentioning Saturn would otherwise read as an [S]. */
  var letters = function (node) {
    return (node.attrs['data-states'] || '').split(String.fromCharCode(30))
      .filter(Boolean).map(function (r) { return r.split(String.fromCharCode(31))[0]; });
  };
  ok('the hemmed graha carries the mark in its states',
    !!target && letters(target).some(function (k) { return k === 'P' || k === 'S'; }),
    target ? letters(target).join(',') : 'not drawn');

  /*
   * And nothing unhemmed picks one up, which is the other half of agreeing
   * with the table.
   */
  var wrong = labels.filter(function (n) {
    var name = n.attrs['data-graha'];
    if (name === 'Ascendant') return false;
    var isHemmed = hemmed.some(function (p) { return p.name === name; });
    var says = /?[PS]/.test(n.attrs['data-states'] || '');
    return isHemmed !== says;
  }).map(function (n) { return n.attrs['data-graha']; });
  ok('and no graha is marked that the helper does not call hemmed',
    wrong.length === 0, wrong.join(', ') || 'all agree');
})();


console.log('\nThe card is wide enough to read and stays on screen');
/*
 * At 21rem every finding's name wrapped - "Angle-/trine raja/yoga" - because
 * the name and its frequency had to share a line that was too narrow for them.
 * A graha with five findings became a tall thin column running off the bottom
 * of the window.
 *
 * Widening it breaks the old placement, which clamped the card inside the
 * chart column: a card wider than its column gets shoved sideways until it
 * runs off the page. So the clamp is against the viewport now, and a card too
 * long to fit below the graha flips above it - it takes no pointer events by
 * design, so it cannot be scrolled into view if it overflows.
 */
(function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var src = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');

  ok('the card is capped wide enough for a name and its figure on one line',
    /max-width: min\(34rem, calc\(100vw - 1\.5rem\)\)/.test(css));
  ok('and never wider than the window it sits in',
    /calc\(100vw - 1\.5rem\)/.test(css));
  /*
   * Absolutely positioned with only `left` set, the box otherwise shrinks to
   * fit the space left between `left` and the right edge of the chart column,
   * so a graha further right got a narrower card from the same rule - two
   * cards on one page differing by half their width. Taking the width from the
   * content is what makes the cap the only thing that decides it.
   */
  ok('and its width comes from its content, not from where it happens to sit',
    /\.graha-card \{[^}]*width: max-content/.test(css));

  /*
   * Run the placement rather than read it. The block is lifted out of app.js
   * and driven with rects, so the arithmetic is what is being checked.
   */
  /*
   * placeCard is shared by the graha card and the settings card now, so it is
   * lifted out whole and called rather than having its body spliced into a
   * harness - which is what broke when it stopped being an inline block.
   */
  var body = src.match(/function placeCard\(card, target, container\) \{[\s\S]*?\n  \}/)[0];
  var place = function (rect, box, size, view) {
    var card = { style: {}, hidden: true,
                 offsetWidth: size.w, offsetHeight: size.h };
    var target = { getBoundingClientRect: function () { return rect; } };
    var container = { getBoundingClientRect: function () { return box; } };
    new Function('window', 'document', body + '\n return placeCard;')(
      { innerWidth: view.w, innerHeight: view.h }, { documentElement: {} })(
        card, target, container);
    return { left: parseFloat(card.style.left), top: parseFloat(card.style.top) };
  };

  var view = { w: 1200, h: 800 };
  var box = { left: 100, top: 50, width: 400, bottom: 450, right: 500 };

  // A graha hard against the left of a narrow column, with a card wider than it.
  var leftEdge = place({ left: 110, right: 130, width: 20, top: 100, bottom: 120 },
    box, { w: 544, h: 300 }, view);
  ok('a card wider than its column is not pushed off the left of the window',
    leftEdge.left + box.left - 544 / 2 >= 0,
    'viewport left edge at ' + (leftEdge.left + box.left - 272));

  // And the same at the right-hand end of the page.
  var rightEdge = place({ left: 1150, right: 1170, width: 20, top: 100, bottom: 120 },
    box, { w: 544, h: 300 }, view);
  ok('nor off the right',
    rightEdge.left + box.left + 544 / 2 <= view.w,
    'viewport right edge at ' + (rightEdge.left + box.left + 272));

  /*
   * Vertical: below by default, above when the card is too long for the room
   * below and there is more of it above.
   */
  var roomy = place({ left: 300, right: 320, width: 20, top: 100, bottom: 120 },
    box, { w: 544, h: 200 }, view);
  ok('a card that fits below the graha hangs below it',
    roomy.top === 120 - box.top + 8, roomy.top);

  var cramped = place({ left: 300, right: 320, width: 20, top: 700, bottom: 720 },
    box, { w: 544, h: 400 }, view);
  ok('one too long for the room below flips above instead',
    cramped.top === 700 - box.top - 400 - 8, cramped.top);

  /* More room above does not help when the card still cannot fit there. The
     old comparison used `above > room`, flipped this case, and put the card's
     heading above the viewport. */
  var neither = place({ left: 300, right: 320, width: 20, top: 600, bottom: 620 },
    box, { w: 544, h: 700 }, view);
  ok('one that fits on neither side keeps its heading below the graha',
    neither.top === 620 - box.top + 8, neither.top);

  /*
   * And when neither side has room - a card taller than the window - it stays
   * below rather than being thrown upward off the top, which is the lesser of
   * the two failures: the top of the card is what carries the graha's name.
   */
  var huge = place({ left: 300, right: 320, width: 20, top: 380, bottom: 400 },
    box, { w: 544, h: 2000 }, view);
  ok('a card taller than the window keeps its head on screen',
    huge.top === 400 - box.top + 8, huge.top);
})();


console.log('\nThe card leads with what is rare');
/*
 * The list ran states then yogas, which is the order the data arrives in and
 * says nothing about the chart. Sorted by how often the thing is true at all,
 * the top of the card is what distinguishes this chart rather than what two
 * charts in three share.
 */
(function () {
  var out = global.appExports || {};
  var src = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  var F = global.FREQUENCIES;

  ok('the findings are gathered before any are drawn, then ordered',
    /var found = \[\];/.test(src) && /found\.sort\(function \(a, b\)/.test(src) &&
    /found\.forEach\(function \(item\) \{ list\.appendChild\(item\.build\(\)\); \}\);/.test(src));
  ok('and an unmeasured finding sorts last, not first',
    /typeof a\.chance === 'number' \? a\.chance : Infinity/.test(src) &&
    /typeof b\.chance === 'number' \? b\.chance : Infinity/.test(src));
  ok('dignity is left out of the ordering, being part of the placement',
    src.indexOf('conditions.push(dignity)') < src.indexOf('var found = [];'));

  if (!out.wireGrahaCard) { ok('the card wiring is reachable', false); return; }

  /*
   * Drive the real card. Venus on this chart carries several findings of very
   * different rarity, which is the case the ordering exists for.
   */
  var chart = Astro.chart({ jdUT: Astro.julianDay(1977, 8, 20, 3), latitude: 28.61,
    longitude: 77.21, tzOffsetMinutes: 330 });
  var strengths = Shadbala.compute(chart,
    { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 });

  var byGraha = out.yogasByGraha({ chart: chart, shadbala: strengths }, 1, 'Ascendant');

  var box = makeNode('div');
  Charts.render(box, { style: 'north', planets: chart.planets,
    ascendant: chart.ascendant.longitude, division: 1, reference: 'Ascendant',
    yogas: byGraha, dignities: {}, hemming: {} });
  out.wireGrahaCard(box);

  var labels = [];
  (function walk(n) {
    (n.children || []).forEach(function (c) {
      if (c.attrs && c.attrs['data-graha']) labels.push(c);
      walk(c);
    });
  })(box);

  /* Whichever graha carries the most findings is the one worth checking. */
  var busiest = null, most = 0;
  labels.forEach(function (n) {
    var count = (byGraha[n.attrs['data-graha']] || []).length;
    if (count > most) { most = count; busiest = n; }
  });
  ok('a graha with several findings is available to check', most >= 3,
    busiest ? busiest.attrs['data-graha'] + ' with ' + most : 'none');

  box.fire('mouseover', { target: busiest });
  var card = box.children.filter(function (c) {
    return c.className === 'graha-card';
  })[0];
  var ul = card.children.filter(function (c) { return c.className === 'graha-card-list'; })[0];

  /* The figure printed on each row, read back in the order they were drawn. */
  var shown = ul.children.map(function (li) {
    var head = li.children[0];
    var badge = head.children.filter(function (n) {
      return n.className === 'graha-card-freq';
    })[0];
    return badge ? parseFloat(badge.textContent) : null;
  }).filter(function (v) { return v !== null && !isNaN(v); });

  ok('every row on the card carries a figure', shown.length === ul.children.length,
    shown.length + ' of ' + ul.children.length);

  var ordered = shown.every(function (v, i) { return i === 0 || shown[i - 1] <= v; });
  ok('and they run from rarest to commonest down the card', ordered,
    shown.join('% then ') + '%');
})();

console.log('\nThe settings read as choices, not as boxes to fill in');
/*
 * A select stretched to the full width of a wide card reads as a text field
 * waiting for input rather than a choice between two or three phrases. Capped
 * at what the longest option needs, so nothing is clipped.
 */
(function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

  ok('the settings selects are capped rather than filling the card',
    /\.settings-panel \.field select \{ max-width: 30rem; \}/.test(css));

  /*
   * The cap has to clear the longest option this panel offers, or the choice a
   * reader most needs to tell apart is the one that gets truncated. Measured in
   * characters against a conservative average width, since the page has no
   * layout engine here.
   */
  var panel = page.slice(page.indexOf('id="panel-settings"'));
  var options = (panel.match(/<option[^>]*>([^<]+)<\/option>/g) || [])
    .map(function (o) {
      return o.replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, "'").trim();
    });
  var longest = options.reduce(function (a, b) {
    return b.length > a.length ? b : a;
  }, '');
  // 0.5em per character is generous for this face at 1rem; 30rem is 60 of them,
  // and the arrow and padding take about four.
  ok('and the cap clears the longest option the panel offers',
    longest.length <= 56, longest.length + ' chars: ' + longest);

  /*
   * Scoped, because the chart selects sit in a narrow control row and the place
   * combobox is a text field that wants every pixel it is given.
   */
  ok('and nothing outside the settings panel is capped with it',
    !/(^|\})\s*\.field select \{ max-width/.test(css) &&
    !/^select \{[^}]*max-width/m.test(css));
})();


console.log('\nThe settings sit three to a row, explaining themselves on hover');
/*
 * Eleven settings, each a select the full width of the card with a <details>
 * folded under it. That is a long scroll of mostly empty space, and the folds
 * were what made three-to-a-row impossible: opening one would have shunted its
 * neighbours down the grid.
 *
 * The reasoning is unchanged and still in the document. What it has lost is its
 * claim on the layout: the select points at it with aria-describedby, so a
 * screen reader still gets it on focus, and hovering the label opens the same
 * card the chart uses for a graha.
 */
(function () {
  var page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var src = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  var panel = page.slice(page.indexOf('id="panel-settings"'),
                         page.indexOf('</section>', page.indexOf('id="panel-testing"')));

  ok('the fields are gridded rather than stacked one to a row',
    /<div class="settings-grid">/.test(panel) &&
    /\.settings-grid \{[^}]*display: grid/.test(css) &&
    !/\.settings-panel \.field \+ \.field \{ margin-top/.test(css));
  ok('and reach three across only when there is room for three',
    /@media \(min-width: 40rem\) \{\s*\.settings-grid \{ grid-template-columns: repeat\(2/
      .test(css) &&
    /@media \(min-width: 62rem\) \{\s*\.settings-grid \{ grid-template-columns: repeat\(3/
      .test(css));

  /*
   * The point of moving the reasoning out of the flow is that it no longer
   * decides how tall a row is. A <details> left anywhere in the panel would put
   * that back.
   */
  ok('no setting folds out of the layout any more',
    !/<details class="field-why">/.test(panel) &&
    (panel.match(/<div class="field-why" id="why-/g) || []).length ===
      (panel.match(/<div class="field">/g) || []).length);

  /*
   * Kept for the reader who cannot hover. The note stays in the document and
   * the select names it, so focusing the control reads the reasoning out.
   */
  ok('every select points at its own explanation for a screen reader',
    (function () {
      var ids = (panel.match(/<select id="([a-z-]+)"/g) || [])
        .map(function (m) { return m.slice('<select id="'.length, -1); });
      return ids.length === (panel.match(/<div class="field">/g) || []).length &&
        ids.every(function (id) {
        return panel.indexOf('aria-describedby="why-' + id + '"') >= 0 &&
          panel.indexOf('<div class="field-why" id="why-' + id + '"') >= 0;
      });
    })());
  ok('and the note is hidden from sight without being hidden from the reader',
    /\.field-why \{[^}]*clip: rect\(0 0 0 0\)/.test(css) &&
    !/\.field-why \{[^}]*display: none/.test(css));

  /*
   * Hovering the label opens the card. It is wired on the grid rather than per
   * field, so the eleven share one card and one pair of listeners.
   */
  ok('hovering a setting opens a card, wired once on the grid',
    /function wireSettingHelp\(\)/.test(src) &&
    /grid\.addEventListener\('mouseover', function \(e\)/.test(src) &&
    /grid\.addEventListener\('focusin', function \(e\)/.test(src) &&
    /wireSettingHelp\(\);/.test(src));
  /*
   * The label opens it and the select does not: reaching for a dropdown is not
   * asking why it is there, and a card springing up over the options just as
   * you go to read them is in the way of what you came for. Focus is the other
   * way in and lands on the select, a label being no tab stop, so a keyboard
   * reader still has a way to see it.
   */
  ok('but only from the label, not from the select beneath it',
    /var labelOf = function \(node\)/.test(src) &&
    /var label = labelOf\(e\.target\);\s*\n\s*if \(!label\) \{ hide\(\); return; \}/
      .test(src));
  ok('while focus opens it from the control, which is where focus lands',
    /grid\.addEventListener\('focusin', function \(e\) \{/.test(src) &&
    /open\(fieldOf\(e\.target\)\);/.test(src));
  /*
   * Clicking a select focuses it as well, and that opened the card exactly
   * where the list of options was about to appear - the two covering each
   * other over the control just reached for. Only focus the browser judges
   * worth a ring opens it, which is what :focus-visible answers.
   */
  ok('but a click on the select opens the dropdown, not the card',
    /var viaPointer = false;/.test(src) &&
    /if \(viaPointer\) \{ hide\(\); return; \}/.test(src) &&
    /grid\.addEventListener\('mousedown', hide\)/.test(src));
  /*
   * :focus-visible was tried and does not settle it: whether a clicked
   * <select> matches is a matter the engines disagree on, and Safari says yes,
   * so the card came straight back after the mousedown that hid it. The
   * question is asked of the input instead - pointer down sets, key down
   * clears - and both are watched in the capture phase so they are seen before
   * focus moves.
   */
  ok('and the modality is read from the input, not from the element',
    !/matches\(':focus-visible'\)/.test(src) &&
    /document\.addEventListener\('pointerdown', function \(\) \{ viaPointer = true; \}, true\)/
      .test(src) &&
    /document\.addEventListener\('keydown', function \(\) \{ viaPointer = false; \}, true\)/
      .test(src));
  ok('and the label says it is hoverable',
    /\.settings-panel \.field label \{ cursor: help; \}/.test(css));

  /*
   * One placement for both cards. They want the same behaviour - centred on
   * what opened them, clamped to the viewport, flipped above when there is no
   * room below - and had no business each keeping a copy of it.
   */
  ok('both cards are placed by the same code',
    /function placeCard\(card, target, container\)/.test(src) &&
    // the definition matches the same shape, so it is excluded from the count
    (src.match(/(?<!function )placeCard\(card, /g) || []).length === 2);

  /*
   * The card reads the note rather than holding a second copy of the text,
   * which is how the two would drift apart.
   */
  ok('the card reads the note rather than repeating it',
    /body\.innerHTML = why\.innerHTML;/.test(src) &&
    /card\.appendChild\(el\('h4', null, label\.textContent\)\)/.test(src));
})();

console.log('\nThe settings notes describe what the code does');
/*
 * This began as a guard on the cheshta note, which had claimed the ephemeris
 * settled more of the eight motions than it does and then listed the wrong
 * count of hand-drawn thresholds. There are no hand-drawn thresholds left:
 * Sripatipaddhati gives the boundary as the mean motion, with each side split
 * by whether the speed is rising or falling. What survives of the old worry is
 * that the two things still chosen here are named as chosen.
 */
(function () {
  var page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var flat = page.replace(/\s+/g, ' ');
  var shad = fs.readFileSync(path.join(root, 'js/shadbala.js'), 'utf8');

  ok('no speed bands survive in the code for the note to have to list',
    !/MOTION_BANDS/.test(shad) &&
    /return speed < mean \? \(gaining \? 'manda' : 'mandatara'\)/.test(shad));
  ok('and the note gives the mean motion as the boundary, which is the text’s',
    /Sripati also gives the boundary, which is the mean motion itself/.test(flat) &&
    /Manda and Mandatara fall below it, Seeghra and Seeghratara above/.test(flat));

  /*
   * Two things are still this site's, and both have to be owned in the note:
   * how slow counts as stationary, and how close counts as conjunct.
   */
  ok('the stationary fraction is named as chosen, and matches the code',
    /var STATIONARY = 0\.05;/.test(shad) &&
    /must be to count as Vikala, which is set at a twentieth of mean/.test(flat));
  ok('and so is reading Samagama as sharing a sign',
    /reading Samagama as sharing a sign with the Moon, the text saying only conjunction/
      .test(flat) &&
    /Math\.floor\(Astro\.norm360\(moonLongitude\) \/ 30\)/.test(shad));

  /*
   * The inner two are measured against the Sun's motion rather than their own,
   * which the table has to agree with wherever the note is read.
   */
  var motion = shad.match(/var MEAN_MOTION = \{[^}]*\}/)[0];
  ok('and the inner two really are measured against the Sun',
    /Mercury: 0\.985609/.test(motion) && /Venus: 0\.985609/.test(motion));
})();

console.log('\nThe notes claim only what was checked');
/*
 * "Lahiri is the Indian government standard" was carried here for a long time
 * and is repeated everywhere, but it could not be sourced. The two books on
 * this site's shelf say something weaker - Charak "the best" and "the most
 * popular", de Fouw and Svoboda "the majority of Indian jyotishis use" - and
 * neither the Calendar Reform Committee's published remit nor the Rashtriya
 * Panchang's own pages name an ayanamsa at all.
 *
 * The note says that rather than dropping the matter, because a reader who has
 * met the claim elsewhere is owed the reason it is not made here.
 */
(function () {
  var page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var flat = page.replace(/\s+/g, ' ');

  /*
   * The note said Lahiri was "the Indian government standard" for a long time.
   * It is repeated everywhere and could not be sourced: Charak and de Fouw and
   * Svoboda both say only that it is the most used, the Calendar Reform
   * Committee's published remit names no ayanamsa, and neither do the
   * Rashtriya Panchang's own pages. The note explaining all that has since
   * come out too - a reader choosing an ayanamsa does not need the audit - so
   * what is left is the guard, which is the part that has to last.
   */
  ok('the note claims usage, which can be shown',
    /Lahiri, or Chitrapaksha, is the one most\s+Indian practice uses/.test(page));
  ok('and not standing, which could not be',
    !/government standard/.test(flat) && !/official/.test(flat));
})();


console.log('\nThe node setting says what it moves, and what it does not');
/*
 * "Shadbala is reckoned for the seven grahas only and does not change at all"
 * was true and was the whole of what the note said about consequences, which
 * left a reader with no idea what the setting does change. Swept instead: the
 * chart is built both ways and everything the page shows is compared.
 *
 * The claims are held to the code here, because a note giving figures is worth
 * less than no note if the figures drift.
 */
(function () {
  var page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var flat = page.replace(/\s+/g, ' ');
  var place = { latitude: 28.61, longitude: 77.21, tzOffsetMinutes: 330 };

  ok('the note now says what changes as well as what does not',
    /a chara karaka is reassigned in 21% of them/.test(flat) &&
    /another nakshatra in 7%, another sign in 3% and another house in 3%/.test(flat) &&
    /whether some graha is hemmed by benefics or by malefics changes in 2%/.test(flat) &&
    /the list of yogas found changes in 1%/.test(flat));

  /*
   * The strong claim is the negative one, and it is the one worth testing
   * rather than trusting: no Shadbala figure moves. A node takes no bala of its
   * own and casts no aspect that counts toward one, so the six should be
   * identical on charts that differ only in which node is used.
   */
  var GR = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
  var drifted = 0, sampled = 0, apart = 0;
  for (var y = 1950; y < 2020; y += 2) {
    var opts = { jdUT: Astro.julianDay(y, 5, 5, 5), latitude: 28.61,
      longitude: 77.21, tzOffsetMinutes: 330 };
    var mean = Astro.chart(Object.assign({}, opts, { trueNode: false }));
    var tru = Astro.chart(Object.assign({}, opts, { trueNode: true }));
    var m = {}, t = {};
    mean.planets.forEach(function (p) { m[p.name] = p; });
    tru.planets.forEach(function (p) { t[p.name] = p; });
    if (Math.abs(m.Rahu.longitude - t.Rahu.longitude) > 1e-9) apart++;
    var sm = Shadbala.compute(mean, place), st = Shadbala.compute(tru, place);
    sampled++;
    GR.forEach(function (g) {
      if (Math.abs(sm.grahas[g].total - st.grahas[g].total) > 1e-9) drifted++;
      if (Math.abs((sm.grahas[g].drik || 0) - (st.grahas[g].drik || 0)) > 1e-9) drifted++;
    });
    if (sm.ranking.join() !== st.ranking.join()) drifted++;
  }
  ok('the charts compared really do differ in where the nodes are',
    apart === sampled, apart + ' of ' + sampled);
  ok('and not one Shadbala figure moves between them, as the note claims',
    drifted === 0 && sampled > 30, drifted + ' differences over ' + sampled + ' charts');

  /*
   * And the positive claims have to be reachable: the nodes are counted among
   * the chara karakas and among the malefics that hem, which is why those two
   * move at all.
   */
  ok('the nodes are in the karaka reckoning the note credits',
    Astro.KARAKA_GRAHAS.indexOf('Rahu') >= 0);
  ok('and count as malefics for the hemming, which is why a mark can move',
    /NODES\.indexOf\(p\.name\) < 0 && benefics\[p\.name\] === true/.test(
      fs.readFileSync(path.join(root, 'js/astro.js'), 'utf8')));
})();


console.log('\nEvery citation in the settings names its book');
/*
 * "Santhanam's notes to chapter 27" - of what? Each of these notes is read on
 * its own, in a card that opens over one setting, so a citation that leans on
 * another note to say which book it means says nothing. Raman's sections had
 * the same fault: consistent shorthand across the app, and bare to anyone
 * reading a single card.
 */
(function () {
  var page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var panel = page.slice(page.indexOf('id="panel-settings"'),
                         page.indexOf('</section>', page.indexOf('id="panel-testing"')));
  var text = panel.replace(/<[^>]+>/g, ' ').replace(/&rsquo;/g, "'");
  text = text.split(/\s+/).join(' ');
  var WORKS = ['Brihat Parashara Hora Shastra', 'Phaladeepika',
    'Hindu Predictive Astrology', 'Graha and Bhava Balas',
    'Advance Techniques', 'Satayoga Manjari'];

  var bare = [];
  var cite = /(chapter \d+|section \d+|ch\.\d+)/g, m;
  while ((m = cite.exec(text)) !== null) {
    var around = text.slice(Math.max(0, m.index - 80), m.index + m[0].length + 70);
    if (!WORKS.some(function (w) { return around.indexOf(w) >= 0; })) bare.push(m[0]);
  }
  ok('no chapter or section is cited without naming the work it is in',
    bare.length === 0, bare.join(', ') || 'all named');

  /*
   * Each doubling is argued under the setting that controls it, and only
   * there. This began as a guard against one argument being made twice, back
   * when a single switch drove both rows; splitting the switch splits the
   * argument, so what it now watches is that neither note reaches across and
   * restates the other's case.
   */
  (function () {
    var note = function (id) {
      var at = panel.indexOf('id="' + id + '"');
      return panel.slice(at, panel.indexOf('</div>', at))
        .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    };
    var paksha = note('why-paksha-doubled'), ayana = note('why-ayana-doubled');
    ok('the Moon\u2019s doubling is argued under the Moon\u2019s row',
      /The paksha bala of the Moon is to be doubled/.test(paksha) &&
      /Uttara Kalamrita/.test(paksha) && !/Ayana Bala/.test(paksha));
    ok('and the Sun\u2019s under the Sun\u2019s, neither restating the other',
      /Ayana Bala is again multiplied by 2/.test(ayana) &&
      /Graha and Bhava Balas/.test(ayana) &&
      !/paksha bala of the Moon is to be doubled/.test(ayana));
    ok('and the old single-switch wording is gone',
      !/Neither doubling is disputed/.test(panel.replace(/\s+/g, ' ')) &&
      !/The doubling is not in dispute/.test(panel.replace(/\s+/g, ' ')));
  })();
})();


console.log('\nA column heading sits over its own column');
/*
 * "Measure" was centred while every cell beneath it starts at the left edge,
 * so the one word naming the column floated over the middle of it. The graha
 * headings are right to stay centred: the figures under them are.
 */
(function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  ok('the measure heading is aligned with the names it heads',
    /#shadbala-table thead th:first-child \{ text-align: left; \}/.test(css) &&
    /#shadbala-table tbody th\[scope="row"\] \{\s*\n\s*text-align: left;/.test(css));
  ok('and the graha headings are left centred, over figures that are',
    /#shadbala-table th, #shadbala-table td \{ text-align: center; \}/.test(css));
})();


console.log('\nThe notes name facts, not marks that move between surfaces');
/*
 * The node note said a "[P] or [S] mark" moved. True, but [P] and [S] had just
 * come off the graha table - so a reader looking at the table it used to be on
 * would read a claim about something no longer there. The marks live on the
 * Vimsopaka grid and on the graha card now, and may move again; the fact they
 * report does not. So the note reports the fact.
 */
(function () {
  var page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var panel = page.slice(page.indexOf('id="panel-settings"'),
                         page.indexOf('</section>', page.indexOf('id="panel-testing"')));
  var letters = (panel.match(/\[[A-Z]\]/g) || []);
  ok('no settings note points at a mark by its letter',
    letters.length === 0, letters.join(', ') || 'none');
})();


console.log('\nThe settings argue from the classical texts');
/*
 * A settings note has one job: say which reading a control chooses between and
 * on whose authority. That authority should be the text the rule comes from,
 * not a modern compendium restating it - Charak is a good compendium and every
 * point he carried here traced back to Parashara, Mantreswara or Santhanam
 * once looked for. He keeps his place in the lessons, which are where a
 * secondary summary is worth having.
 */
(function () {
  var page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var panel = page.slice(page.indexOf('id="panel-settings"'),
                         page.indexOf('</section>', page.indexOf('id="panel-testing"')));
  var seed = fs.readFileSync(path.join(root,
    'supabase/seed/astro_readings_strength.sql'), 'utf8');

  ok('no settings note argues from a modern compendium',
    panel.indexOf('Charak') < 0);
  /* Collapsed, since these names wrap across lines in the source. */
  var flatPanel = panel.replace(/\s+/g, ' ');
  ok('and the classical texts carry the arguments instead',
    /Brihat Parashara Hora Shastra/.test(flatPanel) &&
    /Phaladeepika/.test(flatPanel) && /Mantreswara/.test(flatPanel) &&
    /Santhanam/.test(flatPanel));
  /*
   * The two moderns the site does follow are still named where they are the
   * ones with a position: Raman throughout, Rao on the yogas.
   */
  ok('while Raman and Rao are still named where the reading is theirs',
    /Raman/.test(panel) && /Rao/.test(panel));
  ok('and the compendium keeps its place in the lessons',
    /Charak/.test(seed));
})();


console.log('\nUttara Kalamrita on the Moon in paksha bala');
/*
 * Surveying the classical compendia for this rule turned up one that states it
 * outright, and states it the way this site computes it. Uttara Kalamrita:
 * "Ravi, Kuja, Shani, waning Moon, badly associated Mercury, and Rahu are
 * malefics. Guru, Shukra and the waxing Moon (from the eighth lunar day of the
 * bright fortnight to the eighth of the dark fortnight) are benefics." That is
 * the group reading, and the boundary is Raman's eighth-day rule, which the
 * note had credited to Raman alone.
 *
 * The verse above the working also carries the doubling: "The paksha bala of
 * the Moon is to be doubled."
 */
(function () {
  var page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var flat = page.replace(/\s+/g, ' ');

  ok('the paksha note carries the classical statement of the group rule',
    /Uttara Kalamrita gives the boundary as the eighth day of the bright half to the eighth of the dark/
      .test(flat));
  ok('and the boundary it gives is the one the engine uses',
    /elongation > 90 && elongation < 270/.test(
      fs.readFileSync(path.join(root, 'js/astro.js'), 'utf8')));
  ok('and the doubling note cites the verse that states it',
    /The paksha bala of the Moon is to be doubled/.test(flat));

  /*
   * Both readings are still offered, because Mantreswara does not put her in a
   * group at all and that is a position, not an oversight.
   */
  ok('and both readings are still offered',
    /<option value="group"/.test(page) && /<option value="benefic"/.test(page));
  /*
   * A note that argues a question and does not say which way the site settled
   * it leaves the reader to infer the default from the select, which is the
   * one place it is not explained.
   */
  var flat2 = page.replace(/\s+/g, ' ');
  ok('and the note says which reading is the default',
    /which is the reading used here/.test(flat2));
  ok('and the oldest of the texts frames the measure as one of groups',
    /Brihat Jataka 21/.test(page) &&
    /malefic and benefic planets have strength \(Pakshabala\) in the dark and bright halves/
      .test(flat2));
  /*
   * The alternative was credited to Phaladeepika on a misreading of IV.5. IV.1
   * states the group rule in the same chapter, and IV.5 is satisfied by it -
   * the Moon reaches 119.5 of 120 at the full Moon under the group reading, so
   * "strong and auspicious when she has her full Paksha bala" is a description
   * of it rather than a difficulty for it. No text asks for the alternative.
   */
  ok('and does not credit the alternative to a text that does not hold it',
    /No classical text asks for it/.test(flat2) &&
    /<option value="benefic">Always as a benefic<\/option>/.test(page));
  /*
   * The labels name the reading and nothing else. They used to carry their
   * authorities in brackets - "(Parashara, Raman)", "(no classical source)" -
   * which is the note's job, and the note does it at length. A label repeating
   * a citation in four words can only lose the qualifications that make the
   * citation worth anything.
   */
  ok('and the labels name the reading, leaving the sourcing to the note',
    (function () {
      var panel = page.slice(page.indexOf('id="panel-settings"'),
                             page.indexOf('</section>', page.indexOf('id="panel-testing"')));
      var named = (panel.match(/<option[^>]*>[^<]*\((?:[^)]*)\)[^<]*<\/option>/g) || []);
      return named.length === 0;
    })());
})();


console.log('\nThe settings notes do not argue from what software does');
/*
 * "It is offered because some software computes it that way" is not a reason a
 * reader needs while choosing a setting. What they need is whether a text asks
 * for it, and the notes say that. Where the comparator work belongs is the
 * Lesson tab, which carries it at length.
 */
(function () {
  var page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var panel = page.slice(page.indexOf('id="panel-settings"'),
                         page.indexOf('</section>', page.indexOf('id="panel-testing"')));
  var seed = fs.readFileSync(path.join(root,
    'supabase/seed/astro_readings_strength.sql'), 'utf8');

  ok('no settings note justifies an option by what other programs do',
    !/software/i.test(panel) && !/Drik Panchang/.test(panel) &&
    !/Star Jyotish/.test(panel));
  /*
   * But the warning itself stays. A reader is owed the fact that a reading has
   * no text behind it; that is the part of the sentence worth keeping.
   */
  ok('while an unsourced option still says no text asks for it',
    /No classical text asks for it/.test(panel.replace(/\s+/g, ' ')));
  /*
   * The seasonal hora used to be on that list too - "no source consulted here
   * asks for it in this bala" - and it has a source now. The textbook by
   * K. N. Rao's students divides the day-length by twelve and the night-length
   * by twelve and works all three of its charts that way, which is why it is
   * the default. Parashara's verse asking for twenty-four equal parts is the
   * other reading, and the note gives both.
   */
  ok('and the seasonal hora is no longer called unsupported',
    !/no source consulted here asks for it in this bala/
      .test(panel.replace(/\s+/g, ' ')) &&
    /how long that hour is turns out to be disputed after all/
      .test(panel.replace(/\s+/g, ' ')));
  /*
   * Zone time used to be on that list - "No authority asks for zone time" - and
   * it is not unsourced after all. Uttara Kalamrita's own working takes the
   * clock's noon: "It is enough if we take 12.00 hours as noon and zero hours
   * as midnight." Raman asks for the sundial instead, so the note now gives
   * both rather than calling one of them unsupported.
   */
  ok('and zone time is no longer called unsupported, since a text allows it',
    !/No authority asks for zone time/.test(panel.replace(/\s+/g, ' ')) &&
    /It is enough if we take 12.00 hours as noon and zero hours as midnight/
      .test(panel.replace(/\s+/g, ' ')));

  /*
   * Which left the charge sitting on the middle option - and that one turned
   * out not to be worth defending. Nothing asks for local mean time: Uttara
   * Kalamrita allows the clock as a stated shortcut, Raman asks for the
   * sundial, and Raman's own wording - "it must be converted into the apparent
   * time" - treats mean time as an input rather than an endpoint.
   *
   * The reason it is gone rather than merely discouraged is that the app
   * already had the control for it, in the right place. A birth recorded in
   * local mean time is a fact about the record, and the birth form asks that
   * question under time standard; answering it there sets the offset from
   * longitude, after which the clock reading IS mean time. The setting was a
   * second, worse spelling of a question already asked.
   */
  ok('the nata clock offers the two readings a text supports, and no third',
    (function () {
      var sel = panel.slice(panel.indexOf('<select id="nat-clock"'));
      sel = sel.slice(0, sel.indexOf('</select>'));
      return (sel.match(/<option /g) || []).length === 2 &&
        /value="apparent"/.test(sel) && /value="zone"/.test(sel) &&
        !/value="mean"/.test(sel);
    })());
  ok('and the note says outright which of the two to use',
    /Use apparent time, the default/.test(panel.replace(/\s+/g, ' ')) &&
    /Noon here means the Sun on the meridian/.test(panel.replace(/\s+/g, ' ')));

  /*
   * Where mean time does belong, it is still offered - and the note sends the
   * reader there rather than leaving the capability unfindable.
   */
  /*
   * It is a setting rather than a field on the form. Zone time is the answer
   * for almost every chart - it is what a clock and a birth certificate give,
   * and the timezone database already applies the rules in force on the day -
   * so asking everybody was asking a question with one answer. What it cannot
   * settle is where in a country a pre-standard-time birth was, and that is
   * the reading the option is kept for.
   */
  ok('local mean time is still selectable as a birth-time standard',
    /<select id="time-standard" aria-describedby="why-time-standard">/.test(page) &&
    /<option value="lmt">Local mean time, from the longitude<\/option>/.test(page));
  ok('and it is not asked of everybody on the form',
    !/id="time-standard"/.test(page.slice(page.indexOf('id="birth-form"'), page.indexOf('</form>'))) &&
    !/<details class="options">/.test(page) && !/Calculation options/.test(page));
  /*
   * And the drawing choice went to settings with the rest. It is a choice about
   * how every chart is laid out, which is the same ground the ayanamsa left on;
   * what a nativity is has nothing to do with which grid it is drawn in.
   */
  ok('the chart style is a setting rather than part of a birth record',
    !/id="chart-style"/.test(page.slice(page.indexOf('id="birth-form"'), page.indexOf('</form>'))) &&
    /<select id="chart-style" aria-describedby="why-chart-style">/.test(page) &&
    !/class="style-field"/.test(page));
  ok('and the nata note points at it instead of duplicating it',
    /recorded in local mean time, as Indian times were before 1906, is a separate question: that is the time standard, in Chart settings/
      .test(panel.replace(/\s+/g, ' ')));
  ok('and the comparator work is kept where it belongs, in the lessons',
    /Drik Panchang/.test(seed));
})();

console.log('\nThe settings run from the chart outward');
/*
 * The order is the order a reading is built in: what the zodiac is measured
 * from, then where the nodes are, and only then the individual balas.
 *
 * It is now told across two tabs rather than one long card. Chart settings
 * holds what changes the chart a reader looks at; Test settings holds the
 * shadbala readings, which are variants of one measure and were most of the
 * clutter. Nata-unnata moved with them: it is the clock every temporal
 * strength is counted against and belongs beside them, not above them.
 */
(function () {
  var page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var panel = page.slice(page.indexOf('id="panel-settings"'),
                         page.indexOf('</section>', page.indexOf('id="panel-testing"')));
  var order = (panel.match(/<label for="([a-z-]+)">/g) || [])
    .map(function (m) { return m.slice('<label for="'.length, -2); });
  var chartPanel = page.slice(page.indexOf('id="panel-settings"'),
                              page.indexOf('</section>', page.indexOf('id="panel-settings"')));
  var testPanel = page.slice(page.indexOf('id="panel-testing"'),
                             page.indexOf('</section>', page.indexOf('id="panel-testing"')));
  var idsIn = function (p) {
    return (p.match(/<label for="([a-z-]+)">/g) || [])
      .map(function (m) { return m.slice('<label for="'.length, -2); });
  };
  /*
   * Drawing comes before reading, and the moment before the zodiac. The style
   * changes nothing computed, only how the same figures are laid out, so it
   * opens the tab; then which clock the birth time was read off, then where
   * the zodiac is measured from, then where the nodes are.
   */
  ok('the chart-wide choices come first, and open the first tab',
    idsIn(chartPanel).slice(0, 4).join(',') === 'chart-style,time-standard,ayanamsa,node-type',
    idsIn(chartPanel).join(', '));

  /*
   * The split is the point of the two tabs: what a reader changes to change
   * the chart, against the shadbala variants. A setting in the wrong tab is
   * the failure worth catching, so both lists are named in full.
   */
  ok('Chart settings holds the readings that change the chart',
    idsIn(chartPanel).join(',') ===
      'chart-style,time-standard,ayanamsa,node-type,combustion,tatkalika,' +
      'hora-dignity,budha-floor,mercury-nature',
    idsIn(chartPanel).join(', '));
  ok('and Test settings holds the shadbala variants, the clock with them',
    idsIn(testPanel).join(',') ===
      'nat-clock,saptavargaja-ladder,hora-mercury,moon-paksha,paksha-doubled,' +
      'hora-length,ayana-constant,' +
      'kranti,ayana-doubled,cheshta-method,kendra-method,mean-source,luminary-rule,' +
      'luminary-cheshta,ishta-kashta',
    idsIn(testPanel).length + ' settings');
  ok('between them they hold every setting, none lost in the split',
    idsIn(chartPanel).length + idsIn(testPanel).length === order.length &&
    order.length === 24, order.length + ' settings');

  /*
   * The two that are not shadbala at all sit in the other tab now. One settles
   * a yoga rather than a strength, and Mercury's nature is read by the yoga
   * detectors as well as by paksha and drik bala, so neither belongs among the
   * shadbala variants. They used to break that run in two from the middle.
   */
  ok('the settings that are not shadbala are not in the shadbala tab',
    ['budha-floor', 'mercury-nature'].every(function (k) {
      return idsIn(testPanel).indexOf(k) < 0 && idsIn(chartPanel).indexOf(k) >= 0;
    }));
  ok('so the shadbala run is unbroken from the Moon’s paksha to the luminaries',
    order.slice(order.indexOf('moon-paksha'), order.indexOf('luminary-cheshta') + 1)
      .every(function (k) {
        return ['budha-floor', 'mercury-nature'].indexOf(k) < 0;
      }),
    order.slice(order.indexOf('moon-paksha'), order.indexOf('luminary-cheshta') + 1).join(', '));
  ok('and every field still carries its own note',
    order.length === (panel.match(/field-why" id="why-/g) || []).length,
    order.length + ' fields');

  /*
   * Each doubling switch sits against the thing it doubles: the Moon's beside
   * the reading of her paksha, the Sun's after the declination his ayana bala
   * is computed from. Apart they would be two identically worded controls with
   * nothing nearby to say which row each one meant.
   */
  ok('the paksha switch follows the paksha reading',
    order[order.indexOf('moon-paksha') + 1] === 'paksha-doubled',
    order.slice(order.indexOf('moon-paksha'), order.indexOf('moon-paksha') + 2).join(' then '));
  /*
   * The three cheshta settings sit together after the measure they qualify.
   * Each is meaningless without it, and two of them read almost identically
   * out of context: one picks which rule gives the luminaries a figure, the
   * other whether that figure is summed.
   */
  ok('the cheshta settings follow cheshta bala, in that order',
    order.slice(order.indexOf('cheshta-method'), order.indexOf('cheshta-method') + 5)
      .join(',') === 'cheshta-method,kendra-method,mean-source,luminary-rule,luminary-cheshta',
    order.slice(order.indexOf('cheshta-method')).join(', '));

  ok('and the ayana switch follows the declination it is built on',
    order[order.indexOf('kranti') + 1] === 'ayana-doubled' &&
    order.indexOf('ayana-constant') < order.indexOf('kranti'),
    order.slice(order.indexOf('ayana-constant'), order.indexOf('kranti') + 2).join(' then '));
})();

console.log('\nThe eight motions, as Sripatipaddhati names them');
/*
 * Translations of Parashara give eight names against 60, 30, 15, 30, 15, 7.5,
 * 45, 30 and leave "Sama", the ordinary middling motion, holding the smallest
 * figure in the set. Two earlier readings here tried to work around that: one
 * reassigned the values so strength climbed with speed, the other decided the
 * odd order was deliberate.
 *
 * Neither was needed. Sripatipaddhati - the text Mantreswara sends the reader
 * to at Phaladeepika IV.24, and the one Raman credits for the kendra - has the
 * same eight figures in the same order, and the fourth is Samagama,
 * conjunction with the Moon, which is not a speed. With a non-speed in that
 * slot the speed names shift by one, and Sama, which does not exist, inherits
 * the figure belonging to the state below it.
 */
(function () {
  var src = fs.readFileSync(path.join(root, 'js/shadbala.js'), 'utf8');
  var table = src.match(/var MOTION_VALUE = \{[^}]*\}/)[0].replace(/\s+/g, ' ');
  var TEXT = { vakra: 60, anuvakra: 30, vikala: 15, samagama: 30, manda: 15,
    mandatara: 7.5, seeghra: 45, seeghratara: 30 };
  ok('every motion takes the figure Sripati gives it',
    Object.keys(TEXT).every(function (k) {
      return new RegExp(k + ': ' + TEXT[k] + '\\b').test(table);
    }), table);
  ok('and no Sama is left, nor the names an earlier reading invented',
    !/\bsama:/.test(table) && !/madhya|sheeghra:|atisheeghra|chara:|atichara/.test(table));

  /*
   * The two sides of the mean motion, each split by whether the speed is still
   * rising. Slower and slowing is the weakest of the direct states; faster and
   * slowing is the strongest.
   */
  ok('the four direct states hang off the mean motion, not off a band',
    /var gaining = \(accel \|\| 0\) >= 0;/.test(src) &&
    /return speed < mean \? \(gaining \? 'manda' : 'mandatara'\)\s*\n\s*: \(gaining \? 'seeghratara' : 'seeghra'\);/
      .test(src));
  ok('and the trend comes from the ephemeris rather than being guessed',
    /accel: accel \|\| 0,/.test(fs.readFileSync(path.join(root, 'js/astro.js'), 'utf8')) &&
    /var before = norm180\(lonT - lonT0\) \/ 0\.5;/
      .test(fs.readFileSync(path.join(root, 'js/astro.js'), 'utf8')));

  /* Anuvakra is retrogression over a boundary, and nothing now mirrors it. */
  ok('Anuvakra is still a sign crossing',
    /return crossesSign\(longitude, speed\) \? 'anuvakra' : 'vakra';/.test(src));
})();


console.log('\nA figure the total leaves out says so on the cell');
/*
 * The luminaries' cheshta bala is shown and not summed, so anyone adding the
 * Sun's column will come up a rupa over the printed total. A table that does
 * not explain that is a table a reader stops trusting, so the cell carries the
 * reason and wears the soft ink the uncounted parts already use.
 */
(function () {
  var src = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  ok('the uncounted cheshta cells are marked from the engine, not guessed at',
    /if \(bala\.key === 'cheshta' && !x\.cheshtaCounted\) \{/.test(src) &&
    /td\.className = 'numeric not-counted';/.test(src));
  ok('and each says why the total leaves it out',
    /the total below does not include it/.test(src) &&
    /Raman leaves this row /.test(src) &&
    /belongs to the Ishta and Kashta computation/.test(src));

  /*
   * The reason has to hold under either rule above it. Naming the ayana or
   * paksha bala would only be true of the borrowed one, and under the default
   * the Sun's cheshta bala is not his ayana bala at all.
   */
  ok('and does so without assuming which rule is selected',
    !/his ayana bala' : 'her paksha bala/.test(src));
  ok('and the mark is visible rather than hover-only',
    /#shadbala-table td\.not-counted \{ color: var\(--ink-soft\); cursor: help; \}/
      .test(css));

  /*
   * The default is the reading that does not double count. Parashara's other
   * reading stays on offer, second.
   */
  var page = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  var sel = page.slice(page.indexOf('<select id="luminary-cheshta"'));
  sel = sel.slice(0, sel.indexOf('</select>'));
  ok('the setting defaults to leaving it out of the total',
    /<option value="omitted" selected>/.test(sel) &&
    /<option value="counted">/.test(sel) &&
    sel.indexOf('value="omitted"') < sel.indexOf('value="counted"'));
})();

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
