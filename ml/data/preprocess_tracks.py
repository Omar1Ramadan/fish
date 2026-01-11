#!/usr/bin/env python3
"""
Preprocess vessel tracks into ML-ready format
Converts raw AIS data to sequences for training
"""

import json
import math
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from pathlib import Path
import numpy as np


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance between two points in kilometers"""
    R = 6371  # Earth's radius in km
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c


def calculate_bearing(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate bearing (course) from point 1 to point 2 in degrees (0-360)"""
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lon = math.radians(lon2 - lon1)
    
    x = math.sin(delta_lon) * math.cos(lat2_rad)
    y = math.cos(lat1_rad) * math.sin(lat2_rad) - math.sin(lat1_rad) * math.cos(lat2_rad) * math.cos(delta_lon)
    
    bearing = math.atan2(x, y)
    bearing = math.degrees(bearing)
    bearing = (bearing + 360) % 360  # Normalize to 0-360
    
    return bearing


def parse_timestamp(ts: str) -> Optional[datetime]:
    """Parse timestamp string to datetime"""
    if not ts:
        return None
    try:
        # Handle formats like "2024-02-29 07:00" or "2024-02-29T07:00:00"
        ts = ts.replace('T', ' ').replace('Z', '')
        if len(ts) == 16:  # "2024-02-29 07:00"
            return datetime.strptime(ts, "%Y-%m-%d %H:%M")
        elif len(ts) == 19:  # "2024-02-29 07:00:00"
            return datetime.strptime(ts, "%Y-%m-%d %H:%M:%S")
        else:
            return datetime.fromisoformat(ts.split('+')[0])
    except (ValueError, AttributeError):
        return None


