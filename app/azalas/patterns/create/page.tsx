import { PageTop, Msg } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import PatternCreate from "./pattern-create";

export default async function Page() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: profile } = user ? await sb.from("az_profiles")
    .select("role,is_active").eq("id", user.id).single() : { data: null };
  const manager = Boolean(profile?.is_active && (profile?.role === "OWNER" || profile?.role === "ADMIN"));
  return <>
    <PageTop title="Thêm rập mới" kicker="QUẢN LÝ RẬP" back="/azalas/patterns"
      description="Phiếu PNR Hàng nhà nhiều mẫu/màu; Khách đặt giữ luồng hiện tại trong đợt 1." />
    {manager ? <PatternCreate /> : <Msg error="Chỉ OWNER/ADMIN được lập phiếu rập. MEMBER chỉ xem Tiến độ." />}
  </>;
}
