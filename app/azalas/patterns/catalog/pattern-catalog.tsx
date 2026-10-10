"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FileImage, ImagePlus, Plus, Search, Tag } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { ImageViewer, Msg } from "@/components/ui";
import { norm, money } from "@/lib/azalas/format";

type Cat = { id: number; code: string; product_name: string; cost_price: number; image_path: string | null; notes: string | null };
type Note = { id: number; pattern_id: number; note: string; image_path: string | null };

export default function PatternCatalog() {
  const sb = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Cat[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ code: "", product_name: "", cost_price: "0", notes: "" });
  const [q, setQ] = useState("");
  const [note, setNote] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [selected, setSelected] = useState(0);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [{ data: c, error: e }, { data: n }] = await Promise.all([
      sb.from("pattern_catalog").select("id,code,product_name,cost_price,image_path,notes").order("id", { ascending: false }).limit(300),
      sb.from("pattern_notes").select("id,pattern_id,note,image_path").order("created_at", { ascending: false }).limit(300),
    ]);
    if (e) setErr(e.message);
    setRows((c || []) as Cat[]);
    setNotes((n || []) as Note[]);
    const all = [...(c || []).map(x => x.image_path), ...(n || []).map(x => x.image_path)].filter(Boolean) as string[];
    if (all.length) {
      const { data } = await sb.storage.from("az-pattern-images").createSignedUrls(all, 3600);
      setUrls(Object.fromEntries(all.map((path, i) => [path, data?.[i]?.signedUrl || ""])));
    }
  }, [sb]);

  useEffect(() => { void load(); }, [load]);

  async function add() {
    if (!form.code.trim() || !form.product_name.trim()) return setErr("Nhập mã và tên sản phẩm");
    setBusy(true);
    const { error } = await sb.from("pattern_catalog").insert({ ...form, cost_price: Number(form.cost_price) || 0 });
    setBusy(false);
    if (error) setErr(error.message);
    else { setForm({ code: "", product_name: "", cost_price: "0", notes: "" }); setOk("Đã tạo mã rập"); await load(); }
  }

  async function addNote() {
    if (!selected || (!note.trim() && !image)) return setErr("Chọn mã rập và nhập ghi chú hoặc ảnh");
    setBusy(true);
    let path: string | null = null;
    if (image) {
      if (!image.type.startsWith("image/") || image.size > 8 * 1024 * 1024) { setBusy(false); return setErr("Ảnh phải nhỏ hơn 8MB"); }
      const { data: { user } } = await sb.auth.getUser();
      if (!user) { setBusy(false); return setErr("Hết phiên đăng nhập"); }
      path = `${user.id}/catalog/${selected}/${crypto.randomUUID()}.${image.name.split(".").pop() || "jpg"}`;
      const { error } = await sb.storage.from("az-pattern-images").upload(path, image, { contentType: image.type, upsert: false });
      if (error) { setBusy(false); return setErr(error.message); }
    }
    const { data: { user } } = await sb.auth.getUser();
    const { error } = await sb.from("pattern_notes").insert({ pattern_id: selected, note, image_path: path, created_by: user?.id });
    setBusy(false);
    if (error) setErr(error.message);
    else { setNote(""); setImage(null); setOk("Đã lưu ghi chú rập."); await load(); }
  }

  const filtered = rows.filter(r => norm(`${r.code} ${r.product_name}`).includes(norm(q)));

  return <div className="space-y-5">
    <Msg error={err} success={ok} />

    <div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-[26px] border border-cyan-100 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,.05)] sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-cyan-100 text-cyan-600"><Plus className="h-5 w-5" /></span>
          <div><h2 className="text-[20px] font-black text-[#0d2346]">Tạo mã rập</h2><p className="text-[12px] font-semibold text-slate-500">Thêm mã mới vào danh mục rập</p></div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <label className="block"><span className="mb-1.5 block text-[12px] font-black text-slate-600">Mã rập</span><input className="field w-full" placeholder="VD: 859DAI" value={form.code} onChange={e => setForm(v => ({ ...v, code: e.target.value }))} /></label>
          <label className="block"><span className="mb-1.5 block text-[12px] font-black text-slate-600">Tên sản phẩm</span><input className="field w-full" placeholder="Tên sản phẩm" value={form.product_name} onChange={e => setForm(v => ({ ...v, product_name: e.target.value }))} /></label>
          <label className="block"><span className="mb-1.5 block text-[12px] font-black text-slate-600">Giá vốn</span><input type="number" min="0" className="field w-full" placeholder="0" value={form.cost_price} onChange={e => setForm(v => ({ ...v, cost_price: e.target.value }))} /></label>
          <button className="mt-auto min-h-[46px] rounded-xl bg-cyan-600 px-4 py-2.5 text-[13px] font-black text-white shadow-[0_8px_20px_rgba(8,145,178,.20)] transition hover:bg-cyan-700 disabled:opacity-50" onClick={add} disabled={busy}>Lưu mã rập</button>
        </div>
      </section>

      <section className="rounded-[26px] border border-blue-100 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,.05)] sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-100 text-blue-600"><ImagePlus className="h-5 w-5" /></span>
          <div><h2 className="text-[20px] font-black text-[#0d2346]">Ghi chú / Ảnh rập</h2><p className="text-[12px] font-semibold text-slate-500">Lưu yêu cầu kỹ thuật và ảnh mẫu</p></div>
        </div>
        <div className="mt-5 space-y-3">
          <select className="field w-full" value={selected} onChange={e => setSelected(Number(e.target.value))}><option value="0">Chọn mã rập</option>{rows.map(r => <option key={r.id} value={r.id}>{r.code} · {r.product_name}</option>)}</select>
          <textarea className="field w-full" rows={3} placeholder="Ghi chú mẫu, yêu cầu kỹ thuật..." value={note} onChange={e => setNote(e.target.value)} />
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex min-h-[42px] cursor-pointer items-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-[13px] font-black text-blue-700"><FileImage className="h-4 w-4" /> Chọn ảnh<input type="file" accept="image/*" className="sr-only" onChange={e => setImage(e.target.files?.[0] || null)} /></label>
            {image && <p className="text-[12px] font-semibold text-slate-500">{image.name}</p>}
          </div>
          <button className="min-h-[44px] rounded-xl bg-blue-600 px-4 py-2.5 text-[13px] font-black text-white transition hover:bg-blue-700 disabled:opacity-50" disabled={busy} onClick={addNote}>Lưu ghi chú / ảnh</button>
        </div>
      </section>
    </div>

    <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,.05)]">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input className="field w-full pl-11" placeholder="Tìm mã rập / tên sản phẩm" value={q} onChange={e => setQ(e.target.value)} />
      </div>
    </section>

    <div className="grid gap-4 md:grid-cols-2">
      {filtered.map(r => {
        const patternNotes = notes.filter(n => n.pattern_id === r.id);
        const images = patternNotes.map(n => n.image_path ? urls[n.image_path] : "").filter(Boolean);
        return <article key={r.id} className="rounded-[25px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,.05)]">
          <div className="flex items-start justify-between gap-3">
            <div><div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.07em] text-cyan-600"><Tag className="h-4 w-4" /> Mã rập</div><h2 className="mt-1 text-[21px] font-black text-[#0d2346]">{r.code} · {r.product_name}</h2></div>
            <span className="shrink-0 rounded-xl bg-cyan-50 px-3 py-2 text-[12px] font-black text-cyan-700">{money(r.cost_price)}</span>
          </div>
          {r.notes && <p className="mt-3 text-[13px] font-semibold leading-6 text-slate-500">{r.notes}</p>}
          <div className="mt-4"><ImageViewer urls={images} label={`Ảnh mã rập ${r.code}`} /></div>
          {!!patternNotes.length && <div className="mt-4 space-y-2">{patternNotes.map(n => <p key={n.id} className="rounded-2xl bg-slate-50 p-3 text-[13px] font-semibold text-slate-600">{n.note}</p>)}</div>}
        </article>;
      })}
    </div>
  </div>;
}
