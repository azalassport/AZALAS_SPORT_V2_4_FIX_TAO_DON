"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loading, Msg } from "@/components/ui";

type Role = "OWNER"|"ADMIN"|"MEMBER";
type Staff = {
  id:number;
  display_name:string;
  phone:string|null;
  status:string;
  profile_id:string|null;
  join_date:string;
  daily_rate:number;
};
type Account = {
  id:string;
  display_name:string;
  phone:string|null;
  login_name:string|null;
  role:Role;
  is_active:boolean;
  created_at:string;
  email:string;
  staff:Staff|null;
};

function normalizeLoginName(v:string){
  return v.trim().toLowerCase();
}

export default function AccountManager(){
  const sb=useMemo(()=>createClient(),[]);
  const [meRole,setMeRole]=useState<Role|"">("");
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [staff,setStaff]=useState<Staff[]>([]);
  const [form,setForm]=useState({
    staff_id:"",
    login_name:"",
    password:"",
    role:"MEMBER" as "OWNER"|"ADMIN"|"MEMBER"
  });
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState("");
  const [ok,setOk]=useState("");
  const [requestedStaffId,setRequestedStaffId]=useState("");
  const manager=meRole==="OWNER"||meRole==="ADMIN";

  const authFetch=useCallback(async(path:string,init?:RequestInit)=>{
    const {data:{session}}=await sb.auth.getSession();
    if(!session?.access_token) throw new Error("Vui lòng đăng nhập lại.");

    const res=await fetch(path,{
      ...init,
      headers:{
        "Content-Type":"application/json",
        Authorization:`Bearer ${session.access_token}`,
        ...(init?.headers||{})
      }
    });

    const raw=await res.text();
    let data:any=null;
    try{
      data=raw?JSON.parse(raw):null;
    }catch{
      throw new Error(`API trả dữ liệu không hợp lệ (${res.status}). Kiểm tra app/api/admin/accounts/route.ts`);
    }

    if(!res.ok||!data?.ok) throw new Error(data?.message||"Thao tác thất bại");
    return data;
  },[sb]);

  const reload=useCallback(async()=>{
    setLoading(true);
    setErr("");
    try{
      const {data:{user}}=await sb.auth.getUser();
      if(!user) throw new Error("Vui lòng đăng nhập lại.");

      const {data:p,error}=await sb
        .from("az_profiles")
        .select("role")
        .eq("id",user.id)
        .single();
      if(error) throw error;

      const r=String(p?.role||"") as Role;
      setMeRole(r);

      if(r!=="OWNER"&&r!=="ADMIN"){
        setLoading(false);
        return;
      }

      const data=await authFetch("/api/admin/accounts");
      setAccounts(data.accounts||[]);
      setStaff(data.staff||[]);
    }catch(e){
      setErr(e instanceof Error?e.message:String(e));
    }finally{
      setLoading(false);
    }
  },[sb,authFetch]);

  useEffect(()=>{void reload();},[reload]);

  // Khi đi từ DS nhân viên -> Tạo tài khoản:
  // /azalas/account?staff=123
  // giữ ID chờ cho tới khi API tải xong danh sách nhân viên,
  // sau đó mới tự chọn đúng nhân viên trong select.
  useEffect(()=>{
    if(typeof window==="undefined") return;
    const id=new URLSearchParams(window.location.search).get("staff");
    if(id) setRequestedStaffId(id);
  },[]);

  useEffect(()=>{
    if(!requestedStaffId || !staff.length) return;
    const target=staff.find(
      s=>String(s.id)===requestedStaffId &&
         !s.profile_id &&
         s.status==="DANG_LAM"
    );
    if(target){
      setForm(v=>({...v,staff_id:String(target.id)}));
    }
  },[requestedStaffId,staff]);

  async function createAccount(){
    setErr("");
    setOk("");

    const loginName=normalizeLoginName(form.login_name);

    if(!form.staff_id) return setErr("Vui lòng chọn nhân viên.");
    if(loginName.length<2||loginName.length>32)
      return setErr("Tên đăng nhập phải từ 2 đến 32 ký tự.");
    if(!/^[a-z0-9._-]+$/.test(loginName))
      return setErr("Tên đăng nhập chỉ dùng chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang.");
    if(!/^[a-z0-9]/.test(loginName)||!/[a-z0-9]$/.test(loginName)||loginName.includes(".."))
      return setErr("Tên đăng nhập phải bắt đầu/kết thúc bằng chữ hoặc số và không dùng hai dấu chấm liền nhau.");
    if(form.password.length<6)
      return setErr("Mật khẩu ban đầu phải có ít nhất 6 ký tự.");

    setBusy(true);
    try{
      const data=await authFetch("/api/admin/accounts",{
        method:"POST",
        body:JSON.stringify({
          staff_id:Number(form.staff_id),
          login_name:loginName,
          password:form.password,
          role:form.role
        })
      });

      setOk(data.message);
      setForm({staff_id:"",login_name:"",password:"",role:"MEMBER"});
      await reload();
    }catch(e){
      setErr(e instanceof Error?e.message:String(e));
    }finally{
      setBusy(false);
    }
  }

  async function patch(id:string,changes:Record<string,unknown>){
    setBusy(true);
    setErr("");
    setOk("");
    try{
      const data=await authFetch("/api/admin/accounts",{
        method:"PATCH",
        body:JSON.stringify({id,...changes})
      });
      setOk(data.message);
      await reload();
    }catch(e){
      setErr(e instanceof Error?e.message:String(e));
    }finally{
      setBusy(false);
    }
  }

  const available=staff.filter(s=>!s.profile_id&&s.status==="DANG_LAM");
  const selectedStaff=available.find(s=>String(s.id)===form.staff_id);

  if(loading)return <Loading/>;
  if(!manager)return <section className="panel"><Msg error="Chỉ OWNER/ADMIN được quản lý tài khoản."/></section>;

  return <div className="stack">
    <Msg error={err} success={ok}/>

    <section className="panel stack">
      <div>
        <div className="text-xs font-extrabold tracking-widest text-blue-600">HỆ THỐNG</div>
        <h1 className="text-2xl font-extrabold">Tài khoản & Phân quyền</h1>
        <p className="muted">Nhân viên đăng nhập bằng Tên đăng nhập + Mật khẩu. OWNER vẫn có thể dùng email hiện tại.</p>
      </div>

      <div className="rounded-2xl border bg-slate-50 p-4 stack">
        <h2>Tạo tài khoản mới</h2>

        <div className="grid gap-3 md:grid-cols-2">
          <label>
            Nhân viên *
            <select
              className="field mt-2"
              value={form.staff_id}
              onChange={e=>setForm(v=>({...v,staff_id:e.target.value}))}
            >
              <option value="">Chọn nhân viên chưa có tài khoản</option>
              {available.map(s=>
                <option value={s.id} key={s.id}>
                  {s.display_name}{s.phone?` · ${s.phone}`:""}
                </option>
              )}
            </select>
            {selectedStaff&&
              <small className="mt-1 block font-bold text-blue-700">
                Đang tạo tài khoản cho: {selectedStaff.display_name}
                {selectedStaff.phone?` · ${selectedStaff.phone}`:""}
              </small>
            }
          </label>

          <label>
            Tên đăng nhập *
            <input
              className="field mt-2"
              value={form.login_name}
              onChange={e=>setForm(v=>({...v,login_name:e.target.value}))}
              placeholder="VD: mi01"
              autoComplete="off"
            />
            <small className="muted block mt-1">2–32 ký tự: chữ không dấu, số, . _ -</small>
          </label>

          <label>
            Mật khẩu ban đầu *
            <input
              type="password"
              className="field mt-2"
              value={form.password}
              onChange={e=>setForm(v=>({...v,password:e.target.value}))}
              placeholder="Tối thiểu 6 ký tự"
              autoComplete="new-password"
            />
          </label>

          <label>
            Quyền
            <select
              className="field mt-2"
              value={form.role}
              onChange={e=>setForm(v=>({...v,role:e.target.value as "OWNER"|"ADMIN"|"MEMBER"}))}
              disabled={meRole!=="OWNER"}
            >
              <option value="MEMBER">MEMBER</option>
              {meRole==="OWNER"&&<option value="ADMIN">ADMIN</option>}
              {meRole==="OWNER"&&<option value="OWNER">OWNER</option>}
            </select>
          </label>
        </div>

        <p className="text-xs text-slate-500">
          OWNER tạo được OWNER/ADMIN/MEMBER. ADMIN chỉ tạo MEMBER. Tài khoản OWNER sau khi tạo sẽ được khóa bảo vệ như OWNER hiện tại.
        </p>

        <button
          className="btn primary w-fit"
          disabled={busy||!available.length}
          onClick={()=>void createAccount()}
        >
          {busy?"ĐANG TẠO...":"TẠO TÀI KHOẢN"}
        </button>

        {!available.length&&!err&&
          <p className="muted text-sm">Hiện không có nhân viên đang làm nào chờ tạo tài khoản.</p>}
      </div>
    </section>

    <section className="panel stack">
      <h2>Danh sách tài khoản</h2>

      <div className="az-table-wrap">
        <table className="az-table">
          <thead>
            <tr>
              <th>STT</th>
              <th>Nhân viên</th>
              <th>Tên đăng nhập</th>
              <th>Quyền</th>
              <th>Trạng thái</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {accounts.map((a,i)=>{
              const owner=a.role==="OWNER";
              const canEdit=meRole==="OWNER" ? !owner : a.role==="MEMBER";
              const displayLogin=a.login_name || (owner ? a.email : "—");

              return <tr key={a.id}>
                <td>{i+1}</td>
                <td>
                  <b>{a.staff?.display_name||a.display_name||"—"}</b>
                  {a.staff?.phone&&<div className="muted text-xs">{a.staff.phone}</div>}
                </td>
                <td><b>{displayLogin}</b>{owner&&!a.login_name&&<div className="muted text-xs">OWNER đăng nhập bằng email</div>}</td>
                <td>
                  {owner
                    ? <b>OWNER</b>
                    : meRole==="OWNER"&&canEdit
                      ? <select
                          className="field min-w-28"
                          value={a.role}
                          disabled={busy}
                          onChange={e=>void patch(a.id,{role:e.target.value})}
                        >
                          <option value="MEMBER">MEMBER</option>
                          <option value="ADMIN">ADMIN</option>
                        </select>
                      : <b>{a.role}</b>
                  }
                </td>
                <td>
                  <span className={`font-bold ${a.is_active?"text-emerald-600":"text-red-600"}`}>
                    {a.is_active?"Hoạt động":"Đã khóa"}
                  </span>
                </td>
                <td>
                  {canEdit
                    ? <button
                        className={`btn ${a.is_active?"soft":"primary"}`}
                        disabled={busy}
                        onClick={()=>void patch(a.id,{is_active:!a.is_active})}
                      >
                        {a.is_active?"Khóa":"Mở lại"}
                      </button>
                    : <span className="muted text-xs">{owner?"OWNER được bảo vệ":"Không có quyền sửa"}</span>
                  }
                </td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>

      {!accounts.length&&<p className="muted text-center">Chưa có tài khoản.</p>}
    </section>
  </div>;
}
