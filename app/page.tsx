import { redirect } from 'next/navigation';
import { getAuthorizedUser } from '@/lib/server/auth-session';
export default async function Home(){const user=await getAuthorizedUser();redirect(user?'/chamadas':'/login')}
