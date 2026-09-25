/*
 * POST /functions/v1/kundalis - list, save and delete saved charts.
 *
 * Ownership is a capability token the browser mints and keeps; this function
 * holds the service role and is the only thing that touches astro_kundali,
 * which has row level security on and no policy at all. So the token is checked
 * in exactly one place, and the table is unreachable through PostgREST even
 * with the public anon key.
 */
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const TABLE = `${SUPABASE_URL}/rest/v1/astro_kundali`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-region',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const headers = (extra: Record<string, string> = {}) => ({
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  ...extra,
});

/** Only the fields the browser is allowed to set, coerced and bounded. */
function clean(entry: Record<string, unknown>, token: string) {
  const text = (v: unknown, max: number) => String(v ?? '').slice(0, max);
  const num = (v: unknown) => {
    const n = Number(v);
    if (!Number.isFinite(n)) throw new Error('a coordinate was not a number');
    return n;
  };
  return {
    owner_token: token,
    name: text(entry.name, 120).trim(),
    place_label: text(entry.placeLabel, 200).trim(),
    latitude: num(entry.latitude),
    longitude: num(entry.longitude),
    zone: text(entry.zone, 64) || 'UTC',
    birth_date: text(entry.date, 10),
    birth_time: text(entry.time, 8),
    time_standard: entry.standard === 'lmt' ? 'lmt' : 'zone',
    ayanamsa: text(entry.ayanamsa, 32) || 'lahiri',
    true_node: entry.trueNode === true,
    updated_at: new Date().toISOString(),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  try {
    const body = await req.json();
    const token = String(body.ownerToken ?? '');
    if (token.length < 16 || token.length > 128) return json({ error: 'a valid owner token is required' }, 400);

    const query = `?owner_token=eq.${encodeURIComponent(token)}` +
      '&select=id,name,place_label,latitude,longitude,zone,birth_date,birth_time,time_standard,ayanamsa,true_node' +
      '&order=updated_at.desc&limit=200';

    if (body.action === 'list') {
      const res = await fetch(TABLE + query, { headers: headers() });
      if (!res.ok) return json({ error: await res.text() }, 502);
      return json({ entries: await res.json() });
    }

    if (body.action === 'save') {
      if (!body.entry) return json({ error: 'entry is required' }, 400);
      const row = clean(body.entry, token);
      if (!row.name || !row.place_label || !row.birth_date || !row.birth_time) {
        return json({ error: 'name, place, date and time are all required' }, 400);
      }
      // The unique index is over lower(name) and lower(place_label), which
      // on_conflict cannot name directly, so merge by hand: look, then patch or
      // insert. Two tabs racing would collide on the index rather than
      // duplicate, which is the failure worth having.
      const found = await fetch(
        `${TABLE}?owner_token=eq.${encodeURIComponent(token)}` +
        `&name=ilike.${encodeURIComponent(row.name)}` +
        `&place_label=ilike.${encodeURIComponent(row.place_label)}` +
        `&birth_date=eq.${row.birth_date}&birth_time=eq.${row.birth_time}&select=id`,
        { headers: headers() });
      const existing = found.ok ? await found.json() : [];

      const res = existing.length
        ? await fetch(`${TABLE}?id=eq.${existing[0].id}`, {
            method: 'PATCH', headers: headers({ Prefer: 'return=representation' }), body: JSON.stringify(row) })
        : await fetch(TABLE, {
            method: 'POST', headers: headers({ Prefer: 'return=representation' }), body: JSON.stringify(row) });
      if (!res.ok) return json({ error: await res.text() }, 502);

      const listed = await fetch(TABLE + query, { headers: headers() });
      return json({ saved: true, updated: existing.length > 0, entries: listed.ok ? await listed.json() : [] });
    }

    if (body.action === 'delete') {
      if (!body.id) return json({ error: 'id is required' }, 400);
      const res = await fetch(
        `${TABLE}?owner_token=eq.${encodeURIComponent(token)}&id=eq.${encodeURIComponent(String(body.id))}`,
        { method: 'DELETE', headers: headers() });
      if (!res.ok) return json({ error: await res.text() }, 502);
      const listed = await fetch(TABLE + query, { headers: headers() });
      return json({ deleted: true, entries: listed.ok ? await listed.json() : [] });
    }

    return json({ error: 'action must be list, save or delete' }, 400);
  } catch (err) {
    return json({ error: String((err as Error)?.message ?? err) }, 500);
  }
});
