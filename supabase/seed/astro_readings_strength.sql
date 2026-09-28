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
   'Each share-out has its own place in chapter 7. The Shadvarga and the Saptavarga are given at verses 17-19, the Dasavarga at verse 20, and the Shodasavarga at verses 21-25 - which is also where the varga viswa fractions above are given, the four bands following at verses 26-27.',
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
 null, 704),

('strength', 'Vimsopaka Bala', 'exclusions',
 'Who the count leaves out, and who stands in',
 array[
   'Rahu and Ketu are not scored. The whole measure is a relation to the lord of the sign a division gives - own sign, friend, enemy - and the nodes own no sign and keep no friendships, so there is no relation to take. A row for them would be blank in every column and totalled in none.',
   'That is not the same as saying they have no dignity. Raman gives them exaltation signs, which this site follows, and those are read where exaltation is read. It is friendship they lack, and friendship is what vimsopaka counts.',
   'The trimsamsa is the one division where a graha can be asked about a lordship that does not exist. Parashara gives its five lords as Mars, Saturn, Jupiter, Mercury and Venus in an odd sign and the reverse in an even one, ch.6 verses 27-28. Neither luminary appears: the Sun and the Moon rule no trimsamsa at all.',
   'So in D30 the Sun is judged as Mars would be and the Moon as Venus would be, which is what lets a luminary hold a trimsamsa of its own rather than being a guest in every one of them.',
   'The substitution is for ownership only. Everything else about the two - their exaltation, their debilitation, their friendships with the other grahas - is read as the Sun and the Moon, not as their stand-ins.'
 ],
 'The nodes'' exaltation signs are set out under Dignity.', 705),

-- Shadbala. The panel prints fifteen rows and a verdict; what a reader cannot
-- get from the panel is what each share is measuring, what the verdict is
-- measured against, and which of the figures rest on a reading that another
-- authority contradicts. Those three go here.

('strength', 'Shadbala', 'general',
 'What the six strengths are',
 array[
   'Shadbala is six separate measures of a graha added into one figure, given in shashtiamsas, of which sixty make a rupa. Parashara sets it out in chapter 27 and B. V. Raman''s Graha and Bhava Balas is the standard English working of it.',
   'Sthana bala, positional. How far the graha stands from its own debilitation point, how it relates to the lord of the sign it takes in each of seven divisions, whether it sits in the odd or even sign and navamsa it prefers, whether it holds an angle, and whether it holds the third of a sign that matches its sex.',
   'Dig bala, directional. Each graha has one angle it is strongest on and is worth nothing opposite it: Jupiter and Mercury the ascendant, the Sun and Mars the 10th, Saturn the 7th, the Moon and Venus the 4th. The arc between the graha and its powerless point, divided by three.',
   'Kala bala, temporal. Eight parts, and a ninth where there is a planetary war: day or night, the lunar fortnight, the third of day or night, the lords of the year, month, weekday and hora, and declination.',
   'Cheshta bala, motional. Strength from how the graha is moving, which is greatest near retrogression. The Sun and the Moon never retrograde and borrow instead - the Sun its ayana bala, the Moon its paksha bala.',
   'Naisargika bala, natural. A constant per graha, the same in every chart, running from the Sun''s sixty down to Saturn''s 8.57 in order of brightness.',
   'Drik bala, aspectual. What the benefics aspecting the graha are worth less what the malefics are, quartered. The only share that can be negative.',
   'Rahu and Ketu are outside all of it. Shadbala is reckoned for the seven grahas only.'
 ],
 'What a high total does and does not mean is set out under Strength and influence.', 706),

('strength', 'Shadbala', 'reading',
 'What a Shadbala total is measured against',
 array[
   'The requirement differs by graha, so a total is only ever read against its own minimum and never against another graha''s. Raman gives them as 300 shashtiamsas for the Sun, 360 for the Moon, 300 for Mars, 420 for Mercury, 390 for Jupiter, 330 for Venus and 300 for Saturn - five, six, five, seven, six and a half, five and a half and five rupas.',
   'That is why Mercury so often reads weak. It is asked for more than any other graha, and a total that would make the Sun comfortably strong leaves Mercury short.',
   'There is a second set of minimums that the panel does not print. Chapter 27 verses 34-36 give a required figure for each share separately, by group: Jupiter, Mercury and the Sun want 165 sthana, 35 dig, 50 kala, 112 cheshta and 30 ayana; the Moon and Venus want 133, 50, 30, 100 and 40; Mars and Saturn want 96, 30, 40, 67 and 20.',
   'Santhanam''s note on those verses is that meeting them makes a graha considerably favourable even where the total falls short of the overall requirement. Read the other way, a graha can clear its total while failing several of its parts, which is worth knowing before a single verdict is trusted.',
   'A war changes the total. Where two of the five starry grahas stand within a degree of each other the loser gives strength to the winner, and a graha''s verdict can turn on it.'
 ],
 'The war is set out under Yuddha bala.', 707),

