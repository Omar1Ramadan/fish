#!/usr/bin/env python3
"""
Dark Zone Predictor - ML Server v3
Predicts velocity (displacement/hour), then scales by gap duration
"""

import os
import sys
import numpy as np
from pathlib import Path
from typing import Optional, List

sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from models.baseline import DeadReckoningBaseline
from features.normalizer_v3 import TrajectoryNormalizerV3

try:
    import tensorflow as tf
    TF_AVAILABLE = True
except ImportError:
    TF_AVAILABLE = False
    print("⚠️ TensorFlow not available")

app = FastAPI(title="Dark Zone Predictor API", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Models
lstm_model = None
normalizer: Optional[TrajectoryNormalizerV3] = None
baseline_model = DeadReckoningBaseline()

SEQUENCE_LENGTH = 20  # Must match the trained model's input shape
NUM_FEATURES = 5  # lat_rel, lon_rel, speed_norm, sin, cos (NO gap!)


class PositionPoint(BaseModel):
    lat: float
    lon: float
    speed: Optional[float] = 0.0
    course: Optional[float] = 0.0


class PredictionRequest(BaseModel):
    vessel_id: str
    last_position: PositionPoint
    gap_duration_hours: float
    sequence: Optional[List[PositionPoint]] = None
    model_type: str = "lstm"
    aggression_factor: float = 1.0  # Multiplier for prediction distance (0.25-10.0)


class PredictionResponse(BaseModel):
    vessel_id: str
    predicted_position: List[float]
    uncertainty_nm: float
    uncertainty_degrees: List[float]
    method: str
    model_confidence: Optional[float] = None
    probability_cloud: dict


def load_models():
    """Load trained models"""
    global lstm_model, normalizer
    
    model_dir = Path(__file__).parent / "models"
    
    # Load v3 normalizer
    normalizer_path = model_dir / "normalizer_v3.json"
    if normalizer_path.exists():
        normalizer = TrajectoryNormalizerV3()
        normalizer.load(str(normalizer_path))
    else:
        print(f"⚠️ Normalizer not found: {normalizer_path}")
    
    if not TF_AVAILABLE:
        return False
    
    # Load v3 model
    model_path = model_dir / "lstm_v3.h5"
    if not model_path.exists():
        print(f"⚠️ Model not found: {model_path}")
        return False
    
    try:
        lstm_model = tf.keras.models.load_model(str(model_path), compile=False)
        lstm_model.compile(optimizer='adam', loss='mse')
        print(f"✅ LSTM v3 loaded: {lstm_model.input_shape} → {lstm_model.output_shape}")
        return True
    except Exception as e:
        print(f"❌ Failed to load: {e}")
        return False


def generate_probability_cloud(lat: float, lon: float, unc_lat: float, unc_lon: float) -> dict:
    """Generate probability cloud GeoJSON"""
    features = []
    grid_size = 30
    
    for i in range(grid_size):
        for j in range(grid_size):
            pt_lat = lat - 3*unc_lat + 6*unc_lat * i / (grid_size - 1)
            pt_lon = lon - 3*unc_lon + 6*unc_lon * j / (grid_size - 1)
            
            d_lat = (pt_lat - lat) / unc_lat if unc_lat > 0 else 0
            d_lon = (pt_lon - lon) / unc_lon if unc_lon > 0 else 0
            prob = float(np.exp(-0.5 * (d_lat**2 + d_lon**2)))
            
            features.append({
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [pt_lon, pt_lat]},
                "properties": {"probability": prob}
            })
    
    total = sum(f["properties"]["probability"] for f in features)
    for f in features:
        f["properties"]["probability"] /= total
    
    return {"type": "FeatureCollection", "features": features}


def prepare_input_v3(last_pos: PositionPoint, sequence: Optional[List[PositionPoint]] = None) -> np.ndarray:
    """
    Prepare normalized input for v3 model
    5 features: [lat_rel, lon_rel, speed_norm, course_sin, course_cos]
    """
    # Build raw sequence
    if sequence and len(sequence) >= SEQUENCE_LENGTH:
        raw = [[p.lat, p.lon, p.speed or 0, p.course or 0] for p in sequence[-SEQUENCE_LENGTH:]]
    else:
        raw = [[last_pos.lat, last_pos.lon, last_pos.speed or 5.0, last_pos.course or 0.0]] * SEQUENCE_LENGTH
    
    raw = np.array([raw], dtype=np.float32)  # (1, seq_len, 4)
    
    # Normalize
    last_lat = raw[:, -1, 0:1]
    last_lon = raw[:, -1, 1:2]
    
    coord_scale = max(normalizer.stats.get('lat_std', 1.0), 1.0)
    lat_rel = (raw[:, :, 0:1] - last_lat[:, np.newaxis, :]) / coord_scale
    lon_rel = (raw[:, :, 1:2] - last_lon[:, np.newaxis, :]) / coord_scale
    speed_norm = raw[:, :, 2:3] / normalizer.max_speed
    
    course_rad = np.radians(raw[:, :, 3:4])
    course_sin = np.sin(course_rad)
    course_cos = np.cos(course_rad)
    
    X = np.concatenate([lat_rel, lon_rel, speed_norm, course_sin, course_cos], axis=2)
    return X


