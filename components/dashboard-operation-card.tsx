import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import styles from "@/app/azalas/dashboard.module.css";

export default function DashboardOperationCard({
  href,
  title,
  description,
  icon: Icon,
  accent,
  soft,
}: {
  href: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  soft: string;
}) {
  return (
    <Link className={styles.operationCard} href={href}>
      <div
        className={styles.operationIcon}
        style={{
          background: `linear-gradient(145deg, ${accent}, ${accent}DD)`,
          color: "#ffffff",
          boxShadow: `0 10px 20px ${soft}`,
        }}
      >
        <Icon size={27} strokeWidth={2.2} />
      </div>

      <div className={styles.operationCopy}>
        <strong>{title}</strong>
        <small>{description}</small>
      </div>

      <ChevronRight className={styles.operationArrow} size={17} />
    </Link>
  );
}
