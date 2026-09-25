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
