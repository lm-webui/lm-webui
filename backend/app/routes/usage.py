"""Privacy-preserving local usage reports."""
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
import csv
import io
from app.database.sqlite.connection_pool import database_manager
from app.security.auth.dependencies import get_current_user, require_permission

router = APIRouter(prefix="/api", tags=["usage"])

def _where(user_id=None, start=None, end=None):
    clauses, args = [], []
    if user_id is not None: clauses.append("user_id = ?"); args.append(user_id)
    if start: clauses.append("created_at >= ?"); args.append(start)
    if end: clauses.append("created_at < ?"); args.append(end)
    return (" WHERE " + " AND ".join(clauses)) if clauses else "", args

@router.get("/usage")
async def personal_usage(report: str = Query("summary"), current: dict = Depends(get_current_user)):
    where, args = _where(current["id"])
    with database_manager.transaction() as conn:
        summary = conn.execute(f"SELECT COUNT(*), COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0), COALESCE(SUM(total_tokens),0), COALESCE(SUM(CASE WHEN execution_boundary='local' THEN 1 ELSE 0 END),0), COALESCE(SUM(CASE WHEN execution_boundary='cloud' THEN 1 ELSE 0 END),0) FROM usage_events{where}", args).fetchone()
        rows = conn.execute(f"SELECT provider, model, COUNT(*) requests, COALESCE(SUM(total_tokens),0) tokens FROM usage_events{where} GROUP BY provider, model ORDER BY requests DESC, tokens DESC LIMIT 20", args).fetchall()
    return {"scope": "me", "summary": {"requests": summary[0], "input_tokens": summary[1], "output_tokens": summary[2], "total_tokens": summary[3], "local_requests": summary[4], "cloud_requests": summary[5]}, "models": [{"provider": r[0], "model": r[1], "requests": r[2], "total_tokens": r[3]} for r in rows]}

@router.get("/admin/usage/summary")
async def admin_usage_summary(_: dict = Depends(require_permission("audit.view"))):
    with database_manager.transaction() as conn:
        row = conn.execute("SELECT COUNT(*), COUNT(DISTINCT user_id), COALESCE(SUM(total_tokens),0), COALESCE(SUM(CASE WHEN execution_boundary='local' THEN 1 ELSE 0 END),0), COALESCE(SUM(CASE WHEN execution_boundary='cloud' THEN 1 ELSE 0 END),0) FROM usage_events").fetchone()
        models = conn.execute("SELECT provider, model, COUNT(*), COALESCE(SUM(total_tokens),0) FROM usage_events GROUP BY provider, model ORDER BY COUNT(*) DESC LIMIT 20").fetchall()
    return {"scope": "global", "summary": {"requests": row[0], "active_users": row[1], "total_tokens": row[2], "local_requests": row[3], "cloud_requests": row[4]}, "models": [{"provider": r[0], "model": r[1], "requests": r[2], "total_tokens": r[3]} for r in models]}

@router.get("/admin/usage/users")
async def admin_usage_users(_: dict = Depends(require_permission("audit.view"))):
    with database_manager.transaction() as conn:
        users = conn.execute("SELECT id, email, COALESCE(status,'active') FROM users ORDER BY email").fetchall()
        result = []
        for user in users:
            summary = conn.execute("SELECT COUNT(*), COALESCE(SUM(total_tokens),0), MAX(created_at) FROM usage_events WHERE user_id = ?", (user[0],)).fetchone()
            current = conn.execute("SELECT provider, model, created_at FROM usage_events WHERE user_id = ? AND success = 1 ORDER BY created_at DESC LIMIT 1", (user[0],)).fetchone()
            most = conn.execute("SELECT provider, model, COUNT(*), COALESCE(SUM(total_tokens),0) FROM usage_events WHERE user_id = ? AND success = 1 GROUP BY provider, model ORDER BY COUNT(*) DESC, SUM(total_tokens) DESC LIMIT 1", (user[0],)).fetchone()
            result.append({"user_id": user[0], "email": user[1], "status": user[2], "requests": summary[0], "total_tokens": summary[1], "last_active_at": summary[2], "current_model": {"provider": current[0], "model": current[1], "last_used_at": current[2]} if current else None, "most_used_model": {"provider": most[0], "model": most[1], "requests": most[2], "total_tokens": most[3]} if most else None})
    return {"scope": "global", "users": result}

@router.get("/admin/usage/export")
async def export_usage(_: dict = Depends(require_permission("audit.view"))):
    with database_manager.transaction() as conn:
        rows = conn.execute("SELECT user_id, event_type, provider, model, execution_boundary, input_tokens, output_tokens, total_tokens, token_accuracy, duration_ms, success, created_at FROM usage_events ORDER BY created_at DESC").fetchall()
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["user_id", "event_type", "provider", "model", "execution_boundary", "input_tokens", "output_tokens", "total_tokens", "token_accuracy", "duration_ms", "success", "created_at"])
    writer.writerows(rows)
    return StreamingResponse(iter([output.getvalue()]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=lm-webui-usage.csv"})
