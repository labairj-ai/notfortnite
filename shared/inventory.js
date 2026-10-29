import {WEAPONS,HEALS,BUILD} from './constants.js';
export const HEAL_STACK_CAP={bandage:15,minishield:6,medkit:3,shieldpot:3};
export const newInventory=()=>[{kind:'weapon',w:'pickaxe',rarity:0},null,null,null,null,null];
export function validItem(i){return !!i&&(i.kind==='weapon'&&Object.hasOwn(WEAPONS,i.w)&&i.w!=='pickaxe'&&Number.isInteger(i.rarity)&&i.rarity>=0&&i.rarity<5||i.kind==='heal'&&Object.hasOwn(HEALS,i.h)&&Number.isInteger(i.uses)&&i.uses>0&&i.uses<=HEAL_STACK_CAP[i.h]||i.kind==='mats'&&Object.hasOwn(BUILD.MAT_HP,i.mat)&&Number.isInteger(i.amount)&&i.amount>0&&i.amount<=BUILD.MAT_CAP);}
export function takeItem(slots,item,replace=-1){
 const next=slots.map(i=>i?{...i}:null);if(!validItem(item)||item.kind==='mats')return {ok:false,reason:'INVALID_ITEM'};
 let remaining={...item};
 if(item.kind==='heal')for(let i=1;i<6;i++)if(next[i]?.kind==='heal'&&next[i].h===item.h){const n=Math.min(HEAL_STACK_CAP[item.h]-next[i].uses,remaining.uses);next[i].uses+=n;remaining.uses-=n;if(!remaining.uses)return {ok:true,slots:next};}
 const free=next.findIndex((x,i)=>i>0&&!x);
 if(free>0){next[free]=remaining;return {ok:true,slots:next,selected:free};}
 // Never discard a partially stacked incoming item on a full inventory.
 if(item.kind==='heal'&&remaining.uses<item.uses)return {ok:true,slots:next,remainder:remaining};
 if(Number.isInteger(replace)&&replace>0&&replace<6){const dropped=next[replace];next[replace]=remaining;return {ok:true,slots:next,dropped,selected:replace};}
 return {ok:false,reason:'FULL'};
}
export function dropItem(slots,slot){if(!Number.isInteger(slot)||slot<1||slot>5||!slots[slot])return {ok:false,reason:'PROTECTED_OR_EMPTY_SLOT'};const next=slots.map(i=>i?{...i}:null),dropped=next[slot];next[slot]=null;return {ok:true,slots:next,dropped};}
export function consumeHeal(slots,slot,hp,shield){
 const item=slots[slot],h=item?.kind==='heal'?HEALS[item.h]:null;
 if(!h||item.uses<=0||h.hp&&hp>=h.hpCap||h.shield&&shield>=h.shieldCap)return {ok:false,reason:'NOT_NEEDED'};
 const next=slots.map(i=>i?{...i}:null);if(--next[slot].uses===0)next[slot]=null;
 return {ok:true,slots:next,hp:h.hp?Math.min(h.hpCap,hp+h.hp):hp,shield:h.shield?Math.min(h.shieldCap,shield+h.shield):shield};
}
