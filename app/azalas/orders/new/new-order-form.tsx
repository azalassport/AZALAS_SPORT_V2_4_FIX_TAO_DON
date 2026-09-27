"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Customer = { id: number; name: string; phone: string | null };
type Warehouse = { id: number; code: string; name: string };
type Result = { group_id: number; root_code: string; units: { id: number; order_code: string; warehouse: string }[] };
type DraftImage = { id: string; file: File; previewUrl: string; uploadedPath?: string };

const input = "mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-base outline-none focus:border-blue-500";
const acceptedImages = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxImageBytes = 8 * 1024 * 1024;

/** Ngày địa phương của doanh nghiệp, không lấy từ UTC hoặc đồng hồ client theo múi giờ khác. */
function todayVietnam(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date());
  const value = (part: string) => parts.find((p) => p.type === part)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export default function NewOrderForm() {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const objectUrls = useRef<string[]>([]);
  // Ngăn nhấn đúp trước khi React kịp render busy=true.
  const creationLocked = useRef(false);
  const [role, setRole] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerId, setCustomerId] = useState(0);
  const [type, setType] = useState<"THUONG" | "KHACH_DAT">("THUONG");
  const [whCodes, setWhCodes] = useState<string[]>([]);
  const [delivery, setDelivery] = useState("");
  const [today, setToday] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [note, setNote] = useState("");
  const [images, setImages] = useState<DraftImage[]>([]);
  const [zoomId, setZoomId] = useState<string | null>(null);
  const [addCustomer, setAddCustomer] = useState(false);
  const [showNewWarehouse, setShowNewWarehouse] = useState(false);
  const [newWarehouseName, setNewWarehouseName] = useState("");
  const [warehouseBusy, setWarehouseBusy] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    name: "", phone: "", address: "", transport_station: "", transport_phone: "",
  });
  const [createdAt, setCreatedAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState<Result | null>(null);

  useEffect(() => {
    const update = () => {
      setCreatedAt(new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" }));
      setToday(todayVietnam());
    };
    update();
    const timer = setInterval(update, 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    // Các blob URL chỉ để xem trước trên trình duyệt. Upload vẫn dùng file gốc 100%.
    return () => { objectUrls.current.forEach((url) => URL.revokeObjectURL(url)); objectUrls.current = []; };
  }, []);
  useEffect(() => {
    if (!zoomId) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") setZoomId(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomId]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const [{ data: profile }, { data: customerList, error: customerError }, { data: warehouseList, error: warehouseError }] = await Promise.all([
        sb.from("az_profiles").select("role").eq("id", user.id).single(),
        sb.from("az_customers").select("id,name,phone").order("id", { ascending: false }).limit(500),
        sb.from("az_warehouses").select("id,code,name").eq("is_active", true).order("name"),
      ]);
      if (!active) return;
      setRole(profile?.role ?? "");
      setCustomers(customerList ?? []);
      setWarehouses(warehouseList ?? []);
      if (customerError || warehouseError) setError(customerError?.message || warehouseError?.message || "");
    })();
    return () => { active = false; };
  }, [sb]);

  const matches = customers.filter((customer) =>
    `${customer.name} ${customer.phone || ""}`.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
      .includes(customerSearch.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()),
  ).slice(0, 10);
  const zoomImage = images.find((image) => image.id === zoomId);

  function addImages(picked: File[]) {
    if (busy) return;
    const accepted: DraftImage[] = [];
    const invalid: string[] = [];
    for (const file of picked) {
      if (!acceptedImages.has(file.type)) {
        invalid.push(`${file.name}: chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP`);
      } else if (file.size > maxImageBytes) {
        invalid.push(`${file.name}: tối đa 8 MB/ảnh`);
      } else {
        const previewUrl = URL.createObjectURL(file);
        objectUrls.current.push(previewUrl);
        accepted.push({ id: crypto.randomUUID(), file, previewUrl });
      }
    }
    if (accepted.length) setImages((old) => [...old, ...accepted]);
    if (invalid.length) setError(invalid.join(" | "));
    else if (accepted.length) setError("");
  }

  function removeImage(id: string) {
    if (busy) return;
    const removing = images.find((image) => image.id === id);
    if (!removing) return;
    setImages((old) => old.filter((image) => image.id !== id));
    setZoomId((old) => (old === id ? null : old));
    objectUrls.current = objectUrls.current.filter((url) => url !== removing.previewUrl);
    URL.revokeObjectURL(removing.previewUrl);
  }

  async function createCustomer() {
    setError("");
    if (!newCustomer.name.trim()) return setError("Tên khách bắt buộc.");
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return setError("Bạn chưa đăng nhập.");
    const { data, error: insertError } = await sb.from("az_customers")
      .insert({ ...newCustomer, name: newCustomer.name.trim(), created_by: user.id })
      .select("id,name,phone").single();
    if (insertError) return setError(insertError.message);
    if (data) {
      setCustomers((old) => [data, ...old]);
      setCustomerId(data.id);
      setCustomerSearch(data.name);
      setAddCustomer(false);
    }
  }

  async function addWarehouse() {
    const name = newWarehouseName.trim();
    if (!name) return setError("Bạn cần nhập tên kho trước khi lưu.");
    setWarehouseBusy(true);
    setError("");
    try {
      const { data, error: addError } = await sb.rpc("az_create_warehouse", { p_name: name });
      if (addError) return setError(addError.message);
      const warehouse = data as Warehouse;
      setWarehouses((old) => [...old, warehouse].sort((a, b) => a.name.localeCompare(b.name, "vi")));
      setWhCodes((old) => old.includes(warehouse.code) ? old : [...old, warehouse.code]);
      setNewWarehouseName("");
      setShowNewWarehouse(false);
    } finally {
      setWarehouseBusy(false);
    }
  }

  async function uploadPending(result: Result, selectedImages: DraftImage[]) {
    const failures: DraftImage[] = [];
    const messages: string[] = [];
    const { data: { user } } = await sb.auth.getUser();
    if (!user) {
      setError("Phiên đăng nhập đã hết. Đơn vẫn đã được tạo; đăng nhập lại rồi bổ sung ảnh trong Chi tiết đơn.");
      setBusy(false);
      return;
    }
    for (const image of selectedImages) {
      const extension = image.file.type === "image/png" ? "png" : image.file.type === "image/webp" ? "webp" : "jpg";
      const path = image.uploadedPath || `${user.id}/${result.group_id}/${crypto.randomUUID()}.${extension}`;
      if (!image.uploadedPath) {
        // Tải nguyên file người dùng chọn, không nén/cắt ảnh xem trước.
        const { error: uploadError } = await sb.storage.from("az-order-images")
          .upload(path, image.file, { contentType: image.file.type, upsert: false });
        if (uploadError) {
          failures.push(image);
          messages.push(`${image.file.name}: ${uploadError.message}`);
          continue;
        }
      }
      const { error: attachError } = await sb.rpc("az_attach_order_image", {
        p_group_id: result.group_id, p_path: path,
      });
      if (attachError) {
        failures.push({ ...image, uploadedPath: path });
        messages.push(`${image.file.name}: ${attachError.message}`);
      }
    }
    const failedIds = new Set(failures.map((image) => image.id));
    for (const image of selectedImages) {
      if (!failedIds.has(image.id)) {
        objectUrls.current = objectUrls.current.filter((url) => url !== image.previewUrl);
        URL.revokeObjectURL(image.previewUrl);
      }
    }
    setImages(failures);
    setBusy(false);
    if (messages.length) {
      setError("Đơn ĐÃ ĐƯỢC TẠO nhưng một số ảnh chưa lưu: " + messages.join(" | ") + ". Bấm Thử lưu ảnh còn thiếu; KHÔNG tạo đơn lần nữa.");
      return;
    }
    setPending(null);
    router.replace("/azalas");
    router.refresh();
  }

  async function saveOrder(event: FormEvent) {
    event.preventDefault();
    if (creationLocked.current || pending || busy || success) return;
    if (!customerId) return setError("Hãy chọn khách hàng.");
    if (type === "THUONG" && !whCodes.length) return setError("Đơn thường phải chọn ít nhất một kho.");
    if (type === "KHACH_DAT" && !delivery) return setError("Hàng khách đặt bắt buộc chọn ngày giao hàng.");
    creationLocked.current = true;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (images.length) {
        const { data: { user } } = await sb.auth.getUser();
        if (!user) throw new Error("Bạn chưa đăng nhập.");
        // Kiểm tra bucket trước khi ghi đơn, tránh tạo đơn thiếu ảnh khi bucket chưa có.
        const { error: bucketError } = await sb.storage.from("az-order-images").list(user.id, { limit: 1 });
        if (bucketError) throw new Error("Chưa truy cập được kho ảnh az-order-images: " + bucketError.message + ". Đơn CHƯA được tạo.");
      }
      const { data: created, error: createError } = await sb.rpc("az_create_order", {
        p_customer_id: customerId,
        p_order_type: type,
        p_warehouse_codes: type === "THUONG" ? whCodes : [],
        p_delivery_date: type === "THUONG" ? todayVietnam() : delivery,
        p_is_urgent: urgent,
        p_note: note || null,
      });
      if (createError) throw createError;
      const result = created as Result;
      // Từ đây đơn đã có trong DB: giữ pending để mọi thao tác tiếp theo KHÔNG tạo trùng.
      setPending(result);
      setSuccess("Đã tạo: " + result.units.map((unit) => unit.order_code).join(", "));
      if (!images.length) {
        setBusy(false);
        router.replace("/azalas");
        router.refresh();
        return;
      }
      await uploadPending(result, images);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Không thể tạo đơn. Vui lòng thử lại.");
      setBusy(false);
      // Nếu RPC trả lỗi không rõ kết quả sau khi mất mạng, phải kiểm tra danh sách đơn trước khi thử lại.
      creationLocked.current = false;
    }
  }

  if (role && role !== "OWNER" && role !== "ADMIN") {
    return <p className="rounded-xl bg-red-50 p-4">Tài khoản MEMBER không được tạo đơn.</p>;
  }

  return <>
    <form onSubmit={saveOrder} className="space-y-5 rounded-2xl border bg-white p-4 shadow-sm sm:p-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-semibold">Ngày tạo (tự động)
          <input className={input + " bg-slate-100"} readOnly value={createdAt} />
        </label>
        <label className="text-sm font-semibold">Ngày giao hàng {type === "KHACH_DAT" ? "*" : "(tự động: hôm nay)"}
          <input type="date" className={input + (type === "THUONG" ? " bg-slate-100" : "")}
            value={type === "THUONG" ? today : delivery}
            readOnly={type === "THUONG"} required={type === "KHACH_DAT"}
            onChange={(event) => setDelivery(event.target.value)} />
          {type === "KHACH_DAT" && <span className="mt-1 block text-xs font-medium text-rose-700">Khách đặt phải chọn ngày giao trước khi tạo đơn.</span>}
        </label>
      </div>

      <fieldset>
        <legend className="mb-2 font-bold">Loại đơn</legend>
        <div className="flex gap-4">
          {(["THUONG", "KHACH_DAT"] as const).map((kind) => <label key={kind} className="flex items-center gap-2">
            <input type="radio" checked={type === kind} onChange={() => {
              setType(kind); setWhCodes([]); setDelivery(""); setError("");
            }} />{kind === "THUONG" ? "Thường" : "Khách đặt"}
          </label>)}
        </div>
      </fieldset>

      {type === "THUONG" && <fieldset className="rounded-xl bg-blue-50 p-4">
        <legend className="font-bold">Chọn kho (có thể tick nhiều)</legend>
        <div className="mt-2 flex flex-wrap gap-5">{warehouses.map((warehouse) => <label key={warehouse.id} className="flex items-center gap-2">
          <input type="checkbox" checked={whCodes.includes(warehouse.code)} onChange={(event) => setWhCodes((old) =>
            event.target.checked ? [...old, warehouse.code] : old.filter((code) => code !== warehouse.code),
          )} />{warehouse.name} ({warehouse.code})
        </label>)}</div>
        {!showNewWarehouse ? <button type="button" className="btn soft mt-4" disabled={busy}
          onClick={() => setShowNewWarehouse(true)}>+ Thêm kho</button> :
          <div className="mt-4 rounded-xl border border-blue-200 bg-white p-3">
            <label className="block text-sm font-semibold">Tên kho mới (OWNER / ADMIN)
              <input autoFocus className={input} placeholder="Ví dụ: Kho Hóc Môn" value={newWarehouseName}
                onChange={(event) => setNewWarehouseName(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void addWarehouse(); } }} />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn primary" disabled={warehouseBusy || busy || !newWarehouseName.trim()}
                onClick={() => void addWarehouse()}>{warehouseBusy ? "Đang lưu kho..." : "Lưu kho"}</button>
              <button type="button" className="btn soft" disabled={warehouseBusy} onClick={() => {
                setShowNewWarehouse(false); setNewWarehouseName("");
              }}>Hủy</button>
            </div>
          </div>}
        <p className="mt-2 text-xs text-blue-900">Mỗi kho được chọn sẽ tạo đơn soạn riêng. Kho mới được cấp mã tự động.</p>
      </fieldset>}

      <section className="space-y-2">
        <div className="flex items-center justify-between"><label className="font-bold">Khách hàng *</label>
          <button type="button" onClick={() => setAddCustomer((old) => !old)} className="rounded-lg bg-blue-100 px-3 py-2 text-sm font-bold text-blue-800">+ Thêm khách</button>
        </div>
        <input className={input} placeholder="Tìm theo tên hoặc số điện thoại" value={customerSearch}
          onChange={(event) => { setCustomerSearch(event.target.value); setCustomerId(0); }} />
        {!customerId && customerSearch && <div className="max-h-48 overflow-auto rounded-xl border">
          {matches.map((customer) => <button key={customer.id} type="button" onClick={() => {
            setCustomerId(customer.id); setCustomerSearch(customer.name);
          }} className="block w-full border-b p-3 text-left hover:bg-blue-50">{customer.name} {customer.phone && `· ${customer.phone}`}</button>)}
        </div>}
        {customerId > 0 && <div className="text-sm font-semibold text-green-700">✓ Đã chọn khách #{customerId}</div>}
        {addCustomer && <div className="grid gap-3 rounded-xl border bg-slate-50 p-4 sm:grid-cols-2">
          {([ ["name", "Tên khách *"], ["phone", "SĐT"], ["address", "Địa chỉ"],
            ["transport_station", "Chành xe"], ["transport_phone", "SĐT chành xe"] ] as const).map(([key, label]) =>
            <label key={key} className="text-sm">{label}<input className={input} value={newCustomer[key]}
              onChange={(event) => setNewCustomer((old) => ({ ...old, [key]: event.target.value }))} /></label>)}
          <button type="button" onClick={() => void createCustomer()} className="rounded-lg bg-blue-700 p-3 font-semibold text-white">Lưu khách và chọn</button>
        </div>}
      </section>

      <label className="flex items-center gap-3 rounded-xl bg-red-50 p-4 font-semibold text-red-800">
        <input type="checkbox" checked={urgent} onChange={(event) => setUrgent(event.target.checked)} />🔥 Đơn GẤP
      </label>

      <section className="space-y-3">
        <label className="block font-semibold">Ảnh đơn (có thể chọn nhiều ảnh, hoặc Ctrl + V vào vùng bên dưới)
          <input className={input} type="file" accept="image/png,image/jpeg,image/webp" multiple disabled={busy}
            onChange={(event) => { addImages(Array.from(event.currentTarget.files || [])); event.currentTarget.value = ""; }} />
        </label>
        <div tabIndex={0} onPaste={(event) => {
          const pasted = Array.from(event.clipboardData.files).filter((file) => file.type.startsWith("image/"));
          if (pasted.length) { event.preventDefault(); addImages(pasted); }
        }} className="rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 p-5 text-sm text-blue-900 focus:outline-blue-500">
          Bấm vào đây rồi nhấn Ctrl + V để dán ảnh. Đã chọn <strong>{images.length} ảnh</strong>.
          <span className="mt-1 block text-xs">Ảnh xem trước ở bên dưới; khi tạo đơn hệ thống lưu file ảnh gốc.</span>
        </div>
        {images.length > 0 && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Ảnh xem trước của đơn hàng">
          {images.map((image, index) => <div key={image.id} className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
            <button type="button" className="block w-full" onClick={() => setZoomId(image.id)} title="Bấm để xem ảnh lớn">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={image.previewUrl} alt={`Ảnh đơn xem trước ${index + 1}: ${image.file.name}`}
                className="h-36 w-full rounded-lg bg-slate-100 object-contain" />
            </button>
            <div className="mt-2 break-all text-xs text-slate-600" title={image.file.name}>{image.file.name}</div>
            <button type="button" disabled={busy} onClick={() => removeImage(image.id)}
              className="mt-2 w-full rounded-lg border border-red-200 bg-red-50 px-2 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
              aria-label={`Xóa ảnh ${image.file.name}`}>✕ Xóa ảnh này</button>
          </div>)}
        </div>}
      </section>

      <label className="block font-semibold">Ghi chú tạo đơn
        <textarea className={input} rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm font-semibold text-red-800">{error}</p>}
      {success && <p className="rounded-xl bg-green-50 p-3 font-semibold text-green-800">{success}</p>}
      {pending && <div className="flex flex-wrap gap-3">
        <button type="button" className="rounded-xl bg-amber-600 px-4 py-3 font-bold text-white" disabled={busy || !images.length}
          onClick={() => { setBusy(true); setError(""); void uploadPending(pending, images); }}>Thử lưu ảnh còn thiếu</button>
        <button type="button" className="rounded-xl border px-4 py-3 font-bold" onClick={() => router.push("/azalas/orders")}>Xem đơn đã tạo</button>
      </div>}
      <button disabled={busy || !customerId || (type === "THUONG" && !whCodes.length) ||
        (type === "KHACH_DAT" && !delivery) || Boolean(success)}
        className="w-full rounded-xl bg-blue-700 px-5 py-4 text-lg font-extrabold text-white disabled:opacity-50">
        {busy ? "Đang tạo đơn và lưu ảnh..." : "TẠO ĐƠN HÀNG"}
      </button>
    </form>
    {zoomImage && <div role="dialog" aria-modal="true" aria-label="Xem ảnh đơn hàng" onClick={() => setZoomId(null)}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 p-4">
      <button type="button" onClick={() => setZoomId(null)} className="absolute right-4 top-4 rounded-xl bg-white px-4 py-2 font-bold text-slate-900">✕ Đóng ảnh</button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={zoomImage.previewUrl} alt={zoomImage.file.name} onClick={(event) => event.stopPropagation()}
        className="max-h-[88vh] max-w-full rounded-lg object-contain" />
    </div>}
  </>;
}
