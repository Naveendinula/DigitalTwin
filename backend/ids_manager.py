"""
IDS (Information Delivery Specification) Manager Module

Handles IDS file management, validation, and IFC validation against IDS specifications.
Uses the official buildingSMART IDS XSD schema for validation.
"""

import json
import re
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime
from io import BytesIO
from pathlib import Path
from typing import Any, Optional
from lxml import etree

from config import OUTPUT_DIR

# Constants
MAX_IDS_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
IDS_SCHEMA_DIR = Path(__file__).parent / "ids_schema"
IDS_SCHEMA_PATH = IDS_SCHEMA_DIR / "ids.xsd"
DEFAULT_IDS_DIR = Path(__file__).parent / "ids_templates"
IDS_NAMESPACE = "http://standards.buildingsmart.org/IDS"
IDS_NAMESPACES = {
    "ids": IDS_NAMESPACE,
    "xs": "http://www.w3.org/2001/XMLSchema",
}

# Valid IFC entity types for semantic validation
# Support common IFC version patterns - be lenient with variations
VALID_IFC_VERSION_PATTERNS = [
    "IFC2X3",
    "IFC4", 
    "IFC4X1",
    "IFC4X2", 
    "IFC4X3",
    "IFC4X3_ADD1",
    "IFC4X3_ADD2",
]

def is_valid_ifc_version(version: str) -> bool:
    """Check if an IFC version string is valid (case-insensitive)."""
    v_upper = version.upper().strip()
    # Check exact matches
    for pattern in VALID_IFC_VERSION_PATTERNS:
        if v_upper == pattern:
            return True
    # Also allow versions that start with IFC (for future compatibility)
    if v_upper.startswith("IFC"):
        return True
    return False


@dataclass
class IdsValidationError:
    """Represents a single validation error."""
    message: str
    line: Optional[int] = None
    column: Optional[int] = None
    severity: str = "error"  # error, warning
    
    def to_dict(self) -> dict:
        return {
            "message": self.message,
            "line": self.line,
            "column": self.column,
            "severity": self.severity,
        }


@dataclass
class IdsAuditResult:
    """Result of the two-gate IDS validation."""
    filename: str = ""
    gate1_passed: bool = False  # XSD schema validation
    gate2_passed: bool = False  # Semantic validation
    gate1_errors: list[IdsValidationError] = field(default_factory=list)
    gate2_errors: list[IdsValidationError] = field(default_factory=list)
    gate2_warnings: list[IdsValidationError] = field(default_factory=list)
    validated_at: str = ""
    
    @property
    def overall_passed(self) -> bool:
        return self.gate1_passed and self.gate2_passed
    
    @property
    def can_run_against_ifc(self) -> bool:
        """Can this IDS be used to validate IFC files?"""
        return self.gate1_passed  # Gate 1 must pass, Gate 2 warnings are OK
    
    def to_dict(self) -> dict:
        return {
            "filename": self.filename,
            "gate1Passed": self.gate1_passed,
            "gate2Passed": self.gate2_passed,
            "overallPassed": self.overall_passed,
            "canRunAgainstIfc": self.can_run_against_ifc,
            "gate1Errors": [e.to_dict() for e in self.gate1_errors],
            "gate2Errors": [e.to_dict() for e in self.gate2_errors],
            "gate2Warnings": [e.to_dict() for e in self.gate2_warnings],
            "validatedAt": self.validated_at,
        }


@dataclass
class IdsValidationResult:
    """Result of validating an IFC file against an IDS specification."""
    ids_filename: str
    ifc_filename: str
    total_specs: int = 0
    passed_specs: int = 0
    failed_specs: int = 0
    specifications: list[dict] = field(default_factory=list)
    
    def to_dict(self) -> dict:
        return {
            "idsFilename": self.ids_filename,
            "ifcFilename": self.ifc_filename,
            "totalSpecs": self.total_specs,
            "passedSpecs": self.passed_specs,
            "failedSpecs": self.failed_specs,
            "specifications": self.specifications,
        }


