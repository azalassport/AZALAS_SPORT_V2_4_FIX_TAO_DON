import { PageTop } from "@/components/ui";
import InvoiceDetail from "./invoice-detail";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <><PageTop title="Chi tiết hóa đơn" kicker="HÓA ĐƠN" back="/azalas/invoices"/><InvoiceDetail invoiceId={Number(id)}/></>}
