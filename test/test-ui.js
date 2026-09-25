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
   html.indexOf('id="edit-button"') < html.indexOf('id="chart-d1"'));
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
ok('the ascendant row leaves motion and dignity blank',
   /p\.isAscendant \? '\\u2013'/.test(appSrc));
ok('the ascendant row still gets a navamsa sign',
   /Astro\.navamsaSign\(asc\.longitude\)/.test(appSrc));

ok('time standard select is wired', /id="time-standard"/.test(html) && /time-standard/.test(appSrc));

// Three tabs, with the form as home.
(function () {
  var names = ['saved', 'add', 'chart'];
  ok('there are exactly three tabs', (html.match(/role="tab"/g) || []).length === 3);
  ok('each tab has a panel, and each panel names its tab', names.every(function (n) {
    return new RegExp('id="tab-' + n + '"').test(html) &&
           new RegExp('id="panel-' + n + '"[^>]*aria-labelledby="tab-' + n + '"').test(html);
  }));
  ok('every tab points at its panel', names.every(function (n) {
    return new RegExp('id="tab-' + n + '"[\\s\\S]{0,140}aria-controls="panel-' + n + '"').test(html);
  }));
  ok('"add a kundali" is the tab selected on arrival',
     /id="tab-add"[\s\S]{0,140}aria-selected="true"/.test(html) &&
     (html.match(/aria-selected="true"/g) || []).length === 1);
  ok('the other two panels start hidden',
     /id="panel-saved"[^>]*hidden/.test(html) && /id="panel-chart"[^>]*hidden/.test(html) &&
     !/id="panel-add"[^>]*hidden/.test(html));
  ok('only the selected tab is reachable by tab key',
     (html.match(/tabindex="-1"/g) || []).length === 2);
  ok('the tab strip is keyboard navigable',
     /ArrowRight/.test(appSrc) && /ArrowLeft/.test(appSrc) && /'Home'/.test(appSrc) && /'End'/.test(appSrc));
  ok('the chart tab has something to say when empty', /id="empty-chart"/.test(html));
  ok('generating moves you to the chart tab and clears the form',
     /showChart\(\);\s*\n[\s\S]{0,200}blankForm\(\);/.test(appSrc));
  ok('opening a saved chart lands on the chart tab',
     /reopeningSaved = true;\s*\n\s*activateTab\('chart'\)/.test(appSrc));
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
ok('a saved chart can be reopened and removed',
   /function loadSaved/.test(appSrc) && /saved-remove/.test(appSrc));
ok('storage failure is handled rather than thrown',
   /catch \(e\) \{\s*return \[\]/.test(appSrc) && /would not let the chart be saved/.test(appSrc));
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
})();
ok('blank seconds are documented as 00', /Seconds are optional/.test(html));
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

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
