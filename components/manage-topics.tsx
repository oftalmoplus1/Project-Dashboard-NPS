'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { FolderPlus, Folder, LoaderCircle, RefreshCw, ShieldCheck, ChevronDown, Link2, Pencil, Trash2, X, Save, Unlink } from 'lucide-react';
import { callCenterTopicLabel } from '@/lib/call-center-design';
import Link from 'next/link';
import { existingDashboards, type DashboardItem } from '@/lib/dashboard-registry';

type Topico={
 id:string;
 nome:string;
 slug:string;
 posicao:number;
 quantidade_dashboards:number;
};
type ListResponse={rows?:Topico[];error?:string};
type CreateResponse={id?:string;error?:string};

export default function ManageTopics(){
 const [topicos,setTopicos]=useState<Topico[]>([]);
 const [loading,setLoading]=useState(true);
 const [ready,setReady]=useState(false);
 const [error,setError]=useState('');
 const [name,setName]=useState('');
 const [saving,setSaving]=useState(false);
 const [message,setMessage]=useState('');
 const [opened,setOpened]=useState<string|null>(null);
 const [itemsByTopic,setItemsByTopic]=useState<Record<string,DashboardItem[]>>({});
 const [loadingTopic,setLoadingTopic]=useState(false);
 const [linking,setLinking]=useState('');
 const [pendingUnlink,setPendingUnlink]=useState<{slug:string;codigo:string;nome:string}|null>(null);
 const [confirmCode,setConfirmCode]=useState('');
 const [unlinking,setUnlinking]=useState(false);
 const [editingSlug,setEditingSlug]=useState<string|null>(null);
 const [editName,setEditName]=useState('');
 const [deletingSlug,setDeletingSlug]=useState<string|null>(null);
 const [confirmSlug,setConfirmSlug]=useState('');
 const [mutating,setMutating]=useState(false);

 const load=useCallback(async()=>{
  setLoading(true);
  setError('');
  try{
   const response=await fetch('/api/catalogo/topicos',{cache:'no-store'});
   const payload:ListResponse=await response.json();
   if(!response.ok||!Array.isArray(payload.rows)){
    setReady(false);
    setError(payload.error??'Não foi possível consultar os tópicos.');
    return;
   }
   setTopicos(payload.rows);
   setReady(true);
  }catch{
   setReady(false);
   setError('Não foi possível consultar o catálogo de tópicos.');
  }finally{setLoading(false);}
 },[]);

 useEffect(()=>{void load();},[load]);

 async function create(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  if(!ready||saving)return;
  setSaving(true);
  setError('');
  setMessage('');
  try{
   const response=await fetch('/api/catalogo/topicos',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({nome:name.trim()}),
   });
   const result:CreateResponse=await response.json();
   if(!response.ok){
    setError(result.error??'Não foi possível criar o tópico.');
    return;
   }
   setName('');
   setMessage('Tópico criado. Nenhum usuário recebeu acesso automaticamente.');
   await load();
   window.dispatchEvent(new Event('dashboard-topics-updated'));
  }catch{
   setError('Não foi possível salvar o tópico.');
  }finally{setSaving(false);}
 }

 async function loadDashboards(slug:string) {
  setLoadingTopic(true);
  setError('');
  try {
   const response=await fetch(`/api/catalogo/topicos/${slug}/dashboards`,{cache:'no-store'});
   const data:{rows?:DashboardItem[];error?:string}=await response.json();
   if(!response.ok||!Array.isArray(data.rows)){
    setError(data.error??'Não foi possível carregar os dashboards do tópico.');
    return;
   }
   setItemsByTopic(old=>({...old,[slug]:data.rows!}));
  } catch {
   setError('Não foi possível consultar os dashboards vinculados.');
  } finally {setLoadingTopic(false);}
 }
 function toggleTopic(slug:string){
  setPendingUnlink(null);setConfirmCode('');
  if(opened===slug){setOpened(null);return;}
  setOpened(slug);
  void loadDashboards(slug);
 }
 async function associate(slug:string,codigo:string){
  if(linking||unlinking)return;
  setLinking(codigo);
  setError('');
  setMessage('');
  try{
   const response=await fetch(`/api/catalogo/topicos/${slug}/dashboards`,{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({codigo}),
   });
   const result:{error?:string}=await response.json();
   if(!response.ok){
    setError(result.error??'Não foi possível associar o dashboard.');
    return;
   }
   setMessage('Dashboard associado sem duplicar dados nem conceder novas permissões.');
   await Promise.all([load(),loadDashboards(slug)]);
  }catch{
   setError('Não foi possível concluir a associação.');
  }finally{setLinking('');}
 }

 function prepareUnlink(slug:string,dashboard:DashboardItem){
  if(unlinking||linking)return;
  setPendingUnlink({slug,codigo:dashboard.codigo,nome:dashboard.nome});
  setConfirmCode('');setError('');setMessage('');
 }
 async function unlinkDashboard(event:FormEvent<HTMLFormElement>){
  event.preventDefault();
  const target=pendingUnlink;
  if(!target||confirmCode!==target.codigo||unlinking||linking)return;
  setUnlinking(true);setError('');setMessage('');
  try{
   const response=await fetch('/api/catalogo/topicos/'+encodeURIComponent(target.slug)+'/dashboards',{
    method:'DELETE',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({codigo:target.codigo,confirmar_codigo:confirmCode})
   });
   const data:{error?:string;result?:{permissoes_contextuais_revogadas?:number}}=await response.json();
   if(!response.ok){
    setError(data.error??'Não foi possível remover o dashboard do tópico.');
    return;
   }
   setItemsByTopic(old=>({...old,
     [target.slug]:(old[target.slug]??[]).filter(item=>item.codigo!==target.codigo)
   }));
   setPendingUnlink(null);setConfirmCode('');
   const revoked=data.result?.permissoes_contextuais_revogadas??0;
   setMessage('Dashboard removido deste tópico. Definição e dados originais preservados.'
    +(revoked>0?' Permissões contextuais revogadas: '+revoked+'.':''));
   await Promise.all([load(),loadDashboards(target.slug)]);
   window.dispatchEvent(new Event('dashboard-topics-updated'));
  }catch{setError('Não foi possível remover o dashboard do tópico.');}
  finally{setUnlinking(false);}
 }

 function startEdit(topico:Topico) {
  setEditingSlug(topico.slug);
  setEditName(callCenterTopicLabel(topico));
  setDeletingSlug(null);setConfirmSlug('');setMessage('');setError('');
 }
 function startDelete(topico:Topico) {
  setDeletingSlug(topico.slug);setConfirmSlug('');
  setEditingSlug(null);setMessage('');setError('');
 }
 async function updateTopic(event:FormEvent<HTMLFormElement>,slug:string) {
  event.preventDefault();
  if(mutating||!editName.trim())return;
  setMutating(true);setError('');setMessage('');
  try {
   const response=await fetch('/api/catalogo/topicos/'+encodeURIComponent(slug),{
    method:'PATCH',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({nome:editName.trim()})
   });
   const data:{error?:string}=await response.json();
   if(!response.ok){setError(data.error??'Não foi possível atualizar o tópico.');return;}
   setEditingSlug(null);setMessage('Tópico atualizado. O endereço e as permissões foram preservados.');
   await load();window.dispatchEvent(new Event('dashboard-topics-updated'));
  }catch{setError('Não foi possível atualizar o tópico.');}finally{setMutating(false);}
 }
 async function deleteTopic(event:FormEvent<HTMLFormElement>,slug:string) {
  event.preventDefault();
  if(mutating||confirmSlug!==slug)return;
  setMutating(true);setError('');setMessage('');
  try{
   const response=await fetch('/api/catalogo/topicos/'+encodeURIComponent(slug),{
    method:'DELETE',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({confirmar_slug:slug})
   });
   const data:{error?:string}=await response.json();
   if(!response.ok){setError(data.error??'Não foi possível excluir o tópico.');return;}
   setDeletingSlug(null);setConfirmSlug('');setOpened(null);setItemsByTopic({});
   setMessage('Tópico excluído; dashboards e dados operacionais foram preservados.');
   await load();window.dispatchEvent(new Event('dashboard-topics-updated'));
  }catch{setError('Não foi possível excluir o tópico.');}finally{setMutating(false);}
 }

 return <section className="panel manage-topics" aria-label="Gerenciar tópicos">
  <div className="panel-head">
   <div>
    <h2>Gerenciar tópicos</h2>
    <p>Organize os tópicos de Meus Dashboards. O acesso começa sempre restrito.</p>
   </div>
   <button type="button" className="outline-button" disabled={loading} onClick={()=>void load()}>
    <RefreshCw size={16}/> Atualizar
   </button>
  </div>
  <div className="manage-topics-content">
   <div className="notice">
    <ShieldCheck size={17}/>
    <span>Somente administradores podem criar, editar e excluir tópicos. Alterar o nome preserva links e permissões; excluir remove apenas o tópico e seus vínculos.</span>
   </div>
   {error&&<div role="alert" className="topic-message topic-error">{error}
    {!ready&&<p>Se a estrutura ainda não foi instalada, o cadastro permanecerá indisponível até a validação do banco.</p>}
   </div>}
   {message&&<p role="status" className="topic-message topic-success">{message}</p>}
   <form className="topic-create-form" onSubmit={create}>
    <label htmlFor="topic-name">Nome do novo tópico</label>
    <div className="topic-create-row">
     <input id="topic-name" value={name} onChange={e=>setName(e.target.value)}
      placeholder="Ex.: Call Center" maxLength={120} required disabled={!ready||saving}/>
     <button type="submit" className="primary-button"
      disabled={!ready||saving||!name.trim()}>
      {saving?<LoaderCircle size={16}/>:<FolderPlus size={16}/>}
      {saving?'Criando...':'Criar tópico'}
     </button>
    </div>
    <small>O tópico será criado sem permissões para gerentes ou usuários comuns.</small>
   </form>
   <div className="topic-list-header">
    <h3>Tópicos cadastrados</h3>
    <span className="subtle-pill">{ready?topicos.length:0} tópicos</span>
   </div>
   {loading?<p className="topic-empty" role="status">Carregando catálogo...</p>
   :ready&&topicos.length===0?<p className="topic-empty">Nenhum tópico cadastrado.</p>
   :ready&&<div className="topic-list">
     {topicos.map(t=><div className="topic-list-group" key={t.id}>
      <button type="button" className="topic-list-item topic-toggle" onClick={()=>toggleTopic(t.slug)} aria-expanded={opened===t.slug} aria-controls={`topic-details-${t.slug}`}>
       <Folder size={19}/>
       <span className="topic-list-info"><strong>{callCenterTopicLabel(t)}</strong><small>{t.quantidade_dashboards} {t.quantidade_dashboards===1?'dashboard associado':'dashboards associados'}</small></span>
       <span className="subtle-pill">#{t.posicao+1}</span>
       <ChevronDown size={16} className={opened===t.slug?'topic-chevron expanded':'topic-chevron'}/>
      </button>
      <div className="topic-action-buttons">
       <button type="button" className="outline-button" onClick={()=>startEdit(t)} disabled={mutating||saving}><Pencil size={14}/> Editar</button>
       <button type="button" className="outline-button topic-delete-button" onClick={()=>startDelete(t)} disabled={mutating||saving}><Trash2 size={14}/> Excluir</button>
      </div>
      {editingSlug===t.slug&&<form className="topic-inline-form" onSubmit={event=>void updateTopic(event,t.slug)}>
       <label htmlFor={`edit-topic-${t.slug}`}>Nome do tópico (endereço e permissões não mudam)</label>
       <div className="topic-create-row">
        <input id={`edit-topic-${t.slug}`} value={editName} required minLength={1} maxLength={120}
         onChange={event=>setEditName(event.target.value)} disabled={mutating}/>
        <button type="submit" className="primary-button" disabled={mutating||!editName.trim()}><Save size={15}/> Salvar</button>
        <button type="button" className="outline-button" disabled={mutating} onClick={()=>setEditingSlug(null)}><X size={15}/> Cancelar</button>
       </div>
      </form>}
      {deletingSlug===t.slug&&<form className="topic-delete-confirm" onSubmit={event=>void deleteTopic(event,t.slug)}>
       <strong>Excluir definitivamente o tópico {callCenterTopicLabel(t)}?</strong>
       <p>Serão desfeitos {t.quantidade_dashboards} vínculos de dashboards e as permissões deste tópico. Os dashboards originais e dados de chamadas serão preservados.</p>
       <label htmlFor={`delete-topic-${t.slug}`}>Digite <b>{t.slug}</b> para confirmar</label>
       <div className="topic-create-row">
        <input id={`delete-topic-${t.slug}`} value={confirmSlug} autoComplete="off"
         onChange={event=>setConfirmSlug(event.target.value)} disabled={mutating}/>
        <button type="submit" className="primary-button" disabled={mutating||confirmSlug!==t.slug}><Trash2 size={15}/> Confirmar exclusão</button>
        <button type="button" className="outline-button" disabled={mutating} onClick={()=>setDeletingSlug(null)}>Cancelar</button>
       </div>
      </form>}
      {opened===t.slug&&<div id={`topic-details-${t.slug}`} className="topic-details">
       <div className="topic-details-header">
        <strong>Dashboards deste tópico</strong>
        <Link href={`/meus-dashboards/${t.slug}`} className="outline-button">Abrir tópico</Link>
       </div>
       {loadingTopic?<p role="status">Carregando dashboards...</p>
       :<>
        {(itemsByTopic[t.slug]??[]).length===0
         ?<p>Nenhum dashboard associado.</p>
         :<ul className="topic-dashboard-items">
          {(itemsByTopic[t.slug]??[]).map(d=><li key={d.codigo} className="topic-dashboard-entry">
           <div className="topic-dashboard-row">
            <Link href={`/meus-dashboards/${t.slug}?dashboard=${d.codigo}`}>{d.nome}</Link>
            <div className="topic-dashboard-entry-actions">
             <small>{d.estado}</small>
             <button type="button" className="outline-button topic-unlink-button"
              onClick={()=>prepareUnlink(t.slug,d)} disabled={unlinking||!!linking||loadingTopic}
              aria-label={`Remover ${d.nome} do tópico ${callCenterTopicLabel(t)}`}>
              <Unlink size={14}/> Remover
             </button>
            </div>
           </div>
           {pendingUnlink?.slug===t.slug&&pendingUnlink.codigo===d.codigo&&
            <form className="topic-unlink-confirm" onSubmit={event=>void unlinkDashboard(event)}>
             <strong>Remover “{d.nome}” apenas de {callCenterTopicLabel(t)}?</strong>
             <p>O dashboard continuará disponível para outros tópicos. Permissões individuais ligadas a este vínculo serão revogadas. Nenhum gráfico ou dado operacional será apagado.</p>
             <label htmlFor={`unlink-${t.slug}-${d.codigo}`}>Digite <b>{d.codigo}</b> para confirmar</label>
             <div className="topic-create-row">
              <input id={`unlink-${t.slug}-${d.codigo}`} value={confirmCode}
               onChange={event=>setConfirmCode(event.target.value)} disabled={unlinking}
               autoComplete="off" maxLength={100}/>
              <button type="submit" className="primary-button"
               disabled={unlinking||confirmCode!==d.codigo}><Unlink size={14}/>
               {unlinking?'Removendo...':'Confirmar remoção'}</button>
              <button type="button" className="outline-button" disabled={unlinking}
               onClick={()=>{setPendingUnlink(null);setConfirmCode('');}}>Cancelar</button>
             </div>
            </form>}
          </li>)}
         </ul>}
        <div className="topic-association-options">
         <strong>Adicionar dashboard existente</strong>
         {existingDashboards.filter(d=>!(itemsByTopic[t.slug]??[]).some(current=>current.codigo===d.codigo)).map(d=>
           <button type="button" key={d.codigo} className="outline-button"
            onClick={()=>void associate(t.slug,d.codigo)} disabled={!!linking||loadingTopic}>
            <Link2 size={15}/> {linking===d.codigo?'Associando...':d.nome}
           </button>
         )}
         {existingDashboards.every(d=>(itemsByTopic[t.slug]??[]).some(current=>current.codigo===d.codigo))
           &&<small>Todos os dashboards existentes estão associados.</small>}
        </div>
       </>}
      </div>}
     </div>)}
   </div>}
  </div>
 </section>;
}
