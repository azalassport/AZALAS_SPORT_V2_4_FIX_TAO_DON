"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ImageViewer, Loading, Msg, Tabs } from "@/components/ui";
import { day, dt, money, norm } from "@/lib/azalas/format";

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
type Receipt = { id: number; job_id: number; qty: number; received_at: string; note: string | null; received_by: string };
type Event = { id: number; job_id: number; action: string; detail: unknown; occurred_at: string; actor_id: string };
type Photo = { id: number; job_id: number; storage_path: string };
type Partner = { id: number; name: string };
type Pattern = { id: number; code: string; product_name: string };
type Profile = { id: string; display_name: string };
type Mam = { key: string; slip: Slip | null; jobs: Job[] };
type Stage = "ALL" | "OPEN" | "READY" | "PAID";
type ColorEdit = { job_id: number; color: string; layers: string };
type EditState = { mam: Mam; houseId: string; patternId: string; productName: string;
  price: string; legacyLayers: string; colors: ColorEdit[] };
type ReceiveState = { mam: Mam; jobId: string; quantity: string; note: string };
const field = "field w-full";
const label = "block text-sm font-bold text-slate-700";
const num = (value: number) => Number(value || 0).toLocaleString("vi-VN");
const canReceiveJob = (j: Job) => !j.paid_at && !j.forced_closed_at &&
  j.status !== "DA_CHOT" && j.received_qty < j.planned_qty;
const isPaid = (mam: Mam) => mam.jobs.every(j => Boolean(j.paid_at));
const isReady = (mam: Mam) => mam.jobs.every(j => j.received_qty >= j.planned_qty ||
  Boolean(j.forced_closed_at) || j.status === "DA_CHOT");
