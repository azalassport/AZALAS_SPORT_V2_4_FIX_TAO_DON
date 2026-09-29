/** Logic thuần cho phiếu PNR Hàng nhà. KHÔNG đụng tồn kho hoặc công nợ. */
export const RAP_SIZES = ["S", "M", "L", "XL", "2X", "3X", "4X", "5X", "6X", "7X", "8X"] as const;
export type RapSize = (typeof RAP_SIZES)[number];
export type ColorInput = { id: string; color: string; layers: string };
export type ModelInput = {
  id: string; patternId: string; brand: string;
  sizeFrom: string; sizeTo: string; ratio: string;
  sewingPrice: string; internalCode: string; salesCode: string;
  colors: ColorInput[];
};
/** Giá may bắt buộc nhập rõ ràng, không âm thầm dùng 0 hoặc giá mặc định của RPC. */
export function rapSewingPriceError(value: string): string {
  const price = value.trim();
  if (!price) return "Bắt buộc nhập đơn giá nhà may (đ/chiếc).";
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(price) ||
    !Number.isFinite(Number(price)) || Number(price) <= 0 || Number(price) > 1_000_000_000) {
    return "Đơn giá nhà may phải lớn hơn 0, không vượt 1.000.000.000 đ/chiếc (ví dụ 12000).";
  }
  return "";
}

export type HouseModelPayload = {
  pattern_id: number; brand: string; sizes: RapSize[]; ratios: number[];
  sewing_price: string; internal_code: string; sales_code: string;
  colors: { color: string; layers: number }[];
};

export function rapSizeRange(from: string, to: string): RapSize[] {
  const first = RAP_SIZES.indexOf(from as RapSize);
  const last = RAP_SIZES.indexOf(to as RapSize);
  if (first < 0 || last < first) throw new Error("Khoảng size không hợp lệ. Size đầu phải nhỏ hơn hoặc bằng size cuối.");
  return RAP_SIZES.slice(first, last + 1) as RapSize[];
}

export function rapRatios(text: string, sizes: readonly RapSize[]): number[] {
  const clean = text.trim();
  if (!/^[0-9]+$/.test(clean) || clean.length !== sizes.length) {
    throw new Error(`Tỉ lệ ${sizes[0]}–${sizes[sizes.length - 1]} phải có đúng ${sizes.length} chữ số (VD: 12221).`);
  }
  const ratios = clean.split("").map(Number);
  if (!ratios.some(n => n > 0)) throw new Error("Tỉ lệ size phải có ít nhất một size lớn hơn 0.");
  return ratios;
}

export function rapColors(colors: ColorInput[]): { color: string; layers: number }[] {
  if (colors.length < 1 || colors.length > 60) throw new Error("Mỗi mẫu cần 1–60 dòng màu.");
  const map = new Map<string, number>();
  for (const row of colors) {
    const color = row.color.trim().toLocaleUpperCase("vi-VN");
    if (!color || color.length > 80) throw new Error("Tên màu không được trống hoặc dài quá 80 ký tự.");
    if (!/^[1-9][0-9]{0,5}$/.test(row.layers.trim())) throw new Error(`Số lớp màu ${color} phải là số nguyên dương.`);
    map.set(color, (map.get(color) || 0) + Number(row.layers));
  }
  return [...map].map(([color, layers]) => ({ color, layers }));
}

export function buildHousePlan(
  colorMode: "common" | "perModel",
  models: ModelInput[],
  commonColors: ColorInput[],
  commonSizeFrom: string,
  commonSizeTo: string,
  commonRatio: string,
): { models: HouseModelPayload[]; total: number; common_colors?: { color: string; layers: number }[];
  common_sizes?: RapSize[]; common_ratios?: number[] } {
  if (!models.length || models.length > 30) throw new Error("Phiếu phải có từ 1 đến 30 mẫu/hiệu.");
  const sharedColors = colorMode === "common" ? rapColors(commonColors) : undefined;
  const sharedSizes = colorMode === "perModel" ? rapSizeRange(commonSizeFrom, commonSizeTo) : undefined;
  const sharedRatios = sharedSizes ? rapRatios(commonRatio, sharedSizes) : undefined;
  const seen = new Set<string>();
  let total = 0;
  const result = models.map((model, index) => {
    if (!/^[1-9][0-9]*$/.test(model.patternId)) throw new Error(`Mẫu ${index + 1} chưa chọn mã rập.`);
    const brand = model.brand.trim();
    if (!brand || brand.length > 120) throw new Error(`Mẫu ${index + 1}: chọn hiệu (ví dụ NAI, DAS).`);
    const key = `${model.patternId}/${brand.toLocaleUpperCase("vi-VN")}`;
    if (seen.has(key)) throw new Error("Cùng mã rập và hiệu đã được chọn hai lần. Hãy nhập màu chung trong một mẫu.");
    seen.add(key);
    const sizes = sharedSizes || rapSizeRange(model.sizeFrom, model.sizeTo);
    const ratios = sharedRatios || rapRatios(model.ratio, sizes);
    const colors = sharedColors || rapColors(model.colors);
    const price = model.sewingPrice.trim();
    const priceError = rapSewingPriceError(price);
    if (priceError) throw new Error(priceError);
    const qty = colors.reduce((s, c) => s + c.layers * ratios.reduce((r, n) => r + n, 0), 0);
    if (!Number.isSafeInteger(qty) || qty < 1 || qty > 100_000_000) throw new Error("Số lượng kế hoạch vượt giới hạn.");
    total += qty;
    return {
      pattern_id: Number(model.patternId), brand, sizes, ratios,
      sewing_price: price, internal_code: model.internalCode.trim(), sales_code: model.salesCode.trim(), colors,
    };
  });
  if (!Number.isSafeInteger(total) || total > 100_000_000) throw new Error("Tổng số lượng phiếu vượt giới hạn.");
  return { models: result, total, ...(sharedColors ? { common_colors: sharedColors } : {}),
    ...(sharedSizes ? { common_sizes: sharedSizes, common_ratios: sharedRatios } : {}) };
}

