#!/usr/bin/env python3
"""
Training script for Dark Zone Predictor
Uses self-supervised learning approach (no manual labels needed)
"""

import os
import sys
import json
import argparse
import numpy as np
from pathlib import Path

# Add src_ml to path
sys.path.insert(0, str(Path(__file__).parent))

from data.fetch_vessel_tracks import VesselTrackFetcher
from data.detect_gaps import AISGapDetector
from data.preprocess_tracks import TrackPreprocessor
from features.extract_features import FeatureExtractor
from features.build_sequences import SequenceBuilder
from models.baseline import DeadReckoningBaseline
from models.lstm_predictor import LSTMPredictor


def create_training_data_from_tracks(
    tracks_file: str,
    output_dir: str = "data/training",
    sequence_length: int = 20,
    min_track_length: int = 30,
) -> Tuple[str, str]:
    """
    Create training data from vessel tracks using self-supervised learning
    
    Approach: For each track, predict next position from previous N positions
    No manual labeling needed - uses actual vessel positions as targets
    
    Args:
        tracks_file: Path to tracks JSON file
        output_dir: Output directory
        sequence_length: Length of input sequences
        min_track_length: Minimum track length to use
        
    Returns:
        Tuple of (X_file, y_file) paths
    """
    print("=" * 80)
    print("Creating Training Data (Self-Supervised Learning)")
    print("=" * 80)
    
    # Load tracks
    with open(tracks_file, 'r') as f:
        tracks_data = json.load(f)
    
    # Extract sequences and targets
    extractor = FeatureExtractor(include_derived=True)
    builder = SequenceBuilder(sequence_length=sequence_length)
    
    all_sequences = []
    all_targets = []
    
    # Process each vessel track
    entries = tracks_data.get('entries', [])
    if not entries:
        raise ValueError("No entries found in tracks file")
    
    dataset_key = list(entries[0].keys())[0]
    vessels = entries[0][dataset_key]
    
    print(f"Processing {len(vessels)} vessels...")
    
    for vessel in vessels:
        vessel_id = vessel.get('vesselId') or vessel.get('mmsi')
        if not vessel_id:
            continue
        
        # Extract positions
        positions = extract_positions_from_vessel(vessel)
        
        if len(positions) < min_track_length:
            continue
        
        # Create sliding windows: predict next position from previous N
        for i in range(sequence_length, len(positions) - 1):
            # Input: last N positions
            input_sequence = positions[i - sequence_length:i]
            
            # Target: next position
            target_position = positions[i + 1]
            
            # Extract features
            try:
                features = extractor.extract_from_sequence(input_sequence)
                features = builder._pad_or_truncate(features)
                
                all_sequences.append(features)
                all_targets.append([
                    target_position.get('lat', 0.0),
                    target_position.get('lon', 0.0),
                ])
            except Exception as e:
                print(f"⚠️ Error processing vessel {vessel_id}: {e}")
                continue
    
    # Convert to numpy
    X = np.array(all_sequences, dtype=np.float32)
    y = np.array(all_targets, dtype=np.float32)
    
    print(f"✅ Created {len(X)} training samples")
    print(f"   X shape: {X.shape}")
    print(f"   y shape: {y.shape}")
    
    # Save
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    X_file = output_path / "X_train.npy"
    y_file = output_path / "y_train.npy"
    
    np.save(X_file, X)
    np.save(y_file, y)
    
    print(f"✅ Saved training data:")
    print(f"   X: {X_file}")
    print(f"   y: {y_file}")
    
    return str(X_file), str(y_file)


def extract_positions_from_vessel(vessel: dict) -> list:
    """Extract position data from vessel object"""
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


def train_baseline_model(X_file: str, y_file: str):
    """Train and evaluate baseline model"""
    print("\n" + "=" * 80)
    print("Baseline Model (Dead Reckoning)")
    print("=" * 80)
    
    # Baseline doesn't need training, just evaluation
    model = DeadReckoningBaseline()
    
    # Load data
    X = np.load(X_file)
    y = np.load(y_file)
    
    # Evaluate on sample
    sample_size = min(100, len(X))
    indices = np.random.choice(len(X), sample_size, replace=False)
    X_sample = X[indices]
    y_sample = y[indices]
    
    errors = []
    for i in range(sample_size):
        sequence = X_sample[i]
        last_point = sequence[-1]
        
        # Extract last position, speed, course
        lat = last_point[0]
        lon = last_point[1]
        speed = last_point[2] if len(last_point) > 2 else 0.0
        course = last_point[3] if len(last_point) > 3 else 0.0
        
        # Predict (using 1 hour gap as example)
        pred = model.predict((lat, lon), speed, course, 1.0)
        pred_pos = pred['predicted_position']
        
        # Calculate error
        true_pos = y_sample[i]
        error = model._haversine_distance(
            true_pos[0], true_pos[1],
            pred_pos[0], pred_pos[1],
        )
        errors.append(error)
    
    errors = np.array(errors)
    print(f"Mean error: {errors.mean():.2f} nm")
    print(f"Median error: {np.median(errors):.2f} nm")
    print(f"Std error: {errors.std():.2f} nm")


