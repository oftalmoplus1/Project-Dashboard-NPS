import { redirect } from 'next/navigation';
import { getAuthorizedUser } from '@/lib/server/auth-session';

export default async function Home(){
 const user=await getAuthorizedUser();
 if(!user)redirect('/login');
 redirect(user.role==='administrador'?'/chamadas':'/configuracoes');
}
