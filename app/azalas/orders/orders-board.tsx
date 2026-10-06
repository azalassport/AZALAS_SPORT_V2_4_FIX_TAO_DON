"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { day } from "@/lib/azalas/format";
import {
  ArrowLeft,
  CalendarDays,
  ChevronUp,
  ClipboardList,
  Eye,
  Flame,
  Home,
  Search,
  Trash2,
} from "lucide-react";

type Group = {
  id: number;
  customer_name: string;
  order_type: "THUONG" | "KHACH_DAT";
  is_urgent: boolean;
  delivery_date: string | null;
  created_at: string;
  creator_note: string | null;
};

type Unit = {
  id: number;
  group_id: number;
  warehouse_id: number | null;
  order_code: string;
  status: string;
  started_by_name: string | null;
  deferred_by_name: string | null;
  created_at: string;
};

type Warehouse = {
  id: number;
  name: string;
  code: string;
};

type Tab = "MOI" | "DANG_SOAN" | "NO_DON" | "KHACH_DAT";

const TABS: {
  code: Tab;
  label: string;
  accent: string;
  soft: string;
  border: string;
}[] = [
  {
    code: "MOI",
    label: "Đơn Mới",
    accent: "#1769f6",
    soft: "#eaf2ff",
    border: "#83adff",
  },
  {
    code: "DANG_SOAN",
    label: "Đang Soạn",
    accent: "#e87900",
    soft: "#fff2df",
    border: "#f6d5a3",
  },
  {
    code: "NO_DON",
    label: "Đơn Nợ",
    accent: "#ef233c",
    soft: "#ffecef",
    border: "#ffc8cf",
  },
  {
    code: "KHACH_DAT",
    label: "Khách Đặt",
    accent: "#6d28d9",
    soft: "#f3eaff",
    border: "#ddc8ff",
  },
];

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function paletteForWarehouse(name: string, code?: string) {
  const key = `${name} ${code || ""}`.toLowerCase();

  if (key.includes("tân xuân") || key.includes("tan xuan") || code === "TX") {
    return {
      accent: "#0a9b63",
      accentDark: "#067848",
      soft: "#ecfbf4",
      panel: "#f3fff9",
      border: "#acebd0",
      badge: "#d6f7e7",
    };
  }

  if (key.includes("cá koi") || key.includes("ca koi") || code === "CK") {
    return {
      accent: "#7c3aed",
      accentDark: "#5f23c8",
      soft: "#f5efff",
      panel: "#fbf8ff",
      border: "#ddd0ff",
      badge: "#eadcff",
    };
  }

  if (name === "Khách đặt") {
    return {
      accent: "#6d28d9",
      accentDark: "#551db6",
      soft: "#f5efff",
      panel: "#fbf8ff",
      border: "#dfd0ff",
      badge: "#eadcff",
    };
  }

  return {
    accent: "#1769f6",
    accentDark: "#0e52c2",
    soft: "#edf5ff",
    panel: "#f7fbff",
    border: "#cfe0f7",
    badge: "#dceaff",
  };
}

