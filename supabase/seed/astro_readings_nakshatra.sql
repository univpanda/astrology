-- Nakshatras and dashas. The graha tables print a nakshatra, a pada and a lord
-- and sub lord in every row, and the page shows a dasha sequence, none of which
-- the library explained.
--
--   psql "$DATABASE_URL" -f supabase/seed/astro_readings_nakshatra.sql

insert into astro_readings (topic, subject, condition, heading, points, note, sort_order) values
('nakshatra', 'Nakshatra', 'general',
 'The twenty-seven lunar mansions',
 array[
   'The circle divided into 27 rather than 12, each nakshatra 13 degrees 20 minutes wide. It is the older division of the two and much of what makes Vedic astrology different from Western rests on it.',
   'Twenty-seven is chosen because the Moon takes about 27 days to go round, so it crosses roughly one nakshatra a day. They are the Moon''s resting places, which is what the word means.',
   'They cut across the signs rather than nesting inside them. Nine nakshatras cover four signs exactly, so a nakshatra can straddle a sign boundary and most do not begin where a sign begins.',
   'The one the Moon occupies at birth is the janma nakshatra, and it is read as the temperament rather than the circumstances. It also fixes where the dasha sequence starts.',
   'Every nakshatra has a ruling graha, and the order of those rulers is the order the dashas run in.'
 ],
 'Padas, lords and sub lords follow below.', 400),

('nakshatra', 'Nakshatra', 'pada',
 'Padas, the quarters',
 array[
   'Each nakshatra divides into four padas of 3 degrees 20 minutes. Four padas times twenty-seven is a hundred and eight, which is why that number recurs throughout the tradition.',
   'A pada is exactly one navamsha. So the pada a graha sits in tells you its navamsha sign directly, and the D9 chart and the padas are two ways of writing the same division.',
   'That is also why a birth time wrong by ten minutes matters: the ascendant moves about two and a half degrees in that time, which is most of a pada.'
 ],
 null, 401),

('nakshatra', 'Nakshatra', 'lords',
 'The lord, and the sub lord',
 array[
   'Each nakshatra is ruled by one of the nine grahas, running Ketu, Venus, Sun, Moon, Mars, Rahu, Jupiter, Saturn, Mercury and repeating three times over the twenty-seven.',
   'The lord is what the dasha sequence is built from: the dasha running at birth is the lord of the Moon''s nakshatra, and the rest follow in that same order.',
   'The sub lord divides the nakshatra again, in the same proportions the dashas use, so a nakshatra is split into nine unequal parts in the order of its own lord onward. This is the Krishnamurti refinement rather than a classical one.',
   'Because the parts are unequal and the order starts from the nakshatra''s own lord, two grahas can share a nakshatra and a lord and still have different sub lords. That is usually the point of looking.'
 ],
 null, 402),

('dasha', 'Vimshottari', 'general',
 'The dasha sequence',
 array[
   'A dasha is a period ruled by one graha, during which that graha''s promise in the chart is what tends to come about. A chart says what is possible; the dasha says when.',
   'Vimshottari is the system in general use. Its nine periods run Ketu 7 years, Venus 20, Sun 6, Moon 10, Mars 7, Rahu 18, Jupiter 16, Saturn 19, Mercury 17, and they total 120, which is the full human span the system assumes.',
   'The sequence starts from the lord of the Moon''s nakshatra at birth, and the first period is not run in full: the Moon has already passed through part of that nakshatra, and the same fraction of the period is already spent. What remains is the balance at birth.',
   'So two people born on the same day under different nakshatras begin in different dashas, and two born under the same nakshatra at different times begin at different points within one.',
   'Each dasha divides into antardashas in the same order and the same proportions, and those divide again. The usual reading takes the dasha lord and the antardasha lord together.'
 ],
 'Strength decides how much a dasha delivers; see the Strength topic.', 800),

('dasha', 'Vimshottari', 'reading',
 'Reading a period',
 array[
   'Read the dasha lord three ways at once, as any graha is read: what it naturally signifies, the houses it owns, and the house it sits in. A Saturn dasha is not one thing; it is what Saturn is to that chart.',
   'A graha that is strong and well placed gives its own results generously during its period. One that is weak, afflicted or in a dusthana gives them grudgingly or not at all, which is where a strength measure earns its keep.',
   'A yoga fructifies in the dashas of the grahas that form it. This is the most practical use of finding a yoga at all: the combination says what is promised, and the period says when it is due.',
   'Antardashas within a period often matter more than the period itself for dating an event, since a twenty year Venus dasha is too coarse to answer most questions.'
 ],
 null, 801)

on conflict (topic, subject, condition) do update set
  heading = excluded.heading,
  points = excluded.points,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_at = now();
