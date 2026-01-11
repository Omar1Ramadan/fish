"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

// Logging utility with timestamps
const log = (category: string, message: string, data?: unknown) => {
  const timestamp = new Date().toISOString().split("T")[1].slice(0, -1);
  const prefix = `[${timestamp}] [${category}]`;
  if (data !== undefined) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
};

const logError = (category: string, message: string, error?: unknown) => {
  const timestamp = new Date().toISOString().split("T")[1].slice(0, -1);
  const prefix = `[${timestamp}] [${category}] ❌`;
  console.error(`${prefix} ${message}`, error);
};

interface FishingMapProps {
  startDate: string;
  endDate: string;
}

interface StyleApiResponse {
  tileUrl: string;
  colorRamp?: {
    stepsByZoom: Record<string, Array<{ color: string; value: number }>>;
  };
  cached?: boolean;
  error?: string;
}

export default function FishingMap({ startDate, endDate }: FishingMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [tileUrl, setTileUrl] = useState<string | null>(null);
  const [isLoadingStyle, setIsLoadingStyle] = useState(false);
  const [coordinates, setCoordinates] = useState({
    lng: -89.5,
    lat: -1.5,
    zoom: 4,
  });
  const [debugLog, setDebugLog] = useState<string[]>([]);

  const addDebug = useCallback((msg: string) => {
    setDebugLog((prev) => [...prev.slice(-9), msg]);
  }, []);

  // Fetch style from GFW API when dates change
  const fetchStyle = useCallback(async () => {
    log("STYLE", "🎨 Fetching style from GFW API", { startDate, endDate });
    addDebug(`Fetching style: ${startDate} to ${endDate}`);
    setIsLoadingStyle(true);

    try {
      // Using bright orange color for visibility
      const url = `/api/generate-style?start=${startDate}&end=${endDate}&color=%23FF4500&interval=DAY`;
      log("STYLE", "📤 Requesting:", url);

      const response = await fetch(url);
      const data: StyleApiResponse = await response.json();

      if (!response.ok || data.error) {
        logError("STYLE", "Failed to fetch style:", data.error);
        addDebug(`Style error: ${data.error}`);
        setIsLoadingStyle(false);
        return null;
      }

      // Log the full URL for debugging
      log("STYLE", "✅ Full GFW tile URL received:", data.tileUrl);

      // Extract and log the style parameter
      try {
        const urlObj = new URL(data.tileUrl);
        const styleParam = urlObj.searchParams.get("style");
        if (styleParam) {
          log(
            "STYLE",
            "🔑 Style param (first 50 chars):",
            styleParam.substring(0, 50)
          );
          // Try to decode it
          const decoded = atob(styleParam);
          log("STYLE", "🎨 Decoded style:", decoded);
          addDebug(`Style: ${decoded.substring(0, 40)}...`);
        } else {
          log("STYLE", "⚠️ No style in URL!");
          addDebug("WARNING: No style in GFW URL!");
        }
      } catch (e) {
        log("STYLE", "⚠️ Could not parse style:", e);
      }

      addDebug(`Style received! ${data.cached ? "(cached)" : "(fresh)"}`);

      setTileUrl(data.tileUrl);
      setIsLoadingStyle(false);
      return data.tileUrl;
    } catch (error) {
      logError("STYLE", "Exception fetching style:", error);
      addDebug(`Style exception: ${error}`);
      setIsLoadingStyle(false);
      return null;
    }
  }, [startDate, endDate, addDebug]);

  // Update fishing layer with the tile URL from GFW
  const updateFishingLayer = useCallback(
    (gfwTileUrl: string) => {
      log("LAYER", "🔄 updateFishingLayer called", {
        isLoaded,
        hasMap: !!map.current,
        urlLength: gfwTileUrl?.length,
      });

      if (!map.current) {
        log("LAYER", "⚠️ No map instance, skipping layer update");
        return;
      }
      if (!isLoaded) {
        log("LAYER", "⚠️ Map not loaded yet, skipping layer update");
        return;
      }

      const sourceId = "fishing-effort";
      const layerId = "fishing-effort-layer";

      // Remove existing layer and source if they exist
      if (map.current.getLayer(layerId)) {
        log("LAYER", "🗑️ Removing existing layer:", layerId);
        map.current.removeLayer(layerId);
      }
      if (map.current.getSource(sourceId)) {
        log("LAYER", "🗑️ Removing existing source:", sourceId);
        map.current.removeSource(sourceId);
      }

      // The GFW URL needs auth, so we proxy through our /api/tiles endpoint
      // Parse the GFW URL to extract the style parameter
      const gfwUrlObj = new URL(gfwTileUrl);
      const style = gfwUrlObj.searchParams.get("style");
      const interval = gfwUrlObj.searchParams.get("interval") || "DAY";
      const dateRange =
        gfwUrlObj.searchParams.get("date-range") || `${startDate},${endDate}`;

      // Our proxy URL with the style from GFW
      const proxyTileUrl = `/api/tiles?z={z}&x={x}&y={y}&start=${startDate}&end=${endDate}&style=${encodeURIComponent(
        style || ""
      )}&interval=${interval}`;

      log("LAYER", "📍 Adding fishing effort source", {
        proxyUrl: proxyTileUrl.substring(0, 80) + "...",
        style: style?.substring(0, 30) + "...",
        dateRange,
      });
      addDebug(`Adding tiles with GFW style`);

      try {
        // Add the fishing effort tile source
        map.current.addSource(sourceId, {
          type: "raster",
          tiles: [proxyTileUrl],
          tileSize: 256,
          attribution:
            '© <a href="https://globalfishingwatch.org">Global Fishing Watch</a>',
        });
        log("LAYER", "✅ Source added successfully");

        // Add the fishing effort layer
        map.current.addLayer({
          id: layerId,
          type: "raster",
          source: sourceId,
          paint: {
            "raster-opacity": 0.85,
            "raster-fade-duration": 0,
          },
        });
        log("LAYER", "✅ Layer added successfully");
        addDebug("🎉 Fishing layer added!");
      } catch (err) {
        logError("LAYER", "Failed to add layer:", err);
        addDebug(`Layer error: ${err}`);
      }
    },
    [startDate, endDate, isLoaded, addDebug]
  );

  // Initialize map
  useEffect(() => {
    log("INIT", "🚀 FishingMap useEffect triggered");
    log("INIT", "📦 Component state:", {
      hasMapRef: !!map.current,
      hasContainer: !!mapContainer.current,
    });

    if (map.current) {
      log("INIT", "⚠️ Map already initialized, skipping");
      return;
    }

    if (!mapContainer.current) {
      logError("INIT", "Map container ref is null!");
      setTimeout(() => setMapError("Map container not found"), 0);
      return;
    }
    log("INIT", "✅ Map container ref exists", {
      width: mapContainer.current.offsetWidth,
      height: mapContainer.current.offsetHeight,
    });

    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    log("INIT", "🔑 Checking Mapbox token...", {
      exists: !!token,
      length: token?.length,
      prefix: token?.substring(0, 10) + "...",
    });

    if (!token) {
      logError(
        "INIT",
        "MAPBOX TOKEN NOT FOUND! Make sure NEXT_PUBLIC_MAPBOX_TOKEN is set in .env"
      );
      setTimeout(
        () =>
          setMapError(
            "Mapbox token not found! Add NEXT_PUBLIC_MAPBOX_TOKEN to .env"
          ),
        0
      );
      return;
    }

    log("INIT", "🔧 Setting Mapbox access token");
    mapboxgl.accessToken = token;

    log("INIT", "🗺️ Creating new Mapbox Map instance...");

    try {
      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          name: "Dark Ocean",
          sources: {
            "carto-dark": {
              type: "raster",
              tiles: [
                "https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
                "https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
                "https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png",
              ],
              tileSize: 256,
              attribution: '© <a href="https://carto.com/">CARTO</a>',
            },
          },
          layers: [
            {
              id: "carto-dark-layer",
              type: "raster",
              source: "carto-dark",
              minzoom: 0,
              maxzoom: 22,
            },
          ],
        },
        center: [-89.5, -1.5],
        zoom: 4,
        minZoom: 1,
        maxZoom: 12,
      });
      log("INIT", "✅ Map instance created successfully");
    } catch (error) {
      logError("INIT", "Failed to create map instance:", error);
      setMapError(`Failed to create map: ${error}`);
      return;
    }

    log("INIT", "🎛️ Adding navigation controls...");
    map.current.addControl(new mapboxgl.NavigationControl(), "top-right");
    map.current.addControl(new mapboxgl.ScaleControl(), "bottom-right");
    log("INIT", "✅ Controls added");

    const currentMap = map.current;

    // Map event listeners
    currentMap.on("load", () => {
      log("EVENT", "🎉 MAP LOAD EVENT FIRED - Map is ready!");
      setIsLoaded(true);
    });

    currentMap.on("error", (e) => {
      logError("EVENT", "Map error event:", e);
      // Don't set mapError for tile loading errors
      if (!e.error?.message?.includes("tile")) {
        setMapError(`Map error: ${e.error?.message || "unknown"}`);
      }
    });

    currentMap.on("sourcedata", (e) => {
      if (e.sourceId === "fishing-effort") {
        log("EVENT", "📦 Fishing source data event:", {
          sourceId: e.sourceId,
          isSourceLoaded: e.isSourceLoaded,
          dataType: e.dataType,
        });
      }
    });

    currentMap.on("sourcedataerror", (e) => {
      logError("EVENT", "Source data error:", e);
    });

    currentMap.on("idle", () => {
      log("EVENT", "😴 Map idle (all rendering complete)");
    });

    currentMap.on("move", () => {
      const center = currentMap.getCenter();
      setCoordinates({
        lng: parseFloat(center.lng.toFixed(4)),
        lat: parseFloat(center.lat.toFixed(4)),
        zoom: parseFloat(currentMap.getZoom().toFixed(2)),
      });
    });

    log("INIT", "✅ All event listeners attached");
    log("INIT", "⏳ Waiting for map load event...");

    return () => {
      log("CLEANUP", "🧹 Cleaning up map instance");
      currentMap.remove();
      map.current = null; // Clear ref so next mount can reinitialize
    };
  }, []);

  // Fetch style and update layer when map loads or dates change
  useEffect(() => {
    if (isLoaded) {
      log("EFFECT", "📅 Map loaded, fetching style", {
        startDate,
        endDate,
        isLoaded,
      });
      fetchStyle();
    }
  }, [isLoaded, startDate, endDate, fetchStyle]);

  // Update layer when tile URL is set
  useEffect(() => {
    if (isLoaded && tileUrl) {
      log("EFFECT", "🗺️ Tile URL ready, updating layer");
      updateFishingLayer(tileUrl);
    }
  }, [isLoaded, tileUrl, updateFishingLayer]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />

      {/* Coordinates display */}
      <div className="absolute bottom-4 left-4 bg-black/80 backdrop-blur-sm border border-cyan-900/50 rounded px-3 py-2 font-mono text-xs text-cyan-400">
        <span className="text-cyan-600">LAT</span> {coordinates.lat.toFixed(4)}°
        |<span className="text-cyan-600 ml-2">LNG</span>{" "}
        {coordinates.lng.toFixed(4)}° |
        <span className="text-cyan-600 ml-2">ZOOM</span>{" "}
        {coordinates.zoom.toFixed(1)}
      </div>

      {/* Debug panel */}
      <div className="absolute top-20 right-4 bg-black/90 backdrop-blur-sm border border-orange-900/50 rounded px-3 py-2 font-mono text-xs max-w-xs z-50">
        <div className="text-orange-400 mb-2 font-bold">🔍 DEBUG LOG</div>
        <div className="space-y-1 text-orange-300/80">
          {debugLog.map((msg, i) => (
            <div key={i} className="text-[10px]">
              {msg}
            </div>
          ))}
          {debugLog.length === 0 && (
            <div className="text-[10px] text-orange-500">
              Check browser console for logs
            </div>
          )}
        </div>
        <div className="mt-2 pt-2 border-t border-orange-900/30 text-[10px] text-orange-500 space-y-1">
          <div>Map: {isLoaded ? "✅" : "❌"}</div>
          <div>Style: {tileUrl ? "✅" : isLoadingStyle ? "⏳" : "❌"}</div>
        </div>
      </div>

      {/* Error display */}
      {mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-red-950/95 z-50">
          <div className="flex flex-col items-center gap-3 max-w-md text-center p-6">
            <div className="text-4xl">🚨</div>
            <span className="text-red-400 font-mono text-lg font-bold">
              MAP ERROR
            </span>
            <span className="text-red-300 font-mono text-sm">{mapError}</span>
            <div className="text-red-500 font-mono text-xs mt-4">
              Check the browser console for detailed logs
            </div>
          </div>
        </div>
      )}

      {/* Loading indicator */}
      {!isLoaded && !mapError && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/90 pointer-events-none">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-cyan-400 font-mono text-sm">
              INITIALIZING MAP...
            </span>
            <span className="text-cyan-600 font-mono text-xs">
              Check console for detailed logs (F12)
            </span>
          </div>
        </div>
      )}

      {/* Style loading indicator */}
      {isLoaded && isLoadingStyle && (
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-black/80 backdrop-blur-sm rounded-lg px-6 py-4 z-40">
          <div className="flex items-center gap-3">
            <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-orange-400 font-mono text-sm">
              Fetching GFW style...
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
