"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { isManager, type Role } from "@/lib/azalas/permissions";
import { dt } from "@/lib/azalas/format";
import {
  LayoutDashboard,
  ClipboardPlus,
  ClipboardList,
  ReceiptText,
  RotateCcw,
  Images,
  UsersRound,
  Scissors,
  Boxes,
  PackageOpen,
  ChartNoAxesCombined,
  UserRound,
  Menu,
  ChevronRight,
  LogOut,
  Building2,
  LockKeyhole,
  Bell,
} from "lucide-react";

const groups = [
  {
    title: "ĐIỀU HÀNH",
    items: [
      { href: "/azalas", title: "Tổng quan", icon: LayoutDashboard, manager: false },
      { href: "/azalas/orders/new", title: "Tạo đơn", icon: ClipboardPlus, manager: true },
      { href: "/azalas/orders", title: "Chi tiết đơn", icon: ClipboardList, manager: false },
      { href: "/azalas/invoices", title: "Hóa đơn", icon: ReceiptText, manager: true },
      { href: "/azalas/returns", title: "Hàng trả", icon: RotateCcw, manager: false },
    ],
  },
  {
    title: "VẬN HÀNH",
    items: [
      { href: "/azalas/images", title: "Kho ảnh", icon: Images, manager: false },
      { href: "/azalas/customers", title: "Khách hàng", icon: UsersRound, manager: true },
      { href: "/azalas/stock", title: "Danh mục / Tồn kho", icon: Boxes, manager: true },
      { href: "/azalas/patterns", title: "Quản lý rập", icon: Scissors, manager: false },
      { href: "/azalas/materials", title: "Quản lý phụ liệu", icon: PackageOpen, manager: true },
      { href: "/azalas/staff", title: "Nhân sự", icon: Building2, manager: true },
      { href: "/azalas/reports", title: "Báo cáo", icon: ChartNoAxesCombined, manager: true },
    ],
  },
  {
    title: "HỆ THỐNG",
    items: [
      { href: "/azalas/account", title: "Tài khoản", icon: UserRound, manager: false },
    ],
  },
];

const crumbNames: Record<string, string> = {
  azalas: "Tổng quan",
  orders: "Chi tiết đơn",
  new: "Tạo đơn",
  pack: "Soạn hàng",
  invoices: "Hóa đơn",
  customers: "Khách hàng",
  stock: "Danh mục / Tồn kho",
  returns: "Hàng trả",
  images: "Kho ảnh",
  patterns: "Quản lý rập",
  progress: "Tiến độ đơn",
  create: "Thêm rập",
  customer: "Khách đặt",
  houses: "Nhà may",
  cutters: "Thợ cắt",
  catalog: "Mã rập / Ảnh",
  materials: "Phụ liệu",
  staff: "Nhân sự",
  account: "Tài khoản",
  reports: "Báo cáo",
  daykeo: "Dây kéo",
  embroidery: "Thêu",
  printing: "In",
  fabric: "Vải",
};

