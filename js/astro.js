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

  /*
   * IAU 1980 nutation, the leading terms of Meeus table 22.A. Columns are the
   * multipliers of D, M, M', F and Omega, then the sine coefficients for delta
   * psi and the cosine coefficients for delta epsilon, in units of 0.0001".
   *
   * The four largest terms alone are good to about 1.5", which sounds negligible
   * until you follow it into the ascendant: nutation enters both the sidereal
   * time and the ayanamsa, and the ascendant can move two to three degrees per
   * degree of sidereal time, so the error arrives amplified.
   */
  var NUTATION_TERMS = [
    [0, 0, 0, 0, 1, -171996, -174.2, 92025, 8.9],
    [-2, 0, 0, 2, 2, -13187, -1.6, 5736, -3.1],
    [0, 0, 0, 2, 2, -2274, -0.2, 977, -0.5],
    [0, 0, 0, 0, 2, 2062, 0.2, -895, 0.5],
    [0, 1, 0, 0, 0, 1426, -3.4, 54, -0.1],
    [0, 0, 1, 0, 0, 712, 0.1, -7, 0],
    [-2, 1, 0, 2, 2, -517, 1.2, 224, -0.6],
    [0, 0, 0, 2, 1, -386, -0.4, 200, 0],
    [0, 0, 1, 2, 2, -301, 0, 129, -0.1],
    [-2, -1, 0, 2, 2, 217, -0.5, -95, 0.3],
    [-2, 0, 1, 0, 0, -158, 0, -1, 0],
    [-2, 0, 0, 2, 1, 129, 0.1, -70, 0],
    [0, 0, -1, 2, 2, 123, 0, -53, 0],
    [2, 0, 0, 0, 0, 63, 0, -2, 0],
    [0, 0, 1, 0, 1, 63, 0.1, -33, 0],
    [2, 0, -1, 2, 2, -59, 0, 26, 0],
    [0, 0, -1, 0, 1, -58, -0.1, 32, 0],
    [0, 0, 1, 2, 1, -51, 0, 27, 0],
    [-2, 0, 2, 0, 0, 48, 0, 1, 0],
    [0, 0, -2, 2, 1, 46, 0, -24, 0],
    [2, 0, 0, 2, 2, -38, 0, 16, 0],
    [0, 0, 2, 2, 2, -31, 0, 13, 0],
    [0, 0, 2, 0, 0, 29, 0, -1, 0],
    [-2, 0, 1, 2, 2, 29, 0, -12, 0],
    [0, 0, 0, 2, 0, 26, 0, -1, 0],
    [-2, 0, 0, 2, 0, -22, 0, 0, 0],
    [0, 0, -1, 2, 1, 21, 0, -10, 0],
    [0, 2, 0, 0, 0, 17, -0.1, 0, 0],
    [2, 0, -1, 0, 1, 16, 0, -8, 0],
    [-2, 2, 0, 2, 2, -16, 0.1, 7, 0],
    [0, 1, 0, 0, 1, -15, 0, 9, 0],
    [-2, 0, 1, 0, 1, -13, 0, 7, 0],
    [0, -1, 0, 0, 1, -12, 0, 6, 0],
    [0, 0, 2, -2, 0, 11, 0, 0, 0],
    [2, 0, -1, 2, 1, -10, 0, 5, 0],
    [2, 0, 1, 2, 2, -8, 0, 3, 0],
    [0, 1, 0, 2, 2, 7, 0, -3, 0],
    [-2, 1, 1, 0, 0, -7, 0, 0, 0],
    [0, -1, 0, 2, 2, -7, 0, 3, 0],
    [2, 0, 0, 2, 1, -7, 0, 3, 0],
    [2, 0, 1, 0, 0, 6, 0, 0, 0],
    [-2, 0, 2, 2, 2, 6, 0, -3, 0],
    [-2, 0, 1, 2, 1, 6, 0, -3, 0],
    [2, 0, -2, 0, 1, -6, 0, 3, 0],
    [2, 0, 0, 0, 1, -6, 0, 3, 0],
    [0, -1, 1, 0, 0, 5, 0, 0, 0],
    [-2, -1, 0, 2, 1, -5, 0, 3, 0],
    [-2, 0, 0, 0, 1, -5, 0, 3, 0],
    [0, 0, 2, 2, 1, -5, 0, 3, 0]
  ];

  /** Nutation in longitude and obliquity, degrees. */
  function nutation(T) {
    var D = 297.85036 + 445267.111480 * T - 0.0019142 * T * T + T * T * T / 189474;
    var M = 357.52772 + 35999.050340 * T - 0.0001603 * T * T - T * T * T / 300000;
    var Mp = 134.96298 + 477198.867398 * T + 0.0086972 * T * T + T * T * T / 56250;
    var F = 93.27191 + 483202.017538 * T - 0.0036825 * T * T + T * T * T / 327270;
    var omega = 125.04452 - 1934.136261 * T + 0.0020708 * T * T + T * T * T / 450000;
    var dpsi = 0, deps = 0;
    for (var i = 0; i < NUTATION_TERMS.length; i++) {
      var t = NUTATION_TERMS[i];
      var arg = t[0] * D + t[1] * M + t[2] * Mp + t[3] * F + t[4] * omega;
      dpsi += (t[5] + t[6] * T) * sin(arg);
      deps += (t[7] + t[8] * T) * cos(arg);
    }
    return { dpsi: dpsi / 36000000, deps: deps / 36000000 };
  }

  /** Mean obliquity of the ecliptic, degrees (Laskar). */
  function meanObliquity(T) {
    var u = T / 100;
    return 23.43929111 + (-4680.93 * u - 1.55 * Math.pow(u, 2) + 1999.25 * Math.pow(u, 3) -
      51.38 * Math.pow(u, 4) - 249.67 * Math.pow(u, 5) - 39.05 * Math.pow(u, 6) +
      7.12 * Math.pow(u, 7) + 27.87 * Math.pow(u, 8) + 5.79 * Math.pow(u, 9) +
      2.45 * Math.pow(u, 10)) / 3600;
  }

  /**
   * Apparent sidereal time at Greenwich, degrees.
   *
   * Built on the Earth Rotation Angle and the IAU 2006 expression for GMST
   * rather than the older IAU 1982 polynomial, which drifts from it by a couple
   * of arcseconds by 2050. That is nothing in a planet's longitude, but it lands
   * undiluted in the ascendant, which is the one number a birth chart turns on.
   */
  function apparentSiderealTime(jdUT, T, nut, trueEps) {
    var du = jdUT - 2451545.0;
    var era = 360 * (0.7790572732640 + 1.00273781191135448 * du); // Earth rotation angle
    var gmst = era + (0.014506 + 4612.156534 * T + 1.3915817 * T * T -
      0.00000044 * Math.pow(T, 3) - 0.000029956 * Math.pow(T, 4) -
      0.0000000368 * Math.pow(T, 5)) / 3600;
    return norm360(gmst + nut.dpsi * cos(trueEps)); // equation of the equinoxes
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
   * Ayanamsa = the tropical longitude of the sidereal zero point, measured from
   * the MEAN equinox of date (this is the number panchangs publish, and what
   * Swiss Ephemeris' swe_get_ayanamsa_ut returns).
   *
   * `j2000` is the value at J2000.0 and `rate` a small correction in arcseconds
   * per century on top of the precession polynomial above. Both were calibrated
   * against Swiss Ephemeris over 1800-2100 by scripts/fit-ayanamsa.mjs; the
   * residual is under 0.01" for the four precession-defined systems, and under
   * 0.3" for True Chitra, whose zero point tracks Spica itself and so drifts at
   * a slightly different rate.
   */
  var AYANAMSA = {
    lahiri: { label: 'Lahiri (Chitrapaksha)', j2000: 23.857092, rate: -0.294 },
    trueCitra: { label: 'True Chitra Paksha', j2000: 23.840003, rate: -4.958 },
    kp: { label: 'Krishnamurti (KP)', j2000: 23.760239, rate: -0.294 },
    raman: { label: 'B. V. Raman', j2000: 22.410790, rate: -0.294 },
    fagan: { label: 'Fagan-Bradley', j2000: 24.740299, rate: -0.294 }
  };

  /** Ayanamsa from the mean equinox of date, degrees. */
  function ayanamsa(T, system) {
    var base = AYANAMSA[system] || AYANAMSA.lahiri;
    return base.j2000 + precessionSinceJ2000(T) + base.rate * T / 3600;
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

  /*
   * Meeus table 47.B, the leading terms of the Moon's ecliptic latitude, in
   * units of 1e-6 degree. Needed because declination decides Ayana Bala, and the
   * Moon wanders up to 5 degrees off the ecliptic - enough to move that bala by
   * six shashtiamsas if taken as zero.
   */
  var MOON_LAT = [
    [0, 0, 0, 1, 5128122], [0, 0, 1, 1, 280602], [0, 0, 1, -1, 277693],
    [2, 0, 0, -1, 173237], [2, 0, -1, 1, 55413], [2, 0, -1, -1, 46271],
    [2, 0, 0, 1, 32573], [0, 0, 2, 1, 17198], [2, 0, 1, -1, 9266],
    [0, 0, 2, -1, 8822], [2, -1, 0, -1, 8216], [2, 0, -2, -1, 4324],
    [2, 0, 1, 1, 4200], [2, 1, 0, -1, -3359], [2, -1, -1, 1, 2463],
    [2, -1, 0, 1, 2211], [2, -1, -1, -1, 2065], [0, -1, -1, 1, -1870],
    [4, 0, -1, -1, 1828], [0, 1, 0, 1, -1794], [0, 0, 0, 3, -1749],
    [0, -1, 1, 1, -1565], [1, 0, 0, 1, -1491], [0, 1, 1, 1, -1475],
    [0, 1, 1, -1, -1410], [0, 1, 0, -1, -1344], [1, 0, 0, -1, -1335],
    [0, 0, 3, 1, 1107], [4, 0, 0, -1, 1021], [4, 0, -1, 1, 833]
  ];

  /** Geocentric ecliptic latitude of the Moon, degrees. */
  function moonLatitude(T) {
    var Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T * T;
    var D = 297.8501921 + 445267.1114034 * T - 0.0018819 * T * T;
    var M = 357.5291092 + 35999.0502909 * T - 0.0001536 * T * T;
    var Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T;
    var F = 93.2720950 + 483202.0175233 * T - 0.0036539 * T * T;
    var A1 = 119.75 + 131.849 * T;
    var A3 = 313.45 + 481266.484 * T;
    var E = 1 - 0.002516 * T - 0.0000074 * T * T;

    var sum = 0;
    for (var i = 0; i < MOON_LAT.length; i++) {
      var t = MOON_LAT[i];
      var arg = t[0] * D + t[1] * M + t[2] * Mp + t[3] * F;
      var ecc = Math.abs(t[1]) === 1 ? E : (Math.abs(t[1]) === 2 ? E * E : 1);
      sum += t[4] * ecc * sin(arg);
    }
    sum += -2235 * sin(Lp) + 382 * sin(A3) + 175 * sin(A1 - F) +
      175 * sin(A1 + F) + 127 * sin(Lp - Mp) - 115 * sin(Lp + Mp);
    return sum / 1000000;
  }

  /** Declination from ecliptic longitude and latitude, degrees. */
  function declination(lon, lat, eps) {
    return asind(sin(lat) * cos(eps) + cos(lat) * sin(eps) * sin(lon));
  }

  /**
   * Sunrise or sunset as a Julian Day, or null on a day that has neither.
   *
   * Solved by bisection on the Sun's altitude rather than from a closed form,
   * because the same apparent position this engine already computes then decides
   * it, and the polar cases fall out as "no crossing" instead of as a domain
   * error in an arccosine.
   */
  function sunriseSunset(jdUT, latitude, longitude, wantSunset) {
    var ALTITUDE = -0.8333;   // refraction at the horizon plus the Sun's radius
    var altitudeAt = function (jd) {
      var T = (jd + deltaT(jd) / 86400 - 2451545.0) / 36525;
      var nut = nutation(T);
      var eps = meanObliquity(T) + nut.deps;
      var sun = apparentLongitude('sun', T, nut);
      var ra = atan2d(sin(sun.lon) * cos(eps) - tan(sun.lat) * sin(eps), cos(sun.lon));
      var dec = declination(sun.lon, sun.lat, eps);
      var ha = norm360(apparentSiderealTime(jdUT, T, nut, eps) +
        (jd - jdUT) * 360.98564736629 + longitude - ra);
      return asind(sin(latitude) * sin(dec) + cos(latitude) * cos(dec) * cos(ha));
    };

    var midnight = Math.floor(jdUT - longitude / 360 - 0.5) + 0.5 + longitude / -360;
    var start = midnight, step = 1 / 48;
    for (var i = 0; i < 48; i++) {
      var a = start + i * step, b = a + step;
      var rising = altitudeAt(a) < ALTITUDE && altitudeAt(b) >= ALTITUDE;
      var setting = altitudeAt(a) >= ALTITUDE && altitudeAt(b) < ALTITUDE;
      if (wantSunset ? setting : rising) {
        for (var k = 0; k < 40; k++) {
          var mid = (a + b) / 2;
          if ((altitudeAt(mid) < ALTITUDE) === !wantSunset) a = mid; else b = mid;
        }
        return (a + b) / 2;
      }
    }
    return null;   // the Sun neither rose nor set here today
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
   * JPL Horizons, sampled on a time grid per body. Outside a table's range the
   * raw Keplerian result is used unchanged, which is the same accuracy you would
   * get without the table at all.
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
    var entry = tab && tab[body];
    if (!entry) return null;
    var jd = T * 36525 + 2451545.0;
    var x = (jd - entry.jd0) / entry.step;
    var dlon = interpolate(entry.dlon, x);
    if (dlon === null) return null;
    return {
      dlon: dlon / 36000,
      dlat: interpolate(entry.dlat, x) / 36000,
      dr: interpolate(entry.dr, x) / 1e7
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

  /*
   * Dignity depends on the degree, not just the sign, which is why this table
   * carries ranges. Two grahas stack three dignities inside one sign: Mercury in
   * Virgo is exalted to 15 degrees, Mooltrikona to 20, and in its own sign
   * beyond; the Moon is exalted through the first 3 degrees of Taurus and
   * Mooltrikona for the rest of it.
   *
   * `exalt.to` is 30 for the grahas whose whole exaltation sign counts, and
   * `exalt.deep` is the point of deepest exaltation, kept because it is what
   * strength calculations use even though the column does not show it.
   */
  var DIGNITY = {
    Sun: { exalt: { sign: 0, to: 30, deep: 10 }, debil: 6, own: [4], mool: { sign: 4, from: 0, to: 20 } },
    Moon: { exalt: { sign: 1, to: 3, deep: 3 }, debil: 7, own: [3], mool: { sign: 1, from: 3, to: 30 } },
    Mars: { exalt: { sign: 9, to: 30, deep: 28 }, debil: 3, own: [0, 7], mool: { sign: 0, from: 0, to: 12 } },
    Mercury: { exalt: { sign: 5, to: 15, deep: 15 }, debil: 11, own: [2, 5], mool: { sign: 5, from: 15, to: 20 } },
    Jupiter: { exalt: { sign: 3, to: 30, deep: 5 }, debil: 9, own: [8, 11], mool: { sign: 8, from: 0, to: 10 } },
    Venus: { exalt: { sign: 11, to: 30, deep: 27 }, debil: 5, own: [1, 6], mool: { sign: 6, from: 0, to: 15 } },
    Saturn: { exalt: { sign: 6, to: 30, deep: 20 }, debil: 0, own: [9, 10], mool: { sign: 10, from: 0, to: 20 } }
  };

  function signOf(lon) { return Math.floor(norm360(lon) / 30); }

  /**
   * Nakshatra, pada, lord and KP sub lord for a sidereal longitude.
   *
   * The sub lord divides each nakshatra into nine unequal parts, in the same
   * order and the same proportions as the Vimshottari dasha: a lord's share of
   * the 13 deg 20' is its share of the 120 years. The sequence starts with the
   * nakshatra's own lord, so the first sliver of any nakshatra is ruled twice
   * over by the same graha.
   */
  function nakshatraOf(lon) {
    var l = norm360(lon);
    var span = 360 / 27;
    var idx = Math.floor(l / span);
    var within = l - idx * span;
    var lordIndex = idx % 9;

    var subLord = DASHA_ORDER[lordIndex], subStart = 0, subSpan = span;
    for (var i = 0, edge = 0; i < 9; i++) {
      var candidate = DASHA_ORDER[(lordIndex + i) % 9];
      var width = span * DASHA_YEARS[candidate] / 120;
      // The last sub absorbs any rounding, so a longitude at the very end of a
      // nakshatra cannot fall past every boundary and come back empty.
      if (within < edge + width || i === 8) {
        subLord = candidate; subStart = edge; subSpan = width;
        break;
      }
      edge += width;
    }

    return {
      index: idx,
      name: NAKSHATRAS[idx],
      pada: Math.floor(within / (span / 4)) + 1,
      lord: DASHA_ORDER[lordIndex],
      subLord: subLord,
      subStart: subStart,
      subSpan: subSpan,
      within: within
    };
  }

  /**
   * Dignity of a graha at a position.
   *
   * Order matters where a sign holds more than one: Mooltrikona is checked
   * before exaltation, because the Moon past 3 degrees of Taurus and Mercury
   * between 15 and 20 of Virgo are Mooltrikona rather than still exalted.
   *
   * Rahu and Ketu are left blank. They have no universally agreed exaltation -
   * the usual candidates contradict each other - and inventing one here would
   * put a number on a disagreement.
   */
  function dignityOf(planet, sign, degreeInSign) {
    var d = DIGNITY[planet];
    if (!d) return '';
    var deg = degreeInSign || 0;
    if (d.mool && sign === d.mool.sign && deg >= d.mool.from && deg < d.mool.to) return 'Mooltrikona';
    if (sign === d.exalt.sign && deg < d.exalt.to) return 'Exalted';
    if (sign === d.debil) return 'Debilitated';
    if (d.own.indexOf(sign) >= 0) return 'Own sign';
    return '';
  }

  /*
   * Kendras are the angles and trikonas the trines. The first house is both, but
   * it is excluded from each list here: a graha that rules only the lagna is not
   * what anyone means by a yogakaraka.
   */
  var KENDRA = [4, 7, 10];
  var TRIKONA = [5, 9];

  /** Which houses a graha rules, counted from a reference sign. */
  function housesOwned(planet, referenceSign) {
    var dignity = DIGNITY[planet];
    if (!dignity) return [];   // Rahu and Ketu rule nothing, so rule out nothing
    return dignity.own.map(function (sign) {
      return ((sign - referenceSign) % 12 + 12) % 12 + 1;
    }).sort(function (a, b) { return a - b; });
  }

  /**
   * A yogakaraka rules both a kendra and a trikona from the lagna, which only
   * happens for six of the twelve ascendants. Deriving it rather than listing
   * those six means it also answers correctly when a chart is read from some
   * other reference, such as the Moon.
   */
  function isYogakaraka(planet, referenceSign) {
    var houses = housesOwned(planet, referenceSign);
    var holds = function (set) {
      return houses.some(function (h) { return set.indexOf(h) >= 0; });
    };
    return holds(KENDRA) && holds(TRIKONA);
  }

  /*
   * Graha friendships.
   *
   * Three layers, and they compound: the natural relation never changes, the
   * temporal one depends on where two grahas sit in a chart, and the compound
   * of the two is what is actually read. Natural friend plus temporal friend
   * gives a great friend; natural enemy plus temporal friend gives a neutral,
   * and so on.
   *
   * Rahu and Ketu are absent. The classical table does not include them, and
   * schemes that do disagree with one another.
   */
  var NATURAL_FRIENDS = {
    Sun: { friends: ['Moon', 'Mars', 'Jupiter'], enemies: ['Venus', 'Saturn'] },
    Moon: { friends: ['Sun', 'Mercury'], enemies: [] },
    Mars: { friends: ['Sun', 'Moon', 'Jupiter'], enemies: ['Mercury'] },
    Mercury: { friends: ['Sun', 'Venus'], enemies: ['Moon'] },
    Jupiter: { friends: ['Sun', 'Moon', 'Mars'], enemies: ['Mercury', 'Venus'] },
    Venus: { friends: ['Mercury', 'Saturn'], enemies: ['Sun', 'Moon'] },
    Saturn: { friends: ['Mercury', 'Venus'], enemies: ['Sun', 'Moon', 'Mars'] }
  };

  var RELATION_LABELS = {
    adhimitra: 'great friend', mitra: 'friend', sama: 'neutral',
    shatru: 'enemy', adhishatru: 'great enemy'
  };

  /** Natural relation: 1 friend, 0 neutral, -1 enemy. Null for the nodes. */
  function naturalRelation(graha, other) {
    var table = NATURAL_FRIENDS[graha];
    if (!table || !NATURAL_FRIENDS[other]) return null;
    if (table.friends.indexOf(other) >= 0) return 1;
    if (table.enemies.indexOf(other) >= 0) return -1;
    return 0;
  }

  /*
   * Temporal: grahas in the 2nd, 3rd, 4th, 10th, 11th and 12th from one another
   * are temporary friends, the rest temporary enemies. Counted in the rashi
   * chart, which is where the classical rule places it, even when the sign
   * being judged belongs to a division.
   */
  function temporalRelation(housesApart) {
    return [2, 3, 4, 10, 11, 12].indexOf(housesApart) >= 0 ? 1 : -1;
  }

  /** The compound of the two, which is the relation actually read. */
  function compoundRelation(graha, other, housesApart) {
    var natural = naturalRelation(graha, other);
    if (natural === null) return null;
    var combined = natural + temporalRelation(housesApart);
    return combined >= 2 ? 'adhimitra'
      : combined === 1 ? 'mitra'
      : combined === 0 ? 'sama'
      : combined === -1 ? 'shatru' : 'adhishatru';
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

  /*
   * The Shodasavarga: Parashara's sixteen divisional charts.
   *
   * Each entry says how many parts a sign is cut into and which sign a given
   * part maps to. `start` helpers below name the recurring patterns rather than
   * repeating them, since most of the disagreement between authorities is about
   * where a division starts counting, and it is easier to audit in one place.
   *
   * Sign indices are 0-based, so "odd signs" in the classical sense - Aries,
   * Gemini, Leo - are the even indices here.
   *
   * Left out deliberately: D5, D6, D8 and D11, whose starting signs differ
   * between authorities with no settled answer, and Bhava Chalit, which is not
   * a division at all but a house chart and would need cusps this engine does
   * not compute.
   */
  var movableFixedDual = function (starts) {
    return function (sign, index) { return (starts[sign % 3] + index) % 12; };
  };
  // Two shapes of odd/even rule, and mixing them up is the classic way to get a
  // varga subtly wrong: one counts from a fixed sign, the other from the sign
  // the graha is already in.
  var oddEvenFromFixed = function (oddStart, evenStart) {
    return function (sign, index) {
      return ((sign % 2 === 0 ? oddStart : evenStart) + index) % 12;
    };
  };
  var oddEvenFromSelf = function (oddOffset, evenOffset) {
    return function (sign, index) {
      return (sign + (sign % 2 === 0 ? oddOffset : evenOffset) + index) % 12;
    };
  };
  var fromSign = function (step) {
    return function (sign, index) { return (sign + step * index) % 12; };
  };

  var VARGAS = [
    { division: 1, name: 'D1', label: 'Rashi', about: 'the body, and matters in general',
      parts: 1, rule: function (sign) { return sign; } },
    { division: 2, name: 'D2', label: 'Hora', about: 'wealth',
      parts: 2, rule: function (sign, index) {
        // Sun's hora is Leo, the Moon's is Cancer; odd signs take the Sun first.
        return sign % 2 === 0 ? (index === 0 ? 4 : 3) : (index === 0 ? 3 : 4);
      } },
    { division: 3, name: 'D3', label: 'Drekkana', about: 'siblings, and courage',
      parts: 3, rule: fromSign(4) },
    { division: 4, name: 'D4', label: 'Chaturthamsha', about: 'home, and fortune',
      parts: 4, rule: fromSign(3) },
    { division: 7, name: 'D7', label: 'Saptamsha', about: 'children',
      parts: 7, rule: oddEvenFromSelf(0, 6) },
    { division: 9, name: 'D9', label: 'Navamsa', about: 'marriage, and inner strength',
      parts: 9, rule: function (sign, index) { return (sign * 9 + index) % 12; } },
    { division: 10, name: 'D10', label: 'Dashamsha', about: 'work, and standing',
      parts: 10, rule: oddEvenFromSelf(0, 8) },
    { division: 12, name: 'D12', label: 'Dvadashamsha', about: 'parents',
      parts: 12, rule: fromSign(1) },
    { division: 16, name: 'D16', label: 'Shodashamsha', about: 'vehicles, and comforts',
      parts: 16, rule: movableFixedDual([0, 4, 8]) },
    { division: 20, name: 'D20', label: 'Vimshamsha', about: 'spiritual practice',
      parts: 20, rule: movableFixedDual([0, 8, 4]) },
    { division: 24, name: 'D24', label: 'Chaturvimshamsha', about: 'learning',
      parts: 24, rule: oddEvenFromFixed(4, 3) },
    { division: 27, name: 'D27', label: 'Saptavimshamsha', about: 'strengths and weaknesses',
      parts: 27, rule: function (sign, index) { return ([0, 3, 6, 9][sign % 4] + index) % 12; } },
    { division: 30, name: 'D30', label: 'Trimshamsha', about: 'misfortune',
      parts: 5, unequal: true },
    { division: 40, name: 'D40', label: 'Khavedamsha', about: 'maternal legacy',
      parts: 40, rule: oddEvenFromFixed(0, 6) },
    { division: 45, name: 'D45', label: 'Akshavedamsha', about: 'paternal legacy',
      parts: 45, rule: movableFixedDual([0, 4, 8]) },
    { division: 60, name: 'D60', label: 'Shashtiamsha', about: 'the sum of past deeds',
      parts: 60, rule: fromSign(1) }
  ];

  var VARGA_BY_DIVISION = {};
  for (var vi = 0; vi < VARGAS.length; vi++) VARGA_BY_DIVISION[VARGAS[vi].division] = VARGAS[vi];

  /*
   * Trimshamsha alone has unequal parts, ruled by the five non-luminaries. Odd
   * signs run Mars, Saturn, Jupiter, Mercury, Venus across 5, 5, 8, 7 and 5
   * degrees; even signs run the same five in reverse, each taking the sign it
   * owns on that side of the zodiac.
   */
  var TRIMSHAMSHA_ODD = [[5, 0], [5, 10], [8, 8], [7, 2], [5, 6]];
  var TRIMSHAMSHA_EVEN = [[5, 1], [7, 5], [8, 11], [5, 9], [5, 7]];

  function trimshamsha(sign, within) {
    var table = sign % 2 === 0 ? TRIMSHAMSHA_ODD : TRIMSHAMSHA_EVEN;
    var edge = 0;
    for (var i = 0; i < table.length; i++) {
      var width = table[i][0];
      if (within < edge + width || i === table.length - 1) {
        return { sign: table[i][1], degreeInSign: (within - edge) / width * 30 };
      }
      edge += width;
    }
    return null;
  }

  /*
   * The ten vargas Parashara groups as the Dasavarga, in his order.
   */
  var DASAVARGA = [1, 2, 3, 7, 9, 10, 12, 16, 30, 60];

  /*
   * Chapter 7, verses 13-16, Santhanam: "Jupiter, the Sun and Mars give
   * (pronounced) effects in the Hora of the Sun. The Moon, Venus and Saturn do so
   * when in Moon's Hora. Mercury is effective in both the Horas."
   *
   * The hora needs its own rule because the ordinary scale degenerates there.
   * D2 yields only Cancer and Leo, so own sign is reachable by the Moon and the
   * Sun alone, exaltation by Jupiter alone, debilitation by Mars alone, and the
   * other grahas are left permanently as somebody's guest. Parashara answers the
   * problem directly rather than leaving it to be inferred.
   */
  var HORA_STRONG = {
    Moon: ['Moon', 'Venus', 'Saturn', 'Mercury'],
    Sun: ['Sun', 'Jupiter', 'Mars', 'Mercury']
  };
  var HORA_LABELS = { pronounced: 'Pronounced', muted: 'Muted' };

  /*
   * Same passage, verse 16: "As for Trimsamsa effects the Sun is akin to Mars and
   * the Moon is akin to Venus. The effects applicable to Rashi will apply to
   * Trimsamsa."
   *
   * Trimsamsa is the other division with a hole in it. Only the five taras rule
   * one, so Cancer and Leo never appear and neither luminary could otherwise
   * stand in a trimsamsa of its own. The stand-in settles ownership only;
   * exaltation, debilitation and friendship stay the real graha's, which is as
   * far as the text goes.
   */
  var TRIMSAMSA_PROXY = { Sun: 'Mars', Moon: 'Venus' };

  var VARGA_DIGNITY_LABELS = {
    exalted: 'Exalted', moolatrikona: 'Mooltrikona', own: 'Own sign',
    adhimitra: 'Great friend', mitra: 'Friend', sama: 'Neutral',
    shatru: 'Enemy', adhishatru: 'Great enemy', debilitated: 'Debilitated'
  };

  /**
   * How a graha stands in one division: its dignity in the sign that division
   * puts it in, judged against that sign's lord.
   *
   * Two scales are really in play here and they do not agree. The classical
   * vimsopaka reckoning ranks seven steps, moolatrikona down to great enemy, and
   * deliberately leaves exaltation out: within a varga what counts is the
   * relation to the lord, and exaltation is already measured elsewhere, by
   * uchcha bala. But a graha standing in its exaltation sign in a division is a
   * plain fact worth seeing, and reporting it as "great friend" would hide it.
   * So exaltation and debilitation are reported when they occur, and `relation`
   * always carries the seven-step answer underneath for anyone scoring it.
   *
   * Temporal friendship is counted in the rashi chart even when the sign being
   * judged belongs to a division, which is where the classical rule puts it.
   */
  function vargaDignity(graha, longitude, division, positionsD1) {
    var position = vargaPosition(longitude, division);
    if (!position) return null;
    var lord = SIGN_LORDS[position.sign];

    // The hora is judged by Parashara's own rule, not by the seven steps.
    if (division === 2) {
      if (!HORA_STRONG[lord] || !DIGNITY[graha]) return null;
      var pronounced = HORA_STRONG[lord].indexOf(graha) >= 0;
      var key = pronounced ? 'pronounced' : 'muted';
      return {
        key: key, label: HORA_LABELS[key], sign: position.sign, lord: lord,
        relation: null, relationLabel: null, hora: lord,
        // Verse 14: the Sun's hora tells in an odd rashi, the Moon's in an even one.
        strongerHalf: (signOf(longitude) % 2 === 0) === (lord === 'Sun'),
        // Verse 15: full, medium and nil across the three parts of a hora.
        third: Math.min(2, Math.floor(position.degreeInSign / 10))
      };
    }

    var own = dignityOf(graha, position.sign, position.degreeInSign);
    var ownsIt = lord === graha ||
      (division === 30 && TRIMSAMSA_PROXY[graha] === lord);

    var relation = null;
    if (ownsIt) {
      relation = own === 'Mooltrikona' ? 'moolatrikona' : 'own';
    } else if (positionsD1 && positionsD1[lord] && positionsD1[graha]) {
      var apart = ((positionsD1[lord].sign - positionsD1[graha].sign) % 12 + 12) % 12 + 1;
      relation = compoundRelation(graha, lord, apart);
    }

    // Exaltation and debilitation outrank the relation when the two disagree,
    // which is the order they are usually recited in.
    var chosen = own === 'Exalted' ? 'exalted'
      : own === 'Debilitated' ? 'debilitated'
      : relation;
    if (!chosen) return null;                // a node, which owns nothing and befriends nobody

    return {
      key: chosen,
      label: VARGA_DIGNITY_LABELS[chosen],
      sign: position.sign,
      lord: lord,
      relation: relation,
      relationLabel: relation ? VARGA_DIGNITY_LABELS[relation] : null,
      viaProxy: ownsIt && lord !== graha ? TRIMSAMSA_PROXY[graha] : null
    };
  }

  /**
   * Vargottama: the same sign in the rashi and in the navamsha.
   *
   * Always D1 against D9, whatever division is being looked at. Narasimha Rao
   * reads a D4 chart and still writes "vargottama in Navamsa", because it is a
   * property the graha carries rather than something the displayed varga
   * changes. Sign repetition between D1 and some other varga is perfectly
   * computable, and D3, D4, D7, D10 and D12 each have exactly one repeating
   * division per sign, but no classical authority calls that vargottama.
   *
   * Mechanically this is the 1st navamsha of a movable sign, the 5th of a fixed
   * one and the 9th of a dual one, which is the form the rule is usually taught
   * in. It says nothing about whether the placement is good: a graha at the end
   * of Virgo is vargottama, and Venus there is also debilitated.
   */
  function isVargottama(longitude) {
    return signOf(longitude) === vargaPosition(longitude, 9).sign;
  }

  /**
   * Position in a divisional chart.
   *
   * A varga maps each slice of a sign onto a whole sign, and the position
   * within that slice is stretched back across the full 30 degrees. That
   * stretch is what gives a divisional chart a longitude of its own, and with
   * it a nakshatra, a pada and a sub lord. It is a convention rather than a
   * fact - one school holds that a varga yields only signs - but it is the one
   * every widely used panchang follows, and it reproduces their divisional
   * degrees to the arcsecond.
   */
  function vargaPosition(longitude, division) {
    var varga = VARGA_BY_DIVISION[division];
    if (!varga) return null;
    var l = norm360(longitude);
    var sign = Math.floor(l / 30);
    var within = l - sign * 30;

    if (varga.unequal) {
      var t = trimshamsha(sign, within);
      return { sign: t.sign, degreeInSign: t.degreeInSign, longitude: t.sign * 30 + t.degreeInSign };
    }

    var width = 30 / varga.parts;
    var index = Math.min(varga.parts - 1, Math.floor(within / width));
    var target = varga.rule(sign, index);
    var degree = varga.parts === 1 ? within : (within - index * width) / width * 30;
    return { sign: target, degreeInSign: degree, longitude: target * 30 + degree };
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
  /**
   * Mean tropical longitude of a body at a Julian Day: the position this engine
   * computes analytically, with nutation removed so it is measured from the mean
   * equinox. Identical in meaning to what astro_ephemeris stores, which is what
   * lets a database-backed chart and a locally computed one agree.
   */
  function meanTropicalOf(body, jdUT, trueNode) {
    var T = (jdUT + deltaT(jdUT) / 86400 - 2451545.0) / 36525;
    var n = nutation(T);
    if (body === 'moon') return norm360(moonLongitude(T));
    if (body === 'rahu') return norm360(lunarNode(T, trueNode === true));
    return norm360(apparentLongitude(body, T, n).lon - n.dpsi);
  }

  /**
   * Compute a chart from any source of mean tropical longitudes.
   *
   * `sample(bodyKey, jdUT)` returns that body's mean tropical longitude. The
   * analytic engine and the stored ephemeris differ only in this function, so
   * everything downstream - ascendant, houses, nakshatras, panchang, dashas - is
   * one implementation rather than two that can drift apart.
   */
  function assembleChart(sample, o) {
    var jdUT = o.jdUT;
    var jdTT = jdUT + deltaT(jdUT) / 86400;
    var T = (jdTT - 2451545.0) / 36525;
    var nut = nutation(T);
    var eps = meanObliquity(T) + nut.deps;
    var ayan = ayanamsa(T, o.ayanamsa || 'lahiri');
    /*
     * The ayanamsa above is measured from the MEAN equinox, while every apparent
     * longitude below is measured from the TRUE equinox. Referring the ayanamsa
     * to the true equinox as well makes nutation cancel out of the subtraction,
     * so a sidereal longitude is a genuinely fixed-star-frame position rather
     * than one that wobbles by up to 17 arcseconds on an 18.6-year cycle. This
     * is the convention Swiss Ephemeris uses, and it must be applied to every
     * body alike or the grahas drift against the nodes.
     */
    var ayanTrue = ayan + nut.dpsi;
    // Grahas arrive as mean tropical longitudes, so they take the plain ayanamsa;
    // the ascendant below is an apparent (true equinox) angle and takes ayanTrue.
    // Listed in the order a Vedic table reads them, with Ketu following Rahu.
    var bodies = [
      { key: 'sun', name: 'Sun' }, { key: 'moon', name: 'Moon' },
      { key: 'mars', name: 'Mars' }, { key: 'jupiter', name: 'Jupiter' },
      { key: 'venus', name: 'Venus' }, { key: 'mercury', name: 'Mercury' },
      { key: 'saturn', name: 'Saturn' }, { key: 'rahu', name: 'Rahu' }
    ];

    // Ascendant and Midheaven, tropical then sidereal.
    var gast = apparentSiderealTime(jdUT, T, nut, eps);
    var lst = norm360(gast + o.longitude);
    var ascTropical = norm360(atan2d(cos(lst), -(sin(lst) * cos(eps) + tan(o.latitude) * sin(eps))));
    var mcTropical = norm360(atan2d(sin(lst), cos(lst) * cos(eps)));
    var asc = norm360(ascTropical - ayanTrue);
    var ascSign = signOf(asc);

    var planets = [];
    for (var i = 0; i < bodies.length; i++) {
      var b = bodies[i];
      // Sampled again half a day on, to report speed and retrogression.
      var lonT = sample(b.key, jdUT);
      var lonT2 = sample(b.key, jdUT + 0.5);
      var speed = norm180(lonT2 - lonT) / 0.5; // degrees per day
      var lon = norm360(lonT - ayan);
      planets.push(makePlanet(b.name, lon, speed, ascSign));
      if (b.key === 'rahu') {
        planets.push(makePlanet('Ketu', norm360(lon + 180), speed, ascSign));
      }
    }

    var find = function (name) {
      for (var p = 0; p < planets.length; p++) if (planets[p].name === name) return planets[p];
      return null;
    };
    var sunLon = find('Sun').longitude, moonLon = find('Moon').longitude;

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
      midheaven: {
        longitude: norm360(mcTropical - ayanTrue),
        sign: signOf(norm360(mcTropical - ayanTrue))
      },
      planets: planets,
      panchang: panchang(sunLon, moonLon, jdUT, o.tzOffsetMinutes || 0),
      dashas: vimshottari(moonLon, jdUT)
    };
  }

  /** Compute a chart from the built-in analytical theories. */
  function chart(o) {
    return assembleChart(function (body, jdUT) {
      return meanTropicalOf(body, jdUT, o.trueNode);
    }, o);
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
      dignity: dignityOf(name, sign, lon - sign * 30),
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
    moonLatitude: moonLatitude,
    declination: declination,
    sunriseSunset: sunriseSunset,
    lunarNode: lunarNode,
    heliocentric: heliocentric,
    perturbation: perturbation,
    apparentLongitude: apparentLongitude,
    ayanamsa: ayanamsa,
    AYANAMSA: AYANAMSA,
    precessFromJ2000: precessFromJ2000,
    chart: chart,
    assembleChart: assembleChart,
    meanTropicalOf: meanTropicalOf,
    nakshatraOf: nakshatraOf,
    navamsaSign: navamsaSign,
    vargaPosition: vargaPosition,
    isVargottama: isVargottama,
    vargaDignity: vargaDignity,
    DASAVARGA: DASAVARGA,
    VARGA_DIGNITY_LABELS: VARGA_DIGNITY_LABELS,
    HORA_LABELS: HORA_LABELS,
    HORA_STRONG: HORA_STRONG,
    TRIMSAMSA_PROXY: TRIMSAMSA_PROXY,
    VARGAS: VARGAS,
    houseOf: houseOf,
    dignityOf: dignityOf,
    housesOwned: housesOwned,
    naturalRelation: naturalRelation,
    temporalRelation: temporalRelation,
    compoundRelation: compoundRelation,
    NATURAL_FRIENDS: NATURAL_FRIENDS,
    RELATION_LABELS: RELATION_LABELS,
    isYogakaraka: isYogakaraka,
    DIGNITY: DIGNITY,
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
