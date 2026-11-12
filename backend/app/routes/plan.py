from fastapi import APIRouter, HTTPException
from sqlmodel import select

from app.db import SessionDep
from app.models import Item, PlanRequest, PlanResponse
from app.services import planner

router = APIRouter(prefix="/api", tags=["plan"])


@router.post("/plan", response_model=PlanResponse)
def make_plan(request: PlanRequest, session: SessionDep):
    try:
        return planner.plan(request, list(session.exec(select(Item)).all()))
    except planner.PlannerNotConfigured as exc:
        raise HTTPException(
            status_code=503, detail="Planning is not set up. Add GEMINI_API_KEY to backend/.env"
        ) from exc
    except planner.PlannerError as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc
