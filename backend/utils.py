"""
Shared backend utility helpers.
"""

from pathlib import Path
import glob
from typing import Any


def clean_text(value: Any) -> str:
    """Normalize arbitrary values into trimmed strings."""
    if value is None:
        return ""
    return str(value).strip()


def extract_space_identifiers(space: Any, psets: dict[str, Any]) -> tuple[str, str]:
    """
    Extract normalized room number and room name for an IfcSpace-like object.
    """
    number = ""
    for _, props in psets.items():
        if not isinstance(props, dict):
            continue
        for key, value in props.items():
            if key.lower() in ("number", "roomnumber", "space_number", "space number"):
                number = clean_text(value)
                break
        if number:
            break

    base_name = clean_text(getattr(space, "Name", None))
    long_name = clean_text(getattr(space, "LongName", None))

    room_no = number
    room_name = ""

    if not room_no and base_name and long_name:
        room_no = base_name

    if not room_no and base_name:
        tokens = base_name.split()
        if len(tokens) > 1 and any(char.isdigit() for char in tokens[0]):
            room_no = tokens[0]
            room_name = " ".join(tokens[1:]).strip()

    if not room_name:
        if long_name:
            room_name = long_name
        elif base_name and base_name != room_no:
            room_name = base_name

    return room_no, room_name


def find_ifc_for_job(job_id: str, upload_dir: Path) -> Path:
    """
    Locate the first IFC upload file for a job id using `{job_id}_*.ifc`.
    """
    search_pattern = str(upload_dir / f"{job_id}_*.ifc")
    matching_files = glob.glob(search_pattern)
    if not matching_files:
        raise FileNotFoundError(f"No IFC file found for job ID {job_id}")
    return Path(matching_files[0])
