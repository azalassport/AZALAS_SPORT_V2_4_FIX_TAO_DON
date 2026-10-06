import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  Boxes,
  ChartNoAxesCombined,
  CheckCircle2,
  ClipboardList,
  ClipboardPlus,
  Clock3,
  Images,
  PackageOpen,
  ReceiptText,
  RotateCcw,
  Scissors,
  TrendingUp,
  UserRound,
  UsersRound,
  ShieldCheck,
  ArrowRight,
} from "lucide-react";

import DashboardHero from "@/components/dashboard-hero";
import DashboardStatusCard from "@/components/dashboard-status-card";
import DashboardOperationCard from "@/components/dashboard-operation-card";
import styles from "./dashboard.module.css";

const operations = [
  {
    href: "/azalas/orders/new",
    title: "Tạo đơn",
    description: "Tạo đơn thường/khách đặt, chọn nhiều kho",
    icon: ClipboardPlus,
    manager: true,
    accent: "#1670ff",
    soft: "#e9f2ff",
  },
  {
    href: "/azalas/orders",
    title: "Chi tiết đơn",
    description: "Đơn mới · Đang soạn · Nợ đơn · Khách đặt",
    icon: ClipboardList,
    manager: false,
    accent: "#ff7900",
    soft: "#fff0e3",
  },
  {
    href: "/azalas/invoices",
    title: "Hóa đơn",
    description: "Chốt đơn theo kho và lưu ảnh gửi Zalo",
    icon: ReceiptText,
    manager: true,
    accent: "#ff3655",
    soft: "#ffe8ed",
  },
  {
    href: "/azalas/returns",
    title: "Hàng trả",
    description: "Tạo phiếu, duyệt và cấn trừ công nợ",
    icon: RotateCcw,
    manager: false,
    accent: "#08ad72",
    soft: "#e4f8ef",
  },
  {
    href: "/azalas/images",
    title: "Kho ảnh",
    description: "Ảnh đơn khách đặt, tìm theo mã / khách",
    icon: Images,
    manager: false,
    accent: "#8b3dff",
    soft: "#f1e9ff",
  },
  {
    href: "/azalas/customers",
    title: "Khách hàng",
    description: "Liên hệ, chành xe, lịch sử mua và công nợ",
    icon: UsersRound,
    manager: true,
    accent: "#ff9800",
    soft: "#fff4d6",
  },
  {
    href: "/azalas/stock",
    title: "Danh mục / Tồn kho",
    description: "Tạo biến thể màu / size, nhập tồn, thêm ảnh sản phẩm",
    icon: Boxes,
    manager: true,
    accent: "#02b8c8",
    soft: "#e3f9fb",
  },
  {
    href: "/azalas/patterns",
    title: "Quản lý rập",
    description: "Tiến độ, khách đặt, nhà may và thợ cắt",
    icon: Scissors,
    manager: false,
    accent: "#4267ff",
    soft: "#e9edff",
  },
  {
    href: "/azalas/materials",
    title: "Quản lý phụ liệu",
    description: "Dây kéo, thêu, in, vải và đối tác",
    icon: PackageOpen,
    manager: true,
    accent: "#ff3b9d",
    soft: "#ffe7f3",
  },
  {
    href: "/azalas/staff",
    title: "Nhân sự",
    description: "Tài khoản, chấm công và ứng lương",
    icon: ShieldCheck,
    manager: true,
    accent: "#168eea",
    soft: "#e5f4ff",
  },
  {
    href: "/azalas/reports",
    title: "Báo cáo thống kê",
    description: "Triển khai sau khi chốt mô hình dữ liệu",
    icon: ChartNoAxesCombined,
    manager: true,
    accent: "#7a25f8",
    soft: "#efe7ff",
  },
  {
    href: "/azalas/account",
    title: "Tài khoản",
    description: "Avatar, tên, SĐT và đổi mật khẩu",
    icon: UserRound,
    manager: false,
    accent: "#74849b",
    soft: "#edf2f7",
  },
];

function capitalizeFirst(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export default async function DashboardPage() {
  const sb = await createClient();

  const {
    data: { user },
  } = await sb.auth.getUser();

  const { data: profile } = await sb
    .from("az_profiles")
    .select("display_name,role")
    .eq("id", user?.id || "")
    .single();

  const manager = profile?.role === "OWNER" || profile?.role === "ADMIN";

  const counts = await Promise.all([
    sb
      .from("order_units")
      .select("id", { head: true, count: "exact" })
      .eq("status", "MOI"),
    sb
      .from("order_units")
      .select("id", { head: true, count: "exact" })
      .eq("status", "DANG_SOAN"),
    sb
      .from("order_units")
      .select("id", { head: true, count: "exact" })
      .eq("status", "NO_DON"),
    sb
      .from("order_units")
      .select("id", { head: true, count: "exact" })
      .eq("status", "DA_SOAN"),
  ]);

  const statusCards = [
    {
      title: "Đơn mới",
      value: counts[0].count ?? 0,
      icon: ClipboardPlus,
      accent: "#1670ff",
      soft: "#e8f2ff",
    },
    {
      title: "Đang soạn",
      value: counts[1].count ?? 0,
      icon: Clock3,
      accent: "#f57200",
      soft: "#fff0df",
    },
    {
      title: "Nợ đơn",
      value: counts[2].count ?? 0,
      icon: TrendingUp,
      accent: "#ed2445",
      soft: "#ffe8ed",
    },
    {
      title: "Đã soạn",
      value: counts[3].count ?? 0,
      icon: CheckCircle2,
      accent: "#079663",
      soft: "#e4f7ef",
    },
  ];

  const dateText = capitalizeFirst(
    new Intl.DateTimeFormat("vi-VN", {
      timeZone: "Asia/Ho_Chi_Minh",
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date()),
  );

  return (
    <div className={styles.page}>
      <DashboardHero
        displayName={profile?.display_name || "AZALAS"}
        dateText={dateText}
      />

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>
            <span />
            Tình trạng đơn hàng
          </h2>

          <Link href="/azalas/orders">
            Xem tất cả <ArrowRight size={15} />
          </Link>
        </div>

        <div className={styles.statusGrid}>
          {statusCards.map((card) => (
            <DashboardStatusCard key={card.title} {...card} />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <h2>
            <span />
            Trung tâm điều hành
          </h2>
        </div>

        <div className={styles.operationGrid}>
          {operations
            .filter((item) => manager || !item.manager)
            .map((item) => (
              <DashboardOperationCard
                key={item.href}
                href={item.href}
                title={item.title}
                description={item.description}
                icon={item.icon}
                accent={item.accent}
                soft={item.soft}
              />
            ))}
        </div>
      </section>
    </div>
  );
}
