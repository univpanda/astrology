-- Divisional charts. The Vargas tab has sixteen columns and the library said
-- nothing about what a division is.
--
--   psql "$DATABASE_URL" -f supabase/seed/astro_readings_varga.sql

insert into astro_readings (topic, subject, condition, heading, points, note, sort_order) values
('varga', 'Divisional charts', 'general',
 'What a divisional chart is',
 array[
   'A varga divides each sign into equal parts and maps every part onto a whole sign. The ninth division, D9, cuts each sign into nine pieces of 3 degrees 20 minutes; the sixtieth, D60, into pieces of half a degree.',
   'The result is read as a chart in its own right, with its own signs, its own lords and its own dignities. It is not a second opinion about the same thing: each division is held to govern a particular department of life.',
   'D9 is marriage and inner strength, D10 career, D4 property and happiness, D7 children, D12 parents, D30 misfortune, D60 everything carried over. The rashi chart shows what is promised and a division shows how it works out in its area.',
   'Because the parts are small, a division is sensitive to the birth time. D60 changes sign every two minutes of arc, which is why a chart quoted to the second is quoted to the second.',
   'Parashara groups the divisions into schemes of six, seven, ten and sixteen, and scores a strength over whichever is being used. That score is vimsopaka bala.'
 ],
 'Navamsha and vargottama follow.', 400),

('varga', 'Navamsha', 'general',
 'The navamsha, D9',
 array[
   'The ninth division, and the one always read beside the rashi chart. Parashara ranks it next after the rashi itself and no serious reading omits it.',
   'It governs marriage and the partner, and more broadly the strength behind the promise: a graha that looks strong in the rashi and weak in the navamsha is held to promise more than it delivers.',
   'It is also where a graha''s deeper dignity shows. A graha debilitated in the rashi but exalted in navamsa is read very differently from one debilitated in both.',
   'Nine parts to a sign means the navamsha of a sign turns over every 3 degrees 20 minutes, so a birth time wrong by ten minutes can move it.'
 ],
 null, 401),

('varga', 'Vargottama', 'general',
 'Vargottama',
 array[
   'A graha holding the same sign in the rashi and in the navamsha is vargottama, which means best in the division.',
   'Mechanically it falls in the 1st navamsha of a movable sign, the 5th of a fixed one and the 9th of a dual one, so exactly one navamsha of each sign qualifies.',
   'It is measured against D9 whatever division is being looked at. Narasimha Rao reads a D4 chart and still writes "vargottama in Navamsa", because it is a property the graha carries rather than something the varga on screen changes.',
   'It sharpens rather than blesses. A graha at the end of Virgo is vargottama, and Venus there is also debilitated, so the placement is a debilitation made more certain. K.N. Rao cites exactly that case.',
   'Sign repetition between the rashi and some other division is perfectly computable, and D3, D4, D7, D10 and D12 each have one repeating division per sign, but no classical authority calls that vargottama.'
 ],
 null, 402)

on conflict (topic, subject, condition) do update set
  heading = excluded.heading,
  points = excluded.points,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_at = now();
