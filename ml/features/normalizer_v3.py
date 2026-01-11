#!/usr/bin/env python3
"""
Normalizer v3: Clean design - predict velocity (displacement/hour)
NO gap duration as input - just sequence → velocity
"""

import numpy as np
import json
from pathlib import Path
from typing import Dict, Tuple, Optional


class TrajectoryNormalizerV3:
    """
    Simplest correct design:
    - Input: normalized trajectory sequence (relative positions + speed/course)
    - Output: velocity (displacement per hour in degrees)
    - At inference: multiply output by gap_hours to get total displacement
    """
    
    def __init__(self):
        self.stats: Dict = {}
        self.fitted = False
        self.coord_scale = 1.0  # Degrees - we'll use actual velocity magnitude
        self.max_speed = 30.0   # Max speed in knots
        self.velocity_scale = 0.5  # Expected max velocity in degrees/hour (~30 nm/hr = 0.5 deg/hr)
    
    def fit(self, X: np.ndarray, y: np.ndarray, gap_hours: np.ndarray) -> 'TrajectoryNormalizerV3':
        """
        Compute normalization statistics
        
        Args:
            X: Sequences (N, seq_len, 4) [lat, lon, speed, course]
            y: Target positions (N, 2)
            gap_hours: Time gap for each sample (N,)
        """
        print("📊 Computing normalization statistics (v3)...")
        
        # Get reference positions
        last_positions = X[:, -1, :2]
        
        # Compute velocity (displacement per hour)
        displacement = y - last_positions
        gap_safe = np.maximum(gap_hours, 0.1)
        velocity = displacement / gap_safe[:, np.newaxis]  # degrees/hour
        
        # Velocity statistics
        self.stats['velocity_lat_mean'] = float(np.mean(velocity[:, 0]))
        self.stats['velocity_lat_std'] = float(np.std(velocity[:, 0]))
        self.stats['velocity_lon_mean'] = float(np.mean(velocity[:, 1]))
        self.stats['velocity_lon_std'] = float(np.std(velocity[:, 1]))
        
        # Position statistics
        self.stats['lat_mean'] = float(np.mean(X[:, :, 0]))
        self.stats['lat_std'] = float(np.std(X[:, :, 0]))
        self.stats['lon_mean'] = float(np.mean(X[:, :, 1]))
        self.stats['lon_std'] = float(np.std(X[:, :, 1]))
        
        # Speed statistics  
        self.stats['speed_mean'] = float(np.mean(X[:, :, 2]))
        self.stats['speed_std'] = float(np.std(X[:, :, 2]))
        
        # Velocity scale from data
        velocity_mag = np.sqrt(velocity[:, 0]**2 + velocity[:, 1]**2)
        self.velocity_scale = float(np.percentile(velocity_mag, 95))  # 95th percentile
        
        self.fitted = True
        
        print(f"   Velocity: lat [{self.stats['velocity_lat_mean']:.4f} ± {self.stats['velocity_lat_std']:.4f}] °/hr")
        print(f"   Velocity: lon [{self.stats['velocity_lon_mean']:.4f} ± {self.stats['velocity_lon_std']:.4f}] °/hr")
        print(f"   Velocity scale: {self.velocity_scale:.4f} °/hr (95th percentile)")
        
        return self
    
    def transform_X(self, X: np.ndarray) -> np.ndarray:
        """
        Transform input sequences
        Output: 5 features [lat_rel, lon_rel, speed_norm, course_sin, course_cos]
        NO gap duration - that's used post-prediction
        """
        N, seq_len, _ = X.shape
        
        # Reference: last position
        last_lat = X[:, -1, 0:1]
        last_lon = X[:, -1, 1:2]
        
        # Relative positions (normalized by coordinate scale)
        coord_scale = max(self.stats.get('lat_std', 1.0), 1.0)
        lat_rel = (X[:, :, 0:1] - last_lat[:, np.newaxis, :]) / coord_scale
        lon_rel = (X[:, :, 1:2] - last_lon[:, np.newaxis, :]) / coord_scale
        
        # Speed normalized
        speed_norm = X[:, :, 2:3] / self.max_speed
        
        # Course as sin/cos
        course_rad = np.radians(X[:, :, 3:4])
        course_sin = np.sin(course_rad)
        course_cos = np.cos(course_rad)
        
        X_norm = np.concatenate([
            lat_rel, lon_rel, speed_norm, course_sin, course_cos
        ], axis=2)
        
        return X_norm.astype(np.float32)
    
    def transform_y(self, X: np.ndarray, y: np.ndarray, gap_hours: np.ndarray) -> np.ndarray:
        """
        Transform targets to normalized velocity (degrees/hour)
        """
        last_positions = X[:, -1, :2]
        displacement = y - last_positions
        
        gap_safe = np.maximum(gap_hours, 0.1)
        velocity = displacement / gap_safe[:, np.newaxis]
        
        # Normalize velocity
        velocity_norm = velocity / self.velocity_scale
        
        return velocity_norm.astype(np.float32)
    
    def inverse_transform_y(
        self,
        velocity_norm: np.ndarray,
        reference_positions: np.ndarray,
        gap_hours: float,
    ) -> np.ndarray:
        """
        Convert normalized velocity to absolute position
        
        1. Denormalize velocity (degrees/hour)
        2. Multiply by gap_hours to get displacement
        3. Add to reference position
        """
        velocity = velocity_norm * self.velocity_scale  # degrees/hour
        displacement = velocity * gap_hours  # degrees
        return reference_positions + displacement
    
    def save(self, filepath: str):
        Path(filepath).parent.mkdir(parents=True, exist_ok=True)
        with open(filepath, 'w') as f:
            json.dump({
                'version': 3,
                'stats': self.stats,
                'coord_scale': self.coord_scale,
                'max_speed': self.max_speed,
                'velocity_scale': self.velocity_scale,
                'fitted': self.fitted,
            }, f, indent=2)
        print(f"✅ Saved normalizer v3 to {filepath}")
    
    def load(self, filepath: str) -> 'TrajectoryNormalizerV3':
        with open(filepath, 'r') as f:
            data = json.load(f)
        self.stats = data['stats']
        self.coord_scale = data.get('coord_scale', 1.0)
        self.max_speed = data['max_speed']
        self.velocity_scale = data['velocity_scale']
        self.fitted = data['fitted']
        print(f"✅ Loaded normalizer v3 (velocity_scale={self.velocity_scale:.4f})")
        return self


