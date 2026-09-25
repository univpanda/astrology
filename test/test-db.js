/*
 * Checks the stored ephemeris against the engine that generated it.
 *
 * Needs a database and is skipped unless DATABASE_URL is set; the other two
 * suites stay offline on purpose. Run with:
 *
 *   DATABASE_URL=... node test/test-db.js
 *   DATABASE_URL=... CHART_API=https://<ref>.supabase.co/functions/v1/chart node test/test-db.js
 *
 * Three implementations are compared, which is the point: the analytic engine,
 * the JavaScript interpolator in js/ephemeris.js, and the SQL one in
 * astro_longitude(). The last two are the same algorithm written twice, so they
 * cross-check each other, and both are checked against the first.
 *
 * Everything is fetched in three queries. Each psql call opens a fresh TLS
 * connection to a remote database, so a query per body per epoch spends all its
 * time on handshakes.
 */
var { execFileSync } = require('node:child_process');
global.PERTURBATIONS = require('../data/perturbations.js');
var A = require('../js/astro.js');
var E = require('../js/ephemeris.js');

var DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.log('\nDATABASE_URL is not set, skipping the database suite.\n');
  process.exit(0);
}

/*
 * Connection details reach psql through the environment, never as an argument.
 * Node prints spawnargs verbatim when a child process fails, so a URL passed on
 * the command line lands in any stack trace, password and all.
 */
var PG_ENV = (function () {
  var u = new URL(DATABASE_URL);
  return Object.assign({}, process.env, {
    PGHOST: u.hostname,
    PGPORT: u.port || '5432',
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: u.pathname.replace(/^\//, '') || 'postgres'
  });
})();

var pass = 0, fail = 0;
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  ok   ' + name + (detail ? '  (' + detail + ')' : '')); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '  (' + detail + ')' : '')); }
}
function sql(query) {
  // One packed row of Moon samples is ~390 KB, so the default buffer is too small.
  return execFileSync('psql', ['-tAc', query], {
    encoding: 'utf8', env: PG_ENV, maxBuffer: 128 * 1024 * 1024
  }).trim();
}
function gap(a, b) { return Math.abs(A.norm360(a - b + 180) - 180) * 3600; }

var BODIES = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'rahu'];
var MOMENTS = [
  [1801, 5, 9, 3.25], [1899, 12, 31, 23.5], [1947, 8, 15, 12.0],
  [1985, 3, 22, 5.4166667], [2026, 9, 25, 18.75], [2099, 7, 4, 0.5]
];
var jds = MOMENTS.map(function (m) { return A.julianDay(m[0], m[1], m[2], m[3]); });

/* ------------------------------------------------------- query 1: metadata */

console.log('\nTable shape');
var meta = sql(
  "select (select count(*) from astro_ephemeris) || '|' ||" +
  " (select count(distinct body) from astro_ephemeris) || '|' ||" +
  " (select count(distinct decade) from astro_ephemeris) || '|' ||" +
  " (select relrowsecurity::text from pg_class where relname='astro_ephemeris') || '|' ||" +
  " (select count(*) from pg_policies where tablename='astro_ephemeris' and cmd='SELECT') || '|' ||" +
  " (select sum(sample_count)::text from astro_ephemeris);"
).split('|');
ok('one row per decade per body', +meta[0] === 279, meta[0] + ' rows');
ok('nine bodies across 31 decades', +meta[1] === 9 && +meta[2] === 31, meta[1] + ' bodies, ' + meta[2] + ' decades');
// boolean::text is 'true'/'false'; the 't'/'f' you see in psql is display only.
ok('row level security is on', meta[3] === 'true', meta[3]);
ok('a public read policy exists', +meta[4] === 1);
ok('sample count matches the generator', +meta[5] === 995721, (+meta[5]).toLocaleString() + ' samples');

/* ------------------------------------------ query 2: positions at each epoch */

console.log('\nStored ephemeris against the analytic engine');
var positionRows = sql(
  "select m.jd || '|' || p.body || '|' || p.longitude || '|' || p.longitude_later" +
  ' from (values ' + jds.map(function (jd) { return '(' + jd + '::double precision)'; }).join(',') +
  ') as m(jd), lateral astro_positions(m.jd) p;'
).split('\n').map(function (line) { return line.split('|'); });

