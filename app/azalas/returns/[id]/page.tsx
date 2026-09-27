import {PageTop} from "@/components/ui";
import ReturnDetail from "./return-detail";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <><PageTop title="Chi tiết phiếu hàng trả" kicker="HÀNG TRẢ" description="Xem phiếu trước khi duyệt; phiếu đã duyệt có thể đưa vào hóa đơn của đúng khách." back="/azalas/returns"/><ReturnDetail slipId={Number(id)}/></>}
