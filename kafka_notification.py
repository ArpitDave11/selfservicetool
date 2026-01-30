"""
kafka_notification.py - Kafka Notification Service
Converted from Scala: KafkaNotification.scala
"""
import json
import uuid
from dhub_util import invoke_kafka_notification, current_formatted_time, logging_function


def send_kafka_notification(service_id, filename, source_id, notification_url,
                            reference_id, status, message, logstage,
                            payloadflag, src_data_file_nm, src_data_file_nm_lw):
    """
    Main function: Send Kafka notification with full workflow.

    Args:
        service_id: Service identifier
        filename: Data file name
        source_id: Data source identifier
        notification_url: Target Kafka/HTTP endpoint URL
        reference_id: Reference ID for correlation
        status: Processing status
        message: Business message/error description
        logstage: Logging stage identifier
        payloadflag: Flag indicating payload type (e.g., "ontology", "cacheload")
        src_data_file_nm: Source data file name
        src_data_file_nm_lw: Lowercase version of source file name

    Returns:
        Dict with success status, response_code, and message/error
    """
    # Generate IDs and timestamp
    correlation_id = str(uuid.uuid4())
    notf_timestamp = current_formatted_time("%Y-%m-%d-%H:%M:%S")

    # Build payload
    payload = json.dumps({
        "Header": {
            "Category": "Operation",
            "OperationType": "Available",
            "ServiceId": service_id,
            "ClientId": "UBS",
            "Company": "UBS",
            "ReferenceId": reference_id,
            "Domain": "Notify",
            "SubDomain": "File"
        },
        "Filters": [{
            "FileName": filename,
            "EventType": "Event",
            "SourceId": source_id,
            "Stage": "SLA"
        }],
        "Metadata": [{
            "CorrelationId": correlation_id,
            "FileName": filename
        }],
        "DataPolicy": [{
            "Timestamp": notf_timestamp,
            "Payload": {
                "Core": {
                    "CorrelationId": correlation_id
                },
                "Record": {
                    "Message": message,
                    "FileName": filename,
                    "Status": "SLA Breach"
                }
            }
        }]
    })

    # Resolve notification path based on payloadflag
    flag = payloadflag.lower()
    file = src_data_file_nm.lower()

    if flag == "ontology" and file == "partybr":
        path = f"/mnt/notification/{src_data_file_nm}_{src_data_file_nm_lw}-failed.json"
    elif flag == "cacheload":
        path = f"/mnt/notification/cacheload/{src_data_file_nm_lw}-failed"
    else:
        path = f"/mnt/notification/{src_data_file_nm_lw}-failed.json"

    # Send notification
    try:
        response_code = invoke_kafka_notification(payload, notification_url)
        print(f"Response code: {response_code}")

        if 200 <= response_code < 300:
            # Success handling
            print("Request successful")
            logging_function(
                "", src_data_file_nm, "DATAHUB", "KAFKA",
                "Kafka notification", status, "N/A", payload,
                "Message logged to Kafka successfully",
                source_id, "", "", logstage, "", ""
            )
            return {"success": True, "response_code": response_code}
        else:
            # Failure handling
            print(f"Request failed with status code: {response_code}")
            logging_function(
                "", src_data_file_nm, "DATAHUB", "KAFKA",
                "Kafka notification", "Failure", "N/A",
                str(response_code), "Message couldn't be logged to Kafka",
                source_id, "", "", logstage, "", ""
            )
            return {"success": False, "response_code": response_code}

    except Exception as e:
        # Connection error handling
        print(f"Request catch: {e}")
        logging_function(
            "", src_data_file_nm, "DATAHUB", "KAFKA",
            "Kafka notification", "Failure", "N/A",
            "Finally Block - Connection Error", f"Connection Error: {str(e)}",
            source_id, "", "", logstage, "", ""
        )
        return {"success": False, "error": str(e)}


# Example usage (for testing locally)
if __name__ == "__main__":
    # This will only run if executed directly, not when imported
    print("Kafka Notification Module - Run tests with: pytest test_kafka_notification.py -v")
