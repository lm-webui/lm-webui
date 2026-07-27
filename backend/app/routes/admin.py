"""Small-scope administration routes for local and office deployments."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from app.database.sqlite.connection_pool import database_manager
from app.security.auth.core import hash_password
from app.security.auth.dependencies import require_permission

router = APIRouter(prefix="/api/admin", tags=["admin"])


class CreateUserRequest(BaseModel):
    email: str
    password: str
    role: str = "user"

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        if "@" not in value or " " in value:
            raise ValueError("Invalid email address")
        return value.lower().strip()


class RoleRequest(BaseModel):
    role: str


class StatusRequest(BaseModel):
    status: str


def _public_user(row):
    return {
        "id": row[0],
        "email": row[1],
        "role": row[2],
        "status": row[3],
        "created_at": row[4],
        "last_login_at": row[5],
    }


@router.get("/users")
async def list_users(_: dict = Depends(require_permission("users.manage"))):
    with database_manager.transaction() as conn:
        rows = conn.execute(
            "SELECT id, email, role, COALESCE(status, 'active'), created_at, last_login_at "
            "FROM users ORDER BY created_at ASC"
        ).fetchall()
        return {"users": [_public_user(row) for row in rows]}


@router.post("/users", status_code=201)
async def create_user(request: CreateUserRequest, _: dict = Depends(require_permission("users.manage"))):
    if request.role not in {"user", "admin"}:
        raise HTTPException(400, "Role must be user or admin")
    if len(request.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    with database_manager.transaction() as conn:
        existing = conn.execute("SELECT id FROM users WHERE email = ?", (request.email,)).fetchone()
        if existing:
            raise HTTPException(409, "User already exists")
        cursor = conn.execute(
            "INSERT INTO users (email, password_hash, role, status) VALUES (?, ?, ?, 'active')",
            (request.email, hash_password(request.password), request.role),
        )
        row = conn.execute(
            "SELECT id, email, role, COALESCE(status, 'active'), created_at, last_login_at FROM users WHERE id = ?",
            (cursor.lastrowid,),
        ).fetchone()
        return {"user": _public_user(row)}


@router.patch("/users/{user_id}/role")
async def update_role(user_id: int, request: RoleRequest, admin: dict = Depends(require_permission("users.manage"))):
    if request.role not in {"user", "admin"}:
        raise HTTPException(400, "Role must be user or admin")
    if user_id == admin["id"]:
        raise HTTPException(400, "You cannot change your own role")

    with database_manager.transaction() as conn:
        target = conn.execute("SELECT id, role, COALESCE(status, 'active') FROM users WHERE id = ?", (user_id,)).fetchone()
        if not target:
            raise HTTPException(404, "User not found")
        if target[1] == "admin" and request.role != "admin" and target[2] == "active":
            count = conn.execute("SELECT COUNT(*) FROM users WHERE role = 'admin' AND COALESCE(status, 'active') = 'active'").fetchone()[0]
            if count <= 1:
                raise HTTPException(400, "At least one active admin is required")
        conn.execute("UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (request.role, user_id))
        return {"success": True}


@router.patch("/users/{user_id}/status")
async def update_status(user_id: int, request: StatusRequest, admin: dict = Depends(require_permission("users.manage"))):
    if request.status not in {"active", "disabled"}:
        raise HTTPException(400, "Status must be active or disabled")
    if user_id == admin["id"]:
        raise HTTPException(400, "You cannot change your own status")

    with database_manager.transaction() as conn:
        target = conn.execute("SELECT id, role, COALESCE(status, 'active') FROM users WHERE id = ?", (user_id,)).fetchone()
        if not target:
            raise HTTPException(404, "User not found")
        if target[1] == "admin" and request.status == "disabled" and target[2] == "active":
            count = conn.execute("SELECT COUNT(*) FROM users WHERE role = 'admin' AND COALESCE(status, 'active') = 'active'").fetchone()[0]
            if count <= 1:
                raise HTTPException(400, "At least one active admin is required")
        conn.execute("UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", (request.status, user_id))
        return {"success": True}
