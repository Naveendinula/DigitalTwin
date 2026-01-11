"""
Minimal IFC validation helpers used by validation_api.py.

This provides a small rule set and report summary so the validation
endpoints keep working when the previous module is absent.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Iterable, Optional


class Severity(Enum):
    FAIL = "fail"
    WARN = "warn"


class Domain(Enum):
    CORE = "core"
    HVAC_FM = "hvac_fm"
    EC = "ec"
    OCCUPANCY = "occupancy"


@dataclass(frozen=True)
class ValidationRule:
    id: str
    name: str
    description: str
    domain: Domain
    threshold_pass: float
    threshold_warn: float
    severity_fail: Severity


@dataclass(frozen=True)
class PresenceCheck:
    rule: ValidationRule
    entity_types: tuple[str, ...]
    entity_label: str
    recommendation: str


CORE_PROJECT_RULE = ValidationRule(
    id="core.project.present",
    name="IfcProject present",
    description="IFC must include an IfcProject root element.",
    domain=Domain.CORE,
    threshold_pass=1.0,
    threshold_warn=0.0,
    severity_fail=Severity.FAIL,
)
CORE_STOREY_RULE = ValidationRule(
    id="core.storey.present",
    name="IfcBuildingStorey present",
    description="IFC should include at least one building storey.",
    domain=Domain.CORE,
    threshold_pass=1.0,
    threshold_warn=0.0,
    severity_fail=Severity.FAIL,
)
HVAC_ELEMENTS_RULE = ValidationRule(
    id="hvac.distribution.present",
    name="IfcDistributionElement present",
    description="HVAC/FM workflows need distribution elements to analyze.",
    domain=Domain.HVAC_FM,
    threshold_pass=1.0,
    threshold_warn=0.0,
    severity_fail=Severity.WARN,
)
EC_MATERIALS_RULE = ValidationRule(
    id="ec.materials.present",
    name="IfcMaterial present",
    description="Embodied carbon workflows need materials to map.",
    domain=Domain.EC,
    threshold_pass=1.0,
    threshold_warn=0.0,
    severity_fail=Severity.WARN,
)
OCCUPANCY_SPACES_RULE = ValidationRule(
    id="occupancy.spaces.present",
    name="IfcSpace present",
    description="Occupancy workflows need spaces to map.",
    domain=Domain.OCCUPANCY,
    threshold_pass=1.0,
    threshold_warn=0.0,
    severity_fail=Severity.WARN,
)

ALL_RULES = [
    CORE_PROJECT_RULE,
    CORE_STOREY_RULE,
    HVAC_ELEMENTS_RULE,
    EC_MATERIALS_RULE,
    OCCUPANCY_SPACES_RULE,
]

_PRESENCE_CHECKS = [
    PresenceCheck(
        rule=CORE_PROJECT_RULE,
        entity_types=("IfcProject",),
        entity_label="IfcProject",
        recommendation="Ensure the IFC includes a valid IfcProject root element.",
    ),
    PresenceCheck(
        rule=CORE_STOREY_RULE,
        entity_types=("IfcBuildingStorey",),
        entity_label="IfcBuildingStorey",
        recommendation="Add at least one IfcBuildingStorey to the model.",
    ),
    PresenceCheck(
        rule=HVAC_ELEMENTS_RULE,
        entity_types=("IfcDistributionElement",),
        entity_label="IfcDistributionElement",
        recommendation="Include HVAC distribution elements to enable HVAC/FM validation.",
    ),
    PresenceCheck(
        rule=EC_MATERIALS_RULE,
        entity_types=("IfcMaterial",),
        entity_label="IfcMaterial",
        recommendation="Attach materials so embodied carbon checks can run.",
    ),
    PresenceCheck(
        rule=OCCUPANCY_SPACES_RULE,
        entity_types=("IfcSpace",),
        entity_label="IfcSpace",
        recommendation="Include spaces so occupancy checks can run.",
    ),
]


@dataclass
class ValidationReport:
    schema_version: str
    ifc_filename: str
    ifc_schema: str
    overall_status: str
    summary: dict[str, Any]
    domain_summaries: dict[str, Any]
    results: list[dict[str, Any]]

    def to_dict(self) -> dict[str, Any]:
        return {
            "schemaVersion": self.schema_version,
            "ifcFilename": self.ifc_filename,
            "ifcSchema": self.ifc_schema,
            "overallStatus": self.overall_status,
            "summary": self.summary,
            "domainSummaries": self.domain_summaries,
            "results": self.results,
        }


def validate_ifc_to_json(ifc_path: Path, job_id: Optional[str] = None) -> dict[str, Any]:
    ifc_path = Path(ifc_path)
    try:
        model = _open_ifc(ifc_path)
    except Exception as exc:
        results = [_build_open_failure_result(check, exc) for check in _PRESENCE_CHECKS]
        report = _build_report(ifc_path, None, results)
        return report.to_dict()

    results = []
    for check in _PRESENCE_CHECKS:
        count = _count_entities(model, check.entity_types)
        results.append(_evaluate_presence_check(check, count))

    report = _build_report(ifc_path, model, results)
    return report.to_dict()


def get_validation_summary(report: dict[str, Any]) -> dict[str, Any]:
    summary = report.get("summary", {})
    domain_summaries = report.get("domainSummaries", {})
    return {
        "status": report.get("overallStatus", "unknown"),
        "passCount": summary.get("passCount", 0),
        "warnCount": summary.get("warnCount", 0),
        "failCount": summary.get("failCount", 0),
        "featureReadiness": {
            domain: info.get("featureReady", False)
            for domain, info in domain_summaries.items()
        },
    }


def _open_ifc(ifc_path: Path):
    import ifcopenshell

    return ifcopenshell.open(str(ifc_path))


def _count_entities(model: Any, entity_types: Iterable[str]) -> int:
    total = 0
    for entity_type in entity_types:
        try:
            total += len(model.by_type(entity_type))
        except Exception:
            continue
    return total


def _evaluate_presence_check(check: PresenceCheck, count: int) -> dict[str, Any]:
    passed = count > 0
    total_count = count if count > 0 else 1
    pass_count = count if count > 0 else 0
    fail_count = total_count - pass_count
    coverage = (pass_count / total_count) * 100 if total_count else 0.0

    if passed:
        message = _plural_message(count, check.entity_label)
        recommendations: list[str] = []
        severity = "pass"
    else:
        message = f"No {check.entity_label} entities found."
        recommendations = [check.recommendation]
        severity = check.rule.severity_fail.value

    return {
        "ruleId": check.rule.id,
        "ruleName": check.rule.name,
        "domain": check.rule.domain.value,
        "severity": severity,
        "passed": passed,
        "totalCount": total_count,
        "passCount": pass_count,
        "failCount": fail_count,
        "coveragePercent": round(coverage, 2),
        "message": message,
        "examples": [],
        "recommendations": recommendations,
    }


def _build_open_failure_result(check: PresenceCheck, exc: Exception) -> dict[str, Any]:
    return {
        "ruleId": check.rule.id,
        "ruleName": check.rule.name,
        "domain": check.rule.domain.value,
        "severity": check.rule.severity_fail.value,
        "passed": False,
        "totalCount": 1,
        "passCount": 0,
        "failCount": 1,
        "coveragePercent": 0.0,
        "message": f"IFC could not be opened: {exc}",
        "examples": [],
        "recommendations": [check.recommendation],
    }


def _build_report(
    ifc_path: Path,
    model: Optional[Any],
    results: list[dict[str, Any]],
) -> ValidationReport:
    summary = _summarize_results(results)
    domain_summaries = _summarize_domains(results)
    overall_status = _status_from_counts(summary["failCount"], summary["warnCount"])
    ifc_schema = getattr(model, "schema", "unknown") if model is not None else "unknown"
    return ValidationReport(
        schema_version="1.0",
        ifc_filename=ifc_path.name,
        ifc_schema=ifc_schema,
        overall_status=overall_status,
        summary=summary,
        domain_summaries=domain_summaries,
        results=results,
    )


def _summarize_results(results: list[dict[str, Any]]) -> dict[str, Any]:
    pass_count = sum(1 for r in results if r.get("passed"))
    warn_count = sum(
        1 for r in results if not r.get("passed") and r.get("severity") == "warn"
    )
    fail_count = sum(
        1 for r in results if not r.get("passed") and r.get("severity") == "fail"
    )
    return {
        "passCount": pass_count,
        "warnCount": warn_count,
        "failCount": fail_count,
        "totalRules": len(results),
    }


def _summarize_domains(results: list[dict[str, Any]]) -> dict[str, Any]:
    summaries = {}
    for domain in Domain:
        domain_results = [r for r in results if r.get("domain") == domain.value]
        if not domain_results:
            summaries[domain.value] = {
                "status": "unknown",
                "passCount": 0,
                "warnCount": 0,
                "failCount": 0,
                "featureReady": False,
                "criticalRulesPassed": "0/0",
            }
            continue

        summary = _summarize_results(domain_results)
        status = _status_from_counts(summary["failCount"], summary["warnCount"])
        feature_ready = summary["failCount"] == 0 and summary["warnCount"] == 0
        summaries[domain.value] = {
            "status": status,
            "passCount": summary["passCount"],
            "warnCount": summary["warnCount"],
            "failCount": summary["failCount"],
            "featureReady": feature_ready,
            "criticalRulesPassed": f"{summary['passCount']}/{len(domain_results)}",
        }
    return summaries


def _status_from_counts(fail_count: int, warn_count: int) -> str:
    if fail_count > 0:
        return "fail"
    if warn_count > 0:
        return "warn"
    return "pass"


def _plural_message(count: int, label: str) -> str:
    if count == 1:
        return f"Found 1 {label} entity."
    return f"Found {count} {label} entities."
