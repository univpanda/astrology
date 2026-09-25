# Jyotisha

A Vedic (sidereal) birth chart generator that runs entirely in the browser. Enter
a name, a date, a time and a birthplace, and it draws the kundli: Rashi (D1) and
Navamsa (D9) charts, a full graha table with nakshatras and padas, the panchang
at birth, and the Vimshottari mahadasha sequence.

No build step, no dependencies, no server, no API keys. Nothing about the birth
data ever leaves the page.

```
open index.html          # works straight off the disk
# or
python3 -m http.server   # then visit http://localhost:8000
```

## What it computes

| | |
|---|---|
| Zodiac | Sidereal, Lahiri (Chitrapaksha) by default; True Chitra Paksha, KP, Raman and Fagan-Bradley also offered, all calibrated to Swiss Ephemeris |
| Houses | Whole sign (Parashari): the ascendant's sign is the first house |
| Grahas | Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Rahu, Ketu |
| Rahu/Ketu | Mean node by default, as Indian panchangs publish it; true node optional |
| Per graha | Sidereal longitude, rashi, house, nakshatra, pada, nakshatra lord, navamsa sign, retrogression, dignity |
| Charts | North Indian (diamond, houses fixed) and South Indian (square, signs fixed) |
| Panchang | Tithi, paksha, vara, yoga, karana |
| Dasha | Vimshottari mahadashas with dates, from the Moon's nakshatra |

## Place and time

