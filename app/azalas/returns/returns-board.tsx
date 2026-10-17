"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Barcode,
  CheckCircle2,
  CircleCheckBig,
  Clock3,
  Coins,
  FileImage,
  FilePlus2,
  FileText,
  Images,
  Package,
  Plus,
  Search,
  Tag,
  Trash2,
  UserRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { mediaUrl } from "@/lib/azalas/media-client";
import { dt, money, norm } from "@/lib/azalas/format";
import { ImageViewer, Loading, Msg } from "@/components/ui";

type Customer = { id: number; name: string };
type Return = {
  id: number; slip_code: string; customer_id: number; customer_name: string;
  status: string; reason: string | null; created_at: string;
  applied_invoice_id: number | null; total: number;
};
type Row = { product_name: string; quantity: string; unit_price: string; item_condition: string };
type ReturnPhoto = {
  id: number; slip_code: string; customer_name: string; receipt_code: string | null;
  photo_path: string; image_kind: "DIRECT" | "INVOICE";
  approved_at: string | null; invoice_code: string | null; url: string;
};

const blank = (): Row => ({ product_name: "", quantity: "", unit_price: "", item_condition: "Hàng tốt" });

type ReturnTab = "THEM" | "CHUA_DUYET" | "DA_DUYET" | "ANH";

const tabItems: Array<{
  value: ReturnTab;
  label: string;
  icon: typeof FilePlus2;
  shell: string;
  active: string;
  iconClass: string;
}> = [
  {
    value: "THEM",
    label: "Thêm hàng trả",
    icon: FilePlus2,
    shell: "border-blue-300 bg-blue-50/80 text-blue-700",
    active: "ring-2 ring-blue-200 shadow-[0_10px_24px_rgba(37,99,235,0.10)]",
    iconClass: "text-blue-600",
  },
  {
    value: "CHUA_DUYET",
    label: "Chưa duyệt",
    icon: Clock3,
    shell: "border-red-200 bg-red-50/80 text-red-600",
    active: "ring-2 ring-red-100 shadow-[0_10px_24px_rgba(239,68,68,0.08)]",
    iconClass: "text-red-500",
  },
  {
    value: "DA_DUYET",
    label: "Đã duyệt",
    icon: CircleCheckBig,
    shell: "border-emerald-200 bg-emerald-50/80 text-emerald-700",
    active: "ring-2 ring-emerald-100 shadow-[0_10px_24px_rgba(16,185,129,0.08)]",
    iconClass: "text-emerald-600",
  },
  {
    value: "ANH",
    label: "Ảnh phiếu trả",
    icon: Images,
    shell: "border-violet-200 bg-violet-50/80 text-violet-700",
    active: "ring-2 ring-violet-100 shadow-[0_10px_24px_rgba(124,58,237,0.08)]",
    iconClass: "text-violet-600",
  },
];

function InputShell({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="relative">
      <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
        {icon}
      </div>
      {children}
    </div>
  );
}

