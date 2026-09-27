import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AppShell from "@/components/app-shell";
import type { Role } from "@/lib/azalas/permissions";
export default async function AzalasLayout({children}:{children:React.ReactNode}){
 const sb=await createClient();const {data:{user}}=await sb.auth.getUser();if(!user)redirect("/login");
 const {data:p}=await sb.from("az_profiles").select("display_name,role,is_active,avatar_path").eq("id",user.id).single();
 if(!p?.is_active) return <div className="login-bg"><section className="login-card"><h1 className="h-title">Tài khoản chưa kích hoạt</h1><p className="muted mt-3">Nhờ OWNER/ADMIN kích hoạt tài khoản trong AZALAS. Nếu bạn vừa tạo database, hãy chạy file SQL cấp OWNER đúng email.</p><a className="btn primary mt-5" href="/login">Đăng nhập lại</a></section></div>;
 return <AppShell userId={user.id} profile={{display_name:p.display_name||user.email||"Tài khoản",role:p.role as Role,avatar_path:p.avatar_path}}>{children}</AppShell>;
}
