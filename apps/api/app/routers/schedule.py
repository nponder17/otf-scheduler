from datetime import date, time, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text, delete, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.scheduled_shifts import ScheduledShift
from app.models.shift_instances import ShiftInstance
from app.scheduling.shift_templates import SHIFT_TEMPLATES

router = APIRouter()


class ScheduleGenerateRequest(BaseModel):
    company_id: UUID
    studio_id: UUID
    month_start: date
    month_end: date
    overwrite: bool = False
    generator_version: str = "v1"  # "v1" for original, "v2" for new enhanced generator


class ShiftUpdateRequest(BaseModel):
    employee_id: UUID


class ShiftCreateRequest(BaseModel):
    schedule_run_id: UUID
    employee_id: UUID
    shift_date: date
    label: str
    start_time: str  # HH:MM
    end_time: str  # HH:MM


class GenerateShiftInstancesRequest(BaseModel):
    company_id: UUID
    studio_id: UUID
    month_start: date
    month_end: date
    overwrite: bool = False


@router.post("/shift-instances/generate")
def generate_shift_instances(req: GenerateShiftInstancesRequest, db: Session = Depends(get_db)):
    """
    Generate shift instances from templates for a given month range.
    This creates the demand that the schedule generator will fill.
    """
    if req.month_end < req.month_start:
        raise HTTPException(status_code=400, detail="month_end must be >= month_start")
    
    # Check if company and studio exist
    company = db.execute(
        text("SELECT company_id FROM companies WHERE company_id = :company_id"),
        {"company_id": str(req.company_id)},
    ).first()
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")
    
    studio = db.execute(
        text("SELECT studio_id FROM studios WHERE studio_id = :studio_id AND company_id = :company_id"),
        {"studio_id": str(req.studio_id), "company_id": str(req.company_id)},
    ).first()
    if not studio:
        raise HTTPException(status_code=404, detail="Studio not found or doesn't belong to company")
    
    # Delete existing shift instances if overwrite is True
    if req.overwrite:
        db.execute(
            text("""
                DELETE FROM shift_instances 
                WHERE company_id = :company_id 
                  AND studio_id = :studio_id
                  AND shift_date BETWEEN :month_start AND :month_end
            """),
            {
                "company_id": str(req.company_id),
                "studio_id": str(req.studio_id),
                "month_start": req.month_start,
                "month_end": req.month_end,
            },
        )
    
    # Generate shift instances from templates
    created_count = 0
    current_date = req.month_start
    
    while current_date <= req.month_end:
        # Python weekday: Mon=0, Tue=1, ..., Sat=5, Sun=6
        # Database convention: Sun=0, Mon=1, ..., Sat=6
        python_dow = current_date.weekday()
        db_dow = (python_dow + 1) % 7  # Convert to DB convention
        
        # Check each template to see if it applies to this day
        for template in SHIFT_TEMPLATES:
            if db_dow in template["days"]:
                # Check if shift instance already exists
                existing = db.execute(
                    text("""
                        SELECT shift_instance_id 
                        FROM shift_instances 
                        WHERE company_id = :company_id 
                          AND studio_id = :studio_id
                          AND shift_date = :shift_date
                          AND label = :label
                    """),
                    {
                        "company_id": str(req.company_id),
                        "studio_id": str(req.studio_id),
                        "shift_date": current_date,
                        "label": template["label"],
                    },
                ).first()
                
                if not existing:
                    # Parse times
                    start_parts = template["start_hhmm"].split(":")
                    end_parts = template["end_hhmm"].split(":")
                    start_time_obj = time(int(start_parts[0]), int(start_parts[1]))
                    end_time_obj = time(int(end_parts[0]), int(end_parts[1]))
                    
                    # Create shift instance
                    # Note: We need a shift_template_id, but templates might not exist in DB
                    # For now, we'll use a placeholder UUID or create a minimal template
                    # Let's check if we need to handle this differently
                    db.execute(
                        text("""
                            INSERT INTO shift_instances 
                            (company_id, studio_id, shift_template_id, shift_date, day_of_week, 
                             label, start_time, end_time, required_count, status)
                            VALUES 
                            (:company_id, :studio_id, gen_random_uuid(), :shift_date, :day_of_week,
                             :label, :start_time, :end_time, :required_count, 'active')
                        """),
                        {
                            "company_id": str(req.company_id),
                            "studio_id": str(req.studio_id),
                            "shift_date": current_date,
                            "day_of_week": db_dow,
                            "label": template["label"],
                            "start_time": start_time_obj,
                            "end_time": end_time_obj,
                            "required_count": template["required"],
                        },
                    )
                    created_count += 1
        
        current_date += timedelta(days=1)
    
    db.commit()
    
    return {
        "company_id": str(req.company_id),
        "studio_id": str(req.studio_id),
        "month_start": req.month_start,
        "month_end": req.month_end,
        "created_count": created_count,
    }


