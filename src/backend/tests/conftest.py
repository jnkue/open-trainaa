"""
Pytest configuration for backend tests.

Sets up the Python path to allow imports from the api module.
"""

import sys
from pathlib import Path

# Add parent directory (backend) to Python path
backend_dir = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(backend_dir))