export default function AppShell({
  children,
  profile,
}: {
  children: React.ReactNode;
  profile: { display_name: string; role: Role; avatar_path: string | null };
  userId: string;
}) {
  const path = usePathname();
  const router = useRouter();
  const sb = useMemo(() => createClient(), []);

  const [open, setOpen] = useState(false);
  const [avatar, setAvatar] = useState("");
  const [today, setToday] = useState("");

  useEffect(() => {
    setOpen(false);
  }, [path]);

  useEffect(() => {
    setToday(dt(new Date().toISOString()));

    if (profile.avatar_path) {
      sb.storage
        .from("az-avatars")
        .createSignedUrl(profile.avatar_path, 1800)
        .then(({ data }) => setAvatar(data?.signedUrl || ""));
    }
  }, [profile.avatar_path, sb]);

  const parts = path.split("/").filter(Boolean);

  const crumbs = parts.map((segment, index) => ({
    href: "/" + parts.slice(0, index + 1).join("/"),
    title: /^\d+$/.test(segment)
      ? "Chi tiết #" + segment
      : crumbNames[segment] || segment,
  }));

  const allowed = isManager(profile.role);

  const restrictMember =
    !allowed &&
    (path.startsWith("/azalas/orders/new") ||
      path.startsWith("/azalas/invoices") ||
      path.startsWith("/azalas/customers") ||
      path.startsWith("/azalas/stock") ||
      path.startsWith("/azalas/materials") ||
      path.startsWith("/azalas/staff") ||
      path.startsWith("/azalas/reports") ||
      (path.startsWith("/azalas/patterns") &&
        !path.startsWith("/azalas/patterns/progress") &&
        path !== "/azalas/patterns"));

  async function logout() {
    await sb.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const mobileStockHref = allowed ? "/azalas/stock" : "/azalas/images";
  const mobileStockTitle = allowed ? "Kho hàng" : "Kho ảnh";
  const MobileStockIcon = allowed ? Boxes : Images;
  const centerHref = allowed ? "/azalas/orders/new" : "/azalas/orders";
  const CenterIcon = allowed ? ClipboardPlus : ClipboardList;

  return (
    <div className="az-shell az-shell-v2">
      <div
        className={`az-overlay ${open ? "open" : ""}`}
        onClick={() => setOpen(false)}
      />

      <aside
        className={`az-sidebar az-sidebar-v2 ${open ? "open" : ""}`}
        aria-label="Điều hướng chính"
      >
        <div className="brand az-brand-v2">
          <div className="az-brand-logo">
            <img src="/azalas-logo-sidebar.png" alt="AZALAS SPORT" />
          </div>

          <div className="brand-copy">
            <strong>
              AZALAS <span>SPORT</span>
            </strong>
            <small>BỨT PHÁ DOANH SỐ</small>
          </div>
        </div>

        <nav className="az-side-nav flex-1">
          {groups.map((group) => (
            <div key={group.title}>
              <div className="side-heading">{group.title}</div>

              {group.items
                .filter((item) => allowed || !item.manager)
                .map((item) => {
                  const Icon = item.icon;

                  const active =
                    item.href === "/azalas"
                      ? path === "/azalas"
                      : item.href === "/azalas/orders/new"
                        ? path === "/azalas/orders/new"
                        : item.href === "/azalas/orders"
                          ? path === "/azalas/orders" ||
                            (path.startsWith("/azalas/orders/") &&
                              !path.startsWith("/azalas/orders/new"))
                          : path.startsWith(item.href);

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`side-link ${active ? "active" : ""}`}
                      onClick={() => setOpen(false)}
                    >
                      <Icon size={19} strokeWidth={2} />
                      <span>{item.title}</span>
                    </Link>
                  );
                })}
            </div>
          ))}
        </nav>

        <div className="side-footer az-side-footer-v2">
          <p>AZALAS V2.3 TEST</p>
          <p>Supabase / Next.js</p>

          <button onClick={logout} className="az-logout-button">
            <LogOut size={17} />
            Đăng xuất
          </button>
        </div>
      </aside>

      <div className="az-content">
        <header className="az-header az-header-v2">
          <div className="flex min-w-0 items-center gap-3">
            <button
              aria-label="Mở menu"
              className="az-menu-button"
              onClick={() => setOpen((value) => !value)}
            >
              <Menu size={20} />
            </button>

            <Link href="/azalas" className="az-desktop-brand">
              <img src="/azalas-logo-sidebar.png" alt="" />
              <div>
                <strong>AZALAS SPORT</strong>
                <span>{crumbs.at(-1)?.title || "Tổng quan"}</span>
              </div>
            </Link>

            <div className="az-mobile-brand">
              <img src="/azalas-logo-sidebar.png" alt="" />

              <div>
                <strong>AZALAS SPORT</strong>
                <p>{crumbs.at(-1)?.title}</p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/azalas/orders"
              className="az-bell"
              title="Đơn hàng"
              aria-label="Đơn hàng"
            >
              <Bell size={18} />
              <span />
            </Link>

            <div className="hidden text-right lg:block">
              <p className="az-header-date">{today || "AZALAS"}</p>
              <p className="az-header-name">{profile.display_name}</p>
            </div>

            <Link href="/azalas/account" className="az-profile-pill" title="Tài khoản">
              <div className="profile-pic">
                {avatar ? (
                  <img src={avatar} alt="Ảnh đại diện" />
                ) : (
                  profile.display_name?.charAt(0)?.toUpperCase() || "A"
                )}
              </div>

              <div className="az-profile-copy">
                <strong>{profile.display_name}</strong>
              </div>
            </Link>
          </div>
        </header>

        <main className="az-main az-main-v2">
          {restrictMember ? (
            <div className="panel">
              <LockKeyhole className="mb-3 text-red-500" />

              <h1 className="page-heading">Bạn không có quyền truy cập</h1>

              <p className="muted mt-2">
                Tài khoản MEMBER chỉ được truy cập các chức năng đã được phân quyền.
              </p>

              <Link className="btn primary mt-5" href="/azalas">
                Về tổng quan
              </Link>
            </div>
          ) : (
            children
          )}
        </main>
      </div>

      <nav className="az-mobile-bottom-nav" aria-label="Điều hướng nhanh">
        <Link className={path === "/azalas" ? "active" : ""} href="/azalas">
          <LayoutDashboard size={20} />
          <span>Tổng quan</span>
        </Link>

        <Link
          className={
            path.startsWith("/azalas/orders") && path !== centerHref ? "active" : ""
          }
          href="/azalas/orders"
        >
          <ClipboardList size={20} />
          <span>Đơn hàng</span>
        </Link>

        <Link className="main-action" href={centerHref} aria-label="Tạo đơn">
          <CenterIcon size={26} />
        </Link>

        <Link
          className={path.startsWith(mobileStockHref) ? "active" : ""}
          href={mobileStockHref}
        >
          <MobileStockIcon size={20} />
          <span>{mobileStockTitle}</span>
        </Link>

        <Link
          className={path.startsWith("/azalas/account") ? "active" : ""}
          href="/azalas/account"
        >
          <UserRound size={20} />
          <span>Tài khoản</span>
        </Link>
      </nav>

      <style>{`
        .az-shell-v2 {
          min-height: 100vh;
          background: #f5f9ff;
          font-family:
            "Segoe UI Variable",
            "Segoe UI",
            Arial,
            sans-serif;
        }

        .az-sidebar-v2 {
          overflow: hidden auto;
          background:
            linear-gradient(rgba(2, 25, 72, 0.18), rgba(2, 25, 72, 0.18)),
            url("/dashboard-sidebar-bg.png") center / cover no-repeat;
          box-shadow: 16px 0 42px rgba(20, 60, 117, 0.06);
        }

        .az-brand-v2 {
          position: relative;
          z-index: 2;
          min-height: 84px;
          gap: 10px;
          padding: 10px 8px 24px;
        }

        .az-brand-logo {
          width: 62px;
          height: 62px;
          flex: 0 0 62px;
          display: grid;
          place-items: center;
        }

        .az-brand-logo img {
          width: 62px;
          height: 62px;
          object-fit: contain;
          filter: drop-shadow(0 8px 14px rgba(0, 170, 255, 0.17));
        }

        .az-brand-v2 .brand-copy strong {
          color: #ffffff;
          font-size: 19px;
          font-weight: 900;
          letter-spacing: 0.3px;
          line-height: 1.05;
          white-space: nowrap;
        }

        .az-brand-v2 .brand-copy strong span {
          color: #25cfff;
        }

        .az-brand-v2 .brand-copy small {
          margin-top: 5px;
          color: #bfd8f5;
          font-size: 12.5px;
          font-weight: 750;
          letter-spacing: 0.1px;
        }

        .az-side-nav {
          position: relative;
          z-index: 2;
        }

        .az-sidebar-v2 .side-heading {
          padding: 16px 10px 7px;
          color: #65c9ff;
          font-size: 10.5px;
          font-weight: 900;
          letter-spacing: 1.7px;
        }

        .az-sidebar-v2 .side-link {
          margin: 2px 0;
          padding: 11px 12px;
          border: 1px solid transparent;
          border-radius: 13px;
          color: #edf5ff;
          font-size: 14px;
          font-weight: 700;
          transition:
            background 0.16s ease,
            border-color 0.16s ease,
            transform 0.16s ease;
        }

        .az-sidebar-v2 .side-link:hover {
          transform: translateX(2px);
          background: rgba(255, 255, 255, 0.07);
        }

        .az-sidebar-v2 .side-link.active {
          border-color: rgba(68, 195, 255, 0.20);
          background: linear-gradient(90deg, #0c74dc, #1d64c7);
          box-shadow:
            0 10px 24px rgba(0, 29, 84, 0.19),
            inset 3px 0 #32dcff;
        }

        .az-sidebar-v2 .side-link.active::before {
          display: none;
        }

        .az-side-footer-v2 {
          position: relative;
          z-index: 2;
          color: #9dbce2;
          font-size: 11.5px;
        }

        .az-side-footer-v2 p {
          margin: 0;
          line-height: 1.45;
        }

        .az-logout-button {
          width: 100%;
          min-height: 42px;
          margin-top: 14px;
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 0 13px;
          border: 1px solid rgba(255, 255, 255, 0.13);
          border-radius: 12px;
          background: rgba(255, 255, 255, 0.055);
          color: #ffffff;
          font-size: 13.5px;
          font-weight: 800;
          cursor: pointer;
        }

        .az-header-v2 {
          min-height: 72px;
          background: rgba(255, 255, 255, 0.98);
          border-bottom-color: #e8eef6;
          box-shadow: 0 7px 23px rgba(31, 71, 127, 0.035);
        }

        .az-menu-button {
          display: none;
          width: 42px;
          height: 42px;
          place-items: center;
          border: 1px solid #dae5f2;
          border-radius: 12px;
          background: #ffffff;
          color: #174477;
        }

        .az-desktop-brand {
          min-width: 0;
          display: flex;
          align-items: center;
          gap: 11px;
          text-decoration: none;
        }

        .az-desktop-brand img {
          width: 46px;
          height: 46px;
          flex: 0 0 46px;
          object-fit: contain;
          filter: drop-shadow(0 5px 9px rgba(23, 105, 246, 0.10));
        }

        .az-desktop-brand > div {
          min-width: 0;
          display: flex;
          flex-direction: column;
          justify-content: center;
        }

        .az-desktop-brand strong {
          color: #102b55;
          font-size: 17px;
          font-weight: 950;
          line-height: 1.05;
          letter-spacing: 0.15px;
        }

        .az-desktop-brand span {
          margin-top: 4px;
          color: #1769f6;
          font-size: 11px;
          font-weight: 700;
          line-height: 1;
        }

        .az-bell {
          position: relative;
          width: 41px;
          height: 41px;
          display: grid;
          place-items: center;
          border: 1px solid #dfe8f4;
          border-radius: 13px;
          background: #ffffff;
          color: #163f75;
        }

        .az-bell span {
          position: absolute;
          top: 7px;
          right: 7px;
          width: 7px;
          height: 7px;
          border: 2px solid #ffffff;
          border-radius: 50%;
          background: #ff2e48;
          box-sizing: content-box;
        }

        .az-header-date {
          margin: 0;
          color: #102b54;
          font-size: 12.5px;
          font-weight: 800;
        }

        .az-header-name {
          margin: 2px 0 0;
          color: #70829b;
          font-size: 10px;
        }

        .az-profile-pill {
          min-height: 45px;
          display: flex;
          align-items: center;
          gap: 9px;
          padding: 5px 9px 5px 6px;
          border: 1px solid #dfe8f4;
          border-radius: 15px;
          background: #ffffff;
          box-shadow: 0 5px 15px rgba(40, 80, 135, 0.04);
        }

        .az-profile-pill .profile-pic {
          background: linear-gradient(135deg, #ddf3ff, #9dc9ff);
        }

        .az-profile-copy strong {
          display: block;
          max-width: 160px;
          overflow: hidden;
          color: #102b54;
          font-size: 12.5px;
          font-weight: 850;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .az-main-v2 {
          padding-top: 22px;
          padding-bottom: 28px;
        }

        .az-mobile-brand {
          display: none;
          align-items: center;
          gap: 8px;
        }

        .az-mobile-brand img {
          width: 37px;
          height: 37px;
          object-fit: contain;
        }

        .az-mobile-brand strong {
          display: block;
          color: #102d5d;
          font-size: 13px;
          font-weight: 900;
        }

        .az-mobile-brand p {
          margin: 1px 0 0;
          color: #6f819d;
          font-size: 10.5px;
        }

        .az-mobile-bottom-nav {
          display: none;
        }

        @media (max-width: 900px) {
          .az-menu-button {
            display: grid;
          }

          .az-desktop-brand {
            display: none;
          }

          .az-mobile-brand {
            display: flex;
          }

          .az-main-v2 {
            padding-bottom: 100px;
          }

          .az-mobile-bottom-nav {
            position: fixed;
            left: 10px;
            right: 10px;
            bottom: 10px;
            z-index: 24;
            height: 70px;
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            align-items: end;
            padding: 7px 7px 6px;
            border: 1px solid rgba(211, 224, 241, 0.94);
            border-radius: 22px;
            background: rgba(255, 255, 255, 0.97);
            box-shadow: 0 16px 42px rgba(20, 59, 113, 0.20);
            backdrop-filter: blur(18px);
          }

          .az-mobile-bottom-nav > a {
            min-width: 0;
            height: 52px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 3px;
            color: #6f82a2;
            font-size: 9px;
            font-weight: 750;
          }

          .az-mobile-bottom-nav > a.active {
            color: #1769f6;
          }

          .az-mobile-bottom-nav .main-action {
            width: 58px;
            height: 58px;
            justify-self: center;
            align-self: start;
            transform: translateY(-16px);
            border-radius: 50%;
            color: #ffffff;
            background: linear-gradient(145deg, #1c7cff, #0959ee);
            box-shadow:
              0 10px 23px rgba(22, 99, 235, 0.30),
              0 0 0 6px #ffffff;
          }

          .az-mobile-bottom-nav .main-action span {
            display: none;
          }
        }

        @media (max-width: 480px) {
          .az-header-v2 {
            min-height: 66px;
          }

          .az-bell {
            width: 38px;
            height: 38px;
            border-radius: 11px;
          }

          .az-profile-pill {
            min-height: 40px;
          }

          .az-profile-copy {
            display: none;
          }
        }
      `}</style>
    </div>
  );
}
