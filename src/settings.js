export const SETTINGS_KEY='notfortnite-settings-v1';
export const DEFAULT_SETTINGS={version:1,sensitivity:1,invertY:false,handedness:'right',joystick:'floating',preset:'Standard',buttonSize:64,opacity:1,aimAssist:false,aimFire:false,quality:'Auto',layout:{}};
const clamp=(v,min,max,fallback)=>Number.isFinite(Number(v))?Math.min(max,Math.max(min,Number(v))):fallback;
export function normalizeSettings(raw={}){
 if(!raw||typeof raw!=='object')raw={};
 const r={...DEFAULT_SETTINGS,sensitivity:clamp(raw.sensitivity,.25,3,1),buttonSize:clamp(raw.buttonSize,44,96,64),opacity:clamp(raw.opacity,.4,1,1),layout:{}};
 for(const k of ['invertY','aimAssist','aimFire'])r[k]=raw[k]===true;
 for(const [key,values]of Object.entries({handedness:['left','right'],joystick:['floating','fixed'],preset:['Simple','Standard','Advanced'],quality:['Auto','Low','Medium','High']}))if(values.includes(raw[key]))r[key]=raw[key];
 for(const [id,p]of Object.entries(raw.layout||{}))if(/^btn-(fire|jump|build|interact|drop|emote)$/.test(id)&&p&&Number.isFinite(p.x)&&Number.isFinite(p.y))r.layout[id]={x:clamp(p.x,0,1,0),y:clamp(p.y,0,1,0)};
 return r;
}
export function loadSettings(storage=localStorage){try{return normalizeSettings(JSON.parse(storage.getItem(SETTINGS_KEY)));}catch{return normalizeSettings();}}
export function saveSettings(s,storage=localStorage){const r=normalizeSettings(s);try{storage.setItem(SETTINGS_KEY,JSON.stringify(r));}catch{}return r;}
export function applySettings(s){
 const root=document.documentElement;root.style.setProperty('--control-size',s.buttonSize+'px');root.style.setProperty('--control-opacity',s.opacity);
 document.body.classList.toggle('left-handed',s.handedness==='left');document.body.dataset.controlPreset=s.preset;
 for(const id of ['btn-fire','btn-jump','btn-build','btn-interact','btn-drop','btn-emote']){const el=document.getElementById(id);if(!el)continue;el.style.left=el.style.top='';const p=s.layout[id];if(p){const pad=12,size=s.buttonSize;el.style.position='fixed';el.style.right=el.style.bottom='auto';el.style.left=Math.max(pad,Math.min(innerWidth-size-pad,p.x*innerWidth))+'px';el.style.top=Math.max(pad,Math.min(innerHeight-size-pad,p.y*innerHeight))+'px';}else{el.style.position=el.style.right=el.style.bottom='';}}
}
export function installSettings(ctl,onChange){
 let settings=loadSettings(),editing=false,drag=null;ctl.settings=settings;applySettings(settings);
 const dialog=document.getElementById('settings-dialog'),form=document.getElementById('settings-form');
 const sync=()=>{for(const el of form.elements){if(!el.name)continue;if(el.type==='checkbox')el.checked=settings[el.name];else if(settings[el.name]!==undefined)el.value=settings[el.name];}};
 const commit=()=>{settings=saveSettings(settings);ctl.settings=settings;applySettings(settings);onChange?.(settings);};
 document.getElementById('settings-btn').onclick=()=>{sync();dialog.showModal();};
 form.onchange=()=>{for(const el of form.elements){if(el.name)settings[el.name]=el.type==='checkbox'?el.checked:el.value;}if(settings.preset==='Simple')settings.buttonSize=76;else if(settings.preset==='Advanced')settings.buttonSize=56;commit();};
 document.getElementById('settings-reset').onclick=()=>{settings=normalizeSettings();commit();sync();};
 document.getElementById('settings-close').onclick=()=>dialog.close();
 document.getElementById('layout-edit').onclick=()=>{dialog.close();editing=true;ctl.enabled=false;document.body.classList.add('editing-layout','touch');document.getElementById('layout-done').hidden=false;};
 document.getElementById('layout-done').onclick=()=>{editing=false;drag=null;document.body.classList.remove('editing-layout');document.getElementById('layout-done').hidden=true;commit();};
 window.addEventListener('pointerdown',e=>{if(!editing)return;const el=e.target.closest?.('#touch-buttons .touch-btn');if(!el)return;drag={id:e.pointerId,el};el.setPointerCapture(e.pointerId);e.preventDefault();},true);
 window.addEventListener('pointermove',e=>{if(!drag||drag.id!==e.pointerId)return;settings.layout[drag.el.id]={x:Math.max(0,Math.min(1,(e.clientX-settings.buttonSize/2)/innerWidth)),y:Math.max(0,Math.min(1,(e.clientY-settings.buttonSize/2)/innerHeight))};applySettings(settings);});
 for(const type of ['pointerup','pointercancel'])window.addEventListener(type,()=>{drag=null;});
 window.addEventListener('resize',()=>applySettings(settings));return {get:()=>settings};
}
