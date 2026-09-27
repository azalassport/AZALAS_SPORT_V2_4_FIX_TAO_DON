"use client";
import Link from "next/link";
import {useCallback,useEffect,useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {createClient} from "@/lib/supabase/client";
import {dt,money,norm} from "@/lib/azalas/format";
import {Msg,Tabs,Loading,ImageViewer} from "@/components/ui";
type Ready={unit_id:number;order_code:string;customer_id:number;customer_name:string;warehouse_name:string;completed_at:string;packer_name:string;subtotal:number};
type Bill={id:number;invoice_code:string;customer_id:number;customer_name:string;status:string;subtotal:number;old_debt_snapshot:number;invoice_image_path:string|null;created_at:string;finalized_at:string|null;deleted_at:string|null};
export default function InvoicesBoard(){const sb=useMemo(()=>createClient(),[]),router=useRouter();
 const [tab,setTab]=useState("CHUA_GUI"),[ready,setReady]=useState<Ready[]>([]),[bills,setBills]=useState<Bill[]>([]),[picked,setPicked]=useState<number[]>([]),[search,setSearch]=useState("");
 const [err,setErr]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[urlMap,setUrlMap]=useState<Record<number,string>>({});
 const refresh=useCallback(async()=>{setLoading(true);setErr("");const [{data:r,error:re},{data:b,error:be}]=await Promise.all([
  sb.rpc("az_invoice_ready_units"),sb.from("invoices").select("id,invoice_code,customer_id,customer_name,status,subtotal,old_debt_snapshot,invoice_image_path,created_at,finalized_at,deleted_at").order("created_at",{ascending:false}).limit(250)]);
  if(re||be)setErr(re?.message||be?.message||"");setReady((r||[]) as Ready[]);setBills((b||[]) as Bill[]);setLoading(false);
 },[sb]);useEffect(()=>{void refresh()},[refresh]);
 useEffect(()=>{const active=bills.filter(b=>b.invoice_image_path&&!urlMap[b.id]).slice(0,40);if(!active.length)return;let live=true;
  (async()=>{const pairs=await Promise.all(active.map(async b=>{const {data}=await sb.storage.from("az-invoice-images").createSignedUrl(b.invoice_image_path!,1800);return [b.id,data?.signedUrl||""] as const}));if(live)setUrlMap(m=>({...m,...Object.fromEntries(pairs)}))})();return()=>{live=false};
 },[bills,sb,urlMap]);
 function pick(r:Ready){setErr("");const first=ready.find(x=>picked.includes(x.unit_id));if(first&&first.customer_id!==r.customer_id&&!picked.includes(r.unit_id)){
  setErr("Chỉ chọn được đơn của cùng một khách. Các đơn không tick vẫn giữ nguyên trong danh sách.");return;}
  setPicked(v=>v.includes(r.unit_id)?v.filter(x=>x!==r.unit_id):[...v,r.unit_id]);
 }
 function pickAllCustomer(customerId:number){const first=ready.find(x=>picked.includes(x.unit_id));if(first&&first.customer_id!==customerId){setErr("Hãy bỏ chọn các đơn của khách đang chọn trước.");return;}
  const ids=ready.filter(r=>r.customer_id===customerId).map(r=>r.unit_id);setPicked(v=>Array.from(new Set([...v,...ids])));setErr("");
 }
 async function prepare(){if(!picked.length)return;setBusy(true);setErr("");const {data,error}=await sb.rpc("az_invoice_prepare",{p_unit_ids:picked});setBusy(false);
  if(error){setErr(error.message);return;}router.push(`/azalas/invoices/${(data as {invoice_id:number}).invoice_id}`);
 }
 const q=norm(search);const available=ready.filter(r=>norm(`${r.order_code} ${r.customer_name} ${r.warehouse_name}`).includes(q));
 const customers=Array.from(available.reduce((m,r)=>{m.set(r.customer_id,[...(m.get(r.customer_id)||[]),r]);return m;},new Map<number,Ready[]>()).entries());
 const billsFiltered=bills.filter(b=>(tab==="CHUA_GUI"?b.status==="CHUA_CHOT":tab==="DA_GUI"?b.status==="DA_GUI":b.status==="DA_XOA")&&norm(`${b.invoice_code} ${b.customer_name}`).includes(q));
 return <div className="stack"><Tabs items={[{value:"CHUA_GUI",label:"Chưa gửi đơn"},{value:"DA_GUI",label:"Đã gửi đơn"},{value:"DA_XOA",label:"Đã xóa đơn"}]} value={tab} onChange={setTab}/>
  <input className="field" placeholder="Tìm khách / mã đơn / mã hóa đơn..." value={search} onChange={e=>setSearch(e.target.value)}/><Msg error={err}/>{loading&&<Loading/>}
  {tab==="CHUA_GUI"&&!loading&&<section className="panel stack"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2>Đơn đã soạn · gom theo khách</h2><p className="muted mt-1 text-sm">Các đơn cùng khách được gom chung. Bấm “Mở nhóm” để chọn / bỏ tick bên trong; đơn không tick vẫn chờ, kể cả khi TX đã chốt và CK soạn sau.</p></div><button className="btn primary" disabled={!picked.length||busy} onClick={prepare}>{busy?"Đang lập...":`Lập hóa đơn (${picked.length} đơn đã tick)`}</button></div>
    {customers.length===0?<p className="muted">Chưa có đơn đã soạn phù hợp.</p>:customers.map(([id,rows])=><div key={id} className="rounded-2xl border border-blue-100 bg-[#f7fbff] p-3 sm:p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h3 className="font-extrabold text-blue-900">{rows[0].customer_name} · {rows.length} đơn chờ</h3><Link className="btn primary" href={`/azalas/invoices/customer/${id}`}>Mở nhóm và chọn đơn →</Link></div>
      <div className="grid gap-2 lg:grid-cols-2">{rows.map(r=><label key={r.unit_id} className={`cursor-pointer rounded-xl border bg-white p-4 ${picked.includes(r.unit_id)?"border-blue-500 shadow-sm":"border-slate-200"}`}>
       <div className="flex items-start gap-3"><input type="checkbox" className="mt-1 size-5" checked={picked.includes(r.unit_id)} onChange={()=>pick(r)}/><div className="min-w-0"><b className="break-all text-blue-900">{r.order_code}</b><p className="mt-1 font-semibold">{r.warehouse_name}</p><p className="muted text-xs">Soạn: {r.packer_name||"—"} · {dt(r.completed_at)}</p><p className="mt-2 text-lg font-black">{money(r.subtotal)}</p></div></div>
      </label>)}</div></div>)}
  </section>}
  {!loading&&billsFiltered.length>0&&<section className="panel stack"><h2>{tab==="DA_GUI"?"Ảnh các hóa đơn đã chốt":tab==="DA_XOA"?"Hóa đơn đã xóa":"Bản nháp hóa đơn chưa chốt"}</h2><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{billsFiltered.map(b=><article key={b.id} className="rounded-xl border p-4"><div className="flex justify-between gap-2"><Link href={`/azalas/invoices/${b.id}`} className="font-extrabold text-blue-800">{b.invoice_code}</Link><span className={`chip ${b.status==="DA_GUI"?"done":""}`}>{b.status}</span></div><p className="mt-2 font-semibold">{b.customer_name}</p><p className="muted text-xs">{dt(b.finalized_at||b.created_at)}</p><p className="my-3 text-lg font-black">{money(b.subtotal)}</p>{urlMap[b.id]&&<ImageViewer urls={[urlMap[b.id]]} label={b.invoice_code}/>}<Link className="btn soft mt-3 w-full" href={`/azalas/invoices/${b.id}`}>Xem chi tiết</Link></article>)}</div></section>}
  {!loading&&tab!=="CHUA_GUI"&&!billsFiltered.length&&<div className="panel muted">Chưa có hóa đơn phù hợp.</div>}
 </div>;
}
