import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { buildCatalogue, pgEnvironment, sql } from './archive-settings.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const quote = value => "'" + String(value).replace(/'/g, "''") + "'";
export function profilesFromCatalogue(c) {
  const profiles = c.readings.map(r => ({
    profile_key:r.id, label:r.label,
    choices:Object.fromEntries(r.choices.map(s => [s.settingId,s.value])),
    provenance:Object.fromEntries(r.choices.map(s => [s.settingId,s.basis])),
    explanation:r.explanation, evidence:r.id === 'star' ? c.observations : r.evidence || [],
    option_catalogue:c.settings, selected_preset:r.id
  }));
  const base = profiles.find(p => p.profile_key === c.customBaseReading);
  assert(base, 'Custom Choice requires its starting profile');
  profiles.push({profile_key:'custom',label:'Custom Choice',choices:{...base.choices},
    provenance:{...base.provenance},
    explanation:'Starting template: ' + base.label + '. Personal changes replace the private owner-scoped Custom Choice row.',
    evidence:base.evidence,option_catalogue:c.settings,selected_preset:'custom'});
  return profiles;
}
export function storeProfiles() {
  const profiles = profilesFromCatalogue(buildCatalogue());
  const env = pgEnvironment();
  const migration = readFileSync(resolve(root,'supabase/migrations/20261003000100_astro_settings_profiles.sql'),'utf8');
  let query = 'begin;\n' + migration + '\nset local standard_conforming_strings = on;\n';
  for (const p of profiles) {
    query += `insert into public.astro_settings_profiles
      (profile_key,owner_token,label,choices,provenance,explanation,evidence,option_catalogue,selected_preset)
      values (${quote(p.profile_key)},'',${quote(p.label)},${quote(JSON.stringify(p.choices))}::jsonb,
        ${quote(JSON.stringify(p.provenance))}::jsonb,${quote(p.explanation)},${quote(JSON.stringify(p.evidence))}::jsonb,
        ${quote(JSON.stringify(p.option_catalogue))}::jsonb,${quote(p.selected_preset)})
      on conflict (profile_key,owner_token) do update set
        label=excluded.label,choices=excluded.choices,provenance=excluded.provenance,
        explanation=excluded.explanation,evidence=excluded.evidence,option_catalogue=excluded.option_catalogue,
        selected_preset=excluded.selected_preset,updated_at=now();\n`;
  }
  sql(query + 'commit;',env);
  const rows = JSON.parse(sql(`select json_agg(r order by profile_key) from (select
    profile_key,label,choices,provenance,explanation,evidence,option_catalogue,selected_preset
    from public.astro_settings_profiles where owner_token='') r;`,env));
  assert.deepEqual(rows,profiles.sort((a,b) => a.profile_key.localeCompare(b.profile_key)));
  const protections = JSON.parse(sql(`select json_build_object(
    'rls',(select relrowsecurity from pg_class where oid='public.astro_settings_profiles'::regclass),
    'public_read',has_table_privilege('anon','public.astro_settings_profiles','SELECT') or has_table_privilege('authenticated','public.astro_settings_profiles','SELECT'),
    'public_write',has_table_privilege('anon','public.astro_settings_profiles','INSERT,UPDATE,DELETE') or has_table_privilege('authenticated','public.astro_settings_profiles','INSERT,UPDATE,DELETE'));`,env));
  assert.deepEqual(protections,{rls:true,public_read:false,public_write:false});
  console.log('Stored and read-back verified: ' + profiles.map(p => p.label).join(', '));
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { storeProfiles(); } catch (e) { console.error(e.message); process.exitCode=1; }
}
