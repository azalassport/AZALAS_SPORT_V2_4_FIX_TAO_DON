import { CalendarDays, UserRound } from "lucide-react";
import styles from "@/app/azalas/dashboard.module.css";

export default function DashboardHero({
  displayName,
  dateText,
}: {
  displayName: string;
  dateText: string;
}) {
  return (
    <section className={styles.hero}>
      <div className={styles.heroShade} aria-hidden="true" />

      <div className={styles.heroCopy}>
        <p className={styles.heroEyebrow}>AZALAS SPORT</p>

        <h1 className={styles.heroTitle}>
          Bứt phá doanh số - <span>Làm chủ đường đua!</span>
        </h1>

        <p className={styles.heroSubtitle}>
          Theo dõi đơn hàng, vận chuyển và công việc trong ngày.
        </p>

        <div className={styles.heroMeta}>
          <span>
            <CalendarDays size={16} />
            {dateText}
          </span>

          <span>
            <UserRound size={16} />
            Xin chào, {displayName}
          </span>
        </div>
      </div>
    </section>
  );
}
