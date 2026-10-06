import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import InvoicesBoard from "./invoices-board";

export default function Invoices() {
  return (
    <>
      <div className="mb-6 sm:mb-7">
        <Link
          href="/azalas"
          className="mb-5 inline-flex items-center gap-2 text-[15px] font-extrabold text-blue-600 transition hover:text-blue-700"
        >
          <ArrowLeft size={20} strokeWidth={2.4} />
          Quay lại
        </Link>

        <div className="text-[12px] font-black uppercase tracking-[0.2em] text-blue-700">
          BÁN HÀNG / HÓA ĐƠN
        </div>
        <h1 className="mt-2 text-[34px] font-black leading-tight tracking-[-1.2px] text-slate-950 sm:text-[42px]">
          Trung tâm hóa đơn
        </h1>
        <p className="mt-2 max-w-5xl text-[15px] leading-6 text-slate-600 sm:text-[16px]">
          Chốt riêng từng kho hoặc chọn nhiều đơn đã soạn của cùng khách. Hóa đơn và ảnh đã chốt được lưu bất biến.
        </p>
      </div>

      <InvoicesBoard />
    </>
  );
}
