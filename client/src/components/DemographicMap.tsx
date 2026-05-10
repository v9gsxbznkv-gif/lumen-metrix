/**
 * DemographicMap — Google Maps showing campus locations + member dots
 * Features:
 * - Campus filter toggles (show/hide Canton, Jasper, Unassigned)
 * - Drive-time radius overlays (15/30 min approximate circles)
 * - Deterministic clustering + jitter (dots don't move when toggling filters)
 */
import { useRef, useState, useCallback, useEffect, useMemo } from "react";
import { MapView } from "@/components/Map";
import { trpc } from "@/lib/trpc";
import { CAMPUS_COLORS } from "@/lib/data";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, RefreshCw, Users, Building2, Clock } from "lucide-react";

// Dot colors matching CAMPUS_COLORS from the dashboard
const CAMPUS_DOT_COLORS: Record<string, string> = {
  Canton: CAMPUS_COLORS["Canton"] || "#C2703E",
  Jasper: CAMPUS_COLORS["Jasper"] || "#4A7FB5",
  Online: CAMPUS_COLORS["Online"] || "#8B6DAF",
  Unknown: "#9CA3AF",
};

const CAMPUS_PIN_COLORS: Record<string, string> = {
  Canton: CAMPUS_DOT_COLORS.Canton,
  Jasper: CAMPUS_DOT_COLORS.Jasper,
};

// Approximate drive-time radii in meters (rural GA, ~50mph avg)
const DRIVE_TIME_RADII = {
  "15 min": 19_300,
  "30 min": 38_600,
};

// Campus coordinates
const CAMPUS_COORDS: Record<string, { lat: number; lng: number }> = {
  Canton: { lat: 34.236065, lng: -84.4125308 },
  Jasper: { lat: 34.4731533, lng: -84.4390925 },
};

/**
 * Deterministic pseudo-random based on a seed string.
 * Returns a value between 0 and 1.
 */
function seededRandom(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Normalize to 0-1
  return (Math.abs(hash) % 10000) / 10000;
}

interface ProcessedPoint {
  lat: number;
  lng: number;
  campus: string;
  city: string;
  zip: string;
  clusterSize: number;
  isClusterCenter: boolean;
}

/**
 * Group points that share the same lat/lng (rounded to 4 decimals)
 * into clusters with a count, then jitter individual points deterministically.
 */
