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
 'The three kinds - maha, khala and dainya - follow below.', 910),

('yoga', 'Parivartana', 'maha',
 'Maha parivartana - the auspicious exchange',
 array[
   'An exchange between the lords of the good houses: the 1st, 2nd, 4th, 5th, 7th, 9th, 10th and 11th.',
   'The two houses reinforce each other, and the yoga is read as strongly favourable - the more so when the houses are a kendra and a trikona, which is the raja yoga pairing.',
   'What it gives follows the houses exchanged rather than any fixed list: a 2nd and 11th exchange speaks of income and accumulation, a 4th and 10th of home and standing, a 5th and 9th of learning and fortune.',
   'Both grahas gain, since each is placed in a sign whose lord is working on its behalf.'
 ], null, 911),

('yoga', 'Parivartana', 'khala',
 'Khala parivartana - the mixed exchange',
 array[
   'An exchange involving the lord of the 3rd house with the lord of one of the good houses.',
   'Read as mixed. The 3rd is an upachaya house of effort, initiative and courage, so what it brings is earned rather than given, and typically comes after struggle.',
   'The good house in the pair is not spoiled, but its results arrive through exertion, and often through the person''s own initiative rather than through others.',
   'Khala means mischievous or wicked, which overstates it: the classical sense is of a benefit that arrives awkwardly.'
 ], null, 912),

('yoga', 'Parivartana', 'dainya',
 'Dainya parivartana - the afflicted exchange',
 array[
   'An exchange involving the lord of a dusthana - the 6th, 8th or 12th.',
   'Read as difficult. The dusthana draws its partner''s affairs into its own, so the good house suffers obstruction, loss, or dependence on others in the matters it governs.',
   'Dainya means poverty or wretchedness. The classical reading is of effort that does not repay, and of the better house being pulled down rather than the worse one lifted.',
   'One exception is worth knowing: where both houses in the exchange are themselves dusthanas, some authorities read a cancellation rather than an affliction, on the same logic as vipareeta raja yoga - two afflictions turned against each other.'
 ], null, 913)

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
   'A graha in its sign of debilitation is at its weakest, but the weakness can be lifted by the company it keeps. That lifting is neecha bhanga: nicha, the fall, and bhanga, its breaking.',
   'This site applies two conditions and no more. One: the lord of the sign the debilitated graha stands in is in a kendra from the lagna or from the Moon. Two: the graha that would be exalted in that sign is in a kendra from either. Where one graha is both - in Virgo, Mercury rules the sign and is exalted in it - a single placement answers both, and it is reported as one clause saying so.',
   'Those two are what modern sources attribute to B. V. Raman, though that attribution has not been checked against his own text: the two scans of Three Hundred Important Combinations that carry full text both break off around the hundred and sixtieth combination, and Hindu Predictive Astrology mentions neecha bhanga only inside worked examples.',
   'De Fouw and Svoboda have been read, and give four at page 295 of Light on Life. The lord of the rashi the debilitated graha occupies, in a kendra from the Moon or lagna; the lord of the rashi where that graha is exalted, in a kendra from either; the lord of the rashi it occupies aspecting it; and the graha who would be exalted in the rashi it occupies, in a kendra from either. Their worked example is Saturn in Aries, cancelled by Mars, Venus or the Sun holding a kendra, or by Mars aspecting Aries.',
   'Their first and fourth are the two applied here. Their third is the dispositor''s aspect. Their second is a different rule that is easy to mistake for the fourth and never coincides with it: Mars debilitated in Cancer has Jupiter exalted there, while the lord of Aries, where Mars exalts, is the Sun. The two differ for all seven grahas, and on 480 charts that second alone would cancel a further 45 debilitations out of 257.',
   'The enumeration is nobody''s single invention. The Brihat Parashara Hora Sastra discusses a cancelled debilitation and works an example but nowhere lists the conditions; Phaladeepika chapter 7 from verse 26 is the canonical list, with Jataka Parijata and Uttara Kalamrita giving overlapping sets. Few authorities give all of them and they do not agree on how many must hold.',
   'Six further cancellations circulate between those texts and are not applied here: the debilitated graha conjunct its dispositor; aspected by its dispositor; aspected by the graha exalted in that sign; exchanging signs with its dispositor; exalted in navamsa; or itself standing in a kendra. Accepting all of them turns 72 per cent of rashi debilitations into cancellations into 92, measured over 480 charts.',
   'Nothing is lost by leaving out the exchange in particular. An exchange between a debilitated graha and its dispositor is parivartana yoga, which is reported in its own right, under its own name, on the same pair of grahas.',
   'The conditions carry no names of their own. They are clauses of a verse, and the name belongs to the result.',
   'Both conditions applied here are kendra placements, which is a generous test on its own: a kendra from either the lagna or the Moon reaches eight signs out of twelve, which is why cancellation stays common even on the narrow reading. Two of them holding together is a stronger claim than one, so the cancellations that apply are named rather than counted.',
   'De Fouw and Svoboda add that the dispositor''s own condition governs how much relief arrives: the better placed it is, the more the debilitated graha recovers, and the worst case is a dispositor that is itself debilitated - Saturn in Aries with Mars in Cancer.',
   'Santhanam adds a prerequisite in his commentary rather than a third condition: that the ascendant lord be strong before a cancelled debilitation is read as giving the splendid results the yoga promises. This site does not enforce it, and Shadbala is where that reading is checked.',
   'What a cancellation gives is not the same as exaltation. De Fouw and Svoboda put it as a prosthesis rather than a cure: the graha walks, and is never what an undebilitated graha would have been. The classical sense is of a fall arrested, often after an early period in which the debilitation is felt plainly.',
   'A debilitated graha with no cancellation at all is read as it stands, and its dasha is usually where the difficulty shows.'
 ],
 'Becomes a raja yoga under the condition below.', 920),

