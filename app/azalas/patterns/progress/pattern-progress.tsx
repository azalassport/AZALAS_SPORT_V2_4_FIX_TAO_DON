"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { ImageViewer, Loading, Msg, Tabs } from "@/components/ui";
import { day, dt, norm } from "@/lib/azalas/format";

type Job = {
  id: number; job_code: string | null; order_type: "THUONG" | "KHACH_DAT";
  pattern_code: string; product_name: string; brand: string | null; planned_qty: number;
  received_qty: number; status: string; cut_date: string | null; delivery_date: string | null;
  house_name: string | null; created_at: string; customer_name: string | null;
  entry_slip_id?: number | null; pattern_id?: number | null; sewing_house_id?: number | null;
  size_range?: string | null; size_ratio?: string | null; layer_count?: number | null;
  cutter_id?: number | null;
  sewing_price?: number | null; forced_closed_at?: string | null; paid_at?: string | null;
  paid_amount?: number | null; payment_method?: string | null; expected_warehouse_id?: number | null;
};
type JobExtra = Pick<Job, "id" | "entry_slip_id" | "pattern_id" | "sewing_house_id" |
  "size_range" | "size_ratio" | "layer_count" | "cutter_id" | "sewing_price" | "forced_closed_at" |
  "paid_at" | "paid_amount" | "payment_method" | "expected_warehouse_id">;
type Slip = { id: number; slip_code: string; mam_code: string; fabric_id: number | null;
  expected_warehouse_id: number | null; preview_image_path: string; image_paths: string[]; color_mode: string };
type SizePlan = { id: number; job_id: number; color: string; size: string; layers: number; ratio: number; planned_qty: number };
type Receipt = { id: number; job_id: number; qty: number; received_at: string; note: string | null; received_by: string; receipt_kind?: "NORMAL" | "VET" };
type Event = { id: number; job_id: number; action: string; detail: unknown; occurred_at: string; actor_id: string };
type Photo = { id: number; job_id: number; storage_path: string };
type Partner = { id: number; name: string };
type Pattern = { id: number; code: string; product_name: string };
type Profile = { id: string; display_name: string };
type Mam = { key: string; slip: Slip | null; jobs: Job[] };
type VetStatus = {
  job_id: number; vet_received_qty: number; effective_received_qty: number;
  main_settled_qty: number; vet_settled_qty: number; accounted_qty: number;
  unaccounted_vet_qty: number; missing_qty: number; has_main: boolean; has_unpaid: boolean;
};
type Stage = "ALL" | "OPEN" | "READY" | "VET" | "PAID";
type MamLayerEdit = { layers: string; oldLayers: number; ratioTotal: number; oldPlanned: number; sameRatio: boolean };
type EditState = { mam: Mam; houseId: string; patternId: string; productName: string;
  price: string; originalHouseId: string; originalPatternId: string; originalProductName: string;
  originalPrice: string; layerEdit: MamLayerEdit };
type ReceiveState = { mam: Mam; quantity: string; note: string };
type MamActionState = { kind: "FORCE_CLOSE" | "DELETE"; mam: Mam; reason: string };
const field = "field w-full";
const label = "block text-sm font-bold text-slate-700";
const num = (value: number) => Number(value || 0).toLocaleString("vi-VN");
const cash = (value: number) => `${Number(value || 0).toLocaleString("vi-VN",{maximumFractionDigits:2})} đ`;
const ratioTotal = (value: string | null | undefined) => String(value || "").replace(/\D/g, "").split("").reduce((sum, x) => sum + Number(x || 0), 0);
const asRecord = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const layerFormula = (layers: number | null, ratio: number, planned: number) => `${layers ?? "—"}×${ratio || "—"}=${num(planned)}`;
const canReceiveNormalJob = (j: Job) => !j.paid_at && !j.forced_closed_at &&
  j.status !== "DA_CHOT" && j.received_qty < j.planned_qty;
const stageText: Record<Stage, string> = {
  ALL: "Tất cả", OPEN: "🚀 ĐANG CẮT / CHƯA ĐỦ",
  READY: "🟡 ĐÃ GIAO ĐỦ HOẶC ĐƯỢC ÉP CHỐT - CHƯA TT",
  VET: "🟠 ĐÃ CHỐT - CÒN HÀNG VÉT",
  PAID: "✅ ĐÃ XONG & ĐÃ TT",
};