export default function OrdersBoard() {
  const sb = useMemo(() => createClient(), []);

  const [groups, setGroups] = useState<Group[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [role, setRole] = useState("");
  const [tab, setTab] = useState<Tab>("MOI");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(0);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");

    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      setError("Chưa đăng nhập");
      setLoading(false);
      return;
    }

    const [{ data: p }, { data: g, error: ge }, { data: w, error: we }] =
      await Promise.all([
        sb.from("az_profiles").select("role").eq("id", user.id).single(),
        sb
          .from("order_groups")
          .select(
            "id,customer_name,order_type,is_urgent,delivery_date,created_at,creator_note",
          )
          .order("created_at", { ascending: false })
          .limit(200),
        sb.from("az_warehouses").select("id,name,code"),
      ]);

    if (ge || we) {
      setError(ge?.message || we?.message || "");
      setLoading(false);
      return;
    }

    const groupIds = (g || []).map((x) => x.id);

    const { data: u, error: ue } = groupIds.length
      ? await sb
          .from("order_units")
          .select(
            "id,group_id,warehouse_id,order_code,status,started_by_name,deferred_by_name,created_at",
          )
          .in("group_id", groupIds)
          .order("created_at", { ascending: true })
          .limit(1000)
      : { data: [] as Unit[], error: null };

    setRole(p?.role || "");
    setGroups(g || []);
    setWarehouses(w || []);
    setUnits((u || []) as Unit[]);

    if (ue) setError(ue.message);
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const groupMap = useMemo(
    () => new Map(groups.map((group) => [group.id, group])),
    [groups],
  );

  const whMap = useMemo(
    () => new Map(warehouses.map((warehouse) => [warehouse.id, warehouse])),
    [warehouses],
  );

  const tabCounts = useMemo(() => {
    const result: Record<Tab, number> = {
      MOI: 0,
      DANG_SOAN: 0,
      NO_DON: 0,
      KHACH_DAT: 0,
    };

    for (const unit of units) {
      const group = groupMap.get(unit.group_id);
      if (!group) continue;

      if (
        group.order_type === "KHACH_DAT" &&
        unit.status !== "DA_XOA" &&
        unit.status !== "DA_SOAN"
      ) {
        result.KHACH_DAT += 1;
        continue;
      }

      if (group.order_type !== "THUONG") continue;

      if (unit.status === "MOI") result.MOI += 1;
      if (unit.status === "DANG_SOAN") result.DANG_SOAN += 1;
      if (unit.status === "NO_DON") result.NO_DON += 1;
    }

    return result;
  }, [groupMap, units]);

  const visible = useMemo(() => {
    const needle = normalizeText(search.trim());

    return units
      .filter((unit) => {
        const group = groupMap.get(unit.group_id);
        if (!group) return false;

        if (tab === "KHACH_DAT") {
          if (
            group.order_type !== "KHACH_DAT" ||
            unit.status === "DA_XOA" ||
            unit.status === "DA_SOAN"
          ) {
            return false;
          }
        } else if (group.order_type !== "THUONG" || unit.status !== tab) {
          return false;
        }

        const haystack = normalizeText(
          `${unit.order_code} ${group.customer_name} ${
            whMap.get(unit.warehouse_id || -1)?.name || ""
          }`,
        );

        return haystack.includes(needle);
      })
      .sort((a, b) => {
        const ga = groupMap.get(a.group_id)!;
        const gb = groupMap.get(b.group_id)!;

        return (
          Number(gb.is_urgent) - Number(ga.is_urgent) ||
          +new Date(a.created_at) - +new Date(b.created_at)
        );
      });
  }, [groupMap, search, tab, units, whMap]);

  const warehouseGroups = useMemo(() => {
    const result = new Map<
      string,
      { warehouse: Warehouse | null; rows: Unit[] }
    >();

    for (const unit of visible) {
      const warehouse = whMap.get(unit.warehouse_id || -1) || null;
      const key = warehouse?.name || "Khách đặt";
      const current = result.get(key);

      if (current) {
        current.rows.push(unit);
      } else {
        result.set(key, { warehouse, rows: [unit] });
      }
    }

    return result;
  }, [visible, whMap]);

  async function act(id: number, action: "defer" | "delete") {
    if (
      !confirm(
        action === "delete"
          ? "Xóa mềm đơn này?"
          : "Chuyển đơn sang Nợ đơn?",
      )
    ) {
      return;
    }

    setBusyId(id);
    setError("");

    const { error: e } =
      action === "delete"
        ? await sb.rpc("az_soft_delete_order", {
            p_unit_id: id,
            p_reason: "Xóa từ Chi tiết đơn",
          })
        : await sb.rpc("az_defer_order", { p_unit_id: id });

    if (e) setError(e.message);
    else await reload();

    setBusyId(0);
  }

  return (
    <div className="mx-auto w-full max-w-[1580px] pb-10">
      <div className="mb-5">
        <Link
          href="/azalas"
          className="inline-flex items-center gap-2 text-[16px] font-extrabold text-blue-700 transition hover:text-blue-800"
        >
          <ArrowLeft size={19} strokeWidth={2.5} />
          Quay lại
        </Link>

        <h1 className="mt-5 text-[38px] font-black leading-none tracking-[-0.8px] text-[#102b55]">
          Chi tiết đơn
        </h1>

        <p className="mt-3 text-[16px] font-medium text-slate-500">
          Đơn Mới · Đang Soạn · Đơn Nợ · Khách Đặt
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {TABS.map((item) => {
          const selected = tab === item.code;

          return (
            <button
              key={item.code}
              type="button"
              onClick={() => setTab(item.code)}
              className="flex min-h-[78px] items-center gap-4 rounded-2xl border px-4 text-left shadow-[0_7px_22px_rgba(29,65,119,0.04)] transition hover:-translate-y-0.5"
              style={{
                borderColor: selected ? item.accent : item.border,
                background: selected ? "#ffffff" : item.soft,
                boxShadow: selected
                  ? `0 0 0 1px ${item.accent}22, 0 10px 24px ${item.accent}12`
                  : undefined,
              }}
            >
              <span
                className="grid h-12 w-12 shrink-0 place-items-center rounded-xl"
                style={{ background: item.soft, color: item.accent }}
              >
                <ClipboardList size={26} strokeWidth={2.2} />
              </span>

              <span
                className="min-w-0 flex-1 text-[17px] font-black"
                style={{ color: selected ? item.accent : "#102b55" }}
              >
                {item.label}
              </span>

              <span
                className="grid min-w-[38px] place-items-center rounded-xl px-2 py-2 text-[16px] font-black"
                style={{
                  background: selected ? item.soft : `${item.accent}12`,
                  color: item.accent,
                }}
              >
                {tabCounts[item.code]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative mt-5">
        <Search
          size={24}
          className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-500"
        />
        <input
          className="h-[58px] w-full rounded-2xl border border-slate-300 bg-white pl-14 pr-5 text-[17px] font-medium text-slate-900 shadow-[0_6px_18px_rgba(26,62,115,0.04)] outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
          placeholder="Tìm tên khách / mã đơn / kho"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </div>

      {error && (
        <p className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-[15px] font-bold text-red-800">
          {error}
        </p>
      )}

      {loading && (
        <p className="mt-5 rounded-2xl border bg-white p-6 text-[16px] font-semibold text-slate-500">
          Đang tải đơn...
        </p>
      )}

      {!loading && visible.length === 0 && (
        <p className="mt-5 rounded-2xl border bg-white p-7 text-[16px] font-semibold text-slate-500">
          Không có đơn phù hợp.
        </p>
      )}

      <div className="mt-5 space-y-6">
        {Array.from(warehouseGroups.entries()).map(
          ([warehouseName, entry]) => {
            const palette = paletteForWarehouse(
              warehouseName,
              entry.warehouse?.code,
            );

            return (
              <section
                key={warehouseName}
                className="overflow-hidden rounded-[22px] border p-4 shadow-[0_10px_28px_rgba(28,69,128,0.045)] sm:p-5"
                style={{
                  borderColor: palette.border,
                  background: palette.panel,
                }}
              >
                <div className="flex items-center gap-4">
                  <div
                    className="grid h-12 w-12 shrink-0 place-items-center rounded-xl"
                    style={{
                      background: palette.soft,
                      color: palette.accent,
                    }}
                  >
                    <Home size={27} strokeWidth={2.4} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2
                        className="m-0 text-[25px] font-black tracking-[-0.4px]"
                        style={{ color: palette.accentDark }}
                      >
                        {warehouseName}
                        {entry.warehouse?.code
                          ? ` (${entry.warehouse.code})`
                          : ""}
                      </h2>

                      <span
                        className="rounded-xl px-3 py-1.5 text-[15px] font-black"
                        style={{
                          color: palette.accentDark,
                          background: palette.badge,
                        }}
                      >
                        {entry.rows.length} đơn
                      </span>
                    </div>

                    <p className="mt-1 text-[15px] font-medium text-slate-500">
                      {warehouseName === "Khách đặt"
                        ? "Danh sách đơn khách đặt"
                        : `Danh sách đơn cần soạn tại kho ${warehouseName}`}
                    </p>
                  </div>

                  <span
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
                    style={{
                      color: palette.accentDark,
                      background: palette.badge,
                    }}
                  >
                    <ChevronUp size={21} strokeWidth={2.5} />
                  </span>
                </div>

                <div className="mt-5 grid gap-4 xl:grid-cols-3 md:grid-cols-2">
                  {entry.rows.map((unit) => {
                    const group = groupMap.get(unit.group_id)!;

                    return (
                      <article
                        key={unit.id}
                        className="flex min-h-[205px] flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_8px_22px_rgba(26,62,115,0.07)]"
                        style={{
                          borderLeftWidth: 4,
                          borderLeftColor: palette.accent,
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <strong className="break-all text-[17px] font-black text-[#102b55]">
                            {unit.order_code}
                          </strong>

                          {group.is_urgent && (
                            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-[13px] font-black text-red-600">
                              <Flame
                                size={16}
                                className="text-orange-500"
                                fill="currentColor"
                              />
                              GẤP
                            </span>
                          )}
                        </div>

                        <p className="mt-4 text-[20px] font-black text-[#102b55]">
                          {group.customer_name}
                        </p>

                        <div className="mt-2 flex items-center gap-2 text-[15px] font-medium text-slate-500">
                          <CalendarDays
                            size={17}
                            className="text-[#143d73]"
                          />
                          Ngày giao:{" "}
                          {group.delivery_date
                            ? day(group.delivery_date)
                            : "Chưa chọn"}
                        </div>

                        {unit.status === "DANG_SOAN" && (
                          <p className="mt-2 text-[14px] font-semibold text-orange-700">
                            Người soạn: {unit.started_by_name || "Chưa rõ"}
                          </p>
                        )}

                        {unit.status === "NO_DON" && (
                          <p className="mt-2 text-[14px] font-semibold text-orange-700">
                            Người chuyển nợ:{" "}
                            {unit.deferred_by_name || "Chưa rõ"}
                          </p>
                        )}

                        <div className="mt-auto flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                          <Link
                            href={`/azalas/orders/${unit.id}/pack`}
                            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-extrabold text-white shadow-sm transition hover:brightness-105"
                            style={{
                              background: `linear-gradient(135deg, ${palette.accent}, ${palette.accentDark})`,
                            }}
                          >
                            <Eye size={18} strokeWidth={2.4} />
                            {unit.status === "DANG_SOAN"
                              ? "Soạn tiếp"
                              : unit.status === "NO_DON"
                                ? "Bắt đầu soạn lại"
                                : "Xem đơn / Bắt đầu soạn"}
                          </Link>

                          {unit.status !== "NO_DON" && (
                            <button
                              type="button"
                              disabled={busyId === unit.id}
                              onClick={() => void act(unit.id, "defer")}
                              className="min-h-[44px] rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[14px] font-bold text-[#17345f] transition hover:bg-slate-50 disabled:opacity-50"
                            >
                              Nợ đơn
                            </button>
                          )}

                          {(role === "OWNER" || role === "ADMIN") && (
                            <button
                              type="button"
                              disabled={busyId === unit.id}
                              onClick={() => void act(unit.id, "delete")}
                              className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2.5 text-[14px] font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                            >
                              <Trash2 size={17} />
                              Xóa mềm
                            </button>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          },
        )}
      </div>

      <p className="mt-5 text-[12px] text-slate-400">
        Bản TEST hiển thị tối đa 200 nhóm đơn gần nhất. Danh sách Hóa đơn sẽ lấy
        riêng các đơn ĐÃ SOẠN chưa chốt.
      </p>
    </div>
  );
}
