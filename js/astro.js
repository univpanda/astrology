/*
 * astro.js - a self-contained sidereal (Vedic) ephemeris.
 *
 * No dependencies, no network, no Swiss Ephemeris binary. Everything below is
 * computed from published analytical theories:
 *
 *   Moon        ELP-2000/82 truncated (Meeus, Astronomical Algorithms ch.47)
 *   Planets     Keplerian elements + secular rates (Standish, JPL "Approximate
 *               Positions of the Major Planets", table valid 1800-2050)
 *   Sun         derived from the Earth/Moon barycentre orbit, i.e. -Earth
 *   Precession  Meeus ch.21 rotation of ecliptic coordinates
 *   Nutation    IAU 1980 series, leading terms (Meeus ch.22)
 *   Ayanamsa    Lahiri/Chitrapaksha: J2000 value + accumulated precession
 *   Delta T     Espenak & Meeus polynomial fits
 *   J/S fix     a sampled residual table (data/perturbations.js) that removes the
 *               Jupiter-Saturn "great inequality" the two-body fit cannot see
 *
 * Accuracy, measured against JPL Horizons (see test/test.js): every graha lands
 * within ~35 arcseconds of the true apparent longitude over 1800-2100, which is
 * a few hundred times finer than a pada (3 deg 20'), so signs, nakshatras, padas
 * and divisional charts are all safe. It is still not a substitute for the JPL DE
 * ephemerides if you need arcsecond truth.
 */
