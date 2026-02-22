import json
import os
from datetime import date, time, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from openai import OpenAI
from pydantic import BaseModel
from sqlalchemy import bindparam, text, delete, select
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


class AskRequest(BaseModel):
    question: str


class AgentActRequest(BaseModel):
    question: str


class ProposedReassignAction(BaseModel):
    type: str = "reassign_shift"
    scheduled_shift_id: str
    new_employee_id: str
    summary: str


class ProposedUpdateShiftTimesAction(BaseModel):
    type: str = "update_shift_times"
    scheduled_shift_id: str
    new_start_time: str
    new_end_time: str
    new_label: str | None = None
    summary: str


class ProposedAddShiftAction(BaseModel):
    type: str = "add_shift"
    employee_id: str
    shift_date: str  # YYYY-MM-DD
    start_time: str
    end_time: str
    label: str
    summary: str


class AgentApplyRequest(BaseModel):
    actions: list[ProposedReassignAction | ProposedUpdateShiftTimesAction | ProposedAddShiftAction]


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
    overtime_threshold: float = Query(40, description="Hours per pay week that triggers overtime alert"),
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

    # Each row: employee_id, name, hourly_rate, shift_date, label, start_time, end_time, hours, pay_week_start
    rows = db.execute(
        text(
            """
            SELECT
              ss.employee_id,
              e.name,
              e.hourly_rate,
              ss.shift_date,
              ss.label,
              ss.start_time,
              ss.end_time,
              (EXTRACT(EPOCH FROM (ss.end_time - ss.start_time)) / 3600.0)::numeric(10,2) AS hours,
              (ss.shift_date - (((EXTRACT(DOW FROM ss.shift_date)::int + 1) % 7))::int)::date AS pay_week_start
            FROM scheduled_shifts ss
            JOIN employees e ON e.employee_id = ss.employee_id
            WHERE ss.schedule_run_id = :run_id
            ORDER BY ss.employee_id, ss.shift_date, ss.start_time
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
        if "shifts" not in emp_map[eid]:
            emp_map[eid]["shifts"] = []
        emp_map[eid]["shifts"].append({
            "shift_date": r["shift_date"],
            "label": r.get("label") or "",
            "start_time": r.get("start_time"),
            "end_time": r.get("end_time"),
        })

        week_totals[week_start] = week_totals.get(week_start, 0) + hrs

    # Helper: shift type for clopen detection (open/close/mid)
    def _shift_type(label: str, start_t, end_t) -> str:
        if not label:
            return "mid"
        lu = str(label).upper()
        if "AM" in lu or label.startswith("AM_"):
            return "open"
        if "PM" in lu or label.startswith("PM_"):
            return "close"
        if start_t and end_t:
            start_m = start_t.hour * 60 + getattr(start_t, "minute", 0) if hasattr(start_t, "hour") else 0
            end_m = end_t.hour * 60 + getattr(end_t, "minute", 0) if hasattr(end_t, "hour") else 0
            if start_m < 360:
                return "open"
            if end_m >= 1200:
                return "close"
        return "mid"

    # Format per_employee (drop "shifts" from output, used only for clopen) with payroll using employee rate or default
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

    # Overtime alerts: employee-weeks where hours >= threshold
    overtime_alerts = []
    for e in emp_map.values():
        for w, h in e["hours_by_week"].items():
            if h >= overtime_threshold:
                overtime_alerts.append({
                    "employee_id": e["employee_id"],
                    "name": e["name"],
                    "week_start": w,
                    "hours": round(h, 2),
                    "threshold": overtime_threshold,
                })
    overtime_alerts.sort(key=lambda x: (x["week_start"], x["name"]))

    # Prior month comparison: find most recent run for same company+studio with earlier month
    prior_month: dict | None = None
    prior_run = db.execute(
        text(
            """
            SELECT schedule_run_id, month_start, month_end
            FROM schedule_runs
            WHERE company_id = :company_id AND studio_id = :studio_id
              AND schedule_run_id != :run_id
              AND month_end < :current_month_start
            ORDER BY month_end DESC
            LIMIT 1
            """
        ),
        {
            "company_id": str(run["company_id"]),
            "studio_id": str(run["studio_id"]),
            "run_id": str(run_id),
            "current_month_start": month_start,
        },
    ).mappings().first()

    if prior_run:
        prior_rows = db.execute(
            text(
                """
                SELECT
                  ss.employee_id,
                  e.hourly_rate,
                  (EXTRACT(EPOCH FROM (ss.end_time - ss.start_time)) / 3600.0)::numeric(10,2) AS hours
                FROM scheduled_shifts ss
                JOIN employees e ON e.employee_id = ss.employee_id
                WHERE ss.schedule_run_id = :prior_run_id
                """
            ),
            {"prior_run_id": str(prior_run["schedule_run_id"])},
        ).mappings().all()
        prior_hours = sum(float(r["hours"]) for r in prior_rows)
        prior_payroll = 0.0
        for r in prior_rows:
            rate = float(r["hourly_rate"]) if r.get("hourly_rate") is not None else default_rate
            if rate is not None:
                prior_payroll += float(r["hours"]) * rate
        prior_month = {
            "month_start": str(prior_run["month_start"]),
            "month_end": str(prior_run["month_end"]),
            "total_hours": round(prior_hours, 2),
            "payroll": round(prior_payroll, 2) if prior_payroll else None,
        }

    comparison = None
    if prior_month:
        hrs_curr = month_total_hours
        hrs_prior = prior_month["total_hours"]
        pct = ((hrs_curr - hrs_prior) / hrs_prior * 100) if hrs_prior else None
        payroll_curr = month_payroll_sum if month_payroll_sum else (month_total_hours * default_rate if default_rate else None)
        payroll_prior = prior_month.get("payroll")
        payroll_pct = None
        if payroll_curr is not None and payroll_prior is not None and payroll_prior:
            payroll_pct = round((payroll_curr - payroll_prior) / payroll_prior * 100, 1)
        comparison = {
            "hours_change_pct": round(pct, 1) if pct is not None else None,
            "payroll_change_pct": payroll_pct,
        }

    # FT/PT target summary, clopen count, fairness, PTO acceptance
    emp_ids_list = list(emp_map.keys())
    ft_under_target: list = []
    pt_over_ideal: list = []
    clopen_count = 0
    clopens: list = []

    rules_rows = db.execute(
        text(
            """
            SELECT employee_id, rule_type, value_json
            FROM employee_rules
            WHERE employee_id IN :emp_ids
              AND rule_type IN ('EMPLOYMENT_TYPE', 'IDEAL_HOURS_WEEKLY', 'WEEKEND_PREFERENCE')
              AND (effective_end IS NULL OR effective_end >= :month_end)
              AND (effective_start IS NULL OR effective_start <= :month_start)
            """
        ).bindparams(bindparam("emp_ids", expanding=True)),
        {"emp_ids": emp_ids_list, "month_start": month_start, "month_end": month_end},
    ).mappings().all() if emp_ids_list else []

    rules_by_emp: dict = {}
    for rr in rules_rows:
        eid = str(rr["employee_id"])
        rules_by_emp.setdefault(eid, {})
        v = rr["value_json"] or {}
        if rr["rule_type"] == "EMPLOYMENT_TYPE":
            rules_by_emp[eid]["employment_type"] = v.get("type")
        elif rr["rule_type"] == "IDEAL_HOURS_WEEKLY":
            h = v.get("hours")
            rules_by_emp[eid]["ideal_hours"] = float(h) if h is not None else None
        elif rr["rule_type"] == "WEEKEND_PREFERENCE":
            rules_by_emp[eid]["weekend_pref"] = v.get("preference")

    for e in emp_map.values():
        eid = e["employee_id"]
        r = rules_by_emp.get(eid, {})
        emp_type = r.get("employment_type")
        ideal = r.get("ideal_hours")

        if emp_type == "full_time":
            for w, h in e["hours_by_week"].items():
                if h < 30:
                    ft_under_target.append({
                        "employee_id": eid,
                        "name": e["name"],
                        "week_start": w,
                        "hours": round(h, 2),
                        "target": 30,
                    })
                    break
        elif emp_type == "part_time" and ideal is not None:
            n_weeks = len(e["hours_by_week"]) or 1
            avg_weekly = e["hours_total"] / n_weeks
            if avg_weekly > ideal:
                pt_over_ideal.append({
                    "employee_id": eid,
                    "name": e["name"],
                    "hours_total": round(e["hours_total"], 2),
                    "ideal_per_week": ideal,
                    "avg_weekly": round(avg_weekly, 2),
                })

        shifts = e.get("shifts", [])
        shifts.sort(key=lambda x: (x["shift_date"], str(x.get("start_time") or "")))
        prev_close_date = None
        for s in shifts:
            st = _shift_type(s.get("label", ""), s.get("start_time"), s.get("end_time"))
            curr_d = s["shift_date"]
            curr_ord = curr_d.toordinal() if hasattr(curr_d, "toordinal") else 0
            prev_ord = prev_close_date.toordinal() if prev_close_date and hasattr(prev_close_date, "toordinal") else 0
            if st == "open" and prev_close_date is not None and (curr_ord - prev_ord) == 1:
                clopen_count += 1
                clopens.append({"employee_id": eid, "name": e["name"], "date": str(curr_d)[:10]})
            if st == "close":
                prev_close_date = curr_d
            else:
                prev_close_date = None

    # Fairness: weekend preference match rate
    weekend_match_total = 0
    weekend_match_count = 0
    fairness_by_employee: list = []
    for e in emp_map.values():
        pref = rules_by_emp.get(e["employee_id"], {}).get("weekend_pref")
        if pref not in ("saturday", "sunday"):
            continue
        want_sat = pref == "saturday"
        shifts = e.get("shifts", [])
        emp_match = 0
        emp_total = 0
        for s in shifts:
            d = s["shift_date"]
            dow = (d.weekday() + 1) % 7 if hasattr(d, "weekday") else 0  # Sun=0, Sat=6
            is_sat = dow == 6
            is_sun = dow == 0
            if is_sat or is_sun:
                emp_total += 1
                if (want_sat and is_sat) or (not want_sat and is_sun):
                    emp_match += 1
        if emp_total > 0:
            weekend_match_total += emp_total
            weekend_match_count += emp_match
            fairness_by_employee.append({
                "employee_id": e["employee_id"],
                "name": e["name"],
                "preference": pref,
                "matched": emp_match,
                "total_weekend_shifts": emp_total,
            })
    fairness = {
        "weekend_match_rate": round(weekend_match_count / weekend_match_total, 2) if weekend_match_total else None,
        "weekend_matched": weekend_match_count,
        "weekend_total": weekend_match_total,
        "by_employee": fairness_by_employee,
    } if weekend_match_total else None

    # PTO acceptance: requests where employee was NOT scheduled during the requested dates
    pto_requests = db.execute(
        text(
            """
            SELECT pto_id, employee_id, start_date, end_date FROM employee_pto
            WHERE employee_id IN :emp_ids
              AND end_date >= :month_start AND start_date <= :month_end
            """
        ).bindparams(bindparam("emp_ids", expanding=True)),
        {"emp_ids": emp_ids_list, "month_start": month_start, "month_end": month_end},
    ).mappings().all() if emp_ids_list else []

    to_requests = db.execute(
        text(
            """
            SELECT time_off_id, employee_id, start_date, end_date FROM employee_time_off
            WHERE employee_id IN :emp_ids
              AND end_date >= :month_start AND start_date <= :month_end
            """
        ).bindparams(bindparam("emp_ids", expanding=True)),
        {"emp_ids": emp_ids_list, "month_start": month_start, "month_end": month_end},
    ).mappings().all() if emp_ids_list else []

    scheduled_dates_by_emp: dict = {}
    for r in rows:
        eid = str(r["employee_id"])
        d = r["shift_date"]
        dk = d.isoformat()[:10] if hasattr(d, "isoformat") else str(d)[:10]
        scheduled_dates_by_emp.setdefault(eid, set()).add(dk)

    pto_accepted = 0
    pto_denied = 0
    for req in pto_requests + to_requests:
        eid = str(req["employee_id"])
        start_d = req["start_date"]
        end_d = req["end_date"]
        sched = scheduled_dates_by_emp.get(eid, set())
        overlap = False
        cur = start_d
        while cur <= end_d:
            dk = cur.isoformat()[:10] if hasattr(cur, "isoformat") else str(cur)[:10]
            if dk in sched:
                overlap = True
                break
            cur = cur + timedelta(days=1)
        if overlap:
            pto_denied += 1
        else:
            pto_accepted += 1
    pto_total = pto_accepted + pto_denied
    pto_acceptance = {
        "total_requests": pto_total,
        "accepted": pto_accepted,
        "denied": pto_denied,
        "acceptance_rate_pct": round(100 * pto_accepted / pto_total, 1) if pto_total else None,
    } if pto_total else None

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
        "overtime_alerts": overtime_alerts,
        "overtime_threshold": overtime_threshold,
        "prior_month": prior_month,
        "comparison": comparison,
        "ft_under_target": ft_under_target,
        "pt_over_ideal": pt_over_ideal,
        "clopen_count": clopen_count,
        "clopens": clopens,
        "fairness": fairness,
        "pto_acceptance": pto_acceptance,
        "default_hourly_rate": default_rate,
    }


@router.post("/{run_id}/ask")
def ask_schedule_agent(
    run_id: UUID,
    body: AskRequest,
    db: Session = Depends(get_db),
):
    """
    Ask the AI scheduler agent a question about this schedule run.
    Uses the run's schedule and insights data as context. Requires OPENAI_API_KEY.
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key or not api_key.strip():
        raise HTTPException(
            status_code=503,
            detail="Scheduler agent is not configured (OPENAI_API_KEY missing). Set it in your environment to enable.",
        )

    run = db.execute(
        text(
            "SELECT schedule_run_id, company_id, studio_id, month_start, month_end FROM schedule_runs WHERE schedule_run_id = :run_id"
        ),
        {"run_id": str(run_id)},
    ).mappings().first()
    if not run:
        raise HTTPException(status_code=404, detail="Schedule run not found")

    month_start = run["month_start"]
    month_end = run["month_end"]

    shifts_rows = db.execute(
        text(
            """
            SELECT ss.employee_id, ss.shift_date, ss.label, ss.start_time, ss.end_time, e.name AS employee_name,
                   (EXTRACT(EPOCH FROM (ss.end_time - ss.start_time)) / 3600.0)::numeric(10,2) AS hours
            FROM scheduled_shifts ss
            JOIN employees e ON e.employee_id = ss.employee_id
            WHERE ss.schedule_run_id = :run_id
            ORDER BY ss.employee_id, ss.shift_date, ss.start_time
            """
        ),
        {"run_id": str(run_id)},
    ).mappings().all()

    def _shift_type(label: str, start_t, end_t) -> str:
        if not label:
            return "mid"
        lu = str(label).upper()
        if "AM" in lu or label.startswith("AM_"):
            return "open"
        if "PM" in lu or label.startswith("PM_"):
            return "close"
        if start_t and end_t:
            start_m = start_t.hour * 60 + getattr(start_t, "minute", 0) if hasattr(start_t, "hour") else 0
            end_m = end_t.hour * 60 + getattr(end_t, "minute", 0) if hasattr(end_t, "hour") else 0
            if start_m < 360:
                return "open"
            if end_m >= 1200:
                return "close"
        return "mid"

    hours_by_emp: dict = {}
    hours_by_emp_week: dict = {}
    shifts_lines: list = []
    emp_ids_set: set = set()
    scheduled_dates_by_emp_id: dict = {}

    for r in shifts_rows:
        eid = str(r["employee_id"])
        name = str(r["employee_name"])
        d = r["shift_date"]
        date_str = d.isoformat()[:10] if hasattr(d, "isoformat") else str(d)[:10]
        emp_ids_set.add(eid)
        scheduled_dates_by_emp_id.setdefault(eid, set()).add(date_str)
        label = r.get("label") or ""
        hrs = float(r["hours"]) if r.get("hours") is not None else 0
        hours_by_emp[name] = hours_by_emp.get(name, 0) + hrs
        week_start = (d - timedelta(days=(d.weekday() - 5) % 7)) if hasattr(d, "weekday") else d
        week_key = week_start.isoformat()[:10] if hasattr(week_start, "isoformat") else str(week_start)[:10]
        hours_by_emp_week[(name, week_key)] = hours_by_emp_week.get((name, week_key), 0) + hrs
        st = r.get("start_time")
        et = r.get("end_time")
        st_str = str(st)[:5] if st else ""
        et_str = str(et)[:5] if et else ""
        shifts_lines.append(f"  {date_str} {label} {st_str}-{et_str} {name} {hrs}h")

    total_hours = sum(hours_by_emp.values())
    emp_summary = "\n".join(f"  {name}: {round(h, 2)}h" for name, h in sorted(hours_by_emp.items()))

    context = f"""Schedule run: {month_start} to {month_end}.
Total hours: {round(total_hours, 2)}. Employees: {len(hours_by_emp)}.

Per-employee total hours:
{emp_summary}

Scheduled shifts (date, label, time, employee, hours):
{chr(10).join(shifts_lines[:200])}
"""
    if len(shifts_lines) > 200:
        context += f"\n... and {len(shifts_lines) - 200} more shifts."

    emp_ids_list = list(emp_ids_set)
    name_by_id = {str(r["employee_id"]): str(r["employee_name"]) for r in shifts_rows}

    rules_rows = db.execute(
        text(
            """
            SELECT employee_id, rule_type, value_json
            FROM employee_rules
            WHERE employee_id IN :emp_ids
              AND (effective_end IS NULL OR effective_end >= :month_end)
              AND (effective_start IS NULL OR effective_start <= :month_start)
              AND rule_type IN ('EMPLOYMENT_TYPE', 'IDEAL_HOURS_WEEKLY', 'WEEKEND_PREFERENCE')
            """
        ).bindparams(bindparam("emp_ids", expanding=True)),
        {"emp_ids": emp_ids_list, "month_start": month_start, "month_end": month_end},
    ).mappings().all() if emp_ids_list else []

    rules_by_emp = {}
    for rr in rules_rows:
        eid = str(rr["employee_id"])
        rules_by_emp.setdefault(eid, {})
        v = rr["value_json"] or {}
        if rr["rule_type"] == "EMPLOYMENT_TYPE":
            rules_by_emp[eid]["employment_type"] = v.get("type")
        elif rr["rule_type"] == "IDEAL_HOURS_WEEKLY":
            h = v.get("hours")
            rules_by_emp[eid]["ideal_hours"] = float(h) if h is not None else None
        elif rr["rule_type"] == "WEEKEND_PREFERENCE":
            rules_by_emp[eid]["weekend_pref"] = v.get("preference")

    overtime_threshold = 40
    overtime_lines = [f"  {name} week {wk}: {round(h, 2)}h (>= {overtime_threshold})" for (name, wk), h in hours_by_emp_week.items() if h >= overtime_threshold]

    ft_under_lines = []
    pt_over_lines = []
    for eid in emp_ids_list:
        name = name_by_id.get(eid, eid)
        r = rules_by_emp.get(eid, {})
        if r.get("employment_type") == "full_time":
            for (n, wk), h in hours_by_emp_week.items():
                if n == name and h < 30:
                    ft_under_lines.append(f"  {name} week {wk}: {round(h, 2)}h (FT target 30)")
                    break
        elif r.get("employment_type") == "part_time" and r.get("ideal_hours") is not None:
            ideal = r["ideal_hours"]
            n_weeks = len([w for (n, w) in hours_by_emp_week if n == name]) or 1
            total = hours_by_emp.get(name, 0)
            if total / n_weeks > ideal:
                pt_over_lines.append(f"  {name}: {round(total, 2)}h total, {round(total / n_weeks, 2)}h/week (ideal {ideal})")

    shifts_by_emp = {}
    for r in shifts_rows:
        eid = str(r["employee_id"])
        shifts_by_emp.setdefault(eid, []).append(r)
    clopen_lines = []
    for eid, emp_shifts in shifts_by_emp.items():
        emp_shifts.sort(key=lambda x: (x["shift_date"], str(x.get("start_time") or "")))
        prev_close_date = None
        for s in emp_shifts:
            st = _shift_type(s.get("label", ""), s.get("start_time"), s.get("end_time"))
            curr_d = s["shift_date"]
            curr_ord = curr_d.toordinal() if hasattr(curr_d, "toordinal") else 0
            prev_ord = prev_close_date.toordinal() if prev_close_date and hasattr(prev_close_date, "toordinal") else 0
            if st == "open" and prev_close_date is not None and (curr_ord - prev_ord) == 1:
                clopen_lines.append(f"  {name_by_id.get(eid, eid)} on {str(curr_d)[:10]}")
            prev_close_date = curr_d if st == "close" else None

    weekend_match_total = 0
    weekend_match_count = 0
    fairness_lines = []
    for eid in emp_ids_list:
        name = name_by_id.get(eid, eid)
        pref = rules_by_emp.get(eid, {}).get("weekend_pref")
        if pref not in ("saturday", "sunday"):
            continue
        want_sat = pref == "saturday"
        total_wknd = matched = 0
        for s in shifts_by_emp.get(eid, []):
            d = s["shift_date"]
            dow = (d.weekday() + 1) % 7 if hasattr(d, "weekday") else 0
            if dow == 6 or dow == 0:
                total_wknd += 1
                if (want_sat and dow == 6) or (not want_sat and dow == 0):
                    matched += 1
        if total_wknd > 0:
            weekend_match_total += total_wknd
            weekend_match_count += matched
            fairness_lines.append(f"  {name}: {matched}/{total_wknd} ({pref})")

    pto_requests = db.execute(
        text("SELECT employee_id, start_date, end_date FROM employee_pto WHERE employee_id IN :emp_ids AND end_date >= :month_start AND start_date <= :month_end").bindparams(bindparam("emp_ids", expanding=True)),
        {"emp_ids": emp_ids_list, "month_start": month_start, "month_end": month_end},
    ).mappings().all() if emp_ids_list else []
    to_requests = db.execute(
        text("SELECT employee_id, start_date, end_date FROM employee_time_off WHERE employee_id IN :emp_ids AND end_date >= :month_start AND start_date <= :month_end").bindparams(bindparam("emp_ids", expanding=True)),
        {"emp_ids": emp_ids_list, "month_start": month_start, "month_end": month_end},
    ).mappings().all() if emp_ids_list else []
    pto_accepted = pto_denied = 0
    for req in pto_requests + to_requests:
        eid = str(req["employee_id"])
        start_d, end_d = req["start_date"], req["end_date"]
        sched = scheduled_dates_by_emp_id.get(eid, set())
        cur = start_d
        overlap = False
        while cur <= end_d:
            dk = cur.isoformat()[:10] if hasattr(cur, "isoformat") else str(cur)[:10]
            if dk in sched:
                overlap = True
                break
            cur = cur + timedelta(days=1)
        if overlap:
            pto_denied += 1
        else:
            pto_accepted += 1
    pto_total = pto_accepted + pto_denied
    pto_rate = round(100 * pto_accepted / pto_total, 1) if pto_total else None

    insights_parts = []
    if overtime_lines:
        insights_parts.append("Overtime (>= 40h in a pay week):\n" + "\n".join(overtime_lines))
    if ft_under_lines:
        insights_parts.append("FT under 30h/week:\n" + "\n".join(ft_under_lines))
    if pt_over_lines:
        insights_parts.append("PT over ideal hours:\n" + "\n".join(pt_over_lines))
    if clopen_lines:
        insights_parts.append("Clopens (close then next-day open):\n" + "\n".join(clopen_lines))
    if fairness_lines:
        rate = round(100 * weekend_match_count / weekend_match_total, 1) if weekend_match_total else 0
        insights_parts.append(f"Weekend preference match {rate}%:\n" + "\n".join(fairness_lines))
    if pto_total:
        insights_parts.append(f"PTO/time-off: {pto_accepted} accepted, {pto_denied} denied ({pto_rate}% acceptance)")

    if insights_parts:
        context += "\n\n--- Insights ---\n" + "\n\n".join(insights_parts)

    context += "\n\n--- Rules ---\nFT target >= 30h per pay week; PT have ideal hours; one weekend day per pay week; match weekend preference when possible; avoid clopens (close then open next day); honor PTO/time-off."

    system_prompt = """You are a scheduler assistant for a fitness studio. Use only the context provided. Answer questions about the schedule and, when asked, suggest concrete improvements (rebalance hours, fix overtime, reduce clopens, improve weekend fairness, honor PTO). Be concise and accurate. If something is not in the context, say so. Do not make up names, dates, or numbers."""

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {body.question}"},
            ],
            max_tokens=1024,
        )
        answer = (response.choices[0].message.content or "").strip()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Agent error: {str(e)}")

    return {"answer": answer}


