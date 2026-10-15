"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { dt, day, money, vnToday, errorText } from "@/lib/azalas/format";
import { Msg, Loading, ImageViewer } from "@/components/ui";
import { ArrowLeft, Camera, CreditCard, FileText, Pencil, ReceiptText, RotateCcw, Trash2, Undo2 } from "lucide-react";

type Invoice = {
  id: number; invoice_code: string; customer_id: number; customer_name: string;
  status: string; subtotal: number; old_debt_snapshot: number; old_debt_override: number | null;
  invoice_image_path: string | null; created_at: string;
  finalized_at: string | null; deleted_at: string | null; note: string | null;
};
type Line = {
  id: number; product_name: string; color: string | null; size: string | null;
  quantity: number; unit_price: number; line_total: number;
};
type EditableLine = {
  key: string; id: number | null; product_name: string;
  color: string | null; size: string | null;
  quantity: string; unit_price: string;
};
type Pay = {
  method: string; payment_date: string; amount: number;
  reason: string; return_slip_id: number | null;
};
type ReturnSlip = {
  id: number; slip_code: string; status: string;
  applied_invoice_id: number | null; requested_invoice_id: number | null;
  reserved_invoice_id: number | null; settlement_mode: string | null;
  return_items: {
    id: number; product_name: string; quantity: number;
    unit_price: number; line_total: number;
  }[];
};
type InvoiceReturnLine = {
  id: number; invoice_id: number; return_slip_id: number;
  source_return_item_id: number; line_no: number;
  product_name: string; quantity: number; unit_price: number; line_total: number;
};
type ReturnEditRow = {
  source_return_item_id: number; product_name: string;
  quantity: string; unit_price: string;
};
type Unit = { id: number; group_id: number; order_code: string; packing_note: string | null };
type Group = { id: number; root_code: string; creator_note: string | null };
type PhotoGroup = { group_id: number; root_code: string; urls: string[] };

const methods = [
  { code: "TIEN_MAT", name: "Tiền mặt" },
  { code: "CHUYEN_KHOAN", name: "Chuyển khoản" },
  { code: "HANG_TRA", name: "Hàng trả đã duyệt" },
  { code: "CONG_THEM", name: "Cộng thêm" },
];
const numberText = (v: number | string | null | undefined) => String(v ?? 0);
const noteText = (v: string | null | undefined) => v?.trim() || "Không có ghi chú";

function editFromLine(l: Line): EditableLine {
  return {
    key: String(l.id), id: l.id, product_name: l.product_name,
    color: l.color, size: l.size,
    quantity: numberText(l.quantity), unit_price: numberText(l.unit_price),
  };
}