@router.post("/generate")
def generate_schedule(req: ScheduleGenerateRequest, db: Session = Depends(get_db)):
    if req.month_end < req.month_start:
        raise HTTPException(status_code=400, detail="month_end must be >= month_start")

    # Choose generator version
    if req.generator_version == "v2":
        from app.services.schedule_generator_v2 import generate_month_schedule
    else:
        from app.services.schedule_generator import generate_month_schedule

    run_id = generate_month_schedule(
        db=db,
        company_id=req.company_id,
        studio_id=req.studio_id,
        month_start=req.month_start,
        month_end=req.month_end,
        overwrite=req.overwrite,
    )
    return {
        "schedule_run_id": str(run_id),
        "generator_version": req.generator_version,
    }


@router.get("/{run_id}")
def get_schedule(run_id: UUID, db: Session = Depends(get_db)):
    run = db.execute(
        text(
            """
            SELECT schedule_run_id, company_id, studio_id, month_start, month_end, created_at
            FROM schedule_runs
            WHERE schedule_run_id = :run_id
            """
        ),
        {"run_id": str(run_id)},
    ).mappings().first()

    if not run:
        raise HTTPException(status_code=404, detail="Schedule run not found")

    shifts = db.execute(
        text(
            """
            SELECT
              ss.scheduled_shift_id,
              ss.shift_date,
              ss.day_of_week,
              ss.label,
              ss.start_time,
              ss.end_time,
              ss.employee_id,
              e.name AS employee_name
            FROM scheduled_shifts ss
            JOIN employees e ON e.employee_id = ss.employee_id
            WHERE ss.schedule_run_id = :run_id
            ORDER BY ss.shift_date, ss.start_time, e.name
            """
        ),
        {"run_id": str(run_id)},
    ).mappings().all()

    return {"run": dict(run), "shifts": [dict(r) for r in shifts]}


