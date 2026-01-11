#!/usr/bin/env python3
"""
Train LSTM v3: Predict velocity (displacement/hour)
Input: trajectory sequence (5 features, NO gap duration)
Output: velocity vector (2 values: lat/lon degrees per hour)
"""

import sys
import json
import argparse
import numpy as np
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from features.normalizer_v3 import TrajectoryNormalizerV3, create_training_data_v3

try:
    import tensorflow as tf
    from tensorflow import keras
    from tensorflow.keras import layers
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False


def build_velocity_model(sequence_length: int = 10, num_features: int = 5) -> keras.Model:
    """
    Build velocity prediction model
    
    Simple and clean: sequence → velocity
    """
    inputs = keras.Input(shape=(sequence_length, num_features), name='trajectory')
    
    # Bidirectional LSTM
    x = layers.Bidirectional(layers.LSTM(64, return_sequences=True, dropout=0.2))(inputs)
    x = layers.LSTM(64, dropout=0.2)(x)
    
    # Dense layers
    x = layers.Dense(32, activation='relu')(x)
    x = layers.Dropout(0.2)(x)
    
    # Output: velocity (lat, lon) in normalized units
    outputs = layers.Dense(2, name='velocity')(x)
    
    model = keras.Model(inputs=inputs, outputs=outputs, name='velocity_predictor_v3')
    return model


def train_v3(data_npz: str, normalizer_json: str, output_dir: str = "models", epochs: int = 200, batch_size: int = 32):
    """Train velocity predictor v3"""
    print("=" * 60)
    print("Training Velocity Predictor v3")
    print("=" * 60)
    
    if not TF_AVAILABLE:
        print("❌ TensorFlow not available")
        return
    
    # Load data
    data = np.load(data_npz)
    X = data['X']  # (N, seq_len, 5)
    y = data['y']  # (N, 2) - normalized velocity
    
    print(f"Data: X={X.shape}, y={y.shape}")
    print(f"X range: [{X.min():.3f}, {X.max():.3f}]")
    print(f"y range: [{y.min():.3f}, {y.max():.3f}]")
    
    # Build model
    model = build_velocity_model(X.shape[1], X.shape[2])
    model.compile(optimizer=keras.optimizers.Adam(0.001), loss='mse', metrics=['mae'])
    
    print("\nModel:")
    model.summary()
    
    # Callbacks
    callbacks = [
        keras.callbacks.EarlyStopping(monitor='val_loss', patience=25, restore_best_weights=True, verbose=1),
        keras.callbacks.ReduceLROnPlateau(monitor='val_loss', factor=0.5, patience=10, min_lr=1e-6, verbose=1),
    ]
    
    # Train
    print(f"\n🚀 Training for up to {epochs} epochs...")
    history = model.fit(X, y, validation_split=0.2, epochs=epochs, batch_size=batch_size, callbacks=callbacks, verbose=1)
    
    # Save
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)
    
    model_file = output_path / "lstm_v3.h5"
    model.save(str(model_file))
    print(f"\n✅ Saved model to {model_file}")
    
    # Save history
    with open(output_path / "training_history_v3.json", 'w') as f:
        json.dump({k: [float(v) for v in vals] for k, vals in history.history.items()}, f, indent=2)
    
    # Copy normalizer
    import shutil
    shutil.copy(normalizer_json, output_path / "normalizer_v3.json")
    
    # Evaluate
    print("\n📈 Evaluation:")
    normalizer = TrajectoryNormalizerV3()
    normalizer.load(normalizer_json)
    
    val_idx = int(len(X) * 0.8)
    X_val = X[val_idx:]
    y_val = y[val_idx:]
    X_raw = data['X_raw'][val_idx:]
    
    y_pred_norm = model.predict(X_val, verbose=0)
    
    print("\n   Testing different gap durations (same velocity, different displacement):")
    for gap in [1, 6, 12, 24]:
        ref_pos = X_raw[:, -1, :2]
        
        # Inverse transform: velocity → position
        y_pred_abs = normalizer.inverse_transform_y(y_pred_norm, ref_pos, gap)
        y_true_abs = normalizer.inverse_transform_y(y_val, ref_pos, gap)
        
        errors_deg = np.sqrt(np.sum((y_pred_abs - y_true_abs)**2, axis=1))
        errors_nm = errors_deg * 60
        
        print(f"   {gap:2d}h gap: Mean={errors_nm.mean():.1f} nm, Median={np.median(errors_nm):.1f} nm")
    
    print("\n✅ Training Complete!")
    return model


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-npz", default="data/preprocessed/sequences_555635930.npz")
    parser.add_argument("--data-dir", default="data/normalized_v3")
    parser.add_argument("--model-dir", default="models")
    parser.add_argument("--epochs", type=int, default=200)
    parser.add_argument("--batch-size", type=int, default=32)
    args = parser.parse_args()
    
    # Create normalized data
    print("Step 1: Creating training data")
    data_npz, normalizer_json = create_training_data_v3(args.raw_npz, args.data_dir)
    
    # Train
    print("\nStep 2: Training model")
    train_v3(data_npz, normalizer_json, args.model_dir, args.epochs, args.batch_size)


if __name__ == "__main__":
    main()
