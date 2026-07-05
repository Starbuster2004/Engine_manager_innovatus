"""
Configuration settings for the EngineTrace backend.
"""

import os
import secrets

# JWT Configuration
SECRET_KEY = os.getenv("ENGINE_TRACE_SECRET", secrets.token_urlsafe(32))
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 8  # One factory shift

# Rate Limiting
RATE_LIMIT = "100/second"  # High limit for dashboard polling to avoid accidental lockouts

# CORS Origins (frontend)
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
]
# Add production frontend URL if set
if os.getenv("FRONTEND_URL"):
    ALLOWED_ORIGINS.append(os.getenv("FRONTEND_URL"))

# Cookie settings
COOKIE_NAME = "engine_trace_session"
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"
COOKIE_HTTPONLY = True
COOKIE_SAMESITE = os.getenv("COOKIE_SAMESITE", "lax")
COOKIE_MAX_AGE = JWT_EXPIRATION_HOURS * 3600
