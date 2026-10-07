"use client";

import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Banknote,
  CalendarDays,
  ChartColumnBig,
  CircleDollarSign,
  FileCheck2,
  FileClock,
  PackageCheck,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  UserRoundCheck,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loading, Msg } from "@/components/ui";

type StatusRow = {
  key: string;
  label: string;
  value: number;
};

type DailyMoneyRow = {
  day: string;
  amount: number;
  orders: number;
};

type StockDayRow = {
  day: string;
  inbound: number;
  outbound: number;
};

type DebtSummary = {
  customer: number;
  house: number;
  materials: number;
  staff: number;
  total: number;
};

type ReportData = {
  from: string;
  to: string;
  generated_at: string;
  order_status: StatusRow[];
  money_daily: DailyMoneyRow[];
  stock_daily: StockDayRow[];
  debt: DebtSummary;
};

type Preset = "TODAY" | "7D" | "30D" | "THIS_MONTH" | "LAST_MONTH";

const money = (value: number) =>
  `${Math.round(Number(value || 0)).toLocaleString("vi-VN")}đ`;

const qty = (value: number) =>
  Math.round(Number(value || 0)).toLocaleString("vi-VN");

function isoInVietnam(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value || "";

  return `${get("year")}-${get("month")}-${get("day")}`;
}

function isoLocalDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dateLabel(value: string) {
  const [y, m, d] = value.split("-");
  return y && m && d ? `${d}/${m}` : value;
}

function fullDateLabel(value: string) {
  const [y, m, d] = value.split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
}

function presetRange(preset: Preset) {
  const todayIso = isoInVietnam();
  const [year, month, day] = todayIso.split("-").map(Number);
  const today = new Date(year, month - 1, day);

  if (preset === "TODAY") {
    return { from: todayIso, to: todayIso };
  }

  if (preset === "7D" || preset === "30D") {
    const from = new Date(today);
    from.setDate(from.getDate() - (preset === "7D" ? 6 : 29));
    return { from: isoLocalDate(from), to: todayIso };
  }

  if (preset === "THIS_MONTH") {
    return {
      from: isoLocalDate(new Date(year, month - 1, 1)),
      to: todayIso,
    };
  }

  const lastMonthStart = new Date(year, month - 2, 1);
  const lastMonthEnd = new Date(year, month - 1, 0);

  return {
    from: isoLocalDate(lastMonthStart),
    to: isoLocalDate(lastMonthEnd),
  };
}

const statusIcons: Record<string, typeof ShoppingCart> = {
  MOI: ShoppingCart,
  DANG_SOAN: PackageCheck,
  HD_CHUA_GUI: FileClock,
  HD_DA_GUI: FileCheck2,
  NO_DON: ReceiptText,
  HUY: Trash2,
};

const statusTone: Record<string, string> = {
  MOI: "from-blue-600 to-cyan-500",
  DANG_SOAN: "from-orange-500 to-amber-400",
  HD_CHUA_GUI: "from-violet-600 to-purple-400",
  HD_DA_GUI: "from-emerald-600 to-green-400",
  NO_DON: "from-rose-600 to-red-400",
  HUY: "from-slate-600 to-slate-400",
};

