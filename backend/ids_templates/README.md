# IDS Templates Directory

Place IDS (Information Delivery Specification) XML files here for validation.

## Usage

- Files ending in `.ids` will be loaded automatically as global templates
- Files can also be uploaded per-job via the API

## IDS Specification

IDS files must conform to the buildingSMART IDS schema:
- https://github.com/buildingSMART/IDS

## Example Structure

```
ids_templates/
├── default/           # Default templates loaded for all validations
│   └── basic.ids
├── uploaded/          # Per-job uploaded IDS files
│   └── {job_id}/
│       └── custom.ids
└── README.md
```
