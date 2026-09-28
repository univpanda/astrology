-- Nakshatras and dashas. The graha tables print a nakshatra, a pada and a lord
-- and sub lord in every row, and the page shows a dasha sequence, none of which
-- the library explained.
--
--   psql "$DATABASE_URL" -f supabase/seed/astro_readings_nakshatra.sql

insert into astro_readings (topic, subject, condition, heading, points, note, source, sort_order) values
('nakshatra', 'Nakshatra', 'general',
 'The twenty-seven lunar mansions',
 array[
   'The circle divided into 27 rather than 12, each nakshatra 13 degrees 20 minutes wide. It is the older division of the two and much of what makes Vedic astrology different from Western rests on it.',
   'Twenty-seven is chosen because the Moon takes about 27 days to go round, so it crosses roughly one nakshatra a day. They are the Moon''s resting places, which is what the word means.',
   'They cut across the signs rather than nesting inside them. Nine nakshatras cover four signs exactly, so a nakshatra can straddle a sign boundary and most do not begin where a sign begins.',
   'The one the Moon occupies at birth is the janma nakshatra, and it is read as the temperament rather than the circumstances. It also fixes where the dasha sequence starts.',
   'Every nakshatra has a ruling graha, and the order of those rulers is the order the dashas run in.'
 ],
 'Padas, lords and sub lords follow below.', 'Brihat Parashara Hora Shastra, tr. R. Santhanam. The 27-fold division runs throughout the text; the lords and their years are ch.46.', 400),

('nakshatra', 'Nakshatra', 'pada',
 'Padas, the quarters',
 array[
   'Each nakshatra divides into four padas of 3 degrees 20 minutes. Four padas times twenty-seven is a hundred and eight, which is why that number recurs throughout the tradition.',
   'A pada is exactly one navamsha. So the pada a graha sits in tells you its navamsha sign directly, and the D9 chart and the padas are two ways of writing the same division.',
   'That is also why a birth time wrong by ten minutes matters: the ascendant moves about two and a half degrees in that time, which is most of a pada.'
 ],
 null, 'Brihat Parashara Hora Shastra ch.7 for the navamsa the padas correspond to, tr. R. Santhanam.', 401),

('nakshatra', 'Nakshatra', 'lords',
 'The lord of a nakshatra',
 array[
   'Each nakshatra is ruled by one of the nine grahas, running Ketu, Venus, Sun, Moon, Mars, Rahu, Jupiter, Saturn, Mercury and repeating three times over the twenty-seven.',
   'The lord is what the dasha sequence is built from: the dasha running at birth is the lord of the Moon''s nakshatra, and the rest follow in that same order.',
   'It is also the plainest thing a nakshatra tells you about a graha standing in it. A graha takes something of the nature of its nakshatra''s lord, which is why two grahas in the same sign can read quite differently.'
 ],
 'The Grahas table prints a sub lord underneath this one. It comes from a different system; see The sub lord.', 'Brihat Parashara Hora Shastra ch.46, tr. R. Santhanam, for the Vimshottari order and the years each lord holds.', 402),

('nakshatra', 'Nakshatra', 'sublord',
 'The sub lord, and where it comes from',
 array[
   'The Grahas table prints a sub lord beneath the lord of every nakshatra. The two rows look alike and do not carry the same authority, which is worth knowing before either is used.',
   'The lord is Parashara''s. Each of the twenty-seven mansions takes its ruler from the Vimshottari order, and that order and the years behind it are chapter 46.',
   'The sub lord divides a single nakshatra into nine unequal parts, in the same order and the same proportions as the dasha: a lord''s share of the 13 degrees 20 minutes is its share of the 120 years. So the first sliver of any nakshatra is ruled twice over by the same graha, and the widest part of all belongs to Venus, who holds twenty of the hundred and twenty.',
   'The ingredients are classical and the combination is not. Subdividing a nakshatra''s arc by the dasha proportions is Krishnamurti Paddhati, from K. S. Krishnamurti in the middle of the twentieth century, and it is in none of the Parashari works this library is built on. Raman does use the phrase sub-lord, but he means the ruler of a dasha sub-period, which divides time rather than longitude, and that is a different thing wearing the same name.',
   'It is kept on the page because it is genuinely useful for fine timing and because anyone working in that system will look for it. It is named here because a row sitting directly under a classical one should not quietly borrow its standing.',
   'Because the parts are unequal and the order starts from the nakshatra''s own lord, two grahas can share a sign, a nakshatra and a lord and still have different sub lords. That discrimination is the whole reason to look.',
   'Nothing else on this site reads it. No yoga, no strength measure and no dasha depends on the sub lord, so it can be taken or left without anything else moving.'
 ],
 'The lord above it is classical; see Lords.',
 'The nine-fold order and the Vimshottari years are Brihat Parashara Hora Shastra ch.46, tr. R. Santhanam. Subdividing a nakshatra by them is Krishnamurti Paddhati and appears in none of the works otherwise cited here: not Parashara, not Mantreswara''s Phaladeepika, and nowhere in Raman''s Graha and Bhava Balas, Hindu Predictive Astrology or Three Hundred Important Combinations. K. S. Krishnamurti''s own writings have not been consulted.',
 403),

