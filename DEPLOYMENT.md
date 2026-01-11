# Deployment Guide - FISHY Dark Vessel Monitor

This guide covers deploying both the **Next.js frontend** and the **Python ML prediction server**.

## Architecture

```
┌─────────────────┐     ┌─────────────────┐
│   Next.js App   │────▶│  ML Server      │
│   (Frontend)    │     │  (Python/FastAPI)│
│   Port 3000     │     │  Port 8000      │
└─────────────────┘     └─────────────────┘
        │                       │
        ▼                       ▼
   Global Fishing         LSTM Model
   Watch API              (lstm_v3.h5)
```

## Environment Variables

### Frontend (.env)
```env
FISH_API=your_gfw_api_token
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token
ML_SERVER_URL=https://your-ml-server.com
```

### ML Server
No environment variables required (model files are bundled).

---

## Option 1: Railway (Recommended)

Railway supports both services with easy deployment.

### Deploy ML Server

1. Create a new Railway project
2. Click "New Service" → "GitHub Repo"
3. Select your repo and set:
   - **Root Directory**: `ml`
   - **Builder**: Dockerfile
4. Railway will auto-detect the Dockerfile and deploy

### Deploy Frontend

1. In the same project, click "New Service" → "GitHub Repo"
2. Select your repo (root directory)
3. Add environment variables:
   - `FISH_API`: Your GFW API token
   - `NEXT_PUBLIC_MAPBOX_TOKEN`: Your Mapbox token
   - `ML_SERVER_URL`: The internal Railway URL of your ML server (e.g., `http://ml-server.railway.internal:8000`)

### Connect Services

Railway automatically provides internal networking. Use the ML server's internal URL.

---

## Option 2: Render

Render supports Blueprint deployment for multiple services.

### One-Click Deploy

1. Push your code to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com)
3. Click "New" → "Blueprint"
4. Connect your repo - Render will detect `render.yaml`
5. Add environment variables when prompted

### Manual Deploy

**ML Server:**
1. New → Web Service
2. Connect repo, set Root Directory to `ml`
3. Environment: Docker
4. Health Check Path: `/health`

**Frontend:**
1. New → Web Service  
2. Connect repo (root)
3. Build Command: `npm install && npm run build`
4. Start Command: `npm start`
5. Add env vars including `ML_SERVER_URL`

---

## Option 3: Docker Compose (Self-hosted)

For VPS, DigitalOcean Droplet, AWS EC2, etc.

### Quick Start

```bash
# Clone the repo
git clone https://github.com/your-repo/fish.git
cd fish

# Create .env file
cat > .env << EOF
FISH_API=your_gfw_api_token
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token
EOF

# Build and run
docker-compose up -d

# Check status
docker-compose ps
docker-compose logs -f
```

### With Nginx Reverse Proxy

```nginx
# /etc/nginx/sites-available/fishy
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location /api/predict-path {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

---

## Option 4: Vercel + Separate ML Server

Vercel is excellent for Next.js but doesn't support Python. Deploy them separately.

### Frontend on Vercel

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
# ML_SERVER_URL should point to your deployed ML server
```

### ML Server on Railway/Render/Fly.io

Deploy the ML server separately using Options 1 or 2, then set `ML_SERVER_URL` in Vercel.

---

## Option 5: Fly.io

### ML Server

```bash
cd ml

# Create fly.toml
cat > fly.toml << EOF
app = "fishy-ml-server"
primary_region = "sjc"

[build]
  dockerfile = "Dockerfile"

[http_service]
  internal_port = 8000
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true

[[services.http_checks]]
  interval = 30000
  grace_period = "10s"
  method = "GET"
  path = "/health"
  protocol = "http"
  timeout = 5000
EOF

# Deploy
fly launch
fly deploy
```

---

## Verifying Deployment

### Check ML Server Health

```bash
curl https://your-ml-server.com/health
# Expected: {"status":"healthy","version":"3.0","lstm_available":true,"normalizer_available":true}
```

### Test Prediction

```bash
curl -X POST https://your-ml-server.com/predict \
  -H "Content-Type: application/json" \
  -d '{"vessel_id":"test","last_position":{"lat":-0.9,"lon":-92.0,"speed":8,"course":135},"gap_duration_hours":12,"model_type":"lstm","aggression_factor":1.0}'
```

---

## Troubleshooting

### ML Server won't start
- Check TensorFlow is installed: `pip list | grep tensorflow`
- Verify model files exist: `ls ml/models/lstm_v3.h5`
- Check logs: `docker logs <container>`

### Frontend can't reach ML Server
- Verify `ML_SERVER_URL` is set correctly
- Check CORS settings in ML server
- Test with curl from frontend container

### Model predictions are slow
- TensorFlow needs ~2-3s to warm up on first request
- Consider using a larger instance (more RAM/CPU)
- Enable model caching (already implemented)

---

## Costs (Approximate)

| Platform | ML Server | Frontend | Total |
|----------|-----------|----------|-------|
| Railway | $5/mo | $5/mo | ~$10/mo |
| Render | $7/mo | Free | ~$7/mo |
| Fly.io | $5/mo | $5/mo | ~$10/mo |
| DigitalOcean | $6/mo (1 droplet for both) | - | ~$6/mo |

---

## Quick Commands

```bash
# Local development
cd ml && source venv/bin/activate && python prediction_server.py &
npm run dev

# Docker build
docker-compose build
docker-compose up -d

# View logs
docker-compose logs -f ml-server
docker-compose logs -f frontend

# Stop
docker-compose down
```
