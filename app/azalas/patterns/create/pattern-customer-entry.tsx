"use client";

import { R2_PATTERN_SLIP_READY, R2_SQL_BLOCKED_MESSAGE } from "@/lib/azalas/r2-rollout-gates";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadR2File } from "@/lib/azalas/media-client";
import { Msg, PhotoInput } from "@/components/ui";
import { errorText } from "@/lib/azalas/format";
import { parseCustomerQuantity, rapSewingPriceError } from "@/lib/azalas/pattern-house";
import PatternCodePicker from "./pattern-code-picker";

type Pattern = {id: number; code: string; product_name: string; cost_price: number};
type Partner = {id: number; name: string};
type Customer = {id: number; name: string; phone: string | null};
type Rate = {pattern_id: number; house_id: number; unit_price: number};
const input = "field mt-1 w-full";
const label = "block text-sm font-bold text-slate-700";
const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export default function PatternCustomerEntry() {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const requestKey = useRef<string | null>(null);
  const uploadedPaths = useRef<string[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [houses, setHouses] = useState<Partner[]>([]);
  const [cutters, setCutters] = useState<Partner[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [rates, setRates] = useState<Rate[]>([]);
  const [searchCustomer, setSearchCustomer] = useState("");
  const [showNewCustomer, setShowNewCustomer] = useState(false);
  const [newCustomer, setNewCustomer] = useState({name: "", phone: "", address: ""});
  const [form, setForm] = useState({cutDate: "", deliveryDate: "", customerId: "", patternId: "",
    houseId: "", cutterId: "", brand: "", sizeRange: "", ratio: "", quantityInput: "",
    sewingPrice: "", note: ""});
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [busy, setBusy] = useState(false);
  const [sewingPriceTouched, setSewingPriceTouched] = useState(false);
  const selectedPattern = patterns.find(p => String(p.id) === form.patternId);
  const selectedCustomer = customers.find(c => String(c.id) === form.customerId);
  const savedRate = rates.find(r => r.pattern_id === Number(form.patternId) && r.house_id === Number(form.houseId));
  const priceFieldError = sewingPriceTouched ? rapSewingPriceError(form.sewingPrice) : "";
  const matches = customers.filter(c => norm(`${c.name} ${c.phone || ""}`).includes(norm(searchCustomer))).slice(0, 15);
  const quantity = useMemo(() => {
    try { return {value: parseCustomerQuantity(form.quantityInput), error: ""}; }
    catch (e) {return {value: null, error: errorText(e)};}
  }, [form.quantityInput]);

  useEffect(() => {
    (async () => {
      const [p, h, t, c, r] = await Promise.all([
        sb.from("pattern_catalog").select("id,code,product_name,cost_price").order("code").limit(1000),
        sb.from("sewing_houses").select("id,name").eq("is_active", true).order("name"),
        sb.from("cutters").select("id,name").eq("is_active", true).order("name"),
        sb.from("az_customers").select("id,name,phone").order("id", {ascending: false}).limit(500),
        sb.from("sewing_rates").select("pattern_id,house_id,unit_price"),
      ]);
      const issue = [p.error, h.error, t.error, c.error, r.error].find(Boolean);
      if (issue) setError("Không tải được danh mục: " + issue.message);
      setPatterns((p.data || []) as Pattern[]); setHouses((h.data || []) as Partner[]);
      setCutters((t.data || []) as Partner[]); setCustomers((c.data || []) as Customer[]);
      setRates((r.data || []) as Rate[]);
    })().catch(e => setError(errorText(e)));
  }, [sb]);

  function change(field: keyof typeof form, value: string) {
    const rateContextChanged = field === "houseId" || field === "patternId";
    setForm(old => ({...old, [field]: value,
      ...(rateContextChanged ? {sewingPrice: ""} : {})}));
    if (rateContextChanged) setSewingPriceTouched(false);
    setError(""); setOk("");
  }
  async function createCustomer() {
    if (!newCustomer.name.trim()) return setError("Nhập tên khách hàng.");
    setBusy(true); setError("");
    try {
      const {data: {user}} = await sb.auth.getUser();
      if (!user) throw new Error("Hết phiên đăng nhập.");
      const {data, error: e} = await sb.from("az_customers").insert({
        name: newCustomer.name.trim(), phone: newCustomer.phone.trim() || null,
        address: newCustomer.address.trim() || null, created_by: user.id,
      }).select("id,name,phone").single();
      if (e || !data) throw e || new Error("Không tạo được khách hàng.");
      const customer = data as Customer;
      setCustomers(old => [customer, ...old]);
      change("customerId", String(customer.id)); setSearchCustomer(customer.name);
      setShowNewCustomer(false); setNewCustomer({name: "", phone: "", address: ""});
      setOk("Đã thêm và chọn khách hàng.");
    } catch(e) {setError(errorText(e));} finally {setBusy(false);}
  }
  function setImages(next: File[]) {
    setFiles(next); uploadedPaths.current = []; requestKey.current = null;
    setError(""); setOk("");
  }
  async function save() {
    setError(""); setOk("");
    if (busy) return;
    if (!R2_PATTERN_SLIP_READY) return setError(R2_SQL_BLOCKED_MESSAGE);
    if (!files.length || files.length > 12) return setError("Cần 1–12 ảnh rập/sản phẩm. Có thể chụp, tải lên hoặc Ctrl + V.");
    if (!form.cutDate || !form.deliveryDate || !form.customerId || !form.patternId || !form.houseId || !form.cutterId)
      return setError("Chọn đủ ngày cắt, ngày giao, khách hàng, mã rập, nhà may và thợ cắt.");
    if (!form.sizeRange.trim()) return setError("Nhập size hoặc dải size của hàng khách đặt.");
    if (!quantity.value) return setError(quantity.error);
    if (!window.confirm("CHÚ Ý: Preview đang dùng CHUNG database với app chính. Tạo Rập Khách đặt sẽ ghi dữ liệu thật. Bạn có đồng ý tiếp tục?")) return;
    setSewingPriceTouched(true);
    const priceError = rapSewingPriceError(form.sewingPrice);
    if (priceError) return setError(priceError);
    setBusy(true);
    try {
      const {data: {user}} = await sb.auth.getUser();
      if (!user) throw new Error("Hết phiên đăng nhập.");
      if (!requestKey.current) requestKey.current = crypto.randomUUID();
      const paths = [...uploadedPaths.current];
      for (const [index, file] of files.entries()) {
        if (paths[index]) continue;
        const ext = file.type === "image/png" ? "png" : file.type === "image/jpeg" ? "jpg" : file.type === "image/webp" ? "webp" : "";
        if (!ext || file.size > 8 * 1024 * 1024) throw new Error(`Ảnh ${file.name} phải là PNG/JPG/WebP và tối đa 8 MB.`);
        const path = await uploadR2File(file, "pattern");
        paths[index] = path; uploadedPaths.current = [...paths];
      }
      const {data, error: e} = await sb.rpc("az_pattern_customer_entry_create", {
        p_request_key: requestKey.current,
        p_data: {
          cut_date: form.cutDate, delivery_date: form.deliveryDate,
          customer_id: Number(form.customerId), pattern_id: Number(form.patternId),
          sewing_house_id: Number(form.houseId), cutter_id: Number(form.cutterId),
          brand: form.brand.trim(), size_range: form.sizeRange.trim(), size_ratio: form.ratio.trim(),
          quantity_expression: form.quantityInput.trim(), sewing_price: form.sewingPrice.trim(),
          note: form.note.trim(), image_paths: paths,
        },
      });
      if (e) throw e;
      const result = data as {job_code?: string; already_created?: boolean};
      setOk(result.already_created ? "Mâm khách đặt đã tạo trước đó." : `Đã tạo rập khách đặt ${result.job_code || ""}.`);
      router.push("/azalas/patterns/progress"); router.refresh();
    } catch(e) {setError("Chưa lưu được rập khách đặt: " + errorText(e));}
    finally {setBusy(false);}
  }

  return <div className="stack">
    <Msg error={error} success={ok}/>
    <section className="space-y-5 rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,.05)] sm:p-6">
      <h2 className="text-xl font-extrabold text-violet-900">Rập Khách đặt</h2>
      <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 text-sm font-semibold text-violet-950">
        Rập Khách đặt không cần chọn mã đơn. Chọn khách hàng trực tiếp; số lượng được khai độc lập theo thực tế: 100x7=700 hoặc x=700. Tỉ lệ size có thể để trống và không tự thay đổi số lượng.
      </div>
      <div className="space-y-2">
        <p className={label}>Ảnh rập/sản phẩm * · Tải lên / Chụp / Copy dán (Ctrl + V)</p>
        <PhotoInput files={files} setFiles={setImages} label="Chọn ảnh hoặc nhấn vùng dán để Ctrl + V" />
        <label className="btn soft inline-flex w-fit cursor-pointer">📸 Chụp ảnh
          <input type="file" accept="image/*" capture="environment" className="sr-only"
            onChange={e => { const next = Array.from(e.target.files || []); if (next.length) setImages([...files, ...next]); e.currentTarget.value = ""; }}/>
        </label>
        {files.length > 0 && <p className="text-sm text-green-800">✓ Đã chọn {files.length} ảnh.</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Ngày cắt *<input className={input} type="date" value={form.cutDate} onChange={e => change("cutDate", e.target.value)}/></label>
        <label className={label}>Ngày giao dự kiến *<input className={input} type="date" value={form.deliveryDate} onChange={e => change("deliveryDate", e.target.value)}/></label>
      </div>
      <div className="rounded-xl border border-blue-200 p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <label className={label}>Tên khách đặt *</label>
          <button className="btn soft" type="button" disabled={busy} onClick={() => setShowNewCustomer(v => !v)}>+ Thêm khách</button>
        </div>
        <input className={input} placeholder="Gõ tên khách hoặc số điện thoại, rồi chọn trong danh sách" value={searchCustomer}
          onChange={e => {setSearchCustomer(e.target.value); change("customerId", "");}}/>
        {searchCustomer.trim() && !selectedCustomer && <div className="mt-2 max-h-48 overflow-auto rounded-xl border">
          {matches.map(c => <button className="block w-full border-b p-3 text-left hover:bg-blue-50" type="button" key={c.id}
            onClick={() => {change("customerId", String(c.id)); setSearchCustomer(c.name);}}>
            <b>{c.name}</b> {c.phone && `· ${c.phone}`}</button>)}
          {!matches.length && <p className="p-3 text-sm text-amber-900">Không thấy khách này. Dùng nút + Thêm khách để tạo mới.</p>}
        </div>}
        {selectedCustomer && <p className="mt-2 text-sm font-bold text-green-800">✓ Đã chọn {selectedCustomer.name}</p>}
        {showNewCustomer && <div className="mt-3 grid gap-2 rounded-xl bg-blue-50 p-3 sm:grid-cols-2">
          <input className="field" placeholder="Tên khách *" value={newCustomer.name} onChange={e => setNewCustomer(old => ({...old, name: e.target.value}))}/>
          <input className="field" placeholder="Số điện thoại (nếu có)" value={newCustomer.phone} onChange={e => setNewCustomer(old => ({...old, phone: e.target.value}))}/>
          <input className="field" placeholder="Địa chỉ (nếu có)" value={newCustomer.address} onChange={e => setNewCustomer(old => ({...old, address: e.target.value}))}/>
          <button className="btn primary" type="button" disabled={busy} onClick={() => void createCustomer()}>Lưu và chọn khách</button>
        </div>}
      </div>
      <PatternCodePicker patterns={patterns} patternId={form.patternId}
        onChoose={id => change("patternId", id)} onCreated={p => setPatterns(old => [...old, p])}
        disabled={busy} label="Mã rập * · Gõ để tìm hoặc thêm mã mới" />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className={label}>Nhà may *<select className={input} value={form.houseId} onChange={e => change("houseId", e.target.value)}>
          <option value="">Chọn nhà may</option>{houses.map(h => <option value={h.id} key={h.id}>{h.name}</option>)}</select></label>
        <label className={label}>Thợ cắt *<select className={input} value={form.cutterId} onChange={e => change("cutterId", e.target.value)}>
          <option value="">Chọn thợ cắt</option>{cutters.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}</select></label>
        <label className={label}>Hiệu (nếu có)<input className={input} value={form.brand} placeholder="Ví dụ: NAI, DAS" onChange={e => change("brand", e.target.value)}/></label>
        <label className={label}>Tên sản phẩm (tự lấy mã rập)
          <input className={`${input} bg-slate-100`} readOnly value={`${selectedPattern?.product_name || ""} ${form.brand.trim()}`.trim()} placeholder="Chọn mã rập"/></label>
        <label className={label}>Size / Dải size *<input className={input} value={form.sizeRange}
          placeholder="Ví dụ: M-3X hoặc M, L, 2X" onChange={e => change("sizeRange", e.target.value)}/></label>
        <label className={label}>Tỉ lệ size (không bắt buộc)<input className={input} value={form.ratio}
          placeholder="Ví dụ: 12221; để trống nếu cắt lẻ" onChange={e => change("ratio", e.target.value)}/></label>
        <label className={label}>Số lớp × số chiếc hoặc tổng SL *
          <input className={input} value={form.quantityInput} placeholder="100x7=700 hoặc x=700" onChange={e => change("quantityInput", e.target.value)}/>
        </label>
        <div><label className={label}>Đơn giá nhà may (đ/chiếc) *
          <input className={`${input} ${priceFieldError ? "border-red-500" : ""}`} type="text"
            value={form.sewingPrice} inputMode="decimal" required aria-invalid={Boolean(priceFieldError)}
            placeholder="Bắt buộc nhập, ví dụ 12000"
            onBlur={() => setSewingPriceTouched(true)}
            onChange={e => {setSewingPriceTouched(true); change("sewingPrice", e.target.value);}}/>
          {priceFieldError && <span className="mt-1 block text-sm font-semibold text-red-700">{priceFieldError}</span>}
        </label>
          {savedRate && Number(savedRate.unit_price) > 0 && <button type="button"
            className="btn soft mt-2 w-fit" disabled={busy}
            onClick={() => {setSewingPriceTouched(true); change("sewingPrice", String(savedRate.unit_price));}}>
            Dùng giá đã lưu: {Number(savedRate.unit_price).toLocaleString("vi-VN")} đ/chiếc
          </button>}
        </div>
      </div>
      <div className={`rounded-xl border p-4 text-sm font-semibold ${quantity.value ? "border-green-200 bg-green-50 text-green-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
        {quantity.value ? <>Kế hoạch: <b>{quantity.value.quantity.toLocaleString("vi-VN")} chiếc</b> · {quantity.value.layers === null
          ? "Không khai số lớp (cắt lẻ)." : `${quantity.value.layers} lớp.`} Tỉ lệ size chỉ là thông tin tham khảo, không ghi đè tổng SL.</>
          : <>Nhập số lượng theo một trong hai dạng: <b>100x7=700</b> hoặc <b>x=700</b>. {form.quantityInput && quantity.error}</>}
      </div>
      <label className={label}>Ghi chú<textarea rows={2} className={input} value={form.note} placeholder="Ghi chú nếu có"
        onChange={e => change("note", e.target.value)}/></label>
      <button className="btn primary w-fit" disabled={busy} onClick={() => void save()}>
        {busy ? "Đang lưu ảnh và tạo rập..." : "Lưu rập Khách đặt"}</button>
    </section>
  </div>;
}
