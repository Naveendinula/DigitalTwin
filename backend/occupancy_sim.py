"""
Occupancy Simulation Module

Generates synthetic occupancy data for building spaces.
Uses random walk with schedule-based profiles to simulate realistic patterns.
"""

import json
import math
import random
from datetime import datetime
from pathlib import Path
from typing import Any

from config import OUTPUT_DIR


def _get_time_multiplier() -> float:
    """
    Returns a multiplier (0.0 - 1.0) based on time of day to simulate
    realistic occupancy patterns (ramp-up, steady, wind-down).
    """
    hour = datetime.now().hour
    minute = datetime.now().minute
    time_decimal = hour + minute / 60.0

    # Night (10pm - 6am): very low occupancy
    if time_decimal < 6 or time_decimal >= 22:
        return 0.05

    # Early morning ramp-up (6am - 9am)
    if time_decimal < 9:
        return 0.1 + (time_decimal - 6) * 0.25  # 0.1 -> 0.85

    # Peak hours (9am - 5pm)
    if time_decimal < 17:
        # Slight dip around lunch (12-1pm)
        if 12 <= time_decimal < 13:
            return 0.6
        return 0.85

    # Wind-down (5pm - 10pm)
    return 0.85 - (time_decimal - 17) * 0.16  # 0.85 -> 0.05


def _estimate_capacity_from_area(area: float) -> int:
    """
    Estimate space capacity from area.
    Uses ~10 m² per person as a general office guideline.
    """
    if area <= 0:
        return 5  # Default for spaces without area
    persons_per_sqm = 10.0
    return max(1, int(area / persons_per_sqm))


def _calculate_footprint_area(footprint: list) -> float:
    """
    Calculate the area of a polygon using the Shoelace formula.
    
    Args:
        footprint: List of [x, y] coordinates forming a closed polygon.
        
    Returns:
        Area in square units.
    """
    if not footprint or len(footprint) < 3:
        return 0.0
    
    n = len(footprint)
    area = 0.0
    for i in range(n):
        j = (i + 1) % n
        area += footprint[i][0] * footprint[j][1]
        area -= footprint[j][0] * footprint[i][1]
    return abs(area) / 2.0


def generate_occupancy_snapshot(
    spaces: list[dict[str, Any]],
    previous_snapshot: dict[str, Any] | None = None,
    volatility: float = 0.15,
) -> dict[str, Any]:
    """
    Generate a single occupancy snapshot for all spaces.

    Args:
        spaces: List of space dicts with globalId, name, room_no, room_name, and optionally area.
        previous_snapshot: Previous snapshot to use for random walk continuity.
        volatility: How much occupancy can change per tick (0.0 - 1.0).

    Returns:
        Dict with spaces array and totals.
    """
    time_mult = _get_time_multiplier()
    prev_data = {}
    if previous_snapshot and "spaces" in previous_snapshot:
        prev_data = {s["globalId"]: s for s in previous_snapshot["spaces"]}

    result_spaces = []
    total_occupancy = 0
    total_capacity = 0

    for space in spaces:
        global_id = space.get("globalId", "")
        if not global_id:
            continue

        # Estimate capacity from area - prefer footprint area, then explicit area, then bbox
        area = space.get("area", 0)
        
        # Try footprint area first (most accurate)
        if not area and "footprint" in space:
            area = _calculate_footprint_area(space["footprint"])
        
        # Fallback to bbox area
        if not area and "bbox" in space:
            bbox = space["bbox"]
            min_pt = bbox.get("min", [0, 0, 0])
            max_pt = bbox.get("max", [0, 0, 0])
            # Approximate floor area from bbox (x * y dimensions)
            area = abs(max_pt[0] - min_pt[0]) * abs(max_pt[1] - min_pt[1])

        capacity = _estimate_capacity_from_area(area)

        # Get previous occupancy or start at time-adjusted baseline
        if global_id in prev_data:
            prev_occ = prev_data[global_id].get("occupancy", 0)
        else:
            # Initialize with some randomness around the time-based target
            base_target = capacity * time_mult
            prev_occ = int(base_target * random.uniform(0.5, 1.2))

        # Random walk with mean reversion toward time-based target
        target = capacity * time_mult * random.uniform(0.7, 1.1)
        max_change = max(1, int(capacity * volatility))

        # Bias toward target
        if prev_occ < target:
            change = random.randint(0, max_change)
        elif prev_occ > target:
            change = random.randint(-max_change, 0)
        else:
            change = random.randint(-max_change // 2, max_change // 2)

        new_occ = max(0, min(capacity, prev_occ + change))

        result_spaces.append({
            "globalId": global_id,
            "name": space.get("name", ""),
            "room_no": space.get("room_no", ""),
            "room_name": space.get("room_name", ""),
            "storey": space.get("storey", ""),
            "occupancy": new_occ,
            "capacity": capacity,
        })

        total_occupancy += new_occ
        total_capacity += capacity

    return {
        "spaces": result_spaces,
        "totals": {
            "totalOccupancy": total_occupancy,
            "totalCapacity": total_capacity,
        },
        "timestamp": datetime.now().isoformat(),
    }


def get_occupancy_path(job_id: str) -> Path:
    """Get the path to the current occupancy snapshot file."""
    job_output_dir = OUTPUT_DIR / job_id
    job_output_dir.mkdir(parents=True, exist_ok=True)
    return job_output_dir / "occupancy_current.json"


def load_current_occupancy(job_id: str) -> dict[str, Any] | None:
    """Load the current occupancy snapshot if it exists."""
    path = get_occupancy_path(job_id)
    if not path.exists():
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def save_occupancy_snapshot(job_id: str, snapshot: dict[str, Any]) -> None:
    """Save an occupancy snapshot to disk."""
    path = get_occupancy_path(job_id)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(snapshot, f, indent=2, ensure_ascii=False)


def generate_demo_loop(
    spaces: list[dict[str, Any]],
    frames: int = 30,
    interval_seconds: float = 2.0,
) -> list[dict[str, Any]]:
    """
    Generate a loop of occupancy frames for demo playback.

    Args:
        spaces: List of space dicts.
        frames: Number of frames to generate.
        interval_seconds: Simulated time between frames.

    Returns:
        List of occupancy snapshots.
    """
    snapshots = []
    prev = None

    for i in range(frames):
        snapshot = generate_occupancy_snapshot(spaces, prev, volatility=0.2)
        snapshot["frame"] = i
        snapshots.append(snapshot)
        prev = snapshot

    return snapshots
