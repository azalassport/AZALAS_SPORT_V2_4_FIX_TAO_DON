import {PageTop} from "@/components/ui";
import Link from "next/link";
export default function Page(){return <><PageTop title="Báo cáo thống kê" kicker="ĐIỀU HÀNH" description="Phân hệ này theo yêu cầu được triển khai sau khi chốt dữ liệu bán hàng và sản xuất." back="/azalas"/><section className="panel stack"><h2>Đang xây dựng</h2><p className="muted">Hiện chưa tính doanh thu/lợi nhuận thực từ dữ liệu thử nghiệm. Không dùng số liệu dashboard làm báo cáo tài chính.</p><Link className="btn soft w-fit" href="/azalas">Quay về tổng quan</Link></section></>}
