"""
IDS (Information Delivery Specification) Manager Module

Handles loading, validating, and managing IDS XML files for IFC validation.
Supports both default templates and per-job uploaded IDS specifications.

Based on buildingSMART IDS guidelines:
- IDS files are XML with XSD schema validation
- Supports Entity, Property, Attribute, Classification, Material, and PartOf facets
- Specifications can be Required, Optional, or Prohibited
"""

from __future__ import annotations

import json
import shutil
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Any, Optional
from xml.etree import ElementTree as ET

import ifcopenshell
from ifctester import ids

from config import OUTPUT_DIR


# =============================================================================
# Configuration
# =============================================================================

# Directory where IDS templates are stored
IDS_TEMPLATES_DIR = Path(__file__).parent / "ids_templates"
IDS_DEFAULT_DIR = IDS_TEMPLATES_DIR / "default"
IDS_UPLOADED_DIR = IDS_TEMPLATES_DIR / "uploaded"


class IDSFacetType(str, Enum):
    """Types of IDS facets supported."""
    ENTITY = "entity"
    PROPERTY = "property"
    ATTRIBUTE = "attribute"
    CLASSIFICATION = "classification"
    MATERIAL = "material"
    PART_OF = "partOf"


class IDSOptionalitySetting(str, Enum):
    """IDS specification optionality settings."""
    REQUIRED = "required"      # minOccurs=1, maxOccurs=unbounded
    OPTIONAL = "optional"      # minOccurs=0, maxOccurs=unbounded
    PROHIBITED = "prohibited"  # minOccurs=0, maxOccurs=0


@dataclass
class IDSFacetResult:
    """Result of evaluating a single IDS facet."""
    facet_type: str
    facet_name: str
    passed: bool
    total_count: int
    pass_count: int
    fail_count: int
    message: str
    details: dict = field(default_factory=dict)


@dataclass
class IDSSpecResult:
    """Result of evaluating an IDS specification."""
    spec_name: str
    spec_description: str
    optionality: str
    passed: bool
    applicable_count: int
    failed_count: int
    ifc_schema: Optional[str]
    facet_results: list[IDSFacetResult] = field(default_factory=list)
    failed_entities: list[dict] = field(default_factory=list)


@dataclass
class IDSValidationResult:
    """Complete result of IDS validation against an IFC file."""
    ids_title: str
    ids_version: str
    ids_author: str
    ifc_filename: str
    overall_passed: bool
    total_specs: int
    passed_specs: int
    failed_specs: int
    spec_results: list[IDSSpecResult] = field(default_factory=list)
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "idsTitle": self.ids_title,
            "idsVersion": self.ids_version,
            "idsAuthor": self.ids_author,
            "ifcFilename": self.ifc_filename,
            "overallPassed": self.overall_passed,
            "totalSpecs": self.total_specs,
            "passedSpecs": self.passed_specs,
            "failedSpecs": self.failed_specs,
            "specResults": [
                {
                    "specName": sr.spec_name,
                    "specDescription": sr.spec_description,
                    "optionality": sr.optionality,
                    "passed": sr.passed,
                    "applicableCount": sr.applicable_count,
                    "failedCount": sr.failed_count,
                    "ifcSchema": sr.ifc_schema,
                    "facetResults": [
                        {
                            "facetType": fr.facet_type,
                            "facetName": fr.facet_name,
                            "passed": fr.passed,
                            "totalCount": fr.total_count,
                            "passCount": fr.pass_count,
                            "failCount": fr.fail_count,
                            "message": fr.message,
                            "details": fr.details,
                        }
                        for fr in sr.facet_results
                    ],
                    "failedEntities": sr.failed_entities[:10],  # Limit for response size
                }
                for sr in self.spec_results
            ],
        }


# =============================================================================
# IDS File Management
# =============================================================================

def ensure_ids_directories():
    """Ensure IDS template directories exist."""
    IDS_TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
    IDS_DEFAULT_DIR.mkdir(parents=True, exist_ok=True)
    IDS_UPLOADED_DIR.mkdir(parents=True, exist_ok=True)


def list_default_ids_files() -> list[Path]:
    """List all default IDS template files."""
    ensure_ids_directories()
    return list(IDS_DEFAULT_DIR.glob("*.ids"))


