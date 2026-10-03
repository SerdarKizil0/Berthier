export type QuietHours={quietStart:string;quietEnd:string};
export const localTime=(now=new Date())=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Istanbul',hour:'2-digit',minute:'2-digit',hour12:false}).format(now);
export function isQuietTime(time:string,p:QuietHours){return p.quietStart>p.quietEnd?time>=p.quietStart||time<p.quietEnd:time>=p.quietStart&&time<p.quietEnd;}
export function dueWithin(time:string,scheduled:string,windowMinutes=15){const minute=(v:string)=>Number(v.slice(0,2))*60+Number(v.slice(3));const delta=minute(time)-minute(scheduled);return delta>=0&&delta<windowMinutes;}
export function deliveryTtl(now:Date,p:QuietHours){const [h,m]=localTime(now).split(':').map(Number),[qh,qm]=p.quietStart.split(':').map(Number);const remaining=((qh*60+qm-h*60-m+1440)%1440)*60-now.getUTCSeconds();return Math.max(0,Math.min(900,remaining));}
