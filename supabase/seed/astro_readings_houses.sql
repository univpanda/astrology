-- House groupings and lordship. Kendra, trikona and dusthana are used by almost
-- every yoga in the library and were nowhere defined.
--
--   psql "$DATABASE_URL" -f supabase/seed/astro_readings_houses.sql

insert into astro_readings (topic, subject, condition, heading, points, note, sort_order) values
('house', 'House groups', 'general',
 'Why houses are grouped',
 array[
   'Almost every classical rule is stated about a group of houses rather than about one house. A yoga does not say "the 4th lord"; it says "an angle lord", which means the lord of the 1st, 4th, 7th or 10th.',
   'The four groups worth knowing first are the kendras, the trikonas, the dusthanas and the upachayas. A house can belong to more than one, and the 1st belongs to three of them.',
   'Learning these is the shortest route into the rest of the library, because once they are known most yoga definitions read as plain sentences.'
 ],
 'Each group follows below.', 200),

('house', 'House groups', 'kendra',
 'Kendra - the angles: 1, 4, 7, 10',
 array[
   'The four angles, ninety degrees apart, called Vishnu sthanas in the text. They are the pillars of a chart: what stands in them acts visibly and in the open.',
   'A graha in a kendra has scope to act, which is why the Mahapurusha yogas all require one, and why dig bala, the directional strength, is measured towards particular angles.',
   'There is an old caution about kendra lordship: a natural benefic owning a kendra loses some of its power to do good, and a natural malefic owning one loses some of its power to harm. The angles are strong enough to blunt the graha''s own nature.'
 ],
 null, 201),

('house', 'House groups', 'trikona',
 'Trikona - the trines: 1, 5, 9',
 array[
   'The trines, a hundred and twenty degrees apart, called Lakshmi sthanas. They carry fortune, merit and what comes without being fought for.',
   'The 5th and 9th are the two that matter for most rules; the 1st counts as a trine in general talk but is treated as an angle where the two groups are being contrasted, as in raja yoga.',
   'Trikona lords are held to be unreservedly good, whatever their natural nature, which is the opposite of the caution attached to kendra lordship.',
   'A relationship between an angle lord and a trine lord is the classical raja yoga, and a single graha owning one of each is a yogakaraka.',
   'Only six of the twelve lagnas produce a yogakaraka at all: Mars for Cancer and Leo, Venus for Capricorn and Aquarius, Saturn for Taurus and Libra. The other six have none, which is worth knowing before hunting for one.',
   'Chapter 34 words every example from the ascendant - "For Libra ascendant, Saturn is classified as unsullied yoga-karaka because he owns the 4th (an angle) and the 5th (a trine)". Counting from somewhere else, as one does when reading a chart from the Moon, gives a different answer, because the houses have moved and lordship is a statement about houses.'
 ],
 null, 202),

('house', 'House groups', 'dusthana',
 'Dusthana - the houses of difficulty: 6, 8, 12',
 array[
   'The 6th of illness, debt and enemies, the 8th of longevity, obstruction and what is hidden, the 12th of loss, expense and confinement.',
   'A graha in a dusthana is generally weakened in what it signifies, and a house whose lord has gone into one is generally weakened too.',
   'The exception is the vipareeta raja yoga, where a dusthana lord falls into another dusthana. Two sources of harm working on each other is read as the harm cancelling rather than doubling.',
   'The 3rd is sometimes counted a mild dusthana, and the 8th and 12th are read differently again for matters of renunciation, where obstruction is not the point.'
 ],
 null, 203),

('house', 'House groups', 'upachaya',
 'Upachaya - the houses that grow: 3, 6, 10, 11',
 array[
   'Upachaya means increase. These are the houses whose matters improve with time and effort rather than arriving settled.',
   'Malefics are welcome here, which is the one place that is routinely true. Saturn or Mars in the 3rd, 6th, 10th or 11th is read as drive and endurance applied to something that rewards them.',
   'It is also why the 6th appears in two groups at once. As a dusthana it is difficulty; as an upachaya it is difficulty that can be worked on and overcome.'
 ],
 null, 204),

('house', 'Lordship', 'general',
 'Lords and dispositors',
 array[
   'The lord of a house is the graha owning the sign that falls in it. Since the lagna fixes which sign falls where, every chart has its own set of lordships, and the same graha means different things from different lagnas.',
   'Where a lord goes, it carries its house with it. The 10th lord in the 7th ties career to partnership; the 7th lord in the 12th ties marriage to distance or loss. Reading a chart is largely reading this traffic.',
   'The dispositor of a graha is the lord of the sign that graha is sitting in. A graha is a guest in someone else''s sign and the dispositor is the host, so how the two stand to each other says how comfortable the stay is.',
   'The relation is asymmetric and has to be read in the stated direction. Natural friendship is not mutual: the Moon counts Mercury a friend and Mercury counts the Moon an enemy, so who regards whom matters.',
   'A graha in its own sign is its own dispositor, which is the most comfortable case of all and needs no further reading.'
 ],
 'Friendship itself is under Dignity.', 205)

on conflict (topic, subject, condition) do update set
  heading = excluded.heading,
  points = excluded.points,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_at = now();