export default function ReturnsBoard() {
  const sb = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<ReturnTab>("THEM");
  const [role, setRole] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerId, setCustomerId] = useState(0);
  const [rows, setRows] = useState<Row[]>([blank()]);
  const [note, setNote] = useState("");
  const [slips, setSlips] = useState<Return[]>([]);
  const [photos, setPhotos] = useState<ReturnPhoto[]>([]);
  const [returnLocks, setReturnLocks] = useState<Record<number, { reserved_invoice_id: number | null; settlement_mode: string | null }>>({});
  const [locksReady, setLocksReady] = useState(false);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [photoLoading, setPhotoLoading] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const manager = role === "OWNER" || role === "ADMIN";

  const reload = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb.rpc("az_returns_list");
    if (error) setErr(error.message);
    else setSlips((data || []) as Return[]);
    setLoading(false);
  }, [sb]);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("tab");
    if (next === "CHUA_DUYET" || next === "DA_DUYET" || next === "ANH") setTab(next);
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const { data: profile } = await sb.from("az_profiles")
        .select("role").eq("id", user.id).single();
      setRole(profile?.role || "");
      if (profile?.role === "OWNER" || profile?.role === "ADMIN") {
        const { data: people } = await sb.from("az_customers")
          .select("id,name").order("id", { ascending: false }).limit(300);
        setCustomers((people || []) as Customer[]);
      }
    })();
    void reload();
  }, [sb, reload]);

  useEffect(() => {
    if (role !== "MEMBER" || customerSearch.trim().length < 2) return;
    const timer = setTimeout(async () => {
      const { data } = await sb.rpc("az_customer_lookup", { p_q: customerSearch });
      setCustomers((data || []) as Customer[]);
    }, 250);
    return () => clearTimeout(timer);
  }, [sb, role, customerSearch]);

  useEffect(() => {
    if (!manager) return;
    const ids = slips.filter(s => s.status === "CHUA_DUYET").map(s => s.id);
    if (!ids.length) { setReturnLocks({}); setLocksReady(true); return; }
    let active = true;
    setLocksReady(false);
    (async () => {
      const { data, error } = await sb.from("return_slips")
        .select("id,reserved_invoice_id,settlement_mode").in("id", ids);
      if (!active) return;
      if (error) { setErr("Không kiểm tra được phiếu đang nằm trong hóa đơn: " + error.message); return; }
      setReturnLocks(Object.fromEntries((data || []).map(r => [Number(r.id), {
        reserved_invoice_id: r.reserved_invoice_id, settlement_mode: r.settlement_mode,
      }])));
      setLocksReady(true);
    })();
    return () => { active = false; };
  }, [sb, slips, manager]);

  useEffect(() => {
    if (tab !== "ANH" || !manager) return;
    let active = true;
    (async () => {
      setPhotoLoading(true);
      const { data, error } = await sb.rpc("az_return_photos");
      if (!active) return;
      if (error) { setErr(error.message); setPhotoLoading(false); return; }
      const imageList = await Promise.all(((data || []) as Omit<ReturnPhoto, "url">[])
        .map(async photo => {
          const url=await mediaUrl(sb,"az-invoice-images",photo.photo_path,3600).catch(()=>"");
          return { ...photo, url };
        }));
      if (active) { setPhotos(imageList); setPhotoLoading(false); }
    })();
    return () => { active = false; };
  }, [sb, tab, manager]);

  const matches = customers.filter(c => norm(c.name).includes(norm(customerSearch))).slice(0, 12);
  const total = rows.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.unit_price || 0), 0);

  function change(i: number, key: keyof Row, value: string) {
    setRows(old => old.map((row, j) => i === j ? { ...row, [key]: value } : row));
  }

  async function create() {
    setErr(""); setOk("");
    const valid = rows.filter(row => row.product_name.trim() || row.quantity || row.unit_price);
    if (!customerId || !valid.length) return setErr("Chọn khách và ít nhất một dòng hàng trả.");
    if (valid.some(row => !row.product_name.trim() || !/^\d+$/.test(row.quantity) ||
      Number(row.quantity) < 1 || !Number.isFinite(Number(row.unit_price)) || Number(row.unit_price) < 0)) {
      return setErr("Tên SP / số lượng / đơn giá chưa hợp lệ.");
    }
    setBusy(true);
    const { data, error } = await sb.rpc("az_create_return", {
      p_customer_id: customerId,
      p_reason: note,
      p_lines: valid.map(row => ({ ...row, quantity: Number(row.quantity), unit_price: Number(row.unit_price) })),
    });
    setBusy(false);
    if (error) return setErr(error.message);
    setOk(`Đã tạo phiếu ${(data as { slip_code: string }).slip_code}.`);
    setRows([blank()]);
    setNote("");
    setCustomerSearch("");
    setCustomerId(0);
    await reload();
    setTab("CHUA_DUYET");
  }

  async function remove(id: number) {
    if (!window.confirm("Xóa mềm phiếu chưa duyệt?")) return;
    setBusy(true); setErr("");
    const { error } = await sb.rpc("az_delete_return", { p_slip_id: id });
    setBusy(false);
    if (error) setErr(error.message);
    else { setOk("Đã xóa mềm phiếu."); await reload(); }
  }

  const results = slips.filter(s => s.status === tab &&
    norm(`${s.customer_name} ${s.slip_code}`).includes(norm(search)));
  const filteredPhotos = photos.filter(p =>
    norm(`${p.customer_name} ${p.slip_code} ${p.receipt_code || ""} ${p.invoice_code || ""}`).includes(norm(search)));

  return (
    <div className="mx-auto w-full max-w-[1520px] space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tabItems.map(item => {
          const Icon = item.icon;
          const selected = tab === item.value;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => setTab(item.value)}
              className={[
                "flex min-h-[76px] items-center justify-center gap-3 rounded-2xl border px-4 py-4",
                "text-[16px] font-black transition-all sm:text-[18px]",
                "hover:-translate-y-0.5 hover:shadow-md",
                item.shell,
                selected ? item.active : "",
              ].join(" ")}
            >
              <Icon className={`h-7 w-7 shrink-0 ${item.iconClass}`} strokeWidth={2.2} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>

      <Msg error={err} success={ok} />

      {tab === "THEM" ? (
        <section className="overflow-hidden rounded-[24px] border border-blue-100 bg-white shadow-[0_12px_36px_rgba(37,99,235,0.08)]">
          <div className="flex items-center gap-4 border-b border-slate-100 px-5 py-5 sm:px-7">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <FileText className="h-7 w-7" strokeWidth={2.1} />
            </div>
            <div>
              <h2 className="text-[22px] font-black tracking-tight text-slate-950 sm:text-[26px]">
                Phiếu hàng trả mới
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                Chọn khách, nhập sản phẩm trả và xác nhận tạo phiếu.
              </p>
            </div>
          </div>

          <div className="space-y-5 p-5 sm:p-7">
            <div>
              <label className="mb-2 block text-[15px] font-extrabold text-slate-700">
                Tên khách
              </label>
              <InputShell icon={<UserRound className="h-5 w-5" />}>
                <input
                  className="field !h-14 !rounded-2xl !border-slate-200 !pl-12 !text-[16px] shadow-sm focus:!border-blue-400"
                  value={customerSearch}
                  placeholder="Gõ tên khách hoặc mã KH (MEMBER cần ít nhất 2 ký tự)"
                  onChange={e => { setCustomerSearch(e.target.value); setCustomerId(0); }}
                />
              </InputShell>

              {!customerId && customerSearch.length >= 2 && (
                <div className="mt-2 max-h-52 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-lg">
                  {matches.map(c => (
                    <button
                      className="block w-full border-b border-slate-100 px-4 py-3 text-left text-[15px] font-semibold hover:bg-blue-50"
                      key={c.id}
                      onClick={() => { setCustomerSearch(c.name); setCustomerId(c.id); }}
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              )}

              {customerId > 0 && (
                <p className="mt-2 flex items-center gap-2 text-sm font-bold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Đã chọn khách #{customerId}
                </p>
              )}
            </div>

            <div className="space-y-3">
              {rows.map((row, i) => {
                const lineTotal = Number(row.quantity || 0) * Number(row.unit_price || 0);
                return (
                  <div
                    key={i}
                    className="rounded-2xl border border-slate-200 bg-slate-50/45 p-3.5 shadow-sm sm:p-4"
                  >
                    <div className="grid gap-3 lg:grid-cols-12">
                      <div className="lg:col-span-5">
                        <InputShell icon={<Package className="h-5 w-5" />}>
                          <input
                            className="field !h-14 !rounded-xl !pl-12 !text-[16px]"
                            placeholder="Tên sản phẩm"
                            value={row.product_name}
                            onChange={e => change(i, "product_name", e.target.value)}
                          />
                        </InputShell>
                      </div>

                      <div className="lg:col-span-2">
                        <InputShell icon={<Barcode className="h-5 w-5" />}>
                          <input
                            className="field !h-14 !rounded-xl !pl-12 !text-[16px]"
                            type="number"
                            min="1"
                            placeholder="Số lượng"
                            value={row.quantity}
                            onChange={e => change(i, "quantity", e.target.value)}
                          />
                        </InputShell>
                      </div>

                      <div className="lg:col-span-2">
                        <InputShell icon={<Coins className="h-5 w-5" />}>
                          <input
                            className="field !h-14 !rounded-xl !pl-12 !text-[16px]"
                            type="number"
                            min="0"
                            placeholder="Giá"
                            value={row.unit_price}
                            onChange={e => change(i, "unit_price", e.target.value)}
                          />
                        </InputShell>
                      </div>

                      <div className="relative lg:col-span-3">
                        <Tag className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                        <select
                          className="field !h-14 !rounded-xl !pl-12 !text-[16px]"
                          value={row.item_condition}
                          onChange={e => change(i, "item_condition", e.target.value)}
                        >
                          <option>Hàng tốt</option>
                          <option>Hàng lỗi</option>
                          <option>Chờ kiểm</option>
                        </select>
                      </div>
                    </div>

                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <span className="text-[20px] font-black text-slate-900">
                        {money(lineTotal)}
                      </span>
                      <button
                        type="button"
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 text-sm font-extrabold text-red-600 transition hover:bg-red-100"
                        onClick={() => setRows(old => old.length > 1 ? old.filter((_, j) => j !== i) : [blank()])}
                      >
                        <Trash2 className="h-4 w-4" />
                        Xóa dòng
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <button
              type="button"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-5 text-[15px] font-extrabold text-blue-700 transition hover:bg-blue-100"
              onClick={() => setRows(old => [...old, blank()])}
            >
              <Plus className="h-5 w-5" />
              Thêm dòng sản phẩm
            </button>

            <div>
              <label className="mb-2 block text-[15px] font-extrabold text-slate-700">
                Lý do trả
              </label>
              <div className="relative">
                <FileText className="pointer-events-none absolute left-4 top-4 h-5 w-5 text-slate-400" />
                <textarea
                  className="field !min-h-[86px] !rounded-2xl !pl-12 !pt-4 !text-[16px]"
                  rows={2}
                  value={note}
                  onChange={e => setNote(e.target.value)}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <p className="text-right text-[26px] font-black tracking-tight text-slate-950 sm:text-[30px]">
                Tổng tiền trả: {money(total)}
              </p>
            </div>

            <button
              type="button"
              className="flex min-h-[56px] w-full items-center justify-center gap-3 rounded-2xl bg-emerald-600 px-5 text-[16px] font-black text-white shadow-[0_8px_22px_rgba(5,150,105,0.20)] transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={busy}
              onClick={() => void create()}
            >
              <CircleCheckBig className="h-5 w-5" />
              {busy ? "Đang tạo phiếu..." : "Xác nhận tạo phiếu hàng trả"}
            </button>
          </div>
        </section>
      ) : tab === "ANH" ? (
        <section className="space-y-4 rounded-[24px] border border-violet-100 bg-white p-5 shadow-[0_12px_36px_rgba(124,58,237,0.06)] sm:p-7">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-50 text-violet-600">
              <FileImage className="h-6 w-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-950">Ảnh phiếu trả</h2>
              <p className="text-sm text-slate-500">Tra cứu ảnh phiếu trả đã chốt.</p>
            </div>
          </div>

          {!manager ? (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-700">
              Ảnh chứng từ công nợ chỉ dành cho OWNER / ADMIN.
            </p>
          ) : (
            <>
              <InputShell icon={<Search className="h-5 w-5" />}>
                <input
                  className="field !h-14 !rounded-2xl !pl-12 !text-[16px]"
                  placeholder="Tìm khách / mã phiếu trả / mã hóa đơn"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </InputShell>

              {photoLoading && <Loading />}

              {!photoLoading && !filteredPhotos.length && (
                <p className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-slate-500">
                  Chưa có ảnh phiếu đã chốt. Phiếu duyệt theo phiên bản cũ có thể chưa được lưu ảnh.
                </p>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                {filteredPhotos.map(photo => (
                  <article
                    key={photo.id}
                    className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <b className="text-lg text-blue-800">
                          {photo.receipt_code || photo.invoice_code || photo.slip_code}
                        </b>
                        <p className="mt-1 text-sm font-semibold text-slate-800">
                          {photo.customer_name} · {photo.slip_code}
                        </p>
                      </div>
                      <Images className="h-5 w-5 shrink-0 text-violet-500" />
                    </div>

                    <p className="text-xs text-slate-500">
                      {photo.image_kind === "DIRECT" ? "Phiếu trừ nợ trực tiếp" : "Hàng trả trong hóa đơn"}
                      {photo.approved_at ? ` · ${dt(photo.approved_at)}` : ""}
                    </p>

                    {photo.url ? (
                      <ImageViewer urls={[photo.url]} label="Ảnh phiếu trả" />
                    ) : (
                      <p className="text-sm text-red-700">Không lấy được ảnh. Kiểm tra quyền Storage.</p>
                    )}

                    <Link
                      className="inline-flex h-11 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-extrabold text-blue-700 hover:bg-blue-100"
                      href={`/azalas/returns/${photo.id}`}
                    >
                      Xem phiếu
                    </Link>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      ) : (
        <section className="space-y-4 rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_12px_36px_rgba(15,23,42,0.05)] sm:p-7">
          <div className="flex items-center gap-3">
            <div className={[
              "flex h-12 w-12 items-center justify-center rounded-2xl",
              tab === "CHUA_DUYET" ? "bg-red-50 text-red-500" : "bg-emerald-50 text-emerald-600",
            ].join(" ")}>
              {tab === "CHUA_DUYET" ? <Clock3 className="h-6 w-6" /> : <CircleCheckBig className="h-6 w-6" />}
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-950">
                {tab === "CHUA_DUYET" ? "Phiếu hàng trả chưa duyệt" : "Phiếu hàng trả đã duyệt"}
              </h2>
              <p className="text-sm text-slate-500">
                {tab === "CHUA_DUYET" ? "Kiểm tra, duyệt hoặc xóa các phiếu đang chờ." : "Danh sách các phiếu đã hoàn tất duyệt."}
              </p>
            </div>
          </div>

          <InputShell icon={<Search className="h-5 w-5" />}>
            <input
              className="field !h-14 !rounded-2xl !pl-12 !text-[16px]"
              placeholder="Tìm tên khách / mã phiếu"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </InputShell>

          {loading && <Loading />}

          {!loading && !results.length && (
            <p className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-slate-500">
              Chưa có phiếu phù hợp.
            </p>
          )}

          <div className="grid gap-4 md:grid-cols-2">
            {results.map(s => (
              <article
                className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                key={s.id}
              >
                <div className="flex items-center justify-between gap-3">
                  <strong className="text-[16px] font-black text-blue-800">{s.slip_code}</strong>
                  <span className={[
                    "rounded-full px-3 py-1 text-[11px] font-black",
                    s.status === "CHUA_DUYET"
                      ? "bg-red-50 text-red-600"
                      : "bg-emerald-50 text-emerald-700",
                  ].join(" ")}>
                    {s.status}
                  </span>
                </div>

                <b className="text-[17px] text-slate-950">{s.customer_name}</b>
                <p className="text-sm text-slate-500">{dt(s.created_at)} · {s.reason || "Không có lý do"}</p>
                <p className="text-2xl font-black text-slate-950">{money(s.total)}</p>

                {s.applied_invoice_id && (
                  <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                    Đã cấn trừ tại hóa đơn #{s.applied_invoice_id}
                  </p>
                )}

                <Link
                  className="inline-flex h-11 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 text-sm font-extrabold text-blue-700 hover:bg-blue-100"
                  href={`/azalas/returns/${s.id}`}
                >
                  Xem phiếu · Xem chi tiết
                </Link>

                {tab === "CHUA_DUYET" && manager && (
                  returnLocks[s.id]?.reserved_invoice_id || returnLocks[s.id]?.settlement_mode ? (
                    <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">
                      Phiếu đã được chọn trong hóa đơn, đang chờ chốt. Không duyệt trừ nợ hoặc xóa lần nữa.
                    </p>
                  ) : locksReady ? (
                    <div className="flex flex-wrap gap-2">
                      <Link
                        className="inline-flex h-11 items-center justify-center rounded-xl bg-emerald-600 px-4 text-sm font-extrabold text-white hover:bg-emerald-700"
                        href={`/azalas/returns/${s.id}?mode=direct`}
                      >
                        Duyệt &amp; trừ nợ
                      </Link>
                      <button
                        type="button"
                        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-extrabold text-red-600 hover:bg-red-100"
                        disabled={busy}
                        onClick={() => void remove(s.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Xóa mềm
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Đang kiểm tra trạng thái phiếu...</p>
                  )
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
