import Link from "next/link";
import Image from "next/image";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ChartNoAxesCombined,
  ChevronRight,
  Factory,
  Images,
  Scissors,
  UserRound,
  UsersRound,
} from "lucide-react";

type MenuCard = {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  cardClass: string;
  iconBoxClass: string;
  iconClass: string;
  dividerClass: string;
  arrowClass: string;
};

const cards: MenuCard[] = [
  {
    href: "/azalas/patterns/create",
    title: "Thêm rập mới",
    description: "Tạo hàng nhà hoặc khách đặt",
    icon: Scissors,
    cardClass:
      "border-blue-200/90 bg-[linear-gradient(135deg,rgba(255,255,255,.98),rgba(239,247,255,.95))] shadow-[0_16px_38px_rgba(37,99,235,.10)]",
    iconBoxClass: "bg-blue-100/90",
    iconClass: "text-blue-600",
    dividerClass: "bg-blue-200",
    arrowClass: "bg-blue-100 text-blue-600 group-hover:bg-blue-600 group-hover:text-white",
  },
  {
    href: "/azalas/patterns/progress",
    title: "Tiến độ đơn",
    description: "Lọc xưởng và kiểm tra số lượng nhận",
    icon: ChartNoAxesCombined,
    cardClass:
      "border-emerald-200/90 bg-[linear-gradient(135deg,rgba(255,255,255,.98),rgba(239,255,246,.94))] shadow-[0_16px_38px_rgba(16,185,129,.10)]",
    iconBoxClass: "bg-emerald-100/90",
    iconClass: "text-emerald-600",
    dividerClass: "bg-emerald-200",
    arrowClass: "bg-emerald-100 text-emerald-600 group-hover:bg-emerald-600 group-hover:text-white",
  },
  {
    href: "/azalas/patterns/customer",
    title: "Khách đặt",
    description: "Theo dõi đơn khách đặt bị trễ",
    icon: UsersRound,
    cardClass:
      "border-orange-200/90 bg-[linear-gradient(135deg,rgba(255,255,255,.98),rgba(255,247,237,.95))] shadow-[0_16px_38px_rgba(249,115,22,.10)]",
    iconBoxClass: "bg-orange-100/90",
    iconClass: "text-orange-500",
    dividerClass: "bg-orange-200",
    arrowClass: "bg-orange-100 text-orange-500 group-hover:bg-orange-500 group-hover:text-white",
  },
  {
    href: "/azalas/patterns/houses",
    title: "Nhà may",
    description: "Danh sách nhà may và đơn đang làm",
    icon: Factory,
    cardClass:
      "border-violet-200/90 bg-[linear-gradient(135deg,rgba(255,255,255,.98),rgba(248,245,255,.96))] shadow-[0_16px_38px_rgba(124,58,237,.10)]",
    iconBoxClass: "bg-violet-100/90",
    iconClass: "text-violet-600",
    dividerClass: "bg-violet-200",
    arrowClass: "bg-violet-100 text-violet-600 group-hover:bg-violet-600 group-hover:text-white",
  },
  {
    href: "/azalas/patterns/cutters",
    title: "Thợ cắt",
    description: "Quản lý thợ cắt",
    icon: Scissors,
    cardClass:
      "border-rose-200/90 bg-[linear-gradient(135deg,rgba(255,255,255,.98),rgba(255,241,245,.95))] shadow-[0_16px_38px_rgba(244,63,94,.10)]",
    iconBoxClass: "bg-rose-100/90",
    iconClass: "text-rose-500",
    dividerClass: "bg-rose-200",
    arrowClass: "bg-rose-100 text-rose-500 group-hover:bg-rose-500 group-hover:text-white",
  },
  {
    href: "/azalas/patterns/catalog",
    title: "Mã rập / Ảnh",
    description: "Danh mục mã rập, mẫu và giá vốn",
    icon: Images,
    cardClass:
      "border-cyan-200/90 bg-[linear-gradient(135deg,rgba(255,255,255,.98),rgba(239,251,255,.96))] shadow-[0_16px_38px_rgba(6,182,212,.10)]",
    iconBoxClass: "bg-cyan-100/90",
    iconClass: "text-cyan-600",
    dividerClass: "bg-cyan-200",
    arrowClass: "bg-cyan-100 text-cyan-600 group-hover:bg-cyan-600 group-hover:text-white",
  },
];

export default function PatternsPage() {
  return (
    <main className="relative overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_85%_8%,rgba(219,234,254,.75),transparent_28%),linear-gradient(180deg,#f8fbff_0%,#eef6ff_100%)] px-4 py-5 sm:px-7 sm:py-7 lg:px-10 lg:py-9">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -left-20 top-40 h-72 w-72 rounded-full bg-blue-100/50 blur-3xl"
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
              XƯỞNG / SẢN XUẤT
            </div>

            <h1 className="mt-2 text-[34px] font-black leading-none tracking-[-1px] text-[#0d2346] sm:text-[48px] lg:text-[54px]">
              Quản lý rập
            </h1>

            <p className="mt-4 max-w-[760px] text-[15px] font-semibold leading-7 text-slate-500 sm:text-[18px]">
              Hàng nhà, khách đặt, nhà may và thợ cắt — chia thành các màn hình riêng.
            </p>
          </div>

          <div className="hidden shrink-0 lg:block">
            <div className="relative h-[190px] w-[440px] xl:h-[220px] xl:w-[520px]">
              <Image
                src="/patterns-hero.png"
                alt=""
                fill
                priority
                sizes="520px"
                className="object-contain object-right-top"
              />
            </div>
          </div>
        </div>

        <section className="mt-8 grid grid-cols-1 gap-4 sm:mt-10 sm:grid-cols-2 sm:gap-5 xl:grid-cols-3 xl:gap-6">
          {cards.map((card) => {
            const Icon = card.icon;

            return (
              <Link
                key={card.href}
                href={card.href}
                className={`group relative flex min-h-[146px] items-center rounded-[26px] border p-5 transition duration-200 hover:-translate-y-1 hover:shadow-[0_22px_45px_rgba(15,23,42,.12)] sm:min-h-[164px] sm:p-6 ${card.cardClass}`}
              >
                <div
                  className={`grid h-[78px] w-[78px] shrink-0 place-items-center rounded-[22px] sm:h-[88px] sm:w-[88px] ${card.iconBoxClass}`}
                >
                  <Icon
                    className={`h-10 w-10 sm:h-12 sm:w-12 ${card.iconClass}`}
                    strokeWidth={2.4}
                  />
                </div>

                <div
                  aria-hidden="true"
                  className={`mx-5 h-[78px] w-px shrink-0 sm:mx-6 sm:h-[92px] ${card.dividerClass}`}
                />

                <div className="min-w-0 flex-1 pr-12">
                  <h2 className="text-[21px] font-black leading-tight tracking-[-0.3px] text-[#0d2346] sm:text-[25px]">
                    {card.title}
                  </h2>
                  <p className="mt-2 max-w-[260px] text-[14px] font-semibold leading-5 text-slate-500 sm:text-[16px] sm:leading-6">
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
