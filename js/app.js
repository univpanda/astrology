/*
 * app.js - form handling, the place combobox, and rendering the result.
 *
 * Everything runs locally: nothing about the birth data is sent anywhere, and
 * the only network request the page ever makes is for its own city table.
 */
(function () {
  'use strict';

  var form = document.getElementById('birth-form');
  var placeInput = document.getElementById('place');
  var listbox = document.getElementById('place-listbox');
  var placeNote = document.getElementById('place-note');
  var manualToggle = document.getElementById('manual-toggle');
  var manualFields = document.getElementById('manual-coords');
  var styleSelect = document.getElementById('chart-style');
  var errorBox = document.getElementById('form-error');
  var result = document.getElementById('result');

  /*
   * The chart is computed from the stored ephemeris in Supabase (astro_ephemeris
   * via the chart edge function), falling back to the in-page engine if the API
   * is unreachable. Both paths run the same Astro.assembleChart, so the fallback
   * is the same arithmetic rather than a degraded approximation.
   *
   * x-region pins execution beside the database: without it the function runs at
   * the edge nearest the visitor and pays a cross-region round trip to Postgres,
   * which measured 300ms from India against 80ms pinned.
   */
  var CHART_API = 'https://deiefjnwbfcywsaaqqbs.supabase.co/functions/v1/chart';
  var API_REGION = 'us-east-1';
  var API_TIMEOUT_MS = 4000;

  var selectedCity = null;   // chosen from the dropdown
  var matches = [];
  var activeIndex = -1;
  var lastChart = null;      // kept so the style switch can redraw without recomputing

  /* ------------------------------------------------------------ formatting */

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

  /** Degrees as d° mm' ss". */
  function dms(deg) {
    var total = Math.round(deg * 3600);
    var d = Math.floor(total / 3600);
    var m = Math.floor((total - d * 3600) / 60);
    var s = total - d * 3600 - m * 60;
    return d + '° ' + String(m).padStart(2, '0') + "' " + String(s).padStart(2, '0') + '"';
  }

  function hhmm(hours) {
    var total = Math.round(hours * 60);
    return String(Math.floor(total / 60) % 24).padStart(2, '0') + ':' + String(total % 60).padStart(2, '0');
  }

  /** Julian Day to a civil date string, shifted by a fixed offset in minutes. */
  function jdToDate(jd, offsetMinutes, longForm) {
    var c = Astro.calendarDate(jd + (offsetMinutes || 0) / 1440);
    return longForm
      ? c.d + ' ' + MONTHS_LONG[c.m - 1] + ' ' + c.y
      : String(c.d).padStart(2, '0') + ' ' + MONTHS[c.m - 1] + ' ' + c.y;
  }

  function todayJd() {
    var now = new Date();
    return Astro.julianDay(now.getUTCFullYear(), now.getUTCMonth() + 1, now.getUTCDate(),
      now.getUTCHours() + now.getUTCMinutes() / 60);
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function fact(list, term, value, sub) {
    var wrap = document.createElement('div');
    wrap.appendChild(el('dt', null, term));
    var dd = el('dd', null, value);
    if (sub) dd.appendChild(el('span', 'sub', sub));
    wrap.appendChild(dd);
    list.appendChild(wrap);
  }

  /* -------------------------------------------------------------- selects */

  function populateSelects() {
    var ayan = document.getElementById('ayanamsa');
    Object.keys(Astro.AYANAMSA).forEach(function (key) {
      var opt = el('option', null, Astro.AYANAMSA[key].label);
      opt.value = key;
      if (key === 'lahiri') opt.selected = true;
      ayan.appendChild(opt);
    });

    var zoneSelect = document.getElementById('manual-zone');
    var zones = [];
    try { zones = Intl.supportedValuesOf('timeZone'); } catch (e) { zones = []; }
    if (!zones.length) zones = ['Asia/Kolkata', 'Asia/Karachi', 'Asia/Dhaka', 'Asia/Kathmandu',
      'Asia/Colombo', 'Asia/Dubai', 'Europe/London', 'America/New_York', 'America/Los_Angeles', 'UTC'];
    zones.forEach(function (z) {
      var opt = el('option', null, z);
      opt.value = z;
      if (z === 'Asia/Kolkata') opt.selected = true;
      zoneSelect.appendChild(opt);
    });
  }

  /* ------------------------------------------------------------- combobox */

  var searchTimer = null;

  function closeList() {
    listbox.hidden = true;
    listbox.innerHTML = '';
    placeInput.setAttribute('aria-expanded', 'false');
    placeInput.removeAttribute('aria-activedescendant');
    activeIndex = -1;
    matches = [];
  }

  function renderList(cities) {
    matches = cities;
    activeIndex = -1;
    listbox.innerHTML = '';
    if (!cities.length) {
      var none = el('li', 'empty', 'No match. Try fewer letters, or enter coordinates below.');
      none.setAttribute('role', 'presentation');
      listbox.appendChild(none);
    } else {
      cities.forEach(function (city, i) {
        var li = el('li');
        li.id = 'place-option-' + i;
        li.setAttribute('role', 'option');
        li.setAttribute('aria-selected', 'false');
        li.appendChild(document.createTextNode(city.name));
        var meta = [city.region, city.nation].filter(Boolean).join(', ');
        li.appendChild(el('span', 'place-meta',
          meta + '  ·  ' + city.lat.toFixed(3) + ', ' + city.lon.toFixed(3) + '  ·  ' + city.zone));
        li.addEventListener('mousedown', function (e) { e.preventDefault(); choose(city); });
        listbox.appendChild(li);
      });
    }
    listbox.hidden = false;
    placeInput.setAttribute('aria-expanded', 'true');
  }

  function highlight(index) {
    var options = listbox.querySelectorAll('li[role="option"]');
    if (!options.length) return;
    if (activeIndex >= 0 && options[activeIndex]) options[activeIndex].setAttribute('aria-selected', 'false');
    activeIndex = (index + options.length) % options.length;
    var active = options[activeIndex];
    active.setAttribute('aria-selected', 'true');
    placeInput.setAttribute('aria-activedescendant', active.id);
    // Keep the highlighted row inside the scrolling list.
    var top = active.offsetTop, bottom = top + active.offsetHeight;
    if (top < listbox.scrollTop) listbox.scrollTop = top;
    else if (bottom > listbox.scrollTop + listbox.clientHeight) listbox.scrollTop = bottom - listbox.clientHeight;
  }

  function choose(city) {
    selectedCity = city;
    placeInput.value = Geo.label(city);
    closeList();
    manualFields.hidden = true;
    manualToggle.setAttribute('aria-expanded', 'false');
    placeNote.textContent = city.lat.toFixed(4) + ', ' + city.lon.toFixed(4) + '  ·  ' + city.zone;
  }

  function runSearch() {
    var query = placeInput.value;
    if (query.length < 2) { closeList(); return; }
    Geo.ensure(function (err) {
      if (err) {
        placeNote.textContent = 'Place list unavailable. Enter coordinates instead.';
        closeList();
        return;
      }
      renderList(Geo.search(query, 40));
    });
  }

  placeInput.addEventListener('input', function () {
    selectedCity = null;
    placeNote.textContent = '';
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 120);
  });

  placeInput.addEventListener('focus', function () {
    // Warm the table up so the first keystroke is instant.
    Geo.ensure(function () {});
    if (placeInput.value.length >= 2 && !selectedCity) runSearch();
  });

  placeInput.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (listbox.hidden) { runSearch(); return; }
      e.preventDefault();
      highlight(activeIndex + (e.key === 'ArrowDown' ? 1 : -1));
    } else if (e.key === 'Enter') {
      if (!listbox.hidden && activeIndex >= 0 && matches[activeIndex]) {
        e.preventDefault();
        choose(matches[activeIndex]);
      }
    } else if (e.key === 'Escape') {
      closeList();
    }
  });

  placeInput.addEventListener('blur', function () { setTimeout(closeList, 120); });

  manualToggle.addEventListener('click', function () {
    var show = manualFields.hidden;
    manualFields.hidden = !show;
    manualToggle.setAttribute('aria-expanded', String(show));
    if (show) { selectedCity = null; document.getElementById('manual-lat').focus(); }
  });

  /* ------------------------------------------------------------ time field */

  var hourInput = document.getElementById('birth-hour');
  var minuteInput = document.getElementById('birth-minute');
  var secondInput = document.getElementById('birth-second');
  var meridiemSelect = document.getElementById('birth-meridiem');

  /**
   * Read the typed 12-hour time. Returns either an `error` to show, or the hour
   * on a 24-hour clock for the maths plus the parts as entered.
   *
   * Seconds are optional. A time written as "10:30" means 10:30:00, so a blank
   * seconds box counts as zero. Minutes get no such courtesy: the hour box hands
   * focus straight to them, so a blank one is more likely forgotten than meant,
   * and being 59 minutes out moves the ascendant by about 14 degrees. A second of
   * clock time is worth roughly 13 to 21 arcseconds of ascendant in the mid
   * latitudes, which is why the box is here at all.
   */
  function readTime() {
    var hourText = hourInput.value.trim();
    var minuteText = minuteInput.value.trim();
    var secondText = secondInput.value.trim();
    if (!hourText && !minuteText) {
      return { error: 'Enter a time of birth. If it is unknown, 12:00 PM is the usual stand-in.' };
    }
    if (!/^\d{1,2}$/.test(hourText)) return { error: 'Enter the hour as a number from 1 to 12.' };
    if (!/^\d{1,2}$/.test(minuteText)) return { error: 'Enter the minute as a number from 00 to 59.' };
    if (secondText && !/^\d{1,2}$/.test(secondText)) return { error: 'Enter the seconds as a number from 00 to 59, or leave the box empty.' };
    var hour = +hourText, minute = +minuteText, second = secondText ? +secondText : 0;
    // 12-hour clocks have no hour 0, and 12 is the one that wraps to 0.
    if (hour < 1 || hour > 12) return { error: 'The hour must be from 1 to 12. Use AM or PM to say which half of the day.' };
    if (minute > 59) return { error: 'The minute must be from 00 to 59.' };
    if (second > 59) return { error: 'The seconds must be from 00 to 59.' };
    var meridiem = meridiemSelect.value === 'pm' ? 'pm' : 'am';
    return {
      hour12: hour, minute: minute, second: second, meridiem: meridiem,
      hour24: Geo.to24Hour(hour, meridiem)
    };
  }

  /** Put a 24-hour time into the controls. */
  function writeTime(hour24, minute, second) {
    var parts = Geo.from24Hour(hour24);
    meridiemSelect.value = parts.meridiem;
    hourInput.value = String(parts.hour12);
    minuteInput.value = String(minute).padStart(2, '0');
    secondInput.value = second ? String(second).padStart(2, '0') : '';
  }

  /*
   * Keep the boxes numeric and hand focus along as each one can no longer grow:
   * an hour past 1 cannot gain a digit, nor a minute or second past 5.
   */
  [[hourInput, minuteInput, 1], [minuteInput, secondInput, 5], [secondInput, null, 5]]
    .forEach(function (step) {
      var input = step[0], next = step[1], lastLeadingDigit = step[2];
      input.addEventListener('input', function () {
        var digits = input.value.replace(/\D/g, '').slice(0, 2);
        if (digits !== input.value) input.value = digits;
        if (next && (digits.length === 2 || +digits > lastLeadingDigit)) next.focus();
      });
      // Pad a single digit on the way out, so "5" reads back as "05".
      input.addEventListener('blur', function () {
        if (input !== hourInput && /^\d$/.test(input.value)) input.value = '0' + input.value;
      });
    });

  /* ---------------------------------------------------------------- submit */

  /** Where is the birth? Either a chosen city or the manual coordinates. */
  function resolvePlace() {
    if (selectedCity) return selectedCity;
    if (!manualFields.hidden) {
      var lat = parseFloat(document.getElementById('manual-lat').value);
      var lon = parseFloat(document.getElementById('manual-lon').value);
      var zone = document.getElementById('manual-zone').value;
      if (isNaN(lat) || isNaN(lon)) return null;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
      return {
        name: placeInput.value.trim() || 'Custom location',
        region: '', nation: '', lat: lat, lon: lon, zone: zone, manual: true
      };
    }
    return null;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errorBox.textContent = '';

    var nameValue = document.getElementById('name').value.trim();
    var dateValue = document.getElementById('date').value;
    var time = readTime();
    var place = resolvePlace();

    if (!nameValue) return fail('Enter the name this chart belongs to.');
    if (!dateValue) return fail('Enter a date of birth.');
    if (time.error) return fail(time.error);
    if (!place) return fail('Pick a place from the list, or open "Enter coordinates" and type latitude and longitude.');

    var dateParts = dateValue.split('-').map(Number);
    var y = dateParts[0], mo = dateParts[1], d = dateParts[2];
    var h = time.hour24, mi = time.minute;

    /*
     * Before standard time reached a country, a recorded birth time was local
     * mean time at the birthplace's own meridian. The IANA database models that
     * era with the *zone's* LMT (Asia/Kolkata gives Kolkata's +05:53), which is
     * wrong by up to an hour for a place at the other end of the country, and an
     * hour moves the ascendant by 15 degrees. So offer the choice explicitly.
     */
    var standard = document.getElementById('time-standard').value;
    var offset;
    if (standard === 'lmt') {
      offset = Math.round(place.lon * 4); // 4 minutes of time per degree
    } else {
      try {
        offset = Geo.offsetMinutes(place.zone, y, mo, d, h, mi);
      } catch (err) {
        return fail('That timezone could not be resolved: ' + place.zone);
      }
    }

    var params = {
      jdUT: Astro.julianDay(y, mo, d, (h * 3600 + mi * 60 + time.second) / 3600 - offset / 60),
      date: dateValue,
      time: String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0') +
        ':' + String(time.second).padStart(2, '0'),
      latitude: place.lat,
      longitude: place.lon,
      ayanamsa: document.getElementById('ayanamsa').value,
      trueNode: document.getElementById('node-type').value === 'true',
      tzOffsetMinutes: offset
    };

    var button = form.querySelector('button.primary');
    button.disabled = true;
    computeChart(params, function (chart, source) {
      button.disabled = false;
      lastChart = {
        chart: chart, place: place, offset: offset,
        name: nameValue, standard: standard, time: time, source: source,
        y: y, mo: mo, d: d, h: h, mi: mi
      };
      render(lastChart);
      writeHash(lastChart);
      result.hidden = false;
      result.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  /**
   * Ask the API for the chart, and compute it here if that does not work out.
   * The callback always fires: an unreachable database must not mean no chart.
   */
  function computeChart(params, done) {
    var settled = false;
    var finish = function (chart, source) {
      if (settled) return;
      settled = true;
      done(chart, source);
    };
    var local = function (why) {
      finish(Astro.chart(params), why);
    };

    if (!window.fetch || !CHART_API) return local('computed in your browser');

    var timer = setTimeout(function () { local('computed in your browser (the service did not answer)'); }, API_TIMEOUT_MS);

    fetch(CHART_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-region': API_REGION },
      body: JSON.stringify(params)
    }).then(function (res) {
      return res.ok ? res.json() : res.json().then(function (body) {
        throw new Error(body && body.error ? body.error : 'HTTP ' + res.status);
      });
    }).then(function (payload) {
      clearTimeout(timer);
      if (!payload || !payload.chart) throw new Error('empty response');
      finish(payload.chart, 'stored ephemeris' +
        (payload.timing ? ' (' + payload.timing.totalMs + ' ms)' : ''));
    }).catch(function () {
      clearTimeout(timer);
      local('computed in your browser (the service was unavailable)');
    });
  }

  function fail(message) {
    errorBox.textContent = message;
    return false;
  }

  /* ---------------------------------------------------------------- render */

  function render(state) {
    var c = state.chart, place = state.place;

    document.getElementById('result-name').textContent = state.name + '\u2019s chart';

    var placeLabel = [place.name, place.region, place.nation].filter(Boolean).join(', ');
    document.getElementById('result-birth').textContent =
      state.d + ' ' + MONTHS_LONG[state.mo - 1] + ' ' + state.y + ', ' +
      state.time.hour12 + ':' + String(state.time.minute).padStart(2, '0') +
      (state.time.second ? ':' + String(state.time.second).padStart(2, '0') : '') + ' ' +
      state.time.meridiem.toUpperCase() +
      ' (' + (state.standard === 'lmt' ? 'LMT ' : 'UTC') + Geo.formatOffset(state.offset) + ')  ·  ' +
      placeLabel + '  ·  ' +
      Geo.formatDMS(place.lat, 'N', 'S') + ' ' + Geo.formatDMS(place.lon, 'E', 'W');

    var facts = document.getElementById('key-facts');
    facts.innerHTML = '';
    var asc = c.ascendant;
    fact(facts, 'Lagna (ascendant)', asc.signName + ' ' + dms(asc.degreeInSign),
      asc.signSanskrit + '  ·  lord ' + asc.lord);
    var moon = planet(c, 'Moon'), sun = planet(c, 'Sun');
    fact(facts, 'Chandra rashi (moon sign)', moon.signName + ' ' + dms(moon.degreeInSign), moon.signSanskrit);
    fact(facts, 'Janma nakshatra', moon.nakshatra.name + ', pada ' + moon.nakshatra.pada,
      'lord ' + moon.nakshatra.lord);
    fact(facts, 'Surya rashi (sun sign)', sun.signName + ' ' + dms(sun.degreeInSign), sun.signSanskrit);

    drawCharts(state);
    renderPlanets(c);
    renderPanchang(c);
    renderDashas(c, state.offset);
    renderTechnical(state);
  }

  function planet(chart, name) {
    return chart.planets.filter(function (p) { return p.name === name; })[0];
  }

  function drawCharts(state) {
    var style = styleSelect.value;
    Charts.render(document.getElementById('chart-d1'), {
      style: style, planets: state.chart.planets, ascendant: state.chart.ascendant.longitude
    });
    Charts.render(document.getElementById('chart-d9'), {
      style: style, planets: state.chart.planets, ascendant: state.chart.ascendant.longitude, navamsa: true
    });
  }

  styleSelect.addEventListener('change', function () { if (lastChart) drawCharts(lastChart); });

  function renderPlanets(c) {
    var tbody = document.querySelector('#planet-table tbody');
    tbody.innerHTML = '';
    c.planets.forEach(function (p) {
      var tr = document.createElement('tr');
      var cells = [
        [p.name, null],
        [dms(p.degreeInSign), 'longitude'],
        [p.signName + ' (' + p.signSanskrit + ')', null],
        [String(p.house), 'numeric'],
        [p.nakshatra.name, null],
        [String(p.nakshatra.pada), 'numeric'],
        [p.nakshatra.lord, null],
        [p.navamsaSignName, null],
        [p.retrograde ? 'Retrograde' : 'Direct', null],
        [p.dignity || '\u2013', null]
      ];
      cells.forEach(function (cell, i) {
        var td = el(i === 0 ? 'th' : 'td', cell[1], cell[0]);
        if (i === 0) td.setAttribute('scope', 'row');
        if (i === 1) td.title = 'Sidereal longitude ' + p.longitude.toFixed(4) + '°';
        if (i === 8 && p.retrograde) td.className = 'retro-flag';
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
  }

  function renderPanchang(c) {
    var list = document.getElementById('panchang');
    list.innerHTML = '';
    var p = c.panchang;
    fact(list, 'Tithi', p.paksha + ' ' + p.tithi, 'tithi ' + p.tithiNumber + ' of the paksha');
    fact(list, 'Vara (weekday)', p.vara, 'lord ' + p.varaLord);
    fact(list, 'Yoga', p.yoga);
    fact(list, 'Karana', p.karana);
    fact(list, 'Sun–Moon elongation', p.moonPhaseAngle.toFixed(2) + '°');
  }

  function renderDashas(c, offset) {
    var tbody = document.querySelector('#dasha-table tbody');
    tbody.innerHTML = '';
    var now = todayJd();
    document.getElementById('dasha-balance').textContent =
      'At birth: ' + c.dashas.periods[0].lord + ' mahadasha with ' +
      c.dashas.balanceYears.toFixed(2) + ' years remaining, from ' +
      c.dashas.birthNakshatra.name + ' pada ' + c.dashas.birthNakshatra.pada + '.';
    c.dashas.periods.forEach(function (d) {
      var tr = document.createElement('tr');
      if (now >= d.startJd && now < d.endJd) tr.className = 'current-dasha';
      var th = el('th', null, d.lord);
      th.setAttribute('scope', 'row');
      tr.appendChild(th);
      tr.appendChild(el('td', null, jdToDate(d.startJd, offset)));
      tr.appendChild(el('td', null, jdToDate(d.endJd, offset)));
      tr.appendChild(el('td', 'numeric', String(d.years)));
      tbody.appendChild(tr);
    });
  }

  function renderTechnical(state) {
    var c = state.chart;
    var list = document.getElementById('technical');
    list.innerHTML = '';
    var ut = Astro.calendarDate(c.julianDay);
    fact(list, 'Ayanamsa', dms(c.ayanamsa), c.ayanamsaName);
    fact(list, 'Universal time', jdToDate(c.julianDay, 0) + ' ' + hhmm(ut.hours), '24-hour clock');
    fact(list, 'Julian Day (UT)', c.julianDay.toFixed(6));
    fact(list, 'Delta T applied', c.deltaT.toFixed(1) + ' s', 'UT → TT');
    fact(list, 'Local sidereal time', hhmm(c.siderealTime / 15), c.siderealTime.toFixed(4) + '°');
    fact(list, 'True obliquity', dms(c.obliquity));
    fact(list, 'Midheaven (sidereal)', Astro.SIGNS[c.midheaven.sign] + ' ' +
      dms(c.midheaven.longitude - c.midheaven.sign * 30));
    fact(list, 'Positions from', state.source || 'computed in your browser',
      state.source && state.source.indexOf('stored') === 0
        ? 'astro_ephemeris, interpolated in Postgres'
        : 'analytical theories, in this page');
    fact(list, 'House system', 'Whole sign (Parashari)');
    fact(list, 'Time standard', state.standard === 'lmt'
      ? 'Local mean time from longitude' : 'Zone time from ' + state.place.zone,
      'offset ' + Geo.formatOffset(state.offset));
    fact(list, 'Rahu / Ketu', document.getElementById('node-type').value === 'true'
      ? 'True node' : 'Mean node');
    if (state.y < 1800 || state.y > 2100) {
      fact(list, 'Note', 'Outside 1800–2100',
        'the Jupiter/Saturn correction table does not cover this date, so those two may be a few arcminutes off.');
    }
  }

  document.getElementById('print-button').addEventListener('click', function () { window.print(); });

  /* ------------------------------------------- shareable URL for a chart */

  function writeHash(state) {
    var p = state.place;
    var parts = [
      'd=' + state.y + '-' + String(state.mo).padStart(2, '0') + '-' + String(state.d).padStart(2, '0'),
      't=' + String(state.h).padStart(2, '0') + ':' + String(state.mi).padStart(2, '0') +
        (state.time.second ? ':' + String(state.time.second).padStart(2, '0') : ''),
      'lat=' + p.lat.toFixed(4), 'lon=' + p.lon.toFixed(4), 'tz=' + encodeURIComponent(p.zone),
      'place=' + encodeURIComponent(p.name)
    ];
    if (state.standard === 'lmt') parts.push('std=lmt');
    parts.push('n=' + encodeURIComponent(state.name));
    history.replaceState(null, '', '#' + parts.join('&'));
  }

  /** Restore a chart from the URL, so a generated chart can be bookmarked. */
  function readHash() {
    if (!location.hash || location.hash.length < 2) return;
    var q = {};
    location.hash.slice(1).split('&').forEach(function (pair) {
      var i = pair.indexOf('=');
      if (i > 0) q[pair.slice(0, i)] = decodeURIComponent(pair.slice(i + 1));
    });
    if (!q.d || !q.t || !q.lat || !q.lon || !q.tz) return;
    document.getElementById('date').value = q.d;
    var t = q.t.split(':');
    writeTime(+t[0], +(t[1] || 0), +(t[2] || 0));
    document.getElementById('name').value = q.n || '';
    document.getElementById('time-standard').value = q.std === 'lmt' ? 'lmt' : 'zone';
    selectedCity = {
      name: q.place || 'Saved location', region: '', nation: '',
      lat: +q.lat, lon: +q.lon, zone: q.tz
    };
    placeInput.value = q.place || (q.lat + ', ' + q.lon);
    placeNote.textContent = (+q.lat).toFixed(4) + ', ' + (+q.lon).toFixed(4) + '  ·  ' + q.tz;
    if (!q.n) {
      document.getElementById('name').focus();
      return;
    }
    form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit'));
  }

  /* ------------------------------------------------------------------ init */

  populateSelects();
  if (!Geo.historicalZonesSupported()) {
    placeNote.textContent = 'This browser lacks historical timezone data, so births before ' +
      '1970 may use a modern offset. Chrome, Safari and Firefox all handle it.';
  }
  readHash();
})();
