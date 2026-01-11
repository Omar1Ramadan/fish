"use client";

import { useEffect } from "react";
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

interface ProbabilityCloud {
  type: "FeatureCollection";
  features: ProbabilityPoint[];
}

interface PredictionOverlayProps {
  map: mapboxgl.Map | null;
  probabilityCloud: ProbabilityCloud | null | undefined;
  isVisible: boolean;
}

export default function PredictionOverlay({
  map,
  probabilityCloud,
  isVisible,
}: PredictionOverlayProps) {
  const sourceId = "prediction-cloud";
  const layerId = "prediction-cloud-layer";

  useEffect(() => {
    if (!map || !probabilityCloud) return;

    // Remove existing layers/sources
    if (map.getLayer(layerId)) {
      map.removeLayer(layerId);
    }
    if (map.getSource(sourceId)) {
      map.removeSource(sourceId);
    }

    if (!isVisible) return;

    // Add source
    map.addSource(sourceId, {
      type: "geojson",
      data: probabilityCloud,
    });

    // Add heatmap layer
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
          0,
          0,
          1,
          1,
        ],
        "heatmap-intensity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0,
          1,
          9,
          3,
        ],
        "heatmap-color": [
          "interpolate",
          ["linear"],
          ["heatmap-density"],
          0,
          "rgba(0, 0, 255, 0)",
          0.2,
          "rgba(0, 255, 255, 0.5)",
          0.4,
          "rgba(0, 255, 0, 0.7)",
          0.6,
          "rgba(255, 255, 0, 0.8)",
          0.8,
          "rgba(255, 165, 0, 0.9)",
          1,
          "rgba(255, 0, 0, 1)",
        ],
        "heatmap-radius": [
          "interpolate",
          ["linear"],
          ["zoom"],
          0,
          2,
          9,
          20,
        ],
        "heatmap-opacity": 0.6,
      },
    });

    return () => {
      if (map.getLayer(layerId)) {
        map.removeLayer(layerId);
      }
      if (map.getSource(sourceId)) {
        map.removeSource(sourceId);
      }
    };
  }, [map, probabilityCloud, isVisible, sourceId, layerId]);

  return null; // This component only manages map layers
}