def list_uploaded_ids_files(job_id: str) -> list[Path]:
    """List IDS files uploaded for a specific job."""
    job_ids_dir = IDS_UPLOADED_DIR / job_id
    if not job_ids_dir.exists():
        return []
    return list(job_ids_dir.glob("*.ids"))


def get_job_ids_dir(job_id: str) -> Path:
    """Get the directory for a job's uploaded IDS files."""
    job_ids_dir = IDS_UPLOADED_DIR / job_id
    job_ids_dir.mkdir(parents=True, exist_ok=True)
    return job_ids_dir


def save_uploaded_ids(job_id: str, filename: str, content: bytes) -> Path:
    """
    Save an uploaded IDS file for a job.
    
    Args:
        job_id: The job ID
        filename: Original filename
        content: File content as bytes
        
    Returns:
        Path to the saved file
    """
    job_ids_dir = get_job_ids_dir(job_id)
    
    # Sanitize filename
    safe_filename = Path(filename).name
    if not safe_filename.endswith(".ids"):
        safe_filename += ".ids"
    
    file_path = job_ids_dir / safe_filename
    file_path.write_bytes(content)
    
    return file_path


def delete_uploaded_ids(job_id: str, filename: str) -> bool:
    """Delete an uploaded IDS file."""
    job_ids_dir = IDS_UPLOADED_DIR / job_id
    file_path = job_ids_dir / filename
    
    if file_path.exists() and file_path.is_file():
        file_path.unlink()
        return True
    return False


def cleanup_job_ids(job_id: str):
    """Remove all IDS files for a job."""
    job_ids_dir = IDS_UPLOADED_DIR / job_id
    if job_ids_dir.exists():
        shutil.rmtree(job_ids_dir)


# =============================================================================
# IDS File Validation (XSD-like checks)
# =============================================================================

def validate_ids_xml_structure(ids_path: Path) -> tuple[bool, list[str]]:
    """
    Perform basic structural validation on an IDS XML file.
    
    This checks for:
    - Valid XML structure
    - Required IDS elements
    - Valid specification structure
    
    Returns:
        Tuple of (is_valid, list of error messages)
    """
    errors = []
    
    if not ids_path.exists():
        return False, [f"File not found: {ids_path}"]
    
    try:
        tree = ET.parse(ids_path)
        root = tree.getroot()
    except ET.ParseError as e:
        return False, [f"Invalid XML: {str(e)}"]
    
    # Check for IDS namespace and root element
    # Note: IDS files use the namespace "http://standards.buildingsmart.org/IDS"
    ns = {"ids": "http://standards.buildingsmart.org/IDS"}
    
    # Basic structure check - look for specifications
    specs = root.findall(".//ids:specification", ns) or root.findall(".//specification")
    if not specs:
        # Try without namespace
        specs = root.findall(".//specification")
    
    if not specs:
        errors.append("No specifications found in IDS file")
    
    # Check each specification has applicability
    for spec in specs:
        spec_name = spec.get("name", "unnamed")
        applicability = spec.find("ids:applicability", ns) or spec.find("applicability")
        if applicability is None:
            errors.append(f"Specification '{spec_name}' missing applicability element")
    
    return len(errors) == 0, errors


# =============================================================================
# IDS Loading and Validation
# =============================================================================

def load_ids_file(ids_path: Path) -> Optional[ids.Ids]:
    """
    Load an IDS file using ifctester.
    
    Args:
        ids_path: Path to the .ids file
        
    Returns:
        ifctester Ids object or None if loading failed
    """
    try:
        loaded = ids.open(str(ids_path))
        # Verify it loaded successfully by checking specs
        if loaded and hasattr(loaded, 'specifications'):
            return loaded
        return None
    except Exception as e:
        # Log but don't crash - IDS files may have strict schema requirements
        print(f"Warning: Could not load IDS file {ids_path.name}: {e}")
        return None


def load_all_ids_for_job(job_id: str, include_defaults: bool = True) -> list[ids.Ids]:
    """
    Load all applicable IDS files for a job.
    
    Args:
        job_id: The job ID
        include_defaults: Whether to include default templates
        
    Returns:
        List of loaded IDS objects
    """
    loaded_ids = []
    
    # Load defaults
    if include_defaults:
        for ids_file in list_default_ids_files():
            loaded = load_ids_file(ids_file)
            if loaded:
                loaded_ids.append(loaded)
    
    # Load job-specific
    for ids_file in list_uploaded_ids_files(job_id):
        loaded = load_ids_file(ids_file)
        if loaded:
            loaded_ids.append(loaded)
    
    return loaded_ids


