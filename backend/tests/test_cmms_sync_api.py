from __future__ import annotations

import asyncio
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


class CMMSSyncApiTests(unittest.TestCase):
    def setUp(self):
        self._tmp_root = BACKEND_DIR / "tests" / ".tmp"
        self._tmp_root.mkdir(parents=True, exist_ok=True)
        self._db_path = self._tmp_root / f"cmms_sync_test_{uuid.uuid4().hex}.db"
        self._env_backup = {
            "DB_PATH": os.environ.get("DB_PATH"),
            "SECRET_KEY": os.environ.get("SECRET_KEY"),
            "COOKIE_SECURE": os.environ.get("COOKIE_SECURE"),
            "FRONTEND_ORIGINS": os.environ.get("FRONTEND_ORIGINS"),
            "CMMS_WEBHOOK_SHARED_SECRET": os.environ.get("CMMS_WEBHOOK_SHARED_SECRET"),
            "CMMS_CREDENTIALS_KEY": os.environ.get("CMMS_CREDENTIALS_KEY"),
        }

        os.environ["DB_PATH"] = str(self._db_path)
        os.environ["SECRET_KEY"] = "test-secret-key"
        os.environ["COOKIE_SECURE"] = "false"
        os.environ["FRONTEND_ORIGINS"] = "http://localhost:5173"
        os.environ["CMMS_WEBHOOK_SHARED_SECRET"] = "test-webhook-secret"
        os.environ["CMMS_CREDENTIALS_KEY"] = "test-cmms-credentials-key"

        import config
        import db
        import auth_deps
        import auth_api
        import job_security
        import work_order_models
        import work_order_api
        import cmms_sync
        import cmms_sync_models
        import cmms_sync_api

        importlib.reload(config)
        importlib.reload(db)
        importlib.reload(auth_deps)
        importlib.reload(auth_api)
        importlib.reload(job_security)
        importlib.reload(work_order_models)
        importlib.reload(work_order_api)
        importlib.reload(cmms_sync)
        importlib.reload(cmms_sync_models)
        importlib.reload(cmms_sync_api)

        self.db = db
        self.job_security = job_security
        self.webhook_secret = config.CMMS_WEBHOOK_SHARED_SECRET

        @asynccontextmanager
        async def lifespan(_app: FastAPI):
            await db.init_db()
            yield

        app = FastAPI(lifespan=lifespan)
        app.include_router(auth_api.router)
        app.include_router(work_order_api.router)
        app.include_router(cmms_sync_api.router)

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

    def _register_user(self) -> int:
        response = self.client.post(
            "/auth/register",
            json={
                "email": f"user_{uuid.uuid4().hex[:8]}@example.com",
                "password": "valid password for tests",
                "display_name": "Tester",
            },
        )
        self.assertEqual(response.status_code, 201)
        me = self.client.get("/auth/me")
        self.assertEqual(me.status_code, 200)
        return int(me.json()["id"])

    def _create_job_and_work_order(self, user_id: int) -> tuple[str, int]:
        job_id = f"job-{uuid.uuid4().hex[:8]}"
        file_token = self.job_security.create_file_access_token()
        asyncio.run(
            self.job_security.create_job_record(
                job_id=job_id,
                owner_user_id=user_id,
                original_filename="test.ifc",
                stored_ifc_name=f"{job_id}_test.ifc",
                file_access_token=file_token,
            )
        )

        created = self.client.post(
            f"/api/work-orders/{job_id}",
            json={
                "global_id": "0M9JkWf0v2fQ8fE9vABCD1",
                "element_name": "AHU-1",
                "element_type": "IfcAirHandlingUnit",
                "storey": "Level 1",
                "category": "repair",
                "title": "Replace filter",
                "description": "Initial work order",
                "priority": "medium",
                "status": "open",
            },
        )
        self.assertEqual(created.status_code, 201)
        wo_id = int(created.json()["id"])
        return job_id, wo_id

    def _enable_mock_sync(self) -> None:
        response = self.client.put(
            "/api/cmms/settings",
            headers=self._csrf_header(),
            json={
                "enabled": True,
                "system": "mock",
                "base_url": "",
                "api_key": "mock-api-key",
                "webhook_secret": "mock-webhook-secret",
            },
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(payload["enabled"])
        self.assertEqual(payload["system"], "mock")
        self.assertTrue(payload["has_api_key"])

    def test_settings_round_trip_masks_credentials(self):
        self._register_user()
        self._enable_mock_sync()

        fetched = self.client.get("/api/cmms/settings")
        self.assertEqual(fetched.status_code, 200)
        payload = fetched.json()
        self.assertTrue(payload["enabled"])
        self.assertEqual(payload["system"], "mock")
        self.assertTrue(payload["has_api_key"])
        self.assertTrue(payload["has_webhook_secret"])
        self.assertNotIn("api_key", payload)
        self.assertNotIn("webhook_secret", payload)

    def test_push_and_pull_work_order_with_mock_adapter(self):
        user_id = self._register_user()
        job_id, wo_id = self._create_job_and_work_order(user_id)
        self._enable_mock_sync()

        pushed = self.client.post(
            f"/api/work-orders/{job_id}/{wo_id}/sync/push",
            headers=self._csrf_header(),
        )
        self.assertEqual(pushed.status_code, 200)
        pushed_payload = pushed.json()
        self.assertEqual(pushed_payload["external_system"], "mock")
        self.assertEqual(pushed_payload["external_sync_status"], "synced")
        self.assertTrue(str(pushed_payload["external_work_order_id"]).startswith("MOCK-"))

        pulled = self.client.post(
            f"/api/work-orders/{job_id}/{wo_id}/sync/pull",
            headers=self._csrf_header(),
        )
        self.assertEqual(pulled.status_code, 200)
        pulled_payload = pulled.json()
        self.assertEqual(pulled_payload["status"], "in_progress")
        self.assertEqual(pulled_payload["external_sync_status"], "synced")

    def test_webhook_requires_secret_and_updates_work_order(self):
        user_id = self._register_user()
        job_id, wo_id = self._create_job_and_work_order(user_id)
        self._enable_mock_sync()

        pushed = self.client.post(
            f"/api/work-orders/{job_id}/{wo_id}/sync/push",
            headers=self._csrf_header(),
        )
        self.assertEqual(pushed.status_code, 200)
        external_id = pushed.json()["external_work_order_id"]

        rejected = self.client.post(
            "/api/cmms/webhooks/mock",
            json={
                "job_id": job_id,
                "external_work_order_id": external_id,
                "status": "resolved",
            },
        )
        self.assertEqual(rejected.status_code, 401)

        accepted = self.client.post(
            "/api/cmms/webhooks/mock",
            headers={"X-CMMS-Webhook-Secret": self.webhook_secret},
            json={
                "job_id": job_id,
                "external_work_order_id": external_id,
                "status": "resolved",
                "priority": "high",
                "external_sync_status": "synced",
            },
        )
        self.assertEqual(accepted.status_code, 200)

        current = self.client.get(f"/api/work-orders/{job_id}/{wo_id}")
        self.assertEqual(current.status_code, 200)
        current_payload = current.json()
        self.assertEqual(current_payload["status"], "resolved")
        self.assertEqual(current_payload["priority"], "high")
        self.assertEqual(current_payload["external_sync_status"], "synced")


if __name__ == "__main__":
    unittest.main()
