"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loading, Msg } from "@/components/ui";
import { money, vnToday } from "@/lib/azalas/format";
import AccountManager from "@/components/account-manager";

type Role = "OWNER" | "ADMIN" | "MEMBER";
type Staff = {
  id:number; display_name:string; phone:string|null; status:"DANG_LAM"|"DA_NGHI";
  position:string; daily_rate:number; join_date:string; profile_id:string|null; created_at:string;
};
type Profile = { id:string; role:Role; is_active:boolean };
type Attendance = {
  id:number; staff_id:number; month_key:string; work_days:number; overtime_hours:number; bonus:number;
  created_at:string; updated_at:string;
};
type Advance = {
  id:number; advance_code:string|null; staff_id:number; advance_date:string; amount:number; reason:string|null;
  created_at:string; updated_at:string; deleted_at:string|null;
};
type Rate = { id:number; staff_id:number; effective_date:string; daily_rate:number; created_at:string };
type Tab = "CONG"|"UNG"|"SUA"|"BAO_CAO"|"DS"|"TAI_KHOAN";
type EditStaff = { id:number; name:string; phone:string; status:"DANG_LAM"|"DA_NGHI" };

type ReportMode = "CA_NHAN"|"TONG_QUAT";
type EditMode = "GIA"|"CONG"|"UNG";

const currentMonth = () => new Date().toISOString().slice(0,7);
const monthLabel = (v:string) => { const [y,m]=v.split("-"); return m&&y?`${m}/${y}`:v; };
const dayLabel = (v:string) => v ? new Date(`${v}T00:00:00`).toLocaleDateString("vi-VN") : "—";
const num = (v:string|number|null|undefined) => Number(String(v??0).replace(",",".")) || 0;
const reportMoney = (v:number) => `${Math.round(Number(v)||0).toLocaleString("vi-VN")}đ`;
const reportNum = (v:number) => (Number(v)||0).toLocaleString("vi-VN",{maximumFractionDigits:2});
const monthRange = (from:string,to:string) => {
  const out:string[]=[]; if(!from||!to||from>to) return out;
  let [y,m]=from.split("-").map(Number); const [ey,em]=to.split("-").map(Number);
  while(y<ey || (y===ey&&m<=em)){ out.push(`${y}-${String(m).padStart(2,"0")}`); m++; if(m===13){m=1;y++;} }
  return out;
};