@router.post("/{run_id}/agent/act")
def agent_act(
    run_id: UUID,
    body: AgentActRequest,
    db: Session = Depends(get_db),
):
    """
    Ask the agent; if the user requests a shift reassignment, the agent can use
    the reassign_shift tool. Returns proposed_actions (no DB write) until the user applies.
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key or not api_key.strip():
        raise HTTPException(
            status_code=503,
            detail="Scheduler agent is not configured (OPENAI_API_KEY missing).",
        )

    run = db.execute(
        text(
            "SELECT schedule_run_id, company_id, studio_id, month_start, month_end FROM schedule_runs WHERE schedule_run_id = :run_id"
        ),
        {"run_id": str(run_id)},
    ).mappings().first()
    if not run:
        raise HTTPException(status_code=404, detail="Schedule run not found")

    month_start = run["month_start"]
    month_end = run["month_end"]
    company_id = run["company_id"]

    # Shifts with IDs for tool use
    shifts_rows = db.execute(
        text(
            """
            SELECT ss.scheduled_shift_id, ss.employee_id, ss.shift_date, ss.label, ss.start_time, ss.end_time, e.name AS employee_name
            FROM scheduled_shifts ss
            JOIN employees e ON e.employee_id = ss.employee_id
            WHERE ss.schedule_run_id = :run_id
            ORDER BY ss.shift_date, ss.start_time
            """
        ),
        {"run_id": str(run_id)},
    ).mappings().all()

    # Company employees for name resolution
    company_employees = db.execute(
        text(
            "SELECT employee_id, name FROM employees WHERE company_id = :company_id AND is_active = true ORDER BY name"
        ),
        {"company_id": str(company_id)},
    ).mappings().all()

    name_to_id = {str(r["name"]).strip().lower(): str(r["employee_id"]) for r in company_employees}
    id_to_name = {str(r["employee_id"]): str(r["name"]) for r in company_employees}

    shift_lines = []
    for r in shifts_rows:
        d = r["shift_date"]
        date_str = d.isoformat()[:10] if hasattr(d, "isoformat") else str(d)[:10]
        st = r.get("start_time")
        et = r.get("end_time")
        st_str = str(st)[:5] if st else ""
        et_str = str(et)[:5] if et else ""
        label = r.get("label") or ""
        name = r.get("employee_name") or ""
        sid = r["scheduled_shift_id"]
        shift_lines.append(f"  {sid}: {date_str} {label} {st_str}-{et_str} -> {name}")

    employees_list = ", ".join(id_to_name.values()) if id_to_name else "(none)"

    context = f"""Schedule run: {month_start} to {month_end}.

