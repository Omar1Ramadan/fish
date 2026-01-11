# 🐟 Fishy - Dark Vessel Monitor

A real-time vessel monitoring platform that tracks fishing activity, detects AIS gaps (vessels going "dark"), and correlates with SAR satellite data to identify suspicious activity in protected waters.

## Features

- **Vessel Tracking**: Monitor fishing vessels near Exclusive Economic Zones (EEZs)
- **AIS Gap Detection**: Identify vessels that turn off their AIS transponders
- **SAR Integration**: Satellite radar data to detect vessels not broadcasting AIS
- **Interactive Map**: Mapbox-powered visualization with Global Fishing Watch data
- **Dark Vessel Filtering**: Filter and highlight vessels with suspicious AIS gaps

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **Frontend**: React 19, TypeScript, Tailwind CSS 4
- **Map**: Mapbox GL JS
- **Data**: Global Fishing Watch API v3
- **3D**: Three.js (loading animation)

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Add your FISH_API token (Global Fishing Watch API key)

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

## Environment Variables

```
FISH_API=your_gfw_api_token
NEXT_PUBLIC_MAPBOX_TOKEN=your_mapbox_token
```

## License

MIT
