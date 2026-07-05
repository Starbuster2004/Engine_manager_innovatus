"""
Authentication utilities: JWT creation, verification, password hashing.
Tokens stored in HTTP-only SameSite cookies to prevent XSS/CSRF.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

# pyrefly: ignore [missing-import]
import bcrypt
# pyrefly: ignore [missing-import]
import jwt
# pyrefly: ignore [missing-import]
from fastapi import Request, HTTPException, status

from app.config import SECRET_KEY, JWT_ALGORITHM, JWT_EXPIRATION_HOURS, COOKIE_NAME
from app.database import get_connection


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(
        plain_password.encode("utf-8"),
        hashed_password.encode("utf-8"),
    )


def create_access_token(user_id: int, username: str, role: str) -> str:
    payload = {
        "user_id": user_id,
        "username": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS),
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please log in again.",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token.",
        )


def get_current_user(request: Request) -> dict:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Please log in.",
        )
    return decode_token(token)


def require_role(*allowed_roles: str):
    """BOLA Protection: Role-checking dependency."""
    def role_checker(request: Request) -> dict:
        user = get_current_user(request)
        if user["role"] not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required: {', '.join(allowed_roles)}. Your role: {user['role']}",
            )
        return user
    return role_checker


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def log_audit(user_id, action, resource, resource_id=None, details=None, ip=None):
    conn = get_connection()
    conn.execute(
        "INSERT INTO audit_logs (user_id, action, resource, resource_id, details, ip_address) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, action, resource, resource_id, details, ip),
    )
    conn.commit()
    conn.close()

