"use client";

import { useEffect, useRef } from "react";
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

interface ProbabilityPoint {
  type: "Feature";
  geometry: {
    type: "Point";
    coordinates: [number, number];
  };
  properties: {
    probability: number;
  };
}

export interface ProbabilityCloud {
  type: "FeatureCollection";
  features: ProbabilityPoint[];
}

export interface PredictionData {
  startPosition: [number, number]; // [lat, lon]
  predictedPosition: [number, number]; // [lat, lon]
  uncertaintyNm: number;
  probabilityCloud: ProbabilityCloud;
}

interface PredictionOverlayProps {
  map: mapboxgl.Map | null;
  probabilityCloud: ProbabilityCloud | null | undefined;
  predictionData?: PredictionData | null;
  isVisible: boolean;
}

// Generate circle coordinates for a given center, radius, and number of points
function generateCircleCoords(
  centerLat: number,
  centerLon: number,
  radiusDeg: number,
  numPoints: number = 64
): [number, number][] {
  const coords: [number, number][] = [];
  for (let i = 0; i <= numPoints; i++) {
    const angle = (i / numPoints) * 2 * Math.PI;
    const lat = centerLat + radiusDeg * Math.sin(angle);
    const lon = centerLon + (radiusDeg * Math.cos(angle)) / Math.cos(centerLat * Math.PI / 180);
    coords.push([lon, lat]);
  }
  return coords;
}

