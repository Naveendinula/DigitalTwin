"""
IFC to GLB Converter Script

This script converts IFC (Industry Foundation Classes) files to GLB (glTF Binary) format
using the IfcConvert command-line tool from IfcOpenShell.

The --use-element-guids flag ensures mesh names in the GLB match IFC GlobalIds,
which is crucial for linking 3D geometry with BIM data.
"""

import subprocess
import sys
import os
from pathlib import Path


def convert_ifc_to_glb(input_ifc_path: str, output_glb_path: str) -> bool:
    """
    Convert an IFC file to GLB format using IfcConvert.

    Args:
        input_ifc_path: Path to the input IFC file.
        output_glb_path: Path for the output GLB file.

    Returns:
        True if conversion succeeded, False otherwise.

    Raises:
        RuntimeError: If IfcConvert is not found or conversion fails.
    """
    input_path = Path(input_ifc_path)

    # Ensure output directory exists
    output_path = Path(output_glb_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    # Build the IfcConvert command
    # --use-element-guids: Names meshes after their IFC GlobalIds (crucial for BIM linking)
    command = [
        "IfcConvert",
        "--use-element-guids",  # Mesh names will match IFC GlobalIds
        str(input_path),
        str(output_path)
    ]

    print(f"Converting: {input_ifc_path}")
    print(f"Output: {output_glb_path}")
    print(f"Command: {' '.join(command)}")

    try:
        # Run IfcConvert
        # Note: On Windows, IfcConvert outputs in UTF-16, so we need special encoding handling
        result = subprocess.run(
            command,
            capture_output=True,
            text=False,  # Get bytes, we'll decode manually
            check=False  # We'll handle errors manually for better messages
        )

        # Decode output with proper encoding
        # IfcConvert on Windows uses UTF-16, try multiple encodings
        stdout_text = ""
        stderr_text = ""
        
        for encoding in ['utf-16', 'utf-8', 'cp1252']:
            try:
                stdout_text = result.stdout.decode(encoding) if result.stdout else ""
                stderr_text = result.stderr.decode(encoding) if result.stderr else ""
                break
            except (UnicodeDecodeError, AttributeError):
                continue

        # Check for errors
        # Note: IfcConvert return code can be non-zero even for successful conversions
        # We'll verify by checking if output file exists instead
        if result.returncode != 0:
            error_msg = stderr_text if stderr_text else stdout_text
            # Only raise if output file doesn't exist (true error)
            if not output_path.exists():
                raise RuntimeError(
                    f"IfcConvert failed with return code {result.returncode}.\n"
                    f"Error output: {error_msg}"
                )

        # Verify output file was created
        if not output_path.exists():
            raise RuntimeError(
                "IfcConvert completed but output file was not created. "
                "Check if the IFC file contains valid geometry."
            )

        file_size = output_path.stat().st_size
        print(f"Conversion successful! Output size: {file_size} bytes")
        
        # Log IfcConvert output for debugging
        if stdout_text:
            print(f"IfcConvert stdout: {stdout_text[:200]}")
        if stderr_text:
            print(f"IfcConvert stderr: {stderr_text[:200]}")
        
        return True

    except FileNotFoundError:
        raise RuntimeError(
            "IfcConvert command not found. Please ensure IfcOpenShell is installed "
            "and IfcConvert is available in your system PATH.\n"
            "Install from: https://ifcopenshell.org/downloads.html"
        )


def main():
    """Main entry point for command-line usage."""
    if len(sys.argv) != 3:
        print("Usage: python ifc_converter.py <input.ifc> <output.glb>")
        print("Example: python ifc_converter.py model.ifc model.glb")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]

    try:
        convert_ifc_to_glb(input_file, output_file)
        print("Done!")
        sys.exit(0)
    except RuntimeError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(2)


if __name__ == "__main__":
    main()