def create_training_data_v3(raw_npz: str, output_dir: str = "data/normalized_v3"):
    """Create training data v3"""
    print("=" * 60)
    print("Creating Training Data v3 (Velocity Prediction)")
    print("=" * 60)
    
    data = np.load(raw_npz)
    X_raw = data['X']
    y_raw = data['y']
    
    print(f"Loaded: X={X_raw.shape}, y={y_raw.shape}")
    
    # Filter
    valid = ~np.any(np.isnan(X_raw), axis=(1, 2))
    valid &= ~np.any(np.isnan(y_raw), axis=1)
    X_raw = X_raw[valid]
    y_raw = y_raw[valid]
    print(f"After filter: {len(X_raw)} samples")
    
    # Estimate gap hours from speed and displacement
    gap_hours = np.ones(len(X_raw))
    for i in range(len(X_raw)):
        last_pos = X_raw[i, -1, :2]
        target_pos = y_raw[i]
        speed = max(X_raw[i, -1, 2], 0.5)  # knots
        
        dist_deg = np.sqrt((target_pos[0] - last_pos[0])**2 + (target_pos[1] - last_pos[1])**2)
        dist_nm = dist_deg * 60
        gap_hours[i] = np.clip(dist_nm / speed, 0.5, 24.0)
    
    print(f"Gap hours: mean={gap_hours.mean():.1f}, std={gap_hours.std():.1f}")
    
    # Fit normalizer
    normalizer = TrajectoryNormalizerV3()
    normalizer.fit(X_raw, y_raw, gap_hours)
    
    # Transform
    X_norm = normalizer.transform_X(X_raw)
    y_norm = normalizer.transform_y(X_raw, y_raw, gap_hours)
    
    print(f"Transformed: X={X_norm.shape} [{X_norm.min():.3f}, {X_norm.max():.3f}]")
    print(f"Transformed: y={y_norm.shape} [{y_norm.min():.3f}, {y_norm.max():.3f}]")
    
    # Save
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    npz_file = output_path / "sequences_v3.npz"
    np.savez_compressed(npz_file, X=X_norm, y=y_norm, X_raw=X_raw, y_raw=y_raw, gap_hours=gap_hours)
    
    normalizer_file = output_path / "normalizer_v3.json"
    normalizer.save(str(normalizer_file))
    
    return str(npz_file), str(normalizer_file)


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python normalizer_v3.py <raw_sequences.npz>")
        sys.exit(1)
    create_training_data_v3(sys.argv[1])
