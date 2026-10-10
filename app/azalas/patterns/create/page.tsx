import Link from "next/link";
import { ArrowLeft, Scissors } from "lucide-react";
import { Msg } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import PatternCreate from "./pattern-create";

export default async function Page() {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  const { data: profile } = user ? await sb.from("az_profiles")
    .select("role,is_active").eq("id", user.id).single() : { data: null };
  const manager = Boolean(profile?.is_active && (profile?.role === "OWNER" || profile?.role === "ADMIN"));

  return <main className="space-y-5">
      <Link
        href="/azalas/patterns"
        className="inline-flex min-h-[42px] items-center gap-2 rounded-full border border-blue-200 bg-white/90 px-4 py-2 text-[14px] font-black text-blue-700 shadow-[0_6px_18px_rgba(37,99,235,.08)] transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 sm:min-h-[46px] sm:px-5 sm:text-[15px]"
      >
        <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2.7} />
        Quay lại Quản lý rập
      </Link>

      <section className="relative overflow-hidden rounded-[30px] border border-blue-200/90 bg-[linear-gradient(135deg,rgba(255,255,255,.98),rgba(248,251,255,.96))] p-5 shadow-[0_18px_48px_rgba(15,23,42,.07)] sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-blue-200/45 blur-3xl" />
        <div className="relative flex items-center gap-4 sm:gap-5">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-[22px] bg-blue-100 shadow-[0_12px_28px_rgba(15,23,42,.08)] sm:h-20 sm:w-20">
            <Scissors className="h-8 w-8 text-blue-600 sm:h-10 sm:w-10" strokeWidth={2.35} />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-700 sm:text-[12px]">QUẢN LÝ RẬP</div>
            <h1 className="mt-1 text-[30px] font-black leading-tight tracking-[-0.7px] text-[#0d2346] sm:text-[40px]">Thêm rập mới</h1>
            <p className="mt-2 max-w-[820px] text-[13px] font-semibold leading-6 text-slate-500 sm:text-[15px]">Tạo phiếu Hàng nhà nhiều mẫu/màu hoặc tạo rập Khách đặt.</p>
          </div>
        </div>
      </section>
    {manager ? <PatternCreate /> : <Msg error="Chỉ OWNER/ADMIN được lập phiếu rập. MEMBER chỉ xem Tiến độ." />}
  </main>;
}
