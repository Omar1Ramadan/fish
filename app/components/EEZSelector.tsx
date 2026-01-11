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
  onBufferChange?: (buffer: number) => void;
  bufferValue?: number;
}

export default function EEZSelector({
  selectedRegion,
  onRegionSelect,
  onBufferChange,
  bufferValue = 0,
}: EEZSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [regions, setRegions] = useState<EEZRegion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

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

  const filteredRegions = regions.filter(
    (r) =>
      !searchTerm ||
      r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.country.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

      {/* Current Selection Display */}
      {selectedRegion && (
        <div className="px-4 pb-3 border-b border-cyan-900/20">
          <div className="font-mono text-xs text-cyan-400/70 mb-1">ACTIVE REGION</div>
          <div className="font-mono text-sm text-white">
            {selectedRegion.name}
          </div>
          <div className="font-mono text-xs text-slate-500 mt-1">
            {selectedRegion.country}
          </div>
        </div>
      )}

      {/* Expanded Controls */}
      {isExpanded && (
        <div className="p-4 space-y-4">
          {/* Search */}
          <div>
            <label className="block font-mono text-xs text-slate-500 uppercase mb-1">
              Search Regions
            </label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or country..."
              className="w-full px-3 py-2 bg-slate-900/50 border border-slate-700/50 rounded text-sm text-white font-mono focus:border-cyan-600 focus:outline-none focus:ring-1 focus:ring-cyan-600/50"
            />
          </div>

          {/* Region List */}
          <div>
            <div className="font-mono text-xs text-slate-500 uppercase mb-2">
              Protected Zones
            </div>
            <div className="max-h-48 overflow-y-auto space-y-1">
              {isLoading ? (
                <div className="text-xs text-slate-500 font-mono py-4 text-center">
                  Loading regions...
                </div>
              ) : filteredRegions.length === 0 ? (
                <div className="text-xs text-slate-500 font-mono py-4 text-center">
                  No regions found
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
                    None (Show All)
                  </button>
                  {filteredRegions.map((region) => (
                    <button
                      key={region.id}
                      onClick={() => onRegionSelect(region)}
                      className={`w-full px-3 py-2 text-left text-xs font-mono rounded transition-all ${
                        selectedRegion?.id === region.id
                          ? 'bg-cyan-900/30 border border-cyan-700/50 text-cyan-300'
                          : 'bg-slate-800/50 border border-slate-700/50 text-slate-300 hover:bg-slate-700/50'
                      }`}
                    >
                      <div className="font-semibold">{region.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        {region.country}
                      </div>
                    </button>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Buffer Control */}
          {selectedRegion && onBufferChange && (
            <div>
              <label className="block font-mono text-xs text-slate-500 uppercase mb-1">
                Buffer Zone: {bufferValue} nm
              </label>
              <input
                type="range"
                min="0"
                max="50"
                step="1"
                value={bufferValue}
                onChange={(e) => onBufferChange(Number(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
                <span>0 nm</span>
                <span>50 nm</span>
              </div>
            </div>
          )}

          {/* Info */}
          <div className="text-xs text-slate-500 font-mono pt-2 border-t border-slate-800">
            Monitor vessels near protected zones and detect dark zones
          </div>
        </div>
      )}
    </div>
  );
}
