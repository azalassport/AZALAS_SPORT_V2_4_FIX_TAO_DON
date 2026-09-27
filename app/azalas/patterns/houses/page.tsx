import {PageTop} from "@/components/ui";
import PartnerList from "@/components/partner-list";
export default function Page(){return <><PageTop title="Nhà may" kicker="QUẢN LÝ RẬP" description="Danh mục nhà may và đơn giá được quản lý theo mã rập tại màn Thêm rập." back="/azalas/patterns"/><PartnerList table="sewing_houses" label="nhà may"/></>}
