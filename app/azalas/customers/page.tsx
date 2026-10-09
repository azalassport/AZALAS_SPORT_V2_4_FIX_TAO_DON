import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, UsersRound } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import CustomersBoard from "./customers-board";

export default async function CustomersPage() {
  const sb = await createClient();

  const {
    data: { user },
  } = await sb.auth.getUser();

  const { data: profile } = await sb
    .from("az_profiles")
    .select("role")
    .eq("id", user?.id || "")
    .single();

  if (profile?.role !== "OWNER" && profile?.role !== "ADMIN") {
    redirect("/azalas");
  }

  return (
    <main className="relative overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_86%_5%,rgba(219,234,254,.78),transparent_28%),linear-gradient(180deg,#f8fbff_0%,#eef6ff_100%)] px-4 py-5 sm:px-7 sm:py-7 lg:px-10 lg:py-9">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 top-40 h-72 w-72 rounded-full bg-blue-100/55 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-80px] top-[-60px] h-80 w-80 rounded-full bg-cyan-100/45 blur-3xl"
      />

      <div className="relative z-10">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <Link
              href="/azalas"
              className="inline-flex min-h-[42px] items-center gap-2 rounded-full border border-blue-300 bg-blue-50/90 px-4 py-2 text-[14px] font-black text-blue-700 shadow-[0_5px_14px_rgba(37,99,235,.08)] transition hover:-translate-y-0.5 hover:bg-white sm:min-h-[46px] sm:px-5 sm:text-[15px]"
            >
              <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2.7} />
              Quay lại
            </Link>

            <div className="mt-6 text-[13px] font-black uppercase tracking-[0.12em] text-blue-700 sm:text-[15px]">
              BÁN HÀNG
            </div>

            <h1 className="mt-2 text-[34px] font-black leading-none tracking-[-1px] text-[#0d2346] sm:text-[48px] lg:text-[54px]">
              Khách hàng
            </h1>

            <p className="mt-4 max-w-[760px] text-[15px] font-semibold leading-7 text-slate-500 sm:text-[18px]">
              Quản lý khách hàng, công nợ và lịch sử mua hàng.
            </p>
          </div>

          <div className="hidden shrink-0 lg:flex">
            <div className="relative flex h-[190px] w-[380px] items-center justify-center">
              <div className="absolute h-[170px] w-[320px] rounded-[44px] bg-gradient-to-br from-blue-100 via-white to-cyan-100 shadow-[0_20px_55px_rgba(37,99,235,.12)]" />
              <div className="relative grid h-24 w-24 place-items-center rounded-[30px] bg-white text-blue-600 shadow-[0_14px_36px_rgba(37,99,235,.16)]">
                <UsersRound className="h-12 w-12" strokeWidth={2.1} />
              </div>
              <div className="relative ml-5 space-y-3">
                <div className="h-4 w-36 rounded-full bg-blue-200" />
                <div className="h-4 w-28 rounded-full bg-slate-200" />
                <div className="h-4 w-40 rounded-full bg-cyan-200" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 sm:mt-10">
          <CustomersBoard />
        </div>
      </div>
    </main>
  );
}
