"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import TimelineSlider from "./components/TimelineSlider";
import EEZSelector from "./components/EEZSelector";
import CountryFilter from "./components/CountryFilter";
import LoadingScreen from "./components/LoadingScreen";
import VesselList, { Vessel } from "./components/VesselList";
import VesselPanel from "./components/VesselPanel";
import { PredictionData } from "./components/PredictionOverlay";
import type { SARLayerOptions } from "./components/FishingMap";

// Dynamic import to avoid SSR issues with Mapbox
const FishingMap = dynamic(() => import("./components/FishingMap"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-slate-950">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-cyan-400 font-mono text-sm">
          LOADING MAP MODULE...
        </span>
      </div>
    </div>
  ),
});

interface EEZRegion {
  id: string;
  name: string;
  country: string;
  dataset: string;
}

// Default to Ecuador EEZ (includes Galapagos) - MRGID 8403
const GALAPAGOS_EEZ: EEZRegion = {
  id: "8403",
  name: "Ecuador EEZ (Galapagos)",
  country: "Ecuador",
  dataset: "public-eez-areas",
};

export default function Home() {
  // Default dates: Jul 1, 2025 to Sep 30, 2025 (~3 month window)
  // This captures the Chinese fishing fleet season near Galapagos
  const [startDate, setStartDate] = useState("2025-07-01");
  const [endDate, setEndDate] = useState("2025-09-30");
  const [selectedEEZ, setSelectedEEZ] = useState<EEZRegion | null>(null);
  const [excludedCountries, setExcludedCountries] = useState<string[]>([]);
  const [isMapReady, setIsMapReady] = useState(false);
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [predictionResult, setPredictionResult] =
    useState<PredictionData | null>(null);
  const [selectedVessel, setSelectedVessel] = useState<{
    vesselId: string;
    mmsi: string;
    name: string;
    flag: string;
    gearType: string;
    fishingHours: number;
  } | null>(null);

  // SAR layer state
  const [sarLayer, setSarLayer] = useState<SARLayerOptions>({
    enabled: false,
    matched: "all",
    opacity: 0.9,
  });

  // Prediction state
  const [activePredictionGapId, setActivePredictionGapId] = useState<string | null>(null);
  const [activeGap, setActiveGap] = useState<{
    id: string;
    position: { lat: number; lon: number };
    durationHours?: number;
  } | null>(null);

  const handleDateChange = useCallback((start: string, end: string) => {
    setStartDate(start);
    setEndDate(end);
  }, []);

  const handleMapReady = useCallback(() => {
    setIsMapReady(true);
  }, []);

  const handleLoadingComplete = useCallback(() => {
    setShowLoadingScreen(false);
    // Select Galapagos immediately after loading to show the zoom effect
    setSelectedEEZ(GALAPAGOS_EEZ);
  }, []);

  // Handle prediction generation from VesselPanel
  const handlePredictionGenerated = useCallback(
    (prediction: PredictionData | null, gapId: string | null) => {
      setPredictionResult(prediction);
      setActivePredictionGapId(gapId);
      
      // Set the active gap for the marker
      if (prediction && gapId) {
        setActiveGap({
          id: gapId,
          position: {
            lat: prediction.startPosition[0],
            lon: prediction.startPosition[1],
          },
        });
      } else {
        setActiveGap(null);
      }
    },
    []
  );

  // Handle vessel panel close
  const handleVesselPanelClose = useCallback(() => {
    setSelectedVessel(null);
    setPredictionResult(null);
    setActivePredictionGapId(null);
    setActiveGap(null);
  }, []);

  return (
    <div className="relative w-screen h-screen bg-slate-950 overflow-hidden">
      {/* Map takes full viewport */}
      <FishingMap
        startDate={startDate}
        endDate={endDate}
        selectedEEZ={selectedEEZ}
        excludedCountries={excludedCountries}
        predictionResult={predictionResult}
        onMapReady={handleMapReady}
        selectedVessel={selectedVessel}
        sarLayer={sarLayer}
        activeGap={activeGap}
      />

      {/* Loading Screen */}
      {showLoadingScreen && (
        <LoadingScreen
          isMapReady={isMapReady}
          onLoadingComplete={handleLoadingComplete}
          // probabilityCloud={probabilityCloud}
        />
      )}

      {/* Header overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 pointer-events-none">
        <div className="flex items-start justify-between">
          {/* Logo/Title */}
          <div className="pointer-events-auto">
            <div className="bg-slate-950/90 backdrop-blur-md border border-cyan-900/30 rounded-lg px-4 py-3 shadow-2xl shadow-cyan-950/20">
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-3 h-3 bg-cyan-400 rounded-full" />
                  <div className="absolute inset-0 w-3 h-3 bg-cyan-400 rounded-full animate-ping opacity-75" />
                </div>
                <div>
                  <h1 className="font-mono text-lg font-bold text-white tracking-tight">
                    FISHY
                  </h1>
                  <p className="font-mono text-[10px] text-cyan-400/70 uppercase tracking-widest">
                    Dark Vessel Monitor
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* EEZ Selector and Country Filter */}
      <div className="absolute top-4 right-4 pointer-events-auto z-20">
        <div className="w-80 space-y-3">
          <EEZSelector
            selectedRegion={selectedEEZ}
            onRegionSelect={setSelectedEEZ}
          />
          <CountryFilter
            excludedCountries={excludedCountries}
            onExcludedCountriesChange={setExcludedCountries}
          />
        </div>
      </div>

      {/* Left Panel - Data layers and Vessel List */}
      <div className="absolute left-4 top-24 bottom-20 pointer-events-auto w-80 flex flex-col gap-3 overflow-hidden">
        {/* Data Source Info */}
        <div className="bg-slate-950/90 backdrop-blur-md border border-cyan-900/30 rounded-lg px-4 py-3 shadow-2xl shadow-cyan-950/20 flex-shrink-0">
          <div className="font-mono text-xs text-slate-500 uppercase mb-2">
            Data Source
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            AIS apparent fishing effort from{" "}
            <a
              href="https://globalfishingwatch.org"
              target="_blank"
              rel="noopener noreferrer"
              className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2"
            >
              Global Fishing Watch
            </a>
            . Brighter areas indicate more fishing hours.
          </p>
        </div>

        {/* SAR Layer Toggle - Compact */}
        <div className="bg-slate-950/90 backdrop-blur-md border border-purple-900/30 rounded-lg px-4 py-3 shadow-2xl shadow-purple-950/20 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`w-2 h-2 rounded-full ${
                  sarLayer.enabled ? "bg-purple-400" : "bg-slate-600"
                }`}
              />
              <span className="font-mono text-xs text-slate-400 uppercase">
                SAR Detections
              </span>
            </div>
            <button
              onClick={() =>
                setSarLayer((prev) => ({ ...prev, enabled: !prev.enabled }))
              }
              className={`relative w-10 h-5 rounded-full transition-colors ${
                sarLayer.enabled ? "bg-purple-600" : "bg-slate-700"
              }`}
            >
              <div
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  sarLayer.enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          {sarLayer.enabled && (
            <div className="mt-3 pt-3 border-t border-slate-800 space-y-2">
              <div className="flex gap-1">
                {(["all", "matched", "unmatched"] as const).map((option) => (
                  <button
                    key={option}
                    onClick={() =>
                      setSarLayer((prev) => ({ ...prev, matched: option }))
                    }
                    className={`flex-1 px-2 py-1 rounded text-[10px] font-mono uppercase transition-colors ${
                      sarLayer.matched === option
                        ? "bg-purple-600 text-white"
                        : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                    }`}
                  >
                    {option}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-slate-500">
                <span className="text-purple-400">Unmatched</span> = no AIS
                (dark vessels)
              </p>
            </div>
          )}
        </div>

        {/* Vessel List - fills remaining space */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <VesselList
            selectedEEZ={selectedEEZ}
            startDate={startDate}
            endDate={endDate}
            selectedVessel={selectedVessel}
            onVesselSelect={setSelectedVessel}
            hasPredictionActive={!!predictionResult}
          />
        </div>
      </div>

      {/* Vessel Panel - right side when vessel selected */}
      {selectedVessel && (
        <div className="absolute right-4 top-[180px] pointer-events-auto w-96 z-20">
          <VesselPanel
            vessel={selectedVessel as Vessel}
            startDate={startDate}
            endDate={endDate}
            onClose={handleVesselPanelClose}
            onPredictionGenerated={handlePredictionGenerated}
            activePredictionGapId={activePredictionGapId}
          />
        </div>
      )}

      {/* Timeline Slider - fixed at bottom */}
      <div className="absolute bottom-0 left-0 right-0 pointer-events-auto">
        <TimelineSlider
          startDate={startDate}
          endDate={endDate}
          onDateChange={handleDateChange}
        />
      </div>
    </div>
  );
}
