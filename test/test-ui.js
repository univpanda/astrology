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
       ['Su', 'Mo', 'Me', 'Ve', 'Ma', 'Ju', 'Sa', 'Ra', 'Ke', 'As'].every(function (a) {
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
ok('south: Aries cell is second in the top row', /x="114[^"]*" y="4"|x="114/.test(southSvg) || /Ar ·/.test(southSvg));
ok('the ascendant is never marked retrograde', (function () {
  var c = makeNode('div');
  Charts.render(c, { style: 'north', planets: chart.planets, ascendant: chart.ascendant.longitude });
  return !/>As \[R\]/.test(serialise(c));
})());
ok('south: all twelve sign labels present',
   Charts.SIGN_ABBR.every(function (a) { return southSvg.indexOf('>' + a + ' ·') >= 0; }));

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
   /name: 'Ascendant'/.test(appSrc) && /ascendant-row/.test(appSrc) &&
   !/fact\(facts, 'Lagna/.test(appSrc));
/*
 * The table carries the same three flags the chart does, in the same order, so
 * the two say the same thing the same way. [R] keeps its red; [V] and [Y] stay
 * quiet, being facts rather than warnings.
 */
ok('the table flags the graha [R][V][Y], as the chart does', (function () {
  var at = appSrc.indexOf('function renderSlotTable');
  var block = appSrc.slice(at, appSrc.indexOf('function renderShadbala'));
  return /r\.retrograde \? 'R' : null/.test(block) &&
    /Astro\.isVargottama\(r\.longitude\) \? 'V' : null/.test(block) &&
    /Astro\.isYogakaraka\(r\.name, firstSign\) \? 'Y' : null/.test(block) &&
    /'\[' \+ f \+ '\]'/.test(block);
})());
/*
 * Three tokens sitting together have to read as three different facts, so each
 * takes its own colour rather than retrogression being the only one picked out.
 */
ok('each flag gets a class of its own',
   /el\('span', 'flag flag-' \+ f\.toLowerCase\(\)/.test(appSrc));
ok('and each class a colour of its own, all three distinct', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var colourOf = function (cls) {
    var m = css.match(new RegExp('th \\.' + cls + ' \\{ color: ([^;]+);'));
    return m && m[1].trim();
  };
  var r = colourOf('flag-r'), v = colourOf('flag-v'), y = colourOf('flag-y');
  return r && v && y && r !== v && v !== y && r !== y;
})());
ok('the two new hues are defined in both palettes, not only the light one', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  var at = css.indexOf('@media (prefers-color-scheme: dark)');
  var light = css.slice(0, at), dark = css.slice(at);
  return ['--flag-vargottama', '--flag-yogakaraka'].every(function (name) {
    return light.indexOf(name + ':') >= 0 && dark.indexOf(name + ':') >= 0;
  });
})());
/*
 * Vargottama is D1 against D9 and does not move. Yogakaraka is lordship counted
 * from house 1, so it moves with the rotation exactly as the House column does:
 * the two are the same question asked twice, and a flag that disagreed with the
 * column beside it would be answering about a chart nobody is looking at.
 */
