"""Dashboard analytics, audit logs, warehouse sections, and export routes. Supervisor + Plant Manager."""

import csv
import io
# pyrefly: ignore [missing-import]
from fastapi import APIRouter, HTTPException, Request, Query, status
# pyrefly: ignore [missing-import]
from fastapi.responses import StreamingResponse
from app.auth import require_role, get_current_user, log_audit
from app.database import get_connection
from app.models import (
    CreateLocationRequest, UpdateLocationRequest, BulkLocationRequest,
    CreateSectionRequest, UpdateSectionRequest,
)

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/stats")
def get_stats(request: Request):
    """Dashboard statistics. Supervisor + Plant Manager."""
    user = require_role("supervisor", "plant_manager")(request)
    conn = get_connection()

    try:
        stats = {}
        stats["total_engines"] = conn.execute("SELECT COUNT(*) FROM engines").fetchone()[0]
        stats["in_storage"] = conn.execute("SELECT COUNT(*) FROM engines WHERE status='in_storage'").fetchone()[0]
        stats["in_transit"] = conn.execute("SELECT COUNT(*) FROM engines WHERE status='in_transit'").fetchone()[0]
        stats["assembled"] = conn.execute("SELECT COUNT(*) FROM engines WHERE status='assembled'").fetchone()[0]
        stats["quarantined"] = conn.execute("SELECT COUNT(*) FROM engines WHERE status='quarantined'").fetchone()[0]
        stats["total_locations"] = conn.execute("SELECT COUNT(*) FROM locations").fetchone()[0]
        stats["occupied_locations"] = conn.execute("SELECT COUNT(*) FROM locations WHERE is_occupied=1").fetchone()[0]
        stats["pending_vehicles"] = conn.execute("SELECT COUNT(*) FROM vehicles WHERE assembly_status='pending'").fetchone()[0]
        stats["unresolved_mismatches"] = conn.execute("SELECT COUNT(*) FROM verification_logs WHERE result='mismatch' AND resolved=0").fetchone()[0]
        stats["total_movements_today"] = conn.execute("SELECT COUNT(*) FROM movements WHERE DATE(timestamp) = DATE('now')").fetchone()[0]
    finally:
        conn.close()
    return stats


@router.get("/movements")
def get_movements(request: Request, limit: int = 50):
    """Recent movement history."""
    user = require_role("supervisor", "plant_manager")(request)
    conn = get_connection()
    try:
        rows = conn.execute("""
            SELECT m.id, e.engine_serial, m.movement_type,
                   fl.location_code as from_location, tl.location_code as to_location,
                   u.full_name as performed_by, m.timestamp, m.notes
            FROM movements m
            JOIN engines e ON m.engine_id = e.id
            LEFT JOIN locations fl ON m.from_location_id = fl.id
            LEFT JOIN locations tl ON m.to_location_id = tl.id
            JOIN users u ON m.performed_by = u.id
            ORDER BY m.timestamp DESC LIMIT ?
        """, (min(limit, 200),)).fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


@router.get("/incidents")
def get_incidents(request: Request, resolved: int = None):
    """Get verification incidents. Supervisor + Plant Manager."""
    user = require_role("supervisor", "plant_manager")(request)
    conn = get_connection()

    query = """
        SELECT vl.id, vl.vehicle_vin, vl.engine_serial,
               ev1.variant_code as expected_variant, ev2.variant_code as actual_variant,
               vl.result, u.full_name as verified_by, vl.timestamp, vl.resolved,
               vl.resolution_notes
        FROM verification_logs vl
        JOIN engine_variants ev1 ON vl.expected_variant_id = ev1.id
        JOIN engine_variants ev2 ON vl.actual_variant_id = ev2.id
        JOIN users u ON vl.verified_by = u.id
    """
    params = []
    if resolved is not None:
        query += " WHERE vl.resolved = ?"
        params.append(resolved)
    query += " ORDER BY vl.timestamp DESC"

    try:
        rows = conn.execute(query, params).fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


