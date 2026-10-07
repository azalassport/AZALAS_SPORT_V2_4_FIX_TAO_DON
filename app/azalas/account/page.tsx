import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PersonalAccount from "./personal-account";

export default function AccountPage() {
  return (
    <>
      <div className="mb-6 sm:mb-7">
        <Link
          href="/azalas"
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-[13px] font-black text-blue-700 shadow-[0_5px_14px_rgba(37,99,235,0.08)] transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 sm:min-h-[46px] sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-[15px]"
        >
          <span className="grid h-7 w-7 place-items-center rounded-md bg-blue-50 text-blue-700 sm:h-8 sm:w-8 sm:rounded-lg">
            <ArrowLeft
              className="h-4 w-4 sm:h-[18px] sm:w-[18px]"
              strokeWidth={2.7}
            />
          </span>
          Quay lại
        </Link>

        <div className="mt-4 text-center">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-700 sm:text-[12px] sm:tracking-[0.2em]">
            HỆ THỐNG
          </div>

          <h1 className="mt-2 text-[28px] font-black uppercase leading-tight tracking-[-0.7px] text-slate-950 sm:text-[42px] sm:tracking-[-1.2px]">
            Tài khoản cá nhân
          </h1>
        </div>
      </div>

      <PersonalAccount />
    </>
  );
}
