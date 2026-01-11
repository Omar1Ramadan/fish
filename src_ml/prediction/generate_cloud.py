#!/usr/bin/env python3
"""
Generate probability cloud from model predictions
Converts predictions to spatial probability distribution
"""

import numpy as np
import json
from typing import Dict, Tuple, Optional
from pathlib import Path


class ProbabilityCloudGenerator:
    """Generate probability clouds from predictions"""
    
    def __init__(self, grid_size: int = 50, num_std: float = 2.0):
        """
        Initialize generator
        
        Args:
            grid_size: Size of probability grid (grid_size x grid_size)
            num_std: Number of standard deviations for cloud extent
        """
        self.grid_size = grid_size
        self.num_std = num_std
    
    def generate_from_prediction(
        self,
        predicted_position: Tuple[float, float],
        uncertainty_degrees: Tuple[float, float],
    ) -> Dict:
        """
        Generate probability cloud from single prediction
        
        Args:
            predicted_position: (lat, lon)
            uncertainty_degrees: (uncertainty_lat, uncertainty_lon)
            
        Returns:
            GeoJSON FeatureCollection with probability grid
        """
        lat, lon = predicted_position
        unc_lat, unc_lon = uncertainty_degrees
        
        # Create grid bounds
        lat_range = unc_lat * self.num_std * 2
        lon_range = unc_lon * self.num_std * 2
        
        lat_min = lat - lat_range / 2
        lat_max = lat + lat_range / 2
        lon_min = lon - lon_range / 2
        lon_max = lon + lon_range / 2
        
        # Generate grid
        lat_grid = np.linspace(lat_min, lat_max, self.grid_size)
        lon_grid = np.linspace(lon_min, lon_max, self.grid_size)
        
        lon_mesh, lat_mesh = np.meshgrid(lon_grid, lat_grid)
        
        # Calculate probabilities (2D Gaussian)
        dlat = (lat_mesh - lat) / unc_lat
        dlon = (lon_mesh - lon) / unc_lon
        
        probability = np.exp(-0.5 * (dlat**2 + dlon**2))
        
        # Normalize
        probability = probability / probability.sum()
        
        # Convert to GeoJSON
        features = []
        for i in range(self.grid_size):
            for j in range(self.grid_size):
                features.append({
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": [float(lon_mesh[i, j]), float(lat_mesh[i, j])],
                    },
                    "properties": {
                        "probability": float(probability[i, j]),
                    },
                })
        
        return {
            "type": "FeatureCollection",
            "features": features,
            "metadata": {
                "grid_size": self.grid_size,
                "predicted_position": [float(lat), float(lon)],
                "uncertainty_degrees": [float(unc_lat), float(unc_lon)],
            },
        }
    
    def generate_from_model_prediction(
        self,
        model_prediction: Dict,
    ) -> Dict:
        """
        Generate cloud from model prediction dict
        
        Args:
            model_prediction: Dict with 'predicted_position' and 'uncertainty_degrees'
            
        Returns:
            GeoJSON FeatureCollection
        """
        return self.generate_from_prediction(
            tuple(model_prediction['predicted_position']),
            tuple(model_prediction['uncertainty_degrees']),
        )
    
    def save_geojson(
        self,
        cloud: Dict,
        output_file: str,
    ):
        """Save probability cloud as GeoJSON"""
        output_path = Path(output_file)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(output_path, 'w') as f:
            json.dump(cloud, f, indent=2)
        
        print(f"✅ Saved probability cloud to {output_file}")
    
    def create_heatmap_data(
        self,
        cloud: Dict,
        threshold: float = 0.001,
    ) -> np.ndarray:
        """
        Create heatmap data array for visualization
        
        Args:
            cloud: Probability cloud GeoJSON
            threshold: Minimum probability to include
            
        Returns:
            Array of shape (N, 3) -> [lat, lon, probability]
        """
        data = []
        for feature in cloud['features']:
            prob = feature['properties']['probability']
            if prob >= threshold:
                coords = feature['geometry']['coordinates']
                data.append([coords[1], coords[0], prob])  # [lat, lon, prob]
        
        return np.array(data)


def main():
    """Example usage"""
    generator = ProbabilityCloudGenerator(grid_size=50, num_std=2.0)
    
    # Generate cloud
    cloud = generator.generate_from_prediction(
        predicted_position=(-0.5, -90.5),
        uncertainty_degrees=(0.1, 0.1),
    )
    
    print(f"Generated cloud with {len(cloud['features'])} points")
    
    # Save
    generator.save_geojson(cloud, "data/predictions/probability_cloud.json")
    
    # Create heatmap data
    heatmap = generator.create_heatmap_data(cloud)
    print(f"Heatmap data shape: {heatmap.shape}")


if __name__ == "__main__":
    main()
