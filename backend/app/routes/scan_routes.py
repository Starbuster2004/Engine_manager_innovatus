"""Scan operations: Put-away, retrieval, VIN verification."""

from fastapi import APIRouter, HTTPException, Request
from app.auth import get_current_user, require_role, log_audit
from app.database import get_connection
from app.models import PutAwayRequest, RetrievalRequest, VerifyVINRequest

router = APIRouter(prefix="/api/scan", tags=["Scanning"])


@router.post("/put-away")
def put_away(req: PutAwayRequest, request: Request):
    """Scan engine + location to store it. Operator/Supervisor only."""
    user = require_role("operator", "supervisor")(request)
    conn = get_connection()

    engine = conn.execute(
        "SELECT id, status, current_location_id FROM engines WHERE qr_code = ?",
        (req.engine_qr,),
    ).fetchone()
    if not engine:
        conn.close()
        raise HTTPException(status_code=404, detail="Engine not found")
    if engine["status"] not in ("in_transit", "in_storage"):
        conn.close()
        raise HTTPException(status_code=400, detail=f"Engine status '{engine['status']}' cannot be put away")

    location = conn.execute(
        "SELECT id, location_code, is_occupied FROM locations WHERE qr_code = ?",
        (req.location_qr,),
    ).fetchone()
    if not location:
        conn.close()
        raise HTTPException(status_code=404, detail="Location not found")
    if location["is_occupied"]:
        conn.close()
        raise HTTPException(status_code=409, detail=f"Location {location['location_code']} is already occupied")

    # Free old location if exists
    if engine["current_location_id"]:
        conn.execute("UPDATE locations SET is_occupied = 0 WHERE id = ?", (engine["current_location_id"],))

    # Update engine and location
    conn.execute("UPDATE engines SET status = 'in_storage', current_location_id = ? WHERE id = ?",
                 (location["id"], engine["id"]))
    conn.execute("UPDATE locations SET is_occupied = 1 WHERE id = ?", (location["id"],))

    # Record movement
    conn.execute(
        "INSERT INTO movements (engine_id, from_location_id, to_location_id, movement_type, performed_by, notes) VALUES (?, ?, ?, 'put_away', ?, ?)",
        (engine["id"], engine["current_location_id"], location["id"], user["user_id"], req.notes),
    )

    conn.commit()
    log_audit(user["user_id"], "put_away", "engine", str(engine["id"]),
              f"Placed at {location['location_code']}", request.client.host if request.client else None)
    conn.close()

    return {"status": "success", "message": f"Engine stored at {location['location_code']}", "location": location["location_code"]}


@router.post("/retrieval")
def retrieve_engine(req: RetrievalRequest, request: Request):
    """Retrieve an engine from storage. Operator/Supervisor only."""
    user = require_role("operator", "supervisor")(request)
    conn = get_connection()

    engine = conn.execute(
        "SELECT id, status, current_location_id FROM engines WHERE qr_code = ?",
        (req.engine_qr,),
    ).fetchone()
    if not engine:
        conn.close()
        raise HTTPException(status_code=404, detail="Engine not found")
    if engine["status"] != "in_storage":
        conn.close()
        raise HTTPException(status_code=400, detail=f"Engine status '{engine['status']}' - not in storage")

    old_loc = engine["current_location_id"]
    conn.execute("UPDATE engines SET status = 'in_transit', current_location_id = NULL WHERE id = ?", (engine["id"],))
    if old_loc:
        conn.execute("UPDATE locations SET is_occupied = 0 WHERE id = ?", (old_loc,))

    conn.execute(
        "INSERT INTO movements (engine_id, from_location_id, to_location_id, movement_type, performed_by, notes) VALUES (?, ?, NULL, 'retrieval', ?, ?)",
        (engine["id"], old_loc, user["user_id"], req.notes),
    )

    conn.commit()
    log_audit(user["user_id"], "retrieval", "engine", str(engine["id"]), None, request.client.host if request.client else None)
    conn.close()

    return {"status": "success", "message": "Engine retrieved from storage"}


@router.post("/verify-vin")
def verify_vin(req: VerifyVINRequest, request: Request):
    """THE HERO FEATURE: Verify engine-vehicle compatibility."""
    user = require_role("operator", "supervisor")(request)
    conn = get_connection()

    vehicle = conn.execute("""
        SELECT v.id, v.vin, v.model_name, v.required_variant_id, ev.variant_code as required_variant_code,
               ev.variant_name as required_variant_name
        FROM vehicles v
        JOIN engine_variants ev ON v.required_variant_id = ev.id
        WHERE v.vin = ?
    """, (req.vehicle_vin,)).fetchone()

    if not vehicle:
        conn.close()
        raise HTTPException(status_code=404, detail="Vehicle VIN not found in system")

    engine = conn.execute("""
        SELECT e.id, e.engine_serial, e.qr_code, e.variant_id, ev.variant_code, ev.variant_name
        FROM engines e
        JOIN engine_variants ev ON e.variant_id = ev.id
        WHERE e.qr_code = ?
    """, (req.engine_qr,)).fetchone()

    if not engine:
        conn.close()
        raise HTTPException(status_code=404, detail="Engine QR not found in system")

    is_match = engine["variant_id"] == vehicle["required_variant_id"]
    result = "match" if is_match else "mismatch"

    # Log verification
    conn.execute("""
        INSERT INTO verification_logs (vehicle_vin, engine_serial, expected_variant_id, actual_variant_id, result, verified_by)
        VALUES (?, ?, ?, ?, ?, ?)
    """, (req.vehicle_vin, engine["engine_serial"], vehicle["required_variant_id"], engine["variant_id"], result, user["user_id"]))

    if is_match:
        conn.execute("UPDATE vehicles SET assembly_status = 'in_progress', assigned_engine_id = ? WHERE id = ?",
                     (engine["id"], vehicle["id"]))
        conn.execute("UPDATE engines SET status = 'assembled' WHERE id = ?", (engine["id"],))
        msg = "Match Verified. Assembly Allowed."
    else:
        msg = "CRITICAL ERROR: Mismatch detected. Incident logged."

    conn.commit()
    log_audit(user["user_id"], "verify_vin", "verification", req.vehicle_vin,
              f"Result: {result} | Engine: {engine['engine_serial']}", request.client.host if request.client else None)
    conn.close()

    return {
        "status": result,
        "vehicle_vin": req.vehicle_vin,
        "vehicle_model": vehicle["model_name"],
        "required_variant": f"{vehicle['required_variant_code']} - {vehicle['required_variant_name']}",
        "scanned_engine": engine["engine_serial"],
        "scanned_variant": f"{engine['variant_code']} - {engine['variant_name']}",
        "message": msg,
    }
