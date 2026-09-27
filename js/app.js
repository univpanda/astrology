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
  function dispositorOf(graha, sign, positionsD1) {
    var lord = Astro.SIGN_LORDS[sign];
    if (lord === graha) return 'itself';
    if (!positionsD1[lord] || !positionsD1[graha]) return Astro.grahaAbbr(lord);
    var relation = Astro.compoundRelation(graha, lord,
      ((positionsD1[lord].sign - positionsD1[graha].sign) % 12 + 12) % 12 + 1);
    // The nodes rule nothing and have no place in the friendship table.
    return Astro.grahaAbbr(lord) +
      (relation ? ' \u00b7 ' + Astro.titleCase(Astro.RELATION_LABELS[relation]) : '');
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

  /**
   * Every graha, once, with a row for each chart being shown.
   *
   * It was two tables in two tabs, which made comparing a graha across divisions
   * a matter of switching back and forth and remembering. The name spans its
   * rows so the pair reads as one entry.
   *
   * The flags divide by what they belong to. Retrogression and combustion are
   * facts about the graha, true whichever division is being looked at, so they
   * ride on the name. Vargottama is a fact about one division and yogakaraka is
   * lordship counted from that chart's house 1, so both ride on the chart row
   * and can differ from line to line.
   */
  function renderGrahaTable(state) {
    var c = state.chart;
    var tbody = document.querySelector('#graha-table tbody');
    tbody.innerHTML = '';

    var views = grahaViews();
    var positionsD1 = {};
    c.planets.forEach(function (p) { positionsD1[p.name] = p; });
    var sun = positionsD1.Sun;

    var rows = [{ name: 'Ascendant', longitude: c.ascendant.longitude, isAscendant: true }]
      .concat(c.planets.map(function (p) {
        return { name: p.name, longitude: p.longitude, retrograde: p.retrograde };
      }));

    rows.forEach(function (r) {
      views.forEach(function (view, i) {
        var cancelledHere = {};
        Yogas.neechaBhanga(Astro.chartInDivision(c, view.division)).forEach(function (yoga) {
          if (yoga.kind !== 'raja') return;
          (yoga.grahas || []).forEach(function (name) { cancelledHere[name] = true; });
        });
        var v = Astro.vargaPosition(r.longitude, view.division);
        var nak = Astro.nakshatraOf(v.longitude);
        var varga = Astro.VARGAS.filter(function (x) { return x.division === view.division; })[0];

        // House 1 for this row: the ascendant, or the graha the chart is turned onto.
        var firstSign = Astro.vargaPosition(c.ascendant.longitude, view.division).sign;
        if (view.reference && view.reference !== 'Ascendant') {
          var anchor = c.planets.filter(function (p) { return p.name === view.reference; })[0];
          if (anchor) firstSign = Astro.vargaPosition(anchor.longitude, view.division).sign;
        }

        /*
         * The lagna is not tinted apart from the grahas. It is the first entry
         * and it is named, which is enough to tell it from them, and a standing
         * tint on one row of a table whose hover is also a tint left the reader
         * two greens to tell apart.
         */
        var tr = document.createElement('tr');
        if (i === 0) tr.className = 'graha-first';

        if (i === 0) {
          var th = el('th', null, r.name);
          th.setAttribute('scope', 'rowgroup');
          th.setAttribute('rowspan', String(views.length));
          // Graha-level flags: true of the graha itself, not of any one chart.
          [r.retrograde ? 'R' : null,
           !r.isAscendant && sun && Astro.isCombust(r.name, r.longitude, sun.longitude,
             r.retrograde) ? 'C' : null]
            .filter(Boolean).forEach(function (f, n) {
              th.appendChild(el('span', 'flag flag-' + f.toLowerCase(),
                (n === 0 ? ' ' : '') + '[' + f + ']'));
            });
          tr.appendChild(th);
        }

        /*
         * Chart-level flags, in the order of what they answer to. [V] and [H]
         * turn on the division alone: which sign the division gives the graha,
         * and which grahas the division makes its neighbours. [Y] and + turn on
         * the division and on the reference as well, both being counted from
         * house 1, so they move when the chart is rotated onto another graha and
         * the two above it do not.
         */
        var house = ((v.sign - firstSign) % 12 + 12) % 12 + 1;
        var divisionChart = Astro.chartInDivision(c, view.division);
        var chartCell = el('td', 'graha-chart', varga ? varga.name : 'D' + view.division);
        chartCell.title = (varga ? varga.label + ', ' + varga.about + '. ' : '') +
          'Houses counted from ' +
          (view.reference === 'Ascendant' ? 'the ascendant' : view.reference) + '.';
        [view.division !== 1 && v.sign === Astro.signOf(r.longitude) ? 'V' : null,
         !r.isAscendant && Astro.hemmedByBenefics(r.name, v.sign, divisionChart) ? 'H' : null,
         !r.isAscendant && Astro.isYogakaraka(r.name, firstSign) ? 'Y' : null,
         !r.isAscendant && Astro.hasDigBala(r.name, house) ? '+' : null]
          .filter(Boolean).forEach(function (f, n) {
            var cls = f === '+' ? 'flag flag-dig' : 'flag flag-' + f.toLowerCase();
            chartCell.appendChild(el('span', cls,
              (n === 0 ? ' ' : '') + (f === '+' ? '+' : '[' + f + ']')));
          });
        tr.appendChild(chartCell);

        var owned = r.isAscendant ? [] : Astro.housesOwned(r.name, firstSign);
        [{ text: Astro.SIGNS[v.sign] },
         { text: (r.isAscendant ? '' : Astro.dignityOf(r.name, v.sign, v.degreeInSign)) || '\u2013',
           star: !r.isAscendant && cancelledHere[r.name] },
         { text: String(house), cls: 'numeric' },
         owned.length
           ? { text: owned.join(', '), cls: 'numeric',
               title: r.name + ' rules ' + owned.map(function (h) {
                 return Astro.SIGNS[(firstSign + h - 1) % 12] + ', the ' + Yogas.ordinal(h);
               }).join(' and ') + '.' }
           : { text: '–', cls: 'numeric' },
         { text: r.isAscendant ? Astro.grahaAbbr(Astro.SIGN_LORDS[v.sign])
             : dispositorOf(r.name, v.sign, positionsD1),
           cls: 'dispositor',
           title: r.isAscendant
             ? Astro.SIGN_LORDS[v.sign] + ' rules ' + Astro.SIGNS[v.sign] + '.'
             : dispositorDetail(r.name, v.sign, positionsD1) },
         { text: dms(v.degreeInSign), cls: 'longitude',
           title: 'Longitude ' + v.longitude.toFixed(4) + '°' },
         /*
          * The pada had a column of its own, which said nothing on its own: a
          * bare 3 is only meaningful as the third quarter of some nakshatra, and
          * the two are read together every time. Joined, they cost one column
          * instead of two and lose nothing.
          */
         { text: nak.name + ' - ' + nak.pada,
           title: nak.name + ', pada ' + nak.pada + ' of four.' },
         /*
          * Two grahas in one cell, so both go in abbreviated and the words go in
          * the hover. Nothing else in the row needs them spelt out: this pair is
          * read as a pair, Vimshottari's lord over its KP sub lord.
          */
         { text: Astro.grahaAbbr(nak.lord) + ' / ' + Astro.grahaAbbr(nak.subLord),
           cls: 'nak-lords',
           title: nak.name + ' is ruled by ' + nak.lord + ', and its sub lord is ' +
             nak.subLord + '.' }
        ].forEach(function (cell) {
          var td = el('td', cell.cls, cell.text);
          if (cell.title) td.title = cell.title;
          /*
           * The star qualifies a dignity, so it goes wherever a dignity is
           * printed rather than only in the grid that scores them.
           */
          if (cell.star) {
            td.appendChild(el('sup', 'neecha-bhanga', '*'));
            td.title = r.name + '\u2019s debilitation is cancelled and the graha stands in ' +
              'an angle or a trine, which is neecha bhanga raja yoga.';
          }
          tr.appendChild(td);
        });

        tbody.appendChild(tr);
      });
    });
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
      });
    }
    return state.shadbala;
  }

  function renderShadbala(state) {
    var tbody = document.querySelector('#shadbala-table tbody');
    tbody.innerHTML = '';
    var result = strengthsFor(state);

    /*
     * Listed in the same order as the graha tables rather than strongest first.
     * Reading across from one table to the other is the common move, and a list
     * that reorders itself per chart makes that a search each time. The module
     * still returns its ranking; the Rupas and Needs columns carry the same
     * comparison for anyone who wants it.
     */
    state.chart.planets.forEach(function (planet) {
      var graha = planet.name;
      var x = result.grahas[graha];
      if (!x) return;         // Rahu and Ketu are outside Shadbala
      var tr = document.createElement('tr');
      if (!x.strong) tr.className = 'weak-graha';
      var n = function (v) { return v.toFixed(1); };
      [[graha, null],
       [n(x.sthana.total), 'numeric'], [n(x.dig), 'numeric'],
       [n(x.kala.total), 'numeric'], [n(x.cheshta), 'numeric'],
       [n(x.naisargika), 'numeric'], [n(x.drik), 'numeric'],
       [x.totalShashtiamsa.toFixed(0), 'numeric'],
       [x.rupas.toFixed(2), 'numeric'],
       [String(x.required), 'numeric'],
       [x.strong ? 'Strong' : 'Weak', x.strong ? 'strong-flag' : 'weak-flag']
      ].forEach(function (cell, i) {
        var td = el(i === 0 ? 'th' : 'td', cell[1], cell[0]);
        if (i === 0) td.setAttribute('scope', 'row');
        if (i === 1) {
          td.title = 'Uchcha ' + n(x.sthana.uchcha) + ', saptavargaja ' + n(x.sthana.saptavargaja) +
            ', ojhayugma ' + n(x.sthana.ojhayugma) + ', kendradi ' + n(x.sthana.kendradi) +
            ', drekkana ' + n(x.sthana.drekkana);
        }
        if (i === 3) {
          td.title = 'Nathonnatha ' + n(x.kala.nathonnatha) + ', paksha ' + n(x.kala.paksha) +
            ', tribhaga ' + n(x.kala.tribhaga) + ', abda ' + n(x.kala.abda) +
            ', masa ' + n(x.kala.masa) + ', vara ' + n(x.kala.vara) +
            ', hora ' + n(x.kala.hora) + ', ayana ' + n(x.kala.ayana);
        }
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });

    document.getElementById('shadbala-note').textContent =
      'In shashtiamsas; sixty make one Rupa. A graha is strong when it meets the minimum ' +
      'Parashara sets for it, which differs by graha, so compare each total against its own ' +
      'requirement rather than against the others. Grahas are listed as in the tables beside ' +
      'this one. Hover the Sthana and Kala figures for their parts. Yuddha bala is not ' +
      'included, and Rahu and Ketu are outside Shadbala. Saptavargaja uses the ladder in ' +
      'Santhanam\u2019s chapter 27 \u2014 45, 30, 20, 15, 10, 4, 2 \u2014 rather than the ' +
      'halving series some calculators use, which is why totals here can differ from theirs ' +
      'by a few virupas.';
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
   * useful fact. The relation underneath is kept in the cell's title.
   */
  /** What one cell of the grid is saying, in full. */
  function vargasDetail(d, division, graha) {
    var text = 'D' + division + ': ' + d.label + ' - ' + Astro.SIGNS[d.sign] +
      ', ruled by ' + d.lord + '.';
    if (d.viaProxy) {
      text += ' Neither luminary rules a trimsamsa, so for this division ' + graha +
        ' stands in as ' + d.viaProxy + ', which is what lets it hold one of its own.';
    }
    if (d.relationLabel && d.relationLabel !== d.label) {
      text += ' On the seven-step varga scale that counts as ' + d.relationLabel.toLowerCase() + '.';
    }
    return text;
  }

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
  function renderVargasHead(table, scheme) {
    var row = table.querySelector('thead tr');
    row.innerHTML = '';
    var first = el('th', null, 'Graha');
    first.setAttribute('scope', 'col');
    row.appendChild(first);

    /*
     * The three the scheme leans on hardest, picked out of the row. Which three
     * is the scheme's own answer rather than a fixed trio: the shadvarga and the
     * saptavarga lean on D1, D9 and D3, the dasavarga and shodasavarga on D60,
     * D1 and D9.
     */
    var keys = Astro.keyDivisions(scheme);

    scheme.divisions.forEach(function (division) {
      var weight = scheme.weights[division];
      var th = el('th', keys.indexOf(division) >= 0 ? 'varga-key' : null, 'D' + division);
      th.setAttribute('scope', 'col');
      th.appendChild(el('span', 'varga-weight', vimsopakaFigure(weight)));
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
      row.appendChild(th);
    });

    /*
     * The total closes the row under a blank heading. The panel is called
     * Vimsopaka Bala and the note beneath says what the column is and what it is
     * out of, so a heading here was the third telling, and the widest word in
     * the row was carrying none of it.
     *
     * Blank to look at, not to a screen reader: the column still needs a name
     * for the cells under it to be associated with anything, and a th with no
     * accessible name gives a row of bare numbers.
     */
    var total = el('th', null, null);
    total.setAttribute('scope', 'col');
    total.appendChild(el('span', 'visually-hidden', 'Vimsopaka bala, out of twenty'));
    row.appendChild(total);
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
  /** "Exal (Exalted), Mool (Mooltrikona) ... and Deb (Debilitated)", in rank order. */
  function dignityKey() {
    var pairs = Object.keys(Astro.VARGA_DIGNITY_LABELS).map(function (k) {
      return Astro.VARGA_DIGNITY_SHORT[k] + ' (' + Astro.VARGA_DIGNITY_LABELS[k] + ')';
    });
    return pairs.slice(0, -1).join(', ') + ' and ' + pairs[pairs.length - 1];
  }

  function vargaNote(scheme, brief) {
    /*
     * One idea a sentence. It had been "Where each graha stands in the 16
     * divisions of the Shodasavarga, judged against the lord of the sign each
     * one gives" - a fragment with no verb of its own, trailing a clause whose
     * "each one" meant the divisions three lines back.
     */
    return 'Each of the ' + scheme.count + ' divisions of the ' + scheme.label +
      ' puts a graha in a sign. The two rows under a graha give that sign and its dignity ' +
      'there, judged against the sign\u2019s lord, and the last column scores those ' +
      'dignities out of twenty. ' +
      /*
       * The short forms with their words, built from the engine's own two tables
       * rather than typed out here. Nine abbreviations and nine words written
       * into a sentence is the pair of tables copied, and a rename would have
       * left the sentence saying the old one.
       *
       * No excuse for the shortening: that sixteen columns leave no room for
       * words is visible in the sixteen columns.
       */
      (brief ? 'Grahas go as Su, Mo, Ma and the rest, signs as Ari, Tau, Can, and ' +
        'dignities as ' + dignityKey() + '. ' : '') +
      /*
       * Placement, not definition. The flag key at the top of the tab defines
       * [V] and *, so the note says only where they sit and why they are here:
       * each is one of the four things vimsopaka cannot see, put against the
       * value it qualifies. The other two have no value to sit against - an
       * exchange is about a pair of grahas and directional strength about a
       * house, and the grid prints neither - so they hang on the graha's name.
       */
      'A marked cell is one the score reads wrong, and the mark says how. [V] repeats the ' +
      'rashi sign, [P] is an exchange of signs, + is the house the graha is strongest in ' +
      'by direction, and * on a dignity is a debilitation cancelled into a raja yoga. ' +
      'Those are the four things vimsopaka cannot see, each against the value in that cell ' +
      'it bears on, so an unmarked cell is one the score has whole. Hover any of them for ' +
      'the reading. ' +
      /*
       * Both say what the grid does before why. A reader looking at seven rows
       * wants "they are left out" first and the reason after it, not a clause
       * about friendship to hold until the sentence gets to the point.
       */
      'Rahu and Ketu are left out: they own no sign and keep no friendships. In D30 the Sun ' +
      'is judged as Mars and the Moon as Venus, no luminary ruling a trimsamsa.';
  }

  /*
   * Past ten divisions the row stops fitting and the words have to give way to
   * abbreviations. Below that there is room, and shortening where there is room
   * serves nobody: six columns of "Great enemy" read better than six of "Gt Enm".
   * Ten full-word columns come to roughly the width of the graha tables beside
   * this one, which already scroll and are none the worse for it.
   */
  var ABBREVIATE_ABOVE = 10;

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
   * Which grahas have a cancelled debilitation, division by division.
   *
   * Vimsopaka does not know about cancellation and cannot: it scores dignity one
   * division at a time, and a cancellation is a fact about the chart around the
   * graha, not about the sign it sits in. So a cancelled debilitation scores the
   * floor, which is the one case where the total is not merely blind but lowest
   * exactly where it should not be. The star does not change the number. It says
   * the number is not to be read at face value here.
   *
   * Only the raja form is marked. A plain cancellation lifts the weakness and
   * leaves the graha with nowhere to act from, so a score near the floor is not
   * far wrong; it is the raja form, cancelled and standing in an angle or a
   * trine, where the floor misreports the graha outright.
   *
   * Asked of each division's own chart, the same recast the Yogas tab reads, so
   * the grid and that tab cannot disagree about D9. Only divisions that actually
   * hold a debilitation are recast; on the shodasavarga most rounds recast two or
   * three of the sixteen rather than all of them.
   */
  function cancelledDebilitations(chart, divisions, cells) {
    var needed = {};
    divisions.forEach(function (division, i) {
      if (cells.some(function (row) { return row[i] && row[i].key === 'debilitated'; })) {
        needed[division] = true;
      }
    });
    var found = {};
    Object.keys(needed).forEach(function (division) {
      var d = Number(division);
      found[d] = {};
      Yogas.neechaBhanga(Astro.chartInDivision(chart, d)).forEach(function (yoga) {
        if (yoga.kind !== 'raja') return;
        (yoga.grahas || []).forEach(function (name) { found[d][name] = true; });
      });
    });
    return found;
  }

  function renderVargas(state) {
    var scheme = currentScheme();
    var brief = scheme.divisions.length > ABBREVIATE_ABOVE;
    var keys = Astro.keyDivisions(scheme);
    var table = document.getElementById('vargas-table');
    renderVargasHead(table, scheme);
    var tbody = table.querySelector('tbody');
    tbody.innerHTML = '';

    var positionsD1 = {};
    state.chart.planets.forEach(function (p) { positionsD1[p.name] = p; });

    var rows = state.chart.planets.map(function (planet) {
      return scheme.divisions.map(function (division) {
        return Astro.vargaDignity(planet.name, planet.longitude, division, positionsD1);
      });
    });
    var cancelled = cancelledDebilitations(state.chart, scheme.divisions, rows);

    /*
     * Each division's own ascending sign, which is what its houses are counted
     * from, and which grahas that division puts in an exchange. Computed once
     * per division rather than once per cell.
     */
    var divisionLagna = {}, exchanging = {};
    scheme.divisions.forEach(function (division) {
      divisionLagna[division] =
        Astro.vargaPosition(state.chart.ascendant.longitude, division).sign;
      exchanging[division] = {};
      Yogas.parivartana(Astro.chartInDivision(state.chart, division))
        .forEach(function (yoga) {
          (yoga.grahas || []).forEach(function (name) {
            exchanging[division][name] = yoga.title;
          });
        });
    });

    // Listed as in the graha tables, for reading across from one to the other.
    state.chart.planets.forEach(function (planet, row) {
      var cells = rows[row];
      if (cells.every(function (c) { return !c; })) return;   // Rahu and Ketu

      /*
       * Each graha takes two rows, its sign above its dignity, with the name
       * spanning both so the pair reads as one entry. The dignity is the answer
       * and the sign is the working behind it, and keeping the working in a hover
       * meant the one question the grid raises - which sign is that? - could only
       * be answered one cell at a time.
       */
      var signRow = document.createElement('tr');
      signRow.className = 'varga-signs';
      /*
       * The names shorten where everything else does. Sixteen columns already
       * cost the signs and the dignities their words, and a full graha name
       * beside Ari and Gt Fr is the one column still spending width it has not
       * got. Six and seven columns leave room, and keep it.
       */
      var th = el('th', null, brief ? Astro.grahaAbbr(planet.name) : planet.name);
      th.setAttribute('scope', 'rowgroup');
      th.setAttribute('rowspan', '2');
      if (brief) th.title = planet.name;
      signRow.appendChild(th);


      var dignityRow = document.createElement('tr');
      dignityRow.className = 'varga-dignities';

      cells.forEach(function (d, i) {
        var division = scheme.divisions[i];
        var detail = d ? vargasDetail(d, division, planet.name) : null;
        /*
         * Where a name will not fit, the sign goes as the project's
         * abbreviation, the first three letters: Ari, Tau, Can, Sco. The same
         * codes label the kundli's cells above, so the reader is not learning a
         * second shorthand for this table. The full name stays in the title.
         */
        var sign = el('td', 'varga-sign' + (brief ? ' varga-sign-abbr' : '') +
          (keys.indexOf(division) >= 0 ? ' varga-key' : ''),
          d ? (brief ? Astro.SIGN_ABBR[d.sign] : Astro.SIGNS[d.sign]) : '\u2013');

        /*
         * The division has landed the graha back in the sign it holds in the
         * rashi. Marked here rather than as a flag on the graha, because it is a
         * fact about one division and a flag would have to pick one to stand for.
         *
         * D1 is skipped: it is the rashi, so every cell in it would qualify and
         * the mark would say nothing. The classical vargottama is this in the D9
         * column; the other columns are the same comparison, which is computable
         * everywhere but is not what the texts mean by the word.
         */
        if (d && division !== 1 && d.sign === Astro.signOf(planet.longitude)) {
          sign.appendChild(el('span', 'flag flag-v', ' [V]'));
          sign.title = planet.name + ' holds ' + Astro.SIGNS[d.sign] + ' in D' + division +
            ' as well as in the rashi.' +
            (division === 9 ? ' In D9 that is vargottama proper.' : '');
        }
        /*
         * The other two the score cannot see, per cell rather than per graha.
         * Each says something true of this graha in this division and nowhere
         * else: an exchange rearranges who disposits whom, and a house belongs
         * to the division's own lagna.
         *
         * Only these four are marked. Every yoga the app detects would mark 58
         * per cent of the cells - raja yoga alone is better than one per
         * divisional chart, on two grahas each - and a mark on three cells in
         * five is a decoration rather than a finding. The Yogas tab reads a
         * division in full; the grid marks what this score is blind to.
         */
        if (d && exchanging[division][planet.name]) {
          sign.appendChild(el('span', 'flag flag-p', ' [P]'));
          sign.title = planet.name + ' is in an exchange of signs in D' + division +
            ', which is ' + exchanging[division][planet.name].toLowerCase() +
            '. The score judges it against the lord of this sign and never asks what ' +
            'that lord is doing.';
        }
        if (d) {
          var cellHouse = ((d.sign - divisionLagna[division]) % 12 + 12) % 12 + 1;
          if (Astro.hasDigBala(planet.name, cellHouse)) {
            sign.appendChild(el('span', 'flag flag-dig', ' +'));
            sign.title = planet.name + ' stands in the ' + Yogas.ordinal(cellHouse) +
              ' of D' + division + ', the house it is strongest in by direction. The score ' +
              'counts dignity and never looks at houses.';
          }
        }
        var dignity = el('td', (d ? 'dig dig-' + d.key : '') +
          (keys.indexOf(division) >= 0 ? ' varga-key' : ''),
          d ? (brief ? Astro.VARGA_DIGNITY_SHORT[d.key] : d.label) : '\u2013');
        if (detail) { sign.title = detail; dignity.title = detail; }
        /*
         * A star on a debilitation the chart cancels. It rides the word rather
         * than replacing it: the graha is still debilitated by sign, which is
         * what the column reports, and the cancellation is a separate fact about
         * the chart around it.
         */
        if (d && d.key === 'debilitated' && cancelled[division] &&
            cancelled[division][planet.name]) {
          dignity.appendChild(el('sup', 'neecha-bhanga', '*'));
          dignity.title = (detail ? detail + ' ' : '') + planet.name +
            '\u2019s debilitation in D' + division + ' is cancelled and the graha stands in ' +
            'an angle or a trine, which is neecha bhanga raja yoga, so the score below is ' +
            'the floor for a graha that is not weak. Vimsopaka counts dignity one division ' +
            'at a time and cannot see the cancellation; the Yogas tab reads it in full.';
        }
        signRow.appendChild(sign);
        dignityRow.appendChild(dignity);
      });

      /*
       * The total belongs to the graha, not to either of its rows, so it spans
       * both the way the name does, and it closes the row the way its heading
       * closes the head.
       */
      var score = Astro.vimsopaka(planet.name, planet.longitude, scheme, positionsD1);
      var td = el('td', 'vimsopaka' + (score ? ' vimsopaka-' + score.band.key : ''),
        score ? score.total.toFixed(2) : '\u2013');
      td.setAttribute('rowspan', '2');
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
      signRow.appendChild(td);

      tbody.appendChild(signRow);
      tbody.appendChild(dignityRow);
    });

    /*
     * Ordered as the table is actually read: what it shows, how to read it, what
     * the readings are worth, then the two places the ordinary rule does not
     * reach, then who is missing.
     *
     * The scoring had been stated as seven names against six figures. Those six
     * are varga viswa, from verses 21-25, and their top category is an own sign -
     * moolatrikona is not among them - so the two scales are now named apart
     * rather than welded into one sentence that leaves a name without a number.
     */
    document.getElementById('vargas-note').textContent = vargaNote(scheme, brief);
    renderVargaCharts(state, scheme);
  }

  /* ------------------------------------------------- varga charts */

  var GOOD_KEYS = ['exalted', 'moolatrikona', 'own', 'adhimitra', 'mitra'];

  /**
   * The three numbers each graha earns over a scheme.
   *
   * Vimsopaka is a score out of twenty. The other two are counts of divisions,
   * so they share a unit and a denominator with each other and with nothing
   * else, which is why they are plotted together and the score is plotted apart.
   */
  function vargaSummary(state, scheme) {
    var positionsD1 = {};
    state.chart.planets.forEach(function (p) { positionsD1[p.name] = p; });

    return state.chart.planets.map(function (planet) {
      var score = Astro.vimsopaka(planet.name, planet.longitude, scheme, positionsD1);
      if (!score) return null;                     // the nodes keep no friendships
      var rashi = Astro.signOf(planet.longitude);
      var good = 0, repeats = 0;
      scheme.divisions.forEach(function (division) {
        var d = Astro.vargaDignity(planet.name, planet.longitude, division, positionsD1);
        if (!d) return;
        if (GOOD_KEYS.indexOf(d.key) >= 0) good++;
        if (division !== 1 && d.sign === rashi) repeats++;
      });
      return { graha: planet.name, vimsopaka: score.total, band: score.band,
               good: good, vargottama: repeats };
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
    var W = 500, H = 215, left = 28, right = 8, top = 18, bottom = 34;
    var plotW = W - left - right, plotH = H - top - bottom;
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, class: 'varga-chart',
                             role: 'img', 'aria-label': opts.title });

    var ticks = 4, step = opts.max / ticks;
    for (var t = 0; t <= ticks; t++) {
      var value = t * step;
      var y = top + plotH - (value / opts.max) * plotH;
      svg.appendChild(svgEl('line', { x1: left, y1: y, x2: W - right, y2: y,
                                      class: t === 0 ? 'chart-base' : 'chart-grid' }));
      svg.appendChild(svgEl('text', { x: left - 6, y: y + 3.5, class: 'chart-tick',
                                      'text-anchor': 'end' }, String(Math.round(value))));
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
        var g = svgEl('g', { class: 'chart-bar ' + s.cls });
        if (h > 0) {
          g.appendChild(svgEl('rect', { x: x, y: y, width: barW, height: h,
                                        rx: Math.min(4, barW / 2) }));
          if (h > 4) {
            g.appendChild(svgEl('rect', { x: x, y: top + plotH - Math.min(4, h),
                                          width: barW, height: Math.min(4, h) }));
          }
        }
        g.appendChild(svgEl('title', {}, row.graha + ' — ' + s.label + ': ' +
          s.readout(row) + (opts.outOf ? ' of ' + opts.outOf : '')));
        svg.appendChild(g);

        // Values wear text tokens, never the series colour; the bar carries identity.
        svg.appendChild(svgEl('text', { x: x + barW / 2, y: y - 5, class: 'chart-value',
                                        'text-anchor': 'middle' }, s.readout(row)));
      });

      svg.appendChild(svgEl('text', { x: left + band * i + band / 2, y: H - 12,
                                      class: 'chart-name', 'text-anchor': 'middle' },
                            Astro.grahaAbbr(row.graha)));
    });

    var figure = el('figure', 'varga-figure');
    figure.appendChild(el('figcaption', 'chart-title', opts.title));
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

  function renderVargaCharts(state, scheme) {
    var host = document.getElementById('vargas-charts');
    host.innerHTML = '';
    var rows = vargaSummary(state, scheme);
    if (!rows.length) return;

    // A score out of twenty. One series, so the title names it and no legend is drawn.
    host.appendChild(barChart({
      title: 'Vimsopaka bala',
      rows: rows, max: 20, outOf: 20,
      series: [{ label: 'Vimsopaka', cls: 'series-vimsopaka',
                 value: function (r) { return r.vimsopaka; },
                 readout: function (r) { return r.vimsopaka.toFixed(1); } }],
      note: 'Out of twenty, and the floor is five rather than nothing: a graha in a great ' +
        'enemy’s sign in every division still scores five. Strength, not benefit.'
    }));

    /*
     * Two counts of divisions. Same unit and same denominator, so they share an
     * axis, and the title says what is being counted and out of how many rather
     * than naming either count: the legend does that.
     */
    host.appendChild(barChart({
      title: 'Placement counts across the ' + scheme.count + ' divisions',
      rows: rows, max: scheme.count, outOf: scheme.count,
      series: [
        { label: 'Well placed', cls: 'series-good',
          value: function (r) { return r.good; },
          readout: function (r) { return String(r.good); } },
        /*
         * The name it is called by everywhere else here: [V] in the chart, in
         * the graha table and in the grid, and Vargottama in the flag key.
         * Describing it instead left the reader to work out that the purple bar
         * and the purple flag were the same fact. The strict reading, that the
         * word is the D9 case and that D1 is excluded, is in the flag key at the
         * top of the tab, which is where all four flags are defined.
         */
        { label: 'Vargottama', cls: 'series-vargottama',
          value: function (r) { return r.vargottama; },
          readout: function (r) { return String(r.vargottama); } }
      ],
      note: 'Well placed counts exaltation, moolatrikona, own sign and a friend’s or ' +
        'great friend’s sign, and nothing below. Vargottama counts the divisions that ' +
        'land the graha back in its rashi sign.'
    }));
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
        'Raja yoga, parivartana, neecha bhanga, vipareeta raja, Lakshmi, Gaja ' +
        'Kesari and the five Mahapurusha yogas are checked so far; the Lesson tab ' +
        'explains each.';
      return;
    }
    note.textContent = 'Raja yoga, parivartana, neecha bhanga, vipareeta raja, Lakshmi, ' +
      'Gaja Kesari and the five Mahapurusha yogas are checked so far; more will follow. An angle-trine raja yoga ' +
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
   * Two charts ship with the app, so the saved list is not empty before anyone
   * has typed a birth time in. Both are picked for being checkable rather than
   * for being famous. Donald Trump's time is on a public birth certificate, so
   * the chart can be reproduced in any other ephemeris, and its Jupiter
   * mahadasha begins in November 2016, on a date every reader already knows.
   * Kareem Abdul-Jabbar's is the other kind of example: a time given from
   * memory rather than from a record, on a date that falls in the gap before
   * daylight saving began that year, which is where the reading of a clock time
   * decides the ascendant.
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
    trueNode: false,
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
    trueNode: false,
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

  var sections = setupTabs(['saved', 'add', 'chart', 'lesson'],
    document.querySelector('.tabs:not(.subtabs)'), { scrollToTop: true, onChange: function (name) {
      if (name === 'lesson') loadLessons();
    } });

  /*
   * The two graha tables share one strip, labelled from whichever divisions the
   * charts are set to. Fixed D1/D9 labels would have lied the moment either
   * select moved.
   */
  var tableTabs = setupTabs(['grahas', 'shadbala', 'vargas', 'yogas', 'aspects'],
    document.querySelector('.tabs.subtabs'));

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
