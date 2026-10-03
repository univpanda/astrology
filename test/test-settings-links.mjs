import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const app=readFileSync(new URL('../js/app.js',import.meta.url),'utf8');
const startup=app.slice(app.indexOf('  // Start with the template, then load'),app.lastIndexOf('})();'));
const deferred=()=>{let resolve;return {promise:new Promise(r=>{resolve=r;}),resolve:v=>resolve(v)};};
function launch() {
  const reply=deferred(),order=[],listeners={};
  const env={location:{hash:'#d=1961-08-04&ay=lahiri&node=mean'},lastChart:null,
    settingsStartupPending:false,presetUpdateLocks:null,settingsStartupTouched:false,submitAfterSettings:false,
    form:{requestSubmit:()=>order.push('submitted chart')},
    applySettings:()=>order.push('template'),settingsForPreset:()=>({}),readDefaultChoice:()=> 'mine',
    presetRestore:()=>order.push('custom'),presetMarkDrift:()=>order.push('drift'),
    readHash:()=>order.push('chart'),ownerToken:()=> 'test-owner',
    document:{getElementById:()=>({addEventListener:()=>{}}),addEventListener:(type,fn)=>{listeners[type]=fn;},removeEventListener:type=>{delete listeners[type];}},
    window:{fetch:()=>{},addEventListener:()=>{},SettingsStore:{create:()=>({
      load:apply=>reply.promise.then(body=>{if(body)apply(body);}),flush:()=>{}
    })}}
  };
  vm.runInNewContext(startup,env);
  return {reply,order,env,listeners};
}
const tick=async()=>{for(let i=0;i<5;i++)await Promise.resolve();};
const normal=launch();
assert.deepEqual(normal.order,['template']);
normal.reply.resolve({custom:{}});await tick();
assert.deepEqual(normal.order,['template','custom','chart','drift']);
assert.equal(normal.env.settingsStartupPending,false);
assert.deepEqual(normal.listeners,{});
console.log('  ok   linked chart waits for Custom Choice before its first calculation');
const failed=launch();failed.reply.resolve(null);await tick();
assert.deepEqual(failed.order,['template','chart','drift']);
console.log('  ok   unavailable settings still allow the linked chart to open');
const edited=launch();edited.listeners.input();edited.reply.resolve({custom:{}});await tick();
assert(!edited.order.includes('chart'));
const navigated=launch();navigated.env.location.hash='#another-chart';navigated.reply.resolve({custom:{}});await tick();
assert(!navigated.order.includes('chart'));
const opened=launch();opened.env.lastChart={name:'Another chart'};opened.reply.resolve({custom:{}});await tick();
assert(!opened.order.includes('chart'));
console.log('  ok   delayed startup does not reopen the link after editing or navigation');
const queued=launch();
queued.listeners.submit();queued.env.submitAfterSettings=true;
queued.reply.resolve({custom:{}});await tick();
assert.deepEqual(queued.order,['template','custom','submitted chart','drift']);
assert.equal(queued.env.submitAfterSettings,false);
console.log('  ok   charts opened during startup calculate after Custom Choice loads');
console.log('\n4 chart-link startup checks passed.');
