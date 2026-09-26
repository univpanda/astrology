-- Interpretive passages, seeded from here rather than typed into the database.
--
-- The repo is the source of truth and the table is a copy: content that exists
-- only in a database has no history, no review and no way back from a bad edit.
-- Re-running this updates passages in place, since (topic, subject, condition)
-- is unique.
--
--   psql "$DATABASE_URL" -f supabase/seed/astro_readings.sql
--
-- Text is kept as the author wrote it, including their spellings.

insert into astro_readings (topic, subject, condition, heading, points, sort_order) values
('graha', 'Sun', 'strong',
 'A strong Sun in the horoscope gives',
 array[
   'Strong will and character.',
   'Father enjoying good health and status in life - since Sun is Karka for father.',
   'Courage, good health, endurance, vitality, confidence.',
   'Straight forward and has qualities of leadership.',
   'Sun is signification for soul. It helps to seek enlightenment and ultimate truth.',
   'Fame, high rank and good relations with government and bosses. Good for politicians, high ranking government officers, diplomats, surgeons, doctors and scientists.',
   'A strong but afflicted with malefic, Sun makes one tyrant, arrogant, short of temper and impatient.'
 ], 500),

('graha', 'Sun', 'weak',
 'A weak Sun in the horoscope gives',
 array[
   'In deep debilitation, 10 degrees Libra, makes one sick, poor, unhealthy and of short life. According to Parasara it cancels all Raj Yogas.',
   'Lack of confidence, cowardly, with weak eyesight. If Sun is weak, health is weak. Keeps aloof from company, weak Sun in 12th house makes one abandoned person.',
   'Trouble to father, especially when hemmed in malefics or when malefics are in seventh from Sun.',
   'Loss of money afflicted with Mars having ownership of 6, 8 and 12 houses will give major accident. Afflicted with Saturn loss, misery misunderstanding with father and superiors, ill fame, set back in profession, false pride, flattery, egotist, overbearing, vainglorious, weak and vacillating.',
   'Clash with bosses and government, defalcation and trouble with customs, income tax etc.',
   'Sun afflicted in signs of Mercury and Jupiter gives diseases related to lungs, consumption. Afflicted in sign Cancer makes one sick with defective eyesight. In 6th from Moon and afflicted could mean trouble with intestines and digestive organs. Afflicted by Mars and Saturn mean operation for appendicitis. In the sixth it causes digestive and intestine problem. Afflicted in 4th or 5th house could cause heart problem.'
 ], 501)

on conflict (topic, subject, condition) do update set
  heading = excluded.heading,
  points = excluded.points,
  sort_order = excluded.sort_order,
  updated_at = now();
