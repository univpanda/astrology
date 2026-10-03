/* Direct database persistence of the current choices. No localStorage, history,
 * or unload handler. Serialize writes so slower responses cannot reorder edits. */
(function (root) {
  'use strict';
  function create(o) {
    var pending=null, running=false, generation=0;
    var status=function(s){if(o.status)o.status(s);};
    var call=function(body,signal){
      body.ownerToken=o.token;
      return Promise.resolve().then(function(){
        return o.fetch(o.url,{method:'POST',headers:{'Content-Type':'application/json'},
          body:JSON.stringify(body),keepalive:true,signal:signal});
      }).then(function(res){if(!res.ok)throw new Error('Settings request failed');return res.json();});
    };
    var flush=function(){
      if(running || !pending)return Promise.resolve();
      running=true;
      var job=pending; pending=null;
      status('Saving settings to database…');
      var controller=typeof AbortController!=='undefined' ? new AbortController() : null;
      var timer;
      // Abort stalled requests and release the queue. A late response cannot
      // clear a newer job or report it as saved.
      var request=new Promise(function(resolve,reject){
        timer=setTimeout(function(){
          if(controller)controller.abort();
          reject(new Error('Settings save timed out'));
        },o.saveTimeoutMs || 8000);
        call({action:'save',choices:job.choices,selectedPreset:job.selectedPreset},
          controller && controller.signal).then(resolve,reject);
      });
      return request.then(function(res){
        if(!res.saved)throw new Error('Save unconfirmed');
        if(!pending)status('Settings saved to database.');
      }).catch(function(){
        if(!pending){pending=job;status('Settings could not be saved. Check your connection and try again.');}
      }).then(function(){
        clearTimeout(timer);
        running=false;
        // A failed current write waits for a new edit or an online event.
        if(pending && pending!==job)return flush();
      });
    };
    return {
      save:function(choices,selectedPreset){
        generation++;
        pending={choices:JSON.parse(JSON.stringify(choices)),selectedPreset:selectedPreset};
        return flush();
      },
      load:function(apply){
        var before=generation;
        // A settings outage must not leave a bookmarked chart waiting forever.
        // Once timed out, a late response must not overwrite the active chart.
        return new Promise(function(resolve){
          var settled=false;
          var finish=function(res){
            if(settled)return;
            settled=true;
            clearTimeout(timer);
            try {
              if(res && before===generation)apply(res);
              else if(!res)status('Database settings could not be loaded.');
            } catch (_) { status('Database settings could not be loaded.'); }
            resolve();
          };
          var timer=setTimeout(function(){finish(null);},o.loadTimeoutMs || 8000);
          call({action:'load'}).then(finish,function(){finish(null);});
        });
      },
      flush:flush
    };
  }
  if(typeof module!=='undefined' && module.exports)module.exports={create:create};
  else root.SettingsStore={create:create};
})(typeof window!=='undefined'?window:globalThis);
