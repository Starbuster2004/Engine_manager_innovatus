"""Seed warehouse sections into existing database."""
from app.database import get_connection

conn = get_connection()
sections = [
    ('A', 'Zone A - Light Engines', 'I4 Petrol and Hybrid engines storage', '#3b82f6', 4, 1, 0),
    ('B', 'Zone B - Mid-Range', 'V6 Petrol and Diesel engines storage', '#10b981', 4, 1, 1),
    ('C', 'Zone C - Heavy Duty', 'V8 and heavy-duty engine storage', '#f59e0b', 4, 1, 2),
    ('D', 'Zone D - Electric and Special', 'Electric drive units and quarantine', '#8b5cf6', 4, 1, 3),
]
conn.executemany(
    'INSERT OR IGNORE INTO warehouse_sections (section_code, section_name, description, color, max_racks, is_active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)',
    sections
)
for zone_letter, section_id in [('A', 1), ('B', 2), ('C', 3), ('D', 4)]:
    conn.execute('UPDATE locations SET section_id = ? WHERE zone = ? AND section_id IS NULL', (section_id, zone_letter))
conn.commit()
r = conn.execute('SELECT COUNT(*) FROM warehouse_sections').fetchone()[0]
print(f'Sections seeded: {r}')
r2 = conn.execute('SELECT COUNT(*) FROM locations WHERE section_id IS NOT NULL').fetchone()[0]
print(f'Locations linked: {r2}')
conn.close()