@router.get("/{run_id}/coverage")
def get_schedule_coverage(run_id: UUID, db: Session = Depends(get_db)):
    """
    For each shift_instance in the run's month/studio/company, return:
      required vs scheduled + assigned list
      + audit stats from schedule_audit_shift
    """
    run = db.execute(
        text(
            """
            SELECT schedule_run_id, company_id, studio_id, month_start, month_end
            FROM schedule_runs
            WHERE schedule_run_id = :run_id
            """
        ),
        {"run_id": str(run_id)},
    ).mappings().first()

    if not run:
        raise HTTPException(status_code=404, detail="Schedule run not found")

    rows = db.execute(
        text(
            """
            WITH shift_instances_with_scheduled AS (
              SELECT
                si.shift_date,
                si.label,
                si.start_time,
                si.end_time,
                si.required_count,
                COUNT(ss.scheduled_shift_id) AS scheduled_count,
                (si.required_count - COUNT(ss.scheduled_shift_id)) AS missing_count,
                COALESCE(
                  JSON_AGG(
                    JSON_BUILD_OBJECT(
                      'employee_id', ss.employee_id,
                      'name', e.name
                    )
                    ORDER BY e.name
                  ) FILTER (WHERE ss.employee_id IS NOT NULL),
                  '[]'::json
                ) AS assigned
              FROM shift_instances si
              LEFT JOIN scheduled_shifts ss
                ON ss.schedule_run_id = :run_id
               AND ss.shift_date = si.shift_date
               AND ss.label = si.label
               AND ss.start_time = si.start_time
               AND ss.end_time = si.end_time
              LEFT JOIN employees e
                ON e.employee_id = ss.employee_id
              WHERE si.company_id = :company_id
                AND si.studio_id  = :studio_id
                AND si.shift_date BETWEEN :month_start AND :month_end
              GROUP BY si.shift_date, si.label, si.start_time, si.end_time, si.required_count
            ),
            orphaned_scheduled_shifts AS (
              SELECT
                ss.shift_date,
                ss.label,
                ss.start_time,
                ss.end_time,
                0 AS required_count,
                COUNT(ss.scheduled_shift_id) AS scheduled_count,
                0 AS missing_count,
                COALESCE(
                  JSON_AGG(
                    JSON_BUILD_OBJECT(
                      'employee_id', ss.employee_id,
                      'name', e.name
                    )
                    ORDER BY e.name
                  ),
                  '[]'::json
                ) AS assigned
              FROM scheduled_shifts ss
              JOIN employees e ON e.employee_id = ss.employee_id
              WHERE ss.schedule_run_id = :run_id
                AND ss.shift_date BETWEEN :month_start AND :month_end
                AND NOT EXISTS (
                  SELECT 1 FROM shift_instances si
                  WHERE si.company_id = :company_id
                    AND si.studio_id = :studio_id
                    AND si.shift_date = ss.shift_date
                    AND si.label = ss.label
                    AND si.start_time = ss.start_time
                    AND si.end_time = ss.end_time
                )
              GROUP BY ss.shift_date, ss.label, ss.start_time, ss.end_time
            ),
            combined AS (
              SELECT * FROM shift_instances_with_scheduled
              UNION ALL
              SELECT * FROM orphaned_scheduled_shifts
            )
            SELECT
              c.*,
              COALESCE(a.candidate_count, 0) AS candidate_count,
              COALESCE(a.rejection_summary, '{}'::jsonb) AS rejection_summary
            FROM combined c
            LEFT JOIN schedule_audit_shift a
              ON a.schedule_run_id = :run_id
             AND a.shift_date = c.shift_date
             AND a.label = c.label
             AND a.start_time = c.start_time
             AND a.end_time = c.end_time
            ORDER BY c.shift_date, c.start_time
            """
        ),
        {
            "run_id": str(run_id),
            "company_id": str(run["company_id"]),
            "studio_id": str(run["studio_id"]),
            "month_start": run["month_start"],
            "month_end": run["month_end"],
        },
    ).mappings().all()

    return {"run": dict(run), "coverage": [dict(r) for r in rows]}


