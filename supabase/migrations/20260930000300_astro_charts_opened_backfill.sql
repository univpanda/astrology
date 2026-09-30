-- Rows that predate opened_at, given the time they were last written.
--
-- The column was added to order the list by what was last read, and everything
-- saved before it existed sat in a null bucket at the bottom - including a
-- chart saved a minute ago, which is the one the person who saved it is looking
-- for. updated_at is the closest honest answer for those rows: the last time
-- anybody did anything to them. It is also the key they were already ordered by
-- inside that bucket, so nothing changes places, they simply join the ordering.

update astro_charts set opened_at = updated_at where opened_at is null;
