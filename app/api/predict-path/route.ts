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

// Python ML server URL
const ML_SERVER_URL = process.env.ML_SERVER_URL || "http://localhost:8000";

interface PredictPathRequest {
  vesselId: string;
  gapId?: string; // Optional gap ID for tracking
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
    timestamp?: string;
  }>;
  modelType?: "baseline" | "lstm";
  aggressionFactor?: number; // Multiplier for prediction distance (0.5-3.0)
}

// Timeout for ML server request (10 seconds)
const ML_REQUEST_TIMEOUT = 10000;

interface MLServerResponse {
  vessel_id: string;
  predicted_position: [number, number];
  uncertainty_nm: number;
  uncertainty_degrees: [number, number];
  method: string;
  model_confidence?: number;
  probability_cloud: {
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
  };
}

export async function POST(request: NextRequest) {
  log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  log("🔮 Incoming path prediction request");

  try {
    const body: PredictPathRequest = await request.json();
    const {
      vesselId,
      gapId,
      lastPosition,
      lastSpeed = 5.0,
      lastCourse = 0.0,
      gapDurationHours,
      sequence,
      modelType = "lstm", // Default to LSTM now!
      aggressionFactor = 1.0, // Default: no scaling
    } = body;

    log("📍 Request params:", {
      vesselId,
      gapId,
      lastPosition,
      gapDurationHours,
      modelType,
      aggressionFactor,
      hasSequence: !!sequence,
    });

    if (!vesselId || !lastPosition || !gapDurationHours) {
      return NextResponse.json(
        { error: "Missing required parameters: vesselId, lastPosition, gapDurationHours" },
        { status: 400 }
      );
    }

    // Try to call Python ML server first
    let mlServerAvailable = false;
    let mlResponse: MLServerResponse | null = null;

    try {
      log("🐍 Calling Python ML server at", ML_SERVER_URL);
      
      const mlRequest = {
        vessel_id: vesselId,
        last_position: {
          lat: lastPosition.lat,
          lon: lastPosition.lon,
          speed: lastSpeed,
          course: lastCourse,
        },
        gap_duration_hours: gapDurationHours,
        sequence: sequence?.map(s => ({
          lat: s.lat,
          lon: s.lon,
          speed: s.speed || 0,
          course: s.course || 0,
          timestamp: s.timestamp,
        })),
        model_type: modelType,
        aggression_factor: aggressionFactor, // Scale prediction distance
      };

      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), ML_REQUEST_TIMEOUT);

      try {
        const response = await fetch(`${ML_SERVER_URL}/predict`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(mlRequest),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          mlResponse = await response.json();
          mlServerAvailable = true;
          log("✅ ML server response received", {
            method: mlResponse?.method,
            confidence: mlResponse?.model_confidence,
          });
        } else {
          log("⚠️ ML server returned error:", response.status);
        }
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    } catch (mlError) {
      const errorName = mlError instanceof Error ? mlError.name : "Unknown";
      if (errorName === "AbortError") {
        log(`⚠️ ML server request timed out after ${ML_REQUEST_TIMEOUT}ms`);
      } else {
        log("⚠️ ML server not available, falling back to JS baseline:", mlError);
      }
    }

    // If ML server responded, use its prediction
    if (mlServerAvailable && mlResponse) {
      return NextResponse.json({
        vesselId,
        gapId,
        prediction: {
          predictedPosition: mlResponse.predicted_position,
          uncertaintyNm: mlResponse.uncertainty_nm,
          uncertaintyDegrees: mlResponse.uncertainty_degrees,
          distanceTraveledNm: 0, // Not provided by ML server
          method: mlResponse.method,
          confidence: mlResponse.model_confidence,
        },
        probabilityCloud: mlResponse.probability_cloud,
        metadata: {
          modelType: mlResponse.method,
          gapDurationHours,
          aggressionFactor,
          timestamp: new Date().toISOString(),
          mlServerUsed: true,
        },
      });
    }

    // Fallback to JavaScript baseline (only if ML server not available)
    log(`📐 Using JavaScript baseline fallback (aggression=${aggressionFactor}x)`);
    const prediction = await predictPathBaseline(
      lastPosition,
      lastSpeed,
      lastCourse,
      gapDurationHours * aggressionFactor, // Scale gap by aggression
    );

    // Generate probability cloud
    const probabilityCloud = generateProbabilityCloud(
      prediction.predictedPosition,
      prediction.uncertaintyDegrees,
    );

    log("✅ Prediction generated (JS fallback)", {
      predictedPosition: prediction.predictedPosition,
      uncertaintyNm: prediction.uncertaintyNm,
      method: "js_fallback",
    });

    return NextResponse.json({
      vesselId,
      gapId,
      prediction: {
        predictedPosition: prediction.predictedPosition,
        uncertaintyNm: prediction.uncertaintyNm,
        uncertaintyDegrees: prediction.uncertaintyDegrees,
        distanceTraveledNm: prediction.distanceTraveledNm,
        method: prediction.method + "_js_fallback",
      },
      probabilityCloud,
      metadata: {
        modelType: "baseline_js_fallback",
        gapDurationHours,
        timestamp: new Date().toISOString(),
        mlServerUsed: false,
        warning: "ML server not available - using JavaScript fallback",
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
 * Baseline dead reckoning prediction (JavaScript fallback)
 * Only used when Python ML server is not available
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
 * Only used for JS fallback
 */
function generateProbabilityCloud(
  predictedPosition: [number, number],
  uncertaintyDegrees: [number, number],
  gridSize: number = 40,
  numStd: number = 2.5
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
