"""
Organization Routes — CRUD for multi-tenant organizations and member management.
"""
import uuid
import json
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from app.database import get_db
from app.security.auth.dependencies import get_current_user, require_permission

router = APIRouter(prefix="/api/orgs")


@router.get("")
async def list_orgs(user_id: dict = Depends(get_current_user)):
    """List organizations the current user belongs to."""
    db = get_db()
    rows = db.execute(
        """SELECT o.id, o.name, o.owner_id, om.role, o.created_at
           FROM organizations o
           JOIN organization_members om ON om.org_id = o.id
           WHERE om.user_id = ?
           ORDER BY o.name""",
        (user_id["id"],),
    ).fetchall()
    return {
        "organizations": [
            {"id": r[0], "name": r[1], "owner_id": r[2], "role": r[3], "created_at": r[4]}
            for r in rows
        ]
    }


@router.post("")
async def create_org(data: dict, user_id: dict = Depends(get_current_user)):
    """Create a new organization. Creator becomes owner."""
    name = data.get("name", "").strip()
    if not name:
        raise HTTPException(422, "Organization name is required")

    org_id = f"org_{uuid.uuid4().hex}"
    now = datetime.now()
    db = get_db()
    db.execute(
        "INSERT INTO organizations (id, name, owner_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
        (org_id, name, user_id["id"], now, now),
    )
    db.execute(
        "INSERT INTO organization_members (org_id, user_id, role, permissions, invited_by) VALUES (?, ?, ?, ?, ?)",
        (org_id, user_id["id"], "owner", json.dumps(["*"]), user_id["id"]),
    )
    db.commit()
    return {"id": org_id, "name": name, "role": "owner"}


@router.delete("/{org_id}")
async def delete_org(org_id: str, user_id: dict = Depends(get_current_user)):
    """Delete an organization. Only the owner can delete."""
    db = get_db()
    membership = db.execute(
        "SELECT role FROM organization_members WHERE org_id = ? AND user_id = ?",
        (org_id, user_id["id"]),
    ).fetchone()
    if not membership or membership[0] != "owner":
        raise HTTPException(403, "Only the organization owner can delete it")
    db.execute("DELETE FROM organizations WHERE id = ?", (org_id,))
    db.commit()
    return {"message": "Organization deleted"}


@router.get("/{org_id}/members")
async def list_members(org_id: str, user_id: dict = Depends(get_current_user)):
    """List members of an organization."""
    db = get_db()
    membership = db.execute(
        "SELECT role FROM organization_members WHERE org_id = ? AND user_id = ?",
        (org_id, user_id["id"]),
    ).fetchone()
    if not membership:
        raise HTTPException(403, "Not a member of this organization")

    rows = db.execute(
        """SELECT om.user_id, u.email, om.role, om.joined_at
           FROM organization_members om
           JOIN users u ON u.id = om.user_id
           WHERE om.org_id = ?
           ORDER BY om.joined_at""",
        (org_id,),
    ).fetchall()
    return {
        "members": [
            {"user_id": r[0], "email": r[1], "role": r[2], "joined_at": r[3]}
            for r in rows
        ]
    }


@router.post("/{org_id}/invite")
async def invite_member(org_id: str, data: dict, current_user: dict = Depends(require_permission("users.manage"))):
    """Invite a user to an organization by email. Requires users.manage permission."""
    email = data.get("email", "").strip().lower()
    role = data.get("role", "member")
    if not email:
        raise HTTPException(422, "Email is required")
    if role not in ("admin", "member"):
        raise HTTPException(422, "Role must be 'admin' or 'member'")

    db = get_db()
    user = db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if not user:
        raise HTTPException(404, "User not found")

    existing = db.execute(
        "SELECT role FROM organization_members WHERE org_id = ? AND user_id = ?",
        (org_id, user[0]),
    ).fetchone()
    if existing:
        raise HTTPException(400, "User is already a member")

    db.execute(
        "INSERT INTO organization_members (org_id, user_id, role, permissions, invited_by) VALUES (?, ?, ?, ?, ?)",
        (org_id, user[0], role, "[]", current_user["id"]),
    )
    db.commit()
    return {"message": f"User {email} added as {role}"}


@router.delete("/{org_id}/members/{user_id}")
async def remove_member(org_id: str, user_id: int, current_user: dict = Depends(require_permission("users.manage"))):
    """Remove a member from an organization."""
    db = get_db()
    target = db.execute(
        "SELECT role FROM organization_members WHERE org_id = ? AND user_id = ?",
        (org_id, user_id),
    ).fetchone()
    if not target:
        raise HTTPException(404, "Member not found")
    if target[0] == "owner":
        raise HTTPException(403, "Cannot remove the organization owner")

    db.execute("DELETE FROM organization_members WHERE org_id = ? AND user_id = ?", (org_id, user_id))
    db.commit()
    return {"message": "Member removed"}
