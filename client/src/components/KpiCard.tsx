import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string;
  change?: { label: string; positive: boolean; value: number };
  subtitle?: string;
  borderColor?: string;
  icon?: React.ReactNode;
}

export default function KpiCard({ label, value, change, subtitle, borderColor, icon }: KpiCardProps) {
  return (
    <div
      className="bg-card rounded-lg p-5 shadow-sm border border-border/60 transition-all hover:shadow-md"
      style={borderColor ? { borderLeft: `3px solid ${borderColor}` } : undefined}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-1.5">
            {label}
          </p>
          <p className="stat-value text-2xl lg:text-3xl text-card-foreground leading-none">
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-muted-foreground mt-1.5">{subtitle}</p>
          )}
        </div>
        {icon && (
          <div className="text-muted-foreground/40 shrink-0">{icon}</div>
        )}
      </div>
      {change && change.label !== "N/A" && (
        <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-border/40">
          {change.value > 0 ? (
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
          ) : change.value < 0 ? (
            <TrendingDown className="w-3.5 h-3.5 text-red-500" />
          ) : (
            <Minus className="w-3.5 h-3.5 text-muted-foreground" />
          )}
          <span
            className={`text-xs font-semibold ${
              change.positive ? "text-emerald-600" : "text-red-500"
            }`}
          >
            {change.label}
          </span>
          <span className="text-xs text-muted-foreground">vs prior year</span>
        </div>
      )}
    </div>
  );
}
