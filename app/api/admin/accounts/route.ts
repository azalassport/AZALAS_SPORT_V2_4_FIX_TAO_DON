import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Role = "OWNER" | "ADMIN" | "MEMBER";

const INTERNAL_DOMAIN = "azalas.local";

function normalizeLoginName(v: unknown) {
  return String(v ?? "").trim().toLowerCase();
}

function validateLoginName(loginName: string) {
  if (loginName.length < 2 || loginName.length > 32) {
    throw new Error("Tên đăng nhập phải từ 2 đến 32 ký tự");
  }
  if (!/^[a-z0-9._-]+$/.test(loginName)) {
    throw new Error("Tên đăng nhập chỉ dùng chữ không dấu, số, dấu chấm, gạch dưới hoặc gạch ngang");
  }
  if (!/^[a-z0-9]/.test(loginName) || !/[a-z0-9]$/.test(loginName) || loginName.includes("..")) {
    throw new Error("Tên đăng nhập không hợp lệ");
  }
}

function authEmail(loginName: string) {
  return `${loginName}@${INTERNAL_DOMAIN}`;
}

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Thiếu SUPABASE_SERVICE_ROLE_KEY trong .env.local");
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function userDbClient(token: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Thiếu SUPABASE_SERVICE_ROLE_KEY trong .env.local");

  // Dùng service key ở lớp apikey, nhưng ép Authorization về JWT của người đang đăng nhập.
  // Nhờ đó PostgREST/RLS nhìn đúng auth.uid() của OWNER/ADMIN hiện tại.
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  });
}

async function actor(req: NextRequest) {
  const token = (req.headers.get("authorization") || "")
    .replace(/^Bearer\s+/i, "")
    .trim();

  if (!token) throw new Error("Hết phiên đăng nhập");

  const sb = adminClient();

  const { data: authData, error: authError } = await sb.auth.getUser(token);
  if (authError || !authData.user) {
    throw new Error("Phiên đăng nhập không hợp lệ");
  }

  // Đọc hồ sơ bằng chính JWT của người gọi để RLS/auth.uid() khớp tuyệt đối.
  // Sau đó mới dùng service client cho các thao tác quản trị Auth.
  const callerDb = userDbClient(token);
  const { data: callerProfile, error: callerError } = await callerDb
    .from("az_profiles")
    .select("id,display_name,role,is_active")
    .eq("id", authData.user.id)
    .maybeSingle();

  // Fallback service-role để tránh trường hợp policy/schema cache cũ.
  let profile = callerProfile;
  if (!profile) {
    const { data: fallbackProfile, error: fallbackError } = await sb
      .from("az_profiles")
      .select("id,display_name,role,is_active")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (fallbackError) {
      throw new Error(`Không đọc được hồ sơ tài khoản: ${fallbackError.message}`);
    }
    profile = fallbackProfile;
  }

  if (!profile) {
    const detail = callerError?.message ? ` (${callerError.message})` : "";
    throw new Error(`Không tìm thấy hồ sơ tài khoản${detail}`);
  }

  if (!profile.is_active) {
    throw new Error("Tài khoản chưa được kích hoạt");
  }

  if (profile.role !== "OWNER" && profile.role !== "ADMIN") {
    throw new Error("Không có quyền quản lý tài khoản");
  }

  return {
    sb,
    user: authData.user,
    profile: profile as {
      id:string;
      display_name:string;
      role:Role;
      is_active:boolean;
    }
  };
}

export async function GET(req: NextRequest) {
  try {
    const { sb } = await actor(req);

    const [
      { data: authList, error: ae },
      { data: profiles, error: pe },
      { data: staff, error: se }
    ] = await Promise.all([
      sb.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      sb.from("az_profiles")
        .select("id,display_name,phone,login_name,role,is_active,created_at")
        .order("created_at"),
      sb.from("az_staff")
        .select("id,display_name,phone,status,profile_id,join_date,daily_rate")
        .order("display_name")
    ]);

    if (ae || pe || se) {
      throw new Error(ae?.message || pe?.message || se?.message || "Không tải được tài khoản");
    }

    const emailMap = new Map((authList.users || []).map(u => [u.id, u.email || ""]));
    const staffMap = new Map(
      (staff || []).filter(s => s.profile_id).map(s => [s.profile_id, s])
    );

    const accounts = (profiles || []).map(p => ({
      ...p,
      email: emailMap.get(p.id) || "",
      staff: staffMap.get(p.id) || null
    }));

    return NextResponse.json({
      ok: true,
      accounts,
      staff: staff || []
    });
  } catch (e) {
    return NextResponse.json(
      { ok:false, message:e instanceof Error?e.message:String(e) },
      { status:400 }
    );
  }
}

