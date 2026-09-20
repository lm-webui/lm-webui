"""Every /api route must be authenticated unless it is deliberately public.

Auth here is opt-in per handler — there is no router- or app-level default — so a route that
forgets its dependency ships fully open. That is exactly how `/api/download/file` ended up
letting anonymous callers write arbitrary files. This test pins the current surface: a new
unguarded route fails the suite until it is either guarded or added to PUBLIC_ROUTES with a
stated reason.
"""
import pytest
from fastapi.routing import APIRoute, APIWebSocketRoute

# Deliberately reachable without a session. Anything added here needs a reason, because each
# entry is a route an anonymous caller can hit.
PUBLIC_ROUTES = {
    # The auth flow itself — by definition pre-session.
    ("POST", "/api/auth/login"),
    ("POST", "/api/auth/register"),
    ("POST", "/api/auth/refresh"),
    ("POST", "/api/auth/pairing/exchange"),
    ("POST", "/api/auth/logout"),
    ("GET", "/api/auth/status"),      # drives the first-run "create an account" screen
    # Liveness probes, used by the desktop shell and install script before any login exists.
    ("GET", "/api/system/health"),
    ("GET", "/api/upload/health"),
    ("GET", "/ws/health"),
    # Static option lists — no user or system data.
    ("GET", "/api/settings/languages"),
    ("GET", "/api/settings/themes"),
    # Hardware capability report, shown on the pre-login setup screen.
    ("GET", "/api/hardware"),
    ("GET", "/api/hardware/info"),
}

# WebSocket routes cannot take a Depends, so they gate inline and cannot be introspected the
# same way. Listed so the omission is visible rather than silent; see the test below.
INLINE_AUTH_WEBSOCKETS = {"/api/agents/{agent}/terminal/{sid}"}


def _iter_routes():
    """Yield (method, path, route) for every HTTP route under every included router.

    FastAPI no longer flattens included routers into `app.routes` — each becomes an
    `_IncludedRouter` wrapper — so the real routes are read off `original_router`.
    """
    from app.main import app

    for entry in app.routes:
        original = getattr(entry, "original_router", None)
        if original is None:
            continue
        for route in original.routes:
            if isinstance(route, APIWebSocketRoute):
                yield "WEBSOCKET", route.path, route
            elif isinstance(route, APIRoute):
                for method in route.methods:
                    yield method, route.path, route


def _dependency_names(route) -> set:
    """Every dependency callable name in the route's dependency tree."""
    names = set()
    dependant = getattr(route, "dependant", None)
    stack = list(dependant.dependencies) if dependant else []
    while stack:
        dep = stack.pop()
        call = getattr(dep, "call", None)
        if call is not None:
            names.add(getattr(call, "__name__", ""))
        stack.extend(dep.dependencies)
    return names


def _is_guarded(route) -> bool:
    """True if the route requires a session.

    `get_current_user` is the plain dependency; `require_permission(...)` returns a closure
    named `checker`, so the name alone is not enough — match on the module instead.
    """
    dependant = getattr(route, "dependant", None)
    stack = list(dependant.dependencies) if dependant else []
    while stack:
        dep = stack.pop()
        call = getattr(dep, "call", None)
        if call is not None:
            name = getattr(call, "__name__", "")
            module = getattr(call, "__module__", "") or ""
            qualname = getattr(call, "__qualname__", "") or ""
            if name in ("get_current_user", "require_admin", "checker"):
                return True
            if module.startswith("app.security.auth") or "require_permission" in qualname:
                return True
        stack.extend(dep.dependencies)
    return False


def _api_routes():
    return [
        (method, path)
        for method, path, _ in _iter_routes()
        if path.startswith("/api") or path.startswith("/ws")
    ]


def test_route_table_is_discoverable():
    """Guard the guard: if route introspection breaks, the coverage test below goes green
    for the wrong reason by seeing zero routes."""
    assert len(_api_routes()) > 50


