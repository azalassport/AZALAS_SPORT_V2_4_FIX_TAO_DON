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
    <div className="stack">
      <CustomerForm
        onCreated={() => {
          setPage(0);
          void reload();
        }}
      />

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="border-b border-slate-100 bg-gradient-to-b from-white to-slate-50/70 px-4 py-5 sm:px-6 sm:py-6">
          <div className="text-center">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-blue-50 text-blue-700">
              <UsersRound size={24} strokeWidth={2.3} />
            </div>

            <div className="mt-3 text-[11px] font-black uppercase tracking-[0.18em] text-blue-700">
              KHÁCH HÀNG
            </div>

            <h2 className="mt-1 text-[24px] font-black tracking-[-0.4px] text-slate-950 sm:text-[30px]">
              Danh sách khách hàng
            </h2>

            <p className="mt-1 text-[13px] font-medium text-slate-500 sm:text-[14px]">
              Công nợ được sắp xếp từ cao xuống thấp.
            </p>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4">
              <div className="flex items-center gap-2 text-amber-700">
                <WalletCards size={18} strokeWidth={2.3} />
                <span className="text-[11px] font-black uppercase tracking-wide">
                  Tổng công nợ
                </span>
              </div>
              <div className="mt-2 text-[24px] font-black text-amber-800">
                {stats.totalDebt.toLocaleString("vi-VN")}đ
              </div>
            </div>

            <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-4">
              <div className="flex items-center gap-2 text-blue-700">
                <UsersRound size={18} strokeWidth={2.3} />
                <span className="text-[11px] font-black uppercase tracking-wide">
                  Khách đang nợ
                </span>
              </div>
              <div className="mt-2 text-[24px] font-black text-blue-800">
                {stats.debtCustomers}
              </div>
            </div>

            <div className="rounded-2xl border border-red-200 bg-red-50/70 p-4">
              <div className="flex items-center gap-2 text-red-600">
                <Clock3 size={18} strokeWidth={2.3} />
                <span className="text-[11px] font-black uppercase tracking-wide">
                  Nợ quá 1 tháng
                </span>
              </div>
              <div className="mt-2 text-[24px] font-black text-red-700">
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
              className="field !h-12 !rounded-xl !pl-11 text-[14px] sm:!h-14 sm:!rounded-2xl sm:!pl-12 sm:text-base"
              placeholder="Tìm theo mã khách, tên, SĐT, địa chỉ hoặc chành xe..."
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <Msg error={err} />
          {loading && <Loading />}

          {!loading && (
            <div className="az-table-wrap overflow-hidden rounded-2xl border border-slate-200">
              <table className="az-table">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-sm font-black sm:text-base">Mã KH</th>
                    <th className="text-sm font-black sm:text-base">
                      Tên khách hàng
                    </th>
                    <th className="text-sm font-black sm:text-base">
                      Công nợ
                    </th>
                    <th className="text-center text-sm font-black sm:text-base">
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
                      <tr key={customer.id}>
                        <td className="whitespace-nowrap text-sm font-bold sm:text-base">
                          {customer.customer_code}
                        </td>

                        <td className="text-sm font-black sm:text-base">
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
                            className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-[13px] font-black text-blue-700 transition hover:bg-blue-100 sm:min-h-[44px] sm:px-4 sm:text-[14px]"
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
                      <td colSpan={4} className="py-8 text-center">
                        <span className="muted">
                          Không tìm thấy khách hàng phù hợp.
                        </span>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <button
              className="btn"
              disabled={safePage === 0}
              onClick={() => setPage((current) => Math.max(0, current - 1))}
            >
              ← Trang trước
            </button>

            <span className="muted text-sm font-bold">
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