const mamStage = (mam: Mam): Stage => isPaid(mam) ? "PAID" : isReady(mam) ? "READY" : "OPEN";
const stageText: Record<Stage, string> = {
  ALL: "Tất cả", OPEN: "🚀 ĐANG CẮT / CHƯA ĐỦ",
  READY: "🟡 ĐÃ GIAO ĐỦ HOẶC ĐƯỢC ÉP CHỐT - CHƯA TT",
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
  const [houseFilter, setHouseFilter] = useState("ALL");
  const [stage, setStage] = useState<Stage>("ALL");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [historyKey, setHistoryKey] = useState<string | null>(null);
  const [planKey, setPlanKey] = useState<number | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [receiveState, setReceiveState] = useState<ReceiveState | null>(null);
  const [paymentMam, setPaymentMam] = useState<Mam | null>(null);
  const [paymentMethod, setPaymentMethod] = useState("CHUYEN_KHOAN");
  const [paymentNote, setPaymentNote] = useState("");
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
        setEvents([]); setPhotos([]); setSignedUrls({});
        setLoading(false); return;
      }
      const photoResult = await sb.from("pattern_job_images")
        .select("id,job_id,storage_path").in("job_id", ids).limit(2000);
      if (photoResult.error) throw new Error("Ảnh rập: " + photoResult.error.message);
      const loadedPhotos = (photoResult.data || []) as Photo[];
      setPhotos(loadedPhotos);
      if (!manager) {
        setJobs(basic); setSlips({}); setSizePlans([]); setReceipts([]);
        setEvents([]); setProfiles({});
        const paths = [...new Set(loadedPhotos.map(photo => photo.storage_path))];
        const signResult = paths.length ? await sb.storage.from("az-pattern-images")
          .createSignedUrls(paths, 3600) : { data: [], error: null };
        if (signResult.error) throw new Error("Ảnh rập: " + signResult.error.message);
        setSignedUrls(Object.fromEntries(paths.map((p, i) => [p, signResult.data?.[i]?.signedUrl || ""])));
        return;
      }
      const [jobResult, planResult, receiptResult, eventResult, housesResult, cuttersResult, patternsResult,
        fabricsResult, warehouseResult] = await Promise.all([
        sb.from("pattern_jobs").select("id,entry_slip_id,pattern_id,sewing_house_id,cutter_id,size_range,size_ratio,layer_count,sewing_price,forced_closed_at,paid_at,paid_amount,payment_method,expected_warehouse_id")
          .in("id", ids).limit(500),
        sb.from("pattern_job_size_plans").select("id,job_id,color,size,layers,ratio,planned_qty")
          .in("job_id", ids).order("id").limit(4000),
        sb.from("pattern_receipts").select("id,job_id,qty,received_at,note,received_by")
          .in("job_id", ids).order("received_at", { ascending: false }).limit(4000),
        sb.from("pattern_events").select("id,job_id,action,detail,occurred_at,actor_id")
          .in("job_id", ids).order("occurred_at", { ascending: false }).limit(2000),
        sb.from("sewing_houses").select("id,name").eq("is_active", true).order("name"),
        sb.from("cutters").select("id,name").eq("is_active", true).order("name"),
        sb.from("pattern_catalog").select("id,code,product_name").order("code").limit(2000),
        sb.from("pattern_fabrics").select("id,name").order("name"),
        sb.from("az_warehouses").select("id,name").order("name"),
      ]);
      const results = [jobResult, planResult, receiptResult, eventResult,
        housesResult, cuttersResult, patternsResult, fabricsResult, warehouseResult];
      const firstError = results.find(result => result.error)?.error;
      if (firstError) throw new Error("Không tải được chi tiết Tiến độ: " + firstError.message + ". Kiểm tra đã chạy SQL 13, 15 và 17.");
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
      setSignedUrls(Object.fromEntries(paths.map((path, i) => [path, signed.data?.[i]?.signedUrl || ""])));
    } catch (err) {
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
  function colorEdits(mam: Mam): ColorEdit[] {
    const map = new Map<string, ColorEdit>();
    for (const row of sizePlans.filter(r => mam.jobs.some(j => j.id === r.job_id))) {
      const key = `${row.job_id}/${row.color}`;
      if (!map.has(key)) map.set(key, { job_id: row.job_id, color: row.color, layers: String(row.layers) });
    }
    return [...map.values()];
  }
  function openEdit(mam: Mam) {
    const j = mam.jobs[0];
    setEdit({ mam, houseId: String(j.sewing_house_id || ""),
      patternId: String(j.pattern_id || ""), productName: j.product_name,
      price: j.sewing_price == null ? "" : String(j.sewing_price),
      legacyLayers: j.layer_count == null ? "" : String(j.layer_count),
      colors: colorEdits(mam) });
    setError("");
  }
  async function mutate(fn: string, args: Record<string, unknown>, message: string) {
    setError(""); setOk(""); setBusy(true);
    try {
      const { error: rpcError } = await sb.rpc(fn, args);
      if (rpcError) throw rpcError;
      setEdit(null); setReceiveState(null); setPaymentMam(null); setHistoryKey(null);
      await load();
      setOk(message);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    finally { setBusy(false); }
  }
  function openReceive(mam: Mam) {
    if (role !== "OWNER" && role !== "ADMIN") return;
    const first = mam.jobs.find(canReceiveJob);
    if (!first) return setError("Mâm này đã giao đủ, ép chốt hoặc đã thanh toán; không thể nhận thêm.");
    setError("");
    setReceiveState({ mam, jobId: String(first.id), quantity: "", note: "" });
  }
  async function submitReceive() {
    if (!receiveState || busy) return;
    const j = receiveState.mam.jobs.find(item => String(item.id) === receiveState.jobId);
    if (!j || !canReceiveJob(j)) return setError("Mẫu này không còn được nhận hàng.");
    const value = receiveState.quantity.trim();
    if (!/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)))
      return setError("Số lượng nhận phải là số nguyên dương.");
    if (Number(value) > j.planned_qty - j.received_qty)
      return setError(`Mẫu ${j.brand || j.product_name} chỉ còn thiếu ${num(j.planned_qty - j.received_qty)} chiếc.`);
    await mutate("az_pattern_receive", { p_job_id: j.id, p_qty: Number(value), p_note: receiveState.note.trim() || null },
      "Đã nhận hàng và ghi lịch sử. Chưa nhập tồn kho.");
  }
  async function forceClose(mam: Mam) {
    const reason = window.prompt(`ÉP CHỐT toàn bộ ${mamCode(mam)}: nhập lý do còn thiếu.`);
    if (reason === null) return;
    if (reason.trim().length < 3) return setError("Lý do ép chốt cần ít nhất 3 ký tự.");
    if (!window.confirm(`Xác nhận ÉP CHỐT ${mamCode(mam)}? Sau đó không được nhận thêm; chưa đánh dấu đã TT.`)) return;
    await mutate("az_pattern_mam_force_close", { p_job_id: mam.jobs[0].id, p_reason: reason.trim() },
      "Đã ép chốt mâm. Chưa thanh toán.");
  }
  async function deleteMam(mam: Mam) {
    const reason = window.prompt(`XÓA MÂM ${mamCode(mam)}: nhập lý do. Mâm đã nhận hàng/TT không được xóa.`);
    if (reason === null) return;
    if (reason.trim().length < 3) return setError("Lý do xóa cần ít nhất 3 ký tự.");
    if (!window.confirm(`Bạn chắc chắn muốn ẩn/xóa toàn bộ ${mamCode(mam)}? Ảnh và lịch sử được giữ để kiểm toán.`)) return;
    await mutate("az_pattern_mam_delete", { p_job_id: mam.jobs[0].id, p_reason: reason.trim() },
      "Đã xóa mềm toàn bộ mâm, giữ nguyên ảnh và nhật ký.");
  }
  async function saveEdit() {
    if (!edit) return;
    const price = edit.price.trim();
    if (!/^\d+(?:\.\d{1,2})?$/.test(price) || Number(price) <= 0)
      return setError("Đơn giá nhà may phải lớn hơn 0.");
    if (!edit.houseId || !edit.patternId || !edit.productName.trim())
      return setError("Chọn nhà may, mã rập và nhập tên sản phẩm.");
    if (edit.colors.some(c => !/^[1-9]\d{0,5}$/.test(c.layers)))
      return setError("Mỗi màu phải có số lớp nguyên dương.");
    const data: Record<string, unknown> = {
      house_id: Number(edit.houseId), pattern_id: Number(edit.patternId),
      product_name: edit.productName.trim(), sewing_price: price,
    };
    if (edit.colors.length) data.colors = edit.colors.map(c => ({ job_id: c.job_id,
      color: c.color, layers: Number(c.layers) }));
    else if (edit.mam.jobs.length === 1) data.layer_count = edit.legacyLayers.trim() || null;
    await mutate("az_pattern_mam_edit", { p_job_id: edit.mam.jobs[0].id, p_data: data },
      "Đã sửa mâm và ghi nhật ký thay đổi.");
  }
  async function markPaid() {
    if (!paymentMam) return;
    if (paymentMethod === "KHAC" && paymentNote.trim().length < 3)
      return setError("Nhập ghi chú phương thức thanh toán KHÁC.");
    if (!window.confirm(`Xác nhận đã thanh toán ĐỦ tiền công mâm ${mamCode(paymentMam)}? Không dùng nút này cho trả một phần.`)) return;
    await mutate("az_pattern_mam_mark_paid", {
      p_job_id: paymentMam.jobs[0].id, p_method: paymentMethod, p_note: paymentNote.trim() || null,
    }, "Đã ghi nhận thanh toán đủ tiền công mâm.");
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
      items={(["ALL", "OPEN", "READY", "PAID"] as Stage[]).map(value => ({ value,
        label: stageText[value], count: value === "ALL" ? byHouse.length :
          byHouse.filter(mam => mamStage(mam) === value).length }))} />}
    {loading && <Loading />}
    {!loading && <div className="stack">
      {visible.map(mam => {
        const first = mam.jobs[0];
        const code = mamCode(mam);
        const total = mam.jobs.reduce((n, j) => n + j.planned_qty, 0);
        const received = mam.jobs.reduce((n, j) => n + j.received_qty, 0);
        const brands = [...new Set(mam.jobs.map(j => j.brand?.trim()).filter(Boolean))].join(" | ");
        const codes = [...new Set(mam.jobs.map(j => j.pattern_code))].join(" | ");
        const productNames = [...new Set(mam.jobs.map(j => j.product_name))].join(" / ");
        const names = [...new Set(mam.jobs.map(j => j.house_name || "Chưa phân nhà may"))].join(" | ");
        const fabric = mam.slip?.fabric_id != null ? fabrics.find(f => f.id === mam.slip?.fabric_id)?.name : null;
        const warehouseId = mam.slip?.expected_warehouse_id ?? first.expected_warehouse_id;
        const warehouse = warehouses.find(w => w.id === warehouseId)?.name;
        const status = mamStage(mam);
        const ready = isReady(mam);
        const paidSum = mam.jobs.reduce((n, j) => n + Number(j.paid_amount || 0), 0);
        const settlementTotal = mam.jobs.reduce((n, j) => n + j.received_qty * Number(j.sewing_price || 0), 0);
        const overDue = mam.jobs.some(j => j.delivery_date && j.received_qty < j.planned_qty &&
          new Date(`${j.delivery_date}T23:59:59+07:00`).getTime() < Date.now());
        const forced = mam.jobs.some(j => Boolean(j.forced_closed_at) || j.status === "DA_CHOT");
        const validEdit = manager && !mam.jobs.some(j => j.paid_at || j.forced_closed_at || j.status === "DA_CHOT");
        const history = receipts.filter(r => mam.jobs.some(j => j.id === r.job_id));
        const notes = events.filter(e => mam.jobs.some(j => j.id === e.job_id) &&
          ["SUA_TT_MAM", "EP_CHOT", "XOA_MAM", "XAC_NHAN_DA_TT"].includes(e.action));
        return <article className="panel stack" key={mam.key}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="text-xl font-black text-blue-800">{codes} <span className="text-slate-800">({productNames}{brands ? ` ${brands}` : ""})</span></p>
              <p className="mt-1 text-sm font-bold text-slate-600">Mâm: {code}{mam.slip ? ` · Phiếu ${mam.slip.slip_code}` : ""} · {mam.jobs.length} mẫu/hiệu</p></div>
            <div className="flex flex-wrap gap-2"><span className="chip">{!manager ?
              (received < total ? "Đang cắt / Chưa đủ" : "Đã nhận đủ") :
              status === "OPEN" ? "Đang cắt / Chưa đủ" : status === "READY" ? "Đủ / Ép chốt · Chưa TT" : "Đã xong & Đã TT"}</span>
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
            <p className="mt-2 text-xs text-orange-700">{forced ? `Đã ép chốt · Thiếu thực tế ${num(Math.max(0, total - received))} chiếc` :
              `Còn thiếu ${num(Math.max(0, total - received))} chiếc`}{status === "PAID" ? ` · Đã TT ${money(paidSum)}` : ""}</p>
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
            <button className="btn soft" disabled={busy || !mam.jobs.some(canReceiveJob)}
              onClick={() => openReceive(mam)}>Nhận</button>
            <button className="btn" disabled={busy || !validEdit} onClick={() => openEdit(mam)}>Sửa TT</button>
            <button className="btn danger" title={!owner ? "Chỉ OWNER được ép chốt" : received === 0 ? "Cần nhận hàng ít nhất một lần" : "Ép chốt khi chưa giao đủ"}
              disabled={busy || !owner || !validEdit || received === 0 || ready}
              onClick={() => void forceClose(mam)}>Ép chốt</button>
            {ready && status !== "PAID" && !mam.jobs.some(j => j.paid_at) && <button className="btn soft" disabled={busy}
              onClick={() => { setPaymentMam(mam); setPaymentMethod("CHUYEN_KHOAN"); setPaymentNote(""); }}>
              Chốt TT · {money(settlementTotal)}</button>}
            <button className="btn danger" title={!owner ? "Chỉ OWNER được xóa" : received > 0 ? "Đã có lịch sử giao hàng: không thể xóa" : "Xóa mềm mâm chưa có giao nhận"}
              disabled={busy || !owner || received > 0 || forced || status === "PAID"}
              onClick={() => void deleteMam(mam)}>Xóa</button>
          </div>}
          {manager && historyKey === mam.key && <div className="rounded-xl border bg-slate-50 p-3">
            <h3 className="mb-2 font-bold text-blue-900">Lịch sử nhận hàng của {code}</h3>
            {history.length ? <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><thead><tr className="bg-slate-200 text-left">
              <th className="p-2">Ngày giờ</th><th className="p-2">Mẫu / hiệu</th><th className="p-2 text-right">Số lượng</th>
              <th className="p-2">Ai nhập</th><th className="p-2">Ghi chú</th></tr></thead><tbody>
              {history.map(r => <tr className="border-t" key={r.id}><td className="p-2">{dt(r.received_at)}</td>
                <td className="p-2">{mam.jobs.find(j => j.id === r.job_id)?.brand || mam.jobs.find(j => j.id === r.job_id)?.product_name || "—"}</td>
                <td className="p-2 text-right font-bold">{num(r.qty)}</td><td className="p-2">{profiles[r.received_by] || "Chưa rõ"}</td>
                <td className="p-2">{r.note || "—"}</td></tr>)}
            </tbody></table></div> : <p className="text-sm text-slate-600">Chưa có lần nhận hàng nào.</p>}
            {notes.length > 0 && <details className="mt-3 text-sm"><summary className="cursor-pointer font-semibold">Nhật ký sửa / ép chốt / thanh toán ({notes.length})</summary>
              <div className="mt-2 space-y-2">{notes.map(e => <div key={e.id} className="rounded-lg border bg-white p-2">
                {dt(e.occurred_at)} · {e.action} · {profiles[e.actor_id] || "Chưa rõ"}</div>)}</div></details>}
          </div>}
        </article>;
      })}
      {!visible.length && <p className="panel muted">Không có mâm phù hợp với bộ lọc.</p>}
      {!showAll && !search.trim() && filtered.length > 10 && <button className="btn soft"
        onClick={() => setShowAll(true)}>Xem thêm ({filtered.length - 10} mâm)</button>}
      {showAll && filtered.length > 100 && <p className="text-xs text-slate-500">Đang hiển thị tối đa 100 mâm; hãy tìm bằng mã để xem mâm khác.</p>}
      {jobs.length >= 500 && <p className="text-xs text-orange-700">Dữ liệu Tiến độ hiện giới hạn 500 mẫu gần nhất; thống kê nhà may trong màn này chỉ tính các mẫu đã tải.</p>}
    </div>}
    {receiveState && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 p-3 sm:p-8"
      role="dialog" aria-modal="true" aria-label="Nhận hàng của mâm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <Msg error={error} />
        <h2 className="mb-2 text-lg font-extrabold text-blue-800">NHẬN HÀNG · {mamCode(receiveState.mam)}</h2>
        <p className="mb-4 text-sm text-slate-600">Chọn mẫu/hiệu được giao trong mâm. Số lượng nhận sẽ chỉ ghi cho mẫu đã chọn, chưa nhập tồn kho.</p>
        <label className={label}>Mẫu / hiệu *
          <select className={`${field} mt-1`} value={receiveState.jobId} disabled={busy}
            onChange={e => { setError(""); setReceiveState({ ...receiveState, jobId: e.target.value, quantity: "" }); }}>
            {receiveState.mam.jobs.filter(canReceiveJob).map(j =>
              <option key={j.id} value={String(j.id)}>{j.product_name} · {j.brand || "Không có hiệu"} · {j.job_code || `#${j.id}`}</option>)}
          </select>
        </label>
        {(() => {
          const chosen = receiveState.mam.jobs.find(j => String(j.id) === receiveState.jobId);
          return chosen ? <p className="mt-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">
            Mẫu đã giao: <b>{num(chosen.received_qty)}</b> / {num(chosen.planned_qty)} chiếc ·
            Còn thiếu: <b>{num(Math.max(0, chosen.planned_qty - chosen.received_qty))}</b> chiếc.
          </p> : null;
        })()}
        <label className={`${label} mt-4`}>Số lượng nhận *
          <input className={`${field} mt-1`} inputMode="numeric" value={receiveState.quantity}
            placeholder="Nhập số lượng nhà may vừa giao"
            onChange={e => { setError(""); setReceiveState({ ...receiveState, quantity: e.target.value }); }}/>
        </label>
        <label className={`${label} mt-3`}>Ghi chú lần nhận
          <textarea className={`${field} mt-1`} rows={2} value={receiveState.note}
            placeholder="Có thể để trống" onChange={e => setReceiveState({ ...receiveState, note: e.target.value })}/>
        </label>
        <div className="mt-5 grid gap-2">
          <button className="btn primary" disabled={busy} onClick={() => void submitReceive()}>
            {busy ? "Đang lưu..." : "XÁC NHẬN NHẬN HÀNG"}</button>
          <button className="btn" disabled={busy} onClick={() => { setReceiveState(null); setError(""); }}>Hủy</button>
        </div>
      </div>
    </div>}
    {edit && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 p-3 sm:p-8"
      role="dialog" aria-modal="true" aria-label="Sửa thông tin mâm">
      <div className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
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
        {edit.colors.length ? <div className="mt-4 rounded-xl border p-3">
          <b className="text-sm text-blue-900">Số lớp theo màu (tự tính lại kế hoạch màu × size)</b>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">{edit.colors
            .filter(c => edit.mam.slip?.color_mode !== "common" ||
              edit.colors.find(x => x.color === c.color)?.job_id === c.job_id)
            .map(c => <label className={label} key={`${c.job_id}/${c.color}`}>
              {edit.mam.slip?.color_mode === "common" ? c.color :
                `${edit.mam.jobs.find(j => j.id === c.job_id)?.brand || "Mẫu"} · ${c.color}`}
              <input className={`${field} mt-1`} inputMode="numeric" value={c.layers}
                onChange={e => setEdit({ ...edit, colors: edit.colors.map(x =>
                  (edit.mam.slip?.color_mode === "common" ? x.color === c.color :
                    x.job_id === c.job_id && x.color === c.color) ? { ...x, layers: e.target.value } : x) })}/>
            </label>)}</div>
          <p className="mt-2 text-xs text-slate-600">Nếu đã nhận hàng, số lượng kế hoạch mới không được thấp hơn số đã giao. Lịch sử nhận không thay đổi.</p>
        </div> : edit.mam.jobs.length === 1 ? <label className={`${label} mt-4`}>Số lớp
          <input className={`${field} mt-1`} inputMode="numeric" value={edit.legacyLayers}
            placeholder="Nhập số lớp" onChange={e => setEdit({ ...edit, legacyLayers: e.target.value })}/>
          {edit.mam.jobs[0].order_type === "KHACH_DAT" && <span className="mt-1 block text-xs text-slate-600">Khách đặt: đổi số lớp không tự đổi số lượng kế hoạch đã nhập.</span>}
        </label> : <p className="mt-3 text-sm text-orange-700">Mâm nhiều mẫu thiếu kế hoạch màu × size; chỉ sửa được tên/nhà may/mã rập/đơn giá.</p>}
        <div className="mt-5 grid gap-2"><button className="btn primary" disabled={busy} onClick={() => void saveEdit()}>
          {busy ? "Đang lưu..." : "LƯU THAY ĐỔI"}</button>
          <button className="btn" disabled={busy} onClick={() => setEdit(null)}>Hủy</button></div>
      </div>
    </div>}
    {paymentMam && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/55 p-3 sm:p-8"
      role="dialog" aria-modal="true" aria-label="Xác nhận thanh toán mâm">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
        <Msg error={error} />
        <h2 className="mb-2 text-lg font-extrabold text-blue-800">CHỐT TT · {mamCode(paymentMam)}</h2>
        <p className="mb-3 text-sm text-slate-700">Tổng tiền công theo số lượng <b>đã giao thực tế</b>: <b className="text-lg">{money(
          paymentMam.jobs.reduce((s, j) => s + j.received_qty * Number(j.sewing_price || 0), 0))}</b></p>
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          Chỉ xác nhận khi đã trả đủ tiền ngoài thực tế. Bản Tiến độ này lưu dấu đã TT và nhật ký,
          chưa phân bổ vào sổ công nợ nhà may; không dùng cho trả một phần.
        </p>
        <label className={label}>Phương thức<select className={`${field} mt-1`} value={paymentMethod}
          onChange={e => setPaymentMethod(e.target.value)}><option value="CHUYEN_KHOAN">Chuyển khoản</option>
          <option value="TIEN_MAT">Tiền mặt</option><option value="KHAC">Khác</option></select></label>
        <label className={`${label} mt-3`}>Ghi chú / mã giao dịch<textarea className={`${field} mt-1`} rows={2}
          value={paymentNote} onChange={e => setPaymentNote(e.target.value)}
          placeholder="Nhập mã giao dịch hoặc ghi chú nếu có" /></label>
        <div className="mt-4 grid gap-2"><button className="btn primary" disabled={busy} onClick={() => void markPaid()}>
          {busy ? "Đang xử lý..." : "XÁC NHẬN ĐÃ THANH TOÁN ĐỦ"}</button>
          <button className="btn" disabled={busy} onClick={() => setPaymentMam(null)}>Hủy</button></div>
      </div>
    </div>}
  </div>;
}
