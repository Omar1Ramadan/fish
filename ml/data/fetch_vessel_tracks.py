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

# Try to load from .env file if python-dotenv is available
try:
    from dotenv import load_dotenv
    # Load .env file from project root (2 levels up from ml/data/)
    env_path = Path(__file__).parent.parent.parent / ".env.local"
    if env_path.exists():
        load_dotenv(env_path)
    # Also try .env in ml directory
    ml_env_path = Path(__file__).parent.parent / ".env"
    if ml_env_path.exists():
        load_dotenv(ml_env_path)
except ImportError:
    # python-dotenv not installed, skip .env loading
    pass


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
        
        # Clean the token (remove any whitespace/newlines)
        self.api_token = self.api_token.strip()
        
        # Debug: show token info (not the actual token for security)
        print(f"🔑 API token loaded (length: {len(self.api_token)}, starts: {self.api_token[:20]}..., ends: ...{self.api_token[-20:]})")
        
        self.base_url = "https://gateway.api.globalfishingwatch.org/v3/4wings/report"
        self.headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
        
        # Debug: show actual auth header (masked)
        auth_header = self.headers["Authorization"]
        print(f"🔐 Auth header: Bearer {auth_header[7:27]}...{auth_header[-20:]} (total: {len(auth_header)} chars)")
    
    def fetch_tracks(
        self,
        region_id: str,
        region_dataset: str = "public-eez-areas",
        start_date: str = None,
        end_date: str = None,
        dataset: str = "public-global-presence:latest",
        temporal_resolution: str = "HOURLY",
        group_by: str = "VESSEL_ID",
        spatial_resolution: str = "HIGH",
        output_dir: str = "data/raw",
    ) -> str:
        """
        Fetch vessel tracks for a region using GFW 4Wings Report API
        
        Args:
            region_id: EEZ/MPA region ID (e.g., "555635930" for Galapagos MPA)
            region_dataset: Region dataset (e.g., "public-mpa-all", "public-eez-areas")
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
            dataset: GFW dataset to query
            temporal_resolution: HOURLY, DAILY, MONTHLY, YEARLY, ENTIRE
            group_by: Group by VESSEL_ID, FLAG, GEARTYPE, MMSI, etc.
            spatial_resolution: LOW (0.1 degree) or HIGH (0.01 degree)
            output_dir: Directory to save results
            
        Returns:
            Path to saved data file
        """
        # Default to last 30 days if not specified
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
        if not start_date:
            start_date = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
        
        print(f"Fetching vessel tracks for region {region_id} ({region_dataset})")
        print(f"Date range: {start_date} to {end_date}")
        print(f"Dataset: {dataset}")
        
        # Query parameters (used for both GET and POST)
        params = {
            "format": "JSON",
            "temporal-resolution": temporal_resolution,
            "datasets[0]": dataset,
            "date-range": f"{start_date},{end_date}",
            "spatial-resolution": spatial_resolution,
            "spatial-aggregation": "false",  # Don't aggregate - we want individual points
            "group-by": group_by,
        }
        
        try:
            # Use POST with region in body (more reliable per GFW docs)
            # Query params go in URL, region goes in body
            body = {
                "region": {
                    "dataset": region_dataset,
                    "id": region_id,
                }
            }
            
            print(f"🌐 Making POST request to {self.base_url}")
            print(f"   Query params: {params}")
            print(f"   Body: {body}")
            
            response = requests.post(
                self.base_url, 
                params=params, 
                json=body, 
                headers=self.headers, 
                timeout=120  # Increased timeout for large reports
            )
            
            # Check for specific error cases
            if response.status_code == 422:
                error_data = response.json()
                print(f"❌ Validation error: {json.dumps(error_data, indent=2)}")
                raise requests.exceptions.HTTPError(f"422 Validation Error: {error_data}")
            
            if response.status_code == 429:
                error_data = response.json()
                print(f"⚠️ Rate limited - another report is running")
                print(f"   Details: {json.dumps(error_data, indent=2)}")
                raise requests.exceptions.HTTPError(f"429 Too Many Requests: {error_data}")
            
            response.raise_for_status()
            data = response.json()
            
            # Save raw data
            output_path = Path(output_dir)
            output_path.mkdir(parents=True, exist_ok=True)
            
            filename = f"tracks_{region_id}_{start_date}_{end_date}.json"
            filepath = output_path / filename
            
            with open(filepath, "w") as f:
                json.dump(data, f, indent=2)
            
            # Count entries
            entry_count = 0
            if data.get('entries'):
                for entry in data['entries']:
                    for dataset_key, records in entry.items():
                        entry_count += len(records) if records else 0
            
            print(f"✅ Saved {entry_count} records to {filepath}")
            return str(filepath)
            
        except requests.exceptions.RequestException as e:
            print(f"❌ Error fetching data: {e}")
            if hasattr(e, 'response') and e.response is not None:
                try:
                    print(f"Response: {e.response.text}")
                except Exception:
                    pass
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
    parser.add_argument("--api-token", help="GFW API token (or set FISH_API env var)")
    args = parser.parse_args()
    
    fetcher = VesselTrackFetcher(api_token=args.api_token)
    fetcher.fetch_tracks(
        region_id=args.region_id,
        region_dataset=args.region_dataset,
        start_date=args.start_date,
        end_date=args.end_date,
        output_dir=args.output_dir,
    )


if __name__ == "__main__":
    main()
