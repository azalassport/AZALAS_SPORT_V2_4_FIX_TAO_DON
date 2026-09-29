"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Pattern = { id: number; code: string; product_name: string; cost_price: number };
type Props = {
  patterns: Pattern[];
  patternId: string;
  onChoose: (id: string) => void;
  onCreated: (pattern: Pattern) => void;
  disabled?: boolean;
  label?: string;
};

const normalize = (value: string) => value.trim().toLocaleUpperCase("vi-VN");

export default function PatternCodePicker({patterns, patternId, onChoose, onCreated, disabled, label = "Mã rập chung *"}: Props) {
  const sb = useMemo(() => createClient(), []);
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCost, setNewCost] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selected = patterns.find(p => String(p.id) === patternId);
  useEffect(() => {
    if (selected) setSearch(selected.code);
  }, [selected?.code, selected?.id]);
  const matches = patterns.filter(p => `${p.code} ${p.product_name}`.toLocaleUpperCase("vi-VN").includes(normalize(search))).slice(0, 15);
  const exact = patterns.find(p => normalize(p.code) === normalize(search));

  function typeCode(value: string) {
    setSearch(value);
    setError("");
    setShowNew(false);
    const found = patterns.find(p => normalize(p.code) === normalize(value));
    onChoose(found ? String(found.id) : "");
    setFocused(true);
  }
  function selectPattern(p: Pattern) {
    setSearch(p.code);
    onChoose(String(p.id));
    setFocused(false);
    setShowNew(false);
    setError("");
  }
  async function addPattern() {
    const code = normalize(search);
    if (!code || !newName.trim()) return setError("Cần nhập mã rập và tên sản phẩm chung.");
    if (patterns.some(p => normalize(p.code) === code)) return setError("Mã rập đã có. Chọn mã đó trong danh sách.");
    if (newCost.trim() && (!/^\d+(?:\.\d{1,2})?$/.test(newCost.trim()) || Number(newCost) > 1_000_000_000))
      return setError("Giá vốn không hợp lệ.");
    setBusy(true); setError("");
    try {
      const {data, error: e} = await sb.from("pattern_catalog").insert({
        code, product_name: newName.trim(), cost_price: newCost.trim() ? Number(newCost) : 0,
      }).select("id,code,product_name,cost_price").single();
      if (e || !data) throw e || new Error("Không thêm được mã rập");
      const created = data as Pattern;
      onCreated(created);
      selectPattern(created);
      setNewName(""); setNewCost("");
    } catch(e) { setError(e instanceof Error ? e.message : "Không lưu được mã rập mới."); }
    finally { setBusy(false); }
  }
  return <div className="space-y-2">
    <label className="block text-sm font-bold text-slate-700">{label}
      <input className="field mt-1 w-full" value={search} disabled={disabled || busy}
        placeholder="Gõ mã rập hoặc tên để tìm, ví dụ 859DUI" autoComplete="off"
        onFocus={() => setFocused(true)} onChange={e => typeCode(e.target.value)}
        onKeyDown={e => { if (e.key === "Escape") setFocused(false); if (e.key === "Enter" && matches.length === 1) {e.preventDefault(); selectPattern(matches[0]);} }}/>
    </label>
    {focused && search.trim() && matches.length > 0 && <div className="max-h-48 overflow-auto rounded-xl border border-blue-200 bg-white shadow-sm">
      {matches.map(p => <button key={p.id} type="button" className="block w-full border-b p-3 text-left hover:bg-blue-50"
        onMouseDown={e => e.preventDefault()} onClick={() => selectPattern(p)}>
        <b>{p.code}</b> · {p.product_name}
      </button>)}
    </div>}
    {selected && <div className="rounded-lg bg-green-50 p-2 text-sm text-green-900">✓ Mã rập <b>{selected.code}</b> · Tên chung: <b>{selected.product_name}</b></div>}
    {search.trim() && !selected && !exact && <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
      <p>Mã <b>{normalize(search)}</b> chưa có trong danh mục. Chọn mã có sẵn hoặc tạo mã mới.</p>
      <button type="button" className="btn soft" disabled={busy || disabled} onClick={() => setShowNew(v => !v)}>+ Tạo mã rập mới</button>
      {showNew && <div className="grid gap-2 sm:grid-cols-3">
        <input className="field" value={newName} disabled={busy || disabled} placeholder="Tên sản phẩm chung *" onChange={e => setNewName(e.target.value)}/>
        <input className="field" value={newCost} disabled={busy || disabled} inputMode="decimal" placeholder="Giá vốn (nếu có)" onChange={e => setNewCost(e.target.value)}/>
        <button type="button" className="btn primary" disabled={busy || disabled} onClick={() => void addPattern()}>{busy ? "Đang tạo..." : "Lưu mã rập"}</button>
      </div>}
    </div>}
    {error && <p role="alert" className="text-sm font-semibold text-red-700">{error}</p>}
  </div>;
}
