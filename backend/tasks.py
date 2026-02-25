"""
Background task orchestration for IFC processing.
"""

import asyncio
import json
import logging
from pathlib import Path
from typing import Optional

from ifc_converter import convert_ifc_to_glb
from ifc_metadata_extractor import extract_metadata, save_metadata, METADATA_SCHEMA_VERSION
from ifc_spatial_hierarchy import extract_spatial_hierarchy, save_hierarchy
from fm_sidecar_merger import find_fm_sidecar, merge_fm_sidecar
from config import GRAPH_BACKEND, OUTPUT_DIR
from job_security import update_job_record_status
from models import ConversionJob, JobStage, JobStatus
from url_helpers import build_protected_file_url

logger = logging.getLogger(__name__)


async def process_ifc_file(
    jobs: dict[str, ConversionJob],
    job_id: str,
    ifc_path: Path,
    sidecar_path: Optional[Path] = None,
    file_access_token: Optional[str] = None,
) -> None:
    """
    Background task to process IFC file.
    Converts to GLB and extracts metadata.

    Args:
        jobs: In-memory jobs dictionary.
        job_id: The job ID.
        ifc_path: Path to the uploaded IFC file.
        sidecar_path: Optional path to FM sidecar JSON file.
        file_access_token: Optional token used in protected file URLs.
    """
    job = jobs.get(job_id)
    if not job:
        return

    try:
        job.status = JobStatus.PROCESSING
        job.stage = JobStage.CONVERTING_GLB
        await update_job_record_status(job_id, status=JobStatus.PROCESSING.value)

        # Create output directory for this job
        job_output_dir = OUTPUT_DIR / job_id
        job_output_dir.mkdir(parents=True, exist_ok=True)

        # Define output paths
        glb_path = job_output_dir / "model.glb"
        metadata_path = job_output_dir / "metadata.json"
        hierarchy_path = job_output_dir / "hierarchy.json"
        graph_path = job_output_dir / "graph.json"

        # Run conversions (these are CPU-bound, run in thread pool)
        loop = asyncio.get_event_loop()

        # 1. Convert IFC to GLB (optional - may fail for geometry-less test files)
        logger.info("[%s] Converting IFC to GLB...", job_id)
        glb_conversion_success = False
        try:
            await loop.run_in_executor(
                None,
                convert_ifc_to_glb,
                str(ifc_path),
                str(glb_path)
            )
            glb_conversion_success = True
            logger.info("[%s] GLB conversion successful", job_id)
        except Exception as glb_err:
            logger.warning("[%s] GLB conversion failed (non-fatal for data-only files): %s", job_id, glb_err)
            # Continue processing - file may still contain metadata and hierarchy

        # 2. Extract metadata (always uses latest schema)
        job.stage = JobStage.EXTRACTING_METADATA
        logger.info("[%s] Extracting metadata (schema v%s)...", job_id, METADATA_SCHEMA_VERSION)
        try:
            metadata = await loop.run_in_executor(
                None,
                extract_metadata,
                str(ifc_path),
                job.ifc_filename
            )

            if "ifcSchema" in metadata:
                job.ifc_schema = metadata["ifcSchema"]
                await update_job_record_status(
                    job_id,
                    status=JobStatus.PROCESSING.value,
                    ifc_schema=job.ifc_schema,
                )

            await loop.run_in_executor(
                None,
                save_metadata,
                metadata,
                str(metadata_path)
            )

            # 2b. Merge FM sidecar if present (explicit path or auto-discovered)
            fm_sidecar = sidecar_path  # Use explicit path if provided
            if not fm_sidecar:
                # Fallback: auto-discover sidecar in upload directory
                fm_sidecar = find_fm_sidecar(job.ifc_filename, ifc_path.parent)

            if fm_sidecar and fm_sidecar.exists():
                logger.info("[%s] Found FM sidecar: %s", job_id, fm_sidecar.name)
                try:
                    merge_result = await loop.run_in_executor(
                        None,
                        merge_fm_sidecar,
                        metadata_path,
                        fm_sidecar
                    )
                    logger.info("[%s] FM sidecar merged: %s elements", job_id, merge_result["elements_merged"])
                    logger.info("[%s] FM sidecar elements in sidecar: %s", job_id, merge_result["elements_in_sidecar"])
                    logger.info("[%s] FM sidecar elements not found in IFC: %s", job_id, merge_result["elements_not_found"])

                    # Save merge report for debugging
                    merge_report_path = job_output_dir / "fm_merge_report.json"
                    with open(merge_report_path, 'w', encoding='utf-8') as f:
                        json.dump(merge_result, f, indent=2)
                except Exception as fm_err:
                    logger.warning("[%s] FM sidecar merge failed (non-fatal): %s", job_id, fm_err)
                    # Continue processing - sidecar errors should not fail the job
        except Exception as meta_err:
            logger.warning("[%s] Metadata extraction failed (non-fatal): %s", job_id, meta_err)
            # Save minimal fallback metadata
            fallback_metadata = {
                "schemaVersion": METADATA_SCHEMA_VERSION,
                "ifcSchema": "UNKNOWN",
                "fileName": job.ifc_filename,
                "orientation": {"modelYawDeg": 0, "trueNorthDeg": 0, "orientationSource": "default"},
                "elements": {}
            }
            await loop.run_in_executor(
                None,
                save_metadata,
                fallback_metadata,
                str(metadata_path)
            )

        # 2c. Build lightweight relationship graph.
        # When GRAPH_BACKEND=neo4j, build + sync are required and failures are fatal.
        logger.info("[%s] Building relationship graph...", job_id)
        try:
            from graph_builder import build_graph  # Lazy import to keep graph feature optional

            graph_stats = await loop.run_in_executor(
                None,
                build_graph,
                str(ifc_path),
                str(graph_path),
            )
            logger.info(
                "[%s] Graph build complete: %s nodes, %s edges",
                job_id,
                graph_stats["nodes"],
                graph_stats["edges"],
            )

            # 2d. Sync graph artifact to Neo4j
            try:
                from graph_store_neo4j import sync_graph_json_to_neo4j  # Lazy import

                sync_result = await loop.run_in_executor(
                    None,
                    sync_graph_json_to_neo4j,
                    job_id,
                    str(graph_path),
                )
                sync_enabled = bool(sync_result.get("enabled"))
                sync_error = sync_result.get("error")
                if GRAPH_BACKEND == "neo4j" and (not sync_enabled or sync_error):
                    raise RuntimeError(
                        f"Neo4j graph sync required but failed: {sync_error or 'driver unavailable'}"
                    )
                if sync_enabled and not sync_error:
                    logger.info(
                        "[%s] Neo4j graph sync complete: %s nodes, %s edges",
                        job_id,
                        sync_result.get("nodes", 0),
                        sync_result.get("edges", 0),
                    )
            except Exception as neo4j_err:
                if GRAPH_BACKEND == "neo4j":
                    raise
                logger.warning("[%s] Neo4j graph sync failed (non-fatal): %s", job_id, neo4j_err)
        except Exception as graph_err:
            if GRAPH_BACKEND == "neo4j":
                raise RuntimeError(f"Graph stage failed for neo4j backend: {graph_err}") from graph_err
            logger.warning("[%s] Graph build failed (non-fatal): %s", job_id, graph_err)

        # 3. Extract spatial hierarchy
        job.stage = JobStage.EXTRACTING_HIERARCHY
        logger.info("[%s] Extracting spatial hierarchy...", job_id)
        try:
            hierarchy = await loop.run_in_executor(
                None,
                extract_spatial_hierarchy,
                str(ifc_path)
            )
            await loop.run_in_executor(
                None,
                save_hierarchy,
                hierarchy,
                str(hierarchy_path)
            )
        except Exception as hier_err:
            logger.warning("[%s] Hierarchy extraction failed (non-fatal): %s", job_id, hier_err)
            # Create a minimal fallback hierarchy so frontend doesn't break
            fallback_hierarchy = {
                "type": "IfcProject",
                "name": "Hierarchy Extraction Failed",
                "globalId": "0000000000000000000000",
                "children": [],
                "properties": {}
            }
            await loop.run_in_executor(
                None,
                save_hierarchy,
                fallback_hierarchy,
                str(hierarchy_path)
            )

        # Update job with URLs
        job.stage = JobStage.FINALIZING
        job.status = JobStatus.COMPLETED
        job.stage = JobStage.COMPLETED
        # Only include GLB URL if conversion succeeded
        if glb_conversion_success:
            if file_access_token:
                job.glb_url = build_protected_file_url(job_id, "model.glb", file_access_token)
            else:
                job.glb_url = f"/files/{job_id}/model.glb"
        else:
            job.glb_url = None  # No geometry available
        if file_access_token:
            job.metadata_url = build_protected_file_url(job_id, "metadata.json", file_access_token)
            job.hierarchy_url = build_protected_file_url(job_id, "hierarchy.json", file_access_token)
        else:
            job.metadata_url = f"/files/{job_id}/metadata.json"
            job.hierarchy_url = f"/files/{job_id}/hierarchy.json"

        logger.info("[%s] Processing completed successfully", job_id)
        await update_job_record_status(
            job_id,
            status=JobStatus.COMPLETED.value,
            ifc_schema=job.ifc_schema,
        )

    except Exception as e:
        logger.exception("[%s] Processing failed: %s", job_id, e)
        job.status = JobStatus.FAILED
        job.stage = JobStage.FAILED
        job.error = str(e)
        await update_job_record_status(
            job_id,
            status=JobStatus.FAILED.value,
            ifc_schema=job.ifc_schema,
        )

    finally:
        # Clean up uploaded IFC file (optional - keep for debugging)
        # ifc_path.unlink(missing_ok=True)
        pass