export default function StaffCenter(){
  const sb=useMemo(()=>createClient(),[]);
  const [role,setRole]=useState<Role|"">("");
  const [tab,setTab]=useState<Tab>("CONG");
  const [staff,setStaff]=useState<Staff[]>([]);
  const [profiles,setProfiles]=useState<Record<string,Profile>>({});
  const [attendance,setAttendance]=useState<Attendance[]>([]);
  const [advances,setAdvances]=useState<Advance[]>([]);
  const [rates,setRates]=useState<Rate[]>([]);
  const [loading,setLoading]=useState(true); const [busy,setBusy]=useState(false);
  const [err,setErr]=useState(""); const [ok,setOk]=useState("");

  const [showAdd,setShowAdd]=useState(false);
  const [editStaff,setEditStaff]=useState<EditStaff|null>(null);
  const [staffForm,setStaffForm]=useState({name:"",phone:"",join_date:vnToday(),daily_rate:""});
  const [query,setQuery]=useState("");

  const [congForm,setCongForm]=useState({staff_id:"",month:currentMonth(),work_days:"",overtime:"",bonus:""});
  const [ungForm,setUngForm]=useState({staff_id:"",date:vnToday(),amount:"",reason:""});
  const [ungMonth,setUngMonth]=useState(currentMonth());

  const [editMode,setEditMode]=useState<EditMode>("GIA");
  const [rateForm,setRateForm]=useState({staff_id:"",date:vnToday(),rate:""});
  const [attEdit,setAttEdit]=useState({staff_id:"",month:currentMonth(),work_days:"",overtime:"",bonus:""});
  const [advanceEdit,setAdvanceEdit]=useState<Advance|null>(null);
  const [advanceEditAmount,setAdvanceEditAmount]=useState("");
  const [advanceEditReason,setAdvanceEditReason]=useState("");

  const [reportMode,setReportMode]=useState<ReportMode>("CA_NHAN");
  const [reportStaff,setReportStaff]=useState("");
  const [reportFrom,setReportFrom]=useState(currentMonth());
  const [reportTo,setReportTo]=useState(currentMonth());
  const [showReport,setShowReport]=useState(false);
  const reportWorkRef=useRef<HTMLDivElement|null>(null);
  const reportAdvanceRef=useRef<HTMLDivElement|null>(null);

  const manager=role==="OWNER"||role==="ADMIN";
  const activeStaff=useMemo(()=>staff.filter(x=>x.status==="DANG_LAM"),[staff]);
  const staffMap=useMemo(()=>new Map(staff.map(x=>[x.id,x])),[staff]);

  const reload=useCallback(async()=>{
    setLoading(true); setErr("");
    try{
      const {data:{user}}=await sb.auth.getUser(); if(!user) throw new Error("Vui lòng đăng nhập lại.");
      const {data:me,error:meError}=await sb.from("az_profiles").select("role").eq("id",user.id).single();
      if(meError) throw meError;
      const r=String(me?.role||"") as Role; setRole(r);
      if(r!=="OWNER"&&r!=="ADMIN"){setLoading(false);return;}
      const [s,p,a,u,g]=await Promise.all([
        sb.from("az_staff").select("id,display_name,phone,status,position,daily_rate,join_date,profile_id,created_at").order("status").order("display_name").limit(1000),
        sb.from("az_profiles").select("id,role,is_active").limit(1000),
        sb.from("az_staff_attendance").select("id,staff_id,month_key,work_days,overtime_hours,bonus,created_at,updated_at").order("month_key",{ascending:false}).limit(5000),
        sb.from("az_staff_advances").select("id,advance_code,staff_id,advance_date,amount,reason,created_at,updated_at,deleted_at").is("deleted_at",null).order("advance_date",{ascending:false}).limit(5000),
        sb.from("az_staff_rate_history").select("id,staff_id,effective_date,daily_rate,created_at").order("effective_date",{ascending:false}).limit(5000),
      ]);
      const e=[s,p,a,u,g].find(x=>x.error)?.error; if(e) throw e;
      setStaff((s.data||[]) as Staff[]); setProfiles(Object.fromEntries(((p.data||[]) as Profile[]).map(x=>[x.id,x])));
      setAttendance((a.data||[]) as Attendance[]); setAdvances((u.data||[]) as Advance[]); setRates((g.data||[]) as Rate[]);
    }catch(e){setErr(e instanceof Error?e.message:String(e));}
    finally{setLoading(false);}
  },[sb]);
  useEffect(()=>{void reload();},[reload]);

  async function rpc(name:string,args:Record<string,unknown>){
    setBusy(true);setErr("");setOk("");
    const {error}=await sb.rpc(name,args); setBusy(false); if(error){setErr(error.message);return false;} return true;
  }

  async function addStaff(){
    if(!staffForm.name.trim()||!staffForm.join_date||staffForm.daily_rate.trim()==="")return setErr("Vui lòng nhập đủ Tên, Ngày vào và Giá công.");
    const rate=num(staffForm.daily_rate); if(rate<0)return setErr("Giá công không hợp lệ.");
    if(await rpc("az_staff_create",{p_display_name:staffForm.name.trim(),p_phone:staffForm.phone.trim()||null,p_join_date:staffForm.join_date,p_daily_rate:rate})){
      setStaffForm({name:"",phone:"",join_date:vnToday(),daily_rate:""});setShowAdd(false);setOk("Đã thêm nhân viên.");await reload();
    }
  }
  async function saveStaffEdit(){
    if(!editStaff)return;
    if(await rpc("az_staff_update",{p_staff_id:editStaff.id,p_phone:editStaff.phone.trim()||null,p_status:editStaff.status})){
      setEditStaff(null);setOk("Đã cập nhật nhân viên.");await reload();
    }
  }
  async function saveAttendance(){
    if(!congForm.staff_id||!congForm.month||congForm.work_days.trim()==="")return setErr("Vui lòng chọn nhân viên, tháng và nhập số công.");
    if(await rpc("az_staff_attendance_create",{p_staff_id:Number(congForm.staff_id),p_month_key:congForm.month,p_work_days:num(congForm.work_days),p_overtime_hours:num(congForm.overtime),p_bonus:num(congForm.bonus)})){
      setCongForm(v=>({...v,work_days:"",overtime:"",bonus:""}));setOk("Đã lưu chấm công.");await reload();
    }
  }
  async function saveAdvance(){
    if(!ungForm.staff_id||!ungForm.date||num(ungForm.amount)<=0)return setErr("Vui lòng chọn nhân viên, ngày ứng và số tiền.");
    if(await rpc("az_staff_advance_create",{p_staff_id:Number(ungForm.staff_id),p_advance_date:ungForm.date,p_amount:num(ungForm.amount),p_reason:ungForm.reason.trim()||null})){
      setUngForm(v=>({...v,amount:"",reason:""}));setOk("Đã lưu phiếu ứng.");await reload();
    }
  }
  async function saveRate(){
    if(!rateForm.staff_id||!rateForm.date||rateForm.rate.trim()==="")return setErr("Vui lòng chọn nhân viên, ngày áp dụng và giá công.");
    if(await rpc("az_staff_rate_set",{p_staff_id:Number(rateForm.staff_id),p_effective_date:rateForm.date,p_daily_rate:num(rateForm.rate)})){
      setRateForm(v=>({...v,rate:""}));setOk("Đã lưu mức giá công mới.");await reload();
    }
  }
  async function updateAttendance(){
    if(!attEdit.staff_id||!attEdit.month)return setErr("Vui lòng chọn nhân viên và tháng cần sửa.");
    if(attEdit.work_days===""&&attEdit.overtime===""&&attEdit.bonus==="")return setErr("Nhập ít nhất một ô cần sửa.");
    if(await rpc("az_staff_attendance_update",{
      p_staff_id:Number(attEdit.staff_id),p_month_key:attEdit.month,
      p_work_days:attEdit.work_days===""?null:num(attEdit.work_days),
      p_overtime_hours:attEdit.overtime===""?null:num(attEdit.overtime),
      p_bonus:attEdit.bonus===""?null:num(attEdit.bonus),
    })){
      setAttEdit(v=>({...v,work_days:"",overtime:"",bonus:""}));setOk("Đã sửa phiếu công.");await reload();
    }
  }
  async function saveAdvanceEdit(){
    if(!advanceEdit)return;
    if(await rpc("az_staff_advance_update",{p_id:advanceEdit.id,p_advance_date:advanceEdit.advance_date,p_amount:num(advanceEditAmount),p_reason:advanceEditReason})){
      setAdvanceEdit(null);setOk("Đã sửa phiếu ứng.");await reload();
    }
  }
  async function deleteAdvance(id:number){
    if(!confirm("Xóa phiếu ứng này?"))return;
    if(await rpc("az_staff_advance_delete",{p_id:id})){setOk("Đã xóa phiếu ứng.");await reload();}
  }

  function rateAt(staffId:number,month:string){
    const target=`${month}-28`;
    const list=rates.filter(x=>x.staff_id===staffId).sort((a,b)=>b.effective_date.localeCompare(a.effective_date));
    const found=list.find(x=>x.effective_date<=target); if(found)return Number(found.daily_rate);
    return list.length?Number(list[list.length-1].daily_rate):Number(staffMap.get(staffId)?.daily_rate||0);
  }
  function advanceFor(staffId:number,month:string){return advances.filter(x=>x.staff_id===staffId&&x.advance_date.slice(0,7)===month).reduce((s,x)=>s+Number(x.amount),0);}
  function attendanceFor(staffId:number,month:string){return attendance.find(x=>x.staff_id===staffId&&x.month_key===month);}
  function calc(staffId:number,month:string){
    const a=attendanceFor(staffId,month), rate=rateAt(staffId,month), ung=advanceFor(staffId,month);
    const work=a?Number(a.work_days):0, ot=a?Number(a.overtime_hours):0, bonus=a?Number(a.bonus):0;
    const otMoney=ot*30, gross=a?(work*rate)+otMoney+bonus:0; return {a,rate,work,ot,bonus,otMoney,gross,ung,left:gross-ung};
  }

  async function copyReportImage(target: HTMLDivElement | null, part: "cong-luong"|"ung-luong"){
    if(!target)return;
    setErr("");setOk("");
    try{
      const html2canvas=(await import("html2canvas")).default;
      const clone=target.cloneNode(true) as HTMLDivElement;
      clone.style.position="fixed"; clone.style.left="-10000px"; clone.style.top="0";
      clone.style.width="1180px"; clone.style.maxWidth="1180px"; clone.style.background="#ffffff";
      clone.style.padding="22px"; clone.style.borderRadius="0"; clone.style.boxShadow="none";
      document.body.appendChild(clone);
      const canvas=await html2canvas(clone,{backgroundColor:"#ffffff",scale:3,useCORS:true,logging:false});
      clone.remove();
      const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/png"));
      if(!blob)throw new Error("Không tạo được ảnh báo cáo.");
      if(navigator.clipboard&&"ClipboardItem" in window){
        await navigator.clipboard.write([new ClipboardItem({"image/png":blob})]);
        setOk(part==="cong-luong"?"Đã copy Ảnh 1 - Công lương. Có thể Ctrl+V sang Zalo.":"Đã copy Ảnh 2 - Ứng lương. Có thể Ctrl+V sang Zalo.");
      }else{
        const url=URL.createObjectURL(blob); const a=document.createElement("a");
        a.href=url; a.download=`bao-cao-${part}-${reportMode.toLowerCase()}-${reportFrom}-${reportTo}.png`; a.click();
        URL.revokeObjectURL(url); setOk("Trình duyệt không cho copy ảnh; đã tải PNG thay thế.");
      }
    }catch(e){setErr(e instanceof Error?e.message:String(e));}
  }


  const tabs:[Tab,string,string][]=[
    ["CONG","Nhập công","Ngày công, tăng ca và thưởng"],["UNG","Nhập ứng","Ghi nhận tiền ứng nhân viên"],
    ["SUA","Chỉnh sửa","Sửa giá công và phiếu sai"],["BAO_CAO","Báo cáo","Cá nhân và tổng quát xưởng"],
    ["DS","DS nhân viên","Hồ sơ và lịch sử lương"],["TAI_KHOAN","Tài khoản","Phân quyền và bảo mật"],
  ];

  if(loading)return <Loading/>;
  if(!manager)return <section className="panel"><Msg error="Chỉ OWNER/ADMIN được mở Trung tâm nhân sự."/></section>;

  const advancesMonth=advances.filter(x=>x.advance_date.slice(0,7)===ungMonth);
  const filtered=staff.filter(s=>`${s.display_name} ${s.phone||""}`.toLowerCase().includes(query.trim().toLowerCase()));
  const months=monthRange(reportFrom,reportTo);

  return <div className="stack">
    <Msg error={err} success={ok}/>
    <section className="panel stack">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><div className="text-xs font-extrabold tracking-widest text-blue-600">ĐIỀU HÀNH / NHÂN SỰ</div><h1 className="text-2xl font-extrabold">Trung tâm nhân sự</h1><p className="muted">Chấm công, ứng lương, báo cáo và phân quyền nhân viên trong một nơi.</p></div>
        <button className="btn primary" onClick={()=>setShowAdd(true)}>+ Thêm nhân viên</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {tabs.map(([k,t,s])=><button key={k} onClick={()=>setTab(k)} className={`rounded-2xl border p-4 text-left ${tab===k?"border-blue-500 bg-blue-50":"border-slate-200 bg-white"}`}><b className="block">{t}</b><span className="mt-1 block text-xs text-slate-500">{s}</span></button>)}
      </div>
    </section>

    {tab==="CONG"&&<section className="panel stack">
      <h2>Nhập công</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label>Tên Nhân Viên *<select className="field mt-2" value={congForm.staff_id} onChange={e=>setCongForm(v=>({...v,staff_id:e.target.value}))}><option value="">Chọn nhân viên</option>{activeStaff.map(s=><option key={s.id} value={s.id}>{s.display_name}</option>)}</select></label>
        <label>Tháng / Năm *<input type="month" className="field mt-2" value={congForm.month} onChange={e=>setCongForm(v=>({...v,month:e.target.value}))}/></label>
        <label>Số Công (Ngày) *<input inputMode="decimal" className="field mt-2" placeholder="Ví dụ: 23.3 hoặc 23,3" value={congForm.work_days} onChange={e=>setCongForm(v=>({...v,work_days:e.target.value}))}/></label>
        <label>Tăng Ca (Giờ)<input type="number" className="field mt-2" value={congForm.overtime} onChange={e=>setCongForm(v=>({...v,overtime:e.target.value}))}/></label>
        <label>Thưởng (VNĐ)<input type="number" className="field mt-2" value={congForm.bonus} onChange={e=>setCongForm(v=>({...v,bonus:e.target.value}))}/></label>
      </div>
      <button className="btn primary" disabled={busy} onClick={()=>void saveAttendance()}>XÁC NHẬN CHẤM CÔNG</button>
    </section>}

    {tab==="UNG"&&<div className="stack">
      <section className="panel stack"><h2>Nhập ứng</h2><div className="grid gap-3 md:grid-cols-2">
        <label>Tên Nhân Viên *<select className="field mt-2" value={ungForm.staff_id} onChange={e=>setUngForm(v=>({...v,staff_id:e.target.value}))}><option value="">Chọn nhân viên</option>{activeStaff.map(s=><option key={s.id} value={s.id}>{s.display_name}</option>)}</select></label>
        <label>Ngày Ứng *<input type="date" className="field mt-2" value={ungForm.date} onChange={e=>setUngForm(v=>({...v,date:e.target.value}))}/></label>
        <label>Số Tiền Ứng *<input type="number" className="field mt-2" value={ungForm.amount} onChange={e=>setUngForm(v=>({...v,amount:e.target.value}))}/></label>
        <label>Lý Do<input className="field mt-2" value={ungForm.reason} onChange={e=>setUngForm(v=>({...v,reason:e.target.value}))}/></label>
      </div><button className="btn primary" disabled={busy} onClick={()=>void saveAdvance()}>XÁC NHẬN CHO ỨNG</button></section>
      <section className="panel stack"><div className="flex flex-wrap items-center justify-between gap-3"><h2>Danh sách đã ứng</h2><input type="month" className="field max-w-xs" value={ungMonth} onChange={e=>setUngMonth(e.target.value)}/></div>
        <div className="az-table-wrap"><table className="az-table"><thead><tr><th>STT</th><th>Ngày</th><th>Nhân viên</th><th>Số tiền</th><th>Lý do</th></tr></thead><tbody>{advancesMonth.map((u,i)=><tr key={u.id}><td>{i+1}</td><td>{dayLabel(u.advance_date)}</td><td><b>{staffMap.get(u.staff_id)?.display_name||"—"}</b></td><td><b>{money(u.amount)}</b></td><td>{u.reason||"—"}</td></tr>)}</tbody></table></div>
      </section>
    </div>}

    {tab==="SUA"&&<section className="panel stack">
      <div className="flex flex-wrap gap-2"><button className={`btn ${editMode==="GIA"?"primary":"soft"}`} onClick={()=>setEditMode("GIA")}>Đổi Giá</button><button className={`btn ${editMode==="CONG"?"primary":"soft"}`} onClick={()=>setEditMode("CONG")}>Sửa Công</button><button className={`btn ${editMode==="UNG"?"primary":"soft"}`} onClick={()=>setEditMode("UNG")}>Sửa Ứng</button></div>
      {editMode==="GIA"&&<div className="stack"><h2>Cập Nhật Mức Lương Mới</h2><div className="grid gap-3 md:grid-cols-3"><label>Tên Nhân Viên *<select className="field mt-2" value={rateForm.staff_id} onChange={e=>setRateForm(v=>({...v,staff_id:e.target.value}))}><option value="">Chọn nhân viên</option>{staff.map(s=><option key={s.id} value={s.id}>{s.display_name}</option>)}</select></label><label>Ngày Bắt Đầu Áp Dụng *<input type="date" className="field mt-2" value={rateForm.date} onChange={e=>setRateForm(v=>({...v,date:e.target.value}))}/></label><label>Giá Công Mới *<input type="number" className="field mt-2" value={rateForm.rate} onChange={e=>setRateForm(v=>({...v,rate:e.target.value}))}/></label></div><button className="btn primary" onClick={()=>void saveRate()} disabled={busy}>LƯU GIÁ MỚI</button></div>}
      {editMode==="CONG"&&<div className="stack"><h2>Sửa Phiếu Chấm Công Bị Sai</h2><p className="muted">Chỉ nhập ô muốn thay đổi. Ô trống giữ nguyên dữ liệu cũ.</p><div className="grid gap-3 md:grid-cols-2"><label>Tên Nhân Viên *<select className="field mt-2" value={attEdit.staff_id} onChange={e=>setAttEdit(v=>({...v,staff_id:e.target.value}))}><option value="">Chọn nhân viên</option>{staff.map(s=><option key={s.id} value={s.id}>{s.display_name}</option>)}</select></label><label>Tháng / Năm *<input type="month" className="field mt-2" value={attEdit.month} onChange={e=>setAttEdit(v=>({...v,month:e.target.value}))}/></label><label>Số Công (Mới)<input className="field mt-2" value={attEdit.work_days} onChange={e=>setAttEdit(v=>({...v,work_days:e.target.value}))}/></label><label>Tăng Ca (Mới)<input type="number" className="field mt-2" value={attEdit.overtime} onChange={e=>setAttEdit(v=>({...v,overtime:e.target.value}))}/></label><label>Thưởng (Mới)<input type="number" className="field mt-2" value={attEdit.bonus} onChange={e=>setAttEdit(v=>({...v,bonus:e.target.value}))}/></label></div><button className="btn primary" onClick={()=>void updateAttendance()} disabled={busy}>LƯU THAY ĐỔI</button></div>}
      {editMode==="UNG"&&<div className="stack"><h2>Quản Lý & Sửa Phiếu Ứng</h2><div className="az-table-wrap"><table className="az-table"><thead><tr><th>Ngày</th><th>Nhân viên</th><th>Số tiền</th><th>Lý do</th><th>Thao tác</th></tr></thead><tbody>{advances.map(u=><tr key={u.id}><td>{dayLabel(u.advance_date)}</td><td>{staffMap.get(u.staff_id)?.display_name||"—"}</td><td>{money(u.amount)}</td><td>{u.reason||"—"}</td><td><div className="flex gap-2"><button className="btn soft" onClick={()=>{setAdvanceEdit(u);setAdvanceEditAmount(String(u.amount));setAdvanceEditReason(u.reason||"")}}>Sửa</button><button className="btn soft" onClick={()=>void deleteAdvance(u.id)}>Xóa</button></div></td></tr>)}</tbody></table></div></div>}
    </section>}

    {tab==="BAO_CAO"&&<section className="panel stack">
      <div className="flex flex-wrap gap-2"><button className={`btn ${reportMode==="CA_NHAN"?"primary":"soft"}`} onClick={()=>{setReportMode("CA_NHAN");setShowReport(false)}}>Cá Nhân</button><button className={`btn ${reportMode==="TONG_QUAT"?"primary":"soft"}`} onClick={()=>{setReportMode("TONG_QUAT");setShowReport(false)}}>Tổng Quát</button></div>
      <div className="grid gap-3 md:grid-cols-3">{reportMode==="CA_NHAN"&&<label>Tên Nhân Viên *<select className="field mt-2" value={reportStaff} onChange={e=>{setReportStaff(e.target.value);setShowReport(false)}}><option value="">Chọn nhân viên</option>{staff.map(s=><option key={s.id} value={s.id}>{s.display_name}</option>)}</select></label>}<label>Từ Tháng *<input type="month" className="field mt-2" value={reportFrom} onChange={e=>{setReportFrom(e.target.value);setShowReport(false)}}/></label><label>Đến Tháng *<input type="month" className="field mt-2" value={reportTo} onChange={e=>{setReportTo(e.target.value);setShowReport(false)}}/></label></div>
      <div className="flex flex-wrap gap-2">
        <button className="btn primary" onClick={()=>setShowReport(true)}>XEM BÁO CÁO</button>
        {showReport&&<><button className="btn soft" onClick={()=>void copyReportImage(reportWorkRef.current,"cong-luong")}>📸 COPY ẢNH 1 - CÔNG LƯƠNG</button><button className="btn soft" onClick={()=>void copyReportImage(reportAdvanceRef.current,"ung-luong")}>📸 COPY ẢNH 2 - ỨNG LƯƠNG</button></>}
      </div>

      {showReport&&reportMode==="CA_NHAN"&&reportStaff&&(()=>{
        const sid=Number(reportStaff); const person=staffMap.get(sid);
        const rows=months.map(m=>({m,...calc(sid,m)}));
        const totals=rows.reduce((t,r)=>({work:t.work+r.work,ot:t.ot+r.otMoney,bonus:t.bonus+r.bonus,gross:t.gross+r.gross,ung:t.ung+r.ung,left:t.left+r.left}),{work:0,ot:0,bonus:0,gross:0,ung:0,left:0});
        const detailAdv=advances.filter(u=>u.staff_id===sid&&u.advance_date.slice(0,7)>=reportFrom&&u.advance_date.slice(0,7)<=reportTo).sort((a,b)=>a.advance_date.localeCompare(b.advance_date));
        return <div className="space-y-5">
          <div ref={reportWorkRef} className="bg-white p-3" style={{fontFamily:"Arial, sans-serif",color:"#0f172a"}}>
            <div style={{border:"2px solid #07883f",borderRadius:16,padding:"16px 20px",textAlign:"center",marginBottom:16}}>
              <div style={{fontSize:14,fontWeight:800,color:"#64748b",letterSpacing:0.4}}>BÁO CÁO CÔNG LƯƠNG</div>
              <div style={{fontSize:28,fontWeight:900,color:"#07883f",lineHeight:1.15,textTransform:"uppercase"}}>{person?.display_name||"NHÂN VIÊN"}</div>
            </div>
            <div style={{fontSize:17,fontWeight:900,color:"#067a3a",marginBottom:8}}>▣ BẢNG 1 - CHI TIẾT CÔNG LƯƠNG</div>
            <div style={{overflow:"hidden",border:"1px solid #cbd5e1",boxShadow:"0 2px 8px rgba(15,23,42,.12)"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:15,textAlign:"center"}}>
                <thead><tr>{["Tháng","Số Công","Giá","Tăng Ca","Thưởng","Thành Tiền","Ứng","Còn Lại"].map(h=><th key={h} style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:"10px 8px",background:"#fff",fontWeight:900}}>{h}</th>)}</tr></thead>
                <tbody>{rows.map(r=><tr key={r.m}>
                  <td style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:"9px 8px",fontWeight:800}}>{monthLabel(r.m)}</td>
                  <td style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:"9px 8px",fontWeight:800}}>{r.a?reportNum(r.work):"-"}</td>
                  <td style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:"9px 8px",fontWeight:800}}>{r.a?reportNum(r.rate):"-"}</td>
                  <td style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:"9px 8px",fontWeight:800,color:"#d97706"}}>{r.a?reportNum(r.otMoney):"-"}</td>
                  <td style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:"9px 8px",fontWeight:800,color:"#0284c7"}}>{r.a?reportNum(r.bonus):"-"}</td>
                  <td style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:"9px 8px",fontWeight:900,color:"#06f"}}>{r.a?reportMoney(r.gross):"-"}</td>
                  <td style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:"9px 8px",fontWeight:900,color:"#ef4444"}}>{reportMoney(r.ung)}</td>
                  <td style={{borderBottom:"1px solid #cbd5e1",padding:"9px 8px",fontWeight:900,color:r.left>=0?"#07883f":"#ef4444"}}>{reportMoney(r.left)}</td>
                </tr>)}</tbody>
                <tfoot><tr>
                  <th style={{borderRight:"1px solid #cbd5e1",padding:"10px 8px",fontWeight:900}}>TỔNG CỘNG:</th>
                  <th style={{borderRight:"1px solid #cbd5e1",padding:"10px 8px",fontWeight:900,color:"#ef4444"}}>{reportNum(totals.work)}</th>
                  <th style={{borderRight:"1px solid #cbd5e1",padding:"10px 8px"}}>-</th>
                  <th style={{borderRight:"1px solid #cbd5e1",padding:"10px 8px",fontWeight:900,color:"#ef4444"}}>{reportMoney(totals.ot)}</th>
                  <th style={{borderRight:"1px solid #cbd5e1",padding:"10px 8px",fontWeight:900,color:"#ef4444"}}>{reportMoney(totals.bonus)}</th>
                  <th style={{borderRight:"1px solid #cbd5e1",padding:"10px 8px",fontWeight:900,color:"#ef4444"}}>{reportMoney(totals.gross)}</th>
                  <th style={{borderRight:"1px solid #cbd5e1",padding:"10px 8px",fontWeight:900,color:"#ef4444"}}>{reportMoney(totals.ung)}</th>
                  <th style={{padding:"10px 8px",fontWeight:900,color:totals.left>=0?"#07883f":"#ef4444"}}>{reportMoney(totals.left)}</th>
                </tr></tfoot>
              </table>
            </div>
          </div>

          <div ref={reportAdvanceRef} className="bg-white p-3" style={{fontFamily:"Arial, sans-serif",color:"#0f172a"}}>
            <div style={{fontSize:17,fontWeight:900,color:"#d97706",marginBottom:8}}>▣ BẢNG 2 - CHI TIẾT ỨNG LƯƠNG</div>
            <div style={{overflow:"hidden",border:"1px solid #cbd5e1",boxShadow:"0 2px 8px rgba(15,23,42,.12)"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:15}}>
                <thead><tr><th style={{width:"25%",borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:"10px",textAlign:"center",fontWeight:900}}>Ngày</th><th style={{width:"30%",borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:"10px",textAlign:"right",fontWeight:900}}>Số Tiền</th><th style={{borderBottom:"1px solid #cbd5e1",padding:"10px",textAlign:"left",fontWeight:900}}>Lý Do</th></tr></thead>
                <tbody>{detailAdv.length?detailAdv.map(u=><tr key={u.id}><td style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:"10px",textAlign:"center",fontWeight:800}}>{dayLabel(u.advance_date)}</td><td style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:"10px",textAlign:"right",fontWeight:900,color:"#ef4444"}}>{reportMoney(u.amount)}</td><td style={{borderBottom:"1px solid #cbd5e1",padding:"10px",fontWeight:700}}>{u.reason||"Không ghi lý do"}</td></tr>):<tr><td colSpan={3} style={{padding:"18px",textAlign:"center",color:"#64748b"}}>Không có phiếu ứng trong thời gian này.</td></tr>}</tbody>
              </table>
            </div>
          </div>
        </div>;
      })()}

      {showReport&&reportMode==="TONG_QUAT"&&(()=>{
        const rows=staff.map(s=>{const all=months.map(m=>calc(s.id,m));return {s,work:all.reduce((a,b)=>a+b.work,0),ot:all.reduce((a,b)=>a+b.otMoney,0),bonus:all.reduce((a,b)=>a+b.bonus,0),gross:all.reduce((a,b)=>a+b.gross,0),ung:all.reduce((a,b)=>a+b.ung,0)}});
        const totals=rows.reduce((t,r)=>({work:t.work+r.work,ot:t.ot+r.ot,bonus:t.bonus+r.bonus,gross:t.gross+r.gross,ung:t.ung+r.ung}),{work:0,ot:0,bonus:0,gross:0,ung:0});
        const detailAdv=advances.filter(u=>u.advance_date.slice(0,7)>=reportFrom&&u.advance_date.slice(0,7)<=reportTo).sort((a,b)=>a.advance_date.localeCompare(b.advance_date));
        return <div className="space-y-5">
          <div ref={reportWorkRef} className="bg-white p-3" style={{fontFamily:"Arial, sans-serif",color:"#0f172a"}}>
            <div style={{border:"2px solid #07883f",borderRadius:16,padding:"16px 20px",textAlign:"center",marginBottom:16}}><div style={{fontSize:14,fontWeight:800,color:"#64748b"}}>BÁO CÁO CÔNG LƯƠNG</div><div style={{fontSize:28,fontWeight:900,color:"#07883f",lineHeight:1.15}}>TỔNG QUÁT XƯỞNG</div></div>
            <div style={{fontSize:17,fontWeight:900,color:"#067a3a",marginBottom:8}}>▣ BẢNG 1 - CHI TIẾT CÔNG LƯƠNG</div>
            <div style={{overflow:"hidden",border:"1px solid #cbd5e1",boxShadow:"0 2px 8px rgba(15,23,42,.12)"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:15,textAlign:"center"}}>
              <thead><tr>{["STT","Nhân viên","Tổng Công","Tăng Ca","Thưởng","Thành Tiền","Ứng","Còn Lại"].map(h=><th key={h} style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:"10px 8px",fontWeight:900}}>{h}</th>)}</tr></thead>
              <tbody>{rows.map((r,i)=><tr key={r.s.id}><td style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:9}}>{i+1}</td><td style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:9,textAlign:"left",fontWeight:900}}>{r.s.display_name}</td><td style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:9,fontWeight:800}}>{reportNum(r.work)}</td><td style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:9,fontWeight:800,color:"#d97706"}}>{reportNum(r.ot)}</td><td style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:9,fontWeight:800,color:"#0284c7"}}>{reportNum(r.bonus)}</td><td style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:9,fontWeight:900,color:"#06f"}}>{reportMoney(r.gross)}</td><td style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:9,fontWeight:900,color:"#ef4444"}}>{reportMoney(r.ung)}</td><td style={{borderBottom:"1px solid #cbd5e1",padding:9,fontWeight:900,color:r.gross-r.ung>=0?"#07883f":"#ef4444"}}>{reportMoney(r.gross-r.ung)}</td></tr>)}</tbody>
              <tfoot><tr><th colSpan={2} style={{borderRight:"1px solid #cbd5e1",padding:10,fontWeight:900}}>TỔNG CỘNG:</th><th style={{borderRight:"1px solid #cbd5e1",padding:10,color:"#ef4444"}}>{reportNum(totals.work)}</th><th style={{borderRight:"1px solid #cbd5e1",padding:10,color:"#ef4444"}}>{reportMoney(totals.ot)}</th><th style={{borderRight:"1px solid #cbd5e1",padding:10,color:"#ef4444"}}>{reportMoney(totals.bonus)}</th><th style={{borderRight:"1px solid #cbd5e1",padding:10,color:"#ef4444"}}>{reportMoney(totals.gross)}</th><th style={{borderRight:"1px solid #cbd5e1",padding:10,color:"#ef4444"}}>{reportMoney(totals.ung)}</th><th style={{padding:10,color:totals.gross-totals.ung>=0?"#07883f":"#ef4444"}}>{reportMoney(totals.gross-totals.ung)}</th></tr></tfoot>
            </table></div>
          </div>
          <div ref={reportAdvanceRef} className="bg-white p-3" style={{fontFamily:"Arial, sans-serif",color:"#0f172a"}}>
            <div style={{fontSize:17,fontWeight:900,color:"#d97706",marginBottom:8}}>▣ BẢNG 2 - CHI TIẾT ỨNG LƯƠNG</div>
            <div style={{overflow:"hidden",border:"1px solid #cbd5e1",boxShadow:"0 2px 8px rgba(15,23,42,.12)"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:15}}>
              <thead><tr><th style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:10}}>STT</th><th style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:10}}>Ngày</th><th style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:10}}>Nhân viên</th><th style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:10,textAlign:"right"}}>Số Tiền</th><th style={{borderBottom:"1px solid #cbd5e1",padding:10,textAlign:"left"}}>Lý Do</th></tr></thead>
              <tbody>{detailAdv.length?detailAdv.map((u,i)=><tr key={u.id}><td style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:10,textAlign:"center"}}>{i+1}</td><td style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:10,textAlign:"center",fontWeight:800}}>{dayLabel(u.advance_date)}</td><td style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:10,fontWeight:800}}>{staffMap.get(u.staff_id)?.display_name||"—"}</td><td style={{borderRight:"1px solid #cbd5e1",borderBottom:"1px solid #cbd5e1",padding:10,textAlign:"right",fontWeight:900,color:"#ef4444"}}>{reportMoney(u.amount)}</td><td style={{borderBottom:"1px solid #cbd5e1",padding:10,fontWeight:700}}>{u.reason||"Không ghi lý do"}</td></tr>):<tr><td colSpan={5} style={{padding:18,textAlign:"center",color:"#64748b"}}>Không có phiếu ứng trong thời gian này.</td></tr>}</tbody>
            </table></div>
          </div>
        </div>;
      })()}
    </section>}

    {tab==="DS"&&<section className="panel stack">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2>Danh sách nhân viên</h2><input className="field max-w-sm" placeholder="Tìm tên / số điện thoại" value={query} onChange={e=>setQuery(e.target.value)}/></div>
      <div className="az-table-wrap"><table className="az-table"><thead><tr><th>STT</th><th>Nhân viên</th><th>SĐT</th><th>Ngày vào</th><th>Giá công</th><th>Lịch sử lương</th><th>Trạng thái</th><th>Tài khoản</th><th>Thao tác</th></tr></thead><tbody>{filtered.map((s,i)=>{const p=s.profile_id?profiles[s.profile_id]:undefined;const history=rates.filter(x=>x.staff_id===s.id).sort((a,b)=>b.effective_date.localeCompare(a.effective_date));return <tr key={s.id}><td>{i+1}</td><td><b>{s.display_name}</b></td><td>{s.phone||"—"}</td><td>{dayLabel(s.join_date)}</td><td><b>{money(s.daily_rate)}</b></td><td><details><summary className="cursor-pointer font-bold">{history.length} mốc</summary><div className="mt-2 space-y-1">{history.map(h=><div key={h.id}>{dayLabel(h.effective_date)} · <b>{money(h.daily_rate)}</b></div>)}</div></details></td><td>{s.status==="DANG_LAM"?"Đang làm":"Đã nghỉ"}</td><td>{p?<b className="text-emerald-600">Đã có tài khoản</b>:<b className="text-red-600">Chưa có tài khoản</b>}</td><td><div className="flex flex-wrap gap-2"><button className="btn soft" onClick={()=>setEditStaff({id:s.id,name:s.display_name,phone:s.phone||"",status:s.status})}>Sửa</button></div></td></tr>})}</tbody></table></div>
    </section>}

    {tab==="TAI_KHOAN"&&<AccountManager/>}

    {showAdd&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="panel stack w-full max-w-xl"><h2>Thêm Nhân Viên Mới</h2><label>Tên nhân viên *<input className="field mt-2" value={staffForm.name} onChange={e=>setStaffForm(v=>({...v,name:e.target.value}))}/></label><label>Số điện thoại<input className="field mt-2" value={staffForm.phone} onChange={e=>setStaffForm(v=>({...v,phone:e.target.value}))}/></label><div className="grid gap-3 sm:grid-cols-2"><label>Ngày Vào *<input type="date" className="field mt-2" value={staffForm.join_date} onChange={e=>setStaffForm(v=>({...v,join_date:e.target.value}))}/></label><label>Giá Công *<input type="number" className="field mt-2" value={staffForm.daily_rate} onChange={e=>setStaffForm(v=>({...v,daily_rate:e.target.value}))}/></label></div><button className="btn primary" onClick={()=>void addStaff()} disabled={busy}>LƯU NHÂN VIÊN</button><button className="btn soft" onClick={()=>setShowAdd(false)}>Hủy</button></div></div>}
    {editStaff&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="panel stack w-full max-w-lg"><h2>Cập Nhật Thông Tin</h2><label>Tên nhân viên<input className="field mt-2 bg-slate-100" value={editStaff.name} readOnly/></label><label>Số điện thoại<input className="field mt-2" value={editStaff.phone} onChange={e=>setEditStaff(v=>v?{...v,phone:e.target.value}:v)}/></label><label>Trạng thái<select className="field mt-2" value={editStaff.status} onChange={e=>setEditStaff(v=>v?{...v,status:e.target.value as EditStaff["status"]}:v)}><option value="DANG_LAM">Đang làm</option><option value="DA_NGHI">Đã nghỉ</option></select></label><button className="btn primary" onClick={()=>void saveStaffEdit()} disabled={busy}>LƯU THAY ĐỔI</button><button className="btn soft" onClick={()=>setEditStaff(null)}>Hủy</button></div></div>}
    {advanceEdit&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="panel stack w-full max-w-lg"><h2>Sửa phiếu ứng</h2><div><b>{staffMap.get(advanceEdit.staff_id)?.display_name}</b> · {dayLabel(advanceEdit.advance_date)}</div><label>Số tiền<input type="number" className="field mt-2" value={advanceEditAmount} onChange={e=>setAdvanceEditAmount(e.target.value)}/></label><label>Lý do<input className="field mt-2" value={advanceEditReason} onChange={e=>setAdvanceEditReason(e.target.value)}/></label><button className="btn primary" onClick={()=>void saveAdvanceEdit()} disabled={busy}>LƯU THAY ĐỔI</button><button className="btn soft" onClick={()=>setAdvanceEdit(null)}>Hủy</button></div></div>}
  </div>;
}