export default function InvoiceDetail({ invoiceId }: { invoiceId: number }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const paper = useRef<HTMLDivElement>(null);

  const [bill, setBill] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [editRows, setEditRows] = useState<EditableLine[]>([]);
  const [editing, setEditing] = useState(false);
  const [lineDirty, setLineDirty] = useState(false);
  const [oldDebtInput, setOldDebtInput] = useState("0");
  const [oldDebtDirty, setOldDebtDirty] = useState(false);
  const [units, setUnits] = useState<Unit[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [photoGroups, setPhotoGroups] = useState<PhotoGroup[]>([]);
  const [mediaError, setMediaError] = useState("");
  const [pay, setPay] = useState<Pay[]>([]);
  const [returnSlips, setReturnSlips] = useState<ReturnSlip[]>([]);
  const [returnLines, setReturnLines] = useState<InvoiceReturnLine[]>([]);
  const [returnDrafts, setReturnDrafts] = useState<Record<number, ReturnEditRow[]>>({});
  const [returnDirty, setReturnDirty] = useState<Record<number, boolean>>({});
  const [imageUrl, setImageUrl] = useState("");
  const [photoPath, setPhotoPath] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  // Lỗi xác nhận hàng trả luôn hiện ngay bên dưới phiếu được bấm.
  // Không đưa nội dung này vào vùng chụp ảnh hóa đơn.
  const [returnIssue, setReturnIssue] = useState("");
  const [returnIssueSlipId, setReturnIssueSlipId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    setMediaError("");
    const { data: b, error: be } = await sb.from("invoices")
      .select("id,invoice_code,customer_id,customer_name,status,subtotal,old_debt_snapshot,old_debt_override,invoice_image_path,created_at,finalized_at,deleted_at,note")
      .eq("id", invoiceId).single();
    if (be || !b) {
      setBill(null);
      setErr(be?.message || "Không tìm thấy hóa đơn");
      setLoading(false);
      return;
    }

    const [lineResult, paymentResult, linkResult, returnResult, returnLineResult] = await Promise.all([
      sb.from("invoice_lines")
        .select("id,product_name,color,size,quantity,unit_price,line_total")
        .eq("invoice_id", invoiceId).order("id"),
      sb.from("invoice_payments")
        .select("method,payment_date,amount,reason,return_slip_id")
        .eq("invoice_id", invoiceId).order("id"),
      sb.from("invoice_order_links").select("unit_id").eq("invoice_id", invoiceId),
      sb.from("return_slips")
        .select("id,slip_code,status,applied_invoice_id,requested_invoice_id,reserved_invoice_id,settlement_mode,return_items(id,product_name,quantity,unit_price,line_total)")
        .eq("customer_id", b.customer_id).order("id", { ascending: false }).limit(400),
      sb.from("az_invoice_return_lines")
        .select("id,invoice_id,return_slip_id,source_return_item_id,line_no,product_name,quantity,unit_price,line_total")
        .eq("invoice_id", invoiceId).order("line_no"),
    ]);
    if (lineResult.error) setErr(lineResult.error.message);
    if (paymentResult.error) { setErr(paymentResult.error.message); setMediaError("Không tải được thanh toán hóa đơn: " + paymentResult.error.message); }
    if (linkResult.error) setMediaError("Không tải được danh sách đơn liên kết: " + linkResult.error.message);
    if (returnResult.error || returnLineResult.error) {
      setMediaError("Không tải được hàng trả để xác nhận/chụp: " +
        (returnResult.error?.message || returnLineResult.error?.message));
    }

    const invoiceLines = ((lineResult.data || []) as Line[]).map(l => ({
      ...l, quantity: Number(l.quantity), unit_price: Number(l.unit_price),
      line_total: Number(l.line_total),
    }));
    setBill(b as Invoice);
    setLines(invoiceLines);
    setEditRows(invoiceLines.map(editFromLine));
    setEditing(false);
    setLineDirty(false);
    setOldDebtInput(String(b.old_debt_override ?? b.old_debt_snapshot ?? 0));
    setOldDebtDirty(false);
    setPay((paymentResult.data || []).map(p => ({
      method: p.method, payment_date: p.payment_date, amount: Number(p.amount),
      reason: p.reason || "", return_slip_id: p.return_slip_id,
    })));
    setDirty(false);
    const slips = (returnResult.data || []) as ReturnSlip[];
    const snapshots = (returnLineResult.data || []) as InvoiceReturnLine[];
    setReturnSlips(slips);
    setReturnLines(snapshots);
    const newDrafts: Record<number, ReturnEditRow[]> = {};
    slips.forEach(slip => {
      const saved = snapshots.filter(row => row.return_slip_id === slip.id);
      newDrafts[slip.id] = (saved.length ? saved.map(row => ({
        source_return_item_id: row.source_return_item_id,
        product_name: row.product_name,
        quantity: String(row.quantity), unit_price: String(row.unit_price),
      })) : (slip.return_items || []).map(row => ({
        source_return_item_id: row.id, product_name: row.product_name,
        quantity: String(row.quantity), unit_price: String(row.unit_price),
      })));
    });
    setReturnDrafts(newDrafts);
    setReturnDirty({});
    setPhotoPath("");
    setImageUrl("");
    if (b.invoice_image_path) {
      const { data } = await sb.storage.from("az-invoice-images")
        .createSignedUrl(b.invoice_image_path, 1800);
      setImageUrl(data?.signedUrl || "");
    }

    // 1 hoa don co the chon 2+ don. Doc TAT CA don da tick, khong lay moi ma don.
    // Anh gan voi order_groups: TX + CK cung mot don goc chi hien bo anh mot lan.
    let nextUnits: Unit[] = [];
    let nextGroups: Group[] = [];
    let nextPhotoGroups: PhotoGroup[] = [];
    const problems: string[] = [];
    const ids = (linkResult.data || []).map(x => Number(x.unit_id));
    if (!linkResult.error && !ids.length) problems.push("Hóa đơn không có đơn hàng liên kết; chưa thể chụp.");
    if (!linkResult.error && ids.length) {
      const { data: us, error: ue } = await sb.from("order_units")
        .select("id,group_id,order_code,packing_note")
        .in("id", ids).order("id");
      if (ue) problems.push("Không tải được đơn soạn: " + ue.message);
      else {
        nextUnits = (us || []) as Unit[];
        if (nextUnits.length !== ids.length) problems.push("Một số đơn liên kết chưa tải được; chưa thể chụp.");
      }

      const groupIds = [...new Set(nextUnits.map(u => Number(u.group_id)))];
      if (groupIds.length) {
        const [groupResult, imageResult] = await Promise.all([
          sb.from("order_groups").select("id,root_code,creator_note").in("id", groupIds),
          sb.from("order_images").select("id,group_id,storage_path")
            .in("group_id", groupIds).order("id"),
        ]);
        if (groupResult.error) problems.push("Không tải được ghi chú tạo đơn: " + groupResult.error.message);
        else {
          nextGroups = (groupResult.data || []) as Group[];
          if (nextGroups.length !== groupIds.length) problems.push("Một số ghi chú tạo đơn chưa tải được; chưa thể chụp.");
        }
        if (imageResult.error) problems.push("Không tải được ảnh tạo đơn: " + imageResult.error.message);
        else {
          const signed = await Promise.all((imageResult.data || []).map(async img => {
            const { data, error } = await sb.storage.from("az-order-images")
              .createSignedUrl(img.storage_path, 3600);
            if (error) problems.push(`Ảnh ${img.id}: ${error.message}`);
            return { group_id: Number(img.group_id), url: data?.signedUrl || "" };
          }));
          nextPhotoGroups = groupIds.map(id => ({
            group_id: id,
            root_code: nextGroups.find(g => g.id === id)?.root_code ||
              nextUnits.find(u => u.group_id === id)?.order_code || String(id),
            urls: signed.filter(x => x.group_id === id && x.url).map(x => x.url),
          }));
        }
      }
    }
    setUnits(nextUnits);
    setGroups(nextGroups);
    setPhotoGroups(nextPhotoGroups);
    if (problems.length) setMediaError(problems.join(" | "));
    setLoading(false);
  }, [invoiceId, sb]);

  useEffect(() => { void load(); }, [load]);

  const extras = pay.filter(p => p.method === "CONG_THEM")
    .reduce((s, p) => s + p.amount, 0);
  // So tien hang tra lay tu CHI TIET DA XAC NHAN, khong lay tu phieu chua duyet.
  // Mot phieu chi xuat hien mot lan du co nhieu san pham.
  const confirmedReturns = [...new Set(returnLines.map(r => Number(r.return_slip_id)))].map(slipId => {
    const items = returnLines.filter(r => Number(r.return_slip_id) === slipId);
    const paymentRows = pay.filter(p => p.method === "HANG_TRA" && p.return_slip_id === slipId);
    return {
      slipId, items,
      slipCode: returnSlips.find(r => r.id === slipId)?.slip_code || `#${slipId}`,
      payment: paymentRows[0], paymentCount: paymentRows.length,
      total: items.reduce((n, r) => n + Number(r.line_total), 0),
    };
  });
  const unmatchedReturnPayments = pay.filter(p => p.method === "HANG_TRA" &&
    !confirmedReturns.some(r => r.slipId === p.return_slip_id));
  // Khong bao gio tinh hai lan HANG_TRA: doi chieu bang snapshot va thanh toan.
  const confirmedReturnTotal = confirmedReturns.reduce((n, r) => n + r.total, 0);
  const paid = pay.filter(p => p.method !== "CONG_THEM" && p.method !== "HANG_TRA")
    .reduce((n, p) => n + p.amount, 0) + confirmedReturnTotal +
    unmatchedReturnPayments.reduce((n, p) => n + p.amount, 0);
  const returnPaymentMismatch = !!bill && bill.status === "CHUA_CHOT" &&
    (confirmedReturns.some(r => r.paymentCount !== 1 ||
      Math.abs(Number(r.payment?.amount || 0) - r.total) > 0.009) ||
      unmatchedReturnPayments.length > 0);
  const subtotal = editing
    ? editRows.reduce((s, r) => s + Number(r.quantity || 0) * Number(r.unit_price || 0), 0)
    : lines.reduce((s, l) => s + l.line_total, 0);
  // Số nhập trong Sửa đơn là số chờ chốt, không phải công nợ đã ghi sổ.
  const oldDebtShown = editing && oldDebtDirty
    ? Number(oldDebtInput || 0)
    : Number(bill?.old_debt_override ?? bill?.old_debt_snapshot ?? 0);
  const due = subtotal + oldDebtShown + extras;
  const remaining = due - paid;
  const draft = bill?.status === "CHUA_CHOT";
  const orderCodes = units.map(u => u.order_code);
  const totalSourcePhotos = photoGroups.reduce((n, p) => n + p.urls.length, 0);
  // Phiếu CHƯA DUYỆT cùng mã khách tự hiện; không cần Gửi đề nghị từ Hàng trả.
  const eligibleReturns = returnSlips.filter(s => s.status === "CHUA_DUYET" &&
    !s.settlement_mode && !s.applied_invoice_id && !s.reserved_invoice_id && !s.requested_invoice_id);
  // Chỉ nhận yêu cầu tồn đọng phiên bản cũ; phiếu chưa chọn KHÔNG chặn chốt hóa đơn.
  const pendingReturns = returnSlips.filter(s => s.status === "CHUA_DUYET" &&
    s.requested_invoice_id === bill?.id && !s.reserved_invoice_id && !s.settlement_mode);
  const legacyReturns = returnSlips.filter(s => s.status === "DA_DUYET" && s.settlement_mode === "LEGACY" &&
    !s.applied_invoice_id && !s.reserved_invoice_id && !s.requested_invoice_id);
  const attachedReturns = returnSlips.filter(s => returnLines.some(row => row.return_slip_id === s.id));
  const anyReturnDirty = Object.values(returnDirty).some(Boolean);

  function invalidatePhoto() {
    setPhotoPath("");
    setImageUrl("");
    setOk("");
  }
  function editPayment(i: number, key: keyof Pay, value: string) {
    setPay(rows => rows.map((p, j) => i === j ? {
      ...p, [key]: key === "amount" ? Number(value) :
        key === "return_slip_id" ? (value ? Number(value) : null) : value,
    } : p));
    setDirty(true);
    invalidatePhoto();
  }
  function addPay() {
    setPay(rows => [...rows, {
      method: "TIEN_MAT", payment_date: vnToday(), amount: 0,
      reason: "", return_slip_id: null,
    }]);
    setDirty(true);
    invalidatePhoto();
  }
  function changeRow(key: string, field: "product_name" | "quantity" | "unit_price", value: string) {
    setEditRows(rows => rows.map(r => r.key === key ? { ...r, [field]: value } : r));
    setLineDirty(true);
    invalidatePhoto();
  }
  function startEditing() {
    setEditRows(lines.map(editFromLine));
    setEditing(true);
    setLineDirty(false);
    setOldDebtInput(String(bill?.old_debt_override ?? bill?.old_debt_snapshot ?? 0));
    setOldDebtDirty(false);
    setErr("");
  }
  function stopEditing() {
    if ((lineDirty || oldDebtDirty) && !window.confirm("Bỏ các thay đổi chưa lưu?")) return;
    setEditRows(lines.map(editFromLine));
    setLineDirty(false);
    setOldDebtDirty(false);
    setEditing(false);
    setErr("");
  }
  function addLine() {
    setEditRows(rows => [...rows, {
      key: crypto.randomUUID(), id: null, product_name: "", color: null,
      size: null, quantity: "1", unit_price: "0",
    }]);
    setLineDirty(true);
    invalidatePhoto();
  }
  function removeLine(key: string) {
    setEditRows(rows => rows.filter(r => r.key !== key));
    setLineDirty(true);
    invalidatePhoto();
  }
  async function saveLines() {
    if (!bill || busy) return;
    if (dirty) return setErr("Hãy lưu bảng thanh toán trước khi lưu sửa đơn.");
    if (!lineDirty && !oldDebtDirty) return;
    const debtAmount = Number(oldDebtInput);
    if (oldDebtDirty && (!/^\d+$/.test(oldDebtInput.trim()) ||
        !Number.isSafeInteger(debtAmount) || debtAmount > 99999999999999)) {
      return setErr("Nợ cũ không hợp lệ. Nhập số tiền VND không âm.");
    }
    if (!editRows.length) return setErr("Hóa đơn cần ít nhất một dòng sản phẩm.");
    for (const r of editRows) {
      if (!r.product_name.trim()) return setErr("Vui lòng nhập tên cho tất cả dòng sản phẩm.");
      const q = Number(r.quantity), p = Number(r.unit_price);
      if (!/^[1-9][0-9]*$/.test(r.quantity) || !/^[0-9]+([.][0-9]{1,2})?$/.test(r.unit_price) ||
          !Number.isSafeInteger(q) || !Number.isFinite(p)) {
        return setErr("Số lượng phải là số nguyên > 0; đơn giá không âm, tối đa 2 số lẻ.");
      }
    }
    setBusy(true);
    setErr("");
    // Lưu nợ cũ CHỜ CHỐT. RPC tự cập nhật mốc nợ cũ trong bản nháp
    // nếu số dư thực tế đã thay đổi, không cập nhật công nợ khách ở bước này.
    let balanceAutoRefreshed = false;
    if (oldDebtDirty) {
      const { data: debtResult, error: debtError } = await sb.rpc("az_invoice_set_old_debt_draft", {
        p_invoice_id: bill.id,
        p_new_old_debt: debtAmount,
      });
      if (debtError) { setBusy(false); return setErr(debtError.message); }
      balanceAutoRefreshed = Boolean((debtResult as { balance_refreshed?: boolean } | null)?.balance_refreshed);
    }
    if (lineDirty) {
      const { error: lineError } = await sb.rpc("az_invoice_replace_lines", {
        p_invoice_id: bill.id,
        p_lines: editRows.map(r => ({
          id: r.id, product_name: r.product_name.trim(),
          color: r.color, size: r.size,
          quantity: Number(r.quantity), unit_price: Number(r.unit_price),
        })),
      });
      if (lineError) {
        setBusy(false);
        invalidatePhoto();
        return setErr(`Không lưu được dòng sản phẩm: ${lineError.message}. Nếu đã sửa nợ cũ, giá trị đó đang chờ chốt; hãy tải lại để kiểm tra.`);
      }
    }
    setBusy(false);
    invalidatePhoto();
    await load();
    setOk(balanceAutoRefreshed
      ? "Đã tự đồng bộ nợ cũ thực tế vào bản nháp và lưu số bạn sửa. Công nợ khách chưa đổi; hãy kiểm tra lại tổng tiền, chụp ảnh mới rồi chốt."
      : "Đã lưu sửa đơn. Nợ cũ đã nhập chỉ cập nhật công nợ khách khi chốt thành công; hãy chụp lại ảnh hóa đơn.");
  }

  function editReturnRow(slipId: number, sourceId: number, field: "product_name" | "quantity" | "unit_price", value: string) {
    setReturnDrafts(prev => ({ ...prev, [slipId]: (prev[slipId] || []).map(row =>
      row.source_return_item_id === sourceId ? { ...row, [field]: value } : row),
    }));
    setReturnDirty(prev => ({ ...prev, [slipId]: true }));
    setReturnIssue("");
    invalidatePhoto();
  }

  function reportReturnIssue(slipId: number, message: string) {
    setReturnIssueSlipId(slipId);
    setReturnIssue(message);
    setErr(message);
    setOk("");
  }

  // Chỉ làm mới NỢ CŨ khi người lập hóa đơn xác nhận bằng tay.
  // RPC đã có trong database AZALAS, không sửa số dư thực của khách.
  async function refreshOldDebtForReturn(slipId: number) {
    if (!bill || busy || !draft) return;
    if (!window.confirm(
      "Cập nhật NỢ CŨ mới nhất cho hóa đơn nháp này? Tổng phải thu có thể thay đổi; ảnh đã chụp phải chụp lại. Các dòng hàng trả chưa xác nhận sẽ được tải lại."
    )) return;
    setBusy(true);
    setReturnIssue("");
    setReturnIssueSlipId(slipId);
    try {
      const { error } = await sb.rpc("az_invoice_refresh_balance", { p_invoice_id: bill.id });
      if (error) {
        reportReturnIssue(slipId, `Không làm mới được nợ cũ: ${error.message}${error.code ? ` (mã ${error.code})` : ""}`);
        return;
      }
      invalidatePhoto();
      await load();
      setReturnIssue("");
      setOk("Đã cập nhật nợ cũ mới nhất. Hãy kiểm tra số tiền trên hóa đơn rồi bấm xác nhận Hàng trả một lần nữa.");
    } catch (e) {
      reportReturnIssue(slipId, `Không làm mới được nợ cũ: ${errorText(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function confirmReturn(slipId: number) {
    if (!bill || busy || !draft) return;
    setReturnIssue("");
    setReturnIssueSlipId(slipId);
    if (dirty || editing || lineDirty) {
      reportReturnIssue(slipId, "Hãy lưu sửa sản phẩm và bảng thanh toán trước khi xác nhận Hàng trả.");
      return;
    }
    const rows = returnDrafts[slipId] || [];
    const source = returnSlips.find(s => s.id === slipId);
    if (!source || !rows.length || rows.length !== (source.return_items || []).length) {
      reportReturnIssue(slipId, "Phiếu hàng trả thiếu chi tiết; chưa thể xác nhận.");
      return;
    }
    for (const row of rows) {
      if (!row.product_name.trim() || row.product_name.trim().length > 400 ||
          !/^[1-9][0-9]*$/.test(row.quantity) ||
          !/^[0-9]+(\.[0-9]{1,2})?$/.test(row.unit_price)) {
        reportReturnIssue(slipId, "Tên SP, SL hoặc giá hàng trả chưa hợp lệ (giá tối đa 2 số lẻ).");
        return;
      }
    }

    setBusy(true); setErr(""); setOk("");
    try {
      const { error } = await sb.rpc("az_invoice_confirm_return", {
        p_invoice_id: bill.id, p_slip_id: slipId,
        p_items: rows.map(row => ({
          source_return_item_id: row.source_return_item_id,
          product_name: row.product_name.trim(),
          quantity: Number(row.quantity), unit_price: Number(row.unit_price),
        })),
      });
      if (error) {
        // Hiện lỗi từ Supabase NGAY DƯỚI NÚT thay vì chỉ ở đầu trang.
        const details = [error.message, error.details, error.hint].filter(Boolean).join(" · ");
        reportReturnIssue(slipId, `Supabase chưa lưu phiếu: ${details}${error.code ? ` (mã ${error.code})` : ""}`);
        return;
      }

      // RPC báo thành công chưa đủ: đối chiếu cả bảng sản phẩm trả và thanh toán.
      const [savedReturn, savedPayment, savedSlip] = await Promise.all([
        sb.from("az_invoice_return_lines").select("id,line_total")
          .eq("invoice_id", bill.id).eq("return_slip_id", slipId),
        sb.from("invoice_payments").select("amount")
          .eq("invoice_id", bill.id).eq("return_slip_id", slipId).eq("method", "HANG_TRA"),
        sb.from("return_slips").select("id,reserved_invoice_id,settlement_mode")
          .eq("id", slipId).single(),
      ]);
      const amountSaved = (savedReturn.data || []).reduce((sum, row) => sum + Number(row.line_total), 0);
      const paymentSaved = Number(savedPayment.data?.[0]?.amount || 0);
      const persisted = !savedReturn.error && !savedPayment.error && !savedSlip.error &&
        (savedReturn.data || []).length === rows.length &&
        (savedPayment.data || []).length === 1 &&
        Math.abs(amountSaved - paymentSaved) < 0.009 &&
        savedSlip.data?.reserved_invoice_id === bill.id &&
        savedSlip.data?.settlement_mode === "INVOICE";

      invalidatePhoto();
      await load();
      if (!persisted) {
        const errorDetails = [savedReturn.error?.message, savedPayment.error?.message,
          savedSlip.error?.message].filter(Boolean).join(" · ");
        reportReturnIssue(slipId,
          `Supabase đã xử lý nhưng đọc lại chưa khớp: ${savedReturn.data?.length || 0}/${rows.length} dòng trả, ` +
          `${savedPayment.data?.length || 0} khoản trừ, tổng dòng ${amountSaved}, khoản trừ ${paymentSaved}. ` +
          `Phiếu đang gắn vào hóa đơn ${savedSlip.data?.reserved_invoice_id ?? "chưa rõ"}. ${errorDetails}`);
        return;
      }
      setReturnIssue("");
      setOk("Đã xác nhận: Hàng trả xuất hiện dưới TỔNG NỢ và chỉ trừ một lần. Hãy chụp ảnh hóa đơn mới trước khi chốt.");
    } catch (e) {
      reportReturnIssue(slipId, `Không xác nhận được Hàng trả: ${errorText(e)}`);
    } finally {
      setBusy(false);
    }
  }

  async function rejectReturn(slipId: number) {
    if (!bill || busy || !draft || !window.confirm("Bỏ phiếu hàng trả khỏi hóa đơn này? Phiếu sẽ chưa bị trừ công nợ.")) return;
    setBusy(true); setErr(""); setOk("");
    const { error } = await sb.rpc("az_invoice_reject_return", {
      p_invoice_id: bill.id, p_slip_id: slipId,
    });
    setBusy(false);
    if (error) return setErr(error.message);
    invalidatePhoto();
    await load();
    setOk("Đã bỏ phiếu hàng trả khỏi hóa đơn; chưa cấn trừ công nợ.");
  }

  async function savePayments(reloadAfter = true) {
    if (!bill) return false;
    if (lineDirty || editing || anyReturnDirty) {
      setErr("Hãy lưu sửa sản phẩm và chi tiết hàng trả trước khi lưu thanh toán.");
      return false;
    }
    const rows = pay.filter(p => p.amount > 0);
    for (const p of rows) {
      if (p.method === "HANG_TRA" && !p.return_slip_id) {
        setErr("Phiếu hàng trả chưa được xác nhận."); return false;
      }
      if (p.method === "CONG_THEM" && !p.reason.trim()) {
        setErr("Cộng thêm phải có lý do."); return false;
      }
    }
    const { error } = await sb.rpc("az_invoice_set_payments", {
      p_invoice_id: bill.id, p_payments: rows,
    });
    if (error) { setErr(error.message); return false; }
    setDirty(false);
    invalidatePhoto();
    setErr("");
    if (reloadAfter) await load();
    setOk("Đã lưu thanh toán. Chụp lại ảnh hóa đơn trước khi chốt.");
    return true;
  }

  async function capture() {
    if (!bill || !paper.current || busy) return;
    if (editing || lineDirty || anyReturnDirty) return setErr("Hãy lưu các sửa đổi sản phẩm/hàng trả trước khi chụp.");
    if (pendingReturns.length) return setErr("Còn yêu cầu hàng trả chờ xác nhận. Hãy xác nhận hoặc từ chối trước khi chụp.");
    if (returnPaymentMismatch) return setErr("Hàng trả chưa đồng bộ với thanh toán; không thể chụp/chốt. Hãy tải lại hóa đơn và kiểm tra phiếu.");
    if (mediaError) return setErr("Chưa tải đủ ảnh/ghi chú đơn. " + mediaError);
    setBusy(true);
    setErr("");
    setOk("");
    let uploaded = false;
    let copied = false;
    // ClipboardItem nhận Promise ngay lúc bấm; tránh mất quyền copy sau khi chờ upload.
    const blobPromise = (async (): Promise<Blob> => {
      if (dirty) {
        const saved = await savePayments(false);
        if (!saved) throw new Error("Chưa lưu được thanh toán; vui lòng sửa và thử lại.");
      }
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error("Hết phiên đăng nhập");
      const { error: bucketError } = await sb.storage.from("az-invoice-images")
        .list(user.id, { limit: 1 });
      if (bucketError) throw new Error("Bucket az-invoice-images chưa sẵn sàng: " + bucketError.message);
      if (!paper.current) throw new Error("Hóa đơn chưa hiển thị xong.");
      // Chờ ảnh đơn đã tải đầy đủ, không chụp hóa đơn bị khuyết hình.
      const images = Array.from(paper.current.querySelectorAll("img"));
      await Promise.all(images.map(img => img.decode()));
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(paper.current, {
        backgroundColor: "#ffffff", scale: 2, useCORS: true, logging: false,
      });
      return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error("Không tạo được ảnh hóa đơn")),
        "image/png",
      ));
    })();
    let clipPromise: Promise<boolean> = Promise.resolve(false);
    try {
      if (navigator.clipboard?.write && typeof ClipboardItem !== "undefined") {
        clipPromise = navigator.clipboard.write([
          new ClipboardItem({ "image/png": blobPromise }),
        ]).then(() => true).catch(() => false);
      }
    } catch { clipPromise = Promise.resolve(false); }
    void clipPromise.then(result => {
      copied = result;
      if (uploaded) setOk(result
        ? "Đã chụp, lưu và sao chép ảnh. Ctrl + V vào Zalo."
        : "Đã lưu ảnh. Nếu không dán được Zalo, bấm Sao chép lại.");
    });
    try {
      const blob = await blobPromise;
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error("Hết phiên đăng nhập");
      const path = `${user.id}/${bill.id}/${crypto.randomUUID()}.png`;
      const { error: uploadError } = await sb.storage.from("az-invoice-images")
        .upload(path, blob, { contentType: "image/png", upsert: false });
      if (uploadError) throw uploadError;
      uploaded = true;
      setPhotoPath(path);
      setImageUrl(URL.createObjectURL(blob));
      setOk(copied
        ? "Đã chụp, lưu và sao chép ảnh. Nút chốt đã mở."
        : "Đã chụp và lưu ảnh. Nút chốt đã mở; có thể sao chép lại để gửi Zalo.");
    } catch (e) {
      setErr(errorText(e));
      setPhotoPath("");
    } finally { setBusy(false); }
  }

  async function copyImage() {
    if (!imageUrl) return;
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
        throw new Error("Trình duyệt chưa hỗ trợ sao chép ảnh.");
      const blobPromise = fetch(imageUrl).then(r => {
        if (!r.ok) throw new Error("Không tải được ảnh để sao chép");
        return r.blob();
      });
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blobPromise })]);
      setOk("Đã sao chép ảnh! Ctrl + V vào Zalo.");
    } catch (e) { setErr(errorText(e)); }
  }
  async function finalize() {
    if (!bill || !photoPath || dirty || editing || lineDirty || oldDebtDirty || anyReturnDirty || pendingReturns.length || returnPaymentMismatch || mediaError) return;
    setBusy(true);
    setErr("");
    const { error } = await sb.rpc("az_invoice_finalize_with_old_debt", {
      p_invoice_id: bill.id, p_image_path: photoPath,
    });
    setBusy(false);
    if (error) { setErr(error.message); setPhotoPath(""); return; }
    // Chỉ điều hướng sau khi Supabase xác nhận chốt thành công.
    router.push("/azalas/invoices");
  }
  async function resetDraft() {
    if (!bill || !window.confirm("Reset chi tiết và thanh toán về dữ liệu soạn hàng? Ảnh đã chụp phải chụp lại.")) return;
    setBusy(true);
    const { error } = await sb.rpc("az_invoice_reset_draft", { p_invoice_id: bill.id });
    setBusy(false);
    if (error) setErr(error.message);
    else { invalidatePhoto(); await load(); }
  }
  async function cancelDraft() {
    if (!bill || !window.confirm("Hủy bản nháp và trả các đơn về danh sách Chưa gửi?")) return;
    const { error } = await sb.rpc("az_invoice_cancel_draft", { p_invoice_id: bill.id });
    if (error) setErr(error.message);
    else router.push("/azalas/invoices");
  }
  async function collect() {
    if (!bill) return;
    const value = window.prompt("Số tiền khách trả thêm (VND)");
    if (value === null) return;
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) return setErr("Số tiền không hợp lệ");
    const { error } = await sb.rpc("az_collect_payment", {
      p_invoice_id: invoiceId, p_amount: amount,
      p_method: "CHUYEN_KHOAN", p_payment_date: vnToday(),
    });
    if (error) setErr(error.message);
    else { await load(); setOk("Đã ghi nhận khoản thu; ảnh chốt ban đầu không thay đổi."); }
  }
  async function voidInvoice() {
    if (!bill) return;
    const reason = window.prompt("Lý do xóa mềm hóa đơn (chưa thu tiền / chưa dùng hàng trả)");
    if (!reason) return;
    const { error } = await sb.rpc("az_invoice_void", {
      p_invoice_id: invoiceId, p_reason: reason,
    });
    if (error) setErr(error.message);
    else { await load(); setOk("Đã xóa mềm hóa đơn."); }
  }

  if (loading) return <Loading />;
  if (!bill) return <Msg error={err || "Không tìm thấy hóa đơn"} />;

  const inputClass = "w-full min-w-0 rounded-lg border-2 border-blue-200 bg-white px-2 py-2 text-[19px] font-semibold text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
  // Tất cả số tiền trên hóa đơn dùng chung cỡ chữ và độ đậm.
  const amountClass = "text-[23px] font-extrabold tabular-nums whitespace-nowrap";
  const operationsPanelClass = "mx-auto w-full max-w-6xl rounded-[22px] border border-slate-200 bg-white p-5 shadow-[0_8px_30px_rgba(15,23,42,0.06)] sm:p-6";
  const sectionTitleClass = "text-[21px] font-black tracking-tight text-slate-950 sm:text-[23px]";
  const statusLabel = bill.status === "CHUA_CHOT" ? "CHƯA CHỐT" : bill.status === "DA_GUI" ? "ĐÃ GỬI" : bill.status === "DA_XOA" ? "ĐÃ XÓA" : bill.status.replaceAll("_", " ");
  const statusClass = bill.status === "DA_GUI"
    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
    : bill.status === "DA_XOA"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-amber-200 bg-amber-50 text-amber-700";

  return <div className="stack">
    <div className="mx-auto w-full max-w-6xl">
      <button type="button" onClick={() => router.push("/azalas/invoices")}
        className="inline-flex min-h-[42px] items-center gap-2 rounded-xl px-2 text-[14px] font-extrabold text-blue-700 transition hover:bg-blue-50 sm:text-[15px]">
        <ArrowLeft size={19} strokeWidth={2.4} /> Quay lại
      </button>
    </div>

    <section className="mx-auto w-full max-w-6xl overflow-hidden rounded-[24px] border border-blue-100 bg-gradient-to-br from-white via-blue-50/50 to-white shadow-[0_10px_35px_rgba(37,99,235,0.08)]">
      <div className="flex flex-col gap-4 p-5 sm:p-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-200 sm:h-14 sm:w-14">
            <ReceiptText size={28} strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-700 sm:text-[12px]">Hóa đơn / Chi tiết</p>
            <h1 className="mt-1 text-[27px] font-black tracking-tight text-slate-950 sm:text-[34px]">Chi tiết hóa đơn</h1>
            <p className="mt-1 break-words text-[14px] font-semibold text-slate-500 sm:text-[15px]">
              {bill.invoice_code} <span className="mx-1 text-slate-300">•</span> {bill.customer_name}
            </p>
          </div>
        </div>
        <span className={`inline-flex w-fit shrink-0 items-center rounded-full border px-4 py-2 text-[12px] font-black tracking-wide sm:text-[13px] ${statusClass}`}>
          {statusLabel}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 border-t border-blue-100 bg-white/80 px-5 py-4 sm:gap-3 sm:px-6">
        {draft && <>
          <button className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-[14px] font-extrabold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
            disabled={busy} onClick={resetDraft}><RotateCcw size={17} /> Reset</button>
          <button className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-[14px] font-extrabold text-red-700 shadow-sm transition hover:bg-red-100 disabled:opacity-50"
            disabled={busy} onClick={cancelDraft}><Trash2 size={17} /> Xóa bản nháp</button>
          <button className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-blue-600 bg-blue-600 px-4 text-[14px] font-extrabold text-white shadow-md shadow-blue-100 transition hover:bg-blue-700 disabled:opacity-50"
            disabled={busy} onClick={editing ? stopEditing : startEditing}><Pencil size={17} /> {editing ? "Đóng sửa" : "Sửa đơn"}</button>
        </>}
        {bill.status === "DA_GUI" && <>
          <button className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-blue-200 bg-blue-50 px-4 text-[14px] font-extrabold text-blue-700 shadow-sm transition hover:bg-blue-100"
            onClick={collect}><CreditCard size={17} /> Thu tiền sau chốt</button>
          <button className="inline-flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-[14px] font-extrabold text-red-700 shadow-sm transition hover:bg-red-100"
            onClick={voidInvoice}><Trash2 size={17} /> Xóa mềm có điều kiện</button>
        </>}
      </div>
    </section>

    <Msg error={err || mediaError} success={ok} />
    {returnPaymentMismatch && <p className="mx-auto w-full max-w-6xl rounded-xl border border-red-300 bg-red-50 p-3 text-sm font-semibold text-red-900">
      Số tiền hàng trả chưa khớp dòng thanh toán đã lưu. Hãy tải lại hóa đơn và kiểm tra dữ liệu; nút chụp/chốt đang khóa để tránh ghi sai công nợ.
    </p>}

    <div ref={paper} className="mx-auto w-full max-w-4xl rounded-2xl border border-slate-200 border-t-[7px] border-t-blue-700 bg-white p-5 text-[19px] leading-relaxed text-slate-900 shadow-xl sm:p-9">
      <header className="mb-5 border-b-2 border-slate-800 pb-5 text-center">
        <h2 className="mb-2 text-[32px] font-black tracking-tight text-slate-950 sm:text-[37px]">HÓA ĐƠN BÁN HÀNG</h2>
        <p className="break-all text-[20px] font-bold text-blue-800">{bill.invoice_code}</p>
      </header>
      <div className="mb-5 grid gap-2 text-[19px] leading-7 sm:grid-cols-2 sm:text-[20px]">
        <div><span className="font-bold text-slate-600">Khách hàng: </span><b className="text-slate-950">{bill.customer_name}</b></div>
        <div className="sm:text-right"><span className="font-bold text-slate-600">Ngày: </span>{dt(bill.created_at)}</div>
        <div className="sm:col-span-2"><span className="font-bold text-slate-600">Đơn liên kết: </span>
          <span className="break-words font-semibold text-blue-800">{orderCodes.join(" · ") || "—"}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-blue-100">
        <table className="w-full min-w-[620px] table-fixed border-collapse text-[19px] leading-6">
          <colgroup><col style={{ width: editing ? "52%" : "55%" }}/><col style={{ width: "12%" }}/><col style={{ width: "14%" }}/><col style={{ width: "17%" }}/>{editing && <col style={{ width: "5%" }}/>}</colgroup>
          <thead className="bg-blue-50 text-[18px] font-bold uppercase tracking-normal text-slate-800">
            <tr><th className="border-b border-blue-100 p-3 text-left">Sản phẩm</th><th className="border-b border-blue-100 p-3 text-center">SL</th><th className="border-b border-blue-100 p-3 text-right">Giá</th><th className="border-b border-blue-100 p-3 text-right">Thành tiền</th>{editing && <th className="border-b border-blue-100 p-2">Xóa</th>}</tr>
          </thead>
          <tbody>
            {editing ? editRows.map((r, i) => <tr key={r.key} className="border-t border-slate-100 align-middle">
              <td className="p-2"><div className="flex items-center gap-2"><span className="w-5 shrink-0 text-center text-[15px] font-bold text-slate-400">{i + 1}</span><input aria-label={`Tên sản phẩm dòng ${i + 1}`} className={`${inputClass} focus:border-emerald-600`} value={r.product_name} onChange={e => changeRow(r.key, "product_name", e.target.value)} /></div>{(r.color || r.size) && <p className="mt-1 pl-7 text-[14px] text-slate-500">{[r.color, r.size].filter(Boolean).join(" · ")}</p>}</td>
              <td className="p-2"><input aria-label={`Số lượng dòng ${i + 1}`} type="number" min="1" step="1" className={`${inputClass} text-right tabular-nums`} value={r.quantity} onChange={e => changeRow(r.key, "quantity", e.target.value)} /></td>
              <td className="p-2"><input aria-label={`Giá dòng ${i + 1}`} type="number" min="0" step="0.01" className={`${inputClass} text-right tabular-nums`} value={r.unit_price} onChange={e => changeRow(r.key, "unit_price", e.target.value)} /></td>
              <td className={`p-2 text-right ${amountClass} text-slate-900`}>{money(Math.max(0, Number(r.quantity || 0) * Number(r.unit_price || 0)))}</td>
              <td className="p-1 text-center"><button type="button" aria-label={`Xóa dòng ${i + 1}`} onClick={() => removeLine(r.key)} className="rounded-lg border border-red-200 bg-red-50 px-2 py-2 font-bold text-red-700 hover:bg-red-100">×</button></td>
            </tr>) : lines.map(l => <tr key={l.id} className="border-t border-slate-100">
              <td className="p-3 font-medium text-slate-950">{l.product_name}{(l.color || l.size) && <p className="mt-1 text-[17px] font-medium text-slate-500">{[l.color, l.size].filter(Boolean).join(" · ")}</p>}</td>
              <td className="p-3 text-center font-medium tabular-nums">{l.quantity}</td>
              <td className="p-3 text-right font-medium tabular-nums">{money(l.unit_price)}</td>
              <td className={`p-3 text-right ${amountClass}`}>{money(l.line_total)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {editing && <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
        <button className="btn soft" type="button" onClick={addLine}>+ THÊM DÒNG</button>
        <button className="btn success" type="button" disabled={busy || (!lineDirty && !oldDebtDirty) || editRows.length === 0} onClick={() => void saveLines()}>{busy ? "Đang lưu..." : "✓ LƯU SỬA ĐƠN"}</button>
      </div>}


      <div className="mt-6 border-t-2 border-slate-800 pt-4">
        <div className="ml-auto max-w-lg space-y-3 text-[19px] leading-7 sm:text-[20px]">
          <div className="flex items-baseline justify-between gap-5"><span className="font-bold text-slate-700">TỔNG ĐƠN HÀNG</span><b className={`${amountClass} text-slate-950`}>{money(subtotal)}</b></div>
          <div className="flex items-center justify-between gap-5">
            <span className="font-bold text-slate-700">NỢ CŨ</span>
            {editing ? <div className="min-w-0 max-w-[240px] flex-1 text-right">
              <input type="text" inputMode="numeric" aria-label="Sửa nợ cũ chờ chốt"
                value={oldDebtInput} onChange={e => {
                  const value = e.target.value.replace(/\D/g, "");
                  setOldDebtInput(value);
                  setOldDebtDirty(value !== String(bill.old_debt_override ?? bill.old_debt_snapshot ?? 0));
                  invalidatePhoto();
                }}
                className={`${inputClass} text-right tabular-nums`} />
              <p className="mt-1 text-[14px] font-bold text-blue-700">{money(Number(oldDebtInput || 0))} đ</p>
              <p className="mt-1 text-[12px] font-semibold text-amber-700">Chỉ đổi công nợ khi chốt thành công</p>
            </div> : <b className={`${amountClass} text-slate-900`}>{money(oldDebtShown)}</b>}
          </div>
          {pay.filter(p => p.method === "CONG_THEM" && p.amount > 0).map((p, i) => <div key={`extra-${i}`} className="flex items-start justify-between gap-4 border-b border-dashed border-slate-200 pb-2">
            <div className="min-w-0 flex-1">
              <p className="text-[19px] font-bold text-slate-700">CỘNG THÊM · {day(p.payment_date)}</p>
              {p.reason?.trim() && <p className="mt-0.5 whitespace-pre-wrap break-words pl-3 text-[17px] font-normal italic leading-6 text-slate-600">{p.reason.trim()}</p>}
            </div>
            <b className={`${amountClass} shrink-0 text-slate-950`}>+{money(p.amount)}</b>
          </div>)}
          <div className="flex items-baseline justify-between gap-5 border-t border-slate-200 pt-3"><span className="font-extrabold text-blue-700">TỔNG NỢ</span><b className={`${amountClass} text-blue-700`}>{money(due)}</b></div>
          {confirmedReturns.map(r => <div key={`return-${r.slipId}`} className="flex items-start justify-between gap-4 border-b border-dashed border-slate-200 pb-2">
            <div className="min-w-0 flex-1">
              <p className="text-[19px] font-semibold text-slate-700">• Hàng trả · {day(r.payment?.payment_date || bill.created_at)}</p>
              {r.items.map(item => <p key={item.id} className="mt-0.5 whitespace-pre-wrap break-words pl-3 text-[17px] font-normal italic leading-6 text-slate-600">
                {item.product_name} · {item.quantity} × {money(item.unit_price)} = {money(item.line_total)}
              </p>)}
              <p className="mt-1 pl-3 text-[15px] text-slate-400">Phiếu {r.slipCode}</p>
            </div>
            <b className={`${amountClass} shrink-0 text-red-600`}>-{money(r.total)}</b>
          </div>)}
          {/* Phieu cu chua co snapshot chi tiet: giu so tien de khong sai cong no. */}
          {unmatchedReturnPayments.map((p, i) => <div key={`legacy-return-${i}`} className="flex items-start justify-between gap-4 border-b border-dashed border-slate-200 pb-2">
            <p className="text-[19px] font-semibold text-slate-700">• Hàng trả · {day(p.payment_date)} · {p.reason || "Phiếu cũ"}</p>
            <b className={`${amountClass} shrink-0 text-red-600`}>-{money(p.amount)}</b>
          </div>)}
          {pay.filter(p => p.amount > 0 && p.method !== "CONG_THEM" && p.method !== "HANG_TRA").map((p, i) => <div key={i} className="flex items-start justify-between gap-4 border-b border-dashed border-slate-200 pb-2">
            <div className="min-w-0 flex-1">
              <p className="text-[19px] font-semibold text-slate-700">• {methods.find(m => m.code === p.method)?.name || p.method} · {day(p.payment_date)}</p>
              {p.reason?.trim() && <p className="mt-0.5 whitespace-pre-wrap break-words pl-3 text-[17px] font-normal italic leading-6 text-slate-600">{p.reason.trim()}</p>}
            </div>
            <b className={`${amountClass} shrink-0 text-red-600`}>-{money(p.amount)}</b>
          </div>)}
          <div className="flex items-center justify-between gap-4 border-t-2 border-slate-800 pt-4"><span className="font-black text-slate-950">{remaining < 0 ? "KHÁCH DƯ TIỀN" : "CÒN LẠI PHẢI THU"}</span><b className={`${amountClass} text-blue-800`}>{money(Math.abs(remaining))}</b></div>
        </div>
      </div>

      {/* Anh cua MOI order_groups thuoc cac don da tick. Click anh de zoom. */}
      <div className="mt-6 space-y-3 border-t border-dashed border-slate-300 pt-5">
        <h3 className="text-[17px] font-black uppercase tracking-wide text-blue-800">Ảnh đính kèm từ đơn hàng</h3>
        {photoGroups.filter(p => p.urls.length > 0).map(p => <div key={p.group_id} className="rounded-xl border border-blue-100 bg-slate-50 p-3">
          <p className="mb-2 text-[15px] font-extrabold text-slate-700">Đơn {p.root_code} · {p.urls.length} ảnh</p>
          <ImageViewer urls={p.urls} label={`Ảnh đơn ${p.root_code}`} />
        </div>)}
        {totalSourcePhotos === 0 && !mediaError && <p className="rounded-lg bg-slate-50 p-3 text-[17px] text-slate-600">Không có ảnh tạo đơn</p>}
        {mediaError && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-[15px] text-red-800">Ảnh/ghi chú chưa tải đủ: {mediaError}</p>}
      </div>
    </div>

    {/* Ghi chu nghiep vu duoc hien thi DUOI hoa don, ben NGOAI vung ref={paper}.
        Khong dua ghi chu tao/soan vao anh chup gui khach. */}
    <section className={operationsPanelClass}>
      {/* Ghi chu TU HAI NGUON: order_groups.creator_note va order_units.packing_note. */}
      <div className="mb-5 flex items-start gap-3 border-b border-slate-100 pb-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-50 text-amber-700">
          <FileText size={22} strokeWidth={2.2} />
        </span>
        <div>
          <h2 className={sectionTitleClass}>Ghi chú đơn hàng</h2>
          <p className="mt-1 text-[14px] leading-6 text-slate-500 sm:text-[15px]">Ghi chú tạo đơn và ghi chú soạn hàng của các đơn đang liên kết với hóa đơn này.</p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {groups.map(g => <div key={`create-${g.id}`} className="rounded-2xl border border-amber-200 bg-amber-50/80 p-4 sm:p-5">
          <p className="mb-1.5 text-[14px] font-extrabold uppercase tracking-wide text-amber-900">Ghi chú tạo đơn · {g.root_code}</p>
          <p className="whitespace-pre-wrap break-words text-[16px] font-semibold leading-7 text-slate-900">{noteText(g.creator_note)}</p>
        </div>)}
        {units.map(u => <div key={`pack-${u.id}`} className="rounded-2xl border border-blue-200 bg-blue-50/80 p-4 sm:p-5">
          <p className="mb-1.5 text-[14px] font-extrabold uppercase tracking-wide text-blue-900">Ghi chú soạn hàng · {u.order_code}</p>
          <p className="whitespace-pre-wrap break-words text-[16px] font-semibold leading-7 text-slate-900">{noteText(u.packing_note)}</p>
        </div>)}
        {groups.length === 0 && units.length === 0 && !mediaError && <p className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-[16px] text-slate-600 md:col-span-2">Không có ghi chú</p>}
      </div>
    </section>

    {draft && <section className={`${operationsPanelClass} space-y-5`}>
      <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-red-50 text-red-600">
          <Undo2 size={22} strokeWidth={2.2} />
        </span>
        <div>
          <h2 className={sectionTitleClass}>Hàng trả · xác nhận và sửa chi tiết</h2>
        </div>
      </div>
      {eligibleReturns.length > 0 && <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-900">Có {eligibleReturns.length} phiếu hàng trả của khách đang chờ chọn. Chỉ những phiếu bạn XÁC NHẬN mới được cấn trừ khi chốt hóa đơn.</p>}
      {pendingReturns.length > 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-900">Có {pendingReturns.length} phiếu hàng trả đang chờ bạn xác nhận hoặc từ chối. Chưa trừ công nợ.</p>}
      {[...eligibleReturns, ...pendingReturns.filter(s => !eligibleReturns.some(e => e.id === s.id)), ...legacyReturns, ...attachedReturns].map(slip => {
        const isAttached = attachedReturns.some(s => s.id === slip.id);
        const rows = returnDrafts[slip.id] || [];
        const total = rows.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.unit_price || 0), 0);
        return <div key={slip.id} className="space-y-3 rounded-2xl border border-blue-200 bg-slate-50 p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><b className="text-blue-900">{slip.slip_code}</b>
              <p className="text-sm text-slate-600">{isAttached ? "✓ Đã chọn cho hóa đơn này · chỉ trừ nợ khi chốt" : slip.settlement_mode === "LEGACY" ? "Phiếu đã duyệt từ bản cũ, chưa cấn trừ" : "Phiếu chưa duyệt cùng khách · được chọn trực tiếp"}</p>
            </div>
            {isAttached && <button className="btn danger" disabled={busy} onClick={() => void rejectReturn(slip.id)}>Bỏ phiếu khỏi hóa đơn</button>}
          </div>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="w-full min-w-[580px] border-collapse text-[15px]">
              <thead className="bg-blue-50 text-blue-950"><tr>
                <th className="p-2 text-left">Tên sản phẩm</th><th className="p-2 text-center">SL</th>
                <th className="p-2 text-center">Giá</th><th className="p-2 text-right">Thành tiền</th>
              </tr></thead><tbody>{rows.map(row => <tr key={row.source_return_item_id} className="border-t border-slate-100">
                <td className="p-2"><input className={inputClass} value={row.product_name} onChange={e => editReturnRow(slip.id, row.source_return_item_id, "product_name", e.target.value)} /></td>
                <td className="w-[90px] p-2"><input inputMode="numeric" className={`${inputClass} text-center`} value={row.quantity} onChange={e => editReturnRow(slip.id, row.source_return_item_id, "quantity", e.target.value)} /></td>
                <td className="w-[125px] p-2"><input inputMode="decimal" className={`${inputClass} text-right`} value={row.unit_price} onChange={e => editReturnRow(slip.id, row.source_return_item_id, "unit_price", e.target.value)} /></td>
                <td className="whitespace-nowrap p-2 text-right font-bold text-red-700">-{money(Number(row.quantity || 0) * Number(row.unit_price || 0))}</td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <b className="text-lg text-red-800">Tổng trả: {money(total)}</b>
            <button className="btn success" disabled={busy || (isAttached && !returnDirty[slip.id]) || dirty || editing || lineDirty || !rows.length}
              onClick={() => void confirmReturn(slip.id)}>{busy ? "Đang lưu..." : isAttached ? "Lưu sửa hàng trả" : "✓ XÁC NHẬN ĐƯA VÀO HÓA ĐƠN"}</button>
          </div>
          {returnIssueSlipId === slip.id && returnIssue && <div role="alert" className="space-y-3 rounded-xl border-2 border-red-400 bg-red-50 p-4 text-[15px] text-red-950">
            <p className="font-extrabold">Chưa xác nhận được phiếu {slip.slip_code}</p>
            <p className="whitespace-pre-wrap break-words font-semibold">{returnIssue}</p>
            {/No cu da doi|Nợ cũ đã đổi|nợ cũ đã thay đổi/i.test(returnIssue) && <button type="button" className="btn soft" disabled={busy}
              onClick={() => void refreshOldDebtForReturn(slip.id)}>Làm mới nợ cũ của hóa đơn (xác nhận lại trước khi lưu)</button>}
          </div>}
        </div>;
      })}
      {!eligibleReturns.length && !pendingReturns.length && !legacyReturns.length && !attachedReturns.length && <p className="muted">Không có phiếu hàng trả chưa duyệt nào của khách này để chọn.</p>}
    </section>}

    {draft && <section className={`${operationsPanelClass} space-y-5`}>
      <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
          <CreditCard size={22} strokeWidth={2.2} />
        </span>
        <div>
          <h2 className={sectionTitleClass}>Thanh toán và điều chỉnh</h2>
        </div>
      </div>
      {pay.map((p, i) => p.method === "HANG_TRA" ?
        <div key={`return-payment-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
          <div><b className="text-red-900">Hàng trả · {returnSlips.find(s => s.id === p.return_slip_id)?.slip_code || p.reason || "Phiếu hàng trả"}</b>
            <p className="text-sm text-red-800">{day(p.payment_date)} · Đã xác nhận; sửa tại bảng Hàng trả phía trên</p>
          </div><b className="text-lg text-red-700">-{money(p.amount)}</b>
        </div> : <div key={i} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-5">
          <select className="field" value={p.method} onChange={e => editPayment(i, "method", e.target.value)}>
            {methods.filter(m => m.code !== "HANG_TRA").map(m => <option key={m.code} value={m.code}>{m.name}</option>)}
          </select>
          <input type="date" className="field" value={p.payment_date} onChange={e => editPayment(i, "payment_date", e.target.value)} />
          <input type="number" min="0" step="1" className="field" placeholder="Số tiền" value={p.amount || ""} onChange={e => editPayment(i, "amount", e.target.value)} />
          <input className="field" placeholder="Ghi chú thanh toán / điều chỉnh (nếu có)" value={p.reason || ""} onChange={e => editPayment(i, "reason", e.target.value)} />
          <button className="btn danger" onClick={() => { setPay(rows => rows.filter((_, j) => j !== i)); setDirty(true); invalidatePhoto(); }}>Bỏ dòng</button>
        </div>)}
      <div className="flex flex-wrap gap-3">
        <button className="btn soft" onClick={addPay}>+ Thêm thanh toán</button>
        <button className="btn primary" disabled={busy || !dirty || editing || anyReturnDirty} onClick={() => void savePayments()}>Lưu bảng thanh toán</button>
      </div>
    </section>}

    <section className={`${operationsPanelClass} space-y-5`}>
      <div className="flex items-start gap-3 border-b border-slate-100 pb-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700">
          <Camera size={22} strokeWidth={2.2} />
        </span>
        <div>
          <h2 className={sectionTitleClass}>Ảnh hóa đơn</h2>
          <p className="mt-1 text-[14px] leading-6 text-slate-500 sm:text-[15px]">Ảnh chụp hóa đơn dùng để lưu và gửi khách sau khi hoàn tất kiểm tra.</p>
        </div>
      </div>
      {imageUrl && <ImageViewer urls={[imageUrl]} label="Ảnh hóa đơn" />}
      {draft ? <>
        <div className="flex flex-wrap gap-3">
          <button disabled={busy || editing || lineDirty || oldDebtDirty || anyReturnDirty || pendingReturns.length > 0 || returnPaymentMismatch || !!mediaError} onClick={() => void capture()} className="btn primary">{busy ? "Đang chụp và lưu..." : "📷 Chụp, lưu ảnh và sao chép gửi Zalo"}</button>
          {photoPath && !dirty && !editing && !lineDirty && !oldDebtDirty && !anyReturnDirty && pendingReturns.length === 0 && !returnPaymentMismatch && <>
            <button className="btn soft" onClick={() => void copyImage()}>Sao chép lại (nếu cần)</button>
            <button className="btn success" disabled={busy || !!mediaError || anyReturnDirty || pendingReturns.length > 0 || returnPaymentMismatch} onClick={() => void finalize()}>✓ XÁC NHẬN CHỐT HÓA ĐƠN</button>
          </>}
        </div>
      </> : <button disabled={!imageUrl} className="btn soft" onClick={() => void copyImage()}>Sao chép ảnh gửi Zalo</button>}
    </section>
  </div>;
}
