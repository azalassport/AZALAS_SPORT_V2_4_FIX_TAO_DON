"use client";

import { R2_PATTERN_SLIP_READY, R2_SQL_BLOCKED_MESSAGE } from "@/lib/azalas/r2-rollout-gates";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadR2File } from "@/lib/azalas/media-client";
import { Msg, PhotoInput } from "@/components/ui";
import { day, errorText } from "@/lib/azalas/format";
import PatternCodePicker from "./pattern-code-picker";
import {
  RAP_SIZES, buildHousePlan, parseRapColorText, rapSewingPriceError, type ColorInput, type ModelInput,
} from "@/lib/azalas/pattern-house";

type Pattern = { id: number; code: string; product_name: string; cost_price: number };
type Partner = { id: number; name: string };
type Warehouse = { id: number; name: string; code: string };
type Fabric = { id: number; name: string };
type Rate = { pattern_id: number; house_id: number; unit_price: number };
const newColor = (): ColorInput => ({ id: crypto.randomUUID(), color: "", layers: "" });
const newModel = (): ModelInput => ({ id: crypto.randomUUID(), patternId: "", brand: "",
  sizeFrom: "", sizeTo: "", ratio: "", sewingPrice: "",
  internalCode: "", salesCode: "", colors: [newColor()] });
const input = "field mt-1 w-full";
const label = "block text-sm font-bold text-slate-700";

