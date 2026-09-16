from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import init_db
from .gridlock import models as gl_models  # noqa: F401 - registers tables
from .gridlock.auth_router import router as auth_router
from .gridlock.router import router as gridlock_router

app = FastAPI(title="GRIDLOCK API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup():
    init_db()


@app.get("/api/health")
def health():
    return {"status": "ok", "product": "GRIDLOCK"}


app.include_router(auth_router)
app.include_router(gridlock_router)