def train_lstm_model(
    X_file: str,
    y_file: str,
    model_dir: str = "models",
    epochs: int = 50,
    batch_size: int = 32,
    validation_split: float = 0.2,
):
    """Train LSTM model"""
    print("\n" + "=" * 80)
    print("LSTM Model Training")
    print("=" * 80)
    
    try:
        from models.lstm_predictor import LSTMPredictor, TF_AVAILABLE
        if not TF_AVAILABLE:
            print("⚠️ TensorFlow not available. Skipping LSTM training.")
            print("   Install with: pip install tensorflow")
            return
    except ImportError:
        print("⚠️ Could not import LSTM model. Skipping.")
        return
    
    # Load data
    print("Loading training data...")
    X = np.load(X_file)
    y = np.load(y_file)
    
    print(f"Training data shape: X={X.shape}, y={y.shape}")
    
    # Create model
    sequence_length = X.shape[1]
    num_features = X.shape[2]
    
    model = LSTMPredictor(
        sequence_length=sequence_length,
        num_features=num_features,
        hidden_units=64,
        num_layers=2,
    )
    
    model.build_model()
    model.model.summary()
    
    # Train
    print("\nTraining model...")
    history = model.train(
        X, y,
        epochs=epochs,
        batch_size=batch_size,
        validation_split=validation_split,
        verbose=1,
    )
    
    # Evaluate
    print("\nEvaluating model...")
    # Split validation set
    val_size = int(len(X) * validation_split)
    X_val = X[-val_size:]
    y_val = y[-val_size:]
    
    metrics = model.evaluate(X_val, y_val)
    print("\nValidation Metrics:")
    for key, value in metrics.items():
        print(f"  {key}: {value:.4f}")
    
    # Save model
    model_path = Path(model_dir)
    model_path.mkdir(parents=True, exist_ok=True)
    model_file = model_path / "lstm_predictor.h5"
    model.save_model(str(model_file))
    
    # Save training history
    history_file = model_path / "training_history.json"
    with open(history_file, 'w') as f:
        json.dump(history, f, indent=2)
    print(f"✅ Saved training history to {history_file}")
    
    return model


def main():
    parser = argparse.ArgumentParser(description="Train Dark Zone Predictor models")
    parser.add_argument("--tracks-file", help="Path to tracks JSON file")
    parser.add_argument("--X-file", help="Path to pre-created X training data")
    parser.add_argument("--y-file", help="Path to pre-created y training data")
    parser.add_argument("--output-dir", default="data/training", help="Output directory")
    parser.add_argument("--model-dir", default="models", help="Model directory")
    parser.add_argument("--epochs", type=int, default=50, help="Training epochs")
    parser.add_argument("--batch-size", type=int, default=32, help="Batch size")
    parser.add_argument("--sequence-length", type=int, default=20, help="Sequence length")
    parser.add_argument("--baseline-only", action="store_true", help="Only train baseline")
    parser.add_argument("--lstm-only", action="store_true", help="Only train LSTM")
    args = parser.parse_args()
    
    # Create training data if needed
    if args.X_file and args.y_file:
        X_file = args.X_file
        y_file = args.y_file
    elif args.tracks_file:
        X_file, y_file = create_training_data_from_tracks(
            args.tracks_file,
            args.output_dir,
            args.sequence_length,
        )
    else:
        print("❌ Error: Must provide either --tracks-file or --X-file and --y-file")
        return
    
    # Train models
    if not args.lstm_only:
        train_baseline_model(X_file, y_file)
    
    if not args.baseline_only:
        train_lstm_model(
            X_file,
            y_file,
            args.model_dir,
            args.epochs,
            args.batch_size,
        )


if __name__ == "__main__":
    main()
