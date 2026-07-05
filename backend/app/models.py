"""
Pydantic models for request/response validation.
Strict input validation prevents injection and malformed data.
"""

# pyrefly: ignore [missing-import]
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime
import re


# ── Auth Models ────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=30)
    password: str = Field(..., min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v):
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("Username must be alphanumeric")
        return v


class UserResponse(BaseModel):
    id: int
    username: str
    full_name: str
    role: str


class TokenPayload(BaseModel):
    user_id: int
    username: str
    role: str
    exp: datetime


# ── Engine Models ──────────────────────────────────────────────────────

class EngineResponse(BaseModel):
    id: int
    engine_serial: str
    qr_code: str
    variant_code: str
    variant_name: str
    fuel_type: str
    displacement_cc: Optional[int] = None
    cylinder_count: Optional[int] = None
    manufacturing_date: str
    status: str
    location_code: Optional[str] = None
    created_at: str


class ScanRequest(BaseModel):
    """Strictly validated scan input to prevent injection via QR codes."""
    qr_data: str = Field(..., min_length=3, max_length=100)

    @field_validator("qr_data")
    @classmethod
    def qr_data_safe(cls, v):
        # Only allow alphanumeric, hyphens, and underscores
        if not re.match(r"^[a-zA-Z0-9\-_]+$", v):
            raise ValueError("QR data contains invalid characters")
        return v.strip()


class PutAwayRequest(BaseModel):
    engine_qr: str = Field(..., min_length=3, max_length=100)
    location_qr: str = Field(..., min_length=3, max_length=100)
    notes: Optional[str] = Field(None, max_length=500)

    @field_validator("engine_qr", "location_qr")
    @classmethod
    def qr_safe(cls, v):
        if not re.match(r"^[a-zA-Z0-9\-_]+$", v):
            raise ValueError("QR data contains invalid characters")
        return v.strip()


class RetrievalRequest(BaseModel):
    engine_qr: str = Field(..., min_length=3, max_length=100)
    notes: Optional[str] = Field(None, max_length=500)

    @field_validator("engine_qr")
    @classmethod
    def qr_safe(cls, v):
        if not re.match(r"^[a-zA-Z0-9\-_]+$", v):
            raise ValueError("QR data contains invalid characters")
        return v.strip()


class VerifyVINRequest(BaseModel):
    vehicle_vin: str = Field(..., min_length=10, max_length=20)
    engine_qr: str = Field(..., min_length=3, max_length=100)

    @field_validator("vehicle_vin")
    @classmethod
    def vin_safe(cls, v):
        if not re.match(r"^[A-Z0-9]+$", v):
            raise ValueError("VIN must be uppercase alphanumeric")
        return v.strip()

    @field_validator("engine_qr")
    @classmethod
    def engine_qr_safe(cls, v):
        if not re.match(r"^[a-zA-Z0-9\-_]+$", v):
            raise ValueError("Engine QR contains invalid characters")
        return v.strip()


# ── Location Models ────────────────────────────────────────────────────

class LocationResponse(BaseModel):
    id: int
    location_code: str
    qr_code: str
    rack_number: int
    shelf_number: int
    position_number: int
    is_occupied: bool
    zone: str
    label: Optional[str] = None
    notes: Optional[str] = None
    section_id: Optional[int] = None
    max_capacity: int = 1


# ── Verification Models ───────────────────────────────────────────────

class VerificationResult(BaseModel):
    status: str  # 'match' or 'mismatch'
    vehicle_vin: str
    vehicle_model: str
    required_variant: str
    scanned_engine: str
    scanned_variant: str
    message: str


class ResolveIncidentRequest(BaseModel):
    resolution_notes: str = Field(..., min_length=5, max_length=1000)


# ── Analytics Models ───────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_engines: int
    in_storage: int
    in_transit: int
    assembled: int
    quarantined: int
    total_locations: int
    occupied_locations: int
    pending_vehicles: int
    unresolved_mismatches: int
    total_movements_today: int


class MovementHistory(BaseModel):
    id: int
    engine_serial: str
    movement_type: str
    from_location: Optional[str]
    to_location: Optional[str]
    performed_by: str
    timestamp: str
    notes: Optional[str]


# ── User Management Models ────────────────────────────────────────────

class CreateUserRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=30)
    password: str = Field(..., min_length=8, max_length=128)
    full_name: str = Field(..., min_length=2, max_length=100)
    role: str = Field(..., max_length=20)

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v):
        if not re.match(r"^[a-zA-Z0-9_]+$", v):
            raise ValueError("Username must be alphanumeric")
        return v


class ChangePasswordRequest(BaseModel):
    password: str = Field(..., min_length=8, max_length=128)


# ── Engine & Variant Registration Models ──────────────────────────────

