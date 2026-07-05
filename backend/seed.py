"""
Seed the database with realistic automotive data.
Creates 50 engines, warehouse locations, vehicles, and user accounts.
"""

import sqlite3
import random
import string
from datetime import datetime, timedelta
from pathlib import Path

import bcrypt

from app.database import get_connection, init_db


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def seed():
    init_db()
    conn = get_connection()
    cursor = conn.cursor()

    # Check if already seeded
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] > 0:
        print("Database already seeded. Skipping.")
        conn.close()
        return

    # ── Users ──────────────────────────────────────────────────────────
    users = [
        ("operator1", hash_password("Op3r@tor!2026"), "Rajesh Kumar", "operator"),
        ("operator2", hash_password("Op3r@tor!2026"), "Ananya Singh", "operator"),
        ("operator3", hash_password("Op3r@tor!2026"), "Vikram Patel", "operator"),
        ("supervisor1", hash_password("Sup3rv!sor2026"), "Priya Sharma", "supervisor"),
        ("supervisor2", hash_password("Sup3rv!sor2026"), "Arjun Mehta", "supervisor"),
        ("manager1", hash_password("M@nager!2026"), "Kavitha Reddy", "plant_manager"),
    ]
    cursor.executemany(
        "INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)",
        users,
    )

    # ── Warehouse Sections ─────────────────────────────────────────────
    sections = [
        ("A", "Zone A — Light Engines", "I4 Petrol and Hybrid engines storage", "#3b82f6", 4, 1, 0),
        ("B", "Zone B — Mid-Range", "V6 Petrol and Diesel engines storage", "#10b981", 4, 1, 1),
        ("C", "Zone C — Heavy Duty", "V8 and heavy-duty engine storage", "#f59e0b", 4, 1, 2),
        ("D", "Zone D — Electric & Special", "Electric drive units and quarantine", "#8b5cf6", 4, 1, 3),
    ]
    cursor.executemany(
        "INSERT INTO warehouse_sections (section_code, section_name, description, color, max_racks, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
        sections,
    )

    # ── Engine Variants ────────────────────────────────────────────────
    variants = [
        ("V6T-PET", "V6 Turbo Petrol", "Petrol", 2997, 6, "High-performance V6 turbo engine"),
        ("I4-PET", "Inline-4 Petrol", "Petrol", 1998, 4, "Standard inline-4 petrol engine"),
        ("V8-PET", "V8 Naturally Aspirated", "Petrol", 4999, 8, "Premium V8 engine"),
        ("I4-DSL", "Inline-4 Diesel", "Diesel", 2179, 4, "Fuel-efficient diesel engine"),
        ("V6-DSL", "V6 Diesel", "Diesel", 2993, 6, "Heavy-duty V6 diesel engine"),
        ("I4-HYB", "Inline-4 Hybrid", "Hybrid", 1598, 4, "Eco-friendly hybrid powertrain"),
        ("I3-HYB", "Inline-3 Hybrid", "Hybrid", 1199, 3, "Compact hybrid engine"),
        ("EV-MOT", "Electric Drive Unit", "Electric", 0, 0, "Full electric drive motor"),
    ]
    cursor.executemany(
        "INSERT INTO engine_variants (variant_code, variant_name, fuel_type, displacement_cc, cylinder_count, description) VALUES (?, ?, ?, ?, ?, ?)",
        variants,
    )

    # ── Warehouse Locations (4 Racks × 3 Shelves × 10 Positions) ─────
    locations = []
    for rack in range(1, 5):
        for shelf in range(1, 4):
            for pos in range(1, 11):
                code = f"R{rack:02d}-S{shelf:02d}-P{pos:02d}"
                qr = f"LOC-{code}"
                zone = chr(64 + rack)  # A, B, C, D
                section_id = rack  # Map rack 1→section 1 (A), rack 2→section 2 (B), etc.
                locations.append((code, qr, rack, shelf, pos, 0, 1, zone, section_id))

    cursor.executemany(
        "INSERT INTO locations (location_code, qr_code, rack_number, shelf_number, position_number, is_occupied, max_capacity, zone, section_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        locations,
    )

    # ── Engines (50 total) ─────────────────────────────────────────────
    engines = []
    variant_ids = list(range(1, 9))
    used_locations = set()

    for i in range(1, 51):
        serial = f"ENG-{2026}{i:04d}"
        qr = f"ENGINE-{serial}"
        variant_id = random.choice(variant_ids)
        mfg_date = (datetime.now() - timedelta(days=random.randint(1, 180))).strftime("%Y-%m-%d")

        # Place ~35 engines in storage with random locations
        if i <= 35:
            loc_id = random.randint(1, 120)
            while loc_id in used_locations:
                loc_id = random.randint(1, 120)
            used_locations.add(loc_id)
            status = "in_storage"
        elif i <= 40:
            loc_id = None
            status = "in_transit"
        elif i <= 45:
            loc_id = None
            status = "assembled"
        else:
            loc_id = None
            status = "quarantined"

        engines.append((serial, qr, variant_id, mfg_date, status, loc_id))

    cursor.executemany(
        "INSERT INTO engines (engine_serial, qr_code, variant_id, manufacturing_date, status, current_location_id) VALUES (?, ?, ?, ?, ?, ?)",
        engines,
    )

    # Mark occupied locations
    for loc_id in used_locations:
        cursor.execute("UPDATE locations SET is_occupied = 1 WHERE id = ?", (loc_id,))

    # ── Vehicles (20 vehicles with VINs) ──────────────────────────────
    models = [
        ("Apex Sedan", 1), ("Apex Sedan", 2), ("Ranger SUV", 1),
        ("Ranger SUV", 5), ("Civic Hatch", 2), ("Civic Hatch", 6),
        ("Titan Truck", 3), ("Titan Truck", 5), ("Eco Compact", 7),
        ("Eco Compact", 8), ("Prestige GT", 1), ("Prestige GT", 3),
        ("Urban Mini", 6), ("Urban Mini", 7), ("Fleet Van", 4),
        ("Fleet Van", 5), ("Sport Coupe", 1), ("Sport Coupe", 3),
        ("Cargo Master", 4), ("Cargo Master", 5),
    ]

    vehicles = []
    for i, (model, variant_id) in enumerate(models):
        vin_chars = "".join(random.choices(string.ascii_uppercase + string.digits, k=17))
        vin = f"VIN{vin_chars[:14]}"
        status = "pending" if i < 15 else "completed"
        assigned = None
        if status == "completed" and i - 15 + 41 <= 45:
            assigned = i - 15 + 41
        vehicles.append((vin, model, variant_id, status, assigned))

    cursor.executemany(
        "INSERT INTO vehicles (vin, model_name, required_variant_id, assembly_status, assigned_engine_id) VALUES (?, ?, ?, ?, ?)",
        vehicles,
    )

    # ── Sample Movements (history for demo) ────────────────────────────
    movements = []
    for i in range(1, 36):
        movements.append((
            i, None, i if i <= 35 else None, "put_away",
            random.randint(1, 3),
            (datetime.now() - timedelta(days=random.randint(1, 30), hours=random.randint(0, 23))).strftime("%Y-%m-%d %H:%M:%S"),
            "Initial warehouse placement",
        ))

    cursor.executemany(
        "INSERT INTO movements (engine_id, from_location_id, to_location_id, movement_type, performed_by, timestamp, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
        movements,
    )

    # ── Sample Audit Logs ──────────────────────────────────────────────
    audit_entries = []
    actions = ["login", "scan_engine", "put_away", "retrieval", "verify_vin", "view_dashboard"]
    for _ in range(100):
        user_id = random.randint(1, 6)
        action = random.choice(actions)
        ts = (datetime.now() - timedelta(days=random.randint(0, 30), hours=random.randint(0, 23))).strftime("%Y-%m-%d %H:%M:%S")
        audit_entries.append((user_id, action, "system", None, f"Auto-generated audit entry", "192.168.1." + str(random.randint(1, 254)), ts))

    cursor.executemany(
        "INSERT INTO audit_logs (user_id, action, resource, resource_id, details, ip_address, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)",
        audit_entries,
    )

    # ── Sample Verification Logs (for supervisor dashboard) ────────────
    verifications = []
    for i in range(15):
        v = cursor.execute("SELECT vin, required_variant_id FROM vehicles WHERE id = ?", (i + 1,)).fetchone()
        if v:
            actual = v[1] if random.random() > 0.3 else random.choice(variant_ids)
            result = "match" if actual == v[1] else "mismatch"
            ts = (datetime.now() - timedelta(days=random.randint(0, 14))).strftime("%Y-%m-%d %H:%M:%S")
            eng_serial = f"ENG-{2026}{random.randint(1, 50):04d}"
            resolved = 1 if result == "match" else (1 if random.random() > 0.5 else 0)
            verifications.append((v[0], eng_serial, v[1], actual, result, random.randint(1, 3), ts, resolved))

    cursor.executemany(
        "INSERT INTO verification_logs (vehicle_vin, engine_serial, expected_variant_id, actual_variant_id, result, verified_by, timestamp, resolved) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        verifications,
    )

    conn.commit()
    conn.close()
    print("[OK] Database seeded: 50 engines, 120 locations, 20 vehicles, 6 users.")
    print("\nLogin Credentials:")
    print("  Operator:      operator1 / Op3r@tor!2026")
    print("  Supervisor:    supervisor1 / Sup3rv!sor2026")
    print("  Plant Manager: manager1 / M@nager!2026")


if __name__ == "__main__":
    seed()
