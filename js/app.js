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

  /*
   * Set while a saved chart is being reopened. Opening one runs the same submit
   * path as generating a new one, so without this it would save itself again on
   * every click: a pointless write, and one that bumps updated_at and quietly
   * reorders the list under the reader.
   */
  var reopeningSaved = false;

  /*
   * The saved row the chart on screen came from, if any. Editing keeps it, so
   * changing a birth time updates that row rather than leaving the old one
   * behind and adding a second, nearly identical entry to the list.
   */
  var currentEntry = null;

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

    // Read and clear it here, synchronously, so a failed submit cannot leave the
    // flag set and swallow the save of whatever is generated next.
    var reopening = reopeningSaved;
    reopeningSaved = false;

    var button = form.querySelector('button.primary');
    button.disabled = true;
    computeChart(params, function (chart, source) {
      button.disabled = false;
      lastChart = {
        chart: chart, place: place, offset: offset,
        name: nameValue, standard: standard, time: time, source: source,
        ayanamsa: params.ayanamsa, trueNode: params.trueNode,
        y: y, mo: mo, d: d, h: h, mi: mi
      };
      render(lastChart);
      writeHash(lastChart);
      // Already saved, by definition, when it came from the saved list.
      if (!reopening) saveCurrent(true);
      showChart();
      // The form's values now live in the chart and in the saved entry, so it
      // starts clean for the next person; "Edit these details" refills it.
      blankForm();
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

    // Just the name. The page is a chart; saying so in the heading of one adds
    // nothing, and a long name plus a possessive wraps on a phone.
    document.getElementById('result-name').textContent = state.name;

    var placeLabel = [place.name, place.region, place.nation].filter(Boolean).join(', ');
    document.getElementById('result-birth').textContent =
      state.d + ' ' + MONTHS_LONG[state.mo - 1] + ' ' + state.y + ', ' +
      state.time.hour12 + ':' + String(state.time.minute).padStart(2, '0') +
      (state.time.second ? ':' + String(state.time.second).padStart(2, '0') : '') + ' ' +
      state.time.meridiem.toUpperCase() +
      ' (' + (state.standard === 'lmt' ? 'LMT ' : 'UTC') + Geo.formatOffset(state.offset) + ')  ·  ' +
      placeLabel + '  ·  ' +
      Geo.formatDMS(place.lat, 'N', 'S') + ' ' + Geo.formatDMS(place.lon, 'E', 'W');

    /*
     * No summary tiles here any more. The lagna, both rashis and the janma
     * nakshatra were all repeated verbatim in the graha table a few hundred
     * pixels below, and saying them twice pushed the charts off the first
     * screen.
     */
    drawCharts();
    renderPanchang(c);
    renderDashas(c, state.offset);
    renderTechnical(state);
  }

  function planet(chart, name) {
    return chart.planets.filter(function (p) { return p.name === name; })[0];
  }

  /* --------------------------------------------------------- chart slots */

  /*
   * Two charts, side by side, each with its own division and its own first
   * house. Two at once is the point: a varga is read against the rashi chart,
   * and a graha's standing is read by rotating the same chart onto it, so
   * comparing is the work. Tabs would have made every comparison a click.
   */
  var SLOTS = ['a', 'b'];
  var REFERENCES = ['Ascendant', 'Sun', 'Moon', 'Mars', 'Jupiter', 'Venus',
    'Mercury', 'Saturn', 'Rahu', 'Ketu'];

  function populateSlotSelects() {
    SLOTS.forEach(function (slot, i) {
      var ref = document.getElementById('ref-' + slot);
      REFERENCES.forEach(function (name) {
        var opt = el('option', null, name === 'Ascendant' ? 'From the ascendant' : 'From the ' + name);
        opt.value = name;
        ref.appendChild(opt);
      });
      var varga = document.getElementById('varga-' + slot);
      Astro.VARGAS.forEach(function (v) {
        var opt = el('option', null, v.name + ' \u00b7 ' + v.label);
        opt.value = String(v.division);
        varga.appendChild(opt);
      });
      // The rashi chart beside the navamsa is the pairing people reach for.
      varga.value = i === 0 ? '1' : '9';
      [ref, varga].forEach(function (control) {
        control.addEventListener('change', function () { if (lastChart) drawSlot(slot); });
      });
    });
  }

  function slotSettings(slot) {
    return {
      reference: document.getElementById('ref-' + slot).value,
      division: +document.getElementById('varga-' + slot).value
    };
  }

  /** Draw one slot: its chart, its caption and its table. */
  function drawSlot(slot) {
    var state = lastChart;
    var set = slotSettings(slot);
    var varga = Astro.VARGAS.filter(function (v) { return v.division === set.division; })[0];

    Charts.render(document.getElementById('chart-' + slot), {
      style: styleSelect.value,
      planets: state.chart.planets,
      ascendant: state.chart.ascendant.longitude,
      division: set.division,
      reference: set.reference
    });

    var from = set.reference === 'Ascendant' ? 'from the ascendant' : 'from the ' + set.reference;
    document.getElementById('caption-' + slot).textContent =
      varga.name + ' \u00b7 ' + varga.label + ' \u2014 ' + varga.about + ', ' + from;
    document.getElementById('tab-table-' + slot).textContent = varga.name + ' \u00b7 ' + varga.label;
    renderSlotTable(slot, state.chart, set);
  }

  function drawCharts() {
    SLOTS.forEach(drawSlot);
  }

  /**
   * One table per chart, in whichever division that chart is showing.
   *
   * Houses are counted from the same reference the chart is rotated onto, so
   * the two always agree. Retrogression is carried over unchanged: it belongs
   * to the graha, not to the division it is being viewed in.
   */
  function renderSlotTable(slot, c, set) {
    var tbody = document.querySelector('#table-' + slot + ' tbody');
    tbody.innerHTML = '';

    var positionOf = function (longitude) { return Astro.vargaPosition(longitude, set.division); };
    var firstSign = positionOf(c.ascendant.longitude).sign;
    if (set.reference !== 'Ascendant') {
      var anchor = c.planets.filter(function (p) { return p.name === set.reference; })[0];
      if (anchor) firstSign = positionOf(anchor.longitude).sign;
    }

    var rows = [{ name: 'Ascendant', longitude: c.ascendant.longitude, isAscendant: true }]
      .concat(c.planets.map(function (p) {
        return { name: p.name, longitude: p.longitude, retrograde: p.retrograde };
      }));

    rows.forEach(function (r) {
      var v = positionOf(r.longitude);
      var nak = Astro.nakshatraOf(v.longitude);
      var tr = document.createElement('tr');
      if (r.isAscendant) tr.className = 'ascendant-row';
      [[r.name, null],
       [dms(v.degreeInSign), 'longitude'],
       [Astro.SIGNS[v.sign] + ' (' + Astro.SIGNS_SA[v.sign] + ')', null],
       [String(((v.sign - firstSign) % 12 + 12) % 12 + 1), 'numeric'],
       [nak.name, null],
       [String(nak.pada), 'numeric'],
       [nak.lord + ' / ' + nak.subLord, null],
       [r.isAscendant ? '\u2013' : (r.retrograde ? 'Retrograde' : 'Direct'), null],
       [(r.isAscendant ? '' : Astro.dignityOf(r.name, v.sign, v.degreeInSign)) || '\u2013', null]
      ].forEach(function (cell, i) {
        var td = el(i === 0 ? 'th' : 'td', cell[1], cell[0]);
        if (i === 0) td.setAttribute('scope', 'row');
        if (i === 1) td.title = 'Longitude ' + v.longitude.toFixed(4) + '\u00b0';
        if (i === 7 && r.retrograde) td.className = 'retro-flag';
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

  /* --------------------------------------------------- saved kundalis */

  /*
   * Saved charts are written here first and synced to astro_charts behind that,
   * so the panel updates without a round trip and the list still works offline.
   *
   * A chart is identified by the four things that define it: name, place, date
   * and time. Saving the same four again updates that entry instead of adding a
   * near-duplicate nobody can tell apart in a list.
   */
  var STORAGE_KEY = 'jyotisha.saved.v1';
  var TOKEN_KEY = 'jyotisha.owner.v1';
  var KUNDALI_API = 'https://deiefjnwbfcywsaaqqbs.supabase.co/functions/v1/kundalis';
  var savedList = document.getElementById('saved-list');
  var savedEmpty = document.getElementById('saved-empty');
  var savedNote = document.getElementById('saved-note');
  var saveFeedback = document.getElementById('save-feedback');
  var addButton = document.getElementById('add-kundali');
  var editButton = document.getElementById('edit-button');

  /*
   * There are no accounts, so ownership is a capability: a random token minted
   * once and kept in this browser. It is what scopes rows in astro_charts, so
   * clearing site data loses the link to them, and the same charts opened in
   * another browser are a different set.
   */
  function ownerToken() {
    try {
      var existing = window.localStorage.getItem(TOKEN_KEY);
      if (existing) return existing;
      var minted = (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 14);
      window.localStorage.setItem(TOKEN_KEY, minted);
      return minted;
    } catch (e) {
      return null; // private browsing: local only, no sync
    }
  }

  /** Rows come back in the database's spelling; the page uses its own. */
  function fromRow(row) {
    return {
      id: row.id,
      name: row.name,
      placeLabel: row.place_label,
      latitude: row.latitude,
      longitude: row.longitude,
      zone: row.zone,
      date: row.birth_date,
      time: String(row.birth_time).slice(0, 8),
      standard: row.time_standard,
      ayanamsa: row.ayanamsa,
      trueNode: row.true_node
    };
  }

  /** Talk to the saved-charts API; resolves to null rather than throwing. */
  function callKundaliApi(payload, done) {
    var token = ownerToken();
    if (!token || !window.fetch) return done(null);
    payload.ownerToken = token;
    var settled = false;
    var finish = function (value) { if (!settled) { settled = true; done(value); } };
    var timer = setTimeout(function () { finish(null); }, API_TIMEOUT_MS);
    fetch(KUNDALI_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-region': API_REGION },
      body: JSON.stringify(payload)
    }).then(function (res) { return res.ok ? res.json() : null; })
      .then(function (body) { clearTimeout(timer); finish(body && body.entries ? body.entries : null); })
      .catch(function () { clearTimeout(timer); finish(null); });
  }

  function readSaved() {
    try {
      var raw = window.localStorage.getItem(STORAGE_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return []; // private browsing, a full quota, or something else's data
    }
  }

  function writeSaved(list) {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      return false;
    }
  }

  function keyOf(entry) {
    return [entry.name, entry.placeLabel, entry.date, entry.time].join('\u0000').toLowerCase();
  }

  function renderSaved() {
    var list = readSaved();
    savedList.innerHTML = '';
    savedEmpty.hidden = list.length > 0;
    savedCount.textContent = list.length;
    savedCount.hidden = list.length === 0;

    list.forEach(function (entry, index) {
      var li = el('li', 'saved-item');

      var open = el('button', 'saved-open');
      open.type = 'button';
      open.appendChild(el('span', 'saved-name', entry.name));
      open.appendChild(el('span', 'saved-meta', entry.placeLabel));
      open.appendChild(el('span', 'saved-meta', formatSavedMoment(entry)));
      open.addEventListener('click', function () { loadSaved(entry); });
      li.appendChild(open);

      var remove = el('button', 'saved-remove', '\u00d7');
      remove.type = 'button';
      remove.title = 'Remove ' + entry.name;
      remove.setAttribute('aria-label', 'Remove ' + entry.name);
      remove.addEventListener('click', function () {
        var current = readSaved();
        var removed = current.splice(index, 1)[0];
        writeSaved(current);
        renderSaved();
        if (currentEntry && removed &&
            (removed.id ? removed.id === currentEntry.id : keyOf(removed) === keyOf(currentEntry))) {
          currentEntry = null;
        }
        if (removed && removed.id) {
          callKundaliApi({ action: 'delete', id: removed.id }, function (entries) {
            if (entries) { writeSaved(entries.map(fromRow)); renderSaved(); }
          });
        }
      });
      li.appendChild(remove);

      savedList.appendChild(li);
    });
  }

  /** "22 Mar 1985, 10:55 AM" from a saved entry's stored 24-hour time. */
  function formatSavedMoment(entry) {
    var d = entry.date.split('-').map(Number);
    var t = entry.time.split(':').map(Number);
    var clock = Geo.from24Hour(t[0]);
    return d[2] + ' ' + MONTHS[d[1] - 1] + ' ' + d[0] + ', ' +
      clock.hour12 + ':' + String(t[1] || 0).padStart(2, '0') +
      (t[2] ? ':' + String(t[2]).padStart(2, '0') : '') + ' ' + clock.meridiem.toUpperCase();
  }

  function saveCurrent(quiet) {
    if (!lastChart) return;
    var state = lastChart;
    var entry = {
      name: state.name,
      placeLabel: [state.place.name, state.place.region, state.place.nation].filter(Boolean).join(', '),
      date: state.y + '-' + String(state.mo).padStart(2, '0') + '-' + String(state.d).padStart(2, '0'),
      time: String(state.h).padStart(2, '0') + ':' + String(state.mi).padStart(2, '0') +
        ':' + String(state.time.second).padStart(2, '0'),
      latitude: state.place.lat,
      longitude: state.place.lon,
      zone: state.place.zone,
      standard: state.standard,
      ayanamsa: state.ayanamsa,
      trueNode: state.trueNode
    };

    /*
     * Which row this replaces. When a chart came from the saved list, it is that
     * row even if the name or the time has since been edited; otherwise it is
     * whichever row carries the same four keys.
     */
    if (currentEntry && currentEntry.id) entry.id = currentEntry.id;
    var list = readSaved();
    var at = -1;
    for (var i = 0; i < list.length; i++) {
      var same = currentEntry
        ? (currentEntry.id ? list[i].id === currentEntry.id : keyOf(list[i]) === keyOf(currentEntry))
        : keyOf(list[i]) === keyOf(entry);
      if (same) at = i;
    }
    if (at >= 0) list[at] = entry; else list.unshift(entry);

    var storedLocally = writeSaved(list);
    renderSaved();
    saveFeedback.textContent = storedLocally
      ? (at >= 0 ? 'Updated in your saved kundalis' : 'Saved to your kundalis')
      : 'This browser would not let the chart be saved.';

    // The local copy is written first so the panel updates immediately and keeps
    // working offline; the database is the shared copy, not the fast one.
    callKundaliApi({ action: 'save', entry: entry, id: entry.id }, function (entries) {
      if (entries) {
        writeSaved(entries.map(fromRow));
        renderSaved();
        savedNote.textContent = 'Saved to your kundalis and synced.';
        // Remember which row this chart is now, so a later edit updates it.
        currentEntry = entries.map(fromRow).filter(function (e) {
          return keyOf(e) === keyOf(entry);
        })[0] || currentEntry;
      } else {
        savedNote.textContent = 'Saved in this browser. Syncing was not possible.';
        currentEntry = entry;
      }
    });
    if (!quiet) setTimeout(function () { saveFeedback.textContent = ''; }, 4000);
  }

  /** Put a saved chart back into the form and cast it again. */
  function loadSaved(entry) {
    currentEntry = entry;
    document.getElementById('name').value = entry.name;
    document.getElementById('date').value = entry.date;
    var t = entry.time.split(':').map(Number);
    writeTime(t[0], t[1] || 0, t[2] || 0);
    document.getElementById('ayanamsa').value = entry.ayanamsa || 'lahiri';
    document.getElementById('node-type').value = entry.trueNode ? 'true' : 'mean';
    document.getElementById('time-standard').value = entry.standard === 'lmt' ? 'lmt' : 'zone';

    selectedCity = {
      name: entry.placeLabel.split(',')[0], region: '', nation: '',
      lat: entry.latitude, lon: entry.longitude, zone: entry.zone
    };
    placeInput.value = entry.placeLabel;
    placeNote.textContent = entry.latitude.toFixed(4) + ', ' + entry.longitude.toFixed(4) + '  ·  ' + entry.zone;
    manualFields.hidden = true;
    reopeningSaved = true;
    activateTab('chart');
    form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit'));
  }

  /* ------------------------------------------------------------- tabs */

  /*
   * Three sections, one on screen at a time: the saved list, the form, and the
   * chart. "Add a kundali" is home, because an empty page with a form on it is
   * self-explanatory in a way an empty chart is not.
   */
  /**
   * Wire one strip of tabs. Two of them exist - the page's sections, and the
   * divisional charts within one of those - so this is written once and given
   * the names each time.
   */
  function setupTabs(names, strip, options) {
    var buttons = {}, panels = {}, active = names[0];
    names.forEach(function (name) {
      buttons[name] = document.getElementById('tab-' + name);
      panels[name] = document.getElementById('panel-' + name);
    });

    function activate(name, moveFocus) {
      active = name;
      names.forEach(function (other) {
        var selected = other === name;
        buttons[other].setAttribute('aria-selected', String(selected));
        buttons[other].tabIndex = selected ? 0 : -1;
        panels[other].hidden = !selected;
      });
      if (moveFocus) buttons[name].focus();
      if (options && options.scrollToTop) window.scrollTo({ top: 0, behavior: 'smooth' });
      if (options && options.onChange) options.onChange(name);
    }

    names.forEach(function (name) {
      buttons[name].addEventListener('click', function () { activate(name); });
    });

    strip.addEventListener('keydown', function (e) {
      var step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (step) {
        e.preventDefault();
        activate(names[(names.indexOf(active) + step + names.length) % names.length], true);
      } else if (e.key === 'Home') {
        e.preventDefault(); activate(names[0], true);
      } else if (e.key === 'End') {
        e.preventDefault(); activate(names[names.length - 1], true);
      }
    });

    return { activate: activate, current: function () { return active; } };
  }

  var emptyChart = document.getElementById('empty-chart');
  var savedCount = document.getElementById('saved-count');

  var sections = setupTabs(['saved', 'add', 'chart'],
    document.querySelector('.tabs:not(.subtabs)'), { scrollToTop: true });

  /*
   * The two graha tables share one strip, labelled from whichever divisions the
   * charts are set to. Fixed D1/D9 labels would have lied the moment either
   * select moved.
   */
  var tableTabs = setupTabs(['table-a', 'table-b'], document.querySelector('.tabs.subtabs'));

  function activateTab(name, moveFocus) { sections.activate(name, moveFocus); }

  /** Empty the form so the next chart starts from nothing. */
  function blankForm() {
    document.getElementById('name').value = '';
    document.getElementById('date').value = '';
    hourInput.value = ''; minuteInput.value = ''; secondInput.value = '';
    meridiemSelect.value = 'am';
    placeInput.value = '';
    placeNote.textContent = '';
    selectedCity = null;
    manualFields.hidden = true;
    manualToggle.setAttribute('aria-expanded', 'false');
    errorBox.textContent = '';
  }

  /** Put a chart's details back into the form, so they can be corrected. */
  function fillForm(state) {
    document.getElementById('name').value = state.name;
    document.getElementById('date').value = state.y + '-' +
      String(state.mo).padStart(2, '0') + '-' + String(state.d).padStart(2, '0');
    writeTime(state.h, state.mi, state.time.second);
    document.getElementById('time-standard').value = state.standard === 'lmt' ? 'lmt' : 'zone';
    document.getElementById('ayanamsa').value = state.ayanamsa;
    document.getElementById('node-type').value = state.trueNode ? 'true' : 'mean';
    selectedCity = state.place;
    placeInput.value = [state.place.name, state.place.region, state.place.nation].filter(Boolean).join(', ');
    placeNote.textContent = state.place.lat.toFixed(4) + ', ' + state.place.lon.toFixed(4) +
      '  \u00b7  ' + state.place.zone;
    manualFields.hidden = true;
    manualToggle.setAttribute('aria-expanded', 'false');
    errorBox.textContent = '';
  }

  function showForm(blank) {
    if (blank) {
      blankForm();
      currentEntry = null;   // a fresh form means a new chart, not an edit
    } else if (lastChart) {
      fillForm(lastChart);
    }
    activateTab('add');
    document.getElementById('name').focus();
  }

  function showChart() {
    emptyChart.hidden = true;
    result.hidden = false;
    activateTab('chart');
  }

  addButton.addEventListener('click', function () { showForm(true); });
  editButton.addEventListener('click', function () { showForm(false); });

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
  populateSlotSelects();
  renderSaved();
  /*
   * Charts saved before this browser could reach the database have no id. Push
   * them up once, then take the server's list as the truth. Without this they
   * would sit in localStorage forever, invisible from anywhere else, which is
   * exactly what someone who pressed save would not expect.
   */
  (function syncSavedCharts() {
    var local = readSaved();
    var orphans = local.filter(function (entry) { return !entry.id; });
    var remaining = orphans.length;

    var listThenRender = function () {
      callKundaliApi({ action: 'list' }, function (entries) {
        if (entries) { writeSaved(entries.map(fromRow)); renderSaved(); }
      });
    };

    if (!remaining) return listThenRender();
    orphans.forEach(function (entry) {
      callKundaliApi({ action: 'save', entry: entry }, function () {
        if (--remaining === 0) listThenRender();
      });
    });
  })();
  if (!Geo.historicalZonesSupported()) {
    placeNote.textContent = 'This browser lacks historical timezone data, so births before ' +
      '1970 may use a modern offset. Chrome, Safari and Firefox all handle it.';
  }
  readHash();
})();