('strength', 'Yuddha bala', 'general',
 'Planetary war, and why the answer is small',
 array[
   'Two grahas within one degree of each other are at war. Only the five starry grahas fight - Mars, Mercury, Jupiter, Venus and Saturn - and the Sun and the Moon never take a side. It happens in about one chart in twelve.',
   'Raman gives the victor as the graha of lesser longitude, sections 76 and 77. Parashara''s chapter 79 instead makes Venus the victor always and otherwise the more northerly graha the victor, which is a different rule and disagrees about who won in half of all wars.',
   'The size of the correction is where the two readings part company entirely. Chapter 27 verse 20 says the difference between the two Shad-balas is added to the victor and deducted from the vanquished, and taken at that the correction reaches 272 shashtiamsas - more than four rupas, more than any graha''s whole requirement. Where the victor happened to be the weaker of the two, the pair simply exchange totals.',
   'Raman divides that difference by the difference between the diameters of the two grahas'' discs, which he tabulates as 9.4 for Mars, 6.6 for Mercury, 190.4 for Jupiter, 16.6 for Venus and 158.0 for Saturn. The same war that moved 117 shashtiamsas each way under the bare verse moves 0.7 under Raman.',
   'The disc diameters are the whole of the difference, and the bare verse does not mention them. A war between Jupiter and Saturn, whose discs are both large and close in size, is divided by a small number and so counts for more; a war between Mercury and Mars, whose discs are small and closer still, counts for more again; a war between Jupiter and Mercury is divided by almost the full 190 and nearly vanishes.',
   'This site follows Raman. A calculator that applies the difference raw will disagree sharply on any chart that holds a war, and one that omits yuddha bala altogether will disagree in the other direction.'
 ],
 'The aggregate compared is sthana, dig and kala as far as hora bala, so ayana and the war itself stay out of it.', 708),

('strength', 'Drik bala', 'general',
 'Aspect strength, and the shape of a drishti',
 array[
   'Drishti is not a thing a graha either casts or does not. It rises and falls with the exact angle between two grahas, and Raman gives the curve in sections 114 and 115, from Sripathi, noting that Parashara gives the same rules.',
   'It is nothing at 30 degrees, fifteen at 60, forty-five at 90, thirty at 120, nothing again at 150, sixty at 180, and falls away to nothing at 300. Between those points it moves in straight lines, so a graha''s drishti changes with every degree it travels.',
   'The familiar table - a quarter aspect on the 3rd and 10th, a half on the 5th and 9th, three quarters on the 4th and 8th, full on the 7th - is that curve read off at the cusps and nowhere else. It is exact at seven points of the circle and an approximation everywhere between them.',
   'Visesha drishti, the special aspect, adds to the ordinary value rather than replacing it: fifteen more for Mars on the 4th and 8th, thirty for Jupiter on the 5th and 9th, forty-five for Saturn on the 3rd and 10th. Each brings the total to exactly sixty at the cusp, which is why replacing it with sixty looks right until a graha is anywhere but the cusp.',
   'The drishti pinda is the sum of all of it over one graha, benefic aspects positive and malefic negative. Drik bala is a quarter of that pinda, and nothing else. Santhanam''s verse 19 adds "super add the entire aspect of Mercury and Jupiter"; Raman''s section 120 has no such clause, and his worked example settles it - his Sun takes a pinda of +63.45 and a drik bala of +15.86, the quarter exactly, with Jupiter among the grahas aspecting it.'
 ],
 'It is the one share that can be negative, so a graha can lose strength by being looked at.', 709),

('strength', 'Shadbala', 'limits',
 'Where the authorities disagree, and what this site chose',
 array[
   'Shadbala looks like arithmetic and is partly interpretation. Several of its figures rest on a reading that another primary authority contradicts, and a total is only as settled as the choices behind it. These are the ones that move results here.',
   'The saptavargaja ladder. Raman''s section 30 gives 45 in moolatrikona and 30 in an own sign, then halves at every step down: 22.5 in a great friend''s varga, 15 in a friend''s, 7.5 in a neutral''s, 3.75 in an enemy''s, 1.875 in a great enemy''s. Santhanam''s translation of chapter 27 gives 20, 15, 10, 4 and 2 for those lower five instead, with Saravali corroborating. This site uses Raman''s, his worked table for the Standard Horoscope being built entirely from those figures. The two differ by about five shashtiamsas on average and move one verdict in forty.',
   'Cheshta bala. Raman computes it from the chesta kendra, the graha''s distance from its seeghrocha, which is the classical method. This site reads it off the graha''s motion against its own mean and extremes instead, which tracks the same thing closely but not exactly - the two agree to better than 0.99 for Saturn and Jupiter and about 0.88 for Mars.',
   'The Moon''s nature. Chapter 2 verse 11 names the "decreasing Moon" among the malefics and does not say where decreasing begins. Santhanam reads it as the dark fortnight, so the boundary falls at opposition. Raman reads it as the thin Moon and fixes the boundary at the eighth day either side - full and strong from the eighth of the bright half to the eighth of the dark half - which is the reading in general use. This site follows Raman. The two disagree in half of all charts, and the Moon''s nature feeds paksha bala, drik bala and every yoga that asks whether a graha is benefic.',
   'Two clauses go with that choice. Santhanam''s notes add that a waning Moon conjunct or aspected by a benefic turns benefic, and that a waning Moon with Mercury makes both benefic. Both are his commentary rather than the verse and Raman carries neither, so neither is applied here. What the verse itself gives Mercury is kept: it is a malefic if it joins a malefic.',
   'Ayana bala. Raman scales it by a constant 24 degrees after Kesava Daivagna; this site uses the true obliquity. The difference is about half a shashtiamsa.',
   'None of these is a defect to be patched. They are places where two primary sources say different things, and the useful habit is to know which reading produced a figure before comparing it with a figure from somewhere else.'
 ],
 'What vimsopaka bala cannot see is a separate list, under Vimsopaka Bala.', 710)

on conflict (topic, subject, condition) do update set
  heading = excluded.heading,
  points = excluded.points,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_at = now();
