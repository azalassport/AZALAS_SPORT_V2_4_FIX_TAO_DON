"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const INTERNAL_DOMAIN = "azalas.local";

function normalizeLoginName(value: string) {
  return value.trim().toLowerCase();
}

function resolveEmail(login: string) {
  const value = login.trim();

  // OWNER hiện tại vẫn có thể đăng nhập bằng email.
  if (value.includes("@")) return value.toLowerCase();

  const username = normalizeLoginName(value);
  if (!username) return "";

  // Nhân viên đăng nhập bằng tên tài khoản.
  return `${username}@${INTERNAL_DOMAIN}`;
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12a4.2 4.2 0 1 0 0-8.4A4.2 4.2 0 0 0 12 12Z" />
      <path d="M4.7 21c.5-4.3 3-6.5 7.3-6.5s6.8 2.2 7.3 6.5" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="10" width="14" height="11" rx="2.3" />
      <path d="M8.3 10V7.4a3.7 3.7 0 1 1 7.4 0V10" />
      <path d="M12 14.2v2.7" />
    </svg>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12s3.5-5.8 9.5-5.8 9.5 5.8 9.5 5.8-3.5 5.8-9.5 5.8S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3 21 21" />
      <path d="M10.6 6.4c.5-.1.9-.2 1.4-.2 6 0 9.5 5.8 9.5 5.8a17.7 17.7 0 0 1-3 3.7" />
      <path d="M6.2 6.2A17.2 17.2 0 0 0 2.5 12s3.5 5.8 9.5 5.8c1.7 0 3.2-.5 4.5-1.2" />
      <path d="M9.8 9.8a3 3 0 0 0 4.4 4.4" />
    </svg>
  );
}