('yoga', 'Neecha Bhanga Raja Yoga', 'raja',
 'When the cancellation makes a raja yoga',
 array[
   'A cancelled debilitation is a raja yoga when the debilitated graha itself stands in a kendra or a trikona - the 1st, 4th, 5th, 7th, 9th or 10th, counted from the lagna. Otherwise the debility is merely removed, and it is reported as plain neecha bhanga.',
   'De Fouw and Svoboda are explicit on this at page 295 of Light on Life, and say it the same way round: the cancellation makes a raja yoga only where the graha occupies an angle or a trine. Occupying one, not owning one - a competing formulation asks instead that the debilitated graha rule a kendra or trikona, and this site does not use it.',
   'The reasoning is that a cancellation restores the graha''s strength while only an angle or a trine gives it the standing to act on that strength. A debilitation cancelled in the 6th or the 8th is still cancelled; it simply has less to work with.',
   'The two reference points differ on purpose. The cancellation is read from the lagna or the Moon, either being able to supply the help; the raja yoga is read from the lagna alone, standing in the chart being a house position from the ascendant.',
   'Where it applies, the classical promise is of rise from low beginnings - standing, authority and recognition arriving after a start that did not suggest them.',
   'Looser readings call any neecha bhanga a raja yoga. The distinction is kept here because it is the one that decides whether a low vimsopaka score is misleading: a graha cancelled but placed in a dusthana has little to act from, and a score near the floor is not far wrong for it.',
   'That is why the Vimsopaka Bala grid stars the raja form alone. Over a run of charts it marks about a third of the debilitations in the sixteen divisions rather than two thirds, and what it marks is the case where reading the floor at face value would be the real mistake.'
 ],
 null, 921),

('yoga', 'Vipareeta Raja Yoga', 'harsha',
 'Harsha yoga - from the sixth lord',
 array[
   'The lord of the 6th placed in the 6th, 8th or 12th.',
   'The 6th governs enemies, debt, disease and service. Harmed, those are what recede: the classical reading is of a person free of illness, free of debt, and unbeaten by rivals.',
   'Harsha means delight or gladness, which is the sense of the result rather than of the placement.',
   'Of the three it is the one most often read as straightforwardly good, the 6th being the least ambiguous of the houses of difficulty.'
 ], null, 931),

('yoga', 'Vipareeta Raja Yoga', 'sarala',
 'Sarala yoga - from the eighth lord',
 array[
   'The lord of the 8th placed in the 6th, 8th or 12th.',
   'The 8th governs longevity, obstruction, sudden reversal and what is hidden. Harmed, the classical reading is of long life, fearlessness, and survival of what should have ended badly.',
   'Sarala means straight or honest - the sense being of a path that runs clear where it should have been blocked.',
   'Because the 8th also governs inheritance and what comes unearned, some authorities read gain arriving through others rather than through one''s own effort.'
 ], null, 932),

('yoga', 'Vipareeta Raja Yoga', 'vimala',
 'Vimala yoga - from the twelfth lord',
 array[
   'The lord of the 12th placed in the 6th, 8th or 12th.',
   'The 12th governs loss, expenditure, confinement and withdrawal. Harmed, the reading is of a person who spends little and keeps much, independent in conduct, and well regarded.',
   'Vimala means pure or spotless, and the classical descriptions dwell on character rather than circumstance more than the other two do.',
   'The 12th being also the house of release and of the life beyond this one, a strong vimala is sometimes read as favouring retreat, study or a spiritual turn late in life.'
 ], null, 933),

('yoga', 'Vipareeta Raja Yoga', 'caveat',
 'When the yoga is compromised',
 array[
   'A dusthana lord frequently owns a good house as well - Mars from a Gemini lagna owns both the 6th and the 11th, Saturn both the 8th and the 9th.',
   'The placement that damages the house of difficulty damages the good house with it, since it is one graha in one place. Whether that spoils the yoga is disputed and the texts do not settle it.',
   'The stricter reading holds that a vipareeta is at its cleanest when the graha owns no good house, or when the good house it owns is itself weak and loses little.',
   'A second common condition: the dusthana lord should not be joined by or aspected by a lord of a kendra or trikona, since it would then carry the damage to that house too.',
   'This page reports which good houses a graha also owns and leaves the judgement, rather than silently counting the yoga in or out.'
 ], null, 934)

on conflict (topic, subject, condition) do update set
  heading = excluded.heading,
  points = excluded.points,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Lakshmi yoga. Parashara's wording and the common reading differ on one word,
