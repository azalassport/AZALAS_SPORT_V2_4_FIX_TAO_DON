"use client";

import { useState } from "react";
import Link from "next/link";

type Probe = {
  ok?:boolean; write?:boolean; read?:boolean; delete?:boolean;
  database_changed?:boolean; error?:string;
};

export default function R2FabricTestPage(){
  const [busy,setBusy]=useState(false);
  const [result,setResult]=useState<Probe|null>(null);
  async function run(){
    setBusy(true);setResult(null);
    try{
      const response=await fetch("/api/azalas/fabric-files?probe=1",{
        method:"POST",cache:"no-store",
      });
      const body=await response.json() as Probe;
      setResult(response.ok?body:{error:body.error||"Kiểm tra R2 thất bại"});
    }catch(e){
      setResult({error:e instanceof Error?e.message:String(e)});
    }finally{setBusy(false);}
  }
  return (
    <main style={{maxWidth:720,margin:"36px auto",padding:24,fontFamily:"system-ui"}}>
      <Link href="/azalas/materials/fabric">← Quay lại Vải</Link>
      <h1 style={{fontSize:26,fontWeight:750,marginTop:24}}>Kiểm tra R2 — module Vải</h1>
      <p>Thử ghi một tệp nhỏ lên R2, đọc lại rồi xóa. Không tạo phiếu, thanh toán hoặc sửa công nợ Supabase.</p>
      <button type="button" disabled={busy} onClick={()=>void run()}
        style={{background:"#08795d",border:0,color:"white",borderRadius:12,padding:"14px 20px",fontWeight:700,cursor:"pointer"}}>
        {busy?"ĐANG KIỂM TRA...":"KIỂM TRA GHI / ĐỌC / XÓA R2"}
      </button>
      {result&&<div role="status" style={{marginTop:22,border:"1px solid #cbd5e1",borderRadius:12,padding:18}}>
        {result.error?<p style={{color:"#b91c1c"}}>{result.error}</p>:(
          <>
            <p style={{fontWeight:750}}>{result.ok?"R2 HOẠT ĐỘNG TỐT":"R2 KIỂM TRA CHƯA ĐẠT"}</p>
            <p>Ghi: {result.write?"OK":"Lỗi"} · Đọc: {result.read?"OK":"Lỗi"} · Xóa: {result.delete?"OK":"Lỗi"}</p>
            <p>Thay đổi dữ liệu Supabase: KHÔNG</p>
          </>
        )}
      </div>}
    </main>
  );
}
