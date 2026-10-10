"use client";

import { useState } from "react";
import { Factory, UsersRound, CheckCircle2 } from "lucide-react";
import PatternHouseEntry from "./pattern-house-entry";
import PatternCustomerEntry from "./pattern-customer-entry";

export default function PatternCreate() {
  const [mode, setMode] = useState<"THUONG" | "KHACH_DAT">("THUONG");

  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        onClick={() => setMode("THUONG")}
        className={`group relative flex min-h-[104px] items-center gap-4 rounded-[24px] border p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(15,23,42,.08)] sm:p-5 ${mode === "THUONG"
          ? "border-blue-300 bg-[linear-gradient(135deg,#eff6ff,#ffffff)] shadow-[0_12px_28px_rgba(37,99,235,.11)]"
          : "border-slate-200 bg-white"}`}
      >
        <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-[18px] ${mode === "THUONG" ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"}`}>
          <Factory className="h-7 w-7" strokeWidth={2.4} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[17px] font-black sm:text-[19px] ${mode === "THUONG" ? "text-blue-800" : "text-[#0d2346]"}`}>Hàng nhà</span>
          <span className="mt-1 block text-[12px] font-semibold leading-5 text-slate-500 sm:text-[13px]">Phiếu PNR nhiều hiệu / nhiều màu</span>
        </span>
        {mode === "THUONG" && <CheckCircle2 className="h-6 w-6 shrink-0 text-blue-600" strokeWidth={2.5} />}
      </button>

      <button
        type="button"
        onClick={() => setMode("KHACH_DAT")}
        className={`group relative flex min-h-[104px] items-center gap-4 rounded-[24px] border p-4 text-left transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_14px_30px_rgba(15,23,42,.08)] sm:p-5 ${mode === "KHACH_DAT"
          ? "border-violet-300 bg-[linear-gradient(135deg,#f5f3ff,#ffffff)] shadow-[0_12px_28px_rgba(124,58,237,.11)]"
          : "border-slate-200 bg-white"}`}
      >
        <span className={`grid h-14 w-14 shrink-0 place-items-center rounded-[18px] ${mode === "KHACH_DAT" ? "bg-violet-100 text-violet-600" : "bg-slate-100 text-slate-500"}`}>
          <UsersRound className="h-7 w-7" strokeWidth={2.4} />
        </span>
        <span className="min-w-0 flex-1">
          <span className={`block text-[17px] font-black sm:text-[19px] ${mode === "KHACH_DAT" ? "text-violet-800" : "text-[#0d2346]"}`}>Khách đặt</span>
          <span className="mt-1 block text-[12px] font-semibold leading-5 text-slate-500 sm:text-[13px]">Tạo rập không cần chọn mã đơn khách hàng</span>
        </span>
        {mode === "KHACH_DAT" && <CheckCircle2 className="h-6 w-6 shrink-0 text-violet-600" strokeWidth={2.5} />}
      </button>
    </div>

    {mode === "THUONG" ? <PatternHouseEntry /> : <PatternCustomerEntry />}
  </div>;
}
