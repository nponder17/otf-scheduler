"""
Enhanced Schedule Generator with Hard/Soft Constraints and Two-Phase Optimization

Phase A: Build valid schedule (hard constraints only)
Phase B: Optimize with swaps (soft constraints)
"""

from __future__ import annotations

import json
import random
from collections import Counter, defaultdict
from datetime import date, timedelta, datetime
from typing import Dict, List, Tuple, Optional, Set
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import and_, delete, select, text
from sqlalchemy.orm import Session

from app.models.availability import EmployeeAvailability
from app.models.employee import Employee
from app.models.pto import EmployeePTO
from app.models.rules import EmployeeRule
from app.models.schedule_runs import ScheduleRun
from app.models.scheduled_shifts import ScheduledShift
from app.models.shift_instances import ShiftInstance
from app.models.time_off import EmployeeTimeOff
from app.models.unavailability import EmployeeUnavailability


# ========== Configuration Constants ==========
MAX_SHIFT_LENGTH_MINUTES = 10 * 60  # 10 hours
MIN_REST_BETWEEN_SHIFTS_MINUTES = 12 * 60  # 12 hours
MAX_CONSECUTIVE_DAYS = 6
FT_MIN_HOURS_PER_WEEK = 30
OPTIMIZATION_SWAP_ATTEMPTS = 200

# Scoring weights
WEIGHT_WEEKEND_PREF_MATCH = 50  # Increased to prioritize specific preferences
WEIGHT_WEEKEND_PREF_OPPOSITE = -20  # Increased penalty for opposite
WEIGHT_WEEKEND_PREF_EITHER = 10  # Reduced - "either" should be lower priority than specific prefs
WEIGHT_WEEKEND_PREF_WEEKLY_PENALTY = -30  # Penalty if employee gets zero preferred weekend shifts
WEIGHT_PREFERRED_DAY = 10
WEIGHT_PREFERRED_TIME = 10
WEIGHT_AVOID_CLOPEN = 20
WEIGHT_CREATE_CLOPEN = -40
WEIGHT_EXTRA_CONSECUTIVE_DAY = -15
WEIGHT_FT_HOURS_REMAINING = 10  # Increased - per hour under target (weekly)
WEIGHT_FT_HOURS_OVER = -4  # Per hour over target
WEIGHT_PT_HOURS_TOWARD_IDEAL = 5  # Increased - per hour toward ideal
WEIGHT_PT_HOURS_OVER_IDEAL = -10  # Increased penalty - per hour over ideal


# ========== Helper Functions ==========
def _to_minutes(t) -> int:
    """Convert time to minutes since midnight."""
    if hasattr(t, "hour"):
        return int(t.hour) * 60 + int(t.minute)
    s = str(t)
    hh, mm = s[:5].split(":")
    return int(hh) * 60 + int(mm)


def _overlaps(a_start_m: int, a_end_m: int, b_start_m: int, b_end_m: int) -> bool:
    """Check if two time ranges overlap."""
    return a_start_m < b_end_m and b_start_m < a_end_m


def _daterange(start: date, end: date):
    """Generate date range."""
    cur = start
    while cur <= end:
        yield cur
        cur += timedelta(days=1)


def _minutes_to_hours(minutes: int) -> float:
    """Convert minutes to hours."""
    return minutes / 60.0


def _get_shift_type(label: str, start_m: int, end_m: int) -> str:
    """
    Determine shift type from label pattern or time ranges.
    Returns: "open", "close", or "mid"
    """
    label_upper = label.upper()
    
    # Check label pattern first
    if "AM" in label_upper or label.startswith("AM_"):
        return "open"
    if "PM" in label_upper or label.startswith("PM_"):
        return "close"
    
    # Fallback to time ranges
    start_hour = start_m // 60
    end_hour = end_m // 60
    
    if start_hour < 6:  # Before 6 AM
        return "open"
    if end_hour >= 20:  # After 8 PM
        return "close"
    return "mid"


