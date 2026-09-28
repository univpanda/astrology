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
      selectedCity = null;
      document.getElementById('manual-lat-d').focus();
      // Swap the placeholder list for every zone real places actually use.
      Geo.ensure(function (err) { if (!err) fillZones(Geo.zones()); });
    }
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
  document.getElementById('manual-zone').addEventListener('change', function () {
    zoneChosenByHand = true;
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
    if (lat.error || lon.error) { note.textContent = ''; return; }
    Geo.ensure(function (err) {
      if (err || zoneChosenByHand) return;
      var city = Geo.nearest(lat.value, lon.value);
      if (!city) return;
      fillZones(Geo.zones());
      document.getElementById('manual-zone').value = city.zone;
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

    var nameValue = document.getElementById('name').value.trim();
    var genderValue = document.getElementById('gender').value;
    var dateValue = document.getElementById('date').value;
    var time = readTime();
    var resolved = resolvePlace();
    var place = resolved.place;

    if (!nameValue) return fail('Enter the name this chart belongs to.');
    if (!genderValue) return fail('Choose a gender.');
    if (!dateValue) return fail('Enter a date of birth.');
    if (time.error) return fail(time.error);
    if (!place) return fail(resolved.error);

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
        gender: genderValue,
        celebrity: document.getElementById('celebrity').checked,
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

    // Just the name. The page is a chart; saying so in the heading of one adds
    // nothing, and a long name plus a possessive wraps on a phone.
    var heading = document.getElementById('result-name');
    heading.textContent = state.name;
    if (state.celebrity) heading.appendChild(el('span', 'celebrity-mark', CELEBRITY_MARK));

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
       * Changing the division redraws the yogas and the aspects too, both being
       * read from whatever is on screen. Rotation does not: which graha house 1
       * is counted from changes the picture, not the division being read.
       */
      varga.addEventListener('change', function () {
        if (!lastChart) return;
        drawSlot(slot);
        renderGrahaTable(lastChart);       // a different division is a different row
      });
    });
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
  function yogasByGraha(state, division) {
    var chart = division === 1 ? state.chart
      : Astro.chartInDivision(state.chart, division);
    var map = {};
    Yogas.detect(chart, strengthsFor(state)).forEach(function (yoga) {
      (yoga.grahas || []).forEach(function (name) {
        var list = map[name] || (map[name] = []);
        // The title alone says a yoga is present; the summary says why it is.
        if (!list.some(function (y) { return y.title === yoga.title; })) {
          list.push({ title: yoga.title, summary: yoga.summary || '' });
        }
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
  var STATE_NAMES = { R: 'Retrograde', C: 'Combust', V: 'Vargottama',
    Y: 'Yogakaraka' };

  function wireGrahaCard(container) {
    if (container.dataset && container.dataset.carded) return;
    if (container.dataset) container.dataset.carded = '1';
    var card = el('div', 'graha-card');
    card.hidden = true;
    container.appendChild(card);

    var REC = '\u001e', FLD = '\u001f';
    var split = function (raw) {
      return (raw || '').split(REC).filter(Boolean).map(function (r) {
        var bits = r.split(FLD);
        return { term: bits[0], why: bits[1] || '' };
      });
    };

    var fill = function (t) {
      card.innerHTML = '';
      card.appendChild(el('h4', 'graha-card-name', t.getAttribute('data-graha')));
      card.appendChild(el('p', 'graha-card-where', t.getAttribute('data-where')));
      /*
       * Every item is a statement with its reason beneath it: the state or the
       * yoga on one line, why it holds in this chart on the next. A name alone
       * says a thing is true and leaves the reader to take it on trust.
       */
      var list = el('ul', 'graha-card-list');
      split(t.getAttribute('data-states')).forEach(function (item) {
        var li = el('li', 'graha-card-state');
        var head = el('p', 'graha-card-term');
        head.appendChild(el('span', 'flag flag-' + item.term.toLowerCase(),
          '[' + item.term + ']'));
        head.appendChild(document.createTextNode(' ' + STATE_NAMES[item.term]));
        li.appendChild(head);
        if (item.why) li.appendChild(el('p', 'graha-card-why', item.why));
        list.appendChild(li);
      });
      split(t.getAttribute('data-yogas')).forEach(function (item) {
        var li = el('li', 'graha-card-yoga');
        li.appendChild(el('p', 'graha-card-term', item.term));
        if (item.why) li.appendChild(el('p', 'graha-card-why', item.why));
        list.appendChild(li);
      });
      if (list.children.length) card.appendChild(list);
      /*
       * Placed from the rendered box rather than from SVG coordinates, because
       * the chart scales with the column and the two stop agreeing the moment
       * it does.
       */
      var r = t.getBoundingClientRect(), c = container.getBoundingClientRect();
      card.hidden = false;
      var half = card.offsetWidth / 2;
      var x = r.left - c.left + r.width / 2;
      card.style.left = Math.max(half + 2, Math.min(c.width - half - 2, x)) + 'px';
      card.style.top = (r.bottom - c.top + 8) + 'px';
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
      yogas: yogasByGraha(state, set.division)
    });
    wireGrahaCard(document.getElementById('chart-' + slot));

    var from = set.reference === 'Ascendant' ? 'from the ascendant' : 'from the ' + set.reference;
    document.getElementById('caption-' + slot).textContent =
      varga.name + ' \u00b7 ' + varga.label + ' \u2014 ' + varga.about + ', ' + from;
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
  /*
   * The dispositor's name, in full. It was abbreviated, and shared its cell with
   * the relation - "Me · Great Friend" - because the two had one column between
   * them and the column had to hold both. They are two rows now, so the name has
   * the width to be a name.
   */
  function dispositorOf(graha, sign) {
    var lord = Astro.SIGN_LORDS[sign];
    return lord === graha ? 'itself' : lord;
  }

  /**
   * What the graha makes of the lord of the sign it stands in.
   *
   * The graha's own view, which is the one that governs its dignity and its
   * saptavargaja bala. Natural friendship is not mutual and eleven of the
   * twenty-one pairs disagree, so the other direction is in the hover rather
   * than lost.
   */
  function dispositorRelation(graha, sign, positionsD1) {
    var lord = Astro.SIGN_LORDS[sign];
    // 'Own Sign' as Astro.dignityOf spells it, the two sitting in rows that
    // touch and the same words meaning the same thing in both.
    if (lord === graha) return 'Own Sign';
    if (!positionsD1[lord] || !positionsD1[graha]) return '\u2013';
    var relation = Astro.compoundRelation(graha, lord,
      ((positionsD1[lord].sign - positionsD1[graha].sign) % 12 + 12) % 12 + 1);
    // The nodes rule nothing and have no place in the friendship table.
    return relation ? Astro.titleCase(Astro.RELATION_LABELS[relation]) : '\u2013';
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

  /*
   * Atmakaraka over two lines, which is the whole of the name but not the whole
   * of it on one line: every one of the eight ends in karaka, so the part that
   * tells them apart is the part before it and that is what goes on top.
   * Bhratru is seven characters where Bhratrukaraka is thirteen.
   */
  function karakaLines(name) {
    return name.replace(/karaka$/, ' Karaka');
  }

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

  /*
   * The rows of one chart's table: what is asked about every graha, in the
   * order a reader asks it. Sign first, then what the graha is worth there,
   * then where that puts it and what it owns from there; the precise position
   * and its nakshatra close, being the detail rather than the reading.
   */
  var GRAHA_ROWS = [
    { label: 'Rashi', says: 'The sign this chart puts the graha in.' },
    { label: 'Dignity', says: 'What the graha is worth in that sign: exalted, its own, a friend’s, and so on down to debilitated.' },
    { label: 'House', says: 'Counted from this chart’s own house 1, which the tab above says what is counted from.' },
    { label: 'Lordship', says: 'Which houses the graha rules, counted from the same house 1 as the row above.' },
    { label: 'Dispositor', says: 'The lord of the sign the graha stands in.' },
    { label: 'Relationship', says: 'What the graha makes of its dispositor - the compound relation, natural and temporary together. The graha’s own view, which is not always returned.' },
    /*
     * Three rows rather than one cell reading 29° 39' 38". The unit is in the
     * label, as the pada's is, so the cells carry the figure alone - and a
     * column that held eleven characters for this now holds two, which is what
     * the Moon's, Jupiter's and Saturn's columns were sized by.
     */
    /*
     * A heading of its own, then the three units under it. Three bare unit
     * names beside a table of numbers do not say what they are units of, and
     * the heading costs a row, which is the cheap direction in a table this
     * shape.
     */
    { label: 'Longitude', head: true,
      says: 'Where the graha stands within its sign, in the three rows below.' },
    { label: 'Degrees', part: true, says: 'Whole degrees into the sign, from 0 to 29.' },
    { label: 'Minutes', part: true, says: 'Minutes of arc, a sixtieth of a degree each.' },
    { label: 'Seconds', part: true, says: 'Seconds of arc, a sixtieth of a minute each.' },
    { label: 'Nakshatra', says: 'Which of the 27 nakshatras the graha falls in.' },
    { label: 'Pada', says: 'Which quarter of that nakshatra, of four. Read with the row above it: a bare 3 means nothing on its own.' },
    { label: 'Nakshatra lord', says: 'The graha that rules that nakshatra, which is what runs the Vimshottari dasha.' },
    { label: 'Sub lord', says: 'The KP sub lord: the nakshatra divided again in the Vimshottari proportions, and whichever graha owns the part the position falls in.' },
    /*
     * Two facts about the graha rather than about the chart it is read in, so
     * they repeat across the tabs as [R] and [C] do. Both are taken from the
     * rashi: a karaka is assigned by degrees into the sign and a varga longitude
     * is a position stretched back across thirty, so neither means anything
     * measured inside a division.
     */
    { label: 'Karaka', says: 'The Jaimini chara karaka, assigned by how far into its sign the graha has travelled - furthest is Atmakaraka. Read in the rashi, and so the same in every chart here.' },
    { label: 'Avastha', says: 'Baladi avastha, the graha’s age in its sign, six degrees to a stage and reversed in an even sign. Read in the rashi, and so the same in every chart here.' }
  ];

  /**
   * One chart's table: grahas across the top, what is asked of them down the
   * side.
   *
   * Turned to match the two grids beside it. It read the other way, a row per
   * graha, which is the shape of the data - but the question a reader brings is
   * usually about one thing across all the grahas, "who is exalted", "who owns
   * the tenth", and that is a row to scan rather than a column to hunt down.
   *
   * It costs width. Each graha column has to be as wide as that graha's longest
   * field, and the longest field is nearly always its nakshatra, so the table
   * runs about half as wide again as it did. The scroll container is what pays
   * for it.
   */
  function grahaTableFor(state, view) {
    var c = state.chart;
    var positionsD1 = {};
    c.planets.forEach(function (p) { positionsD1[p.name] = p; });
    var sun = positionsD1.Sun;
    var benefics = Astro.naturalBenefics(c);
    var divisionChart = Astro.chartInDivision(c, view.division);

    var cancelledHere = {};
    Yogas.neechaBhanga(divisionChart).forEach(function (yoga) {
      if (yoga.kind !== 'raja') return;
      (yoga.grahas || []).forEach(function (name) { cancelledHere[name] = true; });
    });

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

    /* Everything one column needs, worked out once and read down the rows. */
    var columns = entities.map(function (r) {
      var v = Astro.vargaPosition(r.longitude, view.division);
      var nak = Astro.nakshatraOf(v.longitude);
      var house = ((v.sign - firstSign) % 12 + 12) % 12 + 1;
      var owned = r.isAscendant ? [] : Astro.housesOwned(r.name, firstSign);
      var arc = dmsParts(v.degreeInSign);
      return {
        entity: r,
        cells: [
          { text: Astro.SIGNS[v.sign],
            flags: [view.division !== 1 && v.sign === Astro.signOf(r.longitude) ? 'V' : null,
              !r.isAscendant && Astro.hemmedByBenefics(r.name, v.sign, divisionChart,
                benefics) ? 'S' : null,
              !r.isAscendant && Astro.hemmedByMalefics(r.name, v.sign, divisionChart,
                benefics) ? 'P' : null] },
          { text: (r.isAscendant ? '' : Astro.dignityOf(r.name, v.sign, v.degreeInSign)) || '–',
            stack: true, star: !r.isAscendant && cancelledHere[r.name] },
          { text: String(house), cls: 'numeric',
            flags: [!r.isAscendant && Astro.hasDigBala(r.name, house) ? 'D' : null] },
          owned.length
            ? { text: owned.join(', '), cls: 'numeric',
                flags: [Astro.isYogakaraka(r.name, firstSign) ? 'Y' : null],
                title: r.name + ' rules ' + owned.map(function (h) {
                  return Astro.SIGNS[(firstSign + h - 1) % 12] + ', the ' + Yogas.ordinal(h);
                }).join(' and ') + '.' }
            : { text: '–', cls: 'numeric' },
          { text: r.isAscendant ? Astro.SIGN_LORDS[v.sign] : dispositorOf(r.name, v.sign),
            cls: 'dispositor',
            title: Astro.SIGN_LORDS[v.sign] + ' rules ' + Astro.SIGNS[v.sign] + '.' },
          /*
           * Stacked like the dignity above it and the nakshatra below: Great
           * Friend is twelve characters and its longer word is six, and one
           * graha in a great friend's sign was setting that column's width for
           * every row in it.
           */
          { text: r.isAscendant ? '\u2013'
              : dispositorRelation(r.name, v.sign, positionsD1),
            cls: 'dispositor', stack: true,
            title: r.isAscendant
              ? 'The lagna is a point rather than a graha, so it keeps no friendships.'
              : dispositorDetail(r.name, v.sign, positionsD1) },
          { text: String(arc.d), cls: 'longitude',
            title: Astro.SIGNS[v.sign] + ' ' + dms(v.degreeInSign) +
              '. Longitude ' + v.longitude.toFixed(4) + '°.' },
          /*
           * Unpadded. The zeroes are there in dms(), where 5° 06' 03" is one
           * string and the padding is what keeps it readable; here each part is
           * its own number in its own row and a leading zero says nothing.
           */
          { text: String(arc.m), cls: 'longitude',
            title: Astro.SIGNS[v.sign] + ' ' + dms(v.degreeInSign) + '.' },
          { text: String(arc.s), cls: 'longitude',
            title: Astro.SIGNS[v.sign] + ' ' + dms(v.degreeInSign) + '.' },
          /*
           * Two rows, where they were one cell reading "Rohini - 1". Joined was
           * right while they were a column each and a column cost width; turned,
           * a row costs none and a column costs whatever its widest cell holds,
           * so splitting them actually narrows the table - Purva Phalguni - 1
           * was setting Mars's column by itself.
           */
          /*
           * Six of the twenty-seven are two words - Purva and Uttara Phalguni,
           * Ashadha and Bhadrapada - and one of them sets the whole column's
           * width. Stacked, the column is as wide as the longer word rather than
           * as the pair: "Uttara Bhadrapada" is seventeen characters and its
           * longer half is ten.
           */
          { text: nak.name, stack: true,
            title: 'Nakshatra ' + nak.name + ', ruled by ' + nak.lord + '.' },
          { text: String(nak.pada), cls: 'numeric',
            title: 'Pada ' + nak.pada + ' of four, in ' + nak.name + '.' },
          /*
           * A row each and the names in full. They shared a cell reading
           * "Ma / Sa" while they shared a column, which is what forced both to
           * be abbreviated; a row costs no width.
           */
          { text: nak.lord,
            title: nak.name + ' is ruled by ' + nak.lord + '.' },
          { text: nak.subLord,
            title: 'The sub lord of this point in ' + nak.name + ' is ' +
              nak.subLord + '.' },
          { text: r.isAscendant || !karakas[r.name] ? '–'
              : karakaLines(karakas[r.name]),
            stack: true,
            title: r.isAscendant
              ? 'The lagna is a point rather than a graha, so it takes no karaka.'
              : karakas[r.name]
                ? karakas[r.name] + ': ' + karakaRank(karakas[r.name]) +
                  ' of the eight by degrees into the sign.'
                : 'Ketu takes no chara karaka. The eight are the seven from the ' +
                  'Sun to Saturn with Rahu, whose degrees are counted back from ' +
                  'the end of its sign.' },
          { text: r.isAscendant ? '–'
              : Astro.baladiAvastha(rashiSign(r), rashiDegree(r)),
            title: r.isAscendant
              ? 'The lagna is a point rather than a graha, so it takes no avastha.'
              : Astro.SIGNS[rashiSign(r)] + ' is an ' +
                (rashiSign(r) % 2 === 0 ? 'odd' : 'even') + ' sign, and the graha ' +
                'stands ' + rashiDegree(r).toFixed(1) + '° into it, so it gives ' +
                Astro.BALADI_WORTH[Astro.baladiAvastha(rashiSign(r), rashiDegree(r))] +
                '.' }
        ]
      };
    });

    var table = el('table', 'graha-table');
    table.id = 'graha-table-d' + view.division;

    var thead = el('thead');
    var headRow = el('tr');
    // Blank, the row headings under it naming themselves.
    var corner = el('th');
    corner.setAttribute('scope', 'col');
    headRow.appendChild(corner);
    columns.forEach(function (col) {
      if (col.entity.isAscendant) {
        var th = el('th', null, col.entity.name);
        th.setAttribute('scope', 'col');
        headRow.appendChild(th);
        return;
      }
      // The same cell the Vimsopaka and Shadbala grids head a graha with, so
      // [R] and [C] are in one place for all three.
      headRow.appendChild(grahaColumnHead(col.entity, sun));
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    var tbody = el('tbody');
    /*
     * A heading row names what the rows under it are units of and holds nothing
     * itself; the rows under it step in. Everything else is one row of values
     * with its own name.
     */
    var cellIndex = 0;
    GRAHA_ROWS.forEach(function (row) {
      var tr = document.createElement('tr');
      if (row.part) tr.className = 'row-part';
      var th = el('th', row.head ? 'row-head' : null, row.label);
      th.setAttribute('scope', 'row');
      th.title = row.says;
      tr.appendChild(th);
      if (row.head) {
        // Nothing to put in it: the values are in the rows it names.
        var blank = el('td', 'row-head-fill');
        blank.setAttribute('colspan', String(columns.length));
        tr.appendChild(blank);
        tbody.appendChild(tr);
        return;
      }
      var i = cellIndex++;
      columns.forEach(function (col) {
        var cell = col.cells[i];
        var td = el('td', cell.cls, cell.stack ? null : cell.text);
        // One word a line, rather than left to wherever the column happens to
        // wrap: a break the layout chooses moves as the table resizes.
        if (cell.stack) {
          String(cell.text).split(' ').forEach(function (word) {
            td.appendChild(el('span', 'stacked', word));
          });
        }
        if (cell.title) td.title = cell.title;
        /*
         * The star qualifies a dignity, so it goes wherever a dignity is
         * printed rather than only in the grid that scores them.
         */
        if (cell.star) {
          td.appendChild(el('span', 'flag flag-n', ' [N]'));
          td.title = col.entity.name + '’s debilitation is cancelled and the graha ' +
            'stands in an angle or a trine, which is neecha bhanga raja yoga.';
        }
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
           mercuryNature: document.getElementById('mercury-nature').value,
           cheshtaMethod: document.getElementById('cheshta-method').value });
    }
    return state.shadbala;
  }

  /*
   * The five shares Sthana bala is made of, in the order Parashara gives them,
   * each with the most it can be worth. The maximum is beside the name rather
   * than left to be known: a row reading 60.0 says nothing until it is read
   * against 60 for Kendradi and 315 for Saptavargaja, and the two rows look the
   * same until it is.
   */
  var STHANA_PARTS = [
    { key: 'uchcha', label: 'Uchcha', en: 'Exaltation', max: 60,
      says: 'How far the graha stands from its own debilitation point: nothing at ' +
        'that degree, sixty half a circle away from it.' },
    { key: 'saptavargaja', label: 'Saptavargaja', en: 'Seven divisions', max: 315,
      says: 'The graha against the lord of the sign it takes in each of the seven ' +
        'divisions, 45 for moolatrikona down to 2 in a great enemy’s, added ' +
        'over all seven.' },
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
      total: true, max: 480,
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
        'mean longitude is. The Sun and Moon never retrograde and borrow instead, ' +
        'the Sun its ayana bala and the Moon its paksha.' },
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
  var DOUBLED = { ayana: 'Sun', paksha: 'Moon' };

  function halvingDoubled() {
    var select = document.getElementById('doubled-rows');
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
        return el('td', 'numeric', n(bala.parts ? x[bala.key].total : x[bala.key]));
      }), bala.parts ? 'bala-head' : null, bala.shows);
      (bala.parts || []).forEach(function (part) {
        if (part.onlyWhenSet && grahas.every(function (graha) {
          return !result.grahas[graha][bala.key][part.key];
        })) return;
        var halved = halvingDoubled();
        var shows = halved && DOUBLED[part.key] ? '60' : part.shows;
        row(part.label, part.en, halved && DOUBLED[part.key] ? 60 : part.max,
          part.says, grahas.map(function (graha) {
          var x = result.grahas[graha];
          var raw = x[bala.key][part.key];
          var doubled = DOUBLED[part.key] === graha;
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
      'their disc diameters. Saptavargaja uses Raman’s ladder, section 30 — 45 and ' +
      '30 at the top, then halving at every step down to 1.875 — where Santhanam ' +
      'and Saravali give 20, 15, 10, 4 and 2 for the lower five, which is why ' +
      'totals here can differ from another calculator’s by a few virupas.';
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
      return Astro.vargaDignity(p.name, p.longitude, 1, positionsD1);
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
        var d = Astro.vargaDignity(planet.name, planet.longitude, division, positionsD1);
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
          signLine.appendChild(el('span', 'flag flag-d', ' [D]'));
        }

        var dignityLine = el('span', 'varga-dignity dig dig-' + d.key, d.label);
        /*
         * [N] rather than a star. It was a star while it was the only mark that
         * sat on a dignity rather than on a sign, and a star is a footnote: it
         * says look elsewhere, where every other mark here names its own
         * condition. The letter says which condition without being looked up.
         */
        if (d.key === 'debilitated' && cancelled[planet.name]) {
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
      var score = Astro.vimsopaka(planet.name, planet.longitude, scheme, positionsD1);
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
  var GOOD_KEYS = ['exalted', 'moolatrikona', 'own', 'adhimitra', 'mitra'];

  function vargaSummary(state, scheme) {
    var positionsD1 = {};
    state.chart.planets.forEach(function (p) { positionsD1[p.name] = p; });

    return state.chart.planets.map(function (planet) {
      var score = Astro.vimsopaka(planet.name, planet.longitude, scheme, positionsD1);
      if (!score) return null;                     // the nodes keep no friendships
      var rashi = Astro.signOf(planet.longitude);
      var benefics = Astro.naturalBenefics(state.chart);
      var good = 0, marks = { V: 0, X: 0, S: 0, P: 0, D: 0, N: 0 };
      scheme.divisions.forEach(function (division) {
        var d = Astro.vargaDignity(planet.name, planet.longitude, division, positionsD1);
        if (!d) return;
        if (GOOD_KEYS.indexOf(d.key) >= 0) good++;
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
        g.appendChild(svgEl('title', {}, (row.name || row.graha) + ' — ' + s.label +
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
    { key: 'D', label: '[D]', name: 'Directional strength' },
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
    var rows = vargaSummary(state, scheme);
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
  }

  /** The division a panel is set to. */
  function divisionFor(pickerId) {
    var division = +document.getElementById(pickerId).value || 1;
    var varga = Astro.VARGAS.filter(function (v) { return v.division === division; })[0];
    return { division: division, name: varga ? varga.name : 'D' + division,
             label: varga ? varga.label : '' };
  }

  function renderYogas(state) {
    var list = document.getElementById('yoga-list');
    var note = document.getElementById('yoga-note');
    list.innerHTML = '';

    var strengths = strengthsFor(state).grahas;
    var chosen = divisionFor('yoga-division');
    var found = Yogas.detect(Astro.chartInDivision(state.chart, chosen.division), strengths);
    if (!found.length) {
      note.textContent = 'No yoga among those this page looks for is present in ' +
        chosen.name + '. ' +
      'Raja yoga, parivartana, neecha bhanga, vipareeta raja, Lakshmi, Gaja Kesari, ' +
        'kartari, the five Mahapurusha yogas, the Moon’s own four - Sunapha, Anapha, ' +
        'Durudhura and Kemadruma - Chandra Mangala, Adhi, Sakata, Amala and ' +
        'Budha-Aditya are checked' + ' so far; the Lesson tab ' +
        'explains each.';
      return;
    }
    note.textContent = 'Raja yoga, parivartana, neecha bhanga, vipareeta raja, Lakshmi, Gaja Kesari, ' +
      'kartari, the five Mahapurusha yogas, the Moon’s own four - Sunapha, Anapha, ' +
      'Durudhura and Kemadruma - Chandra Mangala, Adhi, Sakata, Amala and ' +
      'Budha-Aditya are checked' + ' so far; more will follow. An angle-trine raja yoga ' +
      'is common, present in roughly three charts in four, so it is read alongside the ' +
      'strength of the grahas forming it rather than on its own. The Lesson tab explains ' +
      'what each one means. Yogas are read in the division chosen above, which is ' +
      'independent of what the two charts are showing.';

    found.forEach(function (finding) {
      var card = el('div', 'yoga-finding');
      var name = el('h4', 'yoga-name', finding.title);
      // Named kinds carry their family, so a reader meeting "sarala" for the
      // first time can see what it belongs to without leaving the panel.
      if (finding.family && finding.title.toLowerCase().indexOf(finding.family.toLowerCase()) < 0) {
        name.appendChild(el('span', 'yoga-family', 'a ' + finding.family.toLowerCase()));
      }
      card.appendChild(name);
      card.appendChild(el('p', 'yoga-summary', finding.summary));
      card.appendChild(el('p', 'yoga-grahas',
        (finding.grahas.length > 1 ? 'Grahas: ' : 'Graha: ') + finding.grahas.join(' and ') +
        '   \u00b7   ' + (finding.houses.length > 1 ? 'Houses: ' : 'House: ') +
        finding.houses.join(' and ')));

      // Where a yoga rests on several conditions, name the ones that applied:
      // they are not equally persuasive, and a bare verdict hides which did the
      // work.
      if (finding.reasons && finding.reasons.length) {
        var why = el('ul', 'yoga-reasons');
        finding.reasons.forEach(function (reason) { why.appendChild(el('li', null, reason)); });
        card.appendChild(why);
      }
      list.appendChild(card);
    });
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
      'of its sign \u2014 as far back as retrogression could carry it. Rahu and Ketu are left out ' +
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
  var SEED_KEY = 'jyotisha.seeded.v2';
  var SEED_KEY_V1 = 'jyotisha.seeded.v1';
  var KUNDALI_API = 'https://deiefjnwbfcywsaaqqbs.supabase.co/functions/v1/kundalis';
  var savedList = document.getElementById('saved-list');
  var savedEmpty = document.getElementById('saved-empty');
  var savedNote = document.getElementById('saved-note');
  var saveFeedback = document.getElementById('save-feedback');
  var addButton = document.getElementById('add-kundali');
  var editButton = document.getElementById('edit-button');

  /*
   * Four charts ship with the app, so the saved list is not empty before anyone
   * has typed a birth time in. All four are picked for being checkable rather
   * than for being famous, and between them they show the three things that
   * decide whether a chart can be trusted: the time, the clock it is read on,
   * and the place.
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
  }];

  /*
   * Which study charts have already been offered, or null when the question
   * cannot be answered. Recording the names rather than a single flag is what
   * lets a chart be added to the list later: deleting one still has to stick,
   * so nothing is ever offered twice, but a browser that already holds the
   * earlier charts is not therefore finished with seeding. The v1 key was that
   * single flag, written when Donald Trump's was the only study chart, so it
   * counts as that one having been offered and no more.
   */
  function offeredStudyCharts() {
    var offered = {};
    try {
      if (window.localStorage.getItem(SEED_KEY_V1)) offered['Donald Trump'] = true;
      var raw = window.localStorage.getItem(SEED_KEY);
      var names = raw ? JSON.parse(raw) : [];
      if (Array.isArray(names)) names.forEach(function (name) { offered[name] = true; });
    } catch (e) {
      // No storage, or a value that is not ours: with no way to tell what has
      // been offered, declining to seed is what keeps a deletion deleted.
      return null;
    }
    return offered;
  }

  function seedStudyCharts() {
    var offered = offeredStudyCharts();
    if (!offered) return;
    var list = readSaved();
    var known = {};
    list.forEach(function (entry) { known[keyOf(entry)] = true; });
    var fresh = STUDY_CHARTS.filter(function (entry) {
      return !offered[entry.name] && !known[keyOf(entry)];
    });
    // Appended, not prepended: a saved chart of one's own outranks the example.
    fresh.forEach(function (entry) { list.push(entry); });
    if (!fresh.length || writeSaved(list)) {
      try {
        window.localStorage.setItem(SEED_KEY, JSON.stringify(STUDY_CHARTS.map(function (entry) {
          return entry.name;
        })));
      } catch (e) {}
    }
  }

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
      trueNode: row.true_node,
      gender: row.gender || 'unstated',
      celebrity: row.celebrity === true,
      note: row.note || ''
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

  /** A small inline-SVG icon button for a row in the saved list. */
  function iconButton(kind, label, onClick) {
    var paths = {
      edit: ['M4 20h4L19 9a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5V20Z', 'M14.5 6.5 17.5 9.5'],
      remove: ['M5 7h14', 'M10 7V5h4v2', 'M6.5 7l.8 12h9.4l.8-12', 'M10 10.5v5.5', 'M14 10.5v5.5']
    }[kind];
    var button = el('button', 'saved-icon' + (kind === 'remove' ? ' saved-remove' : ''));
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
      var savedName = el('span', 'saved-name', entry.name);
      if (entry.celebrity) savedName.appendChild(el('span', 'celebrity-mark', CELEBRITY_MARK));
      open.appendChild(savedName);
      // The place gives way first when the row is short of room; the moment is
      // what tells two charts of the same person apart, so it keeps its width.
      open.appendChild(el('span', 'saved-meta saved-where', entry.placeLabel));
      open.appendChild(el('span', 'saved-meta saved-when', formatSavedMoment(entry)));
      open.addEventListener('click', function () { loadSaved(entry); });
      li.appendChild(open);

      var actions = el('div', 'saved-actions');
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
        yes.addEventListener('click', function () { removeSaved(index); });
        actions.appendChild(yes);

        var no = el('button', 'saved-cancel', 'Cancel');
        no.type = 'button';
        no.setAttribute('aria-label', 'Keep ' + entry.name);
        no.addEventListener('click', renderSaved);
        actions.appendChild(no);
        yes.focus();
      }));

      li.appendChild(actions);
      savedList.appendChild(li);
    });
  }

  function removeSaved(index) {
    var current = readSaved();
    var removed = current.splice(index, 1)[0];
    writeSaved(current);
    // If the chart on screen was the one deleted, the next save is a new row.
    if (currentEntry && removed &&
        (removed.id ? removed.id === currentEntry.id : keyOf(removed) === keyOf(currentEntry))) {
      currentEntry = null;
    }
    renderSaved();
    if (removed && removed.id) {
      callKundaliApi({ action: 'delete', id: removed.id }, function (entries) {
        if (entries) { writeSaved(entries.map(fromRow)); renderSaved(); }
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

  /** Put a saved chart's details into the form, without casting it. */
  function applyEntryToForm(entry) {
    currentEntry = entry;
    document.getElementById('name').value = entry.name;
    document.getElementById('date').value = entry.date;
    var t = entry.time.split(':').map(Number);
    writeTime(t[0], t[1] || 0, t[2] || 0);
    document.getElementById('ayanamsa').value = entry.ayanamsa || 'lahiri';
    document.getElementById('node-type').value = entry.trueNode ? 'true' : 'mean';
    document.getElementById('time-standard').value = entry.standard === 'lmt' ? 'lmt' : 'zone';
    document.getElementById('gender').value =
      (!entry.gender || entry.gender === 'unstated') ? '' : entry.gender;
    document.getElementById('celebrity').checked = entry.celebrity === true;
    document.getElementById('person-note').value = entry.note || '';

    selectedCity = {
      name: entry.placeLabel.split(',')[0],
      region: '', nation: '',
      label: entry.placeLabel,          // keep the whole thing, not just the town
      lat: entry.latitude, lon: entry.longitude, zone: entry.zone
    };
    placeInput.value = entry.placeLabel;
    placeNote.textContent = entry.latitude.toFixed(4) + ', ' + entry.longitude.toFixed(4) + '  ·  ' + entry.zone;
    writeCoords(entry.latitude, entry.longitude, entry.zone);
    manualFields.hidden = true;
  }

  /** Open a saved chart: fill the form and cast it. */
  function loadSaved(entry) {
    applyEntryToForm(entry);
    reopeningSaved = true;
    activateTab('chart');
    form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit'));
  }

  /** Edit a saved chart: fill the form and stop there, so it can be corrected. */
  function editSaved(entry) {
    applyEntryToForm(entry);
    activateTab('add');
    document.getElementById('name').focus();
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

  /*
   * The word for the celebrity flag, in one place. The list said "study" and the
   * chart heading said "public figure", both being halves of the form's own
   * label, and each read as a different thing about the same tick.
   */
  var CELEBRITY_MARK = 'public figure';

  var emptyChart = document.getElementById('empty-chart');
  var savedCount = document.getElementById('saved-count');

  var sections = setupTabs(['add', 'saved', 'chart', 'lesson', 'settings'],
    document.querySelector('.tabs:not(.subtabs)'), { scrollToTop: true, onChange: function (name) {
      if (name === 'lesson') loadLessons();
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
    var status = document.getElementById('settings-status');
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

  document.getElementById('doubled-rows').addEventListener('change', function () {
    var status = document.getElementById('settings-status');
    var halved = this.value === 'undoubled';
    if (!lastChart) {
      status.textContent = 'Saved. The next chart will use it.';
      return;
    }
    // Display only, so there is nothing to recompute - not even the strengths.
    render(lastChart);
    status.textContent = halved
      ? 'The Sun\u2019s ayana and the Moon\u2019s paksha are shown halved. The totals still count them doubled.'
      : 'The Sun\u2019s ayana and the Moon\u2019s paksha are shown as the texts compute them, doubled.';
  });

  document.getElementById('cheshta-method').addEventListener('change', function () {
    var status = document.getElementById('settings-status');
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

  document.getElementById('mercury-nature').addEventListener('change', function () {
    var status = document.getElementById('settings-status');
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

  document.getElementById('kranti').addEventListener('change', function () {
    var status = document.getElementById('settings-status');
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
    var status = document.getElementById('settings-status');
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
    var status = document.getElementById('settings-status');
    var names = { apparent: 'the sundial at the birthplace',
      mean: 'local mean time', zone: 'zone time' };
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
    var status = document.getElementById('settings-status');
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
    var status = document.getElementById('settings-status');
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
  var tableTabs = setupTabs(['grahas', 'shadbala', 'vargas', 'yogas', 'aspects'],
    document.querySelector('.tabs.subtabs:not(.graha-charts)'));
  wireGrahaChartKeys();

  function activateTab(name, moveFocus) { sections.activate(name, moveFocus); }

  /** Empty the form so the next chart starts from nothing. */
  function blankForm() {
    document.getElementById('name').value = '';
    document.getElementById('date').value = '';
    hourInput.value = ''; minuteInput.value = ''; secondInput.value = '';
    meridiemSelect.value = 'am';
    placeInput.value = '';
    placeNote.textContent = '';
    document.getElementById('gender').value = '';
    document.getElementById('celebrity').checked = false;
    document.getElementById('person-note').value = '';
    selectedCity = null;
    ['lat', 'lon'].forEach(function (which) {
      ['d', 'm', 's'].forEach(function (part) {
        document.getElementById('manual-' + which + '-' + part).value = '';
      });
      document.getElementById('manual-' + which + '-h').value = which === 'lat' ? 'N' : 'E';
      document.getElementById(which + '-decimal').textContent = '';
    });
    zoneChosenByHand = false;
    document.getElementById('zone-note').textContent = '';
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
    document.getElementById('gender').value =
      (!state.gender || state.gender === 'unstated') ? '' : state.gender;
    document.getElementById('celebrity').checked = state.celebrity === true;
    document.getElementById('person-note').value = state.note || '';
    selectedCity = state.place;
    placeInput.value = placeLabelOf(state.place);
    placeNote.textContent = state.place.lat.toFixed(4) + ', ' + state.place.lon.toFixed(4) +
      '  \u00b7  ' + state.place.zone;
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
      'place=' + encodeURIComponent(placeLabelOf(p))
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
    form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit'));
  }

  /* ------------------------------------------------------------------ init */

  populateSelects();
  populateSlotSelects();
  seedStudyCharts();
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
