from datetime import date
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import text, select
from typing import List, Optional

from app.core.database import get_db
from app.models.employee import Employee
from app.routers.auth import get_current_employee

router = APIRouter()


@router.get("/my-schedule")
def get_my_schedule(
    month_start: Optional[date] = Query(None),
    month_end: Optional[date] = Query(None),
    current_employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """
    Get the current employee's assigned shifts for a date range.
    If no dates provided, returns current month.
    """
    if not month_start:
        today = date.today()
        month_start = date(today.year, today.month, 1)
    if not month_end:
        # Last day of month
        from datetime import timedelta
        if month_start.month == 12:
            month_end = date(month_start.year + 1, 1, 1) - timedelta(days=1)
        else:
            month_end = date(month_start.year, month_start.month + 1, 1) - timedelta(days=1)

    shifts = db.execute(
        text(
            """
            SELECT
                ss.scheduled_shift_id,
                ss.shift_date,
                ss.label,
                ss.start_time,
                ss.end_time,
                sr.month_start,
                sr.month_end
            FROM scheduled_shifts ss
            JOIN schedule_runs sr ON ss.schedule_run_id = sr.schedule_run_id
            WHERE ss.employee_id = :employee_id
                AND ss.shift_date BETWEEN :month_start AND :month_end
            ORDER BY ss.shift_date, ss.start_time
            """
        ),
        {
            "employee_id": str(current_employee.employee_id),
            "month_start": month_start,
            "month_end": month_end,
        },
    ).mappings().all()

    return {
        "employee_id": str(current_employee.employee_id),
        "employee_name": current_employee.name,
        "month_start": month_start,
        "month_end": month_end,
        "shifts": [dict(s) for s in shifts],
    }


@router.get("/team-schedule")
def get_team_schedule(
    month_start: Optional[date] = Query(None),
    month_end: Optional[date] = Query(None),
    current_employee: Employee = Depends(get_current_employee),
    db: Session = Depends(get_db),
):
    """
    Get the team's schedule (all employees in same company) for a date range.
    Read-only view - no edit capabilities.
    If no dates provided, returns current month.
    """
    if not month_start:
        today = date.today()
        month_start = date(today.year, today.month, 1)
    if not month_end:
        # Last day of month
        from datetime import timedelta
        if month_start.month == 12:
            month_end = date(month_start.year + 1, 1, 1) - timedelta(days=1)
        else:
            month_end = date(month_start.year, month_start.month + 1, 1) - timedelta(days=1)

    # Get the latest schedule run for this company in the date range
    run = db.execute(
        text(
            """
            SELECT schedule_run_id, company_id, studio_id, month_start, month_end
            FROM schedule_runs
            WHERE company_id = :company_id
                AND month_start <= :month_end
                AND month_end >= :month_start
            ORDER BY created_at DESC
            LIMIT 1
            """
        ),
        {
            "company_id": str(current_employee.company_id),
            "month_start": month_start,
            "month_end": month_end,
        },
    ).mappings().first()

    if not run:
        return {
            "company_id": str(current_employee.company_id),
            "month_start": month_start,
            "month_end": month_end,
            "shifts": [],
            "message": "No schedule found for this period",
        }

    # Get all shifts for the team
    shifts = db.execute(
        text(
            """
            SELECT
                ss.scheduled_shift_id,
                ss.shift_date,
                ss.label,
                ss.start_time,
                ss.end_time,
                ss.employee_id,
                e.name AS employee_name,
                e.email AS employee_email
            FROM scheduled_shifts ss
            JOIN employees e ON e.employee_id = ss.employee_id
            WHERE ss.schedule_run_id = :run_id
                AND ss.shift_date BETWEEN :month_start AND :month_end
                AND e.company_id = :company_id
                AND e.is_active = true
            ORDER BY ss.shift_date, ss.start_time, e.name
            """
        ),
        {
            "run_id": str(run["schedule_run_id"]),
            "company_id": str(current_employee.company_id),
            "month_start": month_start,
            "month_end": month_end,
        },
    ).mappings().all()

    # Group by date for easier display
    by_date: dict[str, List[dict]] = {}
    for shift in shifts:
        date_key = str(shift["shift_date"])
        if date_key not in by_date:
            by_date[date_key] = []
        by_date[date_key].append(dict(shift))

    return {
        "company_id": str(current_employee.company_id),
        "month_start": month_start,
        "month_end": month_end,
        "schedule_run_id": str(run["schedule_run_id"]),
        "shifts_by_date": by_date,
        "all_shifts": [dict(s) for s in shifts],
    }