-- and the difference is not small: "angle" excludes the trines, which is where
-- the yoga is most often claimed. Both are set out rather than one being quietly
-- presented as the text.

insert into astro_readings (topic, subject, condition, heading, points, note, sort_order) values
('yoga', 'Lakshmi Yoga', 'general',
 'Lakshmi yoga - fortune that holds',
 array[
   'Two conditions together. The lord of the 9th stands in its own sign, its moolatrikona or its exaltation sign, and the lord of the lagna is strong.',
   'The 9th is bhagya: fortune, dharma, the father, the guru, what arrives unearned. Its lord dignified means that source is in good order rather than borrowed or obstructed.',
   'The lagna lord being strong is the other half, and it is the half most often skipped. Fortune that arrives at a weak self is not kept. Parashara asks for both because either alone is a different yoga, or none.',
   'Named for Lakshmi, and read as wealth that stays rather than wealth that passes through - standing, reputation and means together, not a windfall.',
   'Venus is Lakshmi''s karaka, and some formulations add Venus''s own strength to the conditions. Parashara does not, so a dignified Venus is worth noting beside the yoga rather than counting as part of it.'
 ],
 'Where the 9th lord must stand is the one point the sources disagree on; see below.', 940),

('yoga', 'Lakshmi Yoga', 'angle',
 'Where the 9th lord must stand',
 array[
   'Santhanam''s translation of Parashara reads: "If the 9th lord is in an angle identical with his Moola-Trikona sign or own sign or exaltation sign while the ascendant lord is endowed with strength, Lakshmi yoga occurs."',
   'Taken literally, "an angle" is a kendra: the 1st, 4th, 7th or 10th. On that reading a 9th lord exalted in the 5th does not form the yoga, however strong the chart looks.',
   'The common reading allows a kendra or a trikona, so the 1st, 4th, 5th, 7th, 9th and 10th. Charts are routinely called Lakshmi yoga with the 9th lord exalted in the 5th, and that is the form most readers will have met.',
   'The wider reading makes the yoga several times commoner, which is reason to know which one is being used rather than reason to prefer either.',
   'This page reports the yoga on either, and says in each finding whether it rests on an angle, which is the text''s own wording, or on a trine, which is the wider reading.'
 ],
 'The strength of the lagna lord is not in dispute; only the house of the 9th lord is.', 941),

('yoga', 'Lakshmi Yoga', 'strength',
 'What "endowed with strength" is taken to mean',
 array[
   'Parashara asks that the lagna lord be strong without saying by what measure, and a yoga whose second condition is a matter of opinion is not really testable.',
   'Here it means Shadbala: the lagna lord must reach the minimum Parashara sets for it in the Shadbala chapter, which differs by graha - 5 rupas for the Sun, Mars and Saturn, 5.5 for Venus, 6 for the Moon, 6.5 for Jupiter and 7 for Mercury.',
   'That is the same reading the Shadbala tab prints, from the same computation, so the yoga and the strength table can never contradict each other.',
   'It also means the yoga can fail on a chart that looks favourable. A dignified 9th lord with a lagna lord short of its minimum is not Lakshmi yoga, and saying so is the point of having a measure at all.'
 ],
 null, 942)

on conflict (topic, subject, condition) do update set
  heading = excluded.heading,
  points = excluded.points,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_at = now();

-- The five Mahapurusha yogas. One rule with five names, so they are one subject
-- in five conditions plus a general passage, the way parivartana is handled.

insert into astro_readings (topic, subject, condition, heading, points, note, sort_order) values
('yoga', 'Pancha Mahapurusha Yoga', 'general',
 'The five Mahapurusha yogas',
 array[
   'Parashara states all five in a single sentence, chapter 75: "When Mars, Mercury, Jupiter, Venus and Saturn being in their own sign or in their sign of exaltation, be in Kendra to the Ascendant, they give rise to Ruchaka, Bhadra, Hamsa, Malavya and Sasa yogas respectively."',
   'So there is one rule, not five. A graha of the five standing in its own sign or its exaltation, in the 1st, 4th, 7th or 10th from the lagna. The name follows from which graha it was.',
   'The luminaries are not included. The text lists the five taras and stops; a Sun exalted in a kendra forms nothing here, however strong it looks.',
   'Moolatrikona is not mentioned, and costs nothing by its absence: all five of these grahas have their moolatrikona inside a sign they already own. Only the Moon''s lies outside its own sign, and the Moon is not one of the five.',
   'The text says kendra to the Ascendant. Many modern readings allow a kendra from the Moon as well, which makes the yoga far commoner; that is not what is written, and is not counted here.',
   'A mahapurusha is a "great person", and the yoga is read as a cast of character rather than a piece of luck - it says what kind of person, not what happens to them.'
 ],
 'Each of the five follows below, by the graha that causes it.', 950),

('yoga', 'Pancha Mahapurusha Yoga', 'ruchaka',
 'Ruchaka - Mars in its own sign or exaltation, in a kendra',
 array[
   'Mars in Aries or Scorpio, or exalted in Capricorn, standing in the 1st, 4th, 7th or 10th.',
   'Read as the soldier''s make: physical courage, command, a taste for difficulty, and a willingness to be disliked for it.',
   'Mars gives the yoga its edge. The same placement that makes for resolve makes for temper, and the classical descriptions do not pretend otherwise.'
 ],
 null, 951),

