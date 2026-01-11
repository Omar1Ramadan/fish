import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enable standalone output for Docker deployment
  output: "standalone",
  
  // Environment variables
  env: {
    ML_SERVER_URL: process.env.ML_SERVER_URL || "http://localhost:8000",
  },
};

export default nextConfig;
