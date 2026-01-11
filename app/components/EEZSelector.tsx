'use client';

import { useState, useEffect } from 'react';

interface EEZRegion {
  id: string;
  name: string;
  country: string;
  dataset: string;
}

interface EEZSelectorProps {
  selectedRegion: EEZRegion | null;
  onRegionSelect: (region: EEZRegion | null) => void;
}

export default function EEZSelector({
  selectedRegion,
  onRegionSelect,
}: EEZSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [regions, setRegions] = useState<EEZRegion[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadRegions();
  }, []);

  const loadRegions = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/eez-regions');
      const data = await response.json();
      setRegions(data.regions || []);
    } catch (error) {
      console.error('Failed to load EEZ regions:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-slate-950/90 backdrop-blur-md border border-cyan-900/30 rounded-lg overflow-hidden shadow-2xl shadow-cyan-950/20">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-slate-900/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
          <span className="font-mono text-sm text-slate-300 uppercase tracking-wider">
            EEZ Monitor
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-cyan-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Current Selection */}
      {selectedRegion && (
        <div className="px-4 pb-3 border-b border-cyan-900/20">
          <div className="font-mono text-xs text-cyan-400/70 mb-1">ACTIVE</div>
          <div className="font-mono text-sm text-white">{selectedRegion.name}</div>
        </div>
      )}

      {/* Expanded List */}
      {isExpanded && (
        <div className="p-4">
          <div className="space-y-1">
            {isLoading ? (
              <div className="text-xs text-slate-500 font-mono py-4 text-center">
                Loading...
              </div>
            ) : (
              <>
                <button
                  onClick={() => onRegionSelect(null)}
                  className={`w-full px-3 py-2 text-left text-xs font-mono rounded transition-all ${
                    !selectedRegion
                      ? 'bg-cyan-900/30 border border-cyan-700/50 text-cyan-300'
                      : 'bg-slate-800/50 border border-slate-700/50 text-slate-300 hover:bg-slate-700/50'
                  }`}
                >
                  🌐 Global View
                </button>
                {regions.map((region) => (
                  <button
                    key={region.id}
                    onClick={() => onRegionSelect(region)}
                    className={`w-full px-3 py-2 text-left text-xs font-mono rounded transition-all ${
                      selectedRegion?.id === region.id
                        ? 'bg-cyan-900/30 border border-cyan-700/50 text-cyan-300'
                        : 'bg-slate-800/50 border border-slate-700/50 text-slate-300 hover:bg-slate-700/50'
                    }`}
                  >
                    {region.name}
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