('yoga', 'Pancha Mahapurusha Yoga', 'bhadra',
 'Bhadra - Mercury in its own sign or exaltation, in a kendra',
 array[
   'Mercury in Gemini or Virgo, standing in the 1st, 4th, 7th or 10th. Virgo is both its own sign and its exaltation, so Mercury reaches this yoga more readily than the others.',
   'Read as the scholar''s make: quickness, speech, analysis, and a memory that holds detail.',
   'Bhadra means auspicious or fair, and the descriptions run to learning and to being listened to rather than to wealth.'
 ],
 null, 952),

('yoga', 'Pancha Mahapurusha Yoga', 'hamsa',
 'Hamsa - Jupiter in its own sign or exaltation, in a kendra',
 array[
   'Jupiter in Sagittarius or Pisces, or exalted in Cancer, standing in the 1st, 4th, 7th or 10th.',
   'Read as the teacher''s make: judgement, generosity, a reputation for fairness, and the standing that follows from it.',
   'The hamsa is the swan of the tradition, which is said to separate milk from water - the discrimination the yoga is named for.'
 ],
 null, 953),

('yoga', 'Pancha Mahapurusha Yoga', 'malavya',
 'Malavya - Venus in its own sign or exaltation, in a kendra',
 array[
   'Venus in Taurus or Libra, or exalted in Pisces, standing in the 1st, 4th, 7th or 10th.',
   'Read as the refined make: proportion, taste, comfort, and an eye for what is well made. The classical descriptions dwell on the pleasant life rather than the powerful one.',
   'Venus is the karaka of marriage and of the arts, so the yoga is read across both: the company kept and the things made.',
   'It is the commonest of the five in practice, Venus never straying far from the Sun and so passing through the kendras from the lagna often.'
 ],
 null, 954),

('yoga', 'Pancha Mahapurusha Yoga', 'sasa',
 'Sasa - Saturn in its own sign or exaltation, in a kendra',
 array[
   'Saturn in Capricorn or Aquarius, or exalted in Libra, standing in the 1st, 4th, 7th or 10th.',
   'Read as the ruler''s make: endurance, authority over others, and the patience to outlast opposition rather than overcome it.',
   'Saturn gives the yoga its cost as well. The descriptions include a hardness towards others, and the position is not read as a comfortable one to have been raised by.'
 ],
 null, 955)

on conflict (topic, subject, condition) do update set
  heading = excluded.heading,
  points = excluded.points,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Raja yoga proper: an angle lord related to a trine lord. One name and no
-- variants, so one passage on the rule and one on how to weigh it.

insert into astro_readings (topic, subject, condition, heading, points, note, sort_order) values
('yoga', 'Raja Yoga', 'general',
 'Raja yoga - an angle lord related to a trine lord',
 array[
   'Chapter 41, verse 28: "The angles are known as Vishnu sthaanas while the trines are called Lakshmi sthaanas. If the lord of an angle establishes relationship with a trinal lord, a Raja-yoga will obtain."',
   'The angles are the 1st, 4th, 7th and 10th. The trines here are the 5th and the 9th: the 1st is counted among the angles and not among the trines, so the lagna lord pairs with the 5th or 9th lord rather than with itself.',
   'Santhanam lists three relationships that qualify: an exchange between the two lords, mutual aspects between them, or their conjunction.',
   'Mutual is the word that matters in the second of those. The special aspects run one way - Jupiter''s 5th and 9th, Mars''s 4th and 8th, Saturn''s 3rd and 10th - so one graha reaching another is not the two reaching each other, and only the second is this yoga.',
   'The reasoning behind the names is given in the text: Vishnu''s houses and Lakshmi''s, and a relationship between their lords read as the blessing of both together.'
 ],
 'How much such a yoga is worth is a separate question; see below.', 900),

('yoga', 'Raja Yoga', 'weighing',
 'What an angle-trine raja yoga is worth',
 array[
   'It is common. A typical lagna has four grahas ruling angles and two ruling trines, and three ways of relating count, so some pairing qualifies in roughly three charts out of four. A chart having a raja yoga is therefore not by itself remarkable.',
   'That is why it is read alongside the strength of the grahas forming it rather than on its own. The yoga says what is promised; vimsopaka bala and Shadbala say how much of it those grahas can actually carry.',
   'Where one graha rules both an angle and a trine by itself it is a yogakaraka, and that is the stronger case: no relationship is needed, the two lordships already sitting in one graha. Such a graha is named in the finding wherever it takes part in a pairing.',
   'Placement still qualifies everything. Lords of an angle and a trine related inside a dusthana, or afflicted, promise more than they give, the strength never having been what stood in the way.',
   'Parashara reports the yoga and then grades it. The text is explicit that effects come "full, or a half or a quarter according to their strengths", which is the same thought: the combination decides what, the strength decides how much.'
 ],
 null, 901),

