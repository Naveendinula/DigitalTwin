import os
from pathlib import Path

# Base directory is the directory containing this file (backend/)
BASE_DIR = Path(__file__).resolve().parent

# Data Directories
UPLOAD_DIR = BASE_DIR / "uploads"
OUTPUT_DIR = BASE_DIR / "output"

# Database Paths
EC_DB_PATH = BASE_DIR / "prac-database.csv"

# Ensure directories exist
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
