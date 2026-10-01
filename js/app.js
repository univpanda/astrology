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
  var pendingFlagged = false;

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
  /** Degrees, minutes and seconds of an angle, rounded once and split. */
  function dmsParts(deg) {
    var total = Math.round(deg * 3600);
    var d = Math.floor(total / 3600);
    var m = Math.floor((total - d * 3600) / 60);
    return { d: d, m: m, s: total - d * 3600 - m * 60 };
  }

  function dms(deg) {
    var p = dmsParts(deg);
    return p.d + '° ' + String(p.m).padStart(2, '0') + "' " +
      String(p.s).padStart(2, '0') + '"';
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

  /*
   * A place's full label, kept on the object once it is known.
   *
   * Reopening a saved chart used to rebuild the place from its label's first
   * comma-separated piece with the region and country left blank, and the next
   * save recomposed the label from those - so "Cuttack, Odisha, India" came
   * back as "Cuttack" and stayed that way.
   */
  function placeLabelOf(place) {
    if (!place) return '';
    return place.label || [place.name, place.region, place.nation].filter(Boolean).join(', ');
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

    fillZones(FALLBACK_ZONES);

    /*
     * Four groupings, narrowest first. Shodasavarga is the default because it is
     * the whole of what the module can divide; the narrower ones are the sets
     * vimsopaka bala is more often actually scored over.
     */
    var schemeSelect = document.getElementById('varga-scheme');
    Astro.VARGA_SCHEME_ORDER.forEach(function (key) {
      var s = Astro.VARGA_SCHEMES[key];
      var opt = el('option', null, s.label + ' \u00b7 ' + s.count + ' divisions');
      opt.value = key;
      if (key === 'shodasavarga') opt.selected = true;
      schemeSelect.appendChild(opt);
    });
    schemeSelect.addEventListener('change', function () {
      if (lastChart) renderVargas(lastChart);
    });

    fillDivisionPickers();

    ['table', 'charts'].forEach(function (which) {
      document.getElementById('vargas-as-' + which).addEventListener('click', function () {
        showVargaView(which === 'charts');
      });
    });
    ['table', 'chart'].forEach(function (which) {
      document.getElementById('shadbala-as-' + which).addEventListener('click', function () {
        showShadbalaView(which === 'chart');
      });
    });
  }

  /*
   * Enough zones to be useful before the 3 MB city table has loaded. The full
   * list replaces these the moment it is available.
   */
  var FALLBACK_ZONES = ['Asia/Kolkata', 'Asia/Karachi', 'Asia/Dhaka', 'Asia/Kathmandu',
    'Asia/Colombo', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'Europe/Paris',
    'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney', 'UTC'];

  /**
   * Fill the timezone select, keeping whatever was already chosen.
   *
   * Intl.supportedValuesOf('timeZone') used to be the source, and it was the
   * wrong one twice over. Current ICU builds still call the zone Asia/Calcutta,
   * so "Asia/Kolkata" was not in the list at all and the line meant to preselect
   * it never matched - which left the select sitting on its first entry,
   * Africa/Abidjan. An Indian birth entered by coordinates was computed five and
   * a half hours out, silently, with a chart that looked perfectly ordinary.
   */
  function fillZones(list) {
    var zoneSelect = document.getElementById('manual-zone');
    var keep = zoneSelect.value;
    zoneSelect.innerHTML = '';
    list.forEach(function (z) {
      var opt = el('option', null, z);
      opt.value = z;
      zoneSelect.appendChild(opt);
    });
    var wanted = list.indexOf(keep) >= 0 ? keep : 'Asia/Kolkata';
    zoneSelect.value = list.indexOf(wanted) >= 0 ? wanted : list[0];
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
    if (show) {
      document.getElementById('manual-lat-d').focus();
      // Swap the placeholder list for every zone real places actually use.
      Geo.ensure(function (err) { if (!err) fillZones(Geo.zones()); });
    }
  });

  /* ------------------------------------------------------------ date field */

  var dayInput = document.getElementById('birth-day');
  var monthInput = document.getElementById('birth-month');
  var yearInput = document.getElementById('birth-year');

  /**
   * Read the typed date. Returns either an `error` to show, or the three parts
   * and the ISO spelling the rest of the page stores and compares on.
   *
   * Every part is required. A date picker would have refused an impossible one
   * on its own; typed boxes will take 31 February, so the day is checked
   * against the month and the year it was typed beside rather than against 31.
   */
  function readDate() {
    var dayText = dayInput.value.trim();
    var monthText = monthInput.value.trim();
    var yearText = yearInput.value.trim();
    if (!dayText && !monthText && !yearText) return { error: 'Enter a date of birth.' };
    if (!/^\d{1,2}$/.test(dayText)) return { error: 'Enter the day as a number from 1 to 31.' };
    if (!/^\d{1,2}$/.test(monthText)) return { error: 'Enter the month as a number from 1 to 12.' };
    if (!/^\d{4}$/.test(yearText)) return { error: 'Enter the year in full, all four digits.' };
    var d = +dayText, mo = +monthText, y = +yearText;
    if (mo < 1 || mo > 12) return { error: 'The month must be from 1 to 12.' };
    if (y < 1800 || y > 2100) return { error: 'The year must be from 1800 to 2100.' };
    var last = [31, (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28,
      31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mo - 1];
    if (d < 1 || d > last) {
      return { error: 'The day must be from 1 to ' + last + ' in that month.' };
    }
    return { y: y, mo: mo, d: d,
      iso: y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0') };
  }

  /** Put a date into the boxes, from the "yyyy-mm-dd" the page stores. */
  function writeDate(iso) {
    var parts = String(iso || '').split('-');
    if (parts.length !== 3) { dayInput.value = monthInput.value = yearInput.value = ''; return; }
    yearInput.value = parts[0];
    monthInput.value = String(+parts[1]).padStart(2, '0');
    dayInput.value = String(+parts[2]).padStart(2, '0');
  }

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
  [[hourInput, minuteInput, 1], [minuteInput, secondInput, 5], [secondInput, null, 5],
   // A day past 3 cannot gain a digit, nor a month past 1.
   [dayInput, monthInput, 3], [monthInput, yearInput, 1]]
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

  // The year takes four and hands focus nowhere: it is the last of the three.
  yearInput.addEventListener('input', function () {
    var digits = yearInput.value.replace(/\D/g, '').slice(0, 4);
    if (digits !== yearInput.value) yearInput.value = digits;
  });

  /* ---------------------------------------------------------------- submit */

  /**
   * One coordinate, read as degrees, minutes, seconds and a hemisphere.
   *
   * This is the form an atlas, a panchang or a birth record gives, so it is the
   * form that gets typed. Signed decimals were the field before, and a dropped
   * minus is not a visible mistake: it silently moves the birth into the other
   * hemisphere and the chart still looks plausible. A letter cannot be dropped.
   *
   * Returns { value } or { error }. It returns a reason rather than just null
   * because the caller used to collapse every failure into one generic sentence
   * about picking a place, which told nobody which box was wrong.
   *
   * Forgiving where forgiving is unambiguous: a decimal in the degrees box on its
   * own is a coordinate off a map and is taken as one, and a negative degree is
   * someone carrying over the old signed field, so the sign is moved into the
   * hemisphere rather than thrown back at them.
   */
  function readDms(which, maxDegrees) {
    var name = which === 'lat' ? 'Latitude' : 'Longitude';
    var box = function (part) { return document.getElementById('manual-' + which + '-' + part); };
    var degText = box('d').value.trim(), minText = box('m').value.trim(), secText = box('s').value.trim();

    if (degText === '') {
      return { error: minText || secText
        ? name + ' needs its degrees, not only minutes and seconds.'
        : name + ' is empty. Type its degrees, and minutes and seconds if you have them.' };
    }

    var deg = +degText, min = minText === '' ? 0 : +minText, sec = secText === '' ? 0 : +secText;
    if (!isFinite(deg) || !isFinite(min) || !isFinite(sec)) {
      return { error: name + ' has something in it that is not a number.' };
    }
    if (min < 0 || sec < 0) return { error: name + ' cannot have negative minutes or seconds.' };
    if (min >= 60) return { error: name + ' minutes must be under 60.' };
    if (sec >= 60) return { error: name + ' seconds must be under 60.' };

    /*
     * A minus here means the old signed field. Move it into the hemisphere and
     * show that, rather than refusing something that was perfectly clear.
     */
    var hemisphereBox = box('h');
    if (deg < 0) {
      deg = -deg;
      hemisphereBox.value = which === 'lat' ? 'S' : 'W';
      box('d').value = String(deg);
    }

    if (deg % 1 !== 0 && (minText !== '' || secText !== '')) {
      return { error: name + ' is part decimal and part minutes. Use whole degrees with ' +
        'minutes and seconds, or a decimal on its own.' };
    }

    /*
     * The minutes are required where the degrees are whole. A degree on its own
     * is up to 60 nautical miles from the birthplace, which moves the lagna
     * about half a degree and the navamsa lagna in one chart in six: the same
     * error as being three minutes out about the birth time, and far too much
     * to take from a box somebody left empty because it looked optional. A
     * decimal carries its own minutes, so it is exempt.
     *
     * Zero is accepted, typed. A record that genuinely gives a whole degree is
     * a real thing, and refusing it outright would leave no way to say so.
     */
    if (deg % 1 === 0 && minText === '') {
      return { error: name + ' needs its minutes. A whole degree on its own can be 60 ' +
        'miles from the birthplace, which moves the lagna about half a degree. Type 0 ' +
        'if the record gives none.' };
    }

    var total = deg + min / 60 + sec / 3600;
    if (total > maxDegrees) {
      return { error: name + ' cannot be more than ' + maxDegrees + '\u00b0.' };
    }
    var hemisphere = hemisphereBox.value;
    return { value: hemisphere === 'S' || hemisphere === 'W' ? -total : total };
  }

  /*
   * Echo the decimal back as it is typed. The conversion is the step where a
   * mistake hides, so it is shown rather than done silently.
   */
  function showDecimal(which, maxDegrees) {
    var out = document.getElementById(which === 'lat' ? 'lat-decimal' : 'lon-decimal');
    var parts = ['d', 'm', 's'].map(function (part) {
      return document.getElementById('manual-' + which + '-' + part).value.trim();
    });
    if (parts[0] === '') { out.textContent = ''; return; }
    var read = readDms(which, maxDegrees);
    out.textContent = read.error ? read.error : read.value.toFixed(4) + '\u00b0';
    out.className = 'dms-decimal' + (read.error ? ' dms-bad' : '');
  }

  /*
   * Once a zone has been chosen by hand it is never overwritten. Guessing over
   * someone's deliberate choice is worse than not guessing.
   */
  var zoneChosenByHand = false;
  var zoneResolvedFor = '';
  var zoneRequest = 0;

  function coordinateKey(lat, lon) {
    return lat.toFixed(7) + ',' + lon.toFixed(7);
  }

  document.getElementById('manual-zone').addEventListener('change', function () {
    zoneChosenByHand = true;
    zoneResolvedFor = '';
    zoneRequest += 1; // any lookup already in flight must not overwrite this choice
    document.getElementById('zone-note').textContent = '';
  });

  /**
   * Name the timezone from the coordinates themselves.
   *
   * The question this answers is the one the form otherwise pushes back onto the
   * reader: a clock time needs a UTC offset, and longitude cannot supply it
   * because zones are political. But the city table already knows the zone of
   * every populated place, so the nearest one answers it, and the place it came
   * from is shown so a wrong guess is visible rather than buried.
   */
  function deriveZone() {
    if (zoneChosenByHand) return;
    var note = document.getElementById('zone-note');
    var lat = readDms('lat', 90), lon = readDms('lon', 180);
    if (lat.error || lon.error) { zoneResolvedFor = ''; note.textContent = ''; return; }
    var key = coordinateKey(lat.value, lon.value);
    var request = ++zoneRequest;
    zoneResolvedFor = '';
    note.textContent = 'Finding the timezone…';
    note.className = 'dms-decimal';
    Geo.ensure(function (err) {
      if (request !== zoneRequest || zoneChosenByHand) return;
      if (err) {
        note.textContent = 'The timezone could not be found. Choose it from the list.';
        note.className = 'dms-decimal dms-bad';
        return;
      }
      var city = Geo.nearest(lat.value, lon.value);
      if (!city) {
        note.textContent = 'The timezone could not be found. Choose it from the list.';
        note.className = 'dms-decimal dms-bad';
        return;
      }
      fillZones(Geo.zones());
      document.getElementById('manual-zone').value = city.zone;
      zoneResolvedFor = key;
      /*
       * Distance is the thing to say out loud. A near match is almost always
       * right; a far one means the closest populated place may be across a
       * border, which is the only way this guess goes wrong. A point just inside
       * North Dakota takes its nearest town from Manitoba, 63 km off.
       */
      var far = city.km > 50;
      note.textContent = city.zone + ', from ' + Geo.label(city) + ', ' +
        (city.km < 1 ? 'under a kilometre' : city.km.toFixed(0) + ' km') + ' away.' +
        (far ? ' That is far enough to be across a border, so check it.' : '');
      note.className = 'dms-decimal' + (far ? ' dms-bad' : '');
    });
  }

  ['lat', 'lon'].forEach(function (which) {
    var max = which === 'lat' ? 90 : 180;
    ['d', 'm', 's', 'h'].forEach(function (part) {
      ['input', 'change'].forEach(function (evt) {
        document.getElementById('manual-' + which + '-' + part).addEventListener(evt, function () {
          /*
           * Typing a coordinate means using it. resolvePlace answers with the
           * chosen city before it ever looks at these boxes, and only opening the
           * panel used to clear that, so editing a coordinate while the panel
           * was already open changed nothing: the chart cast, saved, and reopened
           * on the old place, with no error anywhere to say why.
           *
           * Restoring a saved chart sets these boxes in code, which fires no
           * events, so reopening still keeps its city.
           */
          selectedCity = null;
          placeNote.textContent = '';
          showDecimal(which, max);
          deriveZone();
        });
      });
    });
  });

  /** Where is the birth? Either a chosen city or the manual coordinates. */
  /**
   * Put a place's coordinates into the manual boxes.
   *
   * Reopening a saved chart filled in its name and its note but left these
   * empty, so a custom place came back with nowhere to see its own coordinates,
   * and opening the panel to change one meant retyping both from scratch. Worse,
   * opening the panel drops the chosen city, so a saved chart reopened and
   * submitted without retyping had no place at all.
   *
   * Stored coordinates are decimal, so the minutes and seconds here are derived
   * rather than the ones originally typed. Seconds keep their fraction so the
   * value round-trips to well under a milliarcsecond.
   */
  function writeCoords(lat, lon, zone) {
    [['lat', lat, 'N', 'S'], ['lon', lon, 'E', 'W']].forEach(function (p) {
      var which = p[0], signed = p[1], abs = Math.abs(signed);
      var deg = Math.floor(abs);
      var min = Math.floor((abs - deg) * 60);
      var sec = Math.round(((abs - deg) * 60 - min) * 60 * 1e4) / 1e4;
      if (sec >= 60) { sec -= 60; min += 1; }          // carry, so 59.99996" never shows as 60
      if (min >= 60) { min -= 60; deg += 1; }
      document.getElementById('manual-' + which + '-d').value = String(deg);
      document.getElementById('manual-' + which + '-m').value = String(min);
      document.getElementById('manual-' + which + '-s').value = sec ? String(sec) : '';
      document.getElementById('manual-' + which + '-h').value = signed < 0 ? p[3] : p[2];
      var echo = document.getElementById(which + '-decimal');
      echo.textContent = signed.toFixed(4) + '\u00b0';
      echo.className = 'dms-decimal';
    });

    // The saved zone may not be in the short list yet, the city table being lazy.
    if (zone) {
      var sel = document.getElementById('manual-zone');
      var known = Array.prototype.some.call(sel.options, function (o) { return o.value === zone; });
      if (!known) { var opt = el('option', null, zone); opt.value = zone; sel.appendChild(opt); }
      sel.value = zone;
    }
    document.getElementById('zone-note').textContent = '';
  }

  /**
   * Where is the birth? A chosen city, or the manual coordinates.
   *
   * Typed coordinates count whether or not the panel happens to be open. It was
   * gated on the panel being visible, so collapsing it silently discarded what
   * had been typed into it.
   *
   * Returns { place } or { error }, the error naming the box at fault.
   */
  function resolvePlace() {
    if (selectedCity) return { place: selectedCity };

    var typed = ['lat', 'lon'].some(function (which) {
      return ['d', 'm', 's'].some(function (part) {
        return document.getElementById('manual-' + which + '-' + part).value.trim() !== '';
      });
    });
    if (manualFields.hidden && !typed) {
      return { error: 'Pick a place from the list, or open "Enter coordinates" and type ' +
        'latitude and longitude.' };
    }

    var lat = readDms('lat', 90);
    if (lat.error) return { error: lat.error };
    var lon = readDms('lon', 180);
    if (lon.error) return { error: lon.error };

    if (!zoneChosenByHand && zoneResolvedFor !== coordinateKey(lat.value, lon.value)) {
      return { error: 'Wait for the timezone to be filled in, or choose it from the list.' };
    }

    return { place: {
      name: placeInput.value.trim() || 'Custom location',
      region: '', nation: '',
      lat: lat.value, lon: lon.value,
      zone: document.getElementById('manual-zone').value, manual: true
    } };
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errorBox.textContent = '';

    /*
     * Read and cleared here, before anything can return: the comment always
     * said synchronously and the code did it after the validation, so a submit
     * that was refused left the flag standing and swallowed the save of
     * whatever was generated next.
     */
    var reopening = reopeningSaved;
    reopeningSaved = false;
    // The same, for the flag on the record being reopened.
    var flagged = pendingFlagged;
    pendingFlagged = false;

    var nameValue = document.getElementById('name').value.trim();
    var genderValue = document.getElementById('gender').value;
    var date = readDate();
    var time = readTime();
    var resolved = resolvePlace();
    var place = resolved.place;

    if (!nameValue) return fail('Enter the name this chart belongs to.');
    /*
     * Asked of a new chart and not of an old one. Gender changes no calculation
     * here, some classical readings turn on it, and the stored record allows it
     * to be unstated - so a chart saved without one could not be reopened at
     * all: the refusal landed in this box on a tab the reader had just been
     * taken off, and the chart tab sat empty with nothing to say why.
     */
    if (!genderValue && !reopening) return fail('Choose a gender.');
    if (date.error) return fail(date.error);
    if (time.error) return fail(time.error);
    if (!place) return fail(resolved.error);

    var dateValue = date.iso;
    var y = date.y, mo = date.mo, d = date.d;
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
        ayanamsa: params.ayanamsa, trueNode: params.trueNode,
        gender: genderValue,
        celebrity: document.getElementById('celebrity').checked,
        flagged: flagged,
        note: document.getElementById('person-note').value.trim(),
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
    /*
     * Every chart passes through here, from the service or from this browser,
     * and leaves with its grahas in the engine's order. The service assembles
     * with whatever copy of astro.js was deployed alongside it, so a copy a few
     * weeks behind returned them in the order it knew - which is how the tables
     * came to be listed Sun, Moon, Mars, Jupiter, Venus, Mercury, Saturn long
     * after the engine here had been changed. Sorting on arrival makes the
     * order this file's answer rather than the answer of whichever side of the
     * wire happened to build the chart.
     */
    var finish = function (chart, source) {
      if (settled) return;
      settled = true;
      if (chart && chart.planets) chart.planets = Astro.inGrahaOrder(chart.planets);
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
    /*
     * This box lives on the Add tab. A submit raised from the saved list is
     * refused just the same, and writing the reason onto a panel the reader is
     * not looking at is the same as saying nothing.
     */
    var panel = document.getElementById('panel-add');
    if (panel && panel.hidden) activateTab('add');
    return false;
  }

  /* ---------------------------------------------------------------- render */

  function render(state) {
    var c = state.chart, place = state.place;
    /*
     * Stamp Mercury's reading onto the chart before anything reads it. The
     * yogas, the kartari marks and the strength table each ask astro.js
     * independently whether he is benefic, and a setting honoured by only one
     * of them would have the same chart answering differently tab by tab.
     */
    if (c) c.mercuryNature = document.getElementById('mercury-nature').value;
    /*
     * Same reason, same place: the yogas are detected in three separate spots -
     * the Yogas tab, the graha card and the divisional read - and a floor
     * honoured by one of them would have the chart disagreeing with itself.
     */
    if (c) c.budhaAdityaFloor = document.getElementById('budha-floor').value;
    /*
     * Two facts about the native rather than about the sky, both of which
     * Mahabhagya turns on. The sex is asked for on the form already; whether
     * the birth was by day is worked out here, from the real sunrise and sunset
     * for the place, because a detector is handed a chart and not a place.
     *
     * Left undefined rather than guessed when either is missing, so the finding
     * can say what it is resting on instead of pretending to know.
     */
    if (c) {
      c.gender = state.gender && state.gender !== 'unstated' ? state.gender : undefined;
      c.dayBirth = undefined;
      if (place && c.julianDay !== undefined) {
        var up = Astro.sunriseSunset(c.julianDay, place.lat, place.lon, false);
        var down = Astro.sunriseSunset(c.julianDay, place.lat, place.lon, true);
        if (up !== null && down !== null) {
          c.dayBirth = c.julianDay > up && c.julianDay < down;
        }
      }
    }

    // Just the name. The page is a chart; saying so in the heading of one adds
    // nothing, and a long name plus a possessive wraps on a phone.
    var heading = document.getElementById('result-name');
    heading.textContent = state.name;
    if (state.celebrity) heading.appendChild(el('span', 'celebrity-mark', CELEBRITY_MARK));
    showFlagOnChart();

    var noteLine = document.getElementById('result-note');
    noteLine.textContent = state.note || '';
    noteLine.hidden = !state.note;

    var placeLabel = placeLabelOf(place);
    document.getElementById('result-birth').textContent =
      state.d + ' ' + MONTHS_LONG[state.mo - 1] + ' ' + state.y + ', ' +
      state.time.hour12 + ':' + String(state.time.minute).padStart(2, '0') +
      (state.time.second ? ':' + String(state.time.second).padStart(2, '0') : '') + ' ' +
      state.time.meridiem.toUpperCase() +
      ' (' + (state.standard === 'lmt' ? 'LMT ' : 'UTC') + Geo.formatOffset(state.offset) + ')  ·  ' +
      placeLabel + '  ·  ' +
      Geo.formatDMS(place.lat, 'N', 'S') + ' ' + Geo.formatDMS(place.lon, 'E', 'W') +
      (state.gender && state.gender !== 'unstated'
        ? '  \u00b7  ' + state.gender.charAt(0).toUpperCase() + state.gender.slice(1) : '');

    /*
     * No summary tiles here any more. The lagna, both rashis and the janma
     * nakshatra were all repeated verbatim in the graha table a few hundred
     * pixels below, and saying them twice pushed the charts off the first
     * screen.
     */
    drawCharts();
    renderShadbala(state);
    renderVargas(state);
    renderYogas(state);
    renderAspects(state);
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

  /*
   * The value a picker carries when it is not narrowing anything. Distinct
   * from the empty string, which a division picker would read as 1.
   */
  var EVERY = 'every';

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
      ref.addEventListener('change', function () {
        if (!lastChart) return;
        drawSlot(slot);
        renderGrahaTable(lastChart);       // houses and [Y] are counted from house 1
      });
      /*
       * Both selectors redraw the slot, and the yogas marked on it are read from
       * whatever the slot now shows: the division says which chart, the rotation
       * says where its houses start. Neither touches the Yogas tab, which reads
       * the whole chart from the ascendant and carries its own division.
       */
      varga.addEventListener('change', function () {
        if (!lastChart) return;
        drawSlot(slot);
        renderGrahaTable(lastChart);       // a different division is a different row
      });
    });
  }

  /*
   * How each graha stands in the sign it occupies, for the hover card.
   *
   * Two things, because either alone leaves a gap. Dignity answers where the
   * graha is exalted, debilitated, in its own sign or its moolatrikona - and
   * says nothing at all for the majority of placements, which have none of
   * those. The relation with the lord of the sign answers those: a graha in a
   * friend's sign is in a different position from one in an enemy's, and that
   * is most of what dignity means when there is no formal dignity to report.
   *
   * Friendship is read from the rashi even when a division is on screen, which
   * is where the classical rule puts it and why this is computed here rather
   * than inside the renderer.
   */
  /*
   * Which chart the temporal half of a relation is counted in. Read where it is
   * used rather than threaded through, the way every other scheme setting on
   * this page is, so changing it needs no chart to be rebuilt by hand.
   */
  function tatkalikaSetting() {
    return document.getElementById('tatkalika').value;
  }

  /** How the hora is judged: by chapter 7's own rule, or by the sign's lord. */
  function horaSetting() {
    return document.getElementById('hora-dignity').value;
  }

  /** And which reading of Mercury being effective in both horas. */
  function horaMercurySetting() {
    return document.getElementById('hora-mercury').value;
  }

  /* Which of the two rungs saptavargaja bala is scored on. */
  function ladderSetting() {
    var el2 = document.getElementById('saptavargaja-ladder');
    return el2 ? el2.value : 'parashara';
  }

  /* The compact form shared by the table and the graha highlight card. */
  var RELATION_SHORT = {
    'great friend': 'GF', 'friend': 'F', 'neutral': 'N',
    'enemy': 'E', 'great enemy': 'GE'
  };

  function dignitiesByGraha(state, division, tatkalika, horaRule, horaMercury) {
    var d1 = {};
    state.chart.planets.forEach(function (p) { d1[p.name] = p; });

    var nakOf = function (p) { return Astro.nakshatraOf(p.longitude); };

    /** The compound relation from a graha to another, as the table reads it. */
    var relationBetween = function (p, other, at) {
      if (!other || other === p.name || !at[other]) return '';
      var apart = ((Astro.signOf(at[other].longitude) - Astro.signOf(p.longitude)) % 12 + 12) % 12 + 1;
      var rel = Astro.compoundRelation(p.name, other, apart);
      return rel ? RELATION_SHORT[Astro.RELATION_LABELS[rel]] : '';
    };

    var map = {};
    state.chart.planets.forEach(function (p) {
      var displayed = Astro.vargaPosition(p.longitude, division);
      /*
       * The displayed dignity and the bala rung are two consumers of the same
       * divisional position. vargaDignity selects the rung required by the
       * varga-viswa calculation; it must not suppress a positional dignity on
       * the chart merely because that bala does not score it separately.
       */
      var displayedDignity = Astro.dignityOf(p.name, displayed.sign,
        displayed.degreeInSign);
      var standing = Astro.vargaDignity(p.name, p.longitude, division, d1, tatkalika, horaRule,
        horaMercury);
      if (!standing) {
        /*
         * Nodes are deliberately outside the varga-viswa scale, but that only
         * means this bala has no rung for them. Their positional dignity is a
         * separate display fact and remains available to the chart and card.
         */
        if (Astro.NODES.indexOf(p.name) < 0) return;
        map[p.name] = {
          formal: displayedDignity || '', lord: '', relation: '',
          nakLordRelation: relationBetween(p, nakOf(p).lord, d1),
          subLordRelation: relationBetween(p, nakOf(p).subLord, d1)
        };
        return;
      }
      /*
       * The parts rather than a sentence. The card names the lord beside the
       * sign and puts special dignity among the graha's conditions, so a
       * string reading "In Mars's sign, an enemy" would have to be taken apart
       * again at the other end.
       */
      var lord = standing.lord;
      var owned = lord && lord === p.name;
      map[p.name] = {
        formal: displayedDignity === 'Own Sign' ? 'Own sign' : displayedDignity || '',
        /*
         * How the graha regards the lords of its nakshatra and sub. Both are
         * relationships from this graha to another, so
         * they are worked out here where every position is to hand rather than
         * in the renderer, which sees one graha at a time.
         */
        nakLordRelation: relationBetween(p, nakOf(p).lord, d1),
        subLordRelation: relationBetween(p, nakOf(p).subLord, d1),
        // Its own dispositor is still its dispositor, and saying so is shorter
        // than the reader working out that Mars in Aries has nobody to answer.
        lord: lord || '',
        relation: owned ? 'Own'
          : !standing.relation || standing.relation === 'moolatrikona'
            ? '' : RELATION_SHORT[Astro.RELATION_LABELS[standing.relation]]
      };
    });
    return map;
  }

  /*
   * Which grahas are hemmed in the division on screen, and by whom.
   *
   * The graha table has shown these as [P] and [S] since they existed; the
   * hover card did not, so the same chart said a graha was hemmed in one place
   * and stayed silent about it in the other. The card is where the reason
   * fits, so it is the place the omission mattered most.
   *
   * Benefics are judged in the rashi, as everywhere else on this site, while
   * the neighbours are read in the division being drawn - a graha's company
   * changes with the recast, its nature does not.
   */
  function hemmingByGraha(state, division) {
    var chart = division === 1 ? state.chart
      : Astro.chartInDivision(state.chart, division);
    var benefics = Astro.naturalBenefics(state.chart);
    var marks = {};
    chart.planets.forEach(function (p) {
      var wants = Astro.hemmedByMalefics(p.name, p.sign, chart, benefics) ? false
        : Astro.hemmedByBenefics(p.name, p.sign, chart, benefics) ? true : null;
      if (wants === null) return;
      var side = function (sign) {
        return chart.planets.filter(function (q) {
          return q.name !== p.name && q.sign === sign &&
            (Astro.NODES.indexOf(q.name) < 0 && benefics[q.name] === true) === wants;
        }).map(function (q) { return q.name; });
      };
      var before = side((p.sign + 11) % 12), after = side((p.sign + 1) % 12);
      marks[p.name] = {
        mark: wants ? 'S' : 'P',
        why: listOfNames(before) + ' in ' + Astro.SIGNS[(p.sign + 11) % 12] +
          ' before it and ' + listOfNames(after) + ' in ' +
          Astro.SIGNS[(p.sign + 1) % 12] + ' after it, ' +
          (wants ? 'both benefic' : 'both malefic') + '.'
      };
    });
    return marks;
  }

  /*
   * What each graha rules and what looks at it, for the hover card.
   *
   * Both are facts about the chart being drawn rather than about the graha, so
   * both move with the division and with the rotation: a graha rules the same
   * signs wherever the chart is read from, but which houses those signs are is
   * counted from house 1, and house 1 is what a rotation moves. The nodes rule
   * nothing, so their line is simply absent rather than empty.
   *
   * The aspects are the full ones. Mars looks at the 4th, 7th and 8th, Jupiter
   * at the 5th, 7th and 9th, Saturn at the 3rd, 7th and 10th, everything else
   * at the 7th alone; partial aspects are not used anywhere on this site,
   * because where the texts speak of a graha being aspected they mean fully.
   */
  function rulingAndAspects(state, division, reference) {
    var chart = rotatedOnto(division === 1 ? state.chart
      : Astro.chartInDivision(state.chart, division), reference);
    var lagna = Astro.signOf(chart.ascendant.longitude);
    var out = {};
    chart.planets.forEach(function (p) {
      var owned = Astro.housesOwned(p.name, lagna);
      var seenBy = chart.planets.filter(function (q) {
        return q.name !== p.name && Astro.aspects(q.name, q.sign, p.sign);
      }).map(function (q) {
        return q.name + ' (' +
          Yogas.ordinal(((p.sign - q.sign) % 12 + 12) % 12 + 1) + ')';
      });
      out[p.name] = {
        rules: owned.map(function (h) { return Yogas.ordinal(h); }).join(', '),
        seenBy: seenBy.join(', ')
      };
    });
    return out;
  }

  /** "Mars", "Mars and Ketu", "Mars, Saturn and Ketu". */
  function listOfNames(names) {
    if (names.length < 2) return names[0] || '';
    return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
  }

  function slotSettings(slot) {
    return {
      reference: document.getElementById('ref-' + slot).value,
      division: +document.getElementById('varga-' + slot).value
    };
  }

  /**
   * Which yogas each graha takes part in, read in one division's own chart.
   *
   * Keyed by graha name, which survives the recast: a division moves a graha
   * to another sign but does not rename it. Uses the same detect() pass and the
   * same strengths as the Yogas tab, so the chart and the tab cannot disagree
   * about what a division holds.
   */
  /*
   * The same chart counted from somewhere else. Rotating onto a graha makes its
   * sign house 1, which is what reading a chart from the Moon means, and every
   * detector takes house 1 from the ascendant - so the rotation is expressed by
   * moving the ascendant onto the graha. The name is carried along because a
   * yoga's reasons have to say which house they were counted from.
   */
  /*
   * Moving the ascendant is not by itself the rotation. Every graha carries a
   * house number worked out from the real lagna when the chart was cast, and a
   * detector is as likely to read that as to count signs from the ascendant
   * itself - vipareeta raja yoga asks which house the 6th, 8th or 12th lord is
   * placed in, and reads it straight off the graha.
   *
   * Leaving those numbers alone left a rotated chart holding two frames at
   * once: the sign arithmetic counted from the Moon while the house numbers
   * still counted from the lagna, so a graha could be in the 1st by one and the
   * 2nd by the other, and which answer a yoga got depended on how its detector
   * happened to be written. Measured over 720 rotations, 73 per cent came out
   * differently once the numbers were moved, and 495 of them changed which
   * yogas were found rather than only how they were worded.
   *
   * So the houses are recounted here, by the same arithmetic Astro.chart and
   * chartInDivision use. The ascendant's own derived fields are taken from the
   * anchor for the same reason: half of them were the graha's and half were
   * still the lagna's.
   */
  function rotatedOnto(chart, reference) {
    if (!reference || reference === 'Ascendant') return chart;
    var anchor = chart.planets.filter(function (p) { return p.name === reference; })[0];
    if (!anchor) return chart;
    var turned = {}, k;
    for (k in chart) if (chart.hasOwnProperty(k)) turned[k] = chart[k];
    turned.ascendant = {
      longitude: anchor.longitude,
      sign: anchor.sign,
      signName: anchor.signName,
      signSanskrit: anchor.signSanskrit,
      lord: anchor.signLord,
      degreeInSign: anchor.degreeInSign,
      nakshatra: anchor.nakshatra
    };
    var lagna = Astro.signOf(anchor.longitude);
    turned.planets = chart.planets.map(function (p) {
      var moved = {}, j;
      for (j in p) if (p.hasOwnProperty(j)) moved[j] = p[j];
      moved.house = ((p.sign - lagna) % 12 + 12) % 12 + 1;
      return moved;
    });
    turned.reference = reference;
    return turned;
  }

  /*
   * Which yogas to mark on each graha in a chart slot. Both of the slot's
   * settings count: the division decides which chart is being read, and the
   * rotation decides where its houses are counted from. A yoga left at the
   * ascendant while the House column and the [Y] flag had moved was describing
   * a chart that was not on screen.
   */
  function yogasByGraha(state, division, reference) {
    var base = division === 1 ? state.chart : Astro.chartInDivision(state.chart, division);
    var map = {};
    /* Read from the chosen first house and both luminaries. Coincident anchors
       are one house frame, so the first name wins and is detected only once. */
    var seenSigns = {};
    [reference || 'Ascendant', 'Moon', 'Sun'].forEach(function (from) {
      var anchor = from === 'Ascendant' ? base.ascendant
        : base.planets.filter(function (p) { return p.name === from; })[0];
      if (!anchor) return;
      var sign = Astro.signOf(anchor.longitude);
      if (seenSigns[sign]) return;
      seenSigns[sign] = true;
      var chart = rotatedOnto(base, from);
      Yogas.detect(chart, strengthsFor(state)).forEach(function (yoga) {
        var route = Array.isArray(yoga.route) ? yoga.route.slice().sort().join('+')
          : yoga.route || yoga.kind || yoga.condition || 'general';
        (yoga.grahas || []).forEach(function (name) {
          var list = map[name] || (map[name] = []);
          var same = list.filter(function (y) {
            return y.title === yoga.title && y.subject === (yoga.subject || '') &&
              y.condition === (yoga.condition || '') && y.route === route;
          })[0];
          if (same) {
            same.from.push(from);
          } else {
            /* The library key and the reference frame travel with the finding. */
            list.push({ title: yoga.title, summary: yoga.summary || '',
              subject: yoga.subject || '', condition: yoga.condition || '',
              graha: yoga.graha || '', from: [from], route: route,
              division: division, primaryReference: reference || 'Ascendant' });
          }
        });
      });
    });
    return map;
  }

  /*
   * The hover card for a graha in a chart.
   *
   * Name as the heading, its sign and house under it, the states it is in as
   * the marks they are written with, and the yogas it takes part in as a list.
   * All of it read off data attributes the chart put on the label, so this
   * knows nothing about how a chart is drawn and the chart nothing about how a
   * card looks.
   *
   * One card per chart container, moved and refilled rather than rebuilt, so
   * pointing along a row of grahas does not churn the DOM.
   */
  /*
   * Short marks for the two conditions the chart does not draw. The states
   * have theirs from the kundli - a reader meets [R] beside a graha before
   * they meet it on a card - and these are cut to match, so the line reads as
   * one set rather than as marked and unmarked halves.
   */
  var DIGNITY_MARKS = { Exalted: 'E', Debilitated: 'D', Mooltrikona: 'M' };

  /*
   * Hemming is not a condition the graha is in but a combination it is caught
   * in: two other grahas, one on either side, which is a yoga by any reading
   * and is named as one in the texts. So it leaves the conditions line for the
   * list below, where a finding made of several grahas belongs.
   *
   * Both of them, though only the papa one was asked about: they are one rule
   * read two ways, and splitting them would put the same fact in two places
   * depending on which side of it a chart happened to fall.
   */
  var KARTARI = { P: 'Papa kartari yoga', S: 'Shubha kartari yoga' };

  var STATE_NAMES = { R: 'Retrograde', C: 'Combust', V: 'Vargottama',
    Y: 'Yogakaraka', P: 'Papa kartari', S: 'Shubha kartari' };

  /*
   * The library, fetched once and quietly, so a hover can explain a yoga
   * without waiting on the network. The Lesson tab fills the same variable and
   * will find it already there.
   */
  var libraryPending = false;
  function ensureLibrary() {
    if (lessonLibrary || libraryPending) return;
    libraryPending = true;
    fetchPassages({}, function (passages) {
      lessonLibrary = passages || [];
      libraryPending = false;
      if (lastChart) renderYogas(lastChart);
    });
  }

  /*
   * Where a hover card goes: centred on whatever opened it, kept on screen,
   * and flipped above when there is no room below.
   *
   * The clamp is against the viewport rather than the container, because a
   * card may be wider than the column it hangs off - clamping to the column
   * would shove a wide one sideways until it ran off the page.
   *
   * Vertically it goes below, unless it does not fit there but does fit above.
   * Merely having more room above is not enough: a card taller than both
   * spaces would flip to a negative top and lose its heading off-screen, and
   * keeping its head below is the useful failure. These cards take no pointer
   * events by design, so one that overflows cannot be scrolled into view.
   */
  function placeCard(card, target, container) {
    var GAP = 8;
    var r = target.getBoundingClientRect(), c = container.getBoundingClientRect();
    var vw = window.innerWidth || document.documentElement.clientWidth || 0;
    var vh = window.innerHeight || document.documentElement.clientHeight || 0;

    var half = card.offsetWidth / 2;
    var centre = r.left + r.width / 2;
    var lo = half + GAP, hi = vw - half - GAP;
    if (hi > lo) centre = Math.max(lo, Math.min(hi, centre));
    card.style.left = (centre - c.left) + 'px';

    var height = card.offsetHeight || 0;
    var room = vh - r.bottom - GAP;
    var above = r.top - GAP;
    card.style.top = (height > room && height <= above
      ? r.top - c.top - height - GAP
      : r.bottom - c.top + GAP) + 'px';
  }

  /*
   * Each setting's reasoning, on hovering its label.
   *
   * It used to fold out of a <details> beneath the select, which put eleven
   * disclosure triangles down the page and gave every row a different height -
   * so the settings could not be laid three to a row without a fold shunting
   * its neighbours about. The text is unchanged and still in the document,
   * where the select points at it with aria-describedby so a screen reader
   * still gets it on focus. What it has lost is its claim on the layout.
   */
  function wireSettingHelp() {
    var grid = document.querySelector('.settings-grid');
    if (!grid || !grid.appendChild || (grid.dataset && grid.dataset.helped)) return;
    if (grid.dataset) grid.dataset.helped = '1';

    var card = el('div', 'setting-card');
    card.hidden = true;
    grid.appendChild(card);

    var climb = function (node, match) {
      while (node && node !== grid) {
        if (match(node)) return node;
        node = node.parentNode;
      }
      return null;
    };
    var fieldOf = function (node) {
      return climb(node, function (n) { return n.className === 'field'; });
    };
    var labelOf = function (node) {
      return climb(node, function (n) {
        return String(n.tagName || n.tag || '').toLowerCase() === 'label';
      });
    };

    var open = function (field) {
      var label = field && field.querySelector ? field.querySelector('label') : null;
      var why = field && field.querySelector ? field.querySelector('.field-why') : null;
      if (!label || !why) { card.hidden = true; return; }
      card.innerHTML = '';
      card.appendChild(el('h4', null, label.textContent));
      /* The note's own markup, paragraph breaks and emphasis and all. */
      var body = el('div', 'field-note');
      body.innerHTML = why.innerHTML;
      card.appendChild(body);
      card.hidden = false;
      placeCard(card, label, grid);
    };

    /*
     * The label opens it and the select does not. Reaching for a dropdown is
     * not asking why it is there, and a card springing up over the options
     * just as you go to read them is in the way of the thing you came for.
     */
    var hide = function () { card.hidden = true; };
    grid.addEventListener('mouseover', function (e) {
      var label = labelOf(e.target);
      if (!label) { hide(); return; }
      open(fieldOf(label));
    });
    grid.addEventListener('mouseout', hide);
    /*
     * Focus is the other way in, and it lands on the select, since a label is
     * not a tab stop. A keyboard reader cannot hover, so this is the only way
     * they see the card at all.
     *
     * But clicking a select focuses it too, and that opened the card right
     * where the list of options was about to appear - the card and the
     * dropdown covering each other, over the one control you had just reached
     * for.
     *
     * :focus-visible was tried for this and does not settle it. Whether a
     * clicked <select> matches it is a matter the engines disagree on, and
     * Safari says yes: the card came straight back after the mousedown that
     * hid it. So the question is asked of the input rather than of the
     * element. A pointer going down anywhere sets the flag, a key going down
     * clears it, and both are watched on the document in the capture phase so
     * they are seen before focus moves. Tab always raises a keydown before the
     * focus lands, so the keyboard path stays open.
     */
    var viaPointer = false;
    if (document.addEventListener) {
      document.addEventListener('pointerdown', function () { viaPointer = true; }, true);
      document.addEventListener('mousedown', function () { viaPointer = true; }, true);
      document.addEventListener('keydown', function () { viaPointer = false; }, true);
    }
    grid.addEventListener('mousedown', hide);
    grid.addEventListener('focusin', function (e) {
      if (viaPointer) { hide(); return; }
      open(fieldOf(e.target));
    });
    grid.addEventListener('focusout', hide);
  }

  function wireGrahaCard(container) {
    /*
     * The renderer empties the container on every draw, which takes the card
     * with it - so the card has to be put back, not just built once. It was
     * built once, and the guard below then refused to rebuild it, so the card
     * worked until the first redraw and never again: rotating the chart onto
     * the Moon, switching division or changing a setting all killed it, and
     * the hover went quietly dead with nothing to show it had.
     *
     * The same element is kept and re-appended rather than made afresh, so the
     * closures below keep pointing at the card that is actually in the page.
     * The listeners go on the container, which survives the wipe, so those are
     * still attached once.
     */
    var card = container.grahaCard;
    if (!card) {
      card = container.grahaCard = el('div', 'graha-card');
      card.hidden = true;
    }
    if (card.parentNode !== container) container.appendChild(card);
    if (container.dataset && container.dataset.carded) return;
    if (container.dataset) container.dataset.carded = '1';

    var REC = '\u001e', FLD = '\u001f';
    var split = function (raw) {
      return (raw || '').split(REC).filter(Boolean).map(function (r) {
        var bits = r.split(FLD);
        return { term: bits[0], why: bits[1] || '',
                 subject: bits[2] || '', condition: bits[3] || '',
                 graha: bits[4] || '', from: bits[5] || '',
                 route: bits[6] || '', division: bits[7] || '1',
                 primaryReference: bits[8] || 'Ascendant' };
      });
    };

    /*
     * What the yoga is, as against why it holds here. Taken from the library's
     * own passage for it, matched on subject and condition so a family with
     * several members answers about the one that actually formed - Pancha
     * Mahapurusha has five and only one of them is to the point.
     *
     * Absent if the library has not arrived yet, which costs the card a line
     * and nothing else.
     */
    var meaningOf = function (item) {
      if (!lessonLibrary || !item.subject) return '';
      var p = lessonLibrary.filter(function (x) {
        return x.subject === item.subject && x.condition === item.condition;
      })[0];
      /*
       * The heading, not the first point. Every passage's heading is already a
       * one-line definition - "An angle lord and a trine lord, joined" - where
       * the points run to a paragraph apiece and would bury the line under them
       * that says what this chart actually did. The Lesson tab has the rest.
       */
      return p && p.heading ? p.heading : '';
    };

    /*
     * How often the thing being reported is true at all, measured over the
     * sample in data/frequencies.js rather than guessed.
     *
     * Rarity is most of what makes a finding worth reading, and it is not
     * something anyone can judge from the one chart in front of them. A raja
     * yoga by the angle-and-trine rule holds in most charts; Adhi yoga holds in
     * about one in three hundred. Without the figure the card presents those
     * two as equals and quietly misleads. The reverse case earns its line for
     * the same reason: a node is retrograde in every chart, so the figure is
     * how a reader learns that mark separates nobody from anybody.
     */
    var chanceOf = function (kind, key) {
      var table = typeof FREQUENCIES === 'undefined' ? null : FREQUENCIES[kind];
      var pct = table ? table[key] : undefined;
      /*
       * A setting that changes what forms changes how often it forms. Dropping
       * Raman's floor turns Budha-Aditya from a one-in-four finding into a
       * one-in-two one, and the figure has to move with it or it argues for
       * the wrong reading.
       */
      var floor = document.getElementById('budha-floor');
      if (kind === 'yoga' && floor && floor.value === 'none' &&
          typeof FREQUENCIES !== 'undefined' && FREQUENCIES.yogaNoFloor &&
          typeof FREQUENCIES.yogaNoFloor[key] === 'number') {
        pct = FREQUENCIES.yogaNoFloor[key];
      }
      return pct;
    };

    var rarity = function (head, kind, key) {
      var pct = chanceOf(kind, key);
      if (typeof pct !== 'number') return;
      /* Whole numbers once they are big enough to survive rounding, a decimal
         below that, where the difference between 0.3 and 1.2 is the point. */
      var text = pct >= 99.95 ? 'every chart'
        : (pct >= 10 ? Math.round(pct) : pct) + '% of charts';
      head.appendChild(el('span', 'graha-card-freq', text));
    };

    /* One item on a run-on line: a label, then the thing itself. */
    var fact = function (row, label, value, says) {
      if (!value) return;
      var item = el('span', 'graha-card-item');
      if (label) item.appendChild(el('span', 'graha-card-fact-label', label));
      item.appendChild(document.createTextNode((label ? ' ' : '') + value));
      if (says) item.title = says;
      row.appendChild(item);
    };

    /*
     * The card writes a friendship short, as the table does, but has no key
     * under it to spell them out - so each one carries its word on the hover.
     */
    var RELATION_WORD = { GF: 'great friend', F: 'friend', N: 'neutral',
      E: 'enemy', GE: 'great enemy', Own: 'own sign' };
    var saysRelation = function (who, mark) {
      if (mark === 'Own') return 'This graha owns the sign it occupies.';
      return mark && RELATION_WORD[mark] ? who + ' is a ' + RELATION_WORD[mark] +
        ' of this graha.' : '';
    };
    var shortGrahas = function (value) {
      return String(value || '').replace(
        /\b(Sun|Moon|Mars|Mercury|Jupiter|Venus|Saturn|Rahu|Ketu)\b/g,
        function (name) { return Astro.grahaAbbr(name); });
    };

    var fill = function (t) {
      card.innerHTML = '';
      var at = t.getAttribute('data-graha');

      /* Identity and conditions first; then placement from sign through
         nakshatra to house, followed by the grahas that aspect it. */
      /*
       * Five lines, coarse to fine and then outward:
       *
       *   who it is, and what it stands for in the chara scheme
       *   anything remarkable about how it stands
       *   where it is in the zodiac, to the pada
       *   where it is in the chart, whose sign it sits in, what it owns
       *   the lords of the finer frames
       *   what looks at it
       */
      /*
       * Who it is and where exactly, on one line: the name, the role it holds
       * in the chara scheme, and the position that decides both. The karaka
       * follows from the degree and the nakshatra is the degree said finer,
       * so the three read as one answer and were being given as two.
       *
       * All of it trails the name without taking its weight or the graha's
       * colour: these are things true of the graha, not part of what it is
       * called.
       */
      var head = el('h4', 'graha-card-name', at);
      var trail = el('span', 'graha-card-trail');
      fact(trail, '', t.getAttribute('data-karaka'));
      fact(trail, '', t.getAttribute('data-sign') + ' ' + t.getAttribute('data-degree'));
      fact(trail, '', t.getAttribute('data-nakshatra'));
      if (trail.children.length) head.appendChild(trail);
      card.appendChild(head);

      /*
       * Where it stands in the chart, whose ground that is, and what ground it
       * owns in return.
       */
      var seat = el('p', 'graha-card-where');
      fact(seat, '', t.getAttribute('data-house'));
      var dispositor = t.getAttribute('data-dispositor');
      if (dispositor) {
        var relation = t.getAttribute('data-dispositor-relation');
        fact(seat, 'Dispositor', Astro.grahaAbbr(dispositor) +
          (relation ? ' (' + relation + ')' : ''),
          saysRelation(dispositor, relation));
      }
      fact(seat, 'Rules', t.getAttribute('data-rules'));
      if (seat.children.length) card.appendChild(seat);

      /* The lords of the finer frames, read as relations the way the dispositor is. */
      var inNak = el('p', 'graha-card-lords');
      var nakRel = t.getAttribute('data-nak-lord-relation');
      fact(inNak, 'Nakshatra lord', Astro.grahaAbbr(t.getAttribute('data-nak-lord')) +
        (nakRel ? ' (' + nakRel + ')' : ''),
        saysRelation(t.getAttribute('data-nak-lord'), nakRel));
      var subRel = t.getAttribute('data-sub-lord-relation');
      fact(inNak, 'Sub lord', Astro.grahaAbbr(t.getAttribute('data-sub-lord')) +
        (subRel ? ' (' + subRel + ')' : ''),
        saysRelation(t.getAttribute('data-sub-lord'), subRel));
      if (inNak.children.length) card.appendChild(inNak);

      var over = el('p', 'graha-card-lords');
      var seenBy = t.getAttribute('data-seen-by');
      fact(over, 'Aspected by', shortGrahas(seenBy),
        seenBy ? 'Aspected by ' + seenBy + '.' : '');
      if (over.children.length) card.appendChild(over);

      /*
       * How this graha stands, on one line and ruled off from the placement
       * above and the yogas below.
       *
       * These are conditions the graha is in rather than combinations it takes
       * part in, so they read as a set and not as a list: six words about one
       * graha against eight findings about the chart. They were in the list
       * below until now, a line and a rule apiece, which put Retrograde among
       * the yogas as though being retrograde were a combination.
       *
       * Each keeps its rarity and its reason on the title, where they cost no
       * height, as the yogas do.
       */
      var conditions = el('p', 'graha-card-conditions');
      split(t.getAttribute('data-states')).forEach(function (item) {
        if (KARTARI[item.term]) return;   // a combination, listed with the yogas
        var chance = chanceOf('state', at + '/' + item.term);
        /*
         * The word and its mark. For a state the mark is the one the chart
         * draws, so the letter beside a graha in the kundli and the line on
         * its card are visibly the same fact.
         */
        var one = el('span', 'graha-card-item',
          STATE_NAMES[item.term] + ' [' + item.term + ']');
        one.title = [item.why, chance === undefined ? '' : 'In ' +
          (chance >= 10 ? Math.round(chance) : chance) + '% of charts.']
          .filter(Boolean).join(' ');
        conditions.appendChild(one);
      });
      if (t.getAttribute('data-directional') === 'true') {
        var dig = el('span', 'graha-card-item', 'Directional strength [Dr]');
        dig.title = 'In the house this graha is strongest facing.';
        conditions.appendChild(dig);
      }
      /*
       * Dignity closes the line. Own sign is deliberately not here: the
       * dispositor above already names the graha as its own, and a word
       * repeating that is a word spent twice.
       */
      var dignity = t.getAttribute('data-dignity');
      if (/^(Exalted|Debilitated|Mooltrikona)$/i.test(dignity)) {
        conditions.appendChild(el('span', 'graha-card-item',
          dignity + ' [' + DIGNITY_MARKS[dignity] + ']'));
      }
      if (conditions.children.length) card.appendChild(conditions);
      /*
       * Every item is a statement with its reason beneath it: the state or the
       * yoga on one line, why it holds in this chart on the next. A name alone
       * says a thing is true and leaves the reader to take it on trust.
       */
      var list = el('ul', 'graha-card-list');
      var found = [];

      split(t.getAttribute('data-states')).forEach(function (item) {
        if (!KARTARI[item.term]) return;
        var key = at + '/' + item.term;
        found.push({ chance: chanceOf('state', key), build: function () {
          var li = el('li', 'graha-card-yoga');
          var head = el('p', 'graha-card-term');
          head.appendChild(el('span', 'graha-card-label', KARTARI[item.term]));
          rarity(head, 'state', key);
          li.appendChild(head);
          if (item.why) li.title = item.why;
          return li;
        } });
      });

      split(t.getAttribute('data-yogas')).forEach(function (item) {
        /*
         * The name first, the library key second. A family that shares one
         * passage shares one subject, so Nabhasa's thirty-two figures would all
         * carry the family's figure - one of them holds in every chart - where
         * Chakra is one in thousands and Pasa two in five.
         */
        var cardKey = item.division + '|' + item.term + '|' + item.route;
        var manifestationChance = FREQUENCIES.yogaManifestationByDivision &&
          FREQUENCIES.yogaManifestationByDivision[cardKey];
        found.push({ chance: manifestationChance, build: function () {
          var li = el('li', 'graha-card-yoga');
          var head = el('p', 'graha-card-term');
          head.appendChild(el('span', 'graha-card-label', item.term));
          var from = item.from ? 'from ' + item.from.split(',').map(function (name) {
            return name === 'Ascendant' ? 'asc' : name;
          }).join(' & ') : '';
          if (from) head.appendChild(el('span', 'graha-card-whose', from));
          if (typeof manifestationChance === 'number') {
            var text = manifestationChance >= 99.95 ? 'every chart'
              : (manifestationChance >= 10 ? Math.round(manifestationChance)
                : manifestationChance) + '% of charts';
            head.appendChild(el('span', 'graha-card-freq', text));
          }
          li.appendChild(head);
          var means = meaningOf(item);
          li.title = [means, item.why].filter(Boolean).join(' ');
          return li;
        } });
      });

      /*
       * Rarest first, states and yogas together in one order.
       *
       * The list used to run states then yogas, which is the order the data
       * arrives in and says nothing about the chart. Sorting by how often the
       * thing is true at all puts what distinguishes this chart at the top: a
       * Malavya yoga at 9.8 per cent above an angle-trine raja yoga at 69,
       * where reading down the card would otherwise open on the finding two
       * charts in three share.
       *
       * Anything unmeasured sorts last rather than first. A missing figure is
       * not evidence of rarity, and putting it at the top would claim exactly
       * that. The sort is stable, so items of equal chance keep the order they
       * came in.
       */
      found.sort(function (a, b) {
        var one = typeof a.chance === 'number' ? a.chance : Infinity;
        var two = typeof b.chance === 'number' ? b.chance : Infinity;
        return one - two;
      });
      found.forEach(function (item) { list.appendChild(item.build()); });
      if (list.children.length) card.appendChild(list);
      /*
       * Placed from the rendered box rather than from SVG coordinates, because
       * the chart scales with the column and the two stop agreeing the moment
       * it does.
       */
      card.hidden = false;
      placeCard(card, t, container);
    };

    var show = function (e) {
      var t = e.target;
      if (!t || !t.getAttribute || !t.getAttribute('data-graha')) return;
      fill(t);
    };
    var hide = function () { card.hidden = true; };
    container.addEventListener('mouseover', show);
    container.addEventListener('mouseout', hide);
    container.addEventListener('focusin', show);
    container.addEventListener('focusout', hide);
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
      reference: set.reference,
      yogas: yogasByGraha(state, set.division, set.reference),
      dignities: dignitiesByGraha(state, set.division, tatkalikaSetting(), horaSetting(),
        horaMercurySetting()),
      hemming: hemmingByGraha(state, set.division),
      ruling: rulingAndAspects(state, set.division, set.reference),
      /*
       * Read in the rashi and so the same in every chart here, which is why it
       * is built from the state rather than from the division being drawn.
       */
      karakas: Astro.charaKarakas(state.chart),
      combustion: document.getElementById('combustion').value
    });
    wireGrahaCard(document.getElementById('chart-' + slot));
    ensureLibrary();

    var from = set.reference === 'Ascendant' ? 'from the ascendant'
      : 'from ' + set.reference;
    document.getElementById('caption-' + slot).textContent =
      varga.name + ' \u00b7 ' + varga.label + ': ' + varga.about + ', ' + from;
  }

  /*
   * The graha table reads both slots plus the rashi, so it is drawn once after
   * them rather than per slot. Drawing it inside drawSlot would rebuild it twice
   * and, worse, rebuild it from one slot's settings while the other was stale.
   */
  function drawCharts() {
    SLOTS.forEach(drawSlot);
    renderGrahaTable(lastChart);
  }

  /**
   * The graha that rules the sign this one sits in, and how the two stand.
   *
   * The relation is the compound one - natural and temporal together - which is
   * what is actually read. Temporal friendship is counted in the rashi chart
   * even when the sign being judged belongs to a division, which is where the
   * classical rule puts it.
   */
  /*
   * The lord goes in abbreviated, the relation in words. What the cell is really
   * reporting is the relation, and a full name in front of it takes the width
   * the relation needs: "Great friend" is the answer and "Ve" is enough to say
   * whose. The full name is in the hover, and in the Rashi column on the same
   * row where the sign this lord rules is already spelt out.
   */
  /* Planet references inside the table use the same two letters as the chart. */
  function dispositorOf(sign) {
    return Astro.grahaAbbr(Astro.SIGN_LORDS[sign]);
  }

  /**
   * What the graha makes of the lord of the sign it stands in.
   *
   * The graha's own view, which is the one that governs its dignity and its
   * saptavargaja bala. Natural friendship is not mutual and eleven of the
   * twenty-one pairs disagree, so the other direction is in the hover rather
   * than lost.
   */
  /*
   * The six two-word nakshatras, shortened for a column.
   *
   * "Uttara Bhadrapada 4" is nineteen characters against a median of ten, so
   * the column was sized by six of twenty-seven names - and they are the six a
   * chart lands on about one position in four and a half, which is often
   * enough that the long case is not an edge case. The key under the table
   * spells them out; so does the hover on the cell.
   */
  var NAKSHATRA_SHORT = {
    'Purva Bhadrapada': 'P Bhadra', 'Uttara Bhadrapada': 'U Bhadra',
    'Purva Phalguni': 'P Phalguni', 'Uttara Phalguni': 'U Phalguni',
    'Purva Ashadha': 'P Ashadha', 'Uttara Ashadha': 'U Ashadha'
  };

  function dispositorRelation(graha, sign, positionsD1) {
    var lord = Astro.SIGN_LORDS[sign];
    // 'Own Sign' as Astro.dignityOf spells it, the two sitting in rows that
    // touch and the same words meaning the same thing in both.
    if (lord === graha) return 'Own';
    if (!positionsD1[lord] || !positionsD1[graha]) return '\u2013';
    var relation = Astro.compoundRelation(graha, lord,
      ((positionsD1[lord].sign - positionsD1[graha].sign) % 12 + 12) % 12 + 1);
    // The nodes rule nothing and have no place in the friendship table.
    return relation ? RELATION_SHORT[Astro.RELATION_LABELS[relation]] : '\u2013';
  }

  /** "great friend" reads as "a great friend"; "neutral" takes no article. */
  function withArticle(label) {
    if (label === 'neutral') return 'neutral';
    return (label.charAt(0) === 'e' ? 'an ' : 'a ') + label;
  }

  /**
   * The same pair read both ways round, for the cell's title.
   *
   * Natural friendship is not mutual: eleven of the twenty-one pairs disagree,
   * so "great friend" alone does not say whose opinion it is. The graha's own
   * view of its dispositor is the one that governs its dignity and its
   * saptavargaja bala, so that is what the cell shows. Where the dispositor
   * takes a different view, it is worth saying so rather than leaving the
   * asymmetry to be discovered.
   */
  function dispositorDetail(graha, sign, positionsD1) {
    var lord = Astro.SIGN_LORDS[sign];
    var signName = Astro.SIGNS[sign];
    if (lord === graha) return graha + ' rules ' + signName + ', so this is its own sign.';
    if (!positionsD1[lord] || !positionsD1[graha]) return lord + ' rules ' + signName + '.';
    var apart = function (from, to) {
      return ((positionsD1[to].sign - positionsD1[from].sign) % 12 + 12) % 12 + 1;
    };
    var out = Astro.compoundRelation(graha, lord, apart(graha, lord));
    var back = Astro.compoundRelation(lord, graha, apart(lord, graha));
    // Rahu and Ketu rule nothing and keep no friendships, so there is no pair to read.
    if (!out) return lord + ' rules ' + signName + '. ' + graha + ' keeps no friendships.';
    var text = signName + ' belongs to ' + lord + ', and ' + graha + ' regards ' + lord +
      ' as ' + withArticle(Astro.RELATION_LABELS[out]) + '. This is the direction shown.';
    if (back && back !== out) {
      text += ' Read the other way it differs: ' + lord + ' regards ' + graha + ' as ' +
        withArticle(Astro.RELATION_LABELS[back]) + '.';
    }
    return text;
  }

  /**
   * One table per chart, in whichever division that chart is showing.
   *
   * Houses are counted from the same reference the chart is rotated onto, so
   * the two always agree. Retrogression is carried over unchanged: it belongs
   * to the graha, not to the division it is being viewed in.
   */
  /**
   * Which charts the graha table shows, D1 first.
   *
   * The rashi is always there, whatever the two charts above are set to: it is
   * the chart every other one is a division of, and reading D7 beside D10
   * without it means holding the rashi in your head. Where a slot is already
   * showing D1 that slot's rotation is used rather than a second D1 row being
   * added, so two charts on D7 and D1 give two rows, not three.
   */
  function grahaViews() {
    var settings = SLOTS.map(slotSettings);
    var onD1 = settings.filter(function (s) { return s.division === 1; })[0];
    var views = [onD1 || { division: 1, reference: 'Ascendant' }];
    var seen = { 1: true };
    settings.forEach(function (set) {
      if (seen[set.division]) return;
      seen[set.division] = true;
      views.push(set);
    });
    return views;
  }

  /* The column already says Karaka; its cells carry only the distinguishing name. */
  function karakaShort(name) {
    return name.replace(/karaka$/, '');
  }

  /* The engine keeps the classical names; this table speaks English. */
  var JAGRATADI_ENGLISH = {
    Jagrat: 'Waking', Swapna: 'Dreaming', Sushupta: 'Sleeping'
  };
  var BALADI_ENGLISH = {
    Bala: 'Infant', Kumara: 'Teen', Yuva: 'Youth',
    Vriddha: 'Old', Mrita: 'Dead'
  };

  /** "first", "second" ... for a karaka's place in the order of eight. */
  function karakaRank(name) {
    var at = Astro.CHARA_KARAKAS.indexOf(name);
    return ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh',
      'eighth'][at] || 'one';
  }

  /** Which chart's table is on screen. Kept across renders where it still exists. */
  var grahaChart = 1;

  /**
   * One table per chart on screen, behind a tab each.
   *
   * It was one table with a Chart column and a row per division under every
   * graha's name, which made a reader wanting the rashi read past two other
   * charts to find it, and made the table three times as tall as the question
   * usually asked of it. Turned into tabs, each table answers one chart.
   *
   * Which charts: D1 always, then whichever other divisions the two charts at
   * the top are set to. Both on D1 gives one tab; D1 and D7 gives two; D2 and
   * D7 gives three, D1 being there whether or not a chart shows it.
   *
   * The flags spread out with the column that held them. There is no Chart
   * column any more and no need for one, so each flag now sits on the value it
   * qualifies: [R] and [C] on the name, being facts about the graha; [V], [S]
   * and [P] on the sign, being about the sign the division gives and the two
   * beside it; [Y] on the lordship it is a fact about; [D] on the house; and
   * [N] stays on the dignity it cancels.
   */
  function renderGrahaTable(state) {
    var c = state.chart;
    var views = grahaViews();
    var strip = document.getElementById('graha-chart-tabs');
    var host = document.getElementById('graha-tables');
    strip.innerHTML = '';
    host.innerHTML = '';

    var divisions = views.map(function (view) { return view.division; });
    if (divisions.indexOf(grahaChart) < 0) grahaChart = 1;

    views.forEach(function (view) {
      var varga = Astro.VARGAS.filter(function (x) {
        return x.division === view.division;
      })[0];
      var selected = view.division === grahaChart;

      var tab = el('button', 'tab', 'D' + view.division);
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      tab.title = (varga ? varga.label + ', ' + varga.about + '. ' : '') +
        'Houses counted from ' +
        (view.reference === 'Ascendant' ? 'the ascendant' : view.reference) + '.';
      tab.addEventListener('click', function () {
        grahaChart = view.division;
        renderGrahaTable(state);
      });
      strip.appendChild(tab);

      var scroll = el('div', 'table-scroll');
      scroll.hidden = !selected;
      scroll.appendChild(grahaTableFor(state, view));
      host.appendChild(scroll);

      /*
       * The key for the two rows that are written short, under every table
       * rather than once on the page: there is a table per chart and a reader
       * looking at the second should not have to find the first.
       *
       * It is hidden with its table rather than drawn once outside them,
       * because a key for a table nobody is looking at is a line of noise.
       */
      var key = el('p', 'table-key');
      key.hidden = !selected;
      key.appendChild(el('span', 'table-key-item',
        'Nakshatras: P and U are Purva and Uttara.'));
      key.appendChild(el('span', 'table-key-item',
        'Relationship: GF great friend, F friend, N neutral, ' +
        'E enemy, GE great enemy, Own its own sign.'));
      host.appendChild(key);
    });

    // Only one chart to show, so the tab would be a control with nothing to
    // choose between. The heading above it already says which chart it is.
    strip.hidden = views.length < 2;
  }

  /*
   * The tab strip moves with the arrow keys, as the panel tabs do. Delegated
   * from the strip because its buttons are rebuilt on every render.
   */
  function wireGrahaChartKeys() {
    var strip = document.getElementById('graha-chart-tabs');
    if (!strip) return;
    strip.addEventListener('keydown', function (e) {
      var step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      var tabs = [].slice.call(strip.querySelectorAll('button'));
      var at = tabs.map(function (t) {
        return t.getAttribute('aria-selected') === 'true';
      }).indexOf(true);
      var next = tabs[(at + step + tabs.length) % tabs.length];
      if (next) { next.click(); next.focus(); }
    });
  }

  /* The columns read left to right for each graha. */
  var GRAHA_ROWS = [
    { label: 'Rashi', says: 'The sign this chart puts the graha in.' },
    { label: 'House', says: 'Counted from this chart’s own house 1, which the tab above says what is counted from.' },
    { label: 'Lordship', says: 'Which houses the graha rules, counted from the same house 1 as the House column.' },
    { label: 'Dispositor', says: 'The lord of the sign the graha stands in, followed in brackets by the graha’s compound relationship to that lord.' },
    { label: 'Longitude', says: 'Where the graha stands within its sign, in degrees, minutes and seconds.' },
    { label: 'Name - Pada', group: 'Nakshatra', says: 'Which of the 27 nakshatras the graha falls in and which of its four quarters.' },
    { label: 'Lord', group: 'Nakshatra', says: 'The graha that rules that nakshatra, which is what runs the Vimshottari dasha.' },
    { label: 'Sub lord', group: 'Nakshatra', says: 'The KP sub lord: the nakshatra divided again in the Vimshottari proportions, and whichever graha owns the part the position falls in.' },
    /*
     * Two facts about the graha rather than about the chart it is read in, so
     * they repeat across the tabs as [R] and [C] do. Both are taken from the
     * rashi: a karaka is assigned by degrees into the sign and a varga longitude
     * is a position stretched back across thirty, so neither means anything
     * measured inside a division.
     */
    { label: 'Karaka', says: 'The Jaimini chara karaka, assigned by how far into its sign the graha has travelled - furthest is Atmakaraka. Read in the rashi, and so the same in every chart here.' },
    { label: 'State', says: 'Waking, dreaming or sleeping according to whether the graha is in its own or exaltation sign, a friend’s or neutral’s sign, or an enemy’s or debilitation sign. Read in the rashi.' },
    { label: 'Age', says: 'Infant, teen, youth, old or dead: six degrees to a stage and reversed in an even sign. Read in the rashi, and so the same in every chart here.' }
  ];

  /**
   * One chart's table: one graha per row, its facts across the columns. This
   * keeps a graha's reading on one horizontal line and makes its name the sticky
   * row heading while the detail scrolls.
   */
  function grahaTableFor(state, view) {
    var c = state.chart;
    var positionsD1 = {};
    c.planets.forEach(function (p) { positionsD1[p.name] = p; });
    var sun = positionsD1.Sun;

    /*
     * The benefics, the recast chart and a neecha bhanga pass used to be
     * worked out here for [S], [P] and [N]. With those marks off this table
     * nothing reads them, so the table no longer runs a yoga detector on every
     * render for a letter it does not draw.
     */

    // House 1 for this chart: the ascendant, or the graha it is turned onto.
    var firstSign = Astro.vargaPosition(c.ascendant.longitude, view.division).sign;
    if (view.reference && view.reference !== 'Ascendant') {
      var anchor = c.planets.filter(function (p) {
        return p.name === view.reference;
      })[0];
      if (anchor) firstSign = Astro.vargaPosition(anchor.longitude, view.division).sign;
    }

    /*
     * Karaka and avastha are read in the rashi whichever chart the table shows,
     * so they take the graha's own longitude rather than the division's.
     */
    var karakas = Astro.charaKarakas(c);
    var rashiSign = function (r) { return Astro.signOf(r.longitude); };
    var rashiDegree = function (r) { return Astro.norm360(r.longitude) % 30; };

    var entities = [{ name: 'Ascendant', longitude: c.ascendant.longitude, isAscendant: true }]
      .concat(c.planets.map(function (p) {
        return { name: p.name, longitude: p.longitude, retrograde: p.retrograde };
      }));

    var flag = function (cell, letters) {
      letters.filter(Boolean).forEach(function (f, n) {
        cell.appendChild(el('span', 'flag flag-' + f.toLowerCase(),
          (n === 0 ? ' ' : '') + '[' + f + ']'));
      });
    };

    /* Everything one graha row needs, worked out once. */
    var columns = entities.map(function (r) {
      var v = Astro.vargaPosition(r.longitude, view.division);
      var nak = Astro.nakshatraOf(v.longitude);
      var house = ((v.sign - firstSign) % 12 + 12) % 12 + 1;
      var owned = r.isAscendant ? [] : Astro.housesOwned(r.name, firstSign);
      var dispositor = r.isAscendant ? Astro.grahaAbbr(Astro.SIGN_LORDS[v.sign])
        : dispositorOf(v.sign);
      var relationship = r.isAscendant ? ''
        : dispositorRelation(r.name, v.sign, positionsD1);
      var jagratadi = r.isAscendant ? ''
        : Astro.jagratadiAvastha(r.name, rashiSign(r));
      var baladi = r.isAscendant ? ''
        : Astro.baladiAvastha(rashiSign(r), rashiDegree(r));
      return {
        entity: r,
        cells: [
          { text: Astro.SIGNS[v.sign],
            /*
             * [V] alone. It says this division put the graha back in the sign
             * it holds in the rashi, which is a fact about this cell and
             * nothing else. [S] and [P] are about the two signs on either
             * side, so they go the way of [N], [D] and [Y] below - onto the
             * card, which has room to name who is doing the hemming. The varga
             * grid still marks them per division.
             */
            flags: [view.division !== 1 && v.sign === Astro.signOf(r.longitude)
              ? 'V' : null] },
          /* [N], [Dr] and [Y] are said in full on the graha's card. */
          { text: String(house), cls: 'numeric' },
          owned.length
            ? { text: owned.join(', '), cls: 'numeric',
                title: r.name + ' rules ' + owned.map(function (h) {
                  return Astro.SIGNS[(firstSign + h - 1) % 12] + ', the ' + Yogas.ordinal(h);
                }).join(' and ') + '.' }
            : { text: '–', cls: 'numeric' },
          /* The mark as written: GF is not gf, and Own is not own. */
          { text: dispositor + (relationship && relationship !== '\u2013'
              ? ' (' + relationship + ')' : ''),
            cls: 'dispositor',
            title: r.isAscendant
              ? Astro.SIGN_LORDS[v.sign] + ' rules ' + Astro.SIGNS[v.sign] +
                '. The lagna is a point rather than a graha, so it keeps no friendships.'
              : dispositorDetail(r.name, v.sign, positionsD1) },
          { text: dms(v.degreeInSign), cls: 'longitude',
            title: Astro.SIGNS[v.sign] + ' ' + dms(v.degreeInSign) +
              '. Longitude ' + v.longitude.toFixed(4) + '°.' },
          { text: (NAKSHATRA_SHORT[nak.name] || nak.name) + ' - ' + nak.pada,
            cls: 'nakshatra-name',
            title: 'Nakshatra ' + nak.name + ', pada ' + nak.pada +
              ' of four, ruled by ' + nak.lord + '.' },
          /* Planet references inside the table use the chart's two-letter code. */
          { text: Astro.grahaAbbr(nak.lord),
            title: nak.name + ' is ruled by ' + nak.lord + '.' },
          { text: Astro.grahaAbbr(nak.subLord),
            title: 'The sub lord of this point in ' + nak.name + ' is ' +
              nak.subLord + '.' },
          { text: r.isAscendant || !karakas[r.name] ? '–'
              : karakaShort(karakas[r.name]),
            title: r.isAscendant
              ? 'The lagna is a point rather than a graha, so it takes no karaka.'
              : karakas[r.name]
                ? karakas[r.name] + ': ' + karakaRank(karakas[r.name]) +
                  ' of the eight by degrees into the sign.'
                : 'Ketu takes no chara karaka. The eight are the seven from the ' +
                  'Sun to Saturn with Rahu, whose degrees are counted back from ' +
                  'the end of its sign.' },
          { text: r.isAscendant ? '–'
              : (JAGRATADI_ENGLISH[jagratadi] || '–'),
            title: r.isAscendant
              ? 'The lagna is a point rather than a graha, so it takes no avastha.'
              : jagratadi
                ? JAGRATADI_ENGLISH[jagratadi] + ': ' + r.name +
                  ' is judged from its rashi sign and that sign’s natural lord.'
                : 'The classical friendship table does not assign Rahu or Ketu an awareness state.' },
          { text: r.isAscendant ? '–'
              : BALADI_ENGLISH[baladi],
            title: r.isAscendant
              ? 'The lagna is a point rather than a graha, so it takes no avastha.'
              : Astro.SIGNS[rashiSign(r)] + ' is an ' +
                (rashiSign(r) % 2 === 0 ? 'odd' : 'even') + ' sign, and the graha ' +
                'stands ' + rashiDegree(r).toFixed(1) + '° into it, making its age ' +
                BALADI_ENGLISH[baladi].toLowerCase() + '; it gives ' +
                Astro.BALADI_WORTH[baladi] +
                '.' }
        ]
      };
    });

    var table = el('table', 'graha-table');
    table.id = 'graha-table-d' + view.division;

    var thead = el('thead');
    var headRow = el('tr');
    var subHeadRow = el('tr');
    var corner = el('th', null, 'Graha');
    corner.setAttribute('scope', 'col');
    corner.setAttribute('rowspan', '2');
    headRow.appendChild(corner);
    GRAHA_ROWS.forEach(function (column, index) {
      if (column.group) {
        if (!index || GRAHA_ROWS[index - 1].group !== column.group) {
          var grouped = el('th', null, column.group);
          grouped.setAttribute('scope', 'colgroup');
          grouped.setAttribute('colspan', String(GRAHA_ROWS.filter(function (candidate) {
            return candidate.group === column.group;
          }).length));
          headRow.appendChild(grouped);
        }
        var sub = el('th', null, column.label);
        sub.setAttribute('scope', 'col');
        sub.title = column.says;
        subHeadRow.appendChild(sub);
        return;
      }
      var th = el('th', null, column.label);
      th.setAttribute('scope', 'col');
      th.setAttribute('rowspan', '2');
      th.title = column.says;
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    thead.appendChild(subHeadRow);
    table.appendChild(thead);

    var tbody = el('tbody');
    columns.forEach(function (col) {
      var tr = document.createElement('tr');
      var th = el('th', null, col.entity.name);
      th.setAttribute('scope', 'row');
      if (!col.entity.isAscendant) {
        flag(th, [col.entity.retrograde ? 'R' : null,
          sun && Astro.isCombust(col.entity.name, col.entity.longitude, sun.longitude,
            col.entity.retrograde) ? 'C' : null]);
      }
      tr.appendChild(th);
      col.cells.forEach(function (cell) {
        var td = el('td', cell.cls, cell.text);
        if (cell.title) td.title = cell.title;
        if (cell.flags) flag(td, cell.flags);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    return table;
  }

  /**
   * Shadbala, component by component.
   *
   * The breakdown is shown rather than a single number because Shadbala cannot
   * be checked against a reference implementation the way the ephemeris can, and
   * a total nobody can take apart is a total nobody can disagree with. Ranking
   * is by how far each graha clears its own minimum, since the minimums differ.
   */
  /*
   * Computed once per chart and kept. Lakshmi yoga turns on the lagna lord being
   * strong, which is the same reading the Shadbala tab prints; computing it twice
   * would let the two drift apart over a rounding change.
   */
  function strengthsFor(state) {
    if (!state.shadbala) {
      state.shadbala = Shadbala.compute(state.chart, {
        latitude: state.place.lat,
        longitude: state.place.lon,
        tzOffsetMinutes: state.offset
      }, { moonPaksha: document.getElementById('moon-paksha').value,
           natClock: document.getElementById('nat-clock').value,
           horaLength: document.getElementById('hora-length').value,
           kranti: document.getElementById('kranti').value,
           ayanaConstant: document.getElementById('ayana-constant').value,
           mercuryNature: document.getElementById('mercury-nature').value,
           cheshtaMethod: document.getElementById('cheshta-method').value,
           kendraMethod: document.getElementById('kendra-method').value,
           meanSource: document.getElementById('mean-source').value,
           luminaryRule: document.getElementById('luminary-rule').value,
           luminaryCheshta: document.getElementById('luminary-cheshta').value,
           ishtaKashta: document.getElementById('ishta-kashta').value,
           tatkalika: tatkalikaSetting(),
           horaDignity: horaSetting(),
           horaMercury: horaMercurySetting(),
           saptavargajaLadder: ladderSetting() });
    }
    return state.shadbala;
  }

  /*
   * The five shares Sthana bala is made of, in the order Parashara gives them,
   * each with the most it can be worth. The maximum is beside the name rather
   * than left to be known: a row reading 60.0 says nothing until it is read
   * against 60 for Kendradi and 225 for Saptavargaja, and the two rows look the
   * same until it is.
   *
   * Saptavargaja read 315 here for a long time, seven times the 45 a graha
   * takes in its moolatrikona. It cannot reach that: moolatrikona counts in
   * the rashi and nowhere else, so the ceiling is 45 once and 30, an own sign,
   * in each of the other six. The rows beneath were being read against a
   * figure half again too large - 217.5, the most seen over twelve hundred
   * charts, showed as 69 per cent of the scale where it is 97 - and Sthana
   * bala inherited it, printing 480 where 390 is the sum of its parts.
   */
  var STHANA_PARTS = [
    { key: 'uchcha', label: 'Uchcha', en: 'Exaltation', max: 60,
      says: 'How far the graha stands from its own debilitation point: nothing at ' +
        'that degree, sixty half a circle away from it.' },
    { key: 'saptavargaja', label: 'Saptavargaja', en: 'Seven divisions', max: 225,
      says: 'The graha against the lord of the sign it takes in each of the seven ' +
        'divisions, 45 for moolatrikona down to 1.875 in a great enemy’s, added ' +
        'over all seven. It caps at 225 rather than seven 45s, moolatrikona ' +
        'counting in the rashi alone, so the best elsewhere is an own sign.' },
    /*
     * One bala in the text and two rows here. Santhanam gives it as a single
     * Ojhayugmarasiamsa bala, but the instruction under verse 414 is that the
     * rashi and navamsa strengths "be added together" to reach it - so the
     * figure is a sum of two, and a row reading 15 does not say which of the two
     * it came from. Split, it does.
     */
    { key: 'ojhaRasi', label: 'Oja-Yugma Rasi', en: 'Odd or even sign', max: 15,
      says: 'Fifteen for standing in the odd or even sign the graha wants. The ' +
        'Moon and Venus want even signs, being reckoned female; the other five ' +
        'want odd.' },
    { key: 'ojhaNavamsa', label: 'Oja-Yugma Navamsa', en: 'Odd or even navamsa', max: 15,
      says: 'The same test of the navamsa the graha falls in. Santhanam gives ' +
        'this and the row above as one bala, Ojhayugmarasiamsa, reached by ' +
        'adding the two; they are apart here so a figure of 15 says which half ' +
        'it came from.' },
    { key: 'kendradi', label: 'Kendradi', en: 'Angular house', max: 60,
      says: 'Sixty in an angle, thirty in a succedent house, fifteen in a cadent ' +
        'one. The only share of Sthana bala that reads the houses.' },
    { key: 'drekkana', label: 'Drekkana', en: 'Decanate', max: 15,
      says: 'Fifteen in the third of a sign that matches the graha’s sex: the ' +
        'first third for the Sun, Mars and Jupiter, the middle for Mercury and ' +
        'Saturn, the last for the Moon and Venus.' }
  ];

  /*
   * The eight shares of Kala bala, in the order Santhanam gives them under
   * verses 8-17. Two of them carry no ceiling in the column: paksha is doubled
   * for the Moon and ayana for the Sun, so 60 would be right for six grahas in
   * each row and wrong for the seventh.
   */
  var KALA_PARTS = [
    { key: 'nathonnatha', label: 'Nata-Unnata', en: 'Day or night', max: 60,
      says: 'Nata is the birth time measured back to the nearer midnight, ' +
        'deducted from thirty ghatis and doubled. The Moon, Mars and Saturn ' +
        'take that, strongest at midnight; the Sun, Jupiter and Venus take ' +
        'sixty less it, strongest at noon; Mercury takes the full sixty at any ' +
        'hour. Midnight here is the Sun’s own, at the birthplace and by the ' +
        'sundial, not the timezone’s. Santhanam spells it Nathonnatha bala.' },
    { key: 'paksha', label: 'Paksha', en: 'Lunar fortnight', max: 120, shows: '60/120',
      says: 'How far into the bright or dark fortnight the birth falls. A ' +
        'benefic scores by the Moon’s brightness and a malefic by what is ' +
        'left of sixty. Sixty is the ceiling for six grahas; the Moon’s counts ' +
        'double, so the row can reach a hundred and twenty.' },
    { key: 'tribhaga', label: 'Tribhaga', en: 'Third of day or night', max: 60,
      says: 'The day and the night are each cut in three. Mercury, the Sun and ' +
        'Saturn take the three parts of the day in that order, the Moon, Venus ' +
        'and Mars the three of the night; Jupiter takes sixty at any hour.' },
    { key: 'abda', label: 'Abda', en: 'Solar year', max: 15,
      says: 'Fifteen to the lord of the year, read as the weekday lord of the ' +
        'day the solar year began. Santhanam gives it as Varsha bala.' },
    { key: 'masa', label: 'Masa', en: 'Solar month', max: 30,
      says: 'Thirty to the lord of the month, read as the weekday lord of the ' +
        'day the solar month began.' },
    { key: 'vara', label: 'Vara', en: 'Weekday', max: 45,
      says: 'Forty-five to the lord of the weekday of the birth. Santhanam ' +
        'gives it as Dina bala.' },
    { key: 'hora', label: 'Hora', en: 'Planetary hour', max: 60,
      says: 'Sixty to the lord of the planetary hour, the hours running from ' +
        'sunrise in the Chaldean order from that day’s own lord.' },
    /*
     * Raman's ninth kala component, and shown only in the charts that have a
     * war - about one in twelve. Everywhere else it is a row of seven zeroes,
     * which teaches a reader to skip it.
     */
    { key: 'ayana', label: 'Ayana', en: 'Declination', max: 120, shows: '60/120',
      says: 'How far north or south of the equator the graha stands. The Sun, ' +
        'Mars, Jupiter and Venus want north and Saturn and the Moon south; ' +
        'Mercury takes either. Sixty is the ceiling for six grahas; the Sun’s ' +
        'counts double, so the row can reach a hundred and twenty.' },
    { key: 'yuddha', label: 'Yuddha', en: 'Planetary war', max: null,
      onlyWhenSet: true,
      says: 'Two of the five starry grahas within a degree of each other are at ' +
        'war, and the one of lesser longitude conquers. Their sthana, dig and ' +
        'kala strengths as far as hora bala are added up, the difference ' +
        'between the two is divided by the difference between the diameters of ' +
        'their discs, and the quotient is added to the victor and taken from ' +
        'the vanquished.' }
  ];

  /*
   * The six shares of Shadbala. Sthana is the total of the five above it rather
   * than a figure of its own, so it closes that block instead of opening it -
   * the parts are read, then what they come to.
   */
  var BALA_ROWS = [
    { key: 'sthana', label: 'Sthana bala', en: 'Positional', parts: STHANA_PARTS,
      total: true, max: 390,
      says: 'Positional strength: the six rows under it added.' },
    { key: 'dig', label: 'Dig bala', en: 'Directional', max: 60,
      says: 'Directional strength. Each graha has one angle it is strongest on and ' +
        'is worth nothing opposite it: Jupiter and Mercury the 1st, the Sun and ' +
        'Mars the 10th, Saturn the 7th, the Moon and Venus the 4th.' },
    /*
     * The one share with no ceiling to quote. Its eight parts cap at 390
     * together, but the Moon's paksha and the Sun's ayana are each counted
     * double, which lifts those two to 450 - so a single figure in the column
     * would be wrong for two of the seven grahas under it.
     */
    { key: 'kala', label: 'Kala bala', en: 'Temporal', parts: KALA_PARTS,
      total: true, max: 450, shows: '390/450',
      says: 'Temporal strength: the eight rows under it added. They cap at 390 ' +
        'together for five grahas, and at 450 for the Moon and the Sun, whose ' +
        'paksha and ayana count double.' },
    { key: 'cheshta', label: 'Cheshta bala', en: 'Motional', max: 60,
      says: 'Motional strength, from the chesta kendra: the graha’s distance from ' +
        'its seeghrocha, nothing where that is nothing and sixty where it is a ' +
        'half circle. An outer graha turns retrograde at opposition, so the Sun is ' +
        'its seeghrocha; an inner one turns at inferior conjunction, so its own ' +
        'mean longitude is. The Sun and Moon never retrograde, and take the ' +
        'kendras Parashara gives them at 28.3-4 instead: sayana Sun and three ' +
        'signs for him, her distance from the Sun for her. Neither is added to ' +
        'the total below, which is how Raman tabulates them.' },
    { key: 'naisargika', label: 'Naisargika bala', en: 'Natural', max: 60,
      says: 'Natural strength, a constant per graha: the same figure in every ' +
        'chart, running from the Sun’s sixty down to Saturn’s 8.57.' },
    /*
     * The text sets no figure for this one, but the reckoning does: six other
     * grahas can each cast at most a full drishti of sixty, and the sum is
     * quartered, so ninety bounds it in either direction. Shown as a bound
     * rather than a ceiling because this is the one share that goes negative -
     * over 1800 sample births it runs from -56 to +53, so ninety is a limit
     * approached rather than met.
     */
    { key: 'drik', label: 'Drik bala', en: 'Aspectual', max: 97.5, shows: '\u00b197.5',
      says: 'What the benefics aspecting the graha are worth, less what the ' +
        'malefics are, quartered. The only share that can go negative. The text ' +
        'sets no ceiling; the reckoning does - five grahas casting a full sixty ' +
        'and Saturn up to ninety, since its special aspect adds to the ordinary ' +
        'one rather than replacing it. That bound is approached rather than met: ' +
        'the observed range is about -60 to +39.' },
  ];

  /** One graha's rashi position, or nothing where the chart has none. */
  function positionOf(state, name) {
    return state.chart.planets.filter(function (p) { return p.name === name; })[0];
  }

  /*
   * The two balas the texts double, and whose graha carries the doubling.
   * Parashara: "The Sun's Ayana Bala is again multiplied by 2 whereas for
   * others the product arrived in Virupas are considered as it is." Raman
   * section 75: "And double the Ayanabala in the case of the Sun", and rule
   * (c) of section 55 for the Moon's paksha.
   *
   * Nothing here is in dispute. Some software prints these rows undoubled,
   * which agrees with no authority, and comparing against one of those is
   * awkward when a row differs by a factor rather than a figure. So the
   * setting halves what is SHOWN and leaves the arithmetic alone: the doubled
   * value is what Kala bala and every total still count.
   */
  var DOUBLED = {
    ayana: { graha: 'Sun', control: 'ayana-doubled' },
    paksha: { graha: 'Moon', control: 'paksha-doubled' }
  };

  /*
   * A switch each, rather than one for both. The two doublings are separate
   * rules on separate grahas from separate texts, and the reason for showing a
   * row undoubled is to line it up against another table: one table may print
   * the Sun's ayana undoubled and the Moon's paksha doubled, and a single
   * control cannot be set to match that.
   */
  function halvingDoubled(key) {
    var spec = DOUBLED[key];
    if (!spec) return false;
    var select = document.getElementById(spec.control);
    return !!select && select.value === 'undoubled';
  }

  function renderShadbala(state) {
    var table = document.getElementById('shadbala-table');
    var tbody = table.querySelector('tbody');
    tbody.innerHTML = '';
    var result = strengthsFor(state);

    /*
     * Listed in the same order as the graha tables rather than strongest first.
     * Reading across from one table to the other is the common move, and a list
     * that reorders itself per chart makes that a search each time. The module
     * still returns its ranking; the Rupas and Needs rows carry the same
     * comparison for anyone who wants it.
     */
    var planets = state.chart.planets.filter(function (p) {
      return result.grahas[p.name];
    });
    var grahas = planets.map(function (p) { return p.name; });
    renderShadbalaHead(table, planets, positionOf(state, 'Sun'));

    var n = function (v) { return v.toFixed(1); };
    var row = function (label, en, max, says, cells, cls, shows) {
      var tr = document.createElement('tr');
      if (cls) tr.className = cls;
      tr.appendChild(measureHead(label, en, max, says, shows));
      cells.forEach(function (cell) { tr.appendChild(cell); });
      tbody.appendChild(tr);
      return tr;
    };

    /*
     * A share, then its parts. Sthana and Kala were each one figure with their
     * parts in a hover, which put the only place those parts could be compared
     * behind a mouse and one graha at a time: a reader wanting to know why
     * Mercury is positionally weak had to hover seven cells and hold the
     * answers. The other four shares have no parts and are one row each.
     *
     * The share opened the block after being put at the end of it first. Closing
     * reads right while a column is being added up, and this is not a column
     * being added up but a table being looked things up in: eight indented rows
     * with their parent below them are eight rows a reader who lands among them
     * cannot name. Opening, the parent has been passed before the parts are
     * reached, so which bala they belong to is never in question.
     */
    BALA_ROWS.forEach(function (bala) {
      row(bala.label, bala.en, bala.max, bala.says, grahas.map(function (graha) {
        var x = result.grahas[graha];
        var td = el('td', 'numeric', n(bala.parts ? x[bala.key].total : x[bala.key]));
        /*
         * The luminaries' cheshta bala is shown and not summed, so the column
         * will not add up for them. Say so on the cell rather than leaving a
         * reader to find the discrepancy and distrust the table.
         */
        if (bala.key === 'cheshta' && !x.cheshtaCounted) {
          td.className = 'numeric not-counted';
          td.title = graha + '\u2019s cheshta bala is ' + n(x.cheshta) +
            ', and the total below does not include it. Raman leaves this row ' +
            'blank: the figure belongs to the Ishta and Kashta computation ' +
            'rather than to the shadbala sum.';
        }
        return td;
      }), bala.parts ? 'bala-head' : null, bala.shows);
      (bala.parts || []).forEach(function (part) {
        if (part.onlyWhenSet && grahas.every(function (graha) {
          return !result.grahas[graha][bala.key][part.key];
        })) return;
        var halved = halvingDoubled(part.key);
        var shows = halved ? '60' : part.shows;
        row(part.label, part.en, halved ? 60 : part.max,
          part.says, grahas.map(function (graha) {
          var x = result.grahas[graha];
          var raw = x[bala.key][part.key];
          var doubled = !!DOUBLED[part.key] && DOUBLED[part.key].graha === graha;
          var td = el('td', 'numeric', n(halved && doubled ? raw / 2 : raw));
          /*
           * The figure is halved for display only. The total above it still
           * carries the doubled value, because that is what the texts compute
           * with, so the row would not appear to add up without saying so.
           */
          if (halved && doubled) {
            td.title = graha + '\u2019s ' + part.label.toLowerCase() + ' is ' +
              n(raw) + ' doubled, which is what Kala bala above counts. Shown ' +
              'here halved because this setting asks for it.';
          }
          // The seven divisions behind the figure, which have no row of their own.
          if (part.key === 'saptavargaja') td.title = saptavargajaTitle(x);
          // Who the war was with, which no figure in the row can say.
          if (part.key === 'yuddha' && x.war) td.title = yuddhaTitle(x);
          return td;
        }), 'bala-part', shows);
      });
    });

    /*
     * The close: what the six come to, in shashtiamsas and then in rupas, what
     * this graha needs, and the verdict that comparing the two gives. The
     * verdict used to colour the whole of a graha's row; a graha is a column
     * now, and colouring a column would paint every part of a strength that is
     * only weak in total.
     */
    row('Total', null, null, 'The six shares added, in shashtiamsas, and the ' +
      'war settled where there was one.',
      grahas.map(function (graha) {
        return el('td', 'numeric', result.grahas[graha].totalShashtiamsa.toFixed(0));
      }), 'bala-sum');
    row('Rupas', null, null, 'The total divided by sixty.', grahas.map(function (graha) {
      return el('td', 'numeric', result.grahas[graha].rupas.toFixed(2));
    }));
    row('Needs', null, null, 'The minimum Parashara sets for this graha, which differs ' +
      'by graha: compare a total with the figure under it rather than with the ' +
      'other grahas.', grahas.map(function (graha) {
      return el('td', 'numeric', String(result.grahas[graha].required));
    }));
    /*
     * The one figure in the table that can be read across grahas.
     *
     * Rupas cannot: Mercury is asked for seven and the Sun for five, so the
     * same 6.5 is a failure for one and half as much again as the other needs.
     * Dividing each by its own minimum takes the yardstick out, which is why
     * the module ranks on this and not on the total - and it is the same
     * comparison the verdict makes, with the margin left in.
     */
    row('Of its minimum', null, null, 'Rupas as a share of what this graha is ' +
      'asked for. The only row here that compares across grahas, the minimums ' +
      'differing; a hundred per cent is exactly enough and the verdict below ' +
      'is this row read as a yes or a no.',
      grahas.map(function (graha) {
        var x = result.grahas[graha];
        return el('td', 'numeric', Math.round(x.ratio * 100) + '%');
      }));
    row('Verdict', null, null, 'Strong where the rupas meet what the graha needs.',
      grahas.map(function (graha) {
        var x = result.grahas[graha];
        return el('td', x.strong ? 'strong-flag' : 'weak-flag',
          x.strong ? 'Strong' : 'Weak');
      }));

    /*
     * Below the verdict because they are not part of it. Ishta and kashta are
     * not a seventh share and are in no total above: they are what the graha
     * is disposed to do in its dasha, read off uchcha and cheshta bala alone.
     * They are the reason the luminaries' cheshta row exists at all, so the
     * two rows sit close enough for a reader to see where they come from.
     */
    var phalaSays = document.getElementById('ishta-kashta').value === 'parashara'
      ? ' On this setting the two halve a fixed sixty between them.'
      : ' On this setting a graha can be low in both at once, the two not summing to sixty.';
    row('Ishta phala', 'Good', 60, 'The good a graha is disposed to do in its ' +
      'dasha, from its uchcha and cheshta bala. Not a seventh share and not in ' +
      'the total above.' + phalaSays,
      grahas.map(function (graha) {
        return el('td', 'numeric', n(result.grahas[graha].phala.ishta));
      }), 'bala-head');
    row('Kashta phala', 'Evil', 60, 'The harm, from the same two shares read ' +
      'the other way round: how far each falls short of sixty.' + phalaSays,
      grahas.map(function (graha) {
        return el('td', 'numeric', n(result.grahas[graha].phala.kashta));
      }));

    /*
     * The four lords of the birth. Abda, masa, vara and hora each hand their
     * whole bala to one graha and nothing to the other six, so their rows are
     * six zeros and a number, and which graha it went to is legible only by
     * hunting for the cell. Naming them is the row read out.
     */
    var LORD_LABELS = [['abda', 'Year'], ['masa', 'Month'], ['vara', 'Day'],
      ['hora', 'Hour']];
    var strip = document.getElementById('shadbala-lords');
    strip.innerHTML = '';
    LORD_LABELS.forEach(function (pair) {
      var who = result.lords && result.lords[pair[0]];
      if (!who) return;
      var span = el('span', null, pair[1] + ' lord ');
      span.appendChild(el('b', null, who));
      strip.appendChild(span);
    });

    renderShadbalaChart(grahas, result);

    document.getElementById('shadbala-note').textContent =
      'In shashtiamsas; sixty make one Rupa. Where a row name carries a second ' +
      'figure, that is the most the row can be worth, and a pair of figures means ' +
      'the ceiling differs by graha: paksha is doubled for the Moon and ayana for ' +
      'the Sun, which lifts those two rows and the Kala bala they feed. Drik bala ' +
      'is given with a sign, being the one share that goes negative. A graha is ' +
      'strong when it meets the minimum ' +
      'Parashara sets for it, which differs by graha, so compare each total against its ' +
      'own requirement rather than against the others. Grahas are in the order of the ' +
      'tables beside this one, and Rahu and Ketu are outside Shadbala. Yuddha bala ' +
      'has a row only where two of the five starry grahas stand within a degree of ' +
      'each other, which is about one chart in twelve; it is reckoned as Raman gives ' +
      'it, the quotient of the two grahas\u2019 aggregates over the difference of ' +
      'their disc diameters. Saptavargaja uses Raman’s ladder, section 30 - 45 and ' +
      '30 at the top, then halving at every step down to 1.875 - where Santhanam ' +
      'and Saravali give 20, 15, 10, 4 and 2 for the lower five, which is why ' +
      'totals here can differ from another calculator’s by a few virupas. ' +
      'The last two rows are below the verdict because they are in no total ' +
      'above it: ishta and kashta phala are what the graha is disposed to do in ' +
      'its dasha, good and ill, read off its uchcha and cheshta bala alone. ' +
      'Compare a graha’s two against each other rather than against another ' +
      'graha’s.';
  }

  /**
   * Each graha's total as a share of the minimum it is asked for.
   *
   * The one figure in the table that compares across grahas, so the one worth
   * plotting: the totals themselves cannot be, the minimums differing, and a
   * chart of them would put Mercury's 394 beside the Sun's 558 and say nothing
   * about which of the two is strong.
   *
   * One measure, one axis, and a line at the hundred. The line is the whole of
   * what the chart is for - a bar is above it or below it - so it is drawn
   * across the plot and labelled rather than left to a gridline that happens to
   * be near. No colour codes the verdict: the bar's own height against the line
   * says it, and the table beside this gives it in words.
   */
  function renderShadbalaChart(grahas, result) {
    var host = document.getElementById('shadbala-chart');
    if (!host) return;
    host.innerHTML = '';
    if (!grahas.length) return;

    var rows = grahas.map(function (graha) {
      var x = result.grahas[graha];
      return { graha: graha, percent: x.ratio * 100, rupas: x.rupas,
               required: x.required, strong: x.strong };
    });
    /*
     * Headroom above the tallest bar, and never less than the line: a chart
     * where nothing reaches a hundred still has to show where the hundred is.
     */
    var top = rows.reduce(function (n, r) { return Math.max(n, r.percent); }, 0);
    var max = Math.max(120, Math.ceil(top / 20) * 20);

    host.appendChild(barChart({
      title: 'Against what each graha needs',
      rows: rows, max: max, rule: 100, ruleLabel: '100%',
      series: [{ label: 'Of its minimum', cls: 'series-vimsopaka',
                 value: function (r) { return r.percent; },
                 readout: function (r) { return Math.round(r.percent) + '%'; } }],
      note: 'Rupas over the minimum that graha is asked for. A bar above the line ' +
        'is strong. Totals are not plotted because they cannot be compared: ' +
        'Mercury is asked for seven rupas and the Sun for five.'
    }));
  }

  /*
   * Grahas across the top, the measures down the side. It was the other way
   * round, which is the shape the arithmetic has - a graha is a sum of its
   * shares - but not the shape the question has: Sthana bala opened into five
   * rows makes fifteen measures, and fifteen columns is a table that scrolls.
   * Turned, the width is seven grahas however many measures are shown.
   */
  function renderShadbalaHead(table, planets, sun) {
    var row = table.querySelector('thead tr');
    row.innerHTML = '';
    var first = el('th', null, 'Measure');
    first.setAttribute('scope', 'col');
    row.appendChild(first);
    /*
     * The name is the name and nothing else. It was tinted where the graha came
     * out weak, which put the verdict in two places and in a colour that means
     * something else everywhere on this page: red is retrograde and debilitated
     * here, so a weak Mercury read as a retrograde one. The Verdict row says
     * weak, in words, once.
     */
    planets.forEach(function (planet) {
      row.appendChild(grahaColumnHead(planet, sun));
    });
  }

  /*
   * A measure's name in Sanskrit, the same name in English, and the most it can
   * be worth.
   *
   * The English is on the row rather than in its hover. Every one of these is a
   * word a reader either knows or does not, and "Drekkana" with nothing beside
   * it is a row that can only be read by someone who did not need the table.
   * They are the standard glosses - positional, directional, temporal, motional,
   * natural, aspectual for the six - so the row names what the rest of the
   * literature names, not a paraphrase of our own.
   */
  function measureHead(label, en, max, says, shows) {
    var th = el('th', null, label);
    th.setAttribute('scope', 'row');
    /*
     * A space inside each span, not only a margin between them. A margin is
     * drawn and never written, so copying a row gave "Nata-UnnataDay or night60"
     * and a screen reader said the same - three separate facts run into one
     * word. The margin still does the spacing on screen; the space is there for
     * everything that reads the text rather than the layout.
     */
    if (en) th.appendChild(el('span', 'measure-en', ' ' + en));
    /*
     * A row whose ceiling is not one figure prints both rather than neither.
     * Paksha and ayana are doubled for one graha each and Kala bala inherits
     * that, so a bare 60 would be contradicted by the Moon's own cell and a
     * blank said nothing at all. `max` stays the row's true ceiling, which is
     * what the figures are checked against; `shows` is what a reader sees.
     */
    if (max !== null && max !== undefined) {
      th.appendChild(el('span', 'varga-weight', ' ' + (shows || String(max))));
    }
    if (says) th.title = says;
    return th;
  }

  /** Who a graha fought, how close, and what the war cost or paid it. */
  function yuddhaTitle(x) {
    return x.war.map(function (war) {
      return (war.won ? 'Beats ' : 'Loses to ') + war.against + ' by ' +
        war.value.toFixed(2) + ', the two being ' +
        (war.separation * 60).toFixed(1) + '\u2032 apart';
    }).join('. ') + '.';
  }

  /** One graha's seven divisions, the figure each was worth and why. */
  function saptavargajaTitle(x) {
    return x.saptavargajaDetail.map(function (part) {
      return 'D' + part.division + ' ' + Astro.SIGN_ABBR[part.sign] + ' ' +
        Astro.titleCase(Astro.VARGA_DIGNITY_LABELS[part.relation] || part.relation);
    }).join(', ') + '.';
  }

  /* ----------------------------------------------------------- vargas */

  /**
   * Where each graha stands in the ten vargas Parashara groups as the Vargas.
   *
   * The same seven-step scale the Dignity column uses, applied division by
   * division: the graha against the lord of whichever sign that division puts it
   * in. This is the ungraded form of what saptavargaja bala already scores, so it
   * sits beside Shadbala rather than with the rashi tables.
   *
   * Exaltation and debilitation are shown where they fall even though the
   * classical vimsopaka reckoning leaves exaltation out of its seven steps, since
   * reporting an exalted graha as a great friend's guest would hide the more
   * useful fact. What that costs - an exalted graha can score 7 of 20 and a
   * debilitated one 18, the score being read off the seven-step relation and
   * never off the label - used to be in the cell's title. The title now carries
   * the yogas alone, so the panel's note is where that is said.
   */
  /** Halves read better as halves: 3.5 is 3\u00bd, 0.5 is \u00bd. */
  function vimsopakaFigure(weight) {
    var whole = Math.floor(weight);
    var half = weight - whole >= 0.5;
    if (!half) return String(whole);
    return (whole ? String(whole) : '') + '\u00bd';
  }

  /*
   * The header carries each division's share of the twenty vimsopaka points, so
   * the columns that decide the score are visible rather than having to be known.
   * Built here because the divisions and the weights both live in the engine;
   * repeating either in the markup would be a second place for them to drift.
   */
  /*
   * Grahas across the top, divisions down the side.
   *
   * It was the other way round and could not stop scrolling: sixteen divisions
   * and a total made seventeen columns, and a graha read four columns in was a
   * graha whose name had gone off the left edge. Turned, the width is seven
   * grahas however many divisions the scheme has, so it fits a card and stays
   * fitting when the scheme changes.
   *
   * The turn also makes a cell what it always was in the reading. A graha in a
   * division is one td now, holding its sign over its dignity, where before it
   * was two rows that had to be kept in step by hand - the chip counted twice,
   * the hover band lit half of it, and every mark had to say which row it
   * belonged to.
   *
   * And nothing abbreviates any more. Seven columns leave room for Sagittarius
   * and Great Friend, so the short forms and the machinery that chose them are
   * gone with the scroll they were there to fight.
   */
  /*
   * One graha at the head of a column, with what is true of it everywhere below.
   *
   * [R] and [C] are facts about the graha in the rashi, so they hold for every
   * row under the name whichever grid it heads - divisions in one, shares of
   * Shadbala in the other. Shared rather than written twice: the two grids had
   * the same heading and only one of them had the flags, so a retrograde graha
   * was marked in Vimsopaka Bala and unmarked in Shadbala beside it.
   */
  function grahaColumnHead(planet, sun) {
    var th = el('th', null, planet.name);
    th.setAttribute('scope', 'col');
    [planet.retrograde ? 'R' : null,
     sun && Astro.isCombust(planet.name, planet.longitude, sun.longitude,
       planet.retrograde) ? 'C' : null]
      .filter(Boolean).forEach(function (f, n) {
        th.appendChild(el('span', 'flag flag-' + f.toLowerCase(),
          (n === 0 ? ' ' : '') + '[' + f + ']'));
      });
    return th;
  }

  function renderVargasHead(table, scheme, planets, sun) {
    var row = table.querySelector('thead tr');
    row.innerHTML = '';
    var first = el('th', null, 'Division');
    first.setAttribute('scope', 'col');
    row.appendChild(first);
    planets.forEach(function (planet) {
      row.appendChild(grahaColumnHead(planet, sun));
    });
  }

  /** The heading cell for one division: its number, its share, and the hover. */
  function divisionHead(division, scheme) {
    var weight = scheme.weights[division];
    var th = el('th', null, 'D' + division);
    th.setAttribute('scope', 'row');
    // A space in the span, not only the margin: see measureHead. Copied, this
    // row read "D93" where it means D9 worth 3.
    th.appendChild(el('span', 'varga-weight', ' ' + vimsopakaFigure(weight)));
    var varga = Astro.VARGAS.filter(function (v) { return v.division === division; })[0];
    /*
     * Every other scheme that carries this division, with its figure. The same
     * varga is worth 5 in one and 4 in another, and quoting a figure without
     * its scheme is the usual reason a vimsopaka total will not reconcile.
     */
    var elsewhere = Astro.VARGA_SCHEME_ORDER.filter(function (k) {
      return k !== scheme.key && Astro.VARGA_SCHEMES[k].weights[division] !== undefined;
    }).map(function (k) {
      var other = Astro.VARGA_SCHEMES[k];
      return other.weights[division] + ' across the ' + other.label.toLowerCase();
    });
    th.title = (varga ? varga.label + ', ' + varga.about + '. ' : '') +
      'Worth ' + weight + ' of the twenty in the ' + scheme.label.toLowerCase() +
      (elsewhere.length ? '; ' + elsewhere.join(', ') + '.' : '.');
    return th;
  }

  /*
   * The note describes whichever scheme is showing, its own share-out of the
   * twenty included. Writing one scheme's figures into the prose would be wrong
   * for the other three the moment the select moved.
   */
  /*
   * What the grid is and how to read it, and nothing else.
   *
   * The scoring used to sit under it, first as one four-hundred-word paragraph
   * and then folded into a disclosure, and both were the wrong place for it.
   * The varga viswa rungs, the four bands, strength against benefit, what the
   * count cannot see: every one of those is doctrine about vimsopaka rather
   * than instructions for this table, and every one was already written out at
   * length in the Lesson tab under Vimsopaka Bala and Strength and influence.
   * Two copies of a doctrine drift, and the copy nobody is maintaining is the
   * one a reader happens to be looking at.
   *
   * What stays is what the grid raises and nothing else answers: why seven rows
   * and not nine, and why the Sun is judged as Mars in one column. Both are
   * visible facts about what is on screen.
   *
   * The hovers are pointed at once and in general. Naming the three kinds - a
   * cell, a heading, a total - was a list the reader had to hold in order to
   * discover that everything has one, which is the shorter thing to say.
   *
   * No pointer to the Lesson tab either. It is a tab, three along from this one
   * and always on screen, and a note that ends by naming another tab reads as an
   * apology for not being that tab.
   *
   * The verse citation went with the doctrine. Which verses a scheme's share-out
   * comes from is worth knowing and is worth checking, but it is a fact about
   * the text rather than about the grid, and a reader looking at the grid is not
   * looking for it. The engine still records it, scheme by scheme, and the
   * library quotes all four.
   *
   * [V] is not among them. The flag key at the top of the tab defines all four
   * flags, this one included, and a second definition a few inches below it is
   * the same drift in miniature.
   */
  function vargaNote(scheme) {
    /*
     * One idea a sentence. It had been "Where each graha stands in the 16
     * divisions of the Shodasavarga, judged against the lord of the sign each
     * one gives" - a fragment with no verb of its own, trailing a clause whose
     * "each one" meant the divisions three lines back.
     */
    return 'Each of the ' + scheme.count + ' divisions of the ' + scheme.label +
      ' puts a graha in a sign. A cell gives that sign and its dignity there, judged ' +
      'against the sign\u2019s lord, and the last row scores those dignities out of ' +
      'twenty. ' +
      /*
       * The short forms with their words, built from the engine's own two tables
       * rather than typed out here. Nine abbreviations and nine words written
       * into a sentence is the pair of tables copied, and a rename would have
       * left the sentence saying the old one.
       *
       * No excuse for the shortening: that sixteen columns leave no room for
       * words is visible in the sixteen columns.
       */
      /*
       * Placement, not definition. The flag key at the top of the tab defines
       * [V] and *, so the note says only where they sit and why they are here:
       * each is one of the four things vimsopaka cannot see, put against the
       * value it qualifies. The other two have no value to sit against - an
       * exchange is about a pair of grahas and directional strength about a
       * house, and the grid prints neither - so they hang on the graha's name.
       */
      /*
       * Names nothing. The flag key at the top of the tab defines all eight
       * marks, and the note listing them again was that list in a second place,
       * which is what carried it back over two hundred words.
       *
       * The two channels are worth separating, though, because they make
       * different claims. A mark is one thing the score is blind to, and the
       * letter is the whole of it. A chip is a yoga with no letter: it was every
       * yoga, marked ones included, so a cell wearing [X] [D] said so twice,
       * once in two letters and once in four sentences of the same. Restricting
       * it to the unlettered takes the chip from nearly every cell to about half
       * of them, and each one now carries something new.
       */
      'A marked cell is one the score reads wrong and the mark says how, each being ' +
      'something it cannot see, set against the value in that cell it bears on. A chip in ' +
      'a corner means a hover with a yoga the cell has no mark for, the marked ones being ' +
      'read off the cell already. The Yogas tab reads a division in full. ' +
      /*
       * Both say what the grid does before why. A reader looking at seven rows
       * wants "they are left out" first and the reason after it, not a clause
       * about friendship to hold until the sentence gets to the point.
       */
      'Rahu and Ketu are left out: they own no sign and keep no friendships. In D30 the Sun ' +
      'is judged as Mars and the Moon as Venus, no luminary ruling a trimsamsa.';
  }

  /*
   * "A", "A and B", "A, B and C". Deleted with the abbreviation machinery and
   * put back: the cell hover reads a graha's yogas through it, so every chart
   * with a yoga in it - which is nearly all of them - threw on render.
   */
  function listOf(items) {
    if (items.length < 2) return items[0] || '';
    return items.slice(0, -1).join(', ') + ' and ' + items[items.length - 1];
  }

  /** Whichever scheme the select is on, falling back to the widest. */
  function currentScheme() {
    var chosen = document.getElementById('varga-scheme').value;
    return Astro.VARGA_SCHEMES[chosen] || Astro.VARGA_SCHEMES.shodasavarga;
  }

  /*
   * Table or charts, one at a time. The table is not replaced by the charts: it
   * is the readable form of the same numbers, and the charts are no use for
   * looking up what Venus does in D24.
   */
  function showVargaView(asCharts) {
    document.getElementById('vargas-charts').hidden = !asCharts;
    document.getElementById('vargas-table-scroll').hidden = asCharts;
    document.getElementById('vargas-as-charts').setAttribute('aria-pressed', String(asCharts));
    document.getElementById('vargas-as-table').setAttribute('aria-pressed', String(!asCharts));
  }

  function vargaViewIsCharts() {
    return document.getElementById('vargas-as-charts').getAttribute('aria-pressed') === 'true';
  }

  /*
   * The same switch for Shadbala, and for the same reason: the table is fifteen
   * rows of figures to look things up in, and the chart answers one question
   * across all seven grahas. Neither replaces the other, so neither is shown
   * over the other.
   *
   * One chart and not one a graha. The question it answers - who clears their
   * own minimum - is a question about the seven together, and seven charts of
   * one bar each would be seven ways of not asking it.
   */
  function showShadbalaView(asChart) {
    document.getElementById('shadbala-chart').hidden = !asChart;
    document.getElementById('shadbala-table-scroll').hidden = asChart;
    document.getElementById('shadbala-as-chart').setAttribute('aria-pressed', String(asChart));
    document.getElementById('shadbala-as-table').setAttribute('aria-pressed', String(!asChart));
  }

  /*
   * The yogas this grid already writes as a letter, so the hover does not say
   * them a second time: Parivartana is [X], Neecha Bhanga is [N] where it is the
   * raja form, and Kartari is [S] or [P]. A cell's hover carries what the cell
   * itself cannot show.
   */
  var LETTERED = ['Parivartana', 'Neecha Bhanga', 'Kartari'];

  function renderVargas(state) {
    var scheme = currentScheme();
    var keys = Astro.keyDivisions(scheme);
    var table = document.getElementById('vargas-table');
    var tbody = table.querySelector('tbody');
    tbody.innerHTML = '';

    var positionsD1 = {};
    state.chart.planets.forEach(function (p) { positionsD1[p.name] = p; });
    var sun = positionsD1.Sun;
    // Rahu and Ketu keep no friendships, so they have no column to head.
    var planets = state.chart.planets.filter(function (p) {
      return Astro.vargaDignity(p.name, p.longitude, 1, positionsD1, tatkalikaSetting(),
        horaSetting(), horaMercurySetting());
    });
    renderVargasHead(table, scheme, planets, sun);

    // Settled in the rashi and handed to every division: see hemmedByBenefics.
    var benefics = Astro.naturalBenefics(state.chart);
    var strengths = strengthsFor(state);

    scheme.divisions.forEach(function (division) {
      var lagna = Astro.vargaPosition(state.chart.ascendant.longitude, division).sign;
      var chart = Astro.chartInDivision(state.chart, division);
      /*
       * Every yoga the module knows, read in this division's own chart - the
       * same recast and the same strengths the Yogas tab uses, so the two cannot
       * disagree about what D9 holds. The exchange is pulled out of the same
       * pass, being one of the marks.
       */
      var yogasIn = {}, exchanging = {}, cancelled = {};
      Yogas.detect(chart, strengths).forEach(function (yoga) {
        (yoga.grahas || []).forEach(function (name) {
          if (LETTERED.indexOf(yoga.yoga) < 0) {
            var list = yogasIn[name] || (yogasIn[name] = []);
            if (list.indexOf(yoga.title) < 0) list.push(yoga.title);
          }
          if (yoga.yoga === 'Parivartana') exchanging[name] = yoga.title;
          if (yoga.yoga === 'Neecha Bhanga' && yoga.kind === 'raja') cancelled[name] = true;
        });
      });

      var tr = document.createElement('tr');
      if (keys.indexOf(division) >= 0) tr.className = 'varga-key';
      tr.appendChild(divisionHead(division, scheme));

      planets.forEach(function (planet) {
        var d = Astro.vargaDignity(planet.name, planet.longitude, division, positionsD1,
          tatkalikaSetting(), horaSetting(), horaMercurySetting());
        var td = el('td', 'varga-cell');
        if (!d) { td.textContent = '\u2013'; tr.appendChild(td); return; }

        var signLine = el('span', 'varga-sign', Astro.SIGNS[d.sign]);

        /*
         * The division has landed the graha back in the sign it holds in the
         * rashi. D1 is skipped: it is the rashi, so every cell in it would
         * qualify and the mark would say nothing. The classical vargottama is
         * this in D9; the other rows are the same comparison, computable
         * everywhere but not what the texts mean by the word.
         */
        if (division !== 1 && d.sign === Astro.signOf(planet.longitude)) {
          signLine.appendChild(el('span', 'flag flag-v', ' [V]'));
        }
        if (exchanging[planet.name]) {
          signLine.appendChild(el('span', 'flag flag-x', ' [X]'));
        }
        if (Astro.hemmedByBenefics(planet.name, d.sign, chart, benefics)) {
          signLine.appendChild(el('span', 'flag flag-s', ' [S]'));
        }
        if (Astro.hemmedByMalefics(planet.name, d.sign, chart, benefics)) {
          signLine.appendChild(el('span', 'flag flag-p', ' [P]'));
        }
        var house = ((d.sign - lagna) % 12 + 12) % 12 + 1;
        if (Astro.hasDigBala(planet.name, house)) {
          signLine.appendChild(el('span', 'flag flag-dr', ' [Dr]'));
        }

        /*
         * The rung the score was made of, and nothing else.
         *
         * This printed the dignity - Exal, Deb, Mool - over a cell whose score
         * is always the relation to the sign's lord, so a cell could read Mool
         * and be worth fifteen, or Exal and be worth seven. The varga viswa has
         * six steps and they are these; a word outside them is a word about a
         * different reckoning, and this grid is the vimsopaka one.
         *
         * The dignity is still known and still marks the cell where it changes
         * something: a cancelled debilitation keeps its [N].
         */
        var dignityLine = el('span', 'varga-dignity dig dig-' + d.relation,
          d.relationLabel);
        /*
         * [N] rather than a star. It was a star while it was the only mark that
         * sat on a dignity rather than on a sign, and a star is a footnote: it
         * says look elsewhere, where every other mark here names its own
         * condition. The letter says which condition without being looked up.
         */
        if (d.dignity === 'debilitated' && cancelled[planet.name]) {
          dignityLine.appendChild(el('span', 'flag flag-n', ' [N]'));
        }

        td.appendChild(signLine);
        td.appendChild(dignityLine);
        /*
         * One chip for the cell, and only where the hover has something the cell
         * has not already said. Each mark used to explain itself here as well as
         * wear its letter, so a cell carrying [X] [D] was read twice: once in
         * two letters, once in four sentences of the same. What is left is the
         * yogas that have no letter, which is the only thing this panel holds
         * and shows nowhere.
         */
        if (yogasIn[planet.name]) {
          td.title = planet.name + ' takes part in ' +
            listOf(yogasIn[planet.name].map(function (t) { return t.toLowerCase(); })) +
            ' in D' + division + '.';
          td.className += ' has-note';
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    /*
     * The totals close the table, a row rather than a column now, under a
     * heading that says what they are out of only to a screen reader: the panel
     * is called Vimsopaka Bala and the note beneath says the rest.
     */
    var totals = document.createElement('tr');
    totals.className = 'varga-totals';
    var head = el('th', null, 'Vimsopaka');
    head.setAttribute('scope', 'row');
    // Spaced like every other one of these: copied, it read "Vimsopaka20".
    head.appendChild(el('span', 'varga-weight', ' 20'));
    totals.appendChild(head);
    planets.forEach(function (planet) {
      /*
        * The same reading the cells above were drawn with. A total scored one
        * way under a row read the other would be a column that does not add up.
        */
      var score = Astro.vimsopaka(planet.name, planet.longitude, scheme, positionsD1,
        tatkalikaSetting(), horaSetting(), horaMercurySetting());
      var td = el('td', 'vimsopaka' + (score ? ' vimsopaka-' + score.band.key : ''),
        score ? score.total.toFixed(2) : '\u2013');
      if (score) {
        td.title = planet.name + ' scores ' + score.total.toFixed(2) + ' of twenty across the ' +
          scheme.label.toLowerCase() + ', which Parashara reads as ' + score.band.label +
          '. That is strength, not benefit: it says how fully ' + planet.name +
          ' acts in its own nature. ' +
          score.parts.map(function (part) {
            return 'D' + part.division + ' ' + vimsopakaFigure(part.weight) + '\u00d7' +
              part.viswa + '/20';
          }).join(', ') + '.';
      }
      totals.appendChild(td);
    });
    tbody.appendChild(totals);

    document.getElementById('vargas-note').textContent = vargaNote(scheme);
    renderVargaCharts(state, scheme);
  }

  /*
   * The rungs that count as well placed: exaltation, moolatrikona, an own sign
   * and a friend's or great friend's, and nothing below. Deleted by accident
   * with the abbreviation machinery and put back - vargaSummary still read it,
   * so the charts were throwing where the grid was fine.
   */
  /*
   * A good varga is one the ladder pays well for, so the count is taken on the
   * same rungs the score is: own, great friend, friend. It used to include
   * exalted and moolatrikona, which are not rungs of this ladder at all, so a
   * cell could be counted good while scoring seven.
   */
  var GOOD_KEYS = ['own', 'adhimitra', 'mitra'];

  function vargaSummary(state, scheme, tatkalika, horaRule, horaMercury) {
    var positionsD1 = {};
    state.chart.planets.forEach(function (p) { positionsD1[p.name] = p; });

    return state.chart.planets.map(function (planet) {
      var score = Astro.vimsopaka(planet.name, planet.longitude, scheme, positionsD1,
        tatkalika, horaRule, horaMercury);
      if (!score) return null;                     // the nodes keep no friendships
      var rashi = Astro.signOf(planet.longitude);
      var benefics = Astro.naturalBenefics(state.chart);
      var good = 0, marks = { V: 0, X: 0, S: 0, P: 0, D: 0, N: 0 };
      scheme.divisions.forEach(function (division) {
        var d = Astro.vargaDignity(planet.name, planet.longitude, division, positionsD1,
          tatkalika, horaRule, horaMercury);
        if (!d) return;
        if (GOOD_KEYS.indexOf(d.relation) >= 0) good++;
        var chart = Astro.chartInDivision(state.chart, division);
        var lagna = Astro.vargaPosition(state.chart.ascendant.longitude, division).sign;
        if (division !== 1 && d.sign === rashi) marks.V++;
        if (Yogas.parivartana(chart).some(function (yoga) {
          return (yoga.grahas || []).indexOf(planet.name) >= 0;
        })) marks.X++;
        if (Astro.hemmedByBenefics(planet.name, d.sign, chart, benefics)) marks.S++;
        if (Astro.hemmedByMalefics(planet.name, d.sign, chart, benefics)) marks.P++;
        if (Astro.hasDigBala(planet.name, ((d.sign - lagna) % 12 + 12) % 12 + 1)) marks.D++;
        if (d.key === 'debilitated' && Yogas.neechaBhanga(chart).some(function (yoga) {
          return yoga.kind === 'raja' && (yoga.grahas || []).indexOf(planet.name) >= 0;
        })) marks.N++;
      });
      return { graha: planet.name, vimsopaka: score.total, band: score.band,
               good: good, vargottama: marks.V, marks: marks };
    }).filter(Boolean);
  }

  function svgEl(tag, attrs, text) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, String(attrs[k])); });
    if (text != null) node.textContent = text;
    return node;
  }

  /**
   * One bar chart: a row of grahas, one or two bars each, drawn to its own scale.
   *
   * Two scales never share a plot here. Vimsopaka out of twenty and a count of
   * divisions are different measures, and putting them on one axis would make a
   * bar of the same height mean two different things.
   *
   * Marks follow the house rules: bars capped at 24px so the band keeps some
   * air, a rounded data-end with a square foot at the baseline, a 2px gap in the
   * surface colour between paired bars, and recessive gridlines.
   */
  function barChart(opts) {
    /*
     * Drawn to half the width it used to be, the two charts now sitting side by
     * side. The viewBox scales to whatever the column is, so the number that
     * matters is the ratio of text to plot: at 760 across a half column the 12px
     * labels came out nearer 8. Narrowing the box rather than enlarging the type
     * keeps one set of sizes for both layouts.
     */
    /*
     * A facet is drawn to a smaller box for the same reason the wide grid takes
     * a smaller type size: the viewBox scales to its column, so the ratio of
     * text to plot is what the number sets. Five of these sit where two of the
     * others do.
     */
    /*
     * No margin for tick labels, there being none. Every bar carries its own
     * value above it, so a column of numbers down the side was the same figures
     * a second time and less exactly - and with two scales it was two columns
     * of them. The gridlines stay: they cost nothing and let a reader see that
     * one bar is about twice another without counting.
     */
    var W = opts.compact ? 300 : 500, H = opts.compact ? 165 : 215;
    var left = 4, right = 4, top = 18;
    var bottom = opts.compact ? 30 : 34;
    var plotW = W - left - right, plotH = H - top - bottom;
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'varga-chart',
                             role: 'img', 'aria-label': opts.title });

    /*
     * One scale. There was a second for a while, the score on the left and the
     * counts on the right, because a graha's whole profile was wanted on one
     * chart - and two scales means a bar of a given height says one thing on
     * one side and another on the other, which is the worst mistake a chart can
     * make. The score is a single number, so it is written beside the title
     * where a single number belongs and the chart is left to the one thing that
     * is genuinely a series.
     */
    // Four bands, drawn and not labelled.
    var ticks = 4;
    for (var t = 0; t <= ticks; t++) {
      var y = top + plotH - (t / ticks) * plotH;
      svg.appendChild(svgEl('line', { x1: left, y1: y, x2: W - right, y2: y,
                                      class: t === 0 ? 'chart-base' : 'chart-grid' }));
    }

    /*
     * A threshold, where the chart has one. It is the whole of what the
     * shadbala chart is for - a bar is above the line or below it - so it is
     * drawn across the plot and labelled at its own height rather than left to
     * be inferred from a gridline that happens to be near.
     */
    if (opts.rule !== undefined && opts.rule <= opts.max) {
      var ruleY = top + plotH - (opts.rule / opts.max) * plotH;
      svg.appendChild(svgEl('line', { x1: left, y1: ruleY, x2: W - right, y2: ruleY,
                                      class: 'chart-rule' }));
      if (opts.ruleLabel) {
        svg.appendChild(svgEl('text', { x: W - right, y: ruleY - 4,
                                        class: 'chart-rule-label',
                                        'text-anchor': 'end' }, opts.ruleLabel));
      }
    }

    var band = plotW / opts.rows.length;
    var series = opts.series;
    var gap = 2;                                   // in the surface colour, not a stroke
    var barW = Math.min(24, (band * 0.62 - gap * (series.length - 1)) / series.length);

    opts.rows.forEach(function (row, i) {
      var groupW = barW * series.length + gap * (series.length - 1);
      var x0 = left + band * i + (band - groupW) / 2;

      series.forEach(function (s, j) {
        var value = s.value(row);
        var h = Math.max(0, (value / opts.max) * plotH);
        var x = x0 + j * (barW + gap);
        var y = top + plotH - h;
        /*
         * A rounded data-end and a square foot: the rect is drawn with a radius
         * and the bottom corners filled back in, rather than rounding all four
         * and floating the bar off its baseline.
         */
        // A row may colour its own bar: in the per-graha facets each bar is a
        // mark, and a mark has a colour already, the one its letter wears.
        var g = svgEl('g', { class: 'chart-bar ' + s.cls + (row.cls ? ' ' + row.cls : '') });
        if (h > 0) {
          g.appendChild(svgEl('rect', { x: x, y: y, width: barW, height: h,
                                        rx: Math.min(4, barW / 2) }));
          if (h > 4) {
            g.appendChild(svgEl('rect', { x: x, y: top + plotH - Math.min(4, h),
                                          width: barW, height: Math.min(4, h) }));
          }
        }
        /*
         * A bar's hover names what it is. In the per-graha facets the bar is a
         * mark, so row.name carries the word the bracketed letter stands for: a
         * chart of [V] [X] [S] [P] [D] [N] wants that on hover rather than a
         * legend repeating the flag key.
         */
        g.appendChild(svgEl('title', {}, (row.name || row.graha) + ', ' + s.label +
          ': ' + s.readout(row) + (opts.outOf ? ' of ' + opts.outOf : '')));
        svg.appendChild(g);

        // Values wear text tokens, never the series colour; the bar carries identity.
        svg.appendChild(svgEl('text', { x: x + barW / 2, y: y - 5, class: 'chart-value',
                                        'text-anchor': 'middle' }, s.readout(row)));
      });

      svg.appendChild(svgEl('text', { x: left + band * i + band / 2, y: H - 12,
                                      class: 'chart-name', 'text-anchor': 'middle' },
                            /*
                             * A row labels its own bar where it has a label to
                             * give. The abbreviation is for grahas, and it takes
                             * the first two letters, so a mark came out as "[V"
                             * with its bracket cut off.
                             */
                            row.axis || Astro.grahaAbbr(row.graha)));
    });

    var figure = el('figure', 'varga-figure');
    var caption = el('figcaption', 'chart-title', opts.title);
    /*
     * One number beside the title rather than a bar of its own. A score out of
     * twenty is a single figure and a stat tile is what the guidance calls for;
     * a bar drawn beside six counts would have needed a scale of its own, and a
     * second scale is the thing that makes two bars of one height mean two
     * different things.
     */
    if (opts.aside) {
      var aside = el('span', 'chart-aside', ' (' + opts.aside + ')');
      if (opts.asideSays) aside.title = opts.asideSays;
      caption.appendChild(aside);
    }
    figure.appendChild(caption);
    figure.appendChild(svg);
    if (series.length > 1) {
      var legend = el('div', 'chart-legend');
      series.forEach(function (s) {
        var item = el('span', 'legend-item');
        item.appendChild(el('span', 'legend-swatch ' + s.cls));
        item.appendChild(el('span', null, s.label));
        legend.appendChild(item);
      });
      figure.appendChild(legend);
    }
    if (opts.note) figure.appendChild(el('p', 'chart-note', opts.note));
    return figure;
  }

  /*
   * The five that help, then the one that harms. Papa kartari is the only mark
   * here that reports an affliction, so it closes the row rather than sitting
   * third among the rest, and it wears the red its letter wears in the grid.
   * Every bar takes the colour of its own mark for the same reason: a reader
   * coming from the table already knows what the purple and the blue mean.
   */
  var MARKS = [
    { key: 'V', label: '[V]', name: 'Vargottama' },
    { key: 'X', label: '[X]', name: 'Exchange of signs' },
    { key: 'S', label: '[S]', name: 'Shubha kartari' },
    { key: 'D', label: '[Dr]', name: 'Directional strength' },
    { key: 'N', label: '[N]', name: 'Neecha bhanga raja yoga' },
    { key: 'P', label: '[P]', name: 'Papa kartari' }
  ];

  /**
   * One chart a graha: its vimsopaka score and its marks together.
   *
   * The score and the counts are different measures - twenty points against
   * however many divisions the scheme has - so the chart carries two scales,
   * the score on the left and the counts on the right.
   *
   * That is the thing the dataviz guidance calls the worst mistake a chart can
   * make, and the objection is real: with two scales the height of a bar means
   * one thing on the left of the rule and another on the right, and the ratio
   * between them is whichever the author chose. It was three charts before -
   * the score, the well-placed count, and a facet of marks each - which put
   * everything about one graha in three places.
   *
   * What is done about it: the score is one bar and the marks are six, a rule
   * divides them, each axis carries its own name and its own numbers, and the
   * score keeps the colour it wears in every other chart on the page. Nothing
   * makes a dual axis safe; this makes it legible.
   */
  function renderVargaCharts(state, scheme) {
    var host = document.getElementById('vargas-charts');
    host.innerHTML = '';
    var rows = vargaSummary(state, scheme, tatkalikaSetting(), horaSetting(),
      horaMercurySetting());
    if (!rows.length) return;

    /*
     * One scale across all seven charts on each side, so a tall bar is tall
     * against the other grahas and not only against the rest of its own chart.
     * The right one is taken from the largest count any graha reaches on any
     * mark rather than from the scheme's division count, which would flatten
     * every mark into the baseline.
     */
    var ceiling = 1;
    rows.forEach(function (r) {
      MARKS.forEach(function (m) { ceiling = Math.max(ceiling, r.marks[m.key]); });
    });

    var facets = el('div', 'varga-facets');
    rows.forEach(function (row) {
      facets.appendChild(barChart({
        title: row.graha,
        aside: row.vimsopaka.toFixed(1),
        asideSays: row.graha + '\u2019s vimsopaka bala over the ' + scheme.label +
          ': ' + row.vimsopaka.toFixed(2) + ' of 20.',
        rows: MARKS.map(function (m) {
          return { graha: m.label, axis: m.label, name: m.name,
                   cls: 'mark-' + m.key.toLowerCase(), count: row.marks[m.key] };
        }),
        max: ceiling, outOf: scheme.count, compact: true,
        series: [{ label: row.graha, cls: 'series-mark',
                   value: function (r) { return r.count; },
                   readout: function (r) { return String(r.count); } }]
      }));
    });
    host.appendChild(facets);
    host.appendChild(el('p', 'chart-note varga-facet-note',
      'One chart a graha. The figure beside the name is its vimsopaka bala out of ' +
      'twenty, which is one number and so is written rather than drawn. The bars are ' +
      'how many of the ' + scheme.count + ' divisions carry each of its marks, on one ' +
      'scale across all seven charts, so a tall bar is tall against the other grahas ' +
      'and not only against the rest of its own chart. The grid above says which ' +
      'divisions they are.'));
  }

  /* --------------------------------------------------------------- yogas */

  var READINGS_API = 'https://deiefjnwbfcywsaaqqbs.supabase.co/functions/v1/readings';

  /** Render one passage from astro_readings as a block of prose. */
  function passageBlock(passage, grouped) {
    var block = el('article', 'passage');
    block.appendChild(el('h4', 'passage-heading', passage.heading));
    // Under a subject heading the topic and subject are already on screen; the
    // condition is the only part that still distinguishes one passage.
    var meta = grouped ? [] : [passage.topic, passage.subject];
    if (passage.condition && passage.condition !== 'general') meta.push(passage.condition);
    if (meta.length) block.appendChild(el('p', 'passage-meta', meta.join(' \u00b7 ')));
    var list = el('ol', 'passage-points');
    (passage.points || []).forEach(function (point) {
      list.appendChild(el('li', null, point));
    });
    block.appendChild(list);
    if (passage.note) block.appendChild(el('p', 'passage-note', passage.note));
    /*
     * What the passage was read out of, where it names anything. The column has
     * been on the table from the start and nothing wrote to it; a passage that
     * says two authorities disagree is worth little without saying which books
     * they are, and a reader comparing this site against another calculator
     * needs the citation more than the conclusion.
     */
    if (passage.source) {
      block.appendChild(el('p', 'passage-source', passage.source));
    }
    return block;
  }

  /**
   * Yogas found in the chart: what is present, and how it forms.
   *
   * No explanation here. This panel answers "what does this chart have", and a
   * paragraph of theory repeated under every finding buries the answer -
   * particularly when a chart holds several. The passages live in the Lesson
   * tab, which is where someone goes to read rather than to look.
   */
  /**
   * The divisions the two chart slots are showing, in slot order and without
   * repeats.
   *
   * Yogas and aspects used to be computed for the rashi alone, so a parivartana
   * in D10 went unreported however plainly it was sitting there. They follow the
   * charts now: whatever is on screen is what gets read. Not all sixteen at
   * once, which would bury the rashi under a hundred findings nobody asked for.
   */
  /**
   * One division at a time, chosen here rather than taken from the charts above.
   *
   * It followed the two charts at first, which meant inspecting D24 cost you
   * whichever chart you were reading, and showed two sets of findings at once.
   * A picker of its own, like the Vargas scheme picker, reads one thing at a
   * time and leaves the charts alone.
   */
  function fillDivisionPickers() {
    ['yoga-division', 'aspect-division'].forEach(function (id) {
      var select = document.getElementById(id);
      select.innerHTML = '';
      /*
       * Only the yoga table can read every division at once: the aspects panel
       * draws one grid and has nowhere to put sixteen.
       */
      if (id === 'yoga-division') {
        var every = el('option', null, 'Every divisional chart');
        every.value = EVERY;
        select.appendChild(every);
      }
      Astro.VARGAS.forEach(function (v) {
        var opt = el('option', null, v.name + ' \u00b7 ' + v.label);
        opt.value = String(v.division);
        if (v.division === 1) opt.selected = true;
        select.appendChild(opt);
      });
      select.addEventListener('change', function () {
        if (!lastChart) return;
        if (id === 'yoga-division') renderYogas(lastChart); else renderAspects(lastChart);
      });
    });

    /*
     * The graha filter redraws the same table rather than the chart, so it is
     * wired here beside the picker it sits next to. Its options are rebuilt on
     * every draw from what the chart actually gave, so there is nothing to
     * fill in now.
     */
    var byGraha = document.getElementById('yoga-graha');
    /*
     * Each option says what it is, there being no label beside it any more.
     * "Asc" was legible under a heading reading From and says nothing without
     * one, so every reference now reads as the phrase a reader would use.
     */
    var byReference = document.getElementById('yoga-reference');
    if (byReference) {
      var everyRef = el('option', null, 'From every planet');
      everyRef.value = EVERY;
      byReference.appendChild(everyRef);
      REFERENCES.forEach(function (name) {
        var option = el('option', null,
          name === 'Ascendant' ? 'From the ascendant'
            : 'From ' + (name === 'Sun' || name === 'Moon' ? 'the ' + name : name));
        option.value = name;
        if (name === 'Ascendant') option.selected = true;
        byReference.appendChild(option);
      });
    }
    [byGraha, byReference].forEach(function (picker) {
      if (!picker) return;
      picker.addEventListener('change', function () {
        if (lastChart) renderYogas(lastChart);
      });
    });
  }

  /** The division a panel is set to. */
  function divisionFor(pickerId) {
    var division = +document.getElementById(pickerId).value || 1;
    var varga = Astro.VARGAS.filter(function (v) { return v.division === division; })[0];
    return { division: division, name: varga ? varga.name : 'D' + division,
             label: varga ? varga.label : '' };
  }

  function yogaFrequency(finding) {
    if (typeof FREQUENCIES === 'undefined') return;
    var context = finding.frequencyDivision + '|';
    if (FREQUENCIES.yogaTitleByDivision &&
        typeof FREQUENCIES.yogaTitleByDivision[context + finding.title] === 'number') {
      return FREQUENCIES.yogaTitleByDivision[context + finding.title];
    }
    if (typeof FREQUENCIES.yogaTitle[finding.title] === 'number') {
      return FREQUENCIES.yogaTitle[finding.title];
    }
    var key = finding.subject + '|' + finding.condition;
    if (document.getElementById('budha-floor').value === 'none' &&
        typeof FREQUENCIES.yogaNoFloor[key] === 'number') {
      return FREQUENCIES.yogaNoFloor[key];
    }
    return FREQUENCIES.yoga[key];
  }

  function yogaManifestationFrequency(finding) {
    if (typeof FREQUENCIES === 'undefined' || !FREQUENCIES.yogaManifestation) return;
    var route = Array.isArray(finding.route) ? finding.route.slice().sort().join('+')
      : finding.route || finding.kind || finding.condition || 'general';
    var context = finding.frequencyDivision + '|';
    if (FREQUENCIES.yogaManifestationByDivision &&
        typeof FREQUENCIES.yogaManifestationByDivision[
          context + finding.title + '|' + route] === 'number') {
      return FREQUENCIES.yogaManifestationByDivision[
        context + finding.title + '|' + route];
    }
    return FREQUENCIES.yogaManifestation[finding.title + '|' + route];
  }

  function renderYogas(state) {
    var list = document.getElementById('yoga-list');
    var note = document.getElementById('yoga-note');
    list.innerHTML = '';

    var strengths = strengthsFor(state).grahas;
    var divisionPick = document.getElementById('yoga-division');
    var referencePick = document.getElementById('yoga-reference');
    var everyDivision = !!divisionPick && divisionPick.value === EVERY;
    var everyReference = !!referencePick && referencePick.value === EVERY;
    var reference = everyReference ? 'Ascendant'
      : (referencePick && referencePick.value) || 'Ascendant';
    var chosen = everyDivision
      ? { division: 1, name: 'every divisional chart', label: '' }
      : divisionFor('yoga-division');

    /*
     * One reading, or the cross product of the two pickers.
     *
     * Each finding carries where it was read, because the same yoga found in
     * D1 from the ascendant and in D9 from the Moon are two different
     * statements, and a table running them together would be claiming one.
     * The Chart and From columns were showing the selection, which is the
     * same in every row until a reader asks for more than one.
     */
    var divisions = everyDivision ? Astro.SHODASAVARGA : [chosen.division];
    var references = everyReference ? REFERENCES : [reference];
    var found = [];
    divisions.forEach(function (division) {
      var inDivision = Astro.chartInDivision(state.chart, division);
      var varga = Astro.VARGAS.filter(function (v) { return v.division === division; })[0];
      references.forEach(function (from) {
        Yogas.detect(rotatedOnto(inDivision, from), strengths).forEach(function (f) {
          f.inChart = varga ? varga.name : 'D' + division;
          f.from = from === 'Ascendant' ? 'Asc' : from;
          f.frequencyDivision = division;
          f.frequencyReference = from;
          found.push(f);
        });
      });
    });

    if (!found.length) {
      note.textContent = 'No yoga among those this page looks for is present in ' +
        chosen.name + '.';
      return;
    }
    note.textContent = 'Yogas are read in the division chosen above, which is ' +
      'independent of what the two charts are showing. An angle-trine raja yoga ' +
      'is common, present in roughly three charts in four, so it is read ' +
      'alongside the strength of the grahas forming it rather than on its own.';

    /*
     * A table now, not a stack of cards, and the column that matters is Graha.
     *
     * Every finding used to print the grahas taking part in it, which is a
     * different question from whose yoga it is, and the page only ever asked
     * the second. Shubha Vesi is the case that showed it: Mercury standing in
     * the sign after the Sun makes the combination, the Sun only marks where to
     * count from, and listing both put it on the Sun's card as though the Sun
     * had done something. The engine now resolves each finding to one graha or
     * to none, and that is what this column shows; everyone taking part is
     * still there, under Taking part.
     *
     * A dash in the column is a real answer, not a gap. An exchange belongs to
     * two lords, a Nabhasa figure to all seven at once, Mahabhagya to the
     * ascendant and the luminaries together: naming any one of them would be
     * the same mistake in the other direction.
     */
    /*
     * Which graha the table is narrowed to.
     *
     * The list is built from whoever this chart actually gave a finding to, so
     * the control can never offer a name that would empty the table. A chosen
     * graha that the next chart or division has nothing for falls back to all
     * rather than showing an empty table under a name that is still selected.
     *
     * The shared findings - an exchange between two lords, a Nabhasa figure
     * made by all seven - belong to nobody, so they are kept in every view:
     * they are as true of the graha being looked at as of any other, and
     * dropping them would answer "what has Venus got" by leaving out things
     * Venus is in.
     */
    var grahaPick = document.getElementById('yoga-graha');
    var whoHas = [];
    found.forEach(function (f) {
      // Everyone a finding names, not only the one it resolves to: a reader
      // asking for Venus wants the combinations Venus is in as well as the
      // ones that are hers.
      (f.graha ? [f.graha] : (f.grahas || [])).forEach(function (name) {
        if (name && whoHas.indexOf(name) < 0) whoHas.push(name);
      });
    });
    whoHas.sort(function (a, b) {
      return Astro.GRAHA_ORDER.indexOf(a) - Astro.GRAHA_ORDER.indexOf(b);
    });
    var wanted = grahaPick ? grahaPick.value : '';
    if (wanted && whoHas.indexOf(wanted) < 0) wanted = '';
    if (grahaPick) {
      grahaPick.innerHTML = '';
      var all = el('option', null, 'Every graha');
      all.value = '';
      grahaPick.appendChild(all);
      whoHas.forEach(function (name) {
        var option = el('option', null, name);
        option.value = name;
        grahaPick.appendChild(option);
      });
      grahaPick.value = wanted;
      grahaPick.disabled = whoHas.length === 0;
    }
    var shown = !wanted ? found : found.filter(function (f) {
      return f.graha === wanted || (!f.graha && (f.grahas || []).indexOf(wanted) >= 0);
    });

    var table = el('table', 'yoga-table');
    var head = document.createElement('thead');
    var headRow = document.createElement('tr');
    /*
     * Graha first. The question this table is read with is "what has this
     * graha got", and the column answering it was third, behind two that
     * describe the finding rather than place it.
     */
    /*
     * Two rows, because the last two columns are one question asked twice.
     * "Manifestation probability" beside "Yoga probability" read as two
     * unrelated measures of different things, where they are the same measure
     * against two backgrounds: how often this yoga forms in a chart conditioned
     * like this one, and how often it forms in any chart at all.
     */
    ['Graha', 'Chart', 'From', 'Yoga', 'Result'].forEach(function (h) {
      var th = el('th', null, h);
      th.setAttribute('scope', 'col');
      th.setAttribute('rowspan', '2');
      headRow.appendChild(th);
    });
    var span = el('th', 'yoga-group', 'Yoga probability');
    span.setAttribute('scope', 'colgroup');
    span.setAttribute('colspan', '2');
    headRow.appendChild(span);
    head.appendChild(headRow);

    var subRow = document.createElement('tr');
    ['This manifestation', 'Overall'].forEach(function (h) {
      var th = el('th', 'yoga-subhead', h);
      th.setAttribute('scope', 'col');
      subRow.appendChild(th);
    });
    head.appendChild(subRow);
    table.appendChild(head);
    var body = document.createElement('tbody');

    shown.forEach(function (finding) {
      var tr = document.createElement('tr');

      /*
       * Whom the condition applies to in this chart: the graha the finding
       * resolves to, or the grahas that make it between them.
       *
       * This column used to print a dash for the second kind, which was a
       * true answer to "whose yoga is this" and a useless one to the question
       * the table is actually read with. Nothing is lost by naming them:
       * measured over 1,804 findings, not one that fails to resolve to a
       * single graha fails to name any - the dash was never "the chart as a
       * whole", it was always "these, together", with the names already to
       * hand in the row.
      */
      var whose = el('th', finding.graha ? 'yoga-graha' : 'yoga-graha is-shared',
        finding.graha || (finding.grahas || []).join(', ') || '\u2013');
      whose.setAttribute('scope', 'row');
      if (!finding.graha) {
        whose.title = finding.title + ' is not one graha\u2019s: it is made by ' +
          (finding.grahas.length > 1 ? 'these together' : 'the chart as a whole') + '.';
      }
      tr.appendChild(whose);

      tr.appendChild(el('td', 'yoga-chart', finding.inChart));
      tr.appendChild(el('td', 'yoga-from', finding.from));
      var yogaName = el('td', 'yoga-name', finding.title);
      yogaName.title = finding.manifestation;
      tr.appendChild(yogaName);
      var passage = (lessonLibrary || []).filter(function (p) {
        return p.topic === 'yoga' && p.subject === finding.subject &&
          p.condition === finding.condition;
      })[0];
      var effect = passage && passage.effect ? passage.effect : 'mixed';
      tr.appendChild(el('td', 'yoga-effect yoga-effect-' + effect,
        effect.charAt(0).toUpperCase() + effect.slice(1)));
      var manifestationPct = yogaManifestationFrequency(finding);
      tr.appendChild(el('td', 'yoga-frequency yoga-manifestation-frequency',
        typeof manifestationPct === 'number' ? manifestationPct + '%' : '\u2013'));
      var pct = yogaFrequency(finding);
      tr.appendChild(el('td', 'yoga-frequency yoga-overall-frequency',
        typeof pct === 'number' ? pct + '%' : '\u2013'));
      body.appendChild(tr);
    });
    table.appendChild(body);
    var scroll = el('div', 'table-scroll');
    scroll.appendChild(table);
    list.appendChild(scroll);
  }

  function fetchPassages(query, done) {
    if (!window.fetch) return done(null);
    fetch(READINGS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-region': API_REGION },
      body: JSON.stringify(query)
    }).then(function (res) { return res.ok ? res.json() : null; })
      .then(function (body) { done(body && body.passages ? body.passages : null); })
      .catch(function () { done(null); });
  }

  /**
   * Who aspects whom, in both directions.
   *
   * Both directions because drishti is not mutual: Saturn three signs from Mars
   * aspects it and is not aspected back, since the 3rd is Saturn's aspect and
   * not Mars's. A single column would make that look like an error.
   */
  function renderAspects(state) {
    /*
     * Built in code rather than sitting in the markup, because the table belongs
     * to whichever division the picker is on: an aspect in D10 is as real as one
     * in D1, and was going unreported while the rashi was the only chart the
     * detectors ever saw.
     */
    var host = document.getElementById('aspect-host');
    var d = divisionFor('aspect-division');
    host.innerHTML = '';

    var scroll = el('div', 'table-scroll');
    var table = el('table', 'aspect-table');
    var head = document.createElement('thead');
    var headRow = document.createElement('tr');
    ['Graha', 'Aspects', 'Also aspects, from previous sign', 'Aspected by']
      .forEach(function (h) {
        var th = el('th', null, h);
        th.setAttribute('scope', 'col');
        headRow.appendChild(th);
      });
    head.appendChild(headRow);
    table.appendChild(head);
    var tbody = document.createElement('tbody');
    table.appendChild(tbody);
    scroll.appendChild(table);
    host.appendChild(scroll);

    Yogas.aspectTable(Astro.chartInDivision(state.chart, d.division)).forEach(function (row) {
      var tr = document.createElement('tr');
      var named = function (list) {
        if (!list.length) return '\u2013';
        return list.map(function (x) {
          return x.graha + (x.retrograde ? ' [R]' : '') + ' (' + Yogas.ordinal(x.apart) + ')';
        }).join(', ');
      };
      // The two casting columns sit together: what it aspects from where it
      // stands, then what the retrograde rule adds. "Aspected by" last, so the
      // change of direction happens once rather than twice.
      [[row.graha + (row.retrograde ? ' [R]' : ''), null],
       [named(row.casts), null],
       [named(row.fromPreviousSign), 'rao-aspects'],
       [named(row.receives), null]]
        .forEach(function (cell, i) {
          var td = el(i === 0 ? 'th' : 'td', cell[1], cell[0]);
          if (i === 0) td.setAttribute('scope', 'row');
          tr.appendChild(td);
        });
      tbody.appendChild(tr);
    });

    document.getElementById('aspect-note').textContent =
      'Full Parashari aspects, counted whole-sign in the division chosen above: every graha ' +
      'aspects the ' +
      '7th from itself, Mars the 4th and 8th besides, Jupiter the 5th and 9th, Saturn the 3rd ' +
      'and 10th. Aspect is not mutual, so the first two columns differ. ' +
      'The last column is K. N. Rao\u2019s rule, not a classical one: a retrograde graha also ' +
      'acts from the sign behind the one it occupies, while it is within the first ten degrees ' +
      'of its sign - as far back as retrogression could carry it. Rahu and Ketu are left out ' +
      'of that, being retrograde always. No Parashari text gives the rule, so it is kept in its ' +
      'own column for you to take or leave; only aspects it adds are shown. ' +
      'Otherwise retrogression does not change what a graha aspects, and tells instead on ' +
      'strength, through cheshta bala on the Shadbala tab. Parashara gives Rahu and Ketu no ' +
      'aspects either; the 5th, 7th and 9th shown for them follow modern practice. Partial ' +
      'aspects are not listed.';
  }

  /* -------------------------------------------------------------- lesson */

  var lessonQuery = document.getElementById('lesson-query');
  var lessonResults = document.getElementById('lesson-results');
  var lessonStatus = document.getElementById('lesson-status');
  var lessonFilters = document.getElementById('lesson-filters');
  var lessonLibrary = null;
  var lessonTimer = null;

  /** Fetch the library once, then search it in the page. */
  function loadLessons() {
    if (lessonLibrary) return renderLessons();
    lessonStatus.textContent = 'Loading\u2026';
    fetchPassages({}, function (passages) {
      lessonLibrary = passages || [];
      lessonStatus.textContent = passages ? '' : 'The lesson library could not be reached.';
      renderTopicFilters();
      renderLessons();
    });
  }

  function renderTopicFilters() {
    lessonFilters.innerHTML = '';
    var topics = [];
    lessonLibrary.forEach(function (p) {
      if (topics.indexOf(p.topic) < 0) topics.push(p.topic);
    });
    if (topics.length < 2) return;
    topics.forEach(function (topic) {
      var chip = el('button', 'lesson-chip', topic);
      chip.type = 'button';
      chip.addEventListener('click', function () {
        lessonQuery.value = topic;
        renderLessons();
      });
      lessonFilters.appendChild(chip);
    });
  }

  /**
   * Results grouped by subject, with the conditions beneath as subtopics.
   *
   * A subject is the thing being learned about and its conditions are the
   * states of it: parivartana with its maha, khala and dainya; the Sun with its
   * strong and weak. Listing all six flat would read as six unrelated passages
   * rather than two topics with kinds under them.
   */
  function renderLessons() {
    var q = lessonQuery.value.trim().toLowerCase();
    lessonResults.innerHTML = '';
    var matches = (lessonLibrary || []).filter(function (p) {
      if (!q) return true;
      return [p.subject, p.heading, p.topic, p.condition, p.note]
        .concat(p.points || [])
        .filter(Boolean)
        .some(function (field) { return String(field).toLowerCase().indexOf(q) >= 0; });
    });

    if (!matches.length) {
      lessonStatus.textContent = lessonLibrary && lessonLibrary.length
        ? 'Nothing on that yet. The library is being built up.'
        : lessonStatus.textContent;
      return;
    }
    lessonStatus.textContent = matches.length + ' of ' + lessonLibrary.length +
      (lessonLibrary.length === 1 ? ' passage' : ' passages');

    var order = [], bySubject = {};
    matches.forEach(function (p) {
      var key = p.topic + '\u0000' + p.subject;
      if (!bySubject[key]) { bySubject[key] = []; order.push(key); }
      bySubject[key].push(p);
    });

    order.forEach(function (key) {
      var group = bySubject[key];
      var topic = key.split('\u0000')[0], subject = key.split('\u0000')[1];
      var section = el('section', 'lesson-topic');
      section.appendChild(el('h4', 'lesson-subject', subject));
      section.appendChild(el('p', 'lesson-topic-name', topic));

      // The general passage introduces the subject; the rest are its kinds.
      group.sort(function (a, b) {
        return (a.condition === 'general' ? -1 : 0) - (b.condition === 'general' ? -1 : 0);
      });
      group.forEach(function (p) {
        var block = passageBlock(p, true);
        if (p.condition !== 'general') block.className += ' passage-subtopic';
        section.appendChild(block);
      });
      lessonResults.appendChild(section);
    });
  }

  lessonQuery.addEventListener('input', function () {
    clearTimeout(lessonTimer);
    lessonTimer = setTimeout(renderLessons, 120);
  });

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

  /*
   * The same flag as the one on the card. Doubt about a birth time usually
   * arrives while reading the chart it produced, so it can be raised here; it
   * is written to the saved record, which is where it will still be tomorrow.
   */
  document.getElementById('flag-button').addEventListener('click', function () {
    if (lastChart) flagThisChart(!lastChart.flagged);
  });

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
  var editButton = document.getElementById('edit-button');

  /*
   * Seven public reference charts live here for the engine checks and for
   * provisioning the database deliberately. They are not inserted into a new
   * browser's Saved tab: that list now mirrors its database rows exactly.
   * All seven are picked for being checkable rather than for being famous, and
   * between them they show the three things that
   * decide whether a chart can be trusted: the time, the clock it is read on,
   * and the place. The last of them is here for what it asks of the drawing
   * rather than of the data.
   *
   * Donald Trump's time is on a public birth certificate, so the chart can be
   * reproduced in any other ephemeris, and its Jupiter mahadasha begins in
   * November 2016, on a date every reader already knows. Kareem Abdul-Jabbar's
   * is a time given from memory rather than from a record, on a date that falls
   * in the gap before daylight saving began that year, which is where the
   * reading of a clock time decides the ascendant. Ava Gardner's is an AA time
   * from a birth certificate, but she was born in Grabtown, which no gazetteer
   * of towns above five thousand people carries, so the place is Smithfield
   * eight kilometres away. That is close enough to leave the lagna at 7 Cancer
   * and not close enough to leave the tropical ascendant where the references
   * print it: they give 0 Leo from Boon Hill, and Smithfield gives 29 Cancer.
   * Nothing this app shows moves, which is the point worth knowing about how
   * much precision a birthplace actually needs.
   *
   * Barack Obama's is the chart with none of those doubts in it. The hour is on
   * the long form the White House published in 2011, the hospital is named on
   * it, and Hawaii is the one state that has never kept daylight saving, so
   * there is no second reading of the clock to argue about. What is left is the
   * dasha: Jupiter from July 1996 to July 2012, which opens months before the
   * Illinois senate seat and closes between the two presidential terms.
   *
   * Pope Benedict XVI's answers the question Ava Gardner's raises. Joseph
   * Ratzinger was born in Marktl am Inn, about two and a half thousand people
   * and so under the gazetteer's floor as well, but this entry keeps the real
   * coordinates and the real name instead of standing at the nearest town. Typing a place the
   * combobox does not carry is a supported way to use this app, not a
   * workaround, and a chart kept for checking against published ones should be
   * cast from where the person was actually born. It costs nothing: the tropical
   * ascendant comes out at 19 Pisces 10, and the references print 19 Pisces 12.
   * His dasha is the one that needs no astrology to notice. Ketu, the graha of
   * letting go, runs from November 2005 to November 2012, and the pontificate
   * runs from April 2005 to February 2013.
   *
   * Richard Nixon's is the one that exercises the picture. The Sun, Mars,
   * Mercury and Jupiter all stand in Sagittarius, so one house has to hold four
   * grahas, which is the case the two-column stacking in charts.js exists for
   * and the case a chart with a graha or two to a house never reaches. The time
   * is AA from the birth certificate, and its dasha turns where the biography
   * does: Mercury, one of the four, opens in November 1970, and both the
   * break-in and the resignation fall inside it.
   *
   * Tony Blair's is Kareem Abdul-Jabbar's lesson from the other side, and the
   * sharper of the two. That birth falls in the gap before summer time started;
   * this one falls inside it, so the clock reads +01:00 and an hour taken off it
   * moves the lagna from 11 Taurus to 0 Gemini 02. Not a sign out, but two
   * arcminutes into the next sign, which is the state a chart is in when an hour
   * of doubt decides every house in it.
   */
  var STUDY_CHARTS = [{
    name: 'Donald Trump',
    placeLabel: 'Jamaica, New York, United States',
    latitude: 40.6915,
    longitude: -73.8057,
    zone: 'America/New_York',
    date: '1946-06-14',
    time: '10:54:00',
    standard: 'zone',
    ayanamsa: 'lahiri',
    trueNode: true,
    gender: 'male',
    celebrity: true,
    note: '10:54 am EDT at Jamaica Hospital, Queens, the time on the birth ' +
      'certificate he posted himself, which astrologers rate AA. Older references ' +
      'print 9:51 am from Lois Rodden, and sidereally that one rises at 24 Cancer ' +
      'rather than 6 Leo, so every house moves and the grahas do not. Leo ' +
      'ascendant in Magha, ' +
      'Moon debilitated in Scorpio with Ketu on a full moon, Sun with Rahu in Taurus, ' +
      'and Jupiter dasha from November 2016.'
  }, {
    name: 'Kareem Abdul-Jabbar',
    placeLabel: 'Harlem, New York, United States',
    latitude: 40.8079,
    longitude: -73.9454,
    zone: 'America/New_York',
    date: '1947-04-16',
    time: '18:30:00',
    standard: 'zone',
    ayanamsa: 'lahiri',
    trueNode: true,
    gender: 'male',
    celebrity: true
  }, {
    name: 'Ava Gardner',
    placeLabel: 'Smithfield, North Carolina, United States',
    latitude: 35.5085,
    longitude: -78.3394,
    zone: 'America/New_York',
    date: '1922-12-24',
    time: '19:10:00',
    standard: 'zone',
    ayanamsa: 'lahiri',
    trueNode: true,
    gender: 'female',
    celebrity: true
  }, {
    name: 'Barack Obama',
    placeLabel: 'Honolulu, Hawaii, United States',
    latitude: 21.3069,
    longitude: -157.8583,
    zone: 'Pacific/Honolulu',
    date: '1961-08-04',
    time: '19:24:00',
    standard: 'zone',
    ayanamsa: 'lahiri',
    trueNode: true,
    gender: 'male',
    celebrity: true
  }, {
    name: 'Pope Benedict XVI',
    placeLabel: 'Marktl am Inn, Bavaria, Germany',
    latitude: 48.2556,
    longitude: 12.8447,
    zone: 'Europe/Berlin',
    date: '1927-04-16',
    time: '04:15:00',
    standard: 'zone',
    ayanamsa: 'lahiri',
    trueNode: false,
    gender: 'male',
    celebrity: true
  }, {
    name: 'Richard Nixon',
    placeLabel: 'Yorba Linda, California, United States',
    latitude: 33.8886,
    longitude: -117.8131,
    zone: 'America/Los_Angeles',
    date: '1913-01-09',
    time: '21:35:00',
    standard: 'zone',
    ayanamsa: 'lahiri',
    trueNode: false,
    gender: 'male',
    celebrity: true
  }, {
    name: 'Tony Blair',
    placeLabel: 'Edinburgh, Scotland, United Kingdom',
    latitude: 55.9521,
    longitude: -3.1965,
    zone: 'Europe/London',
    date: '1953-05-06',
    time: '06:10:00',
    standard: 'zone',
    ayanamsa: 'lahiri',
    trueNode: false,
    gender: 'male',
    celebrity: true
  }];

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
      var minted = null;
      if (window.crypto && window.crypto.randomUUID) {
        minted = window.crypto.randomUUID();
      } else if (window.crypto && window.crypto.getRandomValues) {
        var bytes = new Uint8Array(24);
        window.crypto.getRandomValues(bytes);
        minted = Array.prototype.map.call(bytes, function (byte) {
          return byte.toString(16).padStart(2, '0');
        }).join('');
      }
      // A capability token is the key to every saved chart. If this browser
      // cannot mint one securely, saving is unavailable; do not invent a key
      // from the clock and Math.random().
      if (!minted) return null;
      window.localStorage.setItem(TOKEN_KEY, minted);
      return minted;
    } catch (e) {
      return null; // storage unavailable: the database cannot identify this browser
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
      trueNode: row.true_node,
      gender: row.gender || 'unstated',
      celebrity: row.celebrity === true,
      flagged: row.flagged === true,
      openedAt: row.opened_at || null,
      note: row.note || ''
    };
  }

  /** Send one request; resolves to null rather than throwing. */
  function sendKundaliApi(payload, done) {
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

  /*
   * Mutations return the whole authoritative list. Run them in click order so
   * an older response cannot overwrite a newer flag, edit or deletion. Listing
   * is read-only and remains immediate.
   */
  var kundaliMutations = [];
  var kundaliMutationRunning = false;
  var kundaliMutationGeneration = 0;

  function runKundaliMutation() {
    if (kundaliMutationRunning || !kundaliMutations.length) return;
    kundaliMutationRunning = true;
    var next = kundaliMutations.shift();
    sendKundaliApi(next.payload, function (entries) {
      try { next.done(entries); } finally {
        kundaliMutationRunning = false;
        runKundaliMutation();
      }
    });
  }

  function callKundaliApi(payload, done) {
    if (payload.action === 'list') return sendKundaliApi(payload, done);
    kundaliMutationGeneration += 1;
    kundaliMutations.push({ payload: payload, done: done });
    runKundaliMutation();
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

  /** The same saved chart, by id where there is one and by the four keys where not. */
  function sameRecord(a, b) {
    if (!a || !b) return false;
    return a.id && b.id ? a.id === b.id : keyOf(a) === keyOf(b);
  }

  /*
   * What the flag says, in one place. It is about the record and not the
   * reading: a time taken from memory, a place that is one of two of that name,
   * a date off a document nobody has checked. The chart still draws; the flag
   * is the note that it may be drawn from the wrong moment.
   */
  var FLAG_MARK = 'needs checking';
  var pendingFlagChanges = {};

  /*
   * Raise or lower it. Doubt arrives while reading a chart as often as while
   * looking down the list, so it is settable from either, and both write the
   * same field on the same row.
   */
  function setFlag(entry, on) {
    var pendingKey = entry.id || keyOf(entry);
    if (pendingFlagChanges[pendingKey]) return;
    pendingFlagChanges[pendingKey] = true;
    var list = readSaved();
    var at = -1;
    for (var i = 0; i < list.length; i++) if (sameRecord(list[i], entry)) at = i;
    var before = entry.flagged === true;
    entry.flagged = on;
    if (at >= 0) {
      list[at].flagged = on;
      writeSaved(list);
    }
    // The chart on screen is the same record, so its heading answers too.
    if (lastChart && sameRecord(currentEntry, entry)) {
      lastChart.flagged = on;
      showFlagOnChart();
    }
    renderSaved();
    if (at >= 0) {
      callKundaliApi({ action: 'save', entry: list[at], id: list[at].id }, function (entries) {
        delete pendingFlagChanges[pendingKey];
        if (entries) {
          writeSaved(entries.map(fromRow));
        } else {
          var current = readSaved();
          for (var j = 0; j < current.length; j++) {
            if (sameRecord(current[j], entry)) current[j].flagged = before;
          }
          entry.flagged = before;
          var chartShowsEntry = lastChart && sameRecord(currentEntry, entry);
          if (chartShowsEntry) lastChart.flagged = before;
          writeSaved(current);
          savedNote.textContent = 'The flag change could not be confirmed. Please try again.';
          savedNote.hidden = false;
          if (chartShowsEntry) showFlagOnChart();
        }
        renderSaved();
      });
    } else delete pendingFlagChanges[pendingKey];
  }

  /** Raise or lower the flag on whatever chart is on screen. */
  function flagThisChart(on) {
    if (!lastChart) return;
    lastChart.flagged = on;
    // The chart is saved the moment it is cast, so there is nearly always a row
    // to write to; if there is not, the next save carries the flag instead.
    if (currentEntry) setFlag(currentEntry, on); else showFlagOnChart();
  }

  /*
   * The heading's answer: the words rather than the icon, because here there is
   * room for them and no second chart to tell it apart from.
   *
   * The words are also the way to take it back. Anyone wanting the flag gone
   * reaches for the thing they can see saying it is there, not for an icon in
   * the line below, so the mark itself clears it.
   */
  function showFlagOnChart() {
    var button = document.getElementById('flag-button');
    var heading = document.getElementById('result-name');
    var on = !!(lastChart && lastChart.flagged);
    if (heading) {
      var was = heading.querySelector('.flag-mark');
      if (was) was.parentNode.removeChild(was);
      if (on) {
        var mark = el('button', 'flag-mark', FLAG_MARK);
        mark.type = 'button';
        mark.title = 'Clear the flag';
        mark.setAttribute('aria-label', 'Clear the flag on this chart');
        mark.addEventListener('click', function () { flagThisChart(false); });
        heading.appendChild(mark);
      }
    }
    if (button) {
      button.classList[on ? 'add' : 'remove']('is-flagged');
      button.setAttribute('aria-pressed', on ? 'true' : 'false');
      button.title = on ? 'Clear the flag' : 'Flag this chart as ' + FLAG_MARK;
      button.setAttribute('aria-label', button.title);
    }
  }

  /** A small inline-SVG icon button for a row in the saved list. */
  function iconButton(kind, label, onClick) {
    var paths = {
      edit: ['M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5V20Z', 'M14.5 6.5 17.5 9.5'],
      remove: ['M5 7h14', 'M10 7V5h4v2', 'M6.5 7l.8 12h9.4l.8-12', 'M10 10.5v5.5', 'M14 10.5v5.5'],
      // The pole first and the banner second, in that order: raised, the banner
      // fills, and the CSS reaches it as the second path rather than by a class
      // the inline copy on the chart would have to repeat.
      flag: ['M6 21V3.5', 'M6 4.5h11l-2.5 4 2.5 4H6z']
    }[kind];
    var button = el('button', 'saved-icon' + (kind === 'remove' ? ' saved-remove' :
      kind === 'flag' ? ' saved-flag' : ''));
    button.type = 'button';
    button.title = label;
    button.setAttribute('aria-label', label);
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    paths.forEach(function (d) {
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    });
    button.appendChild(svg);
    button.addEventListener('click', onClick);
    return button;
  }

  /*
   * Enough rows that finding one is work. Below this the box would be a control
   * that never helps, taking space from the list it filters.
   */
  var SEARCH_FROM = 6;

  /*
   * Last read first, then everything never read since the column existed, which
   * keeps the order the database gave those - last written first. Sorted here
   * as well as in the query so an offline list and a synced one agree.
   */
  function byLastOpened(a, b) {
    var x = a.openedAt || '', y = b.openedAt || '';
    if (x === y) return 0;
    if (!x) return 1;
    if (!y) return -1;
    return x < y ? 1 : -1;
  }

  /*
   * One card. Built here rather than inline because there are two lists to put
   * them in now, and a card that differed between the two would be a second
   * place for every later change to go wrong.
   */
  function savedCard(entry) {
    var li = el('li', 'saved-card');

    /*
     * A card rather than a row across the page.
     *
     * A saved chart is three short facts - who, when, where - and a row gave
     * them a full screen width to sit in, so a list of ten was ten lines of
     * mostly empty space with the eye travelling to the far edge for the
     * edit and the delete. Stacked in a card the three read down in the order
     * anyone asks them, and the cards sit several to a row.
     *
     * The name remains a real button for the keyboard; a pointer can use the
     * whole card, which is the area the hover treatment presents as active.
     */
    var open = el('button', 'saved-open');
    open.type = 'button';
    open.appendChild(el('span', 'saved-name', entry.name));
    li.appendChild(open);
    li.appendChild(el('p', 'saved-born', formatSavedMoment(entry)));
    li.appendChild(el('p', 'saved-place', entry.placeLabel));

    var actions = el('div', 'saved-actions');
    var raised = entry.flagged === true;
    var flag = iconButton('flag',
      (raised ? 'Clear the flag on ' : 'Flag ') + entry.name +
        (raised ? '' : ' as ' + FLAG_MARK),
      function () { setFlag(entry, !raised); });
    flag.disabled = !!pendingFlagChanges[entry.id || keyOf(entry)];
    if (raised) flag.className += ' is-flagged';
    flag.setAttribute('aria-pressed', raised ? 'true' : 'false');
    actions.appendChild(flag);

    actions.appendChild(iconButton('edit', 'Edit ' + entry.name, function () {
      editSaved(entry);
    }));

    /*
     * Deleting asks first, in the row rather than through a browser dialog:
     * the list is the only record of these charts, the button sits a few
     * pixels from the one that opens them, and there is no undo.
     */
    actions.appendChild(iconButton('remove', 'Delete ' + entry.name, function () {
      actions.innerHTML = '';
      actions.className = 'saved-actions confirming';
      actions.appendChild(el('span', 'saved-confirm-label', 'Delete?'));

      var yes = el('button', 'saved-confirm', 'Delete');
      yes.type = 'button';
      yes.setAttribute('aria-label', 'Confirm deleting ' + entry.name);
      yes.addEventListener('click', function () { removeSaved(entry); });
      actions.appendChild(yes);

      var no = el('button', 'saved-cancel', 'Cancel');
      no.type = 'button';
      no.setAttribute('aria-label', 'Keep ' + entry.name);
      no.addEventListener('click', renderSaved);
      actions.appendChild(no);
      yes.focus();
    }));

    li.appendChild(actions);
    li.addEventListener('click', function (event) {
      // The three action buttons have their own jobs. Everything else on the
      // card identifies this Kundali and opens it, including date and place.
      if (!event.target.closest || event.target.closest('.saved-actions')) return;
      loadSaved(entry);
    });
    return li;
  }

  function renderSaved() {
    var all = readSaved().slice().sort(byLastOpened);
    savedEmpty.hidden = all.length > 0;
    savedCount.textContent = all.length;
    savedCount.hidden = all.length === 0;

    var box = document.getElementById('saved-search');
    var field = document.getElementById('saved-filter');
    if (box) box.hidden = all.length < SEARCH_FROM;
    var term = (box && !box.hidden && field ? field.value : '').trim().toLowerCase();

    /*
     * By name. It is what the row shows and what anyone is looking for; a match
     * on a hidden field would highlight a row with nothing in it to explain why.
     */
    var list = !term ? all : all.filter(function (entry) {
      return (entry.name || '').toLowerCase().indexOf(term) >= 0;
    });

    /*
     * Your own charts and the ones kept for study, apart. The counts on the
     * tabs are of what the search actually found, so a search that empties one
     * side says so on the tab rather than only inside it.
     */
    var groups = [
      { list: savedList, none: 'mine-none', count: 'mine-count', other: 'Public figures',
        empty: 'None of your own yet. Add a kundali and it will appear here.',
        of: list.filter(function (entry) { return !entry.celebrity; }) },
      { list: document.getElementById('figures-list'), none: 'figures-none',
        count: 'figures-count', other: 'Your kundalis',
        empty: 'No public figures saved yet.',
        of: list.filter(function (entry) { return entry.celebrity === true; }) }
    ];

    groups.forEach(function (group) {
      if (!group.list) return;
      group.list.innerHTML = '';
      group.of.forEach(function (entry) { group.list.appendChild(savedCard(entry)); });

      var count = document.getElementById(group.count);
      if (count) {
        count.textContent = group.of.length;
        count.hidden = all.length === 0;
      }

      /*
       * Nothing here, and why. A search that matched on the other tab is the
       * case worth naming: the reader is looking at an empty list while what
       * they asked for sits one tab away, and nothing on screen would say so.
       */
      var none = document.getElementById(group.none);
      if (!none) return;
      var elsewhere = list.length - group.of.length;
      none.hidden = group.of.length > 0;
      none.textContent = term
        ? 'Nothing here matches \u201c' + term + '\u201d.' +
          (elsewhere ? ' ' + elsewhere + (elsewhere === 1 ? ' match is' : ' matches are') +
            ' under ' + group.other + '.' : '')
        : group.empty;
    });

    var key = document.getElementById('saved-key');
    if (key) {
      key.innerHTML = '';
      if (list.some(function (entry) { return entry.flagged; })) {
        key.appendChild(el('span', 'saved-key-item',
          'A raised flag is a chart whose details want checking.'));
      }
      key.hidden = !key.firstChild;
    }
  }

  (function () {
    var field = document.getElementById('saved-filter');
    if (field) field.addEventListener('input', renderSaved);
  })();

  /*
   * By the record, not by its position. The list is drawn sorted and filtered,
   * so a row's place on screen has not been its place in storage since either
   * of those existed, and counting to it deletes somebody else.
   */
  function removeSaved(entry) {
    var current = readSaved();
    var at = -1;
    for (var i = 0; i < current.length; i++) if (sameRecord(current[i], entry)) at = i;
    if (at < 0) { renderSaved(); return; }
    var removed = current.splice(at, 1)[0];
    var wasCurrent = currentEntry && removed && sameRecord(currentEntry, removed);
    writeSaved(current);
    // If the chart on screen was the one deleted, the next save is a new row.
    if (currentEntry && removed &&
        (removed.id ? removed.id === currentEntry.id : keyOf(removed) === keyOf(currentEntry))) {
      currentEntry = null;
    }
    renderSaved();
    if (removed && removed.id) {
      callKundaliApi({ action: 'delete', id: removed.id }, function (entries) {
        if (entries) {
          writeSaved(entries.map(fromRow));
        } else {
          var restored = readSaved();
          if (!restored.some(function (item) { return sameRecord(item, removed); })) {
            restored.splice(Math.min(at, restored.length), 0, removed);
          }
          writeSaved(restored);
          if (wasCurrent) currentEntry = removed;
          savedNote.textContent = 'The deletion could not be confirmed. Please try again.';
          savedNote.hidden = false;
        }
        renderSaved();
      });
    }
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
      placeLabel: placeLabelOf(state.place),
      date: state.y + '-' + String(state.mo).padStart(2, '0') + '-' + String(state.d).padStart(2, '0'),
      time: String(state.h).padStart(2, '0') + ':' + String(state.mi).padStart(2, '0') +
        ':' + String(state.time.second).padStart(2, '0'),
      latitude: state.place.lat,
      longitude: state.place.lon,
      zone: state.place.zone,
      standard: state.standard,
      ayanamsa: state.ayanamsa,
      trueNode: state.trueNode,
      gender: state.gender,
      celebrity: state.celebrity,
      flagged: state.flagged === true,
      /*
       * Generating a chart is reading it, so the one just saved goes to the
       * top of the list like the one just opened. Written here as well as
       * asked of the server, so the order is right on the next draw rather
       * than a round trip later.
       */
      openedAt: new Date().toISOString(),
      note: state.note
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
    /*
     * The flag is the record's and not the reading's. It is raised from the
     * list or from the chart's heading and never from the form, so casting the
     * same nativity again must not quietly drop a question somebody put against
     * it - which is what would happen if this took the form's word for it.
     */
    if (at >= 0) entry.flagged = list[at].flagged === true;
    /*
     * A shared URL made before the public-figure field was carried arrives as
     * a fresh chart, with no currentEntry. If it is the same saved record, keep
     * that record's classification instead of replacing true with the form's
     * unchecked default. A deliberate edit still takes the checkbox's value.
     */
    if (at >= 0 && !currentEntry) entry.celebrity = list[at].celebrity === true;
    state.flagged = entry.flagged;
    state.celebrity = entry.celebrity;

    var previous = at >= 0 ? list[at] : null;
    if (at >= 0) list[at] = entry; else list.unshift(entry);

    var storedLocally = writeSaved(list);
    renderSaved();
    saveFeedback.textContent = storedLocally
      ? 'Saving to your kundalis…'
      : 'This browser would not let the chart be saved.';

    // The local copy is written first so the panel updates immediately and keeps
    // working offline; the database is the shared copy, not the fast one.
    callKundaliApi({ action: 'save', entry: entry, id: entry.id, touch: true }, function (entries) {
      if (entries) {
        writeSaved(entries.map(fromRow));
        renderSaved();
        saveFeedback.textContent = at >= 0
          ? 'Updated in your saved kundalis'
          : 'Saved to your kundalis';
        savedNote.textContent = 'Saved to your kundalis and synced.';
        savedNote.hidden = false;
        // Remember which row this chart is now, so a later edit updates it.
        currentEntry = entries.map(fromRow).filter(function (e) {
          return keyOf(e) === keyOf(entry);
        })[0] || currentEntry;
      } else {
        /*
         * The database is authoritative. The local write above is only an
         * optimistic cache update, so a failed request must roll it back rather
         * than promise that a row with no database id has been saved.
         */
        var current = readSaved();
        var changedAt = -1;
        for (var j = 0; j < current.length; j++) {
          if (sameRecord(current[j], entry)) changedAt = j;
        }
        if (changedAt >= 0) {
          if (previous) current[changedAt] = previous;
          else current.splice(changedAt, 1);
        }
        writeSaved(current);
        renderSaved();
        saveFeedback.textContent = 'Save not confirmed.';
        savedNote.textContent = previous
          ? 'The changes could not be confirmed. Check your connection and try again.'
          : 'The save could not be confirmed. Check your connection before trying again.';
        savedNote.hidden = false;
        currentEntry = previous;
      }
    });
    if (!quiet) setTimeout(function () { saveFeedback.textContent = ''; }, 4000);
  }

  /*
   * Remember that this chart was read, so the list can put it back on top.
   *
   * Written locally first and then sent, like every other change here, so the
   * order is right the moment the list is next drawn rather than a round trip
   * later. It is deliberately not a save: reading a chart is not editing it,
   * and a save would bump updated_at and lose the difference between the two.
   */
  function recordOpening(entry) {
    var when = new Date().toISOString();
    var list = readSaved();
    for (var i = 0; i < list.length; i++) {
      if (sameRecord(list[i], entry)) list[i].openedAt = when;
    }
    entry.openedAt = when;
    writeSaved(list);
    if (entry.id) {
      callKundaliApi({ action: 'open', id: entry.id }, function (entries) {
        if (entries) { writeSaved(entries.map(fromRow)); renderSaved(); }
      });
    }
  }

  /** Put a saved chart's details into the form, without casting it. */
  function applyEntryToForm(entry) {
    currentEntry = entry;
    document.getElementById('name').value = entry.name;
    writeDate(entry.date);
    var t = entry.time.split(':').map(Number);
    writeTime(t[0], t[1] || 0, t[2] || 0);
    document.getElementById('ayanamsa').value = entry.ayanamsa || 'lahiri';
    document.getElementById('node-type').value = entry.trueNode ? 'true' : 'mean';
    document.getElementById('time-standard').value = entry.standard === 'lmt' ? 'lmt' : 'zone';
    document.getElementById('gender').value =
      (!entry.gender || entry.gender === 'unstated') ? '' : entry.gender;
    document.getElementById('celebrity').checked = entry.celebrity === true;
    document.getElementById('person-note').value = entry.note || '';
    pendingFlagged = entry.flagged === true;

    selectedCity = {
      name: entry.placeLabel.split(',')[0],
      region: '', nation: '',
      label: entry.placeLabel,          // keep the whole thing, not just the town
      lat: entry.latitude, lon: entry.longitude, zone: entry.zone
    };
    placeInput.value = entry.placeLabel;
    placeNote.textContent = entry.latitude.toFixed(4) + ', ' + entry.longitude.toFixed(4) + '  ·  ' + entry.zone;
    zoneChosenByHand = false;
    zoneResolvedFor = '';
    zoneRequest += 1;
    writeCoords(entry.latitude, entry.longitude, entry.zone);
    manualFields.hidden = true;
  }

  /** Open a saved chart: fill the form and cast it. */
  function loadSaved(entry) {
    applyEntryToForm(entry);
    reopeningSaved = true;
    recordOpening(entry);
    // showChart() opens the tab once there is a chart to show. Opening it here
    // meant a refused submit left the reader on an empty panel.
    form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit'));
  }

  /** Edit a saved chart: fill the form and stop there, so it can be corrected. */
  function editSaved(entry) {
    applyEntryToForm(entry);
    activateTab('add');
    document.getElementById('name').focus();
  }

  /*
   * The confirmation line belongs to the panel the setting sits in. There are
   * two of them since the settings were split across two tabs, and a message
   * written into the tab you are not looking at is a message nobody sees.
   */
  function statusFor(select) {
    var node = select;
    while (node && String(node.className || '').indexOf('settings-panel') < 0) {
      node = node.parentNode;
    }
    return (node || document).querySelector('.settings-status');
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

    function activate(name, moveFocus, byUser) {
      active = name;
      names.forEach(function (other) {
        var selected = other === name;
        buttons[other].setAttribute('aria-selected', String(selected));
        buttons[other].tabIndex = selected ? 0 : -1;
        panels[other].hidden = !selected;
      });
      if (moveFocus) buttons[name].focus();
      if (options && options.scrollToTop) window.scrollTo({ top: 0, behavior: 'smooth' });
      if (options && options.onChange) options.onChange(name, byUser === true);
    }

    names.forEach(function (name) {
      buttons[name].addEventListener('click', function () { activate(name, false, true); });
    });

    strip.addEventListener('keydown', function (e) {
      var step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (step) {
        e.preventDefault();
        activate(names[(names.indexOf(active) + step + names.length) % names.length], true, true);
      } else if (e.key === 'Home') {
        e.preventDefault(); activate(names[0], true);
      } else if (e.key === 'End') {
        e.preventDefault(); activate(names[names.length - 1], true);
      }
    });

    return { activate: activate, current: function () { return active; } };
  }

  /*
   * The word for the celebrity flag, in one place. The list said "study" and the
   * chart heading said "public figure", both being halves of the form's own
   * label, and each read as a different thing about the same tick.
   */
  var CELEBRITY_MARK = 'public figure';

  var emptyChart = document.getElementById('empty-chart');
  var savedCount = document.getElementById('saved-count');

  var sections = setupTabs(['add', 'saved', 'chart', 'lesson', 'settings', 'testing'],
    document.querySelector('.tabs:not(.subtabs)'), { scrollToTop: true, onChange: function (name, byUser) {
      if (name === 'lesson') loadLessons();
      /*
       * Reaching for the form from the tab strip means a new chart, which is
       * the job the "+ Add a kundali" button under the saved list used to do.
       * Without it, currentEntry would still point at the last chart saved and
       * the next one generated would overwrite that row instead of making its
       * own - a silent edit of somebody else's record.
       *
       * Only when a person asked. editSaved and the chart's own edit button
       * arrive here in code, and both mean to keep the row they came from.
       */
      if (name === 'add' && byUser) startFreshChart();
    } });

  /*
   * A setting changes how the open chart is reckoned, so changing one recomputes
   * it rather than waiting for the next chart to be generated. It goes back
   * through computeChart - the service may answer differently - and everything
   * downstream redraws from the result.
   *
   * Nothing happens where no chart is open: there is nothing to recompute, and
   * the choice is picked up when one is.
   */
  document.getElementById('node-type').addEventListener('change', function () {
    var status = statusFor(this);
    if (!lastChart) {
      status.textContent = 'Saved. The next chart will use it.';
      return;
    }
    var wanted = this.value === 'true';
    status.textContent = 'Recomputing\u2026';
    computeChart({
      jdUT: lastChart.chart.julianDay,
      latitude: lastChart.place.lat, longitude: lastChart.place.lon,
      tzOffsetMinutes: lastChart.offset,
      ayanamsa: lastChart.ayanamsa, trueNode: wanted
    }, function (chart, source) {
      lastChart.chart = chart;
      lastChart.trueNode = wanted;
      lastChart.source = source;
      render(lastChart);
      writeHash(lastChart);
      status.textContent = lastChart.name
        ? 'Recomputed ' + lastChart.name + '\u2019s chart with the ' +
          (wanted ? 'true' : 'mean') + ' node.'
        : 'Recomputed with the ' + (wanted ? 'true' : 'mean') + ' node.';
    });
  });

  [['paksha-doubled', 'The Moon\u2019s paksha bala'],
   ['ayana-doubled', 'The Sun\u2019s ayana bala']].forEach(function (pair) {
    document.getElementById(pair[0]).addEventListener('change', function () {
      var status = statusFor(this);
      var halved = this.value === 'undoubled';
      if (!lastChart) {
        status.textContent = 'Saved. The next chart will use it.';
        return;
      }
      // Display only, so there is nothing to recompute - not even the strengths.
      render(lastChart);
      status.textContent = halved
        ? pair[1] + ' is shown halved. The totals still count it doubled.'
        : pair[1] + ' is shown as the texts compute it, doubled.';
    });
  });

  /*
   * Three readings of cheshta bala, all of which change the figures rather
   * than the display, so the cached strengths are dropped and the page redrawn.
   */
  [['kendra-method', { seeghra: 'Cheshta bala now reads the seeghra kendra itself.',
                       averaged: 'Cheshta bala now reads the averaged shortcut.' }],
   ['mean-source', { classical: 'Cheshta kendras now read the classical mean longitudes.',
                     modern: 'Cheshta kendras now read the modern mean longitudes.' }],
   ['luminary-rule', { kendra: 'The Sun and Moon now take their own cheshta kendras.',
                       borrowed: 'The Sun and Moon now borrow their ayana and paksha bala.' }],
   ['luminary-cheshta', { counted: 'The Sun\u2019s and Moon\u2019s cheshta bala now counts in the total.',
                          omitted: 'The Sun\u2019s and Moon\u2019s cheshta bala is shown but not counted.' }],
   ['ishta-kashta', { sripati: 'Ishta and kashta are the square roots Sripatipaddhati asks for.',
                      parashara: 'Ishta and kashta now halve a fixed sixty between them, as Parashara has it.' }],
   ['tatkalika', { varga: 'Tatkalika is now counted in the division being read.',
                   rashi: 'Tatkalika is now counted in the rashi and carried into every division.' }],
   ['hora-dignity', { effects: 'The hora now reads by the grahas it favours, as chapter 7 has it.',
                      lord: 'The hora now reads by the lord of its sign, as the other divisions do.' }],
   ['hora-mercury', { solar: 'Mercury is full in the Sun\u2019s hora and read by strength in the Moon\u2019s.',
                      ordinary: 'Mercury now loses a rung in the weaker hora, as the other six do.',
                      both: 'Mercury is now full in either hora.' }]
  ].forEach(function (pair) {
    document.getElementById(pair[0]).addEventListener('change', function () {
      var status = statusFor(this);
      var said = pair[1][this.value];
      if (!lastChart) {
        status.textContent = 'Saved. The next chart will use it.';
        return;
      }
      lastChart.shadbala = null;
      render(lastChart);
      status.textContent = said;
    });
  });

  document.getElementById('cheshta-method').addEventListener('change', function () {
    var status = statusFor(this);
    var motion = this.value === 'motion';
    if (!lastChart) {
      status.textContent = 'Saved. The next chart will use it.';
      return;
    }
    lastChart.shadbala = null;
    render(lastChart);
    status.textContent = motion
      ? 'Cheshta bala now reads the eight motions. Four of their boundaries are this site\u2019s, not a text\u2019s.'
      : 'Cheshta bala now reads the chesta kendra, which is the verse that states a computation.';
  });

  document.getElementById('budha-floor').addEventListener('change', function () {
    var status = statusFor(this);
    var open = this.value === 'none';
    if (!lastChart) {
      status.textContent = 'Saved. The next chart will use it.';
      return;
    }
    render(lastChart);
    status.textContent = open
      ? 'Budha-Aditya now forms on any conjunction in one sign, as K. N. Rao reads it - about 52 per cent of charts.'
      : 'Budha-Aditya now needs Mercury more than 10\u00b0 from the Sun, as Raman states it - about 28 per cent of charts.';
  });

  /*
   * Where a division's combustion is measured. The charts are redrawn and
   * nothing is recomputed: the mark is a fact about a pair of longitudes, and
   * both frames are already in hand.
   */
  document.getElementById('combustion').addEventListener('change', function () {
    var status = statusFor(this);
    var inside = this.value === 'division';
    if (!lastChart) {
      status.textContent = 'Saved. The next chart will use it.';
      return;
    }
    render(lastChart);
    status.textContent = inside
      ? 'Combustion is now measured inside whichever division is on screen.'
      : 'Combustion is measured in the rashi and carried into every division.';
  });

  /*
   * The ladder changes the figures rather than the display, so the cached
   * strengths go and the page is redrawn.
   */
  document.getElementById('saptavargaja-ladder').addEventListener('change', function () {
    var status = statusFor(this);
    var tens = this.value === 'parashara';
    if (!lastChart) {
      status.textContent = 'Saved. The next chart will use it.';
      return;
    }
    lastChart.shadbala = null;
    render(lastChart);
    status.textContent = tens
      ? 'Saptavargaja is scored on 45, 30, 20, 15, 10, 4 and 2, which Santhanam and Saravali give.'
      : 'Saptavargaja now halves below an own sign, which is Raman\u2019s ladder.';
  });

  document.getElementById('mercury-nature').addEventListener('change', function () {
    var status = statusFor(this);
    var always = this.value === 'benefic';
    if (!lastChart) {
      status.textContent = 'Saved. The next chart will use it.';
      return;
    }
    lastChart.shadbala = null;
    render(lastChart);
    status.textContent = always
      ? 'Mercury is now read a benefic whatever company he keeps.'
      : 'Mercury is now read a malefic when combust or joined to one.';
  });

  document.getElementById('ayana-constant').addEventListener('change', function () {
    var status = statusFor(this);
    var raman = this.value === 'raman';
    if (!lastChart) {
      status.textContent = 'Saved. The next chart will use it.';
      return;
    }
    lastChart.shadbala = null;
    render(lastChart);
    status.textContent = raman
      ? 'Ayana bala now scales against Raman\u2019s 24 and 48.'
      : 'Ayana bala now scales against Parashara\u2019s 23\u00b027\u2032 and 46.9.';
  });

  document.getElementById('kranti').addEventListener('change', function () {
    var status = statusFor(this);
    var real = this.value === 'true';
    if (!lastChart) {
      status.textContent = 'Saved. The next chart will use it.';
      return;
    }
    lastChart.shadbala = null;
    render(lastChart);
    status.textContent = real
      ? 'Ayana bala now scales the true declination, ecliptic latitude included.'
      : 'Ayana bala now takes the kranti from the sayana longitude, as Raman does.';
  });

  document.getElementById('hora-length').addEventListener('change', function () {
    var status = statusFor(this);
    var seasonal = this.value === 'seasonal';
    if (!lastChart) {
      status.textContent = 'Saved. The next chart will use it.';
      return;
    }
    lastChart.shadbala = null;
    render(lastChart);
    status.textContent = seasonal
      ? 'Horas now split the daylight into twelve and the night into twelve.'
      : 'Horas are now the twenty-four equal parts the texts describe.';
  });

  /*
   * Same shape as the Moon's paksha reading: no position moves, so the cached
   * strengths are dropped and the page redrawn.
   */
  document.getElementById('nat-clock').addEventListener('change', function () {
    var status = statusFor(this);
    var names = { apparent: 'the sundial at the birthplace', zone: 'zone time' };
    var chosen = names[this.value] || this.value;
    if (!lastChart) {
      status.textContent = 'Saved. The next chart will use it.';
      return;
    }
    lastChart.shadbala = null;
    render(lastChart);
    status.textContent = 'Nata-unnata bala now reckoned by ' + chosen + '.';
  });

  /*
   * Unlike the ayanamsa and the node, this changes no position - it decides
   * which of two readings of one verse the strength table follows. So there is
   * nothing to recompute in the ephemeris: drop the cached Shadbala and redraw.
   */
  document.getElementById('moon-paksha').addEventListener('change', function () {
    var status = statusFor(this);
    var asBenefic = this.value === 'benefic';
    if (!lastChart) {
      status.textContent = 'Saved. The next chart will use it.';
      return;
    }
    lastChart.shadbala = null;
    render(lastChart);
    status.textContent = 'The Moon\u2019s paksha bala now follows ' +
      (asBenefic ? 'Phaladeepika and Charak, reading her always as a benefic.'
                 : 'Parashara and Raman, by her fortnight group.');
  });

  /*
   * The ayanamsa moved out of the per-chart calculation options and into
   * settings, where it belongs: it is not a property of a nativity but a choice
   * about how to read every nativity, and having it sit beside the birth time
   * suggested otherwise.
   *
   * It behaves exactly as the node control above. The open chart is recast at
   * once, because a chart on screen drawn from a different zero point than the
   * one the select shows is simply wrong, and an ayanamsa is worth more than a
   * degree - far too much to leave on screen until something else redraws.
   */
  document.getElementById('ayanamsa').addEventListener('change', function () {
    var status = statusFor(this);
    var wanted = this.value;
    var label = (Astro.AYANAMSA[wanted] || {}).label || wanted;
    if (!lastChart) {
      status.textContent = 'Saved. The next chart will use ' + label + '.';
      return;
    }
    status.textContent = 'Recomputing\u2026';
    computeChart({
      jdUT: lastChart.chart.julianDay,
      latitude: lastChart.place.lat, longitude: lastChart.place.lon,
      tzOffsetMinutes: lastChart.offset,
      ayanamsa: wanted, trueNode: lastChart.trueNode
    }, function (chart, source) {
      lastChart.chart = chart;
      lastChart.ayanamsa = wanted;
      lastChart.source = source;
      render(lastChart);
      writeHash(lastChart);
      status.textContent = lastChart.name
        ? 'Recomputed ' + lastChart.name + '\u2019s chart against ' + label + '.'
        : 'Recomputed against ' + label + '.';
    });
  });

  /*
   * The two graha tables share one strip, labelled from whichever divisions the
   * charts are set to. Fixed D1/D9 labels would have lied the moment either
   * select moved.
   */
  /*
   * Named rather than taken as the first .tabs.subtabs on the page. The graha
   * panel has a strip of its own now, and document order is a poor thing to
   * rest on when the two are a few lines apart.
   */
  /*
   * Your own charts and the ones kept for study. They are read for different
   * reasons, and with 26 public figures against 3 of your own the few that are
   * yours were lost in the crowd. Yours open first.
   */
  setupTabs(['mine', 'figures'],
    document.querySelector('#panel-saved .subtabs'), {});

  var tableTabs = setupTabs(['grahas', 'shadbala', 'vargas', 'yogas', 'aspects'],
    document.querySelector('.tabs.subtabs:not(.graha-charts)'));
  wireGrahaChartKeys();
  wireSettingHelp();

  function activateTab(name, moveFocus) { sections.activate(name, moveFocus); }

  /*
   * Empty the form and forget the row it came from, so the next chart generated
   * is a new one rather than an edit of the last. Both ways of asking for a
   * clean form go through here: the Reset button beside Generate, and reaching
   * for the Add tab yourself.
   */
  function startFreshChart() {
    blankForm();
    currentEntry = null;
    document.getElementById('name').focus();
  }

  /** Empty the form so the next chart starts from nothing. */
  function blankForm() {
    document.getElementById('name').value = '';
    writeDate('');
    hourInput.value = ''; minuteInput.value = ''; secondInput.value = '';
    meridiemSelect.value = 'am';
    placeInput.value = '';
    placeNote.textContent = '';
    document.getElementById('gender').value = '';
    document.getElementById('celebrity').checked = false;
    document.getElementById('person-note').value = '';
    pendingFlagged = false;
    selectedCity = null;
    ['lat', 'lon'].forEach(function (which) {
      ['d', 'm', 's'].forEach(function (part) {
        document.getElementById('manual-' + which + '-' + part).value = '';
      });
      document.getElementById('manual-' + which + '-h').value = which === 'lat' ? 'N' : 'E';
      document.getElementById(which + '-decimal').textContent = '';
    });
    zoneChosenByHand = false;
    zoneResolvedFor = '';
    zoneRequest += 1;
    document.getElementById('zone-note').textContent = '';
    manualFields.hidden = true;
    manualToggle.setAttribute('aria-expanded', 'false');
    errorBox.textContent = '';
  }

  /** Put a chart's details back into the form, so they can be corrected. */
  function fillForm(state) {
    document.getElementById('name').value = state.name;
    writeDate(state.y + '-' + String(state.mo).padStart(2, '0') + '-' +
      String(state.d).padStart(2, '0'));
    writeTime(state.h, state.mi, state.time.second);
    document.getElementById('time-standard').value = state.standard === 'lmt' ? 'lmt' : 'zone';
    document.getElementById('ayanamsa').value = state.ayanamsa;
    document.getElementById('node-type').value = state.trueNode ? 'true' : 'mean';
    document.getElementById('gender').value =
      (!state.gender || state.gender === 'unstated') ? '' : state.gender;
    document.getElementById('celebrity').checked = state.celebrity === true;
    document.getElementById('person-note').value = state.note || '';
    pendingFlagged = state.flagged === true;
    selectedCity = state.place;
    placeInput.value = placeLabelOf(state.place);
    placeNote.textContent = state.place.lat.toFixed(4) + ', ' + state.place.lon.toFixed(4) +
      '  \u00b7  ' + state.place.zone;
    zoneChosenByHand = false;
    zoneResolvedFor = '';
    zoneRequest += 1;
    writeCoords(state.place.lat, state.place.lon, state.place.zone);
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

  editButton.addEventListener('click', function () { showForm(false); });

  /*
   * Emptying the form by hand, for a chart begun and thought better of. It is
   * safe to press at any time: a saved chart being edited is not touched, the
   * edit is simply abandoned, and clearing currentEntry is what stops the next
   * chart generated from being written over that row.
   */
  document.getElementById('reset-form').addEventListener('click', startFreshChart);

  /* ------------------------------------------- shareable URL for a chart */

  function writeHash(state) {
    var p = state.place;
    var parts = [
      'd=' + state.y + '-' + String(state.mo).padStart(2, '0') + '-' + String(state.d).padStart(2, '0'),
      't=' + String(state.h).padStart(2, '0') + ':' + String(state.mi).padStart(2, '0') +
        (state.time.second ? ':' + String(state.time.second).padStart(2, '0') : ''),
      'lat=' + p.lat.toFixed(4), 'lon=' + p.lon.toFixed(4), 'tz=' + encodeURIComponent(p.zone),
      'place=' + encodeURIComponent(placeLabelOf(p)),
      'ay=' + encodeURIComponent(state.ayanamsa),
      'node=' + (state.trueNode ? 'true' : 'mean'),
      'g=' + encodeURIComponent(state.gender || 'unstated'),
      'public=' + (state.celebrity ? 'true' : 'false')
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
    writeDate(q.d);
    var t = q.t.split(':');
    writeTime(+t[0], +(t[1] || 0), +(t[2] || 0));
    document.getElementById('name').value = q.n || '';
    document.getElementById('time-standard').value = q.std === 'lmt' ? 'lmt' : 'zone';
    if (q.ay && Array.prototype.some.call(document.getElementById('ayanamsa').options,
      function (option) { return option.value === q.ay; })) {
      document.getElementById('ayanamsa').value = q.ay;
    }
    document.getElementById('node-type').value = q.node === 'mean' ? 'mean' : 'true';
    document.getElementById('gender').value =
      q.g === 'female' || q.g === 'male' || q.g === 'other' ? q.g : '';
    document.getElementById('celebrity').checked = q.public === 'true';
    selectedCity = {
      name: (q.place || 'Saved location').split(',')[0],
      region: '', nation: '',
      label: q.place || 'Saved location',
      lat: +q.lat, lon: +q.lon, zone: q.tz
    };
    placeInput.value = q.place || (q.lat + ', ' + q.lon);
    placeNote.textContent = (+q.lat).toFixed(4) + ', ' + (+q.lon).toFixed(4) + '  ·  ' + q.tz;
    if (!q.n) {
      document.getElementById('name').focus();
      return;
    }
    /*
     * Links made before gender was carried cannot reproduce every reading: in
     * particular Mahabhagya turns on it. Keep all the details the link does
     * know, but ask for the missing fact instead of silently casting a chart
     * whose findings can be incomplete.
     */
    if (!document.getElementById('gender').value) {
      fail('Choose a gender to restore this older link.');
      document.getElementById('gender').focus();
      return;
    }
    form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit'));
  }

  /* ------------------------------------------------------------------ init */

  populateSelects();
  populateSlotSelects();
  renderSaved();
  /*
   * The database is the saved list. localStorage is only its fast/offline
   * cache: once the server answers, discard anything that has no row there
   * instead of reviving an old browser-only chart by uploading it.
   */
  (function syncSavedCharts() {
    var beforeMutations = kundaliMutationGeneration;
    callKundaliApi({ action: 'list' }, function (entries) {
      if (!entries) return; // no answer: leave the last known cache visible
      // A save/delete/flag begun while this list was in flight owns the cache;
      // its ordered response will carry a newer authoritative list.
      if (beforeMutations !== kundaliMutationGeneration) return;
      writeSaved(entries.map(fromRow));
      renderSaved();
    });
  })();
  if (!Geo.historicalZonesSupported()) {
    placeNote.textContent = 'This browser lacks historical timezone data, so births before ' +
      '1970 may use a modern offset. Chrome, Safari and Firefox all handle it.';
  }
  readHash();
})();
