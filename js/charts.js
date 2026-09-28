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
   * [V] means this division has landed the graha back in the sign it holds in the
   * rashi, so it belongs to the division on screen and never appears on D1, where
   * every graha would qualify. [Y] is yogakaraka, lordship counted from house 1,
   * so it follows the rotation. [C] is combustion, a real distance from the Sun
   * and so fixed.
   */
  function planetText(p) {
    var flags = (p.retrograde ? '[R]' : '') + (p.vargottama ? '[V]' : '') +
      (p.yogakaraka ? '[Y]' : '') + (p.combust ? '[C]' : '');
    return Astro.grahaAbbr(p.name) + (flags ? ' ' + flags : '');
  }

  /**
   * Stack a house's occupants around an anchor point. Two columns are used once
   * there are more than three, so a stellium still fits inside its triangle.
   */
  /*
   * Everything true of this graha in this chart and this rotation, handed to
   * the hover card as data rather than rendered here. The label can only carry
   * initials and a bracket or two; the card has room for the sign, the states
   * spelled out and the yogas as a list.
   *
   * There was a tooltip on the house instead, naming the sign - which told a
   * reader what the chart already showed and nothing about the graha they were
   * pointing at.
   */
  /* Combustion is a real distance, so it is read from the rashi Sun whatever
     division is on screen. */
  function sunOf(planets) {
    return planets.filter(function (p) { return p.name === 'Sun'; })[0] ||
      { longitude: 0 };
  }

  var STATE_NAMES = { R: 'Retrograde', C: 'Combust', V: 'Vargottama',
    Y: 'Yogakaraka', P: 'Papa kartari', S: 'Shubha kartari' };

  /*
   * Records are separated by one control character and their two fields by
   * another, because a yoga's own account of itself contains commas, pipes and
   * semicolons and would be cut in half by any of them.
   */
  var REC = '\u001e', FLD = '\u001f';

  function describeOccupant(p, sign, house, yogas, sun, division, dignities,
                            hemming) {
    var states = [];
    /*
     * Each state says why it applies here, not merely that it does. The chart
     * has room for a letter; the card has room for the reason.
     */
    var why = {};
    if (p.retrograde) {
      states.push('R');
      why.R = 'Moving backwards against the signs.';
    }
    if (p.combust) {
      states.push('C');
      var orb = (Astro.COMBUSTION[p.name] || {})[p.retrograde ? 'retrograde' : 'direct'];
      var gap = Math.abs(Astro.norm360(p.longitude - sun.longitude) > 180
        ? 360 - Astro.norm360(p.longitude - sun.longitude)
        : Astro.norm360(p.longitude - sun.longitude));
      why.C = gap.toFixed(1) + '\u00b0 from the Sun, inside the ' + orb +
        '\u00b0 this graha is burnt within.';
    }
    if (p.vargottama) {
      states.push('V');
      why.V = 'This division lands it in the sign it already holds in the rashi.';
    }
    if (p.yogakaraka) {
      states.push('Y');
      why.Y = 'Owns both an angle and a trine, counted from house 1 of this chart.';
    }
    /*
     * Hemmed between one kind on both sides. The graha table has carried these
     * from the start and the card did not, so a chart could mark a graha [P] in
     * one place and say nothing about it in the other.
     */
    var hemmed = hemming && hemming[p.name];
    if (hemmed) {
      states.push(hemmed.mark);
      why[hemmed.mark] = hemmed.why;
    }
    var where = Astro.SIGNS[sign] + ' (' + Astro.SIGNS_SA[sign] + ')' +
      (p.name === 'Ascendant' ? '' : ', house ' + house);
    var mine = (yogas && yogas[p.name]) || [];
    return {
      graha: p.name,
      where: where,
      /*
       * How the graha stands in the sign it occupies: its dignity where it has
       * one, and how it regards the lord of that sign otherwise. Worked out in
       * app.js, which holds the rashi positions the friendship is read from -
       * temporal relation is counted in the rashi even when a division is on
       * screen, so it cannot be derived from the recast chart here.
       */
      dignity: (dignities && dignities[p.name]) || '',
      states: states.map(function (k) { return k + FLD + (why[k] || ''); }).join(REC),
      yogas: mine.map(function (y) {
        // title, why it holds here, and the pair that names its passage
        return [y.title, y.summary || '', y.subject || '', y.condition || '']
          .join(FLD);
      }).join(REC),
      /* One flat sentence, for anyone reading by ear rather than by hover. */
      label: p.name + ' in ' + where +
        (states.length ? '. ' + states.map(function (k) { return STATE_NAMES[k]; }).join(', ') : '') +
        (mine.length ? '. ' + mine.map(function (y) { return y.title; }).join(', ') : '')
    };
  }

  var LINE_HEIGHT = 17;

  /**
   * Returns the y of the first row, so a caller can keep something clear of it.
   */
  function drawOccupants(group, occupants, cx, cy, maxWidth, ctx) {
    var lineHeight = LINE_HEIGHT;
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
          class: 'planet graha-' + (SLUG[p.name] || 'other'),
          'text-anchor': 'middle'
        }, planetText(p));
        if (ctx) {
          var d = describeOccupant(p, ctx.sign, ctx.house, ctx.yogas, ctx.sun,
            ctx.division, ctx.dignities, ctx.hemming);
          t.setAttribute('data-graha', d.graha);
          t.setAttribute('data-where', d.where);
          if (d.dignity) t.setAttribute('data-dignity', d.dignity);
          t.setAttribute('data-states', d.states);
          t.setAttribute('data-yogas', d.yogas);
          // Hoverable by mouse, reachable by keyboard, legible to a reader.
          t.setAttribute('tabindex', '0');
          t.setAttribute('aria-label', d.label);
        }
        group.appendChild(t);
      });
    });
    return top;
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
    var ascSign = signOfBody(ascLongitude);
    // Longitudes here are the rashi ones; the varga is applied for the picture
    // only, so combustion is measured on the real distance from the Sun.
    var sun = planets.filter(function (p) { return p.name === 'Sun'; })[0];
    /*
     * Whether this division repeats the rashi sign is a question about the
     * division, so it is asked of whichever one is drawn and never of D1, where
     * the answer is yes for everything and says nothing.
     */
    var repeatsRashi = function (longitude) {
      return !!division && division !== 1 &&
        signOfBody(longitude) === Astro.signOf(longitude);
    };

    /*
     * Whatever house 1 actually is in the chart being drawn: the ascendant, or
     * the sign of the graha it has been rotated onto, in the division on show.
     * Worked out before the occupants because the yogakaraka flag depends on it.
     */
    var firstSign = ascSign;
    if (reference && reference !== 'Ascendant') {
      var anchor = planets.filter(function (p) { return p.name === reference; })[0];
      if (anchor) firstSign = signOfBody(anchor.longitude);
    }

    planets.forEach(function (p) {
      bySign[signOfBody(p.longitude)].push({
        name: p.name, retrograde: p.retrograde, longitude: p.longitude,
        /*
         * Owning both an angle and a trine, counted from whatever house 1 is in
         * this chart rather than fixed to the rashi lagna.
         *
         * The classical definition is from the ascendant, and chapter 34 words
         * every example that way - "For Libra ascendant, Saturn ... owns the 4th
         * (an angle) and the 5th (a trine)". Rotating is the deliberate act of
         * reading the chart from somewhere else, though, and the houses, the
         * lords and the House column all move when it happens. A flag that
         * stayed put would be answering a question about a chart nobody is
         * looking at. On the default view, house 1 is the ascendant and this is
         * the classical yogakaraka.
         */
        vargottama: repeatsRashi(p.longitude),
        yogakaraka: Astro.isYogakaraka(p.name, firstSign),
        // Burnt by the Sun, within the orb chapter 4 gives for that graha.
        combust: !!sun && Astro.isCombust(p.name, p.longitude, sun.longitude, p.retrograde)
      });
    });
    // The lagna is a point, not a graha, so it owns nothing and is never one.
    bySign[ascSign].unshift({
      name: 'Ascendant', retrograde: false, longitude: ascLongitude,
      vargottama: repeatsRashi(ascLongitude), yogakaraka: false, combust: false
    });

    return { bySign: bySign, ascSign: ascSign, firstSign: firstSign };
  }

  function renderNorth(container, planets, ascLongitude, division, reference, yogas,
                       dignities, hemming) {
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
      /*
       * Occupants first, because the sign number has to clear them.
       *
       * The stack is centred on its anchor and grows in both directions, so it
       * climbs towards the number as a house fills. At three rows the gap was
       * seven pixels against fourteen-pixel text and the number was struck
       * through; at four it sat behind the first graha entirely.
       *
       * The stack stays where it is - it is centred for balance, and pushing it
       * down would run it out of the triangle in the lower houses - and the
       * number steps up instead, only as far as it must, and never out of the
       * box.
       */
      var occ = data.bySign[sign];
      var rowCount = Math.ceil(occ.length / (occ.length > 3 ? 2 : 1)) || 1;
      var idealTop = cy + 4 - ((rowCount - 1) * LINE_HEIGHT) / 2;
      var numY = Math.min(cy - 20, idealTop - LINE_HEIGHT);
      /*
       * In the corner houses the anchor sits close to the top edge, so a tall
       * stack can want the number further up than the box allows. Where that
       * happens the stack gives way instead and slides down by the shortfall:
       * there is always room below a corner anchor and never above it. The gap
       * is then one line height in every house, at every count.
       */
      var shortfall = Math.max(0, (m + 12) - numY);
      numY += shortfall;
      drawOccupants(g, occ, cx, cy + 4 + shortfall, 0.20 * s,
        { sign: sign, house: h + 1, yogas: yogas, sun: sunOf(planets),
          dignities: dignities,
          hemming: hemming });
      g.appendChild(el('text', {
        x: cx, y: numY.toFixed(1), class: 'sign-num', 'text-anchor': 'middle'
      }, String(sign + 1)));
      svg.appendChild(g);
    }
    container.innerHTML = '';
    container.appendChild(svg);
  }

  function renderSouth(container, planets, ascLongitude, division, reference, yogas,
                       dignities, hemming) {
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
        Astro.SIGN_ABBR[i] + ' · ' + house));
      drawOccupants(g, data.bySign[i], x + cell / 2, y + cell / 2 + 6, cell * 0.82,
        { sign: i, house: house, yogas: yogas, sun: sunOf(planets),
          dignities: dignities,
          hemming: hemming });
      svg.appendChild(g);
    }
    // The blank 2x2 middle, left open as convention has it.
    svg.appendChild(el('rect', { x: m + cell, y: m + cell, width: cell * 2, height: cell * 2, class: 'middle' }));
    container.innerHTML = '';
    container.appendChild(svg);
  }

  function render(container, opts) {
    var fn = opts.style === 'south' ? renderSouth : renderNorth;
    fn(container, opts.planets, opts.ascendant, opts.division || 1, opts.reference,
       opts.yogas, opts.dignities, opts.hemming);
  }

  return { render: render };
})();
