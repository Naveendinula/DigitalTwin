import sys
import os
import glob
import logging
import ifcopenshell

logger = logging.getLogger(__name__)

def inspect(job_id):
    # Determine paths
    # Assumes script is run from 'backend' directory or project root
    current_dir = os.getcwd()
    if os.path.basename(current_dir) == 'backend':
        upload_dir = 'uploads'
    elif os.path.exists(os.path.join(current_dir, 'backend', 'uploads')):
        upload_dir = os.path.join('backend', 'uploads')
    else:
        # Fallback to relative path assuming standard structure
        upload_dir = 'uploads'

    # Find the file
    pattern = os.path.join(upload_dir, f"{job_id}_*.ifc")
    files = glob.glob(pattern)
    
    if not files:
        logger.error(f"Error: No IFC file found for job ID '{job_id}'")
        logger.error(f"Searched in: {os.path.abspath(upload_dir)}")
        return

    ifc_path = files[0]
    logger.info(f"\n=== Inspecting Job: {job_id} ===")
    logger.info(f"File: {os.path.basename(ifc_path)}")
    logger.info(f"Path: {ifc_path}")
    
    try:
        logger.info("Loading model (this may take a moment)...")
        model = ifcopenshell.open(ifc_path)
        logger.info(f"Schema: {model.schema}")
        
        project = model.by_type("IfcProject")
        if project:
            logger.info(f"Project Name: {getattr(project[0], 'Name', 'N/A')}")
            logger.info(f"GlobalId: {project[0].GlobalId}")
            
        logger.info("\n--- Spatial Structure ---")
        sites = model.by_type("IfcSite")
        logger.info(f"Sites: {len(sites)}")
        buildings = model.by_type("IfcBuilding")
        logger.info(f"Buildings: {len(buildings)}")
        storeys = model.by_type("IfcBuildingStorey")
        logger.info(f"Storeys: {len(storeys)}")
        spaces = model.by_type("IfcSpace")
        logger.info(f"Spaces: {len(spaces)}")

        logger.info("\n--- Common Elements ---")
        for type_name in ["IfcWall", "IfcWindow", "IfcDoor", "IfcSlab", "IfcCovering", "IfcMember", "IfcBeam", "IfcColumn"]:
            count = len(model.by_type(type_name))
            if count > 0:
                logger.info(f"{type_name}: {count}")

        logger.info("\n--- MEP Elements ---")
        for type_name in ["IfcDistributionElement", "IfcFlowTerminal", "IfcFlowController", "IfcFlowMovingDevice", "IfcFlowSegment", "IfcFlowFitting"]:
            count = len(model.by_type(type_name))
            if count > 0:
                logger.info(f"{type_name}: {count}")
                
    except Exception as e:
        logger.error(f"Error loading IFC: {e}")

if __name__ == "__main__":
    if not logging.getLogger().handlers:
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")
    if len(sys.argv) < 2:
        logger.error("Usage: python inspect_ifc.py <job_id>")
        logger.error("Example: python inspect_ifc.py 30ab18ce")
    else:
        inspect(sys.argv[1])
