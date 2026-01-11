'use client';

import { useState, useEffect, useMemo } from 'react';

interface EEZRegion {
  id: string;
  name: string;
  country: string;
  dataset: string;
  group: string;
}

interface EEZSelectorProps {
  selectedRegion: EEZRegion | null;
  onRegionSelect: (region: EEZRegion | null) => void;
  onBufferChange?: (buffer: number) => void;
  bufferValue?: number;
}

// Group icons for visual identification
const GROUP_ICONS: Record<string, string> = {
  'South America': '🌎',
  'Central America': '🌎',
  'North America': '🌎',
  'East Asia': '🌏',
  'Southeast Asia': '🌏',
  'South Asia': '🌏',
  'Oceania': '🌏',
  'West Africa': '🌍',
  'East Africa': '🌍',
  'Europe': '🌍',
  'Mediterranean': '🌊',
  'Middle East': '🏜️',
  'Russia': '❄️',
  'MPAs': '🛡️',
};

// Priority groups shown first (IUU hotspots)
const PRIORITY_GROUPS = ['South America', 'East Asia', 'West Africa', 'Oceania', 'MPAs'];

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
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(['South America']));

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

  // Filter regions based on search and group
  const filteredRegions = useMemo(() => {
    let filtered = regions;
    
    if (searchTerm) {
      filtered = filtered.filter(
        (r) =>
          r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.country.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (selectedGroup) {
      filtered = filtered.filter((r) => r.group === selectedGroup);
    }
    
    return filtered;
  }, [regions, searchTerm, selectedGroup]);

  // Group regions by geographic area
  const groupedRegions = useMemo(() => {
    const grouped: Record<string, EEZRegion[]> = {};
    
    filteredRegions.forEach((region) => {
      if (!grouped[region.group]) {
        grouped[region.group] = [];
      }
      grouped[region.group].push(region);
    });
    
    // Sort groups with priority groups first
    const sortedGroups = Object.keys(grouped).sort((a, b) => {
      const aIndex = PRIORITY_GROUPS.indexOf(a);
      const bIndex = PRIORITY_GROUPS.indexOf(b);
      if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
      if (aIndex !== -1) return -1;
      if (bIndex !== -1) return 1;
      return a.localeCompare(b);
    });
    
    return { grouped, sortedGroups };
  }, [filteredRegions]);

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
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
          <span className="text-xs text-slate-500 font-mono">
            ({regions.length} zones)
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
          <div className="flex items-center gap-2">
            <span>{GROUP_ICONS[selectedRegion.group] || '🌐'}</span>
            <div>
              <div className="font-mono text-sm text-white">
                {selectedRegion.name}
              </div>
              <div className="font-mono text-xs text-slate-500">
                {selectedRegion.country} • {selectedRegion.group}
              </div>
            </div>
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

          {/* Group Filter Pills */}
          <div>
            <div className="font-mono text-xs text-slate-500 uppercase mb-2">
              Filter by Region
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setSelectedGroup(null)}
                className={`px-2 py-1 text-[10px] font-mono rounded transition-all ${
                  !selectedGroup
                    ? 'bg-cyan-900/50 text-cyan-300 border border-cyan-700/50'
                    : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:bg-slate-700/50'
                }`}
              >
                All
              </button>
              {PRIORITY_GROUPS.map((group) => (
                <button
                  key={group}
                  onClick={() => setSelectedGroup(selectedGroup === group ? null : group)}
                  className={`px-2 py-1 text-[10px] font-mono rounded transition-all ${
                    selectedGroup === group
                      ? 'bg-cyan-900/50 text-cyan-300 border border-cyan-700/50'
                      : 'bg-slate-800/50 text-slate-400 border border-slate-700/50 hover:bg-slate-700/50'
                  }`}
                >
                  {GROUP_ICONS[group]} {group}
                </button>
              ))}
            </div>
          </div>

          {/* Region List */}
          <div>
            <div className="font-mono text-xs text-slate-500 uppercase mb-2">
              Protected Zones ({filteredRegions.length})
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1 custom-scrollbar">
              {isLoading ? (
                <div className="text-xs text-slate-500 font-mono py-4 text-center">
                  <div className="w-4 h-4 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  Loading regions...
                </div>
              ) : filteredRegions.length === 0 ? (
                <div className="text-xs text-slate-500 font-mono py-4 text-center">
                  No regions found
                </div>
              ) : searchTerm ? (
                // Flat list when searching
                <>
                  <button
                    onClick={() => onRegionSelect(null)}
                    className={`w-full px-3 py-2 text-left text-xs font-mono rounded transition-all ${
                      !selectedRegion
                        ? 'bg-cyan-900/30 border border-cyan-700/50 text-cyan-300'
                        : 'bg-slate-800/50 border border-slate-700/50 text-slate-300 hover:bg-slate-700/50'
                    }`}
                  >
                    🌐 None (Show All)
                  </button>
                  {filteredRegions.map((region) => (
                    <button
                      key={`${region.id}-${region.name}`}
                      onClick={() => onRegionSelect(region)}
                      className={`w-full px-3 py-2 text-left text-xs font-mono rounded transition-all ${
                        selectedRegion?.id === region.id && selectedRegion?.name === region.name
                          ? 'bg-cyan-900/30 border border-cyan-700/50 text-cyan-300'
                          : 'bg-slate-800/50 border border-slate-700/50 text-slate-300 hover:bg-slate-700/50'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span>{GROUP_ICONS[region.group] || '🌐'}</span>
                        <div>
                          <div className="font-semibold">{region.name}</div>
                          <div className="text-[10px] text-slate-500">
                            {region.country} • {region.group}
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </>
              ) : (
                // Grouped list
                <>
                  <button
                    onClick={() => onRegionSelect(null)}
                    className={`w-full px-3 py-2 text-left text-xs font-mono rounded transition-all ${
                      !selectedRegion
                        ? 'bg-cyan-900/30 border border-cyan-700/50 text-cyan-300'
                        : 'bg-slate-800/50 border border-slate-700/50 text-slate-300 hover:bg-slate-700/50'
                    }`}
                  >
                    🌐 None (Show All)
                  </button>
                  
                  {groupedRegions.sortedGroups.map((group) => (
                    <div key={group} className="mt-2">
                      {/* Group Header */}
                      <button
                        onClick={() => toggleGroup(group)}
                        className="w-full px-2 py-1.5 flex items-center justify-between bg-slate-800/30 rounded text-xs font-mono text-slate-400 hover:bg-slate-800/50 transition-colors"
                      >
                        <span className="flex items-center gap-2">
                          {GROUP_ICONS[group] || '🌐'}
                          <span className="font-semibold">{group}</span>
                          <span className="text-slate-600">({groupedRegions.grouped[group].length})</span>
                        </span>
                        <svg
                          className={`w-3 h-3 transition-transform ${expandedGroups.has(group) ? 'rotate-180' : ''}`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                      
                      {/* Group Items */}
                      {expandedGroups.has(group) && (
                        <div className="mt-1 ml-2 space-y-1">
                          {groupedRegions.grouped[group].map((region) => (
                            <button
                              key={`${region.id}-${region.name}`}
                              onClick={() => onRegionSelect(region)}
                              className={`w-full px-3 py-1.5 text-left text-xs font-mono rounded transition-all ${
                                selectedRegion?.id === region.id && selectedRegion?.name === region.name
                                  ? 'bg-cyan-900/30 border border-cyan-700/50 text-cyan-300'
                                  : 'bg-slate-900/30 border border-slate-800/50 text-slate-400 hover:bg-slate-800/50'
                              }`}
                            >
                              <div className="font-medium">{region.name}</div>
                              <div className="text-[10px] text-slate-600">{region.country}</div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Buffer Control */}
          {selectedRegion && onBufferChange && (
            <div className="pt-3 border-t border-slate-800">
              <label className="block font-mono text-xs text-slate-500 uppercase mb-1">
                Buffer Zone: <span className="text-cyan-400">{bufferValue} nm</span>
              </label>
              <input
                type="range"
                min="0"
                max="200"
                step="10"
                value={bufferValue}
                onChange={(e) => onBufferChange(Number(e.target.value))}
                className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
              <div className="flex justify-between text-[10px] text-slate-600 font-mono mt-1">
                <span>0 nm</span>
                <span>100 nm</span>
                <span>200 nm</span>
              </div>
            </div>
          )}

          {/* Info */}
          <div className="text-xs text-slate-500 font-mono pt-2 border-t border-slate-800">
            <span className="text-cyan-400">💡</span> Data from{' '}
            <a 
              href="https://www.marineregions.org/eezsearch.php" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-cyan-400 hover:underline"
            >
              Marine Regions
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
