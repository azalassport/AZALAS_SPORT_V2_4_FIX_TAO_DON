"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loading, Msg } from "@/components/ui";
import { dt, errorText } from "@/lib/azalas/format";
import { CheckCircle2, RefreshCw, WalletCards } from "lucide-react";

type Cutter = { id: number; name: string };
type Job = {
  id: number;
  entry_slip_id: number | null;
  job_code: string | null;
  pattern_code: string;
  product_name: string;
  brand: string | null;
  planned_qty: number;
  cutter_id: number | null;
  cut_date: string | null;
  deleted_at?: string | null;
};
type Slip = { id: number; mam_code: string };
type Settlement = {
  id: number;
  settlement_code: string;
  month_key: string;
  unit_price: number;
  total_qty: number;
  total_amount: number;
  note: string | null;
  request_key: string;
  created_by: string;
  created_at: string;
};
type Line = {
  id: number;
  settlement_id: number;
  job_id: number;
  mam_code: string;
  cutter_id: number;
  cutter_name: string;
  pattern_code: string;
  product_name: string;
  brand: string | null;
  cut_date: string | null;
  qty: number;
  unit_price: number;
  line_total: number;
};
type Transaction = {
  id: number;
  transaction_code: string;
  month_key: string;
  kind: "ADVANCE" | "PAYMENT";
  amount: number;
  method: string;
  note: string | null;
  request_key: string;
  created_by: string;
  created_at: string;
};
type MamRow = {
  key: string;
  cutterId: number;
  cutterName: string;
  mamCode: string;
  jobs: Job[];
  patternText: string;
  cutDate: string;
  qty: number;
  amount: number;
};
type MonthGroup = {
  monthKey: string;
  settlements: Settlement[];
  lines: Line[];
  transactions: Transaction[];
  totalChot: number;
  totalAdvance: number;
  totalPayment: number;
  due: number;
  credit: number;
};
type MoneyAction = { kind: "ADVANCE" | "PAYMENT"; monthKey: string };

type HistoryItem = {
  key: string;
  at: string;
  kind: "CHOT" | "ADVANCE" | "PAYMENT";
  amount: number;
  note: string;
  actor: string;
};

const n = (v: number) => Number(v || 0).toLocaleString("vi-VN");
const cash = (v: number) => `${Number(v || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} đ`;
const sum = (values: number[]) => values.reduce((a, b) => a + Number(b || 0), 0);
const field = "field mt-1 w-full";
const label = "block text-sm font-bold text-slate-700";
const amountOk = (text: string) => /^\d+(?:[.,]\d{1,4})?$/.test(text.trim()) && Number(text.replace(",", ".")) > 0;
const amountValue = (text: string) => Number(text.trim().replace(",", "."));

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function monthRange(monthKey: string) {
  const [y, m] = monthKey.split("-").map(Number);
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { start, next };
}
function monthText(monthKey: string) {
  const [y, m] = monthKey.split("-");
  return `Tháng ${m}/${y}`;
}
function shortDay(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("vi-VN");
}

