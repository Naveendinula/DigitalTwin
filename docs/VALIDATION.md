# IFC Validation System

The Digital Twin application includes an automated IFC validation system that checks uploaded models for compatibility with the viewer's features.

## Overview

Validation runs automatically during the upload pipeline and provides:
- **IDS-based rules** using `ifctester` for structural validation
- **Custom coverage metrics** for domain-specific requirements
- **Pass/Warn/Fail severities** with actionable recommendations

## Validation Domains

### Core Viewer (Required)
| Rule ID | Name | Threshold | Severity |
|---------|------|-----------|----------|
| CORE-001 | Has IfcProject | 1 required | Fail |
| CORE-002 | Has Building Storeys | 1 required | Fail |
| CORE-003 | Has Building Elements | 1 required | Fail |
| CORE-004 | Elements Have GlobalId | 95%+ pass | Warn |

### HVAC/FM Panel
| Rule ID | Name | Threshold | Severity |
|---------|------|-----------|----------|
| HVAC-001 | Has HVAC Equipment | 1+ recommended | Warn |
| HVAC-002 | Has Air Terminals | 1+ recommended | Warn |
| HVAC-003 | Has IfcSpaces | 1+ recommended | Warn |
| HVAC-004 | Terminals Have Space Assignment | 80%+ pass | Warn |
| HVAC-005 | Has HVAC Systems | 1+ recommended | Info |
| HVAC-006 | Equipment Has System Assignment | 50%+ pass | Info |

### Embodied Carbon Panel
| Rule ID | Name | Threshold | Severity |
|---------|------|-----------|----------|
| EC-001 | Elements Have Materials | 80%+ pass | Warn |
| EC-002 | Elements Have Volumes | 70%+ pass | Warn |
| EC-003 | Material Layers Present | 50%+ pass | Info |
| EC-004 | Has Base Quantities | 50%+ pass | Info |

### Occupancy Simulation
| Rule ID | Name | Threshold | Severity |
|---------|------|-----------|----------|
| OCC-001 | Spaces Have Area | 80%+ pass | Warn |
| OCC-002 | Spaces Have Names | 90%+ pass | Info |
| OCC-003 | Spaces Have Storey Assignment | 95%+ pass | Warn |

## API Endpoints

### Get Full Validation Report
```
GET /validation/{job_id}
```
Returns the complete validation report with all rule results.

### Get Validation Summary
```
GET /validation/{job_id}/summary
```
Returns a concise summary with status, counts, and critical issues.

### Get Domain-Specific Results
```
GET /validation/{job_id}/domain/{domain}
```
Where `domain` is one of: `core`, `hvac_fm`, `ec`, `occupancy`

### Get Issues Only
```
GET /validation/{job_id}/issues?severity=fail&domain=ec
```
Returns only failed/warning rules with optional filtering.

### Get Feature Readiness
```
GET /validation/{job_id}/feature-readiness
```
Returns whether each feature domain is ready to use.

### Force Re-validation
```
POST /validation/{job_id}/revalidate
```
Clears cache and re-runs validation.

### List All Rules
```
GET /validation/rules/list
```
Returns the complete rule definitions.

## Validation Report Schema

```json
{
  "schemaVersion": "1.0",
  "ifcFilename": "model.ifc",
  "ifcSchema": "IFC4",
  "overallStatus": "warn",
  "summary": {
    "passCount": 12,
    "warnCount": 3,
    "failCount": 0
  },
  "domainSummaries": {
    "core": {
      "status": "pass",
      "totalRules": 4,
      "passed": 4,
      "warned": 0,
      "failed": 0,
      "featureReady": true,
      "criticalRulesPassed": "3/3"
    }
  },
  "results": [
    {
      "ruleId": "CORE-001",
      "ruleName": "Has IfcProject",
      "domain": "core",
      "severity": "pass",
      "passed": true,
      "totalCount": 1,
      "passCount": 1,
      "failCount": 0,
      "coveragePercent": 100.0,
      "message": "Found 1 IfcProject entities",
      "examples": [],
      "recommendations": []
    }
  ]
}
```

## Feature Readiness

A feature domain is considered "ready" when all its critical rules pass:

| Domain | Critical Rules |
|--------|---------------|
| Core | CORE-001, CORE-002, CORE-003 |
| HVAC/FM | HVAC-001, HVAC-002, HVAC-003 |
| Embodied Carbon | EC-001, EC-002 |
| Occupancy | OCC-001, OCC-003 |

## CLI Usage

```bash
cd backend
python ifc_validation.py <ifc_file> [output_json]
```

Example:
```bash
python ifc_validation.py uploads/model.ifc validation_report.json
```

## Integration with Upload Pipeline

Validation runs automatically after hierarchy extraction:

1. Upload IFC file
2. Convert to GLB
3. Extract metadata
4. Extract spatial hierarchy
5. **Run validation** ← New step
6. Complete

The job response now includes:
- `validation_url`: Path to validation.json
- `validation_status`: Overall status ('pass', 'warn', 'fail')

## Frontend Display

The `ValidationBadge` component shows validation status in the app header:
- Green badge for passing models
- Yellow badge for models with warnings
- Red badge for models with failures

Click to expand and see:
- Domain-by-domain status
- Feature readiness indicators
- Critical issues with recommendations

## Tuning Thresholds

Thresholds are defined in `ifc_validation.py`:

```python
ValidationRule(
    id="EC-001",
    name="Elements Have Materials",
    threshold_pass=80,   # 80%+ = pass
    threshold_warn=50,   # 50-80% = warn
    # Below 50% = fail (using severity_fail)
)
```

Adjust these based on your model quality requirements.