('yoga', 'Raja Yoga', 'named-pairs',
 'Which pairings have names, and which do not',
 array[
   'Most do not. An angle lord related to a trine lord is a raja yoga and nothing more particular, so a chart showing the lagna lord conjunct the 9th lord has a raja yoga and no special name for it.',
   'The one pairing the tradition singles out is the 9th lord with the 10th: dharma joined to karma, read as the strongest of them, and called Dharma Karmadhipati yoga. The 9th is fortune and purpose, the 10th is work and standing, and the combination ties what a person is for to what they actually do.',
   'The name is not in Santhanam''s Parashara. He discusses the combination at length - "an exchange between Saturn and Jupiter in the 9th and 10th, or their placement in conjunction in the 9th/10th ... will prove a very favourable point" - without ever using the term, which comes from Uttara Kalamrita and general usage.',
   'It is common enough to be worth keeping in proportion: across a sample of charts roughly a quarter of the raja yogas found are this pairing. Being named does not make it rare.',
   'Where one graha owns both the 9th and the 10th there is no pairing at all, only a yogakaraka. From a Taurus lagna Saturn owns both, so the two lordships sit in one graha and no relationship is needed.'
 ],
 'One name is commonly misapplied; see below.', 902),

('yoga', 'Raja Yoga', 'misnamed',
 'A name worth not borrowing',
 array[
   'The 5th and 9th lords in combination are sometimes called Maha Bhagya yoga in modern writing. That is a borrowing, and the name already belongs to something else entirely.',
   'Maha Bhagya yoga is about the time of birth and the parity of signs, not about lords at all: a male born in the daytime with the Sun, the Moon and the lagna in odd signs, a female born at night with the three in even signs.',
   'So a chart can have the 5th and 9th lords related, which is a perfectly good raja yoga, and have no Maha Bhagya yoga whatever. Calling the first by the second''s name loses both.',
   'The same caution applies to Gaja Kesari, which is routinely used for the weaker Kesari yoga, and to raja yoga itself, which is sometimes narrowed to mean Dharma Karmadhipati alone.',
   'A yoga is worth reading by its conditions rather than by the grandeur of the name attached to it. This page reports the name where the conditions are met and no further.'
 ],
 null, 903)

on conflict (topic, subject, condition) do update set
  heading = excluded.heading,
  points = excluded.points,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Gaja Kesari and Kesari. One subject in two conditions, because the second is
-- what the first is usually mistaken for rather than a separate yoga.

insert into astro_readings (topic, subject, condition, heading, points, note, sort_order) values
('yoga', 'Gaja Kesari Yoga', 'general',
 'Gaja Kesari - Jupiter angular, helped, and unspoilt',
 array[
   'Verses 3-4: "Should Jupiter be in an angle from the ascendant or from the Moon, and be conjunct or aspected by (another) benefic, avoiding at the same time debilitation, combustion and inimical sign, Gaja Kesari yoga is caused."',
   'Five conditions, not one. Jupiter in a kendra, from either the lagna or the Moon; a benefic on it by conjunction or aspect; and none of the three faults - not debilitated, not combust, not in an enemy''s sign.',
   'Note that the angle may be from the ascendant. The reading in common use counts only from the Moon, which is narrower in one respect and far looser in every other.',
   'Combustion is the condition most often skipped, and it is the one most likely to catch Jupiter out: within 11 degrees of the Sun, direct or retrograde, it is burnt and the yoga does not form.',
   'The promised effects are large - "splendorous, wealthy, intelligent endowed with many laudable virtues and will please the king" - which is the reason for the conditions rather than in spite of them.'
 ],
 'What is usually called Gaja Kesari is a different and weaker yoga; see below.', 960),

('yoga', 'Gaja Kesari Yoga', 'kesari',
 'Kesari - the yoga this is usually confused with',
 array[
   'Jupiter and the Moon in mutual angles, and nothing further asked. This is what most sources mean when they say Gaja Kesari, and it is not what Parashara means.',
   'Santhanam is direct about it: "That Jupiter-Moon should be in mutual angles is a normally accepted yoga under this name. In my opinion this kind of angularity cannot yield supreme effects... In point of fact, the Moon-Jupiter mutual angular placement is called as simply Kesari Yoga, vide Phala Deepika, Ch. 6, shloka 14."',
   'Phaladeepika''s effects for it are real but ordinary beside Parashara''s: "The native will destroy the band of his enemies. He will be a lofty speaker in an assembly and will serve a king. He will be long lived and famous. He will be intelligent."',
   'The difference is not small in practice. Across a sample of charts the mutual angle alone occurs about two and a half times as often as the full conditions, so treating them as one yoga inflates how often the stronger one is claimed.',
   'Mutual angularity needs no separate checking. The kendras are symmetric: if Jupiter is in the 4th from the Moon, the Moon is in the 10th from Jupiter, and both are angles.',
   'This page reports both, named apart, and says of the lesser one which conditions it failed.'
 ],
 null, 961),

