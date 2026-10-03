import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCatalogue, catalogueHash } from '../scripts/archive-settings.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const html = read('index.html'), app = read('js/app.js');
const c = buildCatalogue();
let passed = 0;
function check(name, test) { test(); passed++; console.log('  ok   ' + name); }

check('all 24 settings and every reading are preserved', () => {
  assert.equal(c.settings.length, 24);
  assert.deepEqual(c.readings.map(r => r.id), ['page', 'raman', 'parashara', 'rao', 'star']);
  c.readings.forEach(r => assert.equal(r.choices.length, c.settings.length));
  assert.equal(c.startupReading, 'custom');
  assert.equal(c.customBaseReading, 'rao');
});
check('dynamic ayanamsas and all four Mercury hora options survive', () => {
  assert.equal(c.settings.find(s => s.id === 'budha-floor').group, 'Test settings');
  assert.equal(c.settings.find(s => s.id === 'hora-mercury').group, 'Chart settings');
  const ayanamsa = c.settings.find(s => s.id === 'ayanamsa');
  assert.equal(ayanamsa.options.length, 6);
  assert.equal(ayanamsa.defaultValue, 'lahiri');
  const pushya = ayanamsa.options.find(o => o.value === 'pushya');
  assert.equal(pushya.label, 'Pushya Paksha');
  assert.equal(pushya.definition.siderealLongitude, 106);
  assert(pushya.definition.sources.includes('https://www.vedicastrologer.org/articles/pp_ayanamsa.pdf'));
  assert.deepEqual(c.settings.find(s => s.id === 'hora-mercury').options.map(o => o.value),
    ['friend', 'solar', 'ordinary', 'both']);
  assert(c.settings.every(s => s.label && s.explanation && s.options.some(o => o.value === s.defaultValue)));
  assert.equal(c.settings.find(s => s.id === 'hora-dignity').label, 'The hora’s reading');
});
check('fallbacks cannot masquerade as documented source choices', () => {
  const choice = (reading, setting) => c.readings.find(r => r.id === reading).choices.find(s => s.settingId === setting);
  assert.deepEqual(choice('star', 'ayanamsa'), { settingId: 'ayanamsa', value: 'lahiri', basis: 'fallback' });
  assert.deepEqual(choice('raman', 'ayanamsa'), { settingId: 'ayanamsa', value: 'raman', basis: 'documented' });
  assert.equal(choice('page', 'ayanamsa').basis, 'page_default');
  assert.equal(choice('star', 'hora-mercury').basis, 'fallback');
  assert.equal(choice('star', 'mercury-nature').basis, 'fallback');
  assert.deepEqual(choice('star', 'luminary-rule'), {settingId:'luminary-rule',value:'sun-ayana',basis:'inferred'});
  assert.equal(choice('rao', 'kendra-method').value, 'averaged');
  assert.equal(choice('rao', 'mean-source').value, 'classical');
});
check('Rao evidence covers every setting and keeps unresolved choices explicit', () => {
  const r = c.readings.find(r => r.id === 'rao');
  assert.deepEqual(r.evidence.flatMap(e => e.settings).sort(), c.settings.map(s => s.id).sort());
  assert.deepEqual(r.choices.filter(s => s.basis === 'fallback').map(s => s.settingId).sort(),
    ['chart-style','node-type','combustion','hora-mercury'].sort());
  for (const e of r.evidence) for (const id of e.settings) {
    assert.equal(r.choices.find(s => s.settingId === id).basis, e.basis);
  }
});
check('all Mercury nature rules are archived without changing the default', () => {
  const s = c.settings.find(s => s.id === 'mercury-nature');
  assert.equal(s.defaultValue, 'qualified');
  assert.deepEqual(s.options.map(o => o.value), ['qualified', 'associated', 'benefic']);
});
check('Blair figures retain their source, uncertainty and exact reported values', () => {
  const o = c.observations.find(o => o.id === 'star-tony-blair-mercury-2026-10-02');
  assert.equal(o.source, 'Star Jyotish');
  assert.equal(o.status, 'user_reported');
  assert.deepEqual(o.referenceValues, { saptavargaja: 72, paksha: 29 });
  assert.deepEqual(o.changesToDocumentedPreset, []);
  assert.equal(o.referenceBirthDetailsVerified, false);
});
check('hash is stable and changes when an option is removed or relabelled', () => {
  assert.equal(catalogueHash(c), catalogueHash(buildCatalogue()));
  const withoutOption = buildCatalogue(html.replace('<option value="both">Full in either hora</option>', ''));
  assert.notEqual(catalogueHash(c), catalogueHash(withoutOption));
  assert(c.settings.find(s => s.id === 'hora-mercury').options.some(o => o.value === 'both'));
  assert.notEqual(catalogueHash(c), catalogueHash(buildCatalogue(html.replace('Full in either hora', 'Full in both horas'))));
});
check('unknown settings and removed preset options fail loudly', () => {
  assert.throws(() => buildCatalogue(html.replace('<select id="node-type"', '<select id="new-node-type"')), /missing from the catalogue/);
  assert.throws(() => buildCatalogue(html.replace('<option value="friend" selected>', '<option value="removed" selected>')), /Invalid preset value/);
  assert.throws(() => buildCatalogue(html, app.replace('var SETTING_GROUPS = [', 'var RENAMED_GROUPS = [')), /Cannot locate/);
});
check('unknown HTML entities fail rather than silently losing option labels', () => {
  assert.throws(() => buildCatalogue(html.replace('Full in either hora', 'Full &unknown; hora')), /Unrecognised HTML entity/);
});
check('deployment stores current profiles before packaging and upload', () => {
  const script = read('scripts/deploy-aws.sh');
  assert(script.includes('set -euo pipefail'));
  assert(script.indexOf('node scripts/store-settings-profiles.mjs') < script.indexOf('STAGE='));
});
check('database writes append rather than update historical snapshots', () => {
  const script = read('scripts/archive-settings.mjs');
  const migration = read('supabase/migrations/20261002000100_astro_settings_archive.sql');
  assert(script.includes('on conflict (content_hash) do nothing'));
  assert(migration.includes('before update or delete or truncate'));
  assert(migration.includes('enable row level security'));
  assert(migration.includes('revoke all on public.astro_settings_archive from anon, authenticated'));
});
console.log(`\n${passed} settings archive tests passed.`);