export default function PatternHouseEntry() {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const paper = useRef<HTMLDivElement>(null);
  const requestKey = useRef<string | null>(null);
  const uploadedPaths = useRef<string[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [houses, setHouses] = useState<Partner[]>([]);
  const [cutters, setCutters] = useState<Partner[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [fabrics, setFabrics] = useState<Fabric[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [mode, setMode] = useState<"common" | "perModel">("common");
  const [form, setForm] = useState({ cutDate: "", houseId: "", cutterId: "",
    warehouseId: "", fabricId: "", note: "", patternId: "", sewingPrice: "" });
  const [commonColors, setCommonColors] = useState<ColorInput[]>([newColor()]);
  const [commonColorQuick, setCommonColorQuick] = useState("");
  const [modelColorQuick, setModelColorQuick] = useState<Record<string, string>>({});
  const [commonSizeFrom, setCommonSizeFrom] = useState("");
  const [commonSizeTo, setCommonSizeTo] = useState("");
  const [commonRatio, setCommonRatio] = useState("");
  const [models, setModels] = useState<ModelInput[]>([newModel()]);
  const [files, setFiles] = useState<File[]>([]);
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [previewPath, setPreviewPath] = useState("");
  const [imagePaths, setImagePaths] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [sewingPriceTouched, setSewingPriceTouched] = useState(false);
  const [addType, setAddType] = useState<"house" | "cutter" | "fabric" | null>(null);
  const [addName, setAddName] = useState("");

  const reload = useCallback(async () => {
    const results = await Promise.all([
      sb.from("pattern_catalog").select("id,code,product_name,cost_price").order("code").limit(1000),
      sb.from("sewing_houses").select("id,name").eq("is_active", true).order("name"),
      sb.from("cutters").select("id,name").eq("is_active", true).order("name"),
      sb.from("az_warehouses").select("id,name,code").eq("is_active", true).order("name"),
      sb.from("pattern_fabrics").select("id,name").eq("is_active", true).order("name"),
      sb.from("sewing_rates").select("pattern_id,house_id,unit_price"),
    ]);
    const failure = results.find(r => r.error)?.error;
    if (failure) setError("Không tải được danh mục Rập: " + failure.message + ". Kiểm tra SQL 13 đã chạy.");
    setPatterns((results[0].data || []) as Pattern[]);
    setHouses((results[1].data || []) as Partner[]);
    setCutters((results[2].data || []) as Partner[]);
    setWarehouses((results[3].data || []) as Warehouse[]);
    setFabrics((results[4].data || []) as Fabric[]);
    setRates((results[5].data || []) as Rate[]);
  }, [sb]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    const urls = files.map(file => URL.createObjectURL(file));
    setPhotoUrls(urls);
    return () => urls.forEach(url => URL.revokeObjectURL(url));
  }, [files]);

  function invalidate() { setPreviewPath(""); setShowPreview(false); setImagePaths([]); uploadedPaths.current = []; setOk(""); }
  function changeForm(field: keyof typeof form, value: string) {
    invalidate();
    const rateContextChanged = field === "houseId" || field === "patternId";
    setForm(prev => ({ ...prev, [field]: value,
      ...(rateContextChanged ? { sewingPrice: "" } : {}) }));
    if (rateContextChanged) setSewingPriceTouched(false);
  }
  function changeModel(id: string, patch: Partial<ModelInput>) {
    invalidate(); setModels(prev => prev.map(model => model.id === id ? { ...model, ...patch } : model));
  }
  function changeColor(id: string, patch: Partial<ColorInput>, modelId?: string) {
    invalidate();
    if (!modelId) setCommonColors(prev => prev.map(row => row.id === id ? { ...row, ...patch } : row));
    else setModels(prev => prev.map(model => model.id === modelId ?
      { ...model, colors: model.colors.map(row => row.id === id ? { ...row, ...patch } : row) } : model));
  }
  function changeMode(value: "common" | "perModel") { invalidate(); setMode(value); }
  function splitColors(modelId?: string) {
    try {
      const text = modelId ? (modelColorQuick[modelId] || "") : commonColorQuick;
      const parsed = parseRapColorText(text);
      // Tách màu là thay danh sách hiện tại bằng kết quả đã gộp, tránh bấm lại bị nhân đôi lớp.
      const rows = parsed.map(c => ({ id: crypto.randomUUID(), color: c.color, layers: String(c.layers) }));
      invalidate(); setError("");
      if (modelId) {
        setModels(old => old.map(m => m.id === modelId ? { ...m, colors: rows } : m));
        setModelColorQuick(old => ({ ...old, [modelId]: "" }));
      } else { setCommonColors(rows); setCommonColorQuick(""); }
    } catch(e) { setError(errorText(e)); }
  }
  const plan = useMemo(() => {
    try { return { value: buildHousePlan(mode,
      models.map(m => ({ ...m, patternId: form.patternId, sewingPrice: form.sewingPrice })),
      commonColors, commonSizeFrom, commonSizeTo, commonRatio), error: "" }; }
    catch (e) { return { value: null, error: errorText(e) }; }
  }, [mode, models, form.patternId, form.sewingPrice, commonColors, commonSizeFrom, commonSizeTo, commonRatio]);

  async function addCatalogItem() {
    setError("");
    if (!addType) return;
    const name = addName.trim();
    if (!name) return setError("Nhập tên danh mục.");
    setBusy(true);
    let id: number | null = null; let message = "";
    if (addType === "fabric") {
      const { data, error: e } = await sb.rpc("az_pattern_add_fabric", { p_name: name });
      id = Number(data) || null; message = e?.message || "";
    } else {
      const table = addType === "house" ? "sewing_houses" : "cutters";
      const payload = { name };
      const { data, error: e } = await sb.from(table).insert(payload).select("id").single();
      id = data?.id ? Number(data.id) : null; message = e?.message || "";
    }
    setBusy(false);
    if (message || !id) return setError(message || "Không lưu được danh mục");
    await reload();
    if (addType === "fabric") changeForm("fabricId", String(id));
    if (addType === "house") changeForm("houseId", String(id));
    if (addType === "cutter") changeForm("cutterId", String(id));
    setAddType(null); setAddName("");
    setOk("Đã thêm danh mục.");
  }

  function openPreview() {
    setError(""); setOk("");
    setSewingPriceTouched(true);
    const priceError = rapSewingPriceError(form.sewingPrice);
    if (priceError) return setError(priceError);
    if (!form.cutDate || !form.houseId || !form.cutterId || !form.warehouseId || !form.fabricId || !form.patternId)
      return setError("Chọn đủ ngày cắt, mã rập chung, nhà may, thợ cắt, kho nhập dự kiến và loại vải.");
    if (!files.length) return setError("Bắt buộc tải lên, chụp hoặc dán ít nhất một ảnh.");
    if (files.length > 12) return setError("Tối đa 12 ảnh trong một phiếu.");
    if (!plan.value) return setError(plan.error);
    setShowPreview(true);
  }

  async function capturePreview() {
    if (busy || !showPreview || !paper.current || !plan.value) return;
    if (!R2_PATTERN_SLIP_READY) return setError(R2_SQL_BLOCKED_MESSAGE);
    setBusy(true); setError(""); setOk("");
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error("Bạn cần đăng nhập lại.");
      if (!requestKey.current) requestKey.current = crypto.randomUUID();
      const html2canvas = (await import("html2canvas")).default;
      await Promise.all(Array.from(paper.current.querySelectorAll("img")).map(img => img.decode()));
      const canvas = await html2canvas(paper.current, { backgroundColor: "#fff", scale: 2,
        useCORS: true, logging: false });
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        b => b ? resolve(b) : reject(new Error("Không thể tạo ảnh phiếu")), "image/png"));
      const path = await uploadR2File(blob, "pattern", "phieu-preview.png");
      setPreviewPath(path);
      setOk("Đã chụp và LƯU ảnh phiếu thành công. Có thể lập phiếu PNR.");
    } catch (e) { setError("Lỗi chụp/lưu ảnh phiếu: " + errorText(e)); }
    finally { setBusy(false); }
  }

  async function saveSlip() {
    setSewingPriceTouched(true);
    const priceError = rapSewingPriceError(form.sewingPrice);
    if (priceError) return setError(priceError);
    if (busy || !plan.value) return setError(plan.error || "Dữ liệu chưa hợp lệ");
    if (!showPreview || !previewPath) return setError("Hãy Xem trước → Chụp & lưu ảnh phiếu trước khi lập PNR.");
    if (!form.cutDate || !form.houseId || !form.cutterId || !form.warehouseId || !form.fabricId || !form.patternId || !files.length)
      return setError("Thiếu thông tin bắt buộc hoặc ảnh rập.");
    setBusy(true); setError(""); setOk("");
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error("Hết phiên đăng nhập.");
      if (!requestKey.current) requestKey.current = crypto.randomUUID();
      let savedPaths = [...uploadedPaths.current];
      if (savedPaths.length !== files.length) {
        for (const [index, file] of files.entries()) {
          if (savedPaths[index]) continue;
          const ext = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" :
            file.type === "image/webp" ? "webp" : "";
          if (!ext || file.size > 8 * 1024 * 1024) throw new Error(`Ảnh ${file.name} phải là PNG/JPG/WebP, tối đa 8MB.`);
          const path = await uploadR2File(file, "pattern");
          savedPaths[index] = path;
          uploadedPaths.current = [...savedPaths];
          setImagePaths([...savedPaths]);
        }
        setImagePaths(savedPaths);
      }
      const { data, error: e } = await sb.rpc("az_pattern_house_entry_create", {
        p_request_key: requestKey.current,
        p_data: {
          color_mode: mode, cut_date: form.cutDate,
          sewing_house_id: form.houseId, cutter_id: form.cutterId,
          warehouse_id: form.warehouseId, fabric_id: form.fabricId,
          preview_image_path: previewPath, image_paths: savedPaths,
          note: form.note.trim(), ...plan.value,
        },
      });
      if (e) throw e;
      const result = data as { slip_code: string; mam_code: string; already_created?: boolean };
      setOk(`${result.already_created ? "Phiếu đã được tạo trước đó" : "Đã lưu"}: ${result.slip_code} · ${result.mam_code}.`);
      router.push("/azalas/patterns/progress");
      router.refresh();
    } catch (e) { setError("Chưa lập được phiếu PNR: " + errorText(e)); }
    finally { setBusy(false); }
  }

  const chosenPattern = patterns.find(p => String(p.id) === form.patternId);
  const savedRate = rates.find(r => r.pattern_id === Number(form.patternId) && r.house_id === Number(form.houseId));
  const priceFieldError = sewingPriceTouched ? rapSewingPriceError(form.sewingPrice) : "";
  return <div className="stack">
    <Msg success={ok} />
    <section className="space-y-5 rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,.05)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h2 className="text-xl font-extrabold text-blue-900">Phiếu nhập rập · Hàng nhà</h2>
          <p className="text-sm text-slate-600">Một phiếu PNR, một mã rập chung, một mã MAM; nhiều hiệu, màu và size.</p></div>
        <span className="chip">Chưa tự nhập kho hoặc chốt công nợ</span>
      </div>
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950">
        Ảnh, ngày cắt, mã rập chung, nhà may, thợ cắt, kho, loại vải và đơn giá nhà may là bắt buộc. Các mẫu chỉ chọn hiệu, size đầu–cuối và tỉ lệ riêng khi dùng màu chung.
      </div>
      <div className="space-y-2">
        <p className={label}>Ảnh rập/sản phẩm * · Tải lên / Chụp / Copy dán (Ctrl + V)</p>
        <PhotoInput files={files} setFiles={next => { invalidate(); setFiles(next); }}
          label="Chọn ảnh hoặc nhấn vùng dán để Ctrl + V" />
        <label className="btn soft inline-flex w-fit cursor-pointer">📸 Chụp ảnh
          <input type="file" accept="image/*" capture="environment" className="sr-only"
            onChange={e => { const f = Array.from(e.target.files || []); if (f.length) { invalidate(); setFiles(old => [...old, ...f]); } e.currentTarget.value = ""; }} />
        </label>
        {photoUrls.length > 0 && <div className="grid grid-cols-3 gap-2 md:grid-cols-6">{photoUrls.map((url, i) =>
          <img key={url} src={url} alt={`Ảnh ${i + 1}`} className="aspect-square w-full rounded-xl border object-cover" />)}</div>}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className={label}>Ngày cắt *<input className={input} type="date" value={form.cutDate}
          onChange={e => changeForm("cutDate", e.target.value)}/></label>
        <label className={label}>Nhà may *<select className={input} value={form.houseId}
          onChange={e => changeForm("houseId", e.target.value)}><option value="">Chọn nhà may</option>
          {houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}</select></label>
        <label className={label}>Thợ cắt *<select className={input} value={form.cutterId}
          onChange={e => changeForm("cutterId", e.target.value)}><option value="">Chọn thợ cắt</option>
          {cutters.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className={label}>Kho nhập dự kiến *<select className={input} value={form.warehouseId}
          onChange={e => changeForm("warehouseId", e.target.value)}><option value="">Chọn kho</option>
          {warehouses.map(w => <option key={w.id} value={w.id}>{w.name} · {w.code}</option>)}</select></label>
        <label className={label}>Loại vải *<select className={input} value={form.fabricId}
          onChange={e => changeForm("fabricId", e.target.value)}><option value="">Chọn loại vải</option>
          {fabrics.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
        <label className={label}>Ghi chú phiếu<textarea className={input} rows={2} value={form.note}
          placeholder="Ghi chú nếu có" onChange={e => changeForm("note", e.target.value)} /></label>
      </div>
      <PatternCodePicker patterns={patterns} patternId={form.patternId}
        onChoose={id => changeForm("patternId", id)}
        onCreated={p => setPatterns(old => [...old, p].sort((a,b) => a.code.localeCompare(b.code, "vi")))}
        disabled={busy} label="Mã rập chung cho toàn phiếu *" />
      <label className={`${label} max-w-lg`}>Đơn giá nhà may (đ/chiếc) *
        <input className={`${input} ${priceFieldError ? "border-red-500" : ""}`} type="text"
          value={form.sewingPrice} inputMode="decimal" required aria-invalid={Boolean(priceFieldError)}
          placeholder="Bắt buộc nhập, ví dụ 12000"
          onBlur={() => setSewingPriceTouched(true)}
          onChange={e => { setSewingPriceTouched(true); changeForm("sewingPrice", e.target.value); }}/>
        {priceFieldError && <span className="mt-1 block text-sm font-semibold text-red-700">{priceFieldError}</span>}
      </label>
      {savedRate && Number(savedRate.unit_price) > 0 && <button type="button" className="btn soft w-fit"
        disabled={busy} onClick={() => { setSewingPriceTouched(true);
          changeForm("sewingPrice", String(savedRate.unit_price)); }}>
        Dùng giá đã lưu: {Number(savedRate.unit_price).toLocaleString("vi-VN")} đ/chiếc
      </button>}
      <div className="flex flex-wrap gap-2">
        {([ ["house","+ Nhà may"], ["cutter","+ Thợ cắt"], ["fabric","+ Loại vải"] ] as const)
          .map(([type, caption]) => <button key={type} className="btn soft" disabled={busy}
            onClick={() => { setAddType(addType === type ? null : type); setAddName(""); }}>{caption}</button>)}
      </div>
      {addType && <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
        <p className="mb-2 font-bold text-blue-900">Thêm {addType === "house" ? "nhà may" : addType === "cutter" ? "thợ cắt" : "loại vải"}</p>
        <div className="flex flex-wrap gap-2"><input className="field flex-1" placeholder="Tên *" value={addName}
          onChange={e => setAddName(e.target.value)}/>
          <button className="btn primary" disabled={busy} onClick={() => void addCatalogItem()}>Lưu danh mục</button></div>
      </div>}
    </section>

    <section className="space-y-5 rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,.05)] sm:p-6">
      <h2 className="text-lg font-extrabold text-blue-900">Kiểu nhập màu và tỷ lệ size</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <label className={`cursor-pointer rounded-xl border-2 p-4 ${mode === "common" ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}>
          <input type="radio" name="rap-color-mode" checked={mode === "common"} onChange={() => changeMode("common")}/>
          <b className="ml-2">Màu chung toàn phiếu · Mỗi mẫu có tỉ lệ riêng</b>
          <p className="mt-2 text-sm text-slate-700">Màu và số lớp nhập một lần; từng mẫu/hiệu chọn size và tỉ lệ riêng.</p>
        </label>
        <label className={`cursor-pointer rounded-xl border-2 p-4 ${mode === "perModel" ? "border-blue-600 bg-blue-50" : "border-slate-200"}`}>
          <input type="radio" name="rap-color-mode" checked={mode === "perModel"} onChange={() => changeMode("perModel")}/>
          <b className="ml-2">Màu riêng theo mẫu · Dùng tỉ lệ chung</b>
          <p className="mt-2 text-sm text-slate-700">Size và tỉ lệ nhập một lần; từng mẫu/hiệu tự nhập màu và số lớp.</p>
        </label>
      </div>
      {mode === "perModel" && <div className="grid gap-3 rounded-xl bg-blue-50 p-4 sm:grid-cols-3">
        <label className={label}>Size từ<select className={input} value={commonSizeFrom}
          onChange={e => { invalidate(); setCommonSizeFrom(e.target.value); }}><option value="">Chọn size đầu</option><option value="">Chọn size cuối</option>{RAP_SIZES.map(s =>
            <option key={s}>{s}</option>)}</select></label>
        <label className={label}>Đến size<select className={input} value={commonSizeTo}
          onChange={e => { invalidate(); setCommonSizeTo(e.target.value); }}>{RAP_SIZES.map(s =>
            <option key={s}>{s}</option>)}</select></label>
        <label className={label}>Tỉ lệ chung<input className={input} inputMode="numeric" value={commonRatio}
          placeholder="12221" onChange={e => { invalidate(); setCommonRatio(e.target.value); }}/></label>
      </div>}
      {mode === "common" && <div className="rounded-xl bg-blue-50 p-4">
        <h3 className="mb-3 font-bold text-blue-900">Màu / lớp chung toàn phiếu</h3>
        <div className="mb-3 flex flex-wrap gap-2">
          <textarea className="field min-w-[240px] flex-1" rows={2} value={commonColorQuick}
            placeholder={"Ví dụ: CAM 10 20 30 10 20\nĐEN 20 10 20"} onChange={e => setCommonColorQuick(e.target.value)} />
          <button className="btn primary" type="button" onClick={() => splitColors()}>Tách màu chung</button>
        </div>
        <p className="mb-2 text-sm text-blue-900">Mỗi số trên cùng dòng là số lớp cần cộng. Ví dụ: CAM 10 20 30 10 20 → CAM 90 lớp. Màu trùng ở nhiều dòng cũng được gộp.</p>
        {commonColors.map(row => <div key={row.id} className="mb-2 grid grid-cols-[1fr_110px_auto] gap-2">
          <input className="field" placeholder="Màu" value={row.color}
            onChange={e => changeColor(row.id, { color: e.target.value })}/>
          <input className="field" inputMode="numeric" placeholder="Số lớp" value={row.layers}
            onChange={e => changeColor(row.id, { layers: e.target.value })}/>
          <button className="btn danger" disabled={commonColors.length === 1} onClick={() => { invalidate();
            setCommonColors(old => old.filter(c => c.id !== row.id)); }}>Xóa</button>
        </div>)}
        <button className="btn soft" onClick={() => { invalidate(); setCommonColors(old => [...old, newColor()]); }}>+ Thêm màu</button>
      </div>}
    </section>

    <section className="space-y-5 rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,.05)] sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-extrabold text-blue-900">Mẫu / hiệu trong phiếu</h2>
        <button className="btn soft" onClick={() => { invalidate(); setModels(old => [...old, newModel()]); }}>+ Thêm mẫu/hiệu</button></div>
      {models.map((model, ix) => {
        const displayName = chosenPattern ? `${chosenPattern.product_name} ${model.brand.trim()}`.trim() : "";
        return <div key={model.id} className="space-y-3 rounded-xl border-2 border-slate-200 bg-white p-3 sm:p-4">
          <div className="flex justify-between gap-2"><b className="text-blue-800">Mẫu / hiệu {ix + 1}</b>
            <button className="btn danger" disabled={models.length === 1} onClick={() => { invalidate();
              setModels(old => old.filter(m => m.id !== model.id)); }}>Xóa mẫu</button></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className={label}>Chọn hiệu *<input className={input} value={model.brand}
              list="az-pattern-brands" placeholder="Ví dụ: NAI, DAS, Nike..."
              onChange={e => changeModel(model.id, { brand: e.target.value })}/></label>
            <label className={label}>Tên hiển thị · tự ghép
              <input className={`${input} bg-slate-100 font-bold text-green-900`} readOnly value={displayName}
                placeholder="Chọn mã rập chung rồi nhập hiệu"/></label>
          </div>
          {mode === "common" && <div className="grid gap-3 rounded-xl bg-blue-50 p-3 sm:grid-cols-3">
            <label className={label}>Size đầu *<select className={input} value={model.sizeFrom}
              onChange={e => changeModel(model.id, { sizeFrom: e.target.value })}><option value="">Chọn size đầu</option>
              {RAP_SIZES.map(s => <option key={s}>{s}</option>)}</select></label>
            <label className={label}>Size cuối *<select className={input} value={model.sizeTo}
              onChange={e => changeModel(model.id, { sizeTo: e.target.value })}><option value="">Chọn size cuối</option>
              {RAP_SIZES.map(s => <option key={s}>{s}</option>)}</select></label>
            <label className={label}>Tỉ lệ size riêng *<input className={input} inputMode="numeric" placeholder="Ví dụ: 12221"
              value={model.ratio} onChange={e => changeModel(model.id, { ratio: e.target.value })}/></label>
          </div>}
          {mode === "perModel" && <div className="rounded-xl bg-blue-50 p-3">
            <h3 className="mb-2 font-bold text-blue-900">Màu / lớp riêng của hiệu {model.brand || ix + 1}</h3>
            <div className="mb-3 flex flex-wrap gap-2">
              <textarea className="field min-w-[240px] flex-1" rows={2}
                placeholder={"Ví dụ: CAM 10 20 30 10 20\nĐEN 20 10 20"} value={modelColorQuick[model.id] || ""}
                onChange={e => setModelColorQuick(old => ({ ...old, [model.id]: e.target.value }))}/>
              <button className="btn primary" type="button" onClick={() => splitColors(model.id)}>Tách màu mẫu {ix + 1}</button>
            </div>
            {model.colors.map(row => <div key={row.id} className="mb-2 grid grid-cols-[1fr_110px_auto] gap-2">
              <input className="field" placeholder="Màu" value={row.color}
                onChange={e => changeColor(row.id, { color: e.target.value }, model.id)}/>
              <input className="field" inputMode="numeric" placeholder="Số lớp, ví dụ 100" value={row.layers}
                onChange={e => changeColor(row.id, { layers: e.target.value }, model.id)}/>
              <button className="btn danger" disabled={model.colors.length === 1} onClick={() => changeModel(model.id,
                { colors: model.colors.filter(c => c.id !== row.id) })}>Xóa</button>
            </div>)}
            <button className="btn soft" onClick={() => changeModel(model.id,
              { colors: [...model.colors, newColor()] })}>+ Thêm màu</button>
          </div>}
        </div>;
      })}
      <datalist id="az-pattern-brands">{["NAI","DAS","NIKE","ADIDAS","AZALAS","UNDER ARMOUR","LULULEMON","STUSSY","THE NORTH FACE"]
        .map(name => <option key={name} value={name}/>)}</datalist>
      <div className={`rounded-xl border p-4 text-sm font-semibold ${plan.error ? "border-amber-200 bg-amber-50 text-amber-950" : "border-green-200 bg-green-50 text-green-950"}`}>
        {plan.value ? `Tổng kế hoạch: ${plan.value.total.toLocaleString("vi-VN")} chiếc · ${models.length} hiệu. ${chosenPattern?.code || ""} được dùng chung cho tất cả hiệu.`
          : `Chưa đủ thông tin kế hoạch: ${plan.error}` }
      </div>
    </section>

    <section className="space-y-5 rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,.05)] sm:p-6">
      <Msg error={error} />
      <button className="btn primary w-fit" disabled={busy} onClick={openPreview}>1 · Xem trước phiếu</button>
      {showPreview && plan.value && <>
        <div ref={paper} className="mx-auto w-full overflow-hidden rounded-xl border-2 border-slate-300 bg-white p-4 text-[15px] text-slate-900 sm:p-6">
          <p className="text-center text-sm font-extrabold tracking-wide text-blue-800">AZALAS SPORT</p>
          <h2 className="mt-1 text-center text-2xl font-black">PHIẾU NHẬP RẬP · HÀNG NHÀ</h2>
          <p className="mb-4 text-center text-sm font-semibold text-slate-600">Mã PNR / MAM sẽ được cấp tự động khi lưu</p>
          <div className="grid gap-1 border-b pb-3 sm:grid-cols-2">
            <span><b>Mã rập chung:</b> {chosenPattern?.code}</span>
            <span><b>Tên sản phẩm chung:</b> {chosenPattern?.product_name}</span>
            <span><b>Ngày cắt:</b> {day(form.cutDate)}</span>
            <span><b>Nhà may:</b> {houses.find(h => h.id === Number(form.houseId))?.name}</span>
            <span><b>Đơn giá nhà may:</b> {Number(form.sewingPrice).toLocaleString("vi-VN")} đ/chiếc</span>
            <span><b>Thợ cắt:</b> {cutters.find(c => c.id === Number(form.cutterId))?.name}</span>
            <span><b>Kho dự kiến:</b> {warehouses.find(w => w.id === Number(form.warehouseId))?.name}</span>
            <span><b>Loại vải:</b> {fabrics.find(f => f.id === Number(form.fabricId))?.name}</span>
            <span><b>Kiểu nhập:</b> {mode === "common" ? "Màu chung · tỷ lệ riêng" : "Màu riêng · tỷ lệ chung"}</span>
          </div>
          {plan.value.models.map((m, i) => <div key={i} className="mt-4">
            <p className="mb-2 font-extrabold text-blue-900">Mẫu {i + 1} · {patterns.find(p => p.id === m.pattern_id)?.code} ·
              {patterns.find(p => p.id === m.pattern_id)?.product_name} {m.brand}</p>
            <div className="overflow-x-auto"><table className="w-full border-collapse text-left text-sm">
              <thead><tr className="bg-blue-50"><th className="border p-2">Màu</th><th className="border p-2">Size</th>
                <th className="border p-2 text-right">Lớp</th><th className="border p-2 text-right">Tỷ lệ</th>
                <th className="border p-2 text-right">SL kế hoạch</th></tr></thead>
              <tbody>{m.colors.flatMap(c => m.sizes.map((s, ix) => m.ratios[ix] === 0 ? null :
                <tr key={`${c.color}-${s}`}><td className="border p-2">{c.color}</td><td className="border p-2">{s}</td>
                <td className="border p-2 text-right">{c.layers}</td><td className="border p-2 text-right">{m.ratios[ix]}</td>
                <td className="border p-2 text-right font-bold">{c.layers * m.ratios[ix]}</td></tr>))}</tbody>
            </table></div>
          </div>)}
          <div className="mt-4 border-t-2 border-slate-900 pt-3 text-right text-xl font-black">
            TỔNG KẾ HOẠCH: {plan.value.total.toLocaleString("vi-VN")} CHIẾC
          </div>
          {form.note.trim() && <p className="mt-2 whitespace-pre-wrap text-sm"><b>Ghi chú:</b> {form.note.trim()}</p>}
          {photoUrls.length > 0 && <div className="mt-3 grid grid-cols-4 gap-2">{photoUrls.map((url,i) =>
            <img key={url} src={url} alt={`Ảnh rập ${i + 1}`} className="aspect-square w-full object-contain" />)}</div>}
        </div>
        <p className="text-sm text-slate-600">Sau khi kiểm tra, chụp và lưu ảnh phiếu. Sửa bất kỳ nội dung nào sẽ phải chụp lại.</p>
        <button className="btn success w-fit" disabled={busy} onClick={() => void capturePreview()}>
          {busy ? "Đang chụp & lưu..." : "2 · Chụp & lưu ảnh preview phiếu"}
        </button>
        {previewPath && <div className="rounded-xl border border-green-300 bg-green-50 p-3 font-bold text-green-900">
          ✓ Đã lưu ảnh preview vào Storage Private.
        </div>}
        <button className="btn primary w-fit" disabled={busy || !previewPath} onClick={() => void saveSlip()}>
          {busy ? "Đang lưu..." : "3 · Lưu phiếu PNR và tạo mâm"}
        </button>
      </>}
    </section>
  </div>;
}
