"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isManager, type Role } from "@/lib/azalas/permissions";
import { dt } from "@/lib/azalas/format";
import { LayoutDashboard,ClipboardPlus,ClipboardList,ReceiptText,RotateCcw,Images,UsersRound,Scissors,Boxes,PackageOpen,ChartNoAxesCombined,UserRound,Menu,X,ChevronRight,LogOut,Building2,LockKeyhole } from "lucide-react";
const groups=[
 {title:"ĐIỀU HÀNH",items:[{href:"/azalas",title:"Tổng quan",icon:LayoutDashboard,manager:false},{href:"/azalas/orders/new",title:"Tạo đơn",icon:ClipboardPlus,manager:true},{href:"/azalas/orders",title:"Chi tiết đơn",icon:ClipboardList,manager:false},{href:"/azalas/invoices",title:"Hóa đơn",icon:ReceiptText,manager:true},{href:"/azalas/returns",title:"Hàng trả",icon:RotateCcw,manager:false}]},
 {title:"VẬN HÀNH",items:[{href:"/azalas/images",title:"Kho ảnh",icon:Images,manager:false},{href:"/azalas/customers",title:"Khách hàng",icon:UsersRound,manager:true},{href:"/azalas/stock",title:"Danh mục / Tồn kho",icon:Boxes,manager:true},{href:"/azalas/patterns",title:"Quản lý rập",icon:Scissors,manager:false},{href:"/azalas/materials",title:"Quản lý phụ liệu",icon:PackageOpen,manager:true},{href:"/azalas/staff",title:"Nhân sự",icon:Building2,manager:true},{href:"/azalas/reports",title:"Báo cáo",icon:ChartNoAxesCombined,manager:true}]},
 {title:"HỆ THỐNG",items:[{href:"/azalas/account",title:"Tài khoản",icon:UserRound,manager:false}]}
];
const crumbNames:Record<string,string>={azalas:"Tổng quan",orders:"Chi tiết đơn",new:"Tạo đơn",pack:"Soạn hàng",invoices:"Hóa đơn",customers:"Khách hàng",stock:"Danh mục / Tồn kho",returns:"Hàng trả",images:"Kho ảnh",patterns:"Quản lý rập",progress:"Tiến độ đơn",create:"Thêm rập",customer:"Khách đặt",houses:"Nhà may",cutters:"Thợ cắt",catalog:"Mã rập / Ảnh",materials:"Phụ liệu",staff:"Nhân sự",account:"Tài khoản",reports:"Báo cáo",daykeo:"Dây kéo",embroidery:"Thêu",printing:"In",fabric:"Vải"};
export default function AppShell({children,profile,userId}:{children:React.ReactNode;profile:{display_name:string;role:Role;avatar_path:string|null};userId:string}){
 const path=usePathname();const router=useRouter();const sb=useMemo(()=>createClient(),[]);const [open,setOpen]=useState(false);const [avatar,setAvatar]=useState("");const [today,setToday]=useState("");
 useEffect(()=>{setOpen(false)},[path]);
 useEffect(()=>{setToday(dt(new Date().toISOString()));if(profile.avatar_path){sb.storage.from("az-avatars").createSignedUrl(profile.avatar_path,1800).then(({data})=>setAvatar(data?.signedUrl||""))}},[profile.avatar_path,sb]);
 const parts=path.split("/").filter(Boolean);const crumbs=parts.map((segment,i)=>({href:"/"+parts.slice(0,i+1).join("/"),title: /^\d+$/.test(segment)?"Chi tiết #"+segment:(crumbNames[segment]||segment)}));
 const allowed=isManager(profile.role);
 const restrictMember=(!allowed && (path.startsWith("/azalas/orders/new")||path.startsWith("/azalas/invoices")||path.startsWith("/azalas/customers")||path.startsWith("/azalas/stock")||path.startsWith("/azalas/materials")||path.startsWith("/azalas/staff")||path.startsWith("/azalas/reports")|| (path.startsWith("/azalas/patterns")&&!path.startsWith("/azalas/patterns/progress")&&path!=="/azalas/patterns")));
 async function logout(){await sb.auth.signOut();router.replace("/login");router.refresh()}
 return <div className="az-shell">
  <div className={`az-overlay ${open?"open":""}`} onClick={()=>setOpen(false)}/>
  <aside className={`az-sidebar ${open?"open":""}`} aria-label="Điều hướng chính"><div className="brand"><div className="brand-mark"><img src="/azalas-mark.svg" alt="Biểu trưng AZALAS SPORT" width={45} height={45}/></div><div className="brand-copy"><strong>AZALAS SPORT</strong><small>BỨT PHÁ DOANH SỐ</small></div></div>
   <nav className="flex-1">{groups.map(g=><div key={g.title}><div className="side-heading">{g.title}</div>{g.items.filter(item=>allowed||!item.manager).map(item=>{const Icon=item.icon;const active=item.href==="/azalas"?path==="/azalas":path.startsWith(item.href);return <Link key={item.href} href={item.href} className={`side-link ${active?"active":""}`} onClick={()=>setOpen(false)}><Icon size={18}/>{item.title}</Link>})}</div>)}</nav><div className="side-footer"><p>AZALAS V2.3 TEST · Supabase / Next.js</p><button onClick={logout} className="side-link mt-3 w-full"><LogOut size={17}/> Đăng xuất</button></div></aside>
  <div className="az-content"><header className="az-header"><div className="flex min-w-0 items-center gap-3"><button aria-label="Mở menu" className="mobile-menu btn" onClick={()=>setOpen(v=>!v)}><Menu size={19}/></button><div className="hidden min-w-0 flex-col sm:flex"><div className="eyebrow">AZALAS SPORT</div><div className="az-crumbs">{crumbs.map((c,i)=><span className="inline-flex items-center gap-1" key={c.href}>{i>0&&<ChevronRight size={12}/>}<Link href={c.href}>{c.title}</Link></span>)}</div></div><div className="sm:hidden"><strong>AZALAS SPORT</strong><p className="text-xs muted">{crumbs.at(-1)?.title}</p></div></div>
  <div className="flex items-center gap-3"><div className="hidden text-right lg:block"><p className="text-xs font-semibold">{today||"AZALAS"}</p><p className="text-xs muted">{profile.display_name}</p></div><Link href="/azalas/account" className="profile-pill" title="Tài khoản"><div className="profile-pic">{avatar?<img src={avatar} alt="Ảnh đại diện"/>:profile.display_name?.charAt(0)?.toUpperCase()||"A"}</div><div className="profile-text"><strong className="block text-xs">{profile.display_name}</strong><span className="role-chip">{profile.role}</span></div></Link></div></header>
  <main className="az-main">{restrictMember?<div className="panel"><LockKeyhole className="mb-3 text-red-500"/><h1 className="page-heading">Bạn không có quyền truy cập</h1><p className="muted mt-2">Tài khoản MEMBER chỉ được truy cập các chức năng đã được phân quyền.</p><Link className="btn primary mt-5" href="/azalas">Về tổng quan</Link></div>:children}</main></div>
 </div>
}
