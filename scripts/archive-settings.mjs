/** Archive the actual shipped catalogue, with no second hand-maintained option list.
 * --print: inspect JSON offline; --save: append and verify in linked Supabase.
 * DATABASE_URL is optional: otherwise use the logged-in Supabase CLI's temporary
 * connection. Credentials stay in memory/environment, never arguments or logs.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import assert from 'node:assert/strict';
import Astro from '../js/astro.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = file => readFileSync(resolve(root, file), 'utf8');
const entities = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', ndash: '–', mdash: '—',
  deg: '°', times: '×', prime: '′', Prime: '″', hellip: '…' };
function words(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (_, key) => {
    if (key.startsWith('#')) return String.fromCodePoint(
      key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : Number(key.slice(1)));
    assert(Object.hasOwn(entities, key), 'Unrecognised HTML entity: ' + key);
    return entities[key];
  }).replace(/\s+/g, ' ').trim();
}

export function buildCatalogue(html = read('index.html'), app = read('js/app.js'),
  observations = JSON.parse(read('data/settings-observations.json'))) {
  const start = app.indexOf('  var SETTING_GROUPS = [');
  const end = app.indexOf('  var MY_SETTINGS_KEY =', start);
  assert(start >= 0 && end > start, 'Cannot locate settings definitions');
  const definitions = app.slice(start, end);
  // Only the checked-in data-definition block, not app startup or external code.
  const { groups, presets } = runInNewContext(definitions +
    '\n({groups: SETTING_GROUPS, presets: PRESETS})', {}, { timeout: 1000 });
  const ids = Array.from(groups).flatMap(g => Array.from(g.ids));
  assert.equal(new Set(ids).size, ids.length, 'Duplicate settings');
  const panelIds = ['panel-settings', 'panel-testing'].flatMap(id => {
    const panel = html.match(new RegExp('<section[^>]*id="' + id + '"[^>]*>([\\s\\S]*?)</section>'));
    assert(panel, 'Missing settings panel: ' + id);
    return [...panel[1].matchAll(/<select\s+id="([^"]+)"/g)]
      .map(m => m[1]).filter(id => !id.startsWith('preset-'));
  });
  assert.deepEqual([...ids].sort(), panelIds.sort(), 'A control is missing from the catalogue');
  const settings = ids.map(id => {
    const select = html.match(new RegExp('<select id="' + id + '"[^>]*>([\\s\\S]*?)</select>'));
    const label = html.match(new RegExp('<label for="' + id + '"[^>]*>([\\s\\S]*?)</label>'));
    const why = html.match(new RegExp('<div[^>]*id="why-' + id + '"[^>]*>([\\s\\S]*?)</div>'));
    assert(select && label && why, 'Missing setting markup: ' + id);
    let options = [...select[1].matchAll(/<option value="([^"]*)"([^>]*)>([\s\S]*?)<\/option>/g)]
      .map(m => ({ value: m[1], label: words(m[3]), selected: /\bselected\b/.test(m[2]) }));
    if (id === 'ayanamsa') {
      assert(/if \(key === 'lahiri'\) opt.selected = true/.test(app), 'Review ayanamsa default extraction');
      options = Object.entries(Astro.AYANAMSA).map(([value, item]) =>
        ({ value, label: item.label, selected: value === 'lahiri' }));
    }
    assert(options.length && options.filter(o => o.selected).length <= 1, 'Invalid options: ' + id);
    assert.equal(new Set(options.map(o => o.value)).size, options.length, 'Duplicate option: ' + id);
    return { id, group: groups.find(g => g.ids.includes(id)).title,
      label: words(label[1]), defaultValue: (options.find(o => o.selected) || options[0]).value,
      options: options.map(({ value, label }) => ({ value, label })), explanation: words(why[1]) };
  });
  const readings = Object.entries(presets).map(([id, preset]) => {
    for (const key of Object.keys(preset.of)) assert(ids.includes(key), 'Unknown preset setting: ' + key);
    return { id, label: id === 'page' ? 'Page fallback defaults' : preset.label,
      explanation: preset.says, choices: settings.map(setting => {
        const recorded = id !== 'page' && Object.hasOwn(preset.of, setting.id);
        const value = recorded ? preset.of[setting.id] : setting.defaultValue;
        assert(setting.options.some(o => o.value === value), 'Invalid preset value: ' + id + '/' + setting.id);
        return { settingId: setting.id, value,
          basis: id === 'page' ? 'page_default' : recorded ? 'documented' : 'fallback' };
      }) };
  });
  const startupReading = app.match(/var BASE_CHOICE = '([^']+)'/)[1];
  assert(readings.some(r => r.id === startupReading), 'Unknown startup reading');
  assert(Array.isArray(observations), 'Observations must be an array');
  assert.equal(new Set(observations.map(o => o.id)).size, observations.length, 'Duplicate observation');
  return { schemaVersion: 1, startupReading, settings, readings, observations,
    sourceNotes: definitions, scope: 'Application reference catalogue, not personal browser settings' };
}

export const catalogueHash = catalogue => createHash('sha256').update(JSON.stringify(catalogue)).digest('hex');
const quote = text => "'" + String(text).replace(/'/g, "''") + "'";

function pgEnvironment() {
  if (process.env.DATABASE_URL) {
    const u = new URL(process.env.DATABASE_URL);
    return { role: null, env: { ...process.env, PGHOST: u.hostname, PGPORT: u.port || '5432',
      PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password),
      PGDATABASE: u.pathname.slice(1) || 'postgres', PGSSLMODE: 'require' } };
  }
  const result = spawnSync('supabase', ['db', 'dump', '--linked', '--dry-run'],
    { cwd: root, encoding: 'utf8', timeout: 60000 });
  assert.equal(result.status, 0, 'Supabase connection unavailable; log in or set DATABASE_URL');
  const env = { ...process.env, PGSSLMODE: 'require' };
  for (const match of result.stdout.matchAll(/(?:export\s+)?(PG[A-Z]+)="([^"\n]*)"/g)) env[match[1]] = match[2];
  for (const key of ['PGHOST', 'PGPORT', 'PGUSER', 'PGPASSWORD', 'PGDATABASE']) {
    assert(env[key], 'Missing CLI connection field: ' + key);
  }
  // The CLI's temporary login inherits no table/schema rights until it assumes
  // postgres, exactly as the generated pg_dump command's --role asks it to.
  assert(/--role[= ]+["']?postgres/.test(result.stdout), 'Review CLI database role setup');
  return { env, role: 'postgres' };
}

function sql(query, { env, role }) {
  const result = spawnSync('psql', ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1'],
    { input: (role === 'postgres' ? 'set role postgres;\n' : '') + query,
      env, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) {
    // Show SQL diagnostics, but strip credentials and connection identifiers.
    let detail = result.stderr || 'psql could not complete';
    for (const key of ['DATABASE_URL', 'PGPASSWORD', 'PGHOST', 'PGUSER']) {
      if (env[key]) detail = detail.split(env[key]).join('[redacted]');
    }
    throw new Error('Database command failed; snapshot was not verified:\n' + detail.slice(0, 1800));
  }
  return result.stdout.trim();
}

export function saveCatalogue(catalogue) {
  const hash = catalogueHash(catalogue);
  const git = args => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, 'Cannot identify archive revision');
    return result.stdout.trim();
  };
  const env = pgEnvironment();
  // Apply only this additive schema, not unrelated/pending project migrations.
  sql('begin;\n' + read('supabase/migrations/20261002000100_astro_settings_archive.sql') +
    '\nset local standard_conforming_strings = on;\n' +
    'insert into public.astro_settings_archive(content_hash, git_commit, working_tree_dirty, catalogue) values (' +
    [quote(hash), quote(git(['rev-parse', 'HEAD'])), git(['status', '--porcelain']) ? 'true' : 'false',
      quote(JSON.stringify(catalogue)) + '::jsonb'].join(',') +
    ') on conflict (content_hash) do nothing;\ncommit;', env);
  const stored = JSON.parse(sql('select catalogue from public.astro_settings_archive where content_hash = ' + quote(hash), env));
  assert.deepEqual(stored, JSON.parse(JSON.stringify(catalogue)), 'Read-back differs from source catalogue');
  const security = JSON.parse(sql(`select json_build_object(
    'rls', (select relrowsecurity from pg_class where oid = 'public.astro_settings_archive'::regclass),
    'public_write', has_table_privilege('anon', 'public.astro_settings_archive', 'INSERT,UPDATE,DELETE,TRUNCATE')
      or has_table_privilege('authenticated', 'public.astro_settings_archive', 'INSERT,UPDATE,DELETE,TRUNCATE'),
    'immutable', exists(select 1 from pg_trigger where tgrelid = 'public.astro_settings_archive'::regclass
      and tgname = 'settings_archive_immutable' and tgenabled = 'O'))`, env));
  assert.deepEqual(security, { rls: true, public_write: false, immutable: true });
  // A zero-row UPDATE still fires the statement trigger. The test cannot
  // change a snapshot even if the guard is broken, and always rolls back.
  sql(`begin;
    do $$ begin
      begin
        update public.astro_settings_archive set git_commit = git_commit where false;
        raise exception 'Archive immutability check failed';
      exception when raise_exception then
        if sqlerrm <> 'Settings snapshots are immutable; insert a new revision instead.' then raise; end if;
      end;
    end $$;
    rollback;`, env);
  console.log('Archived and read-back verified: ' + hash);
  console.log(`${catalogue.settings.length} settings, ${catalogue.settings.reduce((n, s) => n + s.options.length, 0)} options, ` +
    `${catalogue.readings.length} readings, ${catalogue.observations.length} reference observations. Public writes disabled.`);
  return hash;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const mode = process.argv[2];
    assert(['--print', '--save'].includes(mode), 'Usage: node scripts/archive-settings.mjs --print|--save');
    const catalogue = buildCatalogue();
    if (mode === '--print') console.log(JSON.stringify(catalogue, null, 2));
    else saveCatalogue(catalogue);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