def _is_weekend(day_of_week: int) -> bool:
    """Check if day is weekend (0=Sun, 6=Sat)."""
    return day_of_week == 0 or day_of_week == 6


def _is_saturday(day_of_week: int) -> bool:
    """Check if day is Saturday."""
    return day_of_week == 6


def _is_sunday(day_of_week: int) -> bool:
    """Check if day is Sunday."""
    return day_of_week == 0


# ========== Data Structures ==========
class AssignedShift:
    """Represents an assigned shift with time range."""
    def __init__(self, shift_date: date, start_m: int, end_m: int, label: str):
        self.shift_date = shift_date
        self.start_m = start_m
        self.end_m = end_m
        self.label = label
    
    def overlaps_with(self, other_date: date, other_start_m: int, other_end_m: int) -> bool:
        """Check if this shift overlaps with another shift (handles cross-day)."""
        # If dates are more than 1 day apart, no overlap possible
        days_diff = abs((self.shift_date - other_date).days)
        if days_diff > 1:
            return False
        
        # Same day - simple overlap check
        if days_diff == 0:
            return _overlaps(self.start_m, self.end_m, other_start_m, other_end_m)
        
        # Adjacent days - check if shifts span midnight
        # Day 1: shift ends at 23:00 (1380 min), Day 2: shift starts at 01:00 (60 min)
        # These don't overlap if there's 2 hours between them
        
        if self.shift_date < other_date:
            # This shift is on earlier day
            # Check if this shift's end overlaps with next day's start
            # Convert to absolute timeline: this_end to (next_day_start + 24*60)
            this_end_abs = self.end_m
            other_start_abs = other_start_m + (24 * 60)
            # They overlap if this_end > other_start (in absolute timeline)
            return this_end_abs > other_start_m
        else:
            # This shift is on later day
            # Check if other shift's end overlaps with this shift's start
            other_end_abs = other_end_m
            this_start_abs = self.start_m + (24 * 60)
            return other_end_abs > self.start_m


class EmployeeProfile:
    """Stores employee preferences and constraints."""
    def __init__(self, employee_id: UUID):
        self.employee_id = employee_id
        self.employment_type: Optional[str] = None  # "full_time" or "part_time"
        self.weekend_preference: Optional[str] = None  # "saturday", "sunday", or "either"
        self.ideal_hours_weekly: Optional[float] = None
        self.hard_no_note: str = ""
    
    def is_full_time(self) -> bool:
        return self.employment_type == "full_time"
    
    def is_part_time(self) -> bool:
        return self.employment_type == "part_time"