export default function LoginPage() {

  const router = useRouter();

  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!login.trim() || !password) {
      setError("Vui lòng nhập Tên đăng nhập và Mật khẩu.");
      return;
    }

    setBusy(true);

    try {
      const sb = createClient();
      const email = resolveEmail(login);

      const { data, error: authError } = await sb.auth.signInWithPassword({
        email,
        password,
      });

      if (authError || !data.user) {
        throw new Error("Tên đăng nhập hoặc mật khẩu không đúng.");
      }

      const { data: profile, error: profileError } = await sb
        .from("az_profiles")
        .select("display_name,role,is_active")
        .eq("id", data.user.id)
        .single();

      if (profileError || !profile) {
        await sb.auth.signOut();
        throw new Error("Tài khoản chưa có hồ sơ hệ thống.");
      }

      if (!profile.is_active) {
        await sb.auth.signOut();
        throw new Error("Tài khoản đã bị khóa hoặc chưa được kích hoạt.");
      }

      router.replace("/azalas");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <div className="shade" aria-hidden="true" />
      <span className="meteor meteor-a" aria-hidden="true" />
      <span className="meteor meteor-b" aria-hidden="true" />
      <span className="meteor meteor-c" aria-hidden="true" />

      <form className="login-card" onSubmit={submit}>
        <div className="logo-badge">
          <img src="/azalas-login-logo.png" alt="AZALAS SPORT" draggable={false} />
        </div>

        <div className="brand">
          <strong>AZALAS</strong>
          <span>SPORT</span>
        </div>

        <h1>ĐĂNG NHẬP</h1>

        <div className="subtitle-row">
          <span className="line" />
          <p>Thời Trang Azalas Sport</p>
          <span className="line" />
        </div>

        {error && <div className="error-box">{error}</div>}

        <label className="field">
          <span className="field-icon"><UserIcon /></span>
          <input
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            placeholder="Tên đăng nhập"
            autoComplete="username"
            autoFocus
          />
        </label>

        <label className="field">
          <span className="field-icon"><LockIcon /></span>
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mật khẩu"
            autoComplete="current-password"
          />
          <button
            className="eye-button"
            type="button"
            aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
            onClick={() => setShowPassword((v) => !v)}
          >
            <EyeIcon open={showPassword} />
          </button>
        </label>

        <button className="login-button" type="submit" disabled={busy}>
          <span>{busy ? "ĐANG ĐĂNG NHẬP..." : "ĐĂNG NHẬP NGAY"}</span>
          {!busy && <span className="arrow">→</span>}
        </button>
      </form>

      <style jsx>{`
        :global(html),
        :global(body) {
          margin: 0;
          min-height: 100%;
        }

        :global(body) {
          overflow: hidden;
          background: #041124;
        }

        .login-page {
          position: relative;
          isolation: isolate;
          min-height: 100vh;
          overflow: hidden;
          display: grid;
          place-items: center;
          padding: 34px;
          background-image: url("/azalas-login-bg-clean.png");
          background-size: cover;
          background-position: center;
          background-repeat: no-repeat;
          font-family:
            ui-sans-serif,
            system-ui,
            -apple-system,
            BlinkMacSystemFont,
            "Segoe UI",
            sans-serif;
        }

        .shade {
          position: absolute;
          inset: 0;
          z-index: 0;
          background:
            radial-gradient(
              circle at 50% 48%,
              rgba(15, 55, 120, 0.06),
              rgba(1, 8, 24, 0.24) 72%
            ),
            linear-gradient(
              180deg,
              rgba(0, 13, 35, 0.07),
              rgba(0, 12, 31, 0.18)
            );
          pointer-events: none;
        }

        .meteor {
          position: absolute;
          z-index: 1;
          width: 135px;
          height: 2px;
          opacity: 0;
          pointer-events: none;
          border-radius: 999px;
          background: linear-gradient(
            90deg,
            #ffffff 0%,
            rgba(233, 243, 255, 0.88) 17%,
            rgba(187, 214, 255, 0.38) 48%,
            transparent 100%
          );
          transform-origin: left center;
          filter: drop-shadow(0 0 6px rgba(205, 228, 255, 0.7));
          animation: meteorFall 10s linear infinite;
        }

        .meteor::before {
          content: "";
          position: absolute;
          left: -4px;
          top: 50%;
          width: 8px;
          height: 8px;
          transform: translateY(-50%);
          border-radius: 50%;
          background: #ffffff;
          box-shadow:
            0 0 8px rgba(255, 255, 255, 0.95),
            0 0 16px rgba(139, 190, 255, 0.55);
        }

        .meteor-a {
          top: 15%;
          right: 4%;
          animation-delay: 1.2s;
        }

        .meteor-b {
          top: 9%;
          right: 38%;
          width: 110px;
          animation-delay: 5.5s;
          animation-duration: 11.5s;
        }

        .meteor-c {
          top: 37%;
          right: -4%;
          width: 125px;
          animation-delay: 8.6s;
          animation-duration: 12.8s;
        }

        .login-card {
          position: relative;
          z-index: 3;
          width: min(560px, calc(100vw - 40px));
          padding: 38px 48px 46px;
          border: 1px solid rgba(224, 232, 246, 0.95);
          border-radius: 34px;
          background:
            linear-gradient(
              180deg,
              rgba(255, 255, 255, 0.99),
              rgba(248, 251, 255, 0.985)
            );
          box-shadow:
            0 30px 85px rgba(0, 20, 61, 0.34),
            0 0 48px rgba(39, 112, 255, 0.12);
          text-align: center;
          backdrop-filter: blur(10px);
        }

        .logo-badge {
          width: 154px;
          height: 154px;
          margin: 0 auto 22px;
          display: grid;
          place-items: center;
          overflow: hidden;
          border: 1px solid #e5edf8;
          border-radius: 50%;
          background: #ffffff;
          box-shadow:
            0 14px 34px rgba(26, 78, 153, 0.15),
            0 0 0 8px rgba(238, 245, 255, 0.78);
        }

        .logo-badge img {
          width: 124px;
          height: 124px;
          object-fit: contain;
          display: block;
          user-select: none;
          transform: scale(1);
        }

        .brand {
          display: flex;
          align-items: baseline;
          justify-content: center;
          gap: 8px;
          margin-bottom: 13px;
          color: #0f2346;
          line-height: 1;
        }

        .brand strong {
          font-size: 30px;
          font-weight: 900;
          letter-spacing: 5px;
        }

        .brand span {
          font-size: 29px;
          font-weight: 450;
          letter-spacing: 3px;
        }

        h1 {
          margin: 0;
          color: #1763f7;
          font-size: 40px;
          font-weight: 900;
          line-height: 1.05;
          letter-spacing: -0.8px;
        }

        .subtitle-row {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 15px;
          margin: 11px 0 31px;
        }

        .subtitle-row p {
          margin: 0;
          color: #687ca6;
          font-size: 17px;
          font-weight: 500;
          white-space: nowrap;
        }

        .line {
          width: 54px;
          height: 1px;
          background: #6b91ed;
        }

        .field {
          position: relative;
          display: flex;
          align-items: stretch;
          width: 100%;
          height: 64px;
          margin-bottom: 16px;
          overflow: hidden;
          border: 1px solid #d8e3f3;
          border-radius: 18px;
          background: #ffffff;
          box-shadow:
            0 7px 20px rgba(34, 74, 138, 0.055),
            inset 0 1px 0 rgba(255, 255, 255, 0.95);
          transition:
            border-color 0.18s ease,
            box-shadow 0.18s ease,
            transform 0.18s ease;
        }

        .field:hover {
          border-color: #c0d2ef;
        }

        .field:focus-within {
          border-color: #5b8ff6;
          box-shadow:
            0 0 0 4px rgba(56, 124, 255, 0.09),
            0 10px 24px rgba(34, 91, 178, 0.08);
          transform: translateY(-1px);
        }

        .field-icon {
          width: 62px;
          flex: 0 0 62px;
          display: grid;
          place-items: center;
          color: #3972da;
          background: linear-gradient(180deg, #f4f8ff 0%, #eef5ff 100%);
          border-right: 1px solid #e1e9f5;
        }

        .field-icon :global(svg),
        .eye-button :global(svg) {
          width: 25px;
          height: 25px;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.8;
          stroke-linecap: round;
          stroke-linejoin: round;
        }

        .field input {
          width: 100%;
          height: 100%;
          min-width: 0;
          padding: 0 17px;
          border: 0;
          outline: 0;
          background: #ffffff;
          color: #14203a;
          font: inherit;
          font-size: 16px;
          font-weight: 600;
          caret-color: #1763f7;
        }

        .field input::placeholder {
          color: #96a2b7;
          opacity: 1;
          font-weight: 500;
        }

        .field input:-webkit-autofill,
        .field input:-webkit-autofill:hover,
        .field input:-webkit-autofill:focus,
        .field input:-webkit-autofill:active {
          -webkit-text-fill-color: #14203a !important;
          -webkit-box-shadow: 0 0 0 1000px #ffffff inset !important;
          box-shadow: 0 0 0 1000px #ffffff inset !important;
          transition: background-color 9999s ease-out 0s;
        }

        .eye-button {
          width: 58px;
          height: 100%;
          flex: 0 0 58px;
          display: grid;
          place-items: center;
          border: 0;
          border-left: 1px solid #e8eef7;
          outline: 0;
          background: #ffffff;
          color: #7b8fb8;
          cursor: pointer;
          transition:
            color 0.15s ease,
            background 0.15s ease;
        }

        .eye-button:hover {
          color: #1763f7;
          background: #f6f9ff;
        }

        .login-button {
          width: 100%;
          height: 68px;
          margin-top: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          border: 0;
          border-radius: 18px;
          color: #ffffff;
          cursor: pointer;
          background: linear-gradient(
            100deg,
            #0e52f5 0%,
            #126cff 48%,
            #08a5f5 100%
          );
          box-shadow:
            0 16px 32px rgba(19, 98, 236, 0.26),
            inset 0 1px 0 rgba(255, 255, 255, 0.2);
          font: inherit;
          font-size: 18px;
          font-weight: 900;
          letter-spacing: 0.25px;
          transition:
            transform 0.16s ease,
            filter 0.16s ease,
            box-shadow 0.16s ease,
            opacity 0.16s ease;
        }

        .login-button:hover:not(:disabled) {
          transform: translateY(-1px);
          filter: brightness(1.035);
          box-shadow:
            0 20px 38px rgba(19, 98, 236, 0.31),
            inset 0 1px 0 rgba(255, 255, 255, 0.22);
        }

        .login-button:active:not(:disabled) {
          transform: translateY(0);
        }

        .login-button:disabled {
          cursor: not-allowed;
          opacity: 0.63;
        }

        .arrow {
          font-size: 29px;
          font-weight: 400;
          line-height: 1;
          transform: translateY(-1px);
        }

        .error-box {
          margin: -8px 0 18px;
          padding: 12px 14px;
          border: 1px solid #fecaca;
          border-radius: 12px;
          background: #fef2f2;
          color: #b91c1c;
          font-size: 13px;
          font-weight: 700;
          line-height: 1.4;
          text-align: left;
        }

        @keyframes meteorFall {
          0%,
          8% {
            opacity: 0;
            transform: translate3d(0, 0, 0) rotate(-45deg);
          }

          10% {
            opacity: 0.9;
          }

          29% {
            opacity: 0.88;
          }

          43% {
            opacity: 0;
            transform: translate3d(-65vw, 65vh, 0) rotate(-45deg);
          }

          100% {
            opacity: 0;
            transform: translate3d(-65vw, 65vh, 0) rotate(-45deg);
          }
        }

        @media (max-width: 700px) {
          :global(body) {
            overflow: auto;
          }

          .login-page {
            min-height: 100svh;
            padding: 22px 18px;
            background-image: url("/azalas-login-bg-clean.png");
            background-position: center 48%;
          }

          .shade {
            background:
              linear-gradient(
                180deg,
                rgba(0, 17, 52, 0.03),
                rgba(0, 12, 34, 0.13)
              );
          }

          .login-card {
            width: min(100%, 420px);
            padding: 31px 24px 30px;
            border-radius: 30px;
          }

          .logo-badge {
            width: 128px;
            height: 128px;
            margin-bottom: 19px;
            box-shadow:
              0 12px 27px rgba(26, 78, 153, 0.14),
              0 0 0 6px rgba(238, 245, 255, 0.76);
          }

          .logo-badge img {
            width: 108px;
            height: 108px;
          }

          .brand {
            gap: 6px;
            margin-bottom: 12px;
          }

          .brand strong {
            font-size: 23px;
            letter-spacing: 3.2px;
          }

          .brand span {
            font-size: 22px;
            letter-spacing: 2px;
          }

          h1 {
            font-size: 34px;
          }

          .subtitle-row {
            gap: 10px;
            margin: 10px 0 25px;
          }

          .subtitle-row p {
            font-size: 14px;
          }

          .line {
            width: 35px;
          }

          .field {
            height: 58px;
            border-radius: 16px;
            margin-bottom: 13px;
          }

          .field-icon {
            width: 56px;
            flex-basis: 56px;
          }

          .field-icon :global(svg),
          .eye-button :global(svg) {
            width: 24px;
            height: 24px;
          }

          .field input {
            font-size: 16px;
          }

          .eye-button {
            width: 52px;
            flex-basis: 52px;
          }

          .login-button {
            height: 61px;
            border-radius: 16px;
            font-size: 16px;
          }

          .arrow {
            font-size: 25px;
          }

          .meteor-c {
            display: none;
          }
        }

        @media (max-height: 690px) and (min-width: 701px) {
          .login-card {
            transform: scale(0.88);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .meteor {
            display: none;
            animation: none;
          }
        }
      `}</style>
    </main>
  );
}
