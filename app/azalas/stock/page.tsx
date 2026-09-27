import {redirect} from "next/navigation";
import {createClient} from "@/lib/supabase/server";
import {PageTop} from "@/components/ui";
import StockBoard from "./stock-board";
export default async function Page(){
 const sb=await createClient();const {data:{user}}=await sb.auth.getUser();if(!user)redirect("/login");
 const {data:p}=await sb.from("az_profiles").select("role,is_active").eq("id",user.id).single();
 if(!p?.is_active||!(["OWNER","ADMIN"].includes(p.role)))return <div className="panel">Chỉ OWNER/ADMIN được nhập danh mục và tồn kho.</div>;
 return <><PageTop title="Danh mục & tồn kho" kicker="KHO THÀNH PHẨM" description="Nhập mã bán hàng, màu, size và tồn theo từng kho. Không bắt buộc khai báo trước khi tạo đơn; chỉ sản phẩm chọn từ danh mục mới tự trừ tồn khi soạn xong." back="/azalas"/><StockBoard/></>;
}