class TrackPreprocessor:
    """Convert raw AIS data to ML-ready sequences"""
    
    def __init__(self, sequence_length: int = 20):
        """
        Initialize preprocessor
        
        Args:
            sequence_length: Number of points to include in sequence (default: 20)
        """
        self.sequence_length = sequence_length
    
    def preprocess_gap_event(
        self,
        gap_event: Dict,
        positions: Optional[List[Dict]] = None,
    ) -> Dict:
        """
        Preprocess a single gap event into ML-ready format
        Calculates speed and course from position changes.
        
        Args:
            gap_event: Gap event from detect_gaps
            positions: Full list of vessel positions (sorted by time)
            
        Returns:
            Preprocessed sequence ready for ML
        """
        last_seen = gap_event['last_seen']
        gap_start_time = gap_event.get('gap_start_time', '')
        
        # Build sequence from positions before the gap
        raw_positions = []
        
        if positions and len(positions) > 1:
            # Find positions that occurred before the gap start time
            for pos in positions:
                pos_time = pos.get('timestamp', '')
                if pos_time and pos_time < gap_start_time:
                    raw_positions.append(pos)
            
            # Take the last N+1 positions (need N+1 to calculate N speeds)
            raw_positions = raw_positions[-(self.sequence_length + 1):]
        
        # If we couldn't build enough positions, use last_seen
        if len(raw_positions) < 2:
            raw_positions = [{
                'lat': last_seen.get('lat'),
                'lon': last_seen.get('lon'),
                'timestamp': last_seen.get('timestamp', ''),
            }]
        
        # Calculate speed and course from consecutive positions
        sequence = []
        for i in range(len(raw_positions)):
            pos = raw_positions[i]
            lat = pos.get('lat') or 0.0
            lon = pos.get('lon') or 0.0
            timestamp = pos.get('timestamp', '')
            
            # Calculate speed (km/h) and course from previous point
            speed = 0.0
            course = 0.0
            
            if i > 0:
                prev_pos = raw_positions[i - 1]
                prev_lat = prev_pos.get('lat') or 0.0
                prev_lon = prev_pos.get('lon') or 0.0
                prev_time = prev_pos.get('timestamp', '')
                
                # Calculate distance
                distance_km = haversine_distance(prev_lat, prev_lon, lat, lon)
                
                # Calculate time difference
                t1 = parse_timestamp(prev_time)
                t2 = parse_timestamp(timestamp)
                if t1 and t2 and t2 > t1:
                    hours = (t2 - t1).total_seconds() / 3600
                    if hours > 0:
                        speed = distance_km / hours  # km/h
                        # Convert to knots (1 knot = 1.852 km/h)
                        speed = speed / 1.852
                
                # Calculate bearing/course
                if distance_km > 0.1:  # Only calculate if there's meaningful movement
                    course = calculate_bearing(prev_lat, prev_lon, lat, lon)
            
            sequence.append({
                'lat': lat,
                'lon': lon,
                'speed': round(speed, 2),  # knots
                'course': round(course, 1),  # degrees
                'timestamp': timestamp,
            })
        
        # Remove first point if we have extra (used only for calculating first speed)
        if len(sequence) > self.sequence_length:
            sequence = sequence[-self.sequence_length:]
        
        # Pad to exact sequence length (pad at beginning with first point, zero speed)
        while len(sequence) < self.sequence_length:
            first_point = sequence[0].copy()
            first_point['speed'] = 0.0
            first_point['course'] = 0.0
            sequence.insert(0, first_point)
        
        # Build output structure
        preprocessed = {
            'vessel_id': gap_event['vessel_id'],
            'sequence': sequence,
            'gap_info': {
                'last_position': gap_event['last_position'],
                'next_position': gap_event.get('next_position'),  # Known target
                'gap_duration_hours': gap_event['gap_duration_hours'],
                'gap_start_time': gap_event['gap_start_time'],
                'gap_end_time': gap_event['gap_end_time'],
            },
            'metadata': {
                'sequence_length': len(sequence),
                'has_target': gap_event.get('next_position') is not None,
                'unique_positions': len(set((p['lat'], p['lon']) for p in sequence)),
                'avg_speed_knots': round(sum(p['speed'] for p in sequence) / len(sequence), 2) if sequence else 0,
            }
        }
        
        return preprocessed
    
    def preprocess_from_gaps_file(
        self,
        gaps_file: str,
        tracks_file: Optional[str] = None,
        output_file: Optional[str] = None,
    ) -> List[Dict]:
        """
        Preprocess all gap events from a gaps JSON file
        
        Args:
            gaps_file: Path to gaps JSON file
            tracks_file: Optional path to full tracks file (for richer sequences)
            output_file: Optional path to save preprocessed data
            
        Returns:
            List of preprocessed sequences
        """
        # Load gaps
        print(f"📂 Loading gaps from {gaps_file}...")
        with open(gaps_file, 'r') as f:
            gaps = json.load(f)
        print(f"   Found {len(gaps)} gap events")
        
        # Load tracks and build vessel position history
        vessel_positions: Dict[str, List[Dict]] = {}
        if tracks_file and Path(tracks_file).exists():
            print(f"📂 Loading tracks from {tracks_file}...")
            with open(tracks_file, 'r') as f:
                tracks_data = json.load(f)
            
            # GFW API returns flat list of vessel records - group by vessel ID
            for entry in tracks_data.get('entries', []):
                dataset_key = list(entry.keys())[0] if entry else None
                if dataset_key:
                    records = entry[dataset_key]
                    print(f"   Found {len(records)} records in dataset '{dataset_key}'")
                    
                    for record in records:
                        vessel_id = record.get('vesselId') or record.get('mmsi')
                        if not vessel_id:
                            continue
                        
                        vessel_id = str(vessel_id)
                        if vessel_id not in vessel_positions:
                            vessel_positions[vessel_id] = []
                        
                        # Extract position from this record
                        position = {
                            'lat': record.get('lat'),
                            'lon': record.get('lon'),
                            'speed': record.get('speed'),
                            'course': record.get('course'),
                            'timestamp': record.get('date') or record.get('entryTimestamp'),
                        }
                        vessel_positions[vessel_id].append(position)
            
            # Sort each vessel's positions by timestamp
            for vessel_id in vessel_positions:
                vessel_positions[vessel_id].sort(
                    key=lambda x: x.get('timestamp', '') or ''
                )
            
            print(f"   Grouped into {len(vessel_positions)} unique vessels")
            
            # Show some stats
            position_counts = [len(v) for v in vessel_positions.values()]
            if position_counts:
                avg_positions = sum(position_counts) / len(position_counts)
                print(f"   Average positions per vessel: {avg_positions:.1f}")
        
        # Preprocess each gap
        preprocessed = []
        skipped = 0
        for gap in gaps:
            vessel_id = gap['vessel_id']
            positions = vessel_positions.get(vessel_id, [])
            
            if len(positions) < 2:
                skipped += 1
                continue
            
            preprocessed_event = self.preprocess_gap_event(gap, positions)
            preprocessed.append(preprocessed_event)
        
        print(f"✅ Preprocessed {len(preprocessed)} gap events (skipped {skipped} with insufficient data)")
        
        # Save if output file specified
        if output_file:
            output_path = Path(output_file)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(output_path, 'w') as f:
                json.dump(preprocessed, f, indent=2)
            print(f"💾 Saved preprocessed data to {output_file}")
        
        return preprocessed
    
    def _extract_positions_from_vessel(self, vessel: Dict) -> List[Dict]:
        """Extract position data from vessel object (same logic as detect_gaps)"""
        positions = []
        
        if 'positions' in vessel:
            for pos in vessel['positions']:
                positions.append({
                    'lat': pos.get('lat'),
                    'lon': pos.get('lon'),
                    'timestamp': pos.get('timestamp') or pos.get('time'),
                    'speed': pos.get('speed'),
                    'course': pos.get('course'),
                })
        elif 'lat' in vessel and 'lon' in vessel:
            positions.append({
                'lat': vessel.get('lat'),
                'lon': vessel.get('lon'),
                'timestamp': vessel.get('timestamp') or vessel.get('entryTimestamp'),
                'speed': vessel.get('speed'),
                'course': vessel.get('course'),
            })
        
        return positions
    
    def convert_to_numpy(
        self,
        preprocessed_data: List[Dict],
        output_file: Optional[str] = None,
    ) -> tuple:
        """
        Convert preprocessed data to NumPy format for ML
        
        Args:
            preprocessed_data: List of preprocessed sequences
            output_file: Optional path to save .npz file
            
        Returns:
            Tuple of (X sequences, y targets) as numpy arrays
        """
        from datetime import datetime
        
        sequences = []
        targets = []
        
        for item in preprocessed_data:
            sequence = item['sequence']
            gap_info = item.get('gap_info', {})
            
            # Extract features: [lat, lon, speed, course]
            # Skip timestamp for now (strings can't be converted directly)
            features = []
            for point in sequence:
                lat = point.get('lat') or 0.0
                lon = point.get('lon') or 0.0
                speed = point.get('speed') or 0.0
                course = point.get('course') or 0.0
                
                # Ensure all values are floats
                features.append([
                    float(lat) if lat else 0.0,
                    float(lon) if lon else 0.0,
                    float(speed) if speed else 0.0,
                    float(course) if course else 0.0,
                ])
            sequences.append(features)
            
            # Extract target: next_position (where vessel reappeared)
            next_pos = gap_info.get('next_position', {})
            target_lat = next_pos.get('lat') or 0.0
            target_lon = next_pos.get('lon') or 0.0
            targets.append([float(target_lat), float(target_lon)])
        
        # Convert to numpy arrays
        X = np.array(sequences, dtype=np.float32)
        y = np.array(targets, dtype=np.float32)
        
        print(f"✅ Converted to numpy arrays:")
        print(f"   X (sequences): shape {X.shape}")
        print(f"   y (targets):   shape {y.shape}")
        
        # Save if output file specified
        if output_file:
            np.savez_compressed(output_file, X=X, y=y)
            print(f"💾 Saved numpy arrays to {output_file}")
        
        return X, y


def main():
    """Example usage"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Preprocess vessel tracks for ML")
    parser.add_argument("gaps_file", help="Input gaps JSON file")
    parser.add_argument("--tracks-file", help="Optional full tracks file")
    parser.add_argument("--output", help="Output JSON file")
    parser.add_argument("--numpy-output", help="Output .npz file")
    parser.add_argument("--sequence-length", type=int, default=20, help="Sequence length")
    args = parser.parse_args()
    
    preprocessor = TrackPreprocessor(sequence_length=args.sequence_length)
    preprocessed = preprocessor.preprocess_from_gaps_file(
        args.gaps_file,
        args.tracks_file,
        args.output,
    )
    
    if args.numpy_output:
        X, y = preprocessor.convert_to_numpy(preprocessed, args.numpy_output)
        print(f"\n📊 Training data ready:")
        print(f"   {X.shape[0]} samples")
        print(f"   {X.shape[1]} timesteps per sequence")
        print(f"   {X.shape[2]} features (lat, lon, speed, course)")
        print(f"   Target: predict next (lat, lon) position")


if __name__ == "__main__":
    main()
