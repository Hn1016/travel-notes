from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.db import init_db
from app.routes import flights, geocode, items


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Travel Notes", lifespan=lifespan)
app.include_router(items.router)
app.include_router(geocode.router)
app.include_router(flights.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
