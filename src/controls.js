// Pointer ownership is independent for move, look and each action button.
export const IS_TOUCH = typeof window!=='undefined' && (window.matchMedia?.('(pointer: coarse)').matches || false);
export function createControls(canvas) {
 const ctl={moveX:0,moveZ:0,lookDX:0,lookDY:0,fire:false,firePressed:false,jump:false,jumpPressed:false,interactPressed:false,buildTogglePressed:false,slotPressed:-1,piecePressed:null,matCyclePressed:false,emoteWheelPressed:false,emoteSelected:-1,debugPressed:false,dropPressed:false};
 const abort=new AbortController(),keys={},contacts=new Map();let enabled=false,move=null,look=null;
 const stick=document.getElementById('joystick'),knob=document.getElementById('joystick-knob');
 const listen=(el,name,fn)=>el?.addEventListener(name,fn,{signal:abort.signal});
 ctl.settings={sensitivity:1,invertY:false,handedness:'right',joystick:'floating',aimFire:false};
 ctl.resetInputs=(reason='reset')=>{
  for(const key of Object.keys(keys))delete keys[key];contacts.clear();move=look=null;
  Object.assign(ctl,{moveX:0,moveZ:0,lookDX:0,lookDY:0,fire:false,jump:false});ctl.consumeFrame();
  stick?.classList.remove('active');if(knob)knob.style.transform='translate(0,0)';ctl.lastReset=reason;
 };
 Object.defineProperty(ctl,'enabled',{get:()=>enabled,set:v=>{enabled=!!v;if(!enabled)ctl.resetInputs('disabled');}});
 ctl.consumeFrame=()=>{Object.assign(ctl,{lookDX:0,lookDY:0,firePressed:false,jumpPressed:false,interactPressed:false,buildTogglePressed:false,slotPressed:-1,piecePressed:null,matCyclePressed:false,emoteWheelPressed:false,emoteSelected:-1,debugPressed:false,dropPressed:false});};
 listen(window,'keydown',e=>{
  if(!enabled||e.repeat||e.target?.closest?.('input,select,textarea,dialog'))return;
  keys[e.code]=true;
  const actions={Space:'jumpPressed',KeyF:'interactPressed',KeyQ:'buildTogglePressed',KeyR:'matCyclePressed',KeyE:'emoteWheelPressed',KeyG:'dropPressed',F3:'debugPressed'};
  if(actions[e.code]){ctl[actions[e.code]]=true;e.preventDefault();}
  if(['KeyZ','KeyX','KeyC'].includes(e.code))ctl.piecePressed={KeyZ:'wall',KeyX:'floor',KeyC:'ramp'}[e.code];
  if(/^Digit[1-6]$/.test(e.code))ctl.slotPressed=Number(e.code.slice(-1))-1;
 });
 listen(window,'keyup',e=>{delete keys[e.code];});
 listen(canvas,'pointerdown',e=>{if(enabled&&e.pointerType==='mouse'&&e.button===0&&document.pointerLockElement===canvas){ctl.fire=true;ctl.firePressed=true;}});
 listen(window,'pointerup',e=>{if(e.pointerType==='mouse'&&e.button===0)ctl.fire=false;});
 listen(window,'mousemove',e=>{if(enabled&&document.pointerLockElement===canvas){ctl.lookDX+=e.movementX*.0022*ctl.settings.sensitivity;ctl.lookDY+=e.movementY*.0022*ctl.settings.sensitivity*(ctl.settings.invertY?-1:1);}});
 const action=(id)=>{
  if(id==='btn-fire'){ctl.fire=true;ctl.firePressed=true;return 'fire';}
  if(id==='btn-jump'){ctl.jump=true;ctl.jumpPressed=true;return 'jump';}
  const map={'btn-build':'buildTogglePressed','btn-interact':'interactPressed','btn-mat':'matCyclePressed','btn-emote':'emoteWheelPressed','btn-drop':'dropPressed'};
  if(map[id])ctl[map[id]]=true;
  if(id.startsWith('hud-slot-'))ctl.slotPressed=Number(id.slice(-1));
  if(id.startsWith('btn-piece-'))ctl.piecePressed=id.slice(10);
  return 'button';
 };
 listen(window,'pointerdown',e=>{
  if(!enabled||e.pointerType==='mouse')return;
  if(e.target.closest?.('dialog,.game-panel'))return;
  document.body.classList.add('touch');
  const button=e.target.closest?.('.touch-btn,.hud-slot');
  if(button){contacts.set(e.pointerId,{kind:action(button.id)});if(e.isTrusted)button.setPointerCapture?.(e.pointerId);e.preventDefault();return;}
  if(e.target!==canvas&&!e.target.closest?.('#joystick'))return;
  const left=ctl.settings.handedness==='left'?e.clientX>innerWidth*.6:e.clientX<innerWidth*.4;
  if(left&&e.clientY>innerHeight*.35&&move===null){
   move=e.pointerId;const r=stick.getBoundingClientRect(),fixed=ctl.settings.joystick==='fixed';const x=fixed?r.left+r.width/2:e.clientX,y=fixed?r.top+r.height/2:e.clientY;
   contacts.set(move,{kind:'move',x,y});stick.style.left=(x-55)+'px';stick.style.top=(y-55)+'px';stick.classList.add('active');
  }else if(!left&&look===null){look=e.pointerId;contacts.set(look,{kind:'look',x:e.clientX,y:e.clientY});if(ctl.settings.aimFire){ctl.fire=true;ctl.firePressed=true;}}
  if(e.isTrusted)canvas.setPointerCapture?.(e.pointerId);e.preventDefault();
 });
 listen(window,'pointermove',e=>{
  const c=contacts.get(e.pointerId);if(!enabled||!c)return;
  if(c.kind==='move'){let dx=e.clientX-c.x,dy=e.clientY-c.y;const n=Math.max(55,Math.hypot(dx,dy));ctl.moveX=dx/n;ctl.moveZ=-dy/n;knob.style.transform=`translate(${ctl.moveX*55}px,${-ctl.moveZ*55}px)`;}
  if(c.kind==='look'){ctl.lookDX+=(e.clientX-c.x)*.005*ctl.settings.sensitivity;ctl.lookDY+=(e.clientY-c.y)*.005*ctl.settings.sensitivity*(ctl.settings.invertY?-1:1);c.x=e.clientX;c.y=e.clientY;}
 });
 function release(e){const c=contacts.get(e.pointerId);if(!c)return;contacts.delete(e.pointerId);
  if(c.kind==='move'){move=null;ctl.moveX=ctl.moveZ=0;stick.classList.remove('active');knob.style.transform='translate(0,0)';}
  if(c.kind==='look'){look=null;ctl.lookDX=ctl.lookDY=0;}
  ctl.fire=[...contacts.values()].some(c=>c.kind==='fire'||c.kind==='look'&&ctl.settings.aimFire);
  ctl.jump=[...contacts.values()].some(c=>c.kind==='jump');
  if(e.type!=='pointerup'){ctl.firePressed=false;ctl.jumpPressed=false;}
 }
 for(const name of ['pointerup','pointercancel','lostpointercapture'])listen(window,name,release);
 listen(window,'blur',()=>ctl.resetInputs('blur'));listen(document,'visibilitychange',()=>{if(document.hidden)ctl.resetInputs('hidden');});
 listen(window,'orientationchange',()=>ctl.resetInputs('orientation'));
 listen(document,'pointerlockchange',()=>{if(document.pointerLockElement!==canvas)ctl.resetInputs('pointerlock');});
 ctl.update=()=>{
  if(!enabled){ctl.resetInputs('disabled');return;}
  if(move===null){let x=(keys.KeyD?1:0)-(keys.KeyA?1:0),z=(keys.KeyW?1:0)-(keys.KeyS?1:0),d=Math.max(1,Math.hypot(x,z));ctl.moveX=x/d;ctl.moveZ=z/d;}
  ctl.jump=!!keys.Space||[...contacts.values()].some(c=>c.kind==='jump');
 };
 ctl.dispose=()=>{ctl.enabled=false;abort.abort();};
 return ctl;
}
