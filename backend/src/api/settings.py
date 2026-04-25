"""Settings API."""

from typing import Any

from fastapi import APIRouter, Body, HTTPException
from pydantic import ValidationError

from ..database import settings

router = APIRouter(prefix="/api/settings", tags=["settings"])

_SECRET_FIELDS = {"api_key"}


def _mask(value: str) -> str:
    if len(value) <= 2:
        return "*" * len(value)
    return value[0] + "*" * (len(value) - 2) + value[-1]


def _redact(obj: Any) -> Any:
    if isinstance(obj, dict):
        return {
            k: (_mask(v) if k in _SECRET_FIELDS and isinstance(v, str) else _redact(v))
            for k, v in obj.items()
        }
    if isinstance(obj, list):
        return [_redact(i) for i in obj]
    return obj


def _restore_secrets(incoming: Any, stored: Any) -> Any:
    """Walk incoming and stored in parallel; restore any masked secret field from stored."""
    if isinstance(incoming, dict) and isinstance(stored, dict):
        result = {}
        for k, v in incoming.items():
            stored_v = stored.get(k)
            if k in _SECRET_FIELDS and isinstance(v, str) and v == _mask(v):
                result[k] = stored_v
            else:
                result[k] = _restore_secrets(v, stored_v)
        return result
    if isinstance(incoming, list) and isinstance(stored, list):
        stored_by_id = {
            item["id"]: item
            for item in stored
            if isinstance(item, dict) and "id" in item
        }
        out: list[Any] = []
        for item in incoming:
            if isinstance(item, dict) and "id" in item and item["id"] in stored_by_id:
                out.append(_restore_secrets(item, stored_by_id[item["id"]]))
            else:
                out.append(item)
        return out
    return incoming


@router.get("")
def get_settings() -> dict[str, Any]:
    """Return current settings with secrets masked."""
    return dict(_redact(settings.get().model_dump()))


@router.put("")
def put_settings(body: dict[str, Any] = Body(...)) -> dict[str, Any]:
    """Persist updated settings, restoring any masked secret fields."""
    current = settings.get().model_dump()
    body = _restore_secrets(body, current)
    try:
        updated = settings.update(body)
        return dict(_redact(updated.model_dump()))
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail=[{"loc": [str(l) for l in e["loc"]], "msg": e["msg"]} for e in exc.errors()],
        ) from exc
