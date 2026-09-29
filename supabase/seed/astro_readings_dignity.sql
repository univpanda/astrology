-- Dignity and friendship. The Vimsopaka Bala tab prints these words in every cell and the
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
   'The same ladder is applied inside divisional charts, which is what the Vimsopaka Bala tab shows, and what vimsopaka bala scores.'
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

('dignity', 'Dignity', 'nodes',
 'Rahu and Ketu',
 array[
   'The nodes are the one place the dignity ladder does not apply whole, and the sources disagree about how much of it they get.',
   'This page follows B.V. Raman: Rahu is exalted in Taurus and Ketu in Scorpio, the deep points at 20 degrees of each, and each is debilitated in the sign opposite.',
   'Raman gives them no moolatrikona and no own sign, holding that the nodes are aprakasha grahas, lustreless, and that they give the results of the lord of the house they occupy. So what a node is doing is read from its dispositor and from what aspects it, not from a lordship of its own.',
   'BPHS goes further, in the Rahu dasha chapter: it gives moolatrikona as Gemini and Sagittarius and own signs as Aquarius and Scorpio, then adds that "some learned have expressed the view that Virgo is the own sign of Rahu and Pisces is the own sign of Ketu". Ownership is not followed here from either direction, since every sign already has one lord and a second claimant would change every dispositor reading in the chart.',
   'Even the exaltation signs are contested. A second school exalts Rahu in Gemini and debilitates it in Sagittarius; the Saptarishis tradition places both nodes in Scorpio. Taurus and Scorpio are the majority and are what Raman and BPHS agree on.',
   'One consequence follows from the geometry. The nodes are always exactly opposite each other and their exaltation signs are opposite too, so they are never in different states: either both are exalted or both are debilitated.'
 ],
 'The nodes are left out of vimsopaka bala and Shadbala, both of which are scored on friendship, which the nodes do not keep.', 302),

('dignity', 'Dignity', 'moolatrikona',
 'Moolatrikona',
 array[
   'A range of degrees, not a whole sign, in which a graha is at its most characteristic: the Sun in Leo 0 to 20, the Moon in Taurus 3 to 30, Mars in Aries 0 to 12, Mercury in Virgo 15 to 20, Jupiter in Sagittarius 0 to 10, Venus in Libra 0 to 15, Saturn in Aquarius 0 to 20.',
   'It ranks above an own sign and below exaltation on the dignity ladder, and it is a different sign from the exaltation in every case but two.',
   'For six of the seven the moolatrikona lies inside a sign the graha already owns. The Moon is the exception, its moolatrikona being Taurus, which it does not own.',
   'It is scored separately from an own sign in some measures and not in others. Saptavargaja bala gives moolatrikona 45 and an own sign 30; varga viswa, which vimsopaka uses, gives both the full twenty and does not separate them.'
 ],
 null, 303),

('dignity', 'Friendship', 'general',
 'Natural, temporal and compound friendship',
 array[
   'Friendship between grahas is what fills the middle of the dignity ladder. A graha in a sign it does not own is judged by how it stands to the graha that does.',
   'Natural friendship is permanent and comes from the grahas themselves. It is not mutual, which surprises people: of the twenty-one pairs, eleven disagree. Mercury counts the Sun a friend and the Sun counts Mercury neutral.',
   'Temporal friendship is particular to the chart and comes from position alone. A graha is a temporal friend of anything in the 2nd, 3rd, 4th, 10th, 11th or 12th from it, and an enemy of anything in the 1st, 5th, 6th, 7th, 8th or 9th. This one is always mutual, and not by accident: if one graha is 3rd from another the second is 11th from the first, and both are friendly houses.',
   'Compound friendship adds the two. Friend and friend gives a great friend, friend and enemy gives neutral, enemy and enemy gives a great enemy. This five step scale is what is meant by great friend, friend, neutral, enemy and great enemy everywhere else in the library.',
   'Temporal friendship is judged in the rashi chart even when the sign being judged belongs to a divisional chart, which Santhanam states directly in the Shadbala chapter.'
 ],
 null, 304),

