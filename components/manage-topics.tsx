'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { FolderPlus, Folder, LoaderCircle, RefreshCw, ShieldCheck } from 'lucide-react';

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
  }catch{
   setError('Não foi possível salvar o tópico.');
  }finally{setSaving(false);}
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
    <span>Somente administradores criam tópicos. Gráficos e dashboards serão associados em uma próxima etapa.</span>
   </div>
   {error&&<div role="alert" className="topic-message topic-error">{error}
    {!ready&&<p>Se a estrutura ainda não foi instalada, o cadastro permanecerá indisponível até a validação do banco.</p>}
   </div>}
   {message&&<p role="status" className="topic-message topic-success">{message}</p>}
   <form className="topic-create-form" onSubmit={create}>
    <label htmlFor="topic-name">Nome do novo tópico</label>
    <div className="topic-create-row">
     <input id="topic-name" value={name} onChange={e=>setName(e.target.value)}
      placeholder="Ex.: Relatórios" maxLength={120} required disabled={!ready||saving}/>
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
     {topicos.map(t=><div className="topic-list-item" key={t.id}>
      <Folder size={19}/>
      <div><strong>{t.nome}</strong><small>{t.quantidade_dashboards} {t.quantidade_dashboards===1?'dashboard associado':'dashboards associados'}</small></div>
      <span className="subtle-pill">#{t.posicao+1}</span>
     </div>)}
   </div>}
  </div>
 </section>;
}
