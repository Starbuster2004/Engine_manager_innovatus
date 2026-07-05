# EngineTrace WMS - Client Usage Guide

Welcome to the EngineTrace Warehouse Management System. This guide will walk you through the core functionalities available to different roles within the application.

## 1. System Overview
EngineTrace is designed to track automotive engines from the end of the production line into the warehouse, through verification, and finally to dispatch. It relies on QR Code / Barcode generation and scanning for accurate tracking.

### Roles
- **Operator**: Tasked with scanning engines into locations, moving engines, and dispatching.
- **Supervisor**: Tasked with verifying operations, handling mis-matches, and monitoring real-time flow.
- **Plant Manager**: Full access to real-time analytics, user management, and product registration.

---

## 2. Operator Workflow

The Operator Dashboard consists of large, easy-to-tap buttons (Bento grid) designed for tablet use on the warehouse floor.

### A. Scanning an Engine In (Putaway)
1. Tap **Scan Engine In**.
2. Scan the **Engine QR Code** (or enter the serial manually).
3. Scan the **Location QR Code** (the rack slot).
4. The system validates the placement and updates the engine's status to `Stored`.

### B. Moving an Engine
1. Tap **Move Engine**.
2. Scan the **Engine QR Code**.
3. Scan the **New Location QR Code**.
4. The database is updated, and the old location is freed.

### C. Dispatching
1. Tap **Dispatch Engine**.
2. Scan the **Engine QR Code**.
3. The engine is marked as `Dispatched` and removed from the active warehouse map.

---

## 3. Supervisor Workflow

The Supervisor Dashboard focuses on quality control and real-time monitoring.

### A. Live Monitoring
- The **Live Status** tab shows real-time metrics (engines stored vs. dispatched).
- A timeline shows recent activities by operators.

### B. Quality Verification
1. Go to the **Verifications** tab.
2. Select an engine that has just been produced.
3. Scan the physical label to verify it matches the system record.
4. If it matches, mark it **Verified**. If not, mark it as a **Mismatch**.

### C. Issue Resolution
- Mismatches are flagged in the **Issues** tab.
- Supervisors can review the discrepancy and clear the issue once physically resolved on the floor.

---

## 4. Plant Manager Workflow

The Plant Manager Console is the administrative hub.

### A. Real-time Analytics
- View dynamic charts showing engine status distributions, storage capacity, and historical movement data over the last 30 days.
- Export data to CSV for external reporting.

### B. Warehouse Map Management
- Go to the **Warehouse Map** tab.
- Visually inspect which slots are occupied (red) or available (green).
- Create new rack slots as the physical warehouse expands.

### C. Product Registration
- **Engines**: Pre-register engines that are coming off the assembly line and generate/print their QR labels.
- **Variants**: Register new product lines (e.g., a new V6 Hybrid engine) so they become available in the system.

### D. User Management & Audit Logs
- Create and manage accounts for Operators and Supervisors.
- Review the immutable **Audit Trail** to see exactly who performed what action, when, and from which IP address.
