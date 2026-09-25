/*
 * geo.js - place lookup and the timezone arithmetic a birth chart depends on.
 *
 * The city table (data/cities.js) is GeoNames' cities5000: every populated place
 * above 5,000 people, with its IANA timezone. Offsets are resolved through
 * Intl.DateTimeFormat rather than a fixed UTC number, so historical rules apply:
 * a 1943 Indian birth gets +06:30 (wartime), a July 1975 New York birth gets
 * -04:00 while a January one gets -05:00, and a 1968 London birth gets +01:00
 * from Britain's experiment with year-round summer time. Getting this wrong moves
 * the ascendant by 15 degrees an hour, so it is worth the care.
 */
var Geo = (function () {
  'use strict';

  var cities = null;
  var loading = null;

  /**
   * The city table is 3 MB, so it is fetched on first interaction with the place
   * field rather than at page load. A <script> tag is used rather than fetch()
   * so that opening index.html straight off the disk still works - file:// blocks
   * XHR but not script tags.
   */
  function ensure(callback) {
    if (typeof window !== 'undefined' && window.CITY_DB) return callback(null);
    if (loading) { loading.push(callback); return; }
    loading = [callback];
    var script = document.createElement('script');
    script.src = 'data/cities.js';
    script.onload = function () {
      var queue = loading; loading = [];
      queue.forEach(function (cb) { cb(null); });
    };
    script.onerror = function () {
      var queue = loading; loading = [];
      queue.forEach(function (cb) { cb(new Error('Could not load data/cities.js')); });
    };
    document.head.appendChild(script);
  }

  /** Parse the packed table once, on first use. */
  function load() {
    if (cities) return cities;
    if (typeof window === 'undefined' || !window.CITY_DB) return (cities = []);
    var db = window.CITY_DB;
    var lines = db.rows.split('\n');
    cities = new Array(lines.length);
    for (var i = 0; i < lines.length; i++) {
      var f = lines[i].split('|');
      var name = f[0];
      cities[i] = {
        name: name,
        region: db.regions[+f[2]] || '',
        nation: db.nations[+f[3]] || '',
        zone: db.zones[+f[4]],
        lat: +f[5],
        lon: +f[6],
        pop: +f[7],
        // Searchable key: the local spelling plus the ASCII transliteration, so
        // both "Bengaluru" and "Bangalore"-style spellings can be typed.
        key: (f[1] ? name + ' ' + f[1] : name).toLowerCase()
      };
    }
    return cities;
  }

  /** Strip accents so "Zurich" finds "Zürich". */
  function fold(s) {
    return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  }


  /*
   * Former and colonial-era names. GeoNames stores the current official name, but
   * anyone entering a birth place from an older certificate will type the name
   * that was current then - "Bombay", "Calcutta", "Benares". GeoNames' own
   * alternate-name field carries these but buried in hundreds of transliterations
   * per city, so this is a curated list instead: small, auditable, noise-free.
   */
  var ALIASES = {
    // India
    bangalore: 'Bengaluru', bombay: 'Mumbai', calcutta: 'Kolkata', madras: 'Chennai',
    poona: 'Pune', trivandrum: 'Thiruvananthapuram', cochin: 'Kochi', mysore: 'Mysuru',
    mangalore: 'Mangaluru', baroda: 'Vadodara', benares: 'Varanasi', banaras: 'Varanasi',
    kashi: 'Varanasi', allahabad: 'Prayagraj', prayag: 'Prayagraj', gurgaon: 'Gurugram',
    simla: 'Shimla', cawnpore: 'Kanpur', jubbulpore: 'Jabalpur', pondicherry: 'Puducherry',
    panjim: 'Panaji', tanjore: 'Thanjavur', trichy: 'Tiruchirappalli',
    trichinopoly: 'Tiruchirappalli', tuticorin: 'Thoothukudi', vizag: 'Visakhapatnam',
    waltair: 'Visakhapatnam', hubli: 'Hubballi', belgaum: 'Belagavi', gulbarga: 'Kalaburagi',
    bellary: 'Ballari', shimoga: 'Shivamogga', tumkur: 'Tumakuru', bijapur: 'Vijayapura',
    ootacamund: 'Udhagamandalam', ooty: 'Udhagamandalam', calicut: 'Kozhikode',
    quilon: 'Kollam', alleppey: 'Alappuzha', palghat: 'Palakkad', cannanore: 'Kannur',
    trichur: 'Thrissur', nasik: 'Nashik', rajahmundry: 'Rajamahendravaram',
    // Pakistan and Bangladesh
    dacca: 'Dhaka', lyallpur: 'Faisalabad', chittagong: 'Chattogram', jessore: 'Jashore',
    comilla: 'Cumilla', barisal: 'Barishal',
    // Elsewhere
    rangoon: 'Yangon', moulmein: 'Mawlamyine', saigon: 'Ho Chi Minh City',
    batavia: 'Jakarta', peking: 'Beijing', canton: 'Guangzhou',
    leningrad: 'Saint Petersburg', stalingrad: 'Volgograd', constantinople: 'Istanbul',
    danzig: 'Gdansk', breslau: 'Wroclaw', koenigsberg: 'Kaliningrad',
    salisbury: 'Harare', bombay_town: 'Mumbai'
  };

  /** A query plus any current names its alias form points at. */
  function expandQuery(q) {
    var queries = [q];
    Object.keys(ALIASES).forEach(function (alias) {
      if (alias.indexOf(q) === 0 || q.indexOf(alias) === 0) {
        var canonical = ALIASES[alias].toLowerCase();
        if (queries.indexOf(canonical) < 0) queries.push(canonical);
      }
    });
    return queries;
  }

  /**
   * Rank places against a query. The table is already sorted by population, so
   * equal-quality matches come back most-populous first.
   */
  function search(query, limit) {
    var all = load();
    var typed = fold(query);
    if (typed.length < 2) return [];
    limit = limit || 40;

    var queries = expandQuery(typed);
    var out = [];
    var seen = {};
    for (var i = 0; i < all.length && out.length < limit * 4; i++) {
      var c = all[i];
      var key = fold(c.key);
      var best = null;
      for (var q = 0; q < queries.length; q++) {
        var at = key.indexOf(queries[q]);
        if (at < 0) continue;
        // Starting the name beats starting a word, which beats matching inside;
        // reaching the place through a former name costs a little; and size
        // breaks the rest, so typing "calcutta" offers Kolkata before the
        // 3,000-person Calcutta in South Africa.
        var score = (at === 0 ? 0 : key.charAt(at - 1) === ' ' ? 1 : 2) +
          (q === 0 ? 0 : 0.6) - Math.min(2, Math.log(c.pop + 1) / Math.LN10 / 2);
        if (best === null || score < best) best = score;
      }
      if (best === null || seen[c.name + c.lat]) continue;
      seen[c.name + c.lat] = true;
      out.push({ city: c, score: best });
    }
    out.sort(function (a, b) { return a.score - b.score; }); // stable: keeps population order
    return out.slice(0, limit).map(function (r) { return r.city; });
  }

  /**
   * Every timezone the city table actually uses, sorted.
   *
   * Preferred over Intl.supportedValuesOf('timeZone') for two reasons. That list
   * is whatever the browser's ICU build calls canonical, which is still
   * "Asia/Calcutta" in current builds even though the rest of the world writes
   * Asia/Kolkata, so the name people look for is simply absent. And it is 417
   * entries covering zones no populated place uses. This is the set of zones real
   * births can have happened in, under the names the city list already reports.
   */
  function zones() {
    if (typeof window === 'undefined' || !window.CITY_DB) return [];
    return window.CITY_DB.zones.slice().filter(Boolean).sort();
  }

  /**
   * The populated place nearest a point, so a typed coordinate can name its own
   * timezone instead of asking someone to pick one from a list of hundreds.
   *
   * Equirectangular distance, which is wrong for a sphere over long ranges but
   * exact enough to pick a neighbour, and the answer is only ever used to read
   * off a timezone. Longitude is cosine-scaled so the comparison does not favour
   * high latitudes.
   */
  function nearest(lat, lon) {
    var list = load();
    if (!list.length) return null;
    var scale = Math.cos(lat * Math.PI / 180);
    var best = null, bestD = Infinity;
    for (var i = 0; i < list.length; i++) {
      var c = list[i];
      var dy = c.lat - lat;
      var dx = (c.lon - lon) * scale;
      var d = dy * dy + dx * dx;
      if (d < bestD) { bestD = d; best = c; }
    }
    // Degrees back to kilometres, for saying how far off the match is.
    best.km = Math.sqrt(bestD) * 111.195;
    return best;
  }

  function label(c) {
    return [c.name, c.region, c.nation].filter(Boolean).join(', ');
  }

  /**
   * UTC offset in minutes that `zone` was using at the given *local* wall-clock
   * time. Two passes settle the chicken-and-egg problem of needing the offset to
   * know the instant and the instant to know the offset (and so handle DST edges).
   */
  function offsetMinutes(zone, y, month, day, hour, minute) {
    var wall = Date.UTC(y, month - 1, day, hour, minute);
    var at = function (ms) {
      var parts = {};
      new Intl.DateTimeFormat('en-US', {
        timeZone: zone, hour12: false, era: 'short',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      }).formatToParts(new Date(ms)).forEach(function (p) { parts[p.type] = p.value; });
      var yr = +parts.year * (parts.era === 'BC' ? -1 : 1);
      var asUTC = Date.UTC(yr, +parts.month - 1, +parts.day,
        parts.hour === '24' ? 0 : +parts.hour, +parts.minute, +parts.second);
      return (asUTC - ms) / 60000;
    };
    var first = at(wall);
    var second = at(wall - first * 60000);
    return at(wall - second * 60000);
  }

  /**
   * Offsets are not always whole minutes: pre-standard-time zones are local mean
   * time, so Asia/Kolkata in 1869 is +05:53:20. Seconds are shown only when they
   * are there.
   */
  function formatOffset(minutes) {
    var sign = minutes < 0 ? '-' : '+';
    var totalSeconds = Math.round(Math.abs(minutes) * 60);
    var h = Math.floor(totalSeconds / 3600);
    var m = Math.floor((totalSeconds - h * 3600) / 60);
    var sec = totalSeconds - h * 3600 - m * 60;
    return sign + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') +
      (sec ? ':' + String(sec).padStart(2, '0') : '');
  }

  /** Does this environment actually know historical timezone rules? */
  function historicalZonesSupported() {
    try {
      // India ran on +06:30 from 1942 to 1945.
      return offsetMinutes('Asia/Kolkata', 1944, 6, 15, 12, 0) === 390;
    } catch (e) { return false; }
  }

  /**
   * 12-hour clock to 24-hour. The two cases worth stating: 12 AM is hour 0
   * (midnight) and 12 PM is hour 12 (noon), which is where naive arithmetic
   * usually goes wrong.
   */
  function to24Hour(hour12, meridiem) {
    return (hour12 % 12) + (meridiem === 'pm' ? 12 : 0);
  }

  /** The inverse: 24-hour clock to {hour12, meridiem}. */
  function from24Hour(hour24) {
    return {
      hour12: hour24 % 12 === 0 ? 12 : hour24 % 12,
      meridiem: hour24 >= 12 ? 'pm' : 'am'
    };
  }

  function formatDMS(value, posLabel, negLabel) {
    var sign = value < 0 ? negLabel : posLabel;
    var abs = Math.abs(value);
    var d = Math.floor(abs);
    var m = Math.floor((abs - d) * 60);
    var s = Math.round(((abs - d) * 60 - m) * 60);
    if (s === 60) { s = 0; m += 1; }
    return d + '° ' + String(m).padStart(2, '0') + "' " + String(s).padStart(2, '0') + '" ' + sign;
  }

  return {
    ensure: ensure,
    load: load,
    search: search,
    label: label,
    zones: zones,
    nearest: nearest,
    offsetMinutes: offsetMinutes,
    formatOffset: formatOffset,
    to24Hour: to24Hour,
    from24Hour: from24Hour,
    formatDMS: formatDMS,
    historicalZonesSupported: historicalZonesSupported,
    count: function () { return load().length; }
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Geo;