Shifts (scheduled_shift_id: date label start-end -> current employee):
{chr(10).join(shift_lines[:300])}
"""
    if len(shift_lines) > 300:
        context += f"\n... and {len(shift_lines) - 300} more shifts."

    context += f"\n\nEmployees in this company (use exact name for reassignment): {employees_list}"

    tools = [
        {
            "type": "function",
            "function": {
                "name": "reassign_shift",
                "description": "Reassign a scheduled shift to a different employee. Use when the user asks to change who works a shift (e.g. put X on Tuesday 5:30a, move Y off Wednesday, assign Z to that shift).",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "scheduled_shift_id": {"type": "string", "description": "UUID of the shift from the context list"},
                        "new_employee_name": {"type": "string", "description": "Exact full name of the employee to assign (must be from the company employees list)"},
                    },
                    "required": ["scheduled_shift_id", "new_employee_name"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "update_shift_times",
                "description": "Change the start and/or end time of ONE existing scheduled shift. Use only for a single shift ID when the user refers to one specific shift.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "scheduled_shift_id": {"type": "string", "description": "UUID of the shift from the context list"},
                        "expected_employee_name": {"type": "string", "description": "Exact name of the employee whose shift this is (from context). Required when the user named a specific person."},
                        "day_of_week": {"type": "string", "description": "When the user asked for a specific day, pass exactly one of: monday, tuesday, wednesday, thursday, friday, saturday, sunday. Backend will only accept shifts on that weekday."},
                        "new_start_time": {"type": "string", "description": "New start time in 24h format HH:MM or HH:MM:SS (e.g. 06:30 for 6:30am)"},
                        "new_end_time": {"type": "string", "description": "New end time in 24h format HH:MM or HH:MM:SS"},
                        "new_label": {"type": "string", "description": "Optional new label for the shift (e.g. 6:30a-2:30p)"},
                    },
                    "required": ["scheduled_shift_id", "expected_employee_name", "new_start_time", "new_end_time"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "update_shift_times_for_day",
                "description": "Change start/end times for ALL of an employee's shifts on a given weekday for the month (e.g. every Tuesday). Use when the user says 'every Tuesday', 'all Tuesdays', 'Tuesdays for the month', 'every Monday', etc. One call updates every matching shift.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "expected_employee_name": {"type": "string", "description": "Exact full name of the employee (from context)."},
                        "day_of_week": {"type": "string", "description": "One of: monday, tuesday, wednesday, thursday, friday, saturday, sunday"},
                        "new_start_time": {"type": "string", "description": "New start time 24h HH:MM (e.g. 06:30 for 6:30am)"},
                        "new_end_time": {"type": "string", "description": "New end time 24h HH:MM"},
                        "new_label": {"type": "string", "description": "Optional label (e.g. 6:30a-1:30p)"},
                    },
                    "required": ["expected_employee_name", "day_of_week", "new_start_time", "new_end_time"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "add_shifts",
                "description": "Add new shifts for an employee on specified days. Use when the user asks to add someone to the schedule on days they are not yet on (e.g. add Jaylen Monday Tuesday Wednesday Friday 8am-4pm). Days are day names; times in 24h HH:MM. Creates one shift per day in the schedule month.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "employee_name": {"type": "string", "description": "Exact full name of the employee (from company employees list)"},
                        "days": {"type": "array", "items": {"type": "string"}, "description": "Day names: monday, tuesday, wednesday, thursday, friday, saturday, sunday (can repeat for multiple weeks)"},
                        "start_time": {"type": "string", "description": "Start time 24h HH:MM (e.g. 08:00 for 8am)"},
                        "end_time": {"type": "string", "description": "End time 24h HH:MM (e.g. 16:00 for 4pm)"},
                        "label": {"type": "string", "description": "Short label for the shift (e.g. 8am-4pm)"},
                    },
                    "required": ["employee_name", "days", "start_time", "end_time"],
                },
            },
        },
    ]

    system_prompt = """You are a scheduler assistant. Use only the context provided. You can answer questions about the schedule.
