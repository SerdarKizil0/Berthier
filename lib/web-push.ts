/** RFC 8291 aes128gcm + RFC 8292 VAPID, using the Worker Web Crypto API. */
export type PushSubscriptionRecord = {endpoint:string;keys:{p256dh:string;auth:string}};
export type VapidConfig = {publicKey:string;privateKey:string;subject:string};
const utf8=new TextEncoder();
export function decode64(value:string){if(!/^[A-Za-z0-9_-]+$/.test(value))throw Error('Geçersiz bildirim anahtarı.');const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
export function encode64(value:Uint8Array){let raw='';for(const byte of value)raw+=String.fromCharCode(byte);return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
const join=(...parts:Uint8Array[])=>{const result=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){result.set(p,offset);offset+=p.length;}return result;};
const buffer=(a:Uint8Array)=>new Uint8Array(a).buffer;
export function allowedPushEndpoint(value:string){
 try{const url=new URL(value);if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash||value.length>2048)return false;
 // Only known browser-operated push services. Redirects are never followed.
 return url.hostname==='web.push.apple.com'||url.hostname==='fcm.googleapis.com'||url.hostname==='updates.push.services.mozilla.com'||/^[a-z0-9-]+\.notify\.windows\.com$/.test(url.hostname);
 }catch{return false;}
}
export async function validateSubscription(value:PushSubscriptionRecord){
 if(!allowedPushEndpoint(value.endpoint))throw Error('Bu tarayıcının bildirim adresi desteklenmiyor.');
 const key=decode64(value.keys.p256dh),auth=decode64(value.keys.auth);if(key.length!==65||key[0]!==4||auth.length!==16)throw Error('Bildirim anahtarı geçersiz.');
 // importKey also validates that the public point belongs to P-256.
 await crypto.subtle.importKey('raw',buffer(key),{name:'ECDH',namedCurve:'P-256'},false,[]);
}
async function hmac(key:Uint8Array,data:Uint8Array){const k=await crypto.subtle.importKey('raw',buffer(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,buffer(data)));}
/** Optional entropy parameters are used only for the RFC known-answer test. */
export async function encryptPush(subscription:PushSubscriptionRecord,payload:Uint8Array,entropy?:{salt:Uint8Array;privateKey:CryptoKey;publicKey:Uint8Array}){
 if(payload.length>3993)throw Error('Bildirim metni çok uzun.');
 const ua=decode64(subscription.keys.p256dh),auth=decode64(subscription.keys.auth);
 const pair=entropy?null:await crypto.subtle.generateKey({name:'ECDH',namedCurve:'P-256'},true,['deriveBits']);
 const as=entropy?.publicKey??new Uint8Array(await crypto.subtle.exportKey('raw',pair!.publicKey));
 const salt=entropy?.salt??crypto.getRandomValues(new Uint8Array(16));
 const uaKey=await crypto.subtle.importKey('raw',buffer(ua),{name:'ECDH',namedCurve:'P-256'},false,[]);
 const secret=new Uint8Array(await crypto.subtle.deriveBits({name:'ECDH',public:uaKey},entropy?.privateKey??pair!.privateKey,256));
 const prkKey=await hmac(auth,secret);
 const ikm=await hmac(prkKey,join(utf8.encode('WebPush: info\0'),ua,as,new Uint8Array([1])));
 const prk=await hmac(salt,ikm);
 const cek=(await hmac(prk,join(utf8.encode('Content-Encoding: aes128gcm\0'),new Uint8Array([1])))).slice(0,16);
 const nonce=(await hmac(prk,join(utf8.encode('Content-Encoding: nonce\0'),new Uint8Array([1])))).slice(0,12);
 const key=await crypto.subtle.importKey('raw',buffer(cek),'AES-GCM',false,['encrypt']);
 const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv:buffer(nonce)},key,buffer(join(payload,new Uint8Array([2])))));
 const header=new Uint8Array(21);header.set(salt);new DataView(header.buffer).setUint32(16,4096,false);header[20]=as.length;
 return join(header,as,encrypted);
}
export async function vapidAuthorization(endpoint:string,config:VapidConfig,now=new Date()){
 const pub=decode64(config.publicKey),priv=decode64(config.privateKey);if(pub.length!==65||pub[0]!==4||priv.length!==32)throw Error('Bildirim sunucusu anahtarları geçersiz.');
 const subject=new URL(config.subject);if(!['https:','mailto:'].includes(subject.protocol))throw Error('Bildirim sunucusu iletişim adresi geçersiz.');
 const key=await crypto.subtle.importKey('jwk',{kty:'EC',crv:'P-256',x:encode64(pub.slice(1,33)),y:encode64(pub.slice(33,65)),d:config.privateKey,ext:true},{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
 const token=[encode64(utf8.encode(JSON.stringify({typ:'JWT',alg:'ES256'}))),encode64(utf8.encode(JSON.stringify({aud:new URL(endpoint).origin,exp:Math.floor(now.getTime()/1000)+3600,sub:config.subject})))].join('.');
 const signature=new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,utf8.encode(token)));
 return `vapid t=${token}.${encode64(signature)}, k=${config.publicKey}`;
}
export async function sendWebPush(subscription:PushSubscriptionRecord,payload:unknown,config:VapidConfig,ttl=300,now=new Date()){
 await validateSubscription(subscription);
 const body=await encryptPush(subscription,utf8.encode(JSON.stringify(payload)));
 const response=await fetch(subscription.endpoint,{method:'POST',headers:{Authorization:await vapidAuthorization(subscription.endpoint,config,now),'Content-Encoding':'aes128gcm','Content-Type':'application/octet-stream',TTL:String(Math.max(0,Math.min(3600,Math.floor(ttl)))),Urgency:'normal'},body:buffer(body),redirect:'error',signal:AbortSignal.timeout(12000)});
 // Service acceptance is not proof that a phone displayed the notification.
 return {accepted:response.status===201||response.status===202||response.status===200,expired:response.status===404||response.status===410,status:response.status};
}
