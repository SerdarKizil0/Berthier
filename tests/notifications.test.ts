import {strict as assert} from 'node:assert';
import {encryptPush,decode64,encode64,vapidAuthorization,allowedPushEndpoint,validateSubscription,sendWebPush} from '../lib/web-push';
import {isQuietTime,localTime,dueWithin,deliveryTtl} from '../lib/notification-time';

async function main(){
 // Public RFC 8291 section 5 known-answer vector, not application credentials.
 const publicKey='BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8';
 const privateKey='yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw';
 const as=decode64(publicKey),key=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:encode64(as.slice(1,33)),y:encode64(as.slice(33)),d:privateKey},{name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const sub={endpoint:'https://web.push.apple.com/test',keys:{p256dh:'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',auth:'BTBZMqHH6r4Tts7J_aSIgg'}};
 const encrypted=await encryptPush(sub,new TextEncoder().encode('When I grow up, I want to be a watermelon'),{salt:decode64('DGv6ra1nlYgDCS1FRnbzlw'),publicKey:as,privateKey:key});
 assert.equal(encode64(encrypted),'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN');
 console.log('PASS RFC 8291 known-answer encryption');
 const now=new Date('2026-10-01T05:30:00Z'),config={publicKey,privateKey,subject:'https://example.org/contact'};
 const auth=await vapidAuthorization(sub.endpoint,config,now),token=auth.match(/^vapid t=([^,]+), k=/)![1],parts=token.split('.');
 const claims=JSON.parse(new TextDecoder().decode(decode64(parts[1])));assert.equal(claims.aud,'https://web.push.apple.com');assert.equal(claims.exp,Math.floor(now.getTime()/1000)+3600);
 const verifyKey=await crypto.subtle.importKey('raw',as,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);assert.equal(await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},verifyKey,decode64(parts[2]),new TextEncoder().encode(parts.slice(0,2).join('.'))),true);
 console.log('PASS VAPID signature, audience, expiry');
 for(const url of ['https://web.push.apple.com/a','https://fcm.googleapis.com/fcm/send/a','https://updates.push.services.mozilla.com/wpush/v2/a','https://wns2-bl2p.notify.windows.com/w/?token=a'])assert.equal(allowedPushEndpoint(url),true);
 for(const url of ['http://web.push.apple.com/a','https://web.push.apple.com.evil.test/','https://127.0.0.1/x','https://web.push.apple.com:8443/a','https://user:pass@web.push.apple.com/a','https://localhost/','https://fcm.googleapis.com@evil.test/x'])assert.equal(allowedPushEndpoint(url),false);
 await validateSubscription(sub);await assert.rejects(()=>validateSubscription({...sub,keys:{...sub.keys,auth:'bad'}}));
 console.log('PASS provider allowlist and subscription validation');
 const p={quietStart:'23:00',quietEnd:'07:30'};assert.equal(localTime(now),'08:30');assert.equal(isQuietTime('23:00',p),true);assert.equal(isQuietTime('07:29',p),true);assert.equal(isQuietTime('07:30',p),false);assert.equal(isQuietTime('22:59',p),false);assert.equal(dueWithin('08:30','08:30'),true);assert.equal(dueWithin('08:29','08:30'),false);assert.equal(dueWithin('08:45','08:30'),false);assert.equal(deliveryTtl(new Date('2026-10-01T19:59:30Z'),p),30);
 console.log('PASS Istanbul schedule and quiet-hour edges');
 const original=globalThis.fetch;let options:RequestInit|undefined;
 try{globalThis.fetch=async(_input,init)=>{options=init;return new Response(null,{status:201});};const result=await sendWebPush(sub,{title:'Deneme'},config,30,now);assert.equal(result.accepted,true);assert.equal(options?.redirect,'error');assert.equal((options?.headers as Record<string,string>)['Content-Encoding'],'aes128gcm');assert.equal((options?.headers as Record<string,string>).TTL,'30');}finally{globalThis.fetch=original;}
 console.log('PASS send acceptance and redirect protection');
}
main().catch(error=>{console.error(error);process.exitCode=1;});
