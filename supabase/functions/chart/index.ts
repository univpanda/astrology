/*
 * POST /functions/v1/chart - a Vedic chart computed from the stored ephemeris.
 *
 * Graha longitudes come from astro_positions(), a Postgres function that decodes
 * and interpolates the packed samples server-side and returns the eighteen
 * numbers a chart needs. Everything else - ascendant, houses, nakshatras,
 * panchang, Vimshottari - runs the same js/astro.js the browser does, through
 * Astro.assembleChart. One assembly routine, two sources of longitude, so the
 * database path and the local path cannot drift apart.
 *
 * An earlier version pulled the decade's packed rows and interpolated here, which
 * shipped ~167 KB across the wire to extract 18 numbers. Doing it in SQL made the
 * request a few hundred bytes.
 *
 * _astro.mjs is generated from js/astro.js by scripts/deploy-edge.sh: the
 * original has to stay a classic script so index.html still works from file://,
 * and Deno needs ESM.
 */
import Astro from './_astro.mjs';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SUPABASE_ANON_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function bad(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const started = Date.now();

  try {
    const input = req.method === 'GET'
      ? Object.fromEntries(new URL(req.url).searchParams)
      : await req.json();

    const { date, time, latitude, longitude } = input;
    if (!date || !time) return bad('date (YYYY-MM-DD) and time (HH:MM[:SS]) are required');
    if (latitude === undefined || longitude === undefined) return bad('latitude and longitude are required');

    const [y, mo, d] = String(date).split('-').map(Number);
    const [h, mi, sec] = String(time).split(':').map(Number);
    if (!y || !mo || !d || Number.isNaN(h)) return bad('could not parse date or time');
    if (y < 1800 || y > 2100) return bad('the stored ephemeris covers 1800 to 2100');

    const offset = Number(input.tzOffsetMinutes ?? 0);
    const lat = Number(latitude), lon = Number(longitude);
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return bad('latitude or longitude out of range');

    const jdUT = Astro.julianDay(y, mo, d, (h * 3600 + (mi || 0) * 60 + (sec || 0)) / 3600 - offset / 60);
    const trueNode = input.trueNode === true || input.trueNode === 'true';

    const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/astro_positions`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_jd: jdUT, p_jd_later: jdUT + 0.5, p_true_node: trueNode }),
    });
    if (!res.ok) return bad(`ephemeris lookup failed: ${res.status} ${await res.text()}`, 502);
    const rows: Array<{ body: string; longitude: number; longitude_later: number }> = await res.json();
    const fetched = Date.now();

    const positions: Record<string, { now: number; later: number }> = {};
    for (const row of rows) {
      if (row.longitude === null || row.longitude_later === null) {
        return bad(`the stored ephemeris has no sample for ${row.body} at that moment`, 422);
      }
      positions[row.body] = { now: row.longitude, later: row.longitude_later };
    }

    const sample = (body: string, jd: number) => {
      const p = positions[body];
      if (!p) throw new Error(`no ephemeris row for ${body}`);
      // assembleChart asks for exactly these two moments.
      return jd > jdUT ? p.later : p.now;
    };

    const chart = Astro.assembleChart(sample, {
      jdUT, latitude: lat, longitude: lon,
      ayanamsa: input.ayanamsa || 'lahiri',
      trueNode,
      tzOffsetMinutes: offset,
    });

    return new Response(JSON.stringify({
      source: 'astro_ephemeris',
      timing: { ephemerisMs: fetched - started, totalMs: Date.now() - started },
      chart,
    }), { headers: { ...CORS, 'Content-Type': 'application/json' } });
  } catch (err) {
    return bad(String((err as Error)?.message ?? err), 500);
  }
});