export async function POST(req: NextRequest) {
  let createdId = "";

  try {
    const { sb, profile: actorProfile } = await actor(req);
    const body = await req.json();

    const staffId = Number(body.staff_id || 0);
    const loginName = normalizeLoginName(body.login_name);
    const password = String(body.password || "");
    const role = String(body.role || "MEMBER") as Role;

    if (!staffId) throw new Error("Chưa chọn nhân viên");
    validateLoginName(loginName);
    if (password.length < 6) throw new Error("Mật khẩu phải có ít nhất 6 ký tự");

    if (!(["ADMIN","MEMBER"] as string[]).includes(role)) {
      throw new Error("Quyền không hợp lệ");
    }
    if (actorProfile.role === "ADMIN" && role !== "MEMBER") {
      throw new Error("ADMIN chỉ được tạo tài khoản MEMBER");
    }

    const { data: duplicate } = await sb
      .from("az_profiles")
      .select("id")
      .eq("login_name", loginName)
      .maybeSingle();

    if (duplicate) throw new Error("Tên đăng nhập này đã tồn tại");

    const { data: staff, error: staffError } = await sb
      .from("az_staff")
      .select("id,display_name,phone,status,profile_id")
      .eq("id", staffId)
      .single();

    if (staffError || !staff) throw new Error("Không tìm thấy nhân viên");
    if (staff.status !== "DANG_LAM") throw new Error("Nhân viên đã nghỉ, không thể tạo tài khoản");
    if (staff.profile_id) throw new Error("Nhân viên này đã có tài khoản");

    const email = authEmail(loginName);

    const { data: created, error: createError } = await sb.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: staff.display_name,
        login_name: loginName
      }
    });

    if (createError || !created.user) {
      throw new Error(createError?.message || "Không tạo được tài khoản");
    }

    createdId = created.user.id;

    const { error: profileError } = await sb
      .from("az_profiles")
      .upsert({
        id: createdId,
        display_name: staff.display_name,
        phone: staff.phone,
        login_name: loginName,
        role,
        is_active: true
      }, { onConflict: "id" });

    if (profileError) throw new Error(profileError.message);

    const { error: linkError } = await sb
      .from("az_staff")
      .update({ profile_id: createdId })
      .eq("id", staffId);

    if (linkError) throw new Error(linkError.message);

    return NextResponse.json({
      ok:true,
      message:`Đã tạo tài khoản ${loginName} cho ${staff.display_name}.`
    });

  } catch (e) {
    if (createdId) {
      try { await adminClient().auth.admin.deleteUser(createdId); } catch {}
    }

    return NextResponse.json(
      { ok:false, message:e instanceof Error?e.message:String(e) },
      { status:400 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { sb, user: actorUser, profile: actorProfile } = await actor(req);
    const body = await req.json();

    const id = String(body.id || "");
    const role = body.role ? String(body.role) as Role : undefined;
    const isActive = typeof body.is_active === "boolean" ? body.is_active : undefined;

    if (!id) throw new Error("Thiếu tài khoản cần cập nhật");
    if (id === actorUser.id) throw new Error("Không được tự đổi quyền hoặc khóa chính mình");

    const { data: target, error } = await sb
      .from("az_profiles")
      .select("id,role,is_active")
      .eq("id", id)
      .single();

    if (error || !target) throw new Error("Không tìm thấy tài khoản");
    if (target.role === "OWNER") throw new Error("Tài khoản OWNER được khóa bảo vệ");

    if (actorProfile.role === "ADMIN") {
      if (target.role !== "MEMBER") {
        throw new Error("ADMIN không được sửa tài khoản ADMIN/OWNER");
      }
      if (role && role !== "MEMBER") {
        throw new Error("Chỉ OWNER được cấp quyền ADMIN");
      }
    }

    if (role && !(["ADMIN","MEMBER"] as string[]).includes(role)) {
      throw new Error("Quyền không hợp lệ");
    }

    const patch: Record<string, unknown> = {};
    if (role) patch.role = role;
    if (isActive !== undefined) patch.is_active = isActive;

    if (!Object.keys(patch).length) throw new Error("Không có thay đổi");

    const { error: updateError } = await sb
      .from("az_profiles")
      .update(patch)
      .eq("id", id);

    if (updateError) throw new Error(updateError.message);

    return NextResponse.json({
      ok:true,
      message:"Đã cập nhật tài khoản."
    });

  } catch (e) {
    return NextResponse.json(
      { ok:false, message:e instanceof Error?e.message:String(e) },
      { status:400 }
    );
  }
}
