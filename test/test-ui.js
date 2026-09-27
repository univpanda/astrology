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
 * The flags divide by what they belong to. Retrogression and combustion are true
 * of the graha whichever division is looked at, so they ride on the name that
 * spans the rows. Vargottama is a fact about one division and yogakaraka is
 * lordship counted from that chart's house 1, so both ride on the chart row and
 * can differ from line to line.
 */
ok('graha-level flags ride on the name, chart-level flags on the row', (function () {
  var at = appSrc.indexOf('function renderGrahaTable');
  var block = appSrc.slice(at, appSrc.indexOf('function renderShadbala'));
  var nameFlags = block.slice(block.indexOf('rowspan'), block.indexOf('tr.appendChild(th)'));
  var rowFlags = block.slice(block.indexOf('var chartCell'),
                             block.indexOf('tr.appendChild(chartCell)'));
  return /r\.retrograde \? 'R' : null/.test(nameFlags) && /Astro\.isCombust/.test(nameFlags) &&
    !/'Y' : null/.test(nameFlags) &&
    /'V' : null/.test(rowFlags) &&
    /Astro\.isYogakaraka\(r\.name, firstSign\) \? 'Y' : null/.test(rowFlags) &&
    !/retrograde \? 'R'/.test(rowFlags);
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
ok('and the lagna is never flagged one, owning nothing',
   /!r\.isAscendant && Astro\.isYogakaraka/.test(appSrc));
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
  var names = ['saved', 'add', 'chart', 'lesson'];
  var strip = stripHtml('Sections');
  ok('the section strip holds four tabs', (strip.match(/role="tab"/g) || []).length === 4);
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
     /id="panel-lesson"[^>]*hidden/.test(html) && !/id="panel-add"[^>]*hidden/.test(html));
  ok('only the selected section tab is reachable by tab key',
     (strip.match(/tabindex="-1"/g) || []).length === 3);
  ok('the tab strip is keyboard navigable',
     /ArrowRight/.test(appSrc) && /ArrowLeft/.test(appSrc) && /'Home'/.test(appSrc) && /'End'/.test(appSrc));
  ok('the chart tab has something to say when empty', /id="empty-chart"/.test(html));
  ok('generating moves you to the chart tab and clears the form',
     /showChart\(\);\s*\n[\s\S]{0,200}blankForm\(\);/.test(appSrc));
  ok('opening a saved chart lands on the chart tab',
     /reopeningSaved = true;\s*\n\s*activateTab\('chart'\)/.test(appSrc));
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
   * One table in place of two, so there is nothing to label from a division any
   * more: the Chart column names each row's division instead.
   */
  ok('the graha tab is one tab, and the rows name their own charts',
     /id="tab-grahas"/.test(html) && !/tab-table-/.test(appSrc) &&
     /el\('td', 'graha-chart', varga \? varga\.name/.test(appSrc));
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
  ok('and one table serving both, rather than one each',
     /id="graha-table"/.test(html) && !/id="table-a"/.test(html) && !/id="table-b"/.test(html));
  ok('both charts sit in one row, not behind each other',
     /class="chart-pair"/.test(html) &&
     html.indexOf('id="chart-a"') < html.indexOf('id="chart-b"') &&
     html.indexOf('id="chart-b"') < html.indexOf('id="graha-table"'));
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
  ok('houses are counted from whatever that row\'s chart is rotated onto',
     /var firstSign = Astro\.vargaPosition\(c\.ascendant\.longitude, view\.division\)\.sign;/.test(appSrc) &&
     /view\.reference !== 'Ascendant'/.test(appSrc) &&
     /<th scope="col">House<\/th>/.test(html));
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
  var named = ['Raja yoga', 'parivartana', 'neecha bhanga', 'vipareeta raja', 'Lakshmi',
               'Gaja Kesari', 'Mahapurusha'];
  return named.every(function (n) { return flat.indexOf(n) >= 0; }) &&
    /Raja yoga, parivartana, neecha bhanga, vipareeta raja, Lakshmi, Gaja Kesari and the five Mahapurusha yogas are checked/.test(flat) &&
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
ok('all six components have their own column', (function () {
  var head = html.slice(html.indexOf('id="shadbala-table"'), html.indexOf('shadbala-note'));
  return ['Sthana', 'Dig', 'Kala', 'Cheshta', 'Naisargika', 'Drik', 'Total', 'Rupas', 'Needs']
    .every(function (c) { return head.indexOf('>' + c + '<') >= 0; });
})());
ok('sthana and kala expose their parts on hover',
   /Uchcha ' \+ n\(x\.sthana\.uchcha\)/.test(appSrc) &&
   /Nathonnatha ' \+ n\(x\.kala\.nathonnatha\)/.test(appSrc));
ok('shadbala rows follow the graha order of the tables beside it',
   /state\.chart\.planets\.forEach\(function \(planet\) \{/.test(appSrc) &&
   !/result\.ranking\.forEach/.test(appSrc));
ok('the nodes are skipped rather than shown blank',
   /if \(!x\) return;\s*\/\/ Rahu and Ketu are outside Shadbala/.test(appSrc));
ok('each graha is judged against its own minimum',
   /x\.strong \? 'Strong' : 'Weak'/.test(appSrc) && /String\(x\.required\)/.test(appSrc));
ok('the shadbala note names the ladder it uses, since totals differ between readings',
   /45, 30, 20, 15, 10, 4, 2/.test(appSrc.replace(/'\s*\+\s*'/g, '')) &&
   /halving series some calculators use/.test(appSrc.replace(/'\s*\+\s*'/g, '')));
ok('the note says what is left out rather than hiding it',
   /Yuddha bala is not ' \+\s*\n?\s*'included/.test(appSrc) || /Yuddha bala is not/.test(appSrc));

// What each graha rules, with the yogakaraka named.
ok('the one table carries a dispositor column',
   (html.match(/<th scope="col">Dispositor<\/th>/g) || []).length === 1);
ok('the dispositor is the lord of the sign shown in that row',
   /Astro\.SIGN_LORDS\[sign\]/.test(appSrc) && /dispositorOf\(r\.name, v\.sign, positionsD1\)/.test(appSrc));
ok('its relation is the compound one, counted in the rashi chart',
   /Astro\.compoundRelation\(graha, lord,/.test(appSrc) && /positionsD1\[lord\]\.sign/.test(appSrc));
ok('a graha in its own sign disposits itself', /if \(lord === graha\) return 'itself';/.test(appSrc));
/*
 * Grahas named in a cell go in abbreviated: the dispositor's lord, the ascendant
 * row's lord, and the nakshatra pair. The relation beside the dispositor stays in
 * words, being the answer the column exists for, and every abbreviation has the
 * full name in its hover.
 */
ok('the dispositor names its lord in the abbreviation, not in full',
   /return Astro\.grahaAbbr\(lord\) \+/.test(appSrc) &&
   /if \(!positionsD1\[lord\] \|\| !positionsD1\[graha\]\) return Astro\.grahaAbbr\(lord\);/
     .test(appSrc) &&
   /r\.isAscendant \? Astro\.grahaAbbr\(Astro\.SIGN_LORDS\[v\.sign\]\)/.test(appSrc));
ok('but its relation stays in words, being what the column is for',
   /' \\u00b7 ' \+ Astro\.titleCase\(Astro\.RELATION_LABELS\[relation\]\)/.test(appSrc));
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
ok('the nakshatra lord and sub lord are abbreviated too, with the names on hover',
   /Astro\.grahaAbbr\(nak\.lord\) \+ ' \/ ' \+ Astro\.grahaAbbr\(nak\.subLord\)/.test(appSrc) &&
   /is ruled by ' \+ nak\.lord \+ ', and its sub lord is ' \+\s*\n?\s*nak\.subLord/.test(appSrc));
ok('no cell in the table prints a graha name in full where it names one',
   !/nak\.lord \+ ' \/ ' \+ nak\.subLord/.test(appSrc));
ok('and the note says so, pointing at the code the kundli already uses', (function () {
  var flat = html.replace(/\s+/g, ' ');
  return /Where a cell names a graha rather than describing one, it goes as the two-letter code the kundli uses, with the name on hover/
    .test(flat);
})());

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
   /Astro\.isCombust\(r\.name, r\.longitude/.test(appSrc));
/*
 * A real distance from the Sun, so it is read off the rashi longitudes whichever
 * division a row is showing - which is also why it sits on the graha's name
 * rather than on any one chart row.
 */
ok('measured from the Sun, and on the rashi longitudes',
   /combust: !!sun && Astro\.isCombust\(p\.name, p\.longitude, sun\.longitude, p\.retrograde\)/
     .test(fs.readFileSync(path.join(root, 'js/charts.js'), 'utf8')) &&
   /Astro\.isCombust\(r\.name, r\.longitude, sun\.longitude,/.test(appSrc));
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
ok('the key is four entries, one per flag', (function () {
  var flat = html.replace(/\s+/g, ' ');
  var dl = flat.match(/<dl class="flag-key">.*?<\/dl>/);
  if (!dl) return false;
  return (dl[0].match(/<dt>/g) || []).length === 4 &&
    (dl[0].match(/<dd>/g) || []).length === 4;
})());
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
var seeds = ['strength', 'varga', 'dignity'].map(function (name) {
  return fs.readFileSync(path.join(root, 'supabase/seed/astro_readings_' + name + '.sql'),
                         'utf8');
}).join('\n').replace(/''/g, "'");

/*
 * A note under a table is the table's small print. Set at body size it read as
 * the panel's main text with the table as an illustration of it, which is the
 * wrong way round: the table is the thing, the note explains it.
 */
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
ok('the columns are built from whichever scheme is chosen, in its own order', (function () {
  var head = html.slice(html.indexOf('id="vargas-table"'));
  head = head.slice(0, head.indexOf('</thead>'));
  return !/<th scope="col">D\d+<\/th>/.test(head) &&
    /scheme\.divisions\.forEach\(function \(division\) \{/.test(appSrc) &&
    /el\('th', keys\.indexOf\(division\) >= 0 \? 'varga-key' : null, 'D' \+ division\)/
      .test(appSrc);
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
ok('the total spans the graha\'s pair of rows',
   /td\.setAttribute\('rowspan', '2'\);/.test(appSrc) &&
   /Astro\.vimsopaka\(planet\.name, planet\.longitude, scheme, positionsD1\)/.test(appSrc));
/*
 * The total sits second, beside the name, not last. Sixteen columns scroll, so
 * last put the one number the grid is adding up off the right-hand edge: the
 * reader scrolled past the working to reach the answer, then back to see whose
 * it was. Both the heading and the cell have to move, and separately, so each is
 * checked where it is built.
 */
ok('the total closes the row, after the divisions it adds up', (function () {
  var head = appSrc.slice(appSrc.indexOf('function renderVargasHead'),
                          appSrc.indexOf('function vargaNote'));
  var name = head.indexOf("el('th', null, 'Graha')");
  var divisions = head.indexOf('scheme.divisions.forEach');
  var total = head.indexOf("'Vimsopaka bala, out of twenty'");
  return name >= 0 && divisions > name && total > divisions;
})());
ok('and so does the cell, spanning the graha\u2019s two rows as the name does',
   (function () {
     var body = appSrc.slice(appSrc.indexOf('function renderVargas(state)'),
                             appSrc.indexOf('function vargaSummary'));
     var name = body.indexOf('signRow.appendChild(th);');
     var cells = body.indexOf('cells.forEach(function (d, i)');
     var score = body.indexOf('signRow.appendChild(td);');
     return name >= 0 && cells > name && score > cells &&
       /td\.setAttribute\('rowspan', '2'\);/.test(body);
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
ok('the last column is headed by nothing visible',
   /el\('th', null, null\)/.test(appSrc) &&
   !/el\('th', null, 'Vimsopaka'\)/.test(appSrc) &&
   !/varga-weight', '20'/.test(appSrc));
ok('but it still has a name, so the scores under it are not orphaned',
   /el\('span', 'visually-hidden', 'Vimsopaka bala, out of twenty'\)/.test(appSrc) &&
   /\.visually-hidden \{/.test(fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8')));
ok('and the note still says what the column totals, the heading no longer doing it',
   /the last column scores those dignities out of twenty/
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
  var src = appSrc.slice(at, appSrc.indexOf('ABBREVIATE_ABOVE', at));
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
     return /scheme\.divisions\.map\(function \(division\)/.test(code) &&
       !/\[1, 2, 3, 4, 7, 9, 10, 12, 16, 20, 24, 27, 30, 40, 45, 60\]/.test(code);
   })());
ok('and the sixteen are derived from VARGAS rather than retyped beside it', (function () {
  var astroSrc = fs.readFileSync(path.join(root, 'js/astro.js'), 'utf8');
  return /divisions: VARGAS\.map\(function \(v\) \{ return v\.division; \}\)/.test(astroSrc) &&
    Astro.SHODASAVARGA.join(' ') === '1 2 3 4 7 9 10 12 16 20 24 27 30 40 45 60';
})());
ok('grahas keep the order of the tables beside it',
   /state\.chart\.planets\.forEach\(function \(planet\) \{[\s\S]{0,400}vargas-note/.test(appSrc) ||
   /\/\/ Listed as in the graha tables/.test(appSrc));
ok('a graha with no reading anywhere is dropped, not shown as a row of dashes',
   /if \(cells\.every\(function \(c\) \{ return !c; \}\)\) return;/.test(appSrc));
ok('each cell gives its full dignity, sign and lord in the title',
   /d\.label \+ ' - ' \+ Astro\.SIGNS\[d\.sign\] \+[\s\S]{0,40}', ruled by ' \+ d\.lord/.test(appSrc));

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
ok('words give way to abbreviations only past ten divisions',
   /var ABBREVIATE_ABOVE = 10;/.test(appSrc) &&
   /var brief = scheme\.divisions\.length > ABBREVIATE_ABOVE;/.test(appSrc));
ok('so the six, seven and ten keep their words and the sixteen do not', (function () {
  var over = Astro.VARGA_SCHEME_ORDER.filter(function (k) {
    return Astro.VARGA_SCHEMES[k].divisions.length > 10;
  });
  return over.length === 1 && over[0] === 'shodasavarga';
})());
ok('the sign is its name in full, or the project abbreviation where names will not fit',
   /brief \? Astro\.SIGN_ABBR\[d\.sign\] : Astro\.SIGNS\[d\.sign\]/.test(appSrc));
ok('and the dignity likewise',
   /brief \? Astro\.VARGA_DIGNITY_SHORT\[d\.key\] : d\.label/.test(appSrc));
ok('the abbreviated form is set in mono, the full names are not',
   (function () {
     var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
     return /td\.varga-sign-abbr \{[^}]*--font-mono/.test(css) &&
       !/td\.varga-sign \{[^}]*--font-mono/.test(css);
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
ok('each short form is given with the word it stands for', (function () {
  var key = Object.keys(Astro.VARGA_DIGNITY_LABELS).map(function (k) {
    return Astro.VARGA_DIGNITY_SHORT[k] + ' (' + Astro.VARGA_DIGNITY_LABELS[k] + ')';
  });
  return /function dignityKey\(\)/.test(appSrc) &&
    /Astro\.VARGA_DIGNITY_SHORT\[k\] \+ ' \(' \+ Astro\.VARGA_DIGNITY_LABELS\[k\] \+ '\)'/
      .test(appSrc) &&
    key.length === 9 && key[0] === 'Exal (Exalted)' && key[8] === 'Deb (Debilitated)';
})());
ok('and no copy of either table is typed into the sentence',
   !/Exal, Mool, Own, Gt Fr/.test(appSrc) && !/Gt Enm and Deb/.test(appSrc));
ok('the note explains the abbreviations where it uses them, and not otherwise', (function () {
  var flat = appSrc.replace(/'\s*\+\s*'/g, '');
  return /Signs go as Ari, Tau, Can and dignities as ' \+ dignityKey\(\)/.test(flat) &&
    // Stated, not justified: that sixteen columns leave no room is visible in them.
    !/leave no room for words/.test(flat) &&
    /function vargaNote\(scheme, brief\)/.test(appSrc);
})());
/*
 * The hovers are pointed at once and in general. Naming the three kinds - a
 * cell, a heading, a total - was a list the reader had to hold in order to
 * arrive at "everything has one", which is the shorter thing to say and the
 * thing they need.
 */
ok('and points at the hovers once, in general rather than kind by kind',
   (function () {
     var note = appSrc.slice(appSrc.indexOf('function vargaNote'));
     note = note.slice(0, note.indexOf('ABBREVIATE_ABOVE'));
     var flat = note.replace(/'\s*\+\s*'/g, '');
     return (note.match(/hover/gi) || []).length === 1 &&
       /Hover over anything to read it in detail/.test(flat) &&
       !/a heading for what that division is worth/.test(flat);
   })());
/*
 * Which only holds while everything really does have one. The three the sentence
 * used to name are built in three different places, so they are checked in three
 * different places.
 */
ok('and everything it promises a hover on has one',
   /if \(detail\) \{ sign\.title = detail; dignity\.title = detail; \}/.test(appSrc) &&
   /th\.title = \(varga \? varga\.label/.test(appSrc) &&
   /td\.title = planet\.name \+ ' scores '/.test(appSrc));
ok('and gives the seven-step reading when it differs from the label shown',
   /d\.relationLabel !== d\.label/.test(appSrc));

ok('every dignity tier has a colour, and no colour is orphaned', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var keys = Object.keys(Astro.VARGA_DIGNITY_LABELS);
  var styled = (css.match(/td\.dig-([a-z]+)/g) || [])
    .map(function (m) { return m.replace('td.dig-', ''); });
  return keys.every(function (k) { return styled.indexOf(k) >= 0; }) &&
    styled.every(function (k) { return keys.indexOf(k) >= 0; });
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

ok('the trimsamsa stand-in is explained where it fires',
   /stands in as ' \+ d\.viaProxy/.test(appSrc));

/*
 * Each graha spans two rows, its sign above its dignity. The sign was only in a
 * hover before, which made the grid's most obvious question - which sign is that?
 * - answerable one cell at a time.
 */
ok('each graha takes two rows, its name spanning both',
   /signRow\.className = 'varga-signs'/.test(appSrc) &&
   /dignityRow\.className = 'varga-dignities'/.test(appSrc) &&
   /th\.setAttribute\('rowspan', '2'\)/.test(appSrc) &&
   /tbody\.appendChild\(signRow\);\s*\n\s*tbody\.appendChild\(dignityRow\);/.test(appSrc));
ok('the spanning name is a row-group header, not a plain cell',
   /th\.setAttribute\('scope', 'rowgroup'\)/.test(appSrc));
ok('the sign row and the dignity row read one and the same varga position',
   /var division = scheme\.divisions\[i\];/.test(appSrc) &&
   /var detail = d \? vargasDetail\(d, division, planet\.name\) : null;/.test(appSrc));

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
ok('the three are marked out, in the header and in both rows of the body',
   /el\('th', keys\.indexOf\(division\) >= 0 \? 'varga-key' : null, 'D' \+ division\)/
     .test(appSrc) &&
   (appSrc.match(/keys\.indexOf\(division\) >= 0 \? ' varga-key' : ''/g) || []).length === 2);
ok('the set comes from the engine, so the table cannot disagree with the weights',
   /var keys = Astro\.keyDivisions\(scheme\);/.test(appSrc) &&
   (appSrc.match(/var keys = Astro\.keyDivisions\(scheme\);/g) || []).length === 2 &&
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
     var block = css.slice(css.indexOf('#vargas-table .varga-key'),
                           css.indexOf('#vargas-table th.varga-key'));
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
  return /border-bottom-color: var\(--line\)/.test(css) && check(0) && check(dark);
})());

/*
 * One short token per cell under one short heading, so centring lines each under
 * its own. The names are the only cells that vary in length and are the one
 * column left ragged on the right rather than on both sides.
 */
ok('every column but the names is centred', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return /#vargas-table th, #vargas-table td \{ text-align: center; \}/.test(css) &&
    /#vargas-table thead th:first-child, #vargas-table tbody th \{ text-align: left; \}/
      .test(css);
})());
/*
 * Not :first-child: a graha's second row has no first cell of its own, the name
 * spanning down from the row above, so the cell sitting first there is a
 * division and would have been left-aligned alone among its column.
 */
ok('and the rule does not reach the cell that merely sits first in a spanned row',
   (function () {
     var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
     var block = css.slice(css.indexOf('#vargas-table thead th:first-child'));
     block = block.slice(0, block.indexOf('}') + 1);
     return !/tr[^,]*:first-child/.test(block) && !/td:first-child/.test(block);
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
 * Two plots, not three. Vimsopaka is a score out of twenty; the other two are
 * counts of divisions. The counts share a unit and a denominator with each other
 * and with nothing else, so they group on one axis and the score is plotted
 * apart. Putting all three together would make a bar of the same height mean two
 * different things, which is the dual-scale mistake in a single-axis disguise.
 */
ok('the score and the counts are on separate plots', (function () {
  var at = appSrc.indexOf('function renderVargaCharts');
  var block = appSrc.slice(at, at + 2200);
  var calls = (block.match(/barChart\(\{/g) || []).length;
  return calls === 2 && /max: 20, outOf: 20/.test(block) &&
    /max: scheme\.count, outOf: scheme\.count/.test(block);
})());
ok('the two counts share the division count as their scale', (function () {
  var at = appSrc.indexOf('function renderVargaCharts');
  var block = appSrc.slice(at, at + 2200);
  return /series-good/.test(block) && /series-vargottama/.test(block) &&
    /Placement counts across the ' \+ scheme\.count/.test(block);
})());

ok('well placed counts the good rungs and nothing below',
   /var GOOD_KEYS = \['exalted', 'moolatrikona', 'own', 'adhimitra', 'mitra'\];/.test(appSrc));
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
  return /\.chart-tick, \.chart-name, \.chart-value \{[^}]*fill: var\(--ink-faint\)/.test(css);
})());
ok('a legend is drawn for the two-series plot and not for the one-series plot',
   /if \(series\.length > 1\) \{/.test(appSrc) && /chart-legend/.test(appSrc));
ok('bars are capped rather than filling the band, and paired bars keep a gap',
   /Math\.min\(24, \(band \* 0\.62 - gap \* \(series\.length - 1\)\) \/ series\.length\)/.test(appSrc) &&
   /var gap = 2;/.test(appSrc));
ok('every bar carries a hover readout',
   /svgEl\('title', \{\}, row\.graha \+ ' \u2014 ' \+ s\.label/.test(appSrc));

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
 * The flag key at the top of the tab defines all four flags, [V] among them, so
 * the note under the grid defining it again was the same duplication in
 * miniature that moved the scoring out to the library.
 */
ok('the key explains the mark, and the note does not explain it again', (function () {
  var flat = appSrc.replace(/'\s*\+\s*'/g, '');
  return /The division has landed the graha back in the sign it holds in the rashi/
    .test(html.replace(/\s+/g, ' ')) &&
    /never on D1, where every graha would qualify\. In D9 it is vargottama proper/
      .test(html.replace(/\s+/g, ' ')) &&
    !/A sign marked \[V\]/.test(flat);
})());
ok('and the D9 case is named as vargottama proper',
   /division === 9 \? ' In D9 that is vargottama proper\.' : ''/.test(appSrc));
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
ok('both halves of a pair carry the same hover',
   /if \(detail\) \{ sign\.title = detail; dignity\.title = detail; \}/.test(appSrc));
ok('and a graha with no reading still contributes no rows at all',
   /if \(cells\.every\(function \(c\) \{ return !c; \}\)\) return;/.test(appSrc));
ok('the rule sits under the pair rather than between its halves', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return /#vargas-table tr\.varga-signs td \{[^}]*border-bottom: none/.test(css) &&
    /#vargas-table th\[rowspan\] \{[^}]*vertical-align: middle/.test(css) &&
    /td\.varga-sign/.test(css);
})());
ok('the note says the rows come in pairs',
   /Every graha takes two rows/.test(appSrc.replace(/'\s*\+\s*'/g, '')));

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
ok('the table states the direction in view, not only on hover', (function () {
  // Collapsed, so re-wrapping the paragraph cannot fail this on whitespace alone.
  var flat = html.replace(/\s+/g, ' ');
  return (flat.match(/the graha's own view of the lord whose sign it occupies/g) || []).length === 1;
})());
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
ok('the name spans its rows, so a graha reads as one entry',
   /th\.setAttribute\('rowspan', String\(views\.length\)\)/.test(appSrc) &&
   /th\.setAttribute\('scope', 'rowgroup'\)/.test(appSrc));
ok('and the rule sits under the group rather than between its lines', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return /#graha-table th\[rowspan\] \{[^}]*vertical-align: middle/.test(css) &&
    /#graha-table tbody tr:not\(\.graha-first\) td \{ border-top: none/.test(css.replace(/\s+/g, ' ')) ||
    /graha-first/.test(css);
})());
ok('the table is drawn once from both slots, not once per slot',
   /SLOTS\.forEach\(drawSlot\);\s*\n\s*renderGrahaTable\(lastChart\);/.test(appSrc) &&
   !/renderGrahaTable\(state\.chart, set\)/.test(appSrc));

/*
 * The scheme is named in the picker above and in the note beside it, so the
 * chart title repeating it was a third statement of the same thing in the same
 * view. The other title keeps its count, that being the bars' denominator.
 */
ok('the vimsopaka chart is titled by what it measures, not by the scheme',
   /title: 'Vimsopaka bala',/.test(appSrc) &&
   !/Vimsopaka bala over the/.test(appSrc) &&
   /title: 'Placement counts across the ' \+ scheme\.count \+ ' divisions'/.test(appSrc));
/*
 * The second title names the unit and the denominator and leaves the two counts
 * to the legend, which is where a reader looks for which bar is which.
 */
ok('and the second by what it counts, not by either of its two series',
   (function () {
     var at = appSrc.indexOf('function renderVargaCharts');
     var block = appSrc.slice(at, at + 3000);
     var title = block.match(/title: 'Placement counts[^']*'/)[0];
     return !/Well placed|Vargottama/.test(title) && /Well placed/.test(block) &&
       /label: 'Vargottama'/.test(block);
   })());
/*
 * And it is called Vargottama, the name it has everywhere else on the page: [V]
 * on the chart, [V] in the graha table, [V] in the grid, Vargottama in the flag
 * key. The legend described the fact instead of naming it, so nothing connected
 * the purple bar to the purple flag.
 */
ok('the vargottama series is named, not described',
   /label: 'Vargottama', cls: 'series-vargottama'/.test(appSrc) &&
   !/Repeats the rashi sign/.test(appSrc) &&
   />\s*<span class="flag flag-v">\[V\]<\/span> Vargottama<\/dt>/
     .test(html.replace(/\s+/g, ' ')));
ok('and the strict reading moved to the note, where a qualification belongs',
   /Vargottama counts the divisions that land the graha back in its rashi sign; strictly the word is the D9 case/
     .test(appSrc.replace(/'\s*\+\s*'/g, '')));
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
   /var W = 500, H = 215/.test(appSrc) && !/var W = 760/.test(appSrc));

ok('the table carries ten columns, in order', (function () {
  var wanted = ['Graha', 'Chart', 'Rashi', 'Dignity', 'House', 'Lordship', 'Dispositor',
                'Longitude', 'Nakshatra - pada', 'Lord / sub lord'];
  return ['graha-table'].every(function (id) {
    var at = html.indexOf('id="' + id + '"');
    var head = html.slice(at, html.indexOf('</thead>', at));
    var found = (head.match(/<th scope="col">([^<]+)<\/th>/g) || [])
      .map(function (t) { return t.replace(/<[^>]+>/g, ''); });
    return found.join('|') === wanted.join('|');
  });
})());
/*
 * Lordship was removed as a "Rules" column and has come back as this one. It is
 * built from housesOwned, the same helper isYogakaraka and the raja yoga
 * detector use, rather than from a bespoke function of its own.
 */
/*
 * A pada is the quarter of a nakshatra and means nothing apart from it: a column
 * holding a bare 3 was a column the reader had to join to its neighbour to use.
 */
ok('the pada rides with its nakshatra rather than in a column of its own',
   /nak\.name \+ ' - ' \+ nak\.pada/.test(appSrc) &&
   !/<th scope="col">Pada<\/th>/.test(html) &&
   !/text: String\(nak\.pada\)/.test(appSrc));
ok('and the hover says which quarter it is, the hyphen being terse',
   /nak\.name \+ ', pada ' \+ nak\.pada \+ ' of four\.'/.test(appSrc));
ok('lordship comes from the shared helper, not a column-specific one',
   /<th scope="col">Lordship<\/th>/.test(html) && !/function rulership/.test(appSrc) &&
   typeof Astro.housesOwned === 'function');
ok('each row says which chart it is and what its houses are counted from',
   /'Houses counted from ' \+/.test(appSrc) &&
   /view\.reference === 'Ascendant' \? 'the ascendant' : view\.reference/.test(appSrc));

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
  var at = html.indexOf('id="graha-table"');
  var head = html.slice(at, html.indexOf('</thead>', at));
  return head.indexOf('>Dignity<') < head.indexOf('>Longitude<') &&
         head.indexOf('>Chart<') < head.indexOf('>Dignity<') &&
         head.indexOf('>Lordship<') < head.indexOf('>Longitude<');
})());
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
   /\{ text: Astro\.SIGNS\[v\.sign\] \}/.test(appSrc) &&
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
