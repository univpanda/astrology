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
    var heading = document.getElementById('result-name');
    heading.textContent = state.name;
    if (state.celebrity) heading.appendChild(el('span', 'celebrity-mark', 'public figure'));

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
      ref.addEventListener('change', function () { if (lastChart) drawSlot(slot); });
      /*
       * Changing the division redraws the yogas and the aspects too, both being
       * read from whatever is on screen. Rotation does not: which graha house 1
       * is counted from changes the picture, not the division being read.
       */
      varga.addEventListener('change', function () { if (lastChart) drawSlot(slot); });
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
   * The graha that rules the sign this one sits in, and how the two stand.
   *
   * The relation is the compound one - natural and temporal together - which is
   * what is actually read. Temporal friendship is counted in the rashi chart
   * even when the sign being judged belongs to a division, which is where the
   * classical rule puts it.
   */
  function dispositorOf(graha, sign, positionsD1) {
    var lord = Astro.SIGN_LORDS[sign];
    if (lord === graha) return 'itself';
    if (!positionsD1[lord] || !positionsD1[graha]) return lord;
    var relation = Astro.compoundRelation(graha, lord,
      ((positionsD1[lord].sign - positionsD1[graha].sign) % 12 + 12) % 12 + 1);
    // The nodes rule nothing and have no place in the friendship table.
    return relation ? lord + ' \u00b7 ' + Astro.RELATION_LABELS[relation] : lord;
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
  function renderSlotTable(slot, c, set) {
    var tbody = document.querySelector('#table-' + slot + ' tbody');
    tbody.innerHTML = '';

    var positionOf = function (longitude) { return Astro.vargaPosition(longitude, set.division); };

    var positionsD1 = {};
    c.planets.forEach(function (p) { positionsD1[p.name] = p; });
    // Combustion is the real distance from the Sun, so it is read off the rashi
    // longitudes whatever division the table is showing.
    var sun = positionsD1.Sun;

    var rows = [{ name: 'Ascendant', longitude: c.ascendant.longitude, isAscendant: true }]
      .concat(c.planets.map(function (p) {
        return { name: p.name, longitude: p.longitude, retrograde: p.retrograde };
      }));

    /*
     * House 1 is whatever the chart beside this table is rotated onto, worked out
     * in the division on show so the two always agree. Counting from the
     * ascendant while the chart is rotated onto the Moon would put every number
     * in this column at odds with the picture above it.
     */
    var firstSign = positionOf(c.ascendant.longitude).sign;
    if (set.reference && set.reference !== 'Ascendant') {
      var anchor = c.planets.filter(function (p) { return p.name === set.reference; })[0];
      if (anchor) firstSign = positionOf(anchor.longitude).sign;
    }
    /*
     * Yogakaraka is lordship counted from house 1, so it moves with the rotation
     * exactly as the House column does: the two are the same question asked
     * twice. The lagna is a point and owns nothing, so it is never one.
     */

    rows.forEach(function (r) {
      var v = positionOf(r.longitude);
      var nak = Astro.nakshatraOf(v.longitude);
      var tr = document.createElement('tr');
      if (r.isAscendant) tr.className = 'ascendant-row';

      /*
       * Cells are named rather than positional. They were indexed until this
       * column was added, and inserting one in the middle silently moved the
       * titles onto the wrong cells.
       *
       * What a graha is comes before where it is: sign, dignity and dispositor
       * first, then the position that produced them.
       */
      [{ text: r.name, header: true,
         flags: [
           r.retrograde ? 'R' : null,
           // This division has landed it back in its rashi sign. Never on D1,
           // where every graha qualifies and the mark says nothing.
           set.division !== 1 && v.sign === Astro.signOf(r.longitude) ? 'V' : null,
           !r.isAscendant && Astro.isYogakaraka(r.name, firstSign) ? 'Y' : null,
           !r.isAscendant && sun && Astro.isCombust(r.name, r.longitude, sun.longitude,
             r.retrograde) ? 'C' : null
         ].filter(Boolean) },
       { text: Astro.SIGNS[v.sign] },
       { text: (r.isAscendant ? '' : Astro.dignityOf(r.name, v.sign, v.degreeInSign)) || '\u2013' },
       { text: String(((v.sign - firstSign) % 12 + 12) % 12 + 1), cls: 'numeric',
         title: 'Whole sign house, counted from ' +
           (set.reference === 'Ascendant' ? 'the ascendant' : set.reference) + ' in ' +
           (Astro.VARGAS.filter(function (x) { return x.division === set.division; })[0] || {}).name +
           ', as the chart beside this table is.' },
       { text: r.isAscendant ? Astro.SIGN_LORDS[v.sign] : dispositorOf(r.name, v.sign, positionsD1),
         cls: 'dispositor',
         title: r.isAscendant ? null : dispositorDetail(r.name, v.sign, positionsD1) },
       { text: dms(v.degreeInSign), cls: 'longitude',
         title: 'Longitude ' + v.longitude.toFixed(4) + '\u00b0' },
       { text: nak.name },
       { text: String(nak.pada), cls: 'numeric' },
       { text: nak.lord + ' / ' + nak.subLord }
      ].forEach(function (cell) {
        var td = el(cell.header ? 'th' : 'td', cell.cls, cell.text);
        if (cell.header) td.setAttribute('scope', 'row');
        /*
         * The same three flags the chart writes, in the same order: [R][V][Y].
         * Spans rather than text, so each can be coloured without the name
         * taking the colour, and so retrogression keeps its red while the other
         * two stay quiet.
         */
        if (cell.flags) {
          cell.flags.forEach(function (f, i) {
            td.appendChild(el('span', 'flag flag-' + f.toLowerCase(),
              (i === 0 ? ' ' : '') + '[' + f + ']'));
          });
        }
        if (cell.title) td.title = cell.title;
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
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

    scheme.divisions.forEach(function (division) {
      var weight = scheme.weights[division];
      var th = el('th', null, 'D' + division);
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

    var total = el('th', null, 'Vimsopaka');
    total.setAttribute('scope', 'col');
    total.appendChild(el('span', 'varga-weight', '/ 20'));
    total.title = 'Verses 26-27: each division\u2019s share of the twenty, scaled by what the ' +
      'graha keeps of it. Own sign throughout gives the full twenty; a great enemy throughout ' +
      'gives five, which is the floor rather than nothing.';
    row.appendChild(total);
  }

  /*
   * The note describes whichever scheme is showing, its own share-out of the
   * twenty included. Writing one scheme's figures into the prose would be wrong
   * for the other three the moment the select moved.
   */
  function vargaNote(scheme, brief) {
    var shares = scheme.divisions.map(function (d) {
      return 'D' + d + ' ' + vimsopakaFigure(scheme.weights[d]);
    }).join(', ');
    var others = Astro.VARGA_SCHEME_ORDER.filter(function (k) { return k !== scheme.key; })
      .map(function (k) { return Astro.VARGA_SCHEMES[k].label; });

    return 'Where each graha stands in the ' + scheme.count + ' divisions of the ' +
      scheme.label + ', judged against the lord of the sign each one gives. Every graha ' +
      'takes two rows: the sign' +
      (brief ? ', numbered 1 to 12 from Aries as the chart above numbers its ' : ', ') +
      (brief
        ? 'boxes, then its dignity there. Sixteen columns leave no room for the words, so ' +
          'signs go as numbers and dignities shorten to Exal, Mool, Own, Gt Fr, Fr, Neut, ' +
          'Enm, Gt Enm and Deb; hover a cell for the words themselves, and for the lord. '
        : 'then its dignity there. Hover a cell for the sign\u2019s lord and the reading ' +
          'behind it. ') +
      'A sign marked [V] is one the division has landed the graha back in, the same sign it ' +
      'holds in the rashi; in D9 that is vargottama proper, and D1 is left unmarked because ' +
      'every cell in it would qualify. ' +
      'Parashara prices dignity as varga viswa, out of twenty: own sign 20, great friend 18, ' +
      'friend 15, neutral 10, enemy 7, great enemy 5. Moolatrikona he does not rank apart ' +
      'from an own sign, and exaltation falls outside the six entirely, uchcha bala measuring ' +
      'that; both appear here regardless, as does debilitation. The figure under each heading ' +
      'is that division\u2019s share of the twenty in this scheme \u2014 ' + shares +
      ', from ' + scheme.source + '. The ' + others.join(', ') + ' share them out ' +
      'differently, which is the usual reason a vimsopaka total will not reconcile; hover a ' +
      'heading for its figure in each. The last column totals them, verses 26-27: ' +
      'each share scaled by what the graha keeps of it, own sign counting the full twenty and ' +
      'a great enemy five. Parashara reads below 5 as incapable of auspicious results, 5 to 10 ' +
      'as some good, up to 15 as mediocre and above 15 as wholly favourable. Read those as ' +
      'strength and not as benefit: the total says how fully a graha acts in its own nature, ' +
      'not whether that is wanted. A strong malefic aspecting a house it does not rule ' +
      'afflicts it the more surely for being strong. It measures magnitude rather than ' +
      'direction, which is what makes it worth computing for a yoga already present: the yoga ' +
      'says what is promised and this says how much of it the graha can carry. It is also not ' +
      'the whole of strength: counting dignity division by division, it cannot see vargottama, ' +
      'an exchange of signs, a cancelled debilitation or directional strength, which the ' +
      'chart, the Yogas tab and Shadbala carry instead. A cancelled debilitation is the worst ' +
      'of those, the total sitting near its floor exactly where the cancellation says it ' +
      'should not. No luminary ' +
      'rules a trimsamsa, so in D30 the Sun ' +
      'stands in as Mars and the Moon as Venus. Rahu and Ketu own no sign and keep no ' +
      'friendships, so they are left out.';
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

  function renderVargas(state) {
    var scheme = currentScheme();
    var brief = scheme.divisions.length > ABBREVIATE_ABOVE;
    var table = document.getElementById('vargas-table');
    renderVargasHead(table, scheme);
    var tbody = table.querySelector('tbody');
    tbody.innerHTML = '';

    var positionsD1 = {};
    state.chart.planets.forEach(function (p) { positionsD1[p.name] = p; });

    // Listed as in the graha tables, for reading across from one to the other.
    state.chart.planets.forEach(function (planet) {
      var cells = scheme.divisions.map(function (division) {
        return Astro.vargaDignity(planet.name, planet.longitude, division, positionsD1);
      });
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
      var th = el('th', null, planet.name);
      th.setAttribute('scope', 'rowgroup');
      th.setAttribute('rowspan', '2');
      signRow.appendChild(th);

      var dignityRow = document.createElement('tr');
      dignityRow.className = 'varga-dignities';

      cells.forEach(function (d, i) {
        var division = scheme.divisions[i];
        var detail = d ? vargasDetail(d, division, planet.name) : null;
        /*
         * Where a name will not fit, the sign goes as its number - 1 for Aries
         * through 12 for Pisces, which is how the chart above already labels its
         * boxes, so it is a number the reader already uses rather than an
         * abbreviation invented for this table. Both words stay in the title
         * either way.
         */
        var sign = el('td', 'varga-sign' + (brief ? ' varga-sign-number' : ''),
          d ? (brief ? String(d.sign + 1) : Astro.SIGNS[d.sign]) : '\u2013');

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
        var dignity = el('td', d ? 'dig dig-' + d.key : null,
          d ? (brief ? Astro.VARGA_DIGNITY_SHORT[d.key] : d.label) : '\u2013');
        if (detail) { sign.title = detail; dignity.title = detail; }
        signRow.appendChild(sign);
        dignityRow.appendChild(dignity);
      });

      /*
       * The total belongs to the graha, not to either of its rows, so it spans
       * both the way the name does.
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
  var SEED_KEY = 'jyotisha.seeded.v1';
  var KUNDALI_API = 'https://deiefjnwbfcywsaaqqbs.supabase.co/functions/v1/kundalis';
  var savedList = document.getElementById('saved-list');
  var savedEmpty = document.getElementById('saved-empty');
  var savedNote = document.getElementById('saved-note');
  var saveFeedback = document.getElementById('save-feedback');
  var addButton = document.getElementById('add-kundali');
  var editButton = document.getElementById('edit-button');

  /*
   * One chart ships with the app, so the saved list is not empty before anyone
   * has typed a birth time in. Donald Trump's is the useful example to start
   * from: the time is on a public birth certificate, which makes the chart
   * checkable against any other ephemeris, and its Jupiter mahadasha begins in
   * November 2016, on a date every reader already knows.
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
      'print 9:51 am from Lois Rodden, and that one rises at 17 Leo rather than 29, ' +
      'so the houses move even though the grahas barely do. Leo ascendant in Magha, ' +
      'Moon debilitated in Scorpio with Ketu on a full moon, Sun with Rahu in Taurus, ' +
      'and Jupiter dasha from November 2016.'
  }];

  /*
   * Seeding is recorded under its own key rather than inferred from the list
   * being empty. Deleting the chart has to stick, and having it reappear on the
   * next visit would read as a bug rather than as a starting point.
   */
  function seedStudyCharts() {
    try {
      if (window.localStorage.getItem(SEED_KEY)) return;
    } catch (e) {
      return; // no storage: nothing to seed into, and no way to remember doing it
    }
    var list = readSaved();
    var known = {};
    list.forEach(function (entry) { known[keyOf(entry)] = true; });
    STUDY_CHARTS.forEach(function (entry) {
      // Appended, not prepended: a saved chart of one's own outranks the example.
      if (!known[keyOf(entry)]) list.push(entry);
    });
    if (writeSaved(list)) {
      try { window.localStorage.setItem(SEED_KEY, '1'); } catch (e) {}
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
      if (entry.celebrity) savedName.appendChild(el('span', 'celebrity-mark', 'study'));
      open.appendChild(savedName);
      open.appendChild(el('span', 'saved-meta', entry.placeLabel));
      open.appendChild(el('span', 'saved-meta', formatSavedMoment(entry)));
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
  var tableTabs = setupTabs(['table-a', 'table-b', 'shadbala', 'vargas', 'yogas', 'aspects'],
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
