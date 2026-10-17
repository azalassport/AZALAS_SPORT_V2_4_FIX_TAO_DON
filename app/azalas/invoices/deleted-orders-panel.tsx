"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ClipboardList, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dt, norm } from "@/lib/azalas/format";

type DeletedOrderUnit = {
  id: number;
  group_id: number;
  warehouse_id: number | null;
  order_code: string;
  deleted_at: string | null;
  delete_reason: string | null;
  created_at: string;
  completed_at: string | null;
  started_by_name: string | null;
};

type DeletedOrderGroup = {
  id: number;
  root_code: string;
  customer_name: string;
};

type Warehouse = { id: number; name: string };

type DeletedOrderView = DeletedOrderUnit & {
  root_code: string;
  customer_name: string;
  warehouse_name: string;
};

/**
 * Hien thi don ORDER_UNITS da xoa mem, ke ca khi ban nhap hoa don
 * da bi huy/xoa theo az_invoice_cancel_linked_order_draft.
 * Khong sua du lieu, khong khoi phuc don, khong lien quan cong no.
 */
export default function DeletedOrdersPanel({ search }: { search: string }) {
  const sb = useMemo(() => createClient(), []);
  const [orders, setOrders] = useState<DeletedOrderView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function loadDeletedOrders() {
      setLoading(true);
      setError("");

      // Lay truc tiep tu order_units: hoa don NHAP da huy thi khong con trong invoices.
      const unitResult = await sb
        .from("order_units")
        .select("id,group_id,warehouse_id,order_code,deleted_at,delete_reason,created_at,completed_at,started_by_name")
        .eq("status", "DA_XOA")
        .order("deleted_at", { ascending: false, nullsFirst: false })
        .limit(500);

      if (!active) return;
      if (unitResult.error) {
        setError("Không tải được đơn đã xóa: " + unitResult.error.message);
        setOrders([]);
        setLoading(false);
        return;
      }

      const units = (unitResult.data || []) as DeletedOrderUnit[];
      if (!units.length) {
        setOrders([]);
        setLoading(false);
        return;
      }

      const groupIds = [...new Set(units.map((u) => u.group_id))];
      const warehouseIds = [
        ...new Set(units.map((u) => u.warehouse_id).filter((id): id is number => id !== null)),
      ];

      const [groupResult, warehouseResult] = await Promise.all([
        sb.from("order_groups")
          .select("id,root_code,customer_name")
          .in("id", groupIds),
        warehouseIds.length
          ? sb.from("az_warehouses").select("id,name").in("id", warehouseIds)
          : Promise.resolve({ data: [] as Warehouse[], error: null }),
      ]);

      if (!active) return;
      if (groupResult.error || warehouseResult.error) {
        setError(
          "Không tải đủ khách hàng/kho của đơn đã xóa: " +
          (groupResult.error?.message || warehouseResult.error?.message || "Lỗi không xác định"),
        );
        setOrders([]);
        setLoading(false);
        return;
      }

      const groups = new Map(
        ((groupResult.data || []) as DeletedOrderGroup[]).map((g) => [g.id, g]),
      );
      const warehouses = new Map(
        ((warehouseResult.data || []) as Warehouse[]).map((w) => [w.id, w.name]),
      );

      setOrders(units.map((u) => ({
        ...u,
        root_code: groups.get(u.group_id)?.root_code || "—",
        customer_name: groups.get(u.group_id)?.customer_name || "Không rõ khách hàng",
        warehouse_name: u.warehouse_id === null
          ? "Khách đặt"
          : warehouses.get(u.warehouse_id) || "Kho chưa xác định",
      })));
      setLoading(false);
    }

    void loadDeletedOrders();
    return () => { active = false; };
  }, [sb]);

  const q = norm(search);
  const filteredOrders = orders.filter((order) => norm(
    [order.order_code, order.root_code, order.customer_name,
      order.warehouse_name, order.delete_reason || ""].join(" "),
  ).includes(q));

  return (
    <section className="rounded-[22px] border border-rose-100 bg-white p-4 shadow-[0_12px_34px_rgba(30,98,193,0.07)] sm:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-rose-50 text-rose-600">
          <Trash2 size={24} strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[20px] font-black text-slate-950 sm:text-[22px]">
            Đơn hàng đã xóa
          </h2>
          <p className="mt-1 text-[13px] font-medium text-slate-500 sm:text-[14px]">
            Gồm cả đơn bị hủy từ hóa đơn nháp. Đơn chỉ bị xóa mềm, vẫn giữ lịch sử.
          </p>
        </div>
        {!loading && !error && (
          <span className="ml-auto rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-[13px] font-extrabold text-rose-700">
            {filteredOrders.length} đơn
          </span>
        )}
      </div>

      {loading && (
        <p className="rounded-xl bg-slate-50 p-5 text-[15px] text-slate-600">Đang tải danh sách đơn đã xóa...</p>
      )}
      {!loading && error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-[15px] font-semibold text-red-700">
          {error}
        </p>
      )}
      {!loading && !error && !filteredOrders.length && (
        <p className="rounded-xl border border-dashed border-rose-200 bg-rose-50/40 p-6 text-center text-[15px] text-slate-600">
          {orders.length ? "Không có đơn đã xóa phù hợp với từ khóa." : "Chưa có đơn hàng bị xóa mềm."}
        </p>
      )}

      {!loading && !error && filteredOrders.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredOrders.map((order) => (
            <article key={order.id} className="rounded-2xl border border-rose-100 bg-rose-50/30 p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <strong className="break-all text-[17px] font-black text-rose-800">
                  {order.order_code}
                </strong>
                <span className="rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-[12px] font-extrabold text-rose-700">
                  Đã xóa
                </span>
              </div>
              <p className="mt-2 text-[17px] font-extrabold text-slate-900">{order.customer_name}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[14px] text-slate-700">
                <ClipboardList size={17} className="shrink-0 text-rose-600" />
                <span>{order.warehouse_name}</span>
                <span aria-hidden="true">·</span>
                <span>Đơn gốc: {order.root_code}</span>
              </div>
              <p className="mt-2 flex items-center gap-2 text-[13px] text-slate-500">
                <CalendarDays size={16} className="shrink-0" />
                Xóa lúc: {dt(order.deleted_at || order.created_at)}
              </p>
              <div className="mt-3 rounded-xl border border-rose-100 bg-white p-3">
                <p className="text-[12px] font-extrabold uppercase tracking-wide text-slate-500">Lý do xóa</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-[15px] font-semibold text-slate-800">
                  {order.delete_reason?.trim() || "Không ghi lý do"}
                </p>
              </div>
            </article>
          ))}
        </div>
      )}
      <p className="mt-4 text-[12px] text-slate-400">
        Hiển thị tối đa 500 đơn bị xóa mềm gần nhất. Danh sách này chỉ để tra cứu, không tự khôi phục đơn.
      </p>
    </section>
  );
}