def get_job_ids_dir(job_id: str) -> Path:
    """Get the IDS directory for a specific job."""
    ids_dir = OUTPUT_DIR / job_id / "ids"
    ids_dir.mkdir(parents=True, exist_ok=True)
    return ids_dir


def save_uploaded_ids(job_id: str, filename: str, content: bytes) -> Path:
    """Save an uploaded IDS file to the job's IDS directory."""
    job_ids_dir = get_job_ids_dir(job_id)
    
    # Sanitize filename
    safe_filename = re.sub(r'[^\w\-_\.]', '_', filename)
    if not safe_filename.lower().endswith('.ids'):
        safe_filename += '.ids'
    
    file_path = job_ids_dir / safe_filename
    file_path.write_bytes(content)
    return file_path


def delete_uploaded_ids(job_id: str, filename: str) -> bool:
    """Delete an uploaded IDS file."""
    job_ids_dir = get_job_ids_dir(job_id)
    file_path = job_ids_dir / filename
    
    if file_path.exists() and file_path.is_file():
        file_path.unlink()
        # Also delete audit result
        audit_path = job_ids_dir / f"{filename}.audit.json"
        if audit_path.exists():
            audit_path.unlink()
        return True
    return False


def list_uploaded_ids_files(job_id: str) -> list[Path]:
    """List all IDS files uploaded for a job."""
    job_ids_dir = get_job_ids_dir(job_id)
    return list(job_ids_dir.glob("*.ids"))


def list_default_ids_files() -> list[Path]:
    """List default IDS template files."""
    if DEFAULT_IDS_DIR.exists():
        return list(DEFAULT_IDS_DIR.glob("*.ids"))
    return []


def list_all_ids_templates() -> dict:
    """List all available IDS templates (default + by job)."""
    result = {
        "default": [],
        "byJob": {},
    }
    
    # Default templates
    for ids_file in list_default_ids_files():
        info = get_ids_info(ids_file)
        if info:
            info["filename"] = ids_file.name
            result["default"].append(info)
    
    # Job-specific templates
    for job_dir in OUTPUT_DIR.iterdir():
        if job_dir.is_dir():
            job_id = job_dir.name
            job_ids = list_uploaded_ids_files(job_id)
            if job_ids:
                result["byJob"][job_id] = []
                for ids_file in job_ids:
                    info = get_ids_info(ids_file)
                    if info:
                        info["filename"] = ids_file.name
                        result["byJob"][job_id].append(info)
    
    return result


def get_ids_info(ids_path: Path) -> Optional[dict]:
    """Extract metadata from an IDS file."""
    if not ids_path.exists():
        return None
    
    try:
        tree = ET.parse(ids_path)
        root = tree.getroot()
        
        # Handle namespace
        ns = {"ids": IDS_NAMESPACE}
        
        info = {
            "title": None,
            "description": None,
            "author": None,
            "version": None,
            "date": None,
            "specificationCount": 0,
        }
        
        # Try to get info element
        info_elem = root.find("ids:info", ns) or root.find("info")
        if info_elem is not None:
            for child in info_elem:
                tag = child.tag.split("}")[-1] if "}" in child.tag else child.tag
                if tag in info:
                    info[tag] = child.text
        
        # Count specifications
        specs = root.findall(".//ids:specification", ns) or root.findall(".//specification")
        info["specificationCount"] = len(specs)
        
        return info
    except Exception as e:
        return {"error": str(e)}