('dignity', 'Combustion', 'general',
 'Burnt by the Sun, and which chart that is true in',
 array[
   'A graha too close to the Sun is astangata, burnt: near enough that its light is lost in the Sun''s and it cannot be seen rising or setting. Parashara gives an orb for each in Brihat Parashara Hora Shastra ch.4 and says the effect plainly: "If a planet is eclipsed in the Sun, it proves impotent."',
   'The orbs differ by graha and by direction, a retrograde graha being burnt at a greater distance than a direct one. Mercury and Venus have the widest, which is also why they are burnt most often: neither ever strays far from the Sun to begin with. The nodes are exempt, Parashara being explicit that they are points and cannot be burnt.',
   'The question a divisional chart raises is which pair of longitudes the distance is measured between. It is not idle: on the rashi, Mercury is burnt in about two charts in five, and that figure is most of what anyone knows about Mercury.',
   'No text consulted here computes combustion inside a division, and several would not parse if it were. Parashara settles it twice in one chapter. Brihat Parashara Hora Shastra ch.6, on the sixteen divisions: "The divisions of a combust planet, defeated planet, weak planet and a planet in bad Avasthas like Sayana be all ignored to be auspicious, for these destroy the good yogas." A combust graha has divisions; the divisions do not each have a combustion of their own. Then at slokas 30-32 of the same chapter: "after assessing the Vimsopaka strength through the various divisions, the rising and setting of the planets be considered" - the divisions first, combustion after, applied to the whole.',
   'The sharpest witness is his Amsayu, where the life-span is computed from the navamsa, the longitude multiplied by 108. The reductions at slokas 20-22 are "half for a combust Grah, one third for inimical placement", and the corrections some scholars add are to "double the contribution, if the contributor is in his own Navamsha". One sloka, two kinds of condition, told apart: own-navamsa is asked of the division, combustion is carried in.',
   'The other texts arrange it the same way. Mantreswara puts combustion at the bottom of the dignity ladder - Phaladeepika: "When a planet is in combustion (conjunction with the Sun), its effect will be similar to that in depression" - and lists exaltation, own, friendly, inimical, depression and astangata together while putting vargottama on a line of its own. Jataka Parijata''s sloka 38 gives the same ladder ending in arkaga, below depression, and its note on Venus reads "in combustion ... or if he be weak in Navamsa", two separate conditions. Kesava, quoted in Sripatipaddhati, asks first which grahas rule "the Rasi, Hora and other Vargas tenanted" and then whether those rulers are in planetary war, "combust (Astangata) or depressed": the vargas supply the grahas, the grahas carry the combustion.',
   'B. V. Raman says what it costs rather than where it is measured. Three Hundred Important Combinations, combination 24: "any planet in association with the Sun becomes combust or Astha and loses its power to do good." His combinations ask for a graha "free from combustion" in a house of the rashi, and Graha and Bhava Balas does not mention combustion at all, it being no part of the six strengths.',
   'What the texts do disagree about is the orb, so a mark can differ between calculators for that reason and not this one. Parashara gives Mercury 14 degrees and a retrograde Mars 8; the Jataka Parijata commentary has Venus combust within 5. They disagree about the exemption too: Jataka Parijata excuses Venus and Saturn from the life-span reduction, and Santhanam''s note rejects that, saying it "applies to Venus and Saturn as well, against the common belief". This site follows Parashara''s table.',
   'Against all of that, this site measures inside the division by default, and the reason is the page rather than the doctrine: every other mark on a chart is a fact about that chart, and a graha marked burnt beside a Sun twelve signs away reads as a fault in the page rather than as a reading carried in from elsewhere. It is a deliberate departure and is set down here as one, not presented as what the texts say.',
   'Measuring inside the division is the other reading, and the arithmetic argues against it too. A varga longitude is a rashi position stretched nine or ten times and wrapped back into a sign, so two of them fall near each other about as often as two unrelated numbers would. Measured over 720 charts, every graha comes out combust in five to nine per cent of divisions whatever its orb and whatever its orbit, and Mercury drops from 42 per cent to 5. A figure that is the same for Saturn as for Mercury is not measuring the Sun''s rays.',
   'The reading the texts ask for is one setting away, on the Chart tab, and the graha card names the frame the distance was measured in either way, so a mark is never ambiguous about which chart it is a fact of. Anyone following Parashara, Mantreswara or Jataka Parijata should set it, and the figures above are the argument for doing so.',
   'One place is unaffected by the choice. The combustion flag beside a graha''s name on the Vimsopaka and Shadbala grids is a rashi fact by construction: those grids run across all sixteen divisions at once, so a per-division mark would have nowhere to sit.'
 ],
 'Combustion also decides Mercury''s nature for paksha bala, drik bala and the yogas, and that reading is taken in the rashi whatever this setting says.', 305)

on conflict (topic, subject, condition) do update set
  heading = excluded.heading,
  points = excluded.points,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_at = now();
