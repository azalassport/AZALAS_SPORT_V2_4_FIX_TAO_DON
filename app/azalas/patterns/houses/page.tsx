"use client";

import { PageTop } from "@/components/ui";
import PartnerList from "@/components/partner-list";
import { HouseLedger } from "./house-ledger";

export default function Page(){
  return <>
    <PageTop title="Nhà may" kicker="QUẢN LÝ RẬP" description="Chốt bảng kê theo mâm, quản lý công nợ, ứng trước và thanh toán." back="/azalas/patterns" />
    <HouseLedger />
    <details className="panel mt-5"><summary className="cursor-pointer font-bold">Danh mục nhà may · Thêm / khóa nhà may</summary>
      <div className="mt-4"><PartnerList table="sewing_houses" label="nhà may" /></div>
    </details>
  </>;
}
