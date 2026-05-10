/**
 * DemographicMap — Google Maps showing campus locations + member dots
 * Uses the MapView component with AdvancedMarkerElement for pins.
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

      // Add member dots (small circles)
      for (const point of mapData.points) {
        const color = CAMPUS_DOT_COLORS[point.campus] || CAMPUS_DOT_COLORS.Unknown;
        const dotEl = document.createElement("div");
        dotEl.style.cssText = `
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: ${color};
          border: 2px solid rgba(255,255,255,0.9);
          opacity: 0.85;
          cursor: pointer;
          box-shadow: 0 1px 4px rgba(0,0,0,0.3);
        `;

        const marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat: point.lat, lng: point.lng },
          content: dotEl,
          zIndex: 100,
        });
        markersRef.current.push(marker);
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
        initialCenter={{ lat: 34.35, lng: -84.46 }} // Centered between Canton & Jasper
        initialZoom={10}
        onMapReady={handleMapReady}
      />
    </div>
  );
}
