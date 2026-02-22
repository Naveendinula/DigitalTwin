"""
Debug script to inspect HVAC equipment and terminal detection.

Run from the backend directory:
    python debug_hvac.py <path_to_ifc_file>

Or use an existing job_id:
    python debug_hvac.py --job <job_id>
"""

import sys
import logging
from pathlib import Path

import ifcopenshell
from ifcopenshell.util import element as ifc_element
from ifcopenshell.util import system as ifc_system

logger = logging.getLogger(__name__)

from fm_hvac_core import (
    HVAC_KEYWORDS,
    EQUIPMENT_TYPE_HINTS,
    TERMINAL_TYPE_HINTS,
    _clean_text,
    _element_key,
    _element_matches_keywords,
    _is_terminal,
    _get_psets,
    _collect_equipment,
    analyze_hvac_fm,
)


def debug_element(element, reason: str):
    """Print detailed info about an element."""
    name = _clean_text(getattr(element, "Name", None))
    obj_type = _clean_text(getattr(element, "ObjectType", None))
    ifc_type = element.is_a()
    global_id = _element_key(element)
    
    logger.info(f"\n{'='*60}")
    logger.info(f"  Name:       {name or '(none)'}")
    logger.info(f"  IFC Type:   {ifc_type}")
    logger.info(f"  ObjectType: {obj_type or '(none)'}")
    logger.info(f"  GlobalId:   {global_id}")
    logger.info(f"  Reason:     {reason}")
    logger.info(f"  Is Terminal: {_is_terminal(element)}")
    
    # Show systems
    try:
        systems = ifc_system.get_element_systems(element) or []
        if systems:
            logger.info(f"  Systems:    {[_clean_text(getattr(s, 'Name', '')) for s in systems]}")
    except Exception:
        pass
    
    # Show space containment
    try:
        space = ifc_element.get_container(element, ifc_class="IfcSpace")
        if space:
            space_name = _clean_text(getattr(space, "Name", None))
            logger.info(f"  In Space:   {space_name}")
    except Exception:
        pass


def debug_all_terminals(model):
    """List all terminals in the model."""
    logger.info("\n" + "="*60)
    logger.info("ALL TERMINALS IN MODEL")
    logger.info("="*60)
    
    terminals = []
    for ifc_type in TERMINAL_TYPE_HINTS:
        try:
            elements = model.by_type(ifc_type)
            terminals.extend(elements)
        except Exception:
            pass
    
    logger.info(f"Found {len(terminals)} terminals")
    for t in terminals:
        name = _clean_text(getattr(t, "Name", None))
        ifc_type = t.is_a()
        global_id = _element_key(t)
        
        # Get space
        space_name = "(no space)"
        try:
            space = ifc_element.get_container(t, ifc_class="IfcSpace")
            if space:
                space_name = _clean_text(getattr(space, "Name", None))
        except Exception:
            pass
        
        logger.info(f"  - {name or '(unnamed)'} [{ifc_type}] in {space_name}")


