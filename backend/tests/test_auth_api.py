from __future__ import annotations

import importlib
import os
import sys
import unittest
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))


class AuthApiTests(unittest.TestCase):
    def setUp(self):
        self._tmp_root = BACKEND_DIR / "tests" / ".tmp"
        self._tmp_root.mkdir(parents=True, exist_ok=True)
        self._db_path = self._tmp_root / f"auth_test_{uuid.uuid4().hex}.db"
        self._env_backup = {
            "DB_PATH": os.environ.get("DB_PATH"),
            "SECRET_KEY": os.environ.get("SECRET_KEY"),
            "COOKIE_SECURE": os.environ.get("COOKIE_SECURE"),
            "FRONTEND_ORIGINS": os.environ.get("FRONTEND_ORIGINS"),
        }
        os.environ["DB_PATH"] = str(self._db_path)
        os.environ["SECRET_KEY"] = "test-secret-key"
        os.environ["COOKIE_SECURE"] = "false"
        os.environ["FRONTEND_ORIGINS"] = "http://localhost:5173"

        import config
        import db
        import auth_deps
        import auth_api

        importlib.reload(config)
        importlib.reload(db)
        importlib.reload(auth_deps)
        importlib.reload(auth_api)

        @asynccontextmanager
        async def lifespan(_app: FastAPI):
            await db.init_db()
            yield

        app = FastAPI(lifespan=lifespan)
        app.include_router(auth_api.router)

        self.client = TestClient(app)
        self.client.__enter__()

    def tearDown(self):
        self.client.__exit__(None, None, None)

        for key, value in self._env_backup.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

        for suffix in ("", "-wal", "-shm"):
            candidate = Path(f"{self._db_path}{suffix}")
            if candidate.exists():
                candidate.unlink()

    def _csrf_header(self) -> dict[str, str]:
        csrf = self.client.cookies.get("csrf_token", "")
        return {"X-CSRF-Token": csrf}

    def test_register_me_logout_flow(self):
        register_response = self.client.post(
            "/auth/register",
            json={
                "email": "TestUser@Example.com",
                "password": "this is a valid password",
                "display_name": "Tester",
            },
        )
        self.assertEqual(register_response.status_code, 201)
        payload = register_response.json()
        self.assertEqual(payload["user"]["email"], "testuser@example.com")
        self.assertTrue(self.client.cookies.get("access_token"))
        self.assertTrue(self.client.cookies.get("refresh_token"))
        self.assertTrue(self.client.cookies.get("csrf_token"))

        me_response = self.client.get("/auth/me")
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.json()["email"], "testuser@example.com")

        missing_csrf_logout = self.client.post("/auth/logout")
        self.assertEqual(missing_csrf_logout.status_code, 403)

        logout_response = self.client.post("/auth/logout", headers=self._csrf_header())
        self.assertEqual(logout_response.status_code, 200)
        self.assertEqual(logout_response.json()["message"], "Logged out")

        me_after_logout = self.client.get("/auth/me")
        self.assertEqual(me_after_logout.status_code, 401)

    def test_login_error_message_is_generic(self):
        self.client.post(
            "/auth/register",
            json={"email": "user@example.com", "password": "printable password 123", "display_name": "User"},
        )
        self.client.post("/auth/logout", headers=self._csrf_header())

        wrong_password = self.client.post(
            "/auth/login",
            json={"email": "user@example.com", "password": "wrong password"},
        )
        unknown_email = self.client.post(
            "/auth/login",
            json={"email": "missing@example.com", "password": "wrong password"},
        )

        self.assertEqual(wrong_password.status_code, 401)
        self.assertEqual(unknown_email.status_code, 401)
        self.assertEqual(wrong_password.json()["detail"], "Invalid email or password")
        self.assertEqual(unknown_email.json()["detail"], "Invalid email or password")

    def test_refresh_rotates_and_old_token_reuse_is_rejected(self):
        register_response = self.client.post(
            "/auth/register",
            json={"email": "rotate@example.com", "password": "rotate token password", "display_name": ""},
        )
        self.assertEqual(register_response.status_code, 201)

        old_refresh = self.client.cookies.get("refresh_token")
        old_csrf = self.client.cookies.get("csrf_token")

        refresh_response = self.client.post("/auth/refresh", headers=self._csrf_header())
        self.assertEqual(refresh_response.status_code, 200)
        self.assertNotEqual(self.client.cookies.get("refresh_token"), old_refresh)

        self.client.cookies.set("refresh_token", old_refresh)
        self.client.cookies.set("csrf_token", old_csrf)
        reuse_response = self.client.post("/auth/refresh", headers={"X-CSRF-Token": old_csrf})
        self.assertEqual(reuse_response.status_code, 401)

    def test_password_reset_stub_is_non_enumerating(self):
        self.client.post(
            "/auth/register",
            json={"email": "resetme@example.com", "password": "reset table password", "display_name": "Reset User"},
        )
        self.client.post("/auth/logout", headers=self._csrf_header())

        known = self.client.post("/auth/password-reset-request", json={"email": "resetme@example.com"})
        unknown = self.client.post("/auth/password-reset-request", json={"email": "unknown@example.com"})

        self.assertEqual(known.status_code, 200)
        self.assertEqual(unknown.status_code, 200)
        self.assertEqual(
            known.json()["message"],
            "If the account exists, reset instructions were sent.",
        )
        self.assertEqual(
            unknown.json()["message"],
            "If the account exists, reset instructions were sent.",
        )


if __name__ == "__main__":
    unittest.main()
