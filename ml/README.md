# Dark Zone Predictor - ML Pipeline

Predicts vessel positions after AIS gaps using an LSTM velocity model.

## Quick Start

```bash
# Activate environment
cd ml && source venv/bin/activate

# Start prediction server
python prediction_server.py
# Server runs at http://localhost:8000
```

## Project Structure

```
ml/
├── prediction_server.py      # FastAPI server (main entry point)
├── train_v3.py               # Training script
├── models/
│   ├── lstm_v3.h5            # Trained LSTM model
│   ├── normalizer_v3.json    # Feature normalization params
│   ├── baseline.py           # Dead reckoning baseline
│   └── lstm_predictor.py     # LSTM model definition
├── features/
│   └── normalizer_v3.py      # Velocity normalization
├── data/
│   ├── fetch_vessel_tracks.py  # GFW API data fetcher
│   ├── detect_gaps.py          # AIS gap detection
│   ├── preprocess_tracks.py    # Sequence builder
│   ├── raw/                    # Raw API data
│   ├── gaps/                   # Detected gap events
│   └── preprocessed/           # Training sequences
└── prediction/
    └── generate_cloud.py     # Probability cloud generator
```

## Retraining Pipeline

### 1. Fetch vessel tracks
```bash
python data/fetch_vessel_tracks.py \
  --region-id YOUR_REGION_ID \
  --start-date 2024-01-01 \
  --end-date 2024-03-31
```

### 2. Detect AIS gaps
```bash
python data/detect_gaps.py \
  data/raw/tracks_REGION_DATE.json \
  --output data/gaps/gaps_REGION.json
```

### 3. Preprocess into sequences
```bash
python data/preprocess_tracks.py \
  data/gaps/gaps_REGION.json \
  --tracks-file data/raw/tracks_REGION_DATE.json \
  --numpy-output data/preprocessed/sequences_REGION.npz
```

### 4. Train model
```bash
python train_v3.py --raw-npz data/preprocessed/sequences_REGION.npz --epochs 200
```

### 5. Restart server
```bash
pkill -f prediction_server.py
python prediction_server.py
```

## API Endpoints

### Health Check
```bash
curl http://localhost:8000/health
```

### Predict Path
```bash
curl -X POST http://localhost:8000/predict \
  -H "Content-Type: application/json" \
  -d '{
    "vessel_id": "test",
    "last_position": {"lat": 5.0, "lon": -10.0, "speed": 8.5, "course": 135},
    "gap_duration_hours": 12,
    "model_type": "lstm"
  }'
```

## Model Architecture

**Velocity Predictor v3**:
- Input: 20-step trajectory sequence (lat, lon, speed, course)
- Output: Velocity vector (degrees/hour)
- Final position = reference + velocity × gap_hours

This design ensures predictions scale correctly with gap duration.

## Performance

| Gap Duration | Median Error |
|--------------|--------------|
| 1 hour       | ~2 nm        |
| 6 hours      | ~11 nm       |
| 12 hours     | ~22 nm       |
| 24 hours     | ~43 nm       |
