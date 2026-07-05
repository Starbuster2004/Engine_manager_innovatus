"""Engine & inventory management routes with RBAC."""

from fastapi import APIRouter, HTTPException, Request, Depends, status
from app.auth import require_role, get_current_user, log_audit
from app.database import get_connection
from app.models import RegisterEngineRequest, RegisterVariantRequest, UpdateVariantRequest

router = APIRouter(prefix="/api/engines", tags=["Engines"])


@router.get("")
def list_engines(request: Request, status_filter: str = None, variant: str = None, q: str = None):
    """List engines. Supports search via 'q' param. Accessible by all roles."""
    user = require_role("operator", "supervisor", "plant_manager")(request)
    conn = get_connection()

    query = """
        SELECT e.id, e.engine_serial, e.qr_code, ev.variant_code, ev.variant_name,
               ev.fuel_type, ev.displacement_cc, ev.cylinder_count, e.manufacturing_date,
               e.status, l.location_code, e.created_at
        FROM engines e
        JOIN engine_variants ev ON e.variant_id = ev.id
        LEFT JOIN locations l ON e.current_location_id = l.id
        WHERE 1=1
    """
    params = []

    if status_filter:
        query += " AND e.status = ?"
        params.append(status_filter)
    if variant:
        query += " AND ev.variant_code = ?"
        params.append(variant)
    if q:
        query += " AND (e.engine_serial LIKE ? OR ev.variant_code LIKE ? OR l.location_code LIKE ?)"
        like = f"%{q}%"
        params.extend([like, like, like])

    query += " ORDER BY e.id DESC"
    try:
        rows = conn.execute(query, params).fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


@router.get("/lookup")
def lookup_engine(request: Request, qr: str):
    """Look up engine by QR code. Accessible by all authenticated users."""
    user = get_current_user(request)
    conn = get_connection()
    row = conn.execute("""
        SELECT e.id, e.engine_serial, e.qr_code, ev.variant_code, ev.variant_name,
               ev.fuel_type, ev.displacement_cc, ev.cylinder_count, e.manufacturing_date,
               e.status, l.location_code, e.created_at
        FROM engines e
        JOIN engine_variants ev ON e.variant_id = ev.id
        LEFT JOIN locations l ON e.current_location_id = l.id
        WHERE e.qr_code = ?
    """, (qr,)).fetchone()
    conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="Engine not found")
    return dict(row)


@router.get("/stats/summary")
def engine_summary(request: Request):
    """Lightweight engine stats accessible by operators."""
    user = require_role("operator", "supervisor", "plant_manager")(request)
    conn = get_connection()
    try:
        row = conn.execute("""
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN status = 'in_storage' THEN 1 ELSE 0 END) as in_storage,
                SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END) as in_transit,
                SUM(CASE WHEN status = 'assembled' THEN 1 ELSE 0 END) as assembled,
                SUM(CASE WHEN status = 'quarantined' THEN 1 ELSE 0 END) as quarantined
            FROM engines
        """).fetchone()
    finally:
        conn.close()
    return dict(row)


@router.get("/variants")
def list_variants(request: Request):
    """List all engine variants."""
    get_current_user(request)
    conn = get_connection()
    try:
        rows = conn.execute("SELECT * FROM engine_variants ORDER BY variant_code").fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


