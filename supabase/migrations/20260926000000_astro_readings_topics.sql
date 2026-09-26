-- Widen the set of lesson topics.
--
-- The original list was a taxonomy of chart components: graha, house, sign,
-- nakshatra, yoga, dasha, varga. Three of the topics the library now needs are
-- not components but cross-cutting ideas, and they had nowhere to go:
--
--   basics    orientation, for a reader who has not met any of the rest
--   dignity   how a graha stands in a sign, which the Vargas tab prints
--   strength  what a strength measure does and does not say
--
-- The constraint stays rather than being dropped. It caught this, which is the
-- whole point of having it: without it these passages would have been inserted
-- under typo topics and shown up as stray chips nobody could explain.

alter table astro_readings
  drop constraint if exists astro_readings_topic_known;

alter table astro_readings
  add constraint astro_readings_topic_known check (
    topic in ('basics', 'sign', 'graha', 'house', 'nakshatra',
              'dignity', 'varga', 'strength', 'yoga', 'dasha'));
