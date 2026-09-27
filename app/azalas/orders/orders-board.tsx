"use client";
import Link from "next/link";
import { useCallback,useEffect,useMemo,useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { day } from "@/lib/azalas/format";
type Group={id:number;customer_name:string;order_type:"THUONG"|"KHACH_DAT";is_urgent:boolean;delivery_date:string|null;created_at:string;creator_note:string|null};
type Unit={id:number;group_id:number;warehouse_id:number|null;order_code:string;status:string;started_by_name:string|null;deferred_by_name:string|null;created_at:string};
type Warehouse={id:number;name:string;code:string};
type Tab="MOI"|"DANG_SOAN"|"NO_DON"|"KHACH_DAT";
const TABS:[Tab,string][]=[["MOI","Đơn Mới"],["DANG_SOAN","Đang Soạn"],["NO_DON","Đơn Nợ"],["KHACH_DAT","Khách Đặt"]];
export default function OrdersBoard(){
 const sb=useMemo(()=>createClient(),[]);
 const [groups,setGroups]=useState<Group[]>([]);const [units,setUnits]=useState<Unit[]>([]);const [warehouses,setWarehouses]=useState<Warehouse[]>([]);
 const [role,setRole]=useState("");const [tab,setTab]=useState<Tab>("MOI");const [search,setSearch]=useState("");const [error,setError]=useState("");const [loading,setLoading]=useState(true);const [busyId,setBusyId]=useState(0);
 const reload=useCallback(async()=>{
  setLoading(true);setError("");const {data:{user}}=await sb.auth.getUser();if(!user){setError("Chưa đăng nhập");setLoading(false);return;}
  const [{data:p},{data:g,error:ge},{data:w,error:we}]=await Promise.all([
   sb.from("az_profiles").select("role").eq("id",user.id).single(),
   sb.from("order_groups").select("id,customer_name,order_type,is_urgent,delivery_date,created_at,creator_note").order("created_at",{ascending:false}).limit(200),
   sb.from("az_warehouses").select("id,name,code")]);
  if(ge||we){setError(ge?.message||we?.message||"");setLoading(false);return;}
  const groupIds=(g||[]).map(x=>x.id);
  const {data:u,error:ue}=groupIds.length?await sb.from("order_units").select("id,group_id,warehouse_id,order_code,status,started_by_name,deferred_by_name,created_at").in("group_id",groupIds).order("created_at",{ascending:true}).limit(1000):{data:[] as Unit[],error:null};
  setRole(p?.role||"");setGroups(g||[]);setWarehouses(w||[]);setUnits((u||[]) as Unit[]);if(ue)setError(ue.message);setLoading(false);
 },[sb]);
 useEffect(()=>{void reload()},[reload]);
 const groupMap=new Map(groups.map(g=>[g.id,g]));const whMap=new Map(warehouses.map(w=>[w.id,w]));
 const visible=units.filter(u=>{const g=groupMap.get(u.group_id);if(!g)return false;
  if(tab==="KHACH_DAT") {if(g.order_type!=="KHACH_DAT"||u.status==="DA_XOA"||u.status==="DA_SOAN")return false;}
  else if(g.order_type!=="THUONG"||u.status!==tab)return false;
  const hay=`${u.order_code} ${g.customer_name} ${whMap.get(u.warehouse_id||-1)?.name||""}`.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
  return hay.includes(search.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase());
 }).sort((a,b)=>{const ga=groupMap.get(a.group_id)!;const gb=groupMap.get(b.group_id)!;
  return Number(gb.is_urgent)-Number(ga.is_urgent)||+new Date(a.created_at)-+new Date(b.created_at);
 });
 const whGroups=new Map<string,Unit[]>();for(const u of visible){const key=whMap.get(u.warehouse_id||-1)?.name||"Khách đặt";whGroups.set(key,[...(whGroups.get(key)||[]),u]);}
 async function act(id:number,action:"defer"|"delete"){
  if(!confirm(action==="delete"?"Xóa mềm đơn này?":"Chuyển đơn sang Nợ đơn?"))return;
  setBusyId(id);setError("");const {error:e}=action==="delete"?await sb.rpc("az_soft_delete_order",{p_unit_id:id,p_reason:"Xóa từ Chi tiết đơn"}):await sb.rpc("az_defer_order",{p_unit_id:id});
  if(e)setError(e.message);else await reload();setBusyId(0);
 }
 return <div className="space-y-5">
  <div className="flex flex-wrap gap-2">{TABS.map(([code,label])=><button key={code} onClick={()=>setTab(code)} className={`rounded-xl px-4 py-3 font-semibold ${tab===code?"bg-blue-700 text-white":"border bg-white text-slate-700"}`}>{label}</button>)}</div>
  <input className="w-full rounded-xl border bg-white p-3 text-base" placeholder="Tìm tên khách / mã đơn / kho" value={search} onChange={e=>setSearch(e.target.value)}/>
  {error&&<p className="rounded-xl bg-red-50 p-3 text-red-800">{error}</p>}{loading&&<p>Đang tải đơn...</p>}
  {!loading&&visible.length===0&&<p className="rounded-xl border bg-white p-6 text-slate-500">Không có đơn phù hợp.</p>}
  {Array.from(whGroups.entries()).map(([warehouse,rows])=><section key={warehouse} className="space-y-3">
   <h2 className="rounded-xl bg-blue-100 px-4 py-3 text-xl font-extrabold text-blue-900">{warehouse} · {rows.length} đơn</h2>
   <div className="grid gap-3 md:grid-cols-2">{rows.map(u=>{const g=groupMap.get(u.group_id)!;return <article key={u.id} className="rounded-2xl border bg-white p-4 shadow-sm">
    <div className="flex items-start justify-between gap-2"><b className="break-all text-blue-900">{u.order_code}</b>{g.is_urgent&&<span className="rounded bg-red-100 px-2 py-1 text-xs font-extrabold text-red-700">🔥 GẤP</span>}</div>
    <p className="mt-2 text-lg font-bold">{g.customer_name}</p><p className="text-sm text-slate-600">Ngày giao: {g.delivery_date?day(g.delivery_date):"Chưa chọn"}</p>
    {u.status==="DANG_SOAN"&&<p className="mt-1 text-sm text-orange-700">Người soạn: {u.started_by_name||"Chưa rõ"}</p>}
    {u.status==="NO_DON"&&<p className="mt-1 text-sm text-orange-700">Người chuyển nợ: {u.deferred_by_name||"Chưa rõ"}</p>}
    <div className="mt-4 flex flex-wrap gap-2"><Link href={`/azalas/orders/${u.id}/pack`} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-bold text-white">{u.status==="DANG_SOAN"?"Soạn tiếp":u.status==="NO_DON"?"Bắt đầu soạn lại":"Xem đơn / Bắt đầu soạn"}</Link>
     {u.status!=="NO_DON"&&<button disabled={busyId===u.id} onClick={()=>act(u.id,"defer")} className="rounded-lg border px-3 py-2 text-sm">Nợ đơn</button>}
     {(role==="OWNER"||role==="ADMIN")&&<button disabled={busyId===u.id} onClick={()=>act(u.id,"delete")} className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-700">Xóa mềm</button>}
    </div>
   </article>})}</div>
  </section>)}
  <p className="text-xs text-slate-500">Bản TEST hiển thị tối đa 200 nhóm đơn gần nhất. Danh sách Hóa đơn sẽ lấy riêng các đơn ĐÃ SOẠN chưa chốt.</p>
 </div>;
}