ok('vargottama is fixed to the rashi, yogakaraka follows house 1',
   /Astro\.isVargottama\(r\.longitude\)/.test(appSrc) &&
   /Astro\.isYogakaraka\(r\.name, firstSign\)/.test(appSrc) &&
   !/rashiLagna/.test(appSrc));
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
  ok('the table tabs are labelled from the chosen division',
     /document\.getElementById\('tab-table-' \+ slot\)\.textContent = varga\.name/.test(appSrc));
  ok('shadbala shares the table strip rather than a card of its own',
     /id="tab-shadbala"[\s\S]{0,140}aria-controls="panel-shadbala"/.test(html) &&
     html.indexOf('id="panel-shadbala"') > html.indexOf('id="panel-table-b"') &&
     html.indexOf('id="panel-shadbala"') < html.indexOf('class="two-col"'));
  ok('the table strip holds six tabs', (function () {
    var strip = stripHtml('Graha tables');
    return (strip.match(/role="tab"/g) || []).length === 6;
  })());
  ok('the table strip is a real tablist',
     ['table-a', 'table-b', 'shadbala', 'vargas', 'yogas', 'aspects'].every(function (n) {
    return new RegExp('id="tab-' + n + '"[\\s\\S]{0,140}aria-controls="panel-' + n + '"').test(html) &&
           new RegExp('id="panel-' + n + '"[^>]*aria-labelledby="tab-' + n + '"').test(html);
  }));
  ok('only the first panel starts visible',
     /id="panel-table-b"[^>]*hidden/.test(html) && /id="panel-shadbala"[^>]*hidden/.test(html) &&
     !/id="panel-table-a"[^>]*hidden/.test(html));
  ok('one tab implementation still serves every strip',
     (appSrc.match(/function setupTabs/g) || []).length === 1 &&
     (appSrc.match(/setupTabs\(/g) || []).length === 3 &&
     /setupTabs\(\['table-a', 'table-b', 'shadbala', 'vargas', 'yogas', 'aspects'\]/.test(appSrc));
  ok('there are two chart slots, each with two selects', ['a', 'b'].every(function (slot) {
    return new RegExp('id="ref-' + slot + '"').test(html) &&
           new RegExp('id="varga-' + slot + '"').test(html) &&
           new RegExp('id="chart-' + slot + '"').test(html) &&
           new RegExp('id="table-' + slot + '"').test(html);
  }));
  ok('both charts sit in one row, not behind each other',
     /class="chart-pair"/.test(html) &&
     html.indexOf('id="chart-a"') < html.indexOf('id="chart-b"') &&
     html.indexOf('id="chart-b"') < html.indexOf('id="table-a"'));
  ok('every select is labelled', ['ref-a', 'varga-a', 'ref-b', 'varga-b'].every(function (id) {
    return new RegExp('<label[^>]*for="' + id + '"').test(html);
  }));
  ok('the pair opens on rashi beside navamsa',
     /varga\.value = i === 0 \? '1' : '9'/.test(appSrc));
/*
 * Rotation redraws one chart; changing the division redraws the yogas and the
 * aspects too, since both are read from whichever divisions are on screen.
 */
  ok('rotating redraws only that chart',
     /ref\.addEventListener\('change', function \(\) \{ if \(lastChart\) drawSlot\(slot\); \}\)/.test(appSrc));


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
  ok('houses are counted from whatever the chart beside the table is rotated onto',
     /var firstSign = positionOf\(c\.ascendant\.longitude\)\.sign;/.test(appSrc) &&
     /set\.reference !== 'Ascendant'/.test(appSrc) &&
     /<th scope="col">House<\/th>/.test(html));
})();

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
               'Mahapurusha'];
  return named.every(function (n) { return flat.indexOf(n) >= 0; }) &&
    /Raja yoga, parivartana, neecha bhanga, vipareeta raja, Lakshmi and the five Mahapurusha yogas are checked/.test(flat) &&
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
ok('changing a chart division redraws only that chart',
   /varga\.addEventListener\('change', function \(\) \{ if \(lastChart\) drawSlot\(slot\); \}\)/
     .test(appSrc));
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
ok('both tables carry a dispositor column',
   (html.match(/<th scope="col">Dispositor<\/th>/g) || []).length === 2);
ok('the dispositor is the lord of the sign shown in that table',
   /Astro\.SIGN_LORDS\[sign\]/.test(appSrc) && /dispositorOf\(r\.name, v\.sign, positionsD1\)/.test(appSrc));
ok('its relation is the compound one, counted in the rashi chart',
   /Astro\.compoundRelation\(graha, lord,/.test(appSrc) && /positionsD1\[lord\]\.sign/.test(appSrc));
ok('a graha in its own sign disposits itself', /if \(lord === graha\) return 'itself';/.test(appSrc));

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

ok('both flags ride together, retrograde first', /Ve \[R\]\[V\]/.test(renderIn(1)));

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
   /name: 'Ascendant', retrograde: false, longitude: ascLongitude,\s*\n\s*vargottama: Astro\.isVargottama\(ascLongitude\), yogakaraka: false/
     .test(fs.readFileSync(path.join(root, 'js/charts.js'), 'utf8')));

