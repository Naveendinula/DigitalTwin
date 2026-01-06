"""
FastAPI router exposing IFC validation endpoints.
"""

from pathlib import Path
import glob
import json
import traceback
from typing import Any, Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from config import UPLOAD_DIR, OUTPUT_DIR
from ifc_validation import (
    validate_ifc,
    validate_ifc_to_json,
    get_validation_summary,
    ValidationReport,
    Severity,
)

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
    
    # Find and validate IFC file
    try:
        ifc_path = _find_ifc_for_job(job_id)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error finding IFC file: {str(e)}")
    
    try:
        report = validate_ifc_to_json(ifc_path)
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