function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof ChartColumnBig;
  title: string;
  description?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-700">
        <Icon size={22} strokeWidth={2.3} />
      </div>

      <div>
        <h2 className="text-[20px] font-black text-slate-950 sm:text-[24px]">
          {title}
        </h2>
        {description && (
          <p className="mt-0.5 text-[12px] font-medium text-slate-500 sm:text-[13px]">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}

function StatusChart({ rows }: { rows: StatusRow[] }) {
  const max = Math.max(1, ...rows.map((row) => Number(row.value || 0)));

  return (
    <div className="space-y-3">
      {rows.map((row) => {
        const Icon = statusIcons[row.key] || ChartColumnBig;
        const width =
          row.value <= 0 ? 0 : Math.max(8, (Number(row.value) / max) * 100);

        return (
          <div
            key={row.key}
            className="grid grid-cols-[118px_1fr_46px] items-center gap-3 sm:grid-cols-[150px_1fr_60px]"
          >
            <div className="flex items-center gap-2">
              <Icon size={17} className="shrink-0 text-slate-500" />
              <span className="truncate text-[12px] font-black text-slate-700 sm:text-[13px]">
                {row.label}
              </span>
            </div>

            <div className="h-3 overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full rounded-full bg-gradient-to-r ${
                  statusTone[row.key] || "from-blue-600 to-cyan-500"
                }`}
                style={{ width: `${width}%` }}
              />
            </div>

            <div className="text-right text-[14px] font-black text-slate-950">
              {qty(row.value)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MoneyChart({ rows }: { rows: DailyMoneyRow[] }) {
  const max = Math.max(1, ...rows.map((row) => Number(row.amount || 0)));
  const height = 164;

  return (
    <div className="overflow-x-auto pb-2">
      <div
        className="flex min-w-full items-end gap-2"
        style={{ width: Math.max(640, rows.length * 48) }}
      >
        {rows.map((row) => {
          const barHeight =
            row.amount <= 0
              ? 4
              : Math.max(8, (Number(row.amount) / max) * height);

          return (
            <div
              key={row.day}
              className="group flex min-w-[38px] flex-1 flex-col items-center justify-end"
              title={`${fullDateLabel(row.day)} · ${money(row.amount)} · ${qty(
                row.orders,
              )} đơn`}
            >
              <div className="mb-1 text-[10px] font-black text-blue-700 opacity-0 transition group-hover:opacity-100">
                {row.orders}
              </div>
              <div
                className="w-full max-w-[30px] rounded-t-lg bg-gradient-to-t from-blue-700 to-cyan-400 shadow-[0_5px_14px_rgba(37,99,235,0.16)]"
                style={{ height: barHeight }}
              />
              <div className="mt-2 whitespace-nowrap text-[10px] font-bold text-slate-500">
                {dateLabel(row.day)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StockChart({ rows }: { rows: StockDayRow[] }) {
  const max = Math.max(
    1,
    ...rows.flatMap((row) => [
      Number(row.inbound || 0),
      Number(row.outbound || 0),
    ]),
  );
  const height = 155;

  return (
    <div className="overflow-x-auto pb-2">
      <div
        className="flex min-w-full items-end gap-3"
        style={{ width: Math.max(640, rows.length * 62) }}
      >
        {rows.map((row) => (
          <div
            key={row.day}
            className="flex min-w-[50px] flex-1 flex-col items-center"
          >
            <div className="flex h-[160px] items-end gap-1.5">
              <div
                title={`Nhận vào: ${qty(row.inbound)}`}
                className="w-[16px] rounded-t-md bg-emerald-500"
                style={{
                  height:
                    row.inbound <= 0
                      ? 4
                      : Math.max(8, (row.inbound / max) * height),
                }}
              />
              <div
                title={`Bán ra: ${qty(row.outbound)}`}
                className="w-[16px] rounded-t-md bg-blue-600"
                style={{
                  height:
                    row.outbound <= 0
                      ? 4
                      : Math.max(8, (row.outbound / max) * height),
                }}
              />
            </div>

            <div className="mt-2 whitespace-nowrap text-[10px] font-bold text-slate-500">
              {dateLabel(row.day)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ReportsDashboard() {
  const sb = useMemo(() => createClient(), []);
  const initial = useMemo(() => presetRange("TODAY"), []);

  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [activePreset, setActivePreset] = useState<Preset | "CUSTOM">("TODAY");
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const load = useCallback(
    async (nextFrom = from, nextTo = to) => {
      setLoading(true);
      setErr("");

      if (!nextFrom || !nextTo) {
        setErr("Vui lòng chọn đủ Từ ngày và Đến ngày.");
        setLoading(false);
        return;
      }

      if (nextFrom > nextTo) {
        setErr("Từ ngày không được lớn hơn Đến ngày.");
        setLoading(false);
        return;
      }

      const { data: result, error } = await sb.rpc(
        "az_owner_report_dashboard",
        {
          p_from: nextFrom,
          p_to: nextTo,
        },
      );

      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }

      setData(result as ReportData);
      setLoading(false);
    },
    [sb, from, to],
  );

  useEffect(() => {
    void load(initial.from, initial.to);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function usePreset(preset: Preset) {
    const range = presetRange(preset);
    setFrom(range.from);
    setTo(range.to);
    setActivePreset(preset);
    void load(range.from, range.to);
  }

  const debtCards = data
    ? [
        {
          label: "Phải thu khách",
          value: data.debt.customer,
          icon: UsersRound,
          className: "border-blue-200 bg-blue-50 text-blue-800",
        },
        {
          label: "Nợ nhà may",
          value: data.debt.house,
          icon: ShoppingCart,
          className: "border-orange-200 bg-orange-50 text-orange-800",
        },
        {
          label: "Nợ phụ liệu",
          value: data.debt.materials,
          icon: WalletCards,
          className: "border-amber-200 bg-amber-50 text-amber-800",
        },
        {
          label: "Nợ nhân viên",
          value: data.debt.staff,
          icon: UserRoundCheck,
          className: "border-emerald-200 bg-emerald-50 text-emerald-800",
        },
        {
          label: "Tổng công nợ",
          value: data.debt.total,
          icon: CircleDollarSign,
          className: "border-red-200 bg-red-50 text-red-700",
        },
      ]
    : [];

  return (
    <div className="space-y-5">
      <section className="overflow-hidden rounded-[24px] bg-gradient-to-r from-[#0f1f46] via-[#234795] to-[#117c78] p-4 text-white shadow-[0_16px_38px_rgba(15,31,70,0.16)] sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-[20px] font-black sm:text-[24px]">
              <ChartColumnBig size={25} />
              Quản trị tổng
            </div>
            <p className="mt-1 text-[12px] font-semibold text-blue-100 sm:text-[13px]">
              Đơn hàng · dòng tiền · xuất nhập hàng · công nợ
            </p>
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-3 py-2 text-[12px] font-black">
            <ShieldCheck size={16} />
            OWNER ONLY
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {[
            ["TODAY", "Hôm nay"],
            ["7D", "7 ngày"],
            ["30D", "30 ngày"],
            ["THIS_MONTH", "Tháng này"],
            ["LAST_MONTH", "Tháng trước"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => usePreset(value as Preset)}
              className={`rounded-xl border px-3 py-2 text-[12px] font-black transition ${
                activePreset === value
                  ? "border-white bg-white text-blue-900"
                  : "border-white/20 bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              {label}
            </button>
          ))}

          <label className="relative">
            <CalendarDays
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-blue-700"
            />
            <input
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setActivePreset("CUSTOM");
              }}
              className="h-[38px] rounded-xl border-0 bg-white pl-9 pr-2 text-[12px] font-black text-slate-900 outline-none"
            />
          </label>

          <label className="relative">
            <CalendarDays
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-blue-700"
            />
            <input
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setActivePreset("CUSTOM");
              }}
              className="h-[38px] rounded-xl border-0 bg-white pl-9 pr-2 text-[12px] font-black text-slate-900 outline-none"
            />
          </label>

          <button
            type="button"
            disabled={loading}
            onClick={() => void load()}
            className="inline-flex h-[38px] items-center gap-2 rounded-xl bg-emerald-400 px-4 text-[12px] font-black text-emerald-950 transition hover:bg-emerald-300 disabled:opacity-50"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            Làm mới
          </button>
        </div>
      </section>

      <Msg error={err} />
      {loading && <Loading />}

      {!loading && data && (
        <>
          <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.045)] sm:p-5">
            <SectionTitle
              icon={ShoppingCart}
              title="1. Quản lý đơn hàng"
              description={`${fullDateLabel(data.from)} → ${fullDateLabel(
                data.to,
              )}`}
            />

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {data.order_status.map((row) => {
                const Icon = statusIcons[row.key] || ChartColumnBig;

                return (
                  <div
                    key={row.key}
                    className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="grid h-9 w-9 place-items-center rounded-xl bg-white text-blue-700 shadow-sm">
                        <Icon size={18} />
                      </div>
                      <div className="text-[24px] font-black text-slate-950">
                        {qty(row.value)}
                      </div>
                    </div>
                    <div className="mt-3 text-[12px] font-black text-slate-600">
                      {row.label}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              <h3 className="mb-4 text-[14px] font-black text-slate-800">
                Biểu đồ trạng thái đơn / hóa đơn
              </h3>
              <StatusChart rows={data.order_status} />
            </div>
          </section>

          <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.045)] sm:p-5">
            <SectionTitle
              icon={Banknote}
              title="2. Dòng tiền bán hàng"
              description="Tính theo hóa đơn Đã gửi trong khoảng ngày đã chọn"
            />

            <div className="mt-5 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <MoneyChart rows={data.money_daily} />
            </div>

            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[560px] border-collapse text-[13px]">
                <thead className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Ngày</th>
                    <th className="px-4 py-3 text-right">Số tiền trong ngày</th>
                    <th className="px-4 py-3 text-right">Số đơn trong ngày</th>
                  </tr>
                </thead>
                <tbody>
                  {data.money_daily.map((row) => (
                    <tr key={row.day} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-bold text-slate-700">
                        {fullDateLabel(row.day)}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-blue-700">
                        {money(row.amount)}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-slate-900">
                        {qty(row.orders)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.045)] sm:p-5">
            <SectionTitle
              icon={PackageCheck}
              title="3. Xuất nhập hàng"
              description="Nhận vào từ nút Nhận hàng · Bán ra từ số lượng trong đơn đã soạn xong"
            />

            <div className="mt-4 flex flex-wrap gap-4 text-[12px] font-black">
              <span className="inline-flex items-center gap-2 text-emerald-700">
                <span className="h-3 w-3 rounded-sm bg-emerald-500" />
                Nhận vào
              </span>
              <span className="inline-flex items-center gap-2 text-blue-700">
                <span className="h-3 w-3 rounded-sm bg-blue-600" />
                Bán ra
              </span>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
              <StockChart rows={data.stock_daily} />
            </div>

            <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200">
              <table className="w-full min-w-[560px] border-collapse text-[13px]">
                <thead className="bg-slate-50 text-left text-[11px] font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Ngày</th>
                    <th className="px-4 py-3 text-right">Nhận vào</th>
                    <th className="px-4 py-3 text-right">Bán ra</th>
                    <th className="px-4 py-3 text-right">Chênh lệch</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stock_daily.map((row) => (
                    <tr key={row.day} className="border-t border-slate-100">
                      <td className="px-4 py-3 font-bold text-slate-700">
                        {fullDateLabel(row.day)}
                      </td>
                      <td className="px-4 py-3 text-right font-black text-emerald-700">
                        <span className="inline-flex items-center gap-1">
                          <ArrowDownToLine size={14} />
                          {qty(row.inbound)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-black text-blue-700">
                        <span className="inline-flex items-center gap-1">
                          <ArrowUpFromLine size={14} />
                          {qty(row.outbound)}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-black ${
                          row.inbound - row.outbound >= 0
                            ? "text-emerald-700"
                            : "text-red-600"
                        }`}
                      >
                        {qty(row.inbound - row.outbound)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_30px_rgba(15,23,42,0.045)] sm:p-5">
            <SectionTitle
              icon={CircleDollarSign}
              title="4. Quản lý công nợ"
              description="Số dư công nợ hiện tại của toàn hệ thống"
            />

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {debtCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div
                    key={card.label}
                    className={`rounded-2xl border p-4 ${card.className}`}
                  >
                    <div className="flex items-center gap-2">
                      <Icon size={19} strokeWidth={2.3} />
                      <span className="text-[11px] font-black uppercase tracking-wide">
                        {card.label}
                      </span>
                    </div>
                    <div className="mt-3 break-all text-[22px] font-black sm:text-[24px]">
                      {money(card.value)}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
