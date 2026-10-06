"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  ArrowLeft,
  CalendarDays,
  Camera,
  CirclePlay,
  ClipboardList,
  Flame,
  Home,
  Image as ImageIcon,
  Images,
  Info,
  ListChecks,
  MessageSquareText,
  Plus,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";

type Unit = {
  id: number;
  group_id: number;
  warehouse_id: number | null;
  order_code: string;
  status: string;
  started_by_name: string | null;
  packing_note: string | null;
};

type Group = {
  id: number;
  customer_name: string;
  delivery_date: string | null;
  is_urgent: boolean;
  creator_note: string | null;
};

type Warehouse = {
  id: number;
  name: string;
  code: string;
};

type StoredImage = {
  id: number;
  storage_path: string;
  url: string;
};

type PackingLine = {
  key: string;
  variant_id: number | null;
  product_name: string;
  color: string;
  size: string;
  quantity: string;
  unit_price: string;
};

type SearchResult = {
  variant_id: number;
  internal_code: string;
  sales_code: string;
  product_name: string;
  color: string;
  size: string;
  brand: string | null;
  image_path: string | null;
  warehouse_id: number;
  warehouse_name: string;
  qty_on_hand: number;
};

const blankLine = (): PackingLine => ({
  key: crypto.randomUUID(),
  variant_id: null,
  product_name: "",
  color: "",
  size: "",
  quantity: "1",
  unit_price: "0",
});

function formatDate(value: string | null) {
  if (!value) return "Chưa chọn";
  const raw = value.slice(0, 10).split("-");
  if (raw.length !== 3) return value;
  return `${raw[2]}/${raw[1]}/${raw[0]}`;
}

function statusLabel(value: string) {
  if (value === "MOI") return "MỚI";
  if (value === "DANG_SOAN") return "ĐANG SOẠN";
  if (value === "NO_DON") return "NỢ ĐƠN";
  if (value === "DA_SOAN") return "ĐÃ SOẠN";
  return value;
}

function money(value: number) {
  return new Intl.NumberFormat("vi-VN").format(
    Number.isFinite(value) ? value : 0,
  );
}

function warehousePalette(warehouse: Warehouse | null) {
  const key = `${warehouse?.name || ""} ${warehouse?.code || ""}`.toLowerCase();

  if (
    key.includes("cá koi") ||
    key.includes("ca koi") ||
    warehouse?.code === "CK"
  ) {
    return {
      accent: "#6d28d9",
      accentDark: "#5017ad",
      soft: "#f1e7ff",
      panel: "#f7f1ff",
      border: "#ddc7ff",
    };
  }

  if (
    key.includes("tân xuân") ||
    key.includes("tan xuan") ||
    warehouse?.code === "TX"
  ) {
    return {
      accent: "#07965f",
      accentDark: "#057345",
      soft: "#e7f8ef",
      panel: "#f0fbf5",
      border: "#bcebd3",
    };
  }

  return {
    accent: "#1769f6",
    accentDark: "#0e4eb7",
    soft: "#e9f2ff",
    panel: "#f3f8ff",
    border: "#cfe0fa",
  };
}

