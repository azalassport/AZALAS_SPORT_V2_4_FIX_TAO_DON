"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import DeletedOrdersPanel from "./deleted-orders-panel";
import {
  ArrowRight,
  CalendarDays,
  FileCheck2,
  FileText,
  Layers3,
  ReceiptText,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { dt, money, norm } from "@/lib/azalas/format";
import { Msg, Loading, ImageViewer } from "@/components/ui";

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

type Bill = {
  id: number;
  invoice_code: string;
  customer_id: number;
  customer_name: string;
  status: string;
  subtotal: number;
  old_debt_snapshot: number;
  invoice_image_path: string | null;
  created_at: string;
  finalized_at: string | null;
  deleted_at: string | null;
};

type CustomerGroup = {
  customerId: number;
  customerName: string;
  ready: Ready[];
  drafts: Bill[];
};

type TabValue = "CHUA_GUI" | "DA_GUI" | "DA_XOA";

const tabItems: {
  value: TabValue;
  label: string;
  icon: typeof FileText;
  boxClass: string;
  iconClass: string;
  textClass: string;
  activeClass: string;
}[] = [
  {
    value: "CHUA_GUI",
    label: "Chưa gửi đơn",
    icon: FileText,
    boxClass: "border-orange-200 bg-orange-50/70",
    iconClass: "bg-orange-500 text-white shadow-[0_8px_18px_rgba(249,115,22,0.18)]",
    textClass: "text-orange-900",
    activeClass: "ring-2 ring-orange-200 shadow-[0_10px_24px_rgba(249,115,22,0.10)]",
  },
  {
    value: "DA_GUI",
    label: "Đã gửi đơn",
    icon: FileCheck2,
    boxClass: "border-emerald-200 bg-emerald-50/70",
    iconClass: "bg-emerald-100 text-emerald-700",
    textClass: "text-emerald-900",
    activeClass: "ring-2 ring-emerald-200 shadow-[0_10px_24px_rgba(16,185,129,0.10)]",
  },
  {
    value: "DA_XOA",
    label: "Đã xóa đơn",
    icon: Trash2,
    boxClass: "border-rose-200 bg-rose-50/70",
    iconClass: "bg-rose-100 text-rose-600",
    textClass: "text-rose-900",
    activeClass: "ring-2 ring-rose-200 shadow-[0_10px_24px_rgba(244,63,94,0.10)]",
  },
];

export default function InvoicesBoard() {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();

  const [tab, setTab] = useState<TabValue>("CHUA_GUI");
  const [ready, setReady] = useState<Ready[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [picked, setPicked] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [urlMap, setUrlMap] = useState<Record<number, string>>({});

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr("");
    const [{ data: r, error: re }, { data: b, error: be }] = await Promise.all([
      sb.rpc("az_invoice_ready_units"),
      sb
        .from("invoices")
        .select(
          "id,invoice_code,customer_id,customer_name,status,subtotal,old_debt_snapshot,invoice_image_path,created_at,finalized_at,deleted_at",
        )
        .order("created_at", { ascending: false })
        .limit(250),
    ]);

    if (re || be) setErr(re?.message || be?.message || "");
    setReady((r || []) as Ready[]);
    setBills((b || []) as Bill[]);
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const active = bills.filter((b) => b.invoice_image_path && !urlMap[b.id]).slice(0, 40);
    if (!active.length) return;
    let live = true;

    (async () => {
      const pairs = await Promise.all(
        active.map(async (b) => {
          const { data } = await sb.storage
            .from("az-invoice-images")
            .createSignedUrl(b.invoice_image_path!, 1800);
          return [b.id, data?.signedUrl || ""] as const;
        }),
      );
      if (live) setUrlMap((m) => ({ ...m, ...Object.fromEntries(pairs) }));
    })();

    return () => {
      live = false;
    };
  }, [bills, sb, urlMap]);

  const draftCustomerIds = useMemo(
    () => new Set(bills.filter((b) => b.status === "CHUA_CHOT").map((b) => b.customer_id)),
    [bills],
  );

  useEffect(() => {
    setPicked((current) =>
      current.filter((unitId) => {
        const row = ready.find((r) => r.unit_id === unitId);
        return !!row && !draftCustomerIds.has(row.customer_id);
      }),
    );
  }, [draftCustomerIds, ready]);

  function pick(r: Ready) {
    setErr("");
    if (draftCustomerIds.has(r.customer_id)) {
      setErr("Khách này đã có bản nháp hóa đơn. Hãy mở bản nháp và tick đơn ở trong Chi tiết hóa đơn.");
      return;
    }
    const first = ready.find((x) => picked.includes(x.unit_id));
    if (first && first.customer_id !== r.customer_id && !picked.includes(r.unit_id)) {
      setErr("Chỉ chọn được đơn của cùng một khách. Các đơn không tick vẫn giữ nguyên trong danh sách.");
      return;
    }
    setPicked((v) =>
      v.includes(r.unit_id) ? v.filter((x) => x !== r.unit_id) : [...v, r.unit_id],
    );
  }

  async function prepare() {
    if (!picked.length) return;
    setBusy(true);
    setErr("");
    const { data, error } = await sb.rpc("az_invoice_prepare_smart", { p_unit_ids: picked });
    setBusy(false);
    if (error) {
      setErr(error.message);
      return;
    }
    const result = data as { invoice_id: number; existing_draft?: boolean };
    router.push(`/azalas/invoices/${result.invoice_id}`);
  }

  const q = norm(search);

  const customerGroups = useMemo(() => {
    const map = new Map<number, CustomerGroup>();

    ready.forEach((r) => {
      const current = map.get(r.customer_id) || {
        customerId: r.customer_id,
        customerName: r.customer_name,
        ready: [],
        drafts: [],
      };
      current.ready.push(r);
      map.set(r.customer_id, current);
    });

    bills
      .filter((b) => b.status === "CHUA_CHOT")
      .forEach((b) => {
        const current = map.get(b.customer_id) || {
          customerId: b.customer_id,
          customerName: b.customer_name,
          ready: [],
          drafts: [],
        };
        current.customerName = b.customer_name || current.customerName;
        current.drafts.push(b);
        map.set(b.customer_id, current);
      });

    return Array.from(map.values())
      .map((group) => ({
        ...group,
        ready: [...group.ready].sort((a, b) => a.unit_id - b.unit_id),
        drafts: [...group.drafts].sort((a, b) => b.id - a.id),
      }))
      .filter((group) =>
        norm(
          `${group.customerName} ${group.ready.map((r) => `${r.order_code} ${r.warehouse_name}`).join(" ")} ${group.drafts.map((b) => b.invoice_code).join(" ")}`,
        ).includes(q),
      )
      .sort((a, b) => a.customerName.localeCompare(b.customerName, "vi"));
  }, [bills, q, ready]);

  const billsFiltered = bills.filter(
    (b) =>
      (tab === "DA_GUI" ? b.status === "DA_GUI" : tab === "DA_XOA" ? b.status === "DA_XOA" : false) &&
      norm(`${b.invoice_code} ${b.customer_name}`).includes(q),
  );

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tabItems.map((item) => {
          const Icon = item.icon;
          const active = tab === item.value;
          return (
            <button
              key={item.value}
              type="button"
              aria-pressed={active}
              onClick={() => setTab(item.value)}
              className={`flex min-h-[72px] items-center justify-center gap-4 rounded-2xl border px-5 py-4 text-left transition hover:-translate-y-[1px] hover:shadow-md ${item.boxClass} ${active ? item.activeClass : ""}`}
            >
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${item.iconClass}`}>
                <Icon size={23} strokeWidth={2.25} />
              </span>
              <span className={`text-[17px] font-black sm:text-[18px] ${item.textClass}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="relative">
        <Search
          size={23}
          strokeWidth={2.1}
          className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-slate-500"
        />
        <input
          className="min-h-[58px] w-full rounded-2xl border border-blue-100 bg-white py-3 pl-14 pr-5 text-[16px] text-slate-800 outline-none shadow-[0_8px_28px_rgba(37,99,235,0.06)] transition placeholder:text-slate-400 focus:border-blue-300 focus:ring-4 focus:ring-blue-100/70"
          placeholder="Tìm khách / mã đơn / mã hóa đơn..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Msg error={err} />
      {loading && <Loading />}

      {tab === "CHUA_GUI" && !loading && (
        <section className="overflow-hidden rounded-[22px] border border-blue-100 bg-white shadow-[0_12px_34px_rgba(30,98,193,0.07)]">
          <div className="flex flex-col gap-4 border-b border-blue-100 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
                <Layers3 size={27} strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <h2 className="text-[22px] font-black leading-tight tracking-[-0.45px] text-slate-950 sm:text-[25px]">
                  Đơn đã soạn · gom theo khách
                </h2>
                <p className="mt-1.5 max-w-5xl text-[13px] leading-5 text-slate-500 sm:text-[14px]">
                  Mỗi khách chỉ còn một khu vực xử lý. Nếu khách đã có bản nháp, đơn mới soạn sẽ nằm ngay cùng nhóm và được tick / bỏ tick trong Chi tiết hóa đơn.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={!picked.length || busy}
              onClick={prepare}
              className="inline-flex min-h-[52px] shrink-0 items-center justify-center gap-2.5 rounded-xl border border-blue-500 bg-gradient-to-br from-blue-500 to-blue-600 px-5 py-3 text-[15px] font-extrabold text-white shadow-[0_7px_18px_rgba(37,99,235,0.22)] transition hover:brightness-[0.98] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 lg:min-w-[270px]"
            >
              <ReceiptText size={21} strokeWidth={2.2} />
              {busy ? "Đang lập..." : `Lập hóa đơn (${picked.length} đơn đã tích)`}
            </button>
          </div>

          <div className="flex flex-col gap-4 bg-[#fbfdff] p-3 sm:p-5">
            {customerGroups.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-blue-200 bg-white p-7 text-center text-[15px] text-slate-500">
                Chưa có đơn đã soạn hoặc bản nháp phù hợp.
              </div>
            ) : (
              customerGroups.map((group) => {
                const hasDraft = group.drafts.length > 0;
                const primaryDraft = group.drafts[0];
                const readyCount = group.ready.length;

                return (
                  <div
                    key={group.customerId}
                    className="overflow-hidden rounded-2xl border border-blue-100 bg-[#f6fbff] shadow-[0_5px_18px_rgba(30,98,193,0.04)]"
                  >
                    <div className="flex flex-col gap-3 px-3 py-3 sm:px-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-100/70 text-blue-600">
                          <UserRound size={24} strokeWidth={2.25} />
                        </span>
                        <div className="min-w-0">
                          <h3 className="break-words text-[19px] font-black text-blue-950 sm:text-[21px]">
                            {group.customerName}
                          </h3>
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] font-bold sm:text-[13px]">
                            {hasDraft ? (
                              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">
                                {group.drafts.length === 1
                                  ? `Có bản nháp · ${primaryDraft.invoice_code}`
                                  : `Có ${group.drafts.length} bản nháp cũ`}
                              </span>
                            ) : (
                              <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-blue-700">
                                Chưa có bản nháp
                              </span>
                            )}
                            <span className="text-slate-500">
                              {readyCount} đơn mới đang chờ
                            </span>
                          </div>
                        </div>
                      </div>

                      {hasDraft ? (
                        <Link
                          className="inline-flex min-h-[45px] items-center justify-center gap-2 self-stretch rounded-xl border border-blue-500 bg-gradient-to-br from-blue-400 to-blue-600 px-4 py-2.5 text-[14px] font-bold text-white shadow-[0_6px_16px_rgba(37,99,235,0.18)] transition hover:brightness-[0.98] sm:self-auto"
                          href={`/azalas/invoices/${primaryDraft.id}`}
                        >
                          Mở hóa đơn và xử lý
                          <ArrowRight size={18} />
                        </Link>
                      ) : (
                        <Link
                          className="inline-flex min-h-[45px] items-center justify-center gap-2 self-stretch rounded-xl border border-blue-500 bg-gradient-to-br from-blue-400 to-blue-600 px-4 py-2.5 text-[14px] font-bold text-white shadow-[0_6px_16px_rgba(37,99,235,0.18)] transition hover:brightness-[0.98] sm:self-auto"
                          href={`/azalas/invoices/customer/${group.customerId}`}
                        >
                          Mở nhóm và chọn đơn
                          <ArrowRight size={18} />
                        </Link>
                      )}
                    </div>

                    {group.drafts.length > 1 && (
                      <div className="mx-3 mb-3 rounded-xl border border-red-200 bg-red-50 p-3 text-[13px] font-semibold text-red-800 sm:mx-4">
                        Khách này đang có nhiều bản nháp cũ. Hệ thống không tự gộp các bản nháp đã tồn tại để tránh làm sai thanh toán / hàng trả. Hãy xử lý từng bản nháp bên dưới; từ bản cập nhật này sẽ không tạo thêm bản nháp trùng khách.
                      </div>
                    )}

                    <div className="grid gap-3 border-t border-blue-100 bg-white/30 p-3 lg:grid-cols-2">
                      {group.drafts.map((draftBill) => (
                        <article
                          key={`draft-${draftBill.id}`}
                          className="rounded-2xl border border-amber-200 bg-amber-50/55 p-4 shadow-[0_4px_14px_rgba(180,83,9,0.05)]"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <span className="text-[11px] font-black uppercase tracking-[0.13em] text-amber-700">
                                Bản nháp đang xử lý
                              </span>
                              <Link
                                href={`/azalas/invoices/${draftBill.id}`}
                                className="mt-1 block break-all text-[17px] font-black text-blue-900 hover:text-blue-600"
                              >
                                {draftBill.invoice_code}
                              </Link>
                              <p className="mt-1 text-[12px] text-slate-500">Tạo: {dt(draftBill.created_at)}</p>
                            </div>
                            <strong className="shrink-0 text-[20px] font-black text-slate-950">
                              {money(draftBill.subtotal)}
                            </strong>
                          </div>
                          <Link
                            href={`/azalas/invoices/${draftBill.id}`}
                            className="mt-3 inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border border-amber-200 bg-white px-3 text-[13px] font-extrabold text-amber-800 transition hover:bg-amber-50"
                          >
                            Mở bản nháp
                            <ArrowRight size={16} />
                          </Link>
                        </article>
                      ))}

                      {group.ready.map((r) => {
                        const isPicked = picked.includes(r.unit_id);
                        const lockedByDraft = hasDraft;

                        return (
                          <label
                            key={r.unit_id}
                            className={`rounded-2xl border bg-white p-3.5 transition sm:p-4 ${
                              lockedByDraft
                                ? "border-blue-100 shadow-[0_4px_14px_rgba(15,63,120,0.04)]"
                                : isPicked
                                  ? "cursor-pointer border-blue-400 shadow-[0_7px_18px_rgba(37,99,235,0.11)] ring-2 ring-blue-100"
                                  : "cursor-pointer border-blue-100 shadow-[0_4px_14px_rgba(15,63,120,0.04)] hover:border-blue-200 hover:shadow-md"
                            }`}
                          >
                            <div className="flex min-w-0 items-stretch gap-3 sm:gap-4">
                              <div className="flex shrink-0 items-center">
                                {lockedByDraft ? (
                                  <span className="grid h-6 w-6 place-items-center rounded-md border-2 border-blue-200 bg-blue-50 text-[11px] font-black text-blue-600">
                                    +
                                  </span>
                                ) : (
                                  <input
                                    type="checkbox"
                                    className="h-5 w-5 cursor-pointer accent-blue-600 sm:h-6 sm:w-6"
                                    checked={isPicked}
                                    onChange={() => pick(r)}
                                  />
                                )}
                              </div>

                              <span className="grid h-12 w-12 shrink-0 place-items-center self-center rounded-full bg-blue-50 text-blue-600 sm:h-14 sm:w-14">
                                <FileText size={27} strokeWidth={2.15} />
                              </span>

                              <div className="min-w-0 flex-1 py-0.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <b className="break-all text-[16px] font-black leading-5 text-blue-950 sm:text-[17px]">
                                    {r.order_code}
                                  </b>
                                  {lockedByDraft && (
                                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-blue-700">
                                      Chưa vào hóa đơn
                                    </span>
                                  )}
                                </div>
                                <p className="mt-1 text-[15px] font-semibold leading-5 text-slate-800 sm:text-[16px]">
                                  {r.warehouse_name}
                                </p>
                                <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12px] leading-5 text-slate-500 sm:text-[13px]">
                                  <CalendarDays size={15} className="shrink-0 text-blue-600" />
                                  <span>Soạn: {r.packer_name || "—"}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{dt(r.completed_at)}</span>
                                </p>
                              </div>

                              <div className="flex min-w-[112px] shrink-0 flex-col justify-center border-l border-blue-100 pl-3 sm:min-w-[145px] sm:pl-5">
                                <span className="text-[12px] font-medium text-slate-500 sm:text-[13px]">Tổng tiền</span>
                                <strong className="mt-1 break-words text-[20px] font-black leading-tight text-slate-950 sm:text-[23px]">
                                  {money(r.subtotal)}
                                </strong>
                              </div>
                            </div>

                            {lockedByDraft && (
                              <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-[12px] font-semibold text-blue-700">
                                Mở bản nháp phía trên để tick đơn này vào hóa đơn. Nếu không tick, đơn vẫn nằm chờ sau khi hóa đơn hiện tại được chốt.
                              </p>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      )}
      {!loading && tab === "DA_XOA" && <DeletedOrdersPanel search={search} />}
      {!loading && tab !== "CHUA_GUI" && billsFiltered.length > 0 && (
        <section className="rounded-[22px] border border-blue-100 bg-white p-4 shadow-[0_12px_34px_rgba(30,98,193,0.07)] sm:p-6">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600">
              <ReceiptText size={24} />
            </span>
            <h2 className="text-[20px] font-black text-slate-950 sm:text-[22px]">
              {tab === "DA_GUI" ? "Ảnh các hóa đơn đã chốt" : "Hóa đơn đã xóa"}
            </h2>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {billsFiltered.map((b) => (
              <article
                key={b.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_5px_16px_rgba(15,63,120,0.04)]"
              >
                <div className="flex items-start justify-between gap-3">
                  <Link
                    href={`/azalas/invoices/${b.id}`}
                    className="break-all text-[16px] font-black text-blue-800 hover:text-blue-600"
                  >
                    {b.invoice_code}
                  </Link>
                  <span className={`chip ${b.status === "DA_GUI" ? "done" : "urgent"}`}>
                    {b.status}
                  </span>
                </div>
                <p className="mt-2 text-[15px] font-bold text-slate-800">{b.customer_name}</p>
                <p className="mt-1 text-[12px] text-slate-500">{dt(b.finalized_at || b.created_at)}</p>
                <p className="my-3 text-[20px] font-black text-slate-950">{money(b.subtotal)}</p>
                {urlMap[b.id] && <ImageViewer urls={[urlMap[b.id]]} label={b.invoice_code} />}
                <Link className="btn soft mt-3 w-full text-[14px]" href={`/azalas/invoices/${b.id}`}>
                  Xem chi tiết
                </Link>
              </article>
            ))}
          </div>
        </section>
      )}

{!loading && tab === "DA_GUI" && !billsFiltered.length && (
        <div className="rounded-2xl border border-blue-100 bg-white p-6 text-center text-[15px] text-slate-500 shadow-[0_8px_24px_rgba(30,98,193,0.05)]">
          Chưa có hóa đơn phù hợp.
        </div>
      )}
    </div>
  );
}
