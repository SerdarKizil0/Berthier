import {env} from 'cloudflare:workers';
import {getChatGPTUser} from '../../chatgpt-auth';
import {extractMedia,MEDIA_LIMIT} from '@/lib/media';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 if(!await getChatGPTUser())return Response.json({error:'Giriş yapman gerekiyor.'},{status:401});
 if(req.headers.get('origin')!==new URL(req.url).origin)return Response.json({error:'İstek kaynağı doğrulanamadı.'},{status:403});
 try{
  if(Number(req.headers.get('content-length')??0)>MEDIA_LIMIT)throw Error('Dosya en fazla 10 MB olabilir.');
  const reader=req.body?.getReader();if(!reader)throw Error('Dosya bulunamadı.');
  const chunks:Uint8Array[]=[];let total=0;while(true){const r=await reader.read();if(r.done)break;total+=r.value.length;if(total>MEDIA_LIMIT){await reader.cancel();throw Error('Dosya en fazla 10 MB olabilir.');}chunks.push(r.value);}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const config={...process.env,...env} as unknown as Record<string,string|undefined>;
  // Inline requests only: binary files are never written to D1, R2 or provider Files APIs.
  const result=await extractMedia(bytes,req.headers.get('content-type')??'',config);
  return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Dosya okunamadı. Tekrar dene.'},{status:400,headers:{'Cache-Control':'no-store'}});}
}
