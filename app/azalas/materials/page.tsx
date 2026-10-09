import Image from "next/image";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ChevronRight,
  Layers3,
  Link2,
  PackageOpen,
  Palette,
  Printer,
} from "lucide-react";

type MaterialCard = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  span: string;
  cardClass: string;
  iconBoxClass: string;
  iconClass: string;
  dividerClass: string;
  arrowClass: string;
};

const cards: MaterialCard[] = [
  {
    href: "/azalas/materials/daykeo",
    title: "Dây kéo",
    description: "Nhập hàng · Giá & Danh mục · Công nợ",
    icon: Link2,
    span: "xl:col-span-2",
    cardClass:
      "border-orange-200 bg-gradient-to-br from-white to-orange-50/80 shadow-[0_14px_34px_rgba(249,115,22,0.10)]",
    iconBoxClass: "bg-orange-100",
    iconClass: "text-orange-500",
    dividerClass: "bg-orange-200",
    arrowClass:
      "bg-orange-100 text-orange-500 group-hover:bg-orange-500 group-hover:text-white",
  },
  {
    href: "/azalas/materials/embroidery",
    title: "Thêu",
    description: "Chốt tháng · Ứng · Thanh toán",
    icon: Palette,
    span: "xl:col-span-2",
    cardClass:
      "border-blue-200 bg-gradient-to-br from-white to-blue-50/80 shadow-[0_14px_34px_rgba(37,99,235,0.10)]",
    iconBoxClass: "bg-blue-100",
    iconClass: "text-blue-600",
    dividerClass: "bg-blue-200",
    arrowClass:
      "bg-blue-100 text-blue-600 group-hover:bg-blue-600 group-hover:text-white",
  },
  {
    href: "/azalas/materials/printing/nhat",
    title: "Nhật - In",
    description: "Sổ riêng Nhật · PDF đối chiếu · Công nợ",
    icon: Printer,
    span: "xl:col-span-2",
    cardClass:
      "border-violet-200 bg-gradient-to-br from-white to-violet-50/80 shadow-[0_14px_34px_rgba(124,58,237,0.10)]",
    iconBoxClass: "bg-violet-100",
    iconClass: "text-violet-600",
    dividerClass: "bg-violet-200",
    arrowClass:
      "bg-violet-100 text-violet-600 group-hover:bg-violet-600 group-hover:text-white",
  },
  {
    href: "/azalas/materials/fabric",
    title: "Vải",
    description: "Nhập vải · Hàng trả · Thanh toán · Công nợ",
    icon: Layers3,
    span: "xl:col-span-3",
    cardClass:
      "border-emerald-200 bg-gradient-to-br from-white to-emerald-50/80 shadow-[0_14px_34px_rgba(16,185,129,0.10)]",
    iconBoxClass: "bg-emerald-100",
    iconClass: "text-emerald-600",
    dividerClass: "bg-emerald-200",
    arrowClass:
      "bg-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white",
  },
  {
    href: "/azalas/materials/printing/tung",
    title: "Tùng - In",
    description: "Sổ riêng Tùng · PDF đối chiếu · Công nợ",
    icon: PackageOpen,
    span: "xl:col-span-3",
    cardClass:
      "border-rose-200 bg-gradient-to-br from-white to-rose-50/80 shadow-[0_14px_34px_rgba(244,63,94,0.10)]",
    iconBoxClass: "bg-rose-100",
    iconClass: "text-rose-500",
    dividerClass: "bg-rose-200",
    arrowClass:
      "bg-rose-100 text-rose-500 group-hover:bg-rose-500 group-hover:text-white",
  },
];

export default function MaterialsPage() {
  return (
    <main className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(180deg,#f8fbff_0%,#eef6ff_100%)] px-4 py-5 sm:px-7 sm:py-7 lg:px-10 lg:py-9">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-24 top-40 h-72 w-72 rounded-full bg-blue-100/50 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 h-80 w-80 rounded-full bg-cyan-100/40 blur-3xl"
      />

      <div className="relative z-10">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <Link
              href="/azalas"
              className="inline-flex min-h-[42px] items-center gap-2 rounded-full border border-blue-300 bg-blue-50/90 px-4 py-2 text-[14px] font-black text-blue-700 shadow-[0_5px_14px_rgba(37,99,235,0.08)] transition hover:-translate-y-0.5 hover:bg-white sm:min-h-[46px] sm:px-5 sm:text-[15px]"
            >
              <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={2.7} />
              Quay lại
            </Link>

            <div className="mt-6 text-[13px] font-black uppercase tracking-[0.12em] text-blue-700 sm:text-[15px]">
              KHO / XƯỞNG
            </div>

            <h1 className="mt-2 text-[34px] font-black leading-none tracking-[-1px] text-[#0d2346] sm:text-[48px] lg:text-[54px]">
              Quản lý phụ liệu
            </h1>

            <p className="mt-4 max-w-[760px] text-[15px] font-semibold leading-7 text-slate-500 sm:text-[18px]">
              Chọn đúng sổ nghiệp vụ. Nhật - In và Tùng - In được tách riêng.
            </p>
          </div>

          <div className="hidden shrink-0 lg:block">
            <div className="relative h-[175px] w-[430px] xl:h-[205px] xl:w-[510px]">
              <Image
                src="/materials-hero.png"
                alt=""
                fill
                priority
                sizes="510px"
                className="object-contain object-right-top"
              />
            </div>
          </div>
        </div>

        <section className="mt-8 grid grid-cols-1 gap-4 sm:mt-10 sm:grid-cols-2 sm:gap-5 xl:grid-cols-6 xl:gap-6">
          {cards.map((card) => {
            const Icon = card.icon;

            return (
              <Link
                key={card.href}
                href={card.href}
                className={`group relative flex min-h-[146px] items-center rounded-[26px] border p-5 transition duration-200 hover:-translate-y-1 hover:shadow-[0_22px_45px_rgba(15,23,42,0.12)] sm:min-h-[164px] sm:p-6 ${card.span} ${card.cardClass}`}
              >
                <div
                  className={`grid h-[76px] w-[76px] shrink-0 place-items-center rounded-[22px] sm:h-[88px] sm:w-[88px] ${card.iconBoxClass}`}
                >
                  <Icon
                    className={`h-10 w-10 sm:h-12 sm:w-12 ${card.iconClass}`}
                    strokeWidth={2.4}
                  />
                </div>

                <div
                  aria-hidden="true"
                  className={`mx-4 h-[76px] w-px shrink-0 sm:mx-6 sm:h-[92px] ${card.dividerClass}`}
                />

                <div className="min-w-0 flex-1 pr-12">
                  <h2 className="text-[21px] font-black leading-tight tracking-[-0.3px] text-[#0d2346] sm:text-[25px]">
                    {card.title}
                  </h2>

                  <p className="mt-2 max-w-[360px] text-[14px] font-semibold leading-5 text-slate-500 sm:text-[16px] sm:leading-6">
                    {card.description}
                  </p>
                </div>

                <span
                  className={`absolute right-5 grid h-11 w-11 place-items-center rounded-full transition duration-200 sm:right-6 sm:h-12 sm:w-12 ${card.arrowClass}`}
                >
                  <ChevronRight className="h-6 w-6" strokeWidth={3} />
                </span>
              </Link>
            );
          })}
        </section>
      </div>
    </main>
  );
}
