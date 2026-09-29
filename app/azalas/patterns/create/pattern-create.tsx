"use client";
import { useState } from "react";
import PatternHouseEntry from "./pattern-house-entry";
import PatternCustomerEntry from "./pattern-customer-entry";

export default function PatternCreate() {
  const [mode, setMode] = useState<"THUONG" | "KHACH_DAT">("THUONG");
  return <div className="stack">
    <div className="grid gap-2 sm:grid-cols-2">
      <button type="button" className={`btn ${mode === "THUONG" ? "primary" : "soft"}`}
        onClick={() => setMode("THUONG")}>Hàng nhà · phiếu PNR nhiều hiệu/màu</button>
      <button type="button" className={`btn ${mode === "KHACH_DAT" ? "primary" : "soft"}`}
        onClick={() => setMode("KHACH_DAT")}>Khách đặt · tạo rập không cần mã đơn</button>
    </div>
    {mode === "THUONG" ? <PatternHouseEntry /> : <PatternCustomerEntry />}
  </div>;
}
