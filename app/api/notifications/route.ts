import {z} from 'zod';
import {getChatGPTUser} from '../../chatgpt-auth';
import {db} from '@/lib/notebook';
import {notificationStatus,registerSubscription,sendTestNotification,subscriptionId} from '@/lib/notification-scheduler';
export const dynamic='force-dynamic';
const respond=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
const Endpoint=z.string().max(2048);
const Input=z.discriminatedUnion('action',[
 z.object({action:z.literal('subscribe'),subscription:z.object({endpoint:Endpoint,keys:z.object({p256dh:z.string().max(100),auth:z.string().max(30)})})}),
 z.object({action:z.literal('unsubscribe'),endpoint:Endpoint}),
 z.object({action:z.literal('test'),endpoint:Endpoint}),
 z.object({action:z.literal('device'),endpoint:Endpoint}),
 z.object({action:z.literal('received'),id:z.string().uuid()})
]);
export async function GET(){const user=await getChatGPTUser();if(!user)return respond({error:'Giriş yapman gerekiyor.'},401);try{return respond(await notificationStatus());}catch{return respond({error:'Bildirim ayarlarına ulaşılamıyor.'},503);}}
export async function POST(req:Request){
 const user=await getChatGPTUser();if(!user)return respond({error:'Giriş yapman gerekiyor.'},401);
 if(req.headers.get('origin')!==new URL(req.url).origin)return respond({error:'İstek kaynağı doğrulanamadı.'},403);
 let input:z.infer<typeof Input>;try{const text=await req.text();if(text.length>6000)throw Error();input=Input.parse(JSON.parse(text));}catch{return respond({error:'Geçersiz bildirim isteği.'},400);}
 try{
  if(input.action==='subscribe'){const id=await registerSubscription(user.userId,input.subscription);return respond({subscribed:true,id});}
  if(input.action==='unsubscribe'){await db().prepare('DELETE FROM push_subscriptions WHERE id=? AND owner=?').bind(await subscriptionId(input.endpoint),user.userId).run();return respond({subscribed:false});}
  if(input.action==='test'){const result=await sendTestNotification(user.userId,input.endpoint);return respond(result,result.accepted?202:503);}
  if(input.action==='received'){await db().prepare("UPDATE notification_deliveries SET received_at=? WHERE id=? AND owner=? AND status IN ('sending','accepted','unconfirmed') AND received_at IS NULL").bind(new Date().toISOString(),input.id,user.userId).run();return respond({recorded:true});}
  const id=await subscriptionId(input.endpoint);
  const subscription=await db().prepare('SELECT id FROM push_subscriptions WHERE id=? AND owner=?').bind(id,user.userId).first();
  const test=await db().prepare("SELECT id,status,created_at,received_at FROM notification_deliveries WHERE owner=? AND subscription_id=? AND kind='test' ORDER BY created_at DESC LIMIT 1").bind(user.userId,id).first();
  return respond({subscribed:!!subscription,test});
 }catch(error){return respond({error:error instanceof Error?error.message:'Bildirim işlemi tamamlanamadı.'},503);}
}