# ========== Core Generator ==========
def generate_month_schedule(
    db: Session,
    company_id: UUID,
    studio_id: UUID,
    month_start: date,
    month_end: date,
    overwrite: bool = False,
) -> UUID:
    """
    Enhanced schedule generator with hard/soft constraints and two-phase optimization.
    
    Phase A: Build valid schedule (hard constraints only)
    Phase B: Optimize with swaps (soft constraints)
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
    
    # Optional overwrite
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
    
    # Load demand shifts
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
    
    # Load employees
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
    
    # Load employee rules (preferences)
    rules_rows = (
        db.execute(select(EmployeeRule).where(EmployeeRule.employee_id.in_(emp_ids)))
        .scalars()
        .all()
    )
    
    # Build employee profiles
    profiles: Dict[UUID, EmployeeProfile] = {}
    for e in employees:
        profiles[e.employee_id] = EmployeeProfile(e.employee_id)
    
    for rule in rules_rows:
        profile = profiles.get(rule.employee_id)
        if not profile:
            continue
        
        value = rule.value_json
        if rule.rule_type == "EMPLOYMENT_TYPE":
            profile.employment_type = value.get("type")
        elif rule.rule_type == "WEEKEND_PREFERENCE":
            profile.weekend_preference = value.get("preference")
        elif rule.rule_type == "IDEAL_HOURS_WEEKLY":
            hours = value.get("hours")
            profile.ideal_hours_weekly = float(hours) if hours is not None else None
        elif rule.rule_type == "HARD_NO_CONSTRAINTS":
            profile.hard_no_note = value.get("note", "")
    
    # Load availability/unavailability
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
    
    # Load time off + PTO
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
    
    # Date-range blocks
    off_dates_by_emp: Dict[UUID, Set[date]] = {eid: set() for eid in emp_ids}
    for r in time_off_rows:
        for d in _daterange(r.start_date, r.end_date):
            off_dates_by_emp.setdefault(r.employee_id, set()).add(d)
    
    pto_dates_by_emp: Dict[UUID, Set[date]] = {eid: set() for eid in emp_ids}
    for r in pto_rows:
        for d in _daterange(r.start_date, r.end_date):
            pto_dates_by_emp.setdefault(r.employee_id, set()).add(d)
    
    # Track assigned shifts (for overlap detection)
    assigned_shifts_by_emp: Dict[UUID, List[AssignedShift]] = {eid: [] for eid in emp_ids}
    minutes_by_emp: Dict[UUID, int] = {eid: 0 for eid in emp_ids}
    shifts_by_date_by_emp: Dict[UUID, Dict[date, List[AssignedShift]]] = {eid: {} for eid in emp_ids}
    
    # ========== PHASE A: Hard Constraints Eligibility ==========
    def check_hard_constraints(
        eid: UUID,
        shift_date: date,
        dow: int,
        start_m: int,
        end_m: int,
    ) -> Tuple[bool, List[str]]:
        """Check all hard constraints. Returns (is_valid, reasons)."""
        reasons: List[str] = []
        
        # PTO check
        if shift_date in pto_dates_by_emp.get(eid, set()):
            reasons.append("pto")
        
        # Time off check
        if shift_date in off_dates_by_emp.get(eid, set()):
            reasons.append("time_off")
        
        # Availability check (shift must be fully within availability window)
        av = avail_by_emp_dow.get(eid, {}).get(dow, [])
        if not any(a_s <= start_m and a_e >= end_m for (a_s, a_e) in av):
            reasons.append("no_availability_coverage")
        
        # Unavailability overlap check
        un = unavail_by_emp_dow.get(eid, {}).get(dow, [])
        if any(_overlaps(start_m, end_m, u_s, u_e) for (u_s, u_e) in un):
            reasons.append("weekly_unavailable_overlap")
        
        # Overlap check with existing assigned shifts (across all days)
        for existing_shift in assigned_shifts_by_emp.get(eid, []):
            if existing_shift.overlaps_with(shift_date, start_m, end_m):
                reasons.append("shift_overlap")
                break
        
        # Max shift length check
        shift_length = end_m - start_m
        if shift_length > MAX_SHIFT_LENGTH_MINUTES:
            reasons.append(f"shift_too_long_{shift_length}min")
        
        # Minimum rest between shifts check
        for existing_shift in assigned_shifts_by_emp.get(eid, []):
            # Calculate time between shifts
            days_diff = (shift_date - existing_shift.shift_date).days
            if days_diff == 0:
                # Same day - check if there's enough rest
                if existing_shift.end_m < start_m:
                    rest_minutes = start_m - existing_shift.end_m
                    if rest_minutes < MIN_REST_BETWEEN_SHIFTS_MINUTES:
                        reasons.append("insufficient_rest_same_day")
                elif start_m < existing_shift.start_m:
                    rest_minutes = existing_shift.start_m - end_m
                    if rest_minutes < MIN_REST_BETWEEN_SHIFTS_MINUTES:
                        reasons.append("insufficient_rest_same_day")
            elif days_diff == 1:
                # Next day - check rest from previous day's end to this day's start
                rest_minutes = (24 * 60 - existing_shift.end_m) + start_m
                if rest_minutes < MIN_REST_BETWEEN_SHIFTS_MINUTES:
                    reasons.append("insufficient_rest_cross_day")
            elif days_diff == -1:
                # Previous day - check rest from this day's end to previous day's start
                rest_minutes = (24 * 60 - end_m) + existing_shift.start_m
                if rest_minutes < MIN_REST_BETWEEN_SHIFTS_MINUTES:
                    reasons.append("insufficient_rest_cross_day")
        
        # Max consecutive days check
        shifts_by_date = shifts_by_date_by_emp.get(eid, {})
        if len(shifts_by_date) > 0:
            # Check consecutive days around this shift
            consecutive_count = 1
            check_date = shift_date
            while (check_date - timedelta(days=1)) in shifts_by_date:
                consecutive_count += 1
                check_date -= timedelta(days=1)
            check_date = shift_date
            while (check_date + timedelta(days=1)) in shifts_by_date:
                consecutive_count += 1
                check_date += timedelta(days=1)
            
            if consecutive_count > MAX_CONSECUTIVE_DAYS:
                reasons.append(f"too_many_consecutive_days_{consecutive_count}")
        
        return (len(reasons) == 0, reasons)
    
    # ========== PHASE A: Scoring Function ==========
    def calculate_score(
        eid: UUID,
        shift_date: date,
        dow: int,
        start_m: int,
        end_m: int,
        label: str,
        current_minutes: int,
    ) -> Tuple[float, List[str]]:
        """
        Calculate soft constraint score for assigning this employee to this shift.
        Returns (score, reasons).
        """
        score = 0.0
        reasons: List[str] = []
        profile = profiles.get(eid)
        
        if not profile:
            return (score, reasons)
        
        shift_type = _get_shift_type(label, start_m, end_m)
        shift_hours = _minutes_to_hours(end_m - start_m)
        
        # Weekend preference scoring
        if _is_weekend(dow):
            pref = profile.weekend_preference
            if pref == "saturday" and _is_saturday(dow):
                score += WEIGHT_WEEKEND_PREF_MATCH
                reasons.append("weekend_pref_match_sat")
            elif pref == "sunday" and _is_sunday(dow):
                score += WEIGHT_WEEKEND_PREF_MATCH
                reasons.append("weekend_pref_match_sun")
            elif pref == "either":
                score += WEIGHT_WEEKEND_PREF_EITHER
                reasons.append("weekend_pref_either")
            elif pref == "saturday" and _is_sunday(dow):
                score += WEIGHT_WEEKEND_PREF_OPPOSITE
                reasons.append("weekend_pref_opposite_sat_wants_sun")
            elif pref == "sunday" and _is_saturday(dow):
                score += WEIGHT_WEEKEND_PREF_OPPOSITE
                reasons.append("weekend_pref_opposite_sun_wants_sat")
        
        # Hour target scoring (weekly-based)
        # Calculate what the weekly hours would be after this shift
        shift_hours = _minutes_to_hours(end_m - start_m)
        current_hours_total = _minutes_to_hours(current_minutes)
        hours_after_shift = current_hours_total + shift_hours
        
        # Estimate weeks in month (rough approximation)
        # Better: calculate actual week boundaries, but for now use average
        weeks_in_month = 4.33  # Average weeks per month
        
        if profile.is_full_time():
            current_weekly_hours = current_hours_total / weeks_in_month
            weekly_hours_after = hours_after_shift / weeks_in_month
            target_hours = FT_MIN_HOURS_PER_WEEK
            
            if weekly_hours_after < target_hours:
                # Under target - strong bonus
                hours_under = target_hours - weekly_hours_after
                bonus = hours_under * WEIGHT_FT_HOURS_REMAINING * shift_hours
                score += bonus
                reasons.append(f"ft_hours_needed_{hours_under:.1f}h_weekly")
            else:
                # At or over target - small penalty if way over
                hours_over = weekly_hours_after - target_hours
                if hours_over > 5:  # Only penalize if significantly over
                    penalty = (hours_over - 5) * WEIGHT_FT_HOURS_OVER * shift_hours
                    score += penalty
                    reasons.append(f"ft_hours_over_{hours_over:.1f}h_weekly")
        elif profile.is_part_time() and profile.ideal_hours_weekly:
            current_weekly_hours = current_hours_total / weeks_in_month
            weekly_hours_after = hours_after_shift / weeks_in_month
            ideal = profile.ideal_hours_weekly
            
            if weekly_hours_after < ideal:
                # Toward ideal - bonus
                hours_toward = min(shift_hours, (ideal - current_weekly_hours) * weeks_in_month)
                bonus = hours_toward * WEIGHT_PT_HOURS_TOWARD_IDEAL
                score += bonus
                reasons.append(f"pt_toward_ideal_{hours_toward:.1f}h")
            else:
                # Over ideal - strong penalty
                hours_over = weekly_hours_after - ideal
                if hours_over > 0:
                    penalty = hours_over * WEIGHT_PT_HOURS_OVER_IDEAL * shift_hours
                    score += penalty
                    reasons.append(f"pt_over_ideal_{hours_over:.1f}h_weekly")
        
        # Clopen detection (close then open)
        shifts_by_date = shifts_by_date_by_emp.get(eid, {})
        if shift_type == "open":
            # Check if they closed the previous day
            prev_date = shift_date - timedelta(days=1)
            if prev_date in shifts_by_date:
                for prev_shift in shifts_by_date[prev_date]:
                    if _get_shift_type(prev_shift.label, prev_shift.start_m, prev_shift.end_m) == "close":
                        score += WEIGHT_CREATE_CLOPEN
                        reasons.append("creates_clopen")
                    else:
                        score += WEIGHT_AVOID_CLOPEN
                        reasons.append("avoids_clopen")
        
        # Consecutive days penalty
        shifts_by_date = shifts_by_date_by_emp.get(eid, {})
        if len(shifts_by_date) > 0:
            consecutive_count = 1
            check_date = shift_date
            while (check_date - timedelta(days=1)) in shifts_by_date:
                consecutive_count += 1
                check_date -= timedelta(days=1)
            check_date = shift_date
            while (check_date + timedelta(days=1)) in shifts_by_date:
                consecutive_count += 1
                check_date += timedelta(days=1)
            
            if consecutive_count > 5:  # Penalty for > 5 consecutive days
                penalty = (consecutive_count - 5) * WEIGHT_EXTRA_CONSECUTIVE_DAY
                score += penalty
                reasons.append(f"consecutive_days_{consecutive_count}")
        
        return (score, reasons)
    
    # ========== PHASE A: Build Valid Schedule ==========
    # Sort shifts by "hardness" (fewer candidates = harder to fill)
    # We'll do a first pass to count candidates, then sort
    
    # First, count candidates per shift
    shift_candidate_counts: Dict[Tuple[date, str, int, int], int] = {}
    for shift_date, day_of_week, label, start_time, end_time, required_count in demand:
        s_m = _to_minutes(start_time)
        e_m = _to_minutes(end_time)
        dow = int(day_of_week)
        key = (shift_date, label, s_m, e_m)
        
        count = 0
        for e in employees:
            valid, _ = check_hard_constraints(e.employee_id, shift_date, dow, s_m, e_m)
            if valid:
                count += 1
        shift_candidate_counts[key] = count
    
    # Sort demand by candidate count (hardest first)
    demand_sorted = sorted(
        demand,
        key=lambda x: shift_candidate_counts.get((x[0], x[2], _to_minutes(x[3]), _to_minutes(x[4])), 999)
    )
    
    # Main assignment loop
    scheduled_shifts: List[Tuple[UUID, date, int, str, int, int]] = []  # (eid, date, dow, label, start_m, end_m)
    
    for shift_date, day_of_week, label, start_time, end_time, required_count in demand_sorted:
        s_m = _to_minutes(start_time)
        e_m = _to_minutes(end_time)
        dow = int(day_of_week)
        
        # Find eligible candidates
        candidates: List[Tuple[UUID, float, List[str]]] = []  # (eid, score, reasons)
        rejection_counter = Counter()
        
        for e in employees:
            valid, hard_reasons = check_hard_constraints(e.employee_id, shift_date, dow, s_m, e_m)
            if valid:
                # Calculate score with current minutes (before this shift)
                current_mins = minutes_by_emp.get(e.employee_id, 0)
                score, soft_reasons = calculate_score(
                    e.employee_id, shift_date, dow, s_m, e_m, label,
                    current_mins
                )
                candidates.append((e.employee_id, score, soft_reasons))
            else:
                for r in hard_reasons:
                    rejection_counter[r] += 1
        
        # Sort by score (highest first)
        candidates.sort(key=lambda x: x[1], reverse=True)
        
        # Pick top N
        need = int(required_count)
        picked = candidates[:need]
        
        # Assign shifts
        for eid, score, reasons in picked:
            scheduled_shifts.append((eid, shift_date, dow, label, s_m, e_m))
            
            # Update tracking
            assigned_shift = AssignedShift(shift_date, s_m, e_m, label)
            assigned_shifts_by_emp[eid].append(assigned_shift)
            shifts_by_date_by_emp[eid].setdefault(shift_date, []).append(assigned_shift)
            minutes_by_emp[eid] = minutes_by_emp.get(eid, 0) + (e_m - s_m)
        
        # Audit
        eligible_count = len(candidates)
        assigned_count = len(picked)
        missing_count = max(0, need - assigned_count)
        
        # Candidate audit
        for e in employees:
            valid, hard_reasons = check_hard_constraints(e.employee_id, shift_date, dow, s_m, e_m)
            if valid:
                score, soft_reasons = calculate_score(
                    e.employee_id, shift_date, dow, s_m, e_m, label,
                    minutes_by_emp.get(e.employee_id, 0)
                )
                selected = e.employee_id in [p[0] for p in picked]
                _upsert_candidate_audit(
                    db, run.schedule_run_id, shift_date, label, start_time, end_time,
                    e.employee_id, True, hard_reasons, selected, minutes_by_emp.get(e.employee_id, 0),
                    score, soft_reasons
                )
            else:
                _upsert_candidate_audit(
                    db, run.schedule_run_id, shift_date, label, start_time, end_time,
                    e.employee_id, False, hard_reasons, False, minutes_by_emp.get(e.employee_id, 0),
                    0.0, []
                )
        
        # Shift audit
        _upsert_shift_audit(
            db, run.schedule_run_id, shift_date, label, start_time, end_time,
            need, assigned_count, eligible_count, missing_count, dict(rejection_counter)
        )
    
    # ========== PHASE B: Repair Pass (Hour Targets) ==========
    # Identify FT employees under target and PT employees over ideal
    weeks_in_month = 4.33
    ft_under_target: List[Tuple[UUID, float]] = []  # (eid, hours_needed)
    pt_over_ideal: List[Tuple[UUID, float]] = []  # (eid, hours_over)
    
    for eid, profile in profiles.items():
        current_hours_total = _minutes_to_hours(minutes_by_emp.get(eid, 0))
        current_weekly_hours = current_hours_total / weeks_in_month
        
        if profile.is_full_time():
            if current_weekly_hours < FT_MIN_HOURS_PER_WEEK:
                hours_needed = (FT_MIN_HOURS_PER_WEEK - current_weekly_hours) * weeks_in_month
                ft_under_target.append((eid, hours_needed))
        elif profile.is_part_time() and profile.ideal_hours_weekly:
            if current_weekly_hours > profile.ideal_hours_weekly:
                hours_over = (current_weekly_hours - profile.ideal_hours_weekly) * weeks_in_month
                pt_over_ideal.append((eid, hours_over))
    
    # Try to swap: PT employees who are over ideal -> FT employees who are under target
    # Sort by need (most needed first)
    ft_under_target.sort(key=lambda x: x[1], reverse=True)
    pt_over_ideal.sort(key=lambda x: x[1], reverse=True)
    
    swap_count = 0
    max_repair_swaps = 50  # Limit repair swaps
    
    for ft_eid, ft_hours_needed in ft_under_target:
        if swap_count >= max_repair_swaps:
            break
        
        # Find PT employee with shifts we can swap
        for pt_eid, pt_hours_over in pt_over_ideal:
            if swap_count >= max_repair_swaps:
                break
            
            # Find shifts assigned to PT that FT could take
            for i, (eid, shift_date, dow, label, s_m, e_m) in enumerate(scheduled_shifts):
                if eid != pt_eid:
                    continue
                
                # Check if FT can take this shift
                valid, _ = check_hard_constraints(ft_eid, shift_date, dow, s_m, e_m)
                if valid:
                    # Check if PT can be removed (would they still be over ideal?)
                    shift_hours = _minutes_to_hours(e_m - s_m)
                    pt_new_total = _minutes_to_hours(minutes_by_emp.get(pt_eid, 0)) - shift_hours
                    pt_new_weekly = pt_new_total / weeks_in_month
                    pt_profile = profiles.get(pt_eid)
                    
                    # Only swap if PT would still be reasonable (not too far under ideal)
                    if pt_profile and pt_profile.ideal_hours_weekly:
                        if pt_new_weekly >= pt_profile.ideal_hours_weekly * 0.8:  # At least 80% of ideal
                            # Swap the shift
                            scheduled_shifts[i] = (ft_eid, shift_date, dow, label, s_m, e_m)
                            
                            # Update tracking
                            minutes_by_emp[ft_eid] = minutes_by_emp.get(ft_eid, 0) + (e_m - s_m)
                            minutes_by_emp[pt_eid] = minutes_by_emp.get(pt_eid, 0) - (e_m - s_m)
                            
                            # Update assigned shifts tracking
                            assigned_shifts_by_emp[ft_eid].append(AssignedShift(shift_date, s_m, e_m, label))
                            assigned_shifts_by_emp[pt_eid] = [s for s in assigned_shifts_by_emp[pt_eid] 
                                                              if not (s.shift_date == shift_date and s.start_m == s_m and s.end_m == e_m)]
                            
                            shifts_by_date_by_emp[ft_eid].setdefault(shift_date, []).append(AssignedShift(shift_date, s_m, e_m, label))
                            if shift_date in shifts_by_date_by_emp[pt_eid]:
                                shifts_by_date_by_emp[pt_eid][shift_date] = [s for s in shifts_by_date_by_emp[pt_eid][shift_date]
                                                                              if not (s.start_m == s_m and s.end_m == e_m)]
                            
                            swap_count += 1
                            break
    
    # ========== PHASE B: Optimization Pass (Swaps) ==========
    # Random swap attempts to improve soft constraints
    improved_swaps = 0
    for attempt in range(OPTIMIZATION_SWAP_ATTEMPTS):
        if len(scheduled_shifts) < 2:
            break
        
        # Pick two random shifts
        idx1, idx2 = random.sample(range(len(scheduled_shifts)), 2)
        eid1, date1, dow1, label1, s_m1, e_m1 = scheduled_shifts[idx1]
        eid2, date2, dow2, label2, s_m2, e_m2 = scheduled_shifts[idx2]
        
        # Skip if same employee
        if eid1 == eid2:
            continue
        
        # Check if swap is valid (hard constraints)
        valid1, _ = check_hard_constraints(eid2, date1, dow1, s_m1, e_m1)
        valid2, _ = check_hard_constraints(eid1, date2, dow2, s_m2, e_m2)
        
        if valid1 and valid2:
            # Calculate scores before swap
            mins1_before = minutes_by_emp.get(eid1, 0)
            mins2_before = minutes_by_emp.get(eid2, 0)
            
            score1_before, _ = calculate_score(eid1, date1, dow1, s_m1, e_m1, label1, mins1_before)
            score2_before, _ = calculate_score(eid2, date2, dow2, s_m2, e_m2, label2, mins2_before)
            total_before = score1_before + score2_before
            
            # Calculate scores after swap (adjust minutes)
            shift1_hours = e_m1 - s_m1
            shift2_hours = e_m2 - s_m2
            mins1_after = mins1_before - shift1_hours + shift2_hours
            mins2_after = mins2_before - shift2_hours + shift1_hours
            
            score1_after, _ = calculate_score(eid1, date2, dow2, s_m2, e_m2, label2, mins1_after)
            score2_after, _ = calculate_score(eid2, date1, dow1, s_m1, e_m1, label1, mins2_after)
            total_after = score1_after + score2_after
            
            # Only swap if score improves
            if total_after > total_before:
                # Perform swap
                scheduled_shifts[idx1] = (eid2, date1, dow1, label1, s_m1, e_m1)
                scheduled_shifts[idx2] = (eid1, date2, dow2, label2, s_m2, e_m2)
                
                # Update tracking
                minutes_by_emp[eid1] = mins1_after
                minutes_by_emp[eid2] = mins2_after
                
                # Update assigned shifts (remove old, add new)
                assigned_shifts_by_emp[eid1] = [s for s in assigned_shifts_by_emp[eid1] 
                                                if not (s.shift_date == date1 and s.start_m == s_m1 and s.end_m == e_m1)]
                assigned_shifts_by_emp[eid1].append(AssignedShift(date2, s_m2, e_m2, label2))
                
                assigned_shifts_by_emp[eid2] = [s for s in assigned_shifts_by_emp[eid2] 
                                                if not (s.shift_date == date2 and s.start_m == s_m2 and s.end_m == e_m2)]
                assigned_shifts_by_emp[eid2].append(AssignedShift(date1, s_m1, e_m1, label1))
                
                # Update shifts_by_date
                if date1 in shifts_by_date_by_emp[eid1]:
                    shifts_by_date_by_emp[eid1][date1] = [s for s in shifts_by_date_by_emp[eid1][date1]
                                                          if not (s.start_m == s_m1 and s.end_m == e_m1)]
                if date2 in shifts_by_date_by_emp[eid2]:
                    shifts_by_date_by_emp[eid2][date2] = [s for s in shifts_by_date_by_emp[eid2][date2]
                                                          if not (s.start_m == s_m2 and s.end_m == e_m2)]
                
                shifts_by_date_by_emp[eid1].setdefault(date2, []).append(AssignedShift(date2, s_m2, e_m2, label2))
                shifts_by_date_by_emp[eid2].setdefault(date1, []).append(AssignedShift(date1, s_m1, e_m1, label1))
                
                improved_swaps += 1
    
    # ========== Write to Database ==========
    for eid, shift_date, dow, label, s_m, e_m in scheduled_shifts:
        # Convert back to time objects
        start_time_obj = datetime(2000, 1, 1, s_m // 60, s_m % 60).time()
        end_time_obj = datetime(2000, 1, 1, e_m // 60, e_m % 60).time()
        
        db.add(
            ScheduledShift(
                schedule_run_id=run.schedule_run_id,
                employee_id=eid,
                studio_id=studio_id,
                shift_date=shift_date,
                day_of_week=dow,
                label=label,
                start_time=start_time_obj,
                end_time=end_time_obj,
            )
        )
    
    db.commit()
    return run.schedule_run_id


# ========== Audit Helper Functions ==========
def _upsert_candidate_audit(
    db: Session,
    run_id: UUID,
    shift_date: date,
    label: str,
    start_time,
    end_time,
    employee_id: UUID,
    eligible: bool,
    hard_reasons: List[str],
    selected: bool,
    minutes_so_far: int,
    score: float,
    soft_reasons: List[str],
) -> None:
    """Upsert candidate audit record."""
    rejection_reason = None if eligible else (hard_reasons[0] if hard_reasons else "unknown")
    
    details = {
        "selected": selected,
        "minutes_so_far": minutes_so_far,
        "hard_reasons": hard_reasons,
        "score": score,
        "soft_reasons": soft_reasons,
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


def _upsert_shift_audit(
    db: Session,
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
    """Upsert shift audit record."""
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

