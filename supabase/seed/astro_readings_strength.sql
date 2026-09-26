-- Strength, and what it does not mean. See supabase/seed/astro_readings.sql for
-- the table's shape.
--
-- Shadbala and vimsopaka both answer "how fully can this graha act", and neither
-- answers "is that a good thing". The distinction is easy to lose once a page
-- prints a number, so it is written down rather than assumed.
--
--   psql "$DATABASE_URL" -f supabase/seed/astro_readings_strength.sql

insert into astro_readings (topic, subject, condition, heading, points, note, sort_order) values
('strength', 'Strength and influence', 'general',
 'Strength is not the same as influence',
 array[
   'Strength is how fully a graha can act. Influence is what kind of effect it has: favourable, unfavourable or mixed. The two are separate questions and a strength table answers only the first.',
   'A natural malefic can be very strong. Nothing in Shadbala or vimsopaka bala discounts Saturn for being Saturn, and nothing should: the measure is of capacity, not of goodwill.',
   'What a strong malefic does with that capacity depends on what it is to the house in question. Aspecting a house it does not rule, it afflicts that house, and being strong makes the affliction more certain rather than less.',
   'Rulership is what turns the same graha into a different influence. A malefic sitting on or aspecting a house it owns is acting on its own affairs; the same malefic reaching a house it has no claim to is an intrusion.',
   'So a high total is never on its own a reason to expect good from a graha. It says the graha will act, fully and in its own nature. Whether that is welcome is read from ownership, from the house, and from what else touches it.',
   'The same holds in reverse: a weak benefic may promise more than it can deliver, which is why a promising yoga is still read alongside a strength measure rather than instead of one.'
 ],
 'What a high total does tell you follows below.', 700),

('strength', 'Strength and influence', 'magnitude',
 'What a high total does tell you',
 array[
   'The natural significations of a graha with a high vimsopaka bala will normally flourish. Strength of this kind is the graha having the means to act on what it stands for, and in the ordinary case it does.',
   'Two things qualify that "normally": placement by house, and affliction. A graha poorly placed, or badly afflicted, can carry a high total and still deliver little of it, because the strength was never the obstacle.',
   'Where a graha takes part in a favourable yoga, vimsopaka bala is the natural measure of how much to expect. A raja yoga gives position and a dhana yoga gives affluence; the strength of the grahas forming it is what says on what scale.',
   'So it is better read as magnitude than as direction. It scales whatever the graha was going to do rather than deciding what that is, which is why the same figure means opposite things on a benefic ruling a trikona and on a malefic reaching a house it has no claim to.',
   'That also explains why it is worth computing at all for a yoga that is already present. The yoga says what is promised and vimsopaka bala says how much of it the graha can actually carry.'
 ],
 null, 701),

('strength', 'Strength and influence', 'bands',
 'Why the classical bands say "favourable"',
 array[
   'Parashara puts the vimsopaka result in four bands, chapter 7, verses 26-27: below 5 the graha is "not capable of giving auspicious results", above 5 and below 10 it "will yield some good effects", up to 15 the effect is "mediocre", and above 15 it "will yield wholly favourable effects".',
   'Taken at face value that makes a high score good news for any graha whatever, which is not how the strength is used in practice.',
   'The reading that reconciles them is that the bands describe how fully the graha delivers what it has to deliver, not whether what it delivers is wanted. A graha below 5 cannot act on its promise; a graha above 15 acts on it completely.',
   'For a benefic ruling a good house those come to the same thing. For a malefic afflicting a house it does not own they do not, and the band label is the least useful part of the reading.',
   'This page prints Parashara''s words for the bands because they are his, and says here what they should not be taken to mean.'
 ],
 null, 702),

('strength', 'Vimsopaka Bala', 'reading',
 'Reading a vimsopaka total',
 array[
   'Each division in the scheme carries a share of twenty points. The graha keeps a fraction of each share according to its dignity there: the whole of it in its own sign, 18/20 in a great friend''s, 15/20 a friend''s, 10/20 a neutral''s, 7/20 an enemy''s and 5/20 a great enemy''s.',
   'So the floor is 5 and the ceiling is 20. A graha in a great enemy''s sign in every single division still scores 5, not nothing, which is worth knowing before reading a low total as an absence.',
   'Moolatrikona is not given a rung of its own and keeps the same twenty as an own sign. Exaltation has no rung either, so an exalted graha scores by its relation to the lord of that sign.',
   'The scheme has to be named alongside any figure. The same chart gives four different totals across the Shadvarga, Saptavarga, Dasavarga and Shodasavarga, because each shares the twenty points out differently, and a total quoted without its scheme cannot be checked.',
   'It measures dignity across divisions and nothing else. It does not know which houses the graha rules, where it sits, or what aspects it, so it is one input to a judgement rather than the judgement.'
 ],
 'What a high total does and does not mean is set out under Strength and influence.', 703),

('strength', 'Vimsopaka Bala', 'limits',
 'What vimsopaka bala cannot see',
 array[
   'It is tempting to treat the total as a complete account of a graha''s strength, since it is a single number that looks like one. It is not. It counts dignity division by division and nothing else, and three things the tradition counts as strength fall outside it entirely.',
   'Vargottama. The score reads each division on its own and never compares two, so a graha holding the same sign in the rashi and the navamsha is scored exactly as one holding two different signs of equal dignity. The repetition, which is the whole of what vargottama is, does not register.',
   'Parivartana. The score judges a graha against the lord of the sign it occupies and never asks what that lord is doing. An exchange strengthens both grahas and leaves the total untouched.',
   'Directional strength. Dig bala turns on which house a graha stands in - Jupiter and Mercury strongest on the ascendant, the Sun and Mars on the 10th, Saturn on the 7th, the Moon and Venus on the 4th - and vimsopaka never looks at houses at all.',
   'Neecha bhanga. A debilitated graha scores near the floor, and rightly so where the debilitation stands. Where it is cancelled the graha is not weak at all, and the total says otherwise: this is the case where the score is not merely blind but actively lowest exactly where it matters most that it should not be.',
   'The raja yoga form makes that sharper again. A cancelled debilitation in a kendra or a trikona is read as a strength that arrived by way of a weakness, and there is nothing in a division-by-division count of dignity that could ever express such a thing.',
   'None of these is an oversight to be patched into the total. They are separate measures, and the classical practice is to read them beside it rather than fold them in.',
   'On this page: vargottama is marked [V] beside the graha in the chart; an exchange and a cancelled debilitation are both reported among the yogas; and dig bala is a column of its own in Shadbala, which is the broader instrument and carries it as one of its six.'
 ],
 null, 704)

on conflict (topic, subject, condition) do update set
  heading = excluded.heading,
  points = excluded.points,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_at = now();
