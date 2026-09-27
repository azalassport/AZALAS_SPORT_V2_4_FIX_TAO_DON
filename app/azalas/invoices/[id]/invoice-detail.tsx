"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { dt, money, vnToday, errorText } from "@/lib/azalas/format";
import { Msg, Loading, ImageViewer } from "@/components/ui";

type Invoice = {
  id: number; invoice_code: string; customer_id: number; customer_name: string;
  status: string; subtotal: number; old_debt_snapshot: number;
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
  id: number; slip_code: string; status: string; applied_invoice_id: number | null;
  return_items: { line_total: number }[];
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
  const [units, setUnits] = useState<Unit[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [photoGroups, setPhotoGroups] = useState<PhotoGroup[]>([]);
  const [mediaError, setMediaError] = useState("");
  const [pay, setPay] = useState<Pay[]>([]);
  const [credits, setCredits] = useState<ReturnSlip[]>([]);
  const [imageUrl, setImageUrl] = useState("");
  const [photoPath, setPhotoPath] = useState("");
  const [dirty, setDirty] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    setMediaError("");
    const { data: b, error: be } = await sb.from("invoices")
      .select("id,invoice_code,customer_id,customer_name,status,subtotal,old_debt_snapshot,invoice_image_path,created_at,finalized_at,deleted_at,note")
      .eq("id", invoiceId).single();
    if (be || !b) {
      setBill(null);
      setErr(be?.message || "Không tìm thấy hóa đơn");
      setLoading(false);
      return;
    }

    const [lineResult, paymentResult, linkResult, returnResult] = await Promise.all([
      sb.from("invoice_lines")
        .select("id,product_name,color,size,quantity,unit_price,line_total")
        .eq("invoice_id", invoiceId).order("id"),
      sb.from("invoice_payments")
        .select("method,payment_date,amount,reason,return_slip_id")
        .eq("invoice_id", invoiceId).order("id"),
      sb.from("invoice_order_links").select("unit_id").eq("invoice_id", invoiceId),
      sb.from("return_slips")
        .select("id,slip_code,status,applied_invoice_id,return_items(line_total)")
        .eq("customer_id", b.customer_id).eq("status", "DA_DUYET")
        .is("applied_invoice_id", null),
    ]);
    if (lineResult.error) setErr(lineResult.error.message);
    if (paymentResult.error) setErr(paymentResult.error.message);
    if (linkResult.error) setMediaError("Không tải được danh sách đơn liên kết: " + linkResult.error.message);

    const invoiceLines = ((lineResult.data || []) as Line[]).map(l => ({
      ...l, quantity: Number(l.quantity), unit_price: Number(l.unit_price),
      line_total: Number(l.line_total),
    }));
    setBill(b as Invoice);
    setLines(invoiceLines);
    setEditRows(invoiceLines.map(editFromLine));
    setEditing(false);
    setLineDirty(false);
    setPay((paymentResult.data || []).map(p => ({
      method: p.method, payment_date: p.payment_date, amount: Number(p.amount),
      reason: p.reason || "", return_slip_id: p.return_slip_id,
    })));
    setDirty(false);
    setCredits((returnResult.data || []) as ReturnSlip[]);
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
  const paid = pay.filter(p => p.method !== "CONG_THEM")
    .reduce((s, p) => s + p.amount, 0);
  const subtotal = editing
    ? editRows.reduce((s, r) => s + Number(r.quantity || 0) * Number(r.unit_price || 0), 0)
    : lines.reduce((s, l) => s + l.line_total, 0);
  const due = subtotal + Number(bill?.old_debt_snapshot || 0) + extras;
  const remaining = due - paid;
  const draft = bill?.status === "CHUA_CHOT";
  const orderCodes = units.map(u => u.order_code);
  const totalSourcePhotos = photoGroups.reduce((n, p) => n + p.urls.length, 0);

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
    setErr("");
  }
  function stopEditing() {
    if (lineDirty && !window.confirm("Bỏ các thay đổi sản phẩm chưa lưu?")) return;
    setEditRows(lines.map(editFromLine));
    setLineDirty(false);
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
    if (dirty) return setErr("Hãy lưu bảng thanh toán trước khi lưu sửa sản phẩm.");
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
    const { error } = await sb.rpc("az_invoice_replace_lines", {
      p_invoice_id: bill.id,
      p_lines: editRows.map(r => ({
        id: r.id, product_name: r.product_name.trim(),
        color: r.color, size: r.size,
        quantity: Number(r.quantity), unit_price: Number(r.unit_price),
      })),
    });
    setBusy(false);
    if (error) return setErr(error.message);
    invalidatePhoto();
    await load();
    setOk("Đã lưu sửa đơn. Tổng tiền đã tính lại; cần chụp ảnh hóa đơn mới trước khi chốt.");
  }

  async function savePayments(reloadAfter = true) {
    if (!bill) return false;
    if (lineDirty || editing) {
      setErr("Hãy lưu sửa sản phẩm và đóng chế độ sửa trước khi lưu thanh toán.");
      return false;
    }
    const rows = pay.filter(p => p.amount > 0);
    for (const p of rows) {
      if (p.method === "HANG_TRA" && !p.return_slip_id) {
        setErr("Chọn phiếu hàng trả đã duyệt."); return false;
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
    if (editing || lineDirty) return setErr("Hãy lưu và đóng phần Sửa đơn trước khi chụp.");
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
    if (!bill || !photoPath || dirty || editing || lineDirty || mediaError) return;
    setBusy(true);
    setErr("");
    const { error } = await sb.rpc("az_invoice_finalize", {
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

  const inputClass = "w-full min-w-0 rounded-lg border-2 border-blue-200 bg-white px-2 py-2 text-[16px] font-semibold text-slate-900 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100";
  // Tất cả số tiền trên hóa đơn dùng chung cỡ chữ và độ đậm.
  const amountClass = "text-[20px] font-extrabold tabular-nums whitespace-nowrap";
  return <div className="stack">
    <Msg error={err || mediaError} success={ok} />
    <div className="flex flex-wrap items-center gap-2">
      {draft && <>
        <button className="btn" disabled={busy} onClick={resetDraft}>Reset</button>
        <button className="btn danger" disabled={busy} onClick={cancelDraft}>Xóa bản nháp</button>
        <button className="btn soft" disabled={busy} onClick={editing ? stopEditing : startEditing}>
          {editing ? "Đóng sửa" : "✎ Sửa đơn"}
        </button>
      </>}
      {bill.status === "DA_GUI" && <>
        <button className="btn soft" onClick={collect}>+ Thu tiền sau chốt</button>
        <button className="btn danger" onClick={voidInvoice}>Xóa mềm có điều kiện</button>
      </>}
      <span className={`chip ${bill.status === "DA_GUI" ? "done" : ""}`}>{bill.status}</span>
    </div>

    <div ref={paper} className="mx-auto w-full max-w-4xl rounded-2xl border border-slate-200 border-t-[7px] border-t-blue-700 bg-white p-5 text-[16px] leading-relaxed text-slate-900 shadow-xl sm:p-9">
      <header className="mb-5 border-b-2 border-slate-800 pb-5 text-center">
        <p className="text-[15px] font-extrabold tracking-[.15em] text-blue-700">AZALAS SPORT</p>
        <h2 className="my-2 text-[29px] font-black tracking-tight text-slate-950 sm:text-[34px]">HÓA ĐƠN BÁN HÀNG</h2>
        <p className="break-all text-[17px] font-bold text-blue-800">{bill.invoice_code}</p>
      </header>
      <div className="mb-5 grid gap-2 text-[16px] leading-7 sm:grid-cols-2 sm:text-[17px]">
        <div><span className="font-bold text-slate-600">Khách hàng: </span><b className="text-slate-950">{bill.customer_name}</b></div>
        <div className="sm:text-right"><span className="font-bold text-slate-600">Ngày: </span>{dt(bill.created_at)}</div>
        <div className="sm:col-span-2"><span className="font-bold text-slate-600">Đơn liên kết: </span>
          <span className="break-words font-semibold text-blue-800">{orderCodes.join(" · ") || "—"}</span>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-blue-100">
        <table className="w-full min-w-[620px] table-fixed border-collapse text-[16px] leading-6">
          <colgroup><col style={{ width: editing ? "52%" : "55%" }}/><col style={{ width: "12%" }}/><col style={{ width: "14%" }}/><col style={{ width: "17%" }}/>{editing && <col style={{ width: "5%" }}/>}</colgroup>
          <thead className="bg-blue-50 text-[15px] font-bold uppercase tracking-normal text-slate-800">
            <tr><th className="border-b border-blue-100 p-3 text-left">Sản phẩm</th><th className="border-b border-blue-100 p-3 text-center">SL</th><th className="border-b border-blue-100 p-3 text-right">Giá</th><th className="border-b border-blue-100 p-3 text-right">Thành tiền</th>{editing && <th className="border-b border-blue-100 p-2">Xóa</th>}</tr>
          </thead>
          <tbody>
            {editing ? editRows.map((r, i) => <tr key={r.key} className="border-t border-slate-100 align-middle">
              <td className="p-2"><div className="flex items-center gap-2"><span className="w-5 shrink-0 text-center text-xs font-bold text-slate-400">{i + 1}</span><input aria-label={`Tên sản phẩm dòng ${i + 1}`} className={`${inputClass} focus:border-emerald-600`} value={r.product_name} onChange={e => changeRow(r.key, "product_name", e.target.value)} /></div>{(r.color || r.size) && <p className="mt-1 pl-7 text-[11px] text-slate-500">{[r.color, r.size].filter(Boolean).join(" · ")}</p>}</td>
              <td className="p-2"><input aria-label={`Số lượng dòng ${i + 1}`} type="number" min="1" step="1" className={`${inputClass} text-right tabular-nums`} value={r.quantity} onChange={e => changeRow(r.key, "quantity", e.target.value)} /></td>
              <td className="p-2"><input aria-label={`Giá dòng ${i + 1}`} type="number" min="0" step="0.01" className={`${inputClass} text-right tabular-nums`} value={r.unit_price} onChange={e => changeRow(r.key, "unit_price", e.target.value)} /></td>
              <td className={`p-2 text-right ${amountClass} text-slate-900`}>{money(Math.max(0, Number(r.quantity || 0) * Number(r.unit_price || 0)))}</td>
              <td className="p-1 text-center"><button type="button" aria-label={`Xóa dòng ${i + 1}`} onClick={() => removeLine(r.key)} className="rounded-lg border border-red-200 bg-red-50 px-2 py-2 font-bold text-red-700 hover:bg-red-100">×</button></td>
            </tr>) : lines.map(l => <tr key={l.id} className="border-t border-slate-100">
              <td className="p-3 font-medium text-slate-950">{l.product_name}{(l.color || l.size) && <p className="mt-1 text-[14px] font-medium text-slate-500">{[l.color, l.size].filter(Boolean).join(" · ")}</p>}</td>
              <td className="p-3 text-center font-medium tabular-nums">{l.quantity}</td>
              <td className="p-3 text-right font-medium tabular-nums">{money(l.unit_price)}</td>
              <td className={`p-3 text-right ${amountClass}`}>{money(l.line_total)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {editing && <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
        <button className="btn soft" type="button" onClick={addLine}>+ THÊM DÒNG</button>
        <button className="btn success" type="button" disabled={busy || !lineDirty || editRows.length === 0} onClick={() => void saveLines()}>{busy ? "Đang lưu..." : "✓ LƯU SỬA ĐƠN"}</button>
      </div>}

      <div className="mt-6 border-t-2 border-slate-800 pt-4">
        <div className="ml-auto max-w-lg space-y-3 text-[16px] leading-7 sm:text-[17px]">
          <div className="flex items-baseline justify-between gap-5"><span className="font-bold text-slate-700">TỔNG ĐƠN HÀNG</span><b className={`${amountClass} text-slate-950`}>{money(subtotal)}</b></div>
          <div className="flex items-baseline justify-between gap-5"><span className="font-bold text-slate-700">NỢ CŨ</span><b className={`${amountClass} text-slate-900`}>{money(bill.old_debt_snapshot)}</b></div>
          {pay.filter(p => p.method === "CONG_THEM" && p.amount > 0).map((p, i) => <div key={`extra-${i}`} className="flex items-start justify-between gap-4 border-b border-dashed border-slate-200 pb-2">
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-bold text-slate-700">CỘNG THÊM · {p.payment_date}</p>
              {p.reason?.trim() && <p className="mt-0.5 whitespace-pre-wrap break-words pl-3 text-[14px] font-normal italic leading-5 text-slate-600">{p.reason.trim()}</p>}
            </div>
            <b className={`${amountClass} shrink-0 text-slate-950`}>+{money(p.amount)}</b>
          </div>)}
          <div className="flex items-baseline justify-between gap-5 border-t border-slate-200 pt-3"><span className="font-extrabold text-blue-700">TỔNG NỢ</span><b className={`${amountClass} text-blue-700`}>{money(due)}</b></div>
          {pay.filter(p => p.amount > 0 && p.method !== "CONG_THEM").map((p, i) => <div key={i} className="flex items-start justify-between gap-4 border-b border-dashed border-slate-200 pb-2">
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-semibold text-slate-700">• {methods.find(m => m.code === p.method)?.name || p.method} · {p.payment_date}</p>
              {p.reason?.trim() && <p className="mt-0.5 whitespace-pre-wrap break-words pl-3 text-[14px] font-normal italic leading-5 text-slate-600">{p.reason.trim()}</p>}
            </div>
            <b className={`${amountClass} shrink-0 text-red-600`}>-{money(p.amount)}</b>
          </div>)}
          <div className="flex items-center justify-between gap-4 border-t-2 border-slate-800 pt-4"><span className="font-black text-slate-950">{remaining < 0 ? "KHÁCH DƯ TIỀN" : "CÒN LẠI PHẢI THU"}</span><b className={`${amountClass} text-blue-800`}>{money(Math.abs(remaining))}</b></div>
        </div>
      </div>

      {/* Anh cua MOI order_groups thuoc cac don da tick. Click anh de zoom. */}
      <div className="mt-6 space-y-3 border-t border-dashed border-slate-300 pt-5">
        <h3 className="text-sm font-black uppercase tracking-wide text-blue-800">Ảnh đính kèm từ đơn hàng</h3>
        {photoGroups.filter(p => p.urls.length > 0).map(p => <div key={p.group_id} className="rounded-xl border border-blue-100 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-extrabold text-slate-700">Đơn {p.root_code} · {p.urls.length} ảnh</p>
          <ImageViewer urls={p.urls} label={`Ảnh đơn ${p.root_code}`} />
        </div>)}
        {totalSourcePhotos === 0 && !mediaError && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">Không có ảnh tạo đơn</p>}
        {mediaError && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">Ảnh/ghi chú chưa tải đủ: {mediaError}</p>}
      </div>
      <footer className="mt-7 border-t border-slate-200 pt-4 text-center text-[14px] text-slate-500">AZALAS Sport · Bứt phá doanh số – Làm chủ đường đua!</footer>
    </div>

    {/* Ghi chu nghiep vu duoc hien thi DUOI hoa don, ben NGOAI vung ref={paper}.
        Khong dua ghi chu tao/soan vao anh chup gui khach. */}
    <section className="mx-auto w-full max-w-4xl rounded-2xl border border-blue-100 bg-white p-4 shadow-sm sm:p-6">
      {/* Ghi chu TU HAI NGUON: order_groups.creator_note va order_units.packing_note. */}
      <div className="space-y-3">
        <h3 className="text-[17px] font-extrabold uppercase tracking-wide text-blue-800">Ghi chú đơn hàng</h3>
        {groups.map(g => <div key={`create-${g.id}`} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="mb-1 text-[14px] font-extrabold uppercase tracking-wide text-amber-900">Ghi chú tạo đơn · {g.root_code}</p>
          <p className="whitespace-pre-wrap break-words text-[16px] font-medium leading-relaxed text-slate-900">{noteText(g.creator_note)}</p>
        </div>)}
        {units.map(u => <div key={`pack-${u.id}`} className="rounded-xl border border-blue-200 bg-blue-50 p-3">
          <p className="mb-1 text-[14px] font-extrabold uppercase tracking-wide text-blue-900">Ghi chú soạn hàng · {u.order_code}</p>
          <p className="whitespace-pre-wrap break-words text-[16px] font-medium leading-relaxed text-slate-900">{noteText(u.packing_note)}</p>
        </div>)}
        {groups.length === 0 && units.length === 0 && !mediaError && <p className="rounded-lg bg-slate-50 p-3 text-[16px] text-slate-600">Không có ghi chú</p>}
      </div>

    </section>

    {draft && <section className="panel stack">
      <h2>Thanh toán và điều chỉnh</h2>
      <p className="muted text-xs">Chỉ cấn trừ phiếu hàng trả đã duyệt và chưa sử dụng. Mỗi khi sửa tiền hoặc sản phẩm phải chụp lại ảnh.</p>
      {pay.map((p, i) => <div key={i} className="grid gap-2 rounded-xl border p-3 sm:grid-cols-5">
        <select className="field" value={p.method} onChange={e => { editPayment(i, "method", e.target.value); editPayment(i, "return_slip_id", ""); }}>
          {methods.map(m => <option key={m.code} value={m.code}>{m.name}</option>)}
        </select>
        <input type="date" className="field" value={p.payment_date} onChange={e => editPayment(i, "payment_date", e.target.value)} />
        {p.method === "HANG_TRA" ? <select className="field" value={p.return_slip_id || ""} onChange={e => {
          const id = Number(e.target.value), cr = credits.find(c => c.id === id);
          setPay(rows => rows.map((x, j) => i === j ? {
            ...x, return_slip_id: id || null,
            amount: cr ? cr.return_items.reduce((sum, item) => sum + Number(item.line_total), 0) : 0,
          } : x)); setDirty(true); invalidatePhoto();
        }}><option value="">Chọn phiếu</option>{credits.map(c => <option key={c.id} value={c.id}>{c.slip_code}</option>)}</select>
          : <input type="number" min="0" step="1" className="field" placeholder="Số tiền" value={p.amount || ""} onChange={e => editPayment(i, "amount", e.target.value)} />}
        <input className="field" placeholder="Ghi chú thanh toán / điều chỉnh (nếu có)" value={p.reason || ""} onChange={e => editPayment(i, "reason", e.target.value)} />
        <button className="btn danger" onClick={() => { setPay(rows => rows.filter((_, j) => j !== i)); setDirty(true); invalidatePhoto(); }}>Bỏ dòng</button>
      </div>)}
      {credits.length > 0 && <div className="rounded-xl border border-orange-200 bg-orange-50 p-3">
        <b className="text-orange-900">Phiếu hàng trả đã duyệt chưa cấn trừ</b>
        <p className="mt-1 text-xs text-orange-800">Chọn phiếu để đưa vào thanh toán, rồi lưu và chụp lại ảnh.</p>
        {credits.map(cr => <div key={cr.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white p-3">
          <b>{cr.slip_code} · {money(cr.return_items.reduce((sum, row) => sum + Number(row.line_total), 0))}</b>
          <button className="btn soft" disabled={pay.some(x => x.return_slip_id === cr.id)} onClick={() => {
            setPay(rows => [...rows, {
              method: "HANG_TRA", payment_date: vnToday(),
              amount: cr.return_items.reduce((s, x) => s + Number(x.line_total), 0),
              reason: cr.slip_code, return_slip_id: cr.id,
            }]); setDirty(true); invalidatePhoto();
          }}>+ Đưa vào hóa đơn</button>
        </div>)}
      </div>}
      <div className="flex flex-wrap gap-3">
        <button className="btn soft" onClick={addPay}>+ Thêm thanh toán</button>
        <button className="btn primary" disabled={busy || !dirty || editing} onClick={() => void savePayments()}>Lưu bảng thanh toán</button>
      </div>
    </section>}

    <section className="panel stack">
      <h2>Ảnh hóa đơn</h2>
      {imageUrl && <ImageViewer urls={[imageUrl]} label="Ảnh hóa đơn" />}
      {draft ? <>
        <p className="muted text-sm">Ảnh chụp gồm hóa đơn và ảnh đính kèm của các đơn được chọn. Ghi chú tạo/soạn chỉ hiện bên dưới để nhân viên xem, không đưa vào ảnh gửi khách. Chỉ chốt khi ảnh đã lưu thành công.</p>
        <div className="flex flex-wrap gap-3">
          <button disabled={busy || editing || lineDirty || !!mediaError} onClick={() => void capture()} className="btn primary">{busy ? "Đang chụp và lưu..." : "📷 Chụp, lưu ảnh và sao chép gửi Zalo"}</button>
          {photoPath && !dirty && !editing && !lineDirty && <>
            <button className="btn soft" onClick={() => void copyImage()}>Sao chép lại (nếu cần)</button>
            <button className="btn success" disabled={busy || !!mediaError} onClick={() => void finalize()}>✓ XÁC NHẬN CHỐT HÓA ĐƠN</button>
          </>}
        </div>
      </> : <button disabled={!imageUrl} className="btn soft" onClick={() => void copyImage()}>Sao chép ảnh gửi Zalo</button>}
    </section>
  </div>;
}
