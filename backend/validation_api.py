"""
FastAPI router exposing IFC validation endpoints.

Includes:
- Standard validation endpoints (get report, summary, issues)
- IDS file management endpoints (upload, list, delete)
- IDS-specific validation endpoint
"""

from pathlib import Path
import glob
import json
import traceback
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel

from config import UPLOAD_DIR, OUTPUT_DIR
_IFC_VALIDATION_AVAILABLE = True
_IFC_VALIDATION_IMPORT_ERROR: Optional[Exception] = None
try:
    from ifc_validation import (
        validate_ifc_to_json,
        get_validation_summary,
        ValidationReport,
        Severity,
    )
except ModuleNotFoundError as exc:
    _IFC_VALIDATION_AVAILABLE = False
    _IFC_VALIDATION_IMPORT_ERROR = exc
    validate_ifc_to_json = None  # type: ignore[assignment]
    get_validation_summary = None  # type: ignore[assignment]
    ValidationReport = None  # type: ignore[assignment]
    Severity = None  # type: ignore[assignment]

_IDS_MANAGER_AVAILABLE = True
_IDS_MANAGER_IMPORT_ERROR: Optional[Exception] = None
try:
    from ids_manager import (
        save_uploaded_ids,
        delete_uploaded_ids,
        list_uploaded_ids_files,
        list_default_ids_files,
        get_ids_info,
        validate_ids_xml_structure,
        load_ids_file,
        validate_ifc_against_ids,
        list_all_ids_templates,
        get_job_ids_dir,
        # New multi-gate validation
        validate_ids_file,
        validate_file_security,
        load_audit_result,
        IdsAuditResult,
        MAX_IDS_FILE_SIZE,
    )
except ModuleNotFoundError as exc:
    _IDS_MANAGER_AVAILABLE = False
    _IDS_MANAGER_IMPORT_ERROR = exc
    save_uploaded_ids = None  # type: ignore[assignment]
    delete_uploaded_ids = None  # type: ignore[assignment]
    list_uploaded_ids_files = None  # type: ignore[assignment]
    list_default_ids_files = None  # type: ignore[assignment]
    get_ids_info = None  # type: ignore[assignment]
    validate_ids_xml_structure = None  # type: ignore[assignment]
    load_ids_file = None  # type: ignore[assignment]
    validate_ifc_against_ids = None  # type: ignore[assignment]
    list_all_ids_templates = None  # type: ignore[assignment]
    get_job_ids_dir = None  # type: ignore[assignment]
    validate_ids_file = None  # type: ignore[assignment]
    validate_file_security = None  # type: ignore[assignment]
    load_audit_result = None  # type: ignore[assignment]
    IdsAuditResult = None  # type: ignore[assignment]
    MAX_IDS_FILE_SIZE = None  # type: ignore[assignment]

router = APIRouter(prefix="/validation", tags=["validation"])


# =============================================================================
# Response Models
# =============================================================================

class ValidationSummary(BaseModel):
    """Concise validation summary for quick status checks."""
    status: str
    passCount: int
    warnCount: int
    failCount: int
    featureReadiness: dict[str, bool]


class ValidationResultItem(BaseModel):
    """Single rule result."""
    ruleId: str
    ruleName: str
    domain: str
    severity: str
    passed: bool
    totalCount: int
    passCount: int
    failCount: int
    coveragePercent: float
    message: str
    examples: list[dict]
    recommendations: list[str]


class FullValidationReport(BaseModel):
    """Complete validation report."""
    schemaVersion: str
    ifcFilename: str
    ifcSchema: str
    overallStatus: str
    summary: dict
    domainSummaries: dict
    results: list[ValidationResultItem]


# =============================================================================
# Helper Functions
# =============================================================================

def _require_ifc_validation() -> None:
    if not _IFC_VALIDATION_AVAILABLE:
        detail = "IFC validation dependencies are missing."
        if _IFC_VALIDATION_IMPORT_ERROR:
            detail = f"IFC validation dependencies are missing: {_IFC_VALIDATION_IMPORT_ERROR}"
        raise HTTPException(status_code=503, detail=detail)


def _require_ids_manager() -> None:
    if not _IDS_MANAGER_AVAILABLE:
        detail = "IDS validation dependencies are missing."
        if _IDS_MANAGER_IMPORT_ERROR:
            detail = f"IDS validation dependencies are missing: {_IDS_MANAGER_IMPORT_ERROR}"
        raise HTTPException(status_code=503, detail=detail)


