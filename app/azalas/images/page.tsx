import Link from "next/link";
import {
  ArrowLeft,
  Images,
  ImagePlus,
  Search,
} from "lucide-react";
import ImagesLibrary from "./images-library";

export default function Page() {
  return (
    <main className="relative overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_86%_5%,rgba(219,234,254,.78),transparent_28%),linear-gradient(180deg,#f8fbff_0%,#eef6ff_100%)] px-4 py-5 sm:px-7 sm:py-7 lg:px-10 lg:py-9">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 top-40 h-72 w-72 rounded-full bg-blue-100/55 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-[-70px] top-[-60px] h-80 w-80 rounded-full bg-cyan-100/45 blur-3xl"
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
              THƯ VIỆN ẢNH
            </div>

            <h1 className="mt-2 text-[34px] font-black leading-none tracking-[-1px] text-[#0d2346] sm:text-[48px] lg:text-[54px]">
              Kho ảnh khách đặt
            </h1>

            <p className="mt-4 max-w-[760px] text-[15px] font-semibold leading-7 text-slate-500 sm:text-[18px]">
              Tìm nhanh ảnh theo khách hàng, mã đơn hoặc ngày tạo.
            </p>
          </div>

          <div className="hidden shrink-0 lg:flex">
            <div className="relative flex h-[190px] w-[390px] items-center justify-center">
              <div className="absolute h-[170px] w-[330px] rounded-[44px] bg-gradient-to-br from-blue-100 via-white to-cyan-100 shadow-[0_20px_55px_rgba(37,99,235,.12)]" />

              <div className="relative -rotate-6 rounded-[24px] bg-white p-4 shadow-[0_14px_32px_rgba(37,99,235,.12)]">
                <Images className="h-14 w-14 text-blue-600" strokeWidth={1.9} />
              </div>

              <div className="relative ml-4 rotate-6 rounded-[24px] bg-white p-4 shadow-[0_14px_32px_rgba(6,182,212,.12)]">
                <ImagePlus className="h-14 w-14 text-cyan-600" strokeWidth={1.9} />
              </div>

              <div className="absolute bottom-8 right-10 grid h-12 w-12 place-items-center rounded-2xl bg-white text-blue-600 shadow-lg">
                <Search className="h-6 w-6" strokeWidth={2.3} />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 sm:mt-10">
          <ImagesLibrary />
        </div>
      </div>
    </main>
  );
}