export function CutterLedger() {
  const sb = useMemo(() => createClient(), []);
  const [role, setRole] = useState("");
  const [cutters, setCutters] = useState<Cutter[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [slips, setSlips] = useState<Record<number, Slip>>({});
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"CHOT" | "DEBT">("CHOT");
  const [monthKey, setMonthKey] = useState(currentMonth());
  const [unitPrice, setUnitPrice] = useState("0.9");
  const [selected, setSelected] = useState<string[]>([]);
  const [copiedSignature, setCopiedSignature] = useState("");
  const [note, setNote] = useState("");
  const [showChotConfirm, setShowChotConfirm] = useState(false);
  const [moneyAction, setMoneyAction] = useState<MoneyAction | null>(null);
  const [moneyAmount, setMoneyAmount] = useState("");
  const [moneyMethod, setMoneyMethod] = useState("CHUYEN_KHOAN");
  const [moneyNote, setMoneyNote] = useState("");
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const requestKey = useRef<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  const manager = role === "OWNER" || role === "ADMIN";

  const loadBase = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user }, error: authError } = await sb.auth.getUser();
      if (authError || !user) throw new Error("Hết phiên đăng nhập.");
      const [p, c] = await Promise.all([
        sb.from("az_profiles").select("role").eq("id", user.id).single(),
        sb.from("cutters").select("id,name").eq("is_active", true).order("name").limit(500),
      ]);
      if (p.error || c.error) throw new Error(p.error?.message || c.error?.message);
      setRole(String(p.data?.role || ""));
      setCutters((c.data || []) as Cutter[]);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [sb]);

  useEffect(() => { void loadBase(); }, [loadBase]);

  const reload = useCallback(async () => {
    if (!manager) return false;
    setLoading(true);
    setError("");
    try {
      const { start, next } = monthRange(monthKey);
      const [j, s, t] = await Promise.all([
        sb.from("pattern_jobs")
          .select("id,entry_slip_id,job_code,pattern_code,product_name,brand,planned_qty,cutter_id,cut_date,deleted_at")
          .gte("cut_date", start)
          .lt("cut_date", next)
          .not("cutter_id", "is", null)
          .is("deleted_at", null)
          .order("cut_date", { ascending: true })
          .order("id", { ascending: true })
          .limit(3000),
        sb.from("az_cutter_settlements")
          .select("id,settlement_code,month_key,unit_price,total_qty,total_amount,note,request_key,created_by,created_at")
          .order("created_at", { ascending: false })
          .limit(1500),
        sb.from("az_cutter_transactions")
          .select("id,transaction_code,month_key,kind,amount,method,note,request_key,created_by,created_at")
          .order("created_at", { ascending: false })
          .limit(3000),
      ]);
      if (j.error || s.error || t.error) throw new Error(j.error?.message || s.error?.message || t.error?.message);

      const loadedJobs = (j.data || []) as Job[];
      const loadedSettlements = (s.data || []) as Settlement[];
      const loadedTransactions = (t.data || []) as Transaction[];
      const settlementIds = loadedSettlements.map(x => x.id);
      const slipIds = [...new Set(loadedJobs.map(x => x.entry_slip_id).filter((x): x is number => x != null))];

      const [l, sp] = await Promise.all([
        settlementIds.length
          ? sb.from("az_cutter_settlement_lines")
              .select("id,settlement_id,job_id,mam_code,cutter_id,cutter_name,pattern_code,product_name,brand,cut_date,qty,unit_price,line_total")
              .in("settlement_id", settlementIds)
              .limit(8000)
          : Promise.resolve({ data: [], error: null }),
        slipIds.length
          ? sb.from("pattern_entry_slips").select("id,mam_code").in("id", slipIds).limit(1500)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (l.error || sp.error) throw new Error(l.error?.message || sp.error?.message);

      const actorIds = [...new Set([
        ...loadedSettlements.map(x => x.created_by),
        ...loadedTransactions.map(x => x.created_by),
      ].filter(Boolean))];
      let loadedProfiles: { id: string; display_name: string }[] = [];
      if (actorIds.length) {
        const p = await sb.from("az_profiles").select("id,display_name").in("id", actorIds).limit(3000);
        if (p.error) throw new Error(p.error.message);
        loadedProfiles = (p.data || []) as { id: string; display_name: string }[];
      }

      setJobs(loadedJobs);
      setSettlements(loadedSettlements);
      setTransactions(loadedTransactions);
      setLines((l.data || []) as Line[]);
      setSlips(Object.fromEntries(((sp.data || []) as Slip[]).map(x => [x.id, x])));
      setProfiles(Object.fromEntries(loadedProfiles.map(x => [x.id, x.display_name || "Không rõ"])));
      setSelected([]);
      setCopiedSignature("");

      if (loadedJobs.length === 3000 || loadedSettlements.length === 1500 || loadedTransactions.length === 3000 || (l.data || []).length === 8000) {
        setError("Dữ liệu chạm giới hạn tải. Tạm dừng chốt/ghi tiền và bổ sung phân trang trước khi dùng dữ liệu thật.");
      }
      return true;
    } catch (e) {
      setJobs([]); setSettlements([]); setLines([]); setTransactions([]); setSlips({}); setProfiles({});
      setError(errorText(e));
      return false;
    } finally {
      setLoading(false);
    }
  }, [sb, monthKey, manager]);

  useEffect(() => { if (manager) void reload(); }, [manager, reload]);

  const settledJobIds = useMemo(() => new Set(lines.map(x => x.job_id)), [lines]);
  const cutterMap = useMemo(() => Object.fromEntries(cutters.map(x => [x.id, x.name])), [cutters]);

  const rows = useMemo<MamRow[]>(() => {
    const price = amountOk(unitPrice) ? amountValue(unitPrice) : 0;
    const map = new Map<string, Job[]>();
    for (const job of jobs) {
      if (!job.cutter_id || job.planned_qty <= 0 || settledJobIds.has(job.id)) continue;
      const slip = job.entry_slip_id != null ? slips[job.entry_slip_id] : null;
      const prefix = job.job_code?.match(/^(MAM\d+)-\d+$/)?.[1] || null;
      const mam = slip?.mam_code || prefix || job.job_code || `JOB${job.id}`;
      const key = `${job.cutter_id}:${mam}`;
      map.set(key, [...(map.get(key) || []), job]);
    }
    return [...map.entries()].map(([key, list]) => {
      const first = list[0];
      const qty = sum(list.map(x => x.planned_qty));
      const patterns = [...new Set(list.map(x => `${x.pattern_code} (${x.product_name}${x.brand ? ` ${x.brand}` : ""})`))];
      const slip = first.entry_slip_id != null ? slips[first.entry_slip_id] : null;
      const prefix = first.job_code?.match(/^(MAM\d+)-\d+$/)?.[1] || null;
      return {
        key,
        cutterId: Number(first.cutter_id),
        cutterName: cutterMap[Number(first.cutter_id)] || "Không rõ",
        mamCode: slip?.mam_code || prefix || first.job_code || `JOB${first.id}`,
        jobs: list,
        patternText: patterns.join(" | "),
        cutDate: first.cut_date || "",
        qty,
        amount: Math.round(qty * price * 100) / 100,
      };
    }).sort((a, b) => a.cutterName.localeCompare(b.cutterName, "vi") || a.cutDate.localeCompare(b.cutDate));
  }, [jobs, slips, settledJobIds, cutterMap, unitPrice]);

  const selectedRows = rows.filter(x => selected.includes(x.key));
  const selectedQty = sum(selectedRows.map(x => x.qty));
  const selectedAmount = sum(selectedRows.map(x => x.amount));
  const tableTotalRows = selectedRows.length ? selectedRows : rows;
  const copySignature = selectedRows.length && amountOk(unitPrice)
    ? `${monthKey}|${unitPrice.trim()}|${selectedRows.map(x => x.key).sort().join(",")}`
    : "";
  const copiedReady = !!copySignature && copiedSignature === copySignature;

  const monthGroups = useMemo<MonthGroup[]>(() => {
    const keys = [...new Set([
      ...settlements.map(x => x.month_key),
      ...transactions.map(x => x.month_key),
    ])].filter(Boolean);
    return keys.map(key => {
      const ss = settlements.filter(x => x.month_key === key);
      const ids = new Set(ss.map(x => x.id));
      const ll = lines.filter(x => ids.has(x.settlement_id));
      const tt = transactions.filter(x => x.month_key === key);
      const totalChot = sum(ss.map(x => x.total_amount));
      const totalAdvance = sum(tt.filter(x => x.kind === "ADVANCE").map(x => x.amount));
      const totalPayment = sum(tt.filter(x => x.kind === "PAYMENT").map(x => x.amount));
      const net = totalChot - totalAdvance - totalPayment;
      return {
        monthKey: key, settlements: ss, lines: ll, transactions: tt,
        totalChot, totalAdvance, totalPayment,
        due: Math.max(0, net), credit: Math.max(0, -net),
      };
    }).sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  }, [settlements, lines, transactions]);

  const activeMonths = monthGroups.filter(x => x.due > 0 || x.credit > 0);
  const doneMonths = monthGroups.filter(x => x.due === 0 && x.credit === 0 && x.totalChot > 0);
  const totalDue = sum(monthGroups.map(x => x.due));
  const totalCredit = sum(monthGroups.map(x => x.credit));
  const totalPaid = sum(transactions.filter(x => x.kind === "PAYMENT").map(x => x.amount));

  function toggle(key: string) {
    requestKey.current = null;
    setCopiedSignature("");
    setSelected(old => old.includes(key) ? old.filter(x => x !== key) : [...old, key]);
  }
  function selectAll() {
    requestKey.current = null;
    setCopiedSignature("");
    setSelected(selected.length === rows.length ? [] : rows.map(x => x.key));
  }

  async function submitSettlement() {
    if (!selectedRows.length || busy || !amountOk(unitPrice)) return;
    if (!copiedReady) {
      setError("Bạn phải Copy ảnh bảng kê đúng các mâm đang chọn trước khi Chốt TT.");
      return;
    }
    setBusy(true); setError(""); setOk("");
    try {
      requestKey.current ||= crypto.randomUUID();
      const { data, error: rpcError } = await sb.rpc("az_cutter_create_settlement", {
        p_month_key: monthKey,
        p_job_ids: selectedRows.flatMap(x => x.jobs.map(j => j.id)),
        p_unit_price: amountValue(unitPrice),
        p_request_key: requestKey.current,
        p_note: note.trim() || null,
      });
      if (rpcError) throw rpcError;
      setShowChotConfirm(false); setNote(""); requestKey.current = null;
      await reload();
      const result = data as { total_amount?: number; total_qty?: number } | null;
      setOk(`Đã chốt ${n(Number(result?.total_qty || selectedQty))} sản lượng · ${cash(Number(result?.total_amount || selectedAmount))}. Ứng trước của đúng ${monthText(monthKey)} được tự trừ vào công nợ.`);
    } catch (e) {
      setError(errorText(e));
    } finally { setBusy(false); }
  }

  function openMoney(kind: "ADVANCE" | "PAYMENT", targetMonth: string, due = 0) {
    setMoneyAction({ kind, monthKey: targetMonth });
    setMoneyAmount(kind === "PAYMENT" && due > 0 ? String(due) : "");
    setMoneyMethod("CHUYEN_KHOAN"); setMoneyNote(""); setError(""); requestKey.current = null;
  }

  async function submitMoney() {
    if (!moneyAction || busy || !amountOk(moneyAmount)) return;
    const value = amountValue(moneyAmount);
    const group = monthGroups.find(x => x.monthKey === moneyAction.monthKey);
    if (moneyAction.kind === "PAYMENT" && (!group || value > group.due)) {
      setError("Số tiền thanh toán vượt công nợ còn lại của tháng."); return;
    }
    if (moneyMethod === "KHAC" && moneyNote.trim().length < 3) {
      setError("Hình thức Khác cần ghi chú ít nhất 3 ký tự."); return;
    }
    setBusy(true); setError(""); setOk("");
    try {
      requestKey.current ||= crypto.randomUUID();
      const { error: rpcError } = await sb.rpc("az_cutter_add_transaction", {
        p_month_key: moneyAction.monthKey,
        p_kind: moneyAction.kind,
        p_amount: value,
        p_method: moneyMethod,
        p_note: moneyNote.trim() || null,
        p_request_key: requestKey.current,
      });
      if (rpcError) throw rpcError;
      const kind = moneyAction.kind;
      const target = moneyAction.monthKey;
      setMoneyAction(null); setMoneyAmount(""); setMoneyNote(""); requestKey.current = null;
      await reload();
      setOk(`${kind === "ADVANCE" ? "Đã ghi ứng trước" : "Đã ghi thanh toán"} ${cash(value)} cho ${monthText(target)}.`);
    } catch (e) {
      setError(errorText(e));
    } finally { setBusy(false); }
  }

  async function copyTable() {
    if (!printRef.current) return;
    if (!selectedRows.length) { setError("Hãy chọn mâm cần chốt trước khi Copy ảnh bảng kê."); return; }
    if (!amountOk(unitPrice)) { setError("Hệ số/đơn giá chưa hợp lệ."); return; }
    setError("");
    try {
      const html2canvas = (await import("html2canvas")).default;
      const clone = printRef.current.cloneNode(true) as HTMLDivElement;
      clone.style.position = "fixed";
      clone.style.left = "-10000px";
      clone.style.top = "0";
      clone.style.width = "1380px";
      clone.style.maxWidth = "1380px";
      clone.style.background = "#fff";
      clone.style.borderRadius = "16px";
      clone.style.overflow = "hidden";
      clone.style.boxShadow = "none";
      clone.querySelectorAll('[data-copy-hide="true"]').forEach(el => el.remove());

      const title = clone.querySelector('b');
      if (title instanceof HTMLElement) title.style.fontSize = '20px';
      clone.querySelectorAll('table').forEach((tableEl) => {
        const table = tableEl as HTMLTableElement;
        table.style.width = '100%';
        table.style.minWidth = '0';
        table.style.fontSize = '19px';
      });
      clone.querySelectorAll('th').forEach((el) => {
        const th = el as HTMLElement;
        th.style.fontSize = '19px';
        th.style.padding = '14px 12px';
        th.style.whiteSpace = 'nowrap';
      });
      clone.querySelectorAll('td').forEach((el) => {
        const td = el as HTMLElement;
        td.style.fontSize = '19px';
        td.style.padding = '14px 12px';
      });
      const rows = clone.querySelectorAll('table tr');
      rows.forEach((row) => {
        const cells = row.querySelectorAll('th, td');
        if (cells[0] instanceof HTMLElement) cells[0].style.width = '52px';
        if (cells[1] instanceof HTMLElement) cells[1].style.width = '170px';
        if (cells[2] instanceof HTMLElement) cells[2].style.width = '560px';
        if (cells[3] instanceof HTMLElement) cells[3].style.width = '160px';
        if (cells[4] instanceof HTMLElement) cells[4].style.width = '150px';
        if (cells[5] instanceof HTMLElement) cells[5].style.width = '120px';
        if (cells[6] instanceof HTMLElement) cells[6].style.width = '170px';
      });
      document.body.appendChild(clone);
      const canvas = await html2canvas(clone, {
        backgroundColor: "#ffffff",
        scale: 3,
        useCORS: true,
        logging: false,
      });
      clone.remove();
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Không tạo được ảnh bảng kê.");
      if (navigator.clipboard && "ClipboardItem" in window) {
        await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
        setCopiedSignature(copySignature);
        setOk("Đã copy ảnh bảng kê Thợ cắt. Bây giờ có thể Chốt TT.");
      } else {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = `tho-cat-${monthKey}.png`; a.click();
        URL.revokeObjectURL(url);
        setCopiedSignature(copySignature);
        setOk("Trình duyệt không cho copy ảnh; đã tải PNG thay thế. Bây giờ có thể Chốt TT.");
      }
    } catch (e) { setError(errorText(e)); }
  }

  if (loading && !role) return <Loading />;
  if (!manager) return <div className="panel"><Msg error="Chỉ OWNER/ADMIN được dùng Chốt TT và Công nợ Thợ cắt." /></div>;

  return <div className="stack">
    <Msg error={error} success={ok} />

    <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,.05)] sm:p-5">
      <div className="mb-4 flex justify-end">
        <button className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-[12px] font-black text-slate-600 transition hover:bg-slate-100" onClick={() => void reload()} disabled={busy || loading}><RefreshCw className="h-4 w-4" /> Tải lại số liệu</button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => setTab("CHOT")}
          className={`flex min-h-[92px] items-center gap-4 rounded-[22px] border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,.07)] ${tab === "CHOT" ? "border-rose-300 bg-rose-50 text-rose-800 shadow-[0_10px_24px_rgba(244,63,94,.10)]" : "border-slate-200 bg-white text-slate-700"}`}>
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${tab === "CHOT" ? "bg-rose-100 text-rose-600" : "bg-slate-100 text-slate-500"}`}><CheckCircle2 className="h-6 w-6" /></span>
          <span><span className="block text-[16px] font-black">Chốt TT</span><span className="mt-1 block text-[12px] font-semibold opacity-70">Chốt tiền công theo tháng</span></span>
        </button>
        <button type="button" onClick={() => setTab("DEBT")}
          className={`flex min-h-[92px] items-center gap-4 rounded-[22px] border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,.07)] ${tab === "DEBT" ? "border-blue-300 bg-blue-50 text-blue-800 shadow-[0_10px_24px_rgba(37,99,235,.10)]" : "border-slate-200 bg-white text-slate-700"}`}>
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${tab === "DEBT" ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"}`}><WalletCards className="h-6 w-6" /></span>
          <span><span className="block text-[16px] font-black">Công nợ & Thanh toán</span><span className="mt-1 block text-[12px] font-semibold opacity-70">Ứng trước, thanh toán, lịch sử</span></span>
        </button>
      </div>
    </section>

    {tab === "CHOT" && <section className="panel stack">
      <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
        <label className={label}>Tháng chốt *
          <input className={field} type="month" value={monthKey} onChange={e => { setMonthKey(e.target.value); setSelected([]); setCopiedSignature(""); requestKey.current = null; }} />
        </label>
        <label className={label}>Hệ số / đơn giá công cắt *
          <input className={field} inputMode="decimal" value={unitPrice} onChange={e => { setUnitPrice(e.target.value); setCopiedSignature(""); requestKey.current = null; }} placeholder="Theo app cũ: 0.9" />
        </label>
      </div>
      <p className="text-xs text-slate-500">App cũ dùng công thức ×0.9. Bản mới giữ ô này chỉnh được để bạn trải nghiệm trước; mỗi lần chốt sẽ khóa giá tại thời điểm chốt.</p>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Mâm chưa chốt" value={`${n(rows.length)} mâm`} />
        <Stat label="Sản lượng chưa chốt" value={n(sum(rows.map(x => x.qty)))} />
        <Stat label="Tiền dự kiến" value={cash(sum(rows.map(x => x.amount)))} />
      </div>

      <div ref={printRef} className="overflow-x-auto rounded-xl border bg-white">
        <div className="flex items-center justify-between gap-3 border-b bg-slate-50 px-4 py-3">
          <b className="text-[17px]">BẢNG KÊ CHỜ CHỐT · {monthText(monthKey).toUpperCase()}</b>
          <span className="text-sm text-slate-500">{rows.length} mâm</span>
        </div>
        <table className="w-full min-w-[920px] text-[16px]">
          <thead><tr className="bg-blue-50 text-left">
            <th data-copy-hide="true" className="w-14 px-2 py-3 text-center">Chọn</th>
            <th className="w-14 px-2 py-3 text-center">STT</th>
            <th className="w-40 px-2 py-3">Thợ cắt</th>
            <th className="px-2 py-3">Mã rập / Mẫu</th>
            <th className="w-28 px-2 py-3 text-center">Ngày cắt</th>
            <th className="w-28 px-2 py-3 text-right">Số lượng</th>
            <th className="w-28 px-2 py-3 text-right">Hệ số</th>
            <th className="w-36 px-2 py-3 text-right">Thành tiền</th>
          </tr></thead>
          <tbody>{rows.map((row, index) => <tr key={row.key} data-copy-hide={!selected.includes(row.key) ? "true" : undefined} className="border-t align-top">
            <td data-copy-hide="true" className="px-2 py-3 text-center"><input type="checkbox" checked={selected.includes(row.key)} onChange={() => toggle(row.key)} /></td>
            <td className="px-2 py-3 text-center">{index + 1}</td>
            <td className="px-2 py-3 font-bold text-slate-800">{row.cutterName}</td>
            <td className="px-2 py-3"><span className="font-bold text-blue-700">{row.patternText}</span></td>
            <td className="px-2 py-3 text-center">{shortDay(row.cutDate)}</td>
            <td className="px-2 py-3 text-right font-semibold">{n(row.qty)}</td>
            <td className="px-2 py-3 text-right">{amountOk(unitPrice) ? n(amountValue(unitPrice)) : "—"}</td>
            <td className="px-2 py-3 text-right font-extrabold text-red-600">{cash(row.amount)}</td>
          </tr>)}</tbody>
          {!!rows.length && <tfoot><tr className="border-t-2 bg-slate-50 font-extrabold">
            <td data-copy-hide="true"></td><td colSpan={4} className="px-2 py-3 text-right">TỔNG CỘNG</td>
            <td className="px-2 py-3 text-right">{n(sum(tableTotalRows.map(x => x.qty)))}</td>
            <td></td><td className="px-2 py-3 text-right text-red-700">{cash(sum(tableTotalRows.map(x => x.amount)))}</td>
          </tr></tfoot>}
        </table>
        {!rows.length && <p className="p-5 text-center text-sm text-slate-500">Không còn mâm Thợ cắt nào chưa chốt trong {monthText(monthKey)}.</p>}
      </div>

      {!!rows.length && <div className="flex flex-wrap gap-2">
        <button className="btn soft" onClick={selectAll}>{selected.length === rows.length ? "Bỏ chọn tất cả" : "Chọn tất cả"}</button>
        <span className="self-center text-sm text-slate-600">Đã chọn <b>{selectedRows.length}</b> mâm · {n(selectedQty)} sản lượng · <b>{cash(selectedAmount)}</b></span>
      </div>}
      <label className={label}>Ghi chú lần chốt<textarea className={field} rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Có thể bỏ trống" /></label>
      <div className="grid gap-2 sm:grid-cols-2">
        <button className="btn soft" onClick={() => void copyTable()} disabled={busy || !selectedRows.length || !amountOk(unitPrice)}>
          COPY ẢNH BẢNG KÊ
        </button>
        <button className="btn primary" disabled={busy || !selectedRows.length || !amountOk(unitPrice) || !copiedReady} onClick={() => setShowChotConfirm(true)}>
          CHỐT TT · {selectedRows.length} MÂM · {cash(selectedAmount)}
        </button>
      </div>
      <div className={`rounded-xl border p-3 text-sm ${copiedReady ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-900"}`}>
        {copiedReady
          ? "✓ Đã copy đúng bảng kê đang chọn. Có thể Chốt TT."
          : "Phải Copy ảnh bảng kê sau khi chọn mâm và trước khi Chốt TT. Nếu đổi mâm/tháng/hệ số thì cần Copy lại."}
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        Một tháng có thể chốt bổ sung nhiều lần. Mâm đã chốt sẽ không xuất hiện lại. Ứng trước của đúng tháng tự trừ vào công nợ tháng.
      </div>
    </section>}

    {tab === "DEBT" && <section className="stack">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Còn nợ Thợ cắt" value={cash(totalDue)} />
        <Stat label="Ứng dư theo tháng" value={cash(totalCredit)} />
        <Stat label="Đã thanh toán" value={cash(totalPaid)} />
      </div>

      <div className="panel flex flex-wrap items-center justify-between gap-3">
        <div><b className="text-lg">CÔNG NỢ THỢ CẮT</b><p className="mt-1 text-sm text-slate-600">Một tháng = một khối công nợ. Không lấy ứng tháng khác bù chéo.</p></div>
        <button className="btn soft" onClick={() => openMoney("ADVANCE", monthKey)}>+ Ứng trước</button>
      </div>

      <div className="panel stack">
        <h2 className="font-extrabold text-blue-900">CẦN XỬ LÝ · {activeMonths.length} tháng</h2>
        {activeMonths.length ? activeMonths.map(group => <MonthCard key={group.monthKey} group={group} profiles={profiles} onPay={() => openMoney("PAYMENT", group.monthKey, group.due)} onAdvance={() => openMoney("ADVANCE", group.monthKey)} />)
          : <div className="rounded-xl border bg-slate-50 p-5 text-center text-sm text-slate-500">Không có tháng nào còn nợ hoặc ứng dư.</div>}
      </div>

      {!!doneMonths.length && <details className="panel">
        <summary className="cursor-pointer font-extrabold text-green-700">✅ ĐÃ THANH TOÁN XONG · {doneMonths.length} tháng</summary>
        <div className="mt-4 stack">{doneMonths.map(group => <MonthCard key={group.monthKey} group={group} profiles={profiles} done />)}</div>
      </details>}
    </section>}

    {showChotConfirm && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 p-3" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
        <Msg error={error} />
        <h2 className="text-lg font-extrabold text-blue-900">XÁC NHẬN CHỐT TT THỢ CẮT</h2>
        <div className="mt-4 rounded-xl border bg-slate-50 p-3 text-sm leading-7">
          <div>Tháng: <b>{monthText(monthKey)}</b></div>
          <div>Mâm: <b>{selectedRows.length}</b></div>
          <div>Sản lượng: <b>{n(selectedQty)}</b></div>
          <div>Hệ số/đơn giá: <b>{n(amountValue(unitPrice))}</b></div>
          <div>Tổng tiền: <b className="text-red-600">{cash(selectedAmount)}</b></div>
        </div>
        <p className="mt-3 text-sm text-slate-600">Chốt chỉ khóa đúng các rập được chọn vào sổ Thợ cắt. Các mâm khác trong tháng vẫn có thể chốt bổ sung sau.</p>
        <div className="mt-5 grid gap-2">
          <button className="btn primary" disabled={busy} onClick={() => void submitSettlement()}>{busy ? "Đang chốt..." : "XÁC NHẬN CHỐT TT"}</button>
          <button className="btn" disabled={busy} onClick={() => { setShowChotConfirm(false); setError(""); requestKey.current = null; }}>Hủy</button>
        </div>
      </div>
    </div>}

    {moneyAction && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 p-3" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl">
        <Msg error={error} />
        <h2 className="text-lg font-extrabold text-blue-900">{moneyAction.kind === "ADVANCE" ? "ỨNG TRƯỚC THỢ CẮT" : "THANH TOÁN THỢ CẮT"}</h2>
        <p className="mt-2 text-sm text-slate-600">{monthText(moneyAction.monthKey)} · Khoản tiền này chỉ tác động đúng tháng này.</p>
        <label className={`${label} mt-4`}>Số tiền *<input className={field} inputMode="decimal" value={moneyAmount} onChange={e => { setMoneyAmount(e.target.value); requestKey.current = null; }} placeholder="Nhập số tiền" /></label>
        <label className={`${label} mt-3`}>Hình thức<select className={field} value={moneyMethod} onChange={e => { setMoneyMethod(e.target.value); requestKey.current = null; }}>
          <option value="CHUYEN_KHOAN">Chuyển khoản</option><option value="TIEN_MAT">Tiền mặt</option><option value="KHAC">Khác</option>
        </select></label>
        <label className={`${label} mt-3`}>Ghi chú<textarea className={field} rows={2} value={moneyNote} onChange={e => { setMoneyNote(e.target.value); requestKey.current = null; }} placeholder={moneyMethod === "KHAC" ? "Bắt buộc ghi chú" : "Có thể bỏ trống"} /></label>
        <div className="mt-5 grid gap-2">
          <button className="btn primary" disabled={busy || !amountOk(moneyAmount)} onClick={() => void submitMoney()}>{busy ? "Đang lưu..." : moneyAction.kind === "ADVANCE" ? "XÁC NHẬN ỨNG TRƯỚC" : "XÁC NHẬN THANH TOÁN"}</button>
          <button className="btn" disabled={busy} onClick={() => { setMoneyAction(null); setError(""); requestKey.current = null; }}>Hủy</button>
        </div>
      </div>
    </div>}
  </div>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-[20px] border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-[0_8px_22px_rgba(15,23,42,.045)]"><div className="text-[11px] font-black uppercase tracking-[.06em] text-slate-500">{label}</div><div className="mt-2 text-[24px] font-black text-[#0d2346]">{value}</div></div>;
}