('dasha', 'Vimshottari', 'general',
 'The dasha sequence',
 array[
   'A dasha is a period ruled by one graha, during which that graha''s promise in the chart is what tends to come about. A chart says what is possible; the dasha says when.',
   'Vimshottari is the system in general use. Its nine periods run Ketu 7 years, Venus 20, Sun 6, Moon 10, Mars 7, Rahu 18, Jupiter 16, Saturn 19, Mercury 17, and they total 120, which is the full human span the system assumes.',
   'The sequence starts from the lord of the Moon''s nakshatra at birth, and the first period is not run in full: the Moon has already passed through part of that nakshatra, and the same fraction of the period is already spent. What remains is the balance at birth.',
   'So two people born on the same day under different nakshatras begin in different dashas, and two born under the same nakshatra at different times begin at different points within one.',
   'Each dasha divides into antardashas in the same order and the same proportions, and those divide again. The usual reading takes the dasha lord and the antardasha lord together.'
 ],
 'Strength decides how much a dasha delivers; see the Strength topic.', 'Brihat Parashara Hora Shastra ch.46, tr. R. Santhanam.', 800),

('dasha', 'Vimshottari', 'reading',
 'Reading a period',
 array[
   'Read the dasha lord three ways at once, as any graha is read: what it naturally signifies, the houses it owns, and the house it sits in. A Saturn dasha is not one thing; it is what Saturn is to that chart.',
   'A graha that is strong and well placed gives its own results generously during its period. One that is weak, afflicted or in a dusthana gives them grudgingly or not at all, which is where a strength measure earns its keep.',
   'A yoga fructifies in the dashas of the grahas that form it. This is the most practical use of finding a yoga at all: the combination says what is promised, and the period says when it is due.',
   'Antardashas within a period often matter more than the period itself for dating an event, since a twenty year Venus dasha is too coarse to answer most questions.'
 ],
 null, 'Brihat Parashara Hora Shastra chs.46-48, tr. R. Santhanam; B. V. Raman, Hindu Predictive Astrology, on reading a dasha lord by ownership and placement.', 801),

('dasha', 'Vimshottari', 'year',
 'How long a dasha year is, and who says so',
 array[
   'Every text gives the cycle as 120 years. Almost none says how long a year is, and that is the one number a program cannot decline to choose, because a dasha has to end on a date.',
   'Parashara is silent. Chapter 46 gives the lords beginning from Krittika, the order, the years - 6, 10, 7, 18, 16, 19, 17, 7 and 20 - and the total of 120, and says nothing about days. B. V. Raman states no dasha year either. K. S. Charak, in Elements of Vedic Astrology, gives exactly the method used here, the balance being the unelapsed part of the Moon''s nakshatra, and then refers the reader to tables rather than to a constant.',
   'Parashara does fix a year elsewhere, and it is a trap to borrow it. Chapter 43, on longevity, uses a savana year of 360 days, and says why in the same breath: "as we have used 360 degrees of the zodiac". The year is 360 days there because that calculation converts degrees into years, which has nothing to do with Vimshottari. Its own conversion out to solar years, by a factor of 0.9856034, implies about 365.2446 days.',
   'The one authority who states a year in a book about this dasha is K. N. Rao. Dasha Nirnay opens by settling it: "The Sun takes 365 days 6 hours 12 minutes and 36 seconds to complete a round of the zodiac." Written out that is 365.25875 days, and it is what this site uses.',
   'A round of the zodiac is the substance of it. That is the sidereal year, the Sun returning to the same fixed star, and not the tropical year of the seasons, which is some twenty minutes shorter. The figure is the Surya Siddhanta''s. Charak reaches the same frame from the other direction, using the sidereal year wherever he needs a year of a life, as in the annual chart.',
   'The spread between the plausible answers is small and not nothing. A Gregorian calendar year, a Julian year and Rao''s sidereal year put the end of a twenty-year dasha within about a third of a day of each other, and the end of the full cycle within two days. On a mahadasha boundary that is invisible. On an antardasha or a pratyantardasha it is not, and those are what people date events by.',
   'So if dasha dates here differ from another program by a day or two, the year length is the likely reason and neither program is wrong. If they differ by weeks, look instead at the ayanamsa, which moves the Moon and so moves the balance at birth.',
   'One value deserves naming as a trap, because this site used it. A calculator quietly running on 365.2425 is using the Gregorian calendar''s mean year, which is an artifact of which century years take a leap day. It is not an astronomical quantity and no authority proposes it. It sat here until somebody asked which book each number came from.'
 ],
 'The balance at birth is proportional to the unelapsed part of the nakshatra; see Vimshottari.',
 'K. N. Rao, Dasha Nirnay: Vimshottari Dasha, for the year. Brihat Parashara Hora Shastra ch.46 for the lords and years and ch.43 for the savana year of the longevity calculation, tr. R. Santhanam. K. S. Charak, Elements of Vedic Astrology, for the balance method and for the sidereal year in Varshaphala. B. V. Raman''s Hindu Predictive Astrology and Graha and Bhava Balas were checked and state no dasha year; the 334/365 conversion in the former belongs to longevity. Sheshadri Iyer has not been consulted - no copy was obtainable - so this survey is not exhaustive.',
 802)

on conflict (topic, subject, condition) do update set
  heading = excluded.heading,
  points = excluded.points,
  note = excluded.note,
  source = excluded.source,
  sort_order = excluded.sort_order,
  updated_at = now();
