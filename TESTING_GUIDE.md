# Schedule Generator Testing Guide

## Overview
We now have two schedule generators:
- **v1** (original): Simple greedy assignment with basic fairness
- **v2** (new): Enhanced with hard/soft constraints, scoring, and optimization

## How to Test

### 1. Set Up Test Data

#### Fill Out Employee Availability Forms
For each employee, fill out their form with:
- **Availability blocks** (when they can work)
- **Unavailability blocks** (when they cannot work)
- **Time Off** (specific date ranges)
- **PTO** (paid time off dates)
- **Preferences**:
  - Employment Type: Full Time or Part Time
  - Weekend Preference: Saturday, Sunday, or Either
  - Ideal Weekly Hours: (optional, especially for PT)
  - Hard No Constraints: (optional notes)

#### Test Scenarios to Create

**Scenario 1: Basic Coverage**
- 2-3 employees with overlapping availability
- Mix of FT and PT
- Different weekend preferences
- No PTO or time off

**Scenario 2: Constrained Coverage**
- Limited availability windows
- Some employees with PTO
- Some with time off
- Test if hard constraints are respected

**Scenario 3: Weekend Preference Testing**
- Some employees prefer Saturday
- Some prefer Sunday
- Some prefer Either
- Generate schedule and check if preferences are honored

**Scenario 4: Hour Targets**
- 1-2 Full Time employees (should get >= 30 hours)
- 2-3 Part Time employees with ideal hours set
- Check if hour targets are met

**Scenario 5: Edge Cases**
- Overlapping shifts (same day, different times)
- Cross-day shifts (late night to early morning)
- Maximum consecutive days (test 6+ day limit)
- Minimum rest between shifts (test 12-hour rule)

### 2. Generate Schedules

#### Using the API

**Generate with v1 (original):**
```bash
curl -X POST "http://localhost:8000/schedules/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": "YOUR_COMPANY_ID",
    "studio_id": "YOUR_STUDIO_ID",
    "month_start": "2026-02-01",
    "month_end": "2026-02-28",
    "overwrite": true,
    "generator_version": "v1"
  }'
```

**Generate with v2 (new enhanced):**
```bash
curl -X POST "http://localhost:8000/schedules/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "company_id": "YOUR_COMPANY_ID",
    "studio_id": "YOUR_STUDIO_ID",
    "month_start": "2026-02-01",
    "month_end": "2026-02-28",
    "overwrite": true,
    "generator_version": "v2"
  }'
```

#### Using the Web UI
In the Manager Schedule page, the generator version can be specified in the API call (you may need to update the frontend to pass this parameter).

### 3. Compare Results

#### Check Coverage
```bash
# Get coverage report
curl "http://localhost:8000/schedules/{run_id}/coverage"
```

Look for:
- **Missing shifts**: Are all required shifts filled?
- **Over-assignments**: Are shifts over-staffed?
- **Rejection reasons**: Why were employees rejected?

#### Check Employee Schedules
```bash
# Get schedule for specific employee
curl "http://localhost:8000/schedules/{run_id}/employee/{employee_id}"
```

Check:
- **Hour totals**: Do FT employees have >= 30 hours?
- **Weekend shifts**: Do employees get their preferred weekend day?
- **Consecutive days**: Are there too many consecutive days?
- **Rest periods**: Is there at least 12 hours between shifts?

#### Check Audit Details
```bash
# Get detailed audit for a specific shift
curl "http://localhost:8000/schedules/{run_id}/audit/shift?shift_date=2026-02-15&label=AM_0530_1330&start_time=05:30:00&end_time=13:30:00"
```

Look for:
- **Eligibility reasons**: Why was each employee eligible/not eligible?
- **Scores**: (v2 only) What was the scoring for each candidate?
- **Selection reasons**: Why was this employee selected?

### 4. What to Look For

#### Hard Constraints (v2 should never violate these)
- ✅ No shifts on PTO days
- ✅ No shifts on time off days
- ✅ No shifts outside availability windows
- ✅ No overlapping shifts for same employee
- ✅ No shifts longer than 10 hours
- ✅ At least 12 hours rest between shifts
- ✅ No more than 6 consecutive days

#### Soft Constraints (v2 should optimize these)
- ✅ Weekend preferences honored (when possible)
- ✅ Full-time employees get >= 30 hours
- ✅ Part-time employees get close to ideal hours
- ✅ Avoid clopens (close then open)
- ✅ Minimize excessive consecutive days

#### Comparison Points
1. **Coverage**: Do both generators fill all required shifts?
2. **Fairness**: Is workload distributed fairly?
3. **Preferences**: Does v2 better honor preferences?
4. **Hour targets**: Does v2 better meet hour targets?
5. **Constraint violations**: Does v2 avoid violations that v1 might allow?

### 5. Common Issues to Watch For

#### v1 Issues
- May assign overlapping shifts (only checks same day)
- Doesn't consider hour targets
- Doesn't honor weekend preferences
- May violate rest time rules
- May exceed consecutive day limits

#### v2 Potential Issues
- Overlap detection might have edge cases
- Optimization pass might not improve scores
- Score calculation might need tuning
- Repair pass for hour targets is simplified

### 6. Debugging Tips

#### Check Database Directly
```sql
-- See all schedule runs
SELECT * FROM schedule_runs ORDER BY created_at DESC;

-- See scheduled shifts for a run
SELECT * FROM scheduled_shifts WHERE schedule_run_id = 'RUN_ID';

-- See audit data
SELECT * FROM schedule_audit_shift WHERE schedule_run_id = 'RUN_ID';
SELECT * FROM schedule_audit_candidate WHERE schedule_run_id = 'RUN_ID' LIMIT 20;
```

#### Check Employee Rules
```sql
-- See employee preferences
SELECT e.name, er.rule_type, er.value_json
FROM employees e
LEFT JOIN employee_rules er ON e.employee_id = er.employee_id
WHERE e.company_id = 'COMPANY_ID'
ORDER BY e.name, er.rule_type;
```

#### Check Availability
```sql
-- See employee availability
SELECT e.name, ea.day_of_week, ea.start_time, ea.end_time, ea.type
FROM employees e
JOIN employee_availability ea ON e.employee_id = ea.employee_id
WHERE e.company_id = 'COMPANY_ID'
ORDER BY e.name, ea.day_of_week;
```

### 7. Test Checklist

- [ ] Generate schedule with v1
- [ ] Generate schedule with v2 (same parameters)
- [ ] Compare coverage (both should fill all shifts)
- [ ] Check for hard constraint violations in v2
- [ ] Check hour totals for FT employees (v2 should be >= 30)
- [ ] Check weekend preferences (v2 should honor when possible)
- [ ] Check for overlapping shifts (v2 should have none)
- [ ] Check rest periods (v2 should have >= 12 hours)
- [ ] Check consecutive days (v2 should have <= 6)
- [ ] Review audit data for both runs
- [ ] Test with different employee configurations
- [ ] Test edge cases (PTO, time off, limited availability)

### 8. Reporting Issues

When you find an issue, note:
1. **Generator version** (v1 or v2)
2. **Test scenario** (what data you used)
3. **Expected behavior** (what should happen)
4. **Actual behavior** (what actually happened)
5. **Relevant data** (employee IDs, shift dates, etc.)
6. **Audit data** (rejection reasons, scores, etc.)

## Next Steps

After testing:
1. Fix any bugs found in v2
2. Tune scoring weights if needed
3. Improve optimization pass
4. Enhance repair pass for hour targets
5. Add weekend preference weekly penalty
6. Consider replacing v1 with v2 once stable