def validate_ifc_against_ids(
    ifc_model: ifcopenshell.file,
    ids_obj: ids.Ids,
    ifc_filename: str = ""
) -> IDSValidationResult:
    """
    Validate an IFC model against an IDS specification.
    
    Args:
        ifc_model: Loaded IFC model
        ids_obj: Loaded IDS object
        ifc_filename: Filename for reporting
        
    Returns:
        IDSValidationResult with detailed facet-level results
    """
    # Run validation
    ids_obj.validate(ifc_model)
    
    # Build result
    result = IDSValidationResult(
        ids_title=ids_obj.info.get("title", "Untitled"),
        ids_version=ids_obj.info.get("version", ""),
        ids_author=ids_obj.info.get("author", ""),
        ifc_filename=ifc_filename,
        overall_passed=True,
        total_specs=0,
        passed_specs=0,
        failed_specs=0,
    )
    
    # Process each specification
    for spec in ids_obj.specifications:
        spec_result = _process_specification_result(spec)
        result.spec_results.append(spec_result)
        result.total_specs += 1
        
        if spec_result.passed:
            result.passed_specs += 1
        else:
            result.failed_specs += 1
            result.overall_passed = False
    
    return result


def _process_specification_result(spec) -> IDSSpecResult:
    """Process a single IDS specification into a structured result."""
    # Determine optionality from minOccurs/maxOccurs
    min_occurs = getattr(spec, "minOccurs", 1)
    max_occurs = getattr(spec, "maxOccurs", "unbounded")
    
    if max_occurs == 0:
        optionality = IDSOptionalitySetting.PROHIBITED.value
    elif min_occurs == 0:
        optionality = IDSOptionalitySetting.OPTIONAL.value
    else:
        optionality = IDSOptionalitySetting.REQUIRED.value
    
    # Get IFC schema if specified
    ifc_schema = getattr(spec, "ifcVersion", None)
    if isinstance(ifc_schema, (list, tuple)):
        ifc_schema = ", ".join(ifc_schema) if ifc_schema else None
    
    spec_result = IDSSpecResult(
        spec_name=getattr(spec, "name", "unnamed"),
        spec_description=getattr(spec, "description", ""),
        optionality=optionality,
        passed=getattr(spec, "status", False),
        applicable_count=len(getattr(spec, "applicable_entities", [])),
        failed_count=len(getattr(spec, "failed_entities", [])),
        ifc_schema=ifc_schema,
    )
    
    # Process applicability facets
    applicability = getattr(spec, "applicability", [])
    for facet in applicability:
        facet_result = _process_facet(facet, "applicability")
        spec_result.facet_results.append(facet_result)
    
    # Process requirement facets
    requirements = getattr(spec, "requirements", [])
    for facet in requirements:
        facet_result = _process_facet(facet, "requirement")
        spec_result.facet_results.append(facet_result)
    
    # Add failed entities (limited)
    failed_entities = getattr(spec, "failed_entities", [])
    for entity in failed_entities[:10]:
        try:
            spec_result.failed_entities.append({
                "globalId": getattr(entity, "GlobalId", ""),
                "type": entity.is_a(),
                "name": getattr(entity, "Name", "") or "",
            })
        except Exception:
            pass
    
    return spec_result