('yoga', 'Kartari Yoga', 'general',
 'Kartari - the lagna between the blades',
 array[
   'Kartari means scissors. When planets sit in the 2nd and the 12th at once, the first house is caught between them, and what the blades do to it depends on whose they are.',
   'Benefics either side is shubha kartari, and the classical promise is protection: the flanking benefics are said to snip problems away before they reach the native. Malefics either side is papa kartari, and the same scissors cut the blessings off instead, the first house being the one whose matters lose their cover.',
   'It is a yoga of the first house and not of a graha. The same hemming can be read around any graha, and this site marks that separately as [H] in the Vimsopaka Bala grid, but the yoga the texts name is the one around the lagna.',
   'De Fouw and Svoboda add a qualifier at page 297 of Light on Life: the benefics unafflicted by malefics, the malefics unaspected by benefics. This site reports that rather than enforcing it, because their own worked example fails it - Indira Gandhi''s Cancer lagna is hemmed by Mars and Ketu, and Venus in Sagittarius aspects the Gemini that holds Ketu, and they read the chart as papa kartari regardless.',
   'The nodes count as malefics for this. They keep no friendships and take no part in the benefic reckoning used elsewhere here, but Ketu is half of that example.',
   'Who counts as a benefic is Parashara''s reckoning. Jupiter and Venus always; Mars, Saturn and the nodes never; the Sun never, though de Fouw and Svoboda class it apart as cruel rather than malefic. The Moon is benefic while full, which Raman fixes as the eighth day of the bright half to the eighth of the dark half. Mercury is benefic unless it sits with a malefic, which is the one clause the verse itself gives.',
   'There is no neutral among them, so a flanking pair is benefic, malefic, or mixed, and mixed is no kartari at all. A thin Moon is a malefic blade and a full one a benefic blade, with nothing in between.',
   'One of each kind flanking is not a kartari of either sort. A benefic on one side and a malefic on the other is not a pair of scissors, and no authority reads it as one.',
   'Papa kartari is the commoner of the two, and not by a little. Five grahas are malefic before the nodes are counted and only four can be benefic, two of those conditionally: on a run of 480 charts papa came out at 10 per cent and shubha at 2.'
 ],
 'Marked [H] on a graha rather than the lagna in the Vimsopaka Bala grid.', 962)

on conflict (topic, subject, condition) do update set
  heading = excluded.heading,
  points = excluded.points,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Nine more from Raman's Three Hundred Important Combinations. The Moon's own
-- four are one question with four answers, so they share a passage.

insert into astro_readings (topic, subject, condition, heading, points, note, sort_order) values
('yoga', 'Sunapha Yoga', 'general',
 'Sunapha - grahas in the sign after the Moon',
 array[
   'Raman''s combination 2. Grahas in the 2nd from the Moon, with the 12th from her empty, is Sunapha yoga. It is read for self-earned wealth and standing - what a person builds rather than what arrives.',
   'It is one of four answers to a single question - what stands on either side of the Moon - and a chart can give only one of them. Grahas in the sign after the Moon is Sunapha, in the sign before it is Anapha, both is Durudhura, neither is Kemadruma. The four are set out here because this is where they divide.',
   'Anapha is read for health, reputation and a comfortable ease; Durudhura for both at once, the Moon attended on both sides being the most fortunate of the four. Kemadruma is the one that is not fortunate: the Moon with nothing beside her is read as a person unsupported, and the older texts are severe about it.',
   'Grahas here means the five starry ones. The Sun is excluded by the definition - that is Raman''s own exclusion - and the nodes go with it, being shadows rather than bodies. So a Moon flanked by the Sun and Rahu is still alone by this rule.',
   'That exclusion is why Kemadruma is common: it falls in something like two charts in five. It is also why the cancellations exist. Some authors hold there is no Kemadruma if a graha stands with the Moon, or in an angle from the lagna or the Moon. Raman gives those and declines them - "these observations are not generally acceptable" - so this site reports the cancellation where it applies and leaves the yoga standing.'
 ],
 'One of the four is present in every chart, so its presence says less than which one it is.', 963),

('yoga', 'Chandra Mangala Yoga', 'general',
 'Mars with the Moon',
 array[
   'Combination 6, and the whole of the definition: "If Mars conjoins the Moon this yoga is formed."',
   'The older writers read it darkly - earnings through unscrupulous means, harshness to the mother. Raman sets that aside with unusual directness: "With due respect to the ancient masters in the science I have to observe that Chandra Mangala Yoga acts as a powerful factor in stabilising one''s financial worth."',
   'So it is read here as a yoga of earning rather than of vice, which is Raman''s reading and not the older one. The two are not reconcilable and the choice is worth knowing.',
   'Mars and the Moon move quickly, so this is among the commoner yogas: roughly one chart in twelve.'
 ],
 null, 964),

('yoga', 'Adhi Yoga', 'general',
 'Benefics in the sixth, seventh and eighth from the Moon',
 array[
   'Combination 7. Benefics must stand in the 6th, the 7th and the 8th from the Moon - all three houses, and a benefic in each.',
   'It is the rarest yoga this site detects, present in about four charts in a thousand. Three consecutive houses tenanted at all is uncommon; three tenanted only by benefics is much more so.',
   'The houses are the reason it is read well. The 6th, 7th and 8th from the Moon are the houses of enemies, of partnership and of longevity, and benefics filling all three is read as opposition that cannot reach the native.',
   'A malefic in any of the three leaves the yoga unformed. There is no partial Adhi yoga here: the rule asks for benefics and a chart either has them or does not.'
 ],
 null, 965),

