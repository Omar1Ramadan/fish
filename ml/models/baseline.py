#!/usr/bin/env python3
"""
Physics-based baseline model for vessel position prediction
Simple dead reckoning with uncertainty
"""

import numpy as np
from typing import Dict, Tuple, Optional
import math


class DeadReckoningBaseline:
    """
    Simple dead reckoning baseline model
    Extrapolates vessel position based on last known speed and course
    """
    
    def __init__(self, uncertainty_factor: float = 0.1):
        """
        Initialize baseline model
        
        Args:
            uncertainty_factor: Factor to multiply time gap for uncertainty (default: 0.1)
                                Higher = more uncertainty over time
        """
        self.uncertainty_factor = uncertainty_factor
    
    def predict(
        self,
        last_position: Tuple[float, float],  # (lat, lon)
        last_speed: float,  # knots
        last_course: float,  # degrees
        time_gap_hours: float,
    ) -> Dict:
        """
        Predict vessel position after time gap
        
        Args:
            last_position: Last known position (lat, lon)
            last_speed: Last known speed (knots)
            last_course: Last known course (degrees)
            time_gap_hours: Time gap in hours
            
        Returns:
            Dict with predicted position and uncertainty
        """
        lat, lon = last_position
        
        # Convert course to radians
        course_rad = math.radians(last_course)
        
        # Calculate distance traveled (nautical miles)
        distance_nm = last_speed * time_gap_hours
        
        # Earth radius in nautical miles
        R = 3440.065
        
        # Calculate new position using great circle navigation
        lat_rad = math.radians(lat)
        lon_rad = math.radians(lon)
        
        # Distance in radians
        distance_rad = distance_nm / R
        
        # Calculate new latitude
        new_lat_rad = math.asin(
            math.sin(lat_rad) * math.cos(distance_rad) +
            math.cos(lat_rad) * math.sin(distance_rad) * math.cos(course_rad)
        )
        
        # Calculate new longitude
        new_lon_rad = lon_rad + math.atan2(
            math.sin(course_rad) * math.sin(distance_rad) * math.cos(lat_rad),
            math.cos(distance_rad) - math.sin(lat_rad) * math.sin(new_lat_rad)
        )
        
        new_lat = math.degrees(new_lat_rad)
        new_lon = math.degrees(new_lon_rad)
        
        # Calculate uncertainty (increases with time gap)
        # Uncertainty in nautical miles
        base_uncertainty = 5.0  # Base uncertainty (nm)
        time_uncertainty = self.uncertainty_factor * time_gap_hours * last_speed
        total_uncertainty_nm = base_uncertainty + time_uncertainty
        
        # Convert uncertainty to degrees (approximate)
        # 1 degree latitude ≈ 60 nautical miles
        uncertainty_lat = total_uncertainty_nm / 60.0
        # Longitude depends on latitude
        uncertainty_lon = total_uncertainty_nm / (60.0 * math.cos(lat_rad))
        
        return {
            'predicted_position': (new_lat, new_lon),
            'uncertainty_nm': total_uncertainty_nm,
            'uncertainty_degrees': (uncertainty_lat, uncertainty_lon),
            'distance_traveled_nm': distance_nm,
            'method': 'dead_reckoning',
        }
    
    def predict_from_sequence(
        self,
        sequence: np.ndarray,
        time_gap_hours: float,
    ) -> Dict:
        """
        Predict from a sequence of positions
        
        Args:
            sequence: Array of shape (sequence_length, num_features)
                     Features: [lat, lon, speed, course, ...]
            time_gap_hours: Time gap in hours
            
        Returns:
            Dict with prediction
        """
        # Use last point in sequence
        last_point = sequence[-1]
        
        lat = last_point[0]
        lon = last_point[1]
        speed = last_point[2] if len(last_point) > 2 else 0.0
        course = last_point[3] if len(last_point) > 3 else 0.0
        
        # If speed is 0, try to estimate from previous points
        if speed == 0.0 and len(sequence) > 1:
            prev_point = sequence[-2]
            prev_lat = prev_point[0]
            prev_lon = prev_point[1]
            
            # Calculate distance and time
            distance = self._haversine_distance(prev_lat, prev_lon, lat, lon)
            time_diff = time_gap_hours  # Use gap duration as time diff
            
            if time_diff > 0:
                speed = distance / time_diff
                course = self._calculate_bearing(prev_lat, prev_lon, lat, lon)
        
        return self.predict(
            (lat, lon),
            speed,
            course,
            time_gap_hours,
        )
    
    def generate_probability_cloud(
        self,
        predicted_position: Tuple[float, float],
        uncertainty_degrees: Tuple[float, float],
        grid_size: int = 50,
        num_std: float = 2.0,
    ) -> np.ndarray:
        """
        Generate probability cloud around predicted position
        
        Args:
            predicted_position: (lat, lon)
            uncertainty_degrees: (uncertainty_lat, uncertainty_lon)
            grid_size: Size of probability grid
            num_std: Number of standard deviations for cloud (default: 2.0)
            
        Returns:
            Probability grid of shape (grid_size, grid_size, 3)
            Each cell: [lat, lon, probability]
        """
        lat, lon = predicted_position
        unc_lat, unc_lon = uncertainty_degrees
        
        # Create grid
        lat_range = unc_lat * num_std * 2
        lon_range = unc_lon * num_std * 2
        
        lat_min = lat - lat_range / 2
        lat_max = lat + lat_range / 2
        lon_min = lon - lon_range / 2
        lon_max = lon + lon_range / 2
        
        lat_grid = np.linspace(lat_min, lat_max, grid_size)
        lon_grid = np.linspace(lon_min, lon_max, grid_size)
        
        # Create meshgrid
        lon_mesh, lat_mesh = np.meshgrid(lon_grid, lat_grid)
        
        # Calculate probabilities (2D Gaussian)
        # Distance from center
        dlat = (lat_mesh - lat) / unc_lat
        dlon = (lon_mesh - lon) / unc_lon
        
        # Gaussian probability
        probability = np.exp(-0.5 * (dlat**2 + dlon**2))
        
        # Normalize
        probability = probability / probability.sum()
        
        # Create output grid: [lat, lon, probability]
        cloud = np.stack([
            lat_mesh,
            lon_mesh,
            probability,
        ], axis=-1)
        
        return cloud
    
    def _haversine_distance(
        self,
        lat1: float,
        lon1: float,
        lat2: float,
        lon2: float,
    ) -> float:
        """Calculate distance between two points (nautical miles)"""
        R = 3440.065  # nautical miles
        
        lat1_rad = math.radians(lat1)
        lat2_rad = math.radians(lat2)
        dlat = math.radians(lat2 - lat1)
        dlon = math.radians(lon2 - lon1)
        
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
        bearing = (bearing + 360) % 360
        
        return bearing


def main():
    """Example usage"""
    model = DeadReckoningBaseline()
    
    # Predict position after 6 hours
    prediction = model.predict(
        last_position=(-0.5, -90.5),
        last_speed=10.0,  # 10 knots
        last_course=45.0,  # 45 degrees
        time_gap_hours=6.0,
    )
    
    print("Prediction:", prediction)
    
    # Generate probability cloud
    cloud = model.generate_probability_cloud(
        prediction['predicted_position'],
        prediction['uncertainty_degrees'],
    )
    
    print(f"Probability cloud shape: {cloud.shape}")
    print(f"Total probability: {cloud[:, :, 2].sum()}")


if __name__ == "__main__":
    main()