def _process_facet(facet, context: str) -> IDSFacetResult:
    """Process a single IDS facet into a structured result."""
    facet_type = type(facet).__name__.lower().replace("ids", "")
    
    # Common attributes
    facet_name = ""
    details = {"context": context}
    
    if hasattr(facet, "name"):
        facet_name = str(facet.name) if facet.name else ""
        details["name"] = facet_name
    
    # Facet-specific details
    if facet_type == "entity":
        details["predefinedType"] = str(getattr(facet, "predefinedType", "")) or None
    elif facet_type == "property":
        details["propertySet"] = str(getattr(facet, "propertySet", "")) or ""
        details["baseName"] = str(getattr(facet, "baseName", "")) or facet_name
        details["dataType"] = str(getattr(facet, "dataType", "")) or None
        details["value"] = str(getattr(facet, "value", "")) if getattr(facet, "value", None) else None
    elif facet_type == "attribute":
        details["value"] = str(getattr(facet, "value", "")) if getattr(facet, "value", None) else None
    elif facet_type == "classification":
        details["system"] = str(getattr(facet, "system", "")) or ""
        details["value"] = str(getattr(facet, "value", "")) if getattr(facet, "value", None) else None
    elif facet_type == "material":
        details["value"] = str(getattr(facet, "value", "")) if getattr(facet, "value", None) else None
    elif facet_type == "partof":
        details["relation"] = str(getattr(facet, "relation", "")) or ""
    
    # Get status
    status = getattr(facet, "status", None)
    passed = status is True if status is not None else True
    
    return IDSFacetResult(
        facet_type=facet_type,
        facet_name=facet_name,
        passed=passed,
        total_count=0,  # Would need deeper inspection
        pass_count=0,
        fail_count=0,
        message=f"{facet_type.capitalize()} check: {facet_name}" if facet_name else f"{facet_type.capitalize()} check",
        details=details,
    )


# =============================================================================
# IDS Builder Helpers (for programmatic IDS creation)
# =============================================================================

def create_entity_requirement(
    spec: ids.Specification,
    entity_name: str,
    predefined_type: Optional[str] = None,
    as_applicability: bool = True
):
    """Add an entity facet to a specification."""
    entity_facet = ids.Entity(name=entity_name.upper())
    if predefined_type:
        entity_facet.predefinedType = predefined_type.upper()
    
    if as_applicability:
        spec.applicability.append(entity_facet)
    else:
        spec.requirements.append(entity_facet)


def create_property_requirement(
    spec: ids.Specification,
    property_set: str,
    property_name: str,
    data_type: Optional[str] = None,
    value: Optional[str] = None,
):
    """Add a property facet to a specification's requirements."""
    property_facet = ids.Property(
        propertySet=property_set,
        baseName=property_name,
    )
    if data_type:
        property_facet.dataType = data_type
    if value:
        property_facet.value = value
    
    spec.requirements.append(property_facet)


def create_attribute_requirement(
    spec: ids.Specification,
    attribute_name: str,
    value: Optional[str] = None,
):
    """Add an attribute facet to a specification's requirements."""
    attribute_facet = ids.Attribute(name=attribute_name)
    if value:
        attribute_facet.value = value
    
    spec.requirements.append(attribute_facet)


def create_classification_requirement(
    spec: ids.Specification,
    system: str,
    value: Optional[str] = None,
):
    """Add a classification facet to a specification's requirements."""
    classification_facet = ids.Classification(system=system)
    if value:
        classification_facet.value = value
    
    spec.requirements.append(classification_facet)


def create_material_requirement(
    spec: ids.Specification,
    value: Optional[str] = None,
):
    """Add a material facet to a specification's requirements."""
    material_facet = ids.Material()
    if value:
        material_facet.value = value
    
    spec.requirements.append(material_facet)


# =============================================================================
# Enhanced IDS Specification Builder
# =============================================================================