@router.get("/{run_id}/insights")
def get_schedule_insights(
    run_id: UUID,
    default_hourly_rate: float | None = Query(None, description="Optional hourly rate for payroll estimate"),
    db: Session = Depends(get_db),
):
    """
    Data insights for a schedule run: per-employee hours, total hours,
    and payroll estimate per week and per month (pay week = Saturday–Sunday).
    """
    run = db.execute(
        text(
            "SELECT schedule_run_id, company_id, studio_id, month_start, month_end FROM schedule_runs WHERE schedule_run_id = :run_id"
        ),
        {"run_id": str(run_id)},
    ).mappings().first()

    if not run:
        raise HTTPException(status_code=404, detail="Schedule run not found")

    # Each row: employee_id, name, hourly_rate, shift_date, hours, pay_week_start
    rows = db.execute(
        text(
            """
            SELECT
              ss.employee_id,
              e.name,
              e.hourly_rate,
              ss.shift_date,
              (EXTRACT(EPOCH FROM (ss.end_time - ss.start_time)) / 3600.0)::numeric(10,2) AS hours,
              (ss.shift_date - (((EXTRACT(DOW FROM ss.shift_date)::int + 1) % 7))::int)::date AS pay_week_start
            FROM scheduled_shifts ss
            JOIN employees e ON e.employee_id = ss.employee_id
            WHERE ss.schedule_run_id = :run_id
            ORDER BY e.name, ss.shift_date
            """
        ),
        {"run_id": str(run_id)},
    ).mappings().all()

    month_start = run["month_start"]
    month_end = run["month_end"]
    default_rate = default_hourly_rate

    # Build per-employee: total hours, by pay week, and hourly_rate
    emp_map: dict = {}
    week_totals: dict = {}   # week_start -> total_hours
    week_payroll: dict = {}  # week_start -> sum of (hours * rate) per employee
    month_total_hours = 0.0
    month_payroll_sum = 0.0

    for r in rows:
        eid = str(r["employee_id"])
        name = str(r["name"])
        emp_rate = float(r["hourly_rate"]) if r.get("hourly_rate") is not None else None
        hrs = float(r["hours"])
        week_start = r["pay_week_start"].isoformat() if hasattr(r["pay_week_start"], "isoformat") else str(r["pay_week_start"])
        rate_used = emp_rate if emp_rate is not None else default_rate
        payroll_this = hrs * rate_used if rate_used is not None else None

        month_total_hours += hrs
        if payroll_this is not None:
            week_payroll[week_start] = week_payroll.get(week_start, 0) + payroll_this
            month_payroll_sum += payroll_this

        if eid not in emp_map:
            emp_map[eid] = {
                "employee_id": eid,
                "name": name,
                "hourly_rate": round(emp_rate, 2) if emp_rate is not None else None,
                "hours_total": 0.0,
                "hours_by_week": {},
            }
        emp_map[eid]["hours_total"] += hrs
        emp_map[eid]["hours_by_week"][week_start] = emp_map[eid]["hours_by_week"].get(week_start, 0) + hrs

        week_totals[week_start] = week_totals.get(week_start, 0) + hrs

    # Format per_employee with payroll using employee rate or default
    per_employee = []
    for e in emp_map.values():
        rate_used = e["hourly_rate"] if e["hourly_rate"] is not None else default_rate
        payroll = round(e["hours_total"] * rate_used, 2) if rate_used is not None else None
        per_employee.append({
            "employee_id": e["employee_id"],
            "name": e["name"],
            "hourly_rate": e["hourly_rate"],
            "hours_total": round(e["hours_total"], 2),
            "payroll": payroll,
            "hours_by_week": [{"week_start": w, "hours": round(h, 2)} for w, h in sorted(e["hours_by_week"].items())],
        })

    per_employee.sort(key=lambda x: x["name"])

    by_week = [
        {
            "week_start": w,
            "total_hours": round(week_totals[w], 2),
            "payroll": round(week_payroll[w], 2) if w in week_payroll else None,
        }
        for w in sorted(week_totals.keys())
    ]

    month_payroll = round(month_payroll_sum, 2) if month_payroll_sum else (round(month_total_hours * default_rate, 2) if default_rate is not None else None)

    return {
        "run": {
            "schedule_run_id": str(run_id),
            "month_start": str(month_start),
            "month_end": str(month_end),
        },
        "per_employee": per_employee,
        "by_week": by_week,
        "month": {
            "total_hours": round(month_total_hours, 2),
            "employee_count": len(emp_map),
            "payroll": month_payroll,
        },
        "default_hourly_rate": default_rate,
    }