var worstSql = 0, worstSpeed = 0;
MOMENTS.forEach(function (m, idx) {
  var jd = jds[idx];
  var mine = {};
  positionRows.filter(function (r) { return Math.abs(+r[0] - jd) < 1e-6; })
    .forEach(function (r) { mine[r[1]] = { now: +r[2], later: +r[3] }; });
  var worstHere = 0;
  BODIES.forEach(function (body) {
    if (!mine[body]) { worstHere = Infinity; return; }
    worstHere = Math.max(worstHere, gap(mine[body].now, A.meanTropicalOf(body, jd, false)));
    worstSpeed = Math.max(worstSpeed, gap(mine[body].later, A.meanTropicalOf(body, jd + 0.5, false)));
  });
  worstSql = Math.max(worstSql, worstHere);
  ok(m[0] + '-' + String(m[1]).padStart(2, '0') + ': every graha within 1 arcsec',
     worstHere < 1, worstHere.toFixed(3) + '"');
});
ok('worst SQL-vs-engine difference under 1 arcsec', worstSql < 1, worstSql.toFixed(3) + '"');
ok('the half-day sample used for speed is equally close', worstSpeed < 1, worstSpeed.toFixed(3) + '"');

/* --------------------------------- query 3: packed rows for the JS decoder */

console.log('\nThe SQL and JavaScript interpolators agree');
var decades = {};
jds.forEach(function (jd) { decades[E.decadeFor(jd, A.calendarDate)] = true; });
var rows = sql(
  'select row_to_json(t)::text from (select decade, body, step_days, first_jd, sample_count,' +
  ' longitudes from astro_ephemeris where decade in (' + Object.keys(decades).join(',') + ')) t;'
).split('\n').map(function (l) { return JSON.parse(l); });
var byKey = {};
rows.forEach(function (r) { byKey[r.decade + '|' + r.body] = r; });

var worstJs = 0, worstPair = 0, compared = 0;
jds.forEach(function (jd) {
  var decade = E.decadeFor(jd, A.calendarDate);
  var fromSql = {};
  positionRows.filter(function (r) { return Math.abs(+r[0] - jd) < 1e-6; })
    .forEach(function (r) { fromSql[r[1]] = +r[2]; });
  BODIES.forEach(function (body) {
    var row = byKey[decade + '|' + body];
    if (!row) return;
    var js = E.longitudeAt(row, jd);
    if (js === null) return;
    compared++;
    worstJs = Math.max(worstJs, gap(js, A.meanTropicalOf(body, jd, false)));
    if (fromSql[body] !== undefined) worstPair = Math.max(worstPair, gap(js, fromSql[body]));
  });
});
ok('JavaScript interpolator within 1 arcsec of the engine', worstJs < 1,
   worstJs.toFixed(3) + '" over ' + compared + ' comparisons');
ok('SQL and JavaScript agree to 0.01 arcsec', worstPair < 0.01, worstPair.toFixed(5) + '"');

/* ------------------------------------------------------ the edge function */

if (process.env.CHART_API) {
  console.log('\nEdge function end to end');
  var body = JSON.stringify({
    date: '1985-03-22', time: '10:55:00', tzOffsetMinutes: 330,
    latitude: 23.5158, longitude: 87.308
  });
  var payload = JSON.parse(execFileSync('curl', ['-sS', '-X', 'POST', process.env.CHART_API,
    '-H', 'Content-Type: application/json', '-H', 'x-region: us-east-1', '-d', body],
    { encoding: 'utf8' }));
  ok('API answered with a chart', !!(payload && payload.chart), payload.error || payload.source);
  if (payload && payload.chart) {
    var local = A.chart({
      jdUT: A.julianDay(1985, 3, 22, (10 * 3600 + 55 * 60) / 3600 - 330 / 60),
      latitude: 23.5158, longitude: 87.308, tzOffsetMinutes: 330
    });
    var worstApi = 0;
    payload.chart.planets.forEach(function (p) {
      var mine = local.planets.filter(function (q) { return q.name === p.name; })[0];
      worstApi = Math.max(worstApi, gap(p.longitude, mine.longitude));
    });
    ok('API grahas within 1 arcsec of the local engine', worstApi < 1, worstApi.toFixed(3) + '"');
    ok('API ascendant matches the local engine',
       gap(payload.chart.ascendant.longitude, local.ascendant.longitude) < 0.001);
    ok('API reports its source', payload.source === 'astro_ephemeris', payload.source);
    ok('API rejects a date outside the stored range', (function () {
      var out = JSON.parse(execFileSync('curl', ['-sS', '-X', 'POST', process.env.CHART_API,
        '-H', 'Content-Type: application/json', '-d',
        JSON.stringify({ date: '1750-01-01', time: '12:00', latitude: 0, longitude: 0 })],
        { encoding: 'utf8' }));
      return !!out.error;
    })());
  }
}

