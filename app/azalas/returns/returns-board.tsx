"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { dt, money, norm } from "@/lib/azalas/format";
import { ImageViewer, Loading, Msg, Tabs } from "@/components/ui";

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

export default function ReturnsBoard() {
  const sb = useMemo(() => createClient(), []);
  const [tab, setTab] = useState("THEM");
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
          const { data: signed } = await sb.storage.from("az-invoice-images")
            .createSignedUrl(photo.photo_path, 3600);
          return { ...photo, url: signed?.signedUrl || "" };
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
      p_customer_id: customerId, p_reason: note,
      p_lines: valid.map(row => ({ ...row, quantity: Number(row.quantity), unit_price: Number(row.unit_price) })),
    });
    setBusy(false);
    if (error) return setErr(error.message);
    setOk(`Đã tạo phiếu ${(data as { slip_code: string }).slip_code}.`);
    setRows([blank()]); setNote(""); setCustomerSearch(""); setCustomerId(0);
    await reload(); setTab("CHUA_DUYET");
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

  return <div className="stack">
    <Tabs value={tab} onChange={setTab} items={[
      { value: "THEM", label: "Thêm hàng trả" },
      { value: "CHUA_DUYET", label: "Chưa duyệt" },
      { value: "DA_DUYET", label: "Đã duyệt" },
      { value: "ANH", label: "Ảnh phiếu trả" },
    ]} />
    <Msg error={err} success={ok} />

    {tab === "THEM" ? <section className="panel stack">
      <h2>Phiếu hàng trả mới</h2>
      <label className="text-sm font-semibold">Tên khách
        <input className="field mt-2" value={customerSearch}
          placeholder="Gõ tên khách hoặc mã KH (MEMBER cần ít nhất 2 ký tự)"
          onChange={e => { setCustomerSearch(e.target.value); setCustomerId(0); }} />
      </label>
      {!customerId && customerSearch.length >= 2 && <div className="max-h-52 overflow-auto rounded-xl border">
        {matches.map(c => <button className="block w-full border-b px-3 py-3 text-left text-sm hover:bg-blue-50"
          key={c.id} onClick={() => { setCustomerSearch(c.name); setCustomerId(c.id); }}>{c.name}</button>)}
      </div>}
      {customerId > 0 && <p className="text-sm font-bold text-green-700">✓ Đã chọn khách #{customerId}</p>}
      <div className="stack">{rows.map((row, i) => <div key={i}
        className="grid gap-2 rounded-xl border border-slate-200 p-3 sm:grid-cols-5">
        <input className="field sm:col-span-2" placeholder="Tên sản phẩm" value={row.product_name}
          onChange={e => change(i, "product_name", e.target.value)} />
        <input className="field" type="number" min="1" placeholder="Số lượng" value={row.quantity}
          onChange={e => change(i, "quantity", e.target.value)} />
        <input className="field" type="number" min="0" placeholder="Giá" value={row.unit_price}
          onChange={e => change(i, "unit_price", e.target.value)} />
        <select className="field" value={row.item_condition} onChange={e => change(i, "item_condition", e.target.value)}>
          <option>Hàng tốt</option><option>Hàng lỗi</option><option>Chờ kiểm</option>
        </select>
        <div className="sm:col-span-5 flex items-center justify-between">
          <span className="text-sm font-bold">{money(Number(row.quantity || 0) * Number(row.unit_price || 0))}</span>
          <button className="btn danger" onClick={() => setRows(old => old.length > 1 ?
            old.filter((_, j) => j !== i) : [blank()])}>Xóa dòng</button>
        </div>
      </div>)}</div>
      <button className="btn soft w-fit" onClick={() => setRows(old => [...old, blank()])}>+ Thêm dòng sản phẩm</button>
      <label className="text-sm font-semibold">Lý do trả
        <textarea className="field mt-2" rows={2} value={note} onChange={e => setNote(e.target.value)} />
      </label>
      <p className="text-right text-2xl font-black">Tổng tiền trả: {money(total)}</p>
      <button className="btn success" disabled={busy} onClick={() => void create()}>Xác nhận tạo phiếu hàng trả</button>
    </section> : tab === "ANH" ? <section className="stack">
      {!manager ? <p className="panel text-slate-700">Ảnh chứng từ công nợ chỉ dành cho OWNER / ADMIN.</p> : <>
        <input className="field" placeholder="Tìm khách / mã phiếu trả / mã hóa đơn"
          value={search} onChange={e => setSearch(e.target.value)} />
        {photoLoading && <Loading />}
        {!photoLoading && !filteredPhotos.length && <p className="panel muted">
          Chưa có ảnh phiếu đã chốt. Phiếu duyệt theo phiên bản cũ có thể chưa được lưu ảnh.
        </p>}
        <div className="grid gap-3 md:grid-cols-2">{filteredPhotos.map(photo => <article key={photo.id} className="panel stack">
          <b className="text-lg text-blue-800">{photo.receipt_code || photo.invoice_code || photo.slip_code}</b>
          <p className="text-sm font-semibold">{photo.customer_name} · {photo.slip_code}</p>
          <p className="muted text-xs">{photo.image_kind === "DIRECT" ? "Phiếu trừ nợ trực tiếp" : "Hàng trả trong hóa đơn"}
            {photo.approved_at ? ` · ${dt(photo.approved_at)}` : ""}</p>
          {photo.url ? <ImageViewer urls={[photo.url]} label="Ảnh phiếu trả" /> : <p className="text-sm text-red-700">Không lấy được ảnh. Kiểm tra quyền Storage.</p>}
          <Link className="btn soft w-fit" href={`/azalas/returns/${photo.id}`}>Xem phiếu</Link>
        </article>)}</div>
      </>}
    </section> : <section className="stack">
      <input className="field" placeholder="Tìm tên khách / mã phiếu" value={search}
        onChange={e => setSearch(e.target.value)} />
      {loading && <Loading />}
      {!loading && !results.length && <p className="panel muted">Chưa có phiếu phù hợp.</p>}
      <div className="grid gap-3 md:grid-cols-2">{results.map(s => <article className="panel stack" key={s.id}>
        <div className="flex justify-between gap-2"><strong className="text-blue-800">{s.slip_code}</strong>
          <span className="chip">{s.status}</span></div>
        <b>{s.customer_name}</b>
        <p className="muted text-sm">{dt(s.created_at)} · {s.reason || "Không có lý do"}</p>
        <p className="text-xl font-black">{money(s.total)}</p>
        {s.applied_invoice_id && <p className="text-xs text-green-700">Đã cấn trừ tại hóa đơn #{s.applied_invoice_id}</p>}
        <Link className="btn soft w-fit" href={`/azalas/returns/${s.id}`}>Xem phiếu · Xem chi tiết</Link>
        {tab === "CHUA_DUYET" && manager && (returnLocks[s.id]?.reserved_invoice_id || returnLocks[s.id]?.settlement_mode ?
          <p className="rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">
            Phiếu đã được chọn trong hóa đơn, đang chờ chốt. Không duyệt trừ nợ hoặc xóa lần nữa.
          </p> : locksReady ? <div className="flex flex-wrap gap-2">
            <Link className="btn success" href={`/azalas/returns/${s.id}?mode=direct`}>Duyệt &amp; trừ nợ</Link>
            <button className="btn danger" disabled={busy} onClick={() => void remove(s.id)}>Xóa mềm</button>
          </div> : <p className="text-sm text-slate-500">Đang kiểm tra trạng thái phiếu...</p>)}
      </article>)}</div>
    </section>}
  </div>;
}