@router.post("/incidents/{incident_id}/resolve")
def resolve_incident(incident_id: int, request: Request):
    """Resolve a mismatch incident. Supervisor only."""
    user = require_role("supervisor")(request)
    conn = get_connection()

    try:
        incident = conn.execute("SELECT id, resolved FROM verification_logs WHERE id = ?", (incident_id,)).fetchone()
        if not incident:
            raise HTTPException(status_code=404, detail="Incident not found")
        if incident["resolved"]:
            raise HTTPException(status_code=400, detail="Incident already resolved")

        conn.execute(
            "UPDATE verification_logs SET resolved = 1, resolved_by = ?, resolution_notes = 'Resolved by supervisor' WHERE id = ?",
            (user["user_id"], incident_id),
        )
        conn.commit()
    finally:
        conn.close()

    return {"status": "success", "message": "Incident resolved"}


@router.get("/audit-logs")
def get_audit_logs(request: Request, limit: int = 100):
    """View audit logs. Plant Manager only."""
    user = require_role("plant_manager")(request)
    conn = get_connection()
    try:
        rows = conn.execute("""
            SELECT al.id, u.full_name as user_name, u.role, al.action, al.resource,
                   al.resource_id, al.details, al.ip_address, al.timestamp
            FROM audit_logs al
            LEFT JOIN users u ON al.user_id = u.id
            ORDER BY al.timestamp DESC LIMIT ?
        """, (min(limit, 500),)).fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


@router.get("/locations")
def get_locations(request: Request, zone: str = None):
    """Get warehouse locations with occupancy."""
    user = require_role("supervisor", "plant_manager")(request)
    conn = get_connection()

    query = """
        SELECT l.id, l.location_code, l.qr_code, l.rack_number, l.shelf_number,
               l.position_number, l.is_occupied, l.zone, l.label, l.notes,
               l.section_id, l.max_capacity,
               e.engine_serial, ev.variant_code,
               ws.section_name, ws.color as section_color
        FROM locations l
        LEFT JOIN engines e ON e.current_location_id = l.id AND e.status = 'in_storage'
        LEFT JOIN engine_variants ev ON e.variant_id = ev.id
        LEFT JOIN warehouse_sections ws ON l.section_id = ws.id
    """
    params = []
    if zone:
        query += " WHERE l.zone = ?"
        params.append(zone)
    query += " ORDER BY l.rack_number, l.shelf_number, l.position_number"

    try:
        rows = conn.execute(query, params).fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


@router.get("/analytics")
def get_analytics(request: Request):
    """Charts data for Plant Manager."""
    user = require_role("plant_manager")(request)
    conn = get_connection()

    try:
        movements_by_day = conn.execute("""
            SELECT DATE(timestamp) as day, COUNT(*) as count
            FROM movements
            WHERE timestamp >= DATE('now', '-30 days')
            GROUP BY DATE(timestamp) ORDER BY day
        """).fetchall()

        by_variant = conn.execute("""
            SELECT ev.variant_code, COUNT(*) as count
            FROM engines e JOIN engine_variants ev ON e.variant_id = ev.id
            GROUP BY ev.variant_code
        """).fetchall()

        by_status = conn.execute("""
            SELECT status, COUNT(*) as count FROM engines GROUP BY status
        """).fetchall()

        total_verifications = conn.execute("SELECT COUNT(*) FROM verification_logs").fetchone()[0]
        matches = conn.execute("SELECT COUNT(*) FROM verification_logs WHERE result='match'").fetchone()[0]

        occupancy = conn.execute("""
            SELECT zone, COUNT(*) as total,
                   SUM(CASE WHEN is_occupied = 1 THEN 1 ELSE 0 END) as occupied
            FROM locations GROUP BY zone
        """).fetchall()
    finally:
        conn.close()

    return {
        "movements_by_day": [dict(r) for r in movements_by_day],
        "engines_by_variant": [dict(r) for r in by_variant],
        "engines_by_status": [dict(r) for r in by_status],
        "verification_rate": {
            "total": total_verifications,
            "matches": matches,
            "mismatches": total_verifications - matches,
            "rate": round(matches / total_verifications * 100, 1) if total_verifications > 0 else 0,
        },
        "occupancy_by_zone": [dict(r) for r in occupancy],
    }