@app.on_event("startup")
async def startup():
    print("=" * 60)
    print("  Dark Zone Predictor - ML Server v3")
    print("  Velocity prediction model (scales with gap duration)")
    print("=" * 60)
    load_models()
    print("✅ Ready")


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "version": "3.0",
        "lstm_available": lstm_model is not None,
        "normalizer_available": normalizer is not None,
    }


@app.post("/predict", response_model=PredictionResponse)
async def predict_path(request: PredictionRequest):
    """Predict vessel path after AIS gap"""
    # Clamp aggression factor to valid range (0.25x to 10x)
    aggression = max(0.25, min(10.0, request.aggression_factor))
    
    print(f"\n{'='*60}")
    print(f"🔮 Prediction: {request.vessel_id}")
    print(f"   Position: ({request.last_position.lat:.4f}, {request.last_position.lon:.4f})")
    print(f"   Speed: {request.last_position.speed} kn, Course: {request.last_position.course}°")
    print(f"   Gap: {request.gap_duration_hours} hours")
    aggression_icon = '🎯' if aggression < 0.75 else '⚖️' if aggression < 1.5 else '🚀' if aggression < 3 else '🔥' if aggression < 6 else '💥'
    print(f"   Aggression: {aggression}x {aggression_icon}")
    
    ref_lat = request.last_position.lat
    ref_lon = request.last_position.lon
    gap_hours = request.gap_duration_hours
    
    use_lstm = request.model_type == "lstm" and lstm_model is not None and normalizer is not None
    
    if use_lstm:
        print("   📊 Using LSTM v3 (velocity prediction)")
        try:
            # Prepare input
            X = prepare_input_v3(request.last_position, request.sequence)
            print(f"   Input: shape={X.shape}, range=[{X.min():.3f}, {X.max():.3f}]")
            
            # Predict velocity (normalized)
            velocity_norm = lstm_model.predict(X, verbose=0)[0]
            print(f"   Velocity (norm): [{velocity_norm[0]:.4f}, {velocity_norm[1]:.4f}]")
            
            # Denormalize velocity (degrees/hour)
            velocity = velocity_norm * normalizer.velocity_scale
            print(f"   Velocity: {velocity[0]:.4f}°/hr lat, {velocity[1]:.4f}°/hr lon")
            
            # Scale by gap duration → total displacement
            displacement = velocity * gap_hours
            print(f"   Displacement (raw): {displacement[0]:.4f}° lat, {displacement[1]:.4f}° lon")
            
            # Apply aggression factor to extend the prediction range
            displacement = displacement * aggression
            print(f"   Displacement (×{aggression}): {displacement[0]:.4f}° lat, {displacement[1]:.4f}° lon")
            
            # Final position
            pred_lat = float(ref_lat + displacement[0])
            pred_lon = float(ref_lon + displacement[1])
            
            # Uncertainty scales with sqrt(time) and aggression factor
            base_unc = 0.05  # degrees
            time_factor = np.sqrt(gap_hours)
            # More aggressive = more uncertainty
            aggression_unc_factor = np.sqrt(aggression)
            unc_lat = float(base_unc * time_factor * aggression_unc_factor)
            unc_lon = float(base_unc * time_factor * aggression_unc_factor / np.cos(np.radians(ref_lat)))
            
            method = "lstm_v3_velocity"
            confidence = 0.85
            
        except Exception as e:
            print(f"   ⚠️ LSTM failed: {e}")
            import traceback
            traceback.print_exc()
            use_lstm = False
    
    if not use_lstm:
        print(f"   📐 Using baseline (dead reckoning) with aggression={aggression}x")
        # Scale the time gap by aggression to predict further distances
        effective_gap_hours = gap_hours * aggression
        result = baseline_model.predict(
            last_position=(ref_lat, ref_lon),
            last_speed=request.last_position.speed or 5.0,
            last_course=request.last_position.course or 0.0,
            time_gap_hours=effective_gap_hours,
        )
        pred_lat = float(result['predicted_position'][0])
        pred_lon = float(result['predicted_position'][1])
        # Scale uncertainty by aggression
        aggression_unc_factor = np.sqrt(aggression)
        unc_lat = float(result['uncertainty_degrees'][0] * aggression_unc_factor)
        unc_lon = float(result['uncertainty_degrees'][1] * aggression_unc_factor)
        method = "dead_reckoning"
        confidence = max(0.2, 0.5 / aggression)  # Lower confidence for aggressive predictions
    
    uncertainty_nm = float((unc_lat + unc_lon) / 2 * 60)
    cloud = generate_probability_cloud(pred_lat, pred_lon, unc_lat, unc_lon)
    
    print(f"   ✅ Prediction: ({pred_lat:.4f}, {pred_lon:.4f}) ±{uncertainty_nm:.1f}nm")
    print(f"   Method: {method} | Aggression: {aggression}x")
    
    return PredictionResponse(
        vessel_id=request.vessel_id,
        predicted_position=[pred_lat, pred_lon],
        uncertainty_nm=uncertainty_nm,
        uncertainty_degrees=[unc_lat, unc_lon],
        method=method,
        model_confidence=confidence,
        probability_cloud=cloud,
    )


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
