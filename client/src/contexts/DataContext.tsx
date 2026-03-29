import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { DashboardData, loadDashboardData } from "@/lib/data";

interface Filters {
  campus: string;
  yearStart: number;
  yearEnd: number;
}

interface DataContextType {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
}

const DataContext = createContext<DataContextType | null>(null);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Filters>({
    campus: "All Campuses",
    yearStart: 2013,
    yearEnd: 2025,
  });

  useEffect(() => {
    loadDashboardData()
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  const value = useMemo(
    () => ({ data, loading, error, filters, setFilters }),
    [data, loading, error, filters]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useData must be used within DataProvider");
  return ctx;
}
