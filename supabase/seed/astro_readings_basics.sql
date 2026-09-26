-- Where a reader starts. Everything else in the library uses this vocabulary and
-- none of it defined any: lagna, graha, rashi, bhava, karaka.
--
--   psql "$DATABASE_URL" -f supabase/seed/astro_readings_basics.sql

insert into astro_readings (topic, subject, condition, heading, points, note, sort_order) values
('basics', 'The chart', 'general',
 'What a Vedic chart is',
 array[
   'A birth chart is the sky at one moment seen from one place on the ground. Everything in it follows from a date, a time and a pair of coordinates, and nothing else is needed.',
   'The zodiac is divided into twelve equal signs of 30 degrees each, called rashis. Nine bodies are tracked through them, called grahas.',
   'The sign rising on the eastern horizon at the moment of birth is the lagna, or ascendant. It changes about every two hours, which is why a birth time matters as much as a birth date.',
   'The lagna fixes the twelve houses, or bhavas. The sign of the lagna is the 1st house, the next sign the 2nd, and so on round the circle. So two people born on the same day with different birth times have the same grahas in the same signs and a completely different set of houses.',
   'Vedic astrology uses the sidereal zodiac, measured against the fixed stars, where Western astrology uses the tropical, measured from the equinox. The two have drifted about 24 degrees apart, which is most of a sign, and this is why a Sun sign differs between the two systems.'
 ],
 'Signs, grahas and houses each have a passage of their own below.', 100),

('basics', 'Rashi', 'general',
 'The twelve signs',
 array[
   'Aries, Taurus, Gemini, Cancer, Leo, Virgo, Libra, Scorpio, Sagittarius, Capricorn, Aquarius, Pisces. Each is 30 degrees, and together they make the 360 of the circle.',
   'Every sign is owned by a graha, called its lord. The Sun owns Leo and the Moon Cancer; the other five own two each. Lordship is the single most used idea in the whole system: most of what is said about a house is really said about the graha that owns its sign.',
   'Signs are grouped by quality. Movable are Aries, Cancer, Libra and Capricorn; fixed are Taurus, Leo, Scorpio and Aquarius; dual are Gemini, Virgo, Sagittarius and Pisces. The groups run in that order round the circle, so no two neighbouring signs share a quality.',
   'They are also counted odd and even from Aries, and grouped by element in fours: fire, earth, air, water repeating.',
   'On a chart the signs are often written as numbers, 1 for Aries through 12 for Pisces, which is how the North Indian chart labels its boxes.'
 ],
 null, 101),

('basics', 'Graha', 'general',
 'The nine grahas',
 array[
   'Sun, Moon, Mars, Mercury, Jupiter, Venus, Saturn, Rahu and Ketu. Graha means "seizer" rather than "planet": the Sun and Moon are included and the outer planets are not.',
   'Rahu and Ketu are not bodies. They are the two points where the Moon''s path crosses the Sun''s, always exactly opposite each other, and they are where eclipses happen. Because they are not bodies they own no sign and keep no friendships, which is why they are left out of several calculations here.',
   'Grahas are read as naturally benefic or malefic. Jupiter and Venus are benefic, the waxing Moon and a well associated Mercury benefic; the Sun, Mars, Saturn, Rahu, Ketu and the waning Moon are malefic. This is the graha''s nature and is separate from whether it does good in a particular chart.',
   'Each graha is the karaka, or significator, of certain matters wherever it stands: the Sun of the father and the soul, the Moon of the mother and the mind, Mars of courage and brothers, Mercury of speech and learning, Jupiter of children and the teacher, Venus of marriage and the arts, Saturn of longevity and labour.',
   'A graha is read three ways at once: by what it naturally signifies, by the houses it owns, and by the house it stands in. Most disagreement in reading a chart is about which of the three to weigh most.'
 ],
 null, 102),

('basics', 'Bhava', 'general',
 'The twelve houses',
 array[
   'A house is a department of life. The 1st is the self and the body, the 2nd wealth and speech, the 3rd courage and siblings, the 4th mother, home and happiness, the 5th children and intelligence, the 6th illness, debt and enemies.',
   'The 7th is marriage and partnership, the 8th longevity and what is hidden, the 9th fortune, father and dharma, the 10th career and standing, the 11th gains and elder siblings, the 12th loss, expense and liberation.',
   'Houses are counted from the lagna, one sign to a house, so the 1st house is the whole of the rising sign and not a division of it. This is whole sign housing, which is what Parashara uses and what this page draws.',
   'A house is read from three things: any grahas sitting in it, any grahas aspecting it, and where its lord has gone. The last is the one beginners skip and it is often the most telling.',
   'Houses are also grouped, and the groups carry most of the classical rules. Those groupings have a topic of their own.'
 ],
 null, 103)

on conflict (topic, subject, condition) do update set
  heading = excluded.heading,
  points = excluded.points,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_at = now();
