import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createSettingsHandler } from '../supabase/functions/settings/handler.mjs';
import { buildCatalogue } from '../scripts/archive-settings.mjs';
import { profilesFromCatalogue } from '../scripts/store-settings-profiles.mjs';
const require=createRequire(import.meta.url);
const {create}=require('../js/settings-store.js');
const catalogue=buildCatalogue(), profiles=profilesFromCatalogue(catalogue);
assert.deepEqual(profiles.find(p=>p.profile_key==='custom').choices,
  profiles.find(p=>p.profile_key==='rao').choices);
const choices=profiles.find(p=>p.profile_key==='page').choices;
const rows=profiles.map(p=>({...p,owner_token:''}));
let writes=0;
const handler=createSettingsHandler({url:'https://database.test',key:'test-service-key',fetch:async(url,opts)=>{
  const u=new URL(url);
  if(opts.method==='POST') {
    assert.equal(u.searchParams.get('on_conflict'),'profile_key,owner_token');
    assert.match(opts.headers.Prefer,/merge-duplicates/);
    const row=JSON.parse(opts.body);
    const at=rows.findIndex(r=>r.owner_token===row.owner_token && r.profile_key===row.profile_key);
    if(at<0)rows.push(row);else rows[at]=row;
    writes++;
    return new Response(null,{status:204});
  }
  let found=rows.filter(r=>r.owner_token===u.searchParams.get('owner_token').slice(3));
  if(u.searchParams.has('profile_key'))found=found.filter(r=>r.profile_key===u.searchParams.get('profile_key').slice(3));
  const fields=u.searchParams.get('select').split(',');
  return Response.json(found.map(r=>Object.fromEntries(fields.map(f=>[f,r[f]]))));
}});
const token='private-owner-token-A', other='private-owner-token-B';
const call=(body)=>handler(new Request('https://api.test/settings',{method:'POST',body:JSON.stringify({ownerToken:token,...body})}));
assert.equal((await call({action:'load',ownerToken:'a,b)'})).status,400);
assert.equal((await call({action:'save',choices:{},selectedPreset:'custom'})).status,400);
assert.equal((await call({action:'save',choices:{...choices,'luminary-rule':'invented'},selectedPreset:'custom'})).status,400);
assert.equal(writes,0);
assert.equal((await call({action:'save',choices,selectedPreset:'raman',profile_key:'star',owner_token:''})).status,200);
const changed={...choices,'luminary-rule':'sun-ayana'};
assert.equal((await call({action:'save',choices:changed,selectedPreset:'custom'})).status,200);
assert.equal(rows.filter(r=>r.owner_token===token).length,1);
const loaded=await (await call({action:'load'})).json();
assert.equal(loaded.custom.choices['luminary-rule'],'sun-ayana');
assert.equal(loaded.custom.selected_preset,'custom');
assert(!JSON.stringify(loaded).includes(token));
assert.equal((await (await call({action:'load',ownerToken:other})).json()).custom,null);
assert.deepEqual(rows.find(r=>r.profile_key==='star' && r.owner_token==='').choices,profiles.find(p=>p.profile_key==='star').choices);
console.log('  ok   server validates choices, isolates owners and updates one Custom Choice row');

const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
let requests=[],statuses=[];
const store=create({token,url:'https://api.test/settings',status:s=>statuses.push(s),fetch:(_,opts)=>{
  const d=deferred();requests.push({body:JSON.parse(opts.body),d,opts});return d.promise;
}});
const first=store.save(choices,'custom');await tick();
store.save({...choices,'node-type':'true'},'custom');
store.save(changed,'custom');await tick();
assert.equal(requests.length,1);
requests[0].d.resolve(Response.json({saved:true}));await tick();
assert.equal(requests.length,2);
assert.deepEqual(requests[1].body.choices,changed);
requests[1].d.resolve(Response.json({saved:true}));await first;
assert.equal(statuses.at(-1),'Settings saved to database.');
assert(requests.every(r=>r.opts.keepalive===true));
console.log('  ok   rapid changes serialize writes and the newest choices finish last');

let fails=true,attempts=0;
const failed=create({token,url:'https://api.test/settings',status:s=>statuses.push(s),fetch:async()=>{
  attempts++;return fails?new Response('',{status:503}):Response.json({saved:true});
}});
await failed.save(choices,'custom');
assert.match(statuses.at(-1),/could not be saved/);
assert.equal(attempts,1);
fails=false;await failed.flush();assert.equal(attempts,2);
assert.equal(statuses.at(-1),'Settings saved to database.');
console.log('  ok   failure is reported honestly and the current choice can be retried');

const late=deferred();let restored=false;
const race=create({token,url:'https://api.test/settings',fetch:async(_,opts)=>
  JSON.parse(opts.body).action==='load'?late.promise:Response.json({saved:true})});
const loading=race.load(()=>{restored=true;});
await race.save(changed,'custom');late.resolve(Response.json({custom:{choices}}));await loading;
assert.equal(restored,false);
console.log('  ok   a late database load cannot overwrite a newer user edit');

// A stalled settings service must release startup, and cannot apply stale data later.
const stalled=deferred();let timedOutApplied=false;
const timed=create({token,url:'https://api.test/settings',loadTimeoutMs:5,
  status:s=>statuses.push(s),fetch:()=>stalled.promise});
await timed.load(()=>{timedOutApplied=true;});
assert.equal(timedOutApplied,false);
assert.match(statuses.at(-1),/could not be loaded/);
stalled.resolve(Response.json({custom:{choices}}));await tick();
assert.equal(timedOutApplied,false);
console.log('  ok   stalled loading finishes and late settings cannot replace an active chart');

// End-to-end through the actual handler: a fresh client restores the saved row.
const client=create({token,url:'https://api.test/settings',fetch:(url,opts)=>handler(new Request(url,opts))});
let fromServer;
await client.load(body=>{fromServer=body;});
assert.deepEqual(fromServer.custom.choices,changed);
console.log('  ok   a new client loads current settings directly from the database API');
// A hung write is aborted; the newest queued edit proceeds and late success
// from the old transport cannot clear or requeue it.
const hung=deferred();let signals=[],sent=[];
const bounded=create({token,url:'https://api.test/settings',saveTimeoutMs:10,
  status:s=>statuses.push(s),fetch:(_,opts)=>{
    signals.push(opts.signal);sent.push(JSON.parse(opts.body));
    return sent.length===1 ? hung.promise : Promise.resolve(Response.json({saved:true}));
  }});
const drain=bounded.save(choices,'custom');await tick();
bounded.save(changed,'custom');await drain;
assert.equal(sent.length,2);assert(signals[0].aborted);
assert.deepEqual(sent[1].choices,changed);
hung.resolve(Response.json({saved:true}));await tick();await bounded.flush();
assert.equal(sent.length,2);
assert.equal(statuses.at(-1),'Settings saved to database.');
console.log('  ok   a timed-out write releases the queue without applying a late response');

let retryAttempts=0;
const retryTimed=create({token,url:'https://api.test/settings',saveTimeoutMs:5,
  status:s=>statuses.push(s),fetch:()=>++retryAttempts===1 ? new Promise(()=>{}) : Promise.resolve(Response.json({saved:true}))});
await retryTimed.save(changed,'custom');assert.match(statuses.at(-1),/could not be saved/);
await retryTimed.flush();assert.equal(retryAttempts,2);
assert.equal(statuses.at(-1),'Settings saved to database.');
console.log('  ok   a single timed-out write remains available for retry');
console.log('\n8 settings storage checks passed.');