def _find_ifc_for_job(job_id: str) -> Path:
    """Find the IFC file associated with a job ID."""
    search_pattern = str(UPLOAD_DIR / f"{job_id}_*.ifc")
    matching_files = glob.glob(search_pattern)
    if not matching_files:
        raise HTTPException(
            status_code=404,
            detail=f"No IFC file found for job ID {job_id}",
        )
    return Path(matching_files[0])


def _get_validation_cache_path(job_id: str) -> Path:
    """Get the path for cached validation results."""
    job_output_dir = OUTPUT_DIR / job_id
    job_output_dir.mkdir(parents=True, exist_ok=True)
    return job_output_dir / "validation.json"


def _load_cached_validation(job_id: str) -> Optional[dict]:
    """Load cached validation results if available."""
    cache_path = _get_validation_cache_path(job_id)
    if cache_path.exists():
        try:
            with open(cache_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None
    return None


def _save_validation_cache(job_id: str, report: dict) -> None:
    """Save validation results to cache."""
    cache_path = _get_validation_cache_path(job_id)
    with open(cache_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)


# =============================================================================
# API Endpoints
# =============================================================================

@router.get("/{job_id}")
async def get_validation_report(job_id: str, force_refresh: bool = False) -> dict:
    """
    Get the full validation report for a job.
    
    Args:
        job_id: The job ID to validate
        force_refresh: If true, re-run validation even if cached
        
    Returns:
        Complete validation report
    """
    # Check cache first
    if not force_refresh:
        cached = _load_cached_validation(job_id)
        if cached:
            return cached

    _require_ifc_validation()
    
    # Find and validate IFC file
    try:
        ifc_path = _find_ifc_for_job(job_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error finding IFC file: {str(e)}")
    
    try:
        report = validate_ifc_to_json(ifc_path, job_id=job_id)
        _save_validation_cache(job_id, report)
        return report
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Validation failed: {str(e)}"
        )


@router.get("/{job_id}/summary")
async def get_validation_summary_endpoint(job_id: str) -> dict:
    """
    Get a concise validation summary for quick status display.
    
    Returns just the status, counts, and critical issues.
    """
    _require_ifc_validation()
    # Try to get from cache or run validation
    cached = _load_cached_validation(job_id)
    if cached:
        return get_validation_summary(cached)
    
    # Run validation if not cached
    full_report = await get_validation_report(job_id)
    return get_validation_summary(full_report)


@router.get("/{job_id}/domain/{domain}")
async def get_domain_validation(job_id: str, domain: str) -> dict:
    """
    Get validation results for a specific domain.
    
    Args:
        job_id: The job ID
        domain: One of 'core', 'hvac_fm', 'ec', 'occupancy'
        
    Returns:
        Domain-specific validation results
    """
    valid_domains = ["core", "hvac_fm", "ec", "occupancy"]
    if domain not in valid_domains:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid domain. Must be one of: {', '.join(valid_domains)}"
        )
    
    # Get full report
    full_report = await get_validation_report(job_id)
    
    # Filter to domain
    domain_results = [
        r for r in full_report["results"]
        if r["domain"] == domain
    ]
    
    domain_summary = full_report.get("domainSummaries", {}).get(domain, {})
    
    return {
        "domain": domain,
        "summary": domain_summary,
        "results": domain_results,
    }


@router.get("/{job_id}/issues")
async def get_validation_issues(
    job_id: str, 
    severity: Optional[str] = None,
    domain: Optional[str] = None
) -> dict:
    """
    Get validation issues (non-passing rules) with optional filtering.
    
    Args:
        job_id: The job ID
        severity: Filter by severity ('fail', 'warn')
        domain: Filter by domain
        
    Returns:
        List of issues with recommendations
    """
    full_report = await get_validation_report(job_id)
    
    issues = [
        {
            "ruleId": r["ruleId"],
            "ruleName": r["ruleName"],
            "domain": r["domain"],
            "severity": r["severity"],
            "message": r["message"],
            "coveragePercent": r["coveragePercent"],
            "recommendations": r["recommendations"],
        }
        for r in full_report["results"]
        if r["severity"] in ("fail", "warn")
    ]
    
    # Apply filters
    if severity:
        issues = [i for i in issues if i["severity"] == severity]
    if domain:
        issues = [i for i in issues if i["domain"] == domain]
    
    return {
        "totalIssues": len(issues),
        "issues": issues,
    }


@router.post("/{job_id}/revalidate")
async def revalidate_job(job_id: str) -> dict:
    """
    Force re-validation of a job, clearing the cache.
    
    Returns the new validation report.
    """
    return await get_validation_report(job_id, force_refresh=True)