def build_enhanced_ids_specifications() -> ids.Ids:
    """
    Build enhanced IDS specifications with full facet support.
    
    Extends the basic entity checks with property, attribute, and material requirements.
    """
    my_ids = ids.Ids(
        title="Digital Twin Enhanced Validation",
        description="Comprehensive IDS-based validation for BIM viewer compatibility",
        author="Digital Twin System",
        version="2.0.0"
    )
    
    # ==========================================================================
    # CORE Specifications
    # ==========================================================================
    
    # CORE-IDS-001: IfcProject must exist with Name
    spec_project = ids.Specification(
        name="ProjectHasName",
        description="IfcProject must have a Name attribute",
        minOccurs=1,
        maxOccurs=1
    )
    create_entity_requirement(spec_project, "IFCPROJECT", as_applicability=True)
    create_attribute_requirement(spec_project, "Name")
    my_ids.specifications.append(spec_project)
    
    # CORE-IDS-002: Building Storeys must have elevation
    spec_storey_elev = ids.Specification(
        name="StoreysHaveElevation",
        description="IfcBuildingStorey should have Elevation attribute",
        minOccurs=0  # Optional
    )
    create_entity_requirement(spec_storey_elev, "IFCBUILDINGSTOREY", as_applicability=True)
    create_attribute_requirement(spec_storey_elev, "Elevation")
    my_ids.specifications.append(spec_storey_elev)
    
    # ==========================================================================
    # EC (Embodied Carbon) Specifications
    # ==========================================================================
    
    # EC-IDS-001: Walls should have material layers
    spec_wall_material = ids.Specification(
        name="WallsHaveMaterial",
        description="IfcWall elements should have material assignments",
        minOccurs=0  # Optional - informational
    )
    create_entity_requirement(spec_wall_material, "IFCWALL", as_applicability=True)
    create_material_requirement(spec_wall_material)
    my_ids.specifications.append(spec_wall_material)
    
    # EC-IDS-002: Slabs should have material
    spec_slab_material = ids.Specification(
        name="SlabsHaveMaterial",
        description="IfcSlab elements should have material assignments",
        minOccurs=0
    )
    create_entity_requirement(spec_slab_material, "IFCSLAB", as_applicability=True)
    create_material_requirement(spec_slab_material)
    my_ids.specifications.append(spec_slab_material)
    
    # ==========================================================================
    # HVAC/FM Specifications
    # ==========================================================================
    
    # HVAC-IDS-001: Spaces should have LongName
    spec_space_name = ids.Specification(
        name="SpacesHaveName",
        description="IfcSpace elements should have meaningful names",
        minOccurs=0
    )
    create_entity_requirement(spec_space_name, "IFCSPACE", as_applicability=True)
    create_attribute_requirement(spec_space_name, "LongName")
    my_ids.specifications.append(spec_space_name)
    
    # HVAC-IDS-002: Air terminals should have flow direction
    spec_terminal_flow = ids.Specification(
        name="AirTerminalsHaveFlowDirection",
        description="IfcAirTerminal should specify predefined type (supply/return/exhaust)",
        minOccurs=0
    )
    create_entity_requirement(spec_terminal_flow, "IFCAIRTERMINAL", as_applicability=True)
    # Checking that predefinedType attribute exists
    create_attribute_requirement(spec_terminal_flow, "PredefinedType")
    my_ids.specifications.append(spec_terminal_flow)
    
    # ==========================================================================
    # Occupancy Specifications
    # ==========================================================================
    
    # OCC-IDS-001: Spaces should have area quantities
    spec_space_area = ids.Specification(
        name="SpacesHaveAreaQuantity",
        description="IfcSpace should have Qto_SpaceBaseQuantities with area",
        minOccurs=0
    )
    create_entity_requirement(spec_space_area, "IFCSPACE", as_applicability=True)
    create_property_requirement(
        spec_space_area,
        property_set="Qto_SpaceBaseQuantities",
        property_name="NetFloorArea",
    )
    my_ids.specifications.append(spec_space_area)
    
    return my_ids


# =============================================================================
# Integration with Existing Validation
# =============================================================================

def merge_ids_results_to_validation_report(
    ids_result: IDSValidationResult,
    existing_results: list[dict]
) -> list[dict]:
    """
    Merge IDS validation results into the existing validation report format.
    
    This converts IDSSpecResults into the RuleResult dict format used by
    the existing validation system.
    """
    merged_results = list(existing_results)
    
    for spec_result in ids_result.spec_results:
        # Create a rule-like result from IDS spec
        rule_dict = {
            "ruleId": f"IDS-{spec_result.spec_name[:20]}",
            "ruleName": spec_result.spec_name,
            "description": spec_result.spec_description,
            "isIdsRule": True,
            "idsSource": "external",  # Mark as from external IDS file
            "thresholdPass": 100.0,
            "thresholdWarn": 50.0,
            "domain": _infer_domain_from_spec(spec_result),
            "severity": "pass" if spec_result.passed else (
                "warn" if spec_result.optionality == "optional" else "fail"
            ),
            "passed": spec_result.passed,
            "totalCount": spec_result.applicable_count,
            "passCount": spec_result.applicable_count - spec_result.failed_count,
            "failCount": spec_result.failed_count,
            "coveragePercent": (
                ((spec_result.applicable_count - spec_result.failed_count) / 
                 spec_result.applicable_count * 100)
                if spec_result.applicable_count > 0 else 100.0
            ),
            "message": _build_ids_message(spec_result),
            "examples": spec_result.failed_entities[:5],
            "recommendations": _build_ids_recommendations(spec_result),
            "facetDetails": [
                {
                    "type": fr.facet_type,
                    "name": fr.facet_name,
                    "passed": fr.passed,
                    "details": fr.details,
                }
                for fr in spec_result.facet_results
            ],
        }
        merged_results.append(rule_dict)
    
    return merged_results


