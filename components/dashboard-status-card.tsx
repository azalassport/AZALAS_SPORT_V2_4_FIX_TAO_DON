import type { LucideIcon } from "lucide-react";
import styles from "@/app/azalas/dashboard.module.css";

export default function DashboardStatusCard({
  title,
  value,
  icon: Icon,
  accent,
  soft,
}: {
  title: string;
  value: number;
  icon: LucideIcon;
  accent: string;
  soft: string;
}) {
  return (
    <div className={styles.statusCard}>
      <div className={styles.statusMain}>
        <div
          className={styles.statusIcon}
          style={{ backgroundColor: soft, color: accent }}
        >
          <Icon size={28} strokeWidth={2.1} />
        </div>

        <div className={styles.statusCopy}>
          <span>{title}</span>
          <strong style={{ color: accent }}>{value}</strong>
        </div>
      </div>

      <div
        className={styles.statusWave}
        style={{
          borderColor: accent,
          background: `linear-gradient(180deg, transparent, ${soft})`,
        }}
        aria-hidden="true"
      />
    </div>
  );
}
