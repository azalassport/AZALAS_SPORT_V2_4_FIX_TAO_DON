"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ImageViewer } from "@/components/ui";

type Variant = {
 variant_id:number; internal_code:string; sales_code:string; product_name:string;
 color:string; size:string; brand:string|null; image_path:string|null;
 warehouse_id:number; warehouse_name:string; qty_on_hand:number;
};
export type ProductChoice = Variant;

export default function ProductLookup({warehouseId,onChoose}:{warehouseId:number|null;onChoose:(choice:ProductChoice)=>void}){
 const sb=useMemo(()=>createClient(),[]);
 const [query,setQuery]=useState("");const [rows,setRows]=useState<Variant[]>([]);
 const [urls,setUrls]=useState<Record<string,string>>({});const [err,setErr]=useState("");const [busy,setBusy]=useState(false);
 async function search(){if(query.trim().length<2){setErr("Nhập ít nhất 2 ký tự để tìm sản phẩm.");return;}
  setBusy(true);setErr("");const {data,error}=await sb.rpc("az_quick_product_search",{p_q:query.trim(),p_warehouse_id:warehouseId});
  setBusy(false);if(error){setErr(error.message);return;}
  const found=(data||[]) as Variant[];setRows(found);
  const paths=Array.from(new Set(found.map(x=>x.image_path).filter((v):v is string=>!!v)));
  if(paths.length){const {data:signed,error:photoError}=await sb.storage.from("az-product-images").createSignedUrls(paths,1800);
    if(photoError)setErr("Không tải được ảnh sản phẩm: "+photoError.message);
    else setUrls(Object.fromEntries(paths.map((p,i)=>[p,signed?.[i]?.signedUrl||""])));
  }
 }
 return <section className="panel stack border-blue-200 bg-[#f8fbff]">
  <div className="flex flex-wrap justify-between gap-2"><div><h2 className="text-blue-800">⌕ TÌM SẢN PHẨM (KHÔNG BẮT BUỘC)</h2><p className="muted mt-1 text-sm">Nhập tên hoặc mã để hiện màu có ảnh, tồn theo kho và size. Chọn một size để thêm vào bảng soạn và tự trừ tồn khi soạn xong.</p></div><span className="chip">Tên → Màu → Size</span></div>
  <div className="flex flex-col gap-2 sm:flex-row"><input className="field flex-1" placeholder="VD: Quần 2 lớp nam / 859DUI-NAI-DEN" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")void search()}}/><button className="btn primary" disabled={busy} onClick={search}>{busy?"Đang tìm...":"TÌM"}</button></div>
  {err&&<p role="alert" className="alert error">{err}</p>}
  {!busy&&query.trim().length>=2&&rows.length===0&&!err&&<p className="muted text-sm">Chưa thấy sản phẩm trong danh mục Supabase. Có thể nhập tay nhưng dòng nhập tay sẽ không tự trừ kho.</p>}
  {rows.length>0&&<div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{rows.map(x=><div className="rounded-xl border border-blue-100 bg-white p-3" key={`${x.variant_id}-${x.warehouse_id}`}>
    {x.image_path&&urls[x.image_path]&&<ImageViewer urls={[urls[x.image_path]]} label={x.product_name}/>}
    <b className="block break-words text-blue-900">{x.product_name}</b><p className="text-xs text-slate-500">{x.sales_code} · {x.internal_code}</p><div className="mt-2 flex flex-wrap items-center gap-2"><span className="chip">{x.color||"Không màu"}</span><span className="chip">Size {x.size||"—"}</span></div>
    <p className={`mt-2 text-sm font-semibold ${Number(x.qty_on_hand)>0?"text-green-700":"text-red-700"}`}>{x.warehouse_name}: tồn {Number(x.qty_on_hand).toLocaleString("vi-VN")}</p>
    <button className="btn soft mt-3 w-full" onClick={()=>onChoose(x)}>+ Chọn size này</button>
  </div>)}</div>}
 </section>
}