def _infer_domain_from_spec(spec_result: IDSSpecResult) -> str:
    """Infer the domain from spec name/description."""
    name_lower = spec_result.spec_name.lower()
    desc_lower = spec_result.spec_description.lower()
    
    if any(kw in name_lower or kw in desc_lower for kw in ["project", "storey", "building", "site"]):
        return "core"
    elif any(kw in name_lower or kw in desc_lower for kw in ["hvac", "terminal", "space", "zone", "system"]):
        return "hvac_fm"
    elif any(kw in name_lower or kw in desc_lower for kw in ["material", "carbon", "wall", "slab", "column"]):
        return "ec"
    elif any(kw in name_lower or kw in desc_lower for kw in ["occupancy", "area", "person"]):
        return "occupancy"
    return "core"  # Default


def _build_ids_message(spec_result: IDSSpecResult) -> str:
    """Build a user-friendly message from IDS spec result."""
    if spec_result.passed:
        return f"Passed: {spec_result.applicable_count} entities checked"
    else:
        return (
            f"Failed: {spec_result.failed_count}/{spec_result.applicable_count} "
            f"entities did not meet requirements"
        )


def _build_ids_recommendations(spec_result: IDSSpecResult) -> list[str]:
    """Build recommendations from IDS spec failure."""
    if spec_result.passed:
        return []
    
    recommendations = []
    
    for facet in spec_result.facet_results:
        if not facet.passed:
            if facet.facet_type == "property":
                pset = facet.details.get("propertySet", "")
                prop = facet.details.get("baseName", facet.facet_name)
                recommendations.append(
                    f"Add property '{prop}' in property set '{pset}' to applicable elements"
                )
            elif facet.facet_type == "attribute":
                recommendations.append(
                    f"Ensure '{facet.facet_name}' attribute is set on applicable elements"
                )
            elif facet.facet_type == "material":
                recommendations.append(
                    "Assign materials to applicable elements"
                )
            elif facet.facet_type == "classification":
                system = facet.details.get("system", "")
                recommendations.append(
                    f"Add classification reference from '{system}' system"
                )
    
    if not recommendations:
        recommendations.append(f"Review requirements in specification: {spec_result.spec_name}")
    
    return recommendations[:3]  # Limit


# =============================================================================
# Public API
# =============================================================================

def get_ids_info(ids_path: Path) -> Optional[dict]:
    """Get basic info about an IDS file without full validation."""
    loaded = load_ids_file(ids_path)
    if not loaded:
        return None
    
    return {
        "title": loaded.info.get("title", "Untitled"),
        "version": loaded.info.get("version", ""),
        "author": loaded.info.get("author", ""),
        "description": loaded.info.get("description", ""),
        "specificationCount": len(loaded.specifications),
        "specifications": [
            {
                "name": s.name,
                "description": getattr(s, "description", ""),
                "minOccurs": getattr(s, "minOccurs", 1),
                "maxOccurs": getattr(s, "maxOccurs", "unbounded"),
            }
            for s in loaded.specifications[:20]  # Limit for preview
        ],
    }


def list_all_ids_templates() -> dict:
    """List all available IDS templates with their info."""
    ensure_ids_directories()
    
    templates = {
        "default": [],
        "uploaded": {},
    }
    
    # Default templates
    for ids_file in list_default_ids_files():
        info = get_ids_info(ids_file)
        if info:
            info["filename"] = ids_file.name
            info["path"] = str(ids_file)
            templates["default"].append(info)
    
    # Uploaded templates by job
    for job_dir in IDS_UPLOADED_DIR.iterdir():
        if job_dir.is_dir():
            job_id = job_dir.name
            templates["uploaded"][job_id] = []
            for ids_file in job_dir.glob("*.ids"):
                info = get_ids_info(ids_file)
                if info:
                    info["filename"] = ids_file.name
                    info["path"] = str(ids_file)
                    templates["uploaded"][job_id].append(info)
    
    return templates
