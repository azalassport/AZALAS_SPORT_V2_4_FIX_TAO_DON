"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loading, Msg } from "@/components/ui";
import { dt, errorText } from "@/lib/azalas/format";
import { CheckCircle2, Factory, WalletCards } from "lucide-react";

type House = { id: number; name: string };

type Job = {
  id: number;
  entry_slip_id: number | null;
  job_code: string | null;
  order_type: string;
  pattern_code: string;
  product_name: string;
  brand: string | null;
  size_range: string | null;
  size_ratio: string | null;
  layer_count: number | null;
  planned_qty: number;
  received_qty: number;
  sewing_price: number;
  status: string;
  forced_closed_at: string | null;
  paid_at: string | null;
};

type Settlement = {
  id: number;
  settlement_code: string;
  house_id: number;
  total_qty: number;
  total_amount: number;
  note: string | null;
  created_at: string;
  settlement_kind?: "MAIN" | "VET";
  vet_items?: unknown;
  request_key?: string | null;
  vet_request_key?: string | null;
};

type SettlementGroup = {
  key: string;
  settlements: Settlement[];
  createdAt: string;
  totalAmount: number;
  dueAmount: number;
};

type Line = {
  id: number;
  settlement_id: number;
  job_id: number;
  mam_code: string;
  job_code: string | null;
  pattern_code: string;
  product_name: string;
  brand: string | null;
  layer_count: number | null;
  size_range: string | null;
  size_ratio: string | null;
  received_qty: number;
  unit_price: number;
  line_total: number;
};

type Transaction = {
  id: number;
  transaction_code: string;
  kind: "PAYMENT" | "ADVANCE";
  amount: number;
  method: string;
  note: string | null;
  created_at: string;
};

type Allocation = {
  id: number;
  transaction_id: number;
  settlement_id: number;
  amount: number;
  created_at: string;
};

type PatternEvent = {
  id: number;
  job_id: number;
  action: string;
  detail: unknown;
  occurred_at: string;
  actor_id: string;
};

type VetStatus = {
  job_id: number; vet_received_qty: number; effective_received_qty: number;
  main_settled_qty: number; vet_settled_qty: number; accounted_qty: number;
  unaccounted_vet_qty: number; missing_qty: number; has_main: boolean; has_unpaid: boolean;
};

type VetItem = {
  anchor_job_id?: number; job_id: number; mam_code: string; job_code?: string | null;
  pattern_code: string; product_name: string; brand?: string | null; qty: number;
  unit_price: number; line_total: number; received_after?: number; missing_after?: number;
};

type Mam = {
  key: string;
  code: string;
  jobs: Job[];
  eligible: boolean;
  reason: string;
  received: number;
  planned: number;
  missing: number;
  amount: number;
  hasMain: boolean;
  accounted: number;
  vetWaiting: number;
  vetAmount: number;
  vetEligible: boolean;
};

type Action = {
  kind: "PAY_GROUP" | "ADVANCE" | "ALLOCATE_GROUP";
  settlementIds?: number[];
};
type PriceEdit = { mam: Mam; value: string };

const n = (v: number) => Number(v || 0).toLocaleString("vi-VN");
const cash = (v: number) =>
  `${Number(v || 0).toLocaleString("vi-VN", { maximumFractionDigits: 2 })} đ`;
const toCents = (v: number) => Math.round(Number(v || 0) * 100);
const sum = (items: number[]) => items.reduce((a, b) => a + b, 0);
const sumMoney = (values: number[]) => sum(values.map(toCents)) / 100;
const field = "field mt-1 w-full";
const label = "block text-sm font-bold text-slate-700";
const amountOk = (text: string) =>
  /^\d+(?:\.\d{1,2})?$/.test(text.trim()) && Number(text) > 0;
const ratioTotal = (value: string | null | undefined) =>
  String(value || "").replace(/\D/g, "").split("").reduce((total, x) => total + Number(x || 0), 0);
