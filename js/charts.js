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

  /*
   * Label anchors for the twelve North Indian houses, as fractions of the box.
   *
   * Each is the middle of its house: the centroid's row, and the middle of the
   * span that row has inside the house. Measured off the same arcs the chart
   * draws rather than chosen by eye, because the two differ by enough to
   * matter - the four inner houses were anchored a fiftieth of the box towards
   * their outer tip, which is where they are narrowest.
   *
   * They sat there to dodge the sign numbers, which used to stand in the
   * middle of each house. The numbers moved to the rim and the anchors did
   * not, so the grahas went on avoiding something that was no longer there.
   */
  var NORTH_ANCHORS = [
    [0.500, 0.278], [0.277, 0.104], [0.138, 0.275], [0.251, 0.500],
    [0.138, 0.725], [0.277, 0.896], [0.500, 0.722], [0.723, 0.896],
    [0.862, 0.725], [0.749, 0.500], [0.862, 0.275], [0.723, 0.104]
  ];
  /*
   * How far a stack may run up and down inside each house, as fractions of the
   * box: the reach at full size, and how much further it reaches for each
   * whole step the type is shrunk by.
   *
   * There are two numbers because the band is not fixed. It is the span over
   * which every row is still at least as wide as the longest label the chart
   * draws - "Ve [R][V][E]", about a fifth of the box - and a smaller label
   * needs less width, so it fits further towards the tip. The houses differ in
   * both: the eight against a corner start tightest and open up fastest, the
   * four from a side midpoint to a corner start widest and open up slowest.
   *
   * Measured off the arcs the chart draws, at a label width padded by a
   * twelfth, since the label width is itself an estimate and a row that clears
   * by a fraction of a pixel is clearing by luck. Against the unpadded width
   * every row of every house then clears by at least five pixels, from two
   * grahas in a house up to all nine.
   */
  var NORTH_FIT = [
    [0.167, 0.315], [0.162, 0.241], [0.120, 0.417], [0.199, 0.185],
    [0.120, 0.417], [0.162, 0.241], [0.167, 0.315], [0.162, 0.241],
    [0.120, 0.417], [0.199, 0.185], [0.120, 0.417], [0.162, 0.241]
  ];
  /*
   * Sign numbers gather at the four places where three houses meet. At each
   * side the two corner-house signs sit along the rim and the angle-house sign
   * sits just inside the midpoint: the same three-part pattern rotated four
   * times, rather than twelve labels competing with twelve occupant stacks.
   */
  var NORTH_SIGN_ANCHORS = [
    [0.500, 0.080], [0.445, 0.033], [0.033, 0.445], [0.080, 0.500],
    [0.033, 0.555], [0.445, 0.967], [0.500, 0.920], [0.555, 0.967],
    [0.967, 0.555], [0.920, 0.500], [0.967, 0.445], [0.555, 0.033]
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
   * so it follows the rotation. [C] is combustion, measured by default inside
   * whichever division is drawn, so that every mark on a chart is a fact about
   * that chart; the setting offers the rashi distance carried in, which is what
   * the texts ask for.
   */
  /*
   * Short marks for a dignity, drawn on the chart beside the states.
   *
   * Own sign is deliberately absent: a graha in its own sign is its own
   * dispositor, which the card's Dispositor line already says, and a mark for
   * it would be a fourth letter saying what another line says anyway.
   */
  var DIGNITY_MARKS = { Exalted: 'E', Debilitated: 'D', Mooltrikona: 'M' };

  function planetText(p) {
    var flags = (p.retrograde ? '[R]' : '') + (p.vargottama ? '[V]' : '') +
      (p.yogakaraka ? '[Y]' : '') + (p.combust ? '[C]' : '');
    return Astro.grahaAbbr(p.name) + (flags ? ' ' + flags : '');
  }

  function drawPlanetText(node, p, dignity) {
    var text = planetText(p);
    var mark = DIGNITY_MARKS[dignity];
    node.appendChild(document.createTextNode(text));
    if (mark) node.appendChild(el('tspan', {
      class: 'flag flag-' + mark.toLowerCase()
    }, (text.indexOf('[') < 0 ? ' ' : '') + '[' + mark + ']'));
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
  var STATE_NAMES = { R: 'Retrograde', C: 'Combust', V: 'Vargottama',
    Y: 'Yogakaraka', X: 'Exchange of signs' };

  /*
   * Records are separated by one control character and their two fields by
   * another, because a yoga's own account of itself contains commas, pipes and
   * semicolons and would be cut in half by any of them.
   */
  var REC = '\u001e', FLD = '\u001f';

  function describeOccupant(p, sign, house, yogas, division, dignities,
                            ruling, karakas) {
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
      /*
       * The frame is named, not assumed. On the default the distance is the
       * real one and the mark is carried into whatever division is drawn, so a
       * card that said only "8 degrees from the Sun" beside a D9 where the Sun
       * sits across the chart would be describing a chart nobody is looking at.
       */
      why.C = (typeof p.combustGap !== 'number' ? '' : p.combustGap.toFixed(1) +
        '\u00b0 from the Sun in ' + p.combustIn + ', inside the ' + orb +
        '\u00b0 this graha is burnt within.');
    }
    if (p.vargottama) {
      states.push('V');
      why.V = 'This division lands it in the sign it already holds in the rashi.';
    }
    if (p.yogakaraka) {
      states.push('Y');
      why.Y = 'Owns both an angle and a trine, counted from house 1 of this chart.';
    }
    var where = Astro.SIGNS[sign] + ' (' + Astro.SIGNS_SA[sign] + ')' +
      (p.name === 'Ascendant' ? '' : ', house ' + house);

    /*
     * Where it stands, to the minute, in the chart being drawn. A varga
     * position is the rashi one stretched and wrapped, so this follows the
     * division on screen: every figure on a chart should be a fact about that
     * chart.
     */
    var placed = Astro.vargaPosition(p.longitude, division || 1);
    var within = placed ? Astro.norm360(placed.longitude) % 30 : p.longitude % 30;
    var deg = Math.floor(within);
    var rest = (within - deg) * 60;
    var min = Math.floor(rest);
    var sec = Math.round((rest - min) * 60);
    if (sec === 60) { sec = 0; min += 1; }
    if (min === 60) { min = 0; deg += 1; }
    var degree = deg + '\u00b0' + String(min).padStart(2, '0') + '\u2032' +
      String(sec).padStart(2, '0') + '\u2033';

    /*
     * Nakshatra, its lord and the KP sub lord, all read from the rashi
     * longitude whatever division is drawn. They are divisions of the 360
     * degrees themselves rather than of a sign, so a varga has no nakshatra of
     * its own to report.
     */
    var nak = Astro.nakshatraOf(p.longitude);
    var mine = (yogas && yogas[p.name]) || [];
    var exchange = mine.filter(function (y) { return y.subject === 'Parivartana'; })[0];
    if (exchange) {
      states.push('X');
      why.X = exchange.summary || 'This graha and its dispositor occupy each other\u2019s signs.';
    }
    var standing = (dignities && dignities[p.name]) || {};
    /*
     * The dispositor is the lord of the sign occupied, which is true of the
     * nodes and of the ascendant as much as of a graha. Neither carries a
     * friendship, being outside the scheme the relation is read from, so they
     * get the name and no bracket - where before they got no line at all, and
     * the lagnesha is not a thing to leave a reader to work out.
     */
    var dispositor = standing.lord || Astro.SIGN_LORDS[sign];
    return {
      graha: p.name,
      where: where,
      degree: degree,
      house: p.name === 'Ascendant' ? '' : 'House ' + house,
      signName: Astro.SIGNS[sign],
      nakshatra: nak.name + ' ' + nak.pada,
      nakLord: nak.lord,
      subLord: nak.subLord,
      dispositor: dispositor || '',
      karaka: (karakas && karakas[p.name]) || '',
      nakLordRelation: standing.nakLordRelation || '',
      subLordRelation: standing.subLordRelation || '',
      dispositorRelation: standing.relation || '',
      /*
       * How the graha stands in the sign it occupies: its dignity where it has
       * one, and how it regards the lord of that sign otherwise. Worked out in
       * app.js, which holds the rashi positions the friendship is read from -
       * temporal relation is counted in the rashi even when a division is on
       * screen, so it cannot be derived from the recast chart here.
       */
      dignity: standing.formal || '',
      /*
       * Which houses it rules and which grahas look at it, both counted from
       * this chart's house 1. Worked out in app.js, which knows the rotation.
       */
      rules: (ruling && ruling[p.name] && ruling[p.name].rules) || '',
      seenBy: (ruling && ruling[p.name] && ruling[p.name].seenBy) || '',
      directional: p.name !== 'Ascendant' && Astro.hasDigBala(p.name, house),
      states: states.map(function (k) { return k + FLD + (why[k] || ''); }).join(REC),
      yogas: mine.map(function (y) {
        // title, why it holds here, the pair that names its passage, and the
        // graha whose yoga it is - which is not always the one being hovered.
        return [y.title, y.summary || '', y.subject || '', y.condition || '',
          y.graha || '', (y.from || []).join(','), y.route || '',
          y.division || 1, y.primaryReference || 'Ascendant'].join(FLD);
      }).join(REC),
      /* One flat sentence, for anyone reading by ear rather than by hover. */
      label: p.name + ' in ' + where +
        (standing.formal ? '. ' + standing.formal : '') +
        (states.length ? '. ' + states.map(function (k) { return STATE_NAMES[k]; }).join(', ') : '') +
        (mine.length ? '. ' + mine.map(function (y) {
          return y.title + (y.from && y.from.length ? ', from ' + y.from.map(function (name) {
            // Spoken in full. The card shortens it to fit a column; a label
            // that is read out has no column and nothing to gain by it.
            return name === 'Ascendant' ? 'the ascendant' : name;
          }).join(' and ') : '');
        }).join(', ') : '')
    };
  }

  function setCardData(target, d) {
    target.setAttribute('data-graha', d.graha);
    target.setAttribute('data-where', d.where);
    target.setAttribute('data-degree', d.degree);
    if (d.house) target.setAttribute('data-house', d.house);
    target.setAttribute('data-sign', d.signName);
    target.setAttribute('data-nakshatra', d.nakshatra);
    target.setAttribute('data-nak-lord', d.nakLord);
    target.setAttribute('data-sub-lord', d.subLord);
    if (d.karaka) target.setAttribute('data-karaka', d.karaka);
    if (d.nakLordRelation) target.setAttribute('data-nak-lord-relation', d.nakLordRelation);
    if (d.subLordRelation) target.setAttribute('data-sub-lord-relation', d.subLordRelation);
    if (d.dispositor) target.setAttribute('data-dispositor', d.dispositor);
    if (d.dispositorRelation) target.setAttribute('data-dispositor-relation', d.dispositorRelation);
    if (d.dignity) target.setAttribute('data-dignity', d.dignity);
    if (d.rules) target.setAttribute('data-rules', d.rules);
    if (d.seenBy) target.setAttribute('data-seen-by', d.seenBy);
    if (d.directional) target.setAttribute('data-directional', 'true');
    target.setAttribute('data-states', d.states);
    target.setAttribute('data-yogas', d.yogas);
    target.setAttribute('tabindex', '0');
    target.setAttribute('aria-label', d.label);
  }

  var LINE_HEIGHT = 17;
  /* Matches svg.kundli .planet in the stylesheet, which is what a stack of one
     is drawn at; a crowded house is drawn at a fraction of it. */
  var PLANET_FONT = 15.5;

  /**
   * Stack a house's occupants on one anchor, one to a line.
   *
   * Two to a line was the old arrangement once a house held more than three,
   * with the columns put half a label apart - the width passed in was about
   * what one label takes, and the offsets were a quarter of it either way.
   * They overlapped whenever a label carried a bracket, which every graha in a
   * dignity or a state now does: "Me [D]" was drawn through "Ve [R][E]".
   *
   * One to a line cannot overlap sideways whatever a label grows to carry. The
   * cost is height, and a house has only so much of it before it narrows past
   * a label's width, so a crowd is set smaller: `fit` is how far the stack may
   * run and how much further each step of shrinking buys, and the type shrinks
   * until the rows fit. Line height and font shrink together, so the lines
   * cannot close up on each other either.
   *
   * Returns the y of the first row, so a caller can keep something clear of it.
   */
  function drawOccupants(group, occupants, cx, cy, fit, ctx) {
    /*
     * Solved rather than searched: the rows take (n-1) line heights at the
     * scale chosen, and the room for them is the reach plus what the shrinking
     * itself opens up, which is the same unknown on both sides.
     */
    var scale = occupants.length > 1
      ? Math.min(1, (fit[0] + fit[1]) /
          ((occupants.length - 1) * LINE_HEIGHT + fit[1])) : 1;
    var lineHeight = LINE_HEIGHT * scale;
    // SVG puts text on its baseline, so the block sits low by about a third of
    // its own size unless it is lifted; the lift shrinks with the type.
    var top = cy + PLANET_FONT * scale * 0.26 -
      ((occupants.length - 1) * lineHeight) / 2;
    occupants.forEach(function (p, r) {
      var t = el('text', {
        x: cx.toFixed(1), y: (top + r * lineHeight).toFixed(1),
        class: 'planet graha-' + (SLUG[p.name] || 'other'),
        'text-anchor': 'middle'
      });
      if (scale < 1) {
        // Inline, because the class rule in the stylesheet outranks both an
        // inherited size and a presentation attribute.
        t.setAttribute('style',
          'font-size:' + (PLANET_FONT * scale).toFixed(1) + 'px');
      }
      var dignity = ctx && ctx.dignities && ctx.dignities[p.name]
        ? ctx.dignities[p.name].formal : '';
      drawPlanetText(t, p, dignity);
      if (ctx) {
        var d = describeOccupant(p, ctx.sign, ctx.house, ctx.yogas,
          ctx.division, ctx.dignities, ctx.ruling, ctx.karakas);
        setCardData(t, d);
      }
      group.appendChild(t);
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
  function occupantsBySign(planets, ascLongitude, division, reference, combustion) {
    var bySign = [];
    for (var i = 0; i < 12; i++) bySign.push([]);
    var signOfBody = function (longitude) {
      return Astro.vargaPosition(longitude, division || 1).sign;
    };
    var ascSign = signOfBody(ascLongitude);
    var sun = planets.filter(function (p) { return p.name === 'Sun'; })[0];

    /*
     * Where the distance from the Sun is measured. Both longitudes come from
     * the same frame or the figure means nothing, so this returns a pair.
     *
     * The default is to measure inside whichever division is drawn, so that
     * every mark on a chart is a fact about that chart. A graha marked burnt
     * beside a Sun twelve signs away reads as a fault in the page, and the
     * rashi answer is one setting away for anyone who wants it.
     *
     * It is a choice against the texts rather than out of them, and the note on
     * the setting says so rather than leaving it to be discovered. Parashara,
     * ch.6: "The divisions of a combust planet ... be all ignored to be
     * auspicious" - a combust graha has divisions, where the divisions do not
     * each have a combustion. The arithmetic pulls the same way: a varga
     * longitude is a rashi position stretched nine or ten times and wrapped, so
     * two of them land near each other about as often as two unrelated numbers
     * would. Over 720 charts every graha comes out combust in 5 to 9 per cent
     * of divisions whatever its orb or its orbit, and Mercury - really within
     * 14 degrees of the Sun in 42 per cent of charts, never straying much past
     * 28 - drops to 5.
     */
    var burnAt = function (longitude) {
      return combustion !== 'rashi' && division && division !== 1
        ? Astro.vargaPosition(longitude, division).longitude
        : longitude;
    };
    var sunBurn = sun ? burnAt(sun.longitude) : null;
    var gapFrom = function (longitude) {
      var apart = Math.abs(Astro.norm360(burnAt(longitude) - sunBurn));
      return apart > 180 ? 360 - apart : apart;
    };
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
        combust: !!sun && Astro.isCombust(p.name, burnAt(p.longitude), sunBurn,
          p.retrograde),
        combustGap: sun ? gapFrom(p.longitude) : null,
        combustIn: combustion !== 'rashi' && division && division !== 1
          ? 'D' + division : 'the rashi'
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
                       dignities, ruling, combustion, karakas) {
    var data = occupantsBySign(planets, ascLongitude, division, reference, combustion);
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
      var occ = data.bySign[sign];
      drawOccupants(g, occ, cx, cy, [NORTH_FIT[h][0] * s, NORTH_FIT[h][1] * s],
        { sign: sign, house: h + 1, yogas: yogas,
          division: division,
          dignities: dignities,
          karakas: karakas,
          ruling: ruling });
      var numberAt = NORTH_SIGN_ANCHORS[h];
      g.appendChild(el('text', {
        x: (m + numberAt[0] * s).toFixed(1),
        y: (m + numberAt[1] * s).toFixed(1),
        class: 'sign-num', 'text-anchor': 'middle'
      }, String(sign + 1)));
      svg.appendChild(g);
    }
    container.innerHTML = '';
    container.appendChild(svg);
  }

  function renderSouth(container, planets, ascLongitude, division, reference, yogas,
                       dignities, ruling, combustion, karakas) {
    var data = occupantsBySign(planets, ascLongitude, division, reference, combustion);
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
      /*
       * The reach is the cell less the strip the sign number holds at the top
       * and a margin at the foot. Nothing is gained by shrinking here: a cell
       * is square, so it is no wider in the middle than at the ends.
       */
      drawOccupants(g, data.bySign[i], x + cell / 2, y + cell / 2 + 2, [cell - 32, 0],
        { sign: i, house: house, yogas: yogas,
          division: division,
          dignities: dignities,
          karakas: karakas,
          ruling: ruling });
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
       opts.yogas, opts.dignities, opts.ruling, opts.combustion,
       opts.karakas);
  }

  function decorateCardTarget(target, opts, name) {
    var data = occupantsBySign(opts.planets, opts.ascendant, opts.division || 1,
      opts.reference, opts.combustion);
    for (var sign = 0; sign < data.bySign.length; sign++) {
      for (var i = 0; i < data.bySign[sign].length; i++) {
        var p = data.bySign[sign][i];
        if (p.name !== name) continue;
        var house = ((sign - data.firstSign) % 12 + 12) % 12 + 1;
        setCardData(target, describeOccupant(p, sign, house, opts.yogas,
          opts.division || 1, opts.dignities, opts.ruling, opts.karakas));
        return;
      }
    }
  }

  return { render: render, decorateCardTarget: decorateCardTarget };
})();