export default function PatternProgress() {
  const sb = useMemo(() => createClient(), []);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [role, setRole] = useState("");
  const [slips, setSlips] = useState<Record<number, Slip>>({});
  const [sizePlans, setSizePlans] = useState<SizePlan[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [houses, setHouses] = useState<Partner[]>([]);
  const [cutters, setCutters] = useState<Partner[]>([]);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [fabrics, setFabrics] = useState<Partner[]>([]);
  const [warehouses, setWarehouses] = useState<Partner[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [vetStatus, setVetStatus] = useState<Record<number, VetStatus>>({});
  const [houseFilter, setHouseFilter] = useState("ALL");
  const [stage, setStage] = useState<Stage>("ALL");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [planKey, setPlanKey] = useState<number | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [receiveState, setReceiveState] = useState<ReceiveState | null>(null);
  const [mamAction, setMamAction] = useState<MamActionState | null>(null);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const { data: { user }, error: authError } = await sb.auth.getUser();
      if (authError || !user) throw new Error("Hết phiên đăng nhập. Vui lòng đăng nhập lại.");
      const [profileResult, progressResult] = await Promise.all([
        sb.from("az_profiles").select("role").eq("id", user.id).single(),
        sb.rpc("az_pattern_progress"),
      ]);
      if (profileResult.error || progressResult.error)
        throw new Error(profileResult.error?.message || progressResult.error?.message);
      const userRole = String(profileResult.data?.role || "");
      const manager = userRole === "OWNER" || userRole === "ADMIN";
      const basic = (progressResult.data || []) as Job[];
      const ids = basic.map(j => j.id);
      setRole(userRole);
      if (ids.length === 0) {
        setJobs([]); setSlips({}); setSizePlans([]); setReceipts([]);
        setEvents([]); setPhotos([]); setSignedUrls({}); setVetStatus({});
        setLoading(false); return;
      }
      const photoResult = await sb.from("pattern_job_images")
        .select("id,job_id,storage_path").in("job_id", ids).limit(2000);
      if (photoResult.error) throw new Error("Ảnh rập: " + photoResult.error.message);
      const loadedPhotos = (photoResult.data || []) as Photo[];
      setPhotos(loadedPhotos);
      if (!manager) {
        setJobs(basic); setSlips({}); setSizePlans([]); setReceipts([]);
        setEvents([]); setProfiles({}); setVetStatus({});
        const paths = [...new Set(loadedPhotos.map(photo => photo.storage_path))];
        const signResult = paths.length ? await sb.storage.from("az-pattern-images")
          .createSignedUrls(paths, 3600) : { data: [], error: null };
        if (signResult.error) throw new Error("Ảnh rập: " + signResult.error.message);
        setSignedUrls(Object.fromEntries(paths.map((p, i) => [p, signResult.data?.[i]?.signedUrl || ""])));
        return;
      }
      const [jobResult, planResult, receiptResult, eventResult, housesResult, cuttersResult, patternsResult,
        fabricsResult, warehouseResult, vetStatusResult] = await Promise.all([
        sb.from("pattern_jobs").select("id,entry_slip_id,pattern_id,sewing_house_id,cutter_id,size_range,size_ratio,layer_count,sewing_price,forced_closed_at,paid_at,paid_amount,payment_method,expected_warehouse_id")
          .in("id", ids).limit(500),
        sb.from("pattern_job_size_plans").select("id,job_id,color,size,layers,ratio,planned_qty")
          .in("job_id", ids).order("id").limit(4000),
        sb.from("pattern_receipts").select("id,job_id,qty,received_at,note,received_by,receipt_kind")
          .in("job_id", ids).order("received_at", { ascending: false }).limit(4000),
        sb.from("pattern_events").select("id,job_id,action,detail,occurred_at,actor_id")
          .in("job_id", ids).order("occurred_at", { ascending: false }).limit(2000),
        sb.from("sewing_houses").select("id,name").eq("is_active", true).order("name"),
        sb.from("cutters").select("id,name").eq("is_active", true).order("name"),
        sb.from("pattern_catalog").select("id,code,product_name").order("code").limit(2000),
        sb.from("pattern_fabrics").select("id,name").order("name"),
        sb.from("az_warehouses").select("id,name").order("name"),
        sb.rpc("az_house_vet_status", { p_job_ids: ids }),
      ]);
      const results = [jobResult, planResult, receiptResult, eventResult,
        housesResult, cuttersResult, patternsResult, fabricsResult, warehouseResult, vetStatusResult];
      const firstError = results.find(result => result.error)?.error;
      if (firstError) throw new Error("Không tải được chi tiết Tiến độ: " + firstError.message + ". Kiểm tra đã chạy SQL 13, 15, 17 và SQL 23 hàng vét.");
      const extras = (jobResult.data || []) as JobExtra[];
      const byId = new Map(extras.map(job => [job.id, job]));
      const enriched = basic.map(job => ({ ...job, ...(byId.get(job.id) || {}) }));
      const slipIds = [...new Set(extras.map(job => job.entry_slip_id).filter((id): id is number => id != null))];
      let loadedSlips: Slip[] = [];
      if (slipIds.length) {
        const slipsResult = await sb.from("pattern_entry_slips")
          .select("id,slip_code,mam_code,fabric_id,expected_warehouse_id,preview_image_path,image_paths,color_mode")
          .in("id", slipIds).limit(500);
        if (slipsResult.error) throw new Error("Phiếu PNR: " + slipsResult.error.message);
        loadedSlips = (slipsResult.data || []) as Slip[];
      }
      const loadedReceipts = (receiptResult.data || []) as Receipt[];
      const loadedEvents = (eventResult.data || []) as Event[];
      const actorIds = [...new Set([
        ...loadedReceipts.map(x => x.received_by), ...loadedEvents.map(x => x.actor_id),
      ].filter(Boolean))];
      let names: Profile[] = [];
      if (actorIds.length) {
        const nameResult = await sb.from("az_profiles").select("id,display_name")
          .in("id", actorIds).limit(2000);
        if (nameResult.error) throw new Error("Tên người nhập: " + nameResult.error.message);
        names = (nameResult.data || []) as Profile[];
      }
      const paths = [...new Set([
        ...loadedPhotos.map(x => x.storage_path),
        ...loadedSlips.flatMap(slip => [slip.preview_image_path, ...(slip.image_paths || [])]),
      ].filter(Boolean))];
      const signed = paths.length ? await sb.storage.from("az-pattern-images")
        .createSignedUrls(paths, 3600) : { data: [], error: null };
      if (signed.error) throw new Error("Ảnh rập: " + signed.error.message);
      setJobs(enriched);
      setSlips(Object.fromEntries(loadedSlips.map(slip => [slip.id, slip])));
      setSizePlans((planResult.data || []) as SizePlan[]);
      setReceipts(loadedReceipts);
      setEvents(loadedEvents);
      setHouses((housesResult.data || []) as Partner[]);
      setCutters((cuttersResult.data || []) as Partner[]);
      setPatterns((patternsResult.data || []) as Pattern[]);
      setFabrics((fabricsResult.data || []) as Partner[]);
      setWarehouses((warehouseResult.data || []) as Partner[]);
      setProfiles(Object.fromEntries(names.map(n => [n.id, n.display_name || "Chưa đặt tên"])));
      const loadedVet = (vetStatusResult.data || []) as VetStatus[];
      setVetStatus(Object.fromEntries(loadedVet.map(row => [row.job_id, row])));
      setSignedUrls(Object.fromEntries(paths.map((path, i) => [path, signed.data?.[i]?.signedUrl || ""])));
    } catch (err) {
      setVetStatus({});
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [sb]);
  useEffect(() => { void load(); }, [load]);

  const manager = role === "OWNER" || role === "ADMIN";
  const owner = role === "OWNER";
  const grouped = useMemo(() => {
    const map = new Map<string, Mam>();
    for (const job of jobs) {
      const slip = job.entry_slip_id != null ? slips[job.entry_slip_id] || null : null;
      const fromCode = job.job_code?.match(/^(MAM\d+)-\d+$/)?.[1] || null;
      const code = slip?.mam_code || fromCode;
      const key = code ? `mam:${code}` : `job:${job.id}`;
      let mam = map.get(key);
      if (!mam) { mam = { key, slip, jobs: [] }; map.set(key, mam); }
      if (!mam.slip && slip) mam.slip = slip;
      mam.jobs.push(job);
    }
    return [...map.values()].map(mam => ({ ...mam, jobs: mam.jobs.sort((a, b) =>
      (a.job_code || "").localeCompare(b.job_code || "", "vi")) }));
  }, [jobs, slips]);
  const effectiveReceived = (job: Job) => Number(vetStatus[job.id]?.effective_received_qty ?? job.received_qty);
  const jobAccounted = (job: Job) => Number(vetStatus[job.id]?.accounted_qty || 0);
  const mamHasMain = (mam: Mam) => mam.jobs.some(job => Boolean(vetStatus[job.id]?.has_main));
  const mamReceived = (mam: Mam) => mam.jobs.reduce((total, job) => total + effectiveReceived(job), 0);
  const mamPlanned = (mam: Mam) => mam.jobs.reduce((total, job) => total + Number(job.planned_qty || 0), 0);
  const mamMissing = (mam: Mam) => Math.max(0, mamPlanned(mam) - mamReceived(mam));
  const mamAccounted = (mam: Mam) => mam.jobs.reduce((total, job) => total + jobAccounted(job), 0);
  const mamUnaccounted = (mam: Mam) => Math.max(0, mamReceived(mam) - mamAccounted(mam));
  const mamHasUnpaid = (mam: Mam) => mam.jobs.some(job => Boolean(vetStatus[job.id]?.has_unpaid));
  const mamForced = (mam: Mam) => mam.jobs.some(job => Boolean(job.forced_closed_at) || job.status === "DA_CHOT");
  const mamStage = (mam: Mam): Stage => {
    const received = mamReceived(mam);
    const missing = mamMissing(mam);
    const hasMain = mamHasMain(mam);
    const unaccounted = mamUnaccounted(mam);
    if (hasMain && (missing > 0 || unaccounted > 0)) return "VET";
    if ((hasMain && missing === 0 && unaccounted === 0 && !mamHasUnpaid(mam)) || (!hasMain && mam.jobs.every(job => Boolean(job.paid_at)))) return "PAID";
    if (hasMain || (received > 0 && missing <= 20) || mamForced(mam)) return "READY";
    return "OPEN";
  };
  const canReceiveMamJob = (mam: Mam, job: Job) => {
    // Sau khi đã có bảng kê chính, hàng vét luôn được phép nhận thêm kể cả đã đủ hoặc đang dư kế hoạch.
    if (mamHasMain(mam)) return job.status !== "DA_XOA";
    // Trước khi có bảng kê chính, nút Nhận vẫn sáng dù mâm đã đủ 100% để có thể nhận dư.
    // Chỉ khóa khi mâm đã bị ép/chốt/xóa/thanh toán theo luồng cũ.
    return !job.paid_at && !job.forced_closed_at && job.status !== "DA_CHOT" && job.status !== "DA_XOA";
  };

  const houseNames = useMemo(() => [...new Set(jobs.map(j => j.house_name || "Chưa phân nhà may"))]
    .sort((a, b) => a.localeCompare(b, "vi")), [jobs]);
  const byHouse = grouped.filter(mam => houseFilter === "ALL" || mam.jobs.some(j =>
    (j.house_name || "Chưa phân nhà may") === houseFilter));
  const houseJobs = jobs.filter(j => houseFilter === "ALL" ||
    (j.house_name || "Chưa phân nhà may") === houseFilter);
  const houseQty = (type: Job["order_type"]) => houseJobs.filter(j => j.order_type === type)
    .reduce((acc, j) => acc + j.planned_qty, 0);
  const filtered = byHouse.filter(mam => stage === "ALL" || mamStage(mam) === stage)
    .filter(mam => norm([
      mam.slip?.mam_code || "", mam.slip?.slip_code || "",
      ...mam.jobs.flatMap(j => [j.job_code || "", j.pattern_code, j.product_name,
        j.brand || "", j.house_name || "", j.customer_name || "", String(j.planned_qty)]),
    ].join(" ")).includes(norm(search)));
  const visible = filtered.slice(0, showAll || search.trim() ? 100 : 10);

  function mamCode(mam: Mam) {
    return mam.slip?.mam_code || mam.jobs[0]?.job_code?.match(/^(MAM\d+)-\d+$/)?.[1] ||
      mam.jobs[0]?.job_code || `#${mam.jobs[0]?.id}`;
  }
  function images(mam: Mam) {
    const paths = [
      mam.slip?.preview_image_path || "",
      ...(mam.slip?.image_paths || []),
      ...photos.filter(p => mam.jobs.some(j => j.id === p.job_id)).map(p => p.storage_path),
    ];
    return [...new Set(paths)].map(path => signedUrls[path]).filter(Boolean);
  }
  function openEdit(mam: Mam) {
    const j = mam.jobs[0];
    const ratios = mam.jobs.map(job => ratioTotal(job.size_ratio));
    const commonRatio = ratios.length > 0 && ratios[0] > 0 && ratios.every(value => value === ratios[0]) ? ratios[0] : 0;
    const totalLayers = mam.jobs.reduce((sum, job) => sum + Number(job.layer_count || 0), 0);
    const totalPlanned = mam.jobs.reduce((sum, job) => sum + Number(job.planned_qty || 0), 0);
    setEdit({
      mam,
      houseId: String(j.sewing_house_id || ""),
      patternId: String(j.pattern_id || ""),
      productName: j.product_name,
      price: j.sewing_price == null ? "" : String(j.sewing_price),
      originalHouseId: String(j.sewing_house_id || ""),
      originalPatternId: String(j.pattern_id || ""),
      originalProductName: j.product_name,
      originalPrice: j.sewing_price == null ? "" : String(j.sewing_price),
      layerEdit: {
        layers: totalLayers > 0 ? String(totalLayers) : "",
        oldLayers: totalLayers,
        ratioTotal: commonRatio,
        oldPlanned: totalPlanned,
        sameRatio: commonRatio > 0,
      },
    });
    setError("");
  }
  async function mutate(fn: string, args: Record<string, unknown>, message: string) {
    setError(""); setOk(""); setBusy(true);
    try {
      const { error: rpcError } = await sb.rpc(fn, args);
      if (rpcError) throw rpcError;
      setEdit(null); setReceiveState(null); setMamAction(null); setHistoryKey(null);
      await load();
      setOk(message);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  function openReceive(mam: Mam) {
    if (role !== "OWNER" && role !== "ADMIN") return;
    if (!mam.jobs.some(job => canReceiveMamJob(mam, job)))
      return setError("Mâm này không còn hàng thiếu để nhận thêm.");
    setError("");
    setReceiveState({ mam, quantity: "", note: "" });
  }
  async function submitReceive() {
    if (!receiveState || busy) return;
    const value = receiveState.quantity.trim();
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
      return setError("Số lượng nhận phải là số nguyên dương.");

    const qty = Number(value);
    const mam = receiveState.mam;
    // Cả Nhận thường và Nhận hàng vét đều cho phép nhận dư kế hoạch.
    // Trước bảng kê chính, phần dư sẽ được tính luôn vào bảng kê chính sau này.

    setError(""); setOk(""); setBusy(true);
    try {
      if (mamHasMain(mam)) {
        const { error: rpcError } = await sb.rpc("az_pattern_mam_receive_vet", {
          p_job_id: mam.jobs[0].id, p_qty: qty, p_note: receiveState.note.trim() || null,
        });
        if (rpcError) throw rpcError;
      } else {
        // Nhận thường theo TOÀN MÂM. RPC mới sẽ lấp phần thiếu trước, phần dư neo vào mâm,
        // nên 999/1000 nhập 5 -> 1004/1000 và 1000/1000 vẫn nhập thêm được.
        const { error: rpcError } = await sb.rpc("az_pattern_mam_receive_open", {
          p_job_id: mam.jobs[0].id, p_qty: qty, p_note: receiveState.note.trim() || null,
        });
        if (rpcError) throw rpcError;
      }
      setReceiveState(null); setHistoryKey(null);
      await load();
      setOk(mamHasMain(mam)
        ? `Đã nhận vét ${num(qty)} chiếc cho toàn mâm. Phần này chưa tính tiền cho nhà may cho đến khi chốt bảng kê vét.`
        : `Đã nhận ${num(qty)} chiếc cho toàn mâm và ghi lịch sử. Chưa nhập tồn kho.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await load();
    } finally { setBusy(false); }
  }
  function forceClose(mam: Mam) {
    setError("");
    setMamAction({ kind: "FORCE_CLOSE", mam, reason: "" });
  }
  function deleteMam(mam: Mam) {
    setError("");
    setMamAction({ kind: "DELETE", mam, reason: "" });
  }
  async function submitMamAction() {
    if (!mamAction || busy) return;
    const reason = mamAction.reason.trim();
    if (reason.length < 3)
      return setError(mamAction.kind === "FORCE_CLOSE"
        ? "Lý do ép chốt cần ít nhất 3 ký tự."
        : "Lý do xóa cần ít nhất 3 ký tự.");

    if (mamAction.kind === "FORCE_CLOSE") {
      await mutate("az_pattern_mam_force_close", {
        p_job_id: mamAction.mam.jobs[0].id, p_reason: reason,
      }, "Đã ép chốt mâm. Chưa thanh toán.");
    } else {
      await mutate("az_pattern_mam_delete", {
        p_job_id: mamAction.mam.jobs[0].id, p_reason: reason,
      }, "Đã xóa mềm toàn bộ mâm, giữ nguyên ảnh và nhật ký.");
    }
  }
  async function saveEdit() {
    if (!edit || busy) return;
    const price = edit.price.trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(price) || Number(price) <= 0)
      return setError("Đơn giá nhà may phải lớn hơn 0.");
    if (!edit.houseId || !edit.patternId || !edit.productName.trim())
      return setError("Chọn nhà may, mã rập và nhập tên sản phẩm.");
    const totalLayersText = edit.layerEdit.layers.trim();
    const layerChanged = Number(totalLayersText) !== Number(edit.layerEdit.oldLayers);
    if (layerChanged && (!edit.layerEdit.sameRatio || edit.layerEdit.ratioTotal <= 0))
      return setError("Các mẫu trong mâm đang có tổng tỉ lệ size khác nhau nên chưa thể gộp thành một công thức số lớp chung.");
    if (layerChanged && (!/^[1-9]\d{0,5}$/.test(totalLayersText) || Number(totalLayersText) < edit.mam.jobs.length))
      return setError(`Tổng số lớp mới phải là số nguyên và tối thiểu ${edit.mam.jobs.length} lớp để phân bổ cho ${edit.mam.jobs.length} mẫu.`);

    const metadataChanged = edit.houseId !== edit.originalHouseId ||
      edit.patternId !== edit.originalPatternId || edit.productName.trim() !== edit.originalProductName.trim() ||
      price !== edit.originalPrice;
    if (!metadataChanged && !layerChanged) return setEdit(null);

    setError(""); setOk(""); setBusy(true);
    try {
      if (metadataChanged) {
        const { error: metaError } = await sb.rpc("az_pattern_mam_edit", {
          p_job_id: edit.mam.jobs[0].id,
          p_data: { house_id: Number(edit.houseId), pattern_id: Number(edit.patternId),
            product_name: edit.productName.trim(), sewing_price: price },
        });
        if (metaError) throw metaError;
      }
      if (layerChanged) {
        const { error: layerError } = await sb.rpc("az_pattern_mam_adjust_total_layers", {
          p_job_id: edit.mam.jobs[0].id,
          p_total_layers: Number(totalLayersText),
        });
        if (layerError) throw layerError;
      }
      setEdit(null); setHistoryKey(null);
      await load();
      setOk("Đã sửa thông tin mâm và lưu lịch sử người sửa / ngày giờ / số cũ / số mới.");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      await load();
    } finally { setBusy(false); }
  }

  return <div className="stack">
    <Msg error={error} success={ok} />
    <div className="grid gap-3 md:grid-cols-2">
      <div className="kpi"><span className="muted text-sm">Số lượng HÀNG NHÀ {houseFilter !== "ALL" ? `· ${houseFilter}` : "· tất cả nhà may"}</span>
        <strong>{num(houseQty("THUONG"))} chiếc</strong><span className="text-xs text-slate-600">Kế hoạch · {houseJobs.filter(j => j.order_type === "THUONG").length} mẫu</span></div>
      <div className="kpi"><span className="muted text-sm">Số lượng HÀNG KHÁCH ĐẶT {houseFilter !== "ALL" ? `· ${houseFilter}` : "· tất cả nhà may"}</span>
        <strong>{num(houseQty("KHACH_DAT"))} chiếc</strong><span className="text-xs text-slate-600">Kế hoạch · {houseJobs.filter(j => j.order_type === "KHACH_DAT").length} mẫu</span></div>
    </div>
    <div className="grid gap-2 sm:grid-cols-2">
      <select className={field} value={houseFilter} onChange={e => { setHouseFilter(e.target.value); setShowAll(false); }}>
        <option value="ALL">Tất cả nhà may</option>
        {houseNames.map(name => <option value={name} key={name}>{name}</option>)}
      </select>
      <input className={field} value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Tìm MAM / PNR / mã rập / sản phẩm / hiệu / khách..." />
    </div>
    {manager && <Tabs value={stage} onChange={value => { setStage(value as Stage); setShowAll(false); }}
      items={(["ALL", "OPEN", "READY", "VET", "PAID"] as Stage[]).map(value => ({ value,
        label: stageText[value], count: value === "ALL" ? byHouse.length :
          byHouse.filter(mam => mamStage(mam) === value).length }))} />}
    {loading && <Loading />}
    {!loading && <div className="stack">
      {visible.map(mam => {
        const first = mam.jobs[0];
        const code = mamCode(mam);
        const total = mam.jobs.reduce((n, j) => n + j.planned_qty, 0);
        const received = mamReceived(mam);
        const brands = [...new Set(mam.jobs.map(j => j.brand?.trim()).filter(Boolean))].join(" | ");
        const codes = [...new Set(mam.jobs.map(j => j.pattern_code))].join(" | ");
        const productNames = [...new Set(mam.jobs.map(j => j.product_name))].join(" / ");
        const names = [...new Set(mam.jobs.map(j => j.house_name || "Chưa phân nhà may"))].join(" | ");
        const fabric = mam.slip?.fabric_id != null ? fabrics.find(f => f.id === mam.slip?.fabric_id)?.name : null;
        const warehouseId = mam.slip?.expected_warehouse_id ?? first.expected_warehouse_id;
        const warehouse = warehouses.find(w => w.id === warehouseId)?.name;
        const status = mamStage(mam);
        const ready = status !== "OPEN";
        const paidSum = mam.jobs.reduce((n, j) => n + Number(j.paid_amount || 0), 0);
        const overDue = mam.jobs.some(j => j.delivery_date && effectiveReceived(j) < j.planned_qty &&
          new Date(`${j.delivery_date}T23:59:59+07:00`).getTime() < Date.now());
        const forced = mamForced(mam);
        const hasMain = mamHasMain(mam);
        const accounted = mamAccounted(mam);
        const vetWaiting = Math.max(0, received - accounted);
        const validEdit = manager && !hasMain && !mam.jobs.some(j => j.paid_at || j.forced_closed_at || j.status === "DA_CHOT");
        const history = receipts.filter(r => mam.jobs.some(j => j.id === r.job_id));
        const notes = events.filter(e => mam.jobs.some(j => j.id === e.job_id) &&
          ["SUA_TT_MAM", "EP_CHOT", "XOA_MAM", "XAC_NHAN_DA_TT", "NHAN_HANG_VET_MAM", "CHOT_TIEN_VET"].includes(e.action));
        return <article className="panel stack" key={mam.key}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-xl font-black text-blue-800">{codes} <span className="text-slate-800">({productNames}{brands ? ` ${brands}` : ""})</span></p>
              <p className="mt-1 text-sm font-bold text-slate-600">Mâm: {code}{mam.slip ? ` · Phiếu ${mam.slip.slip_code}` : ""} · {mam.jobs.length} mẫu/hiệu</p></div>
            <div className="flex flex-wrap gap-2"><span className="chip">{!manager ?
              (received < total ? "Đang cắt / Chưa đủ" : "Đã nhận đủ") :
              status === "OPEN" ? "Đang cắt / Chưa đủ" : status === "READY" ? "Đủ / ≤20 / Ép chốt · Chưa TT" : status === "VET" ? "Đã chốt · Còn hàng vét" : "Đã xong & Đã TT"}</span>
              {overDue && status === "OPEN" && <span className="chip urgent">QUÁ HẠN</span>}
              {forced && <span className="chip urgent">ĐÃ ÉP CHỐT</span>}</div>
          </div>
          <div className="grid gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <span><b>Loại hàng:</b> {first.order_type === "KHACH_DAT" ? `Khách đặt · ${first.customer_name || "Chưa có tên"}` : "Hàng nhà / Hàng xưởng"}</span>
            <span><b>Loại vải:</b> {fabric || "Chưa khai báo"}</span>
            <span><b>Ngày cắt:</b> {day(first.cut_date)}</span>
            <span><b>Xưởng may:</b> {names}</span>
            <span><b>Thợ cắt:</b> {cutters.find(c => c.id === first.cutter_id)?.name || "Chưa khai báo"}</span>
            <span><b>Kho dự kiến:</b> {warehouse || "—"}</span>
            {first.order_type === "KHACH_DAT" && <span><b>Hạn giao:</b> {day(first.delivery_date)}</span>}
          </div>
          <div className="rounded-xl bg-slate-50 p-3">
            <div className="flex justify-between gap-3 text-sm"><span>Nhà may giao / Kế hoạch toàn mâm</span><b>{num(received)} / {num(total)} chiếc</b></div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-teal-500"
              style={{ width: `${total > 0 ? Math.min(100, received / total * 100) : 0}%` }} /></div>
            <p className="mt-2 text-xs text-orange-700">{received > total
              ? `Đã nhận dư ${num(received - total)} chiếc`
              : forced
                ? `Đã ép chốt · Thiếu thực tế ${num(Math.max(0, total - received))} chiếc`
                : `Còn thiếu ${num(Math.max(0, total - received))} chiếc`}{status === "PAID" ? (paidSum > 0 ? ` · Đã TT ${cash(paidSum)}` : " · Đã thanh toán xong") : ""}</p>
            {hasMain && <div className="mt-3 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm">
              <div className="grid gap-2 sm:grid-cols-3">
                <span><b>Đã tính công:</b> {num(accounted)}</span>
                <span><b>Vét mới chờ tính:</b> {num(vetWaiting)}</span>
                <span><b>{received > total ? "Nhà may giao dư:" : "Còn nhà may chưa giao:"}</b> {num(received > total ? received - total : Math.max(0, total - received))}</span>
              </div>
              {vetWaiting > 0 && <div className="mt-3 flex justify-end">
                <Link
                  className="btn primary"
                  href={first.sewing_house_id
                    ? `/azalas/patterns/houses?house=${first.sewing_house_id}&focus=vet`
                    : "/azalas/patterns/houses?focus=vet"}
                >
                  Qua chốt tiền vét
                </Link>
              </div>}
            </div>}
          </div>
          <div className="overflow-x-auto rounded-xl border border-blue-100">
            <table className="w-full min-w-[560px] text-sm"><thead><tr className="bg-blue-50 text-left">
              <th className="p-2">Mẫu / hiệu</th><th className="p-2">Size</th><th className="p-2">Tỉ lệ size</th>
              <th className="p-2 text-right">Số lớp</th><th className="p-2 text-right">Kế hoạch</th>
              {manager && <th className="p-2">Màu × size</th>}</tr></thead>
              <tbody>{mam.jobs.map(j => <tr className="border-t align-top" key={j.id}>
                <td className="p-2"><b>{j.product_name} {j.brand || ""}</b><br/><span className="text-xs text-slate-500">{j.job_code}</span></td>
                <td className="p-2">{j.size_range || "—"}</td><td className="p-2">{j.size_ratio || "—"}</td>
                <td className="p-2 text-right">{j.layer_count == null ? "—" : num(j.layer_count)}</td>
                <td className="p-2 text-right font-semibold">{num(j.planned_qty)}</td>
                {manager && <td className="p-2">
                  {sizePlans.some(p => p.job_id === j.id) && <button className="btn" disabled={busy}
                    onClick={() => setPlanKey(planKey === j.id ? null : j.id)}>{planKey === j.id ? "Ẩn size" : "Màu × size"}</button>}
                </td>}
              </tr>)}</tbody></table>
          </div>
          {manager && planKey !== null && mam.jobs.some(j => j.id === planKey) && <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-3">
            <b className="text-blue-900">Kế hoạch màu × size · {mam.jobs.find(j => j.id === planKey)?.brand || "mẫu"}</b>
            <div className="mt-2 max-h-72 overflow-y-auto"><table className="w-full text-sm"><thead><tr className="bg-blue-50">
              <th className="p-2 text-left">Màu</th><th className="p-2">Size</th><th className="p-2 text-right">Lớp × tỉ lệ</th><th className="p-2 text-right">SL</th></tr></thead>
              <tbody>{sizePlans.filter(p => p.job_id === planKey).map(p => <tr className="border-t" key={p.id}>
                <td className="p-2">{p.color}</td><td className="p-2 text-center">{p.size}</td>
                <td className="p-2 text-right">{p.layers} × {p.ratio}</td>
                <td className="p-2 text-right font-bold">{num(p.planned_qty)}</td></tr>)}</tbody>
            </table></div>
          </div>}
          <ImageViewer urls={images(mam)} label={`Ảnh rập và phiếu mâm ${code}`} />
          {manager && <div className="flex flex-wrap gap-2 border-t pt-3">
            <button className="btn" disabled={busy} onClick={() => setHistoryKey(historyKey === mam.key ? null : mam.key)}>
              {historyKey === mam.key ? "Ẩn lịch sử" : "Lịch sử"}</button>
            <button className="btn soft" disabled={busy || !mam.jobs.some(job => canReceiveMamJob(mam, job))}
              onClick={() => openReceive(mam)}>{hasMain ? "Nhận hàng vét" : "Nhận"}</button>
            <button className="btn" disabled={busy || !validEdit} onClick={() => openEdit(mam)}>Sửa TT</button>
            <button className="btn danger" title={!owner ? "Chỉ OWNER được ép chốt" : received === 0 ? "Cần nhận hàng ít nhất một lần" : "Ép chốt khi chưa giao đủ"}
              disabled={busy || !owner || !validEdit || received === 0 || ready || hasMain}
              onClick={() => void forceClose(mam)}>Ép chốt</button>
            <button className="btn danger" title={!owner ? "Chỉ OWNER được xóa" : received > 0 ? "Đã có lịch sử giao hàng: không thể xóa" : "Xóa mềm mâm chưa có giao nhận"}
              disabled={busy || !owner || received > 0 || forced || status === "PAID" || hasMain}
              onClick={() => void deleteMam(mam)}>Xóa</button>
          </div>}
          {manager && historyKey === mam.key && <div className="rounded-xl border bg-slate-50 p-3">
            <h3 className="mb-2 font-bold text-blue-900">Lịch sử nhận hàng của {code}</h3>
            {history.length ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead><tr className="bg-slate-200 text-left">
              <th className="p-2">Ngày giờ</th><th className="p-2">Mẫu / hiệu</th><th className="p-2 text-right">Số lượng</th>
              <th className="p-2">Ai nhập</th><th className="p-2">Ghi chú</th></tr></thead><tbody>
              {history.map(r => <tr className="border-t" key={r.id}><td className="p-2">{dt(r.received_at)}</td>
                <td className="p-2">{mam.jobs.find(j => j.id === r.job_id)?.brand || mam.jobs.find(j => j.id === r.job_id)?.product_name || "—"}</td>
                <td className="p-2 text-right font-bold">{num(r.qty)}{r.receipt_kind === "VET" ? <span className="ml-1 text-xs text-orange-700">VÉT</span> : null}</td><td className="p-2">{profiles[r.received_by] || "Chưa rõ"}</td>
                <td className="p-2">{r.note || "—"}</td></tr>)}
            </tbody></table></div> : <p className="text-sm text-slate-600">Chưa có lần nhận hàng nào.</p>}
            {notes.length > 0 && <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Nhật ký sửa / ép chốt / thanh toán ({notes.length})</summary>
              <div className="mt-2 space-y-2">{notes.map(e => {
                const d = asRecord(e.detail);
                const isLayer = e.action === "SUA_TT_MAM" && (d.event_type === "SUA_SO_LOP_MAM" || d.event_type === "SUA_SO_LOP");
                const isMamLayer = d.event_type === "SUA_SO_LOP_MAM";
                return <div key={e.id} className="rounded-lg border bg-white p-2">
                  <div><b>{dt(e.occurred_at)}</b> · {profiles[e.actor_id] || "Chưa rõ"} · {isLayer ? (isMamLayer ? "Sửa tổng số lớp toàn mâm" : "Sửa số lớp") : e.action}</div>
                  {isLayer && <div className="mt-1 text-slate-700">
                    <span className="line-through text-slate-500">{String(d.old_layer_count ?? "—")}×{String(d.ratio_total ?? "—")}={num(Number(d.old_planned_qty || 0))}</span>
                    <span className="mx-2">→</span>
                    <b>{String(d.new_layer_count ?? "—")}×{String(d.ratio_total ?? "—")}={num(Number(d.new_planned_qty || 0))}</b>
                  </div>}
                </div>;
              })}</div></details>}
          </div>}
        </article>;
      })}
      {!visible.length && <p className="panel muted">Không có mâm phù hợp với bộ lọc.</p>}
      {!showAll && !search.trim() && filtered.length > 10 && <button className="btn soft"
        onClick={() => setShowAll(true)}>Xem thêm ({filtered.length - 10} mâm)</button>}
      {showAll && filtered.length > 100 && <p className="text-xs text-slate-500">Đang hiển thị tối đa 100 mâm; hãy tìm bằng mã để xem mâm khác.</p>}
      {jobs.length >= 500 && <p className="text-xs text-orange-700">Dữ liệu Tiến độ hiện giới hạn 500 mẫu gần nhất; thống kê nhà may trong màn này chỉ tính các mẫu đã tải.</p>}
    </div>}
    {receiveState && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 p-3 sm:p-8"
      role="dialog" aria-modal="true" aria-label="Nhận hàng của mâm">
      <div className="w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <Msg error={error} />
        <h2 className="mb-2 text-lg font-extrabold text-blue-800">{mamHasMain(receiveState.mam) ? "NHẬN HÀNG VÉT" : "NHẬN HÀNG"} · {mamCode(receiveState.mam)}</h2>
        <p className="mb-4 text-sm text-slate-600">Nhập một số lượng chung cho toàn mâm. {mamHasMain(receiveState.mam) ? "Hàng về sau bảng kê chính được ghi riêng là hàng vét và sẽ chờ tính tiền ở Nhà may → Chốt TT." : "Không cần chọn riêng từng mẫu/hiệu; dù mâm đã đủ kế hoạch vẫn có thể nhận thêm hàng dư."}</p>
        {(() => {
          const totalPlanned = mamPlanned(receiveState.mam);
          const totalReceived = mamReceived(receiveState.mam);
          const totalMissing = Math.max(0, totalPlanned - totalReceived);
          const totalOver = Math.max(0, totalReceived - totalPlanned);
          const accounted = mamAccounted(receiveState.mam);
          return <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
            <div className="flex justify-between gap-3"><span>Tổng kế hoạch · {receiveState.mam.jobs.length} mẫu/hiệu</span><b>{num(totalPlanned)} chiếc</b></div>
            <div className="mt-1 flex justify-between gap-3"><span>Đã nhận toàn mâm</span><b>{num(totalReceived)} chiếc</b></div>
            <div className="mt-1 flex justify-between gap-3"><span>{totalOver > 0 ? "Đang dư" : "Còn thiếu"}</span><b>{num(totalOver > 0 ? totalOver : totalMissing)} chiếc</b></div>
            {mamHasMain(receiveState.mam) && <><div className="mt-1 flex justify-between gap-3"><span>Đã tính công</span><b>{num(accounted)} chiếc</b></div>
              <div className="mt-1 flex justify-between gap-3"><span>Vét đã về nhưng chưa tính công</span><b>{num(Math.max(0, totalReceived - accounted))} chiếc</b></div></>}
          </div>;
        })()}
        <p className={`mt-3 rounded-lg border p-3 text-sm ${mamHasMain(receiveState.mam) ? "border-orange-200 bg-orange-50 text-orange-800" : "border-blue-200 bg-blue-50 text-blue-800"}`}>
          Được phép nhận vượt kế hoạch. Ví dụ đã 999/1.000 vẫn có thể nhập 5 để thành 1.004/1.000; đã 1.000/1.000 vẫn nhập thêm được.
          {mamHasMain(receiveState.mam) ? " Phần nhận thêm sẽ vào hàng vét chờ tính tiền riêng." : " Nếu chưa chốt bảng kê chính, phần dư sẽ được tính cùng bảng kê chính."}
        </p>
        <label className={`${label} mt-4`}>Số lượng nhận toàn mâm *
          <input className={`${field} mt-1`} inputMode="numeric" value={receiveState.quantity}
            placeholder="Nhập tổng số lượng nhà may vừa giao"
            onChange={e => { setError(""); setReceiveState({ ...receiveState, quantity: e.target.value }); }}/>
        </label>
        <label className={`${label} mt-3`}>Ghi chú lần nhận
          <textarea className={`${field} mt-1`} rows={2} value={receiveState.note}
            placeholder="Có thể để trống" onChange={e => setReceiveState({ ...receiveState, note: e.target.value })}/>
        </label>
        <div className="mt-5 grid gap-2">
          <button className="btn primary" disabled={busy} onClick={() => void submitReceive()}>
            {busy ? "Đang lưu..." : mamHasMain(receiveState.mam) ? "XÁC NHẬN NHẬN HÀNG VÉT" : "XÁC NHẬN NHẬN HÀNG"}</button>
          <button className="btn" disabled={busy} onClick={() => { setReceiveState(null); setError(""); }}>Hủy</button>
        </div>
      </div>
    </div>}
    {mamAction && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 p-3 sm:p-8"
      role="dialog" aria-modal="true" aria-label={mamAction.kind === "FORCE_CLOSE" ? "Ép chốt mâm" : "Xóa mâm"}>
      <div className="w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <Msg error={error} />
        <h2 className={`text-lg font-extrabold ${mamAction.kind === "FORCE_CLOSE" ? "text-orange-700" : "text-red-700"}`}>
          {mamAction.kind === "FORCE_CLOSE" ? "ÉP CHỐT" : "XÓA MÂM"} · {mamCode(mamAction.mam)}
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          {mamAction.kind === "FORCE_CLOSE"
            ? "Ép chốt sẽ dừng nhận thêm hàng cho toàn mâm nhưng chưa đánh dấu đã thanh toán."
            : "Mâm sẽ được xóa mềm; ảnh và lịch sử vẫn được giữ để kiểm toán."}
        </p>
        <label className={`${label} mt-4`}>Lý do *
          <textarea className={`${field} mt-1`} rows={3} value={mamAction.reason}
            placeholder={mamAction.kind === "FORCE_CLOSE" ? "Nhập lý do còn thiếu..." : "Nhập lý do xóa..."}
            onChange={e => { setError(""); setMamAction({ ...mamAction, reason: e.target.value }); }}/>
        </label>
        <div className="mt-5 grid gap-2">
          <button className={mamAction.kind === "FORCE_CLOSE" ? "btn danger" : "btn danger"}
            disabled={busy || mamAction.reason.trim().length < 3} onClick={() => void submitMamAction()}>
            {busy ? "Đang lưu..." : mamAction.kind === "FORCE_CLOSE" ? "XÁC NHẬN ÉP CHỐT" : "XÁC NHẬN XÓA MÂM"}
          </button>
          <button className="btn" disabled={busy} onClick={() => { setMamAction(null); setError(""); }}>Hủy</button>
        </div>
      </div>
    </div>}
    {edit && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 p-3 sm:p-8"
      role="dialog" aria-modal="true" aria-label="Sửa thông tin mâm">
      <div className="w-full max-w-2xl max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <Msg error={error} />
        <h2 className="mb-4 text-lg font-extrabold text-blue-800">✎ SỬA THÔNG TIN · {mamCode(edit.mam)}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>Tên nhà may *<select className={`${field} mt-1`} value={edit.houseId}
            onChange={e => setEdit({ ...edit, houseId: e.target.value, price: "" })}>
            <option value="">Chọn nhà may</option>{houses.map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select></label>
          <label className={label}>Rập *<select className={`${field} mt-1`} value={edit.patternId}
            onChange={e => { const chosen = patterns.find(p => String(p.id) === e.target.value);
              setEdit({ ...edit, patternId: e.target.value,
                productName: chosen?.product_name || edit.productName, price: "" }); }}>
            <option value="">Chọn mã rập</option>{patterns.map(p => <option key={p.id} value={p.id}>{p.code} · {p.product_name}</option>)}
          </select></label>
          <label className={label}>Tên sản phẩm *<input className={`${field} mt-1`} value={edit.productName}
            onChange={e => setEdit({ ...edit, productName: e.target.value })}/></label>
          <label className={label}>Đơn giá nhà may (đ/chiếc) *<input className={`${field} mt-1`} inputMode="decimal"
            value={edit.price} placeholder="Nhập giá cho nhà may đã chọn"
            onChange={e => setEdit({ ...edit, price: e.target.value })}/></label>
        </div>
        <div className="mt-4 rounded-xl border p-3">
          <b className="text-sm text-blue-900">Sửa tổng số lớp toàn mâm</b>
          <p className="mt-1 text-xs text-slate-600">Gộp tất cả mẫu/hiệu trong mâm thành một công thức. Ví dụ mâm NAI + DAS: 165 + 165 = 330 lớp, tổng tỉ lệ size = 8 → 330×8=2.640. Chỉ cần sửa 330 thành 329 hoặc 328 một lần.</p>
          {!edit.layerEdit.sameRatio ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">Các mẫu trong mâm có tổng tỉ lệ size khác nhau nên không thể dùng một phép nhân chung.</p> : (() => {
            const nextLayers = Number(edit.layerEdit.layers || 0);
            const nextPlanned = nextLayers > 0 ? nextLayers * edit.layerEdit.ratioTotal : 0;
            return <div className="mt-3 rounded-xl border bg-slate-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <b>Toàn mâm · {edit.mam.jobs.map(job => job.brand || job.product_name).join(" + ")}</b>
                <span className="text-sm text-slate-600">Tổng tỉ lệ size = {edit.layerEdit.ratioTotal}</span>
              </div>
              <div className="mt-2 grid gap-2 sm:grid-cols-[180px_1fr] sm:items-end">
                <label className={label}>Tổng số lớp mới *
                  <input className={`${field} mt-1`} inputMode="numeric" value={edit.layerEdit.layers}
                    onChange={e => setEdit({ ...edit, layerEdit: { ...edit.layerEdit, layers: e.target.value } })}/>
                </label>
                <div className="rounded-lg bg-white px-3 py-2 text-sm">
                  <div className="text-slate-500">Cũ: <span className="line-through">{layerFormula(edit.layerEdit.oldLayers, edit.layerEdit.ratioTotal, edit.layerEdit.oldPlanned)}</span></div>
                  <div className="mt-1 font-bold text-blue-800">Mới: {edit.layerEdit.layers || "—"}×{edit.layerEdit.ratioTotal}={nextPlanned ? num(nextPlanned) : "—"}</div>
                </div>
              </div>
              <p className="mt-2 text-xs text-slate-500">Hệ thống tự phân bổ tổng số lớp mới xuống các mẫu bên dưới để giữ cấu trúc database; bạn không cần sửa NAI/DAS riêng lẻ.</p>
            </div>;
          })()}
        </div>
        <div className="mt-5 grid gap-2"><button className="btn primary" disabled={busy} onClick={() => void saveEdit()}>
          {busy ? "Đang lưu..." : "LƯU THAY ĐỔI"}</button>
          <button className="btn" disabled={busy} onClick={() => setEdit(null)}>Hủy</button></div>
      </div>
    </div>}

  </div>;
}
