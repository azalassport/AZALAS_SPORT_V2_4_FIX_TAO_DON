"use client";
import Link from "next/link";
import { useCallback,useEffect,useMemo,useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ImageViewer, PhotoInput } from "@/components/ui";
import ProductLookup, { type ProductChoice } from "@/components/products/product-lookup";
import { money, errorText } from "@/lib/azalas/format";

type Unit={id:number;group_id:number;order_code:string;status:string;warehouse_id:number|null;packing_note:string|null;started_by_name:string|null;started_by:string|null};
type Group={id:number;customer_name:string;creator_note:string|null;is_urgent:boolean;delivery_date:string|null;order_type:string};
type Row={product_name:string;color:string;size:string;quantity:string;unit_price:string;variant_id:number|null};
const blank=():Row=>({product_name:"",color:"",size:"",quantity:"",unit_price:"",variant_id:null});
const field="field";
export default function PackForm({unitId}:{unitId:number}){
 const sb=useMemo(()=>createClient(),[]),router=useRouter();
 const [unit,setUnit]=useState<Unit|null>(null),[group,setGroup]=useState<Group|null>(null),[warehouse,setWarehouse]=useState("");
 const [photos,setPhotos]=useState<string[]>([]),[newPhotos,setNewPhotos]=useState<File[]>([]),[photoBusy,setPhotoBusy]=useState(false),[role,setRole]=useState("");
 const [lines,setLines]=useState<Row[]>([blank()]),[note,setNote]=useState("");
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[success,setSuccess]=useState("");
 const load=useCallback(async()=>{
  setLoading(true);setError("");
  const {data:u,error:ue}=await sb.from("order_units").select("id,group_id,order_code,status,warehouse_id,packing_note,started_by_name,started_by").eq("id",unitId).single();
  if(ue||!u){setError(ue?.message||"Không tìm thấy đơn");setLoading(false);return;}
  const [{data:g,error:ge},{data:items,error:ie},{data:images,error:pe},{data:w},{data:{user}}]=await Promise.all([
   sb.from("order_groups").select("id,customer_name,creator_note,is_urgent,delivery_date,order_type").eq("id",u.group_id).single(),
   sb.from("order_items").select("product_name,color,size,quantity,unit_price,variant_id").eq("unit_id",unitId).order("line_no"),
   sb.from("order_images").select("storage_path").eq("group_id",u.group_id),
   u.warehouse_id?sb.from("az_warehouses").select("name").eq("id",u.warehouse_id).single():Promise.resolve({data:{name:"Khách đặt"}}),sb.auth.getUser()
  ]);
  if(ge||ie||pe){setError(ge?.message||ie?.message||pe?.message||"");}
  const urls:string[]=[];
  for(const img of images||[]){const {data:signed,error:se}=await sb.storage.from("az-order-images").createSignedUrl(img.storage_path,3600);if(signed?.signedUrl)urls.push(signed.signedUrl);if(se)setError("Không mở được ảnh đơn: "+se.message);}
  if(user){const {data:p}=await sb.from("az_profiles").select("role").eq("id",user.id).single();setRole(p?.role||"");}
  setUnit(u);setGroup(g);setWarehouse(w?.name||"Khách đặt");setNote(u.packing_note||"");setPhotos(urls);
  setLines(items?.length?items.map(x=>({product_name:x.product_name,color:x.color||"",size:x.size||"",quantity:String(x.quantity),unit_price:String(x.unit_price),variant_id:x.variant_id??null})):[blank()]);
  setLoading(false);
 },[sb,unitId]);useEffect(()=>{void load()},[load]);
 const manager=role==="OWNER"||role==="ADMIN";
 async function uploadPhotos(){if(!group||!newPhotos.length)return;setError("");setSuccess("");setPhotoBusy(true);
  const {data:{user}}=await sb.auth.getUser();if(!user){setError("Hết phiên đăng nhập");setPhotoBusy(false);return;}
  const failed:File[]=[];const reasons:string[]=[];
  for(const file of newPhotos){if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>8*1024*1024){failed.push(file);reasons.push(file.name+": chỉ JPG/PNG/WEBP dưới 8 MB");continue;}
   const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
   const path=`${user.id}/${group.id}/${crypto.randomUUID()}.${ext}`;
   const {error:up}=await sb.storage.from("az-order-images").upload(path,file,{contentType:file.type,upsert:false});
   if(up){failed.push(file);reasons.push(file.name+": "+up.message);continue;}
   const {error:link}=await sb.rpc("az_attach_order_image",{p_group_id:group.id,p_path:path});
   if(link){failed.push(file);reasons.push(file.name+": "+link.message);}
  }
  setNewPhotos(failed);setPhotoBusy(false);if(reasons.length)setError("Một số ảnh chưa lưu: "+reasons.join(" | ")+". Không tạo đơn mới.");else setSuccess("Đã bổ sung ảnh cho đơn. Ảnh có thể xem trong Chi tiết đơn và Kho ảnh.");await load();
 }
 async function start(){setBusy(true);setError("");const {error:e}=await sb.rpc("az_start_packing",{p_unit_id:unitId});if(e)setError(e.message);else await load();setBusy(false);}
 function edit(index:number,key:keyof Row,value:string){setLines(old=>old.map((r,i)=>i===index?{...r,[key]:value,...(["product_name","color","size"].includes(key)?{variant_id:null}:{})}:r));}
 function choose(x:ProductChoice){const row:Row={product_name:x.product_name,color:x.color,size:x.size,quantity:"",unit_price:"",variant_id:unit?.warehouse_id?x.variant_id:null};
  setLines(old=>{const first=old.findIndex(l=>!l.product_name.trim()&&!l.quantity&&!l.unit_price);if(first<0)return [...old,row];return old.map((l,i)=>i===first?row:l)});
  setSuccess(unit?.warehouse_id?`Đã chọn ${x.internal_code}. Khi xác nhận Soạn xong sẽ trừ đúng kho ${x.warehouse_name}.`:`Đã thêm ${x.product_name}; đơn Khách đặt chưa chọn kho nên sẽ không trừ tồn.`);
 }
 async function save(finish:boolean){setError("");const filled=lines.filter(x=>x.product_name.trim()||x.quantity||x.unit_price);
  for(const x of filled){if(!x.product_name.trim()||!/^[0-9]+$/.test(x.quantity)||Number(x.quantity)<1||!/^[0-9]+(\.[0-9]{1,2})?$/.test(x.unit_price)){setError("Mỗi dòng phải có tên SP, số lượng nguyên dương và đơn giá hợp lệ.");return;}}
  if(finish&&!filled.length){setError("Cần ít nhất một sản phẩm để soạn xong.");return;}
  setBusy(true);const {error:e}=await sb.rpc("az_save_packing",{p_unit_id:unitId,p_lines:filled.map(x=>({...x,quantity:Number(x.quantity),unit_price:Number(x.unit_price)})),p_note:note||null,p_finish:finish});
  setBusy(false);if(e){setError(e.message);return;}router.push("/azalas/orders");router.refresh();
 }
 const total=lines.reduce((sum,x)=>sum+(Number(x.quantity)||0)*(Number(x.unit_price)||0),0);
 return <div className="stack"><Link href="/azalas/orders" className="back-link">← Quay lại Chi tiết đơn</Link>
  {loading&&<p className="panel muted">Đang tải đơn...</p>}{error&&<p className="alert error" role="alert">{error}</p>}{success&&<p className="alert ok">{success}</p>}
  {!loading&&unit&&group&&<>
   <section className="panel stack"><div className="flex items-center justify-between gap-3"><h1 className="text-2xl font-extrabold">{unit.order_code}</h1>{group.is_urgent&&<b className="chip urgent">🔥 GẤP</b>}</div>
    <div className="grid gap-2 text-sm sm:grid-cols-2"><p><b>Khách:</b> {group.customer_name}</p><p><b>Kho:</b> {warehouse}</p><p><b>Trạng thái:</b> {unit.status}</p><p><b>Người soạn:</b> {unit.started_by_name||"—"}</p><p><b>Ngày giao:</b> {group.delivery_date||"—"}</p></div>
    <p className="rounded-xl bg-slate-100 p-3 text-sm"><b>Ghi chú tạo đơn:</b> {group.creator_note||"Không có"}</p>
    <div><h2 className="mb-3">Ảnh tạo đơn · nhấn ảnh để xem lớn</h2>{photos.length?<ImageViewer urls={photos} label="Ảnh tạo đơn"/>:<p className="alert error">Chưa có ảnh đã lưu trong đơn này. Nếu trước đây báo “Bucket not found”, hãy tạo bucket và bổ sung lại ảnh ở dưới.</p>}</div>
    {manager&&<div className="rounded-xl border border-dashed border-blue-300 p-3"><PhotoInput files={newPhotos} setFiles={setNewPhotos} label="Bổ sung ảnh cho đơn đã tạo (không tạo trùng đơn)"/><button className="btn soft mt-3" disabled={!newPhotos.length||photoBusy} onClick={uploadPhotos}>{photoBusy?"Đang lưu ảnh...":"Lưu ảnh bổ sung"}</button></div>}
   </section>
   {(unit.status==="MOI"||unit.status==="NO_DON")&&<button disabled={busy} onClick={start} className="btn success py-4">BẮT ĐẦU SOẠN {unit.status==="NO_DON"?"LẠI":"ĐƠN"}</button>}
   {unit.status==="DANG_SOAN"&&<>
    <ProductLookup warehouseId={unit.warehouse_id} onChoose={choose}/>
    <section className="panel stack"><h2>Bảng soạn hàng</h2><p className="muted text-sm">Chọn sản phẩm bên trên để liên kết và tự trừ tồn khi hoàn tất. Dòng nhập tay không tự trừ tồn. Nhấn “+ Thêm dòng sản phẩm” nếu cần.</p>
     <div className="az-table-wrap az-pack-table-wrap"><table className="az-table az-pack-table"><thead><tr><th>#</th><th>SẢN PHẨM</th><th>SL</th><th>GIÁ</th><th>T.TIỀN</th><th>XÓA</th></tr></thead><tbody>{lines.map((line,i)=><tr key={i}>
      <td data-label="#">{i+1}</td><td data-label="SẢN PHẨM"><input className={field} placeholder="Nhập tên sản phẩm" value={line.product_name} onChange={e=>edit(i,"product_name",e.target.value)}/><div className="mt-2 grid grid-cols-2 gap-2"><input className={field} placeholder="Màu" value={line.color} onChange={e=>edit(i,"color",e.target.value)}/><input className={field} placeholder="Size" value={line.size} onChange={e=>edit(i,"size",e.target.value)}/></div>{line.variant_id?<span className="mt-2 inline-block text-xs font-semibold text-green-700">✓ Liên kết kho · ID {line.variant_id}</span>:<span className="mt-2 inline-block text-xs text-slate-500">Nhập tay · không trừ kho</span>}</td>
      <td data-label="SL"><input className={field} type="number" min="1" step="1" value={line.quantity} onChange={e=>edit(i,"quantity",e.target.value)}/></td><td data-label="GIÁ"><input className={field} type="number" min="0" step="0.01" value={line.unit_price} onChange={e=>edit(i,"unit_price",e.target.value)}/></td><td data-label="T.TIỀN" className="font-extrabold">{money((Number(line.quantity)||0)*(Number(line.unit_price)||0))}</td>
      <td data-label="XÓA"><button className="btn danger" aria-label={`Xóa dòng ${i+1}`} onClick={()=>setLines(v=>v.length>1?v.filter((_,j)=>j!==i):[blank()])}>×</button></td>
     </tr>)}</tbody></table></div>
     <button onClick={()=>setLines(v=>[...v,blank()])} className="btn soft w-fit">+ Thêm dòng sản phẩm</button>
     <label className="block font-semibold">Ghi chú soạn hàng<textarea rows={3} className="field mt-2" value={note} onChange={e=>setNote(e.target.value)}/></label><p className="text-right text-xl font-extrabold">Tổng cộng: {money(total)}</p>
     <div className="flex flex-wrap gap-3"><button disabled={busy} onClick={()=>save(false)} className="btn soft flex-1">Lưu nháp</button><button disabled={busy} onClick={()=>save(true)} className="btn success flex-1">XÁC NHẬN & SOẠN XONG</button></div>
    </section></>}
   {unit.status==="DA_SOAN"&&<div className="alert ok">Đã soạn xong. Đơn xuất hiện trong mục Hóa đơn, ảnh tạo đơn vẫn xem được.</div>}
  </>}
 </div>;
}
