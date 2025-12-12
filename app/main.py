from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import uvicorn
from fastapi import FastAPI, status

from app.dependencies.database import get_sessionmanager, initialize_db
from app.routers import batches, documents, exams, schools, subjects


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Lifespan context for application startup and shutdown."""
    # Startup: Initialize database
    sessionmanager = get_sessionmanager()
    async with initialize_db(sessionmanager):
        yield
    # Shutdown handled by context manager


app = FastAPI(title="Document Tracking System", lifespan=lifespan)

# Include routers
app.include_router(schools.router)
app.include_router(subjects.router)
app.include_router(exams.router)
app.include_router(documents.router)
app.include_router(batches.router)


@app.get("/", status_code=status.HTTP_200_OK)
def test() -> dict[str, Any]:
    return {"success": True}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
