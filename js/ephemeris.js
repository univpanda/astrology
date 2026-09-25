/*
 * ephemeris.js - turn astro_ephemeris rows into graha longitudes.
 *
 * The table stores MEAN tropical longitude, so a sidereal longitude is just
 * `stored - ayanamsa`. Nutation never enters: it cancels between an apparent
 * longitude and a true-equinox ayanamsa, so storing mean values sidesteps the
 * whole question (see the Swiss Ephemeris notes in js/astro.js).
 *
 * Plain ES5 with no imports so the same file runs in the browser, in Node and in
 * a Deno edge function.
 */
var Ephemeris = (function () {
  'use strict';

  /** Decode a base64 payload of Int32 little-endian hundred-thousandths of a degree. */
  function decode(base64) {
    var binary = typeof atob === 'function'
      ? atob(base64)
      : Buffer.from(base64, 'base64').toString('binary');
    var n = binary.length / 4;
    var out = new Float64Array(n);
    for (var i = 0; i < n; i++) {
      var b0 = binary.charCodeAt(i * 4), b1 = binary.charCodeAt(i * 4 + 1);
      var b2 = binary.charCodeAt(i * 4 + 2), b3 = binary.charCodeAt(i * 4 + 3);
      var v = (b0 | (b1 << 8) | (b2 << 16) | (b3 << 24));
      out[i] = v / 1e5;
    }
    return out;
  }

  /** Catmull-Rom, matching the interpolation js/astro.js uses for corrections. */
  function catmull(p0, p1, p2, p3, f) {
    return p1 + 0.5 * f * (p2 - p0 +
      f * (2 * p0 - 5 * p1 + 4 * p2 - p3 + f * (3 * (p1 - p2) + p3 - p0)));
  }

  /**
   * Mean tropical longitude of one body at `jd`, from a decoded row.
   * Returns null when jd falls outside the row, which the caller should treat as
   * "fetch a different decade", never as zero.
   */
  function longitudeAt(row, jd) {
    var samples = row.samples || (row.samples = decode(row.longitudes));
    var x = (jd - row.first_jd) / row.step_days;
    var i = Math.floor(x);
    if (i < 1 || i > samples.length - 3) return null;
    var f = x - i;

    // Samples wrap through 360, so lift the neighbours onto one continuous
    // branch around p1 before interpolating; otherwise a birth near 0 degrees
    // interpolates across the whole zodiac.
    var p1 = samples[i];
    var unwrap = function (v) {
      while (v - p1 > 180) v -= 360;
      while (v - p1 < -180) v += 360;
      return v;
    };
    var value = catmull(unwrap(samples[i - 1]), p1, unwrap(samples[i + 1]), unwrap(samples[i + 2]), f);
    return ((value % 360) + 360) % 360;
  }

  /** Which decade row covers this moment. */
  function decadeFor(jd, calendarDate) {
    var year = calendarDate(jd).y;
    return Math.floor(year / 10) * 10;
  }

  return { decode: decode, longitudeAt: longitudeAt, decadeFor: decadeFor };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Ephemeris;
