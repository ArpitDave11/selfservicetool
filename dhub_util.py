"""
dhub_util.py - Common utility functions
Converted from Scala: dhub_util_sc.scala
Imported by kafka_notification.py
"""
import requests
import urllib3
from datetime import datetime
from zoneinfo import ZoneInfo

# Disable SSL warnings when verification is disabled
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


def invoke_kafka_notification(payload: str, notification_url: str) -> int:
    """
    Send HTTP POST to Kafka notification endpoint.

    Args:
        payload: JSON string payload
        notification_url: Target HTTPS endpoint

    Returns:
        HTTP response status code
    """
    headers = {
        "Content-Type": "application/json",
        "role": "Publisher",
        "UserId": "AA43979-ESL"
    }

    response = requests.post(
        notification_url,
        data=payload.encode('utf-8'),
        headers=headers,
        verify=False,
        timeout=(10, 30)  # (connect_timeout, read_timeout)
    )

    return response.status_code


def current_formatted_time(date_format: str) -> str:
    """
    Get current time formatted in EST timezone.

    Args:
        date_format: strftime format string (e.g., "%Y-%m-%d-%H:%M:%S")

    Returns:
        Formatted datetime string
    """
    tz = ZoneInfo("America/New_York")
    current_time = datetime.now(tz)
    return current_time.strftime(date_format)


def logging_function(param1, src_data_file_nm, system, component,
                     operation, status, param7, message, description,
                     source_id, param11, param12, logstage, param14, param15):
    """
    Log notification events for audit trail.

    Args:
        15 parameters matching the Scala implementation
    """
    print(f"[{system}][{component}] {operation} - Status: {status}")
    print(f"  File: {src_data_file_nm}")
    print(f"  Source ID: {source_id}")
    print(f"  Stage: {logstage}")
    print(f"  Message: {message}")
    print(f"  Description: {description}")