function clusterAndJitter(
  points: Array<{ lat: number; lng: number; campus: string; city: string; zip: string }>
): ProcessedPoint[] {
  const groups = new Map<string, typeof points>();
  for (const p of points) {
    const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  const jittered: ProcessedPoint[] = [];

  for (const [groupKey, group] of Array.from(groups)) {
    const centerLat = group[0].lat;
    const centerLng = group[0].lng;
    const count = group.length;

    if (count === 1) {
      jittered.push({ ...group[0], clusterSize: 1, isClusterCenter: false });
    } else if (count <= 4) {
      // Small group: jitter individual dots (no cluster badge)
      const baseRadius = 0.003;
      for (let i = 0; i < group.length; i++) {
        const angle = (i / count) * 2 * Math.PI;
        const seed = `${groupKey}-${i}`;
        const jitterFactor = 0.8 + seededRandom(seed) * 0.4;
        const jitterLat = centerLat + baseRadius * Math.cos(angle) * jitterFactor;
        const jitterLng = centerLng + baseRadius * Math.sin(angle) * jitterFactor;
        jittered.push({
          ...group[i],
          lat: jitterLat,
          lng: jitterLng,
          clusterSize: 0,
          isClusterCenter: false,
        });
      }
    } else {
      // Large group: show ONLY the cluster badge (no individual dots)
      jittered.push({
        lat: centerLat,
        lng: centerLng,
        campus: getMajorityCampus(group),
        city: group[0].city,
        zip: group[0].zip,
        clusterSize: count,
        isClusterCenter: true,
      });
    }
  }

  return jittered;
}

function getMajorityCampus(group: Array<{ campus: string }>): string {
  const counts = new Map<string, number>();
  for (const p of group) {
    counts.set(p.campus, (counts.get(p.campus) || 0) + 1);
  }
  let max = 0;
  let result = "Unknown";
  for (const [campus, count] of Array.from(counts)) {
    if (count > max) {
      max = count;
      result = campus;
    }
  }
  return result;
}

export default function DemographicMap() {
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Array<{ marker: google.maps.marker.AdvancedMarkerElement; campus: string }>>([]);
  const campusPinsRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const circlesRef = useRef<google.maps.Circle[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  // Campus filter state
  const [visibleCampuses, setVisibleCampuses] = useState<Set<string>>(
    () => new Set(["Canton", "Jasper", "Unknown"])
  );

  // Drive-time overlay state
  const [showDriveTime, setShowDriveTime] = useState<"off" | "15 min" | "30 min">("off");

  // Fetch map data
  const { data: mapData, refetch: refetchMapData } = trpc.demographics.getMapPoints.useQuery();
  const { data: campuses } = trpc.demographics.getCampuses.useQuery();
  const { data: syncStatus, refetch: refetchStatus } = trpc.demographics.getSyncStatus.useQuery();

  // Mutations
  const syncAddresses = trpc.demographics.syncAddresses.useMutation();
  const fetchAddressBatch = trpc.demographics.fetchAddressBatch.useMutation();
  const geocodeAddresses = trpc.demographics.geocodeAddresses.useMutation();
  const backfillCampus = trpc.demographics.backfillCampus.useMutation();

  // Check if most dots are "Unknown" campus — suggest backfill
  const unknownCount = mapData?.points?.filter((p) => !p.campus || p.campus === "Unknown").length ?? 0;
  const totalPoints = mapData?.points?.length ?? 0;
  const needsBackfill = totalPoints > 0 && unknownCount > totalPoints * 0.5;

  // Process ALL points once (deterministic clustering + jitter)
  const allProcessedPoints = useMemo(() => {
    if (!mapData?.points) return [];
    return clusterAndJitter(mapData.points);
  }, [mapData?.points]);

  // Campus counts (from full data)
  const campusCounts = useMemo(() => {
    if (!mapData?.points) return {} as Record<string, number>;
    return mapData.points.reduce((acc, p) => {
      const c = p.campus || "Unknown";
      acc[c] = (acc[c] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }, [mapData?.points]);

  // Filtered count for subtitle
  const filteredCount = useMemo(() => {
    if (!mapData?.points) return 0;
    return mapData.points.filter((p) => visibleCampuses.has(p.campus || "Unknown")).length;
  }, [mapData?.points, visibleCampuses]);

  const toggleCampus = useCallback((campus: string) => {
    setVisibleCampuses((prev) => {
      const next = new Set(prev);
      if (next.has(campus)) {
        next.delete(campus);
      } else {
        next.add(campus);
      }
      return next;
    });
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      // Phase 1: Sync people + campus from PCO
      setSyncMessage("Phase 1/3: Syncing active people from PCO...");
      const addrResult = await syncAddresses.mutateAsync();
      setSyncMessage(
        `Phase 1 done: ${addrResult.total} people synced. ${addrResult.noAddress} need addresses. Fetching...`
      );

      // Phase 2: Fetch addresses in batches
      let addrRemaining = addrResult.noAddress;
      let totalAddrSynced = addrResult.synced;
      let addrBatch = 0;

      while (addrRemaining > 0) {
        addrBatch++;
        const batchResult = await fetchAddressBatch.mutateAsync({ batchSize: 50 });
        totalAddrSynced += batchResult.synced;
        addrRemaining = batchResult.remaining;
        setSyncMessage(
          `Phase 2/3: Fetching addresses... batch ${addrBatch}, ${totalAddrSynced} with address, ${addrRemaining} remaining`
        );
      }

      setSyncMessage(`Phase 2 done: ${totalAddrSynced} addresses. Geocoding...`);

      // Phase 3: Geocode
      let totalGeocoded = 0;
      let totalFailed = 0;
      let geoRemaining = Infinity;
      let geoBatch = 0;

      while (geoRemaining > 0) {
        geoBatch++;
        const geoResult = await geocodeAddresses.mutateAsync({ batchSize: 100 });
        totalGeocoded += geoResult.geocoded;
        totalFailed += geoResult.failed;
        geoRemaining = geoResult.remaining;
        setSyncMessage(`Phase 3/3: Geocoding batch ${geoBatch}... ${totalGeocoded} done, ${geoRemaining} remaining`);
        if (geoBatch % 3 === 0) await refetchMapData();
      }

      setSyncMessage(`Done! ${addrResult.total} people, ${totalAddrSynced} addresses, ${totalGeocoded} geocoded.`);
      await refetchMapData();
      await refetchStatus();
    } catch (err: any) {
      setSyncMessage(`Error: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }, [syncAddresses, fetchAddressBatch, geocodeAddresses, refetchMapData, refetchStatus]);

  const handleBackfillCampus = useCallback(async () => {
    setBackfilling(true);
    setSyncMessage("Fetching campus assignments from PCO...");
    try {
      const result = await backfillCampus.mutateAsync();
      setSyncMessage(
        `Campus backfill complete: ${result.withCampus} of ${result.totalPeople} people have a campus, ${result.updated} records updated.`
      );
      await refetchMapData();
    } catch (err: any) {
      setSyncMessage(`Error: ${err.message}`);
    } finally {
      setBackfilling(false);
    }
  }, [backfillCampus, refetchMapData]);

  // Standalone geocode handler
  const handleGeocode = useCallback(async () => {
    setGeocoding(true);
    try {
      let totalGeocoded = 0;
      let totalFailed = 0;
      let remaining = Infinity;
      let batch = 0;

      while (remaining > 0) {
        batch++;
        const result = await geocodeAddresses.mutateAsync({ batchSize: 50 });
        totalGeocoded += result.geocoded;
        totalFailed += result.failed;
        remaining = result.remaining;
        setSyncMessage(`Geocoding batch ${batch}... ${totalGeocoded} done, ${remaining} remaining`);
        if (batch % 3 === 0) {
          await refetchMapData();
          await refetchStatus();
        }
      }

      setSyncMessage(`Geocoding complete! ${totalGeocoded} geocoded, ${totalFailed} failed.`);
      await refetchMapData();
      await refetchStatus();
    } catch (err: any) {
      setSyncMessage(`Geocoding error: ${err.message}. Click again to resume.`);
    } finally {
      setGeocoding(false);
    }
  }, [geocodeAddresses, refetchMapData, refetchStatus]);

  // Render drive-time circles
  const renderCircles = useCallback((map: google.maps.Map) => {
    for (const c of circlesRef.current) {
      c.setMap(null);
    }
    circlesRef.current = [];

    if (showDriveTime === "off") return;

    const radius = DRIVE_TIME_RADII[showDriveTime];

    for (const [campusName, coords] of Object.entries(CAMPUS_COORDS)) {
      const color = CAMPUS_DOT_COLORS[campusName] || "#999";
      const circle = new google.maps.Circle({
        map,
        center: coords,
        radius,
        fillColor: color,
        fillOpacity: 0.08,
        strokeColor: color,
        strokeOpacity: 0.5,
        strokeWeight: 2,
        clickable: false,
      });
      circlesRef.current.push(circle);
    }
  }, [showDriveTime]);

  // Render ALL markers once (campus pins + member dots)
  const renderAllMarkers = useCallback(
    (map: google.maps.Map) => {
      // Clear existing markers
      for (const { marker } of markersRef.current) {
        marker.map = null;
      }
      markersRef.current = [];
      for (const m of campusPinsRef.current) {
        m.map = null;
      }
      campusPinsRef.current = [];

      if (!campuses) return;

      // Add campus location pins (always visible)
      for (const campus of campuses) {
        const pinEl = document.createElement("div");
        pinEl.innerHTML = `
          <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            cursor: pointer;
          ">
            <div style="
              background: ${CAMPUS_PIN_COLORS[campus.name] || CAMPUS_DOT_COLORS.Canton};
              color: white;
              padding: 4px 10px;
              border-radius: 6px;
              font-size: 12px;
              font-weight: 700;
              font-family: 'DM Sans', sans-serif;
              white-space: nowrap;
              box-shadow: 0 2px 8px rgba(0,0,0,0.3);
            ">${campus.name} Campus</div>
            <div style="
              width: 0;
              height: 0;
              border-left: 6px solid transparent;
              border-right: 6px solid transparent;
              border-top: 6px solid ${CAMPUS_PIN_COLORS[campus.name] || CAMPUS_DOT_COLORS.Canton};
            "></div>
          </div>
        `;

        const marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat: campus.lat, lng: campus.lng },
          content: pinEl,
          zIndex: 1000,
        });
        campusPinsRef.current.push(marker);
      }

      // Add ALL processed points as markers
      for (const point of allProcessedPoints) {
        const campus = point.campus || "Unknown";

        if (point.isClusterCenter) {
          const color = CAMPUS_DOT_COLORS[campus] || CAMPUS_DOT_COLORS.Unknown;
          const size = Math.min(60, Math.max(32, 20 + Math.log2(point.clusterSize) * 8));
          const fontSize = size > 40 ? 13 : 11;
          const badgeEl = document.createElement("div");
          badgeEl.style.cssText = `
            width: ${size}px;
            height: ${size}px;
            border-radius: 50%;
            background: ${color};
            border: 3px solid rgba(255,255,255,0.95);
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: ${fontSize}px;
            font-weight: 800;
            font-family: 'DM Sans', sans-serif;
            box-shadow: 0 2px 8px rgba(0,0,0,0.35);
            cursor: pointer;
          `;
          badgeEl.textContent = String(point.clusterSize);
          badgeEl.title = `${point.clusterSize} people in ${point.city || "this area"} (${campus})`;

          const marker = new google.maps.marker.AdvancedMarkerElement({
            map,
            position: { lat: point.lat, lng: point.lng },
            content: badgeEl,
            zIndex: 500 + point.clusterSize,
          });
          markersRef.current.push({ marker, campus });
        } else if (point.clusterSize !== 0 || !point.isClusterCenter) {
          // Individual dot (not a cluster center placeholder with size 0 from cluster groups)
          if (point.clusterSize === 0 && point.isClusterCenter) continue; // skip
          const color = CAMPUS_DOT_COLORS[campus] || CAMPUS_DOT_COLORS.Unknown;
          const dotEl = document.createElement("div");
          dotEl.style.cssText = `
            width: 10px;
            height: 10px;
            border-radius: 50%;
            background: ${color};
            border: 1.5px solid rgba(255,255,255,0.85);
            opacity: 0.8;
            cursor: pointer;
            box-shadow: 0 1px 3px rgba(0,0,0,0.25);
          `;
          dotEl.title = `${campus} — ${point.city || point.zip}`;

          const marker = new google.maps.marker.AdvancedMarkerElement({
            map,
            position: { lat: point.lat, lng: point.lng },
            content: dotEl,
            zIndex: 100,
          });
          markersRef.current.push({ marker, campus });
        }
      }
    },
    [allProcessedPoints, campuses]
  );

  // Toggle marker visibility based on campus filter (no re-rendering, no repositioning)
  useEffect(() => {
    for (const { marker, campus } of markersRef.current) {
      const shouldShow = visibleCampuses.has(campus);
      if (marker.content instanceof HTMLElement) {
        marker.content.style.display = shouldShow ? "" : "none";
      }
    }
  }, [visibleCampuses]);

  const handleMapReady = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      renderAllMarkers(map);
      renderCircles(map);
    },
    [renderAllMarkers, renderCircles]
  );

  // Re-render markers when data changes (not when filter changes)
  useEffect(() => {
    if (mapRef.current && allProcessedPoints.length > 0) {
      renderAllMarkers(mapRef.current);
    }
  }, [allProcessedPoints, campuses, renderAllMarkers]);

  // Re-render circles when drive-time selection changes
  useEffect(() => {
    if (mapRef.current) {
      renderCircles(mapRef.current);
    }
  }, [showDriveTime, renderCircles]);

  const hasData = mapData && mapData.points.length > 0;

  return (
    <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="section-title text-card-foreground">Congregation Map</h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {hasData
              ? `${filteredCount} of ${mapData.points.length} members shown (${mapData.stats.total} active)`
              : "Sync addresses from PCO to populate the map"}
          </p>
        </div>
        <div className="flex gap-2">
          {needsBackfill && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleBackfillCampus}
              disabled={backfilling || syncing}
              className="text-xs"
            >
              {backfilling ? (
                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              ) : (
                <Building2 className="w-3 h-3 mr-1" />
              )}
              {backfilling ? "Backfilling..." : "Assign Campuses"}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSync}
            disabled={syncing || backfilling}
            className="text-xs"
          >
            {syncing ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <RefreshCw className="w-3 h-3 mr-1" />
            )}
            {syncing ? "Syncing..." : hasData ? "Refresh" : "Sync Addresses"}
          </Button>
        </div>
      </div>

      {syncMessage && (
        <div className="px-3 py-2 rounded-md text-xs font-medium mb-3 bg-muted/50 text-muted-foreground">
          {syncMessage}
        </div>
      )}

      {/* Sync status bar */}
      {syncStatus && (
        <div className="flex gap-4 mb-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Users className="w-3 h-3" /> {syncStatus.totalActive} active
          </span>
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" /> {syncStatus.geocoded} mapped
          </span>
          {(syncStatus.pendingGeocode ?? 0) > 0 && (
            <button
              onClick={handleGeocode}
              disabled={geocoding || syncing}
              className="text-amber-500 hover:text-amber-600 underline cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              {geocoding ? "Geocoding..." : `${syncStatus.pendingGeocode} pending geocode`}
            </button>
          )}
        </div>
      )}

      {/* Controls row: Campus filters + Drive-time toggle */}
      <div className="flex flex-wrap items-center gap-3 mb-3">
        {/* Campus filter toggles */}
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-muted-foreground font-medium mr-1">Show:</span>
          {Object.entries(CAMPUS_DOT_COLORS)
            .filter(([k]) => k !== "Online")
            .map(([name, color]) => {
              const isActive = visibleCampuses.has(name);
              const count = campusCounts[name] || 0;
              return (
                <button
                  key={name}
                  onClick={() => toggleCampus(name)}
                  className={`
                    inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium
                    border transition-all duration-150 cursor-pointer
                    ${isActive
                      ? "border-border bg-card shadow-sm text-card-foreground"
                      : "border-transparent bg-muted/40 text-muted-foreground opacity-50"
                    }
                  `}
                >
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: isActive ? color : "#D1D5DB" }}
                  />
                  {name === "Unknown" ? "Unassigned" : name}
                  {count > 0 && (
                    <span className="text-[10px] text-muted-foreground">{count}</span>
                  )}
                </button>
              );
            })}
        </div>

        {/* Divider */}
        <div className="w-px h-5 bg-border/60" />

        {/* Drive-time radius toggle */}
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 text-muted-foreground" />
          <span className="text-[11px] text-muted-foreground font-medium mr-1">Drive:</span>
          {(["off", "15 min", "30 min"] as const).map((option) => (
            <button
              key={option}
              onClick={() => setShowDriveTime(option)}
              className={`
                px-2 py-1 rounded-md text-[11px] font-medium border transition-all duration-150 cursor-pointer
                ${showDriveTime === option
                  ? "border-border bg-card shadow-sm text-card-foreground"
                  : "border-transparent bg-muted/40 text-muted-foreground"
                }
              `}
            >
              {option === "off" ? "Off" : option}
            </button>
          ))}
        </div>
      </div>

      {/* Map */}
      <MapView
        className="h-[500px] rounded-lg overflow-hidden"
        initialCenter={{ lat: 34.35, lng: -84.46 }}
        initialZoom={10}
        onMapReady={handleMapReady}
      />
    </div>
  );
}
