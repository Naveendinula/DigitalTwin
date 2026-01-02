import sys
import os
import glob
import ifcopenshell

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
        print(f"Error: No IFC file found for job ID '{job_id}'")
        print(f"Searched in: {os.path.abspath(upload_dir)}")
        return

    ifc_path = files[0]
    print(f"\n=== Inspecting Job: {job_id} ===")
    print(f"File: {os.path.basename(ifc_path)}")
    print(f"Path: {ifc_path}")
    
    try:
        print("Loading model (this may take a moment)...")
        model = ifcopenshell.open(ifc_path)
        print(f"Schema: {model.schema}")
        
        project = model.by_type("IfcProject")
        if project:
            print(f"Project Name: {getattr(project[0], 'Name', 'N/A')}")
            print(f"GlobalId: {project[0].GlobalId}")
            
        print("\n--- Spatial Structure ---")
        sites = model.by_type("IfcSite")
        print(f"Sites: {len(sites)}")
        buildings = model.by_type("IfcBuilding")
        print(f"Buildings: {len(buildings)}")
        storeys = model.by_type("IfcBuildingStorey")
        print(f"Storeys: {len(storeys)}")
        spaces = model.by_type("IfcSpace")
        print(f"Spaces: {len(spaces)}")

        print("\n--- Common Elements ---")
        for type_name in ["IfcWall", "IfcWindow", "IfcDoor", "IfcSlab", "IfcCovering", "IfcMember", "IfcBeam", "IfcColumn"]:
            count = len(model.by_type(type_name))
            if count > 0:
                print(f"{type_name}: {count}")

        print("\n--- MEP Elements ---")
        for type_name in ["IfcDistributionElement", "IfcFlowTerminal", "IfcFlowController", "IfcFlowMovingDevice", "IfcFlowSegment", "IfcFlowFitting"]:
            count = len(model.by_type(type_name))
            if count > 0:
                print(f"{type_name}: {count}")
                
    except Exception as e:
        print(f"Error loading IFC: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python inspect_ifc.py <job_id>")
        print("Example: python inspect_ifc.py 30ab18ce")
    else:
        inspect(sys.argv[1])
