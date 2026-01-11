"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import PredictionOverlay, { PredictionData } from "./PredictionOverlay";

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

interface EEZRegion {
  id: string;
  name: string;
  country: string;
  dataset: string;
}

interface FishingMapProps {
  startDate: string;
  endDate: string;
  selectedEEZ?: EEZRegion | null;
  eezBuffer?: number;
  excludedCountries?: string[];
  predictionResult?: PredictionData | null;
  onMapReady?: (map: mapboxgl.Map) => void;
}

interface StyleApiResponse {
  tileUrl: string;
  colorRamp?: {
    stepsByZoom: Record<string, Array<{ color: string; value: number }>>;
  };
  cached?: boolean;
  error?: string;
}

export default function FishingMap({
  startDate,
  endDate,
  selectedEEZ,
  eezBuffer = 0,
  excludedCountries = [],
  predictionResult,
  onMapReady,
}: FishingMapProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<mapboxgl.Map | null>(null);
  const orbitAnimationRef = useRef<number | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [tileUrl, setTileUrl] = useState<string | null>(null);
  const [isLoadingStyle, setIsLoadingStyle] = useState(false);
  const [mapInstance, setMapInstance] = useState<mapboxgl.Map | null>(null);

  // Orbit animation functions
  const stopOrbitAnimation = useCallback(() => {
    if (orbitAnimationRef.current) {
      cancelAnimationFrame(orbitAnimationRef.current);
      orbitAnimationRef.current = null;
    }
  }, []);

  const startOrbitAnimation = useCallback(() => {
    // Optional: implement slow orbit around selected region
    // For now, this is a placeholder
  }, []);

  // Debug logging (no-op in production)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const addDebug = useCallback((_msg: string) => {}, []);

  // Fetch style from GFW API when dates change
  const fetchStyle = useCallback(async () => {
    log("STYLE", "🎨 Fetching style from GFW API", {
      startDate,
      endDate,
      excludedCountries,
    });
    addDebug(`Fetching style: ${startDate} to ${endDate}`);
    setIsLoadingStyle(true);

    try {
      // Using bright cyan/turquoise for maximum visibility
      const excludeParam =
        excludedCountries.length > 0
          ? `&excludeFlags=${excludedCountries.join(",")}`
          : "";
      const url = `/api/generate-style?start=${startDate}&end=${endDate}&color=%2303fcbe&interval=DAY${excludeParam}`;
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
  }, [startDate, endDate, excludedCountries, addDebug]);

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
      const excludeParam =
        excludedCountries.length > 0
          ? `&excludeFlags=${excludedCountries.join(",")}`
          : "";
      const proxyTileUrl = `/api/tiles?z={z}&x={x}&y={y}&start=${startDate}&end=${endDate}&style=${encodeURIComponent(
        style || ""
      )}&interval=${interval}${excludeParam}`;

      log("LAYER", "📍 Adding fishing effort source", {
        proxyUrl: proxyTileUrl.substring(0, 80) + "...",
        style: style?.substring(0, 30) + "...",
        dateRange,
      });
      addDebug(`Adding tiles with GFW style`);

      try {
        // Add the fishing effort tile source
        // Lower maxzoom = blockier/coarser appearance when zoomed out
        map.current.addSource(sourceId, {
          type: "raster",
          tiles: [proxyTileUrl],
          tileSize: 256,
          minzoom: 0,
          maxzoom: 12, // Allow detailed tiles when zooming in
          attribution:
            '© <a href="https://globalfishingwatch.org">Global Fishing Watch</a>',
        });
        log("LAYER", "✅ Source added successfully");

        // Add the fishing effort layer with high contrast
        map.current.addLayer({
          id: layerId,
          type: "raster",
          source: sourceId,
          paint: {
            "raster-opacity": 1,
            "raster-fade-duration": 0,
            "raster-contrast": 0.6,
            "raster-brightness-min": 0.1,
            "raster-saturation": 0.7,
          },
        });
        log("LAYER", "✅ Layer added successfully");
        addDebug("🎉 Fishing layer added!");
      } catch (err) {
        logError("LAYER", "Failed to add layer:", err);
        addDebug(`Layer error: ${err}`);
      }
    },
    [startDate, endDate, isLoaded, excludedCountries, addDebug]
  );

  // Update EEZ boundary layer
  const updateEEZLayer = useCallback(
    async (region: EEZRegion | null, buffer: number) => {
      log("EEZ", "🔄 updateEEZLayer called", {
        isLoaded,
        hasMap: !!map.current,
        regionId: region?.id,
        buffer,
      });

      if (!map.current || !isLoaded) {
        log("EEZ", "⚠️ Map not ready, skipping EEZ layer update");
        return;
      }

      // Stop any existing orbit animation when changing EEZ
      stopOrbitAnimation();

      const sourceId = "eez-boundary";
      const layerId = "eez-boundary-layer";
      const fillLayerId = `${layerId}-fill`;
      const bufferSourceId = "eez-buffer";
      const bufferLayerId = "eez-buffer-layer";
      const bufferFillLayerId = `${bufferLayerId}-fill`;

      // Remove existing layers FIRST, then sources
      // Order matters: must remove layers before their sources
      if (map.current.getLayer(fillLayerId)) {
        map.current.removeLayer(fillLayerId);
      }
      if (map.current.getLayer(layerId)) {
        map.current.removeLayer(layerId);
      }
      if (map.current.getLayer(bufferFillLayerId)) {
        map.current.removeLayer(bufferFillLayerId);
      }
      if (map.current.getLayer(bufferLayerId)) {
        map.current.removeLayer(bufferLayerId);
      }
      // Now safe to remove sources
      if (map.current.getSource(sourceId)) {
        map.current.removeSource(sourceId);
      }
      if (map.current.getSource(bufferSourceId)) {
        map.current.removeSource(bufferSourceId);
      }

      if (!region) {
        log("EEZ", "✅ EEZ layer removed (no region selected)");
        addDebug("EEZ layer removed");
        return;
      }

      // Fetch actual EEZ boundary from Marine Regions (the source GFW uses)
      log("EEZ", "🌍 Fetching boundary from Marine Regions", {
        regionId: region.id,
        regionName: region.name,
        regionDataset: region.dataset,
        buffer,
      });
      addDebug(`Fetching boundary for ${region.name}...`);

      try {
        // Fetch boundary GeoJSON from our API (which proxies to Marine Regions)
        const boundaryUrl = new URL(
          "/api/eez-boundary",
          window.location.origin
        );
        boundaryUrl.searchParams.set("region-id", region.id);
        boundaryUrl.searchParams.set("region-dataset", region.dataset);
        if (buffer > 0) {
          boundaryUrl.searchParams.set("buffer-value", buffer.toString());
          boundaryUrl.searchParams.set("buffer-unit", "NAUTICALMILES");
        }

        const response = await fetch(boundaryUrl.toString());

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          logError("EEZ", "Failed to fetch boundary", {
            status: response.status,
            error: errorData,
          });
          addDebug(`⚠️ Boundary fetch failed: ${response.status}`);
          return;
        }

        const geoJson = await response.json();

        if (!geoJson.features || geoJson.features.length === 0) {
          log("EEZ", "⚠️ No boundary features returned");
          addDebug(`⚠️ No boundary data available`);
          return;
        }

        log("EEZ", "✅ Boundary fetched", {
          featureCount: geoJson.features.length,
        });

        // Add GeoJSON source
        map.current.addSource(sourceId, {
          type: "geojson",
          data: geoJson,
        });

        // Add fill layer
        map.current.addLayer({
          id: fillLayerId,
          type: "fill",
          source: sourceId,
          paint: {
            "fill-color": buffer > 0 ? "#ffaa00" : "#00ffff",
            "fill-opacity": buffer > 0 ? 0.08 : 0.12,
          },
        });

        // Add outline layer
        map.current.addLayer({
          id: layerId,
          type: "line",
          source: sourceId,
          paint: {
            "line-color": buffer > 0 ? "#ffaa00" : "#00ffff",
            "line-width": buffer > 0 ? 1.5 : 2,
            "line-opacity": 0.8,
            "line-dasharray": buffer > 0 ? [1, 1] : [2, 2],
          },
        });

        // Fit map to boundary bounds
        const bounds = new mapboxgl.LngLatBounds();
        geoJson.features.forEach(
          (feature: {
            geometry: {
              type: string;
              coordinates: number[] | number[][] | number[][][];
            };
          }) => {
            if (feature.geometry.type === "Polygon") {
              const coords = feature.geometry.coordinates as number[][][];
              if (coords && coords[0]) {
                coords[0].forEach((coord: number[]) => {
                  if (coord.length >= 2) {
                    bounds.extend([coord[0], coord[1]] as [number, number]);
                  }
                });
              }
            } else if (feature.geometry.type === "MultiPolygon") {
              const polygons = feature.geometry
                .coordinates as unknown as number[][][][];
              polygons.forEach((polygon: number[][][]) => {
                if (polygon && polygon[0]) {
                  polygon[0].forEach((coord: number[]) => {
                    if (coord.length >= 2) {
                      bounds.extend([coord[0], coord[1]] as [number, number]);
                    }
                  });
                }
              });
            }
          }
        );

        if (!bounds.isEmpty()) {
          // Fly to bounds with cinematic camera
          map.current.fitBounds(bounds, {
            padding: { top: 100, right: 100, bottom: 200, left: 100 }, // Extra padding for 3D view
            maxZoom: 5, // Don't zoom in too far when fitting to EEZ
            pitch: 50, // Tilt camera for 3D effect
            bearing: 0,
            duration: 1800, // Faster fly-in
          });

          // Start orbit after fly-in completes
          setTimeout(() => {
            startOrbitAnimation();
          }, 1900);
        }

        log("EEZ", "✅ Boundary displayed", {
          regionId: region.id,
          regionName: region.name,
        });
        addDebug(`✅ Boundary displayed from Marine Regions`);
      } catch (err) {
        logError("EEZ", "Failed to fetch/display boundary:", err);
        addDebug(
          `❌ Error: ${err instanceof Error ? err.message : "Unknown error"}`
        );
      }
    },
    [isLoaded, addDebug, startOrbitAnimation, stopOrbitAnimation]
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
        zoom: 3, // Zoomed out to show wide area
        minZoom: 1,
        maxZoom: 12,
      });
      log("INIT", "✅ Map instance created successfully");
    } catch (error) {
      logError("INIT", "Failed to create map instance:", error);
      setMapError(`Failed to create map: ${error}`);
      return;
    }

    log("INIT", "🎛️ Adding scale control...");
    // Scale control positioned in bottom-left area (above timeline)
    map.current.addControl(new mapboxgl.ScaleControl(), "bottom-left");
    log("INIT", "✅ Controls added");

    const currentMap = map.current;

    // Map event listeners
    currentMap.on("load", () => {
      log("EVENT", "🎉 MAP LOAD EVENT FIRED - Map is ready!");
      setIsLoaded(true);
      setMapInstance(currentMap);
      // Notify parent that map is ready
      if (onMapReady) {
        onMapReady(currentMap);
      }
    });

    currentMap.on("error", (e) => {
      // Only log non-tile errors to avoid noise from expected failures
      const errorMsg = e.error?.message || "";
      const errorStatus = (e.error as { status?: number })?.status;

      // Ignore expected errors:
      // - Tile loading errors (404, 422, etc.)
      // - Source/layer errors from EEZ boundary (which may not be available)
      // - Vector tile parsing errors
      // - Empty error messages (usually network/CORS issues with tiles)
      const isExpectedError =
        !errorMsg || // Empty error messages are usually tile loading issues
        errorMsg.includes("tile") ||
        errorMsg.includes("404") ||
        errorMsg.includes("422") ||
        errorMsg.includes("Not Found") ||
        errorMsg.includes("Unprocessable") ||
        errorMsg.includes("vector") ||
        errorMsg.includes("source") ||
        errorMsg.includes("layer") ||
        errorStatus === 404 ||
        errorStatus === 422;

      if (!isExpectedError) {
        logError("EVENT", "Map error event:", e);
        setMapError(`Map error: ${errorMsg}`);
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

    log("INIT", "✅ All event listeners attached");
    log("INIT", "⏳ Waiting for map load event...");

    return () => {
      log("CLEANUP", "🧹 Cleaning up map instance");
      // Stop orbit animation
      if (orbitAnimationRef.current !== null) {
        cancelAnimationFrame(orbitAnimationRef.current);
        orbitAnimationRef.current = null;
      }
      currentMap.remove();
      map.current = null; // Clear ref so next mount can reinitialize
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Only run on mount, onMapReady is stable via useCallback
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
  }, [isLoaded, startDate, endDate, excludedCountries, fetchStyle]);

  // Update layer when tile URL is set
  useEffect(() => {
    if (isLoaded && tileUrl) {
      log("EFFECT", "🗺️ Tile URL ready, updating layer");
      updateFishingLayer(tileUrl);
    }
  }, [isLoaded, tileUrl, updateFishingLayer]);

  // Update EEZ layer when region or buffer changes
  useEffect(() => {
    if (isLoaded) {
      log("EFFECT", "🌍 EEZ region changed, updating boundary layer");
      updateEEZLayer(selectedEEZ || null, eezBuffer || 0);
    }
  }, [isLoaded, selectedEEZ, eezBuffer, updateEEZLayer]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapContainer} className="w-full h-full" />
      {mapInstance && predictionResult && (
        <PredictionOverlay
          map={mapInstance}
          probabilityCloud={predictionResult.probabilityCloud}
          predictionData={predictionResult}
          isVisible={true}
        />
      )}

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
