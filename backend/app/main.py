"""
EngineTrace Backend - FastAPI Application
With rate limiting, CORS, and security middleware.
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import ALLOWED_ORIGINS, RATE_LIMIT
from app.database import init_db
from app.routes import auth_routes, engine_routes, scan_routes, dashboard_routes
from app.limiter import limiter


app = FastAPI(
    title="EngineTrace API",
    description="Automotive Engine Warehouse Management System",
    version="1.0.0",
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth_routes.router)
app.include_router(engine_routes.router)
app.include_router(scan_routes.router)
app.include_router(dashboard_routes.router)


@app.on_event("startup")
def startup():
    init_db()


@app.get("/api/health")
def health():
    return {"status": "healthy", "service": "EngineTrace API"}
