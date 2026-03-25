"""Optional API uploader for Dayli bot telemetry.

Sends bot events and snapshots to a user-defined API endpoint.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import asdict, is_dataclass
from datetime import date, datetime
from typing import Any, Dict, Optional

import aiohttp

logger = logging.getLogger(__name__)


class DataUploader:
    """Upload bot data to an external API endpoint."""

    def __init__(
        self,
        upload_url: str,
        api_key: Optional[str] = None,
        source: str = "dayli-bot",
        timeout_seconds: int = 15,
        max_retries: int = 3,
        enabled: bool = True,
    ):
        self.upload_url = (upload_url or "").strip()
        self.api_key = (api_key or "").strip()
        self.source = source
        self.max_retries = max(1, int(max_retries))
        self.enabled = enabled and bool(self.upload_url)
        self.timeout = aiohttp.ClientTimeout(total=max(5, int(timeout_seconds)))
        self._session: Optional[aiohttp.ClientSession] = None

    async def close(self):
        if self._session:
            await self._session.close()
            self._session = None

    async def _ensure_session(self) -> aiohttp.ClientSession:
        if self._session is None:
            headers = {"Content-Type": "application/json"}
            if self.api_key:
                headers["Authorization"] = f"Bearer {self.api_key}"
            self._session = aiohttp.ClientSession(timeout=self.timeout, headers=headers)
        return self._session

    def _to_json_safe(self, value: Any) -> Any:
        if isinstance(value, (datetime, date)):
            return value.isoformat()
        if is_dataclass(value):
            return self._to_json_safe(asdict(value))
        if isinstance(value, dict):
            return {str(k): self._to_json_safe(v) for k, v in value.items()}
        if isinstance(value, (list, tuple, set)):
            return [self._to_json_safe(v) for v in value]
        return value

    async def upload_event(self, event_type: str, payload: Dict[str, Any]) -> bool:
        """Upload a single event payload. Returns True on success."""
        if not self.enabled:
            return False

        body = {
            "source": self.source,
            "eventType": event_type,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "payload": self._to_json_safe(payload),
        }

        session = await self._ensure_session()
        for attempt in range(1, self.max_retries + 1):
            try:
                async with session.post(self.upload_url, json=body) as resp:
                    if 200 <= resp.status < 300:
                        return True

                    response_text = await resp.text()
                    if resp.status < 500:
                        logger.warning(
                            "Upload rejected (%s): %s",
                            resp.status,
                            response_text[:200],
                        )
                        return False

                    logger.warning(
                        "Upload failed with %s (attempt %s/%s)",
                        resp.status,
                        attempt,
                        self.max_retries,
                    )
            except Exception as exc:
                logger.warning(
                    "Upload exception (%s/%s): %s",
                    attempt,
                    self.max_retries,
                    exc,
                )

            if attempt < self.max_retries:
                await asyncio.sleep(2 ** attempt)

        return False
