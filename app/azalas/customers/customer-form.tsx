"use client";
import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import {Msg} from "@/components/ui";
const fields=[['name','Tên khách hàng *'],['phone','Số điện thoại'],['address','Địa chỉ'],['transport_station','Chành xe'],['transport_phone','SĐT chành xe']] as const;
export default function CustomerForm({onCreated}:{onCreated?:()=>void}){const [form,setForm]=useState({name:"",phone:"",address:"",transport_station:"",transport_phone:""});const [err,setErr]=useState("");const [busy,setBusy]=useState(false);
 async function save(e:FormEvent){e.preventDefault();setErr("");if(!form.name.trim())return setErr("Tên khách không được trống");setBusy(true);const sb=createClient();const {data:{user}}=await sb.auth.getUser();if(!user){setErr("Hết phiên đăng nhập");setBusy(false);return;}const {error}=await sb.from("az_customers").insert({...form,name:form.name.trim(),created_by:user.id});setBusy(false);if(error)setErr(error.message);else{setForm({name:"",phone:"",address:"",transport_station:"",transport_phone:""});onCreated?.()}}
 return <form onSubmit={save} className="panel stack"><h2>+ Thêm khách hàng</h2><Msg error={err}/><div className="grid gap-3 md:grid-cols-2">{fields.map(([key,label])=><label key={key} className="text-sm font-semibold">{label}<input className="field mt-2" required={key==="name"} value={form[key]} onChange={e=>setForm(v=>({...v,[key]:e.target.value}))}/></label>)}</div><button className="btn primary w-fit" disabled={busy||!form.name.trim()}>{busy?"Đang thêm...":"Lưu khách hàng"}</button></form>
}
