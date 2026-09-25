-- Yoga passages. See supabase/seed/astro_readings.sql for the table's shape.
--
-- Maha, khala and dainya are not three yogas beside parivartana; they are the
-- three kinds of it. So they are one subject in three conditions, which is the
-- column that already exists for "the state the subject is in", rather than four
-- sibling subjects that only look related because their names begin alike.

insert into astro_readings (topic, subject, condition, heading, points, note, sort_order) values
('yoga', 'Parivartana', 'general',
 'Parivartana yoga - an exchange of signs',
 array[
   'Two grahas occupy each other''s signs: each sits in a sign the other rules, so each disposits the other. It is also called mutual reception.',
   'The effect is that two houses begin to act through one another. Each lord pursues its own affairs from inside the other''s domain, so the two matters rise and fall together rather than separately.',
   'Results are usually read during the dashas and antardashas of the two grahas involved, since that is when an exchange has occasion to act.',
   'It is classified in three by which two houses are exchanged - not by everything the two grahas rule. A graha may own two houses, and only the house whose sign is part of the swap belongs to the yoga.',
   'Strength still matters. An exchange between two weak grahas promises more than it delivers, which is why it is read alongside Shadbala rather than instead of it.'
 ],
 'The three kinds - maha, khala and dainya - follow below.', 10),

('yoga', 'Parivartana', 'maha',
 'Maha parivartana - the auspicious exchange',
 array[
   'An exchange between the lords of the good houses: the 1st, 2nd, 4th, 5th, 7th, 9th, 10th and 11th.',
   'The two houses reinforce each other, and the yoga is read as strongly favourable - the more so when the houses are a kendra and a trikona, which is the raja yoga pairing.',
   'What it gives follows the houses exchanged rather than any fixed list: a 2nd and 11th exchange speaks of income and accumulation, a 4th and 10th of home and standing, a 5th and 9th of learning and fortune.',
   'Both grahas gain, since each is placed in a sign whose lord is working on its behalf.'
 ], null, 11),

('yoga', 'Parivartana', 'khala',
 'Khala parivartana - the mixed exchange',
 array[
   'An exchange involving the lord of the 3rd house with the lord of one of the good houses.',
   'Read as mixed. The 3rd is an upachaya house of effort, initiative and courage, so what it brings is earned rather than given, and typically comes after struggle.',
   'The good house in the pair is not spoiled, but its results arrive through exertion, and often through the person''s own initiative rather than through others.',
   'Khala means mischievous or wicked, which overstates it: the classical sense is of a benefit that arrives awkwardly.'
 ], null, 12),

('yoga', 'Parivartana', 'dainya',
 'Dainya parivartana - the afflicted exchange',
 array[
   'An exchange involving the lord of a dusthana - the 6th, 8th or 12th.',
   'Read as difficult. The dusthana draws its partner''s affairs into its own, so the good house suffers obstruction, loss, or dependence on others in the matters it governs.',
   'Dainya means poverty or wretchedness. The classical reading is of effort that does not repay, and of the better house being pulled down rather than the worse one lifted.',
   'One exception is worth knowing: where both houses in the exchange are themselves dusthanas, some authorities read a cancellation rather than an affliction, on the same logic as vipareeta raja yoga - two afflictions turned against each other.'
 ], null, 13)

on conflict (topic, subject, condition) do update set
  heading = excluded.heading,
  points = excluded.points,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into astro_readings (topic, subject, condition, heading, points, note, sort_order) values
('yoga', 'Neecha Bhanga Raja Yoga', 'general',
 'Neecha bhanga - a debilitation cancelled',
 array[
   'A graha in its sign of debilitation is at its weakest, but the weakness can be lifted by the company it keeps. That lifting is neecha bhanga.',
   'The cancellations the texts give are several, and few authorities list them all. The usual ones: the lord of the sign the graha sits in is in a kendra from the lagna or the Moon; the graha that would be exalted in that sign is in a kendra from either; the debilitated graha is conjunct or aspected by its dispositor; the two exchange signs; the debilitated graha is exalted in navamsa; or it stands in a kendra itself.',
   'They are not equally persuasive. A debilitated graha exalted in navamsa is a stronger claim than its dispositor merely occupying a kendra, which is why the cancellations that apply are worth naming rather than counting.',
   'What a cancellation gives is not the same as exaltation. The classical sense is of a fall arrested: the graha recovers its footing, often after an early period in which the debilitation is felt plainly.',
   'A debilitated graha with no cancellation at all is read as it stands, and its dasha is usually where the difficulty shows.'
 ],
 'Becomes a raja yoga under the condition below.', 20),

