// Host-neutral collision queries. Distances are measured from the actual origin.
import {BUILD} from './constants.js';
export const point=(x,y,z)=>({x,y,z});
export const add=(a,d,t)=>point(a.x+d.x*t,a.y+d.y*t,a.z+d.z*t);
export function direction(a,b){const n=Math.hypot(b.x-a.x,b.y-a.y,b.z-a.z);return n>1e-9?point((b.x-a.x)/n,(b.y-a.y)/n,(b.z-a.z)/n):null;}
export function viewDirection(yaw,pitch){return point(-Math.sin(yaw)*Math.cos(pitch),-Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));}
export function rayBox(o,d,min,max,range){
 let lo=0,hi=range;
 for(const k of ['x','y','z']){
  if(Math.abs(d[k])<1e-9){if(o[k]<min[k]||o[k]>max[k])return null;continue;}
  let a=(min[k]-o[k])/d[k],b=(max[k]-o[k])/d[k];if(a>b)[a,b]=[b,a];lo=Math.max(lo,a);hi=Math.min(hi,b);if(lo>hi)return null;
 }
 return lo<=range?lo:null;
}
export function raySphere(o,d,cx,cy,cz,r,range){
 const x=o.x-cx,y=o.y-cy,z=o.z-cz,b=x*d.x+y*d.y+z*d.z,c=x*x+y*y+z*z-r*r;
 if(c<=0)return 0;const disc=b*b-c;if(disc<0)return null;const t=-b-Math.sqrt(disc);return t>=0&&t<=range?t:null;
}
function local(v,b,isDir=false){const a=b.rot*Math.PI/2,c=Math.cos(a),s=Math.sin(a),x=v.x-(isDir?0:b.x),z=v.z-(isDir?0:b.z);return point(x*c-z*s,v.y-(isDir?0:b.y),x*s+z*c);}
export function rayBuild(o,d,b,range){
 const g=BUILD.GRID,h=g/2,p=local(o,b),v=local(d,b,true);
 if(b.type==='wall')return rayBox(p,v,point(-h,0,-.15),point(h,g,.15),range);
 if(b.type==='floor')return rayBox(p,v,point(-h,0,-h),point(h,.3,h),range);
 // Solid wedge: y >= 0 and y <= z + half, clipped to footprint.
 let lo=0,hi=range;
 for(const [n,k] of [[point(1,0,0),h],[point(-1,0,0),h],[point(0,0,1),h],[point(0,0,-1),h],[point(0,-1,0),0],[point(0,1,-1),h]]){
  const q=k-(n.x*p.x+n.y*p.y+n.z*p.z),rate=n.x*v.x+n.y*v.y+n.z*v.z;
  if(Math.abs(rate)<1e-9){if(q<0)return null;}else if(rate>0)hi=Math.min(hi,q/rate);else lo=Math.max(lo,q/rate);
  if(lo>hi)return null;
 }
 return lo;
}
export function propBounds(p){const s=p.scale||1;return p.type==='tree'?[point(p.x-.45*s,p.y,p.z-.45*s),point(p.x+.45*s,p.y+5*s,p.z+.45*s)]:[point(p.x-.8*s,p.y,p.z-.8*s),point(p.x+.8*s,p.y+1.6*s,p.z+.8*s)];}
export function raycastWorld(world,o,d,range){
 let best=null;const take=(t,kind,id)=>{if(t!==null&&(!best||t<best.dist))best={dist:t,kind,id};};
 for(const b of world.builds.values())take(rayBuild(o,d,b,range),'build',b.id);
 for(const p of world.props.values()){const [a,b]=propBounds(p);take(rayBox(o,d,a,b,range),'prop',p.id);}
 // Terrain cannot be bypassed by either melee or camera-offset gunfire.
 if(world.heightAt)for(let t=.05;t<=Math.min(range,best?.dist??range);t+=.2){const p=add(o,d,t);if(p.y<world.heightAt(p.x,p.z)-.02){take(t,'terrain',null);break;}}
 return best;
}
export function traceShot(world,players,o,d,range,exclude){
 let best=raycastWorld(world,o,d,range);
 for(const p of players){if(!p.alive||p.id===exclude)continue;const t=rayBox(o,d,point(p.x-.45,p.y,p.z-.45),point(p.x+.45,p.y+1.8,p.z+.45),range);if(t!==null&&(!best||t<best.dist))best={dist:t,kind:'player',id:p.id};}
 return best;
}
export function meleeTarget(world,players,player,d,range=3.4){
 const o=point(player.x,player.y+1.2,player.z),candidates=[];
 const collect=(id,kind,a,b)=>{const q=point(...['x','y','z'].map(k=>Math.max(a[k],Math.min(b[k],o[k]))));const v=direction(o,q);const dist=Math.hypot(q.x-o.x,q.y-o.y,q.z-o.z);if(dist>range||v&&(v.x*d.x+v.y*d.y+v.z*d.z)<.5)return;const hit=traceShot(world,players,o,v||d,Math.min(range,dist+.02),player.id);if(hit?.id===id&&hit.kind===kind)candidates.push({...hit,origin:o,dir:v||d});};
 for(const p of world.props.values())collect(p.id,'prop',...propBounds(p));
 for(const b of world.builds.values()){
  const h=BUILD.GRID/2,a=local(o,b);const q=point(Math.max(-h,Math.min(h,a.x)),Math.max(0,Math.min(b.type==='floor'?.3:BUILD.GRID,a.y)),Math.max(b.type==='wall'?-.15:-h,Math.min(b.type==='wall'?.15:h,a.z)));
  if(b.type==='ramp')q.y=Math.min(q.y,q.z+h);
  const angle=-b.rot*Math.PI/2,c=Math.cos(angle),s=Math.sin(angle),target=point(b.x+q.x*c-q.z*s,b.y+q.y,b.z+q.x*s+q.z*c),v=direction(o,target)||d,dist=Math.hypot(target.x-o.x,target.y-o.y,target.z-o.z);
  if(dist>range||v.x*d.x+v.y*d.y+v.z*d.z<.5)continue;const hit=traceShot(world,players,o,v,dist+.02,player.id);if(hit?.id===b.id&&hit.kind==='build')candidates.push({...hit,origin:o,dir:v});
 }
 for(const p of players)if(p.id!==player.id&&p.alive)collect(p.id,'player',point(p.x-.45,p.y,p.z-.45),point(p.x+.45,p.y+1.8,p.z+.45));
 return candidates.sort((a,b)=>a.dist-b.dist||String(a.id).localeCompare(String(b.id)))[0]||null;
}