export default function OrderPack({ unitId }: { unitId: number }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [unit, setUnit] = useState<Unit | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [role, setRole] = useState("");
  const [images, setImages] = useState<StoredImage[]>([]);
  const [zoomUrl, setZoomUrl] = useState("");
  const [selectedCount, setSelectedCount] = useState(0);

  const [lines, setLines] = useState<PackingLine[]>([]);
  const [packingNote, setPackingNote] = useState("");
  const [searchResults, setSearchResults] = useState<
    Record<string, SearchResult[]>
  >({});
  const [searchBusyKey, setSearchBusyKey] = useState("");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  const manager = role === "OWNER" || role === "ADMIN";
  const palette = warehousePalette(warehouse);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      setError("Bạn chưa đăng nhập.");
      setLoading(false);
      return;
    }

    const [{ data: profile }, { data: unitData, error: unitError }] =
      await Promise.all([
        sb.from("az_profiles").select("role").eq("id", user.id).single(),
        sb
          .from("order_units")
          .select(
            "id,group_id,warehouse_id,order_code,status,started_by_name,packing_note",
          )
          .eq("id", unitId)
          .single(),
      ]);

    if (unitError || !unitData) {
      setError(unitError?.message || "Không tìm thấy đơn.");
      setLoading(false);
      return;
    }

    const nextUnit = unitData as Unit;
    setRole(profile?.role || "");
    setUnit(nextUnit);
    setPackingNote(nextUnit.packing_note || "");

    const groupPromise = sb
      .from("order_groups")
      .select("id,customer_name,delivery_date,is_urgent,creator_note")
      .eq("id", nextUnit.group_id)
      .single();

    const warehousePromise = nextUnit.warehouse_id
      ? sb
          .from("az_warehouses")
          .select("id,name,code")
          .eq("id", nextUnit.warehouse_id)
          .single()
      : Promise.resolve({ data: null, error: null });

    const itemsPromise = sb
      .from("order_items")
      .select(
        "id,variant_id,product_name,color,size,quantity,unit_price,line_no",
      )
      .eq("unit_id", nextUnit.id)
      .order("line_no");

    const imagePromise = sb
      .from("order_images")
      .select("id,storage_path")
      .eq("group_id", nextUnit.group_id)
      .order("id");

    const [
      { data: groupData, error: groupError },
      { data: warehouseData, error: warehouseError },
      { data: itemData, error: itemError },
      { data: imageData, error: imageError },
    ] = await Promise.all([
      groupPromise,
      warehousePromise,
      itemsPromise,
      imagePromise,
    ]);

    if (groupError || warehouseError || itemError || imageError) {
      setError(
        groupError?.message ||
          warehouseError?.message ||
          itemError?.message ||
          imageError?.message ||
          "Không tải được chi tiết đơn.",
      );
      setLoading(false);
      return;
    }

    setGroup(groupData as Group);
    setWarehouse((warehouseData as Warehouse | null) || null);

    const nextLines = (itemData || []).map((item) => ({
      key: crypto.randomUUID(),
      variant_id: item.variant_id == null ? null : Number(item.variant_id),
      product_name: item.product_name || "",
      color: item.color || "",
      size: item.size || "",
      quantity: String(item.quantity ?? 1),
      unit_price: String(item.unit_price ?? 0),
    }));

    setLines(nextLines.length ? nextLines : [blankLine()]);

    const signedImages = await Promise.all(
      (imageData || []).map(async (image) => {
        const { data } = await sb.storage
          .from("az-order-images")
          .createSignedUrl(image.storage_path, 3600);

        return {
          id: Number(image.id),
          storage_path: image.storage_path,
          url: data?.signedUrl || "",
        };
      }),
    );

    setImages(signedImages.filter((image) => image.url));
    setLoading(false);
  }, [sb, unitId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!zoomUrl) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setZoomUrl("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [zoomUrl]);

  async function startPacking() {
    if (!unit || busy) return;

    setBusy(true);
    setError("");
    setOk("");

    const { error: startError } = await sb.rpc("az_start_packing", {
      p_unit_id: unit.id,
    });

    if (startError) {
      setError(startError.message);
      setBusy(false);
      return;
    }

    await load();
    setOk("Đã bắt đầu soạn đơn.");
    setBusy(false);
  }

  async function uploadExtraImages(files: File[]) {
    if (!group || !manager || uploadBusy || !files.length) return;

    const accepted = files.filter(
      (file) =>
        ["image/jpeg", "image/png", "image/webp"].includes(file.type) &&
        file.size <= 8 * 1024 * 1024,
    );

    if (!accepted.length) {
      setError("Ảnh phải là JPG, PNG hoặc WEBP và tối đa 8 MB/ảnh.");
      return;
    }

    setSelectedCount(accepted.length);
    setUploadBusy(true);
    setError("");
    setOk("");

    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      setError("Phiên đăng nhập đã hết.");
      setUploadBusy(false);
      return;
    }

    const problems: string[] = [];

    for (const file of accepted) {
      const extension =
        file.type === "image/png"
          ? "png"
          : file.type === "image/webp"
            ? "webp"
            : "jpg";

      const path = `${user.id}/${group.id}/${crypto.randomUUID()}.${extension}`;

      const { error: uploadError } = await sb.storage
        .from("az-order-images")
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
        });

      if (uploadError) {
        problems.push(`${file.name}: ${uploadError.message}`);
        continue;
      }

      const { error: attachError } = await sb.rpc("az_attach_order_image", {
        p_group_id: group.id,
        p_path: path,
      });

      if (attachError) {
        problems.push(`${file.name}: ${attachError.message}`);
      }
    }

    setUploadBusy(false);
    setSelectedCount(0);

    if (problems.length) {
      setError(problems.join(" | "));
    } else {
      setOk("Đã bổ sung ảnh đơn.");
    }

    await load();
  }

  async function searchProduct(lineKey: string, query: string) {
    if (!unit || query.trim().length < 2) {
      setSearchResults((old) => ({ ...old, [lineKey]: [] }));
      return;
    }

    setSearchBusyKey(lineKey);

    const { data, error: searchError } = await sb.rpc(
      "az_quick_product_search",
      {
        p_q: query.trim(),
        p_warehouse_id: unit.warehouse_id,
      },
    );

    if (searchError) {
      setError(searchError.message);
    } else {
      setSearchResults((old) => ({
        ...old,
        [lineKey]: (data || []) as SearchResult[],
      }));
    }

    setSearchBusyKey("");
  }

  function updateLine(
    key: string,
    patch: Partial<PackingLine>,
    clearVariant = false,
  ) {
    setLines((old) =>
      old.map((line) =>
        line.key === key
          ? {
              ...line,
              ...patch,
              variant_id: clearVariant ? null : line.variant_id,
            }
          : line,
      ),
    );
  }

  function chooseProduct(lineKey: string, product: SearchResult) {
    setLines((old) =>
      old.map((line) =>
        line.key === lineKey
          ? {
              ...line,
              variant_id: product.variant_id,
              product_name: product.product_name,
              color: product.color || "",
              size: product.size || "",
            }
          : line,
      ),
    );

    setSearchResults((old) => ({ ...old, [lineKey]: [] }));
  }

  async function savePacking(finish: boolean) {
    if (!unit || busy) return;

    const payload = lines
      .map((line) => ({
        variant_id: line.variant_id,
        product_name: line.product_name.trim(),
        color: line.color.trim(),
        size: line.size.trim(),
        quantity: line.quantity.trim(),
        unit_price: line.unit_price.trim(),
      }))
      .filter((line) => line.product_name);

    if (finish && !payload.length) {
      setError("Phải có ít nhất một sản phẩm để xác nhận soạn xong.");
      return;
    }

    for (let index = 0; index < payload.length; index += 1) {
      const line = payload[index];

      if (!/^[0-9]{1,9}$/.test(line.quantity) || Number(line.quantity) <= 0) {
        setError(`Số lượng dòng ${index + 1} không hợp lệ.`);
        return;
      }

      if (!/^[0-9]{1,12}(\.[0-9]{1,2})?$/.test(line.unit_price)) {
        setError(`Giá dòng ${index + 1} không hợp lệ.`);
        return;
      }
    }

    setBusy(true);
    setError("");
    setOk("");

    const { error: saveError } = await sb.rpc("az_save_packing", {
      p_unit_id: unit.id,
      p_lines: payload,
      p_note: packingNote || null,
      p_finish: finish,
    });

    if (saveError) {
      setError(saveError.message);
      setBusy(false);
      return;
    }

    if (finish) {
      router.replace("/azalas/orders");
      router.refresh();
      return;
    }

    setOk("Đã lưu nháp.");
    await load();
    setBusy(false);
  }

  const total = lines.reduce((sum, line) => {
    const qty = Number(line.quantity || 0);
    const price = Number(line.unit_price || 0);
    return sum + (Number.isFinite(qty * price) ? qty * price : 0);
  }, 0);

  if (loading) {
    return (
      <div className="mx-auto max-w-[1580px] rounded-2xl border bg-white p-7 text-[16px] font-semibold text-slate-500">
        Đang tải chi tiết đơn...
      </div>
    );
  }

  if (!unit || !group) {
    return (
      <div className="mx-auto max-w-[1580px]">
        <Link
          href="/azalas/orders"
          className="inline-flex items-center gap-2 text-[16px] font-extrabold text-blue-700"
        >
          <ArrowLeft size={19} />
          Quay lại Chi tiết đơn
        </Link>

        <p className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-5 font-bold text-red-800">
          {error || "Không tìm thấy đơn."}
        </p>
      </div>
    );
  }

  const previewMode = unit.status === "MOI" || unit.status === "NO_DON";
  const packingMode = unit.status === "DANG_SOAN";

  return (
    <div className="mx-auto w-full max-w-[1580px] pb-10">
      <Link
        href="/azalas/orders"
        className="inline-flex items-center gap-2 text-[16px] font-extrabold text-blue-700 transition hover:text-blue-800"
      >
        <ArrowLeft size={19} strokeWidth={2.5} />
        Quay lại Chi tiết đơn
      </Link>

      <section className="mt-5 overflow-hidden rounded-[26px] border border-slate-200 bg-white p-5 shadow-[0_14px_38px_rgba(22,58,110,0.07)] sm:p-6">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-start">
          <div className="flex min-w-0 items-start gap-5">
            <div
              className="grid h-[84px] w-[84px] shrink-0 place-items-center rounded-2xl"
              style={{ background: palette.soft, color: palette.accent }}
            >
              <ClipboardList size={46} strokeWidth={2.15} />
            </div>

            <div className="min-w-0">
              <h1 className="break-all text-[33px] font-black leading-tight tracking-[-0.8px] text-[#10264c] sm:text-[42px]">
                {unit.order_code}
              </h1>

              {group.is_urgent && (
                <span className="mt-3 inline-flex items-center gap-2 rounded-2xl bg-red-50 px-5 py-2.5 text-[17px] font-black text-red-600">
                  <Flame
                    size={19}
                    className="text-orange-500"
                    fill="currentColor"
                  />
                  GẤP
                </span>
              )}
            </div>
          </div>

          <div
            className="flex min-w-[300px] items-center gap-4 rounded-2xl px-5 py-4"
            style={{ background: palette.panel, color: palette.accentDark }}
          >
            <span
              className="grid h-14 w-14 shrink-0 place-items-center rounded-xl"
              style={{ background: palette.soft, color: palette.accent }}
            >
              <Home size={31} strokeWidth={2.4} />
            </span>

            <div>
              <div className="text-[20px] font-black">
                Kho:{" "}
                {warehouse
                  ? `${warehouse.name} (${warehouse.code})`
                  : "Khách đặt"}
              </div>
              <div className="mt-1 text-[14px] font-medium text-slate-500">
                {warehouse
                  ? `Đơn thuộc kho ${warehouse.name}`
                  : "Đơn khách đặt chưa gắn kho"}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-7 grid overflow-hidden rounded-2xl bg-[#f6f9fe] lg:grid-cols-4">
          <div className="flex items-center gap-4 border-b border-slate-200 p-5 lg:border-b-0 lg:border-r">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600">
              <UserRound size={30} strokeWidth={2.3} />
            </span>
            <div>
              <p className="text-[15px] font-medium text-slate-600">
                Khách hàng
              </p>
              <strong className="mt-1 block text-[21px] font-black text-[#10264c]">
                {group.customer_name}
              </strong>
            </div>
          </div>

          <div className="flex items-center gap-4 border-b border-slate-200 p-5 lg:border-b-0 lg:border-r">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
              <ListChecks size={30} strokeWidth={2.3} />
            </span>
            <div>
              <p className="text-[15px] font-medium text-slate-600">
                Trạng thái
              </p>
              <span className="mt-1 inline-flex rounded-xl bg-blue-100 px-4 py-2 text-[17px] font-black text-blue-700">
                {statusLabel(unit.status)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 border-b border-slate-200 p-5 lg:border-b-0 lg:border-r">
            <span
              className="grid h-14 w-14 shrink-0 place-items-center rounded-xl"
              style={{ background: palette.soft, color: palette.accent }}
            >
              <CalendarDays size={30} strokeWidth={2.3} />
            </span>
            <div>
              <p className="text-[15px] font-medium text-slate-600">Ngày giao</p>
              <strong className="mt-1 block text-[21px] font-black text-[#10264c]">
                {formatDate(group.delivery_date)}
              </strong>
            </div>
          </div>

          <div className="flex items-center gap-4 p-5">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-500">
              <UserRound size={30} strokeWidth={2.3} />
            </span>
            <div>
              <p className="text-[15px] font-medium text-slate-600">
                Người soạn
              </p>
              <strong className="mt-1 block text-[21px] font-black text-[#10264c]">
                {unit.started_by_name || "—"}
              </strong>
            </div>
          </div>
        </div>

        <div className="mt-5 flex gap-4 rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-500">
            <MessageSquareText size={30} strokeWidth={2.2} />
          </span>
          <div>
            <p className="text-[16px] font-black text-[#10264c]">
              Ghi chú tạo đơn
            </p>
            <p className="mt-1 whitespace-pre-wrap text-[16px] font-medium text-slate-700">
              {group.creator_note || "—"}
            </p>
          </div>
        </div>

        <div className="mt-5 rounded-2xl bg-[#f6f9fe] p-4">
          <div className="mb-4 flex items-center gap-3">
            <span
              className="grid h-11 w-11 place-items-center rounded-xl"
              style={{ background: palette.soft, color: palette.accent }}
            >
              <Images size={25} strokeWidth={2.3} />
            </span>
            <h2 className="text-[21px] font-black text-[#10264c]">
              Ảnh tạo đơn (nhấn ảnh để xem lớn)
            </h2>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 360px",
              gap: 14,
              alignItems: "stretch",
            }}
            className="order-pack-image-layout"
          >
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 12,
                minHeight: 190,
                alignItems: "stretch",
              }}
              className="rounded-2xl bg-white p-3"
            >
              {images.map((image) => (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => setZoomUrl(image.url)}
                  style={{
                    width: 190,
                    height: 170,
                    flex: "0 0 190px",
                    overflow: "hidden",
                  }}
                  className="rounded-2xl border border-slate-200 bg-slate-50 p-2 transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={image.url}
                    alt="Ảnh tạo đơn"
                    style={{
                      width: "100%",
                      height: "100%",
                      maxWidth: "190px",
                      maxHeight: "170px",
                      objectFit: "contain",
                      display: "block",
                    }}
                    className="rounded-xl"
                  />
                </button>
              ))}

              {!images.length && (
                <div
                  style={{
                    minWidth: 240,
                    minHeight: 170,
                    flex: "1 1 240px",
                  }}
                  className="grid place-items-center rounded-2xl border border-dashed border-slate-300 text-[15px] font-semibold text-slate-400"
                >
                  Chưa có ảnh tạo đơn
                </div>
              )}

              {manager && (
                <button
                  type="button"
                  disabled={uploadBusy}
                  onClick={() => fileRef.current?.click()}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={(event) => {
                    event.preventDefault();
                    void uploadExtraImages(Array.from(event.dataTransfer.files));
                  }}
                  style={{
                    minWidth: 290,
                    minHeight: 170,
                    flex: "1 1 290px",
                  }}
                  className="grid place-items-center rounded-2xl border-2 border-dashed border-blue-300 bg-white px-5 text-center transition hover:bg-blue-50 disabled:opacity-50"
                >
                  <span>
                    <Camera
                      size={39}
                      className="mx-auto text-[#41658f]"
                      strokeWidth={2.1}
                    />
                    <strong className="mt-3 block text-[17px] font-black text-[#10264c]">
                      {uploadBusy
                        ? "Đang tải ảnh..."
                        : "Bổ sung ảnh đơn đã tạo"}
                    </strong>
                    <span className="mt-1 block text-[15px] font-medium text-slate-500">
                      Nhấn để chọn ảnh hoặc kéo thả
                    </span>
                  </span>
                </button>
              )}

              <input
                ref={fileRef}
                type="file"
                className="hidden"
                multiple
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  void uploadExtraImages(
                    Array.from(event.currentTarget.files || []),
                  );
                  event.currentTarget.value = "";
                }}
              />
            </div>

            <div className="flex items-start gap-3 rounded-2xl bg-blue-50/80 p-5 text-[#46658c]">
              <Info size={27} className="mt-0.5 shrink-0 text-blue-500" />
              <ul className="space-y-3 text-[15px] font-medium leading-6">
                <li>• Nhấn vào ảnh để xem kích thước lớn.</li>
                <li>• Có thể chọn nhiều ảnh cùng lúc.</li>
                <li>
                  • Đã chọn {selectedCount} ảnh. Mỗi ảnh tối đa 8 MB.
                </li>
              </ul>
            </div>
          </div>

          <style>{`
            @media (max-width: 980px) {
              .order-pack-image-layout {
                grid-template-columns: 1fr !important;
              }
            }

            @media (max-width: 560px) {
              .order-pack-image-layout button[style*="width: 190px"] {
                width: 145px !important;
                height: 135px !important;
                flex-basis: 145px !important;
              }

              .order-pack-image-layout img {
                max-width: 145px !important;
                max-height: 135px !important;
              }
            }
          `}</style>
        </div>

        {error && (
          <p className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-[15px] font-bold text-red-800">
            {error}
          </p>
        )}

        {ok && (
          <p className="mt-5 rounded-2xl border border-green-100 bg-green-50 p-4 text-[15px] font-bold text-green-800">
            {ok}
          </p>
        )}

        {previewMode && (
          <div
            className="order-pack-actions mt-6"
            style={{
              display: "grid",
              gridTemplateColumns: "220px minmax(0, 1fr)",
              gap: 16,
              width: "100%",
            }}
          >
            <Link
              href="/azalas/orders"
              style={{ minHeight: 58 }}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border-2 border-blue-400 bg-white px-5 text-[17px] font-black text-blue-700 transition hover:bg-blue-50"
            >
              <ArrowLeft size={21} strokeWidth={2.5} />
              Quay lại
            </Link>

            <button
              type="button"
              disabled={busy}
              onClick={() => void startPacking()}
              style={{
                minHeight: 58,
                width: "100%",
                display: "inline-flex",
                visibility: "visible",
                opacity: busy ? 0.5 : 1,
              }}
              className="items-center justify-center gap-3 rounded-2xl bg-gradient-to-r from-emerald-600 to-green-500 px-5 text-[20px] font-black text-white shadow-[0_12px_24px_rgba(5,150,95,0.18)] transition hover:brightness-105"
            >
              <CirclePlay size={26} fill="currentColor" />
              {busy
                ? "ĐANG BẮT ĐẦU..."
                : unit.status === "NO_DON"
                  ? "BẮT ĐẦU SOẠN LẠI"
                  : "BẮT ĐẦU SOẠN ĐƠN"}
            </button>

            <style>{`
              @media (max-width: 720px) {
                .order-pack-actions {
                  grid-template-columns: 1fr !important;
                }
              }
            `}</style>
          </div>
        )}

        {packingMode && (
          <div className="mt-7 border-t border-slate-200 pt-6">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-[24px] font-black text-[#10264c]">
                  Soạn hàng
                </h2>
                <p className="mt-1 text-[15px] font-medium text-slate-500">
                  Nhập sản phẩm, số lượng và giá thực tế.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setLines((old) => [...old, blankLine()])}
                className="inline-flex items-center gap-2 rounded-xl bg-blue-50 px-4 py-3 text-[15px] font-black text-blue-700"
              >
                <Plus size={19} />
                Thêm dòng sản phẩm
              </button>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200">
              <table className="min-w-[980px] w-full border-collapse bg-white">
                <thead className="bg-slate-50 text-left text-[14px] font-black text-[#29456b]">
                  <tr>
                    <th className="w-[70px] px-4 py-4 text-center">STT</th>
                    <th className="px-4 py-4">Tên SP</th>
                    <th className="w-[130px] px-4 py-4">SL</th>
                    <th className="w-[170px] px-4 py-4">Giá</th>
                    <th className="w-[180px] px-4 py-4 text-right">
                      Thành tiền
                    </th>
                    <th className="w-[80px] px-4 py-4 text-center">Xóa</th>
                  </tr>
                </thead>

                <tbody>
                  {lines.map((line, index) => {
                    const amount =
                      Number(line.quantity || 0) *
                      Number(line.unit_price || 0);

                    return (
                      <tr
                        key={line.key}
                        className="border-t border-slate-200 align-top"
                      >
                        <td className="px-4 py-4 text-center text-[15px] font-black text-slate-600">
                          {index + 1}
                        </td>

                        <td className="relative px-4 py-3">
                          <div className="relative">
                            <Search
                              size={18}
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                            />
                            <input
                              value={line.product_name}
                              onChange={(event) => {
                                const value = event.target.value;
                                updateLine(
                                  line.key,
                                  { product_name: value },
                                  true,
                                );
                                void searchProduct(line.key, value);
                              }}
                              className="w-full rounded-xl border border-slate-300 bg-white py-3 pl-10 pr-3 text-[16px] font-semibold outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                              placeholder="Tên hoặc mã sản phẩm"
                            />
                          </div>

                          {(line.color || line.size) && (
                            <div className="mt-1 text-[13px] font-medium text-slate-500">
                              {[line.color, line.size]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          )}

                          {searchBusyKey === line.key && (
                            <div className="mt-1 text-[13px] text-slate-400">
                              Đang tìm...
                            </div>
                          )}

                          {(searchResults[line.key] || []).length > 0 && (
                            <div className="absolute left-4 right-4 top-[62px] z-30 max-h-[260px] overflow-auto rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                              {(searchResults[line.key] || []).map(
                                (product) => (
                                  <button
                                    key={`${product.variant_id}-${product.warehouse_id}`}
                                    type="button"
                                    onClick={() =>
                                      chooseProduct(line.key, product)
                                    }
                                    className="block w-full rounded-lg px-3 py-3 text-left hover:bg-blue-50"
                                  >
                                    <strong className="text-[14px] text-[#10264c]">
                                      {product.product_name}
                                    </strong>
                                    <div className="mt-1 text-[12px] text-slate-500">
                                      {[
                                        product.sales_code,
                                        product.color,
                                        product.size,
                                        `Tồn ${product.qty_on_hand}`,
                                      ]
                                        .filter(Boolean)
                                        .join(" · ")}
                                    </div>
                                  </button>
                                ),
                              )}
                            </div>
                          )}
                        </td>

                        <td className="px-4 py-3">
                          <input
                            inputMode="numeric"
                            value={line.quantity}
                            onChange={(event) =>
                              updateLine(line.key, {
                                quantity: event.target.value.replace(/\D/g, ""),
                              })
                            }
                            className="w-full rounded-xl border border-slate-300 px-3 py-3 text-[16px] font-bold outline-none focus:border-blue-500"
                          />
                        </td>

                        <td className="px-4 py-3">
                          <input
                            inputMode="decimal"
                            value={line.unit_price}
                            onChange={(event) =>
                              updateLine(line.key, {
                                unit_price: event.target.value.replace(
                                  /[^0-9.]/g,
                                  "",
                                ),
                              })
                            }
                            className="w-full rounded-xl border border-slate-300 px-3 py-3 text-[16px] font-bold outline-none focus:border-blue-500"
                          />
                        </td>

                        <td className="px-4 py-4 text-right text-[16px] font-black text-[#10264c]">
                          {money(amount)} đ
                        </td>

                        <td className="px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() =>
                              setLines((old) => {
                                const next = old.filter(
                                  (item) => item.key !== line.key,
                                );
                                return next.length ? next : [blankLine()];
                              })
                            }
                            className="grid h-11 w-11 place-items-center rounded-xl bg-red-50 text-red-500 hover:bg-red-100"
                            aria-label={`Xóa dòng ${index + 1}`}
                          >
                            <Trash2 size={19} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>

                <tfoot className="border-t-2 border-slate-200 bg-slate-50">
                  <tr>
                    <td
                      colSpan={4}
                      className="px-4 py-4 text-right text-[16px] font-black text-[#10264c]"
                    >
                      TỔNG CỘNG
                    </td>
                    <td className="px-4 py-4 text-right text-[18px] font-black text-red-600">
                      {money(total)} đ
                    </td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            </div>

            <label className="mt-5 block text-[17px] font-black text-[#10264c]">
              Ghi chú soạn hàng
              <textarea
                rows={3}
                value={packingNote}
                onChange={(event) => setPackingNote(event.target.value)}
                className="mt-2 w-full rounded-2xl border border-slate-300 p-4 text-[16px] font-medium outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </label>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void savePacking(false)}
                className="min-h-[54px] rounded-2xl border-2 border-blue-300 bg-white px-5 text-[17px] font-black text-blue-700 hover:bg-blue-50 disabled:opacity-50"
              >
                {busy ? "Đang lưu..." : "LƯU NHÁP"}
              </button>

              <button
                type="button"
                disabled={busy}
                onClick={() => void savePacking(true)}
                className="min-h-[54px] rounded-2xl bg-gradient-to-r from-blue-700 to-blue-500 px-5 text-[17px] font-black text-white shadow-[0_10px_22px_rgba(37,99,235,0.18)] hover:brightness-105 disabled:opacity-50"
              >
                {busy ? "Đang xử lý..." : "XÁC NHẬN & SOẠN XONG"}
              </button>
            </div>
          </div>
        )}

        {unit.status === "DA_SOAN" && (
          <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-[16px] font-bold text-emerald-800">
            Đơn này đã soạn xong.
          </div>
        )}
      </section>

      {zoomUrl && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setZoomUrl("")}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/90 p-4"
        >
          <button
            type="button"
            onClick={() => setZoomUrl("")}
            className="absolute right-4 top-4 rounded-xl bg-white px-4 py-2 font-black text-slate-900"
          >
            ✕ Đóng ảnh
          </button>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomUrl}
            alt="Ảnh tạo đơn phóng lớn"
            onClick={(event) => event.stopPropagation()}
            className="max-h-[90vh] max-w-[94vw] rounded-xl object-contain"
          />
        </div>
      )}
    </div>
  );
}