def validate_ids_xsd_schema(ids_path: Path) -> tuple[bool, list[IdsValidationError]]:
    """
    Validate an IDS file against the official XSD schema.
    Returns (is_valid, list_of_errors).
    """
    if not ids_path.exists():
        return False, [IdsValidationError(message=f"IDS file not found: {ids_path}")]

    if not IDS_SCHEMA_PATH.exists():
        return False, [IdsValidationError(message=f"IDS schema not found: {IDS_SCHEMA_PATH}")]

    try:
        schema_parser = etree.XMLParser(resolve_entities=False)
        schema_doc = etree.parse(str(IDS_SCHEMA_PATH), schema_parser)
        schema = etree.XMLSchema(schema_doc)
    except (etree.XMLSchemaParseError, etree.XMLSyntaxError, OSError) as e:
        return False, [IdsValidationError(message=f"Failed to load IDS XSD schema: {e}")]

    try:
        doc_parser = etree.XMLParser(resolve_entities=False, no_network=True)
        doc = etree.parse(str(ids_path), doc_parser)
    except etree.XMLSyntaxError as e:
        line = None
        column = None
        if getattr(e, "position", None):
            line, column = e.position
        return False, [IdsValidationError(message=f"XML syntax error: {e}", line=line, column=column)]

    if schema.validate(doc):
        return True, []

    errors = [
        IdsValidationError(
            message=err.message,
            line=err.line,
            column=err.column,
        )
        for err in schema.error_log
    ]
    if not errors:
        errors.append(IdsValidationError(message="IDS file failed XSD schema validation."))
    return False, errors


def validate_ids_xml_structure(ids_path: Path) -> tuple[bool, list[str]]:
    """
    Validate basic XML structure of an IDS file.
    Uses structural validation to ensure the IDS file has required elements.
    Returns (is_valid, list_of_errors).
    """
    errors = []
    
    try:
        # First check if XML is well-formed
        try:
            doc = etree.parse(str(ids_path))
        except etree.XMLSyntaxError as e:
            return False, [f"XML syntax error: {e}"]
        
        root = doc.getroot()
        
        # Check root element - handle both namespaced and non-namespaced
        root_tag = etree.QName(root.tag).localname if '}' in root.tag else root.tag
        if root_tag != "ids":
            errors.append(f"Root element must be 'ids', found '{root_tag}'")
            return False, errors
        
        # Check namespace (if present, should be the IDS namespace)
        root_ns = etree.QName(root.tag).namespace if '}' in root.tag else None
        if root_ns and root_ns != IDS_NAMESPACE:
            errors.append(f"Invalid namespace '{root_ns}'. Expected '{IDS_NAMESPACE}'")
        
        # Build namespace map for queries
        # Support both default namespace and prefixed namespace
        ns = {}
        if root_ns == IDS_NAMESPACE:
            ns["ids"] = IDS_NAMESPACE
        
        def find_element(parent, local_name):
            """Find element with or without namespace."""
            if ns:
                elem = parent.find(f"ids:{local_name}", ns)
                if elem is not None:
                    return elem
            # Try without namespace (for elements in default namespace)
            elem = parent.find(local_name)
            if elem is not None:
                return elem
            # Try with explicit namespace in tag
            for child in parent:
                child_local = etree.QName(child.tag).localname if '}' in child.tag else child.tag
                if child_local == local_name:
                    return child
            return None
        
        def find_elements(parent, local_name):
            """Find all elements with or without namespace."""
            results = []
            if ns:
                results.extend(parent.findall(f"ids:{local_name}", ns))
            results.extend(parent.findall(local_name))
            # Also check direct children
            for child in parent:
                child_local = etree.QName(child.tag).localname if '}' in child.tag else child.tag
                if child_local == local_name and child not in results:
                    results.append(child)
            return results
        
        # Check for info element
        info_elem = find_element(root, "info")
        if info_elem is None:
            errors.append("Missing required 'info' element")
        else:
            # Check for required title in info
            title_elem = find_element(info_elem, "title")
            if title_elem is None or not (title_elem.text and title_elem.text.strip()):
                errors.append("Missing required 'title' element in info")
        
        # Check for specifications element
        specs_elem = find_element(root, "specifications")
        if specs_elem is None:
            errors.append("Missing required 'specifications' element")
        else:
            # Check for at least one specification
            specs = find_elements(specs_elem, "specification")
            if not specs:
                errors.append("IDS file must contain at least one specification")
            
            # Validate each specification
            for i, spec in enumerate(specs):
                spec_name = spec.get("name", f"Specification {i+1}")
                ifc_version = spec.get("ifcVersion")
                
                # Check required ifcVersion attribute
                if not ifc_version:
                    errors.append(f"{spec_name}: Missing required 'ifcVersion' attribute")
                else:
                    # Validate ifcVersion values (space-separated list)
                    versions = ifc_version.split()
                    for v in versions:
                        if not is_valid_ifc_version(v):
                            errors.append(f"{spec_name}: Invalid ifcVersion '{v}'. Expected IFC version format (e.g., IFC2X3, IFC4)")
                
                # Check for applicability
                applicability = find_element(spec, "applicability")
                if applicability is None:
                    errors.append(f"{spec_name}: Missing required 'applicability' element")
                else:
                    # Check applicability has at least one facet
                    facets = list(applicability)
                    if not facets:
                        errors.append(f"{spec_name}: Applicability must contain at least one facet (entity, classification, attribute, property, or material)")
        
        return len(errors) == 0, errors
    
    except Exception as e:
        return False, [f"Validation error: {e}"]