def test_every_api_route_is_authenticated_or_deliberately_public():
    unguarded = []
    for method, path, route in _iter_routes():
        if not (path.startswith("/api") or path.startswith("/ws")):
            continue
        if isinstance(route, APIWebSocketRoute):
            # Depends works on websockets after all (FastAPI runs it on connect), so most
            # are introspectable; the rest are listed in INLINE_AUTH_WEBSOCKETS.
            if not _is_guarded(route) and path not in INLINE_AUTH_WEBSOCKETS:
                unguarded.append(f"{'WEBSOCKET':14} {path}  (websocket, verify inline gate)")
            continue
        if (method, path) in PUBLIC_ROUTES:
            continue
        if not _is_guarded(route):
            unguarded.append(f"{method:14} {path}")

    assert not unguarded, (
        "These routes are reachable without authentication. Add a Depends(...) guard, or "
        "add them to PUBLIC_ROUTES in this file with a reason:\n  "
        + "\n  ".join(sorted(unguarded))
    )


@pytest.mark.parametrize("path", sorted(INLINE_AUTH_WEBSOCKETS))
def test_inline_auth_websockets_still_gate_themselves(path):
    """WebSockets can't use Depends, so these verify the JWT by hand. Assert the token check
    is still there rather than trusting the route to stay correct."""
    import inspect

    from app.routes import agents as agents_routes

    source = inspect.getsource(agents_routes.agent_terminal)
    assert "verify_token" in source, f"{path} no longer verifies a token"
    assert "agents.run" in source, f"{path} no longer requires the admin permission"


# ── download route regressions ────────────────────────────────────────────
# These were the concrete holes behind the test above; pin them individually so a
# failure names the route rather than a count.

def test_download_router_is_fully_guarded():
    """Every endpoint on this router, not just the ones that were broken. It is the route
    group that shipped wide open, so a blanket assertion is the useful one."""
    from app.routes.download import router

    unguarded = [r.path for r in router.routes if not _is_guarded(r)]
    assert not unguarded, f"unguarded download routes: {unguarded}"


@pytest.mark.parametrize("path", ["/api/system/info", "/api/system/stats"])
def test_system_info_routes_require_auth(path):
    from app.routes.system import router

    route = next(r for r in router.routes if getattr(r, "path", "") == path)
    assert _is_guarded(route), f"{path} must require a session"


# ── cookie flags ──────────────────────────────────────────────────────────

class _FakeRequest:
    def __init__(self, scheme: str, headers: dict):
        self.url = type("U", (), {"scheme": scheme})()
        self.headers = headers


@pytest.mark.parametrize("scheme,headers,expected", [
    ("https", {}, True),                                        # direct TLS
    ("http", {"x-forwarded-proto": "https"}, True),             # behind a TLS terminator
    ("http", {"x-forwarded-proto": "HTTPS"}, True),             # header case varies
    ("http", {}, False),                                        # plain-HTTP LAN deploy
])
def test_cookie_secure_follows_the_request_scheme(scheme, headers, expected):
    from app.routes.auth import _cookie_secure

    assert _cookie_secure(_FakeRequest(scheme, headers)) is expected


def test_no_auth_cookie_is_written_with_a_hardcoded_insecure_flag():
    """Every auth cookie now goes through _set_auth_cookies. A stray `secure=False`, or a
    set_cookie call that skips the helper, silently reintroduces cleartext tokens.

    Parsed rather than string-matched so comments (which discuss the old flag) don't count.
    """
    import ast
    import inspect

    from app.routes import auth

    tree = ast.parse(inspect.getsource(auth))
    calls = [
        node for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and isinstance(node.func, ast.Attribute)
        and node.func.attr == "set_cookie"
    ]

    assert calls, "expected auth cookies to be set somewhere in this module"
    for call in calls:
        secure = [kw for kw in call.keywords if kw.arg == "secure"]
        assert secure, (
            "every set_cookie must pass secure explicitly — the default is False"
        )
        for kw in secure:
            assert not (
                isinstance(kw.value, ast.Constant) and kw.value.value is False
            ), "a cookie is written with a hardcoded secure=False"
