#!/usr/bin/env python3
"""
Detect AIS gaps (dark zone events) in vessel tracks
Simple gap detection - no complex labeling
"""

import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
from pathlib import Path
import pandas as pd


class AISGapDetector:
    """Detect when vessels go dark (AIS gaps)"""
    
    def __init__(self, gap_threshold_hours: float = 6.0):
        """
        Initialize gap detector
        
        Args:
            gap_threshold_hours: Minimum gap duration to consider (default: 6 hours)
        """
        self.gap_threshold_hours = gap_threshold_hours
    
    def detect_gaps_in_track(
        self,
        vessel_id: str,
        positions: List[Dict],
        min_points_before: int = 5,
    ) -> List[Dict]:
        """
        Detect gaps in a single vessel track
        
        Args:
            vessel_id: Vessel identifier
            positions: List of position dicts with 'timestamp' field
            min_points_before: Minimum points before gap to consider it valid
            
        Returns:
            List of gap events
        """
        if len(positions) < 2:
            return []
        
        # Sort by timestamp
        positions = sorted(positions, key=lambda x: x.get('timestamp', 0))
        
        gaps = []
        for i in range(len(positions) - 1):
            current_time = self._parse_timestamp(positions[i]['timestamp'])
            next_time = self._parse_timestamp(positions[i + 1]['timestamp'])
            
            if current_time and next_time:
                gap_duration = (next_time - current_time).total_seconds() / 3600  # hours
                
                if gap_duration >= self.gap_threshold_hours:
                    # Check if we have enough points before the gap
                    if i >= min_points_before:
                        gap_event = {
                            'vessel_id': vessel_id,
                            'last_seen': positions[i],
                            'next_seen': positions[i + 1],
                            'gap_start_time': current_time.isoformat(),
                            'gap_end_time': next_time.isoformat(),
                            'gap_duration_hours': gap_duration,
                            'last_position': {
                                'lat': positions[i].get('lat'),
                                'lon': positions[i].get('lon'),
                            },
                            'next_position': {
                                'lat': positions[i + 1].get('lat'),
                                'lon': positions[i + 1].get('lon'),
                            },
                            'points_before_gap': i + 1,
                        }
                        gaps.append(gap_event)
        
        return gaps
    
    def detect_gaps_from_json(
        self,
        json_file: str,
        output_file: Optional[str] = None,
    ) -> List[Dict]:
        """
        Detect gaps from GFW API JSON response
        
        Args:
            json_file: Path to JSON file from fetch_vessel_tracks
            output_file: Optional path to save gap events
            
        Returns:
            List of gap events
        """
        with open(json_file, 'r') as f:
            data = json.load(f)
        
        all_gaps = []
        
        # Parse GFW API response structure
        entries = data.get('entries', [])
        if not entries:
            print("⚠️ No entries found in data")
            return []
        
        # GFW API structure: entries[0][dataset_name] = list of vessels
        dataset_key = list(entries[0].keys())[0] if entries else None
        if not dataset_key:
            print("⚠️ Could not find dataset key in response")
            return []
        
        vessels = entries[0][dataset_key]
        print(f"Processing {len(vessels)} vessels...")
        
        for vessel in vessels:
            vessel_id = vessel.get('vesselId') or vessel.get('mmsi') or vessel.get('id')
            if not vessel_id:
                continue
            
            # Extract positions from vessel data
            # GFW API might have different structures, adapt as needed
            positions = self._extract_positions(vessel)
            
            if len(positions) < 2:
                continue
            
            gaps = self.detect_gaps_in_track(str(vessel_id), positions)
            all_gaps.extend(gaps)
        
        print(f"✅ Detected {len(all_gaps)} gap events")
        
        # Save if output file specified
        if output_file:
            output_path = Path(output_file)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(output_path, 'w') as f:
                json.dump(all_gaps, f, indent=2)
            print(f"✅ Saved gaps to {output_file}")
        
        return all_gaps
    
    def _extract_positions(self, vessel: Dict) -> List[Dict]:
        """
        Extract position data from vessel object
        Adapts to different GFW API response formats
        """
        positions = []
        
        # Try different possible structures
        if 'positions' in vessel:
            # If positions are in a nested array
            for pos in vessel['positions']:
                positions.append({
                    'lat': pos.get('lat'),
                    'lon': pos.get('lon'),
                    'timestamp': pos.get('timestamp') or pos.get('time'),
                    'speed': pos.get('speed'),
                    'course': pos.get('course'),
                })
        elif 'lat' in vessel and 'lon' in vessel:
            # Single position (from aggregated data)
            positions.append({
                'lat': vessel.get('lat'),
                'lon': vessel.get('lon'),
                'timestamp': vessel.get('timestamp') or vessel.get('entryTimestamp') or vessel.get('time'),
                'speed': vessel.get('speed'),
                'course': vessel.get('course'),
            })
        elif 'entries' in vessel:
            # Nested entries structure
            for entry in vessel['entries']:
                if 'lat' in entry and 'lon' in entry:
                    positions.append({
                        'lat': entry.get('lat'),
                        'lon': entry.get('lon'),
                        'timestamp': entry.get('timestamp') or entry.get('time'),
                        'speed': entry.get('speed'),
                        'course': entry.get('course'),
                    })
        
        return positions
    
    def _parse_timestamp(self, timestamp) -> Optional[datetime]:
        """Parse timestamp from various formats"""
        if timestamp is None:
            return None
        
        if isinstance(timestamp, (int, float)):
            # Unix timestamp
            try:
                return datetime.fromtimestamp(timestamp)
            except (ValueError, OSError):
                return None
        
        if isinstance(timestamp, str):
            # ISO format or other string formats
            try:
                # Try ISO format first
                return datetime.fromisoformat(timestamp.replace('Z', '+00:00'))
            except ValueError:
                try:
                    # Try common formats
                    for fmt in ['%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S', '%Y-%m-%d']:
                        try:
                            return datetime.strptime(timestamp, fmt)
                        except ValueError:
                            continue
                except:
                    pass
        
        return None
    
    def filter_gaps_by_duration(
        self,
        gaps: List[Dict],
        min_hours: Optional[float] = None,
        max_hours: Optional[float] = None,
    ) -> List[Dict]:
        """
        Filter gaps by duration
        
        Args:
            gaps: List of gap events
            min_hours: Minimum gap duration (hours)
            max_hours: Maximum gap duration (hours)
            
        Returns:
            Filtered list of gaps
        """
        filtered = []
        for gap in gaps:
            duration = gap.get('gap_duration_hours', 0)
            
            if min_hours and duration < min_hours:
                continue
            if max_hours and duration > max_hours:
                continue
            
            filtered.append(gap)
        
        return filtered


