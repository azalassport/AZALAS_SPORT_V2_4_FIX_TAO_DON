import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {PageTop} from "@/components/ui";
import CustomersBoard from "./customers-board";
export default async function CustomersPage(){const sb=await createClient();const {data:{user}}=await sb.auth.getUser();const {data:p}=await sb.from("az_profiles").select("role").eq("id",user?.id||"").single();if(p?.role!=="OWNER"&&p?.role!=="ADMIN")redirect("/azalas");return <><PageTop title="Khách hàng" kicker="BÁN HÀNG" description="Thông tin giao hàng, chành xe, lịch sử đơn và công nợ." back="/azalas"/><CustomersBoard/></>}
