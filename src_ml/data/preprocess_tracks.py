#!/usr/bin/env python3
"""
Preprocess vessel tracks into ML-ready format
Converts raw AIS data to sequences for training
"""

import json
from typing import Dict, List, Optional
from pathlib import Path
import numpy as np


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
        track_data: Optional[List[Dict]] = None,
    ) -> Dict:
        """
        Preprocess a single gap event into ML-ready format
        
        Args:
            gap_event: Gap event from detect_gaps
            track_data: Optional full track data (if available)
            
        Returns:
            Preprocessed sequence ready for ML
        """
        last_seen = gap_event['last_seen']
        points_before = gap_event.get('points_before_gap', 0)
        
        # Build sequence from last N points before gap
        sequence = []
        
        if track_data:
            # Use provided track data
            # Get last N points before gap
            start_idx = max(0, points_before - self.sequence_length)
            for i in range(start_idx, points_before):
                if i < len(track_data):
                    point = track_data[i]
                    sequence.append({
                        'lat': point.get('lat'),
                        'lon': point.get('lon'),
                        'speed': point.get('speed', 0.0),
                        'course': point.get('course', 0.0),
                        'timestamp': point.get('timestamp', 0.0),
                    })
        else:
            # Use only the last_seen point (minimal data)
            # Pad with same point if needed
            for _ in range(self.sequence_length):
                sequence.append({
                    'lat': last_seen.get('lat'),
                    'lon': last_seen.get('lon'),
                    'speed': last_seen.get('speed', 0.0),
                    'course': last_seen.get('course', 0.0),
                    'timestamp': last_seen.get('timestamp', 0.0),
                })
        
        # Pad or truncate to exact sequence length
        if len(sequence) < self.sequence_length:
            # Pad with last point
            last_point = sequence[-1] if sequence else {
                'lat': last_seen.get('lat'),
                'lon': last_seen.get('lon'),
                'speed': 0.0,
                'course': 0.0,
                'timestamp': 0.0,
            }
            while len(sequence) < self.sequence_length:
                sequence.insert(0, last_point.copy())
        elif len(sequence) > self.sequence_length:
            # Truncate to last N points
            sequence = sequence[-self.sequence_length:]
        
        # Build output structure
        preprocessed = {
            'vessel_id': gap_event['vessel_id'],
            'sequence': sequence,
            'gap_info': {
                'last_position': gap_event['last_position'],
                'next_position': gap_event.get('next_position'),  # Known target (if available)
                'gap_duration_hours': gap_event['gap_duration_hours'],
                'gap_start_time': gap_event['gap_start_time'],
                'gap_end_time': gap_event['gap_end_time'],
            },
            'metadata': {
                'sequence_length': len(sequence),
                'has_target': gap_event.get('next_position') is not None,
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
        with open(gaps_file, 'r') as f:
            gaps = json.load(f)
        
        # Load tracks if available
        track_data_map = {}
        if tracks_file and Path(tracks_file).exists():
            with open(tracks_file, 'r') as f:
                tracks_data = json.load(f)
                # Build map of vessel_id -> track data
                # (Structure depends on GFW API format)
                for entry in tracks_data.get('entries', []):
                    dataset_key = list(entry.keys())[0] if entry else None
                    if dataset_key:
                        for vessel in entry[dataset_key]:
                            vessel_id = vessel.get('vesselId') or vessel.get('mmsi')
                            if vessel_id:
                                track_data_map[str(vessel_id)] = vessel
        
        # Preprocess each gap
        preprocessed = []
        for gap in gaps:
            vessel_id = gap['vessel_id']
            track_data = track_data_map.get(vessel_id)
            
            # Extract positions from track if available
            positions = None
            if track_data:
                # Extract positions (similar to detect_gaps logic)
                positions = self._extract_positions_from_vessel(track_data)
            
            preprocessed_event = self.preprocess_gap_event(gap, positions)
            preprocessed.append(preprocessed_event)
        
        print(f"✅ Preprocessed {len(preprocessed)} gap events")
        
        # Save if output file specified
        if output_file:
            output_path = Path(output_file)
            output_path.parent.mkdir(parents=True, exist_ok=True)
            
            with open(output_path, 'w') as f:
                json.dump(preprocessed, f, indent=2)
            print(f"✅ Saved preprocessed data to {output_file}")
        
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
    ) -> np.ndarray:
        """
        Convert preprocessed data to NumPy format for ML
        
        Args:
            preprocessed_data: List of preprocessed sequences
            output_file: Optional path to save .npz file
            
        Returns:
            NumPy array of shape (num_samples, sequence_length, num_features)
        """
        sequences = []
        
        for item in preprocessed_data:
            sequence = item['sequence']
            # Extract features: [lat, lon, speed, course, timestamp]
            features = []
            for point in sequence:
                features.append([
                    point.get('lat', 0.0),
                    point.get('lon', 0.0),
                    point.get('speed', 0.0),
                    point.get('course', 0.0),
                    point.get('timestamp', 0.0),
                ])
            sequences.append(features)
        
        # Convert to numpy array
        array = np.array(sequences, dtype=np.float32)
        print(f"✅ Converted to numpy array: shape {array.shape}")
        
        # Save if output file specified
        if output_file:
            np.savez_compressed(output_file, sequences=array)
            print(f"✅ Saved numpy array to {output_file}")
        
        return array


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
        preprocessor.convert_to_numpy(preprocessed, args.numpy_output)


if __name__ == "__main__":
    main()