def main():
    """Example usage"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Detect AIS gaps in vessel tracks")
    parser.add_argument("input_file", help="Input JSON file from fetch_vessel_tracks")
    parser.add_argument("--output", help="Output JSON file for gaps")
    parser.add_argument("--threshold", type=float, default=6.0, help="Gap threshold (hours)")
    parser.add_argument("--min-hours", type=float, help="Minimum gap duration (hours)")
    parser.add_argument("--max-hours", type=float, help="Maximum gap duration (hours)")
    args = parser.parse_args()
    
    detector = AISGapDetector(gap_threshold_hours=args.threshold)
    gaps = detector.detect_gaps_from_json(args.input_file, args.output)
    
    if args.min_hours or args.max_hours:
        gaps = detector.filter_gaps_by_duration(gaps, args.min_hours, args.max_hours)
        print(f"✅ Filtered to {len(gaps)} gaps")
    
    print(f"\nGap statistics:")
    if gaps:
        durations = [g['gap_duration_hours'] for g in gaps]
        print(f"  Total gaps: {len(gaps)}")
        print(f"  Avg duration: {sum(durations)/len(durations):.1f} hours")
        print(f"  Min duration: {min(durations):.1f} hours")
        print(f"  Max duration: {max(durations):.1f} hours")


if __name__ == "__main__":
    main()