@router.get("/{engine_id}/history")
def engine_history(engine_id: int, request: Request):
    """Get movement history for an engine."""
    user = require_role("supervisor", "plant_manager")(request)
    conn = get_connection()
    rows = conn.execute("""
        SELECT m.id, e.engine_serial, m.movement_type,
               fl.location_code as from_location, tl.location_code as to_location,
               u.full_name as performed_by, m.timestamp, m.notes
        FROM movements m
        JOIN engines e ON m.engine_id = e.id
        LEFT JOIN locations fl ON m.from_location_id = fl.id
        LEFT JOIN locations tl ON m.to_location_id = tl.id
        JOIN users u ON m.performed_by = u.id
        WHERE m.engine_id = ?
        ORDER BY m.timestamp DESC
    """, (engine_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── Register Engine & Variant (Product) Routes ──────────────────────────

@router.post("")
def register_engine(req: RegisterEngineRequest, request: Request):
    """Register a new engine in the system. Accessible by supervisors and plant managers."""
    user = require_role("supervisor", "plant_manager")(request)
    conn = get_connection()
    
    existing = conn.execute("SELECT id FROM engines WHERE engine_serial = ?", (req.engine_serial,)).fetchone()
    if existing:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Engine serial number already registered."
        )
        
    variant = conn.execute("SELECT id FROM engine_variants WHERE id = ?", (req.variant_id,)).fetchone()
    if not variant:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Engine variant not found."
        )
        
    location_id = None
    engine_status = "in_transit"
    
    if req.location_code:
        loc = conn.execute(
            "SELECT id, is_occupied FROM locations WHERE location_code = ?", 
            (req.location_code,)
        ).fetchone()
        if not loc:
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Location {req.location_code} not found."
            )
        if loc["is_occupied"]:
            conn.close()
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Location {req.location_code} is already occupied."
            )
        location_id = loc["id"]
        engine_status = "in_storage"

    qr_code = f"ENGINE-{req.engine_serial}"
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO engines (engine_serial, qr_code, variant_id, manufacturing_date, status, current_location_id)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (req.engine_serial, qr_code, req.variant_id, req.manufacturing_date, engine_status, location_id)
        )
        engine_id = cursor.lastrowid
        
        if location_id:
            cursor.execute("UPDATE locations SET is_occupied = 1 WHERE id = ?", (location_id,))
            cursor.execute(
                """
                INSERT INTO movements (engine_id, to_location_id, movement_type, performed_by, notes)
                VALUES (?, ?, 'put_away', ?, 'Initial storage assignment upon registration')
                """,
                (engine_id, location_id, user["user_id"])
            )
            
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
        
    conn.close()
    
    log_audit(
        user["user_id"], 
        "register_engine", 
        "engines", 
        resource_id=str(engine_id), 
        details=f"Registered engine {req.engine_serial} (Variant ID: {req.variant_id})"
    )
    
    return {
        "message": f"Engine {req.engine_serial} registered successfully.",
        "id": engine_id,
        "qr_code": qr_code,
        "barcode": req.engine_serial
    }


@router.post("/variants")
def register_variant(req: RegisterVariantRequest, request: Request):
    """Register a new engine variant (product). Accessible by plant managers."""
    user = require_role("plant_manager")(request)
    conn = get_connection()
    
    existing = conn.execute("SELECT id FROM engine_variants WHERE variant_code = ?", (req.variant_code,)).fetchone()
    if existing:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Variant code already exists."
        )
        
    cursor = conn.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO engine_variants (variant_code, variant_name, fuel_type, displacement_cc, cylinder_count, description)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (req.variant_code, req.variant_name, req.fuel_type, req.displacement_cc, req.cylinder_count, req.description)
        )
        variant_id = cursor.lastrowid
        conn.commit()
    except Exception as e:
        conn.rollback()
        conn.close()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
        
    conn.close()
    
    log_audit(
        user["user_id"], 
        "register_variant", 
        "engine_variants", 
        resource_id=str(variant_id), 
        details=f"Registered new variant/product {req.variant_code} ({req.variant_name})"
    )
    
    return {
        "message": f"Product variant {req.variant_code} registered successfully.",
        "id": variant_id
    }


@router.put("/variants/{variant_id}")
def update_variant(variant_id: int, req: UpdateVariantRequest, request: Request):
    """Update an existing engine variant. Plant Manager only."""
    user = require_role("plant_manager")(request)
    conn = get_connection()
    
    try:
        existing = conn.execute("SELECT id, variant_code FROM engine_variants WHERE id = ?", (variant_id,)).fetchone()
        if not existing:
            raise HTTPException(status_code=404, detail="Variant not found.")
        
        updates = []
        params = []
        if req.variant_name is not None:
            updates.append("variant_name = ?"); params.append(req.variant_name)
        if req.fuel_type is not None:
            updates.append("fuel_type = ?"); params.append(req.fuel_type)
        if req.displacement_cc is not None:
            updates.append("displacement_cc = ?"); params.append(req.displacement_cc)
        if req.cylinder_count is not None:
            updates.append("cylinder_count = ?"); params.append(req.cylinder_count)
        if req.description is not None:
            updates.append("description = ?"); params.append(req.description)
        
        if updates:
            updates.append("updated_at = CURRENT_TIMESTAMP")
            params.append(variant_id)
            conn.execute(f"UPDATE engine_variants SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()
    
    log_audit(user["user_id"], "update_variant", "engine_variants", resource_id=str(variant_id), details=f"Updated variant {existing['variant_code']}")
    return {"message": f"Variant {existing['variant_code']} updated successfully."}

