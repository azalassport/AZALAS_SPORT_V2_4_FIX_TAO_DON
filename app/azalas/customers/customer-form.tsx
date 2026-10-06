"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import { Msg } from "@/components/ui";

const fields = [
  ["name", "Tên khách hàng *"],
  ["phone", "Số điện thoại"],
  ["address", "Địa chỉ"],
  ["transport_station", "Chành xe"],
  ["transport_phone", "SĐT chành xe"],
] as const;

const emptyForm = {
  name: "",
  phone: "",
  address: "",
  transport_station: "",
  transport_phone: "",
};

export default function CustomerForm({
  onCreated,
}: {
  onCreated?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    setErr("");

    if (!form.name.trim()) {
      setErr("Tên khách không được trống.");
      return;
    }

    setBusy(true);

    try {
      const sb = createClient();
      const {
        data: { user },
      } = await sb.auth.getUser();

      if (!user) {
        setErr("Hết phiên đăng nhập.");
        return;
      }

      const { error } = await sb.from("az_customers").insert({
        ...form,
        name: form.name.trim(),
        phone: form.phone.trim() || null,
        address: form.address.trim() || null,
        transport_station: form.transport_station.trim() || null,
        transport_phone: form.transport_phone.trim() || null,
        created_by: user.id,
      });

      if (error) {
        setErr(error.message);
        return;
      }

      setForm(emptyForm);
      setOpen(false);
      onCreated?.();
    } finally {
      setBusy(false);
    }
  }

  function closeForm() {
    if (busy) return;
    setErr("");
    setForm(emptyForm);
    setOpen(false);
  }

  if (!open) {
    return (
      <section className="panel">
        <button
          type="button"
          className="btn primary px-5 py-3 text-base font-black"
          onClick={() => {
            setErr("");
            setOpen(true);
          }}
        >
          ＋ Thêm khách hàng
        </button>
      </section>
    );
  }

  return (
    <form onSubmit={save} className="panel stack">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="eyebrow">KHÁCH HÀNG</div>
          <h2 className="mt-1 text-2xl font-black">Thêm khách hàng mới</h2>
          <p className="muted mt-1 text-sm">
            Nhập thông tin cần thiết rồi bấm Lưu khách hàng.
          </p>
        </div>

        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={closeForm}
        >
          Đóng
        </button>
      </div>

      <Msg error={err} />

      <div className="grid gap-4 md:grid-cols-2">
        {fields.map(([key, label]) => (
          <label key={key} className="text-sm font-bold">
            {label}
            <input
              className="field mt-2 text-base"
              required={key === "name"}
              value={form[key]}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  [key]: event.target.value,
                }))
              }
            />
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          className="btn primary px-5 py-3 text-base font-black"
          disabled={busy || !form.name.trim()}
        >
          {busy ? "Đang thêm..." : "Lưu khách hàng"}
        </button>

        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={closeForm}
        >
          Hủy
        </button>
      </div>
    </form>
  );
}