if (process.env.KUNDALI_API) {
  console.log('\nSaved charts API');
  // A throwaway token, so the suite never touches anyone's real saved charts.
  var token = 'test-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12);
  var call = function (payload) {
    return JSON.parse(execFileSync('curl', ['-sS', '-X', 'POST', process.env.KUNDALI_API,
      '-H', 'Content-Type: application/json',
      '-d', JSON.stringify(Object.assign({ ownerToken: token }, payload))], { encoding: 'utf8' }));
  };
  var entry = {
    name: 'Test Person', placeLabel: 'Durgapur, West Bengal, India',
    latitude: 23.5158, longitude: 87.308, zone: 'Asia/Kolkata',
    date: '1985-03-22', time: '10:55:00', standard: 'zone', ayanamsa: 'lahiri', trueNode: false
  };

  ok('a new token starts with nothing', call({ action: 'list' }).entries.length === 0);
  var first = call({ action: 'save', entry: entry });
  ok('saving returns the entry', first.saved === true && first.entries.length === 1);
  ok('the saved row keeps all four keys', (function () {
    var e = first.entries[0];
    return e.name === entry.name && e.place_label === entry.placeLabel &&
           e.birth_date === entry.date && String(e.birth_time).slice(0, 8) === entry.time;
  })());

  var again = call({ action: 'save', entry: entry });
  ok('re-saving the same four keys updates rather than duplicates',
     again.updated === true && again.entries.length === 1);

  var other = call({ action: 'save', entry: Object.assign({}, entry, { name: 'Someone Else' }) });
  ok('a different name is a different chart', other.entries.length === 2);

  ok('another token cannot see these rows', JSON.parse(execFileSync('curl',
    ['-sS', '-X', 'POST', process.env.KUNDALI_API, '-H', 'Content-Type: application/json',
     '-d', JSON.stringify({ ownerToken: 'unrelated-token-0123456789', action: 'list' })],
    { encoding: 'utf8' })).entries.length === 0);

  ok('a short token is refused', !!call({ action: 'list', ownerToken: 'tiny' }).entries === false ||
     !!JSON.parse(execFileSync('curl', ['-sS', '-X', 'POST', process.env.KUNDALI_API,
       '-H', 'Content-Type: application/json', '-d', '{"ownerToken":"tiny","action":"list"}'],
       { encoding: 'utf8' })).error);

  // Editing: the row is named by id, so a changed name or time updates it
  // rather than leaving the old row behind beside a near-duplicate.
  var beforeEdit = call({ action: 'list' }).entries.length;
  var editId = first.entries[0].id;
  var edited = call({ action: 'save', id: editId,
    entry: Object.assign({}, entry, { name: 'Renamed Person', time: '11:30:00' }) });
  ok('an edit updates the named row', edited.updated === true &&
     edited.entries.length === beforeEdit, edited.entries.length + ' rows');
  ok('the edited row kept its id and took the new values', (function () {
    var row = edited.entries.filter(function (e) { return e.id === editId; })[0];
    return row && row.name === 'Renamed Person' && String(row.birth_time).slice(0, 8) === '11:30:00';
  })());
  ok('another token cannot patch a row by naming its id', (function () {
    JSON.parse(execFileSync('curl', ['-sS', '-X', 'POST', process.env.KUNDALI_API,
      '-H', 'Content-Type: application/json',
      '-d', JSON.stringify({ ownerToken: 'intruder-token-0123456789', action: 'save', id: editId,
        entry: Object.assign({}, entry, { name: 'Hijacked' }) })], { encoding: 'utf8' }));
    var mine = call({ action: 'list' }).entries.filter(function (e) { return e.id === editId; })[0];
    return mine && mine.name === 'Renamed Person';
  })());
  // Put it back so the rest of the suite reads as before.
  call({ action: 'save', id: editId, entry: entry });

  var removed = call({ action: 'delete', id: first.entries[0].id });
  ok('deleting removes only that row', removed.deleted === true && removed.entries.length === 1);
  call({ action: 'delete', id: removed.entries[0].id });
  ok('the token is left empty again', call({ action: 'list' }).entries.length === 0);

  // The table must be unreachable with the public key, not merely unadvertised.
  ok('astro_charts has no RLS policy, so PostgREST cannot read it',
     +sql("select count(*) from pg_policies where tablename='astro_charts';") === 0);
  ok('row level security is enabled on it',
     sql("select relrowsecurity::text from pg_class where relname='astro_charts';") === 'true');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
