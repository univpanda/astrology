-- Dignity and friendship. The Vargas tab prints these words in every cell and the
-- library defined none of them.
--
--   psql "$DATABASE_URL" -f supabase/seed/astro_readings_dignity.sql

insert into astro_readings (topic, subject, condition, heading, points, note, sort_order) values
('dignity', 'Dignity', 'general',
 'How well a graha sits where it is',
 array[
   'Dignity is how a graha stands in the sign it occupies. It is not about the house, the aspects or anything else in the chart: only the graha and the sign.',
   'The ladder, best first: exalted, moolatrikona, own sign, a great friend''s sign, a friend''s, a neutral''s, an enemy''s, a great enemy''s, and debilitated.',
   'A graha in its own sign is at home and answerable to nobody. In any other sign it is a guest, and the top and bottom of the ladder are the two special signs where it is either most itself or least.',
   'Dignity says how freely a graha can act, not whether what it does is welcome. A malefic in its own sign acts fully as itself, which is not the same as acting well.',
   'The same ladder is applied inside divisional charts, which is what the Vargas tab shows, and what vimsopaka bala scores.'
 ],
 'Exaltation, moolatrikona and friendship each follow below.', 300),

('dignity', 'Dignity', 'exaltation',
 'Exaltation and debilitation',
 array[
   'Each of the seven has one sign of exaltation and, exactly opposite it, one of debilitation. The Sun exalts in Aries and falls in Libra; the Moon in Taurus and Scorpio; Mars in Capricorn and Cancer; Mercury in Virgo and Pisces; Jupiter in Cancer and Capricorn; Venus in Pisces and Virgo; Saturn in Libra and Aries.',
   'Each also has a degree of deepest exaltation within that sign, and the point opposite is the deepest fall. Uchcha bala in Shadbala is simply the distance from that low point, so it is a smooth measure rather than a yes or no.',
   'Exaltation is not moolatrikona and the two are never the same sign, except that the Moon and Mercury reach both within one sign at different degrees.',
   'Debilitation can be cancelled, and the conditions for it are a subject of their own under Neecha Bhanga. A cancelled debilitation is not merely neutral; it is read as strength that came by way of weakness.'
 ],
 null, 301),

('dignity', 'Dignity', 'moolatrikona',
 'Moolatrikona',
 array[
   'A range of degrees, not a whole sign, in which a graha is at its most characteristic: the Sun in Leo 0 to 20, the Moon in Taurus 3 to 30, Mars in Aries 0 to 12, Mercury in Virgo 15 to 20, Jupiter in Sagittarius 0 to 10, Venus in Libra 0 to 15, Saturn in Aquarius 0 to 20.',
   'It ranks above an own sign and below exaltation on the dignity ladder, and it is a different sign from the exaltation in every case but two.',
   'For six of the seven the moolatrikona lies inside a sign the graha already owns. The Moon is the exception, its moolatrikona being Taurus, which it does not own.',
   'It is scored separately from an own sign in some measures and not in others. Saptavargaja bala gives moolatrikona 45 and an own sign 30; varga viswa, which vimsopaka uses, gives both the full twenty and does not separate them.'
 ],
 null, 302),

('dignity', 'Friendship', 'general',
 'Natural, temporal and compound friendship',
 array[
   'Friendship between grahas is what fills the middle of the dignity ladder. A graha in a sign it does not own is judged by how it stands to the graha that does.',
   'Natural friendship is permanent and comes from the grahas themselves. It is not mutual, which surprises people: of the twenty-one pairs, eleven disagree. Mercury counts the Sun a friend and the Sun counts Mercury neutral.',
   'Temporal friendship is particular to the chart and comes from position alone. A graha is a temporal friend of anything in the 2nd, 3rd, 4th, 10th, 11th or 12th from it, and an enemy of anything in the 1st, 5th, 6th, 7th, 8th or 9th. This one is always mutual, and not by accident: if one graha is 3rd from another the second is 11th from the first, and both are friendly houses.',
   'Compound friendship adds the two. Friend and friend gives a great friend, friend and enemy gives neutral, enemy and enemy gives a great enemy. This five step scale is what is meant by great friend, friend, neutral, enemy and great enemy everywhere else in the library.',
   'Temporal friendship is judged in the rashi chart even when the sign being judged belongs to a divisional chart, which Santhanam states directly in the Shadbala chapter.'
 ],
 null, 303)

on conflict (topic, subject, condition) do update set
  heading = excluded.heading,
  points = excluded.points,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_at = now();