const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function HouseLedger() {
  const sb = useMemo(() => createClient(), []);
  const [role, setRole] = useState("");
  const [houses, setHouses] = useState<House[]>([]);
  const [houseId, setHouseId] = useState("");
  const [tab, setTab] = useState<"CHOT" | "DEBT">("CHOT");

  const [jobs, setJobs] = useState<Job[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [patternEvents, setPatternEvents] = useState<PatternEvent[]>([]);
  const [vetStatus, setVetStatus] = useState<Record<number, VetStatus>>({});

  const [selected, setSelected] = useState<number[]>([]);
  const [selectedVet, setSelectedVet] = useState<number[]>([]);
  const [note, setNote] = useState("");
  const [vetNote, setVetNote] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [priceEdit, setPriceEdit] = useState<PriceEdit | null>(null);
  const [showSettlementConfirm, setShowSettlementConfirm] = useState(false);
  const [showVetConfirm, setShowVetConfirm] = useState(false);

  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("CHUYEN_KHOAN");
  const [actionNote, setActionNote] = useState("");
  const [advanceId, setAdvanceId] = useState("");

  const [error, setError] = useState("");
  const [ok, setOk] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const requestKey = useRef<string | null>(null);
  const printRef = useRef<HTMLDivElement>(null);
  const vetSectionRef = useRef<HTMLTableRowElement>(null);
  const deepLinkApplied = useRef(false);
  const focusVetRequested = useRef(false);
  const autoAdvanceSyncRunning = useRef(false);

  const loadHouses = useCallback(async () => {
    setLoading(true);
    try {
      const { data: { user }, error: authError } = await sb.auth.getUser();
      if (authError || !user) throw new Error("Hết phiên đăng nhập.");

      const [p, h] = await Promise.all([
        sb.from("az_profiles").select("role").eq("id", user.id).single(),
        sb.from("sewing_houses").select("id,name").order("name").limit(500),
      ]);
      if (p.error || h.error) throw new Error(p.error?.message || h.error?.message);

      setRole(String(p.data?.role || ""));
      setHouses((h.data || []) as House[]);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }, [sb]);

  useEffect(() => {
    void loadHouses();
  }, [loadHouses]);

  useEffect(() => {
    if (deepLinkApplied.current || houses.length === 0 || typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const requestedHouse = params.get("house");
    const focus = params.get("focus");

    if (focus === "vet") {
      setTab("CHOT");
      focusVetRequested.current = true;
    }

    if (requestedHouse && houses.some(h => String(h.id) === requestedHouse)) {
      setHouseId(requestedHouse);
    }
    deepLinkApplied.current = true;
  }, [houses]);

  const reload = useCallback(async () => {
    if (!houseId) {
      setJobs([]);
      setSettlements([]);
      setLines([]);
      setTransactions([]);
      setAllocations([]);
      setPatternEvents([]);
      setVetStatus({});
      setSelectedVet([]);
      return true;
    }

    setLoading(true);
    try {
      const house = Number(houseId);
      const [j, s, t] = await Promise.all([
        sb.from("pattern_jobs")
          .select("id,entry_slip_id,job_code,order_type,pattern_code,product_name,brand,size_range,size_ratio,layer_count,planned_qty,received_qty,sewing_price,status,forced_closed_at,paid_at")
          .eq("sewing_house_id", house)
          .is("deleted_at", null)
          .order("id", { ascending: false })
          .limit(2000),
        sb.from("az_house_settlements")
          .select("id,settlement_code,house_id,total_qty,total_amount,note,created_at,settlement_kind,vet_items,request_key,vet_request_key")
          .eq("house_id", house)
          .order("created_at", { ascending: false })
          .limit(1000),
        sb.from("az_house_transactions")
          .select("id,transaction_code,kind,amount,method,note,created_at")
          .eq("house_id", house)
          .order("created_at", { ascending: false })
          .limit(1000),
      ]);

      if (j.error || s.error || t.error)
        throw new Error(j.error?.message || s.error?.message || t.error?.message);

      const loadedSettlements = (s.data || []) as Settlement[];
      const loadedTransactions = (t.data || []) as Transaction[];
      const loadedJobs = (j.data || []) as Job[];
      const settlementIds = loadedSettlements.map(x => x.id);
      const transactionIds = loadedTransactions.map(x => x.id);
      const jobIds = loadedJobs.map(x => x.id);

      const [l, a, e, v] = await Promise.all([
        settlementIds.length
          ? sb.from("az_house_settlement_lines")
              .select("id,settlement_id,job_id,mam_code,job_code,pattern_code,product_name,brand,layer_count,size_range,size_ratio,received_qty,unit_price,line_total")
              .in("settlement_id", settlementIds)
              .limit(5000)
          : Promise.resolve({ data: [], error: null }),
        transactionIds.length
          ? sb.from("az_house_payment_allocations")
              .select("id,transaction_id,settlement_id,amount,created_at")
              .in("transaction_id", transactionIds)
              .limit(5000)
          : Promise.resolve({ data: [], error: null }),
        jobIds.length
          ? sb.from("pattern_events")
              .select("id,job_id,action,detail,occurred_at,actor_id")
              .in("job_id", jobIds)
              .eq("action", "SUA_TT_MAM")
              .order("occurred_at", { ascending: false })
              .limit(5000)
          : Promise.resolve({ data: [], error: null }),
        jobIds.length
          ? sb.rpc("az_house_vet_status", { p_job_ids: jobIds })
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (l.error || a.error || e.error || v.error) throw new Error(l.error?.message || a.error?.message || e.error?.message || v.error?.message);

      setJobs(loadedJobs);
      setSettlements(loadedSettlements);
      setTransactions(loadedTransactions);
      setLines((l.data || []) as Line[]);
      setAllocations((a.data || []) as Allocation[]);
      setPatternEvents((e.data || []) as PatternEvent[]);
      const loadedVet = (v.data || []) as VetStatus[];
      setVetStatus(Object.fromEntries(loadedVet.map(row => [row.job_id, row])));
      setSelected([]);
      setSelectedVet([]);

      if (
        (j.data || []).length === 2000 ||
        loadedSettlements.length === 1000 ||
        loadedTransactions.length === 1000 ||
        (l.data || []).length === 5000 ||
        (a.data || []).length === 5000 ||
        (e.data || []).length === 5000
      ) {
        setError("Dữ liệu vượt giới hạn trang. Tạm dừng chốt/ghi tiền; cần bổ sung phân trang để tránh tính thiếu.");
      } else {
        setError("");
      }
      return true;
    } catch (e) {
      setJobs([]);
      setSettlements([]);
      setLines([]);
      setTransactions([]);
      setAllocations([]);
      setPatternEvents([]);
      setVetStatus({});
      setError(errorText(e));
      return false;
    } finally {
      setLoading(false);
    }
  }, [sb, houseId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const busyLimit =
    jobs.length >= 2000 ||
    settlements.length >= 1000 ||
    transactions.length >= 1000 ||
    lines.length >= 5000 ||
    allocations.length >= 5000 ||
    patternEvents.length >= 5000;

  const settledJobIds = useMemo(() => new Set(lines.map(x => x.job_id)), [lines]);

  const mams = useMemo<Mam[]>(() => {
    const map = new Map<string, Job[]>();

    for (const j of jobs) {
      const prefix = j.job_code?.match(/^(MAM\d+)-\d+$/)?.[1];
      const key = j.entry_slip_id != null ? `slip:${j.entry_slip_id}` : prefix ? `mam:${prefix}` : `job:${j.id}`;
      map.set(key, [...(map.get(key) || []), j]);
    }

    return [...map].map(([key, items]) => {
      const sorted = [...items].sort((a, b) => a.id - b.id);
      const code = sorted[0].job_code?.match(/^(MAM\d+)-\d+$/)?.[1] || sorted[0].job_code || `RAP${sorted[0].id}`;
      const planned = sum(sorted.map(j => Number(j.planned_qty || 0)));
      const received = sum(sorted.map(j => Number(vetStatus[j.id]?.effective_received_qty ?? j.received_qty)));
      const missing = Math.max(0, planned - received);
      const hasMain = sorted.some(j => Boolean(vetStatus[j.id]?.has_main));
      const accounted = sum(sorted.map(j => Number(vetStatus[j.id]?.accounted_qty || 0)));
      const vetWaiting = sum(sorted.map(j => Number(vetStatus[j.id]?.unaccounted_vet_qty || 0)));
      const amount = sumMoney(sorted.map(j => Number(j.received_qty || 0) * Number(j.sewing_price || 0)));
      const vetAmount = sumMoney(sorted.map(j => {
        const qty = Number(vetStatus[j.id]?.unaccounted_vet_qty || 0);
        const locked = lines.find(line => line.job_id === j.id)?.unit_price;
        return qty * Number(locked ?? j.sewing_price ?? 0);
      }));
      const forced = sorted.every(j => Boolean(j.forced_closed_at));
      const priced = sorted.every(j => Number(j.sewing_price) > 0);
      const eligible = !hasMain && received > 0 && (missing <= 20 || forced) && priced &&
        sorted.every(j => j.status !== "DA_XOA");
      const vetEligible = hasMain && vetWaiting > 0 && vetAmount > 0;
      const reason = hasMain ? "Mâm đã có bảng kê chính" : received === 0 ? "Chưa nhận hàng" :
        missing > 20 && !forced ? `Còn thiếu ${n(missing)} chiếc (>20); cần giao thêm hoặc Ép chốt` :
        !priced ? "Thiếu đơn giá may" : "Đủ điều kiện chốt";
      return { key, code, jobs: sorted, eligible, reason, planned, received, missing, amount,
        hasMain, accounted, vetWaiting, vetAmount, vetEligible };
    }).sort((a, b) => b.jobs[0].id - a.jobs[0].id);
  }, [jobs, lines, vetStatus]);

  const eligibleMams = mams.filter(m => m.eligible);
  const selectedMams = mams.filter(m => selected.includes(m.jobs[0].id) && m.eligible);
  const selectedAmount = sumMoney(selectedMams.map(m => m.amount));
  const vetMams = mams.filter(m => m.vetEligible);
  const selectedVetMams = vetMams.filter(m => selectedVet.includes(m.jobs[0].id));
  const selectedVetAmount = sumMoney(selectedVetMams.map(m => m.vetAmount));
  const selectedVetQty = sum(selectedVetMams.map(m => m.vetWaiting));


  useEffect(() => {
    if (!focusVetRequested.current || loading || !houseId || !vetSectionRef.current) return;
    const timer = window.setTimeout(() => {
      vetSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      focusVetRequested.current = false;
    }, 120);
    return () => window.clearTimeout(timer);
  }, [loading, houseId, vetMams.length]);

  const hasAnySelection = selected.length > 0 || selectedVet.length > 0;
  const copyMams = hasAnySelection ? eligibleMams.filter(m => selected.includes(m.jobs[0].id)) : eligibleMams;
  const copyVetMams = hasAnySelection ? vetMams.filter(m => selectedVet.includes(m.jobs[0].id)) : vetMams;
  const copyAmount = sumMoney([
    ...copyMams.map(m => m.amount),
    ...copyVetMams.map(m => m.vetAmount),
  ]);
  const selectedAllCount = selectedMams.length + selectedVetMams.length;
  const selectedAllAmount = sumMoney([selectedAmount, selectedVetAmount]);

  const allocatedTo = (id: number) =>
    sumMoney(allocations.filter(a => a.settlement_id === id).map(a => a.amount));
  const usedFrom = (id: number) =>
    sumMoney(allocations.filter(a => a.transaction_id === id).map(a => a.amount));
  const due = (s: Settlement) =>
    Math.max(0, (toCents(s.total_amount) - toCents(allocatedTo(s.id))) / 100);

  const grossDue = sumMoney(settlements.map(due));

  const advances = transactions
    .filter(t => t.kind === "ADVANCE")
    .map(t => ({
      ...t,
      available: Math.max(0, (toCents(t.amount) - toCents(usedFrom(t.id))) / 100),
    }));

  const credit = sumMoney(advances.map(t => t.available));
  const activeAdvances = advances.filter(t => t.available > 0);

  // Một lần bấm CHỐT TT CHUNG tạo 2 chứng từ vật lý (MỚI + VÉT),
  // nhưng cả hai dùng cùng request key nghiệp vụ. Công nợ phải hiển thị thành
  // MỘT lần chốt; bên trong mới phân biệt từng phần MỚI / VÉT.
  const settlementGroups = useMemo<SettlementGroup[]>(() => {
    const map = new Map<string, Settlement[]>();

    for (const settlement of settlements) {
      const businessRequestKey = settlement.settlement_kind === "VET"
        ? settlement.vet_request_key || settlement.request_key
        : settlement.request_key || settlement.vet_request_key;
      const key = businessRequestKey ? `request:${businessRequestKey}` : `settlement:${settlement.id}`;
      map.set(key, [...(map.get(key) || []), settlement]);
    }

    return [...map.entries()].map(([key, items]) => {
      const ordered = [...items].sort((a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      const createdAt = ordered[0]?.created_at || "";
      const totalAmount = sumMoney(ordered.map(item => Number(item.total_amount || 0)));
      const dueAmount = sumMoney(ordered.map(item => {
        const allocated = sumMoney(allocations
          .filter(allocation => allocation.settlement_id === item.id)
          .map(allocation => allocation.amount));
        return Math.max(0, (toCents(item.total_amount) - toCents(allocated)) / 100);
      }));
      return { key, settlements: ordered, createdAt, totalAmount, dueAmount };
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [settlements, allocations]);

  const outstandingGroups = settlementGroups.filter(group => group.dueAmount > 0);
  const settledGroups = settlementGroups.filter(group => group.dueAmount === 0);
  const selectedHouse = houses.find(h => String(h.id) === houseId);
  const manager = role === "OWNER" || role === "ADMIN";

  // Sau khi nâng cấp migration 29, dữ liệu cũ có công nợ + ứng trước chưa phân bổ
  // cũng được tự đồng bộ một lần. Dữ liệu chốt mới đã auto phân bổ ngay trong SQL.
  useEffect(() => {
    if (loading || !manager || !houseId || credit <= 0 || grossDue <= 0 || autoAdvanceSyncRunning.current) return;

    autoAdvanceSyncRunning.current = true;
    void (async () => {
      try {
        const syncKey = crypto.randomUUID();
        const { data, error: syncError } = await sb.rpc("az_house_auto_allocate_advances", {
          p_house_id: Number(houseId),
          p_request_key: syncKey,
        });
        if (syncError) throw syncError;
        const allocated = Number((data as { allocated_amount?: number } | null)?.allocated_amount || 0);
        if (allocated > 0) {
          await reload();
          setOk(`Đã tự động dùng ${cash(allocated)} tiền ứng trước để trừ công nợ.`);
        }
      } catch (e) {
        setError(errorText(e));
      } finally {
        autoAdvanceSyncRunning.current = false;
      }
    })();
  }, [loading, manager, houseId, credit, grossDue, sb, reload]);

  function latestMamLayerChange(mam: Mam) {
    const ids = new Set(mam.jobs.map(job => job.id));
    const event = patternEvents.find(e => ids.has(e.job_id) && e.action === "SUA_TT_MAM" &&
      asRecord(e.detail).event_type === "SUA_SO_LOP_MAM");
    return event ? asRecord(event.detail) : null;
  }

  function mamFormula(mam: Mam) {
    const ratios = [...new Set(mam.jobs.map(job => ratioTotal(job.size_ratio)).filter(value => value > 0))];
    const commonRatio = ratios.length === 1 ? ratios[0] : 0;
    const totalLayers = mam.jobs.reduce((total, job) => total + Number(job.layer_count || 0), 0);
    const current = commonRatio
      ? `${n(totalLayers)}×${commonRatio}=${n(mam.planned)}`
      : `${n(totalLayers)} lớp · ${n(mam.planned)} chiếc`;
    const change = latestMamLayerChange(mam);
    if (!change) return { current, old: "" };
    const oldRatio = Number(change.ratio_total || commonRatio || 0);
    const old = oldRatio
      ? `${n(Number(change.old_layer_count || 0))}×${oldRatio}=${n(Number(change.old_planned_qty || 0))}`
      : `${n(Number(change.old_layer_count || 0))} lớp · ${n(Number(change.old_planned_qty || 0))} chiếc`;
    return { current, old };
  }

  function toggle(id: number) {
    requestKey.current = null;
    setSelected(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]);
  }

  function toggleVet(id: number) {
    requestKey.current = null;
    setSelectedVet(old => old.includes(id) ? old.filter(x => x !== id) : [...old, id]);
  }

  async function runRpc(
    fn: string,
    args: Record<string, unknown>,
    success: string,
    showCode = true,
  ) {
    setBusy(true);
    setError("");
    setOk("");

    try {
      const { data, error: rpcError } = await sb.rpc(fn, args);
      if (rpcError) throw rpcError;

      setAction(null);
      setPriceEdit(null);
      setShowSettlementConfirm(false);
      setShowVetConfirm(false);
      setSelectedVet([]);
      setVetNote("");
      setAmount("");
      setActionNote("");
      setNote("");
      requestKey.current = null;

      const loaded = await reload();
      setOk(
        loaded
          ? `${success}${showCode && (data as { code?: string } | null)?.code ? ` · ${(data as { code: string }).code}` : ""}`
          : "Giao dịch đã ghi thành công trên Supabase nhưng chưa tải lại được dữ liệu. Đừng bấm ghi lần nữa; hãy thử Tải lại.",
      );
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }

  function openPriceEdit(m: Mam) {
    const currentPrices = [...new Set(m.jobs.map(j => Number(j.sewing_price || 0)))];
    const defaultPrice =
      currentPrices.length === 1 && currentPrices[0] > 0
        ? String(currentPrices[0])
        : "";
    setError("");
    setPriceEdit({ mam: m, value: defaultPrice });
  }

  async function submitPriceEdit() {
    if (!priceEdit || busy) return;
    if (!amountOk(priceEdit.value))
      return setError("Đơn giá phải lớn hơn 0, tối đa hai chữ số thập phân.");

    await runRpc(
      "az_house_update_mam_price",
      {
        p_job_id: priceEdit.mam.jobs[0].id,
        p_price: Number(priceEdit.value),
      },
      "Đã cập nhật đơn giá toàn mâm",
    );
  }

  function openSettlementConfirm() {
    if (busyLimit || selectedAllCount < 1 || !houseId) return;
    setError("");
    setShowSettlementConfirm(true);
  }

  async function submitSettlement() {
    if (busyLimit || selectedAllCount < 1 || !houseId || busy) return;
    requestKey.current ||= crypto.randomUUID();

    await runRpc(
      "az_house_create_combined_settlements",
      {
        p_house_id: Number(houseId),
        p_main_job_ids: selectedMams.map(m => m.jobs[0].id),
        p_vet_job_ids: selectedVetMams.map(m => m.jobs[0].id),
        p_request_key: requestKey.current,
        p_note: note.trim() || null,
      },
      "Đã chốt TT; ứng trước khả dụng đã được tự động phân bổ vào lần chốt",
      false,
    );
  }

  function openVetConfirm() {
    if (busyLimit || !selectedVetMams.length || !houseId) return;
    setError("");
    setShowVetConfirm(true);
  }

  async function submitVetSettlement() {
    if (busyLimit || !selectedVetMams.length || !houseId || busy) return;
    requestKey.current ||= crypto.randomUUID();
    await runRpc(
      "az_house_create_vet_settlement",
      {
        p_house_id: Number(houseId),
        p_job_ids: selectedVetMams.map(m => m.jobs[0].id),
        p_request_key: requestKey.current,
        p_note: vetNote.trim() || null,
      },
      "Đã lập bảng kê VÉT riêng, chưa thanh toán",
    );
  }

  function openAction(next: Action) {
    const ids = next.settlementIds || [];
    const groupDue = sumMoney(settlements.filter(s => ids.includes(s.id)).map(due));
    setAction(next);
    setAmount(next.kind === "ADVANCE" ? "" : String(groupDue));
    setActionNote("");
    setMethod("CHUYEN_KHOAN");
    setAdvanceId(String(activeAdvances[0]?.id || ""));
    setError("");
    requestKey.current = null;
  }

  async function submitAction() {
    if (!action || !houseId || busyLimit || busy || !amountOk(amount))
      return setError("Nhập số tiền hợp lệ, lớn hơn 0.");

    if (
      method === "KHAC" &&
      action.kind !== "ALLOCATE_GROUP" &&
      actionNote.trim().length < 3
    ) {
      return setError("Phương thức khác cần ghi chú ít nhất 3 ký tự.");
    }

    const value = Number(amount);
    const settlementIds = action.settlementIds || [];
    const groupDue = sumMoney(settlements.filter(s => settlementIds.includes(s.id)).map(due));

    if (action.kind !== "ADVANCE" && (!settlementIds.length || value > groupDue))
      return setError("Số tiền vượt công nợ còn lại của lần chốt.");

    if (
      action.kind === "ALLOCATE_GROUP" &&
      value > Number(activeAdvances.find(t => String(t.id) === advanceId)?.available || 0)
    ) {
      return setError("Khoản ứng trước không đủ số dư.");
    }

    requestKey.current ||= crypto.randomUUID();

    if (action.kind === "ADVANCE") {
      await runRpc(
        "az_house_create_advance",
        {
          p_house_id: Number(houseId),
          p_amount: value,
          p_method: method,
          p_note: actionNote.trim() || null,
          p_request_key: requestKey.current,
        },
        "Đã ghi ứng trước (chưa phân bổ)",
      );
    } else if (action.kind === "PAY_GROUP") {
      await runRpc(
        "az_house_pay_settlement_group",
        {
          p_settlement_ids: settlementIds,
          p_amount: value,
          p_method: method,
          p_note: actionNote.trim() || null,
          p_request_key: requestKey.current,
        },
        "Đã ghi thanh toán chung cho lần chốt",
      );
    } else {
      await runRpc(
        "az_house_allocate_advance_group",
        {
          p_transaction_id: Number(advanceId),
          p_settlement_ids: settlementIds,
          p_amount: value,
          p_request_key: requestKey.current,
        },
        "Đã phân bổ ứng trước chung cho lần chốt",
      );
    }
  }

  async function copyTable() {
    if (!printRef.current) return;

    setError("");
    setOk("");
    let host: HTMLDivElement | null = null;

    try {
      const html2canvas = (await import("html2canvas")).default;
      const source = printRef.current;
      const clone = source.cloneNode(true) as HTMLDivElement;

      clone.querySelectorAll('[data-copy-remove="true"]').forEach(node => node.remove());
      clone.querySelectorAll('[data-copy-row-remove="true"]').forEach(node => node.remove());
      clone.style.width = `${Math.max(source.clientWidth, 900)}px`;
      clone.style.maxWidth = "none";
      clone.style.overflow = "visible";
      clone.style.background = "#ffffff";

      host = document.createElement("div");
      host.style.position = "fixed";
      host.style.left = "-20000px";
      host.style.top = "0";
      host.style.zIndex = "-1";
      host.style.background = "#ffffff";
      host.appendChild(clone);
      document.body.appendChild(host);

      const canvas = await html2canvas(clone, {
        backgroundColor: "#ffffff",
        scale: 2,
        useCORS: true,
        width: clone.scrollWidth,
        height: clone.scrollHeight,
        windowWidth: clone.scrollWidth,
      });

      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
      if (!blob || !navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        throw new Error("Trình duyệt không hỗ trợ copy ảnh bảng kê. Hãy dùng Chrome qua HTTPS hoặc localhost.");
      }
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      setOk("Đã copy ảnh bảng kê vào clipboard.");
    } catch (e) {
      setError(errorText(e));
    } finally {
      host?.remove();
    }
  }

  return (
    <div className="stack">
      <Msg error={error} success={ok} />

      <div className="grid gap-3 sm:grid-cols-2">
        <button type="button" onClick={() => setTab("CHOT")}
          className={`flex min-h-[92px] items-center gap-4 rounded-[22px] border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,.07)] ${tab === "CHOT" ? "border-violet-300 bg-violet-50 text-violet-800 shadow-[0_10px_24px_rgba(124,58,237,.10)]" : "border-slate-200 bg-white text-slate-700"}`}>
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${tab === "CHOT" ? "bg-violet-100 text-violet-600" : "bg-slate-100 text-slate-500"}`}><CheckCircle2 className="h-6 w-6" /></span>
          <span><span className="block text-[16px] font-black">Chốt TT</span><span className="mt-1 block text-[12px] font-semibold opacity-70">Bảng kê mâm chờ chốt</span></span>
        </button>
        <button type="button" onClick={() => setTab("DEBT")}
          className={`flex min-h-[92px] items-center gap-4 rounded-[22px] border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-[0_12px_28px_rgba(15,23,42,.07)] ${tab === "DEBT" ? "border-blue-300 bg-blue-50 text-blue-800 shadow-[0_10px_24px_rgba(37,99,235,.10)]" : "border-slate-200 bg-white text-slate-700"}`}>
          <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${tab === "DEBT" ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"}`}><WalletCards className="h-6 w-6" /></span>
          <span><span className="block text-[16px] font-black">Công nợ & Thanh toán</span><span className="mt-1 block text-[12px] font-semibold opacity-70">Ứng trước, thanh toán, lịch sử</span></span>
        </button>
      </div>

      <section className="rounded-[24px] border border-violet-100 bg-white p-5 shadow-[0_10px_28px_rgba(15,23,42,.05)]">
        <label className={label}>
          <span className="mb-2 flex items-center gap-2 text-[12px] font-black uppercase tracking-[.07em] text-violet-700"><Factory className="h-4 w-4" /> Chọn nhà may *</span>
          <select
            className={field}
            value={houseId}
            disabled={busy}
            onChange={e => {
              setHouseId(e.target.value);
              setJobs([]);
              setSettlements([]);
              setLines([]);
              setTransactions([]);
              setAllocations([]);
              setAction(null);
              setPriceEdit(null);
              setShowSettlementConfirm(false);
              setShowVetConfirm(false);
              setError("");
              setOk("");
              setSelected([]);
              setSelectedVet([]);
              setVetNote("");
              requestKey.current = null;
            }}
          >
            <option value="">— Chọn nhà may —</option>
            {houses.map(h => (
              <option key={h.id} value={h.id}>
                {h.name}
              </option>
            ))}
          </select>
        </label>
      </section>

      {loading && <Loading />}

      {!loading && !manager && (
        <p className="panel text-red-700">
          Chỉ OWNER/ADMIN được xem và ghi công nợ Nhà may.
        </p>
      )}

      {!loading && manager && !houseId && (
        <p className="panel text-slate-600">
          Chọn nhà may để xem mâm cần chốt hoặc các bảng kê, ứng trước và thanh toán.
        </p>
      )}

      {!loading && manager && houseId && tab === "CHOT" && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,.045)]">
              <span>Mâm mới đủ chốt</span>
              <strong>{eligibleMams.length} mâm</strong>
            </div>
            <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,.045)]">
              <span>Hàng vét chờ tính</span>
              <strong>{vetMams.length} mâm · {n(sum(vetMams.map(m => m.vetWaiting)))} cái</strong>
            </div>
            <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,.045)]">
              <span>Đã chọn</span>
              <strong>{selectedAllCount} dòng</strong>
            </div>
            <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,.045)]">
              <span>Tiền đang chọn</span>
              <strong>{cash(selectedAllAmount)}</strong>
            </div>
          </div>

          <section className="panel stack">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold">
                  Bảng chốt của nhà may {selectedHouse?.name}
                </h2>
                <p className="text-sm text-slate-600">
                  Mâm mới đủ điều kiện nằm phía trên. Hàng vét nằm ngay bên dưới trong cùng bảng và được đánh dấu VÉT màu nâu đỏ.
                </p>
              </div>

              <button
                className="btn soft"
                disabled={busy || busyLimit || (!eligibleMams.length && !vetMams.length)}
                onClick={() => {
                  const allMain = eligibleMams.length === 0 || selectedMams.length === eligibleMams.length;
                  const allVet = vetMams.length === 0 || selectedVetMams.length === vetMams.length;
                  const allSelected = allMain && allVet && (eligibleMams.length + vetMams.length > 0);
                  requestKey.current = null;
                  setSelected(allSelected ? [] : eligibleMams.map(m => m.jobs[0].id));
                  setSelectedVet(allSelected ? [] : vetMams.map(m => m.jobs[0].id));
                }}
              >
                {(eligibleMams.length + vetMams.length > 0) &&
                (eligibleMams.length === 0 || selectedMams.length === eligibleMams.length) &&
                (vetMams.length === 0 || selectedVetMams.length === vetMams.length)
                  ? "Bỏ chọn tất cả"
                  : "Chọn tất cả đủ điều kiện"}
              </button>
            </div>

            <div ref={printRef} className="overflow-x-auto rounded-xl border bg-white">
              <div className="border-b px-3 py-3 text-[17px] font-semibold">
                BẢNG KÊ CHỜ CHỐT · {selectedHouse?.name}
              </div>

              <table className="w-full min-w-[980px] table-fixed text-[17px]">
                <colgroup>
                  <col data-copy-remove="true" className="w-[48px]" />
                  <col className="w-[54px]" />
                  <col className="w-[82px]" />
                  <col />
                  <col className="w-[145px]" />
                  <col className="w-[135px]" />
                  <col className="w-[105px]" />
                  <col className="w-[150px]" />
                  <col className="w-[155px]" />
                </colgroup>
                <thead>
                  <tr className="bg-blue-50 text-left">
                    <th data-copy-remove="true" className="px-2 py-3 text-center">Chọn</th>
                    <th className="px-2 py-3 text-center">STT</th>
                    <th className="px-2 py-3 text-center">Loại</th>
                    <th className="px-2 py-3">Mã rập</th>
                    <th className="px-2 py-3 text-center">Số lớp / Đã tính</th>
                    <th className="px-2 py-3 text-right">Nhận / Vét mới</th>
                    <th className="px-2 py-3 text-right">Thiếu / Dư</th>
                    <th className="px-2 py-3 text-right">Đơn giá</th>
                    <th className="px-2 py-3 text-right">Thành tiền</th>
                  </tr>
                </thead>

                <tbody>
                  {eligibleMams.map((m, index) => {
                    const brands = [...new Set(m.jobs.map(j => (j.brand || "").trim()).filter(Boolean))];
                    const prices: number[] = [...new Set<number>(m.jobs.map(j => Number(j.sewing_price || 0)))];
                    const product = m.jobs[0].product_name;
                    return <tr
                      key={`main-${m.key}`}
                      data-copy-row-remove={hasAnySelection && !selected.includes(m.jobs[0].id) ? "true" : undefined}
                      className="border-t align-top"
                    >
                      <td data-copy-remove="true" className="px-2 py-3 text-center">
                        <input type="checkbox" aria-label={`Chọn mâm mới ${m.jobs[0].pattern_code}`}
                          checked={selected.includes(m.jobs[0].id)} disabled={busy || busyLimit}
                          onChange={() => toggle(m.jobs[0].id)}/>
                      </td>
                      <td className="px-2 py-3 text-center">{index + 1}</td>
                      <td className="px-2 py-3 text-center">
                        <span className="inline-flex rounded-full bg-blue-100 px-2 py-1 text-xs font-extrabold text-blue-800">MỚI</span>
                      </td>
                      <td className="px-2 py-3">
                        <b className="text-blue-700">{m.jobs[0].pattern_code}</b>
                        <span> ({product}{brands.length ? ` ${brands.join(" | ")}` : ""})</span>
                      </td>
                      <td className="px-2 py-3 text-center">{(() => {
                        const formula = mamFormula(m);
                        return <div className="leading-tight">
                          {formula.old && <div className="text-sm text-slate-400 line-through">{formula.old}</div>}
                          <div className="whitespace-nowrap font-semibold">{formula.current}</div>
                        </div>;
                      })()}</td>
                      <td className="px-2 py-3 text-right font-semibold text-green-700">{n(m.received)}</td>
                      <td className="px-2 py-3 text-right font-semibold">{n(m.missing)}</td>
                      <td className="px-2 py-3"><div className="flex items-center justify-end gap-2 whitespace-nowrap">
                        <span>{prices.length === 1 ? cash(prices[0]) : prices.map(cash).join(" / ")}</span>
                        <button data-copy-remove="true" className="btn soft" disabled={busy || busyLimit}
                          onClick={() => openPriceEdit(m)}>Sửa</button>
                      </div></td>
                      <td className="px-2 py-3 text-right font-bold text-red-600">{cash(m.amount)}</td>
                    </tr>;
                  })}

                  {!!vetMams.length && <tr
                    ref={vetSectionRef}
                    id="hang-vet-cho-tinh"
                    data-copy-row-remove={hasAnySelection && copyVetMams.length === 0 ? "true" : undefined}
                    className="border-y-2 border-[#b86a5a] bg-[#f6e7e3]"
                  >
                    <td data-copy-remove="true" className="px-2 py-2" />
                    <td colSpan={8} className="px-3 py-2 font-extrabold text-[#7a2f25]">
                      HÀNG VÉT CHỜ TÍNH · {vetMams.length} mâm · {n(sum(vetMams.map(m => m.vetWaiting)))} cái
                    </td>
                  </tr>}

                  {vetMams.map((m, index) => {
                    const brands=[...new Set(m.jobs.map(j=>(j.brand||"").trim()).filter(Boolean))];
                    const prices: number[]=[...new Set<number>(m.jobs.map(j => Number(lines.find(line => line.job_id === j.id)?.unit_price ?? j.sewing_price ?? 0)))];
                    const over = Math.max(0, m.received - m.planned);
                    return <tr
                      key={`vet-${m.key}`}
                      data-copy-row-remove={hasAnySelection && !selectedVet.includes(m.jobs[0].id) ? "true" : undefined}
                      className="border-t bg-[#fff8f6] align-top"
                    >
                      <td data-copy-remove="true" className="px-2 py-3 text-center">
                        <input type="checkbox" aria-label={`Chọn hàng vét ${m.jobs[0].pattern_code}`}
                          checked={selectedVet.includes(m.jobs[0].id)} disabled={busy||busyLimit}
                          onChange={()=>toggleVet(m.jobs[0].id)}/>
                      </td>
                      <td className="px-2 py-3 text-center">{eligibleMams.length + index + 1}</td>
                      <td className="px-2 py-3 text-center">
                        <span className="inline-flex rounded-full bg-[#8b3a2f] px-2.5 py-1 text-xs font-black text-white">VÉT</span>
                      </td>
                      <td className="px-2 py-3">
                        <b className="text-blue-700">{m.jobs[0].pattern_code}</b>
                        <span> ({m.jobs[0].product_name}{brands.length?` ${brands.join(" | ")}`:""})</span>
                      </td>
                      <td className="px-2 py-3 text-center">{(() => {
                        const formula = mamFormula(m);
                        return <div className="leading-tight">
                          {formula.old && <div className="text-sm text-slate-400 line-through">{formula.old}</div>}
                          <div className="whitespace-nowrap font-semibold">{formula.current}</div>
                          <div className="mt-1 text-sm font-semibold text-[#7a2f25]">(Đã tính {n(m.accounted)})</div>
                        </div>;
                      })()}</td>
                      <td className="px-2 py-3 text-right">
                        <b className="text-[#8b3a2f]">+{n(m.vetWaiting)}</b>
                        <div className="mt-1 text-xs text-slate-500">Tổng nhận {n(m.received)}</div>
                      </td>
                      <td className="px-2 py-3 text-right font-semibold">
                        {over > 0 ? <span className="font-extrabold text-[#8b3a2f]">Dư {n(over)}</span> : n(m.missing)}
                      </td>
                      <td className="px-2 py-3 text-right">{prices.length===1?cash(prices[0]):prices.map(cash).join(" / ")}</td>
                      <td className="px-2 py-3 text-right font-bold text-red-600">{cash(m.vetAmount)}</td>
                    </tr>;
                  })}
                </tbody>

                {(eligibleMams.length > 0 || vetMams.length > 0) && <tfoot>
                  <tr className="border-t-2 bg-slate-50 font-extrabold">
                    <td data-copy-remove="true" className="px-2 py-3" />
                    <td className="px-2 py-3 text-right" colSpan={7}>TỔNG CỘNG</td>
                    <td className="px-2 py-3 text-right text-red-700">{cash(copyAmount)}</td>
                  </tr>
                </tfoot>}
              </table>

              {!eligibleMams.length && !vetMams.length && <p className="p-4 text-[17px] text-slate-600">
                Không có mâm mới hoặc hàng vét nào đang chờ chốt tiền.
              </p>}
            </div>

            <div className="flex flex-wrap gap-2">
              <button className="btn soft" onClick={() => void copyTable()}
                disabled={!eligibleMams.length && !vetMams.length}>Copy ảnh bảng kê</button>
              <button className="btn soft" onClick={() => void reload()} disabled={busy}>Tải lại số liệu</button>
            </div>

            <div className="rounded-xl border border-blue-200 bg-blue-50/30 p-3">
              <label className={label}>Ghi chú bảng kê
                <textarea className={field} rows={2} value={note}
                  onChange={e=>{setNote(e.target.value);requestKey.current=null;}}
                  placeholder="Có thể bỏ trống · áp dụng cho lần chốt này"/>
              </label>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-3 text-sm">
                <div>
                  <b>{selectedAllCount} dòng đang chọn</b>
                  <span className="ml-2 text-slate-600">· MỚI {selectedMams.length} · VÉT {selectedVetMams.length}</span>
                  {selectedVetQty > 0 && <span className="ml-2 text-[#8b3a2f]">· {n(selectedVetQty)} cái vét</span>}
                </div>
                <b className="text-lg text-red-700">{cash(selectedAllAmount)}</b>
              </div>
              <button className="btn primary mt-3 w-full"
                disabled={busy||busyLimit||selectedAllCount<1} onClick={openSettlementConfirm}>
                {busy?"Đang chốt...":`CHỐT TT CHUNG · ${selectedAllCount} DÒNG · ${cash(selectedAllAmount)}`}
              </button>
            </div>

            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              Chọn MỚI và VÉT trong cùng bảng rồi bấm <b>CHỐT TT CHUNG</b> một lần. Hệ thống xử lý nguyên tử: nếu một phần lỗi thì không chốt dở phần còn lại. Trong Công nợ & Thanh toán, các chứng từ phát sinh vẫn được liệt kê đầy đủ và có nhãn MỚI / VÉT để dễ đối chiếu.
            </p>
          </section>

          {jobs.some(j => j.paid_at && !settledJobIds.has(j.id)) && (
            <p className="panel text-amber-800">
              Có mâm được đánh dấu đã TT qua nút Tiến độ cũ. Các mâm này được loại khỏi bảng kê mới để tránh trả trùng; cần đối chiếu riêng trước khi nhập số dư đầu kỳ.
            </p>
          )}
        </>
      )}

      {!loading && manager && houseId && tab === "DEBT" && (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,.045)]">
              <span>Còn nợ các bảng kê</span>
              <strong>{cash(grossDue)}</strong>
            </div>
            <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,.045)]">
              <span>Ứng trước chưa phân bổ</span>
              <strong>{cash(credit)}</strong>
            </div>
            <div className="rounded-[20px] border border-slate-200 bg-white p-4 shadow-[0_8px_22px_rgba(15,23,42,.045)]">
              <span>Số dư ròng (nợ − ứng)</span>
              <strong>
                {cash((toCents(grossDue) - toCents(credit)) / 100)}
              </strong>
            </div>
          </div>

          <section className="panel stack">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-extrabold">
                Công nợ của {selectedHouse?.name}
              </h2>
              <button
                className="btn soft"
                disabled={busy || busyLimit}
                onClick={() => openAction({ kind: "ADVANCE" })}
              >
                + Ứng trước
              </button>
            </div>
            <p className="text-sm text-slate-600">
              Ứng trước không tự trừ bảng kê; cần bấm Phân bổ để xác nhận dùng tiền ứng cho đúng bảng kê.
            </p>
          </section>

          <section className="panel stack">
            <h3 className="font-extrabold text-blue-900">
              SỔ CÔNG NỢ THEO CHỐT · {outstandingGroups.length} lần chốt còn nợ
            </h3>

            {!outstandingGroups.length && (
              <p className="text-sm text-slate-600">
                Không có lần chốt nào đang nợ.
              </p>
            )}

            {outstandingGroups.map(group => {
              const hasMain = group.settlements.some(s => s.settlement_kind !== "VET");
              const hasVet = group.settlements.some(s => s.settlement_kind === "VET");
              const kindText = hasMain && hasVet ? "MỚI + VÉT" : hasVet ? "VÉT" : "MỚI";
              return (
                <details key={group.key} className="rounded-xl border p-3">
                  <summary className="cursor-pointer font-semibold">
                    <span className={`mr-2 inline-flex rounded-full px-2 py-0.5 text-xs font-extrabold ${hasVet && !hasMain ? "bg-[#8b3a2f] text-white" : hasMain && hasVet ? "bg-amber-100 text-amber-900" : "bg-blue-100 text-blue-800"}`}>
                      {kindText}
                    </span>
                    Lần chốt · {dt(group.createdAt)} · Còn{" "}
                    <b className="text-red-700">{cash(group.dueAmount)}</b> / {cash(group.totalAmount)}
                  </summary>

                  <div className="mt-4 rounded-xl border bg-white p-3">
                    <SettlementGroupDetail
                      group={group}
                      lines={lines}
                      allocations={allocations}
                      transactions={transactions}
                    />

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        className="btn primary"
                        disabled={busy || busyLimit || group.dueAmount <= 0}
                        onClick={() => openAction({
                          kind: "PAY_GROUP",
                          settlementIds: group.settlements.filter(s => due(s) > 0).map(s => s.id),
                        })}
                      >
                        Thanh toán lần chốt này
                      </button>
                      {activeAdvances.length > 0 && (
                        <button
                          className="btn soft"
                          disabled={busy || busyLimit || group.dueAmount <= 0}
                          onClick={() => openAction({
                            kind: "ALLOCATE_GROUP",
                            settlementIds: group.settlements.filter(s => due(s) > 0).map(s => s.id),
                          })}
                        >
                          Phân bổ ứng trước
                        </button>
                      )}
                    </div>
                  </div>
                </details>
              );
            })}
          </section>

          <section className="panel stack">
            <h3 className="font-extrabold text-green-800">
              ✅ ĐÃ THANH TOÁN XONG · {settledGroups.length} lần chốt
            </h3>

            {settledGroups.map(group => {
              const hasMain = group.settlements.some(s => s.settlement_kind !== "VET");
              const hasVet = group.settlements.some(s => s.settlement_kind === "VET");
              const kindText = hasMain && hasVet ? "MỚI + VÉT" : hasVet ? "VÉT" : "MỚI";
              return (
                <details key={group.key} className="rounded-xl border p-3">
                  <summary className="cursor-pointer">
                    <span className={`mr-2 inline-flex rounded-full px-2 py-0.5 text-xs font-extrabold ${hasVet && !hasMain ? "bg-[#8b3a2f] text-white" : hasMain && hasVet ? "bg-amber-100 text-amber-900" : "bg-blue-100 text-blue-800"}`}>
                      {kindText}
                    </span>
                    Lần chốt · {dt(group.createdAt)} · {cash(group.totalAmount)} · Còn 0đ
                  </summary>
                  <div className="mt-4 rounded-xl border bg-white p-3">
                    <SettlementGroupDetail
                      group={group}
                      lines={lines}
                      allocations={allocations}
                      transactions={transactions}
                    />
                  </div>
                </details>
              );
            })}

            {!settledGroups.length && (
              <p className="text-sm text-slate-600">
                Chưa có lần chốt đã thanh toán xong.
              </p>
            )}
          </section>

          <section className="panel stack">
            <h3 className="font-extrabold text-blue-900">
              ỨNG TRƯỚC & LỊCH SỬ GIAO DỊCH
            </h3>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="bg-blue-50 text-left">
                    <th className="p-2">Ngày giờ / Mã</th>
                    <th className="p-2">Loại</th>
                    <th className="p-2">Hình thức</th>
                    <th className="p-2 text-right">Số tiền</th>
                    <th className="p-2 text-right">Chưa phân bổ</th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map(t => (
                    <tr key={t.id} className="border-t">
                      <td className="p-2">
                        {dt(t.created_at)}
                        <br />
                        <b>{t.transaction_code}</b>
                        <br />
                        {t.note || ""}
                      </td>
                      <td className="p-2">
                        {t.kind === "ADVANCE" ? "Ứng trước" : "Thanh toán"}
                      </td>
                      <td className="p-2">{t.method}</td>
                      <td className="p-2 text-right font-semibold">
                        {cash(t.amount)}
                      </td>
                      <td className="p-2 text-right">
                        {t.kind === "ADVANCE"
                          ? cash(
                              (toCents(t.amount) -
                                toCents(usedFrom(t.id))) /
                                100,
                            )
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {jobs.some(j => j.paid_at && !settledJobIds.has(j.id)) && (
            <p className="panel text-amber-800">
              Lưu ý: Các mâm đã thanh toán theo luồng Tiến độ cũ chưa nằm trong sổ mới. Không tự nhập lại giao dịch để tránh trả trùng.
            </p>
          )}
        </>
      )}

      {priceEdit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 p-3 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Cập nhật đơn giá nhà may"
        >
          <div className="w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <Msg error={error} />
            <h2 className="text-lg font-extrabold text-blue-900">
              SỬA ĐƠN GIÁ TOÀN MÂM
            </h2>
            <p className="mt-2 text-sm text-slate-700">
              {priceEdit.mam.jobs[0].pattern_code} ·{" "}
              {[
                ...new Set(
                  priceEdit.mam.jobs
                    .map(j => (j.brand || "").trim())
                    .filter(Boolean),
                ),
              ].join(" | ") || priceEdit.mam.jobs[0].product_name}
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Áp dụng chung cho tất cả mẫu/hiệu trong mâm này.
            </p>

            <label className={`${label} mt-4`}>
              Đơn giá (đ/chiếc) *
              <input
                className={field}
                inputMode="decimal"
                value={priceEdit.value}
                placeholder="Nhập đơn giá"
                onChange={e => {
                  setError("");
                  setPriceEdit({ ...priceEdit, value: e.target.value });
                }}
              />
            </label>

            <div className="mt-5 grid gap-2">
              <button
                className="btn primary"
                disabled={busy || !amountOk(priceEdit.value)}
                onClick={() => void submitPriceEdit()}
              >
                {busy ? "Đang lưu..." : "XÁC NHẬN CẬP NHẬT ĐƠN GIÁ"}
              </button>
              <button
                className="btn"
                disabled={busy}
                onClick={() => {
                  setPriceEdit(null);
                  setError("");
                }}
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {showSettlementConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 p-3 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Xác nhận chốt bảng kê"
        >
          <div className="w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <Msg error={error} />
            <h2 className="text-lg font-extrabold text-blue-900">
              XÁC NHẬN CHỐT TT CHUNG
            </h2>
            <div className="mt-3 rounded-xl border bg-slate-50 p-3 text-sm">
              <p>Nhà may: <b>{selectedHouse?.name || "—"}</b></p>
              <p className="mt-1">Mâm MỚI: <b>{selectedMams.length}</b></p>
              <p className="mt-1">Mâm VÉT: <b className="text-[#8b3a2f]">{selectedVetMams.length}</b>{selectedVetQty > 0 ? ` · ${n(selectedVetQty)} cái` : ""}</p>
              <p className="mt-1">Tổng số dòng: <b>{selectedAllCount}</b></p>
              <p className="mt-1">Tổng tiền: <b className="text-red-700">{cash(selectedAllAmount)}</b></p>
            </div>
            <p className="mt-3 text-sm text-amber-800">
              Bạn chỉ xác nhận <b>một lần</b>. Mâm MỚI và hàng VÉT được xử lý cùng một giao dịch; nếu một phần lỗi thì toàn bộ lần chốt sẽ được hủy. Thao tác này <b>chưa ghi đã thanh toán</b>.
            </p>

            <div className="mt-5 grid gap-2">
              <button
                className="btn primary"
                disabled={busy || selectedAllCount < 1}
                onClick={() => void submitSettlement()}
              >
                {busy ? "Đang chốt..." : "XÁC NHẬN CHỐT TT CHUNG"}
              </button>
              <button
                className="btn"
                disabled={busy}
                onClick={() => {
                  setShowSettlementConfirm(false);
                  setError("");
                  requestKey.current = null;
                }}
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {action && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/55 p-3 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-label="Ghi giao dịch nhà may"
        >
          <div className="w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl">
            <Msg error={error} />

            <h2 className="text-lg font-extrabold text-blue-900">
              {action.kind === "ADVANCE"
                ? "ỨNG TRƯỚC"
                : action.kind === "PAY_GROUP"
                  ? "THANH TOÁN LẦN CHỐT"
                  : "PHÂN BỔ ỨNG TRƯỚC"}
            </h2>

            {action.kind !== "ADVANCE" && (() => {
              const ids = action.settlementIds || [];
              const selectedSettlements = settlements.filter(s => ids.includes(s.id));
              const remaining = sumMoney(selectedSettlements.map(due));
              const hasMain = selectedSettlements.some(s => s.settlement_kind !== "VET");
              const hasVet = selectedSettlements.some(s => s.settlement_kind === "VET");
              return <div className="mt-3 rounded-xl border bg-slate-50 p-3 text-sm text-slate-700">
                <p>Lần chốt: <b>{hasMain && hasVet ? "MỚI + VÉT" : hasVet ? "VÉT" : "MỚI"}</b></p>
                <p className="mt-1">Số chứng từ bên trong: <b>{selectedSettlements.length}</b></p>
                <p className="mt-1">Còn phải trả: <b className="text-red-700">{cash(remaining)}</b></p>
              </div>;
            })()}

            {action.kind === "ALLOCATE_GROUP" && (
              <label className={`${label} mt-4`}>
                Chọn khoản ứng trước
                <select
                  className={field}
                  value={advanceId}
                  onChange={e => {
                    setAdvanceId(e.target.value);
                    requestKey.current = null;
                  }}
                >
                  {activeAdvances.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.transaction_code} · còn {cash(t.available)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className={`${label} mt-4`}>
              Số tiền (đ) *
              <input
                className={field}
                inputMode="decimal"
                value={amount}
                placeholder="Nhập số tiền"
                onChange={e => {
                  setAmount(e.target.value);
                  requestKey.current = null;
                }}
              />
            </label>

            {action.kind !== "ALLOCATE_GROUP" && (
              <>
                <label className={`${label} mt-3`}>
                  Hình thức
                  <select
                    className={field}
                    value={method}
                    onChange={e => {
                      setMethod(e.target.value);
                      requestKey.current = null;
                    }}
                  >
                    <option value="CHUYEN_KHOAN">Chuyển khoản</option>
                    <option value="TIEN_MAT">Tiền mặt</option>
                    <option value="KHAC">Khác</option>
                  </select>
                </label>

                <label className={`${label} mt-3`}>
                  Ghi chú / mã giao dịch
                  <textarea
                    className={field}
                    value={actionNote}
                    rows={2}
                    placeholder={
                      method === "KHAC"
                        ? "Bắt buộc ghi chú"
                        : "Có thể bỏ trống"
                    }
                    onChange={e => {
                      setActionNote(e.target.value);
                      requestKey.current = null;
                    }}
                  />
                </label>
              </>
            )}

            <div className="mt-5 grid gap-2">
              <button
                className="btn primary"
                disabled={busy || !amountOk(amount)}
                onClick={() => void submitAction()}
              >
                {busy ? "Đang lưu..." : action.kind === "PAY_GROUP" ? "XÁC NHẬN THANH TOÁN" : action.kind === "ALLOCATE_GROUP" ? "XÁC NHẬN PHÂN BỔ" : "XÁC NHẬN GHI ỨNG TRƯỚC"}
              </button>

              <button
                className="btn"
                disabled={busy}
                onClick={() => {
                  setAction(null);
                  setError("");
                  requestKey.current = null;
                }}
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function settlementVetItems(settlement: Settlement): VetItem[] {
  if (settlement.settlement_kind !== "VET" || !Array.isArray(settlement.vet_items)) return [];
  return settlement.vet_items.filter((item): item is VetItem => Boolean(item) && typeof item === "object") as VetItem[];
}

function SettlementGroupDetail({
  group, lines, allocations, transactions,
}: { group: SettlementGroup; lines: Line[]; allocations: Allocation[]; transactions: Transaction[] }) {
  const settlementIds = new Set(group.settlements.map(settlement => settlement.id));
  const groupAllocations = allocations
    .filter(allocation => settlementIds.has(allocation.settlement_id))
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  const allocatedAmount = sumMoney(groupAllocations.map(allocation => allocation.amount));
  const advanceAllocatedAmount = sumMoney(groupAllocations
    .filter(allocation => transactions.find(item => item.id === allocation.transaction_id)?.kind === "ADVANCE")
    .map(allocation => allocation.amount));
  const remainingAmount = Math.max(0, (toCents(group.totalAmount) - toCents(allocatedAmount)) / 100);
  const advanceUsage = [...new Set(groupAllocations
    .filter(allocation => transactions.find(item => item.id === allocation.transaction_id)?.kind === "ADVANCE")
    .map(allocation => allocation.transaction_id))]
    .map(transactionId => {
      const transaction = transactions.find(item => item.id === transactionId);
      const rows = groupAllocations.filter(allocation => allocation.transaction_id === transactionId);
      return {
        transactionId,
        createdAt: transaction?.created_at || rows[0]?.created_at || "",
        allocatedAt: rows[0]?.created_at || "",
        amount: sumMoney(rows.map(row => row.amount)),
        note: transaction?.note || "",
      };
    });

  const mainRows = group.settlements
    .filter(settlement => settlement.settlement_kind !== "VET")
    .flatMap(settlement => lines
      .filter(line => line.settlement_id === settlement.id)
      .map(line => ({ settlement, line })));

  const vetRows = group.settlements
    .filter(settlement => settlement.settlement_kind === "VET")
    .flatMap(settlement => {
      const vet = settlementVetItems(settlement);
      return [...new Set(vet.map(item => item.mam_code))].map(code => {
        const items = vet.filter(item => item.mam_code === code);
        const qty = sum(items.map(item => Number(item.qty || 0)));
        const amount = sumMoney(items.map(item => Number(item.line_total || 0)));
        const missing = sum(items.map(item => Number(item.missing_after || 0)));
        const prices = [...new Set(items.map(item => Number(item.unit_price || 0)))];
        const products = [...new Set(items.map(item => `${item.pattern_code} ${item.product_name || ""} ${item.brand || ""}`.trim()))];
        return { settlement, code, items, qty, amount, missing, prices, products };
      });
    });

  const notes = group.settlements
    .filter(settlement => settlement.note?.trim())
    .map(settlement => ({ kind: settlement.settlement_kind === "VET" ? "VÉT" : "MỚI", note: settlement.note!.trim() }));

  return <div className="space-y-3 text-sm">
    {notes.length > 0 && <div className="space-y-1 text-slate-600">
      {notes.map((item, index) => <p key={`${item.kind}-${index}`}><b>{item.kind}:</b> {item.note}</p>)}
    </div>}

    <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[760px]">
        <thead><tr className="bg-blue-50 text-left">
          <th className="w-20 p-2">Loại</th>
          <th className="p-2">Mã rập / Mẫu</th>
          <th className="w-32 p-2 text-right">SL tính công</th>
          <th className="w-32 p-2 text-right">Đơn giá</th>
          <th className="w-36 p-2 text-right">Thành tiền</th>
        </tr></thead>
        <tbody>
          {mainRows.map(({settlement, line}) => <tr key={`main-${line.id}`} className="border-t">
            <td className="p-2 align-top"><span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-extrabold text-blue-800">MỚI</span></td>
            <td className="p-2"><b>{line.pattern_code}</b> · {line.product_name} {line.brand || ""}<br/>
              <span className="text-xs text-slate-500">{line.layer_count ?? "—"} lớp · Size {line.size_range || "—"} · Tỷ lệ {line.size_ratio || "—"}</span></td>
            <td className="p-2 text-right font-semibold">{n(line.received_qty)}</td>
            <td className="p-2 text-right">{cash(line.unit_price)}</td>
            <td className="p-2 text-right font-bold text-red-600">{cash(line.line_total)}</td>
          </tr>)}

          {vetRows.map(row => <tr key={`vet-${row.settlement.id}-${row.code}`} className="border-t bg-[#fff8f6]">
            <td className="p-2 align-top"><span className="inline-flex rounded-full bg-[#8b3a2f] px-2 py-0.5 text-xs font-extrabold text-white">VÉT</span></td>
            <td className="p-2"><b>{row.products.join(" | ")}</b>
              {row.missing > 0 && <><br/><span className="text-xs text-slate-500">Còn thiếu sau nhận {n(row.missing)}</span></>}</td>
            <td className="p-2 text-right font-semibold text-[#8b3a2f]">+{n(row.qty)}</td>
            <td className="p-2 text-right">{row.prices.length === 1 ? cash(row.prices[0]) : row.prices.map(cash).join(" / ")}</td>
            <td className="p-2 text-right font-bold text-red-600">{cash(row.amount)}</td>
          </tr>)}
        </tbody>
        <tfoot>
          <tr className="border-t-2 bg-slate-50 font-extrabold">
            <td colSpan={4} className="px-2 py-3 text-right align-top">
              <div>TỔNG CỘNG</div>
              <div className="mt-1 text-sm font-semibold text-slate-600">Đã phân bổ</div>
              <div className="mt-1 text-sm font-semibold text-amber-800">Ứng</div>
              <div className="mt-1 text-sm font-extrabold text-slate-900">Còn lại</div>
            </td>
            <td className="px-2 py-3 text-right align-top">
              <div className="text-red-700">{cash(group.totalAmount)}</div>
              <div className="mt-1 text-sm font-semibold text-slate-600">{cash(allocatedAmount)}</div>
              <div className="mt-1 text-sm font-semibold text-amber-800">{cash(advanceAllocatedAmount)}</div>
              <div className="mt-1 text-sm font-extrabold text-red-700">{cash(remainingAmount)}</div>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>

    {advanceUsage.length > 0 && <div className="space-y-1">
      {advanceUsage.map(item => <p key={`advance-${item.transactionId}`} className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-950">
        <b>Ứng trước {cash(item.amount)}</b> · Ngày ứng {dt(item.createdAt)} · Tự trừ vào lần chốt {dt(item.allocatedAt)}{item.note ? ` · ${item.note}` : ""}
      </p>)}
    </div>}
    {groupAllocations.some(allocation => transactions.find(item => item.id === allocation.transaction_id)?.kind !== "ADVANCE") && <div className="space-y-1">
      {[...new Set(groupAllocations
        .filter(allocation => transactions.find(item => item.id === allocation.transaction_id)?.kind !== "ADVANCE")
        .map(allocation => allocation.transaction_id))].map(transactionId => {
          const transaction = transactions.find(item => item.id === transactionId);
          const rows = groupAllocations.filter(allocation => allocation.transaction_id === transactionId);
          return <p key={`payment-${transactionId}`} className="rounded-lg bg-slate-50 p-2">
            {dt(rows[0]?.created_at || transaction?.created_at || "")} · <b>Thanh toán {cash(sumMoney(rows.map(row => row.amount)))}</b>{transaction?.note ? ` · ${transaction.note}` : ""}
          </p>;
        })}
    </div>}
  </div>;
}

function SettlementDetail({
  settlement, lines, allocations, transactions,
}: { settlement: Settlement; lines: Line[]; allocations: Allocation[]; transactions: Transaction[] }) {
  const vet = settlementVetItems(settlement);
  const groupedVet = [...new Set(vet.map(item => item.mam_code))].map(code => {
    const items = vet.filter(item => item.mam_code === code);
    return { code, items, qty: sum(items.map(item => Number(item.qty || 0))),
      amount: sumMoney(items.map(item => Number(item.line_total || 0))),
      missing: sum(items.map(item => Number(item.missing_after || 0))) };
  });
  return <div className="mt-3 space-y-3 text-sm">
    {settlement.note && <p className="text-slate-600">Ghi chú: {settlement.note}</p>}
    {settlement.settlement_kind === "VET" ? <div className="overflow-x-auto"><table className="w-full min-w-[650px]">
      <thead><tr className="bg-orange-50 text-left"><th className="p-2">Mâm / Mã rập</th><th className="p-2 text-right">Vét tính công</th><th className="p-2 text-right">Còn thiếu sau nhận</th><th className="p-2 text-right">Thành tiền</th></tr></thead>
      <tbody>{groupedVet.map(group => <tr key={group.code} className="border-t"><td className="p-2"><b>{group.code}</b><br/><span className="text-xs text-slate-500">{[...new Set(group.items.map(item => `${item.pattern_code} ${item.brand || ""}`.trim()))].join(" | ")}</span></td>
        <td className="p-2 text-right font-semibold">{n(group.qty)}</td><td className="p-2 text-right">{n(group.missing)}</td><td className="p-2 text-right font-bold text-red-600">{cash(group.amount)}</td></tr>)}</tbody>
    </table></div> : <div className="overflow-x-auto"><table className="w-full min-w-[650px]"><thead><tr className="bg-blue-50 text-left">
      <th className="p-2">Mâm / Mã rập / Mẫu</th><th className="p-2 text-right">Đã nhận</th><th className="p-2 text-right">Đơn giá</th><th className="p-2 text-right">Thành tiền</th></tr></thead>
      <tbody>{lines.map(l => <tr key={l.id} className="border-t"><td className="p-2">{l.mam_code} · {l.pattern_code} · {l.product_name} {l.brand || ""}<br/><span className="text-xs text-slate-500">{l.layer_count ?? "—"} lớp · Size {l.size_range || "—"} · Tỷ lệ {l.size_ratio || "—"}</span></td>
        <td className="p-2 text-right">{n(l.received_qty)}</td><td className="p-2 text-right">{cash(l.unit_price)}</td><td className="p-2 text-right font-semibold">{cash(l.line_total)}</td></tr>)}</tbody>
    </table></div>}
    <p className="font-bold">{settlement.settlement_kind === "VET" ? "Tổng bảng kê vét" : "Tổng bảng kê"}: {cash(settlement.total_amount)} · Đã phân bổ: {cash(sumMoney(allocations.map(a => a.amount)))}</p>
    {allocations.length > 0 && <div className="space-y-1">{allocations.map(a => {
      const t = transactions.find(x => x.id === a.transaction_id);
      return <p key={a.id} className="rounded-lg bg-slate-50 p-2">{dt(a.created_at)} · {t?.kind === "ADVANCE" ? "Trừ ứng trước" : "Thanh toán"} · {t?.transaction_code || `#${a.transaction_id}`} · {cash(a.amount)} {t?.note ? `· ${t.note}` : ""}</p>;
    })}</div>}
  </div>;
}

export default HouseLedger;
