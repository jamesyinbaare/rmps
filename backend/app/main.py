from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

import uvicorn
from fastapi import FastAPI, status
from starlette.middleware.cors import CORSMiddleware

from app.dependencies.database import get_sessionmanager, initialize_db
from app.routers import batches, candidates, documents, exams, schools, subjects


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Lifespan context for application startup and shutdown."""
    # Startup: Initialize database
    sessionmanager = get_sessionmanager()
    async with initialize_db(sessionmanager):
        yield
    # Shutdown handled by context manager


app = FastAPI(title="Document Tracking System", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(schools.router)
app.include_router(subjects.router)
app.include_router(exams.router)
app.include_router(documents.router)
app.include_router(batches.router)
app.include_router(candidates.router)


@app.get("/", status_code=status.HTTP_200_OK)
def test() -> dict[str, Any]:
    return {"success": True}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
