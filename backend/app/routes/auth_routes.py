"""Auth routes: Login/Logout with JWT in HTTP-only cookies."""

from fastapi import APIRouter, HTTPException, status, Request, Response, Depends
from app.auth import verify_password, create_access_token, get_current_user, log_audit, get_password_hash, require_role
from app.config import COOKIE_NAME, COOKIE_HTTPONLY, COOKIE_SAMESITE, COOKIE_MAX_AGE, COOKIE_SECURE
from app.database import get_connection
from app.models import LoginRequest, UserResponse, CreateUserRequest, ChangePasswordRequest

from app.limiter import limiter

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/login")
@limiter.limit("10/minute")
def login(req: LoginRequest, response: Response, request: Request):
    conn = get_connection()
    user = conn.execute(
        "SELECT id, username, password_hash, full_name, role, is_active FROM users WHERE username = ?",
        (req.username,),
    ).fetchone()
    conn.close()

    if not user or not verify_password(req.password, user["password_hash"]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if not user["is_active"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account disabled")

    token = create_access_token(user["id"], user["username"], user["role"])

    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=COOKIE_HTTPONLY,
        samesite=COOKIE_SAMESITE,
        secure=COOKIE_SECURE,
        max_age=COOKIE_MAX_AGE,
        path="/",
    )

    log_audit(user["id"], "login", "auth", ip=request.client.host if request.client else None)

    return {
        "message": "Login successful",
        "user": {"id": user["id"], "username": user["username"], "full_name": user["full_name"], "role": user["role"]},
    }


@router.post("/logout")
def logout(response: Response, request: Request):
    user = get_current_user(request)
    log_audit(user["user_id"], "logout", "auth", ip=request.client.host if request.client else None)
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"message": "Logged out successfully"}


@router.get("/me")
def get_me(request: Request):
    user = get_current_user(request)
    conn = get_connection()
    row = conn.execute("SELECT id, username, full_name, role FROM users WHERE id = ?", (user["user_id"],)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return {"id": row["id"], "username": row["username"], "full_name": row["full_name"], "role": row["role"]}


# ── User Management Routes (RBAC) ──────────────────────────────────────

@router.get("/users")
def list_users(request: Request):
    """List users manageable by the logged-in user (Supervisors manage Operators, Plant Managers manage both)."""
    user = require_role("supervisor", "plant_manager")(request)
    conn = get_connection()
    if user["role"] == "plant_manager":
        rows = conn.execute(
            "SELECT id, username, full_name, role, is_active, datetime(created_at, 'localtime') as created_at FROM users WHERE role IN ('supervisor', 'operator') ORDER BY id DESC"
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT id, username, full_name, role, is_active, datetime(created_at, 'localtime') as created_at FROM users WHERE role = 'operator' ORDER BY id DESC"
        ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


@router.post("/users")
def create_user(req: CreateUserRequest, request: Request):
    """Create a new user with proper RBAC restrictions."""
    user = require_role("supervisor", "plant_manager")(request)
    
    if user["role"] == "supervisor" and req.role != "operator":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Supervisors can only create Operator accounts."
        )
    if user["role"] == "plant_manager" and req.role not in ("supervisor", "operator"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Plant Managers can only create Supervisor or Operator accounts."
        )
    
    conn = get_connection()
    existing = conn.execute("SELECT id FROM users WHERE username = ?", (req.username,)).fetchone()
    if existing:
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already taken."
        )
    
    hashed = get_password_hash(req.password)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)",
        (req.username, hashed, req.full_name, req.role)
    )
    new_user_id = cursor.lastrowid
    conn.commit()
    conn.close()
    
    log_audit(
        user["user_id"], 
        "create_user", 
        "users", 
        resource_id=str(new_user_id), 
        details=f"Created user {req.username} with role {req.role}"
    )
    
    return {"message": f"User {req.username} created successfully.", "id": new_user_id}


@router.delete("/users/{target_id}")
def delete_user(target_id: int, request: Request):
    """Delete a user with proper RBAC restrictions."""
    user = require_role("supervisor", "plant_manager")(request)
    conn = get_connection()
    target = conn.execute("SELECT id, username, role FROM users WHERE id = ?", (target_id,)).fetchone()
    if not target:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found.")
    
    if user["role"] == "supervisor" and target["role"] != "operator":
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Supervisors can only delete Operator accounts."
        )
    if user["role"] == "plant_manager" and target["role"] not in ("supervisor", "operator"):
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Plant Managers can only delete Supervisor or Operator accounts."
        )
    
    conn.execute("DELETE FROM users WHERE id = ?", (target_id,))
    conn.commit()
    conn.close()
    
    log_audit(
        user["user_id"], 
        "delete_user", 
        "users", 
        resource_id=str(target_id), 
        details=f"Deleted user {target['username']}"
    )
    
    return {"message": f"User {target['username']} deleted successfully."}


@router.put("/users/{target_id}/password")
def change_password(target_id: int, req: ChangePasswordRequest, request: Request):
    """Change a user's password with proper RBAC restrictions."""
    user = require_role("supervisor", "plant_manager")(request)
    conn = get_connection()
    target = conn.execute("SELECT id, username, role FROM users WHERE id = ?", (target_id,)).fetchone()
    if not target:
        conn.close()
        raise HTTPException(status_code=404, detail="User not found.")
    
    if user["role"] == "supervisor" and target["role"] != "operator":
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Supervisors can only change Operator passwords."
        )
    if user["role"] == "plant_manager" and target["role"] not in ("supervisor", "operator"):
        conn.close()
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Plant Managers can only change Supervisor or Operator passwords."
        )
    
    hashed = get_password_hash(req.password)
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hashed, target_id))
    conn.commit()
    conn.close()
    
    log_audit(
        user["user_id"], 
        "change_password", 
        "users", 
        resource_id=str(target_id), 
        details=f"Changed password for user {target['username']}"
    )
    
    return {"message": f"Password for {target['username']} changed successfully."}

