"""
IFC Validation Module

Validates IFC files for compatibility with the Digital Twin viewer using:
1. IDS (Information Delivery Specification) rules via ifctester
2. Custom coverage metrics for domain-specific validation (HVAC/FM, EC, Occupancy)
3. External IDS file validation support (buildingSMART IDS standard)

This module provides a unified validation API that returns structured reports
with pass/warn/fail severities and actionable feedback.

IDS Integration:
- Supports loading external .ids XML files
- Full facet support: Entity, Property, Attribute, Classification, Material, PartOf
- Specification optionality: Required, Optional, Prohibited
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Any, Optional

import ifcopenshell
from ifcopenshell.util import element as ifc_element
from ifcopenshell.util import system as ifc_system

# Import ifctester for IDS validation
from ifctester import ids

# Import existing analysis functions for coverage metrics
from ec_core import extract_lca_properties
from fm_hvac_core import analyze_hvac_fm
from domain.materials import has_material, is_leaf_element

# Import IDS manager for external IDS file support
from ids_manager import (
    load_all_ids_for_job,
    validate_ifc_against_ids,
    merge_ids_results_to_validation_report,
    build_enhanced_ids_specifications,
    IDSValidationResult,
)


# =============================================================================
# Enums and Data Classes
# =============================================================================

class Severity(str, Enum):
    """Validation result severity levels."""
    PASS = "pass"
    WARN = "warn"
    FAIL = "fail"
    INFO = "info"


class Domain(str, Enum):
    """Validation domains corresponding to application features."""
    CORE = "core"           # Basic viewer requirements
    HVAC_FM = "hvac_fm"     # HVAC/Facilities Management
    EC = "ec"               # Embodied Carbon
    OCCUPANCY = "occupancy" # Occupancy simulation


@dataclass
class ValidationRule:
    """Definition of a single validation rule."""
    id: str
    name: str
    description: str
    domain: Domain
    severity_fail: Severity  # Severity when rule completely fails
    severity_warn: Severity  # Severity when rule partially passes
    
    # Thresholds for pass/warn/fail (percentage 0-100 or count)
    threshold_pass: float = 100.0
    threshold_warn: float = 50.0
    
    # For IDS-based rules
    is_ids_rule: bool = False
    ids_spec_name: Optional[str] = None


@dataclass
class RuleResult:
    """Result of evaluating a single validation rule."""
    rule_id: str
    rule_name: str
    domain: str
    severity: Severity
    passed: bool
    
    # Rule metadata
    description: str = ""
    is_ids_rule: bool = False
    ids_source: str = "builtin"  # "builtin" or "external" for uploaded IDS
    threshold_pass: float = 100.0
    threshold_warn: float = 50.0
    
    # Metrics
    total_count: int = 0
    pass_count: int = 0
    fail_count: int = 0
    coverage_percent: float = 0.0
    
    # Details
    message: str = ""
    examples: list[dict[str, Any]] = field(default_factory=list)
    recommendations: list[str] = field(default_factory=list)
    
    # IDS facet details (for external IDS rules)
    facet_details: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class ValidationReport:
    """Complete validation report for an IFC file."""
    schema_version: str = "1.0"
    ifc_filename: str = ""
    ifc_schema: str = ""
    
    # Overall status
    overall_status: Severity = Severity.PASS
    pass_count: int = 0
    warn_count: int = 0
    fail_count: int = 0
    
    # Results by domain
    results: list[RuleResult] = field(default_factory=list)
    
    # Summary by domain
    domain_summaries: dict[str, dict[str, Any]] = field(default_factory=dict)
    
    def to_dict(self) -> dict:
        """Convert report to dictionary for JSON serialization."""
        return {
            "schemaVersion": self.schema_version,
            "ifcFilename": self.ifc_filename,
            "ifcSchema": self.ifc_schema,
            "overallStatus": self.overall_status.value,
            "summary": {
                "passCount": self.pass_count,
                "warnCount": self.warn_count,
                "failCount": self.fail_count,
            },
            "domainSummaries": self.domain_summaries,
            "results": [
                {
                    "ruleId": r.rule_id,
                    "ruleName": r.rule_name,
                    "description": r.description,
                    "isIdsRule": r.is_ids_rule,
                    "idsSource": r.ids_source,
                    "thresholdPass": r.threshold_pass,
                    "thresholdWarn": r.threshold_warn,
                    "domain": r.domain,
                    "severity": r.severity.value,
                    "passed": r.passed,
                    "totalCount": r.total_count,
                    "passCount": r.pass_count,
                    "failCount": r.fail_count,
                    "coveragePercent": round(r.coverage_percent, 1),
                    "message": r.message,
                    "examples": r.examples[:5],  # Limit examples
                    "recommendations": r.recommendations,
                    "facetDetails": r.facet_details,
                }
                for r in self.results
            ]
        }


# =============================================================================
# Validation Rules Definition
# =============================================================================

# Core viewer rules - required for basic functionality
CORE_RULES = [
    ValidationRule(
        id="CORE-001",
        name="Has IfcProject",
        description="IFC file must contain exactly one IfcProject entity",
        domain=Domain.CORE,
        severity_fail=Severity.FAIL,
        severity_warn=Severity.FAIL,
        threshold_pass=1,
        threshold_warn=0,
        is_ids_rule=True,
        ids_spec_name="HasIfcProject"
    ),
    ValidationRule(
        id="CORE-002",
        name="Has Building Storeys",
        description="IFC file must contain at least one IfcBuildingStorey",
        domain=Domain.CORE,
        severity_fail=Severity.FAIL,
        severity_warn=Severity.WARN,
        threshold_pass=1,
        threshold_warn=0,
        is_ids_rule=True,
        ids_spec_name="HasBuildingStoreys"
    ),
    ValidationRule(
        id="CORE-003",
        name="Has Building Elements",
        description="IFC file must contain building elements (walls, slabs, etc.)",
        domain=Domain.CORE,
        severity_fail=Severity.FAIL,
        severity_warn=Severity.WARN,
        threshold_pass=1,
        threshold_warn=0,
    ),
    ValidationRule(
        id="CORE-004",
        name="Elements Have GlobalId",
        description="All building elements should have valid GlobalId",
        domain=Domain.CORE,
        severity_fail=Severity.FAIL,
        severity_warn=Severity.WARN,
        threshold_pass=100,
        threshold_warn=95,
    ),
]

# HVAC/FM rules - required for HVAC panel functionality
HVAC_FM_RULES = [
    ValidationRule(
        id="HVAC-001",
        name="Has HVAC Equipment",
        description="IFC file should contain HVAC equipment (AHU, HRU, etc.)",
        domain=Domain.HVAC_FM,
        severity_fail=Severity.WARN,
        severity_warn=Severity.INFO,
        threshold_pass=1,
        threshold_warn=0,
    ),
    ValidationRule(
        id="HVAC-002",
        name="Has Air Terminals",
        description="IFC file should contain air terminals (diffusers, grilles)",
        domain=Domain.HVAC_FM,
        severity_fail=Severity.WARN,
        severity_warn=Severity.INFO,
        threshold_pass=1,
        threshold_warn=0,
    ),
    ValidationRule(
        id="HVAC-003",
        name="Has IfcSpaces",
        description="IFC file should contain IfcSpace entities for room analysis",
        domain=Domain.HVAC_FM,
        severity_fail=Severity.WARN,
        severity_warn=Severity.INFO,
        threshold_pass=1,
        threshold_warn=0,
        is_ids_rule=True,
        ids_spec_name="HasIfcSpaces"
    ),
    ValidationRule(
        id="HVAC-004",
        name="Terminals Have Space Assignment",
        description="Air terminals should be assigned to spaces",
        domain=Domain.HVAC_FM,
        severity_fail=Severity.WARN,
        severity_warn=Severity.INFO,
        threshold_pass=80,
        threshold_warn=50,
    ),
    ValidationRule(
        id="HVAC-005",
        name="Has HVAC Systems",
        description="IFC file should contain IfcSystem entities for HVAC",
        domain=Domain.HVAC_FM,
        severity_fail=Severity.INFO,
        severity_warn=Severity.INFO,
        threshold_pass=1,
        threshold_warn=0,
    ),
    ValidationRule(
        id="HVAC-006",
        name="Equipment Has System Assignment",
        description="HVAC equipment should be assigned to systems",
        domain=Domain.HVAC_FM,
        severity_fail=Severity.INFO,
        severity_warn=Severity.INFO,
        threshold_pass=50,
        threshold_warn=25,
    ),
]

# Embodied Carbon rules - required for EC panel functionality
EC_RULES = [
    ValidationRule(
        id="EC-001",
        name="Elements Have Materials",
        description="Building elements should have material assignments",
        domain=Domain.EC,
        severity_fail=Severity.WARN,
        severity_warn=Severity.INFO,
        threshold_pass=80,
        threshold_warn=50,
    ),
    ValidationRule(
        id="EC-002",
        name="Elements Have Volumes",
        description="Building elements should have volume quantities",
        domain=Domain.EC,
        severity_fail=Severity.WARN,
        severity_warn=Severity.INFO,
        threshold_pass=70,
        threshold_warn=40,
    ),
    ValidationRule(
        id="EC-003",
        name="Material Layers Present",
        description="Compound elements should have material layer definitions",
        domain=Domain.EC,
        severity_fail=Severity.INFO,
        severity_warn=Severity.INFO,
        threshold_pass=50,
        threshold_warn=25,
    ),
    ValidationRule(
        id="EC-004",
        name="Has Base Quantities",
        description="Elements should have Qto_*BaseQuantities property sets",
        domain=Domain.EC,
        severity_fail=Severity.INFO,
        severity_warn=Severity.INFO,
        threshold_pass=50,
        threshold_warn=25,
    ),
]

# Occupancy simulation rules
OCCUPANCY_RULES = [
    ValidationRule(
        id="OCC-001",
        name="Spaces Have Area",
        description="IfcSpaces should have area quantities for occupancy calculation",
        domain=Domain.OCCUPANCY,
        severity_fail=Severity.WARN,
        severity_warn=Severity.INFO,
        threshold_pass=80,
        threshold_warn=50,
    ),
    ValidationRule(
        id="OCC-002",
        name="Spaces Have Names",
        description="IfcSpaces should have meaningful names or numbers",
        domain=Domain.OCCUPANCY,
        severity_fail=Severity.INFO,
        severity_warn=Severity.INFO,
        threshold_pass=90,
        threshold_warn=70,
    ),
    ValidationRule(
        id="OCC-003",
        name="Spaces Have Storey Assignment",
        description="IfcSpaces should be contained in building storeys",
        domain=Domain.OCCUPANCY,
        severity_fail=Severity.WARN,
        severity_warn=Severity.INFO,
        threshold_pass=95,
        threshold_warn=80,
    ),
]

ALL_RULES = CORE_RULES + HVAC_FM_RULES + EC_RULES + OCCUPANCY_RULES


# =============================================================================
# IDS Specification Builder
# =============================================================================

def build_ids_specifications() -> ids.Ids:
    """
    Build IDS specifications for IFC validation.
    
    These are the declarative rules that can be expressed in IDS format.
    """
    my_ids = ids.Ids(
        title="Digital Twin IFC Validation",
        description="Validation rules for BIM viewer compatibility",
        author="Digital Twin System",
        version="1.0.0"
    )
    
    # CORE-001: Has IfcProject
    spec_project = ids.Specification(
        name="HasIfcProject",
        description="IFC file must contain exactly one IfcProject",
        minOccurs=1,
        maxOccurs=1
    )
    spec_project.applicability.append(ids.Entity(name="IFCPROJECT"))
    my_ids.specifications.append(spec_project)
    
    # CORE-002: Has Building Storeys
    spec_storeys = ids.Specification(
        name="HasBuildingStoreys",
        description="IFC file must contain at least one IfcBuildingStorey",
        minOccurs=1
    )
    spec_storeys.applicability.append(ids.Entity(name="IFCBUILDINGSTOREY"))
    my_ids.specifications.append(spec_storeys)
    
    # HVAC-003: Has IfcSpaces
    spec_spaces = ids.Specification(
        name="HasIfcSpaces",
        description="IFC file should contain IfcSpace entities",
        minOccurs=0  # Not strictly required, will be evaluated as coverage
    )
    spec_spaces.applicability.append(ids.Entity(name="IFCSPACE"))
    my_ids.specifications.append(spec_spaces)
    
    return my_ids


# =============================================================================
# Validation Runner
# =============================================================================

class IFCValidator:
    """
    Main validation runner that combines IDS rules and custom coverage metrics.
    
    Supports:
    - Built-in programmatic IDS rules
    - External IDS file validation (loaded from ids_templates/)
    - Custom coverage-based validation rules
    """
    
    def __init__(self, ifc_path: str | Path, job_id: Optional[str] = None):
        self.ifc_path = Path(ifc_path)
        self.job_id = job_id
        self.model: Optional[ifcopenshell.file] = None
        self.ids_specs = build_ids_specifications()
        self.report = ValidationReport()
        
        # External IDS results
        self.external_ids_results: list[IDSValidationResult] = []
        
        # Cached analysis results
        self._hvac_analysis: Optional[dict] = None
        self._ec_data: Optional[Any] = None
    
    def validate(self, include_external_ids: bool = True) -> ValidationReport:
        """
        Run all validation checks and return a complete report.
        
        Args:
            include_external_ids: Whether to load and validate against external IDS files
        """
        # Load IFC file
        self.model = ifcopenshell.open(str(self.ifc_path))
        
        # Set basic info
        self.report.ifc_filename = self.ifc_path.name
        self.report.ifc_schema = self.model.schema
        
        # Run IDS validation (built-in)
        self.ids_specs.validate(self.model)
        
        # Run all built-in rules
        for rule in ALL_RULES:
            result = self._evaluate_rule(rule)
            self.report.results.append(result)
            
            # Update counts
            if result.severity == Severity.PASS:
                self.report.pass_count += 1
            elif result.severity == Severity.WARN:
                self.report.warn_count += 1
            elif result.severity == Severity.FAIL:
                self.report.fail_count += 1
        
        # Load and validate against external IDS files
        if include_external_ids and self.job_id:
            self._validate_external_ids()
        
        # Determine overall status
        if self.report.fail_count > 0:
            self.report.overall_status = Severity.FAIL
        elif self.report.warn_count > 0:
            self.report.overall_status = Severity.WARN
        else:
            self.report.overall_status = Severity.PASS
        
        # Build domain summaries
        self._build_domain_summaries()
        
        return self.report
    
    def _validate_external_ids(self):
        """Load and validate against external IDS files."""
        if not self.job_id:
            return
        
        try:
            external_ids_list = load_all_ids_for_job(self.job_id, include_defaults=True)
            
            for ids_obj in external_ids_list:
                try:
                    ids_result = validate_ifc_against_ids(
                        self.model,
                        ids_obj,
                        self.ifc_path.name
                    )
                    self.external_ids_results.append(ids_result)
                    
                    # Convert IDS results to RuleResults and add to report
                    for spec_result in ids_result.spec_results:
                        rule_result = self._convert_ids_spec_to_rule_result(
                            spec_result,
                            ids_result.ids_title
                        )
                        self.report.results.append(rule_result)
                        
                        # Update counts
                        if rule_result.severity == Severity.PASS:
                            self.report.pass_count += 1
                        elif rule_result.severity == Severity.WARN:
                            self.report.warn_count += 1
                        elif rule_result.severity == Severity.FAIL:
                            self.report.fail_count += 1
                            
                except Exception as e:
                    print(f"Error validating against IDS: {e}")
                    
        except Exception as e:
            print(f"Error loading external IDS files: {e}")
    
    def _convert_ids_spec_to_rule_result(self, spec_result, ids_title: str) -> RuleResult:
        """Convert an IDS specification result to a RuleResult."""
        # Determine domain from spec
        domain = self._infer_domain_from_spec_name(spec_result.spec_name)
        
        # Determine severity
        if spec_result.passed:
            severity = Severity.PASS
        elif spec_result.optionality == "optional":
            severity = Severity.WARN
        else:
            severity = Severity.FAIL
        
        # Calculate coverage
        coverage = 100.0
        if spec_result.applicable_count > 0:
            coverage = ((spec_result.applicable_count - spec_result.failed_count) /
                       spec_result.applicable_count * 100)
        
        # Build facet details
        facet_details = [
            {
                "type": fr.facet_type,
                "name": fr.facet_name,
                "passed": fr.passed,
                "details": fr.details,
            }
            for fr in spec_result.facet_results
        ]
        
        return RuleResult(
            rule_id=f"IDS-{spec_result.spec_name[:15]}",
            rule_name=spec_result.spec_name,
            domain=domain,
            severity=severity,
            passed=spec_result.passed,
            description=spec_result.spec_description or f"IDS rule from {ids_title}",
            is_ids_rule=True,
            ids_source="external",
            threshold_pass=100.0,
            threshold_warn=50.0,
            total_count=spec_result.applicable_count,
            pass_count=spec_result.applicable_count - spec_result.failed_count,
            fail_count=spec_result.failed_count,
            coverage_percent=coverage,
            message=self._build_ids_message(spec_result),
            examples=spec_result.failed_entities[:5],
            recommendations=self._build_ids_recommendations(spec_result),
            facet_details=facet_details,
        )
    
    def _infer_domain_from_spec_name(self, spec_name: str) -> str:
        """Infer domain from specification name."""
        name_lower = spec_name.lower()
        
        if any(kw in name_lower for kw in ["project", "storey", "building", "site", "element"]):
            return Domain.CORE.value
        elif any(kw in name_lower for kw in ["hvac", "terminal", "space", "zone", "system", "duct"]):
            return Domain.HVAC_FM.value
        elif any(kw in name_lower for kw in ["material", "carbon", "wall", "slab", "column", "beam"]):
            return Domain.EC.value
        elif any(kw in name_lower for kw in ["occupancy", "area", "person", "room"]):
            return Domain.OCCUPANCY.value
        return Domain.CORE.value
    
    def _build_ids_message(self, spec_result) -> str:
        """Build a user-friendly message from IDS spec result."""
        if spec_result.passed:
            return f"Passed: {spec_result.applicable_count} entities meet requirements"
        else:
            return (
                f"Failed: {spec_result.failed_count}/{spec_result.applicable_count} "
                f"entities did not meet requirements"
            )
    
    def _build_ids_recommendations(self, spec_result) -> list[str]:
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
                        f"Add property '{prop}' in property set '{pset}'"
                    )
                elif facet.facet_type == "attribute":
                    recommendations.append(
                        f"Ensure '{facet.facet_name}' attribute is set"
                    )
                elif facet.facet_type == "material":
                    recommendations.append("Assign materials to elements")
                elif facet.facet_type == "classification":
                    system = facet.details.get("system", "")
                    recommendations.append(f"Add classification from '{system}'")
        
        if not recommendations:
            recommendations.append(f"Review: {spec_result.spec_name}")
        
        return recommendations[:3]
    
    def _evaluate_rule(self, rule: ValidationRule) -> RuleResult:
        """Evaluate a single validation rule."""
        result = RuleResult(
            rule_id=rule.id,
            rule_name=rule.name,
            domain=rule.domain.value,
            severity=Severity.PASS,
            passed=True,
            description=rule.description,
            is_ids_rule=rule.is_ids_rule,
            threshold_pass=rule.threshold_pass,
            threshold_warn=rule.threshold_warn
        )
        
        try:
            # Dispatch to appropriate evaluator
            if rule.is_ids_rule and rule.ids_spec_name:
                self._evaluate_ids_rule(rule, result)
            else:
                self._evaluate_custom_rule(rule, result)
        except Exception as e:
            result.severity = Severity.WARN
            result.passed = False
            result.message = f"Error evaluating rule: {str(e)}"
        
        return result
    
    def _evaluate_ids_rule(self, rule: ValidationRule, result: RuleResult):
        """Evaluate an IDS-based rule."""
        # Find the corresponding IDS specification
        spec = None
        for s in self.ids_specs.specifications:
            if s.name == rule.ids_spec_name:
                spec = s
                break
        
        if not spec:
            result.message = f"IDS specification '{rule.ids_spec_name}' not found"
            result.severity = Severity.WARN
            return
        
        # Get results from IDS validation
        applicable_count = len(spec.applicable_entities)
        failed_count = len(spec.failed_entities)
        passed_count = applicable_count - failed_count
        
        result.total_count = applicable_count
        result.pass_count = passed_count
        result.fail_count = failed_count
        result.coverage_percent = 100.0 if applicable_count > 0 else 0.0
        
        # Evaluate against thresholds
        if spec.status:  # IDS spec passed
            result.passed = True
            result.severity = Severity.PASS
            result.message = f"Found {applicable_count} {rule.ids_spec_name.replace('Has', '')} entities"
        else:
            result.passed = False
            result.severity = rule.severity_fail
            result.message = f"Expected at least {spec.minOccurs}, found {applicable_count}"
            result.recommendations.append(
                f"Ensure the IFC file contains the required {rule.ids_spec_name.replace('Has', '')} entities"
            )
    
    def _evaluate_custom_rule(self, rule: ValidationRule, result: RuleResult):
        """Evaluate a custom coverage-based rule."""
        # Dispatch based on rule ID prefix
        if rule.id.startswith("CORE"):
            self._evaluate_core_rule(rule, result)
        elif rule.id.startswith("HVAC"):
            self._evaluate_hvac_rule(rule, result)
        elif rule.id.startswith("EC"):
            self._evaluate_ec_rule(rule, result)
        elif rule.id.startswith("OCC"):
            self._evaluate_occupancy_rule(rule, result)
    
    def _evaluate_core_rule(self, rule: ValidationRule, result: RuleResult):
        """Evaluate core viewer rules."""
        if rule.id == "CORE-003":  # Has Building Elements
            elements = list(self.model.by_type("IfcBuildingElement"))
            result.total_count = len(elements)
            result.pass_count = len(elements)
            result.coverage_percent = 100.0 if elements else 0.0
            
            if len(elements) >= rule.threshold_pass:
                result.passed = True
                result.severity = Severity.PASS
                result.message = f"Found {len(elements)} building elements"
            else:
                result.passed = False
                result.severity = rule.severity_fail
                result.message = "No building elements found"
                result.recommendations.append(
                    "Ensure the IFC file contains IfcBuildingElement entities (walls, slabs, columns, etc.)"
                )
        
        elif rule.id == "CORE-004":  # Elements Have GlobalId
            elements = list(self.model.by_type("IfcBuildingElement"))
            valid_count = sum(1 for e in elements if e.GlobalId and len(e.GlobalId) > 0)
            
            result.total_count = len(elements)
            result.pass_count = valid_count
            result.fail_count = len(elements) - valid_count
            result.coverage_percent = (valid_count / len(elements) * 100) if elements else 0.0
            
            self._apply_threshold_result(rule, result)
    
    def _evaluate_hvac_rule(self, rule: ValidationRule, result: RuleResult):
        """Evaluate HVAC/FM rules."""
        # Lazy load HVAC analysis
        if self._hvac_analysis is None:
            try:
                self._hvac_analysis = analyze_hvac_fm(self.model)
            except Exception:
                self._hvac_analysis = {"equipment": [], "terminals": [], "spaces": [], "systems": []}
        
        if rule.id == "HVAC-001":  # Has HVAC Equipment
            equipment = self._hvac_analysis.get("equipment", [])
            result.total_count = len(equipment)
            result.pass_count = len(equipment)
            result.coverage_percent = 100.0 if equipment else 0.0
            
            if len(equipment) >= rule.threshold_pass:
                result.passed = True
                result.severity = Severity.PASS
                result.message = f"Found {len(equipment)} HVAC equipment items"
                result.examples = [
                    {"name": e.get("name", ""), "type": e.get("type", "")}
                    for e in equipment[:3]
                ]
            else:
                result.passed = False
                result.severity = rule.severity_fail
                result.message = "No HVAC equipment found"
                result.recommendations.append(
                    "Add HVAC equipment (AHU, HRU, FCU) to enable equipment analysis"
                )
        
        elif rule.id == "HVAC-002":  # Has Air Terminals
            terminals = self._hvac_analysis.get("all_terminals", [])
            if not terminals:
                # Fallback to direct query
                terminals = list(self.model.by_type("IfcAirTerminal"))
            
            result.total_count = len(terminals)
            result.pass_count = len(terminals)
            result.coverage_percent = 100.0 if terminals else 0.0
            
            if len(terminals) >= rule.threshold_pass:
                result.passed = True
                result.severity = Severity.PASS
                result.message = f"Found {len(terminals)} air terminals"
            else:
                result.passed = False
                result.severity = rule.severity_fail
                result.message = "No air terminals found"
                result.recommendations.append(
                    "Add IfcAirTerminal entities (diffusers, grilles) for terminal analysis"
                )
        
        elif rule.id == "HVAC-004":  # Terminals Have Space Assignment
            terminals = list(self.model.by_type("IfcAirTerminal"))
            terminals_with_space = 0
            
            for terminal in terminals:
                try:
                    space = ifc_element.get_container(terminal, ifc_class="IfcSpace")
                    if space:
                        terminals_with_space += 1
                except Exception:
                    pass
            
            result.total_count = len(terminals)
            result.pass_count = terminals_with_space
            result.fail_count = len(terminals) - terminals_with_space
            result.coverage_percent = (terminals_with_space / len(terminals) * 100) if terminals else 100.0
            
            self._apply_threshold_result(rule, result)
            if not result.passed:
                result.recommendations.append(
                    "Assign air terminals to IfcSpace containers for proper room mapping"
                )
        
        elif rule.id == "HVAC-005":  # Has HVAC Systems
            systems = list(self.model.by_type("IfcSystem"))
            result.total_count = len(systems)
            result.pass_count = len(systems)
            result.coverage_percent = 100.0 if systems else 0.0
            
            if len(systems) >= rule.threshold_pass:
                result.passed = True
                result.severity = Severity.PASS
                result.message = f"Found {len(systems)} system definitions"
            else:
                result.passed = False
                result.severity = rule.severity_fail
                result.message = "No IfcSystem entities found"
                result.recommendations.append(
                    "Define IfcSystem entities to group HVAC components"
                )
        
        elif rule.id == "HVAC-006":  # Equipment Has System Assignment
            equipment = self._hvac_analysis.get("equipment", [])
            with_system = sum(1 for e in equipment if e.get("systems"))
            
            result.total_count = len(equipment)
            result.pass_count = with_system
            result.fail_count = len(equipment) - with_system
            result.coverage_percent = (with_system / len(equipment) * 100) if equipment else 100.0
            
            self._apply_threshold_result(rule, result)
    
    def _evaluate_ec_rule(self, rule: ValidationRule, result: RuleResult):
        """Evaluate Embodied Carbon rules."""
        elements = [e for e in self.model.by_type("IfcBuildingElement") if is_leaf_element(e)]
        
        if rule.id == "EC-001":  # Elements Have Materials
            with_material = sum(1 for e in elements if has_material(e))
            
            result.total_count = len(elements)
            result.pass_count = with_material
            result.fail_count = len(elements) - with_material
            result.coverage_percent = (with_material / len(elements) * 100) if elements else 0.0
            
            self._apply_threshold_result(rule, result)
            if not result.passed:
                result.recommendations.append(
                    "Assign materials to building elements for embodied carbon calculation"
                )
        
        elif rule.id == "EC-002":  # Elements Have Volumes
            from domain.geometry import compute_volume_from_geom
            
            with_volume = 0
            for e in elements:
                psets = ifc_element.get_psets(e) or {}
                has_vol = False
                
                # Check psets for volume
                for qset_name, props in psets.items():
                    if isinstance(props, dict):
                        for key in props.keys():
                            if key.lower() in ("netvolume", "grossvolume", "volume"):
                                has_vol = True
                                break
                    if has_vol:
                        break
                
                # Check geometry
                if not has_vol:
                    vol = compute_volume_from_geom(e)
                    if vol and vol > 0:
                        has_vol = True
                
                if has_vol:
                    with_volume += 1
            
            result.total_count = len(elements)
            result.pass_count = with_volume
            result.fail_count = len(elements) - with_volume
            result.coverage_percent = (with_volume / len(elements) * 100) if elements else 0.0
            
            self._apply_threshold_result(rule, result)
            if not result.passed:
                result.recommendations.append(
                    "Include Qto_*BaseQuantities with volume data, or ensure geometry is valid for volume calculation"
                )
        
        elif rule.id == "EC-003":  # Material Layers Present
            from domain.materials import get_material_layers_with_shares
            
            compound_types = ("IfcWall", "IfcSlab", "IfcRoof", "IfcCovering")
            compound_elements = [e for e in elements if any(e.is_a(t) for t in compound_types)]
            
            with_layers = 0
            for e in compound_elements:
                layers = get_material_layers_with_shares(e)
                if layers and len(layers) > 0:
                    with_layers += 1
            
            result.total_count = len(compound_elements)
            result.pass_count = with_layers
            result.fail_count = len(compound_elements) - with_layers
            result.coverage_percent = (with_layers / len(compound_elements) * 100) if compound_elements else 100.0
            
            self._apply_threshold_result(rule, result)
        
        elif rule.id == "EC-004":  # Has Base Quantities
            with_qto = 0
            for e in elements:
                psets = ifc_element.get_psets(e) or {}
                if any(k.lower().startswith("qto_") for k in psets.keys()):
                    with_qto += 1
            
            result.total_count = len(elements)
            result.pass_count = with_qto
            result.fail_count = len(elements) - with_qto
            result.coverage_percent = (with_qto / len(elements) * 100) if elements else 0.0
            
            self._apply_threshold_result(rule, result)
    
    def _evaluate_occupancy_rule(self, rule: ValidationRule, result: RuleResult):
        """Evaluate occupancy simulation rules."""
        spaces = list(self.model.by_type("IfcSpace"))
        
        if rule.id == "OCC-001":  # Spaces Have Area
            with_area = 0
            for space in spaces:
                psets = ifc_element.get_psets(space) or {}
                has_area = False
                for qset_name, props in psets.items():
                    if isinstance(props, dict):
                        for key in props.keys():
                            if key.lower() in ("netarea", "grossarea", "area", "netfloorarea"):
                                has_area = True
                                break
                    if has_area:
                        break
                if has_area:
                    with_area += 1
            
            result.total_count = len(spaces)
            result.pass_count = with_area
            result.fail_count = len(spaces) - with_area
            result.coverage_percent = (with_area / len(spaces) * 100) if spaces else 0.0
            
            self._apply_threshold_result(rule, result)
            if not result.passed:
                result.recommendations.append(
                    "Add Qto_SpaceBaseQuantities with NetFloorArea for occupancy calculation"
                )
        
        elif rule.id == "OCC-002":  # Spaces Have Names
            with_name = 0
            for space in spaces:
                name = getattr(space, "Name", None)
                long_name = getattr(space, "LongName", None)
                if (name and name.strip()) or (long_name and long_name.strip()):
                    with_name += 1
            
            result.total_count = len(spaces)
            result.pass_count = with_name
            result.fail_count = len(spaces) - with_name
            result.coverage_percent = (with_name / len(spaces) * 100) if spaces else 100.0
            
            self._apply_threshold_result(rule, result)
        
        elif rule.id == "OCC-003":  # Spaces Have Storey Assignment
            with_storey = 0
            for space in spaces:
                try:
                    storey = ifc_element.get_container(space, ifc_class="IfcBuildingStorey")
                    if storey:
                        with_storey += 1
                except Exception:
                    pass
            
            result.total_count = len(spaces)
            result.pass_count = with_storey
            result.fail_count = len(spaces) - with_storey
            result.coverage_percent = (with_storey / len(spaces) * 100) if spaces else 100.0
            
            self._apply_threshold_result(rule, result)
    
    def _apply_threshold_result(self, rule: ValidationRule, result: RuleResult):
        """Apply pass/warn/fail thresholds to a result."""
        coverage = result.coverage_percent
        
        if coverage >= rule.threshold_pass:
            result.passed = True
            result.severity = Severity.PASS
            result.message = f"{result.pass_count}/{result.total_count} ({coverage:.1f}%) passed"
        elif coverage >= rule.threshold_warn:
            result.passed = False
            result.severity = rule.severity_warn
            result.message = f"{result.pass_count}/{result.total_count} ({coverage:.1f}%) passed - below {rule.threshold_pass}% threshold"
        else:
            result.passed = False
            result.severity = rule.severity_fail
            result.message = f"{result.pass_count}/{result.total_count} ({coverage:.1f}%) passed - below {rule.threshold_warn}% minimum"
    
    def _build_domain_summaries(self):
        """Build summary statistics per domain."""
        for domain in Domain:
            domain_results = [r for r in self.report.results if r.domain == domain.value]
            
            if not domain_results:
                continue
            
            passed = sum(1 for r in domain_results if r.severity == Severity.PASS)
            warned = sum(1 for r in domain_results if r.severity == Severity.WARN)
            failed = sum(1 for r in domain_results if r.severity == Severity.FAIL)
            
            # Determine domain status
            if failed > 0:
                status = Severity.FAIL.value
            elif warned > 0:
                status = Severity.WARN.value
            else:
                status = Severity.PASS.value
            
            # Calculate feature readiness
            critical_rules = {
                Domain.CORE: ["CORE-001", "CORE-002", "CORE-003"],
                Domain.HVAC_FM: ["HVAC-001", "HVAC-002", "HVAC-003"],
                Domain.EC: ["EC-001", "EC-002"],
                Domain.OCCUPANCY: ["OCC-001", "OCC-003"],
            }
            
            critical_for_domain = critical_rules.get(domain, [])
            critical_passed = sum(
                1 for r in domain_results 
                if r.rule_id in critical_for_domain and r.passed
            )
            critical_total = len(critical_for_domain)
            
            feature_ready = critical_passed == critical_total if critical_total > 0 else True
            
            self.report.domain_summaries[domain.value] = {
                "status": status,
                "totalRules": len(domain_results),
                "passed": passed,
                "warned": warned,
                "failed": failed,
                "featureReady": feature_ready,
                "criticalRulesPassed": f"{critical_passed}/{critical_total}",
            }


# =============================================================================
# Public API
# =============================================================================

def validate_ifc(
    ifc_path: str | Path,
    job_id: Optional[str] = None,
    include_external_ids: bool = True
) -> ValidationReport:
    """
    Validate an IFC file and return a validation report.
    
    Args:
        ifc_path: Path to the IFC file
        job_id: Optional job ID for loading job-specific IDS files
        include_external_ids: Whether to include external IDS file validation
        
    Returns:
        ValidationReport with all rule results
    """
    validator = IFCValidator(ifc_path, job_id=job_id)
    return validator.validate(include_external_ids=include_external_ids)


def validate_ifc_to_json(
    ifc_path: str | Path,
    output_path: Optional[str | Path] = None,
    job_id: Optional[str] = None,
    include_external_ids: bool = True
) -> dict:
    """
    Validate an IFC file and return/save results as JSON.
    
    Args:
        ifc_path: Path to the IFC file
        output_path: Optional path to save validation.json
        job_id: Optional job ID for loading job-specific IDS files
        include_external_ids: Whether to include external IDS file validation
        
    Returns:
        Validation report as dictionary
    """
    report = validate_ifc(ifc_path, job_id=job_id, include_external_ids=include_external_ids)
    report_dict = report.to_dict()
    
    if output_path:
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(report_dict, f, indent=2, ensure_ascii=False)
    
    return report_dict


def get_validation_summary(report: ValidationReport | dict) -> dict:
    """
    Get a concise summary suitable for API responses.
    """
    if isinstance(report, ValidationReport):
        report = report.to_dict()
    
    return {
        "status": report["overallStatus"],
        "summary": report["summary"],
        "domainSummaries": report["domainSummaries"],
        "criticalIssues": [
            {
                "ruleId": r["ruleId"],
                "message": r["message"],
                "recommendations": r["recommendations"]
            }
            for r in report["results"]
            if r["severity"] == "fail"
        ]
    }


# =============================================================================
# CLI Entry Point
# =============================================================================

if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python ifc_validation.py <ifc_file> [output_json]")
        sys.exit(1)
    
    ifc_file = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None
    
    print(f"Validating: {ifc_file}")
    result = validate_ifc_to_json(ifc_file, output_file)
    
    print(f"\nOverall Status: {result['overallStatus'].upper()}")
    print(f"Pass: {result['summary']['passCount']}, Warn: {result['summary']['warnCount']}, Fail: {result['summary']['failCount']}")
    
    print("\nDomain Summaries:")
    for domain, summary in result['domainSummaries'].items():
        ready = "✓" if summary['featureReady'] else "✗"
        print(f"  {domain}: {summary['status']} ({ready} ready) - {summary['criticalRulesPassed']} critical rules")
    
    if output_file:
        print(f"\nDetailed report saved to: {output_file}")
