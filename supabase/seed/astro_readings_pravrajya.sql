-- Public-domain source: Varahamihira, Brihat Jataka XV.1–4 with notes,
-- N. Chidambaram Iyer's 1885 English translation. Re-runnable current content.
insert into astro_readings (topic, subject, condition, heading, points, note, source, effect, sort_order) values
('yoga', 'Pravrajya Yoga', 'general',
 'Pravrājya Yogas - renunciation (Sannyasa)',
 array[
   'Pravrajya, also searched as Pravrājya, Pravarajya, Sannyasa or Sanyasa, concerns withdrawal from worldly life. Brihat Jataka chapter 15 gives several combinations, not just a gathering of four planets. These are traditional readings of a chart, not a determination of a person''s religious identity or future choices.',
   'Verses 1–2: four or more of the seven classical grahas occupy one zodiac sign. Iyer''s note excludes the yoga when none is powerful. Rahu and Ketu do not count. The leading planet distinguishes the form: Sun: Vanyasana; Moon: Vriddhasravaka; Mars: Sakya; Mercury: Ajivika; Jupiter: Bhikshuka; Venus: Chakra; Saturn: Nirgrandha. These historical names are retained without assigning a modern denomination to the person.',
   'The strongest planet being combust changes the reading to attachment to renunciants rather than initiation. Defeat in planetary war indicates a return to worldly life; defeat together with an aspect from another planet indicates a desire for initiation rather than initiation. The finding states these qualifications instead of treating the conjunction as an unqualified promise.',
   'Verse 3, first alternative: the lord of the Moon''s sign aspects Saturn and is itself unaspected by another classical graha. The stronger of that lord and Saturn identifies the leading planet when their strengths are available.',
   'Verse 3, second alternative: strong Saturn aspects the weak lord of the Moon''s sign. Saturn''s strength requirement follows Iyer''s commentary. Missing strength data is never treated as weakness.',
   'Verse 3, third alternative: the Moon occupies Saturn''s drekkana and a navamsa of Saturn or Mars, with Saturn alone aspecting the Moon. Both divisional conditions and the exclusive aspect must hold.',
   'Verse 4: Jupiter in the natal 9th with Saturn aspecting Jupiter, the Moon and the ascendant; alternatively, Saturn in the natal 9th without another planet''s aspect. Iyer''s note retains the ascetic reading without Raja yoga. The additional author or ruler interpretations require Raja yoga and are not automatically assigned by this detector.',
   'Implementation: these rules are checked in D1 from the birth ascendant. Full sign-based graha aspects and the seven classical grahas are used. A conjunction does not substitute for an aspect. Drekkana and navamsa are computed from the Moon''s natal longitude. A rotated chart or transformed divisional chart is not treated as a second nativity.',
   'Where strength is required, the app uses the current Shadbala settings: a ratio of at least one meets the graha''s minimum, and the largest ratio identifies the leader. This is an explicit numerical convention, not a formula stated in chapter 15. Equal leading ratios remain tied. Combustion and planetary defeat follow the existing natal engine. Dasha timing, successive orders of initiation and a full Raja-yoga synthesis are not calculated here.'
 ],
 'Several matching clauses are combined into one finding. Mixed describes a spiritual/worldly trade-off, not a judgement that renunciation is intrinsically good or bad.',
 'Varahamihira, Brihat Jataka, chapter XV, verses 1–4 and notes; N. Chidambaram Iyer, English translation (1885). https://chestofbooks.com/new-age/astrology/Brihat-Jataka/Chapter-XV-On-Ascetio-Yogas.html',
 'mixed', 929)

on conflict (topic, subject, condition) do update set
 heading = excluded.heading,
 points = excluded.points,
 note = excluded.note,
 source = excluded.source,
 effect = excluded.effect,
 sort_order = excluded.sort_order,
 updated_at = now();
