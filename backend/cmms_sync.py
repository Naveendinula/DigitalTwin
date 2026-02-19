"""
CMMS sync adapters and credential encryption helpers.
"""

from __future__ import annotations

import base64
import hashlib
import json
from abc import ABC, abstractmethod
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from config import CMMS_CREDENTIALS_KEY


def _derive_fernet_key(raw_secret: str) -> bytes:
    digest = hashlib.sha256(raw_secret.encode("utf-8")).digest()
    return base64.urlsafe_b64encode(digest)


_FERNET = Fernet(_derive_fernet_key(CMMS_CREDENTIALS_KEY))


def encrypt_credentials(credentials: dict[str, str]) -> str:
    filtered = {
        key: value
        for key, value in credentials.items()
        if isinstance(value, str) and value.strip()
    }
    if not filtered:
        return ""
    payload = json.dumps(filtered, separators=(",", ":"), sort_keys=True)
    return _FERNET.encrypt(payload.encode("utf-8")).decode("utf-8")


def decrypt_credentials(encrypted_value: str | None) -> dict[str, str]:
    if not encrypted_value:
        return {}
    try:
        raw = _FERNET.decrypt(encrypted_value.encode("utf-8")).decode("utf-8")
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            return {}
        return {
            str(key): str(value)
            for key, value in payload.items()
            if isinstance(key, str) and isinstance(value, str)
        }
    except (InvalidToken, ValueError, TypeError, json.JSONDecodeError):
        return {}


class CMMSAdapter(ABC):
    def __init__(self, base_url: str, credentials: dict[str, str]) -> None:
        self.base_url = base_url.strip()
        self.credentials = credentials

    @abstractmethod
    def push_work_order(self, work_order: dict[str, Any]) -> dict[str, Any]:
        """
        Push a local work order to the external CMMS.
        """

    @abstractmethod
    def pull_work_order(
        self,
        external_work_order_id: str,
        local_work_order: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Pull latest external data for an existing work order.
        """


class MockAdapter(CMMSAdapter):
    """
    Local test adapter with deterministic responses.
    """

    def push_work_order(self, work_order: dict[str, Any]) -> dict[str, Any]:
        external_id = (
            str(work_order.get("external_work_order_id") or "").strip()
            or f"MOCK-{work_order['job_id']}-{work_order['id']}"
        )
        return {
            "external_work_order_id": external_id,
            "external_sync_status": "synced",
        }

    def pull_work_order(
        self,
        external_work_order_id: str,
        local_work_order: dict[str, Any],
    ) -> dict[str, Any]:
        current_status = str(local_work_order.get("status") or "open")
        next_status = {
            "open": "in_progress",
            "in_progress": "resolved",
            "resolved": "closed",
        }.get(current_status, current_status)
        return {
            "external_work_order_id": external_work_order_id,
            "status": next_status,
            "external_sync_status": "synced",
        }


class PlaceholderRemoteAdapter(CMMSAdapter):
    def __init__(self, system_label: str, base_url: str, credentials: dict[str, str]) -> None:
        super().__init__(base_url=base_url, credentials=credentials)
        self.system_label = system_label

    def push_work_order(self, work_order: dict[str, Any]) -> dict[str, Any]:
        raise RuntimeError(
            f"{self.system_label} adapter is not implemented yet. Use 'mock' for local testing."
        )

    def pull_work_order(
        self,
        external_work_order_id: str,
        local_work_order: dict[str, Any],
    ) -> dict[str, Any]:
        raise RuntimeError(
            f"{self.system_label} adapter is not implemented yet. Use 'mock' for local testing."
        )


def create_adapter(system: str, base_url: str, credentials: dict[str, str]) -> CMMSAdapter:
    normalized = system.strip().lower()
    if normalized == "mock":
        return MockAdapter(base_url=base_url, credentials=credentials)
    if normalized == "upkeep":
        return PlaceholderRemoteAdapter("UpKeep", base_url=base_url, credentials=credentials)
    if normalized == "fiix":
        return PlaceholderRemoteAdapter("Fiix", base_url=base_url, credentials=credentials)
    if normalized == "maximo":
        return PlaceholderRemoteAdapter("Maximo", base_url=base_url, credentials=credentials)
    if normalized == "other":
        return PlaceholderRemoteAdapter("Other CMMS", base_url=base_url, credentials=credentials)
    raise RuntimeError(f"Unsupported CMMS system: {system}")
