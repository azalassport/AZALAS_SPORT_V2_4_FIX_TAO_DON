"use client";
import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Suspense } from "react";
function LoginForm(){const sb=createClient();const router=useRouter();const params=useSearchParams();const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [busy,setBusy]=useState(false);const [err,setErr]=useState("");
 async function login(e:FormEvent){e.preventDefault();setBusy(true);setErr("");const {error}=await sb.auth.signInWithPassword({email,password});setBusy(false);if(error){setErr(error.message);return;}const dest=params.get("next");router.replace(dest?.startsWith("/azalas")?dest:"/azalas");router.refresh();}
 return <main className="login-bg"><section className="login-card"><div className="brand-mark"><img src="/azalas-mark.svg" alt="AZALAS SPORT" width={45} height={45}/></div><span className="eyebrow">AZALAS SPORT</span><h1 className="h-title">Chào mừng trở lại</h1><p className="muted">Bứt phá doanh số - Làm chủ đường đua!</p><form onSubmit={login} className="stack mt-8"><label>Email<input type="email" autoComplete="username" required className="field" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>Mật khẩu<input type="password" autoComplete="current-password" required className="field" value={password} onChange={e=>setPassword(e.target.value)}/></label>{err&&<p className="alert error">{err}</p>}<button className="btn primary" disabled={busy}>{busy?"Đang đăng nhập...":"Đăng nhập hệ thống"}</button></form><p className="muted mt-6 text-xs">Tài khoản do OWNER/ADMIN cấp và kích hoạt.</p></section></main>;
}
export default function Login(){return <Suspense fallback={<main className="login-bg">Đang tải...</main>}><LoginForm/></Suspense>}
