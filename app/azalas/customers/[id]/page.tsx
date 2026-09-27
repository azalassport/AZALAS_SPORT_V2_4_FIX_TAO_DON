import {PageTop} from "@/components/ui";
import CustomerDetail from "./customer-detail";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <><PageTop title="Chi tiết khách hàng" kicker="KHÁCH HÀNG" description="Sửa liên hệ, xem đơn hàng, hóa đơn và số dư công nợ." back="/azalas/customers"/><CustomerDetail customerId={Number(id)}/></>}
