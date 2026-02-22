import json
import sys
import logging
from pathlib import Path
from ec_core import compute_ec_from_ifc

logger = logging.getLogger(__name__)
if not logging.getLogger().handlers:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")

# Setup paths
BASE_DIR = Path(__file__).resolve().parent
UPLOADS_DIR = BASE_DIR / "uploads"
DB_PATH = BASE_DIR / "prac-database.csv"

# Pick a file
ifc_filename = "06d8e203_Ifc4_SampleHouse.ifc"
ifc_path = UPLOADS_DIR / ifc_filename

if not ifc_path.exists():
    logger.error(f"Error: File {ifc_path} not found")
    sys.exit(1)

if not DB_PATH.exists():
    logger.error(f"Error: Database {DB_PATH} not found")
    sys.exit(1)

try:
    # Run calculation
    result = compute_ec_from_ifc(ifc_path, DB_PATH)
    
    # Print formatted JSON
    # print(json.dumps(result, indent=2))

    # Debug: Check for void layers and volume calculation
    logger.info("\n--- Debug: Detailed Layer Check for Floor ---")
    details = result.get("details", {}).get("elements", [])
    
    target_name = "Floor:Floor-Grnd-Susp_65Scr-80Ins-100Blk-75PC:286349"
    
    for el in details:
        if el.get("Name") == target_name:
             logger.info(f"Material: {el.get('MaterialName')}")
             logger.info(f"  Class: {el.get('MaterialClass')}")
             logger.info(f"  Thickness: {el.get('LayerThickness')}")
             logger.info(f"  Area: {el.get('Area_m2')}") # Note: Area might not be in details dict unless I added it. 
             # Wait, I didn't add Area_m2 to the 'details' output in ec_core.py, only to the internal rows.
             # But I can infer it from Volume / Thickness if calculated that way.
             logger.info(f"  Volume: {el.get('Volume_m3')}")
             logger.info("-" * 30)
except Exception as e:
    logger.error(f"Error: {e}")
