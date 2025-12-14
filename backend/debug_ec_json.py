import json
import sys
from pathlib import Path
from ec_core import compute_ec_from_ifc

# Setup paths
BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "uploads"
DB_PATH = BASE_DIR / "prac-database.csv"

# Pick a file
ifc_filename = "06d8e203_Ifc4_SampleHouse.ifc"
ifc_path = UPLOADS_DIR / ifc_filename

if not ifc_path.exists():
    print(f"Error: File {ifc_path} not found")
    sys.exit(1)

if not DB_PATH.exists():
    print(f"Error: Database {DB_PATH} not found")
    sys.exit(1)

try:
    # Run calculation
    result = compute_ec_from_ifc(ifc_path, DB_PATH)
    
    # Print formatted JSON
    # print(json.dumps(result, indent=2))

    # Debug: Check for void layers and volume calculation
    print("\n--- Debug: Detailed Layer Check for Floor ---")
    details = result.get("details", {}).get("elements", [])
    
    target_name = "Floor:Floor-Grnd-Susp_65Scr-80Ins-100Blk-75PC:286349"
    
    for el in details:
        if el.get("Name") == target_name:
             print(f"Material: {el.get('MaterialName')}")
             print(f"  Class: {el.get('MaterialClass')}")
             print(f"  Thickness: {el.get('LayerThickness')}")
             print(f"  Area: {el.get('Area_m2')}") # Note: Area might not be in details dict unless I added it. 
             # Wait, I didn't add Area_m2 to the 'details' output in ec_core.py, only to the internal rows.
             # But I can infer it from Volume / Thickness if calculated that way.
             print(f"  Volume: {el.get('Volume_m3')}")
             print("-" * 30)
except Exception as e:
    print(f"Error: {e}")
