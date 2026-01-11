# Dark Zone Predictor ML Pipeline

Machine learning pipeline for predicting vessel positions when AIS signals go dark.

## Overview

This pipeline implements a simplified approach to vessel path prediction:
- **No complex labels**: Focuses on position prediction, not activity classification
- **Self-supervised learning**: Uses actual vessel positions as training targets
- **Physics-based baseline**: Dead reckoning model for quick validation
- **LSTM model**: Deep learning model for improved predictions

## Quick Start

### 1. Install Dependencies

```bash
cd src_ml
pip install -r requirements.txt
```

### 2. Set Environment Variable

```bash
export FISH_API="your_gfw_api_token_here"
```

### 3. Fetch Training Data

```bash
python data/fetch_vessel_tracks.py \
  --region-id 555635930 \
  --region-dataset public-mpa-all \
  --start-date 2024-01-01 \
  --end-date 2024-03-31 \
  --output-dir data/raw
```

### 4. Detect AIS Gaps

```bash
python data/detect_gaps.py \
  data/raw/tracks_*.json \
  --output data/gaps/gaps.json \
  --threshold 6.0
```

### 5. Preprocess Data

```bash
python data/preprocess_tracks.py \
  data/gaps/gaps.json \
  --output data/preprocessed/preprocessed.json \
  --sequence-length 20
```

### 6. Train Model

```bash
python train.py \
  --tracks-file data/raw/tracks_*.json \
  --output-dir data/training \
  --model-dir models \
  --epochs 50 \
  --batch-size 32
```

## Architecture

```
GFW API → Data Pipeline → Feature Extraction → ML Model → Prediction API → Visualization
```

### Data Pipeline
- `fetch_vessel_tracks.py`: Fetches vessel tracks from GFW 4Wings Report API
- `detect_gaps.py`: Identifies AIS gap events (vessels going dark)
- `preprocess_tracks.py`: Converts raw data to ML-ready sequences

### Feature Engineering
- `extract_features.py`: Extracts essential features (position, speed, course, temporal, spatial)
- `build_sequences.py`: Creates fixed-length sequences for ML

### Models
- `baseline.py`: Physics-based dead reckoning (no training needed)
- `lstm_predictor.py`: LSTM model for position prediction

### Prediction
- `generate_cloud.py`: Converts predictions to spatial probability distributions
- API endpoint: `/api/predict-path` (Next.js route)

## Usage

### Generate Prediction (API)

```bash
curl -X POST http://localhost:3000/api/predict-path \
  -H "Content-Type: application/json" \
  -d '{
    "vesselId": "123456789",
    "lastPosition": {"lat": -0.5, "lon": -90.5},
    "lastSpeed": 10.0,
    "lastCourse": 45.0,
    "gapDurationHours": 6.0,
    "modelType": "baseline"
  }'
```

### Use in Frontend

The `VesselMonitor` component automatically generates predictions when you click "Predict Path" on a dark zone event. The probability cloud is displayed on the map as a heatmap overlay.

## File Structure

```
src_ml/
├── data/
│   ├── fetch_vessel_tracks.py      # Fetch from GFW API
│   ├── detect_gaps.py              # Find AIS gaps
│   └── preprocess_tracks.py        # Convert to ML format
├── features/
│   ├── extract_features.py         # Feature engineering
│   └── build_sequences.py         # Create sequences
├── models/
│   ├── baseline.py                 # Physics-based baseline
│   └── lstm_predictor.py           # ML model
├── prediction/
│   └── generate_cloud.py           # Create probability cloud
├── train.py                        # Training script
├── requirements.txt                # Python dependencies
└── README.md                       # This file
```

## Features Extracted

- **Position**: lat, lon
- **Movement**: speed, course, heading
- **Temporal**: time_diff, hour_of_day
- **Spatial**: distance_from_last, distance_to_eez
- **Derived**: velocity_lat, velocity_lon, acceleration, turn_rate

## Model Performance

- **Baseline (Dead Reckoning)**: Fast, interpretable, no training needed
- **LSTM**: More accurate, learns patterns from historical data

Expected accuracy: Within 50km of actual position after 6-hour gap (70%+ coverage).

## Notes

- The pipeline uses **self-supervised learning**: no manual labeling required
- Training data is created by predicting next position from previous N positions
- The baseline model works immediately without training
- LSTM model requires training on historical vessel tracks
