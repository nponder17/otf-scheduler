from __future__ import annotations

import json
from collections import Counter
from datetime import date, timedelta
from typing import Dict, List, Tuple
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_, delete, select, text
from sqlalchemy.orm import Session

from app.models.availability import EmployeeAvailability
from app.models.employee import Employee
from app.models.pto import EmployeePTO
from app.models.schedule_runs import ScheduleRun
from app.models.scheduled_shifts import ScheduledShift
from app.models.shift_instances import ShiftInstance
from app.models.time_off import EmployeeTimeOff
from app.models.unavailability import EmployeeUnavailability


# ---------- helpers ----------
def _to_minutes(t) -> int:
    if hasattr(t, "hour"):
        return int(t.hour) * 60 + int(t.minute)
    s = str(t)
    hh, mm = s[:5].split(":")
    return int(hh) * 60 + int(mm)


def _overlaps(a_start_m: int, a_end_m: int, b_start_m: int, b_end_m: int) -> bool:
    return a_start_m < b_end_m and b_start_m < a_end_m


def _daterange(start: date, end: date):
    cur = start
    while cur <= end:
        yield cur
        cur += timedelta(days=1)


# ---------- core ----------
def generate_month_schedule(
    db: Session,
    company_id: UUID,
    studio_id: UUID,
    month_start: date,
    month_end: date,
    overwrite: bool = False,
) -> UUID:
    """
    MVP schedule generator + audit:

    Writes:
      - scheduled_shifts
      - schedule_audit_candidate (one row per employee considered per shift)
      - schedule_audit_shift (one row per shift with summary stats)
    """

    if month_end < month_start:
        raise HTTPException(status_code=400, detail="month_end must be >= month_start")

    # Create schedule run
    run = ScheduleRun(
        company_id=company_id,
        studio_id=studio_id,
        month_start=month_start,
        month_end=month_end,
    )
    db.add(run)
    db.flush()
    try:
        db.refresh(run)
    except Exception:
        pass

    if not run.schedule_run_id:
        raise HTTPException(status_code=500, detail="Failed to create schedule run (missing schedule_run_id).")

    # Optional overwrite: delete existing scheduled_shifts in that range for this studio
    # NOTE: This does NOT delete old schedule_runs or audits from previous runs.
    if overwrite:
        db.execute(
            delete(ScheduledShift).where(
                and_(
                    ScheduledShift.studio_id == studio_id,
                    ScheduledShift.shift_date >= month_start,
                    ScheduledShift.shift_date <= month_end,
                )
            )
        )

    # Load demand shifts (instances)
    demand = db.execute(
        select(
            ShiftInstance.shift_date,
            ShiftInstance.day_of_week,
            ShiftInstance.label,
            ShiftInstance.start_time,
            ShiftInstance.end_time,
            ShiftInstance.required_count,
        )
        .where(
            and_(
                ShiftInstance.company_id == company_id,
                ShiftInstance.studio_id == studio_id,
                ShiftInstance.shift_date >= month_start,
                ShiftInstance.shift_date <= month_end,
            )
        )
        .order_by(ShiftInstance.shift_date, ShiftInstance.start_time)
    ).all()

    if not demand:
        raise HTTPException(status_code=400, detail="No shift_instances found for that company/studio/month.")

    # Load employees for that company
    employees = (
        db.execute(
            select(Employee).where(
                and_(
                    Employee.company_id == company_id,
                    Employee.is_active == True,  # noqa: E712
                )
            )
        )
        .scalars()
        .all()
    )

    if not employees:
        raise HTTPException(status_code=400, detail="No active employees found for that company.")

    emp_ids = [e.employee_id for e in employees]

    # Load weekly availability/unavailability
    avail_rows = (
        db.execute(select(EmployeeAvailability).where(EmployeeAvailability.employee_id.in_(emp_ids)))
        .scalars()
        .all()
    )
    unavail_rows = (
        db.execute(select(EmployeeUnavailability).where(EmployeeUnavailability.employee_id.in_(emp_ids)))
        .scalars()
        .all()
    )

    # Load date-range time off + PTO in month window
    time_off_rows = (
        db.execute(
            select(EmployeeTimeOff).where(
                and_(
                    EmployeeTimeOff.employee_id.in_(emp_ids),
                    EmployeeTimeOff.end_date >= month_start,
                    EmployeeTimeOff.start_date <= month_end,
                )
            )
        )
        .scalars()
        .all()
    )
    pto_rows = (
        db.execute(
            select(EmployeePTO).where(
                and_(
                    EmployeePTO.employee_id.in_(emp_ids),
                    EmployeePTO.end_date >= month_start,
                    EmployeePTO.start_date <= month_end,
                )
            )
        )
        .scalars()
        .all()
    )

    # Index availability/unavailability by employee + dow
    avail_by_emp_dow: Dict[UUID, Dict[int, List[Tuple[int, int]]]] = {}
    for r in avail_rows:
        avail_by_emp_dow.setdefault(r.employee_id, {}).setdefault(int(r.day_of_week), []).append(
            (_to_minutes(r.start_time), _to_minutes(r.end_time))
        )

    unavail_by_emp_dow: Dict[UUID, Dict[int, List[Tuple[int, int]]]] = {}
    for r in unavail_rows:
        unavail_by_emp_dow.setdefault(r.employee_id, {}).setdefault(int(r.day_of_week), []).append(
            (_to_minutes(r.start_time), _to_minutes(r.end_time))
        )

    # Date-range blocks: expand to sets for quick lookup
    off_dates_by_emp: Dict[UUID, set[date]] = {eid: set() for eid in emp_ids}
    for r in time_off_rows:
        for d in _daterange(r.start_date, r.end_date):
            off_dates_by_emp.setdefault(r.employee_id, set()).add(d)

    pto_dates_by_emp: Dict[UUID, set[date]] = {eid: set() for eid in emp_ids}
    for r in pto_rows:
        for d in _daterange(r.start_date, r.end_date):
            pto_dates_by_emp.setdefault(r.employee_id, set()).add(d)

    assigned_by_emp_day: set[Tuple[UUID, date]] = set()
    minutes_by_emp: Dict[UUID, int] = {eid: 0 for eid in emp_ids}

    def eligibility(eid: UUID, d: date, dow: int, s_m: int, e_m: int) -> tuple[bool, list[str]]:
        reasons: list[str] = []

        if (eid, d) in assigned_by_emp_day:
            reasons.append("already_assigned_that_day")

        if d in off_dates_by_emp.get(eid, set()):
            reasons.append("time_off")

        if d in pto_dates_by_emp.get(eid, set()):
            reasons.append("pto")

        av = avail_by_emp_dow.get(eid, {}).get(dow, [])
        if not any(a_s <= s_m and a_e >= e_m for (a_s, a_e) in av):
            reasons.append("no_availability_coverage")

        un = unavail_by_emp_dow.get(eid, {}).get(dow, [])
        if any(_overlaps(s_m, e_m, u_s, u_e) for (u_s, u_e) in un):
            reasons.append("weekly_unavailable_overlap")

        return (len(reasons) == 0, reasons)

    def upsert_candidate_audit(
        run_id: UUID,
        shift_date: date,
        label: str,
        start_time,
        end_time,
        employee_id: UUID,
        eligible: bool,
        reasons: list[str],
        selected: bool,
        minutes_so_far: int,
    ) -> None:
        rejection_reason = None if eligible else (reasons[0] if reasons else "unknown")

        details = {
            "selected": selected,
            "minutes_so_far": minutes_so_far,
            "reasons": reasons,
        }

        db.execute(
            text(
                """
                INSERT INTO schedule_audit_candidate
                  (schedule_run_id, shift_date, label, start_time, end_time,
                   employee_id, eligible, rejection_reason, details)
                VALUES
                  (:run_id, :shift_date, :label, :start_time, :end_time,
                   :employee_id, :eligible, :rejection_reason, CAST(:details AS jsonb))
                ON CONFLICT (schedule_run_id, shift_date, label, start_time, end_time, employee_id)
                DO UPDATE SET
                  eligible = EXCLUDED.eligible,
                  rejection_reason = EXCLUDED.rejection_reason,
                  details = EXCLUDED.details,
                  created_at = now()
                """
            ),
            {
                "run_id": str(run_id),
                "shift_date": shift_date,
                "label": label,
                "start_time": start_time,
                "end_time": end_time,
                "employee_id": str(employee_id),
                "eligible": eligible,
                "rejection_reason": rejection_reason,
                "details": json.dumps(details),
            },
        )

    def upsert_shift_audit(
        run_id: UUID,
        shift_date: date,
        label: str,
        start_time,
        end_time,
        required_count: int,
        assigned_count: int,
        candidate_count: int,
        missing_count: int,
        rejection_summary: dict,
    ) -> None:
        db.execute(
            text(
                """
                INSERT INTO schedule_audit_shift
                  (schedule_run_id, shift_date, label, start_time, end_time,
                   required_count, assigned_count, candidate_count, missing_count, rejection_summary)
                VALUES
                  (:run_id, :shift_date, :label, :start_time, :end_time,
                   :required_count, :assigned_count, :candidate_count, :missing_count,
                   CAST(:rejection_summary AS jsonb))
                ON CONFLICT (schedule_run_id, shift_date, label, start_time, end_time)
                DO UPDATE SET
                  required_count = EXCLUDED.required_count,
                  assigned_count = EXCLUDED.assigned_count,
                  candidate_count = EXCLUDED.candidate_count,
                  missing_count = EXCLUDED.missing_count,
                  rejection_summary = EXCLUDED.rejection_summary,
                  created_at = now()
                """
            ),
            {
                "run_id": str(run_id),
                "shift_date": shift_date,
                "label": label,
                "start_time": start_time,
                "end_time": end_time,
                "required_count": int(required_count),
                "assigned_count": int(assigned_count),
                "candidate_count": int(candidate_count),
                "missing_count": int(missing_count),
                "rejection_summary": json.dumps(rejection_summary),
            },
        )

    # ---------- main loop ----------
    for shift_date, day_of_week, label, start_time, end_time, required_count in demand:
        s_m = _to_minutes(start_time)
        e_m = _to_minutes(end_time)
        dow = int(day_of_week)

        eligible_ids: list[UUID] = []
        rejection_counter = Counter()
        cache: dict[UUID, tuple[bool, list[str]]] = {}

        # Evaluate everyone once
        for e in employees:
            ok, reasons = eligibility(e.employee_id, shift_date, dow, s_m, e_m)
            cache[e.employee_id] = (ok, reasons)
            if ok:
                eligible_ids.append(e.employee_id)
            else:
                for r in reasons:
                    rejection_counter[r] += 1

        # Fairness sort (least minutes first)
        eligible_ids.sort(key=lambda eid: minutes_by_emp.get(eid, 0))

        need = int(required_count)
        picked = eligible_ids[:need]
        picked_set = set(picked)

        # Candidate audit rows (all employees, not just eligible)
        for e in employees:
            ok, reasons = cache[e.employee_id]
            upsert_candidate_audit(
                run_id=run.schedule_run_id,
                shift_date=shift_date,
                label=label,
                start_time=start_time,
                end_time=end_time,
                employee_id=e.employee_id,
                eligible=ok,
                reasons=reasons,
                selected=(e.employee_id in picked_set),
                minutes_so_far=minutes_by_emp.get(e.employee_id, 0),
            )

        # Scheduled shifts
        for eid in picked:
            db.add(
                ScheduledShift(
                    schedule_run_id=run.schedule_run_id,
                    employee_id=eid,
                    studio_id=studio_id,
                    shift_date=shift_date,
                    day_of_week=dow,
                    label=label,
                    start_time=start_time,
                    end_time=end_time,
                )
            )
            assigned_by_emp_day.add((eid, shift_date))
            minutes_by_emp[eid] = minutes_by_emp.get(eid, 0) + (e_m - s_m)

        assigned_count = len(picked)
        candidate_count = len(eligible_ids)
        missing_count = max(0, need - assigned_count)

        upsert_shift_audit(
            run_id=run.schedule_run_id,
            shift_date=shift_date,
            label=label,
            start_time=start_time,
            end_time=end_time,
            required_count=need,
            assigned_count=assigned_count,
            candidate_count=candidate_count,
            missing_count=missing_count,
            rejection_summary=dict(rejection_counter),
        )

    db.commit()
    return run.schedule_run_id
