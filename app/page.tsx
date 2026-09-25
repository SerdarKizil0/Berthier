import Berthier from './berthier';
import { requireChatGPTUser } from './chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Home() { const user = await requireChatGPTUser('/'); return <Berthier userId={user.userId} />; }