@router.get("/{run_id}/audit/shift")
def get_shift_audit(
    run_id: UUID,
    shift_date: date = Query(...),
    label: str = Query(...),
    start_time: str = Query(..., description="HH:MM:SS or HH:MM"),
    end_time: str = Query(..., description="HH:MM:SS or HH:MM"),
    db: Session = Depends(get_db),
):
    """
    Returns per-employee eligibility + reasons/details for one shift.
    (We include start/end because label alone is not guaranteed unique.)
    """
    exists = db.execute(
        text("SELECT 1 FROM schedule_runs WHERE schedule_run_id = :run_id"),
        {"run_id": str(run_id)},
    ).first()
    if not exists:
        raise HTTPException(status_code=404, detail="Schedule run not found")

    # IMPORTANT: use CAST(:start_time AS time) (NOT :start_time::time) with SQLAlchemy text() binds
    rows = db.execute(
        text(
            """
            SELECT
              sac.employee_id,
              e.name,
              sac.eligible,
              sac.rejection_reason,
              sac.details
            FROM schedule_audit_candidate sac
            JOIN employees e ON e.employee_id = sac.employee_id
            WHERE sac.schedule_run_id = :run_id
              AND sac.shift_date = :shift_date
              AND sac.label = :label
              AND sac.start_time = CAST(:start_time AS time)
              AND sac.end_time = CAST(:end_time AS time)
            ORDER BY sac.eligible DESC, e.name
            """
        ),
        {
            "run_id": str(run_id),
            "shift_date": shift_date,
            "label": label,
            "start_time": start_time,
            "end_time": end_time,
        },
    ).mappings().all()

    return {
        "run_id": str(run_id),
        "shift_date": str(shift_date),
        "label": label,
        "start_time": start_time,
        "end_time": end_time,
        "candidates": [dict(r) for r in rows],
    }


@router.get("/{run_id}/employee/{employee_id}")
def get_schedule_for_employee(run_id: UUID, employee_id: UUID, db: Session = Depends(get_db)):
    exists = db.execute(
        text("SELECT 1 FROM schedule_runs WHERE schedule_run_id = :run_id"),
        {"run_id": str(run_id)},
    ).first()
    if not exists:
        raise HTTPException(status_code=404, detail="Schedule run not found")

    rows = db.execute(
        text(
            """
            SELECT
              ss.shift_date,
              ss.day_of_week,
              ss.label,
              ss.start_time,
              ss.end_time
            FROM scheduled_shifts ss
            WHERE ss.schedule_run_id = :run_id
              AND ss.employee_id = :employee_id
            ORDER BY ss.shift_date, ss.start_time
            """
        ),
        {"run_id": str(run_id), "employee_id": str(employee_id)},
    ).mappings().all()

    return {
        "schedule_run_id": str(run_id),
        "employee_id": str(employee_id),
        "shifts": [dict(r) for r in rows],
    }


@router.get("/company/{company_id}/runs")
def list_schedule_runs(company_id: UUID, db: Session = Depends(get_db)):
    """List all schedule runs for a company, ordered by most recent first."""
    runs = db.execute(
        text(
            """
            SELECT 
              sr.schedule_run_id,
              sr.company_id,
              sr.studio_id,
              s.name AS studio_name,
              sr.month_start,
              sr.month_end,
              sr.created_at,
              COUNT(ss.scheduled_shift_id) AS shift_count
            FROM schedule_runs sr
            LEFT JOIN studios s ON s.studio_id = sr.studio_id
            LEFT JOIN scheduled_shifts ss ON ss.schedule_run_id = sr.schedule_run_id
            WHERE sr.company_id = :company_id
            GROUP BY sr.schedule_run_id, sr.company_id, sr.studio_id, s.name, sr.month_start, sr.month_end, sr.created_at
            ORDER BY sr.created_at DESC
            """
        ),
        {"company_id": str(company_id)},
    ).mappings().all()

    return {"runs": [dict(r) for r in runs]}


