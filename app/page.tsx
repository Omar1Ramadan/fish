"use client";

import { useState, useCallback } from "react";
import dynamic from "next/dynamic";
import TimelineSlider from "./components/TimelineSlider";
import EEZSelector from "./components/EEZSelector";
import CountryFilter from "./components/CountryFilter";
import LoadingScreen from "./components/LoadingScreen";
import VesselList from "./components/VesselList";

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
  const [selectedEEZ, setSelectedEEZ] = useState<EEZRegion | null>(null); // Start with no EEZ selected
  const [eezBuffer, setEezBuffer] = useState(200); // 200nm buffer to catch vessels in international waters near EEZ
  const [excludedCountries, setExcludedCountries] = useState<string[]>([]);
  const [isMapReady, setIsMapReady] = useState(false);
  const [showLoadingScreen, setShowLoadingScreen] = useState(true);
  const [selectedVessel, setSelectedVessel] = useState<{
    vesselId: string;
    mmsi: string;
    name: string;
    flag: string;
    gearType: string;
    fishingHours: number;
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

  return (
    <div className="relative w-screen h-screen bg-slate-950 overflow-hidden">
      {/* Map takes full viewport */}
      <FishingMap
        startDate={startDate}
        endDate={endDate}
        selectedEEZ={selectedEEZ}
        eezBuffer={eezBuffer}
        excludedCountries={excludedCountries}
        onMapReady={handleMapReady}
        selectedVessel={selectedVessel}
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
                    FISHING WATCH
                  </h1>
                  <p className="font-mono text-[10px] text-cyan-400/70 uppercase tracking-widest">
                    Global Activity Monitor
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* EEZ Selector and Country Filter */}
      <div className="absolute top-4 right-4 pointer-events-auto">
        <div className="w-80 space-y-3">
          <EEZSelector
            selectedRegion={selectedEEZ}
            onRegionSelect={setSelectedEEZ}
            onBufferChange={setEezBuffer}
            bufferValue={eezBuffer}
          />
          <CountryFilter
            excludedCountries={excludedCountries}
            onExcludedCountriesChange={setExcludedCountries}
          />
        </div>
      </div>

      {/* Info panel */}
      <div className="absolute left-4 top-24 pointer-events-auto max-w-xs">
        <div className="bg-slate-950/90 backdrop-blur-md border border-cyan-900/30 rounded-lg px-4 py-3 shadow-2xl shadow-cyan-950/20">
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
          <div className="mt-3 pt-3 border-t border-slate-800">
            <div className="font-mono text-[10px] text-slate-600">
              TIP: Zoom into the Galápagos Islands to see fishing fleet clusters
            </div>
          </div>
        </div>
      </div>

      {/* Vessel List - left side */}
      <div className="absolute left-4 top-48 pointer-events-auto w-80">
        <VesselList
          selectedEEZ={selectedEEZ}
          startDate={startDate}
          endDate={endDate}
          bufferValue={eezBuffer}
          selectedVessel={selectedVessel}
          onVesselSelect={setSelectedVessel}
        />
      </div>

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
