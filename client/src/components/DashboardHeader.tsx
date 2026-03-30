/*
 * Lumen Metrix — Dashboard Top Bar
 * Filters + context info, sits above main content area
 * Mobile: filters wrap to full-width row below title
 */
import { useData } from "@/contexts/DataContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SlidersHorizontal } from "lucide-react";

interface DashboardHeaderProps {
  title: string;
  subtitle?: string;
}

export default function DashboardHeader({ title, subtitle }: DashboardHeaderProps) {
  const { data, filters, setFilters } = useData();
  const years = data?.meta.years ?? [];

  return (
    <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
      <div className="min-w-0">
        <h1 className="text-lg sm:text-xl font-bold tracking-tight truncate" style={{ fontFamily: "'DM Sans', sans-serif" }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">{subtitle}</p>
        )}
      </div>

      {/* Filters — full-width row on mobile */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <SlidersHorizontal className="w-3.5 h-3.5" />
        </div>

        <Select
          value={filters.campus}
          onValueChange={(v) => setFilters((f) => ({ ...f, campus: v }))}
        >
          <SelectTrigger className="w-full sm:w-[140px] h-9 sm:h-8 text-xs bg-card border-border/60">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="All Campuses">All Campuses</SelectItem>
            <SelectItem value="Canton">Canton</SelectItem>
            <SelectItem value="Jasper">Jasper</SelectItem>
            <SelectItem value="Online">Online</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Select
            value={String(filters.yearStart)}
            onValueChange={(v) => setFilters((f) => ({ ...f, yearStart: Number(v) }))}
          >
            <SelectTrigger className="w-[80px] sm:w-[90px] h-9 sm:h-8 text-xs bg-card border-border/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="text-[10px] text-muted-foreground">—</span>

          <Select
            value={String(filters.yearEnd)}
            onValueChange={(v) => setFilters((f) => ({ ...f, yearEnd: Number(v) }))}
          >
            <SelectTrigger className="w-[80px] sm:w-[90px] h-9 sm:h-8 text-xs bg-card border-border/60">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </header>
  );
}
