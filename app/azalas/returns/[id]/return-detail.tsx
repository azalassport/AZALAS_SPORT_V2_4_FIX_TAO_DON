"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { mediaUrl } from "@/lib/azalas/media-client";
import { ImageViewer, Loading, Msg } from "@/components/ui";
import { dt, day, errorText, money } from "@/lib/azalas/format";

type Slip = {
  id: number; slip_code: string; customer_id: number; customer_name: string;
  status: string; reason: string | null; created_at: string; created_by_name: string;
  approved_at: string | null; applied_invoice_id: number | null;
  requested_invoice_id: number | null; reserved_invoice_id: number | null;
  settlement_mode: string | null; direct_receipt_code: string | null;
  direct_image_path: string | null;
};
type Item = {
  id: number; product_name: string; quantity: number; unit_price: number;
  line_total: number; item_condition: string | null;
};
type DirectPreview = {
  slip_id: number; return_code: string; receipt_code: string;
  customer_name: string; old_balance: number; return_total: number;
  new_balance: number; prepared_at: string;
};

export default function ReturnDetail({ slipId }: { slipId: number }) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const receiptRef = useRef<HTMLDivElement>(null);
  const autoOpened = useRef(false);
  const [slip, setSlip] = useState<Slip | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [role, setRole] = useState("");
  const [preview, setPreview] = useState<DirectPreview | null>(null);
  const [photoPath, setPhotoPath] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [photoBlob, setPhotoBlob] = useState<Blob | null>(null);
  const [savedUrl, setSavedUrl] = useState("");
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");
    const [{ data, error }, { data: { user } }] = await Promise.all([
      sb.rpc("az_return_detail", { p_slip_id: slipId }), sb.auth.getUser(),
    ]);
    if (error || !data) {
      setSlip(null);
      setErr(error?.message || "Không tìm thấy phiếu hàng trả");
      setLoading(false);
      return;
    }
    const record = data as { slip: Slip; items: Item[] };
    setSlip(record.slip);
    setItems(record.items || []);
    let canSeeFinancialImage = false;
    if (user) {
      const { data: profile } = await sb.from("az_profiles")
        .select("role").eq("id", user.id).single();
      setRole(profile?.role || "");
      canSeeFinancialImage = profile?.role === "OWNER" || profile?.role === "ADMIN";
    }
    if (record.slip.direct_image_path && canSeeFinancialImage) {
      try {setSavedUrl(await mediaUrl(sb,"az-invoice-images",record.slip.direct_image_path,3600));}
      catch(e){setErr("Không mở được ảnh phiếu: "+(e instanceof Error?e.message:String(e)));setSavedUrl("");}
    } else setSavedUrl("");
    setLoading(false);
  }, [sb, slipId]);

  useEffect(() => { void load(); }, [load]);
  const manager = role === "OWNER" || role === "ADMIN";

  useEffect(() => {
    if (loading || !manager || !slip || autoOpened.current ||
      new URLSearchParams(window.location.search).get("mode") !== "direct") return;
    autoOpened.current = true;
    if (slip.status === "CHUA_DUYET" && !slip.settlement_mode &&
      !slip.reserved_invoice_id && !slip.applied_invoice_id) void openPreview();
  }, [loading, manager, slip]);

  async function openPreview() {
    if (busy) return;
    setBusy(true); setErr(""); setOk("");
    // Mỗi lần mở lại phải chụp lại: nợ cũ có thể đã thay đổi.
    setPhotoPath(""); setPhotoBlob(null);
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhotoUrl("");
    const { data, error } = await sb.rpc("az_return_direct_preview", { p_slip_id: slipId });
    setBusy(false);
    if (error || !data) return setErr(error?.message || "Không lấy được nợ cũ");
    setPreview(data as DirectPreview);
    setTimeout(() => receiptRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  async function capture() {
    if (!preview || !receiptRef.current || busy) return;
    setBusy(true); setErr(""); setOk("");
    setPhotoPath("");
    try {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) throw new Error("Phiên đăng nhập đã hết");
      const html2canvas = (await import("html2canvas")).default;
      const canvas = await html2canvas(receiptRef.current, {
        backgroundColor: "#ffffff", scale: 2, useCORS: true, logging: false,
      });
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(
        b => b ? resolve(b) : reject(new Error("Không tạo được ảnh PNG")), "image/png",
      ));
      // De tai khoan va cong no an toan, giu Storage cho den khi RPC R2 duoc xac thuc day du.
      const path = `${user.id}/returns/${slipId}/${crypto.randomUUID()}.png`;
      const {error: uploadError} = await sb.storage.from("az-invoice-images")
        .upload(path,blob,{contentType:"image/png",upsert:false});
      if(uploadError)throw uploadError;
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      setPhotoUrl(URL.createObjectURL(blob));
      setPhotoBlob(blob);
      setPhotoPath(path);
      setOk("Đã CHỤP và LƯU ảnh phiếu trả thành công. Có thể xác nhận chốt phiếu.");
    } catch (e) { setErr(errorText(e)); }
    finally { setBusy(false); }
  }

  async function copyPhoto() {
    if (!photoBlob) return;
    try {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined")
        throw new Error("Trình duyệt chưa cho phép sao chép ảnh; ảnh đã lưu vẫn an toàn.");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": photoBlob })]);
      setOk("Đã sao chép ảnh. Bạn có thể Ctrl + V vào Zalo.");
    } catch (e) { setErr(errorText(e)); }
  }

  async function finalizeDirect() {
    if (!preview || !photoPath || busy) return;
    setBusy(true); setErr(""); setOk("");
    const { error } = await sb.rpc("az_return_finalize_direct", {
      p_slip_id: slipId, p_image_path: photoPath,
    });
    setBusy(false);
    if (error) {
      setPhotoPath("");
      setErr(error.message + " Nếu nợ cũ thay đổi, bấm Xem lại phiếu rồi chụp lại ảnh.");
      return;
    }
    router.push("/azalas/returns?tab=CHUA_DUYET");
    router.refresh();
  }

  async function remove() {
    if (!slip || busy || !window.confirm("Xóa mềm phiếu hàng trả chưa duyệt?")) return;
    setBusy(true); setErr("");
    const { error } = await sb.rpc("az_delete_return", { p_slip_id: slipId });
    setBusy(false);
    if (error) setErr(error.message);
    else router.push("/azalas/returns?tab=CHUA_DUYET");
  }

  if (loading) return <Loading />;
  if (!slip) return <Msg error={err || "Không tìm thấy phiếu"} />;
  const total = items.reduce((sum, item) => sum + Number(item.line_total), 0);
  const available = slip.status === "CHUA_DUYET" && !slip.settlement_mode &&
    !slip.requested_invoice_id && !slip.reserved_invoice_id && !slip.applied_invoice_id;

  return <div className="stack">
    <Msg error={err} success={ok} />
    <section className="panel stack">
      <header className="text-center">
        <div className="eyebrow text-red-700">PHIẾU HÀNG TRẢ · CHỨNG TỪ GỐC</div>
        <h2 className="text-2xl font-extrabold">{slip.slip_code}</h2>
        <p className="muted mt-2 text-sm">{slip.status} · {dt(slip.created_at)}</p>
      </header>
      <div className="grid gap-3 text-sm sm:grid-cols-2">
        <p><b>Khách:</b> {slip.customer_name}</p>
        <p><b>Người tạo:</b> {slip.created_by_name || "—"}</p>
        <p className="sm:col-span-2"><b>Lý do:</b> {slip.reason || "Không có lý do"}</p>
      </div>
      <div className="az-table-wrap"><table className="az-table">
        <thead><tr><th>STT</th><th>Sản phẩm</th><th>SL</th><th>Giá</th><th>Thành tiền</th></tr></thead>
        <tbody>{items.map((item, index) => <tr key={item.id}>
          <td>{index + 1}</td>
          <td><b>{item.product_name}</b>{item.item_condition && <p className="muted text-xs">{item.item_condition}</p>}</td>
          <td>{item.quantity}</td><td>{money(item.unit_price)}</td>
          <td className="font-semibold">{money(item.line_total)}</td>
        </tr>)}</tbody>
      </table></div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xl font-extrabold">
        <span>Tổng hàng trả</span><span className="text-red-700">{money(total)}</span>
      </div>

      {slip.settlement_mode === "DIRECT" && <div className="rounded-xl border border-green-200 bg-green-50 p-4 font-semibold text-green-900">
        ✓ Đã chốt phiếu và trừ công nợ trực tiếp. Phiếu không được trừ lần nữa trong hóa đơn.
        {slip.direct_receipt_code && <p className="mt-1">Mã phiếu chốt: {slip.direct_receipt_code}</p>}
        {savedUrl && <div className="mt-3"><ImageViewer urls={[savedUrl]} label="Ảnh phiếu hàng trả" /></div>}
        {!savedUrl && <p className="mt-2 text-sm">Phiếu chốt theo phiên bản cũ có thể chưa có ảnh chứng từ.</p>}
      </div>}
      {slip.applied_invoice_id && <Link className="btn soft w-fit" href={`/azalas/invoices/${slip.applied_invoice_id}`}>
        Đã cấn trừ tại hóa đơn #{slip.applied_invoice_id} →
      </Link>}
      {slip.reserved_invoice_id && !slip.applied_invoice_id && <p className="rounded-xl bg-blue-50 p-3 text-sm font-semibold text-blue-900">
        Phiếu đã được chọn trong hóa đơn #{slip.reserved_invoice_id}. Chỉ khi chốt hóa đơn mới chuyển sang Đã duyệt và trừ nợ.
      </p>}
      {slip.settlement_mode === "LEGACY" && !slip.applied_invoice_id && <p className="rounded-xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">
        Phiếu cũ đã duyệt nhưng chưa có dấu cấn trừ. Cần kiểm tra trước khi xử lý tiếp.
      </p>}
      {available && manager && !preview && <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <h3 className="font-extrabold text-blue-950">Chọn cách xử lý phiếu</h3>
        <button className="btn success" disabled={busy} onClick={() => void openPreview()}>
          ✓ Duyệt &amp; trừ nợ — Mở phiếu để chụp và chốt
        </button>
        <p className="text-sm text-slate-700">Hoặc mở hóa đơn CHƯA CHỐT của đúng khách để chọn phiếu này. Không cần gửi đề nghị.</p>
        <button className="btn danger" disabled={busy} onClick={() => void remove()}>Xóa mềm phiếu</button>
      </div>}
      {available && !manager && <p className="rounded-lg bg-slate-50 p-3 text-sm">Phiếu đang chờ quản lý duyệt; người lập hóa đơn có thể chọn trực tiếp trong hóa đơn cùng khách.</p>}
    </section>

    {preview && available && manager && <section className="panel stack">
      <div ref={receiptRef} className="mx-auto w-full max-w-4xl space-y-5 rounded-2xl border border-slate-200 border-t-[7px] border-t-blue-700 bg-white p-5 text-[16px] leading-relaxed text-slate-950 shadow-sm sm:p-8">
        <header className="space-y-2 border-b-2 border-slate-800 pb-5 text-center">
          <div className="text-[15px] font-extrabold tracking-[.15em] text-blue-700">AZALAS SPORT</div>
          <h2 className="text-[28px] font-black sm:text-[34px]">PHIẾU HÀNG TRẢ</h2>
          <p className="break-all text-[17px] font-bold text-blue-800">{preview.receipt_code}</p>
        </header>
        <div className="flex flex-wrap items-start justify-between gap-2 text-[17px]">
          <p><b>Khách:</b> {preview.customer_name}</p>
          <p><b>Ngày:</b> {day(preview.prepared_at)}</p>
          <p className="w-full text-[14px] text-slate-600">Phiếu hàng trả gốc: {preview.return_code}</p>
        </div>
        <div className="overflow-hidden rounded-xl border border-blue-200">
          <table className="w-full border-collapse text-[16px]">
            <thead className="bg-blue-50 text-blue-950"><tr>
              <th className="p-3 text-left">Nội dung trả</th>
              <th className="p-3 text-center">SL</th>
              <th className="p-3 text-right">Giá</th>
              <th className="p-3 text-right">Thành tiền</th>
            </tr></thead>
            <tbody>{items.map(item => <tr key={item.id} className="border-t border-slate-200">
              <td className="p-3"><b>{item.product_name}</b>{item.item_condition && <p className="text-[13px] text-slate-500">{item.item_condition}</p>}</td>
              <td className="p-3 text-center">{item.quantity}</td>
              <td className="whitespace-nowrap p-3 text-right">{money(item.unit_price)}</td>
              <td className="whitespace-nowrap p-3 text-right font-bold">{money(item.line_total)}</td>
            </tr>)}</tbody>
          </table>
        </div>
        {slip.reason && <p className="whitespace-pre-wrap text-[14px] text-slate-700"><b>Lý do trả:</b> {slip.reason}</p>}
        <div className="space-y-4 border-t border-slate-300 pt-5">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(150px,auto)] items-center gap-3">
            <span>Nợ cũ</span><strong className="whitespace-nowrap text-right text-[20px] font-extrabold tabular-nums">{money(preview.old_balance)}</strong>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(150px,auto)] items-center gap-3">
            <span>Tổng hàng trả</span><strong className="whitespace-nowrap text-right text-[20px] font-extrabold tabular-nums text-red-700">−{money(preview.return_total)}</strong>
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(150px,auto)] items-center gap-3 border-t border-slate-200 pt-4">
            <span className="font-extrabold">{preview.new_balance < 0 ? "Khách còn dư" : "Nợ còn lại"}</span>
            <strong className="whitespace-nowrap text-right text-[20px] font-extrabold tabular-nums text-green-700">{money(preview.new_balance < 0 ? -preview.new_balance : preview.new_balance)}</strong>
          </div>
        </div>
        <footer className="border-t border-slate-200 pt-4 text-center text-[13px] text-slate-500">AZALAS Sport · Bứt phá doanh số – Làm chủ đường đua!</footer>
      </div>
      <div className="flex flex-wrap gap-3">
        <button className="btn soft" disabled={busy} onClick={() => void openPreview()}>↻ Xem lại nợ cũ / làm mới phiếu</button>
        <button className="btn primary" disabled={busy} onClick={() => void capture()}>
          {busy ? "Đang xử lý..." : "📷 Chụp & lưu ảnh phiếu trả"}
        </button>
      </div>
      {photoPath && photoUrl && <div className="space-y-3 rounded-xl border border-green-200 bg-green-50 p-4">
        <p className="font-bold text-green-900">✓ Ảnh phiếu trả đã lưu trên Supabase Storage</p>
        <ImageViewer urls={[photoUrl]} label="Ảnh phiếu trả đã lưu" />
        <div className="flex flex-wrap gap-3">
          <button className="btn soft" onClick={() => void copyPhoto()}>Sao chép ảnh gửi Zalo</button>
          <button className="btn success" disabled={busy} onClick={() => void finalizeDirect()}>
            {busy ? "Đang chốt..." : "✓ XÁC NHẬN CHỐT PHIẾU TRẢ"}
          </button>
        </div>
      </div>}
    </section>}
  </div>;
}