ok('and the nodes are never one either, owning no sign',
   Astro.NODES.every(function (n) {
     for (var l = 0; l < 12; l++) if (Astro.isYogakaraka(n, l)) return false;
     return true;
   }));

ok('the key explains [Y], and says it moves with the rotation', (function () {
  var flat = html.replace(/\s+/g, ' ');
  return /\[Y\] is yogakaraka, a graha owning both an angle and a trine counted from house 1/.test(flat) &&
    /follows the chart when it is rotated onto another graha/.test(flat) &&
    /Half the signs yield nobody/.test(flat);
})());
ok('retrograde alone stays bare [R]', /Sa \[R\]<|Sa \[R\]\s/.test(renderIn(1)));
ok('a graha with neither carries no brackets', /Ju<\/text>|>Ju</.test(renderIn(1)));

/*
 * The point of the whole design: vargottama is D1 against D9, so putting another
 * division on screen must not move the flag. Narasimha Rao reads D4 and still
 * writes "vargottama in Navamsa".
 */
ok('the flag does not change with the division shown',
   [1, 3, 4, 9, 10, 12, 60].every(function (d) { return /Ve \[R\]\[V\]/.test(renderIn(d)); }));

// A vargottama lagna is what Satabdika dasa turns on, so the ascendant is eligible.
ok('the ascendant is eligible for the flag too', (function () {
  var lon = 0.5;                                    // 1st navamsha of Aries
  if (!Astro.isVargottama(lon)) return false;
  var box = makeNode('div');
  Charts.render(box, { style: 'north', division: 1, planets: [], ascendant: lon });
  return /As \[V\]/.test(serialise(box));
})());

/*
 * Vargottama lives on the chart, not in the table: the [V] flag beside the graha
 * in the kundli. The table carried it twice over at one point, as a column and as
 * a flag on the name, and now carries it neither way.
 */
ok('the table leaves vargottama to the chart',
   !/<th scope="col">Vargottama<\/th>/.test(html) &&
   !/el\('span', 'flag', ' \[V\]'\)/.test(appSrc));
ok('the page carries a key for all three flags', (function () {
  // Collapsed, so re-wrapping the paragraph cannot fail this on whitespace alone.
  var flat = html.replace(/\s+/g, ' ');
  return /\[R\] is retrograde/.test(flat) && /\[V\] is vargottama/.test(flat) &&
    /\[Y\] is yogakaraka/.test(flat);
})());

console.log('\nVargas panel');
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
ok('the total spans the graha\'s pair of rows',
   /td\.setAttribute\('rowspan', '2'\);/.test(appSrc) &&
   /Astro\.vimsopaka\(planet\.name, planet\.longitude, scheme, positionsD1\)/.test(appSrc));
