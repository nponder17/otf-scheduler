SHIFT_TEMPLATES = [
    # Mon-Fri
    {"days": [1,2,3,4,5], "label": "AM_0425_1225", "start_hhmm": "04:25", "end_hhmm": "12:25", "required": 1},
    {"days": [1,2,3,4,5], "label": "AM_0530_1330", "start_hhmm": "05:30", "end_hhmm": "13:30", "required": 1},
    {"days": [1,2,3,4,5], "label": "PM_1230_2030", "start_hhmm": "12:30", "end_hhmm": "20:30", "required": 2},

    # Saturday
    {"days": [6], "label": "SAT_0530_1230", "start_hhmm": "05:30", "end_hhmm": "12:30", "required": 1},
    {"days": [6], "label": "SAT_0800_1400", "start_hhmm": "08:00", "end_hhmm": "14:00", "required": 1},

    # Sunday
    {"days": [0], "label": "SUN_0745_1330", "start_hhmm": "07:45", "end_hhmm": "13:30", "required": 2},
]