export default function PredictionOverlay({
  map,
  probabilityCloud,
  predictionData,
  isVisible,
}: PredictionOverlayProps) {
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  
  // Layer IDs for concentric rings
  const ringLayerIds = [
    "prediction-ring-0",
    "prediction-ring-1",
    "prediction-ring-2",
    "prediction-ring-3",
    "prediction-ring-4",
  ];
  const ringSourceIds = [
    "prediction-ring-source-0",
    "prediction-ring-source-1",
    "prediction-ring-source-2",
    "prediction-ring-source-3",
    "prediction-ring-source-4",
  ];
  const trajectorySourceId = "prediction-trajectory";
  const trajectoryLayerId = "prediction-trajectory-layer";
  const outerCircleSourceId = "prediction-outer-circle";
  const outerCircleLayerId = "prediction-outer-circle-layer";

  useEffect(() => {
    if (!map) return;

    // Cleanup function
    const cleanup = () => {
      // Remove markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];

      // Remove all ring layers and sources
      ringLayerIds.forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
      });
      ringSourceIds.forEach(id => {
        if (map.getSource(id)) map.removeSource(id);
      });

      // Remove trajectory
      if (map.getLayer(trajectoryLayerId)) map.removeLayer(trajectoryLayerId);
      if (map.getSource(trajectorySourceId)) map.removeSource(trajectorySourceId);

      // Remove outer circle
      if (map.getLayer(outerCircleLayerId)) map.removeLayer(outerCircleLayerId);
      if (map.getSource(outerCircleSourceId)) map.removeSource(outerCircleSourceId);
    };

    // If not visible or no data, cleanup and return
    if (!isVisible || !probabilityCloud) {
      cleanup();
      return;
    }

    // First cleanup any existing layers
    cleanup();

    // Calculate center of the cloud (predicted position)
    let centerLon = 0, centerLat = 0;
    if (probabilityCloud.features.length > 0) {
      // Find the point with highest probability (center)
      let maxProb = 0;
      probabilityCloud.features.forEach(feature => {
        if (feature.properties.probability > maxProb) {
          maxProb = feature.properties.probability;
          centerLon = feature.geometry.coordinates[0];
          centerLat = feature.geometry.coordinates[1];
        }
      });
    }

    // Get start position from predictionData or estimate from cloud bounds
    let startLat = centerLat;
    let startLon = centerLon;
    let uncertaintyDeg = 0.5; // Default

    if (predictionData) {
      startLat = predictionData.startPosition[0];
      startLon = predictionData.startPosition[1];
      // Convert nm to degrees (roughly 1 nm = 1/60 degree)
      uncertaintyDeg = predictionData.uncertaintyNm / 60;
    }

    // 1. Add START marker (green pulsing)
    const startEl = document.createElement('div');
    startEl.innerHTML = `
      <div style="position: relative;">
        <div style="
          width: 20px; 
          height: 20px; 
          background: #22c55e; 
          border: 3px solid white; 
          border-radius: 50%; 
          box-shadow: 0 0 10px rgba(34, 197, 94, 0.8);
        "></div>
        <div style="
          position: absolute; 
          top: -5px; 
          left: -5px; 
          width: 30px; 
          height: 30px; 
          border: 2px solid #22c55e; 
          border-radius: 50%; 
          animation: pulse 2s infinite;
        "></div>
        <div style="
          position: absolute;
          top: -30px;
          left: 50%;
          transform: translateX(-50%);
          background: #22c55e;
          color: white;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-family: monospace;
          white-space: nowrap;
          font-weight: bold;
        ">LAST KNOWN</div>
      </div>
      <style>
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.5); opacity: 0.5; }
          100% { transform: scale(2); opacity: 0; }
        }
      </style>
    `;
    const startMarker = new mapboxgl.Marker({ element: startEl })
      .setLngLat([startLon, startLat])
      .addTo(map);
    markersRef.current.push(startMarker);

    // 2. Add PREDICTED marker (crosshair style)
    const predictedEl = document.createElement('div');
    predictedEl.innerHTML = `
      <div style="position: relative; width: 40px; height: 40px;">
        <!-- Crosshair lines -->
        <div style="
          position: absolute;
          top: 50%;
          left: 0;
          right: 0;
          height: 2px;
          background: #ef4444;
          transform: translateY(-50%);
        "></div>
        <div style="
          position: absolute;
          left: 50%;
          top: 0;
          bottom: 0;
          width: 2px;
          background: #ef4444;
          transform: translateX(-50%);
        "></div>
        <!-- Center dot -->
        <div style="
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 12px;
          height: 12px;
          background: #ef4444;
          border: 2px solid white;
          border-radius: 50%;
          box-shadow: 0 0 15px rgba(239, 68, 68, 0.9);
        "></div>
        <!-- Label -->
        <div style="
          position: absolute;
          top: -25px;
          left: 50%;
          transform: translateX(-50%);
          background: #ef4444;
          color: white;
          padding: 2px 8px;
          border-radius: 4px;
          font-size: 10px;
          font-family: monospace;
          white-space: nowrap;
          font-weight: bold;
        ">PREDICTED</div>
      </div>
    `;
    const predictedMarker = new mapboxgl.Marker({ element: predictedEl, anchor: 'center' })
      .setLngLat([centerLon, centerLat])
      .addTo(map);
    markersRef.current.push(predictedMarker);

    // 3. Add trajectory line (animated dashed)
    map.addSource(trajectorySourceId, {
      type: "geojson",
      data: {
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: [
            [startLon, startLat],
            [centerLon, centerLat]
          ]
        },
        properties: {}
      }
    });

    map.addLayer({
      id: trajectoryLayerId,
      type: "line",
      source: trajectorySourceId,
      paint: {
        "line-color": "#f97316",
        "line-width": 3,
        "line-dasharray": [2, 2],
        "line-opacity": 0.9
      }
    });

    // 4. Add concentric gradient rings (smooth probability visualization)
    // Rings from inside out with decreasing opacity
    const ringConfig = [
      { radiusMultiplier: 0.2, color: "#ff0000", opacity: 0.5 },  // Core - bright red
      { radiusMultiplier: 0.4, color: "#ff3300", opacity: 0.35 },
      { radiusMultiplier: 0.6, color: "#ff6600", opacity: 0.25 },
      { radiusMultiplier: 0.8, color: "#ff9900", opacity: 0.15 },
      { radiusMultiplier: 1.0, color: "#ffbb00", opacity: 0.08 }, // Outer - faint yellow
    ];

    // Add rings from outside to inside (so inner rings render on top)
    for (let i = ringConfig.length - 1; i >= 0; i--) {
      const ring = ringConfig[i];
      const radius = uncertaintyDeg * ring.radiusMultiplier;
      const coords = generateCircleCoords(centerLat, centerLon, radius);

      map.addSource(ringSourceIds[i], {
        type: "geojson",
        data: {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [coords]
          },
          properties: {}
        }
      });

      map.addLayer({
        id: ringLayerIds[i],
        type: "fill",
        source: ringSourceIds[i],
        paint: {
          "fill-color": ring.color,
          "fill-opacity": ring.opacity
        }
      });
    }

    // 5. Add outer boundary circle (dashed line)
    const outerCoords = generateCircleCoords(centerLat, centerLon, uncertaintyDeg);
    
    map.addSource(outerCircleSourceId, {
      type: "geojson",
      data: {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [outerCoords]
        },
        properties: {}
      }
    });

    map.addLayer({
      id: outerCircleLayerId,
      type: "line",
      source: outerCircleSourceId,
      paint: {
        "line-color": "#ffaa00",
        "line-width": 2,
        "line-dasharray": [4, 4],
        "line-opacity": 0.8
      }
    });

    // 6. Fly to show the full prediction
    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([startLon, startLat]);
    bounds.extend([centerLon, centerLat]);
    // Extend bounds by uncertainty
    bounds.extend([centerLon - uncertaintyDeg * 1.2, centerLat - uncertaintyDeg * 1.2]);
    bounds.extend([centerLon + uncertaintyDeg * 1.2, centerLat + uncertaintyDeg * 1.2]);

    map.fitBounds(bounds, {
      padding: 100,
      duration: 1500,
      maxZoom: 8
    });

    return cleanup;
  }, [map, probabilityCloud, predictionData, isVisible, ringLayerIds, ringSourceIds, trajectorySourceId, trajectoryLayerId, outerCircleSourceId, outerCircleLayerId]);

  return null;
}
