#!/usr/bin/env python3
"""
Extract features from vessel track sequences
Essential features only: position, movement, temporal, spatial
"""

import numpy as np
from typing import List, Dict, Optional
import math


class FeatureExtractor:
    """Extract features from vessel track sequences"""
    
    def __init__(self, include_derived: bool = True):
        """
        Initialize feature extractor
        
        Args:
            include_derived: Whether to include derived features (velocity, acceleration, etc.)
        """
        self.include_derived = include_derived
    
    def extract_from_sequence(
        self,
        sequence: List[Dict],
        distance_to_eez: Optional[float] = None,
    ) -> np.ndarray:
        """
        Extract features from a sequence of position points
        
        Args:
            sequence: List of dicts with lat, lon, speed, course, timestamp
            distance_to_eez: Optional distance to EEZ boundary (nautical miles)
            
        Returns:
            Feature array of shape (sequence_length, num_features)
        """
        features = []
        
        for i, point in enumerate(sequence):
            feature_vector = []
            
            # Core features
            lat = point.get('lat', 0.0)
            lon = point.get('lon', 0.0)
            speed = point.get('speed', 0.0)  # knots
            course = point.get('course', 0.0)  # degrees
            timestamp = point.get('timestamp', 0.0)
            
            # Position features
            feature_vector.extend([lat, lon])
            
            # Movement features
            feature_vector.extend([speed, course])
            
            # Temporal features
            if i > 0:
                prev_timestamp = sequence[i-1].get('timestamp', timestamp)
                time_diff = timestamp - prev_timestamp if timestamp > 0 else 0.0
                # Convert to hours
                time_diff_hours = time_diff / 3600.0 if time_diff > 0 else 0.0
            else:
                time_diff_hours = 0.0
            
            # Hour of day (0-23) - extract from timestamp if available
            hour_of_day = 0.0
            if timestamp > 0:
                try:
                    from datetime import datetime
                    dt = datetime.fromtimestamp(timestamp)
                    hour_of_day = dt.hour
                except:
                    pass
            
            feature_vector.extend([time_diff_hours, hour_of_day])
            
            # Derived features (if enabled)
            if self.include_derived and i > 0:
                prev_lat = sequence[i-1].get('lat', lat)
                prev_lon = sequence[i-1].get('lon', lon)
                prev_speed = sequence[i-1].get('speed', speed)
                prev_course = sequence[i-1].get('course', course)
                
                # Spatial features
                distance = self._haversine_distance(prev_lat, prev_lon, lat, lon)
                bearing = self._calculate_bearing(prev_lat, prev_lon, lat, lon)
                
                # Velocity features (nautical miles per hour)
                if time_diff_hours > 0:
                    velocity_lat = (lat - prev_lat) / time_diff_hours
                    velocity_lon = (lon - prev_lon) / time_diff_hours
                else:
                    velocity_lat = 0.0
                    velocity_lon = 0.0
                
                # Acceleration (knots per hour)
                acceleration = (speed - prev_speed) / time_diff_hours if time_diff_hours > 0 else 0.0
                
                # Turn rate (degrees per hour)
                course_diff = self._angle_difference(prev_course, course)
                turn_rate = course_diff / time_diff_hours if time_diff_hours > 0 else 0.0
                
                feature_vector.extend([
                    distance,
                    bearing,
                    velocity_lat,
                    velocity_lon,
                    acceleration,
                    turn_rate,
                ])
            else:
                # Pad with zeros if derived features disabled
                feature_vector.extend([0.0] * 6)
            
            # Spatial context (distance to EEZ)
            if distance_to_eez is not None:
                feature_vector.append(distance_to_eez)
            else:
                feature_vector.append(0.0)
            
            features.append(feature_vector)
        
        return np.array(features, dtype=np.float32)
    
    def extract_batch(
        self,
        sequences: List[List[Dict]],
        distances_to_eez: Optional[List[float]] = None,
    ) -> np.ndarray:
        """
        Extract features from multiple sequences
        
        Args:
            sequences: List of sequences (each is a list of position dicts)
            distances_to_eez: Optional list of distances to EEZ for each sequence
            
        Returns:
            Feature array of shape (num_sequences, sequence_length, num_features)
        """
        if distances_to_eez is None:
            distances_to_eez = [None] * len(sequences)
        
        feature_arrays = []
        for seq, dist in zip(sequences, distances_to_eez):
            features = self.extract_from_sequence(seq, dist)
            feature_arrays.append(features)
        
        return np.array(feature_arrays, dtype=np.float32)
    
    def _haversine_distance(
        self,
        lat1: float,
        lon1: float,
        lat2: float,
        lon2: float,
    ) -> float:
        """Calculate distance between two points (nautical miles)"""
        # Earth radius in nautical miles
        R = 3440.065  # nautical miles
        
        # Convert to radians
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        
        # Haversine formula
        a = (math.sin(dlat / 2) ** 2 +
             math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlon / 2) ** 2)
        c = 2 * math.asin(math.sqrt(a))
        distance = R * c
        
        return distance
    
    def _calculate_bearing(
        self,
        lat1: float,
        lon1: float,
        lat2: float,
        lon2: float,
    ) -> float:
        """Calculate bearing from point 1 to point 2 (degrees)"""
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        dlon = math.radians(lon2 - lon1)
        
        y = math.sin(dlon) * math.cos(lat2_rad)
        x = (math.cos(lat1_rad) * math.sin(lat2_rad) -
             math.sin(lat1_rad) * math.cos(lat2_rad) * math.cos(dlon))
        
        bearing = math.atan2(y, x)
        bearing = math.degrees(bearing)
        bearing = (bearing + 360) % 360  # Normalize to 0-360
        
        return bearing
    
    def _angle_difference(self, angle1: float, angle2: float) -> float:
        """Calculate smallest difference between two angles (degrees)"""
        diff = angle2 - angle1
        while diff > 180:
            diff -= 360
        while diff < -180:
            diff += 360
        return diff
    
    def get_feature_names(self) -> List[str]:
        """Get list of feature names"""
        base_features = [
            'lat', 'lon', 'speed', 'course',
            'time_diff_hours', 'hour_of_day',
        ]
        
        if self.include_derived:
            derived_features = [
                'distance', 'bearing',
                'velocity_lat', 'velocity_lon',
                'acceleration', 'turn_rate',
            ]
        else:
            derived_features = []
        
        context_features = ['distance_to_eez']
        
        return base_features + derived_features + context_features


def main():
    """Example usage"""
    # Create sample sequence
    sequence = [
        {'lat': -0.5, 'lon': -90.5, 'speed': 10.0, 'course': 45.0, 'timestamp': 1000.0},
        {'lat': -0.4, 'lon': -90.4, 'speed': 11.0, 'course': 46.0, 'timestamp': 1100.0},
        {'lat': -0.3, 'lon': -90.3, 'speed': 12.0, 'course': 47.0, 'timestamp': 1200.0},
    ]
    
    extractor = FeatureExtractor()
    features = extractor.extract_from_sequence(sequence, distance_to_eez=5.0)
    
    print(f"Feature shape: {features.shape}")
    print(f"Feature names: {extractor.get_feature_names()}")
    print(f"\nFeatures:\n{features}")


if __name__ == "__main__":
    main()