('yoga', 'Neecha Bhanga Raja Yoga', 'raja',
 'When the cancellation makes a raja yoga',
 array[
   'The stricter reading: a cancelled debilitation is a raja yoga when the graha also stands in a kendra or a trikona - the 1st, 4th, 5th, 7th, 9th or 10th.',
   'The reasoning is that a cancellation restores the graha''s strength, but only an angle or a trine gives it the standing to act on that strength. A debilitation cancelled in the 6th or the 8th is still cancelled; it simply has less to work with.',
   'Where it applies, the classical promise is of rise from low beginnings - standing, authority and recognition arriving after a start that did not suggest them.',
   'Looser readings call any neecha bhanga a raja yoga. The distinction is kept here because a chart usually has one or two cancellations and rarely has one in a kendra or trikona, and treating those alike would make the yoga mean very little.'
 ], null, 21)

on conflict (topic, subject, condition) do update set
  heading = excluded.heading,
  points = excluded.points,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_at = now();

insert into astro_readings (topic, subject, condition, heading, points, note, sort_order) values
('yoga', 'Vipareeta Raja Yoga', 'general',
 'Vipareeta raja yoga - the reverse royal yoga',
 array[
   'Formed when the lord of a dusthana - the 6th, 8th or 12th - is itself placed in a dusthana.',
   'The reasoning is that a lord placed in a house harms it. A house of difficulty harmed is difficulty reduced, so the lord of one house of trouble sitting in another damages trouble itself. The enemy of an enemy.',
   'It is called reverse because the arrangement reads badly and gives well. The classical promise is of rise through circumstances that looked like ruin - gain through loss, advancement through the failure of rivals, recovery after illness or debt.',
   'It is named for the house whose lord it is, not the house it sits in: harsha from the 6th, sarala from the 8th, vimala from the 12th.',
   'Results are read in the dasha of the graha concerned, and the classical texts are consistent that the good does not arrive quietly - it tends to follow a period in which the dusthana was felt plainly.'
 ],
 'The three forms - harsha, sarala and vimala - follow below.', 30),

('yoga', 'Vipareeta Raja Yoga', 'harsha',
 'Harsha yoga - from the sixth lord',
 array[
   'The lord of the 6th placed in the 6th, 8th or 12th.',
   'The 6th governs enemies, debt, disease and service. Harmed, those are what recede: the classical reading is of a person free of illness, free of debt, and unbeaten by rivals.',
   'Harsha means delight or gladness, which is the sense of the result rather than of the placement.',
   'Of the three it is the one most often read as straightforwardly good, the 6th being the least ambiguous of the houses of difficulty.'
 ], null, 31),

('yoga', 'Vipareeta Raja Yoga', 'sarala',
 'Sarala yoga - from the eighth lord',
 array[
   'The lord of the 8th placed in the 6th, 8th or 12th.',
   'The 8th governs longevity, obstruction, sudden reversal and what is hidden. Harmed, the classical reading is of long life, fearlessness, and survival of what should have ended badly.',
   'Sarala means straight or honest - the sense being of a path that runs clear where it should have been blocked.',
   'Because the 8th also governs inheritance and what comes unearned, some authorities read gain arriving through others rather than through one''s own effort.'
 ], null, 32),

('yoga', 'Vipareeta Raja Yoga', 'vimala',
 'Vimala yoga - from the twelfth lord',
 array[
   'The lord of the 12th placed in the 6th, 8th or 12th.',
   'The 12th governs loss, expenditure, confinement and withdrawal. Harmed, the reading is of a person who spends little and keeps much, independent in conduct, and well regarded.',
   'Vimala means pure or spotless, and the classical descriptions dwell on character rather than circumstance more than the other two do.',
   'The 12th being also the house of release and of the life beyond this one, a strong vimala is sometimes read as favouring retreat, study or a spiritual turn late in life.'
 ], null, 33),

('yoga', 'Vipareeta Raja Yoga', 'caveat',
 'When the yoga is compromised',
 array[
   'A dusthana lord frequently owns a good house as well - Mars from a Gemini lagna owns both the 6th and the 11th, Saturn both the 8th and the 9th.',
   'The placement that damages the house of difficulty damages the good house with it, since it is one graha in one place. Whether that spoils the yoga is disputed and the texts do not settle it.',
   'The stricter reading holds that a vipareeta is at its cleanest when the graha owns no good house, or when the good house it owns is itself weak and loses little.',
   'A second common condition: the dusthana lord should not be joined by or aspected by a lord of a kendra or trikona, since it would then carry the damage to that house too.',
   'This page reports which good houses a graha also owns and leaves the judgement, rather than silently counting the yoga in or out.'
 ], null, 34)

on conflict (topic, subject, condition) do update set
  heading = excluded.heading,
  points = excluded.points,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_at = now();