@router.get("/{job_id}/feature-readiness")
async def get_feature_readiness(job_id: str) -> dict:
    """
    Get feature readiness status for each application domain.
    
    Returns a simple map of domain -> ready boolean with explanations.
    """
    full_report = await get_validation_report(job_id)
    
    readiness = {}
    for domain, summary in full_report.get("domainSummaries", {}).items():
        readiness[domain] = {
            "ready": summary.get("featureReady", False),
            "status": summary.get("status", "unknown"),
            "criticalRulesPassed": summary.get("criticalRulesPassed", "0/0"),
        }
    
    # Add recommendations for non-ready features
    for domain, info in readiness.items():
        if not info["ready"]:
            domain_issues = [
                r["recommendations"]
                for r in full_report["results"]
                if r["domain"] == domain and r["severity"] == "fail"
            ]
            info["recommendations"] = [
                rec for recs in domain_issues for rec in recs
            ][:3]  # Limit to top 3
    
    return {
        "features": readiness,
        "allFeaturesReady": all(f["ready"] for f in readiness.values()),
    }


# =============================================================================
# Validation Rules Reference Endpoint
# =============================================================================

@router.get("/rules/list")
async def list_validation_rules() -> dict:
    """
    List all validation rules with their definitions.
    
    Useful for documentation and understanding what is being validated.
    """
    _require_ifc_validation()
    from ifc_validation import ALL_RULES
    
    rules_by_domain = {}
    for rule in ALL_RULES:
        domain = rule.domain.value
        if domain not in rules_by_domain:
            rules_by_domain[domain] = []
        
        rules_by_domain[domain].append({
            "id": rule.id,
            "name": rule.name,
            "description": rule.description,
            "thresholdPass": rule.threshold_pass,
            "thresholdWarn": rule.threshold_warn,
            "severityOnFail": rule.severity_fail.value,
        })
    
    return {
        "totalRules": len(ALL_RULES),
        "rulesByDomain": rules_by_domain,
    }


# =============================================================================
# IDS File Management Endpoints
# =============================================================================

@router.get("/ids/templates")
async def list_ids_templates() -> dict:
    """
    List all available IDS templates (default + uploaded).
    
    Returns:
        Dictionary with default templates and uploaded templates by job.
    """
    _require_ids_manager()
    try:
        return list_all_ids_templates()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error listing IDS templates: {str(e)}")


@router.get("/ids/templates/default")
async def list_default_templates() -> dict:
    """
    List default IDS templates available for all validations.
    """
    _require_ids_manager()
    templates = []
    for ids_file in list_default_ids_files():
        info = get_ids_info(ids_file)
        if info:
            info["filename"] = ids_file.name
            templates.append(info)
    
    return {
        "count": len(templates),
        "templates": templates,
    }


@router.get("/{job_id}/ids")
async def list_job_ids_files(job_id: str) -> dict:
    """
    List IDS files uploaded for a specific job.
    
    Includes validation audit status for each file.
    
    Args:
        job_id: The job ID
        
    Returns:
        List of IDS files with their metadata and audit status
    """
    _require_ids_manager()
    templates = []
    for ids_file in list_uploaded_ids_files(job_id):
        info = get_ids_info(ids_file)
        if info:
            info["filename"] = ids_file.name
            
            # Load audit result if available
            audit = load_audit_result(job_id, ids_file.name)
            if audit:
                info["audit"] = {
                    "gate1Passed": audit.gate1_passed,
                    "gate2Passed": audit.gate2_passed,
                    "overallPassed": audit.overall_passed,
                    "canRunAgainstIfc": audit.can_run_against_ifc,
                    "errorCount": len(audit.gate1_errors) + len(audit.gate2_errors),
                    "warningCount": len(audit.gate2_warnings),
                    "validatedAt": audit.validated_at,
                }
            else:
                info["audit"] = None
            
            templates.append(info)
    
    return {
        "jobId": job_id,
        "count": len(templates),
        "idsFiles": templates,
    }


@router.get("/{job_id}/ids/{filename}/audit")
async def get_ids_audit(job_id: str, filename: str) -> dict:
    """
    Get the full audit result for a specific IDS file.
    
    Returns detailed Gate 1 and Gate 2 validation results including
    all errors and warnings with line numbers.
    
    Args:
        job_id: The job ID
        filename: Name of the IDS file
        
    Returns:
        Complete audit result
    """
    _require_ids_manager()
    # Sanitize filename
    normalized_name = Path(filename).name
    if normalized_name != filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    audit = load_audit_result(job_id, normalized_name)
    
    if audit is None:
        # Try to re-audit if file exists
        job_ids_dir = get_job_ids_dir(job_id)
        ids_path = job_ids_dir / normalized_name
        
        if not ids_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"IDS file '{filename}' not found for job {job_id}"
            )
        
        # Run audit
        audit = validate_ids_file(ids_path, job_id=job_id)
    
    return {
        "jobId": job_id,
        "filename": filename,
        "audit": audit.to_dict(),
    }


