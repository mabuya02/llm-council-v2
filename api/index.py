"""Vercel serverless function entry point.

Vercel auto-detects this file and deploys the FastAPI app
as a serverless function handling all /api/* routes.
"""

from backend.main import app
