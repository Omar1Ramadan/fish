#!/usr/bin/env python3
"""
LSTM model for vessel position prediction
Uses self-supervised learning approach
"""

import numpy as np
from typing import Tuple, Optional, Dict
import os

# Try to import TensorFlow/Keras, but make it optional
try:
    import tensorflow as tf
    from tensorflow import keras
    from tensorflow.keras import layers
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False
    print("⚠️ TensorFlow not available. Install with: pip install tensorflow")


class LSTMPredictor:
    """LSTM model for predicting vessel positions"""
    
    def __init__(
        self,
        sequence_length: int = 20,
        num_features: int = 13,
        hidden_units: int = 64,
        num_layers: int = 2,
    ):
        """
        Initialize LSTM predictor
        
        Args:
            sequence_length: Length of input sequences
            num_features: Number of features per time step
            hidden_units: Number of LSTM hidden units
            num_layers: Number of LSTM layers
        """
        if not TF_AVAILABLE:
            raise ImportError("TensorFlow is required for LSTM model")
        
        self.sequence_length = sequence_length
        self.num_features = num_features
        self.hidden_units = hidden_units
        self.num_layers = num_layers
        self.model = None
    
    def build_model(self) -> keras.Model:
        """Build LSTM model architecture"""
        inputs = keras.Input(shape=(self.sequence_length, self.num_features))
        
        x = inputs
        
        # Stack LSTM layers
        for i in range(self.num_layers):
            return_sequences = (i < self.num_layers - 1)  # Only last layer doesn't return sequences
            x = layers.LSTM(
                self.hidden_units,
                return_sequences=return_sequences,
                dropout=0.2,
                name=f'lstm_{i+1}',
            )(x)
        
        # Dense layers for prediction
        x = layers.Dense(32, activation='relu', name='dense_1')(x)
        x = layers.Dropout(0.2)(x)
        
        # Output: predicted position (lat, lon) + uncertainty
        # Output shape: (batch_size, 4) -> [lat, lon, uncertainty_lat, uncertainty_lon]
        outputs = layers.Dense(4, name='output')(x)
        
        model = keras.Model(inputs=inputs, outputs=outputs, name='lstm_predictor')
        
        # Compile model
        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=0.001),
            loss='mse',  # Mean squared error for regression
            metrics=['mae'],  # Mean absolute error
        )
        
        self.model = model
        return model
    
    def train(
        self,
        X: np.ndarray,
        y: np.ndarray,
        validation_split: float = 0.2,
        epochs: int = 50,
        batch_size: int = 32,
        verbose: int = 1,
    ) -> Dict:
        """
        Train the model
        
        Args:
            X: Input sequences (num_samples, sequence_length, num_features)
            y: Target positions (num_samples, 2) -> [lat, lon]
            validation_split: Fraction of data for validation
            epochs: Number of training epochs
            batch_size: Batch size
            verbose: Verbosity level
            
        Returns:
            Training history
        """
        if self.model is None:
            self.build_model()
        
        # Prepare targets: add uncertainty placeholders (will be learned)
        # For now, use zeros for uncertainty
        y_extended = np.zeros((len(y), 4))
        y_extended[:, :2] = y  # lat, lon
        # Uncertainty will be learned as part of the model
        
        # Train
        history = self.model.fit(
            X,
            y_extended,
            validation_split=validation_split,
            epochs=epochs,
            batch_size=batch_size,
            verbose=verbose,
            shuffle=True,
        )
        
        return history.history
    
    def predict(
        self,
        X: np.ndarray,
    ) -> np.ndarray:
        """
        Predict positions from sequences
        
        Args:
            X: Input sequences (num_samples, sequence_length, num_features)
            
        Returns:
            Predictions (num_samples, 4) -> [lat, lon, uncertainty_lat, uncertainty_lon]
        """
        if self.model is None:
            raise ValueError("Model not built. Call build_model() or load_model() first")
        
        predictions = self.model.predict(X, verbose=0)
        return predictions
    
    def predict_single(
        self,
        sequence: np.ndarray,
    ) -> Dict:
        """
        Predict position for a single sequence
        
        Args:
            sequence: Single sequence (sequence_length, num_features)
            
        Returns:
            Dict with prediction
        """
        # Add batch dimension
        X = np.expand_dims(sequence, axis=0)
        
        pred = self.predict(X)[0]
        
        return {
            'predicted_position': (float(pred[0]), float(pred[1])),
            'uncertainty_degrees': (float(pred[2]), float(pred[3])),
            'method': 'lstm',
        }
    
    def save_model(self, filepath: str):
        """Save model to file"""
        if self.model is None:
            raise ValueError("No model to save")
        
        self.model.save(filepath)
        print(f"✅ Saved model to {filepath}")
    
    def load_model(self, filepath: str):
        """Load model from file"""
        if not os.path.exists(filepath):
            raise FileNotFoundError(f"Model file not found: {filepath}")
        
        self.model = keras.models.load_model(filepath)
        print(f"✅ Loaded model from {filepath}")
    
    def evaluate(
        self,
        X: np.ndarray,
        y: np.ndarray,
    ) -> Dict:
        """
        Evaluate model on test data
        
        Args:
            X: Input sequences
            y: True positions (num_samples, 2)
            
        Returns:
            Dict with evaluation metrics
        """
        if self.model is None:
            raise ValueError("Model not loaded")
        
        # Prepare targets
        y_extended = np.zeros((len(y), 4))
        y_extended[:, :2] = y
        
        # Evaluate
        results = self.model.evaluate(X, y_extended, verbose=0)
        
        # Calculate distance errors
        predictions = self.predict(X)
        pred_positions = predictions[:, :2]
        
        # Calculate haversine distances
        distances = []
        for i in range(len(y)):
            dist = self._haversine_distance(
                y[i][0], y[i][1],
                pred_positions[i][0], pred_positions[i][1],
            )
            distances.append(dist)
        
        distances = np.array(distances)
        
        return {
            'loss': float(results[0]),
            'mae': float(results[1]),
            'mean_distance_error_nm': float(distances.mean()),
            'median_distance_error_nm': float(np.median(distances)),
            'std_distance_error_nm': float(distances.std()),
        }
    
    def _haversine_distance(
        self,
        lat1: float,
        lon1: float,
        lat2: float,
        lon2: float,
    ) -> float:
        """Calculate distance between two points (nautical miles)"""
        import math
        
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


def main():
    """Example usage"""
    if not TF_AVAILABLE:
        print("TensorFlow not available. Install with: pip install tensorflow")
        return
    
    # Create model
    model = LSTMPredictor(
        sequence_length=20,
        num_features=13,
        hidden_units=64,
        num_layers=2,
    )
    
    model.build_model()
    model.model.summary()
    
    # Example: Create dummy data
    X = np.random.randn(100, 20, 13).astype(np.float32)
    y = np.random.randn(100, 2).astype(np.float32)
    
    # Train
    print("\nTraining model...")
    history = model.train(X, y, epochs=5, verbose=1)
    
    # Evaluate
    print("\nEvaluating...")
    metrics = model.evaluate(X, y)
    print("Metrics:", metrics)
    
    # Save
    model.save_model('models/lstm_predictor.h5')


if __name__ == "__main__":
    main()
