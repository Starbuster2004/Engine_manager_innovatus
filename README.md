# EngineTrace — Smart Warehouse Management System

EngineTrace is an enterprise-grade, PWA-enabled warehouse management system (WMS) specifically designed for tracking and managing automotive engine logistics. It features role-based workflows, dynamic warehouse grid visualization, barcode/QR scanning capabilities, real-time analytics, and comprehensive audit logging.

---

## 🚀 Key Features

*   **🔒 Role-Based Access Control (RBAC):** Tailored views and security levels for **Operators**, **Supervisors**, and **Plant Managers**.
*   **📷 Integrated Scanning (QR & Manual):** Instant lookup, put-away, and retrieval using devices' cameras or rapid manual keyboard entry.
*   **⚡ VIN Verification (The Hero Feature):** Double-check scan confirmation to guarantee that matched engines are paired with the correct vehicle chassis before shipping out.
*   **🏢 Interactive 3D/Grid Warehouse Map:** Visual rack-and-shelf grid mapping showing current occupancy and specific engine placement coordinates.
*   **📊 Dynamic Executive Analytics:** Premium Recharts visualizers highlighting daily movement throughput, variant distribution, and operator performance.
*   **📱 Progressive Web App (PWA):** Fully responsive layout, service worker caching (`sw.js`), manifest config, and customized SVG icons.

---

## 🛠️ Tech Stack

*   **Backend:** Python 3.10+, FastAPI, SQLite (configured with WAL mode for concurrency), PyJWT, bcrypt, SlowAPI (Rate Limiting), qrcode.
*   **Frontend:** Next.js 16 (App Router), React 19, Vanilla CSS Modules, Recharts, html5-qrcode.
*   **Environment Setup:** Virtual environment (`venv`), auto-seeding database wrapper (`seed.py`).

---

## 🔑 Demo Login Credentials

For testing and verification, use the following pre-configured user profiles:

| Role | Username | Password | Access Rights |
| :--- | :--- | :--- | :--- |
| **Operator** | `operator1` | `Op3r@tor!2026` | Put-Away, Retrieval, VIN Scanning Verification |
| **Supervisor** | `supervisor1` | `Sup3rv!sor2026` | Live Overview, Grid Visualizer, Incident Resolution, Vehicles |
| **Plant Manager** | `manager1` | `M@nager!2026` | System Analytics, Throughput Graphs, Master Audit Logs |

---

## 📦 Database Schema

EngineTrace runs on an optimized SQLite schema (`backend/enginetrace.db`) with indexes supporting fast scanning lookups. The key tables include:
- `users`: User metadata, pass-hashes, roles.
- `engines`: Engine units with serial numbers, status (received, stored, shipped, incident), and variant foreign key.
- `engine_variants`: Engine types (e.g., V8 Turbo, Inline-4 Electric Hybrid, Twin-Turbo V6).
- `locations`: Racks (A-D), Shelves (1-3), and Positions (1-10) mapping 120 storage bins.
- `vehicles`: Matching chassis VINs for verification.
- `movements`: Logs of engine movements, source/destination locations, operator references, and timestamps.
- `verification_logs`: Logs of VIN validation checks (matched vs. mismatched incidents).
- `audit_logs`: Detailed system logs for sensitive actions (logins, role changes, incident resolutions).

---

## 🏃 Quick Start Guide

### Option 1: One-Click Startup (Windows)
Double-click the `start.bat` script in the root directory.
This script automatically:
1. Validates that Python and Node.js are available on your system path.
2. Initializes the Python virtual environment (`venv`) and installs requirements.
3. Initializes and seeds the SQLite database (`enginetrace.db`) with mock data.
4. Installs the Next.js node modules.
5. Launches both the FastAPI backend (`http://localhost:8000`) and the Next.js frontend dev server (`http://localhost:3000`).

### Option 2: Manual Setup

#### 1. Start the Backend
Navigate to the `backend` folder:
```bash
cd backend
python -m venv venv
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# Install dependencies:
pip install -r requirements.txt

# Initialize and seed database:
python seed.py

# Start FastAPI:
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Start the Frontend
In a new terminal, navigate to the `frontend` folder:
```bash
cd frontend
npm install
npm run dev
```
Open your browser to [http://localhost:3000](http://localhost:3000).
