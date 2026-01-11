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

export default function PredictionOverlay({
  map,
  probabilityCloud,
  predictionData,
  isVisible,
}: PredictionOverlayProps) {
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  
  const sourceId = "prediction-cloud";
  const layerId = "prediction-cloud-layer";
  const trajectorySourceId = "prediction-trajectory";
  const trajectoryLayerId = "prediction-trajectory-layer";
  const circleSourceId = "prediction-circle";
  const circleLayerId = "prediction-circle-layer";
  const circleOutlineLayerId = "prediction-circle-outline-layer";

  useEffect(() => {
    if (!map) return;

    // Cleanup function
    const cleanup = () => {
      // Remove markers
      markersRef.current.forEach(marker => marker.remove());
      markersRef.current = [];

      // Remove layers first, then sources
      const layersToRemove = [layerId, trajectoryLayerId, circleLayerId, circleOutlineLayerId];
      const sourcesToRemove = [sourceId, trajectorySourceId, circleSourceId];

      layersToRemove.forEach(id => {
        if (map.getLayer(id)) {
          map.removeLayer(id);
        }
      });

      sourcesToRemove.forEach(id => {
        if (map.getSource(id)) {
          map.removeSource(id);
        }
      });
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
        ">START</div>
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

    // 2. Add PREDICTED marker (red with crosshair)
    const predictedEl = document.createElement('div');
    predictedEl.innerHTML = `
      <div style="position: relative;">
        <div style="
          width: 24px; 
          height: 24px; 
          background: #ef4444; 
          border: 3px solid white; 
          border-radius: 50%; 
          box-shadow: 0 0 15px rgba(239, 68, 68, 0.9);
          display: flex;
          align-items: center;
          justify-content: center;
        ">
          <div style="
            width: 8px;
            height: 8px;
            background: white;
            border-radius: 50%;
          "></div>
        </div>
        <div style="
          position: absolute;
          top: -35px;
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
    const predictedMarker = new mapboxgl.Marker({ element: predictedEl })
      .setLngLat([centerLon, centerLat])
      .addTo(map);
    markersRef.current.push(predictedMarker);

    // 3. Add trajectory line (dashed)
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

    // 4. Add uncertainty circle
    const circlePoints = 64;
    const circleCoords: [number, number][] = [];
    for (let i = 0; i <= circlePoints; i++) {
      const angle = (i / circlePoints) * 2 * Math.PI;
      const lat = centerLat + uncertaintyDeg * Math.sin(angle);
      const lon = centerLon + uncertaintyDeg * Math.cos(angle) / Math.cos(centerLat * Math.PI / 180);
      circleCoords.push([lon, lat]);
    }

    map.addSource(circleSourceId, {
      type: "geojson",
      data: {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [circleCoords]
        },
        properties: {}
      }
    });

    // Circle fill
    map.addLayer({
      id: circleLayerId,
      type: "fill",
      source: circleSourceId,
      paint: {
        "fill-color": "#f97316",
        "fill-opacity": 0.15
      }
    });

    // Circle outline
    map.addLayer({
      id: circleOutlineLayerId,
      type: "line",
      source: circleSourceId,
      paint: {
        "line-color": "#f97316",
        "line-width": 2,
        "line-dasharray": [4, 2]
      }
    });

    // 5. Add probability cloud heatmap
    map.addSource(sourceId, {
      type: "geojson",
      data: probabilityCloud,
    });

    map.addLayer({
      id: layerId,
      type: "heatmap",
      source: sourceId,
      maxzoom: 15,
      paint: {
        "heatmap-weight": [
          "interpolate",
          ["linear"],
          ["get", "probability"],
          0, 0,
          0.01, 0.5,
          0.1, 1,
        ],
        "heatmap-intensity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0, 2,
          5, 4,
          10, 6,
        ],
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0, "rgba(255, 150, 0, 0)",
          0.1, "rgba(255, 200, 0, 0.4)",
          0.3, "rgba(255, 150, 0, 0.6)",
          0.5, "rgba(255, 100, 0, 0.7)",
          0.7, "rgba(255, 50, 0, 0.8)",
          1, "rgba(255, 0, 0, 1)",
        ],
        "heatmap-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0, 10,
          5, 30,
          10, 50,
        ],
        "heatmap-opacity": 0.8,
      },
    });

    // 6. Fly to show the full prediction
    const bounds = new mapboxgl.LngLatBounds();
    bounds.extend([startLon, startLat]);
    bounds.extend([centerLon, centerLat]);
    // Extend bounds by uncertainty
    bounds.extend([centerLon - uncertaintyDeg, centerLat - uncertaintyDeg]);
    bounds.extend([centerLon + uncertaintyDeg, centerLat + uncertaintyDeg]);

    map.fitBounds(bounds, {
      padding: 100,
      duration: 1500,
      maxZoom: 8
    });

    return cleanup;
  }, [map, probabilityCloud, predictionData, isVisible, sourceId, layerId, trajectorySourceId, trajectoryLayerId, circleSourceId, circleLayerId, circleOutlineLayerId]);

  return null;
}
