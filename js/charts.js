/*
 * charts.js - draws a kundli as inline SVG, in either regional convention.
 *
 *   North Indian (diamond): houses sit in fixed positions with house 1 at the
 *     top, and the signs rotate to follow the ascendant.
 *   South Indian (square):  signs sit in fixed cells with Aries always second
 *     from the top left, and the houses rotate. The lagna cell is marked.
 */
var Charts = (function () {
  'use strict';

  var SIZE = 440;
  var ABBR = {
    Sun: 'Su', Moon: 'Mo', Mercury: 'Me', Venus: 'Ve', Mars: 'Ma',
    Jupiter: 'Ju', Saturn: 'Sa', Rahu: 'Ra', Ketu: 'Ke', Ascendant: 'As'
  };
  var SIGN_ABBR = ['Ar', 'Ta', 'Ge', 'Cn', 'Le', 'Vi', 'Li', 'Sc', 'Sg', 'Cp', 'Aq', 'Pi'];

  // Each graha gets its own colour, the way a hand-drawn kundli distinguishes
  // them. Kept muted so the chart still sits inside the page's palette; the
  // class names are styled in css/styles.css rather than hard-coded here.
  var SLUG = {
    Sun: 'sun', Moon: 'moon', Mercury: 'mercury', Venus: 'venus', Mars: 'mars',
    Jupiter: 'jupiter', Saturn: 'saturn', Rahu: 'rahu', Ketu: 'ketu', Ascendant: 'lagna'
  };

  /*
   * How far the four inner arcs bow towards the centre, as a fraction of the
   * distance from their chord's midpoint to the middle of the chart.
   *
   * They curve inwards, not outwards: that is what gives the classic pointed
   * arch and, more practically, what leaves the corner triangles wide enough to
   * hold two or three grahas. Bowing the other way would pinch them shut.
   */
  var CURVE_PULL = 0.42;

  // Label anchors for the twelve North Indian houses, as fractions of the box.
  var NORTH_ANCHORS = [
    [0.50, 0.23], [0.25, 0.10], [0.10, 0.25], [0.23, 0.50],
    [0.10, 0.75], [0.25, 0.90], [0.50, 0.77], [0.75, 0.90],
    [0.90, 0.75], [0.77, 0.50], [0.90, 0.25], [0.75, 0.10]
  ];
  // Grid position (col, row) of each sign in the South Indian layout.
  var SOUTH_CELLS = [
    [1, 0], [2, 0], [3, 0], [3, 1], [3, 2], [3, 3],
    [2, 3], [1, 3], [0, 3], [0, 2], [0, 1], [0, 0]
  ];

  function el(name, attrs, text) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (var k in attrs) if (attrs.hasOwnProperty(k)) node.setAttribute(k, attrs[k]);
    if (text != null) node.textContent = text;
    return node;
  }

  function svgRoot(className) {
    var svg = el('svg', {
      viewBox: '0 0 ' + SIZE + ' ' + SIZE,
      class: 'kundli ' + (className || ''),
      role: 'img'
    });
    return svg;
  }

  /*
   * Flags ride together after the abbreviation, retrograde first: "Sa [R][V]".
   * [V] is vargottama, which is D1 against D9 and so does not change when a
   * different division is put on screen.
   */
  function planetText(p) {
    var flags = (p.retrograde ? '[R]' : '') + (p.vargottama ? '[V]' : '');
    return ABBR[p.name] + (flags ? ' ' + flags : '');
  }

  /**
   * Stack a house's occupants around an anchor point. Two columns are used once
   * there are more than three, so a stellium still fits inside its triangle.
   */
  function drawOccupants(group, occupants, cx, cy, maxWidth) {
    var lineHeight = 17;
    var perRow = occupants.length > 3 ? 2 : 1;
    var rows = [];
    for (var i = 0; i < occupants.length; i += perRow) rows.push(occupants.slice(i, i + perRow));
    var top = cy - ((rows.length - 1) * lineHeight) / 2;
    rows.forEach(function (row, r) {
      var y = top + r * lineHeight;
      row.forEach(function (p, c) {
        var offset = perRow === 1 ? 0 : (c === 0 ? -maxWidth / 4 : maxWidth / 4);
        var t = el('text', {
          x: (cx + offset).toFixed(1), y: y.toFixed(1),
          class: 'planet graha-' + (SLUG[p.name] || 'other') + (p.retrograde ? ' retro' : ''),
          'text-anchor': 'middle'
        }, planetText(p));
        group.appendChild(t);
      });
    });
  }

  /**
   * Occupants of each sign in a given division, 0 = Aries.
   *
   * `reference` names what house 1 should be: the ascendant, or a graha whose
   * own sign becomes the first house. Rotating that way is how a chart is read
   * from the Moon or from any other graha, and it is the sign in the chosen
   * division that counts, not the one in D1.
   */
  function occupantsBySign(planets, ascLongitude, division, reference) {
    var bySign = [];
    for (var i = 0; i < 12; i++) bySign.push([]);
    var signOfBody = function (longitude) {
      return Astro.vargaPosition(longitude, division || 1).sign;
    };

    planets.forEach(function (p) {
      bySign[signOfBody(p.longitude)].push({
        name: p.name, retrograde: p.retrograde, longitude: p.longitude,
        vargottama: Astro.isVargottama(p.longitude)
      });
    });
    var ascSign = signOfBody(ascLongitude);
    bySign[ascSign].unshift({
      name: 'Ascendant', retrograde: false, longitude: ascLongitude,
      vargottama: Astro.isVargottama(ascLongitude)
    });

    var firstSign = ascSign;
    if (reference && reference !== 'Ascendant') {
      var anchor = planets.filter(function (p) { return p.name === reference; })[0];
      if (anchor) firstSign = signOfBody(anchor.longitude);
    }
    return { bySign: bySign, ascSign: ascSign, firstSign: firstSign };
  }

  function renderNorth(container, planets, ascLongitude, division, reference) {
    var data = occupantsBySign(planets, ascLongitude, division, reference);
    var svg = svgRoot('north');
    var m = 4, s = SIZE - 2 * m;
    var P = function (fx, fy) { return (m + fx * s).toFixed(1) + ',' + (m + fy * s).toFixed(1); };

    svg.appendChild(el('rect', { x: m, y: m, width: s, height: s, class: 'frame frame-outer' }));
    [[0, 0, 1, 1], [1, 0, 0, 1]].forEach(function (d) {
      svg.appendChild(el('line', {
        x1: m + d[0] * s, y1: m + d[1] * s, x2: m + d[2] * s, y2: m + d[3] * s, class: 'frame'
      }));
    });
    /*
     * The inner figure: four quadratic arcs between the midpoints of the sides,
     * each pulled towards the centre. Drawn as one closed path so the join at
     * every midpoint stays a clean cusp.
     */
    var mid = [[0.5, 0], [1, 0.5], [0.5, 1], [0, 0.5]];
    var control = function (a, b) {
      var mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
      return P(mx + (0.5 - mx) * CURVE_PULL, my + (0.5 - my) * CURVE_PULL);
    };
    var d = 'M ' + P(mid[0][0], mid[0][1]);
    for (var k = 0; k < 4; k++) {
      var from = mid[k], to = mid[(k + 1) % 4];
      d += ' Q ' + control(from, to) + ' ' + P(to[0], to[1]);
    }
    svg.appendChild(el('path', { d: d + ' Z', class: 'frame frame-inner' }));

    for (var h = 0; h < 12; h++) {
      var sign = (data.firstSign + h) % 12;
      var a = NORTH_ANCHORS[h];
      var cx = m + a[0] * s, cy = m + a[1] * s;
      var g = el('g', { class: 'house' + (h === 0 ? ' first-house' : '') });
      // Sign number, the way it is written on a hand-drawn North Indian chart.
      g.appendChild(el('text', {
        x: cx, y: cy - 20, class: 'sign-num', 'text-anchor': 'middle'
      }, String(sign + 1)));
      drawOccupants(g, data.bySign[sign], cx, cy + 4, 0.20 * s);
      g.appendChild(el('title', {}, 'House ' + (h + 1) + ' - ' + Astro.SIGNS[sign] +
        ' (' + Astro.SIGNS_SA[sign] + ')'));
      svg.appendChild(g);
    }
    container.innerHTML = '';
    container.appendChild(svg);
  }

  function renderSouth(container, planets, ascLongitude, division, reference) {
    var data = occupantsBySign(planets, ascLongitude, division, reference);
    var svg = svgRoot('south');
    var m = 4, cell = (SIZE - 2 * m) / 4;

    for (var i = 0; i < 12; i++) {
      var pos = SOUTH_CELLS[i];
      var x = m + pos[0] * cell, y = m + pos[1] * cell;
      var house = ((i - data.firstSign) % 12 + 12) % 12 + 1;
      var g = el('g', { class: 'house' + (i === data.firstSign ? ' first-house' : '') });
      g.appendChild(el('rect', {
        x: x, y: y, width: cell, height: cell,
        rx: i === data.firstSign ? 8 : 0, class: 'cell'
      }));
      if (i === data.ascSign) {
        // The lagna mark stays on the ascendant even when the chart is rotated.
        // Traditional lagna mark: a short diagonal across the cell's corner.
        g.appendChild(el('line', {
          x1: x, y1: y, x2: x + cell * 0.3, y2: y + cell * 0.3, class: 'lagna-mark'
        }));
      }
      g.appendChild(el('text', { x: x + cell - 6, y: y + 14, class: 'sign-num', 'text-anchor': 'end' },
        SIGN_ABBR[i] + ' · ' + house));
      drawOccupants(g, data.bySign[i], x + cell / 2, y + cell / 2 + 6, cell * 0.82);
      g.appendChild(el('title', {}, Astro.SIGNS[i] + ' (' + Astro.SIGNS_SA[i] + ') - house ' + house));
      svg.appendChild(g);
    }
    // The blank 2x2 middle, left open as convention has it.
    svg.appendChild(el('rect', { x: m + cell, y: m + cell, width: cell * 2, height: cell * 2, class: 'middle' }));
    container.innerHTML = '';
    container.appendChild(svg);
  }

  function render(container, opts) {
    var fn = opts.style === 'south' ? renderSouth : renderNorth;
    fn(container, opts.planets, opts.ascendant, opts.division || 1, opts.reference);
  }

  return { render: render, ABBR: ABBR, SIGN_ABBR: SIGN_ABBR };
})();