@router.post("/{job_id}/ids/{filename}/reaudit")
async def reaudit_ids_file(job_id: str, filename: str) -> dict:
    """
    Re-run the two-gate validation on an IDS file.
    
    Useful after modifying the IDS file externally or to refresh
    the audit after schema updates.
    
    Args:
        job_id: The job ID
        filename: Name of the IDS file to re-audit
        
    Returns:
        Fresh audit result
    """
    _require_ids_manager()
    # Sanitize filename
    normalized_name = Path(filename).name
    if normalized_name != filename:
        raise HTTPException(status_code=400, detail="Invalid filename")
    
    job_ids_dir = get_job_ids_dir(job_id)
    ids_path = job_ids_dir / normalized_name
    
    if not ids_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"IDS file '{filename}' not found for job {job_id}"
        )
    
    # Run fresh audit
    audit = validate_ids_file(ids_path, job_id=job_id)
    
    # Clear validation cache since audit status changed
    cache_path = _get_validation_cache_path(job_id)
    if cache_path.exists():
        cache_path.unlink()
    
    return {
        "jobId": job_id,
        "filename": filename,
        "audit": audit.to_dict(),
        "message": "Re-audit completed",
    }


@router.post("/{job_id}/ids/upload")
async def upload_ids_file(job_id: str, file: UploadFile = File(...)) -> dict:
    """
    Upload an IDS file for a specific job.
    
    The IDS file undergoes two-gate validation:
    - Gate 1: XSD schema validation (must pass to save)
    - Gate 2: Semantic audit via ifctester (warnings allowed)
    
    Args:
        job_id: The job ID
        file: The IDS file to upload (.ids extension)
        
    Returns:
        Information about the uploaded IDS file including validation results
    """
    _require_ids_manager()
    # Validate filename
    if not file.filename:
        raise HTTPException(status_code=400, detail="No filename provided")
    
    if not file.filename.lower().endswith(".ids"):
        raise HTTPException(
            status_code=400,
            detail="File must have .ids extension"
        )
    
    # Read content
    try:
        content = await file.read()
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error reading file: {str(e)}")
    
    # Security checks
    is_safe, security_issues = validate_file_security(content, file.filename)
    if not is_safe:
        raise HTTPException(
            status_code=400,
            detail=f"Security check failed: {'; '.join(security_issues)}"
        )
    
    # Save temporarily for validation
    import tempfile
    with tempfile.NamedTemporaryFile(suffix=".ids", delete=False) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)
    
    try:
        # Run two-gate validation
        audit_result = validate_ids_file(tmp_path)
        
        # Gate 1 must pass to save the file
        if not audit_result.gate1_passed:
            error_messages = [e.message for e in audit_result.gate1_errors[:5]]
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "IDS file failed schema validation (Gate 1)",
                    "errors": [e.to_dict() for e in audit_result.gate1_errors],
                }
            )
        
        # Save to job directory (even if Gate 2 has warnings)
        saved_path = save_uploaded_ids(job_id, file.filename, content)
        
        # Save audit result alongside the IDS file
        from ids_manager import save_audit_result
        audit_result.filename = saved_path.name
        save_audit_result(job_id, saved_path.name, audit_result)
        
        # Get info about saved file
        info = get_ids_info(saved_path)
        
        # Clear validation cache so next validation includes this IDS
        cache_path = _get_validation_cache_path(job_id)
        if cache_path.exists():
            cache_path.unlink()
        
        # Build response based on Gate 2 status
        response = {
            "success": True,
            "filename": saved_path.name,
            "jobId": job_id,
            "idsInfo": info,
            "validation": audit_result.to_dict(),
        }
        
        if audit_result.overall_passed:
            response["message"] = "IDS file uploaded and validated successfully."
        elif audit_result.can_run_against_ifc:
            response["message"] = "IDS file uploaded with warnings. Review audit results before running against IFC."
        else:
            response["message"] = "IDS file uploaded but has validation errors. Fix errors before running against IFC."
        
        return response
        
    finally:
        # Clean up temp file
        if tmp_path.exists():
            tmp_path.unlink()