class RegisterEngineRequest(BaseModel):
    engine_serial: str = Field(..., min_length=3, max_length=50)
    variant_id: int
    manufacturing_date: str = Field(..., min_length=10, max_length=10)
    location_code: Optional[str] = None


class RegisterVariantRequest(BaseModel):
    variant_code: str = Field(..., min_length=2, max_length=20)
    variant_name: str = Field(..., min_length=2, max_length=100)
    fuel_type: str = Field(..., max_length=20)
    displacement_cc: int = Field(..., ge=0)
    cylinder_count: int = Field(..., ge=0)
    description: Optional[str] = Field(None, max_length=500)

    @field_validator("variant_code")
    @classmethod
    def code_safe(cls, v):
        if not re.match(r"^[A-Z0-9\-]+$", v):
            raise ValueError("Variant code must be uppercase alphanumeric and hyphens only")
        return v

    @field_validator("fuel_type")
    @classmethod
    def fuel_type_valid(cls, v):
        if v not in ('Petrol', 'Diesel', 'Hybrid', 'Electric'):
            raise ValueError("Fuel type must be Petrol, Diesel, Hybrid, or Electric")
        return v


class UpdateVariantRequest(BaseModel):
    variant_name: Optional[str] = Field(None, min_length=2, max_length=100)
    fuel_type: Optional[str] = Field(None, max_length=20)
    displacement_cc: Optional[int] = Field(None, ge=0)
    cylinder_count: Optional[int] = Field(None, ge=0)
    description: Optional[str] = Field(None, max_length=500)

    @field_validator("fuel_type")
    @classmethod
    def fuel_type_valid(cls, v):
        if v is not None and v not in ('Petrol', 'Diesel', 'Hybrid', 'Electric'):
            raise ValueError("Fuel type must be Petrol, Diesel, Hybrid, or Electric")
        return v


# ── Location Management Models ────────────────────────────────────────

class CreateLocationRequest(BaseModel):
    location_code: str = Field(..., min_length=3, max_length=20)
    rack_number: int = Field(..., ge=1)
    shelf_number: int = Field(..., ge=1)
    position_number: int = Field(..., ge=1)
    zone: str = Field(..., min_length=1, max_length=5)

    @field_validator("location_code")
    @classmethod
    def code_safe(cls, v):
        if not re.match(r"^[a-zA-Z0-9\-]+$", v):
            raise ValueError("Location code must be alphanumeric and hyphens only")
        return v.strip().upper()

    @field_validator("zone")
    @classmethod
    def zone_safe(cls, v):
        return v.strip().upper()


class UpdateLocationRequest(BaseModel):
    zone: Optional[str] = None
    is_occupied: Optional[bool] = None
    label: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=500)
    max_capacity: Optional[int] = Field(None, ge=1)
    rack_number: Optional[int] = Field(None, ge=1)
    shelf_number: Optional[int] = Field(None, ge=1)
    position_number: Optional[int] = Field(None, ge=1)
    section_id: Optional[int] = None


class BulkLocationRequest(BaseModel):
    rack_number: int = Field(..., ge=1)
    shelves: int = Field(..., ge=1, le=10)
    positions_per_shelf: int = Field(..., ge=1, le=20)
    zone: str = Field(..., min_length=1, max_length=5)
    section_id: Optional[int] = None

    @field_validator("zone")
    @classmethod
    def zone_safe(cls, v):
        return v.strip().upper()


# ── Warehouse Section Models ──────────────────────────────────────────

class CreateSectionRequest(BaseModel):
    section_code: str = Field(..., min_length=1, max_length=10)
    section_name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    color: str = Field(default='#3b82f6', max_length=9)
    max_racks: int = Field(default=10, ge=1)
    sort_order: int = Field(default=0, ge=0)

    @field_validator("section_code")
    @classmethod
    def code_safe(cls, v):
        if not re.match(r"^[A-Z0-9\-_]+$", v.upper()):
            raise ValueError("Section code must be alphanumeric")
        return v.strip().upper()

    @field_validator("color")
    @classmethod
    def color_valid(cls, v):
        if not re.match(r"^#[0-9a-fA-F]{6}$", v):
            raise ValueError("Color must be a valid hex color (e.g., #3b82f6)")
        return v


class UpdateSectionRequest(BaseModel):
    section_name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    color: Optional[str] = Field(None, max_length=9)
    max_racks: Optional[int] = Field(None, ge=1)
    is_active: Optional[bool] = None
    sort_order: Optional[int] = Field(None, ge=0)

    @field_validator("color")
    @classmethod
    def color_valid(cls, v):
        if v is not None and not re.match(r"^#[0-9a-fA-F]{6}$", v):
            raise ValueError("Color must be a valid hex color (e.g., #3b82f6)")
        return v
