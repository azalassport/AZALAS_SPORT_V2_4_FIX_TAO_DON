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

function warehousePriority(name: string, code?: string) {
  const key = `${name} ${code || ""}`.toLowerCase();

  if (code === "TX" || key.includes("tân xuân") || key.includes("tan xuan")) {
    return 0;
  }

  if (code === "CK" || key.includes("cá koi") || key.includes("ca koi")) {
    return 1;
  }

  if (name === "Khách đặt") return 2;

  return 10;
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
  const [actionOpenId, setActionOpenId] = useState(0);

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
    setActionOpenId(0);
  }

  return (
    <div className="mx-auto w-full max-w-[1580px] pb-10">
      <div className="mb-6">
        <Link
          href="/azalas"
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2 text-[13px] font-black text-blue-700 shadow-[0_5px_14px_rgba(37,99,235,0.08)] transition hover:-translate-y-0.5 hover:border-blue-300 hover:bg-blue-50 sm:min-h-[46px] sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-[15px]"
        >
          <span className="grid h-7 w-7 place-items-center rounded-md bg-blue-50 text-blue-700 sm:h-8 sm:w-8 sm:rounded-lg">
            <ArrowLeft className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={2.7} />
          </span>
          Quay lại
        </Link>

        <div className="mt-3 text-center sm:mt-4">
          <h1 className="text-[25px] font-black uppercase leading-none tracking-[-0.5px] text-[#102b55] sm:text-[40px] sm:tracking-[-0.7px]">
            Chi tiết đơn
          </h1>

        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-4 lg:grid-cols-4">
        {TABS.map((item) => {
          const selected = tab === item.code;

          return (
            <button
              key={item.code}
              type="button"
              onClick={() => setTab(item.code)}
              className="grid min-h-[56px] grid-cols-[32px_1fr_28px] items-center gap-1.5 rounded-xl border px-2.5 text-center shadow-[0_5px_16px_rgba(29,65,119,0.04)] transition hover:-translate-y-0.5 sm:min-h-[78px] sm:grid-cols-[48px_1fr_40px] sm:gap-3 sm:rounded-2xl sm:px-4 sm:shadow-[0_7px_22px_rgba(29,65,119,0.04)]"
              style={{
                borderColor: selected ? item.accent : item.border,
                background: selected ? "#ffffff" : item.soft,
                boxShadow: selected
                  ? `0 0 0 1px ${item.accent}22, 0 10px 24px ${item.accent}12`
                  : undefined,
              }}
            >
              <span
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg sm:h-12 sm:w-12 sm:rounded-xl"
                style={{ background: item.soft, color: item.accent }}
              >
                <ClipboardList className="h-5 w-5 sm:h-[26px] sm:w-[26px]" strokeWidth={2.2} />
              </span>

              <span
                className="min-w-0 text-center text-[12px] font-black leading-tight sm:text-[17px]"
                style={{ color: selected ? item.accent : "#102b55" }}
              >
                {item.label}
              </span>

              <span
                className="grid min-w-[26px] place-items-center rounded-lg px-1 py-1 text-[12px] font-black sm:min-w-[38px] sm:rounded-xl sm:px-2 sm:py-2 sm:text-[16px]"
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

      <div className="relative mt-3 sm:mt-5">
        <Search
          size={20}
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 sm:left-5 sm:h-6 sm:w-6"
        />
        <input
          className="h-[48px] w-full rounded-xl border border-slate-300 bg-white pl-11 pr-4 text-[14px] font-medium text-slate-900 shadow-[0_5px_14px_rgba(26,62,115,0.04)] outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-4 focus:ring-blue-100 sm:h-[58px] sm:rounded-2xl sm:pl-14 sm:pr-5 sm:text-[17px]"
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
        {Array.from(warehouseGroups.entries())
          .sort(([, a], [, b]) => {
            const aRank = warehousePriority(a.warehouse?.name || "Khách đặt", a.warehouse?.code);
            const bRank = warehousePriority(b.warehouse?.name || "Khách đặt", b.warehouse?.code);

            if (aRank !== bRank) return aRank - bRank;

            return (a.warehouse?.name || "Khách đặt").localeCompare(
              b.warehouse?.name || "Khách đặt",
              "vi",
            );
          })
          .map(([warehouseName, entry]) => {
            const palette = paletteForWarehouse(
              warehouseName,
              entry.warehouse?.code,
            );

            return (
              <section
                key={warehouseName}
                className="overflow-hidden rounded-[18px] border p-3 shadow-[0_7px_20px_rgba(28,69,128,0.04)] sm:rounded-[22px] sm:p-5 sm:shadow-[0_10px_28px_rgba(28,69,128,0.045)]"
                style={{
                  borderColor: palette.border,
                  background: palette.panel,
                }}
              >
                <div className="flex items-center gap-2.5 sm:gap-4">
                  <div
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg sm:h-12 sm:w-12 sm:rounded-xl"
                    style={{
                      background: palette.soft,
                      color: palette.accent,
                    }}
                  >
                    <Home className="h-5 w-5 sm:h-[27px] sm:w-[27px]" strokeWidth={2.4} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2
                        className="m-0 text-[20px] font-black tracking-[-0.25px] sm:text-[25px] sm:tracking-[-0.4px]"
                        style={{ color: palette.accentDark }}
                      >
                        {warehouseName}
                        {entry.warehouse?.code
                          ? ` (${entry.warehouse.code})`
                          : ""}
                      </h2>

                      <span
                        className="rounded-lg px-2.5 py-1 text-[12px] font-black sm:rounded-xl sm:px-3 sm:py-1.5 sm:text-[15px]"
                        style={{
                          color: palette.accentDark,
                          background: palette.badge,
                        }}
                      >
                        {entry.rows.length} đơn
                      </span>
                    </div>

                    <p className="mt-0.5 text-[12px] font-medium leading-4 text-slate-500 sm:mt-1 sm:text-[15px] sm:leading-normal">
                      {warehouseName === "Khách đặt"
                        ? "Danh sách đơn khách đặt"
                        : `Danh sách đơn cần soạn tại kho ${warehouseName}`}
                    </p>
                  </div>

                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg sm:h-10 sm:w-10 sm:rounded-xl"
                    style={{
                      color: palette.accentDark,
                      background: palette.badge,
                    }}
                  >
                    <ChevronUp className="h-4 w-4 sm:h-[21px] sm:w-[21px]" strokeWidth={2.5} />
                  </span>
                </div>

                <div className="mt-3 grid gap-2.5 sm:mt-5 sm:gap-4 xl:grid-cols-3 md:grid-cols-2">
                  {entry.rows.map((unit) => {
                    const group = groupMap.get(unit.group_id)!;

                    return (
                      <article
                        key={unit.id}
                        className="flex min-h-[150px] flex-col rounded-xl border border-slate-200 bg-white p-3.5 shadow-[0_5px_14px_rgba(26,62,115,0.055)] sm:min-h-[205px] sm:rounded-2xl sm:p-5 sm:shadow-[0_8px_22px_rgba(26,62,115,0.07)]"
                        style={{
                          borderLeftWidth: 4,
                          borderLeftColor: palette.accent,
                        }}
                      >
                        <div className="flex items-start justify-between gap-2 sm:gap-3">
                          <strong className="break-all text-[14px] font-black text-[#102b55] sm:text-[17px]">
                            {unit.order_code}
                          </strong>

                          {group.is_urgent && (
                            <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-red-50 px-2 py-1 text-[11px] font-black text-red-600 sm:gap-1.5 sm:rounded-lg sm:px-3 sm:py-1.5 sm:text-[13px]">
                              <Flame
                                className="h-3.5 w-3.5 text-orange-500 sm:h-4 sm:w-4"
                                size={16}
                                fill="currentColor"
                              />
                              GẤP
                            </span>
                          )}
                        </div>

                        <p className="mt-2 text-[16px] font-black text-[#102b55] sm:mt-4 sm:text-[20px]">
                          {group.customer_name}
                        </p>

                        <div className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-slate-500 sm:mt-2 sm:gap-2 sm:text-[15px]">
                          <CalendarDays
                            size={15}
                            className="text-[#143d73] sm:h-[17px] sm:w-[17px]"
                          />
                          Ngày giao:{" "}
                          {group.delivery_date
                            ? day(group.delivery_date)
                            : "Chưa chọn"}
                        </div>

                        {unit.status === "DANG_SOAN" && (
                          <p className="mt-1.5 text-[12px] font-semibold text-orange-700 sm:mt-2 sm:text-[14px]">
                            Người soạn: {unit.started_by_name || "Chưa rõ"}
                          </p>
                        )}

                        {unit.status === "NO_DON" && (
                          <p className="mt-2 text-[14px] font-semibold text-orange-700">
                            Người chuyển nợ:{" "}
                            {unit.deferred_by_name || "Chưa rõ"}
                          </p>
                        )}

                        <div className="mt-auto border-t border-slate-200 pt-2.5 sm:pt-4">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/azalas/orders/${unit.id}/pack`}
                              className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-extrabold text-white shadow-sm transition hover:brightness-105 sm:min-h-[44px] sm:gap-2 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-[14px]"
                              style={{
                                background: `linear-gradient(135deg, ${palette.accent}, ${palette.accentDark})`,
                              }}
                            >
                              <Eye className="h-4 w-4 sm:h-[18px] sm:w-[18px]" strokeWidth={2.4} />
                              Xem đơn
                            </Link>

                            {(unit.status !== "NO_DON" ||
                              role === "OWNER" ||
                              role === "ADMIN") && (
                              <button
                                type="button"
                                title="Mở thao tác đơn"
                                aria-label="Mở thao tác đơn"
                                disabled={busyId === unit.id}
                                onClick={() =>
                                  setActionOpenId((current) =>
                                    current === unit.id ? 0 : unit.id,
                                  )
                                }
                                className={
                                  "grid h-[38px] w-[38px] shrink-0 place-items-center rounded-lg border transition disabled:opacity-50 sm:h-[44px] sm:w-[44px] sm:rounded-xl " +
                                  (actionOpenId === unit.id
                                    ? "border-red-300 bg-red-50 text-red-600"
                                    : "border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600")
                                }
                              >
                                <Trash2 className="h-4 w-4 sm:h-[19px] sm:w-[19px]" strokeWidth={2.2} />
                              </button>
                            )}
                          </div>

                          {actionOpenId === unit.id && (
                            <div className="mt-2 grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-2 sm:grid-cols-2">
                              {unit.status !== "NO_DON" ? (
                                <button
                                  type="button"
                                  disabled={busyId === unit.id}
                                  onClick={() => void act(unit.id, "defer")}
                                  className="min-h-[42px] rounded-lg border border-amber-200 bg-white px-3 py-2 text-[14px] font-black text-amber-700 transition hover:bg-amber-50 disabled:opacity-50"
                                >
                                  Nợ đơn
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled
                                  className="min-h-[42px] rounded-lg border border-slate-200 bg-slate-100 px-3 py-2 text-[14px] font-black text-slate-400"
                                >
                                  Đã nợ đơn
                                </button>
                              )}

                              {(role === "OWNER" || role === "ADMIN") && (
                                <button
                                  type="button"
                                  disabled={busyId === unit.id}
                                  onClick={() => void act(unit.id, "delete")}
                                  className="inline-flex min-h-[42px] items-center justify-center gap-2 rounded-lg border border-red-200 bg-white px-3 py-2 text-[14px] font-black text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                                >
                                  <Trash2 size={16} />
                                  Xóa mềm
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            );
          })}
      </div>

      <p className="mt-5 text-[12px] text-slate-400">
        Bản TEST hiển thị tối đa 200 nhóm đơn gần nhất. Danh sách Hóa đơn sẽ lấy
        riêng các đơn ĐÃ SOẠN chưa chốt.
      </p>
    </div>
  );
}
