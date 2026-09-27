import {PageTop} from "@/components/ui";
import CustomerInvoicePicker from "./customer-invoice-picker";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <><PageTop title="Gộp hóa đơn theo khách" kicker="HÓA ĐƠN / CHƯA GỬI" description="Những đơn đã soạn của cùng khách nằm chung một nhóm. Bỏ tick đơn nào thì đơn đó vẫn chờ, không bị chốt hoặc xóa." back="/azalas/invoices"/><CustomerInvoicePicker customerId={Number(id)}/></>}
