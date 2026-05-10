/**
 * DemographicMap — Google Maps showing campus locations + member dots
 * Uses the MapView component with AdvancedMarkerElement for pins.
 * Groups nearby points into clusters with count badges at zoomed-out levels,
 * and jitters individual dots when zoomed in.
 */
import { useRef, useState, useCallback, useEffect } from "react";
import { MapView } from "@/components/Map";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Loader2, MapPin, RefreshCw, Users } from "lucide-react";

// Campus colors matching the rest of the dashboard
const CAMPUS_DOT_COLORS: Record<string, string> = {
  Canton: "#E8913A",   // orange
  Jasper: "#6366F1",   // indigo
  Online: "#10B981",   // emerald
  Unknown: "#9CA3AF",  // gray
};

const CAMPUS_PIN_COLORS: Record<string, string> = {
  Canton: "#E8913A",
  Jasper: "#6366F1",
};

/**
 * Group points that share the same lat/lng (rounded to 4 decimals)
 * into clusters with a count. Then jitter individual points within
 * each cluster so they spread out visually.
 */
function clusterAndJitter(
  points: Array<{ lat: number; lng: number; campus: string; city: string; zip: string }>
) {
  // Group by rounded coordinates
  const groups = new Map<string, typeof points>();
  for (const p of points) {
    const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }

  // For each group, jitter points in a circle around the centroid
  const jittered: Array<{
    lat: number;
    lng: number;
    campus: string;
    city: string;
    zip: string;
    clusterSize: number;
    isClusterCenter: boolean;
  }> = [];

  for (const [, group] of groups) {
    const centerLat = group[0].lat;
    const centerLng = group[0].lng;
    const count = group.length;

    if (count === 1) {
      // Single point — no jitter needed
      jittered.push({
        ...group[0],
        clusterSize: 1,
        isClusterCenter: false,
      });
    } else {
      // Add a cluster center marker with the count
      jittered.push({
        lat: centerLat,
        lng: centerLng,
        campus: getMajorityCampus(group),
        city: group[0].city,
        zip: group[0].zip,
        clusterSize: count,
        isClusterCenter: true,
      });

      // Jitter individual dots in concentric rings around center
      // Radius ~0.006 degrees ≈ ~0.4 miles
      const baseRadius = 0.006;
      const maxRings = Math.ceil(count / 12);

      for (let i = 0; i < group.length; i++) {
        const ring = Math.floor(i / 12);
        const posInRing = i % 12;
        const ringRadius = baseRadius * (ring + 1) / maxRings * (maxRings > 1 ? maxRings : 1);
        const angle = (posInRing / 12) * 2 * Math.PI + (ring * 0.3);

        // Add some randomness to avoid perfect circles
        const jitterLat = centerLat + ringRadius * Math.cos(angle) * (0.8 + Math.random() * 0.4);
        const jitterLng = centerLng + ringRadius * Math.sin(angle) * (0.8 + Math.random() * 0.4);

        jittered.push({
          ...group[i],
          lat: jitterLat,
          lng: jitterLng,
          clusterSize: 0,
          isClusterCenter: false,
        });
      }
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
  for (const [campus, count] of counts) {
    if (count > max) {
      max = count;
      result = campus;
    }
  }
  return result;
}

export default function DemographicMap() {
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");

  // Fetch map data
  const { data: mapData, isLoading, refetch: refetchMapData } = trpc.demographics.getMapPoints.useQuery();
  const { data: campuses } = trpc.demographics.getCampuses.useQuery();
  const { data: syncStatus, refetch: refetchStatus } = trpc.demographics.getSyncStatus.useQuery();

  // Mutations
  const syncAddresses = trpc.demographics.syncAddresses.useMutation();
  const geocodeAddresses = trpc.demographics.geocodeAddresses.useMutation();

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setSyncMessage("Syncing addresses from PCO...");
    try {
      const addrResult = await syncAddresses.mutateAsync();
      setSyncMessage(
        `Addresses: ${addrResult.synced} synced, ${addrResult.noAddress} no address. Geocoding...`
      );

      // Geocode in batches of 100 until none remaining
      let totalGeocoded = 0;
      let totalFailed = 0;
      let remaining = Infinity;
      let batchNum = 0;

      while (remaining > 0) {
        batchNum++;
        const geoResult = await geocodeAddresses.mutateAsync({ batchSize: 100 });
        totalGeocoded += geoResult.geocoded;
        totalFailed += geoResult.failed;
        remaining = geoResult.remaining;

        setSyncMessage(
          `Geocoding batch ${batchNum}... ${totalGeocoded} done, ${remaining} remaining`
        );

        // Refresh map after each batch so dots appear progressively
        await refetchMapData();
      }

      setSyncMessage(
        `Done! ${totalGeocoded} geocoded, ${totalFailed} failed.`
      );

      // Final refresh
      await refetchMapData();
      await refetchStatus();
    } catch (err: any) {
      setSyncMessage(`Error: ${err.message}`);
    } finally {
      setSyncing(false);
    }
  }, [syncAddresses, geocodeAddresses, refetchMapData, refetchStatus]);

  const renderMarkers = useCallback(
    (map: google.maps.Map) => {
      // Clear existing markers
      for (const m of markersRef.current) {
        m.map = null;
      }
      markersRef.current = [];

      if (!mapData?.points || !campuses) return;

      // Add campus location pins (larger, with label)
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
              background: ${CAMPUS_PIN_COLORS[campus.name] || "#E8913A"};
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
              border-top: 6px solid ${CAMPUS_PIN_COLORS[campus.name] || "#E8913A"};
            "></div>
          </div>
        `;

        const marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat: campus.lat, lng: campus.lng },
          content: pinEl,
          zIndex: 1000,
        });
        markersRef.current.push(marker);
      }

      // Cluster and jitter points
      const processed = clusterAndJitter(mapData.points);

      for (const point of processed) {
        if (point.isClusterCenter) {
          // Render cluster badge (circle with count)
          const color = CAMPUS_DOT_COLORS[point.campus] || CAMPUS_DOT_COLORS.Unknown;
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
          badgeEl.title = `${point.clusterSize} people in ${point.city || "this area"}`;

          const marker = new google.maps.marker.AdvancedMarkerElement({
            map,
            position: { lat: point.lat, lng: point.lng },
            content: badgeEl,
            zIndex: 500 + point.clusterSize,
          });
          markersRef.current.push(marker);
        } else {
          // Individual dot
          const color = CAMPUS_DOT_COLORS[point.campus] || CAMPUS_DOT_COLORS.Unknown;
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

          const marker = new google.maps.marker.AdvancedMarkerElement({
            map,
            position: { lat: point.lat, lng: point.lng },
            content: dotEl,
            zIndex: 100,
          });
          markersRef.current.push(marker);
        }
      }
    },
    [mapData, campuses]
  );

  const handleMapReady = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      renderMarkers(map);
    },
    [renderMarkers]
  );

  // Re-render markers whenever mapData changes (e.g. after geocoding batches)
  useEffect(() => {
    if (mapRef.current) {
      renderMarkers(mapRef.current);
    }
  }, [mapData, campuses, renderMarkers]);

  const hasData = mapData && mapData.points.length > 0;

  return (
    <div className="bg-card rounded-lg border border-border/60 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3
            className="text-sm font-semibold"
            style={{ fontFamily: "'DM Sans', sans-serif" }}
          >
            Congregation Map
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {hasData
              ? `${mapData.points.length} members mapped of ${mapData.stats.total} active`
              : "Sync addresses from PCO to populate the map"}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleSync}
          disabled={syncing}
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
          {syncStatus.pendingGeocode > 0 && (
            <span className="text-amber-500">
              {syncStatus.pendingGeocode} pending geocode
            </span>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="flex gap-4 mb-3">
        {Object.entries(CAMPUS_DOT_COLORS)
          .filter(([k]) => k !== "Unknown")
          .map(([name, color]) => (
            <div key={name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ background: color }}
              />
              {name}
            </div>
          ))}
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