/**
 * Tách màu rồi CỘNG TẤT CẢ CÁC SỐ LỚP trên cùng dòng.
 * Ví dụ: "CAM 10 20 30 10 20\nĐEN 20 10 20" -> CAM 90, ĐEN 50.
 * Vẫn hỗ trợ "ĐEN=10, CAM=5, ĐEN=3"; các dòng trùng màu được gộp.
 * Một dòng sai thì báo lỗi, không trả kết quả dở dang để ghi vào form.
 */
export function parseRapColorText(text: string): { color: string; layers: number }[] {
  const parts = text.replace(/[；;]/g, ",").split(/[,\n]+/).map(x => x.trim()).filter(Boolean);
  if (!parts.length || parts.length > 60)
    throw new Error("Nhập 1–60 dòng màu; ví dụ CAM 10 20 30 10 20, hoặc ĐEN=10.");
  const out = new Map<string, number>();
  for (const part of parts) {
    // Tách theo token để không nuốt các số đầu vào tên màu.
    // VD: "CAM 10 20 30" phải là màu CAM, số lớp 10 + 20 + 30 = 60.
    // Dấu = hoặc : cũng được chấp nhận: "XANH ĐEN=10 20".
    const tokens = part.replace(/\s*[=:]\s*/g, " ").trim().split(/\s+/);
    const firstNumber = tokens.findIndex(token => /^[0-9]+$/.test(token));
    if (firstNumber < 1 || !tokens.slice(firstNumber).every(token => /^[1-9]\d{0,5}$/.test(token)))
      throw new Error(`Không đọc được "${part}". Ví dụ: CAM 10 20 30 (mỗi số là số lớp).`);
    const color = tokens.slice(0, firstNumber).join(" ").toLocaleUpperCase("vi-VN");
    if (!color || color.length > 80 || /\d/.test(color))
      throw new Error("Tên màu không hợp lệ trong ô Tách nhanh (tên màu có số hãy nhập thủ công).");
    const layers = tokens.slice(firstNumber).reduce((sum, value) => sum + Number(value), 0);
    const total = (out.get(color) || 0) + layers;
    if (!Number.isSafeInteger(total) || total > 1_000_000)
      throw new Error(`Số lớp màu ${color} vượt giới hạn 1.000.000.`);
    out.set(color, total);
  }
  return Array.from(out, ([color, layers]) => ({ color, layers }));
}

/** Khách đặt: số lượng có thể là 100x7=700, x=700, 100x7 hoặc 700. */
export function parseCustomerQuantity(value: string): { quantity: number; layers: number | null } {
  const clean = value.trim().replace(/\s+/g, "").replace(/[×X*]/g, "x");
  let quantity: number; let layers: number | null = null;
  const multiplied = clean.match(/^([1-9]\d{0,5})x([1-9]\d{0,5})(?:=([1-9]\d{0,8}))?$/);
  const direct = clean.match(/^(?:x=|=)?([1-9]\d{0,8})$/);
  if (multiplied) {
    layers = Number(multiplied[1]);
    quantity = layers * Number(multiplied[2]);
    if (multiplied[3] && quantity !== Number(multiplied[3])) throw new Error("Tổng sau dấu = chưa khớp phép nhân.");
  } else if (direct) {
    quantity = Number(direct[1]);
  } else throw new Error("Số lượng phải có dạng 100x7=700 hoặc x=700.");
  if (!Number.isSafeInteger(quantity) || quantity <= 0 || quantity > 100_000_000)
    throw new Error("Số lượng phải từ 1 đến 100.000.000.");
  return { quantity, layers };
}
