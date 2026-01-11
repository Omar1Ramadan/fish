import { NextRequest, NextResponse } from "next/server";

// Logging utility
const log = (message: string, data?: unknown) => {
  const timestamp = new Date().toISOString();
  if (data !== undefined) {
    console.log(`[${timestamp}] [PREDICT PATH API] ${message}`, data);
  } else {
    console.log(`[${timestamp}] [PREDICT PATH API] ${message}`);
  }
};

const logError = (message: string, error?: unknown) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] [PREDICT PATH API] ❌ ${message}`, error);
};

interface PredictPathRequest {
  vesselId: string;
  lastPosition: {
    lat: number;
    lon: number;
  };
  lastSpeed?: number; // knots
  lastCourse?: number; // degrees
  gapDurationHours: number;
  sequence?: Array<{
    lat: number;
    lon: number;
    speed?: number;
    course?: number;
    timestamp?: number;
  }>;
  modelType?: "baseline" | "lstm";
}

export async function POST(request: NextRequest) {
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("🔮 Incoming path prediction request");

  try {
    const body: PredictPathRequest = await request.json();
    const {
      vesselId,
      lastPosition,
      lastSpeed = 0,
      lastCourse = 0,
      gapDurationHours,
      sequence,
      modelType = "baseline",
    } = body;

    log("📍 Request params:", {
      vesselId,
      lastPosition,
      gapDurationHours,
      modelType,
      hasSequence: !!sequence,
    });

    if (!vesselId || !lastPosition || !gapDurationHours) {
      return NextResponse.json(
        { error: "Missing required parameters: vesselId, lastPosition, gapDurationHours" },
        { status: 400 }
      );
    }

    // Call Python prediction service
    // For now, use baseline model (can be extended to call Python service)
    const prediction = await predictPathBaseline(
      lastPosition,
      lastSpeed,
      lastCourse,
      gapDurationHours,
    );

    // Generate probability cloud
    const probabilityCloud = generateProbabilityCloud(
      prediction.predictedPosition,
      prediction.uncertaintyDegrees,
    );

    log("✅ Prediction generated", {
      predictedPosition: prediction.predictedPosition,
      uncertaintyNm: prediction.uncertaintyNm,
    });

    return NextResponse.json({
      vesselId,
      prediction: {
        predictedPosition: prediction.predictedPosition,
        uncertaintyNm: prediction.uncertaintyNm,
        uncertaintyDegrees: prediction.uncertaintyDegrees,
        distanceTraveledNm: prediction.distanceTraveledNm,
        method: prediction.method,
      },
      probabilityCloud,
      metadata: {
        modelType,
        gapDurationHours,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    logError("Exception while generating prediction:", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * Baseline dead reckoning prediction (JavaScript implementation)
 * Matches Python baseline model logic
 */
async function predictPathBaseline(
  lastPosition: { lat: number; lon: number },
  lastSpeed: number,
  lastCourse: number,
  timeGapHours: number,
): Promise<{
  predictedPosition: [number, number];
  uncertaintyNm: number;
  uncertaintyDegrees: [number, number];
  distanceTraveledNm: number;
  method: string;
}> {
  const { lat, lon } = lastPosition;

  // Convert course to radians
  const courseRad = (lastCourse * Math.PI) / 180;

  // Calculate distance traveled (nautical miles)
  const distanceNm = lastSpeed * timeGapHours;

  // Earth radius in nautical miles
  const R = 3440.065;

  // Calculate new position using great circle navigation
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const distanceRad = distanceNm / R;

  // Calculate new latitude
  const newLatRad = Math.asin(
    Math.sin(latRad) * Math.cos(distanceRad) +
      Math.cos(latRad) * Math.sin(distanceRad) * Math.cos(courseRad)
  );

  // Calculate new longitude
  const newLonRad =
    lonRad +
    Math.atan2(
      Math.sin(courseRad) * Math.sin(distanceRad) * Math.cos(latRad),
      Math.cos(distanceRad) - Math.sin(latRad) * Math.sin(newLatRad)
    );

  const newLat = (newLatRad * 180) / Math.PI;
  const newLon = (newLonRad * 180) / Math.PI;

  // Calculate uncertainty
  const baseUncertainty = 5.0; // Base uncertainty (nm)
  const timeUncertainty = 0.1 * timeGapHours * lastSpeed;
  const totalUncertaintyNm = baseUncertainty + timeUncertainty;

  // Convert uncertainty to degrees
  const uncertaintyLat = totalUncertaintyNm / 60.0;
  const uncertaintyLon = totalUncertaintyNm / (60.0 * Math.cos(latRad));

  return {
    predictedPosition: [newLat, newLon],
    uncertaintyNm: totalUncertaintyNm,
    uncertaintyDegrees: [uncertaintyLat, uncertaintyLon],
    distanceTraveledNm: distanceNm,
    method: "dead_reckoning",
  };
}

/**
 * Generate probability cloud (grid of probabilities)
 */
function generateProbabilityCloud(
  predictedPosition: [number, number],
  uncertaintyDegrees: [number, number],
  gridSize: number = 50,
  numStd: number = 2.0
): {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    geometry: {
      type: "Point";
      coordinates: [number, number];
    };
    properties: {
      probability: number;
    };
  }>;
} {
  const [lat, lon] = predictedPosition;
  const [uncLat, uncLon] = uncertaintyDegrees;

  // Create grid
  const latRange = uncLat * numStd * 2;
  const lonRange = uncLon * numStd * 2;

  const latMin = lat - latRange / 2;
  const latMax = lat + latRange / 2;
  const lonMin = lon - lonRange / 2;
  const lonMax = lon + lonRange / 2;

  const features: Array<{
    type: "Feature";
    geometry: {
      type: "Point";
      coordinates: [number, number];
    };
    properties: {
      probability: number;
    };
  }> = [];

  // Generate grid points
  for (let i = 0; i < gridSize; i++) {
    for (let j = 0; j < gridSize; j++) {
      const gridLat = latMin + (latMax - latMin) * (i / (gridSize - 1));
      const gridLon = lonMin + (lonMax - lonMin) * (j / (gridSize - 1));

      // Calculate distance from center
      const dLat = (gridLat - lat) / uncLat;
      const dLon = (gridLon - lon) / uncLon;

      // Gaussian probability
      const probability = Math.exp(-0.5 * (dLat * dLat + dLon * dLon));

      features.push({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [gridLon, gridLat],
        },
        properties: {
          probability,
        },
      });
    }
  }

  // Normalize probabilities
  const totalProb = features.reduce((sum, f) => sum + f.properties.probability, 0);
  features.forEach((f) => {
    f.properties.probability = f.properties.probability / totalProb;
  });

  return {
    type: "FeatureCollection",
    features,
  };
}