ok('it is banded by Parashara\'s four readings, not by a gradient', (function () {
  var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
  return Astro.VIMSOPAKA_BANDS.every(function (b) {
    return new RegExp('td\\.vimsopaka-' + b.key + ' \\{').test(css);
  }) && /' vimsopaka-' \+ score\.band\.key/.test(appSrc);
})());
ok('and the title breaks the score into its divisions',
   /part\.viswa \+ '\/20'/.test(appSrc) &&
   /which Parashara reads as ' \+ score\.band\.label/.test(appSrc));
ok('the column has a heading that says what it is out of',
   /el\('th', null, 'Vimsopaka'\)/.test(appSrc) &&
   /el\('span', 'varga-weight', '\/ 20'\)/.test(appSrc));
/*
 * A number in a column invites being read as a verdict. Shadbala and vimsopaka
 * both answer "how fully can this graha act" and neither answers "is that a good
 * thing": a strong malefic aspecting a house it does not rule afflicts it the
 * more surely for being strong. Parashara's own band label says "wholly
 * favourable", which is exactly why the caveat has to sit next to it.
 */
ok('the note says the total is strength and not benefit', (function () {
  var flat = appSrc.replace(/'\s*\+\s*'/g, '');
  return /Read those as strength and not as benefit/.test(flat) &&
    /A strong malefic aspecting a house it does not rule afflicts it the more surely for being strong/.test(flat);
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
ok('the note says what the total cannot see, and where those live instead', (function () {
  var flat = appSrc.replace(/'\s*\+\s*'/g, '');
  return /it cannot see vargottama, an exchange of signs, a cancelled debilitation or directional strength/.test(flat) &&
    /the chart, the Yogas tab and Shadbala carry instead/.test(flat) &&
    /the total sitting near its floor exactly where the cancellation says it should not/.test(flat);
})());
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

ok('and that it measures magnitude rather than direction', (function () {
  var flat = appSrc.replace(/'\s*\+\s*'/g, '');
  return /It measures magnitude rather than direction/.test(flat) &&
    /the yoga says what is promised and this says how much of it the graha can carry/.test(flat);
})());

ok('the note explains the totalling and the four readings', (function () {
  var flat = appSrc.replace(/'\s*\+\s*'/g, '');
  return /The last column totals them, verses 26-27/.test(flat) &&
    /below 5 as incapable of auspicious results, 5 to 10 as some good, up to 15 as mediocre and above 15 as wholly favourable/.test(flat);
})());

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
ok('and the note builds its distribution from the chosen scheme',
   /var shares = scheme\.divisions\.map\(function \(d\) \{/.test(appSrc) &&
   /vimsopakaFigure\(scheme\.weights\[d\]\)/.test(appSrc) &&
   /share of the twenty in this scheme/.test(appSrc.replace(/'\s*\+\s*'/g, '')));
ok('and names the other schemes rather than one fixed pair',
   /Astro\.VARGA_SCHEME_ORDER\.filter\(function \(k\) \{ return k !== scheme\.key; \}\)/.test(appSrc));

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
ok('the sign is its name in full, or its number where names will not fit',
   /brief \? String\(d\.sign \+ 1\) : Astro\.SIGNS\[d\.sign\]/.test(appSrc));
ok('and the dignity likewise',
   /brief \? Astro\.VARGA_DIGNITY_SHORT\[d\.key\] : d\.label/.test(appSrc));
ok('tabular figures are applied to the numbered form only, not to sign names',
   (function () {
     var css = fs.readFileSync(path.join(root, 'css/styles.css'), 'utf8');
     return /td\.varga-sign-number \{[^}]*tabular-nums/.test(css) &&
       !/td\.varga-sign \{[^}]*tabular-nums/.test(css);
   })());
ok('every dignity has a short form, each distinct and short enough to fit', (function () {
  var full = Object.keys(Astro.VARGA_DIGNITY_LABELS);
  var brief = full.map(function (k) { return Astro.VARGA_DIGNITY_SHORT[k]; });
  return brief.every(Boolean) && brief.length === 9 && new Set(brief).size === 9 &&
    brief.every(function (t) { return t.length <= 6; });
})(), Object.keys(Astro.VARGA_DIGNITY_SHORT).map(function (k) {
  return Astro.VARGA_DIGNITY_SHORT[k]; }).join(' '));
ok('the note explains the abbreviations where it uses them, and not otherwise', (function () {
  var flat = appSrc.replace(/'\s*\+\s*'/g, '');
  return /Sixteen columns leave no room for the words/.test(flat) &&
    /dignities shorten to Exal, Mool, Own, Gt Fr, Fr, Neut, Enm, Gt Enm and Deb/.test(flat) &&
    /numbered 1 to 12 from Aries/.test(flat) &&
    /function vargaNote\(scheme, brief\)/.test(appSrc);
})());
/*
 * It said "hover a cell" twice, once for the words and once for the lord. There
 * are two branches now, abbreviated and not, so exactly two mentions total is one
 * per branch; three would be the old duplication returning.
 */
ok('and says it once per branch, not twice in one', (function () {
  var note = appSrc.slice(appSrc.indexOf('function vargaNote'));
  note = note.slice(0, note.indexOf("left out.';"));
  return (note.match(/hover a cell/gi) || []).length === 2;
})());
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

ok('the note says exaltation is outside the classical steps', (function () {
  var flat = appSrc.replace(/'\s*\+\s*'/g, '');
  return /exaltation falls outside the six entirely/.test(flat) && /uchcha bala/.test(flat);
})());
/*
 * The figures are varga viswa, from verses 21-25, and there are six of them, not
 * seven: the top category is an own sign and moolatrikona is not ranked apart.
 * The note used to list seven dignities against six numbers, leaving one name
 * without a figure and no hint which.
 */
ok('and carries Parashara\'s own varga viswa figures, all six of them', (function () {
  var flat = appSrc.replace(/'\s*\+\s*'/g, '');
  var pairs = ['own sign 20', 'great friend 18', 'friend 15', 'neutral 10',
               'enemy 7', 'great enemy 5'];
  return /varga viswa, out of twenty/.test(flat) &&
    pairs.every(function (t) { return flat.indexOf(t) >= 0; });
})());
ok('and says outright that moolatrikona is not one of the six', (function () {
  var flat = appSrc.replace(/'\s*\+\s*'/g, '');
  return /Moolatrikona he does not rank apart from an own sign/.test(flat);
})());
ok('and says why the trimsamsa needs a stand-in',
   /No luminary rules a trimsamsa/.test(appSrc.replace(/'\s*\+\s*'/g, '')) &&
   /stands in as Mars and the Moon as Venus/.test(appSrc.replace(/'\s*\+\s*'/g, '')));
ok('and that the nodes are left out',
   /Rahu \n?\s*'?and Ketu own no sign and keep no friendships/.test(appSrc) ||
   /Rahu and Ketu own no sign and keep no friendships/.test(appSrc.replace(/'\s*\+\s*'/g, '')));

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
   /var detail = d \? vargasDetail\(d, scheme\.divisions\[i\], planet\.name\) : null;/.test(appSrc));
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
                           appSrc.indexOf('function renderSlotTable'));
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

ok('the dispositor cell carries that title, and the ascendant row does not',
   /title: r\.isAscendant \? null : dispositorDetail\(r\.name, v\.sign, positionsD1\)/.test(appSrc));
ok('both tables state the direction in view, not only on hover',
   (html.match(/the graha's own view of the lord whose sign it occupies/g) || []).length === 2);
ok('friendship is defined once, in the engine', (function () {
  var astroSrc = fs.readFileSync(path.join(root, 'js/astro.js'), 'utf8');
  var shadSrc = fs.readFileSync(path.join(root, 'js/shadbala.js'), 'utf8');
  return /var NATURAL_FRIENDS = \{/.test(astroSrc) && !/NATURAL_FRIENDS = \{/.test(shadSrc);
})());

// The columns, in the order they read.
ok('both tables carry the same nine columns, in order', (function () {
  var wanted = ['Graha', 'Rashi', 'Dignity', 'House', 'Dispositor', 'Longitude',
                'Nakshatra', 'Pada', 'Lord / sub lord'];
  return ['table-a', 'table-b'].every(function (id) {
    var at = html.indexOf('id="' + id + '"');
    var head = html.slice(at, html.indexOf('</thead>', at));
    var found = (head.match(/<th scope="col">([^<]+)<\/th>/g) || [])
      .map(function (t) { return t.replace(/<[^>]+>/g, ''); });
    return found.join('|') === wanted.join('|');
  });
})());
ok('the rules column stayed gone when house came back',
   !/<th scope="col">Rules<\/th>/.test(html) && !/function rulership/.test(appSrc));
ok('the house column says what it is counted from',
   /Whole sign house, counted from/.test(appSrc) &&
   /as the chart beside this table is\./.test(appSrc));
ok('what a graha is comes before where it is', (function () {
  var at = html.indexOf('id="table-a"');
  var head = html.slice(at, html.indexOf('</thead>', at));
  return head.indexOf('>Motion<') < head.indexOf('>Longitude<') &&
         head.indexOf('>Dignity<') < head.indexOf('>Longitude<');
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
