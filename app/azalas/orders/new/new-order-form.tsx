"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  CalendarDays,
  ClipboardList,
  FileText,
  Flame,
  Home,
  Image as ImageIcon,
  Info,
  Paperclip,
  Pencil,
  Plus,
  Search,
  StickyNote,
  UserRound,
  Warehouse as WarehouseIcon,
} from "lucide-react";

type Customer = { id: number; name: string; phone: string | null };
type Warehouse = { id: number; code: string; name: string };
type Result = { group_id: number; root_code: string; units: { id: number; order_code: string; warehouse: string }[] };
type DraftImage = { id: string; file: File; previewUrl: string; uploadedPath?: string };

const input = "mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3.5 text-[17px] font-medium text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100";
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
      console.error("Một số ảnh của đơn chưa lưu:", messages.join(" | "));
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
    return (
      <p className="rounded-2xl border border-red-100 bg-red-50 p-5 text-[16px] font-bold text-red-800">
        Tài khoản MEMBER không được tạo đơn.
      </p>
    );
  }

  return (
    <>
      <form
        onSubmit={saveOrder}
        className="overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_16px_44px_rgba(15,23,42,0.07)]"
      >
        <div className="flex items-center gap-4 border-b border-slate-100 px-5 py-5 sm:px-7 sm:py-6">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-600 sm:h-16 sm:w-16">
            <ClipboardList size={31} strokeWidth={2.2} />
          </div>

          <div>
            <h2 className="m-0 text-[28px] font-black leading-tight tracking-[-0.4px] text-slate-950 sm:text-[32px]">
              Tạo đơn hàng
            </h2>
            <p className="mt-1 text-[15px] font-medium text-slate-500 sm:text-[16px]">
              Điền đầy đủ thông tin để tạo đơn hàng mới
            </p>
          </div>
        </div>

        <div className="space-y-6 p-4 sm:p-6">
          <div className="rounded-[22px] border border-slate-200 bg-white p-4 sm:p-5">
            <div className="grid gap-5 lg:grid-cols-[56px_1fr_1fr] lg:items-start">
              <div className="hidden h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600 lg:mt-[30px] lg:grid">
                <CalendarDays size={28} strokeWidth={2.2} />
              </div>

              <label className="text-[17px] font-extrabold text-slate-900">
                Ngày tạo (tự động)
                <div className="relative">
                  <CalendarDays
                    size={20}
                    className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    className={input + " !mt-2 bg-slate-50 !pl-12"}
                    readOnly
                    value={createdAt}
                  />
                </div>
              </label>

              <label className="text-[17px] font-extrabold text-slate-900">
                Ngày giao hàng {type === "KHACH_DAT" ? "*" : "(tự động: hôm nay)"}
                <div className="relative">
                  <CalendarDays
                    size={20}
                    className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-slate-500"
                  />
                  <input
                    type={type === "THUONG" ? "text" : "date"}
                    className={
                      input +
                      " !mt-2 min-w-0 max-w-full !pl-12" +
                      (type === "THUONG" ? " bg-slate-50" : "")
                    }
                    value={
                      type === "THUONG"
                        ? today.split("-").reverse().join("/")
                        : delivery
                    }
                    readOnly={type === "THUONG"}
                    required={type === "KHACH_DAT"}
                    onChange={(event) => setDelivery(event.target.value)}
                  />
                </div>

                {type === "KHACH_DAT" && (
                  <span className="mt-2 block text-[14px] font-semibold text-rose-700">
                    Khách đặt phải chọn ngày giao trước khi tạo đơn.
                  </span>
                )}
              </label>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-[56px_1fr]">
              <div className="hidden h-14 w-14 place-items-center rounded-2xl bg-blue-50 text-blue-600 lg:grid">
                <FileText size={28} strokeWidth={2.2} />
              </div>

              <fieldset>
                <legend className="mb-3 text-[18px] font-extrabold text-slate-900">
                  Loại đơn
                </legend>

                <div className="grid max-w-[680px] gap-3 sm:grid-cols-2">
                  {(["THUONG", "KHACH_DAT"] as const).map((kind) => {
                    const checked = type === kind;

                    return (
                      <label
                        key={kind}
                        className={
                          "flex min-h-[58px] cursor-pointer items-center gap-4 rounded-xl border px-5 py-3 text-[17px] font-bold transition " +
                          (checked
                            ? "border-blue-500 bg-blue-50 text-slate-950 shadow-[0_6px_16px_rgba(37,99,235,0.08)]"
                            : "border-slate-300 bg-white text-slate-800 hover:border-blue-300")
                        }
                      >
                        <input
                          type="radio"
                          className="h-6 w-6 shrink-0 accent-blue-600"
                          checked={checked}
                          onChange={() => {
                            setType(kind);
                            setWhCodes([]);
                            setDelivery("");
                            setError("");
                          }}
                        />

                        <FileText
                          size={23}
                          strokeWidth={2.1}
                          className={checked ? "text-blue-600" : "text-slate-500"}
                        />

                        {kind === "THUONG" ? "Thường" : "Khách đặt"}
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            </div>

            {type === "THUONG" && (
              <fieldset className="mt-7 rounded-[20px] border border-blue-100 bg-blue-50/55 p-4 sm:p-5">
                <legend className="px-1 text-[18px] font-extrabold text-slate-900">
                  Chọn kho (có thể tick nhiều)
                </legend>

                <div className="grid gap-4 lg:grid-cols-[56px_1fr_auto] lg:items-center">
                  <div className="hidden h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-600 lg:grid">
                    <WarehouseIcon size={28} strokeWidth={2.2} />
                  </div>

                  <div className="flex flex-wrap gap-3">
                    {warehouses.map((warehouse, index) => {
                      const picked = whCodes.includes(warehouse.code);

                      return (
                        <label
                          key={warehouse.id}
                          className={
                            "flex min-h-[60px] min-w-[250px] cursor-pointer items-center gap-4 rounded-xl border bg-white px-5 py-3 text-[17px] font-semibold text-slate-900 transition " +
                            (picked
                              ? "border-blue-400 shadow-[0_7px_18px_rgba(37,99,235,0.08)]"
                              : "border-slate-200 hover:border-blue-300")
                          }
                        >
                          <input
                            type="checkbox"
                            className="h-6 w-6 shrink-0 accent-blue-600"
                            checked={picked}
                            onChange={(event) =>
                              setWhCodes((old) =>
                                event.target.checked
                                  ? [...old, warehouse.code]
                                  : old.filter((code) => code !== warehouse.code),
                              )
                            }
                          />

                          <Home
                            size={27}
                            strokeWidth={2.3}
                            className={index % 2 === 0 ? "text-orange-500" : "text-emerald-600"}
                          />

                          <span>
                            {warehouse.name} ({warehouse.code})
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {!showNewWarehouse ? (
                    <button
                      type="button"
                      className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-100/80 px-5 py-3 text-[16px] font-extrabold text-blue-700 transition hover:bg-blue-200"
                      disabled={busy}
                      onClick={() => setShowNewWarehouse(true)}
                    >
                      <Plus size={21} strokeWidth={2.6} />
                      Thêm kho
                    </button>
                  ) : null}
                </div>

                {showNewWarehouse && (
                  <div className="mt-4 rounded-xl border border-blue-200 bg-white p-4">
                    <label className="block text-[16px] font-bold text-slate-800">
                      Tên kho mới (OWNER / ADMIN)
                      <input
                        autoFocus
                        className={input}
                        placeholder="Ví dụ: Kho Hóc Môn"
                        value={newWarehouseName}
                        onChange={(event) => setNewWarehouseName(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void addWarehouse();
                          }
                        }}
                      />
                    </label>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn primary"
                        disabled={warehouseBusy || busy || !newWarehouseName.trim()}
                        onClick={() => void addWarehouse()}
                      >
                        {warehouseBusy ? "Đang lưu kho..." : "Lưu kho"}
                      </button>

                      <button
                        type="button"
                        className="btn soft"
                        disabled={warehouseBusy}
                        onClick={() => {
                          setShowNewWarehouse(false);
                          setNewWarehouseName("");
                        }}
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                )}

                <p className="mt-4 flex items-start gap-2 rounded-xl bg-blue-50 px-4 py-3 text-[14px] font-medium leading-6 text-blue-800">
                  <Info size={19} className="mt-0.5 shrink-0" />
                  Mỗi kho được chọn sẽ tạo đơn soạn riêng. Kho mới được cấp mã tự động.
                </p>
              </fieldset>
            )}

            <section className="mt-7">
              <div className="grid gap-4 lg:grid-cols-[56px_1fr]">
                <div className="hidden h-14 w-14 place-items-center rounded-2xl bg-indigo-50 text-indigo-500 lg:grid">
                  <UserRound size={29} strokeWidth={2.2} />
                </div>

                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <label className="text-[18px] font-extrabold text-slate-900">
                      Khách hàng <span className="text-red-500">*</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => setAddCustomer((old) => !old)}
                      className="inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-blue-100 px-5 py-3 text-[16px] font-extrabold text-blue-700 transition hover:bg-blue-200"
                    >
                      <Plus size={20} strokeWidth={2.6} />
                      Thêm khách
                    </button>
                  </div>

                  <div className="relative">
                    <Search
                      size={22}
                      className="pointer-events-none absolute left-4 top-1/2 z-10 -translate-y-1/2 text-slate-500"
                    />
                    <input
                      className={input + " !mt-0 !pl-12"}
                      placeholder="Tìm theo tên hoặc số điện thoại"
                      value={customerSearch}
                      onChange={(event) => {
                        setCustomerSearch(event.target.value);
                        setCustomerId(0);
                      }}
                    />
                  </div>

                  {!customerId && customerSearch && (
                    <div className="max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                      {matches.map((customer) => (
                        <button
                          key={customer.id}
                          type="button"
                          onClick={() => {
                            setCustomerId(customer.id);
                            setCustomerSearch(customer.name);
                          }}
                          className="block w-full border-b border-slate-100 p-3.5 text-left text-[16px] font-medium hover:bg-blue-50"
                        >
                          {customer.name} {customer.phone && `· ${customer.phone}`}
                        </button>
                      ))}
                    </div>
                  )}

                  {customerId > 0 && (
                    <div className="text-[15px] font-bold text-green-700">
                      ✓ Đã chọn khách #{customerId}
                    </div>
                  )}

                  {addCustomer && (
                    <div className="grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                      {(
                        [
                          ["name", "Tên khách *"],
                          ["phone", "SĐT"],
                          ["address", "Địa chỉ"],
                          ["transport_station", "Chành xe"],
                          ["transport_phone", "SĐT chành xe"],
                        ] as const
                      ).map(([key, label]) => (
                        <label key={key} className="text-[15px] font-semibold text-slate-700">
                          {label}
                          <input
                            className={input}
                            value={newCustomer[key]}
                            onChange={(event) =>
                              setNewCustomer((old) => ({
                                ...old,
                                [key]: event.target.value,
                              }))
                            }
                          />
                        </label>
                      ))}

                      <button
                        type="button"
                        onClick={() => void createCustomer()}
                        className="rounded-xl bg-blue-700 p-3.5 text-[16px] font-bold text-white"
                      >
                        Lưu khách và chọn
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <label className="mt-6 flex min-h-[64px] cursor-pointer items-center gap-4 rounded-2xl border border-red-100 bg-red-50 px-5 py-4 text-[18px] font-extrabold text-red-700">
              <input
                type="checkbox"
                className="h-7 w-7 shrink-0 accent-red-600"
                checked={urgent}
                onChange={(event) => setUrgent(event.target.checked)}
              />
              <Flame size={24} className="text-orange-500" fill="currentColor" />
              Đơn GẤP
            </label>

            <section className="mt-6">
              <div className="grid gap-4 lg:grid-cols-[56px_1fr]">
                <div className="hidden h-14 w-14 place-items-center rounded-2xl bg-emerald-50 text-emerald-600 lg:grid">
                  <Paperclip size={29} strokeWidth={2.3} />
                </div>

                <div className="space-y-3">
                  <label className="block text-[18px] font-extrabold text-slate-900">
                    Ảnh đơn (có thể chọn nhiều ảnh, hoặc Ctrl + V vào vùng bên dưới)
                  </label>

                  <div className="rounded-xl border-2 border-dashed border-blue-300 bg-white p-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-blue-50 px-4 py-3 text-[16px] font-extrabold text-blue-700 transition hover:bg-blue-100">
                      <ImageIcon size={21} />
                      Chọn tệp
                      <input
                        className="hidden"
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        disabled={busy}
                        onChange={(event) => {
                          addImages(Array.from(event.currentTarget.files || []));
                          event.currentTarget.value = "";
                        }}
                      />
                    </label>

                    <span className="ml-4 text-[15px] font-medium text-slate-500">
                      {images.length
                        ? `Đã chọn ${images.length} ảnh`
                        : "Không có tệp nào được chọn"}
                    </span>
                  </div>

                  <div
                    tabIndex={0}
                    onPaste={(event) => {
                      const pasted = Array.from(event.clipboardData.files).filter((file) =>
                        file.type.startsWith("image/"),
                      );

                      if (pasted.length) {
                        event.preventDefault();
                        addImages(pasted);
                      }
                    }}
                    className="rounded-xl bg-blue-50 px-4 py-3 text-[14px] font-medium leading-6 text-blue-800 focus:outline-blue-500"
                  >
                    <div className="flex gap-2">
                      <Info size={19} className="mt-0.5 shrink-0" />
                      <div>
                        Bấm vào đây rồi nhấn Ctrl + V để dán ảnh. Đã chọn{" "}
                        <strong>{images.length} ảnh</strong>.
                        <span className="block">
                          Ảnh xem trước ở bên dưới; khi tạo đơn hệ thống lưu file ảnh gốc.
                        </span>
                      </div>
                    </div>
                  </div>

                  {images.length > 0 && (
                    <div
                      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
                      aria-label="Ảnh xem trước của đơn hàng"
                    >
                      {images.map((image, index) => (
                        <div
                          key={image.id}
                          className="relative overflow-hidden rounded-xl border border-slate-200 bg-white p-2 shadow-sm"
                        >
                          <button
                            type="button"
                            className="block w-full"
                            onClick={() => setZoomId(image.id)}
                            title="Bấm để xem ảnh lớn"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={image.previewUrl}
                              alt={`Ảnh đơn xem trước ${index + 1}: ${image.file.name}`}
                              className="h-36 w-full rounded-lg bg-slate-100 object-contain"
                            />
                          </button>

                          <div
                            className="mt-2 break-all text-xs text-slate-600"
                            title={image.file.name}
                          >
                            {image.file.name}
                          </div>

                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => removeImage(image.id)}
                            className="mt-2 w-full rounded-lg border border-red-200 bg-red-50 px-2 py-2 text-sm font-semibold text-red-700 disabled:opacity-50"
                            aria-label={`Xóa ảnh ${image.file.name}`}
                          >
                            ✕ Xóa ảnh này
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>

            <div className="mt-6 grid gap-4 lg:grid-cols-[56px_1fr]">
              <div className="hidden h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-500 lg:grid">
                <StickyNote size={28} strokeWidth={2.2} />
              </div>

              <label className="block text-[18px] font-extrabold text-slate-900">
                Ghi chú tạo đơn
                <div className="relative">
                  <Pencil
                    size={21}
                    className="pointer-events-none absolute left-4 top-6 z-10 text-slate-500"
                  />
                  <textarea
                    className={input + " !pl-12"}
                    rows={3}
                    placeholder="Nhập ghi chú (nếu có)..."
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                  />
                </div>
              </label>
            </div>

            {error && (
              <p
                role="alert"
                className="mt-5 rounded-xl border border-red-100 bg-red-50 p-4 text-[15px] font-bold leading-6 text-red-800"
              >
                {error}
              </p>
            )}

            <button
              disabled={
                busy ||
                !customerId ||
                (type === "THUONG" && !whCodes.length) ||
                (type === "KHACH_DAT" && !delivery) ||
                Boolean(success)
              }
              className="mt-6 inline-flex w-full items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-blue-700 via-blue-600 to-blue-400 px-5 py-4 text-[20px] font-black tracking-[0.01em] text-white shadow-[0_12px_26px_rgba(37,99,235,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus size={25} strokeWidth={2.7} />
              {busy ? "Đang tạo đơn và lưu ảnh..." : "TẠO ĐƠN HÀNG"}
            </button>
          </div>
        </div>
      </form>

      {zoomImage && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Xem ảnh đơn hàng"
          onClick={() => setZoomId(null)}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/90 p-4"
        >
          <button
            type="button"
            onClick={() => setZoomId(null)}
            className="absolute right-4 top-4 rounded-xl bg-white px-4 py-2 font-bold text-slate-900"
          >
            ✕ Đóng ảnh
          </button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomImage.previewUrl}
            alt={zoomImage.file.name}
            onClick={(event) => event.stopPropagation()}
            className="max-h-[88vh] max-w-full rounded-lg object-contain"
          />
        </div>
      )}
    </>
  );
}
