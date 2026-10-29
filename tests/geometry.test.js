import test from 'node:test';import assert from 'node:assert/strict';
import {rayBox,rayBuild,raycastWorld,meleeTarget} from '../shared/geometry.js';
const o={x:0,y:1.2,z:0},d={x:0,y:0,z:-1};
const world=()=>({builds:new Map(),props:new Map(),heightAt:()=>0});
test('melee uses player surface reach rather than third-person camera',()=>{
 const w=world();w.props.set('tree',{id:'tree',type:'tree',x:0,y:0,z:-3.8,scale:1});
 assert.equal(meleeTarget(w,[],{...o,y:0},d).id,'tree');w.props.get('tree').z=-3.9;assert.equal(meleeTarget(w,[],{...o,y:0},d),null);
});
test('solid wall blocks melee; targets behind the player or steeply above do not qualify',()=>{
 const w=world();w.props.set('p',{id:'p',type:'crate',x:0,y:0,z:-3,scale:1});w.builds.set('b',{id:'b',type:'wall',x:0,y:0,z:-1,rot:0});assert.equal(meleeTarget(w,[],{...o,y:0},d).id,'b');
 w.builds.clear();w.props.get('p').z=3;assert.equal(meleeTarget(w,[],{...o,y:0},d),null);w.props.get('p').y=10;assert.equal(meleeTarget(w,[],{...o,y:0},d),null);
});
test('wall and floor geometry do not use oversized spheres; ramps have a solid lower wedge',()=>{
 const wall={type:'wall',x:0,y:0,z:-5,rot:0};assert.equal(rayBuild(o,d,wall,10),4.85);assert.equal(rayBuild({...o,x:3},d,wall,10),null);
 const ramp={type:'ramp',x:0,y:0,z:0,rot:0};assert.equal(rayBuild({x:0,y:3,z:-4},{x:0,y:0,z:1},ramp,10),5);
 assert.equal(rayBox(o,d,{x:-1,y:0,z:-2},{x:1,y:2,z:-1},10),1);
});
test('terrain blocks a shot',()=>{const w=world();w.heightAt=(x,z)=>z<-1?3:0;assert.equal(raycastWorld(w,o,d,10).kind,'terrain');});
test('rotated ramps agree with rendered Three.js Y rotation',()=>{const ramp={type:'ramp',x:0,y:0,z:0,rot:1};assert.equal(rayBuild({x:4,y:3,z:0},{x:-1,y:0,z:0},ramp,10),2);assert.equal(rayBuild({x:-4,y:3,z:0},{x:1,y:0,z:0},ramp,10),5);});
