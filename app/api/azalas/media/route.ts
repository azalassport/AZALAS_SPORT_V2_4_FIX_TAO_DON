import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "edge";

// Only new non-production workflows use this endpoint.
// Production order / packing / invoice / image-library buckets remain untouched.
type R2Body = { body: ReadableStream<Uint8Array> | null; httpMetadata?: { contentType?: string } };
type R2Bucket = {
  put(key: string, value: ArrayBuffer, options: { httpMetadata: { contentType: string } }): Promise<unknown>;
  get(key: string): Promise<R2Body | null>;
};
type Scope = "pattern" | "product" | "avatar" | "supply" | "return";
const MIME: Record<string, string> = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "application/pdf": "pdf",
};
const MAX_IMAGE = 8 * 1024 * 1024;
const MAX_PDF = 15 * 1024 * 1024;
const WRITE_MANAGER = new Set<Scope>(["pattern", "product", "supply", "return"]);
const READ_MANAGER = new Set<Scope>(["supply", "return"]);
const R2_RE = /^r2:([0-9a-f-]{36})\/(pattern|product|avatar|supply|return)\/([0-9a-f-]{36})\.(png|jpg|webp|pdf)$/;

function fail(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}
async function auth() {
  const sb = await createClient();
  const { data: { user }, error } = await sb.auth.getUser();
  if (error || !user) return null;
  const { data: profile, error: pe } = await sb.from("az_profiles")
    .select("role,is_active").eq("id", user.id).maybeSingle();
  if (pe || !profile?.is_active || !["OWNER","ADMIN","MEMBER"].includes(profile.role)) return null;
  return { user, role: String(profile.role) };
}
async function r2Bucket(): Promise<R2Bucket | undefined> {
  // Dynamic import prevents Node-side Next/Vinext build from importing worker module.
  const { env } = await import("cloudflare:workers");
  return (env as unknown as { AZALAS_IMAGES?: R2Bucket }).AZALAS_IMAGES;
}
function allowed(scope: Scope, role: string, write: boolean) {
  return (write ? WRITE_MANAGER : READ_MANAGER).has(scope)
    ? (role === "OWNER" || role === "ADMIN")
    : true;
}
function validMagic(bytes: Uint8Array, mime: string) {
  const x = (n: number) => bytes[n];
  if (mime === "image/png") return x(0) === 137 && x(1) === 80 && x(2) === 78 && x(3) === 71;
  if (mime === "image/jpeg") return x(0) === 255 && x(1) === 216 && x(2) === 255;
  if (mime === "image/webp") return String.fromCharCode(...bytes.slice(0,4)) === "RIFF" && String.fromCharCode(...bytes.slice(8,12)) === "WEBP";
  if (mime === "application/pdf") return String.fromCharCode(...bytes.slice(0,5)) === "%PDF-";
  return false;
}

export async function POST(request: NextRequest) {
  const actor = await auth();
  if (!actor) return fail("Hết phiên đăng nhập hoặc tài khoản không hoạt động", 401);
  const r2 = await r2Bucket();
  if (!r2) return fail("Chưa cấu hình R2", 503);
  const form = await request.formData();
  const scope = String(form.get("scope") || "") as Scope;
  if (!["pattern","product","avatar","supply","return"].includes(scope)) return fail("Nhóm tệp không hợp lệ");
  if (!allowed(scope, actor.role, true)) return fail("Không có quyền tải tệp ở chức năng này", 403);
  const file = form.get("file");
  if (!(file instanceof File)) return fail("Chưa có tệp");
  const ext = MIME[file.type];
  if (!ext || file.size <= 0 || file.size > (ext === "pdf" ? MAX_PDF : MAX_IMAGE))
    return fail("Chỉ nhận PNG/JPG/WebP tối đa 8MB hoặc PDF tối đa 15MB");
  if (ext === "pdf" && scope !== "supply") return fail("Chỉ chứng từ phụ liệu được phép dùng PDF");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!validMagic(bytes, file.type)) return fail("Nội dung tệp không khớp định dạng");
  const key = `${actor.user.id}/${scope}/${crypto.randomUUID()}.${ext}`;
  try {
    await r2.put(key, bytes.buffer as ArrayBuffer, { httpMetadata: { contentType: file.type } });
    return NextResponse.json({ path: "r2:" + key });
  } catch {
    return fail("Không ghi được tệp lên R2", 503);
  }
}

export async function GET(request: NextRequest) {
  const actor = await auth();
  if (!actor) return fail("Chưa đăng nhập", 401);
  const path = request.nextUrl.searchParams.get("path") || "";
  const match = path.match(R2_RE);
  if (!match) return fail("Đường dẫn R2 không hợp lệ");
  const scope = match[2] as Scope;
  if (!allowed(scope, actor.role, false)) return fail("Không có quyền đọc chứng từ", 403);
  if (scope === "avatar" && match[4] === "pdf") return fail("Tệp không hợp lệ");
  const r2 = await r2Bucket();
  if (!r2) return fail("Chưa cấu hình R2", 503);
  const file = await r2.get(path.slice(3));
  if (!file?.body) return fail("Không tìm thấy tệp R2", 404);
  const contentType = Object.entries(MIME).find(([,ext])=>ext===match[4])?.[0] || "application/octet-stream";
  return new Response(file.body, { headers: {
    "Content-Type": contentType, "X-Content-Type-Options": "nosniff",
    "Cache-Control": "private, no-store",
    "Content-Security-Policy": "default-src 'none'; sandbox",
  } });
}
