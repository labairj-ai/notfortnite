export const QUALITY_PRESETS={Low:{dpr:1,shadows:false,bloom:false},Medium:{dpr:1.5,shadows:false,bloom:false},High:{dpr:2,shadows:true,bloom:true}};
export function percentile(values,p){if(!values.length)return null;const a=[...values].sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.floor((a.length-1)*p))];}
export function createPerformanceMonitor(){
 let samples=[],slow=0,fast=0,quality='Medium';
 return {sample(ms){if(!Number.isFinite(ms)||ms<=0||ms>250)return null;samples.push(ms);if(samples.length>600)samples.shift();if(samples.length<120)return null;const p95=percentile(samples.slice(-120),.95);slow=p95>35?slow+1:0;fast=p95<18?fast+1:0;if(slow>=120&&quality!=='Low'){quality=quality==='High'?'Medium':'Low';slow=fast=0;return quality;}if(fast>=600&&quality!=='High'){quality=quality==='Low'?'Medium':'High';slow=fast=0;return quality;}return null;},setQuality(q){quality=q;slow=fast=0;},report(){return {samples:samples.length,p50:percentile(samples,.5),p95:percentile(samples,.95),quality};}};
}
