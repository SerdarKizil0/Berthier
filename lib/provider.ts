// Model provider refusals (Anthropic, Gemini) as the user reads them. Server only; kept apart from llm.ts so the
// media helpers the client imports do not pull the model prompts in.
export type Failure='credit'|'limit'|'key'|'other';
export const CREDIT_TEXT='Yapay zekâ kredisi bitti. Metnin saklandı; kredi yükleyince tekrar dene.';
/** Out of credit — 402 (billing_error) or a body that speaks of credit or balance — is said as such. Any other 4xx/5xx
 *  body goes to the server log, never to the user (it can name accounts or limits). */
export async function providerFailure(response:Response,provider:string):Promise<Failure>{
 const body=await response.text().catch(()=>'');
 if(response.status===402||/billing_error|credit|\bbalance\b|kredi|bakiye/i.test(body))return 'credit';
 console.error(`${provider} ${response.status}: ${body.slice(0,2000)}`);
 return response.status===429?'limit':response.status===401||response.status===403?'key':'other';
}