function MonthCard({ group, profiles, onPay, onAdvance, done = false }: {
  group: MonthGroup;
  profiles: Record<string, string>;
  onPay?: () => void;
  onAdvance?: () => void;
  done?: boolean;
}) {
  const history = useMemo<HistoryItem[]>(() => {
    const chot = group.settlements.map(s => ({
      key: `s:${s.id}`, at: s.created_at, kind: "CHOT" as const, amount: s.total_amount,
      note: s.note || `Chốt ${n(s.total_qty)} sản lượng`, actor: profiles[s.created_by] || "Không rõ",
    }));
    const tx = group.transactions.map(t => ({
      key: `t:${t.id}`, at: t.created_at, kind: t.kind, amount: t.amount,
      note: t.note || (t.kind === "ADVANCE" ? "Ứng trước" : "Thanh toán"), actor: profiles[t.created_by] || "Không rõ",
    }));
    return [...chot, ...tx].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  }, [group, profiles]);

  const lineRows = useMemo(() => {
    const map = new Map<string, Line[]>();
    for (const line of group.lines) {
      const key = `${line.cutter_id}:${line.mam_code}`;
      map.set(key, [...(map.get(key) || []), line]);
    }
    return [...map.values()].map(list => ({
      key: `${list[0].cutter_id}:${list[0].mam_code}`,
      cutter: list[0].cutter_name,
      pattern: [...new Set(list.map(x => `${x.pattern_code} (${x.product_name}${x.brand ? ` ${x.brand}` : ""})`))].join(" | "),
      cutDate: list.map(x => x.cut_date).filter(Boolean).sort()[0] || "",
      qty: sum(list.map(x => x.qty)),
      unitPrice: list[0].unit_price,
      total: sum(list.map(x => x.line_total)),
    }));
  }, [group.lines]);

  const status = group.credit > 0 ? { text: `ỨNG DƯ ${cash(group.credit)}`, cls: "bg-amber-100 text-amber-800" }
    : group.due > 0 ? { text: `CÒN NỢ ${cash(group.due)}`, cls: "bg-red-100 text-red-700" }
    : { text: "ĐÃ XONG", cls: "bg-green-100 text-green-700" };

  return <details className={`rounded-2xl border bg-white shadow-sm ${done ? "opacity-90" : ""}`} open={!done}>
    <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-3 p-4">
      <div><div className="font-extrabold text-blue-900">{monthText(group.monthKey)}</div><div className="mt-1 text-sm text-slate-500">{group.settlements.length} lần chốt · {group.transactions.length} lần ứng/thanh toán</div></div>
      <div className="flex items-center gap-3"><span className={`rounded-full px-3 py-1 text-xs font-extrabold ${status.cls}`}>{status.text}</span><b>{cash(group.totalChot)}</b></div>
    </summary>
    <div className="border-t p-4">
      <div className="grid gap-2 sm:grid-cols-4">
        <Mini label="Tổng công cắt" value={cash(group.totalChot)} />
        <Mini label="Ứng" value={cash(group.totalAdvance)} />
        <Mini label="Đã thanh toán" value={cash(group.totalPayment)} />
        <Mini label={group.credit > 0 ? "Ứng dư" : "Còn lại"} value={cash(group.credit > 0 ? group.credit : group.due)} strong />
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border">
        <table className="w-full min-w-[840px] text-sm"><thead><tr className="bg-blue-50 text-left">
          <th className="w-14 p-2 text-center">STT</th><th className="p-2">Thợ cắt</th><th className="p-2">Mã rập / Mẫu</th><th className="p-2 text-center">Ngày cắt</th>
          <th className="p-2 text-right">SL tính công</th><th className="p-2 text-right">Hệ số</th><th className="p-2 text-right">Thành tiền</th>
        </tr></thead><tbody>{lineRows.map((r, index) => <tr key={r.key} className="border-t">
          <td className="p-2 text-center">{index + 1}</td><td className="p-2 font-bold">{r.cutter}</td><td className="p-2"><b className="text-blue-700">{r.pattern}</b></td><td className="p-2 text-center">{shortDay(r.cutDate)}</td>
          <td className="p-2 text-right">{n(r.qty)}</td><td className="p-2 text-right">{n(r.unitPrice)}</td><td className="p-2 text-right font-bold text-red-600">{cash(r.total)}</td>
        </tr>)}</tbody><tfoot><tr className="border-t-2 bg-slate-50 font-extrabold"><td colSpan={4} className="p-2 text-right">TỔNG CỘNG</td><td className="p-2 text-right">{n(sum(lineRows.map(x => x.qty)))}</td><td></td><td className="p-2 text-right text-red-700">{cash(group.totalChot)}</td></tr>
          <tr className="bg-slate-50"><td colSpan={6} className="p-2 text-right font-bold">Ứng</td><td className="p-2 text-right font-bold">-{cash(group.totalAdvance)}</td></tr>
          <tr className="bg-slate-50"><td colSpan={6} className="p-2 text-right font-bold">Đã thanh toán</td><td className="p-2 text-right font-bold">-{cash(group.totalPayment)}</td></tr>
          <tr className="bg-slate-50"><td colSpan={6} className="p-2 text-right font-extrabold">{group.credit > 0 ? "ỨNG DƯ" : "CÒN LẠI"}</td><td className={`p-2 text-right font-extrabold ${group.credit > 0 ? "text-amber-700" : group.due > 0 ? "text-red-700" : "text-green-700"}`}>{cash(group.credit > 0 ? group.credit : group.due)}</td></tr>
        </tfoot></table>
      </div>

      {!done && <div className="mt-4 flex flex-wrap gap-2">
        {group.due > 0 && onPay && <button className="btn primary" onClick={onPay}>Thanh toán tháng này</button>}
        {onAdvance && <button className="btn soft" onClick={onAdvance}>Ứng thêm tháng này</button>}
      </div>}

      <div className="mt-5"><div className="mb-2 font-extrabold text-slate-800">LỊCH SỬ CHỐT / ỨNG / THANH TOÁN</div>
        <div className="space-y-2">{history.map(h => <div key={h.key} className="grid gap-1 rounded-xl border bg-slate-50 p-3 text-sm sm:grid-cols-[170px_110px_130px_1fr]">
          <span>{dt(h.at)}</span>
          <b className={h.kind === "CHOT" ? "text-blue-700" : h.kind === "ADVANCE" ? "text-amber-700" : "text-green-700"}>{h.kind === "CHOT" ? "CHỐT" : h.kind === "ADVANCE" ? "ỨNG" : "THANH TOÁN"}</b>
          <b>{h.kind === "CHOT" ? "+" : "-"}{cash(h.amount)}</b>
          <span>{h.note} · <i>{h.actor}</i></span>
        </div>)}</div>
      </div>
    </div>
  </details>;
}

function Mini({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return <div className="rounded-xl border bg-slate-50 p-3"><div className="text-xs font-bold text-slate-500">{label}</div><div className={`mt-1 ${strong ? "text-lg font-extrabold" : "font-bold"}`}>{value}</div></div>;
}
