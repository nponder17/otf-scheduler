from datetime import time

def validate_time_range(start: time, end: time) -> None:
    # MVP: require end > start (no overnight blocks yet)
    if end <= start:
        raise ValueError("end_time must be after start_time")
