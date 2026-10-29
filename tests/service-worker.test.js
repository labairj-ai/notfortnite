import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function worker({cached,fail=false}){
 const handlers={},calls=[],writes=[];
 const context={URL,self:{location:{origin:'https://game.example'},addEventListener:(name,fn)=>handlers[name]=fn},caches:{open:async()=>({match:async()=>cached,put:async(req,res)=>writes.push(res)})},fetch:async(req,options)=>{calls.push(options);if(fail)throw new Error('offline');return {ok:true,body:'fresh menu',clone(){return {...this};}};}};
 vm.runInNewContext(fs.readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),context);
 const load=async(mode='navigate')=>{let response;handlers.fetch({request:{url:'https://game.example/notfortnite/',method:'GET',mode},respondWith:p=>response=p});return response;};return {load,calls,writes};
}
test('navigation bypasses both stored HTML and the browser HTTP cache',async()=>{const w=worker({cached:{body:'old menu with export button'}});assert.equal((await w.load()).body,'fresh menu');assert.equal(w.calls[0].cache,'no-store');assert.equal(w.writes.length,1);});
test('offline navigation retains the last cached page',async()=>{const w=worker({cached:{body:'offline page'},fail:true});assert.equal((await w.load()).body,'offline page');});
test('hashed assets can still load from the asset cache',async()=>{const w=worker({cached:{body:'cached asset'}});assert.equal((await w.load('cors')).body,'cached asset');assert.equal(w.calls.length,0);});