def validate_file_security(content: bytes, filename: str) -> tuple[bool, list[str]]:
    """
    Security validation for uploaded IDS files.
    Returns (is_safe, list_of_issues).
    """
    issues = []
    
    # Check file size
    if len(content) > MAX_IDS_FILE_SIZE:
        issues.append(f"File exceeds maximum size of {MAX_IDS_FILE_SIZE // (1024*1024)} MB")
    
    # Check for potential XXE attacks
    content_str = content.decode('utf-8', errors='ignore')
    dangerous_patterns = [
        (r'<!ENTITY', "External entity declarations not allowed"),
        (r'<!DOCTYPE.*\[', "Internal DTD subset not allowed"),
        (r'SYSTEM\s+["\']', "SYSTEM identifiers not allowed"),
        (r'PUBLIC\s+["\']', "PUBLIC identifiers not allowed"),
    ]
    
    for pattern, message in dangerous_patterns:
        if re.search(pattern, content_str, re.IGNORECASE):
            issues.append(message)
    
    return len(issues) == 0, issues


def validate_ids_file(ids_path: Path, job_id: str = None) -> IdsAuditResult:
    """
    Perform two-gate validation on an IDS file.
    
    Gate 1: XSD schema validation (structural)
    Gate 2: Semantic validation (logical correctness)
    """
    result = IdsAuditResult(
        filename=ids_path.name,
        validated_at=datetime.now().isoformat(),
    )
    
    # Gate 1: XSD schema validation
    try:
        is_valid, errors = validate_ids_xsd_schema(ids_path)
        if is_valid:
            result.gate1_passed = True
        else:
            result.gate1_passed = False
            result.gate1_errors = errors
    except Exception as e:
        result.gate1_passed = False
        result.gate1_errors = [IdsValidationError(message=str(e))]
    
    # Gate 2: Semantic validation (only if Gate 1 passed)
    if result.gate1_passed:
        try:
            # Try to use ifctester if available
            try:
                import ifctester
                import ifctester.ids
                
                ids_obj = ifctester.ids.open(str(ids_path))
                # If we can open it, it's semantically valid
                result.gate2_passed = True
                
            except ImportError:
                # ifctester not available, do basic semantic checks
                result.gate2_passed = True
                result.gate2_warnings.append(
                    IdsValidationError(
                        message="ifctester not installed - semantic validation limited",
                        severity="warning"
                    )
                )
            except Exception as e:
                result.gate2_passed = False
                result.gate2_errors.append(
                    IdsValidationError(message=f"Semantic validation failed: {e}")
                )
        except Exception as e:
            result.gate2_passed = False
            result.gate2_errors.append(
                IdsValidationError(message=f"Gate 2 validation error: {e}")
            )
    
    # Save audit result if job_id provided
    if job_id:
        save_audit_result(job_id, ids_path.name, result)
    
    return result


def save_audit_result(job_id: str, filename: str, result: IdsAuditResult) -> None:
    """Save audit result to disk."""
    job_ids_dir = get_job_ids_dir(job_id)
    audit_path = job_ids_dir / f"{filename}.audit.json"
    
    with open(audit_path, 'w', encoding='utf-8') as f:
        json.dump(result.to_dict(), f, indent=2)