- To reassign a shift to another employee: use reassign_shift with shift ID and new employee name.
- To change one shift's time: use update_shift_times with that shift ID. For 'every Tuesday' or 'all Tuesdays for the month' for one person: use update_shift_times_for_day with expected_employee_name, day_of_week (e.g. tuesday), new_start_time, new_end_time — one call updates every matching shift.
- To add new shifts for an employee on specific days (e.g. add Jaylen Mon Tue Wed Fri 8am-4pm): use add_shifts with employee_name, days list (monday, tuesday, ...), start_time, end_time, and label.
Be concise. Use only shift IDs and names from the context."""

    try:
        client = OpenAI(api_key=api_key)
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Context:\n{context}\n\nUser request: {body.question}"},
            ],
            tools=tools,
            tool_choice="auto",
            max_tokens=1024,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Agent error: {str(e)}")

    message = response.choices[0].message
    answer = (message.content or "").strip()
    proposed_actions: list[dict] = []

    def parse_time_safe(t: str) -> time | None:
        if not t or not isinstance(t, str):
            return None
        t = t.strip()
        if len(t) == 5 and ":" in t:
            t = t + ":00"
        try:
            return time.fromisoformat(t)
        except ValueError:
            return None

    if getattr(message, "tool_calls", None):
        for tc in message.tool_calls:
            if not getattr(tc, "function", None):
                continue
            try:
                args = json.loads(tc.function.arguments or "{}")
            except Exception:
                continue
            fname = getattr(tc.function, "name", None)

            if fname == "reassign_shift":
                shift_id_str = (args.get("scheduled_shift_id") or "").strip()
                new_name = (args.get("new_employee_name") or "").strip()
                if not shift_id_str or not new_name:
                    continue
                new_employee_id = name_to_id.get(new_name.lower())
                if not new_employee_id:
                    continue
                shift_row = db.execute(
                    text(
                        "SELECT scheduled_shift_id, shift_date, label, start_time, end_time FROM scheduled_shifts WHERE schedule_run_id = :run_id AND scheduled_shift_id = :sid"
                    ),
                    {"run_id": str(run_id), "sid": shift_id_str},
                ).mappings().first()
                if not shift_row:
                    continue
                current_name = next((r["employee_name"] for r in shifts_rows if str(r["scheduled_shift_id"]) == shift_id_str), "?")
                summary = f"Reassign {shift_row['shift_date']} {shift_row['label']} from {current_name} to {new_name}"
                proposed_actions.append({
                    "type": "reassign_shift",
                    "scheduled_shift_id": shift_id_str,
                    "new_employee_id": new_employee_id,
                    "summary": summary,
                })

            elif fname == "update_shift_times":
                shift_id_str = (args.get("scheduled_shift_id") or "").strip()
                expected_name = (args.get("expected_employee_name") or "").strip()
                day_of_week_arg = (args.get("day_of_week") or "").strip().lower()
                new_st = (args.get("new_start_time") or "").strip()
                new_et = (args.get("new_end_time") or "").strip()
                new_label = (args.get("new_label") or "").strip() or None
                if not shift_id_str or not new_st or not new_et or parse_time_safe(new_st) is None or parse_time_safe(new_et) is None:
                    continue
                shift_row = db.execute(
                    text(
                        "SELECT scheduled_shift_id, shift_date, label, start_time, end_time FROM scheduled_shifts WHERE schedule_run_id = :run_id AND scheduled_shift_id = :sid"
                    ),
                    {"run_id": str(run_id), "sid": shift_id_str},
                ).mappings().first()
                if not shift_row:
                    continue
                current_name = next((r["employee_name"] for r in shifts_rows if str(r["scheduled_shift_id"]) == shift_id_str), "?")
                # Only include this shift if it belongs to the employee the user asked about
                if expected_name and current_name and expected_name.strip().lower() != current_name.strip().lower():
                    continue
                # When user asked for a specific day (e.g. Tuesday), only include shifts on that weekday (Python: Mon=0, Tue=1, ..., Sun=6)
                if day_of_week_arg:
                    weekday_map = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6}
                    expected_weekday = weekday_map.get(day_of_week_arg)
                    if expected_weekday is not None:
                        shift_date = shift_row["shift_date"]
                        actual_weekday = shift_date.weekday() if hasattr(shift_date, "weekday") else None
                        if actual_weekday is not None and actual_weekday != expected_weekday:
                            continue
                summary = f"Change {current_name} {shift_row['shift_date']} to {new_st}-{new_et}" + (f" (label: {new_label})" if new_label else "")
                proposed_actions.append({
                    "type": "update_shift_times",
                    "scheduled_shift_id": shift_id_str,
                    "new_start_time": new_st,
                    "new_end_time": new_et,
                    "new_label": new_label,
                    "summary": summary,
                })

            elif fname == "update_shift_times_for_day":
                expected_name = (args.get("expected_employee_name") or "").strip()
                day_of_week_arg = (args.get("day_of_week") or "").strip().lower()
                new_st = (args.get("new_start_time") or "").strip()
                new_et = (args.get("new_end_time") or "").strip()
                new_label = (args.get("new_label") or "").strip() or None
                if not expected_name or not day_of_week_arg or not new_st or not new_et:
                    continue
                if parse_time_safe(new_st) is None or parse_time_safe(new_et) is None:
                    continue
                weekday_map = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6}
                expected_weekday = weekday_map.get(day_of_week_arg)
                if expected_weekday is None:
                    continue
                expected_lower = expected_name.lower()
                for r in shifts_rows:
                    emp_name = (r.get("employee_name") or "").strip()
                    if emp_name.lower() != expected_lower:
                        continue
                    shift_d = r.get("shift_date")
                    if shift_d is None or not hasattr(shift_d, "weekday"):
                        continue
                    if shift_d.weekday() != expected_weekday:
                        continue
                    sid = str(r.get("scheduled_shift_id") or "")
                    if not sid:
                        continue
                    summary = f"Change {emp_name} {shift_d} to {new_st}-{new_et}" + (f" (label: {new_label})" if new_label else "")
                    proposed_actions.append({
                        "type": "update_shift_times",
                        "scheduled_shift_id": sid,
                        "new_start_time": new_st,
                        "new_end_time": new_et,
                        "new_label": new_label,
                        "summary": summary,
                    })

            elif fname == "add_shifts":
                emp_name = (args.get("employee_name") or "").strip()
                days_raw = args.get("days")
                start_t = (args.get("start_time") or "").strip()
                end_t = (args.get("end_time") or "").strip()
                label = (args.get("label") or "").strip() or f"{start_t}-{end_t}"
                if not emp_name or not days_raw or not start_t or not end_t:
                    continue
                emp_id = name_to_id.get(emp_name.lower())
                if not emp_id:
                    continue
                if parse_time_safe(start_t) is None or parse_time_safe(end_t) is None:
                    continue
                day_map = {"monday": 0, "tuesday": 1, "wednesday": 2, "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6}
                day_nums = set()
                for d in days_raw if isinstance(days_raw, list) else [days_raw]:
                    s = (d or "").strip().lower()
                    if s in day_map:
                        day_nums.add(day_map[s])
                if not day_nums:
                    continue
                # All dates in run range that match the requested weekdays
                cur = month_start
                while cur <= month_end:
                    if cur.weekday() in day_nums:
                        date_str = cur.isoformat()[:10]
                        summary = f"Add {emp_name} {date_str} {label} ({start_t}-{end_t})"
                        proposed_actions.append({
                            "type": "add_shift",
                            "employee_id": emp_id,
                            "shift_date": date_str,
                            "start_time": start_t,
                            "end_time": end_t,
                            "label": label,
                            "summary": summary,
                        })
                    cur = cur + timedelta(days=1)

    return {"answer": answer, "proposed_actions": proposed_actions}


def _parse_time_for_apply(time_str: str) -> time:
    s = (time_str or "").strip()
    if len(s) == 5 and ":" in s:
        s = s + ":00"
    try:
        return time.fromisoformat(s)
    except ValueError:
        raise HTTPException(status_code=400, detail=f"Invalid time format: {time_str}. Use HH:MM or HH:MM:SS")


@router.post("/{run_id}/agent/apply")
def agent_apply(
    run_id: UUID,
    body: AgentApplyRequest,
    db: Session = Depends(get_db),
):
    """Apply previously proposed agent actions (reassign, update times, add shift)."""
    run = db.execute(
        text("SELECT schedule_run_id, studio_id FROM schedule_runs WHERE schedule_run_id = :run_id"),
        {"run_id": str(run_id)},
    ).mappings().first()
    if not run:
        raise HTTPException(status_code=404, detail="Schedule run not found")

    applied = []
    for action in body.actions:
        if action.type == "reassign_shift":
            a = action  # type: ProposedReassignAction
            shift = db.get(ScheduledShift, UUID(a.scheduled_shift_id))
            if not shift or str(shift.schedule_run_id) != str(run_id):
                raise HTTPException(status_code=400, detail=f"Shift {a.scheduled_shift_id} not found or not in this run")
            employee = db.execute(
                text("SELECT employee_id, is_active FROM employees WHERE employee_id = :eid"),
                {"eid": a.new_employee_id},
            ).mappings().first()
            if not employee or not employee["is_active"]:
                raise HTTPException(status_code=400, detail=f"Employee {a.new_employee_id} not found or not active")
            shift.employee_id = UUID(a.new_employee_id)
            db.commit()
            db.refresh(shift)
            applied.append({"type": "reassign_shift", "scheduled_shift_id": a.scheduled_shift_id, "new_employee_id": a.new_employee_id})

        elif action.type == "update_shift_times":
            a = action  # type: ProposedUpdateShiftTimesAction
            shift = db.get(ScheduledShift, UUID(a.scheduled_shift_id))
            if not shift or str(shift.schedule_run_id) != str(run_id):
                raise HTTPException(status_code=400, detail=f"Shift {a.scheduled_shift_id} not found or not in this run")
            shift.start_time = _parse_time_for_apply(a.new_start_time)
            shift.end_time = _parse_time_for_apply(a.new_end_time)
            if a.new_label is not None and a.new_label.strip():
                shift.label = a.new_label.strip()
            db.commit()
            db.refresh(shift)
            applied.append({"type": "update_shift_times", "scheduled_shift_id": a.scheduled_shift_id})

        elif action.type == "add_shift":
            a = action  # type: ProposedAddShiftAction
            shift_date_obj = date.fromisoformat(a.shift_date)
            employee = db.execute(
                text("SELECT employee_id, is_active, company_id FROM employees WHERE employee_id = :eid"),
                {"eid": a.employee_id},
            ).mappings().first()
            if not employee or not employee["is_active"]:
                raise HTTPException(status_code=400, detail=f"Employee {a.employee_id} not found or not active")
            run_check = db.execute(
                text("SELECT company_id FROM schedule_runs WHERE schedule_run_id = :run_id"),
                {"run_id": str(run_id)},
            ).mappings().first()
            if run_check and str(employee["company_id"]) != str(run_check["company_id"]):
                raise HTTPException(status_code=400, detail="Employee does not belong to this company")
            python_dow = shift_date_obj.weekday()
            day_of_week = (python_dow + 1) % 7
            new_shift = ScheduledShift(
                schedule_run_id=run_id,
                employee_id=UUID(a.employee_id),
                studio_id=run["studio_id"],
                shift_date=shift_date_obj,
                day_of_week=day_of_week,
                label=a.label,
                start_time=_parse_time_for_apply(a.start_time),
                end_time=_parse_time_for_apply(a.end_time),
            )
            db.add(new_shift)
            db.commit()
            db.refresh(new_shift)
            applied.append({"type": "add_shift", "scheduled_shift_id": str(new_shift.scheduled_shift_id), "shift_date": a.shift_date})

    return {"applied": applied}


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
