"""AI form generation endpoint (optional; requires SUPFORM_AI_API_KEY)."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.core.ratelimit import rate_limit
from app.models.user import User
from app.schemas.api import AIGenerateRequest
from app.schemas.form_schema import FormSchema
from app.services import ai as ai_service

router = APIRouter(prefix="/ai", tags=["ai"])

# LLM calls are slow and metered — throttle per IP.
_ai_throttle = rate_limit(10, 60, scope="ai-generate")


@router.post("/generate-form", response_model=FormSchema, dependencies=[Depends(_ai_throttle)])
async def generate_form(
    payload: AIGenerateRequest,
    _: User = Depends(get_current_user),
) -> FormSchema:
    """Generate a draft form schema from a natural-language prompt."""
    return await ai_service.generate_form(payload.prompt)
