import os
import sys
import argparse
from pathlib import Path
import fnmatch

# Configuration Defaults
DEFAULT_MAX_SIZE = 200 * 1024  # 200KB
DEFAULT_OUTPUT = "HELICOPTER_VIEW.md"
DEFAULT_EXCLUDES = [
    ".git", ".vscode", ".idea", "__pycache__", "node_modules", "venv", "env",
    "dist", "build", "out", "output", "uploads", "coverage", ".next",
    "*.lock", "*.log", "*.pyc", "*.pyo", "*.pyd", "*.so", "*.dll", "*.exe",
    "*.png", "*.jpg", "*.jpeg", "*.gif", "*.ico", "*.svg", "*.woff", "*.woff2",
    "*.ttf", "*.eot", "*.mp4", "*.webm", "*.mp3", "*.wav", "*.zip", "*.tar",
    "*.gz", "*.7z", "*.rar", "*.pdf", "*.ifc", "*.glb", "*.gltf", "*.bin",
    "package-lock.json", "yarn.lock"
]

def load_gitignore(root_path: Path) -> list[str]:
    """Load patterns from .gitignore if it exists."""
    gitignore_path = root_path / ".gitignore"
    patterns = []
    if gitignore_path.exists():
        try:
            with open(gitignore_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#"):
                        patterns.append(line)
        except Exception as e:
            print(f"Warning: Could not read .gitignore: {e}")
    return patterns

def should_exclude(path: Path, root_path: Path, exclude_patterns: list[str]) -> bool:
    """Check if a path should be excluded based on patterns."""
    rel_path = path.relative_to(root_path).as_posix()
    name = path.name
    
    for pattern in exclude_patterns:
        # Check against the name (e.g., *.pyc)
        if fnmatch.fnmatch(name, pattern):
            return True
        # Check against the relative path (e.g., backend/__pycache__)
        if fnmatch.fnmatch(rel_path, pattern):
            return True
        # Check if the pattern matches a directory component
        if f"/{pattern}/" in f"/{rel_path}/":
            return True
        if rel_path.startswith(f"{pattern}/") or rel_path == pattern:
            return True
            
    return False

def is_binary(file_path: Path) -> bool:
    """Check if a file is binary."""
    try:
        with open(file_path, "rb") as f:
            chunk = f.read(1024)
            return b"\0" in chunk
    except Exception:
        return True

def generate_tree(root_path: Path, exclude_patterns: list[str]) -> str:
    """Generate a directory tree string."""
    tree_lines = []
    
    def _walk(directory: Path, prefix: str = ""):
        # Get sorted list of items
        try:
            items = sorted(list(directory.iterdir()), key=lambda x: (not x.is_dir(), x.name.lower()))
        except PermissionError:
            return

        # Filter items
        filtered_items = [
            item for item in items 
            if not should_exclude(item, root_path, exclude_patterns)
        ]
        
        count = len(filtered_items)
        for i, item in enumerate(filtered_items):
            is_last = i == count - 1
            connector = "└── " if is_last else "├── "
            tree_lines.append(f"{prefix}{connector}{item.name}")
            
            if item.is_dir():
                extension = "    " if is_last else "│   "
                _walk(item, prefix + extension)

    tree_lines.append(root_path.name + "/")
    _walk(root_path)
    return "\n".join(tree_lines)

def main():
    parser = argparse.ArgumentParser(description="Generate a helicopter view of the repository.")
    parser.add_argument("--output", "-o", default=DEFAULT_OUTPUT, help="Output markdown file path")
    parser.add_argument("--max-size", "-s", type=int, default=DEFAULT_MAX_SIZE, help="Max file size in bytes to include content")
    parser.add_argument("--root", "-r", default=".", help="Root directory of the repository")
    args = parser.parse_args()

    root_path = Path(args.root).resolve()
    output_path = Path(args.output).resolve()
    
    # Combine default excludes with .gitignore
    exclude_patterns = DEFAULT_EXCLUDES + load_gitignore(root_path)
    
    print(f"Generating helicopter view for: {root_path}")
    print(f"Output file: {output_path}")
    
    # 1. Generate Tree
    print("Generating directory tree...")
    tree_content = generate_tree(root_path, exclude_patterns)
    
    # 2. Collect File Contents
    print("Collecting file contents...")
    file_contents = []
    included_count = 0
    skipped_count = 0
    skipped_reasons = {}

    for path in root_path.rglob("*"):
        if path.is_dir():
            continue
            
        if should_exclude(path, root_path, exclude_patterns):
            continue
            
        # Skip the output file itself if it's in the tree
        if path.resolve() == output_path:
            continue

        rel_path = path.relative_to(root_path).as_posix()
        
        # Check size
        try:
            size = path.stat().st_size
            if size > args.max_size:
                skipped_count += 1
                reason = "Too large"
                skipped_reasons[reason] = skipped_reasons.get(reason, 0) + 1
                continue
        except Exception:
            continue

        # Check binary
        if is_binary(path):
            skipped_count += 1
            reason = "Binary file"
            skipped_reasons[reason] = skipped_reasons.get(reason, 0) + 1
            continue

        # Read content
        try:
            with open(path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
                
            ext = path.suffix.lstrip(".")
            lang = ext if ext else ""
            
            # Map some extensions to markdown languages
            lang_map = {
                "js": "javascript", "jsx": "jsx", "ts": "typescript", "tsx": "tsx",
                "py": "python", "md": "markdown", "json": "json", "html": "html",
                "css": "css", "sh": "bash", "yml": "yaml", "yaml": "yaml"
            }
            lang = lang_map.get(lang, lang)

            file_section = f"\n## {rel_path}\n\n```{lang}\n{content}\n```\n"
            file_contents.append(file_section)
            included_count += 1
            
        except Exception as e:
            print(f"Error reading {rel_path}: {e}")
            skipped_count += 1
            reason = "Read error"
            skipped_reasons[reason] = skipped_reasons.get(reason, 0) + 1

    # 3. Write Output
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(f"# Helicopter View: {root_path.name}\n\n")
        f.write("## Repository Structure\n\n")
        f.write("```\n")
        f.write(tree_content)
        f.write("\n```\n")
        f.write("\n## File Contents\n")
        f.write("".join(file_contents))

    # 4. Summary
    print("\n--- Summary ---")
    print(f"Included files: {included_count}")
    print(f"Skipped files: {skipped_count}")
    for reason, count in skipped_reasons.items():
        print(f"  - {reason}: {count}")
    print(f"Helicopter view generated at: {output_path}")

if __name__ == "__main__":
    main()
