"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, ArrowRight, CalendarDays, Search, UserRound, WalletCards } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { day, norm } from "@/lib/azalas/format";
import { Msg, Loading } from "@/components/ui";

type Job = {
  id: number; job_code: string; pattern_code: string; product_name: string; customer_name: string | null;
  planned_qty: number; received_qty: number; status: string; delivery_date: string | null; created_at: string;
  house_name: string | null; order_type: string;
};

export default function PatternCustomer() {
  const sb = useMemo(() => createClient(), []);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const { data, error } = await sb.rpc("az_pattern_progress");
      if (error) setErr(error.message);
      else {
        const customerJobs = ((data || []) as Job[]).filter(j => j.order_type === "KHACH_DAT");
        // Standalone customer patterns have no order_group; due date is on pattern_jobs.
        // The legacy progress RPC may therefore return null. Read only fields allowed by RLS.
        const missingIds = customerJobs.filter(j => !j.delivery_date).map(j => j.id);
        if (missingIds.length) {
          const {data: extra} = await sb.from("pattern_jobs").select("id,delivery_date").in("id", missingIds);
          const dates = new Map((extra || []).map(x => [x.id, x.delivery_date as string | null]));
          setJobs(customerJobs.map(j => ({...j, delivery_date: j.delivery_date || dates.get(j.id) || null})));
        } else setJobs(customerJobs);
      }
      setLoading(false);
    })();
  }, [sb]);

  const today = new Date().toISOString().slice(0, 10);
  const filtered = jobs
    .filter(j => norm(`${j.customer_name} ${j.pattern_code} ${j.product_name}`).includes(norm(q)))
    .sort((a, b) => {
      const aa = a.delivery_date || "9999", bb = b.delivery_date || "9999";
      return aa.localeCompare(bb) || a.created_at.localeCompare(b.created_at);
    });
  const overdueCount = jobs.filter(j => !!j.delivery_date && j.delivery_date < today && j.planned_qty - j.received_qty > 0).length;
  const remainingQty = jobs.reduce((n, j) => n + Math.max(0, j.planned_qty - j.received_qty), 0);

  return <div className="space-y-5">
    <Msg error={err} />

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-[22px] border border-orange-100 bg-orange-50/70 p-4">
        <div className="flex items-center gap-2 text-orange-700"><UserRound className="h-4 w-4" /><span className="text-[11px] font-black uppercase tracking-[.08em]">Đơn khách đặt</span></div>
        <div className="mt-2 text-[28px] font-black text-[#0d2346]">{jobs.length}</div>
      </div>
      <div className="rounded-[22px] border border-rose-100 bg-rose-50/70 p-4">
        <div className="flex items-center gap-2 text-rose-700"><AlertTriangle className="h-4 w-4" /><span className="text-[11px] font-black uppercase tracking-[.08em]">Đang quá hạn</span></div>
        <div className="mt-2 text-[28px] font-black text-[#0d2346]">{overdueCount}</div>
      </div>
      <div className="rounded-[22px] border border-blue-100 bg-blue-50/70 p-4">
        <div className="flex items-center gap-2 text-blue-700"><WalletCards className="h-4 w-4" /><span className="text-[11px] font-black uppercase tracking-[.08em]">Còn thiếu</span></div>
        <div className="mt-2 text-[28px] font-black text-[#0d2346]">{remainingQty.toLocaleString("vi-VN")} <span className="text-[13px] text-slate-500">chiếc</span></div>
      </div>
    </div>

    <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_10px_28px_rgba(15,23,42,.05)] sm:p-5">
      <label className="block">
        <span className="mb-2 block text-[12px] font-black uppercase tracking-[.07em] text-slate-500">Tìm khách đặt</span>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input className="field w-full pl-11" placeholder="Tìm khách, mã rập hoặc tên sản phẩm" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </label>
    </section>

    {loading && <Loading />}

    <div className="grid gap-4 md:grid-cols-2">
      {filtered.map(j => {
        const remain = j.planned_qty - j.received_qty;
        const overdue = !!j.delivery_date && j.delivery_date < today && remain > 0;
        return <article className={`rounded-[25px] border bg-white p-5 shadow-[0_12px_30px_rgba(15,23,42,.05)] ${overdue ? "border-rose-200" : "border-slate-200"}`} key={j.id}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[12px] font-black uppercase tracking-[.06em] text-orange-600"><UserRound className="h-4 w-4" />{j.customer_name || "Chưa liên kết khách"}</div>
              <h2 className="mt-2 text-[20px] font-black leading-tight text-[#0d2346]">{j.product_name}</h2>
            </div>
            {overdue ? <span className="shrink-0 rounded-full bg-rose-100 px-3 py-1.5 text-[11px] font-black text-rose-700">QUÁ HẠN</span> : <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-[11px] font-black text-slate-600">{j.status}</span>}
          </div>

          <div className="mt-4 grid gap-2 rounded-2xl bg-slate-50 p-3.5 text-[13px] text-slate-600 sm:grid-cols-2">
            <span><b className="text-slate-800">Mã:</b> {j.job_code} · {j.pattern_code}</span>
            <span><b className="text-slate-800">Nhà may:</b> {j.house_name || "Chưa có xưởng"}</span>
            <span className="flex items-center gap-1.5"><CalendarDays className="h-4 w-4 text-slate-400" /><b className="text-slate-800">Hạn:</b> {day(j.delivery_date)}</span>
            <span><b className="text-slate-800">Đã nhận:</b> {j.received_qty}/{j.planned_qty}</span>
          </div>

          <div className={`mt-4 rounded-2xl px-4 py-3 ${remain > 0 ? "bg-orange-50 text-orange-800" : "bg-emerald-50 text-emerald-800"}`}>
            <span className="text-[12px] font-bold">Còn thiếu</span>
            <div className="mt-0.5 text-[22px] font-black">{Math.max(0, remain).toLocaleString("vi-VN")} chiếc</div>
          </div>
          {!j.delivery_date && <p className="mt-3 text-[12px] font-semibold text-amber-700">Chưa liên kết ngày giao của đơn khách đặt, chưa thể kết luận muộn.</p>}
          <Link className="mt-4 inline-flex items-center gap-2 rounded-xl bg-orange-50 px-4 py-2.5 text-[13px] font-black text-orange-700 transition hover:bg-orange-100" href="/azalas/patterns/progress">Xem tiến độ <ArrowRight className="h-4 w-4" /></Link>
        </article>;
      })}
    </div>

    {!loading && !filtered.length && <p className="rounded-[24px] border border-slate-200 bg-white p-6 text-center font-semibold text-slate-500">Chưa có rập Khách đặt phù hợp.</p>}
  </div>;
}
