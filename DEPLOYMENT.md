# Deployment Guide (Vercel & Railway/Render)

This guide covers the deployment of the EngineTrace (WMS) application for a production environment. Since the stack is decoupled, the Next.js frontend will be deployed on Vercel, and the FastAPI backend will be deployed on a service like Railway or Render.

## 1. Backend Deployment (Railway or Render)

The backend is built with FastAPI and currently uses SQLite. 
**Important Note on SQLite:** If you deploy to ephemeral containers (like Railway or Render), the SQLite database will be wiped on every deployment or server restart. It is highly recommended to migrate to PostgreSQL for production.

### A. Pre-requisites
1. The `Procfile` is already configured: `web: gunicorn -w 4 -k uvicorn.workers.UvicornWorker app.main:app`
2. The `requirements.txt` is updated.

### B. Deployment Steps (Railway)
1. Log in to [Railway](https://railway.app/).
2. Click **New Project** -> **Deploy from GitHub repo**.
3. Select your repository.
4. Set the **Root Directory** to `/backend` in the Railway service settings.
5. Add the following Environment Variables in Railway:
   - `JWT_SECRET`: A secure random string (e.g., generated via `openssl rand -hex 32`).
   - `ALLOWED_ORIGINS`: `https://your-frontend-domain.vercel.app` (This is crucial for CORS and Cookie acceptance).
   - `PORT`: `8000` (Optional, Railway usually handles this).
6. Deploy the service.
7. Note down the public URL provided by Railway (e.g., `https://enginetrace-api.up.railway.app`).

---

## 2. Frontend Deployment (Vercel)

The frontend is a Next.js 16 application designed for Vercel.

### A. Deployment Steps
1. Log in to [Vercel](https://vercel.com/).
2. Click **Add New** -> **Project**.
3. Import your GitHub repository.
4. Set the **Root Directory** to `frontend`.
5. In the **Build and Output Settings**, Vercel will auto-detect Next.js.
6. Add the following Environment Variables:
   - `NEXT_PUBLIC_API_URL`: The URL of your deployed backend (e.g., `https://enginetrace-api.up.railway.app`). Do NOT include a trailing slash.
7. Click **Deploy**.

### B. Important Note on Cookies (Cross-Origin)
Since the frontend (Vercel) and backend (Railway) are on different domains, the authentication cookies must be sent with `SameSite=None` and `Secure=True`.
The `backend/app/config.py` is already configured to read the `ALLOWED_ORIGINS`. If `ALLOWED_ORIGINS` is set to your Vercel URL, the backend will dynamically configure CORS and cookie headers to support cross-origin requests.

Alternatively, you can use Vercel Rewrites (already configured in `next.config.mjs`) if you prefer to proxy API requests through the Vercel domain to avoid cross-origin cookie issues entirely. If doing this, set `NEXT_PUBLIC_API_URL=/api` in Vercel.

---

## 3. Post-Deployment Checks

1. **Verify Backend API**: Visit `https://your-backend-url.railway.app/docs` to see the Swagger UI.
2. **Verify Frontend**: Visit your Vercel URL.
3. **Login Test**: Attempt to log in with `manager1` / `managerpass`. Verify that the dashboard loads.
4. **Cookie Test**: Check the browser's developer tools (Application -> Cookies) to ensure the `access_token` cookie is set after login.
