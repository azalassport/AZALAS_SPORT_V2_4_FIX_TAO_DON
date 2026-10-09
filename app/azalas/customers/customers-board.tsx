"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CircleAlert,
  Clock3,
  Eye,
  Search,
  UsersRound,
  WalletCards,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { norm } from "@/lib/azalas/format";
import { Loading, Msg } from "@/components/ui";
import CustomerForm from "./customer-form";

type Customer = {
  id: number;
  customer_code: string;
  name: string;
  phone: string | null;
  address: string | null;
  transport_station: string | null;
  transport_phone: string | null;
  created_at: string;
};

type DebtRow = {
  customer_id: number;
  balance: number;
};

type LastOrderRow = {
  customer_id: number;
  last_order_at: string | null;
};

const PAGE_SIZE = 40;
const MAX_CUSTOMERS = 2000;

function olderThanOneMonth(value: string | null | undefined) {
  if (!value) return false;

  const source = new Date(value);
  if (Number.isNaN(source.getTime())) return false;

  const threshold = new Date();
  threshold.setMonth(threshold.getMonth() - 1);

  return source.getTime() < threshold.getTime();
}

function shortDate(value: string | null | undefined) {
  if (!value) return "chưa có đơn";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "không rõ";

  return new Intl.DateTimeFormat("vi-VN", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export default function CustomersBoard() {
  const sb = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Customer[]>([]);
  const [debt, setDebt] = useState<Record<number, number>>({});
  const [lastOrder, setLastOrder] = useState<Record<number, string | null>>({});
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    setErr("");

    try {
      const { data, error } = await sb
        .from("az_customers")
        .select(
          "id,customer_code,name,phone,address,transport_station,transport_phone,created_at",
        )
        .order("id", { ascending: false })
        .limit(MAX_CUSTOMERS);

      if (error) {
        setErr(error.message);
        return;
      }

      const customers = (data || []) as Customer[];
      setRows(customers);

      if (!customers.length) {
        setDebt({});
        setLastOrder({});
        return;
      }

      const customerIds = customers.map((customer) => customer.id);

      const [debtResult, activityResult] = await Promise.all([
        sb.rpc("az_customer_debt_page", {
          p_customer_ids: customerIds,
        }),
        sb.rpc("az_customer_last_order_page", {
          p_customer_ids: customerIds,
        }),
      ]);

      if (debtResult.error) {
        setErr(debtResult.error.message);
        return;
      }

      if (activityResult.error) {
        setErr(
          "Chưa tải được cảnh báo khách lâu ngày không mua: " +
            activityResult.error.message,
        );
        return;
      }

      const nextDebt = Object.fromEntries(
        ((debtResult.data || []) as DebtRow[]).map((row) => [
          Number(row.customer_id),
          Number(row.balance) || 0,
        ]),
      );

      const nextLastOrder = Object.fromEntries(
        ((activityResult.data || []) as LastOrderRow[]).map((row) => [
          Number(row.customer_id),
          row.last_order_at || null,
        ]),
      );

      setDebt(nextDebt);
      setLastOrder(nextLastOrder);
    } finally {
      setLoading(false);
    }
  }, [sb]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    setPage(0);
  }, [query]);

  const filteredAndSorted = useMemo(() => {
    const keyword = norm(query.trim());

    return rows
      .filter((customer) => {
        if (!keyword) return true;

        return norm(
          [
            customer.customer_code,
            customer.name,
            customer.phone || "",
            customer.address || "",
            customer.transport_station || "",
            customer.transport_phone || "",
          ].join(" "),
        ).includes(keyword);
      })
      .sort((a, b) => {
        const debtA = debt[a.id] ?? 0;
        const debtB = debt[b.id] ?? 0;

        if (debtB !== debtA) return debtB - debtA;
        return a.name.localeCompare(b.name, "vi");
      });
  }, [rows, debt, query]);

  const pageCount = Math.max(
    1,
    Math.ceil(filteredAndSorted.length / PAGE_SIZE),
  );

  const safePage = Math.min(page, pageCount - 1);

  const pageRows = filteredAndSorted.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE,
  );

  const stats = useMemo(() => {
    let totalDebt = 0;
    let debtCustomers = 0;
    let overdueCustomers = 0;

    for (const customer of filteredAndSorted) {
      const balance = debt[customer.id] ?? 0;

      if (balance > 0) {
        totalDebt += balance;
        debtCustomers += 1;

        const lastActivity =
          lastOrder[customer.id] ?? customer.created_at;

        if (olderThanOneMonth(lastActivity)) {
          overdueCustomers += 1;
        }
      }
    }

    return {
      totalDebt,
      debtCustomers,
      overdueCustomers,
    };
  }, [filteredAndSorted, debt, lastOrder]);

  return (
    <div className="space-y-5">
      <div className="rounded-[24px] border border-blue-100 bg-white/90 p-4 shadow-[0_14px_34px_rgba(37,99,235,.07)] sm:p-5">
        <CustomerForm
          onCreated={() => {
            setPage(0);
            void reload();
          }}
        />
      </div>

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white/95 shadow-[0_18px_48px_rgba(15,23,42,.07)]">
        <div className="border-b border-slate-100 bg-gradient-to-br from-white via-blue-50/40 to-cyan-50/50 px-4 py-5 sm:px-6 sm:py-6">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="inline-flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-blue-100 text-blue-700 shadow-[0_8px_18px_rgba(37,99,235,.10)]">
                  <UsersRound size={24} strokeWidth={2.4} />
                </div>

                <div>
                  <div className="text-[11px] font-black uppercase tracking-[0.17em] text-blue-700">
                    KHÁCH HÀNG
                  </div>
                  <h2 className="mt-1 text-[25px] font-black tracking-[-0.5px] text-[#0d2346] sm:text-[31px]">
                    Danh sách khách hàng
                  </h2>
                </div>
              </div>

              <p className="mt-3 text-[13px] font-semibold text-slate-500 sm:text-[14px]">
                Công nợ được sắp xếp từ cao xuống thấp.
              </p>
            </div>

            <div className="text-left lg:text-right">
              <div className="text-[12px] font-black uppercase tracking-[0.12em] text-slate-400">
                Tổng khách đang hiển thị
              </div>
              <div className="mt-1 text-[30px] font-black tracking-[-0.7px] text-[#0d2346]">
                {filteredAndSorted.length}
              </div>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-4 shadow-[0_10px_26px_rgba(245,158,11,.08)] sm:p-5">
              <div className="flex items-center gap-2 text-amber-700">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100">
                  <WalletCards size={18} strokeWidth={2.4} />
                </div>
                <span className="text-[11px] font-black uppercase tracking-[0.08em]">
                  Tổng công nợ
                </span>
              </div>
              <div className="mt-3 text-[26px] font-black tracking-[-0.6px] text-amber-900 sm:text-[30px]">
                {stats.totalDebt.toLocaleString("vi-VN")}đ
              </div>
            </div>

            <div className="rounded-[22px] border border-blue-200 bg-gradient-to-br from-blue-50 to-white p-4 shadow-[0_10px_26px_rgba(37,99,235,.08)] sm:p-5">
              <div className="flex items-center gap-2 text-blue-700">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-blue-100">
                  <UsersRound size={18} strokeWidth={2.4} />
                </div>
                <span className="text-[11px] font-black uppercase tracking-[0.08em]">
                  Khách đang nợ
                </span>
              </div>
              <div className="mt-3 text-[26px] font-black tracking-[-0.6px] text-blue-900 sm:text-[30px]">
                {stats.debtCustomers}
              </div>
            </div>

            <div className="rounded-[22px] border border-rose-200 bg-gradient-to-br from-rose-50 to-white p-4 shadow-[0_10px_26px_rgba(244,63,94,.08)] sm:p-5">
              <div className="flex items-center gap-2 text-rose-700">
                <div className="grid h-9 w-9 place-items-center rounded-xl bg-rose-100">
                  <Clock3 size={18} strokeWidth={2.4} />
                </div>
                <span className="text-[11px] font-black uppercase tracking-[0.08em]">
                  Nợ quá 1 tháng
                </span>
              </div>
              <div className="mt-3 text-[26px] font-black tracking-[-0.6px] text-rose-900 sm:text-[30px]">
                {stats.overdueCustomers}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4 p-4 sm:p-6">
          <div className="relative">
            <Search
              size={20}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              className="field !h-12 !rounded-2xl !border-slate-200 !bg-slate-50/70 !pl-11 text-[14px] transition focus:!border-blue-300 focus:!bg-white sm:!h-14 sm:!pl-12 sm:text-base"
              placeholder="Tìm theo mã khách, tên, SĐT, địa chỉ hoặc chành xe..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <Msg error={err} />
          {loading && <Loading />}

          {!loading && (
            <>
              <div className="hidden overflow-hidden rounded-[20px] border border-slate-200 md:block">
                <table className="az-table">
                  <thead>
                    <tr className="bg-slate-50/90">
                      <th className="text-sm font-black text-slate-600 sm:text-base">
                        Mã KH
                      </th>
                      <th className="text-sm font-black text-slate-600 sm:text-base">
                        Tên khách hàng
                      </th>
                      <th className="text-sm font-black text-slate-600 sm:text-base">
                        Công nợ
                      </th>
                      <th className="text-center text-sm font-black text-slate-600 sm:text-base">
                        Chi tiết
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {pageRows.map((customer) => {
                      const balance = debt[customer.id] ?? 0;
                      const lastActivity =
                        lastOrder[customer.id] ?? customer.created_at;
                      const overdue =
                        balance > 0 && olderThanOneMonth(lastActivity);

                      const overdueTitle = overdue
                        ? `Khách còn nợ và đã hơn 1 tháng chưa mua hàng. Lần mua gần nhất: ${shortDate(
                            lastOrder[customer.id],
                          )}`
                        : undefined;

                      return (
                        <tr key={customer.id} className="transition hover:bg-blue-50/35">
                          <td className="whitespace-nowrap text-sm font-black text-[#0d2346] sm:text-base">
                            {customer.customer_code}
                          </td>

                          <td className="text-sm font-black text-[#0d2346] sm:text-base">
                            {customer.name}
                          </td>

                          <td className="whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              <span
                                className={`text-[15px] font-black sm:text-lg ${
                                  balance < 0
                                    ? "text-emerald-700"
                                    : balance > 0
                                      ? "text-red-700"
                                      : "text-slate-500"
                                }`}
                              >
                                {balance < 0 ? "Dư " : ""}
                                {Math.abs(balance).toLocaleString("vi-VN")}đ
                              </span>

                              {overdue && (
                                <span
                                  title={overdueTitle}
                                  aria-label={overdueTitle}
                                  className="grid h-7 w-7 place-items-center rounded-full bg-red-50 text-red-600 ring-1 ring-red-200"
                                >
                                  <CircleAlert
                                    size={17}
                                    strokeWidth={2.6}
                                  />
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="text-center">
                            <Link
                              className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[13px] font-black text-blue-700 transition hover:-translate-y-0.5 hover:bg-blue-100 sm:min-h-[44px] sm:px-4 sm:text-[14px]"
                              href={`/azalas/customers/${customer.id}`}
                            >
                              <Eye size={16} strokeWidth={2.4} />
                              Xem
                            </Link>
                          </td>
                        </tr>
                      );
                    })}

                    {!pageRows.length && (
                      <tr>
                        <td colSpan={4} className="py-10 text-center">
                          <span className="text-sm font-semibold text-slate-400">
                            Không tìm thấy khách hàng phù hợp.
                          </span>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3 md:hidden">
                {pageRows.map((customer) => {
                  const balance = debt[customer.id] ?? 0;
                  const lastActivity =
                    lastOrder[customer.id] ?? customer.created_at;
                  const overdue =
                    balance > 0 && olderThanOneMonth(lastActivity);

                  return (
                    <Link
                      key={customer.id}
                      href={`/azalas/customers/${customer.id}`}
                      className="block rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,.05)] transition active:scale-[.99]"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-[12px] font-black uppercase tracking-[0.08em] text-blue-600">
                            {customer.customer_code}
                          </div>
                          <div className="mt-1 truncate text-[17px] font-black text-[#0d2346]">
                            {customer.name}
                          </div>
                        </div>

                        <Eye className="mt-1 h-5 w-5 shrink-0 text-blue-600" />
                      </div>

                      <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                        <span className="text-[12px] font-bold uppercase tracking-[0.06em] text-slate-400">
                          Công nợ
                        </span>

                        <div className="flex items-center gap-2">
                          <span
                            className={`text-[17px] font-black ${
                              balance < 0
                                ? "text-emerald-700"
                                : balance > 0
                                  ? "text-red-700"
                                  : "text-slate-500"
                            }`}
                          >
                            {balance < 0 ? "Dư " : ""}
                            {Math.abs(balance).toLocaleString("vi-VN")}đ
                          </span>

                          {overdue && (
                            <CircleAlert
                              size={18}
                              strokeWidth={2.6}
                              className="text-red-600"
                            />
                          )}
                        </div>
                      </div>
                    </Link>
                  );
                })}

                {!pageRows.length && (
                  <div className="rounded-[20px] border border-dashed border-slate-200 bg-white/70 p-8 text-center text-sm font-semibold text-slate-400">
                    Không tìm thấy khách hàng phù hợp.
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button
              className="btn"
              disabled={safePage === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              ← Trang trước
            </button>

            <span className="text-sm font-black text-slate-500">
              Trang {safePage + 1}/{pageCount} · {filteredAndSorted.length} khách
            </span>

            <button
              className="btn"
              disabled={safePage >= pageCount - 1}
              onClick={() =>
                setPage((current) => Math.min(pageCount - 1, current + 1))
              }
            >
              Trang sau →
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
