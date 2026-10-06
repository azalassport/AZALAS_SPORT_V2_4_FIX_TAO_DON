"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
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
};

type DebtRow = {
  customer_id: number;
  balance: number;
};

const PAGE_SIZE = 40;
const MAX_CUSTOMERS = 2000;

export default function CustomersBoard() {
  const sb = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Customer[]>([]);
  const [debt, setDebt] = useState<Record<number, number>>({});
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
          "id,customer_code,name,phone,address,transport_station,transport_phone",
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
        return;
      }

      const { data: debtData, error: debtError } = await sb.rpc(
        "az_customer_debt_page",
        {
          p_customer_ids: customers.map((customer) => customer.id),
        },
      );

      if (debtError) {
        setErr(debtError.message);
        return;
      }

      const nextDebt = Object.fromEntries(
        ((debtData || []) as DebtRow[]).map((row) => [
          Number(row.customer_id),
          Number(row.balance) || 0,
        ]),
      );

      setDebt(nextDebt);
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

  const totalDebt = useMemo(
    () =>
      filteredAndSorted.reduce(
        (sum, customer) => sum + (debt[customer.id] ?? 0),
        0,
      ),
    [filteredAndSorted, debt],
  );

  return (
    <div className="stack">
      <CustomerForm
        onCreated={() => {
          setPage(0);
          void reload();
        }}
      />

      <section className="panel stack">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="eyebrow">KHÁCH HÀNG</div>
            <h2 className="mt-1 text-2xl font-black">
              Danh sách khách hàng
            </h2>
            <p className="muted mt-1 text-sm">
              Công nợ được sắp xếp từ cao xuống thấp.
            </p>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3 text-right">
            <p className="text-xs font-bold text-amber-700">
              TỔNG CÔNG NỢ ĐANG HIỂN THỊ
            </p>
            <p className="mt-1 text-2xl font-black text-amber-800">
              {totalDebt.toLocaleString("vi-VN")}đ
            </p>
          </div>
        </div>

        <input
          className="field text-base"
          placeholder="Tìm theo mã khách, tên, SĐT, địa chỉ hoặc chành xe..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />

        <Msg error={err} />
        {loading && <Loading />}

        {!loading && (
          <div className="az-table-wrap">
            <table className="az-table">
              <thead>
                <tr>
                  <th className="text-base">Mã KH</th>
                  <th className="text-base">Tên khách hàng</th>
                  <th className="text-base">Công nợ</th>
                  <th className="text-center text-base">Chi tiết</th>
                </tr>
              </thead>

              <tbody>
                {pageRows.map((customer) => {
                  const balance = debt[customer.id] ?? 0;

                  return (
                    <tr key={customer.id}>
                      <td className="whitespace-nowrap text-base font-bold">
                        {customer.customer_code}
                      </td>

                      <td className="text-base font-black">
                        {customer.name}
                      </td>

                      <td
                        className={`whitespace-nowrap text-lg font-black ${
                          balance < 0
                            ? "text-emerald-700"
                            : "text-red-700"
                        }`}
                      >
                        {balance < 0 ? "Dư " : ""}
                        {Math.abs(balance).toLocaleString("vi-VN")}đ
                      </td>

                      <td className="text-center">
                        <Link
                          className="btn soft px-4 py-2 text-base font-bold"
                          href={`/azalas/customers/${customer.id}`}
                        >
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
      </section>
    </div>
  );
}
