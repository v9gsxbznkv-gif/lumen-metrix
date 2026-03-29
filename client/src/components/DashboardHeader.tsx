import { useData } from "@/contexts/DataContext";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Church, Filter } from "lucide-react";

const HERO_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663419960068/EmzMXpmCwkQz2biKeRL4cm/hero-bg-jjRyWo6BpCfFbZJHrg7gev.webp";

export default function DashboardHeader() {
  const { data, filters, setFilters } = useData();
  const years = data?.meta.years ?? [];

  return (
    <header className="relative overflow-hidden">
      {/* Hero background */}
      <div className="absolute inset-0 z-0">
        <img
          src={HERO_BG}
          alt=""
          className="w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
      </div>

      <div className="relative z-10 container pt-6 pb-5">
        {/* Top bar */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
            <Church className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight font-[Outfit]">
              Revolution Church
            </h1>
            <p className="text-xs text-muted-foreground -mt-0.5">
              Executive Dashboard
            </p>
          </div>
        </div>

        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Filter className="w-3.5 h-3.5" />
            <span className="font-medium">Filters</span>
          </div>

          <Select
            value={filters.campus}
            onValueChange={(v) => setFilters((f) => ({ ...f, campus: v }))}
          >
            <SelectTrigger className="w-[150px] h-8 text-xs bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All Campuses">All Campuses</SelectItem>
              <SelectItem value="Canton">Canton</SelectItem>
              <SelectItem value="Jasper">Jasper</SelectItem>
              <SelectItem value="Online">Online</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={String(filters.yearStart)}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, yearStart: Number(v) }))
            }
          >
            <SelectTrigger className="w-[90px] h-8 text-xs bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <span className="text-xs text-muted-foreground">to</span>

          <Select
            value={String(filters.yearEnd)}
            onValueChange={(v) =>
              setFilters((f) => ({ ...f, yearEnd: Number(v) }))
            }
          >
            <SelectTrigger className="w-[90px] h-8 text-xs bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {data && (
            <span className="text-[10px] text-muted-foreground/60 ml-auto hidden sm:block">
              Data through {new Date(data.meta.generated).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
