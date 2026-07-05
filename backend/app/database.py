"""
SQLite database setup with WAL mode and parameterized queries.
All queries use parameterized statements to prevent SQL injection.
Includes schema migration support for upgrading existing databases.
"""

import sqlite3
import os
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / "enginetrace.db"


def get_connection() -> sqlite3.Connection:
    """Get a database connection with WAL mode and row factory."""
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def _column_exists(cursor, table: str, column: str) -> bool:
    """Check if a column exists in a table."""
    cursor.execute(f"PRAGMA table_info({table})")
    return any(row[1] == column for row in cursor.fetchall())


def _table_exists(cursor, table: str) -> bool:
    """Check if a table exists."""
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name=?", (table,))
    return cursor.fetchone() is not None


def _run_migrations(conn):
    """Run schema migrations on an existing database."""
    cursor = conn.cursor()

    # ── warehouse_sections table ──────────────────────────────────────
    if not _table_exists(cursor, "warehouse_sections"):
        cursor.execute("""
            CREATE TABLE warehouse_sections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                section_code TEXT UNIQUE NOT NULL,
                section_name TEXT NOT NULL,
                description TEXT,
                color TEXT DEFAULT '#3b82f6',
                max_racks INTEGER DEFAULT 10,
                is_active INTEGER DEFAULT 1,
                sort_order INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)

    # ── Add updated_at to existing tables ─────────────────────────────
    # Note: SQLite ALTER TABLE doesn't allow DEFAULT CURRENT_TIMESTAMP
    # Existing rows will have NULL, new rows use triggers or app-level defaults
    for table in ["users", "engines", "engine_variants", "locations", "vehicles"]:
        if not _column_exists(cursor, table, "updated_at"):
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN updated_at TIMESTAMP")

    # ── Add new columns to locations ──────────────────────────────────
    if not _column_exists(cursor, "locations", "label"):
        cursor.execute("ALTER TABLE locations ADD COLUMN label TEXT")

    if not _column_exists(cursor, "locations", "notes"):
        cursor.execute("ALTER TABLE locations ADD COLUMN notes TEXT")

    if not _column_exists(cursor, "locations", "section_id"):
        cursor.execute("ALTER TABLE locations ADD COLUMN section_id INTEGER")

    # ── Add created_at to engine_variants if missing ──────────────────
    if not _column_exists(cursor, "engine_variants", "created_at"):
        cursor.execute("ALTER TABLE engine_variants ADD COLUMN created_at TIMESTAMP")

    # ── Add created_at to locations if missing ────────────────────────
    if not _column_exists(cursor, "locations", "created_at"):
        cursor.execute("ALTER TABLE locations ADD COLUMN created_at TIMESTAMP")

    # ── New indexes ───────────────────────────────────────────────────
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_locations_zone ON locations(zone)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_locations_section ON locations(section_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_engines_variant ON engines(variant_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_sections_code ON warehouse_sections(section_code)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id)")
    cursor.execute("CREATE INDEX IF NOT EXISTS idx_engines_location ON engines(current_location_id)")

    conn.commit()


def init_db():
    """Initialize database schema and run migrations."""
    conn = get_connection()
    cursor = conn.cursor()

    cursor.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            full_name TEXT NOT NULL,
            role TEXT NOT NULL CHECK(role IN ('operator', 'supervisor', 'plant_manager')),
            is_active INTEGER DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS engine_variants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            variant_code TEXT UNIQUE NOT NULL,
            variant_name TEXT NOT NULL,
            fuel_type TEXT NOT NULL CHECK(fuel_type IN ('Petrol', 'Diesel', 'Hybrid', 'Electric')),
            displacement_cc INTEGER,
            cylinder_count INTEGER,
            description TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS warehouse_sections (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            section_code TEXT UNIQUE NOT NULL,
            section_name TEXT NOT NULL,
            description TEXT,
            color TEXT DEFAULT '#3b82f6',
            max_racks INTEGER DEFAULT 10,
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS engines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            engine_serial TEXT UNIQUE NOT NULL,
            qr_code TEXT UNIQUE NOT NULL,
            variant_id INTEGER NOT NULL,
            manufacturing_date DATE NOT NULL,
            status TEXT NOT NULL DEFAULT 'in_storage'
                CHECK(status IN ('in_storage', 'in_transit', 'assembled', 'scrapped', 'quarantined')),
            current_location_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (variant_id) REFERENCES engine_variants(id),
            FOREIGN KEY (current_location_id) REFERENCES locations(id)
        );

        CREATE TABLE IF NOT EXISTS locations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            location_code TEXT UNIQUE NOT NULL,
            qr_code TEXT UNIQUE NOT NULL,
            rack_number INTEGER NOT NULL,
            shelf_number INTEGER NOT NULL,
            position_number INTEGER NOT NULL,
            is_occupied INTEGER DEFAULT 0,
            max_capacity INTEGER DEFAULT 1,
            zone TEXT DEFAULT 'A',
            label TEXT,
            notes TEXT,
            section_id INTEGER REFERENCES warehouse_sections(id),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS vehicles (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vin TEXT UNIQUE NOT NULL,
            model_name TEXT NOT NULL,
            required_variant_id INTEGER NOT NULL,
            assembly_status TEXT DEFAULT 'pending'
                CHECK(assembly_status IN ('pending', 'in_progress', 'completed', 'failed')),
            assigned_engine_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (required_variant_id) REFERENCES engine_variants(id),
            FOREIGN KEY (assigned_engine_id) REFERENCES engines(id)
        );

        CREATE TABLE IF NOT EXISTS movements (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            engine_id INTEGER NOT NULL,
            from_location_id INTEGER,
            to_location_id INTEGER,
            movement_type TEXT NOT NULL
                CHECK(movement_type IN ('put_away', 'retrieval', 'transfer', 'assembly')),
            performed_by INTEGER NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            notes TEXT,
            FOREIGN KEY (engine_id) REFERENCES engines(id),
            FOREIGN KEY (from_location_id) REFERENCES locations(id),
            FOREIGN KEY (to_location_id) REFERENCES locations(id),
            FOREIGN KEY (performed_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS verification_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vehicle_vin TEXT NOT NULL,
            engine_serial TEXT NOT NULL,
            expected_variant_id INTEGER NOT NULL,
            actual_variant_id INTEGER NOT NULL,
            result TEXT NOT NULL CHECK(result IN ('match', 'mismatch')),
            verified_by INTEGER NOT NULL,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            resolved INTEGER DEFAULT 0,
            resolved_by INTEGER,
            resolution_notes TEXT,
            FOREIGN KEY (expected_variant_id) REFERENCES engine_variants(id),
            FOREIGN KEY (actual_variant_id) REFERENCES engine_variants(id),
            FOREIGN KEY (verified_by) REFERENCES users(id),
            FOREIGN KEY (resolved_by) REFERENCES users(id)
        );

        CREATE TABLE IF NOT EXISTS audit_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            action TEXT NOT NULL,
            resource TEXT NOT NULL,
            resource_id TEXT,
            details TEXT,
            ip_address TEXT,
            timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        );

        CREATE INDEX IF NOT EXISTS idx_engines_serial ON engines(engine_serial);
        CREATE INDEX IF NOT EXISTS idx_engines_qr ON engines(qr_code);
        CREATE INDEX IF NOT EXISTS idx_engines_status ON engines(status);
        CREATE INDEX IF NOT EXISTS idx_engines_variant ON engines(variant_id);
        CREATE INDEX IF NOT EXISTS idx_engines_location ON engines(current_location_id);
        CREATE INDEX IF NOT EXISTS idx_locations_code ON locations(location_code);
        CREATE INDEX IF NOT EXISTS idx_locations_qr ON locations(qr_code);
        CREATE INDEX IF NOT EXISTS idx_locations_zone ON locations(zone);
        CREATE INDEX IF NOT EXISTS idx_movements_engine ON movements(engine_id);
        CREATE INDEX IF NOT EXISTS idx_movements_timestamp ON movements(timestamp);
        CREATE INDEX IF NOT EXISTS idx_vehicles_vin ON vehicles(vin);
        CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
        CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
        CREATE INDEX IF NOT EXISTS idx_verification_result ON verification_logs(result);
        CREATE INDEX IF NOT EXISTS idx_sections_code ON warehouse_sections(section_code);
    """)

    conn.commit()

    # Run migrations for existing databases
    _run_migrations(conn)

    conn.close()
