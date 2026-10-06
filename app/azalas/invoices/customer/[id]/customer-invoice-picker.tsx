"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { dt, money } from "@/lib/azalas/format";
import { Loading, Msg } from "@/components/ui";

type Ready = {
  unit_id: number;
  order_code: string;
  customer_id: number;
  customer_name: string;
  warehouse_name: string;
  completed_at: string;
  packer_name: string;
  subtotal: number;
};

export default function CustomerInvoicePicker({ customerId }: { customerId: number }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const [rows, setRows] = useState<Ready[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    const [{ data, error: e }, { data: draft, error: draftError }] = await Promise.all([
      sb.rpc("az_invoice_ready_units"),
      sb
        .from("invoices")
        .select("id,invoice_code")
        .eq("customer_id", customerId)
        .eq("status", "CHUA_CHOT")
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (draftError) {
      setError(draftError.message);
      setLoading(false);
      return;
    }

    if (draft?.id) {
      router.replace(`/azalas/invoices/${draft.id}`);
      return;
    }

    if (e) {
      setError(e.message);
    } else {
      const all = ((data || []) as Ready[]).filter((x) => x.customer_id === customerId);
      setRows(all);
      setSelected(all.map((x) => x.unit_id));
    }
    setLoading(false);
  }, [customerId, router, sb]);

  useEffect(() => {
    void load();
  }, [load]);

  async function prepare() {
    if (!selected.length) return setError("Cần tick ít nhất một đơn để lập hóa đơn.");
    setBusy(true);
    setError("");
    const { data, error: e } = await sb.rpc("az_invoice_prepare_smart", {
      p_unit_ids: selected,
    });
    setBusy(false);
    if (e) return setError(e.message);
    router.push(`/azalas/invoices/${(data as { invoice_id: number }).invoice_id}`);
  }

  const total = rows
    .filter((x) => selected.includes(x.unit_id))
    .reduce((s, x) => s + Number(x.subtotal), 0);

  return (
    <div className="stack">
      <Msg error={error} />
      {loading ? (
        <Loading />
      ) : rows.length === 0 ? (
        <div className="panel muted">
          Không còn đơn đã soạn đang chờ của khách này. Nếu khách đã có bản nháp, hệ thống sẽ tự mở bản nháp đó thay vì tạo thêm hóa đơn mới.
        </div>
      ) : (
        <>
          <section className="panel stack">
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h2>{rows[0].customer_name}</h2>
                <p className="muted text-sm">
                  {rows.length} đơn đã soạn chờ lập hóa đơn. Mặc định tick toàn bộ; có thể bỏ tick đơn muốn để lại.
                </p>
              </div>
              <div className="flex gap-2">
                <button className="btn soft" onClick={() => setSelected(rows.map((r) => r.unit_id))}>
                  Tick tất cả
                </button>
                <button className="btn" onClick={() => setSelected([])}>
                  Bỏ tất cả
                </button>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2">
              {rows.map((r) => (
                <label
                  key={r.unit_id}
                  className={`flex cursor-pointer gap-3 rounded-xl border p-4 ${
                    selected.includes(r.unit_id) ? "border-blue-500 bg-blue-50" : "border-slate-200"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 size-5"
                    checked={selected.includes(r.unit_id)}
                    onChange={(e) =>
                      setSelected((ids) =>
                        e.target.checked ? [...ids, r.unit_id] : ids.filter((id) => id !== r.unit_id),
                      )
                    }
                  />
                  <div className="min-w-0">
                    <b className="break-all text-blue-900">{r.order_code}</b>
                    <p className="font-bold">Kho {r.warehouse_name}</p>
                    <p className="muted text-xs">
                      {r.packer_name || "Chưa rõ"} · {dt(r.completed_at)}
                    </p>
                    <p className="mt-2 font-extrabold">{money(r.subtotal)}</p>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <div>
                <p className="muted text-xs">Tổng của {selected.length} đơn đã tick</p>
                <p className="text-2xl font-black text-blue-900">{money(total)}</p>
              </div>
              <button className="btn primary" disabled={busy || !selected.length} onClick={prepare}>
                {busy ? "Đang lập..." : `Lập hóa đơn cho ${selected.length} đơn`}
              </button>
            </div>
          </section>
          <p className="muted text-sm">
            Các đơn không tick vẫn ở mục Chưa gửi. Nếu trong lúc thao tác khách vừa có một bản nháp khác, hệ thống sẽ mở bản nháp đó thay vì tạo bản nháp trùng.
          </p>
        </>
      )}
    </div>
  );
}
