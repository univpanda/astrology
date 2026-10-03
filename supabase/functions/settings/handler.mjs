export function createSettingsHandler({url,key,fetch:request=globalThis.fetch}) {
  const table=url+'/rest/v1/astro_settings_profiles';
  const cors={'Access-Control-Allow-Origin':'*',
    'Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-region',
    'Access-Control-Allow-Methods':'POST, OPTIONS'};
  const json=(body,status=200)=>new Response(JSON.stringify(body),
    {status,headers:{...cors,'Content-Type':'application/json'}});
  const headers={apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'};
  const read=async query=>{
    const res=await request(table+query,{headers});
    if(!res.ok) throw new Error('Database unavailable');
    return res.json();
  };
  return async req=>{
    if(req.method==='OPTIONS') return new Response('ok',{headers:cors});
    if(req.method!=='POST') return json({error:'POST required'},405);
    let body;
    try {
      const text=await req.text();
      if(text.length>24000) return json({error:'Settings request too large'},413);
      body=JSON.parse(text);
    } catch(_) {return json({error:'Invalid JSON'},400);}
    if(!body || typeof body!=='object' || typeof body.ownerToken!=='string' ||
      !/^[A-Za-z0-9_-]{16,128}$/.test(body.ownerToken)) return json({error:'A valid owner token is required'},400);
    try {
      if(body.action==='load') {
        const [profiles,custom]=await Promise.all([
          read('?owner_token=eq.&select=profile_key,label,choices,provenance,explanation'),
          read('?profile_key=eq.custom&owner_token=eq.'+encodeURIComponent(body.ownerToken)+
            '&select=label,choices,selected_preset&limit=1')
        ]);
        return json({profiles,custom:custom[0]||null});
      }
      if(body.action!=='save') return json({error:'Action must be load or save'},400);
      const values=body.choices;
      if(!values || typeof values!=='object' || Array.isArray(values)) return json({error:'Settings values required'},400);
      if(!['star','raman','rao','parashara','page','custom'].includes(body.selectedPreset)) return json({error:'Unknown preset'},400);
      const sources=await read('?profile_key=eq.page&owner_token=eq.&select=option_catalogue&limit=1');
      const catalogue=sources[0]?.option_catalogue;
      if(!catalogue?.length) throw new Error('Catalogue unavailable');
      if(Object.keys(values).length!==catalogue.length || catalogue.some(s=>
        !Object.hasOwn(values,s.id) || !s.options.some(o=>o.value===values[s.id]))) {
        return json({error:'Settings contain missing or unsupported choices'},400);
      }
      // The caller controls choices only. Profile and owner are fixed here;
      // public reference profiles can only be changed by the maintenance script.
      const row={profile_key:'custom',owner_token:body.ownerToken,label:'Custom Choice',
        choices:values,provenance:Object.fromEntries(Object.keys(values).map(k=>[k,'custom'])),
        selected_preset:body.selectedPreset,updated_at:new Date().toISOString()};
      const res=await request(table+'?on_conflict=profile_key,owner_token',{
        method:'POST',headers:{...headers,Prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify(row)});
      if(!res.ok) throw new Error('Save failed');
      return json({saved:true});
    } catch(_) {return json({error:'Settings database unavailable; retry later'},503);}
  };
}