@router.get("/vehicles")
def get_vehicles(request: Request):
    """List vehicles with assembly status."""
    user = require_role("supervisor", "plant_manager")(request)
    conn = get_connection()
    try:
        rows = conn.execute("""
            SELECT v.id, v.vin, v.model_name, ev.variant_code as required_variant,
                   v.assembly_status, e.engine_serial as assigned_engine
            FROM vehicles v
            JOIN engine_variants ev ON v.required_variant_id = ev.id
            LEFT JOIN engines e ON v.assigned_engine_id = e.id
            ORDER BY v.id
        """).fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


@router.get("/activity")
def get_activity(request: Request, limit: int = 20):
    """Unified activity feed — merges movements and audit logs."""
    user = require_role("supervisor", "plant_manager")(request)
    conn = get_connection()
    try:
        rows = conn.execute("""
            SELECT 'movement' as type, m.movement_type as action,
                   e.engine_serial as subject, u.full_name as actor,
                   m.timestamp, m.notes as detail
            FROM movements m
            JOIN engines e ON m.engine_id = e.id
            JOIN users u ON m.performed_by = u.id
            UNION ALL
            SELECT 'audit' as type, al.action,
                   al.resource || ':' || COALESCE(al.resource_id, '') as subject,
                   COALESCE(u.full_name, 'System') as actor,
                   al.timestamp, al.details as detail
            FROM audit_logs al
            LEFT JOIN users u ON al.user_id = u.id
            ORDER BY timestamp DESC LIMIT ?
        """, (min(limit, 100),)).fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


# ── Location Management Routes ──────────────────────────────────────────

