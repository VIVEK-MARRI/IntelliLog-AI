"""Validation helpers for endpoint path/query parameters."""

from __future__ import annotations

import re

from fastapi import HTTPException


UUID4_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.IGNORECASE,
)


def ensure_uuid4(value: str, field_name: str) -> str:
    """Validate UUID4 format and return original value."""
    if not UUID4_PATTERN.match(str(value)):
        raise HTTPException(status_code=422, detail=f"{field_name} must be a valid UUID4")
    return value
