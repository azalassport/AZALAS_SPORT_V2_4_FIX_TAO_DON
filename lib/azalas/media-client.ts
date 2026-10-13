import type { SupabaseClient } from "@supabase/supabase-js";

export type R2Scope = "pattern" | "product" | "avatar" | "supply" | "return";
export function isR2Path(path: string | null | undefined): path is string {
  return !!path && path.startsWith("r2:");
}
export function r2MediaUrl(path: string) {
  return "/api/azalas/media?path=" + encodeURIComponent(path);
}

/** New files always go to R2. No Supabase Storage upload here. */
export async function uploadR2File(file: File | Blob, scope: R2Scope, filename = "upload.png"): Promise<string> {
  const body = new FormData();
  body.append("scope", scope);
  body.append("file", file, file instanceof File ? file.name : filename);
  const response = await fetch("/api/azalas/media", { method: "POST", body, credentials: "same-origin" });
  const result: { path?: string; error?: string } = await response.json().catch(() => ({}));
  if (!response.ok || !isR2Path(result.path)) throw new Error(result.error || "Không tải được tệp lên R2");
  return result.path;
}

/** Mixed old Supabase Storage paths and new R2 paths, no migration of old files. */
export async function mediaUrl(sb: SupabaseClient, bucket: string, path: string | null | undefined, expires = 3600) {
  if (!path) return "";
  if (isR2Path(path)) return r2MediaUrl(path);
  const { data, error } = await sb.storage.from(bucket).createSignedUrl(path, expires);
  if (error) throw error;
  return data?.signedUrl || "";
}
export async function mediaUrls(sb: SupabaseClient, bucket: string, paths: string[], expires = 3600): Promise<Record<string,string>> {
  const output: Record<string,string> = {};
  const old = [...new Set(paths.filter(path=>!!path&&!isR2Path(path)))];
  for(const path of paths) if(isR2Path(path)) output[path] = r2MediaUrl(path);
  if(old.length){
    const {data,error} = await sb.storage.from(bucket).createSignedUrls(old, expires);
    if(error) throw error;
    old.forEach((path,i)=>{output[path]=data?.[i]?.signedUrl || ""});
  }
  return output;
}
