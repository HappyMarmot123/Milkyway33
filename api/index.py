"""Vercel Python serverless entrypoint.

Exposes the existing FastAPI app (backend/main.py) so Vercel can serve it
as a serverless function. vercel.json rewrites /api/* to this handler, and
FastAPI's routes (mounted at /api/v1) match the original request path.
"""
import os
import sys

# Make the backend package importable (backend/main.py, backend/app/...).
BACKEND_DIR = os.path.join(os.path.dirname(__file__), "..", "backend")
sys.path.insert(0, os.path.abspath(BACKEND_DIR))

from main import app  # noqa: E402  (FastAPI instance)
