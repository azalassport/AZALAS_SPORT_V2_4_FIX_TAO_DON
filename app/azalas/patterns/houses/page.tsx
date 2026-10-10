"use client";

import Link from "next/link";
import { ArrowLeft, Factory } from "lucide-react";
import PartnerList from "@/components/partner-list";
import { HouseLedger } from "./house-ledger";

export default function Page() {
  return <main className="space-y-5">
      <Link
        href="/azalas/patterns"
        className="inline-flex min-h-[42px] items-center gap-2 rounded-full border border-blue-200 bg-white/90 px-4 py-2 text-[14px] font-black text-blue-700 shadow-[0_6px_18px_rgba(37,99,235,.08)] transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 sm:min-h-[46px] sm:px-5 sm:text-[15px]"
      >
        <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2.7} />
        Quay lại Quản lý rập
      </Link>

      <section className="relative overflow-hidden rounded-[30px] border border-violet-200/90 bg-[linear-gradient(135deg,rgba(255,255,255,.98),rgba(248,251,255,.96))] p-5 shadow-[0_18px_48px_rgba(15,23,42,.07)] sm:p-7">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-violet-200/45 blur-3xl" />
        <div className="relative flex items-center gap-4 sm:gap-5">
          <div className="grid h-16 w-16 shrink-0 place-items-center rounded-[22px] bg-violet-100 shadow-[0_12px_28px_rgba(15,23,42,.08)] sm:h-20 sm:w-20">
            <Factory className="h-8 w-8 text-violet-600 sm:h-10 sm:w-10" strokeWidth={2.35} />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] font-black uppercase tracking-[0.16em] text-blue-700 sm:text-[12px]">QUẢN LÝ RẬP</div>
            <h1 className="mt-1 text-[30px] font-black leading-tight tracking-[-0.7px] text-[#0d2346] sm:text-[40px]">Nhà may</h1>
            <p className="mt-2 max-w-[820px] text-[13px] font-semibold leading-6 text-slate-500 sm:text-[15px]">Chốt bảng kê theo mâm, quản lý công nợ, ứng trước và thanh toán từng nhà may.</p>
          </div>
        </div>
      </section>
    <HouseLedger />
    <details className="rounded-[26px] border border-violet-100 bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,.05)] sm:p-6">
      <summary className="cursor-pointer text-[16px] font-black text-[#0d2346] sm:text-[18px]">Danh mục nhà may · Thêm / khóa nhà may</summary>
      <div className="mt-5"><PartnerList table="sewing_houses" label="nhà may" /></div>
    </details>
  </main>;
}
