/*
 * Lumen Metrix — KPI Card
 * DM Mono values, Inter labels, subtle left-border accent
 */
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string;
  change?: { label: string; positive: boolean; value: number };
  changeLabel?: string;
  subtitle?: string;
  borderColor?: string;
  icon?: React.ReactNode;
}

export default function KpiCard({ label, value, change, changeLabel, subtitle, borderColor, icon }: KpiCardProps) {
  return (
    <div
      className="bg-card rounded-lg p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] border border-border/60 transition-all hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
      style={borderColor ? { borderLeft: `3px solid ${borderColor}` } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="micro-label text-muted-foreground mb-2">
            {label}
          </p>
          <p className="stat-value text-[1.75rem] text-card-foreground leading-none">
            {value}
          </p>
          {subtitle && (
            <p className="text-[11px] text-muted-foreground mt-1.5">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className="text-muted-foreground/30 shrink-0">{icon}</div>
        )}
      </div>
      {change && change.label !== "N/A" && (
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border/40">
          {change.value > 0 ? (
            <TrendingUp className="w-3.5 h-3.5 text-success" style={{ color: "#4A7C59" }} />
          ) : change.value < 0 ? (
            <TrendingDown className="w-3.5 h-3.5" style={{ color: "#C45B4A" }} />
          ) : (
            <Minus className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          <span
            className="text-xs font-semibold"
            style={{ color: change.positive ? "#4A7C59" : "#C45B4A" }}
          >
            {change.label}
          </span>
          <span className="text-[10px] text-muted-foreground">{changeLabel || "vs prior year"}</span>
        </div>
      )}
    </div>
  );
}
