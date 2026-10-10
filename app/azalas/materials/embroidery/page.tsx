import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import MaterialLedger from "@/components/material-ledger";

export default function Page() {
  return (
    <main className="space-y-5">
      <Link
        href="/azalas/materials"
        className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-blue-200 bg-white px-3.5 py-2 text-[13px] font-black text-blue-700 shadow-[0_6px_18px_rgba(37,99,235,0.08)] transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 sm:min-h-[46px] sm:rounded-2xl sm:px-4 sm:text-[14px]"
      >
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-blue-50 text-blue-700 sm:h-8 sm:w-8">
          <ArrowLeft className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={2.7} />
        </span>
        Quay lại Quản lý phụ liệu
      </Link>

      <MaterialLedger category="THEU" title="Thêu" />
    </main>
  );
}
