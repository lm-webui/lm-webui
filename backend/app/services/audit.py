"""
Audit Logger — lightweight action logging for security and compliance.
"""
import uuid
import json
from datetime import datetime
from app.database import get_db


def log_action(
    user_id: int = None,
    action: str = None,
    resource_type: str = None,
    resource_id: str = None,
    details: dict = None,
    ip_address: str = None,
    org_id: str = None,
):
    """Append an action to the audit log. Non-blocking (conn is auto-closed)."""
    if not action:
        return
    try:
        db = get_db()
        db.execute(
            """INSERT INTO audit_log (id, user_id, org_id, action, resource_type, resource_id, details, ip_address, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                f"al_{uuid.uuid4().hex}",
                user_id,
                org_id,
                action,
                resource_type,
                resource_id,
                json.dumps(details) if details else None,
                ip_address,
                datetime.now(),
            ),
        )
        db.commit()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Audit log failed: {e}")