@router.delete("/{job_id}/ids/{filename}")
async def delete_ids_file(job_id: str, filename: str) -> dict:
    """
    Delete an uploaded IDS file for a job.
    
    Args:
        job_id: The job ID
        filename: Name of the IDS file to delete
        
    Returns:
        Success status
    """
    _require_ids_manager()
    success = delete_uploaded_ids(job_id, filename)
    
    if not success:
        raise HTTPException(
            status_code=404,
            detail=f"IDS file '{filename}' not found for job {job_id}"
        )
    
    # Clear validation cache
    cache_path = _get_validation_cache_path(job_id)
    if cache_path.exists():
        cache_path.unlink()
    
    return {
        "success": True,
        "message": f"Deleted IDS file: {filename}",
        "jobId": job_id,
    }


@router.post("/{job_id}/ids/validate")
async def validate_against_ids(
    job_id: str,
    ids_filename: Optional[str] = None,
    skip_audit_check: bool = False
) -> dict:
    """
    Validate the job's IFC file against IDS specifications.
    
    Only IDS files that have passed the two-gate audit can be used.
    
    Args:
        job_id: The job ID
        ids_filename: Optional specific IDS file to validate against.
                     If not provided, validates against all uploaded + default IDS files.
        skip_audit_check: Skip audit check (not recommended, use at own risk)
                     
    Returns:
        IDS validation results with facet-level details
    """
    _require_ids_manager()
    import ifcopenshell
    
    # Find IFC file
    try:
        ifc_path = _find_ifc_for_job(job_id)
    except HTTPException:
        raise
    
    # Load IFC
    try:
        ifc_model = ifcopenshell.open(str(ifc_path))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error loading IFC: {str(e)}")
    
    results = []
    skipped_files = []
    
    if ids_filename:
        # Validate against specific IDS file
        normalized_name = Path(ids_filename).name
        if normalized_name != ids_filename:
            raise HTTPException(status_code=400, detail="Invalid IDS filename")
        job_ids_dir = get_job_ids_dir(job_id)
        ids_path = job_ids_dir / normalized_name
        is_default = False
        
        if not ids_path.exists():
            # Check defaults
            ids_path = None
            for default_file in list_default_ids_files():
                if default_file.name == ids_filename:
                    ids_path = default_file
                    is_default = True
                    break
        
        if not ids_path or not ids_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"IDS file '{ids_filename}' not found"
            )
        
        # Check audit status for non-default files
        if not is_default and not skip_audit_check:
            audit = load_audit_result(job_id, normalized_name)
            if audit and not audit.can_run_against_ifc:
                raise HTTPException(
                    status_code=400,
                    detail={
                        "message": f"IDS file '{ids_filename}' has not passed validation. Fix audit errors first.",
                        "audit": audit.to_dict(),
                    }
                )
        
        ids_obj = load_ids_file(ids_path)
        if ids_obj:
            result = validate_ifc_against_ids(ifc_model, ids_obj, ifc_path.name, ids_path.name)
            results.append(result.to_dict())
    else:
        # Validate against all IDS files that pass audit
        # Check uploaded files for audit status
        for ids_file in list_uploaded_ids_files(job_id):
            if not skip_audit_check:
                audit = load_audit_result(job_id, ids_file.name)
                if audit and not audit.can_run_against_ifc:
                    skipped_files.append({
                        "filename": ids_file.name,
                        "reason": "Failed audit validation",
                    })
                    continue
            
            ids_obj = load_ids_file(ids_file)
            if ids_obj:
                result = validate_ifc_against_ids(ifc_model, ids_obj, ifc_path.name, ids_file.name)
                results.append(result.to_dict())
        
        # Always include defaults (they're trusted)
        for ids_file in list_default_ids_files():
            ids_obj = load_ids_file(ids_file)
            if ids_obj:
                result = validate_ifc_against_ids(ifc_model, ids_obj, ifc_path.name, ids_file.name)
                results.append(result.to_dict())
    
    # Calculate overall stats
    total_specs = sum(r["totalSpecs"] for r in results)
    passed_specs = sum(r["passedSpecs"] for r in results)
    failed_specs = sum(r["failedSpecs"] for r in results)
    
    response = {
        "jobId": job_id,
        "ifcFilename": ifc_path.name,
        "idsFilesValidated": len(results),
        "totalSpecifications": total_specs,
        "passedSpecifications": passed_specs,
        "failedSpecifications": failed_specs,
        "overallPassed": failed_specs == 0,
        "results": results,
    }
    
    if skipped_files:
        response["skippedFiles"] = skipped_files
        response["skippedCount"] = len(skipped_files)
    
    return response