@router.put("/shifts/{shift_id}")
def update_shift(shift_id: UUID, req: ShiftUpdateRequest, db: Session = Depends(get_db)):
    """Update the employee assigned to a scheduled shift."""
    shift = db.get(ScheduledShift, shift_id)
    if not shift:
        raise HTTPException(status_code=404, detail="Scheduled shift not found")

    # Verify employee exists and is active
    employee = db.execute(
        text("SELECT employee_id, is_active FROM employees WHERE employee_id = :employee_id"),
        {"employee_id": str(req.employee_id)},
    ).mappings().first()

    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    if not employee["is_active"]:
        raise HTTPException(status_code=400, detail="Employee is not active")

    shift.employee_id = req.employee_id
    db.commit()
    db.refresh(shift)

    return {"scheduled_shift_id": str(shift.scheduled_shift_id), "employee_id": str(shift.employee_id)}


@router.delete("/shifts/{shift_id}")
def delete_shift(shift_id: UUID, db: Session = Depends(get_db)):
    """Delete a scheduled shift."""
    shift = db.get(ScheduledShift, shift_id)
    if not shift:
        raise HTTPException(status_code=404, detail="Scheduled shift not found")

    shift_id_str = str(shift.scheduled_shift_id)
    db.delete(shift)
    db.commit()

    return {"deleted": True, "scheduled_shift_id": shift_id_str}


@router.post("/shifts")
def create_shift(req: ShiftCreateRequest, db: Session = Depends(get_db)):
    """Create a new scheduled shift."""
    # Verify schedule run exists
    run = db.execute(
        text("SELECT schedule_run_id, company_id, studio_id FROM schedule_runs WHERE schedule_run_id = :run_id"),
        {"run_id": str(req.schedule_run_id)},
    ).mappings().first()

    if not run:
        raise HTTPException(status_code=404, detail="Schedule run not found")

    # Verify employee exists and is active
    employee = db.execute(
        text("SELECT employee_id, is_active, company_id FROM employees WHERE employee_id = :employee_id"),
        {"employee_id": str(req.employee_id)},
    ).mappings().first()

    if not employee:
        raise HTTPException(status_code=404, detail="Employee not found")
    if not employee["is_active"]:
        raise HTTPException(status_code=400, detail="Employee is not active")
    if str(employee["company_id"]) != str(run["company_id"]):
        raise HTTPException(status_code=400, detail="Employee does not belong to this company")

    # Parse times - accept both HH:MM and HH:MM:SS formats
    def parse_time(time_str: str) -> time:
        """Parse time string, accepting both HH:MM and HH:MM:SS formats."""
        time_str = time_str.strip()
        if len(time_str) == 5 and ':' in time_str:
            # HH:MM format, append :00
            time_str = time_str + ':00'
        try:
            return time.fromisoformat(time_str)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid time format: {time_str}. Use HH:MM or HH:MM:SS")
    
    try:
        start_time_obj = parse_time(req.start_time)
        end_time_obj = parse_time(req.end_time)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid time format: {str(e)}")

    # Get day of week
    # Python weekday: Mon=0, Tue=1, ..., Sat=5, Sun=6
    # Database convention: Sun=0, Mon=1, ..., Sat=6
    python_dow = req.shift_date.weekday()
    day_of_week = (python_dow + 1) % 7  # Convert to DB convention

    # Create shift
    shift = ScheduledShift(
        schedule_run_id=req.schedule_run_id,
        employee_id=req.employee_id,
        studio_id=run["studio_id"],
        shift_date=req.shift_date,
        day_of_week=day_of_week,
        label=req.label,
        start_time=start_time_obj,
        end_time=end_time_obj,
    )

    db.add(shift)
    db.commit()
    db.refresh(shift)

    return {
        "scheduled_shift_id": str(shift.scheduled_shift_id),
        "schedule_run_id": str(shift.schedule_run_id),
        "employee_id": str(shift.employee_id),
    }
