import {PageTop} from "@/components/ui";
import ReturnDetail from "./return-detail";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <><PageTop title="Chi tiết phiếu hàng trả" kicker="HÀNG TRẢ" description="Xem chi tiết, chụp và chốt phiếu trả; hoặc để hóa đơn cùng khách tự hiện phiếu chưa duyệt." back="/azalas/returns"/><ReturnDetail slipId={Number(id)}/></>}
