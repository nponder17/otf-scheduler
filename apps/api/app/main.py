from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.employee_form import router as employee_form_router
from app.routers.companies import router as companies_router
from app.routers.admin import router as admin_router
from app.routers.schedule import router as schedule_router
from app.routers.auth import router as auth_router
from app.routers.employee_schedule import router as employee_schedule_router
from app.routers.system_admin import router as system_admin_router

app = FastAPI(title="Scheduler API")

ALLOWED_ORIGINS = [
    # local dev
    "http://localhost:8081",
    "http://127.0.0.1:8081",
    "http://localhost:19006",
    "http://127.0.0.1:19006",

    # Render deployments (yours)
    "https://otf-scheduler-mobile.onrender.com",
    "https://otf-scheduler-web.onrender.com",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],  # includes ngrok-skip-browser-warning
)

app.include_router(employee_form_router, prefix="/employees", tags=["employee-form"])
app.include_router(companies_router, prefix="/companies", tags=["companies"])
app.include_router(admin_router, prefix="/admin", tags=["admin"])
app.include_router(schedule_router, prefix="/schedules", tags=["schedules"])
app.include_router(auth_router, prefix="/auth", tags=["auth"])
app.include_router(employee_schedule_router, prefix="/employee", tags=["employee-schedule"])
app.include_router(system_admin_router, prefix="/system-admin", tags=["system-admin"])

@app.get("/health")
def health():
    return {"status": "ok"}
