import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.employee_form import router as employee_form_router
from app.routers.companies import router as companies_router
from app.routers.admin import router as admin_router
from app.routers.schedule import router as schedule_router

app = FastAPI(title="Scheduler API")

# Comma-separated list, e.g.:
# CORS_ORIGINS="http://localhost:8081,http://127.0.0.1:8081,https://otf-scheduler-web.onrender.com"
cors_origins = os.getenv("CORS_ORIGINS", "")
allow_origins = [o.strip() for o in cors_origins.split(",") if o.strip()]

# Safe fallback for local dev if env var not set
if not allow_origins:
  allow_origins = [
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:8082",
    "http://127.0.0.1:8082",
  ]

app.add_middleware(
  CORSMiddleware,
  allow_origins=allow_origins,
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)

app.include_router(employee_form_router, prefix="/employees", tags=["employee-form"])
app.include_router(companies_router, prefix="/companies", tags=["companies"])
app.include_router(admin_router, prefix="/admin", tags=["admin"])
app.include_router(schedule_router, prefix="/schedules", tags=["schedules"])

@app.get("/health")
def health():
  return {"status": "ok"}