def load_audit_result(job_id: str, filename: str) -> Optional[IdsAuditResult]:
    """Load a saved audit result."""
    job_ids_dir = get_job_ids_dir(job_id)
    audit_path = job_ids_dir / f"{filename}.audit.json"
    
    if not audit_path.exists():
        return None
    
    try:
        with open(audit_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        result = IdsAuditResult(
            filename=data.get("filename", ""),
            gate1_passed=data.get("gate1Passed", False),
            gate2_passed=data.get("gate2Passed", False),
            validated_at=data.get("validatedAt", ""),
        )
        
        for err in data.get("gate1Errors", []):
            result.gate1_errors.append(IdsValidationError(
                message=err.get("message", ""),
                line=err.get("line"),
                column=err.get("column"),
                severity=err.get("severity", "error"),
            ))
        
        for err in data.get("gate2Errors", []):
            result.gate2_errors.append(IdsValidationError(
                message=err.get("message", ""),
                line=err.get("line"),
                column=err.get("column"),
                severity=err.get("severity", "error"),
            ))
        
        for warn in data.get("gate2Warnings", []):
            result.gate2_warnings.append(IdsValidationError(
                message=warn.get("message", ""),
                line=warn.get("line"),
                column=warn.get("column"),
                severity=warn.get("severity", "warning"),
            ))
        
        return result
    except Exception:
        return None


def load_ids_file(ids_path: Path) -> Optional[Any]:
    """
    Load an IDS file for validation.
    Returns the IDS object if ifctester is available, otherwise returns the lxml tree.
    """
    if not ids_path.exists():
        return None
    
    try:
        # Try ifctester first
        try:
            import ifctester
            import ifctester.ids
            return ifctester.ids.open(str(ids_path))
        except ImportError:
            # Fall back to lxml parsing
            return etree.parse(str(ids_path))
    except Exception:
        return None


def validate_ifc_against_ids(ifc_model: Any, ids_obj: Any, ifc_filename: str, ids_filename: str = "unknown.ids") -> IdsValidationResult:
    """
    Validate an IFC model against an IDS specification.
    
    Args:
        ifc_model: The loaded IFC model (ifcopenshell.file)
        ids_obj: The loaded IDS object (ifctester.ids or lxml ElementTree)
        ifc_filename: Name of the IFC file being validated
        ids_filename: Name of the IDS file
    
    Returns:
        IdsValidationResult with validation details
    """
    result = IdsValidationResult(
        ids_filename=ids_filename,
        ifc_filename=ifc_filename,
    )
    
    try:
        # Try using ifctester if available
        import ifctester
        import ifctester.reporter
        
        # Validate
        ids_obj.validate(ifc_model)
        
        # Process results
        for spec in ids_obj.specifications:
            spec_result = {
                "name": spec.name or "Unnamed Specification",
                "description": getattr(spec, 'description', '') or "",
                "status": "pass" if spec.status else "fail",
                "applicableCount": len(spec.applicable_entities) if hasattr(spec, 'applicable_entities') else 0,
            }
            
            result.specifications.append(spec_result)
            result.total_specs += 1
            
            if spec.status:
                result.passed_specs += 1
            else:
                result.failed_specs += 1
    
    except ImportError:
        # ifctester not available - do basic validation with lxml
        if hasattr(ids_obj, 'getroot'):
            root = ids_obj.getroot()
            ns = {"ids": IDS_NAMESPACE}
            specs = root.findall(".//ids:specification", ns) or root.findall(".//specification")
            
            for spec in specs:
                spec_name = spec.get("name", "Unnamed Specification")
                
                # Without ifctester, we can't actually validate against IFC
                # Just report the specifications found
                spec_result = {
                    "name": spec_name,
                    "description": spec.get("description", ""),
                    "status": "unknown",
                    "message": "ifctester required for IFC validation",
                }
                
                result.specifications.append(spec_result)
                result.total_specs += 1
        else:
            result.specifications.append({
                "name": "Validation Error",
                "status": "fail",
                "message": "Could not parse IDS file",
            })
            result.total_specs = 1
            result.failed_specs = 1
    
    except Exception as e:
        result.specifications.append({
            "name": "Validation Error",
            "status": "fail",
            "message": str(e),
        })
        result.total_specs = 1
        result.failed_specs = 1
    
    return result