@router.post("/locations")
def create_location(req: CreateLocationRequest, request: Request):
    """Add a new warehouse rack location. Supervisor + Plant Manager."""
    user = require_role("supervisor", "plant_manager")(request)
    conn = get_connection()
    
    try:
        existing = conn.execute("SELECT id FROM locations WHERE location_code = ?", (req.location_code,)).fetchone()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Location {req.location_code} already exists.")
            
        qr_code = f"LOC-{req.location_code}"
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO locations (location_code, qr_code, rack_number, shelf_number, position_number, is_occupied, zone)
            VALUES (?, ?, ?, ?, ?, 0, ?)""",
            (req.location_code, qr_code, req.rack_number, req.shelf_number, req.position_number, req.zone)
        )
        location_id = cursor.lastrowid
        conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    finally:
        conn.close()
    
    log_audit(user["user_id"], "create_location", "locations", resource_id=str(location_id), details=f"Created location {req.location_code} in zone {req.zone}")
    return {"message": f"Location {req.location_code} created successfully.", "id": location_id}


@router.post("/locations/bulk")
def create_locations_bulk(req: BulkLocationRequest, request: Request):
    """Bulk create locations for an entire rack. Supervisor + Plant Manager."""
    user = require_role("supervisor", "plant_manager")(request)
    conn = get_connection()
    
    created = []
    try:
        cursor = conn.cursor()
        for shelf in range(1, req.shelves + 1):
            for pos in range(1, req.positions_per_shelf + 1):
                code = f"R{req.rack_number:02d}-S{shelf:02d}-P{pos:02d}"
                qr = f"LOC-{code}"
                existing = conn.execute("SELECT id FROM locations WHERE location_code = ?", (code,)).fetchone()
                if existing:
                    continue
                cursor.execute(
                    """INSERT INTO locations (location_code, qr_code, rack_number, shelf_number, position_number, is_occupied, zone, section_id)
                    VALUES (?, ?, ?, ?, ?, 0, ?, ?)""",
                    (code, qr, req.rack_number, shelf, pos, req.zone, req.section_id)
                )
                created.append(code)
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    finally:
        conn.close()
    
    log_audit(user["user_id"], "bulk_create_locations", "locations", details=f"Created {len(created)} locations for rack {req.rack_number}")
    return {"message": f"Created {len(created)} locations for Rack {req.rack_number}.", "locations": created}


@router.put("/locations/{location_id}")
def update_location(location_id: int, req: UpdateLocationRequest, request: Request):
    """Update a location. Supervisor + Plant Manager."""
    user = require_role("supervisor", "plant_manager")(request)
    conn = get_connection()
    
    try:
        loc = conn.execute("SELECT id, location_code, is_occupied FROM locations WHERE id = ?", (location_id,)).fetchone()
        if not loc:
            raise HTTPException(status_code=404, detail="Location not found.")
            
        if req.is_occupied is not None and not req.is_occupied:
            engine = conn.execute("SELECT id, engine_serial FROM engines WHERE current_location_id = ? AND status = 'in_storage'", (location_id,)).fetchone()
            if engine:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot clear occupancy. Engine {engine['engine_serial']} is currently stored here.")
            
        updates = []
        params = []
        if req.zone is not None:
            updates.append("zone = ?")
            params.append(req.zone.strip().upper())
        if req.is_occupied is not None:
            updates.append("is_occupied = ?")
            params.append(1 if req.is_occupied else 0)
        if req.label is not None:
            updates.append("label = ?")
            params.append(req.label.strip() if req.label else None)
        if req.notes is not None:
            updates.append("notes = ?")
            params.append(req.notes.strip() if req.notes else None)
        if req.max_capacity is not None:
            updates.append("max_capacity = ?")
            params.append(req.max_capacity)
        if req.rack_number is not None:
            updates.append("rack_number = ?")
            params.append(req.rack_number)
        if req.shelf_number is not None:
            updates.append("shelf_number = ?")
            params.append(req.shelf_number)
        if req.position_number is not None:
            updates.append("position_number = ?")
            params.append(req.position_number)
        if req.section_id is not None:
            updates.append("section_id = ?")
            params.append(req.section_id)
        
        if updates:
            updates.append("updated_at = CURRENT_TIMESTAMP")
            params.append(location_id)
            conn.execute(f"UPDATE locations SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    finally:
        conn.close()
    
    log_audit(user["user_id"], "update_location", "locations", resource_id=str(location_id), details=f"Updated location {loc['location_code']}")
    return {"message": f"Location {loc['location_code']} updated successfully."}


@router.delete("/locations/{location_id}")
def delete_location(location_id: int, request: Request):
    """Delete a warehouse location. Supervisor + Plant Manager."""
    user = require_role("supervisor", "plant_manager")(request)
    conn = get_connection()
    
    try:
        loc = conn.execute("SELECT id, location_code, is_occupied FROM locations WHERE id = ?", (location_id,)).fetchone()
        if not loc:
            raise HTTPException(status_code=404, detail="Location not found.")
            
        if loc["is_occupied"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete an occupied location. Clear its inventory first.")
            
        import sqlite3 as _sqlite3
        try:
            conn.execute("DELETE FROM locations WHERE id = ?", (location_id,))
            conn.commit()
        except _sqlite3.IntegrityError:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete this location because it is referenced by historical transaction logs.")
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    finally:
        conn.close()
    
    log_audit(user["user_id"], "delete_location", "locations", resource_id=str(location_id), details=f"Deleted location {loc['location_code']}")
    return {"message": f"Location {loc['location_code']} deleted successfully."}


# ── Warehouse Section Management Routes ──────────────────────────────────

@router.get("/sections")
def list_sections(request: Request):
    """List all warehouse sections."""
    user = require_role("supervisor", "plant_manager")(request)
    conn = get_connection()
    try:
        rows = conn.execute("""
            SELECT ws.*, COUNT(l.id) as location_count,
                   SUM(CASE WHEN l.is_occupied = 1 THEN 1 ELSE 0 END) as occupied_count
            FROM warehouse_sections ws
            LEFT JOIN locations l ON l.section_id = ws.id
            GROUP BY ws.id
            ORDER BY ws.sort_order, ws.section_code
        """).fetchall()
    finally:
        conn.close()
    return [dict(r) for r in rows]


@router.post("/sections")
def create_section(req: CreateSectionRequest, request: Request):
    """Create a new warehouse section. Plant Manager only."""
    user = require_role("plant_manager")(request)
    conn = get_connection()
    
    try:
        existing = conn.execute("SELECT id FROM warehouse_sections WHERE section_code = ?", (req.section_code,)).fetchone()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Section '{req.section_code}' already exists.")
        
        cursor = conn.cursor()
        cursor.execute(
            """INSERT INTO warehouse_sections (section_code, section_name, description, color, max_racks, sort_order)
            VALUES (?, ?, ?, ?, ?, ?)""",
            (req.section_code, req.section_name, req.description, req.color, req.max_racks, req.sort_order)
        )
        section_id = cursor.lastrowid
        conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    finally:
        conn.close()
    
    log_audit(user["user_id"], "create_section", "warehouse_sections", resource_id=str(section_id), details=f"Created section {req.section_code}: {req.section_name}")
    return {"message": f"Section '{req.section_code}' created.", "id": section_id}


@router.put("/sections/{section_id}")
def update_section(section_id: int, req: UpdateSectionRequest, request: Request):
    """Update a warehouse section. Plant Manager only."""
    user = require_role("plant_manager")(request)
    conn = get_connection()
    
    try:
        section = conn.execute("SELECT id, section_code FROM warehouse_sections WHERE id = ?", (section_id,)).fetchone()
        if not section:
            raise HTTPException(status_code=404, detail="Section not found.")
        
        updates = []
        params = []
        if req.section_name is not None:
            updates.append("section_name = ?"); params.append(req.section_name)
        if req.description is not None:
            updates.append("description = ?"); params.append(req.description)
        if req.color is not None:
            updates.append("color = ?"); params.append(req.color)
        if req.max_racks is not None:
            updates.append("max_racks = ?"); params.append(req.max_racks)
        if req.is_active is not None:
            updates.append("is_active = ?"); params.append(1 if req.is_active else 0)
        if req.sort_order is not None:
            updates.append("sort_order = ?"); params.append(req.sort_order)
        
        if updates:
            updates.append("updated_at = CURRENT_TIMESTAMP")
            params.append(section_id)
            conn.execute(f"UPDATE warehouse_sections SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    finally:
        conn.close()
    
    log_audit(user["user_id"], "update_section", "warehouse_sections", resource_id=str(section_id), details=f"Updated section {section['section_code']}")
    return {"message": f"Section '{section['section_code']}' updated."}


@router.delete("/sections/{section_id}")
def delete_section(section_id: int, request: Request):
    """Delete a warehouse section. Plant Manager only. Only if no locations reference it."""
    user = require_role("plant_manager")(request)
    conn = get_connection()
    
    try:
        section = conn.execute("SELECT id, section_code FROM warehouse_sections WHERE id = ?", (section_id,)).fetchone()
        if not section:
            raise HTTPException(status_code=404, detail="Section not found.")
        
        loc_count = conn.execute("SELECT COUNT(*) FROM locations WHERE section_id = ?", (section_id,)).fetchone()[0]
        if loc_count > 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Cannot delete section '{section['section_code']}' — {loc_count} locations are assigned to it. Reassign or delete them first.")
        
        conn.execute("DELETE FROM warehouse_sections WHERE id = ?", (section_id,))
        conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))
    finally:
        conn.close()
    
    log_audit(user["user_id"], "delete_section", "warehouse_sections", resource_id=str(section_id), details=f"Deleted section {section['section_code']}")
    return {"message": f"Section '{section['section_code']}' deleted."}


# ── Export Routes ─────────────────────────────────────────────────────────

def _make_csv_response(rows, headers, filename):
    """Generate a CSV streaming response."""
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(headers)
    for row in rows:
        writer.writerow([row[h] if h in row.keys() else '' for h in headers])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/export/engines")
def export_engines(request: Request):
    """Export engines data as CSV. Plant Manager only."""
    user = require_role("plant_manager")(request)
    conn = get_connection()
    try:
        rows = conn.execute("""
            SELECT e.engine_serial, ev.variant_code, ev.variant_name, ev.fuel_type,
                   e.manufacturing_date, e.status, l.location_code, l.zone, e.created_at
            FROM engines e
            JOIN engine_variants ev ON e.variant_id = ev.id
            LEFT JOIN locations l ON e.current_location_id = l.id
            ORDER BY e.created_at DESC
        """).fetchall()
    finally:
        conn.close()
    headers = ["engine_serial", "variant_code", "variant_name", "fuel_type", "manufacturing_date", "status", "location_code", "zone", "created_at"]
    return _make_csv_response(rows, headers, "engines_export.csv")


@router.get("/export/movements")
def export_movements(request: Request):
    """Export movements data as CSV. Plant Manager only."""
    user = require_role("plant_manager")(request)
    conn = get_connection()
    try:
        rows = conn.execute("""
            SELECT e.engine_serial, m.movement_type,
                   fl.location_code as from_location, tl.location_code as to_location,
                   u.full_name as performed_by, m.timestamp, m.notes
            FROM movements m
            JOIN engines e ON m.engine_id = e.id
            LEFT JOIN locations fl ON m.from_location_id = fl.id
            LEFT JOIN locations tl ON m.to_location_id = tl.id
            JOIN users u ON m.performed_by = u.id
            ORDER BY m.timestamp DESC
        """).fetchall()
    finally:
        conn.close()
    headers = ["engine_serial", "movement_type", "from_location", "to_location", "performed_by", "timestamp", "notes"]
    return _make_csv_response(rows, headers, "movements_export.csv")


@router.get("/export/audit-logs")
def export_audit_logs(request: Request):
    """Export audit logs as CSV. Plant Manager only."""
    user = require_role("plant_manager")(request)
    conn = get_connection()
    try:
        rows = conn.execute("""
            SELECT u.full_name as user_name, u.role, al.action, al.resource,
                   al.resource_id, al.details, al.ip_address, al.timestamp
            FROM audit_logs al
            LEFT JOIN users u ON al.user_id = u.id
            ORDER BY al.timestamp DESC
        """).fetchall()
    finally:
        conn.close()
    headers = ["user_name", "role", "action", "resource", "resource_id", "details", "ip_address", "timestamp"]
    return _make_csv_response(rows, headers, "audit_logs_export.csv")


@router.get("/export/locations")
def export_locations(request: Request):
    """Export locations data as CSV. Plant Manager only."""
    user = require_role("plant_manager")(request)
    conn = get_connection()
    try:
        rows = conn.execute("""
            SELECT l.location_code, l.zone, l.rack_number, l.shelf_number, l.position_number,
                   l.is_occupied, l.max_capacity, l.label, l.notes,
                   ws.section_name, e.engine_serial
            FROM locations l
            LEFT JOIN warehouse_sections ws ON l.section_id = ws.id
            LEFT JOIN engines e ON e.current_location_id = l.id AND e.status = 'in_storage'
            ORDER BY l.rack_number, l.shelf_number, l.position_number
        """).fetchall()
    finally:
        conn.close()
    headers = ["location_code", "zone", "rack_number", "shelf_number", "position_number", "is_occupied", "max_capacity", "label", "notes", "section_name", "engine_serial"]
    return _make_csv_response(rows, headers, "locations_export.csv")
