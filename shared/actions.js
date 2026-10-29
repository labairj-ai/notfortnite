// One transaction path for offline and server actions. No client-supplied damage.
import {WEAPONS,RARITIES,HARVEST,BUILD,PLAYER} from './constants.js';
import {newInventory,takeItem,dropItem,consumeHeal} from './inventory.js';
import {point,direction,viewDirection,traceShot,meleeTarget,add} from './geometry.js';
import {damagePlayer,spawnGroundLoot} from './match.js';
export function initializeInventory(p){p.slots=newInventory();p.mats={wood:0,brick:0,metal:0};p.lastActionSeq=-1;p.lastAttack=-Infinity;p.lastHeal=-Infinity;}
export function processAction(m,world,p,msg,api){
 if(m.state!=='play'||!p?.alive||!Number.isSafeInteger(msg.seq)||msg.seq<=p.lastActionSeq)return {ok:false,reason:'INVALID_OR_REPLAYED_ACTION'};
 p.lastActionSeq=msg.seq;
 const reject=reason=>({ok:false,reason});
 if(msg.t==='pickup'){
  const drop=m.groundLoot.get(msg.id);if(!drop||Math.hypot(p.x-drop.x,p.z-drop.z)>2||Math.abs(p.y-drop.y)>3)return reject('PICKUP_UNAVAILABLE');
  if(drop.item.kind==='mats'){const {mat,amount}=drop.item;p.mats[mat]=Math.min(BUILD.MAT_CAP,p.mats[mat]+amount);}
  else {const r=takeItem(p.slots,drop.item,msg.replace);if(!r.ok)return r;p.slots=r.slots;if(r.dropped)spawnGroundLoot(m,r.dropped,p.x,p.y,p.z,api);if(r.remainder){drop.item=r.remainder;api.onEvent({t:'lootUpdate',loot:drop});return {ok:true};}}
  m.groundLoot.delete(msg.id);api.onEvent({t:'lootGone',id:msg.id});return {ok:true};
 }
 if(msg.t==='drop'){
  const r=dropItem(p.slots,msg.slot);if(!r.ok)return r;p.slots=r.slots;const d=viewDirection(p.yaw,0);spawnGroundLoot(m,r.dropped,p.x+d.x*2.4,p.y,p.z+d.z*2.4,api);return {ok:true};
 }
 if(msg.t==='useHeal'){
  if(m.time-p.lastHeal<1.1)return reject('HEAL_CADENCE');const r=consumeHeal(p.slots,msg.slot,p.hp,p.shield);if(!r.ok)return r;p.slots=r.slots;p.hp=r.hp;p.shield=r.shield;p.lastHeal=m.time;return {ok:true};
 }
 if(msg.t==='build'){
  const b=msg.piece;if(!b||!['wall','floor','ramp'].includes(b.type)||!Object.hasOwn(BUILD.MAT_HP,b.mat)||!['x','y','z'].every(k=>Number.isFinite(b[k]))||!Number.isInteger(b.rot)||b.rot<0||b.rot>3||typeof b.id!=='string'||b.id.length>80||Math.hypot(b.x-p.x,b.z-p.z)>9||Math.abs(b.y-p.y)>6)return reject('INVALID_BUILD');
  if(m.time-(p.lastBuild??-Infinity)<.15||p.mats[b.mat]<BUILD.COST||world.builds.has(b.id))return reject('BUILD_UNAVAILABLE');
  for(const q of world.builds.values())if(q.type===b.type&&Math.hypot(q.x-b.x,q.y-b.y,q.z-b.z)<.5)return reject('DUPLICATE_BUILD');
  p.lastBuild=m.time;p.mats[b.mat]-=BUILD.COST;const piece={id:b.id,type:b.type,mat:b.mat,x:b.x,y:b.y,z:b.z,rot:b.rot,hp:BUILD.MAT_HP[b.mat]};world.builds.set(b.id,piece);api.onEvent({t:'buildAdded',piece});return {ok:true};
 }
 if(msg.t!=='attack')return reject('UNKNOWN_ACTION');
 const item=p.slots[msg.slot];if(!item||item.kind!=='weapon'||!WEAPONS[item.w])return reject('INVALID_WEAPON');
 const w=WEAPONS[item.w];if(m.time-p.lastAttack<w.rate-1e-6)return reject('SHOT_CADENCE');
 const aim=msg.aim,o=point(p.x,p.y+1.4,p.z),forward=viewDirection(p.yaw,p.pitch),d=aim&&['x','y','z'].every(k=>Number.isFinite(aim[k]))?direction(o,aim):null;
 if(!d||d.x*forward.x+d.y*forward.y+d.z*forward.z<.65)return reject('INVALID_AIM');
 p.lastAttack=m.time;p.weapon=item.w;p.rarity=item.rarity;
 let hit,origin=o,dir=d;
 if(w.melee){hit=meleeTarget(world,[...m.players.values()],p,forward,w.range);if(hit){origin=hit.origin;dir=hit.dir;}}
 else {
  // The authoritative host applies normal weapon spread; supplied damage/target is ignored.
  const spread=()=> (m.rng()-.5)*w.spread*2;const v=point(d.x+spread(),d.y+spread(),d.z+spread());const n=Math.hypot(v.x,v.y,v.z);dir=point(v.x/n,v.y/n,v.z/n);hit=traceShot(world,[...m.players.values()],o,dir,w.range,p.id);
 }
 const impact=add(origin,dir,hit?.dist??w.range);
 (m.noises??=[]).push({at:m.time,x:p.x,z:p.z,by:p.id});if(m.noises.length>32)m.noises.shift();
 api.onEvent({t:'shot',from:p.id,fx:o.x,fy:o.y,fz:o.z,tx:impact.x,ty:impact.y,tz:impact.z});
 if(hit?.kind==='player'){let dmg=Math.round(w.dmg*RARITIES[item.rarity].mult);if(w.falloff)dmg=Math.round(dmg*Math.max(.3,1-hit.dist/w.range));damagePlayer(m,hit.id,dmg,p.id,api);}
 else if(hit?.kind==='prop'){
  const prop=world.props.get(hit.id);if(prop){prop.hp--;if(w.melee)p.mats[HARVEST[prop.type].mat]=Math.min(BUILD.MAT_CAP,p.mats[HARVEST[prop.type].mat]+HARVEST[prop.type].perHit);if(prop.hp<=0){world.props.delete(prop.id);api.onEvent({t:'propGone',id:prop.id});}else api.onEvent({t:'propHp',id:prop.id,hp:prop.hp});}
 }else if(hit?.kind==='build'){
  const b=world.builds.get(hit.id);if(b){b.hp-=w.melee?50:w.dmg;if(w.melee)p.mats[b.mat]=Math.min(BUILD.MAT_CAP,p.mats[b.mat]+HARVEST.build.perHit);if(b.hp<=0){world.builds.delete(b.id);api.onEvent({t:'buildGone',id:b.id});}else api.onEvent({t:'buildHp',id:b.id,hp:b.hp});}
 }
 return {ok:true,hit,impact};
}
export function acceptPosition(p,msg,time){
 if(!['x','y','z','yaw','pitch'].every(k=>Number.isFinite(msg[k]))||Math.abs(msg.pitch)>1.36||Math.abs(msg.x)>252||Math.abs(msg.z)>252||msg.y<0||msg.y>PLAYER.DROP_ALT+10)return false;
 const dt=Math.max(0,time-(p.lastStateTime??time)),budget=Math.min(2,(p.moveBudget??2)+PLAYER.SPEED*1.4*dt),dist=Math.hypot(msg.x-p.x,msg.z-p.z);
 if(dist>budget||Math.abs(msg.y-p.y)>Math.max(2,45*dt))return false;
 p.moveBudget=budget-dist;p.lastStateTime=time;p.x=msg.x;p.y=msg.y;p.z=msg.z;p.yaw=msg.yaw;p.pitch=msg.pitch;p.anim=Number.isInteger(msg.anim)?msg.anim&3:0;return true;
}