The location field searches all 69,752 populated places above 5,000 people from
[GeoNames](https://www.geonames.org/), matching accent-insensitively and ranking
by population, so "zurich" finds Zürich and "delhi" offers Delhi before its
smaller namesakes. Former names are mapped too, because birth certificates say
them: Bombay, Calcutta, Madras, Benares, Poona, Allahabad, Dacca, Rangoon. If a
village is not in the list, coordinates can be entered by hand.

Time of birth is entered on a 12-hour clock: pick AM or PM, then type the hour,
minute and, if the certificate records them, seconds. A native
`<input type="time">` renders as 12-hour or 24-hour purely on the browser's
locale, which is not something the page can choose, so the field is built from a
select and three typed boxes instead, each handing focus to the next as soon as it
can no longer grow.

Seconds are optional and count as `00`, because a time written "10:30" means
10:30:00. The minute is not optional, because the hour box hands focus straight to
it, so a blank one is more likely forgotten than meant, and being 59 minutes out
moves the ascendant by about 14 degrees. Seconds are offered because they are not
noise either: the ascendant advances with sidereal time, so one second of clock
time is worth roughly 13 to 21 arcseconds of ascendant in the mid latitudes, and
a full minute is a fifth of a degree.

Timezone offsets are resolved through the browser's own IANA database at the
*birth* instant, not today's rule. A 1943 Indian birth correctly gets +06:30
(wartime), a July 1975 New York birth gets -04:00 while a January one gets
-05:00, and a 1968 London birth gets +01:00 from Britain's experiment with
year-round summer time. An hour of error moves the ascendant by 15 degrees, so
this matters more than it looks.

## Accuracy

Positions come from published analytical theories rather than a bundled ephemeris
binary: ELP-2000/82 for the Moon (Meeus ch.47), Keplerian elements with secular
rates for the planets (Standish, JPL), Meeus ch.21 precession, the IAU 1980
nutation series, IAU 2006 sidereal time, and Espenak-Meeus Delta T.

Two things that theory alone gets wrong are corrected from data. The first is the
two-body element fit, which misses planet-on-planet perturbations: the
Jupiter-Saturn great inequality left Saturn up to 10 arcminutes out, and Earth's
own error propagated into every geocentric longitude, amplified by 1/distance for
the near planets. `data/perturbations.js` samples those residuals against JPL
Horizons on a 100-day grid and interpolates them back; it costs 34 KB gzipped at
page load, and a 25-day grid would roughly halve the Venus and Mars figures below
for more than double the weight, which is not a trade worth making for accuracy a
chart cannot display. The second is the ayanamsa, whose constants
are calibrated against Swiss Ephemeris rather than guessed.

Worst-case error against Swiss Ephemeris (the reference implementation nearly all
astrology software is built on), sampled every 100 days across 1900-2100:

| Sun | Moon | Mercury | Venus | Mars | Jupiter | Saturn | Rahu | Ascendant | Ayanamsa |
|---|---|---|---|---|---|---|---|---|---|
| 13" | 11" | 22" | 38" | 19" | 3" | 2" | 0.2" | 0.2" | 0.01" |

A nakshatra pada is 12,000 arcseconds wide, so nothing here is close to changing a
sign, nakshatra, pada or divisional placement. Two caveats stated honestly: the
Moon opens to 70" outside 1950-2030, where Delta T models diverge and there is no
fact of the matter to be right about; and the ascendant opens to about 2" past
2050 for the same reason.

Getting there meant matching a convention, not just numbers. The ayanamsa is
published from the *mean* equinox while apparent longitudes are measured from the
*true* one, so the ayanamsa has to be referred to the true equinox before
subtracting, leaving nutation to cancel. Miss that and every graha wobbles by up
to 17 arcseconds on an 18.6-year cycle while the nodes sit still, which is the
kind of error that hides because it averages to nothing.

For confirmation from outside the ephemeris world, the test suite reproduces every
published Vedic transit date it is given: Saturn into Kumbha on 17 January 2023,
Jupiter into Vrishabha on 1 May 2024, Saturn into Meena on 29 March 2025, Jupiter
into Mithuna on 14 May 2025, Mesha Sankranti on 14 April 2025, Makara Sankranti on
14 January 2026, and mean Rahu into Meena on 30 October 2023.

The ascendant is checked a different way again, against two identities that need
no reference data at all: at geometric sunrise the Sun's longitude *is* the
ascendant, and at local apparent noon it is the Midheaven. Both hold to under an
arcsecond from the equator to 64 degrees north.

This is not a substitute for the JPL DE ephemerides if you need arcsecond truth.

### Where differences with other software actually come from

If a chart here disagrees with another tool, the arithmetic is rarely the reason.
In rough order of size:

- **Birthplace coordinates.** The ascendant tracks sidereal time, so one arcminute
  of longitude is about one arcminute of ascendant. Two gazetteers disagreeing by
  a tenth of a degree on the same town will disagree by six arcminutes of lagna,
  dwarfing every other effect on this page.
- **Ayanamsa.** Implementations of "Lahiri" differ by tens of arcseconds, and True
  Chitra Paksha sits about 10" from Lahiri. All five offered here are calibrated
  to Swiss Ephemeris.
- **Mean vs true node.** Up to 1.97 degrees for Rahu and Ketu.
- **The time actually used.** Zone time vs local mean time for pre-1900 births
  moves the ascendant by up to a degree per four minutes of difference.

## Tests

```
node test/test.js      # ephemeris, ayanamsa, ascendant, panchang, dasha
node test/test-ui.js   # place search, timezones, chart rendering, DOM contract
```

`test.js` checks against four independent kinds of reference: Meeus's worked
examples, embedded Swiss Ephemeris charts, published Vedic transit dates, and
reference-free identities. It needs no network and no Swiss Ephemeris install:
the reference values are baked in.

`test-ui.js` runs the real `charts.js` against a small DOM stub and serialises the
SVG, and it cross-checks every element id `app.js` reaches for against
`index.html`, so a renamed id fails a test rather than breaking silently.

## Files

```
index.html              markup for the form and the result
css/styles.css          one committed dark theme, plus a light print stylesheet
js/astro.js             the ephemeris and all the Vedic zodiac maths
js/geo.js               place search, aliases, historical timezone offsets
js/charts.js            North and South Indian kundli as inline SVG
js/app.js               form handling, the combobox, rendering
data/cities.js          69,752 places from GeoNames, loaded on first keystroke
data/perturbations.js   residual corrections for Earth, Venus, Mars, Jupiter, Saturn
scripts/                regenerate the data files and refit the ayanamsa
test/                   the two suites above
```

`data/cities.js` is a 3 MB `.js` file rather than JSON, and it is fetched on the
first interaction with the place field rather than at page load. The `.js` is
deliberate: a `<script>` tag still works when `index.html` is opened directly off
the disk, where `fetch()` of a local file is blocked.

## Regenerating the data files

```sh
# Places
curl -O https://download.geonames.org/export/dump/cities5000.zip
curl -O https://download.geonames.org/export/dump/admin1CodesASCII.txt
curl -O https://download.geonames.org/export/dump/countryInfo.txt
unzip cities5000.zip
node scripts/build-cities.mjs .

# Planet corrections: geometric heliocentric vectors from JPL Horizons, J2000
# ecliptic, Sun-centred, saved as vec2-<body>.csv. Bodies and steps are
# 3 (Earth/Moon barycentre) 25d, 299 (Venus) 25d, 499 (Mars) 25d,
# 599 (Jupiter) 100d, 699 (Saturn) 100d, over JD 2371924.5 to 2496224.5.
curl "https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='599'\
&EPHEM_TYPE='VECTORS'&CENTER='500@10'&REF_PLANE='ECLIPTIC'&REF_SYSTEM='J2000'\
&VEC_CORR='NONE'&OUT_UNITS='AU-D'&VEC_TABLE='1'&CSV_FORMAT='YES'&OBJ_DATA='NO'\
&START_TIME='JD2371924.5'&STOP_TIME='JD2496224.5'&STEP_SIZE='100d'" \
  | sed -n '/\$\$SOE/,/\$\$EOE/p' | sed '1d;$d' > vec2-jupiter.csv
node scripts/build-perturbations.mjs .

# Ayanamsa constants, refitted against Swiss Ephemeris (see the header of
# scripts/fit-ayanamsa.mjs for the pyswisseph snippet that produces the input)
node scripts/fit-ayanamsa.mjs ayan-all.json
```

## Conventions worth knowing

A few choices here are conventions rather than facts, and other software may
differ:

- **Mean vs true node.** Indian panchangs publish the mean node, and the
  published Rahu transit dates only reproduce with it, so mean is the default.
  Some modern software uses the true node, which differs by up to 1.97 degrees.
- **Whole-sign houses.** Standard Parashari practice: house 1 is the whole of the
  ascendant's sign. Bhava Chalit and Placidus-style cusps are not computed.
- **Ayanamsa variants.** All five are fitted to Swiss Ephemeris over 1800-2100:
  the four precession-defined ones agree to 0.01", True Chitra to 0.3".
- **Vara.** The weekday is taken from the local civil date. A traditional Vedic
  day runs sunrise to sunrise, so a birth between midnight and sunrise belongs to
  the previous vara.
- **Vimshottari year.** 365.2425 days.

## Credits

Place data from [GeoNames](https://www.geonames.org/), CC BY 4.0. Reference
positions for validation from
[JPL Horizons](https://ssd.jpl.nasa.gov/horizons/). Algorithms from Jean Meeus,
*Astronomical Algorithms* (2nd ed.), and E. M. Standish, *Approximate Positions
of the Major Planets*.

MIT licensed. Astrological interpretation is not offered, implied or endorsed: the
arithmetic is the deliverable.
