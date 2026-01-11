#!/usr/bin/env python3
"""
Fetch vessel tracks from GFW 4Wings Report API
Simplified data fetcher for Dark Zone Predictor training data
"""

import os
import json
import csv
from datetime import datetime, timedelta
from typing import Dict, List, Optional
import requests
from pathlib import Path


class VesselTrackFetcher:
    """Fetch vessel presence/track data from GFW API"""
    
    def __init__(self, api_token: Optional[str] = None):
        """
        Initialize fetcher
        
        Args:
            api_token: GFW API token (or use FISH_API env var)
        """
        self.api_token = api_token or os.getenv("FISH_API")
        if not self.api_token:
            raise ValueError("API token required. Set FISH_API env var or pass api_token")
        
        self.base_url = "https://gateway.api.globalfishingwatch.org/v3/4wings/report"
        self.headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Accept": "application/json",
        }
    
    def fetch_tracks(
        self,
        region_id: str,
        region_dataset: str = "public-eez-areas",
        start_date: str = None,
        end_date: str = None,
        dataset: str = "public-global-presence:latest",
        temporal_resolution: str = "HOURLY",
        group_by: str = "VESSEL_ID",
        output_dir: str = "data/raw",
    ) -> str:
        """
        Fetch vessel tracks for a region
        
        Args:
            region_id: EEZ/MPA region ID
            region_dataset: Region dataset (e.g., "public-eez-areas")
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
            dataset: GFW dataset to query
            temporal_resolution: HOURLY, DAILY, etc.
            group_by: Group by VESSEL_ID, MMSI, etc.
            output_dir: Directory to save results
            
        Returns:
            Path to saved data file
        """
        # Default to last 30 days if not specified
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
        if not start_date:
            start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        
        print(f"Fetching vessel tracks for region {region_id}")
        print(f"Date range: {start_date} to {end_date}")
        
        # Build request
        url = self.base_url
        params = {
            "format": "JSON",
            "temporal-resolution": temporal_resolution,
            "datasets[0]": dataset,
            "date-range": f"{start_date},{end_date}",
            "spatial-resolution": "HIGH",  # Get detailed positions
            "spatial-aggregation": "false",  # Don't aggregate - we want individual points
            "group-by": group_by,
        }
        
        # Add region filter
        # Note: GFW API uses region-id and region-dataset as query params
        # But 4Wings Report API might need them in the request body
        # We'll use the region in a POST body if needed
        
        try:
            # Try GET first (some endpoints support GET with region params)
            response = requests.get(url, params=params, headers=self.headers, timeout=60)
            
            # If GET doesn't work, try POST with region in body
            if response.status_code == 400 or response.status_code == 405:
                body = {
                    "region": {
                        "dataset": region_dataset,
                        "id": region_id,
                    },
                    **params
                }
                response = requests.post(url, json=body, headers=self.headers, timeout=60)
            
            response.raise_for_status()
            data = response.json()
            
            # Save raw data
            output_path = Path(output_dir)
            output_path.mkdir(parents=True, exist_ok=True)
            
            filename = f"tracks_{region_id}_{start_date}_{end_date}.json"
            filepath = output_path / filename
            
            with open(filepath, "w") as f:
                json.dump(data, f, indent=2)
            
            print(f"✅ Saved {len(data.get('entries', []))} entries to {filepath}")
            return str(filepath)
            
        except requests.exceptions.RequestException as e:
            print(f"❌ Error fetching data: {e}")
            if hasattr(e, 'response') and e.response is not None:
                print(f"Response: {e.response.text}")
            raise
    
    def fetch_multiple_regions(
        self,
        regions: List[Dict[str, str]],
        start_date: str,
        end_date: str,
        output_dir: str = "data/raw",
    ) -> List[str]:
        """
        Fetch tracks for multiple regions
        
        Args:
            regions: List of dicts with 'id' and 'dataset' keys
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
            output_dir: Directory to save results
            
        Returns:
            List of file paths
        """
        filepaths = []
        for region in regions:
            try:
                filepath = self.fetch_tracks(
                    region_id=region["id"],
                    region_dataset=region.get("dataset", "public-eez-areas"),
                    start_date=start_date,
                    end_date=end_date,
                    output_dir=output_dir,
                )
                filepaths.append(filepath)
            except Exception as e:
                print(f"⚠️ Failed to fetch region {region['id']}: {e}")
                continue
        
        return filepaths


def main():
    """Example usage"""
    import argparse
    
    parser = argparse.ArgumentParser(description="Fetch vessel tracks from GFW API")
    parser.add_argument("--region-id", required=True, help="EEZ/MPA region ID")
    parser.add_argument("--region-dataset", default="public-eez-areas", help="Region dataset")
    parser.add_argument("--start-date", help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end-date", help="End date (YYYY-MM-DD)")
    parser.add_argument("--output-dir", default="data/raw", help="Output directory")
    args = parser.parse_args()
    
    fetcher = VesselTrackFetcher()
    fetcher.fetch_tracks(
        region_id=args.region_id,
        region_dataset=args.region_dataset,
        start_date=args.start_date,
        end_date=args.end_date,
        output_dir=args.output_dir,
    )


if __name__ == "__main__":
    main()
