  /*
   * Seven public reference charts live here for the engine checks and for
   * provisioning the database deliberately. They are not inserted into a new
   * browser's Saved tab: that list now mirrors its database rows exactly.
   * All seven are picked for being checkable rather than for being famous, and
   * between them they show the three things that
   * decide whether a chart can be trusted: the time, the clock it is read on,
   * and the place. The last of them is here for what it asks of the drawing
   * rather than of the data.
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
   *
   * Pope Benedict XVI's answers the question Ava Gardner's raises. Joseph
   * Ratzinger was born in Marktl am Inn, about two and a half thousand people
   * and so under the gazetteer's floor as well, but this entry keeps the real
   * coordinates and the real name instead of standing at the nearest town. Typing a place the
   * combobox does not carry is a supported way to use this app, not a
   * workaround, and a chart kept for checking against published ones should be
   * cast from where the person was actually born. It costs nothing: the tropical
   * ascendant comes out at 19 Pisces 10, and the references print 19 Pisces 12.
   * His dasha is the one that needs no astrology to notice. Ketu, the graha of
   * letting go, runs from November 2005 to November 2012, and the pontificate
   * runs from April 2005 to February 2013.
   *
   * Richard Nixon's is the one that exercises the picture. The Sun, Mars,
   * Mercury and Jupiter all stand in Sagittarius, so one house has to hold four
   * grahas, which is the case the two-column stacking in charts.js exists for
   * and the case a chart with a graha or two to a house never reaches. The time
   * is AA from the birth certificate, and its dasha turns where the biography
   * does: Mercury, one of the four, opens in November 1970, and both the
   * break-in and the resignation fall inside it.
   *
   * Tony Blair's is Kareem Abdul-Jabbar's lesson from the other side, and the
   * sharper of the two. That birth falls in the gap before summer time started;
   * this one falls inside it, so the clock reads +01:00 and an hour taken off it
   * moves the lagna from 11 Taurus to 0 Gemini 02. Not a sign out, but two
   * arcminutes into the next sign, which is the state a chart is in when an hour
   * of doubt decides every house in it.
   */
module.exports = [{
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
  }, {
    name: 'Pope Benedict XVI',
    placeLabel: 'Marktl am Inn, Bavaria, Germany',
    latitude: 48.2556,
    longitude: 12.8447,
    zone: 'Europe/Berlin',
    date: '1927-04-16',
    time: '04:15:00',
    standard: 'zone',
    ayanamsa: 'lahiri',
    trueNode: false,
    gender: 'male',
    celebrity: true
  }, {
    name: 'Richard Nixon',
    placeLabel: 'Yorba Linda, California, United States',
    latitude: 33.8886,
    longitude: -117.8131,
    zone: 'America/Los_Angeles',
    date: '1913-01-09',
    time: '21:35:00',
    standard: 'zone',
    ayanamsa: 'lahiri',
    trueNode: false,
    gender: 'male',
    celebrity: true
  }, {
    name: 'Tony Blair',
    placeLabel: 'Edinburgh, Scotland, United Kingdom',
    latitude: 55.9521,
    longitude: -3.1965,
    zone: 'Europe/London',
    date: '1953-05-06',
    time: '06:10:00',
    standard: 'zone',
    ayanamsa: 'lahiri',
    trueNode: false,
    gender: 'male',
    celebrity: true
  }];