('yoga', 'Sakata Yoga', 'general',
 'The Moon in the sixth, eighth or twelfth from Jupiter',
 array[
   'Combination 12, and the one affliction among these. The counting runs from Jupiter to the Moon and not the other way, which is the easy thing to get backwards: Jupiter in Aries with the Moon in Virgo is the yoga, and the Moon in Aries with Jupiter in Virgo is not.',
   'Raman reads it as fortune that comes and goes rather than fortune withheld - "the native loses fortune and may regain it" - which is a different thing from poverty and worth keeping distinct.',
   'Three houses of twelve, so it falls in about a quarter of all charts. That frequency is the argument for reading it as a rhythm rather than a verdict.'
 ],
 null, 966),

('yoga', 'Amala Yoga', 'general',
 'A benefic in the tenth',
 array[
   'Combination 13: "The 10th from the Moon or Lagna should be occupied by a benefic planet." Either reference point will do, so a chart has two chances at it.',
   'Amala means spotless, and the reading is of reputation rather than wealth: lasting fame, and a character that does not attract reproach.',
   'The 10th is the house of action and of how a person is seen acting. A benefic holding it from either the lagna or the Moon is read as the visible part of a life being clean.',
   'Two reference points and three possible benefics make this common, close to half of all charts, so it is read as a favourable condition rather than a distinction.'
 ],
 null, 967),

('yoga', 'Budha Aditya Yoga', 'general',
 'Mercury with the Sun, and what combustion takes from it',
 array[
   'Combination 24: "If Mercury combines with the Sun, the combination goes under the name of Budha-Aditya Yoga." It is read for intelligence, skill and good standing.',
   'The whole difficulty with this yoga is combustion, and the useful way to hold it comes from K. N. Rao: combustion is a discount on the yoga, not a gate in front of it. Whether the yoga formed and how much it can deliver are two questions, and burning Mercury answers the second. Mercury is never more than 28 degrees from the Sun, so a yoga defined by their conjunction is always going to be a yoga about a graha under the Sun''s heat. The reading has to say how much heat costs, not pretend the combination is only present when there is none.',
   'Rao applies this literally, with no distance test at all. In Advance Techniques of Astrology Prediction he reads a chart - October 7 1964, 21:30 hrs IST, Delhi - as "Mercury in fifth with the Sun forming Budhaditya yoga and in exaltation aspected by Jupiter", and counts it toward the promise of education. His own printed longitudes are Sun 21 degrees 03 minutes and Mercury 14 degrees 57 minutes. Six degrees apart: combust under every orb any of these authors gives, and he names the yoga anyway.',
   'That is not an oversight. The same book treats combust planets as adverse, citing Sarvarth Chintamani - the planets that deliver are those "neither combust nor placed in 6th, 8th or 12th house". He knows exactly what combustion is and still forms the yoga, because for him the two questions are separate.',
   'B. V. Raman makes it a gate instead, and states the rule most treatments leave out: "It should not be taken for granted that irrespective of the distance between the Sun and Mercury, Budha-Aditya Yoga would be present. On the contrary, Mercury should not be within 10 degrees of the Sun to give rise to Budha-Aditya Yoga."',
   'He gives the floor and no reason for it, and the obvious reason does not survive checking. If the floor were combustion it would sit at the orb of combustion, and Raman''s own Hindu Predictive Astrology, section 54, puts Mercury''s orb at 14 degrees direct and 12 retrograde. The floor is 10. Two figures, two books, never reconciled - which leaves a band, 10 to 14 degrees, where Mercury is burnt by his general rule and gives the yoga by his particular one. Measured over 9,600 charts that band is 6.3 per cent of them, against 41 per cent combust and 28 per cent with the yoga.',
   'In that band this site reports the yoga and says it is discounted, which is the only reading that makes sense of both of Raman''s statements at once. Suppressing one of them to make the chart look tidy would mean overruling him with himself, and nothing in either book says which should give way.',
   'The floor itself is a setting on the Chart tab, and Raman''s ten degrees is the default. He states a rule where Rao only declines to use one, and the arithmetic favours him: with no floor the yoga is claimed for every chart that has the two in one sign, which is 51.7 per cent of charts against 27.5. A finding half the world has tells you little about any of them. Rao''s discount is kept on either setting, because it is a statement about what combustion does rather than about where the boundary sits.'
 ],
 'Combustion is measured on the rashi longitudes even when a division is read. Rao''s illustration reproduces here to the arcminute, which is how it was identified: his Sun 21 03, Mercury 14 57, Moon 14 33, Jupiter (R) 1 54 and lagna 24 33 are this engine''s figures for that moment.', 968)

on conflict (topic, subject, condition) do update set
  heading = excluded.heading,
  points = excluded.points,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_at = now();

-- Seven pairs the detectors produce that had no passage of their own, which was
-- a third of all findings by count. A finding carries the subject and condition
-- astro_readings is keyed by so it can ask the library about itself; where the
-- library had nothing to answer with, the graha card could say a yoga was
-- present and not what it was.