def debug_equipment_detection(model):
    """Show what would be detected as equipment and why."""
    logger.info("\n" + "="*60)
    logger.info("EQUIPMENT DETECTION DEBUG")
    logger.info("="*60)
    
    # 1. Type-based detection
    logger.info("\n--- By IFC Type Hints ---")
    for ifc_type in EQUIPMENT_TYPE_HINTS:
        try:
            elements = model.by_type(ifc_type)
        except Exception:
            elements = []
        
        non_terminal = [e for e in elements if not _is_terminal(e)]
        terminal = [e for e in elements if _is_terminal(e)]
        
        logger.info(f"\n{ifc_type}: {len(non_terminal)} equipment, {len(terminal)} terminals (excluded)")
        for element in non_terminal[:5]:  # Limit output
            debug_element(element, f"Type: {ifc_type}")
        if len(non_terminal) > 5:
            logger.info(f"  ... and {len(non_terminal) - 5} more")
    
    # 2. Keyword-based detection (Proxies)
    logger.info("\n--- By Keyword (IfcBuildingElementProxy) ---")
    try:
        proxies = model.by_type("IfcBuildingElementProxy")
    except Exception:
        proxies = []
    
    matched = [e for e in proxies if _element_matches_keywords(e) and not _is_terminal(e)]
    logger.info(f"Found {len(matched)} matching proxies")
    for element in matched[:5]:
        debug_element(element, "Keyword match (Proxy)")
    
    # 3. Keyword-based detection (DistributionElements)
    logger.info("\n--- By Keyword (IfcDistributionElement) ---")
    try:
        dist = model.by_type("IfcDistributionElement")
    except Exception:
        dist = []
    
    matched_dist = [e for e in dist if _element_matches_keywords(e) and not _is_terminal(e)]
    matched_terminal = [e for e in dist if _element_matches_keywords(e) and _is_terminal(e)]
    
    logger.info(f"Found {len(matched_dist)} matching distribution elements")
    logger.info(f"Excluded {len(matched_terminal)} terminals that matched keywords")
    
    for element in matched_dist[:5]:
        debug_element(element, "Keyword match (Distribution)")
    
    if matched_terminal:
        logger.info("\n  Excluded terminals (keyword matched but are terminals):")
        for t in matched_terminal[:5]:
            name = _clean_text(getattr(t, "Name", None))
            ifc_type = t.is_a()
            logger.info(f"    - {name} [{ifc_type}]")


def debug_analysis_result(model):
    """Run the full analysis and show results."""
    logger.info("\n" + "="*60)
    logger.info("FULL ANALYSIS RESULT")
    logger.info("="*60)
    
    result = analyze_hvac_fm(model)
    summary = result["summary"]
    
    logger.info(f"\nSummary:")
    logger.info(f"  Equipment Count:        {summary['equipment_count']}")
    logger.info(f"  With Terminals:         {summary['equipment_with_terminals']}")
    logger.info(f"  Served Terminal Count:  {summary['served_terminal_count']}")
    logger.info(f"  Served Space Count:     {summary['served_space_count']}")
    
    logger.info(f"\nEquipment Details:")
    for eq in result["equipment"]:
        name = eq["name"] or "(unnamed)"
        terminal_count = len(eq["servedTerminals"])
        space_count = len(eq["servedSpaces"])
        storey = eq["storey"] or "(no storey)"
        
        logger.info(f"\n  {name}")
        logger.info(f"    GlobalId:   {eq['globalId']}")
        logger.info(f"    Storey:     {storey}")
        logger.info(f"    Terminals:  {terminal_count}")
        logger.info(f"    Spaces:     {space_count}")
        
        if eq["servedSpaces"]:
            logger.info(f"    Served Spaces:")
            for space in eq["servedSpaces"][:5]:
                logger.info(f"      - {space.get('name', '(unnamed)')}")


def main():
    if not logging.getLogger().handlers:
        logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s [%(name)s] %(message)s")

    if len(sys.argv) < 2:
        logger.info("Usage: python debug_hvac.py <path_to_ifc_file>")
        logger.info("       python debug_hvac.py --job <job_id>")
        sys.exit(1)
    
    if sys.argv[1] == "--job":
        job_id = sys.argv[2]
        ifc_path = Path("uploads") / f"{job_id}.ifc"
        if not ifc_path.exists():
            # Try looking in output folder
            output_dir = Path("output") / job_id
            if output_dir.exists():
                # Find the original upload
                for f in Path("uploads").glob("*.ifc"):
                    # This is a simplification - you may need to track the mapping
                    pass
            logger.info(f"Could not find IFC file for job {job_id}")
            sys.exit(1)
    else:
        ifc_path = Path(sys.argv[1])
    
    if not ifc_path.exists():
        logger.info(f"File not found: {ifc_path}")
        sys.exit(1)
    
    logger.info(f"Loading IFC file: {ifc_path}")
    model = ifcopenshell.open(str(ifc_path))
    
    debug_all_terminals(model)
    debug_equipment_detection(model)
    debug_analysis_result(model)


if __name__ == "__main__":
    main()

