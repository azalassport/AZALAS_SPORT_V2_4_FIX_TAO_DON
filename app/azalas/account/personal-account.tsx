"use client";

import { R2_AVATAR_PROFILE_READY, R2_SQL_BLOCKED_MESSAGE } from "@/lib/azalas/r2-rollout-gates";
import {
  Camera,
  CheckCircle2,
  MapPin,
  Phone,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { mediaUrl, uploadR2File } from "@/lib/azalas/media-client";
import { Loading, Msg } from "@/components/ui";

type Role = "OWNER" | "ADMIN" | "MEMBER";

type Profile = {
  id: string;
  display_name: string;
  phone: string | null;
  address: string | null;
  avatar_path: string | null;
  login_name: string | null;
  role: Role;
  is_active: boolean;
};

const roleInfo: Record<
  Role,
  { label: string; description: string; tone: string }
> = {
  OWNER: {
    label: "OWNER",
    description: "Chủ hệ thống · Toàn quyền quản trị",
    tone: "border-violet-200 bg-violet-50 text-violet-700",
  },
  ADMIN: {
    label: "ADMIN",
    description: "Quản trị viên · Quản lý nghiệp vụ và nhân sự",
    tone: "border-blue-200 bg-blue-50 text-blue-700",
  },
  MEMBER: {
    label: "MEMBER",
    description: "Nhân viên · Sử dụng các chức năng được phân quyền",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
};

export default function PersonalAccount() {
  const sb = useMemo(() => createClient(), []);
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [avatarUrl, setAvatarUrl] = useState("");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState("");

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setErr("");

    const {
      data: { user },
    } = await sb.auth.getUser();

    if (!user) {
      setErr("Hết phiên đăng nhập. Vui lòng đăng nhập lại.");
      setLoading(false);
      return;
    }

    const { data, error } = await sb
      .from("az_profiles")
      .select(
        "id,display_name,phone,address,avatar_path,login_name,role,is_active",
      )
      .eq("id", user.id)
      .single();

    if (error || !data) {
      setErr(error?.message || "Không tải được thông tin tài khoản.");
      setLoading(false);
      return;
    }

    const next = data as Profile;
    setProfile(next);

    if (next.avatar_path) {
      setAvatarUrl(await mediaUrl(sb,"az-avatars",next.avatar_path,3600));
    } else {
      setAvatarUrl("");
    }

    setLoading(false);
  }, [sb]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => {
      if (avatarPreview) URL.revokeObjectURL(avatarPreview);
    };
  }, [avatarPreview]);

  function chooseAvatar(file: File | null) {
    setErr("");
    setOk("");

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      setErr("Vui lòng chọn file ảnh.");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setErr("Ảnh đại diện tối đa 5 MB.");
      return;
    }

    if (avatarPreview) URL.revokeObjectURL(avatarPreview);

    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  }

  async function save() {
    if (!profile) return;

    const displayName = profile.display_name.trim();

    if (!displayName) {
      setErr("Tên hiển thị không được để trống.");
      return;
    }

    if (avatarFile && !R2_AVATAR_PROFILE_READY) { setErr(R2_SQL_BLOCKED_MESSAGE); return; }
    setBusy(true);
    setErr("");
    setOk("");

    let nextAvatarPath = profile.avatar_path;

    try {
      const {
        data: { user },
      } = await sb.auth.getUser();

      if (!user) throw new Error("Hết phiên đăng nhập.");

      if (avatarFile) {
        nextAvatarPath = await uploadR2File(avatarFile,"avatar");
      }

      const { error: updateError } = await sb.rpc("az_update_my_profile", {
        p_display_name: displayName,
        p_phone: profile.phone?.trim() || "",
        p_address: profile.address?.trim() || "",
        p_avatar_path: nextAvatarPath || "",
      });

      if (updateError) throw new Error(updateError.message);

      // Preserve old Supabase Storage avatars for existing clients.

      setAvatarFile(null);
      if (avatarPreview) {
        URL.revokeObjectURL(avatarPreview);
        setAvatarPreview("");
      }

      setOk("Đã cập nhật tài khoản cá nhân.");
      await load();

      // AppShell nhận profile từ server layout.
      // Refresh để avatar góc trên bên phải lấy avatar_path mới ngay sau khi lưu.
      router.refresh();
    } catch (error) {
      setErr(
        error instanceof Error
          ? error.message
          : "Không thể cập nhật tài khoản.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading />;
  if (!profile) return <Msg error={err || "Không tìm thấy tài khoản."} />;

  const role = roleInfo[profile.role];
  const shownAvatar = avatarPreview || avatarUrl;

  return (
    <div className="space-y-5">
      <Msg error={err} success={ok} />

      <section className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
        <div className="grid gap-6 bg-gradient-to-br from-blue-50 via-white to-violet-50 p-5 sm:p-7 lg:grid-cols-[240px_1fr] lg:items-center">
          <div className="flex flex-col items-center">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="group relative grid h-36 w-36 place-items-center overflow-hidden rounded-full border-4 border-white bg-blue-100 text-blue-700 shadow-[0_16px_36px_rgba(37,99,235,0.18)] sm:h-40 sm:w-40"
              aria-label="Đổi ảnh đại diện"
            >
              {shownAvatar ? (
                <img
                  src={shownAvatar}
                  alt="Ảnh đại diện"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="text-5xl font-black">
                  {profile.display_name.charAt(0).toUpperCase() || "A"}
                </span>
              )}

              <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-slate-950/65 py-2 text-[12px] font-black text-white opacity-100 sm:opacity-0 sm:transition sm:group-hover:opacity-100">
                <Camera size={15} />
                Đổi ảnh
              </span>
            </button>

            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(event) => {
                chooseAvatar(event.target.files?.[0] || null);
                event.currentTarget.value = "";
              }}
            />

            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-blue-200 bg-white px-4 py-2.5 text-[13px] font-black text-blue-700 transition hover:bg-blue-50"
            >
              <Camera size={17} />
              Chọn ảnh avatar
            </button>

            <p className="mt-2 text-center text-[12px] font-medium text-slate-400">
              JPG, PNG hoặc WEBP · tối đa 5 MB
            </p>
          </div>

          <div className="min-w-0 text-center lg:text-left">
            <div className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-700">
              TÀI KHOẢN CỦA TÔI
            </div>

            <h2 className="mt-2 truncate text-[28px] font-black tracking-[-0.6px] text-slate-950 sm:text-[36px]">
              {profile.display_name}
            </h2>

            {profile.login_name && (
              <p className="mt-1 text-[14px] font-semibold text-slate-500">
                Tên đăng nhập: {profile.login_name}
              </p>
            )}

            <div
              className={`mt-4 inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 ${role.tone}`}
            >
              <ShieldCheck size={19} strokeWidth={2.4} />
              <span className="text-[14px] font-black">{role.label}</span>
            </div>

            <p className="mt-2 text-[13px] font-semibold text-slate-500">
              {role.description}
            </p>

            <div className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-[12px] font-bold text-slate-600">
              <CheckCircle2
                size={16}
                className={profile.is_active ? "text-emerald-600" : "text-red-500"}
              />
              {profile.is_active
                ? "Tài khoản đang hoạt động"
                : "Tài khoản đang bị khóa"}
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-[0_12px_36px_rgba(15,23,42,0.05)] sm:p-6">
        <div className="border-b border-slate-100 pb-4 text-center sm:text-left">
          <div className="text-[11px] font-black uppercase tracking-[0.18em] text-blue-700">
            THÔNG TIN CÁ NHÂN
          </div>
          <h2 className="mt-1 text-[22px] font-black text-slate-950 sm:text-[26px]">
            Thông tin của tôi
          </h2>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="text-[13px] font-black text-slate-700">
            <span className="flex items-center gap-2">
              <UserRound size={17} className="text-blue-600" />
              Tên
            </span>
            <input
              className="field mt-2 text-base"
              value={profile.display_name}
              onChange={(event) =>
                setProfile((current) =>
                  current
                    ? { ...current, display_name: event.target.value }
                    : current,
                )
              }
            />
          </label>

          <label className="text-[13px] font-black text-slate-700">
            <span className="flex items-center gap-2">
              <Phone size={17} className="text-emerald-600" />
              Số điện thoại
            </span>
            <input
              className="field mt-2 text-base"
              inputMode="tel"
              value={profile.phone || ""}
              onChange={(event) =>
                setProfile((current) =>
                  current
                    ? { ...current, phone: event.target.value }
                    : current,
                )
              }
            />
          </label>

          <label className="text-[13px] font-black text-slate-700 md:col-span-2">
            <span className="flex items-center gap-2">
              <MapPin size={17} className="text-orange-500" />
              Địa chỉ
            </span>
            <textarea
              className="field mt-2 min-h-[100px] resize-y text-base"
              value={profile.address || ""}
              onChange={(event) =>
                setProfile((current) =>
                  current
                    ? { ...current, address: event.target.value }
                    : current,
                )
              }
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            disabled={busy || !profile.display_name.trim()}
            onClick={() => void save()}
            className="btn primary min-h-[46px] px-6 text-[15px] font-black"
          >
            {busy ? "Đang lưu..." : "Lưu thông tin cá nhân"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
        <p className="text-[13px] font-semibold leading-6 text-blue-800">
          Quyền <b>OWNER / ADMIN / MEMBER</b> chỉ để xem tại đây và không thể tự
          thay đổi. Việc cấp quyền, khóa/mở hoặc quản lý tài khoản nhân viên được
          thực hiện trong <b>Nhân sự → Tài khoản</b>.
        </p>
      </section>
    </div>
  );
}
