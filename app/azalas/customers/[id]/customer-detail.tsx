"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {createClient} from "@/lib/supabase/client";
import {dt,money} from "@/lib/azalas/format";
import {Msg,Loading} from "@/components/ui";
import DebtSlipPanel from "./debt-slip-panel";

type Customer={id:number;customer_code:string;name:string;phone:string|null;address:string|null;transport_station:string|null;transport_phone:string|null};
type Group={id:number;root_code:string;created_at:string;order_type:string};
type Bill={id:number;invoice_code:string;status:string;subtotal:number;finalized_at:string|null};
export default function CustomerDetail({customerId}:{customerId:number}){
 const sb=useMemo(()=>createClient(),[]);
 const [c,setC]=useState<Customer|null>(null),[groups,setGroups]=useState<Group[]>([]),[bills,setBills]=useState<Bill[]>([]);
 const [balance,setBalance]=useState(0),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[err,setErr]=useState(""),[ok,setOk]=useState("");
 const load=useCallback(async()=>{setLoading(true);const [{data:cc,error:e},{data:g},{data:b},{data:debt,error:de}]=await Promise.all([
  sb.from("az_customers").select("id,customer_code,name,phone,address,transport_station,transport_phone").eq("id",customerId).single(),
  sb.from("order_groups").select("id,root_code,created_at,order_type").eq("customer_id",customerId).order("created_at",{ascending:false}).limit(50),
  sb.from("invoices").select("id,invoice_code,status,subtotal,finalized_at").eq("customer_id",customerId).order("created_at",{ascending:false}).limit(50),
  sb.rpc("az_customer_balance",{p_customer_id:customerId})
 ]);if(e||de)setErr(e?.message||de?.message||"");else setErr("");setC(cc as Customer);setGroups((g||[]) as Group[]);setBills((b||[]) as Bill[]);setBalance(Number(debt)||0);setLoading(false)},[sb,customerId]);
 useEffect(()=>{void load()},[load]);
 async function save(){if(!c)return;setBusy(true);setErr("");const {error:e}=await sb.rpc("az_update_customer",{p_id:c.id,p_name:c.name,p_phone:c.phone||"",p_address:c.address||"",p_transport_station:c.transport_station||"",p_transport_phone:c.transport_phone||""});setBusy(false);if(e)setErr(e.message);else{setOk("Đã cập nhật thông tin khách. Đơn cũ giữ snapshot ban đầu.");await load()}}
 if(loading)return <Loading/>;if(!c)return <Msg error={err||"Không tìm thấy khách"}/>;
 const fields=[['name','Tên khách hàng'],['phone','Số điện thoại'],['address','Địa chỉ'],['transport_station','Chành xe'],['transport_phone','SĐT chành xe']] as const;
 return <div className="stack"><Msg error={err} success={ok}/><section className="panel grid gap-4 lg:grid-cols-[1fr_260px] lg:items-center"><div><div className="eyebrow">KHÁCH HÀNG</div><h2 className="mt-2 text-3xl font-black">{c.name}</h2><p className="muted mt-1 text-sm">{c.customer_code} · {c.phone||"Chưa có số điện thoại"}</p></div><div className="rounded-2xl border border-red-100 bg-red-50/50 p-4"><p className="muted text-xs font-bold">{balance<0?"KHÁCH DƯ TIỀN":"NỢ HIỆN TẠI"}</p><div className="mt-2 text-3xl font-black text-red-600">{money(Math.abs(balance))}</div></div></section>
 <DebtSlipPanel customerId={c.id} customerName={c.name} balance={balance} onSaved={load}/>
 <div className="grid gap-4 lg:grid-cols-2"><section className="panel stack"><h2>Thông tin khách hàng</h2>{fields.map(([k,l])=><label key={k}>{l}{k==='address'?<textarea className="field mt-2" value={c[k]||""} rows={2} onChange={e=>setC(v=>v?{...v,[k]:e.target.value}:v)}/>:<input className="field mt-2" value={c[k]||""} onChange={e=>setC(v=>v?{...v,[k]:e.target.value}:v)}/>}</label>)}<button className="btn primary" disabled={busy} onClick={()=>void save()}>Lưu thay đổi thông tin</button></section><section className="panel stack"><h2>Hóa đơn gần đây</h2>{bills.length?bills.map(b=><Link className="flex justify-between rounded-xl border p-3" href={`/azalas/invoices/${b.id}`} key={b.id}><span>{b.invoice_code} · {b.status}{b.finalized_at&&<small className="muted block">{dt(b.finalized_at)}</small>}</span><b>{money(b.subtotal)}</b></Link>):<p className="muted text-sm">Chưa có hóa đơn.</p>}</section></div>
 <section className="panel stack"><h2>Đơn hàng của khách</h2>{groups.map(g=><div className="flex items-center justify-between rounded-xl border p-3" key={g.id}><div><b>{g.root_code}</b><p className="muted text-xs">{g.order_type} · {dt(g.created_at)}</p></div><Link className="btn soft" href="/azalas/orders">Chi tiết đơn</Link></div>)}</section></div>;
}