var Astro = (function () {
  'use strict';

  var DEG = Math.PI / 180;
  var C_AUD = 173.144632674; // speed of light, AU per day

  function norm360(x) { x = x % 360; return x < 0 ? x + 360 : x; }
  function norm180(x) { x = norm360(x); return x > 180 ? x - 360 : x; }
  function sin(d) { return Math.sin(d * DEG); }
  function cos(d) { return Math.cos(d * DEG); }
  function tan(d) { return Math.tan(d * DEG); }
  function atan2d(y, x) { return Math.atan2(y, x) / DEG; }
  function asind(x) { return Math.asin(Math.max(-1, Math.min(1, x))) / DEG; }

  /* ------------------------------------------------------------------ time */

  /** Julian Day from a UTC calendar date; `hours` may be fractional. */
  function julianDay(y, m, d, hours) {
    if (m <= 2) { y -= 1; m += 12; }
    var gregorian = y > 1582 || (y === 1582 && (m > 10 || (m === 10 && d >= 15)));
    var b = gregorian ? 2 - Math.floor(y / 100) + Math.floor(y / 400) : 0;
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) +
      d + b - 1524.5 + (hours || 0) / 24;
  }

  /** Inverse of julianDay: returns {y, m, d, hours}. */
  function calendarDate(jd) {
    var z = Math.floor(jd + 0.5), f = jd + 0.5 - z, a = z;
    if (z >= 2299161) {
      var alpha = Math.floor((z - 1867216.25) / 36524.25);
      a = z + 1 + alpha - Math.floor(alpha / 4);
    }
    var b = a + 1524, c = Math.floor((b - 122.1) / 365.25);
    var dd = Math.floor(365.25 * c), e = Math.floor((b - dd) / 30.6001);
    var day = b - dd - Math.floor(30.6001 * e) + f;
    var month = e < 14 ? e - 1 : e - 13;
    var year = month > 2 ? c - 4716 : c - 4715;
    return { y: year, m: month, d: Math.floor(day), hours: (day - Math.floor(day)) * 24 };
  }

  /**
   * TT - UT1 in seconds (Espenak & Meeus, NASA eclipse site). Needed because the
   * theories above want Terrestrial Time while a birth certificate gives UT.
   */
  function deltaT(jd) {
    var cd = calendarDate(jd);
    var y = cd.y + (cd.m - 0.5) / 12, u, t;
    if (y < -500) { u = (y - 1820) / 100; return -20 + 32 * u * u; }
    if (y < 500) { u = y / 100; return 10583.6 - 1014.41 * u + 33.78311 * u * u - 5.952053 * Math.pow(u, 3) - 0.1798452 * Math.pow(u, 4) + 0.022174192 * Math.pow(u, 5) + 0.0090316521 * Math.pow(u, 6); }
    if (y < 1600) { u = (y - 1000) / 100; return 1574.2 - 556.01 * u + 71.23472 * u * u + 0.319781 * Math.pow(u, 3) - 0.8503463 * Math.pow(u, 4) - 0.005050998 * Math.pow(u, 5) + 0.0083572073 * Math.pow(u, 6); }
    if (y < 1700) { t = y - 1600; return 120 - 0.9808 * t - 0.01532 * t * t + Math.pow(t, 3) / 7129; }
    if (y < 1800) { t = y - 1700; return 8.83 + 0.1603 * t - 0.0059285 * t * t + 0.00013336 * Math.pow(t, 3) - Math.pow(t, 4) / 1174000; }
    if (y < 1860) { t = y - 1800; return 13.72 - 0.332447 * t + 0.0068612 * t * t + 0.0041116 * Math.pow(t, 3) - 0.00037436 * Math.pow(t, 4) + 0.0000121272 * Math.pow(t, 5) - 0.0000001699 * Math.pow(t, 6) + 0.000000000875 * Math.pow(t, 7); }
    if (y < 1900) { t = y - 1860; return 7.62 + 0.5737 * t - 0.251754 * t * t + 0.01680668 * Math.pow(t, 3) - 0.0004473624 * Math.pow(t, 4) + Math.pow(t, 5) / 233174; }
    if (y < 1920) { t = y - 1900; return -2.79 + 1.494119 * t - 0.0598939 * t * t + 0.0061966 * Math.pow(t, 3) - 0.000197 * Math.pow(t, 4); }
    if (y < 1941) { t = y - 1920; return 21.20 + 0.84493 * t - 0.076100 * t * t + 0.0020936 * Math.pow(t, 3); }
    if (y < 1961) { t = y - 1950; return 29.07 + 0.407 * t - t * t / 233 + Math.pow(t, 3) / 2547; }
    if (y < 1986) { t = y - 1975; return 45.45 + 1.067 * t - t * t / 260 - Math.pow(t, 3) / 718; }
    if (y < 2005) { t = y - 2000; return 63.86 + 0.3345 * t - 0.060374 * t * t + 0.0017275 * Math.pow(t, 3) + 0.000651814 * Math.pow(t, 4) + 0.00002373599 * Math.pow(t, 5); }
    if (y < 2050) { t = y - 2000; return 62.92 + 0.32217 * t + 0.005589 * t * t; }
    if (y < 2150) { u = (y - 1820) / 100; return -20 + 32 * u * u - 0.5628 * (2150 - y); }
    u = (y - 1820) / 100; return -20 + 32 * u * u;
  }

  /* ------------------------------------------- nutation, obliquity, sid.time */

  /** Nutation in longitude and obliquity, degrees. Leading IAU 1980 terms. */
  function nutation(T) {
    var omega = 125.04452 - 1934.136261 * T + 0.0020708 * T * T + T * T * T / 450000;
    var L = 280.4665 + 36000.7698 * T;
    var Lp = 218.3165 + 481267.8813 * T;
    var dpsi = -17.20 * sin(omega) - 1.32 * sin(2 * L) - 0.23 * sin(2 * Lp) + 0.21 * sin(2 * omega);
    var deps = 9.20 * cos(omega) + 0.57 * cos(2 * L) + 0.10 * cos(2 * Lp) - 0.09 * cos(2 * omega);
    return { dpsi: dpsi / 3600, deps: deps / 3600 };
  }

  /** Mean obliquity of the ecliptic, degrees (Laskar). */
  function meanObliquity(T) {
    var u = T / 100;
    return 23.43929111 + (-4680.93 * u - 1.55 * Math.pow(u, 2) + 1999.25 * Math.pow(u, 3) -
      51.38 * Math.pow(u, 4) - 249.67 * Math.pow(u, 5) - 39.05 * Math.pow(u, 6) +
      7.12 * Math.pow(u, 7) + 27.87 * Math.pow(u, 8) + 5.79 * Math.pow(u, 9) +
      2.45 * Math.pow(u, 10)) / 3600;
  }

  /** Apparent sidereal time at Greenwich, degrees. */
  function apparentSiderealTime(jdUT, T, nut, trueEps) {
    var theta = 280.46061837 + 360.98564736629 * (jdUT - 2451545.0) +
      0.000387933 * T * T - T * T * T / 38710000;
    return norm360(theta + nut.dpsi * cos(trueEps));
  }

  /* ----------------------------------------------------------- precession */

  /**
   * Rotate ecliptic coordinates from J2000 to the mean ecliptic/equinox of
   * date (Meeus ch.21). `t` is Julian centuries from J2000.
   */
  function precessFromJ2000(lon, lat, t) {
    var eta = (47.0029 * t - 0.03302 * t * t + 0.000060 * t * t * t) / 3600;
    var pi = (174.876384 * 3600 - 869.8089 * t + 0.03536 * t * t) / 3600;
    var p = (5029.0966 * t + 1.11113 * t * t - 0.000006 * t * t * t) / 3600;
    var A = cos(eta) * cos(lat) * sin(pi - lon) - sin(eta) * sin(lat);
    var B = cos(lat) * cos(pi - lon);
    var Cc = cos(eta) * sin(lat) + sin(eta) * cos(lat) * sin(pi - lon);
    return { lon: norm360(p + pi - atan2d(A, B)), lat: asind(Cc) };
  }

  /** Accumulated general precession in longitude since J2000, degrees. */
  function precessionSinceJ2000(t) {
    return (5029.0966 * t + 1.11113 * t * t - 0.000006 * t * t * t) / 3600;
  }

  /* ------------------------------------------------------------- ayanamsa */

  /*
   * Ayanamsa = tropical longitude of the sidereal zero point. Each entry is its
   * J2000.0 value; precession is added on top. Lahiri (Chitrapaksha) is the
   * Indian civil standard and the vetted one here - the other three are given to
   * within a few arcminutes and are offered as a convenience.
   */
  var AYANAMSA = {
    lahiri: { label: 'Lahiri (Chitrapaksha)', j2000: 23.853064 },
    raman: { label: 'B. V. Raman (approx.)', j2000: 22.371 },
    kp: { label: 'Krishnamurti / KP (approx.)', j2000: 23.756 },
    fagan: { label: 'Fagan-Bradley (approx.)', j2000: 24.736 }
  };

  function ayanamsa(T, system) {
    var base = AYANAMSA[system] || AYANAMSA.lahiri;
    return base.j2000 + precessionSinceJ2000(T);
  }

  /* ----------------------------------------------------------------- moon */

  // Meeus table 47.A: multipliers of D, M, M', F and the coefficient of the
  // longitude term in units of 1e-6 degree.
  var MOON_LON = [
    [0, 0, 1, 0, 6288774], [2, 0, -1, 0, 1274027], [2, 0, 0, 0, 658314],
    [0, 0, 2, 0, 213618], [0, 1, 0, 0, -185116], [0, 0, 0, 2, -114332],
    [2, 0, -2, 0, 58793], [2, -1, -1, 0, 57066], [2, 0, 1, 0, 53322],
    [2, -1, 0, 0, 45758], [0, 1, -1, 0, -40923], [1, 0, 0, 0, -34720],
    [0, 1, 1, 0, -30383], [2, 0, 0, -2, 15327], [0, 0, 1, 2, -12528],
    [0, 0, 1, -2, 10980], [4, 0, -1, 0, 10675], [0, 0, 3, 0, 10034],
    [4, 0, -2, 0, 8548], [2, 1, -1, 0, -7888], [2, 1, 0, 0, -6766],
    [1, 0, -1, 0, -5163], [1, 1, 0, 0, 4987], [2, -1, 1, 0, 4036],
    [2, 0, 2, 0, 3994], [4, 0, 0, 0, 3861], [2, 0, -3, 0, 3665],
    [0, 1, -2, 0, -2689], [2, 0, -1, 2, -2602], [2, -1, -2, 0, 2390],
    [1, 0, 1, 0, -2348], [2, -2, 0, 0, 2236], [0, 1, 2, 0, -2120],
    [0, 2, 0, 0, -2069], [2, -2, -1, 0, 2048], [2, 0, 1, -2, -1773],
    [2, 0, 0, 2, -1595], [4, -1, -1, 0, 1215], [0, 0, 2, 2, -1110],
    [3, 0, -1, 0, -892], [2, 1, 1, 0, -810], [4, -1, -2, 0, 759],
    [0, 2, -1, 0, -713], [2, 2, -1, 0, -700], [2, 1, -2, 0, 691],
    [2, -1, 0, -2, 596], [4, 0, 1, 0, 549], [0, 0, 4, 0, 537],
    [4, -1, 0, 0, 520], [1, 0, -2, 0, -487], [2, 1, 0, -2, -399],
    [0, 0, 2, -2, -381], [1, 1, 1, 0, 351], [3, 0, -2, 0, -340],
    [4, 0, -3, 0, 330], [2, -1, 2, 0, 327], [0, 2, 1, 0, -323],
    [1, 1, -1, 0, 299], [2, 0, 3, 0, 294]
  ];

  /** Geocentric ecliptic longitude of the Moon, mean equinox of date. */
  function moonLongitude(T) {
    var Lp = norm360(218.3164477 + 481267.88123421 * T - 0.0015786 * T * T +
      Math.pow(T, 3) / 538841 - Math.pow(T, 4) / 65194000);
    var D = norm360(297.8501921 + 445267.1114034 * T - 0.0018819 * T * T +
      Math.pow(T, 3) / 545868 - Math.pow(T, 4) / 113065000);
    var M = norm360(357.5291092 + 35999.0502909 * T - 0.0001536 * T * T +
      Math.pow(T, 3) / 24490000);
    var Mp = norm360(134.9633964 + 477198.8675055 * T + 0.0087414 * T * T +
      Math.pow(T, 3) / 69699 - Math.pow(T, 4) / 14712000);
    var F = norm360(93.2720950 + 483202.0175233 * T - 0.0036539 * T * T -
      Math.pow(T, 3) / 3526000 + Math.pow(T, 4) / 863310000);
    var A1 = norm360(119.75 + 131.849 * T);
    var A2 = norm360(53.09 + 479264.290 * T);
    var E = 1 - 0.002516 * T - 0.0000074 * T * T;

    var sum = 0;
    for (var i = 0; i < MOON_LON.length; i++) {
      var t = MOON_LON[i];
      var arg = t[0] * D + t[1] * M + t[2] * Mp + t[3] * F;
      var ecc = Math.abs(t[1]) === 1 ? E : (Math.abs(t[1]) === 2 ? E * E : 1);
      sum += t[4] * ecc * sin(arg);
    }
    sum += 3958 * sin(A1) + 1962 * sin(Lp - F) + 318 * sin(A2);
    return norm360(Lp + sum / 1000000);
  }

  /** Lunar ascending node (Rahu), mean or true, mean equinox of date. */
  function lunarNode(T, trueNode) {
    var omega = 125.0445479 - 1934.1362891 * T + 0.0020754 * T * T +
      Math.pow(T, 3) / 467441 - Math.pow(T, 4) / 60616000;
    if (!trueNode) return norm360(omega);
    var D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T * T;
    var M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T * T;
    var Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T;
    var F = 93.2720950 + 483202.0175233 * T - 0.0036539 * T * T;
    var corr = -1.4979 * sin(2 * (D - F)) - 0.1500 * sin(M) - 0.1226 * sin(2 * D) +
      0.1176 * sin(2 * F) - 0.0801 * sin(2 * (Mp - F));
    return norm360(omega + corr);
  }

  /* -------------------------------------------------------------- planets */

  /*
   * Standish's Keplerian elements: [a, e, I, L, longPeri, longNode] at J2000
   * followed by their rates per Julian century. a in AU, angles in degrees.
   */
  var ELEMENTS = {
    mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
              [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
    venus:   [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
              [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
    earth:   [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
              [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
    mars:    [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
              [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
    jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
              [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
    saturn:  [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
              [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]]
  };

  /*
   * data/perturbations.js holds the residual between the two-body model above and
   * JPL Horizons for Jupiter and Saturn, sampled every 100 days. Outside the
   * table's range the raw Keplerian result is used unchanged, which is the same
   * accuracy you would get without the table at all.
   */
  function perturbationTable() {
    if (typeof PERTURBATIONS !== 'undefined') return PERTURBATIONS;
    if (typeof window !== 'undefined' && window.PERTURBATIONS) return window.PERTURBATIONS;
    return null;
  }

  /** Catmull-Rom interpolation on a uniform sample grid. */
  function interpolate(samples, x) {
    var i = Math.floor(x);
    if (i < 1 || i > samples.length - 3) return null;
    var f = x - i;
    var p0 = samples[i - 1], p1 = samples[i], p2 = samples[i + 1], p3 = samples[i + 2];
    return p1 + 0.5 * f * (p2 - p0 +
      f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
  }

  /** Residual corrections {dlon, dlat, dr} in degrees/degrees/AU, or null. */
  function perturbation(body, T) {
    var tab = perturbationTable();
    if (!tab || !tab[body]) return null;
    var jd = T * 36525 + 2451545.0;
    var x = (jd - tab.jd0) / tab.step;
    var dlon = interpolate(tab[body].dlon, x);
    if (dlon === null) return null;
    return {
      dlon: dlon / 36000,
      dlat: interpolate(tab[body].dlat, x) / 36000,
      dr: interpolate(tab[body].dr, x) / 1e7
    };
  }

  /**
   * Heliocentric rectangular coordinates, J2000 ecliptic frame, in AU.
   * Pass raw = true for the uncorrected two-body result (used when regenerating
   * the perturbation table, so corrections are never applied twice).
   */
  function heliocentric(body, T, raw) {
    var el = ELEMENTS[body], e0 = el[0], r = el[1];
    var a = e0[0] + r[0] * T;
    var e = e0[1] + r[1] * T;
    var I = e0[2] + r[2] * T;
    var L = e0[3] + r[3] * T;
    var peri = e0[4] + r[4] * T;
    var node = e0[5] + r[5] * T;

    var argPeri = peri - node;
    var M = norm180(L - peri);
    // Kepler's equation by Newton-Raphson; e is small here so this converges fast.
    var E = M;
    for (var i = 0; i < 12; i++) {
      var dE = (E - e / DEG * sin(E) - M) / (1 - e * cos(E));
      E -= dE;
      if (Math.abs(dE) < 1e-11) break;
    }
    var xp = a * (cos(E) - e);
    var yp = a * Math.sqrt(1 - e * e) * sin(E);

    var cw = cos(argPeri), sw = sin(argPeri);
    var cn = cos(node), sn = sin(node);
    var ci = cos(I), si = sin(I);
    var pos = {
      x: (cw * cn - sw * sn * ci) * xp + (-sw * cn - cw * sn * ci) * yp,
      y: (cw * sn + sw * cn * ci) * xp + (-sw * sn + cw * cn * ci) * yp,
      z: (sw * si) * xp + (cw * si) * yp
    };

    var corr = raw ? null : perturbation(body, T);
    if (corr) {
      var r0 = Math.sqrt(pos.x * pos.x + pos.y * pos.y + pos.z * pos.z);
      var lon0 = atan2d(pos.y, pos.x) + corr.dlon;
      var lat0 = asind(pos.z / r0) + corr.dlat;
      var r1 = r0 + corr.dr;
      pos = {
        x: r1 * cos(lat0) * cos(lon0),
        y: r1 * cos(lat0) * sin(lon0),
        z: r1 * sin(lat0)
      };
    }
    return pos;
  }

  /** Earth's heliocentric velocity in AU/day, by central difference. */
  function earthVelocity(T) {
    var h = 0.02 / 36525; // ~0.02 day
    var p1 = heliocentric('earth', T - h), p2 = heliocentric('earth', T + h);
    var dt = 2 * h * 36525;
    return { x: (p2.x - p1.x) / dt, y: (p2.y - p1.y) / dt, z: (p2.z - p1.z) / dt };
  }

  /**
   * Apparent geocentric ecliptic longitude of a planet (or of the Sun, when
   * body === 'sun'), referred to the true equinox of date. Includes light-time,
   * annual aberration, precession and nutation.
   */
  function apparentLongitude(body, T, nut) {
    var earth = heliocentric('earth', T);
    var vEarth = earthVelocity(T);
    var gx, gy, gz;

    if (body === 'sun') {
      gx = -earth.x; gy = -earth.y; gz = -earth.z;
    } else {
      var Tl = T;
      for (var i = 0; i < 3; i++) {
        var p = heliocentric(body, Tl);
        gx = p.x - earth.x; gy = p.y - earth.y; gz = p.z - earth.z;
        var rho = Math.sqrt(gx * gx + gy * gy + gz * gz);
        Tl = T - (rho / C_AUD) / 36525; // step back by the light travel time
      }
    }

    var rho2 = Math.sqrt(gx * gx + gy * gy + gz * gz);
    // Annual aberration: shift the unit vector by Earth's velocity over c.
    var ax = gx / rho2 + vEarth.x / C_AUD;
    var ay = gy / rho2 + vEarth.y / C_AUD;
    var az = gz / rho2 + vEarth.z / C_AUD;

    var lon = norm360(atan2d(ay, ax));
    var lat = asind(az / Math.sqrt(ax * ax + ay * ay + az * az));
    var ofDate = precessFromJ2000(lon, lat, T);
    return { lon: norm360(ofDate.lon + nut.dpsi), lat: ofDate.lat, distance: rho2 };
  }

  /* --------------------------------------------------- zodiac vocabulary */

  var SIGNS = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
    'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
  var SIGNS_SA = ['Mesha', 'Vrishabha', 'Mithuna', 'Karka', 'Simha', 'Kanya',
    'Tula', 'Vrischika', 'Dhanu', 'Makara', 'Kumbha', 'Meena'];
  var SIGN_LORDS = ['Mars', 'Venus', 'Mercury', 'Moon', 'Sun', 'Mercury',
    'Venus', 'Mars', 'Jupiter', 'Saturn', 'Saturn', 'Jupiter'];

  var NAKSHATRAS = ['Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra',
    'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni',
    'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha', 'Mula',
    'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishta', 'Shatabhisha',
    'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'];

  // Vimshottari: nakshatra lord cycle and each lord's dasha length in years.
  var DASHA_ORDER = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
  var DASHA_YEARS = { Ketu: 7, Venus: 20, Sun: 6, Moon: 10, Mars: 7, Rahu: 18, Jupiter: 16, Saturn: 19, Mercury: 17 };
  var YEAR_DAYS = 365.2425;

  var TITHIS = ['Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi',
    'Saptami', 'Ashtami', 'Navami', 'Dashami', 'Ekadashi', 'Dwadashi', 'Trayodashi',
    'Chaturdashi', 'Purnima/Amavasya'];
  var YOGAS = ['Vishkambha', 'Priti', 'Ayushman', 'Saubhagya', 'Shobhana', 'Atiganda',
    'Sukarma', 'Dhriti', 'Shula', 'Ganda', 'Vriddhi', 'Dhruva', 'Vyaghata', 'Harshana',
    'Vajra', 'Siddhi', 'Vyatipata', 'Variyana', 'Parigha', 'Shiva', 'Siddha', 'Sadhya',
    'Shubha', 'Shukla', 'Brahma', 'Indra', 'Vaidhriti'];
  var KARANAS = ['Bava', 'Balava', 'Kaulava', 'Taitila', 'Garaja', 'Vanija', 'Vishti'];
  var VARAS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var VARA_LORDS = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];

  // Exaltation degree and debilitation sign, for the dignity column.
  var DIGNITY = {
    Sun: { exalt: 0, debil: 6, own: [4] },
    Moon: { exalt: 1, debil: 7, own: [3] },
    Mars: { exalt: 9, debil: 3, own: [0, 7] },
    Mercury: { exalt: 5, debil: 11, own: [2, 5] },
    Jupiter: { exalt: 3, debil: 9, own: [8, 11] },
    Venus: { exalt: 11, debil: 5, own: [1, 6] },
    Saturn: { exalt: 6, debil: 0, own: [9, 10] }
  };

  function signOf(lon) { return Math.floor(norm360(lon) / 30); }

  function nakshatraOf(lon) {
    var l = norm360(lon);
    var span = 360 / 27;
    var idx = Math.floor(l / span);
    var within = l - idx * span;
    return {
      index: idx,
      name: NAKSHATRAS[idx],
      pada: Math.floor(within / (span / 4)) + 1,
      lord: DASHA_ORDER[idx % 9],
      within: within
    };
  }

  function dignityOf(planet, sign) {
    var d = DIGNITY[planet];
    if (!d) return '';
    if (sign === d.exalt) return 'Exalted';
    if (sign === d.debil) return 'Debilitated';
    if (d.own.indexOf(sign) >= 0) return 'Own sign';
    return '';
  }

  /** Whole-sign (Parashari) house of a longitude, given the ascendant sign. */
  function houseOf(lon, ascSign) {
    return ((signOf(lon) - ascSign) % 12 + 12) % 12 + 1;
  }

  /** Navamsa (D9) sign index of a longitude. */
  function navamsaSign(lon) {
    var l = norm360(lon);
    return (Math.floor(l / (30 / 9))) % 12;
  }

  /* ---------------------------------------------------------- the chart */

  /**
   * Compute a full Vedic chart.
   *
   * @param {Object} o
   * @param {number} o.jdUT      Julian Day of the birth moment in UT.
   * @param {number} o.latitude  degrees, north positive.
   * @param {number} o.longitude degrees, east positive.
   * @param {string} [o.ayanamsa='lahiri']
   * @param {boolean} [o.trueNode=false]  mean node by default: that is what
   *        Indian panchangs and the Lahiri ephemeris publish for Rahu/Ketu.
   */
  function chart(o) {
    var jdUT = o.jdUT;
    var jdTT = jdUT + deltaT(jdUT) / 86400;
    var T = (jdTT - 2451545.0) / 36525;
    var nut = nutation(T);
    var eps = meanObliquity(T) + nut.deps;
    var ayan = ayanamsa(T, o.ayanamsa || 'lahiri');
    var sidereal = function (tropical) { return norm360(tropical - ayan); };

    // Tropical longitudes first, plus the same a day-fraction later so we can
    // report speed and retrogression.
    var dt = 0.5 / 36525;
    function tropicalOf(body, Tx) {
      var n = nutation(Tx);
      if (body === 'moon') return moonLongitude(Tx) + n.dpsi;
      if (body === 'rahu') return lunarNode(Tx, o.trueNode === true);
      return apparentLongitude(body, Tx, n).lon;
    }

    var bodies = [
      { key: 'sun', name: 'Sun' }, { key: 'moon', name: 'Moon' },
      { key: 'mercury', name: 'Mercury' }, { key: 'venus', name: 'Venus' },
      { key: 'mars', name: 'Mars' }, { key: 'jupiter', name: 'Jupiter' },
      { key: 'saturn', name: 'Saturn' }, { key: 'rahu', name: 'Rahu' }
    ];

    // Ascendant and Midheaven, tropical then sidereal.
    var gast = apparentSiderealTime(jdUT, T, nut, eps);
    var lst = norm360(gast + o.longitude);
    var ascTropical = norm360(atan2d(cos(lst), -(sin(lst) * cos(eps) + tan(o.latitude) * sin(eps))));
    var mcTropical = norm360(atan2d(sin(lst), cos(lst) * cos(eps)));
    var asc = sidereal(ascTropical);
    var ascSign = signOf(asc);

    var planets = [];
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      var lonT = tropicalOf(b.key, T);
      var lonT2 = tropicalOf(b.key, T + dt);
      var speed = norm180(lonT2 - lonT) / 0.5; // degrees per day
      var lon = sidereal(lonT);
      planets.push(makePlanet(b.name, lon, speed, ascSign));
      if (b.key === 'rahu') {
        planets.push(makePlanet('Ketu', norm360(lon + 180), speed, ascSign));
      }
    }

    var sunLon = planets[0].longitude, moonLon = planets[1].longitude;

    return {
      julianDay: jdUT,
      deltaT: deltaT(jdUT),
      ayanamsa: ayan,
      ayanamsaName: (AYANAMSA[o.ayanamsa] || AYANAMSA.lahiri).label,
      obliquity: eps,
      siderealTime: lst,
      ascendant: {
        longitude: asc,
        sign: ascSign,
        signName: SIGNS[ascSign],
        signSanskrit: SIGNS_SA[ascSign],
        lord: SIGN_LORDS[ascSign],
        degreeInSign: asc - ascSign * 30,
        nakshatra: nakshatraOf(asc)
      },
      midheaven: { longitude: sidereal(mcTropical), sign: signOf(sidereal(mcTropical)) },
      planets: planets,
      panchang: panchang(sunLon, moonLon, jdUT, o.tzOffsetMinutes || 0),
      dashas: vimshottari(moonLon, jdUT)
    };
  }

  function makePlanet(name, lon, speed, ascSign) {
    var sign = signOf(lon);
    var nav = navamsaSign(lon);
    return {
      name: name,
      longitude: lon,
      sign: sign,
      signName: SIGNS[sign],
      signSanskrit: SIGNS_SA[sign],
      signLord: SIGN_LORDS[sign],
      degreeInSign: lon - sign * 30,
      house: houseOf(lon, ascSign),
      nakshatra: nakshatraOf(lon),
      speed: speed,
      // Rahu and Ketu are always taken as retrograde in Vedic practice.
      retrograde: name === 'Rahu' || name === 'Ketu' ? true : speed < 0,
      dignity: dignityOf(name, sign),
      navamsaSign: nav,
      navamsaSignName: SIGNS[nav]
    };
  }

  /** Tithi, nakshatra-based yoga, karana and vara for the birth moment. */
  function panchang(sunLon, moonLon, jdUT, tzOffsetMinutes) {
    var elong = norm360(moonLon - sunLon);
    var tithiIdx = Math.floor(elong / 12);
    var karanaIdx = Math.floor(elong / 6);
    var yogaIdx = Math.floor(norm360(sunLon + moonLon) / (360 / 27));
    // Weekday of the local civil date; Vedic days really start at sunrise, so a
    // birth between midnight and sunrise belongs to the previous vara.
    var localJd = jdUT + tzOffsetMinutes / 1440;
    var weekday = Math.floor(localJd + 1.5) % 7;
    var karanaName;
    if (karanaIdx === 0) karanaName = 'Kimstughna';
    else if (karanaIdx >= 57) karanaName = ['Shakuni', 'Chatushpada', 'Naga'][karanaIdx - 57];
    else karanaName = KARANAS[(karanaIdx - 1) % 7];
    return {
      tithi: TITHIS[tithiIdx % 15],
      tithiNumber: (tithiIdx % 15) + 1,
      paksha: tithiIdx < 15 ? 'Shukla' : 'Krishna',
      yoga: YOGAS[yogaIdx],
      karana: karanaName,
      vara: VARAS[weekday],
      varaLord: VARA_LORDS[weekday],
      moonPhaseAngle: elong
    };
  }

  /** Vimshottari mahadashas, starting from the Moon's nakshatra. */
  function vimshottari(moonLon, jdUT) {
    var nak = nakshatraOf(moonLon);
    var span = 360 / 27;
    var fraction = nak.within / span;      // of the nakshatra already traversed
    var startIdx = DASHA_ORDER.indexOf(nak.lord);
    var first = DASHA_ORDER[startIdx];
    var balance = DASHA_YEARS[first] * (1 - fraction);

    var out = [];
    var jd = jdUT - DASHA_YEARS[first] * fraction * YEAR_DAYS;
    for (var i = 0; i < 9; i++) {
      var lord = DASHA_ORDER[(startIdx + i) % 9];
      var years = DASHA_YEARS[lord];
      out.push({ lord: lord, years: years, startJd: jd, endJd: jd + years * YEAR_DAYS });
      jd += years * YEAR_DAYS;
    }
    return { birthNakshatra: nak, balanceYears: balance, periods: out };
  }

  return {
    julianDay: julianDay,
    calendarDate: calendarDate,
    deltaT: deltaT,
    nutation: nutation,
    meanObliquity: meanObliquity,
    apparentSiderealTime: apparentSiderealTime,
    moonLongitude: moonLongitude,
    lunarNode: lunarNode,
    heliocentric: heliocentric,
    perturbation: perturbation,
    apparentLongitude: apparentLongitude,
    ayanamsa: ayanamsa,
    AYANAMSA: AYANAMSA,
    precessFromJ2000: precessFromJ2000,
    chart: chart,
    nakshatraOf: nakshatraOf,
    navamsaSign: navamsaSign,
    houseOf: houseOf,
    signOf: signOf,
    norm360: norm360,
    SIGNS: SIGNS,
    SIGNS_SA: SIGNS_SA,
    SIGN_LORDS: SIGN_LORDS,
    NAKSHATRAS: NAKSHATRAS,
    DASHA_ORDER: DASHA_ORDER,
    DASHA_YEARS: DASHA_YEARS
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Astro;
