"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";
import { dt, money } from "@/lib/azalas/format";
import { Loading, Msg } from "@/components/ui";
import DebtSlipPanel from "./debt-slip-panel";

type Role = "OWNER" | "ADMIN" | "MEMBER";

type Customer = {
  id: number;
  customer_code: string;
  name: string;
  phone: string | null;
  address: string | null;
  transport_station: string | null;
  transport_phone: string | null;
};

type Group = {
  id: number;
  root_code: string;
  created_at: string;
  order_type: string;
};

type Bill = {
  id: number;
  invoice_code: string;
  status: string;
  subtotal: number;
  finalized_at: string | null;
};

export default function CustomerDetail({
  customerId,
}: {
  customerId: number;
}) {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [bills, setBills] = useState<Bill[]>([]);
  const [balance, setBalance] = useState(0);
  const [role, setRole] = useState<Role | "">("");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [ownerPassword, setOwnerPassword] = useState("");

  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");

    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      setErr("Vui lòng đăng nhập lại.");
      setLoading(false);
      return;
    }

    const [
      profileResult,
      customerResult,
      groupsResult,
      billsResult,
      debtResult,
    ] = await Promise.all([
      sb.from("az_profiles").select("role").eq("id", user.id).single(),
      sb
        .from("az_customers")
        .select(
          "id,customer_code,name,phone,address,transport_station,transport_phone",
        )
        .eq("id", customerId)
        .single(),
      sb
        .from("order_groups")
        .select("id,root_code,created_at,order_type")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(50),
      sb
        .from("invoices")
        .select("id,invoice_code,status,subtotal,finalized_at")
        .eq("customer_id", customerId)
        .order("created_at", { ascending: false })
        .limit(50),
      sb.rpc("az_customer_balance", {
        p_customer_id: customerId,
      }),
    ]);

    if (profileResult.error) {
      setErr(profileResult.error.message);
      setLoading(false);
      return;
    }

    if (customerResult.error) {
      setErr(customerResult.error.message);
      setCustomer(null);
      setLoading(false);
      return;
    }

    if (debtResult.error) {
      setErr(debtResult.error.message);
      setLoading(false);
      return;
    }

    setRole(String(profileResult.data?.role || "") as Role);
    setCustomer(customerResult.data as Customer);
    setGroups((groupsResult.data || []) as Group[]);
    setBills((billsResult.data || []) as Bill[]);
    setBalance(Number(debtResult.data) || 0);
    setLoading(false);
  }, [sb, customerId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!customer) return;

    setBusy(true);
    setErr("");
    setOk("");

    const { error } = await sb.rpc("az_update_customer", {
      p_id: customer.id,
      p_name: customer.name,
      p_phone: customer.phone || "",
      p_address: customer.address || "",
      p_transport_station: customer.transport_station || "",
      p_transport_phone: customer.transport_phone || "",
    });

    setBusy(false);

    if (error) {
      setErr(error.message);
      return;
    }

    setOk("Đã cập nhật thông tin khách. Đơn cũ giữ snapshot ban đầu.");
    await load();
  }

  async function deleteCustomer() {
    if (!customer) return;

    setErr("");
    setOk("");

    if (role !== "OWNER") {
      setErr("Chỉ tài khoản OWNER được xóa khách hàng.");
      return;
    }

    if (!ownerPassword) {
      setErr("Vui lòng nhập mật khẩu OWNER.");
      return;
    }

    setDeleteBusy(true);

    try {
      const {
        data: { user },
      } = await sb.auth.getUser();

      if (!user?.email) {
        throw new Error("Không xác định được tài khoản OWNER đang đăng nhập.");
      }

      const { error: passwordError } = await sb.auth.signInWithPassword({
        email: user.email,
        password: ownerPassword,
      });

      if (passwordError) {
        throw new Error("Mật khẩu OWNER không đúng.");
      }

      const { error: deleteError } = await sb.rpc(
        "az_delete_customer_safe",
        {
          p_customer_id: customer.id,
        },
      );

      if (deleteError) {
        throw new Error(deleteError.message);
      }

      router.replace("/azalas/customers");
      router.refresh();
    } catch (error) {
      setErr(
        error instanceof Error
          ? error.message
          : "Không thể xóa khách hàng.",
      );
    } finally {
      setDeleteBusy(false);
    }
  }

  if (loading) return <Loading />;

  if (!customer) {
    return <Msg error={err || "Không tìm thấy khách hàng."} />;
  }

  const fields = [
    ["name", "Tên khách hàng"],
    ["phone", "Số điện thoại"],
    ["address", "Địa chỉ"],
    ["transport_station", "Chành xe"],
    ["transport_phone", "SĐT chành xe"],
  ] as const;

  return (
    <div className="stack">
      <Msg error={err} success={ok} />

      <section className="panel grid gap-4 lg:grid-cols-[1fr_300px] lg:items-center">
        <div>
          <div className="eyebrow">KHÁCH HÀNG</div>
          <h2 className="mt-2 text-3xl font-black">
            {customer.name}
          </h2>
          <p className="muted mt-2 text-base font-semibold">
            {customer.customer_code}
            {customer.phone ? ` · ${customer.phone}` : ""}
          </p>
        </div>

        <div
          className={`rounded-2xl border p-5 ${
            balance < 0
              ? "border-emerald-200 bg-emerald-50/70"
              : "border-red-100 bg-red-50/60"
          }`}
        >
          <p className="muted text-xs font-black">
            {balance < 0 ? "KHÁCH DƯ TIỀN" : "NỢ HIỆN TẠI"}
          </p>
          <div
            className={`mt-2 text-3xl font-black ${
              balance < 0 ? "text-emerald-700" : "text-red-600"
            }`}
          >
            {money(Math.abs(balance))}
          </div>
        </div>
      </section>

      <DebtSlipPanel
        customerId={customer.id}
        customerName={customer.name}
        balance={balance}
        onSaved={load}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel stack">
          <div>
            <div className="eyebrow">THÔNG TIN</div>
            <h2 className="mt-1 text-2xl font-black">
              Thông tin khách hàng
            </h2>
          </div>

          {fields.map(([key, label]) => (
            <label key={key} className="text-sm font-bold">
              {label}

              {key === "address" ? (
                <textarea
                  className="field mt-2 text-base"
                  value={customer[key] || ""}
                  rows={3}
                  onChange={(event) =>
                    setCustomer((current) =>
                      current
                        ? {
                            ...current,
                            [key]: event.target.value,
                          }
                        : current,
                    )
                  }
                />
              ) : (
                <input
                  className="field mt-2 text-base"
                  value={customer[key] || ""}
                  onChange={(event) =>
                    setCustomer((current) =>
                      current
                        ? {
                            ...current,
                            [key]: event.target.value,
                          }
                        : current,
                    )
                  }
                />
              )}
            </label>
          ))}

          <button
            className="btn primary px-5 py-3 text-base font-black"
            disabled={busy}
            onClick={() => void save()}
          >
            {busy ? "Đang lưu..." : "Lưu thay đổi thông tin"}
          </button>
        </section>

        <section className="panel stack">
          <div>
            <div className="eyebrow">HÓA ĐƠN</div>
            <h2 className="mt-1 text-2xl font-black">
              Hóa đơn gần đây
            </h2>
          </div>

          {bills.length ? (
            bills.map((bill) => (
              <Link
                className="flex justify-between gap-3 rounded-xl border p-4"
                href={`/azalas/invoices/${bill.id}`}
                key={bill.id}
              >
                <span className="text-base">
                  <b>{bill.invoice_code}</b> · {bill.status}
                  {bill.finalized_at && (
                    <small className="muted mt-1 block">
                      {dt(bill.finalized_at)}
                    </small>
                  )}
                </span>
                <b className="whitespace-nowrap text-base">
                  {money(bill.subtotal)}
                </b>
              </Link>
            ))
          ) : (
            <p className="muted text-sm">Chưa có hóa đơn.</p>
          )}
        </section>
      </div>

      <section className="panel stack">
        <div>
          <div className="eyebrow">ĐƠN HÀNG</div>
          <h2 className="mt-1 text-2xl font-black">
            Đơn hàng của khách
          </h2>
        </div>

        {groups.length ? (
          groups.map((group) => (
            <div
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
              key={group.id}
            >
              <div>
                <b className="text-base">{group.root_code}</b>
                <p className="muted mt-1 text-sm">
                  {group.order_type} · {dt(group.created_at)}
                </p>
              </div>

              <Link
                className="btn soft"
                href="/azalas/orders"
              >
                Chi tiết đơn
              </Link>
            </div>
          ))
        ) : (
          <p className="muted text-sm">Khách chưa có đơn hàng.</p>
        )}
      </section>

      {role === "OWNER" && (
        <section className="rounded-2xl border border-red-200 bg-red-50/60 p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs font-black uppercase tracking-wider text-red-600">
                Khu vực OWNER
              </div>
              <h2 className="mt-1 text-xl font-black text-red-800">
                Xóa khách hàng
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-red-700">
                Chỉ xóa được khách chưa phát sinh dữ liệu liên quan.
                Khách đã có đơn, hóa đơn, hàng trả, công nợ hoặc dữ liệu
                khác sẽ được hệ thống chặn để tránh mất lịch sử.
              </p>
            </div>

            {!deleteOpen && (
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  setErr("");
                  setOwnerPassword("");
                  setDeleteOpen(true);
                }}
              >
                Xóa khách hàng
              </button>
            )}
          </div>

          {deleteOpen && (
            <div className="mt-4 rounded-xl border border-red-200 bg-white p-4">
              <label className="text-sm font-black text-red-800">
                Nhập mật khẩu OWNER để xác nhận
                <input
                  type="password"
                  className="field mt-2"
                  value={ownerPassword}
                  autoComplete="current-password"
                  onChange={(event) =>
                    setOwnerPassword(event.target.value)
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !deleteBusy) {
                      void deleteCustomer();
                    }
                  }}
                />
              </label>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn danger"
                  disabled={deleteBusy || !ownerPassword}
                  onClick={() => void deleteCustomer()}
                >
                  {deleteBusy
                    ? "Đang kiểm tra..."
                    : "Xác nhận xóa khách hàng"}
                </button>

                <button
                  type="button"
                  className="btn"
                  disabled={deleteBusy}
                  onClick={() => {
                    setOwnerPassword("");
                    setDeleteOpen(false);
                    setErr("");
                  }}
                >
                  Hủy
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
