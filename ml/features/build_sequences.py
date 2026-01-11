#!/usr/bin/env python3
"""
Build fixed-length sequences for ML training
Handles padding and truncation
"""

import numpy as np
from typing import List, Tuple, Optional, Dict
from .extract_features import FeatureExtractor


class SequenceBuilder:
    """Build fixed-length sequences from vessel tracks"""
    
    def __init__(
        self,
        sequence_length: int = 20,
        num_features: Optional[int] = None,
        include_derived_features: bool = True,
    ):
        """
        Initialize sequence builder
        
        Args:
            sequence_length: Target sequence length
            num_features: Number of features (auto-detected if None)
            include_derived_features: Whether to include derived features
        """
        self.sequence_length = sequence_length
        self.feature_extractor = FeatureExtractor(include_derived=include_derived_features)
        self.num_features = num_features or len(self.feature_extractor.get_feature_names())
    
    def build_sequences(
        self,
        preprocessed_data: List[Dict],
        distances_to_eez: Optional[List[float]] = None,
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        """
        Build sequences from preprocessed data
        
        Args:
            preprocessed_data: List of preprocessed gap events
            distances_to_eez: Optional distances to EEZ for each sequence
            
        Returns:
            Tuple of (X, y) where:
            - X: Input sequences (num_samples, sequence_length, num_features)
            - y: Target positions (num_samples, 2) if available, else None
        """
        sequences = []
        targets = []
        
        for i, item in enumerate(preprocessed_data):
            sequence_data = item['sequence']
            distance = distances_to_eez[i] if distances_to_eez else None
            
            # Extract features
            features = self.feature_extractor.extract_from_sequence(
                sequence_data,
                distance_to_eez=distance,
            )
            
            # Pad or truncate to exact length
            features = self._pad_or_truncate(features)
            
            sequences.append(features)
            
            # Extract target if available
            gap_info = item.get('gap_info', {})
            next_position = gap_info.get('next_position')
            if next_position:
                targets.append([
                    next_position.get('lat', 0.0),
                    next_position.get('lon', 0.0),
                ])
            else:
                targets.append([0.0, 0.0])  # Placeholder
        
        X = np.array(sequences, dtype=np.float32)
        y = np.array(targets, dtype=np.float32) if targets else None
        
        # Filter out sequences with invalid targets (all zeros)
        if y is not None:
            valid_mask = np.any(y != 0, axis=1)
            X = X[valid_mask]
            y = y[valid_mask]
            print(f"✅ Built {len(X)} sequences with valid targets")
        else:
            print(f"✅ Built {len(X)} sequences (no targets)")
        
        return X, y
    
    def _pad_or_truncate(self, features: np.ndarray) -> np.ndarray:
        """
        Pad or truncate features to exact sequence length
        
        Args:
            features: Feature array of shape (current_length, num_features)
            
        Returns:
            Padded/truncated array of shape (sequence_length, num_features)
        """
        current_length = features.shape[0]
        
        if current_length == self.sequence_length:
            return features
        
        elif current_length < self.sequence_length:
            # Pad with last row (repeat last position)
            padding_needed = self.sequence_length - current_length
            last_row = features[-1:] if len(features) > 0 else np.zeros((1, features.shape[1]))
            padding = np.repeat(last_row, padding_needed, axis=0)
            return np.vstack([padding, features])
        
        else:
            # Truncate to last N points
            return features[-self.sequence_length:]
    
    def build_from_numpy(
        self,
        numpy_file: str,
        output_file: Optional[str] = None,
    ) -> Tuple[np.ndarray, Optional[np.ndarray]]:
        """
        Build sequences from pre-saved numpy file
        
        Args:
            numpy_file: Path to .npz file from preprocess_tracks
            output_file: Optional path to save processed sequences
            
        Returns:
            Tuple of (X, y)
        """
        data = np.load(numpy_file, allow_pickle=True)
        sequences = data['sequences']
        
        # Ensure correct shape
        if len(sequences.shape) == 2:
            # Reshape if needed
            num_samples = sequences.shape[0]
            features_per_point = sequences.shape[1] // self.sequence_length
            sequences = sequences.reshape(num_samples, self.sequence_length, features_per_point)
        
        # Pad/truncate each sequence
        processed_sequences = []
        for seq in sequences:
            processed = self._pad_or_truncate(seq)
            processed_sequences.append(processed)
        
        X = np.array(processed_sequences, dtype=np.float32)
        
        # No targets in this case (would need separate file)
        y = None
        
        if output_file:
            np.savez_compressed(output_file, X=X, y=y)
            print(f"✅ Saved sequences to {output_file}")
        
        return X, y
    
    def create_sliding_windows(
        self,
        track: np.ndarray,
        step_size: int = 1,
    ) -> np.ndarray:
        """
        Create sliding windows from a single track (for self-supervised learning)
        
        Args:
            track: Track array of shape (track_length, num_features)
            step_size: Step size for sliding window
            
        Returns:
            Array of sequences of shape (num_windows, sequence_length, num_features)
        """
        track_length = track.shape[0]
        
        if track_length < self.sequence_length:
            # Pad track
            padding = np.repeat(track[-1:], self.sequence_length - track_length, axis=0)
            track = np.vstack([padding, track])
            track_length = track.shape[0]
        
        windows = []
        for i in range(0, track_length - self.sequence_length + 1, step_size):
            window = track[i:i + self.sequence_length]
            windows.append(window)
        
        return np.array(windows, dtype=np.float32)


def main():
    """Example usage"""
    import json
    
    # Load preprocessed data
    with open('data/preprocessed/gaps_preprocessed.json', 'r') as f:
        preprocessed = json.load(f)
    
    builder = SequenceBuilder(sequence_length=20)
    X, y = builder.build_sequences(preprocessed)
    
    print(f"X shape: {X.shape}")
    if y is not None:
        print(f"y shape: {y.shape}")
    
    # Save
    np.savez_compressed('data/sequences/training_data.npz', X=X, y=y)
    print("✅ Saved training data")


if __name__ == "__main__":
    main()
