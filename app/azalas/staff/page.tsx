import { PageTop } from "@/components/ui";
import StaffBoard from "./staff-board";
export default function Page(){return <><PageTop title="Nhân sự & phân quyền" kicker="QUẢN TRỊ" description="Ba vai trò OWNER / ADMIN / MEMBER. Nhân viên mới cần được người quản lý kích hoạt." back="/azalas"/><StaffBoard/></>}