insert into astro_readings (topic, subject, condition, heading, points, note, sort_order) values
('yoga', 'Raja Yoga', 'angle-trine',
 'An angle lord and a trine lord, joined',
 array[
   'The angles are the 1st, 4th, 7th and 10th and the trines the 1st, 5th and 9th. When the lord of one is joined to the lord of the other - together, aspecting each other, or exchanging signs - the combination is a raja yoga: the houses of action and the houses of merit working through the same pair of grahas.',
   'Parashara discusses the combination at length without giving it this name. Raja yoga is what later usage calls it, and it reaches the modern books through Uttara Kalamrita rather than through the Hora Shastra.',
   'Being related is what the rule asks for, not being strong. Two grahas in one sign are joined; so are two that aspect each other across the chart; so are two that have exchanged signs. How much they can deliver is a separate question, and the Shadbala tab answers it.',
   'The name is often stretched to cover any pleasant-looking combination. It is worth holding to the definition: an angle lord, a trine lord, and a relation between them.',
   'Even held to that, it is the commonest finding in astrology. Measured over 9,600 charts it is present in 69 per cent of them - there are several angle lords and several trine lords, and three ways for any two of them to be related. That is why this site calls it an angle-trine raja yoga rather than a raja yoga: the bare name reads as a verdict on the life, and a thing two people in three have is not a verdict on anything. It says a particular pair of lords are related, and the dasha of those grahas is where that matters.'
 ],
 'What such a yoga delivers is read in the dasha of the grahas forming it.', 969),

('yoga', 'Raja Yoga', 'dharma-karmadhipati',
 'Dharma joined to karma, the one pairing with a name',
 array[
   'The 9th is dharma and the 10th is karma - what a person is owed and what a person does. Their lords joined is the one angle-and-trine pairing the tradition singles out and names, and it is read as the strongest of them.',
   'It satisfies the general rule as well, the 10th being an angle and the 9th a trine. This is a special case with a name of its own, not a separate rule.',
   'Every other combination of an angle lord with a trine lord is a raja yoga and nothing more particular, which is worth saying because the name travels further than the definition does.'
 ],
 null, 970),

('yoga', 'Anapha Yoga', 'general',
 'Anapha - grahas in the sign before the Moon',
 array[
   'Raman''s combination 3. Grahas in the 12th from the Moon, with the 2nd from her empty, is Anapha yoga.',
   'It is one of four answers to a single question - what stands on either side of the Moon - so a chart gives Anapha or Sunapha or Durudhura or Kemadruma, and never two of them.',
   'Grahas here means the five starry ones. The Sun is excluded by the definition and the nodes go with it, being shadows rather than bodies; the yoga is about the Moon having company.'
 ],
 'The four are set out together under Sunapha.', 971),

('yoga', 'Durudhura Yoga', 'general',
 'Durudhura - grahas on both sides of the Moon',
 array[
   'Raman''s combination 4. Grahas in the 2nd from the Moon and in the 12th at once is Durudhura yoga, the Moon attended on both sides.',
   'It is the fullest of the four answers to the Moon''s company, and the only one that cannot arrive by half measures: two signs have to be occupied rather than one.',
   'As with the others, the five starry grahas count and the Sun and the nodes do not.'
 ],
 'The four are set out together under Sunapha.', 972),

('yoga', 'Kemadruma Yoga', 'general',
 'Kemadruma - the Moon with nobody beside her',
 array[
   'Raman''s combination 5, and the answer given when the other three are not: no graha in the 2nd from the Moon and none in the 12th. The Moon stands alone.',
   'It is the one of the four read as a misfortune rather than a blessing, and the reason is the same fact seen from the other side. The Moon is the mind, and a mind with no company is the image the yoga trades on.',
   'Raman records the cancellations other authors give - a graha in a kendra from the lagna or from the Moon, or the Moon conjunct a graha - and declines them: "these observations are not generally acceptable". This site reports such a case where it arises rather than applying it, so a reader who holds to the cancellation can see it was available.'
 ],
 'The four are set out together under Sunapha.', 973),

('yoga', 'Kartari Yoga', 'shubha',
 'Shubha kartari - benefics for blades',
 array[
   'Benefics in both the 2nd and the 12th from the lagna, so the first house is held between two of them. The scissors close on something they mean well by.',
   'It is read as shelter: what the first house stands for - the body, the life, the person - is hemmed by grahas that protect it, and is harder to reach than it would otherwise be.',
   'It is the rarer of the two, there being fewer benefics to go round than malefics.'
 ],
 'The [S] mark beside a graha reports the same shape around that graha rather than around the lagna.', 974),

('yoga', 'Kartari Yoga', 'papa',
 'Papa kartari - malefics for blades',
 array[
   'Malefics in both the 2nd and the 12th from the lagna, the nodes counted among them. The first house is caught between two grahas that do not mean it well.',
   'It is read as constraint: the affairs of the first house are pressed from both sides, and what the chart otherwise promises there is harder to come by.',
   'Commoner than the benefic form, there being more malefics to go round - a thin Moon and a badly kept Mercury each count as one, and the nodes always do.'
 ],
 'The [P] mark beside a graha reports the same shape around that graha rather than around the lagna.', 975)

on conflict (topic, subject, condition) do update set
  heading = excluded.heading,
  points = excluded.points,
  note = excluded.note,
  sort_order = excluded.sort_order,
  updated_at = now();
