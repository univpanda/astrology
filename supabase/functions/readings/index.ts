/*
 * POST /functions/v1/readings - the lesson library.
 *
 * Passages come from astro_readings, which is public reference content: the
 * table has a read policy for anon, so this function exists to give the page
 * one endpoint and one shape rather than to guard anything.
 *
 * Search is a case-insensitive match across subject, heading and the points
 * themselves, so "exchange" finds parivartana without knowing its name - which
 * is the way someone looks for a thing they have not learned yet.
 */
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;
const TABLE = `${SUPABASE_URL}/rest/v1/astro_readings`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const input = req.method === 'GET'
      ? Object.fromEntries(new URL(req.url).searchParams)
      : await req.json().catch(() => ({}));

    const select = 'select=topic,subject,condition,heading,points,note,source&order=sort_order.asc&limit=200';
    let filter = '';

    if (input.subjects) {
      // Exact subjects, which is how a chart asks for the yogas it found.
      const wanted = String(input.subjects).split(',').map((s: string) => `"${s.trim()}"`).join(',');
      filter = `&subject=in.(${wanted})`;
    } else if (input.topic) {
      filter = `&topic=eq.${encodeURIComponent(String(input.topic))}`;
    }

    const res = await fetch(`${TABLE}?${select}${filter}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    if (!res.ok) return json({ error: await res.text() }, 502);
    let passages = await res.json();

    /*
     * Filtering here rather than in the query. The library is small enough to
     * arrive whole, and matching in Postgres would mean either ILIKE against an
     * array - which does not do what it looks like it does - or a tsvector this
     * does not yet need.
     */
    const q = String(input.q ?? '').trim().toLowerCase();
    if (q) {
      passages = passages.filter((p: any) =>
        [p.subject, p.heading, p.topic, p.condition, p.note, ...(p.points ?? [])]
          .filter(Boolean)
          .some((field: string) => String(field).toLowerCase().includes(q)));
    }

    return json({ count: passages.length, passages });
  } catch (err) {
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
