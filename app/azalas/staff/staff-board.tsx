"use client";
import {useCallback,useEffect,useMemo,useState} from "react";
import {createClient} from "@/lib/supabase/client";
import {Msg,Loading} from "@/components/ui";
import {CalendarCheck2,Wallet,Pencil,BarChart3,Users,Shield} from "lucide-react";
import type {HrData} from "./hr/model";
import HrAttendance from "./hr/hr-attendance";
import HrAdvances from "./hr/hr-advances";
import HrEdit from "./hr/hr-edit";
import HrReport from "./hr/hr-report";
import HrEmployees from "./hr/hr-employees";
import HrAccounts from "./hr/hr-accounts";
const empty:HrData={employees:[],monthly:[],rates:[],advances:[],audit:[],profiles:[]};
const sections=[
 {value:"CONG",label:"Nhập công",desc:"Ngày công, tăng ca và thưởng",icon:CalendarCheck2,theme:"border-blue-200 bg-blue-50 text-blue-800",active:"ring-2 ring-blue-500"},
 {value:"UNG",label:"Nhập ứng",desc:"Ghi nhận tiền ứng nhân viên",icon:Wallet,theme:"border-amber-200 bg-amber-50 text-amber-800",active:"ring-2 ring-amber-500"},
 {value:"SUA",label:"Chỉnh sửa",desc:"Sửa giá công và phiếu sai",icon:Pencil,theme:"border-rose-200 bg-rose-50 text-rose-800",active:"ring-2 ring-rose-500"},
 {value:"BAO_CAO",label:"Báo cáo",desc:"Cá nhân và tổng quát xưởng",icon:BarChart3,theme:"border-violet-200 bg-violet-50 text-violet-800",active:"ring-2 ring-violet-500"},
 {value:"DS",label:"DS nhân viên",desc:"Hồ sơ và lịch sử lương",icon:Users,theme:"border-teal-200 bg-teal-50 text-teal-800",active:"ring-2 ring-teal-500"},
 {value:"TAI_KHOAN",label:"Tài khoản",desc:"OWNER · ADMIN · MEMBER",icon:Shield,theme:"border-slate-200 bg-slate-50 text-slate-800",active:"ring-2 ring-slate-500"}
] as const;
export default function StaffBoard(){
 const sb=useMemo(()=>createClient(),[]);const [tab,setTab]=useState("CONG"),[data,setData]=useState<HrData>(empty),[busy,setBusy]=useState(true),[error,setError]=useState("");
 const reload=useCallback(async()=>{setBusy(true);const [a,b,c,d,e,f]=await Promise.all([
  sb.from("employees").select("id,full_name,phone,position,start_date,base_salary,is_active").order("id",{ascending:false}).limit(500),
  sb.from("hr_monthly_attendance").select("id,employee_id,month_start,work_units,overtime_hours,bonus,updated_at").order("month_start",{ascending:false}).limit(1000),
  sb.from("hr_rate_history").select("id,employee_id,effective_date,daily_rate,overtime_rate,created_at").order("effective_date",{ascending:false}).limit(1000),
  sb.from("salary_advances").select("id,employee_id,advance_date,amount,note,deleted_at,updated_at").order("advance_date",{ascending:false}).limit(1000),
  sb.from("hr_audit_log").select("id,employee_id,action,details,created_at").order("created_at",{ascending:false}).limit(100),
  sb.from("az_profiles").select("id,display_name,phone,role,is_active").order("created_at").limit(200)
 ]);const err=[a.error,b.error,c.error,d.error,e.error,f.error].find(Boolean);if(err)setError(err.message);else {setError("");setData({employees:(a.data||[]) as HrData["employees"],monthly:(b.data||[]) as HrData["monthly"],rates:(c.data||[]) as HrData["rates"],advances:(d.data||[]) as HrData["advances"],audit:(e.data||[]) as HrData["audit"],profiles:(f.data||[]) as HrData["profiles"]})}setBusy(false)},[sb]);
 useEffect(()=>{void reload()},[reload]);
 return <div className="stack"><section className="panel flex flex-wrap items-center justify-between gap-4"><div><div className="eyebrow">ĐIỀU HÀNH / NHÂN SỰ</div><h2 className="mt-1 text-2xl font-black">Trung tâm nhân sự</h2><p className="muted mt-1 text-sm">Chấm công theo tháng · Ứng lương · Giá công theo ngày hiệu lực · Báo cáo và tài khoản.</p></div><div className="rounded-xl bg-emerald-50 p-4 text-center"><b className="block text-3xl text-emerald-800">6</b><small className="text-xs text-emerald-700">NHÓM NGHIỆP VỤ</small></div></section>
 <nav className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Nhóm nghiệp vụ nhân sự">
 {sections.map(({value,label,desc,icon:Icon,theme,active})=><button key={value} type="button" aria-pressed={tab===value} onClick={()=>setTab(value)} className={`flex min-h-24 items-center gap-4 rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${theme} ${tab===value?active:""}`}>
 <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/85 shadow-sm"><Icon size={24}/></span>
 <span><b className="block text-sm text-slate-950">{label}</b><small className="mt-1 block text-xs leading-relaxed text-slate-600">{desc}</small></span>
 </button>)}
 </nav>
 <Msg error={error}/>{busy?<Loading/>:tab==="CONG"?<HrAttendance data={data} onSaved={reload}/>:tab==="UNG"?<HrAdvances data={data} onSaved={reload}/>:tab==="SUA"?<HrEdit data={data} onSaved={reload}/>:tab==="BAO_CAO"?<HrReport data={data}/>:tab==="DS"?<HrEmployees data={data} onSaved={reload}/>:<HrAccounts data={data} onSaved={reload}/>}
 </div>;
}
