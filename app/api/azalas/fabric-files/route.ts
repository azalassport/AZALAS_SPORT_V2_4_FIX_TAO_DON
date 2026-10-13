import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";

type R2File = {body: ReadableStream<Uint8Array> | null; httpMetadata?: {contentType?:string}};
type Bucket = {
  put(key:string,body:ReadableStream | ArrayBuffer | Uint8Array, options?:{httpMetadata?:{contentType?:string}}):Promise<unknown>;
  get(key:string):Promise<R2File|null>;
  delete(key:string):Promise<void>;
};
// Resolve this runtime-only module lazily: next build evaluates route modules in Node,
// where cloudflare:workers does not exist. Vinext resolves it inside workerd.
async function bucket():Promise<Bucket|undefined>{
  const {env}=await import("cloudflare:workers");
  return (env as unknown as {AZALAS_IMAGES?:Bucket}).AZALAS_IMAGES;
}
const prefix="r2:";
const MAX_BYTES=8*1024*1024;

async function manager() {
  const sb=await createClient();
  const {data:{user},error}=await sb.auth.getUser();
  if(error||!user) return null;
  const {data:profile,error:pe}=await sb.from("az_profiles")
    .select("role,is_active").eq("id",user.id).maybeSingle();
  if(pe||!profile?.is_active||!["OWNER","ADMIN"].includes(profile.role))return null;
  return {sb,user};
}

function errorJson(message:string,status:number){
  return NextResponse.json({error:message},{status});
}

export async function POST(request:NextRequest){
  const actor=await manager();
  if(!actor)return errorJson("Không có quyền lưu ảnh nhà vải",403);
  const r2=await bucket();
  if(!r2)return errorJson("Cloudflare R2 chưa được cấu hình",503);
  const form=await request.formData();
  const file=form.get("file");
  if(!(file instanceof File)||file.type!=="image/png"||!file.size||file.size>MAX_BYTES){
    return errorJson("Ảnh PNG không hợp lệ hoặc lớn hơn 8MB",400);
  }
  const key=`${actor.user.id}/vai/${crypto.randomUUID()}.png`;
  await r2.put(key,await file.arrayBuffer(),{httpMetadata:{contentType:"image/png"}});
  return NextResponse.json({path:prefix+key});
}

export async function GET(request:NextRequest){
  const actor=await manager();
  if(!actor)return errorJson("Không có quyền xem ảnh nhà vải",403);
  const r2=await bucket();
  if(!r2)return errorJson("Cloudflare R2 chưa được cấu hình",503);
  const path=request.nextUrl.searchParams.get("path")||"";
  if(!path.startsWith(prefix)||!/^r2:[a-f0-9-]+\/vai\/[a-f0-9-]+\.png$/.test(path)){
    return errorJson("Đường dẫn R2 không hợp lệ",400);
  }
  // Chỉ đọc tệp đã được gắn với giao dịch Vải trong database.
  const {data,error}=await actor.sb.from("supply_entries")
    .select("id").eq("category","VAI").eq("document_path",path).is("deleted_at",null).limit(1);
  if(error||!data?.length)return errorJson("Ảnh chưa được liên kết với phiếu Vải",404);
  const object=await r2.get(path.slice(prefix.length));
  if(!object?.body)return errorJson("Ảnh không tồn tại trên R2",404);
  return new Response(object.body,{headers:{
    "Content-Type":"image/png","Cache-Control":"private, no-store",
    "X-Content-Type-Options":"nosniff"
  }});
}

export async function DELETE(request:NextRequest){
  const actor=await manager();
  if(!actor)return errorJson("Không có quyền xóa ảnh",403);
  const r2=await bucket();
  if(!r2)return errorJson("Cloudflare R2 chưa được cấu hình",503);
  const {path}=await request.json() as {path?:string};
  if(!path||!path.startsWith(prefix+actor.user.id+"/vai/")||
     !/^r2:[a-f0-9-]+\/vai\/[a-f0-9-]+\.png$/.test(path)){
    return errorJson("Không được xóa ảnh này",403);
  }
  const {data,error}=await actor.sb.from("supply_entries").select("id")
    .eq("document_path",path).limit(1);
  if(error)return errorJson("Không kiểm tra được tham chiếu ảnh",500);
  if(data?.length)return errorJson("Ảnh đã liên kết với phiếu, không được xóa",409);
  await r2.delete(path.slice(prefix.length));
  return NextResponse.json({ok:true});
}
