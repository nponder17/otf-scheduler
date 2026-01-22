from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers.employee_form import router as employee_form_router
from app.routers.companies import router as companies_router
from app.routers.admin import router as admin_router
from app.routers.schedule import router as schedule_router

app = FastAPI(title="Scheduler API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[*]
    ,
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
