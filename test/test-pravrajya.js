const assert = require('node:assert/strict');
const fs = require('node:fs');
global.Astro = require('../js/astro.js');
const A = global.Astro, Y = require('../js/yogas.js');
const names = ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn'];
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('  ok   ' + name); }
function chart(longitudes, asc = 0) {
  return {ascendant:{longitude:asc,sign:A.signOf(asc)},planets:
    names.concat(['Rahu','Ketu']).map((name,i)=>{
      const longitude = longitudes[name] ?? (i===7 ? 20 : 200);
      return {name,longitude,sign:A.signOf(longitude),retrograde:false};
    })};
}
const cluster = () => chart({Sun:250,Moon:100,Mars:1,Mercury:8,Jupiter:15,Venus:23,Saturn:60});
function strengths(overrides={}) {
  return Object.fromEntries(names.map(g=>{
    const ratio = overrides[g] ?? 0.8;
    return [g,{ratio,strong:ratio>=1,war:null}];
  }));
}
const has = (c,b,key) => Y.pravrajya(c,b).some(f=>f.clauses.includes(key));
const b = () => strengths({Jupiter:1.5});

test('four classical grahas with a measured strong leader produce one finding',()=>{
  const result=Y.pravrajya(cluster(),b());
  assert.equal(result.length,1);
  assert.equal(result[0].subject,'Pravrajya Yoga');
  assert.equal(result[0].graha,'Jupiter');
  assert.match(result[0].summary,/Bhikshuka/);
  assert.deepEqual(result[0].clauses,['conjunction']);
  assert.deepEqual(Y.pravrajya(cluster(),{grahas:b()}),result);
});
test('nodes cannot turn a three-graha conjunction into four',()=>{
  const c=cluster();c.planets.find(p=>p.name==='Venus').sign=5;
  assert(!has(c,b(),'conjunction'));
});
test('weak or missing strengths never establish the conjunction rule',()=>{
  assert(!has(cluster(),strengths(),'conjunction'));
  assert(!has(cluster(),null,'conjunction'));
  const missing=b();delete missing.Mars;
  assert(!has(cluster(),missing,'conjunction'));
});
test('the strength threshold includes equality, excludes NaN and Infinity',()=>{
  assert(has(cluster(),strengths({Jupiter:1}),'conjunction'));
  assert(!has(cluster(),strengths({Jupiter:0.999}),'conjunction'));
  assert(!has(cluster(),strengths({Jupiter:NaN}),'conjunction'));
  assert(!has(cluster(),strengths({Jupiter:Infinity}),'conjunction'));
});
test('all seven leading planets retain the classical order mapping',()=>{
  const expected={Sun:'Vanyasana',Moon:'Vriddhasravaka',Mars:'Sakya',Mercury:'Ajivika',Jupiter:'Bhikshuka',Venus:'Chakra',Saturn:'Nirgrandha'};
  assert.deepEqual(Y.PRAVRAJYA_ORDERS,expected);
  for(const leader of names){
    const c=chart(Object.fromEntries(names.map((g,i)=>[g,1+i*4])));
    const f=Y.pravrajya(c,strengths({[leader]:1.5}))[0];
    assert.equal(f.graha,leader);assert(f.summary.includes(expected[leader]));
  }
});
test('equal leading ratios are not broken by planet ordering',()=>{
  const f=Y.pravrajya(cluster(),strengths({Jupiter:1.5,Mars:1.5}))[0];
  assert.equal(f.graha,null);assert.match(f.summary,/ratios tie/);
  assert.match(f.summary,/Sakya/);assert.match(f.summary,/Bhikshuka/);
});
test('combustion qualifies initiation rather than silently discarding the conjunction',()=>{
  const c=cluster();Object.assign(c.planets[0],{longitude:10,sign:0});
  const f=Y.pravrajya(c,b())[0];
  assert.match(f.summary,/combustion.*rather than initiation/);
});
test('defeat without an aspect gives the return-to-worldly-life qualification',()=>{
  const s=b();s.Jupiter.war=[{won:false,against:'Venus'}];
  assert.match(Y.pravrajya(cluster(),s)[0].summary,/return to worldly life/);
});
test('defeat with another aspect gives the aspiration qualification',()=>{
  const c=cluster();Object.assign(c.planets[0],{longitude:185,sign:6});
  const s=b();s.Jupiter.war=[{won:false,against:'Venus'}];
  assert.match(Y.pravrajya(c,s)[0].summary,/desire for initiation rather than initiation/);
  s.Jupiter.war[0].won=true;
  assert.doesNotMatch(Y.pravrajya(c,s)[0].summary,/defeat/);
});
test('Moon-sign lord aspects Saturn and must itself be unaspected',()=>{
  const c=chart({Sun:35,Moon:5,Mars:125,Mercury:65,Jupiter:215,Venus:245,Saturn:335});
  assert(has(c,b(),'moon-lord-to-saturn'));
  Object.assign(c.planets[0],{longitude:305,sign:10});
  assert(!has(c,b(),'moon-lord-to-saturn'));
});
test('Saturn must be strong and the Moon-sign lord measurably weak',()=>{
  const c=chart({Sun:35,Moon:221,Mars:5,Mercury:65,Jupiter:125,Venus:155,Saturn:185});
  assert(has(c,strengths({Saturn:1.2}),'saturn-to-weak-moon-lord'));
  assert(!has(c,strengths({Saturn:0.9}),'saturn-to-weak-moon-lord'));
  assert(!has(c,strengths({Saturn:1.2,Mars:1}),'saturn-to-weak-moon-lord'));
  const s=strengths({Saturn:1.2});delete s.Mars;
  assert(!has(c,s,'saturn-to-weak-moon-lord'));
});
test('Moon requires both divisions and Saturn as its only aspecting graha',()=>{
  const c=chart({Sun:35,Moon:80,Mars:125,Mercury:155,Jupiter:215,Venus:275,Saturn:5});
  assert.equal(A.SIGN_LORDS[A.vargaPosition(80,3).sign],'Saturn');
  assert.equal(A.SIGN_LORDS[A.vargaPosition(80,9).sign],'Mars');
  assert(has(c,null,'moon-divisions'));
  Object.assign(c.planets[5],{longitude:245,sign:8});
  assert(!has(c,null,'moon-divisions'));
  Object.assign(c.planets[5],{longitude:275,sign:9});
  c.planets[1].longitude=79;
  assert(!has(c,null,'moon-divisions'));
});
test('Jupiter in the ninth requires Saturn to aspect all three targets',()=>{
  const c=chart({Sun:35,Moon:5,Mars:95,Mercury:125,Jupiter:245,Venus:155,Saturn:185});
  assert(has(c,null,'jupiter-ninth'));
  assert.match(Y.pravrajya(c,null)[0].summary,/additionally requires Raja yoga/);
  Object.assign(c.planets[1],{longitude:35,sign:1});
  assert(!has(c,null,'jupiter-ninth'));
});
test('Saturn in the ninth is disqualified by another graha aspect',()=>{
  const c=chart({Sun:5,Moon:35,Mars:95,Mercury:125,Jupiter:155,Venus:185,Saturn:245});
  assert(has(c,null,'saturn-ninth'));
  Object.assign(c.planets[0],{longitude:65,sign:2});
  assert(!has(c,null,'saturn-ninth'));
});
test('natal conditions are not invented from vargas or rotated ascendants',()=>{
  assert.equal(Y.pravrajya(A.chartInDivision(cluster(),9),b()).length,0);
  assert.equal(Y.pravrajya({...cluster(),reference:'Moon'},b()).length,0);
  assert.equal(Y.pravrajya({...cluster(),reference:'Ascendant'},b()).length,1);
  const c=cluster();c.planets=c.planets.filter(p=>p.name!=='Saturn');
  assert.equal(Y.pravrajya(c,b()).length,0);
});
test('detection pipeline and catalogue expose the new family once',()=>{
  const results=Y.detect(cluster(),b()).filter(f=>f.subject==='Pravrajya Yoga');
  assert.equal(results.length,1);
  assert.equal(Y.CATALOGUE.flatMap(g=>g.names).filter(n=>n==='Pravrajya yoga').length,1);
  assert(results[0].manifestation.includes('Bhikshuka'));
});
test('library passage supplies matching keys, provenance, limitations and mixed effect',()=>{
  const seed=fs.readFileSync('supabase/seed/astro_readings_pravrajya.sql','utf8');
  assert.match(seed,/\('yoga', 'Pravrajya Yoga', 'general'/);
  assert.match(seed,/Iyer.*1885/s);assert.match(seed,/'mixed', 929/);
  assert.match(seed,/not a formula stated in chapter 15/);
  assert.match(seed,/on conflict \(topic, subject, condition\) do update/);
  assert(fs.readFileSync('scripts/seed-readings.sh','utf8').includes('astro_readings_pravrajya.sql'));
});
console.log('\n'+checks+' Pravrajya checks passed.');
