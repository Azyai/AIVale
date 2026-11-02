"""Validate versioned development fixtures; this is not a production API validator."""

import argparse
import copy
import hashlib
import importlib.metadata
import json
from pathlib import Path
import re
import sys
from decimal import Decimal

from jsonschema import Draft202012Validator, FormatChecker, validators


INT64_MAX = 9223372036854775807
JSON_SAFE_MAX = 9007199254740991
FORMATS = FormatChecker()


@FORMATS.checks("int64-id")
def valid_id(value):
    return (
        isinstance(value, str)
        and re.fullmatch(r"[1-9][0-9]{0,18}", value) is not None
        and int(value) <= INT64_MAX
    )


@FORMATS.checks("quota-int64")
def valid_quota(value):
    return (
        isinstance(value, str)
        and re.fullmatch(r"0|[1-9][0-9]{0,18}", value) is not None
        and int(value) <= INT64_MAX
    )


@FORMATS.checks("event-id")
def valid_event_id(value):
    if not isinstance(value, str) or value.count(":") != 1:
        return False
    run_id, seq = value.split(":")
    return (
        valid_id(run_id)
        and re.fullmatch(r"[1-9][0-9]{0,15}", seq) is not None
        and int(seq) <= JSON_SAFE_MAX
    )


class Rejection(Exception):
    def __init__(self, code, detail):
        self.code = code
        self.detail = detail


def strict_integer(_checker, value):
    if isinstance(value, bool):
        return False
    if isinstance(value, int):
        return True
    return isinstance(value, Decimal) and value.is_finite() and value == value.to_integral_value()


ContractValidator = validators.extend(
    Draft202012Validator,
    type_checker=Draft202012Validator.TYPE_CHECKER.redefine("integer", strict_integer),
)


def reject_nonfinite(value):
    raise ValueError("Non-finite JSON number")


def load_json(raw):
    try:
        return json.loads(raw, parse_float=Decimal, parse_constant=reject_nonfinite)
    except ValueError as error:
        raise Rejection("AG_INVALID_ARGUMENT", "invalid JSON number or syntax") from error


def serialized_size(value):
    """Count compact UTF-8 JSON bytes without rounding Decimal values."""
    if isinstance(value, str):
        return len(json.dumps(value, ensure_ascii=False).encode("utf-8"))
    if isinstance(value, dict):
        return 2 + max(0, len(value) - 1) + sum(serialized_size(k) + 1 + serialized_size(v) for k, v in value.items())
    if isinstance(value, list):
        return 2 + max(0, len(value) - 1) + sum(serialized_size(item) for item in value)
    if isinstance(value, Decimal):
        if not value.is_finite():
            raise Rejection("AG_INVALID_ARGUMENT", "non-finite JSON value")
        return len(str(value).encode("ascii"))
    return len(json.dumps(value, ensure_ascii=False).encode("utf-8"))


def validate_instance(validator, value):
    error = next(validator.iter_errors(value), None)
    if error is not None:
        path = "$" + "".join(f"/{part}" for part in error.absolute_path)
        raise Rejection("AG_INVALID_ARGUMENT", f"schema {error.validator} at {path}")


def validate_scenario(document, schema, validator):
    validate_instance(validator, document)
    context = document["context"]
    workspace, actor, caller = (context[key] for key in ("workspace", "actor", "caller"))
    agent = document["published_agent"]
    version = agent["version"]
    body = document["create_request"]["body"]
    path_agent_id = document["create_request"]["path"].split("/")[3]
    if not valid_id(path_agent_id):
        raise Rejection("AG_INVALID_ARGUMENT", "invalid route agent ID")
    if actor["team_id"] != workspace["team_id"] or caller["team_id"] != workspace["team_id"]:
        raise Rejection("AG_RESOURCE_NOT_FOUND", "team context mismatch")
    if (
        agent["workspace_id"] != workspace["id"]
        or version["workspace_id"] != workspace["id"]
        or version["agent_id"] != agent["id"]
        or path_agent_id != agent["id"]
        or body.get("version_id", version["id"]) != version["id"]
    ):
        raise Rejection("AG_RESOURCE_NOT_FOUND", "resource or version mismatch")
    if (
        actor["role"] == "viewer"
        or caller["user_id"] != actor["user_id"]
        or "agent:run" not in caller["scopes"]
        or agent["id"] not in caller["allowed_agent_ids"]
        or version["config"]["model_policy"]["model"] not in caller["allowed_models"]
    ):
        raise Rejection("AG_PERMISSION_DENIED", "fixture permission intersection denied")

    configured = version["config"]["limits"]
    effective = {**configured, **body.get("limits", {})}
    for key, value in effective.items():
        if int(value) > int(configured[key]):
            raise Rejection("AG_BUDGET_EXCEEDED", f"override exceeds published {key}")
    if int(effective["max_cost_quota"]) == 0:
        raise Rejection("AG_BUDGET_EXCEEDED", "zero budget cannot start this model fixture")

    bounds = schema["x-contract"]["body_limits"]
    for value, limit in (
        (body["input"]["question"], bounds["inline_input_bytes"]),
        (version["config"]["instructions"], bounds["instructions_bytes"]),
    ):
        if len(value.encode("utf-8")) > limit:
            raise Rejection("AG_PAYLOAD_TOO_LARGE", "text exceeds UTF-8 byte budget")
    completed_result = document["completed"]["body"]["data"]["result"]
    for value in (body["input"], version["config"], completed_result):
        if serialized_size(value) > bounds["serialized_text_column_bytes"]:
            raise Rejection("AG_PAYLOAD_TOO_LARGE", "serialized TEXT exceeds byte budget")
    if serialized_size(body.get("metadata", {})) > bounds["metadata_bytes"]:
        raise Rejection("AG_PAYLOAD_TOO_LARGE", "metadata exceeds byte budget")
    if completed_result is not None and len(completed_result["text"].encode("utf-8")) > bounds["inline_output_bytes"]:
        raise Rejection("AG_PAYLOAD_TOO_LARGE", "output text exceeds UTF-8 byte budget")

    accepted = document["accepted"]["body"]["data"]
    completed = document["completed"]["body"]["data"]
    for run in (accepted, completed):
        if (
            run["workspace_id"] != workspace["id"]
            or run["agent_id"] != agent["id"]
            or run["agent_version_id"] != version["id"]
            or run["id"] != accepted["id"]
        ):
            raise Rejection("AG_RESOURCE_NOT_FOUND", "run attribution mismatch")
        if run["created_by"] != actor["user_id"] or run["caller_token_id"] != caller["token_id"]:
            raise Rejection("AG_PERMISSION_DENIED", "run actor mismatch")
        if run["funding_token_id"] != caller["token_id"]:
            raise Rejection("AG_FUNDING_UNAVAILABLE", "public run funding must be its caller")
        if run["limits"] != effective:
            raise Rejection("AG_INVALID_ARGUMENT", "effective limits snapshot mismatch")
    if accepted["status"] != "queued" or completed["status"] != "succeeded":
        raise Rejection("AG_INVALID_STATE", "wrong state for this accepted-to-success fixture")
    if not (completed["started_at"] is not None and completed["finished_at"] is not None
            and completed["created_at"] == accepted["created_at"]
            and completed["created_at"] <= completed["started_at"] <= completed["finished_at"]):
        raise Rejection("AG_INVALID_ARGUMENT", "invalid execution timeline")
    if completed["result"] is None or completed["usage_state"] != "final":
        raise Rejection("AG_INVALID_STATE", "successful fixture requires persisted result and final usage")

    previous_seq = 0
    previous_time = accepted["created_at"]
    first, last = document["events"][0], document["events"][-1]
    if first["seq"] != 1 or first["type"] != "run.queued" or first["payload"].get("status") != "queued":
        raise Rejection("AG_INVALID_STATE", "full fixture must start at run.queued sequence 1")
    started_events = [event for event in document["events"] if event["type"] == "run.started"]
    if len(started_events) != 1 or started_events[0]["payload"].get("status") != "running":
        raise Rejection("AG_INVALID_STATE", "full text fixture requires one run.started event")
    if started_events[0]["created_at"] != completed["started_at"]:
        raise Rejection("AG_INVALID_ARGUMENT", "started event does not match snapshot time")
    if last["type"] != "run.succeeded" or last["payload"].get("status") != completed["status"]:
        raise Rejection("AG_INVALID_STATE", "terminal event does not match completed snapshot")
    if first["created_at"] != accepted["created_at"] or last["created_at"] != completed["finished_at"]:
        raise Rejection("AG_INVALID_ARGUMENT", "full fixture event boundaries do not match timestamps")
    for event in document["events"]:
        if event["run_id"] != accepted["id"] or event["seq"] <= previous_seq or event["created_at"] < previous_time:
            raise Rejection("AG_INVALID_ARGUMENT", "wrong event run, order or timeline")
        if serialized_size(event["payload"]) > bounds["event_payload_bytes"]:
            raise Rejection("AG_PAYLOAD_TOO_LARGE", "event payload exceeds byte budget")
        previous_seq, previous_time = event["seq"], event["created_at"]
    cursor = document["resume_cursor"]
    if cursor["last_event_id"] is not None:
        cursor_run, header_seq = cursor["last_event_id"].split(":")
        if cursor_run != accepted["id"] or (cursor["after_seq"] is not None and cursor["after_seq"] != int(header_seq)):
            raise Rejection("AG_INVALID_ARGUMENT", "cursor run or sequence mismatch")
    for summary in document["page"]["data"]["items"]:
        if any(summary[key] != completed[key] for key in ("id", "agent_id", "agent_version_id", "workspace_id", "status")):
            raise Rejection("AG_INVALID_ARGUMENT", "page summary does not match run")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, help="Optional machine-readable verification record")
    args = parser.parse_args()
    folder = Path(__file__).resolve().parent / "v1"
    paths = [folder / name for name in ("core.schema.json", "text-agent.example.json", "cases.json")]
    schema, example, cases = [load_json(path.read_text(encoding="utf-8")) for path in paths]
    Draft202012Validator.check_schema(schema)
    # All references are local. Validation must never fetch a customer-controlled URL.
    pending = [schema]
    while pending:
        item = pending.pop()
        if isinstance(item, dict):
            if "$ref" in item and not item["$ref"].startswith("#/$defs/"):
                raise ValueError("Only local $defs references are allowed")
            pending.extend(item.values())
        elif isinstance(item, list):
            pending.extend(item)
    validator = ContractValidator(schema, format_checker=FORMATS)
    validate_scenario(example, schema, validator)
    catalog = schema["x-contract"]["errors"]
    if set(catalog) != set(schema["$defs"]["errorCode"]["enum"]):
        raise ValueError("Error code schema and HTTP catalog differ")
    if cases["contract_version"] != example["contract_version"] or example["contract_version"] != schema["x-contract"]["version"]:
        raise ValueError("Contract versions differ")
    results = []
    names = set()
    for case in cases["cases"]:
        if case["name"] in names:
            raise ValueError("Duplicate case name")
        names.add(case["name"])
        code, detail = None, "accepted"
        try:
            if "schema" in case:
                target = {"$schema": schema["$schema"], "$defs": schema["$defs"], "$ref": "#/$defs/" + case["schema"]}
                value = load_json(case["raw_json"]) if "raw_json" in case else case["value"]
                validate_instance(ContractValidator(target, format_checker=FORMATS), value)
            else:
                candidate = copy.deepcopy(example)
                changes = dict(case.get("changes", {}))
                for pointer, repeat in case.get("repeat_changes", {}).items():
                    changes[pointer] = repeat["text"] * repeat["count"]
                for pointer, value in changes.items():
                    parts = pointer.removeprefix("/").split("/")
                    parent = candidate
                    for part in parts[:-1]:
                        parent = parent[int(part)] if isinstance(parent, list) else parent[part]
                    key = int(parts[-1]) if isinstance(parent, list) else parts[-1]
                    parent[key] = value
                validate_scenario(candidate, schema, validator)
        except Rejection as error:
            code, detail = error.code, error.detail
        actual = {"valid": code is None}
        if code is not None:
            actual.update(http_status=catalog[code], code=code)
        results.append({"name": case["name"], "passed": actual == case["expected"], "expected": case["expected"], "actual": actual, "detail": detail})
    record = {
        "task_id": "P00-T02", "contract_version": schema["x-contract"]["version"],
        "python": sys.version.split()[0], "jsonschema": importlib.metadata.version("jsonschema"),
        "schema_valid": True, "canonical_example_valid": True,
        "case_count": len(results), "passed": sum(r["passed"] for r in results),
        "failed": sum(not r["passed"] for r in results),
        "positive_cases": sum(r["expected"]["valid"] for r in results),
        "negative_cases": sum(not r["expected"]["valid"] for r in results),
        "files_sha256": {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in paths},
        "results": results,
        "scope": "Offline contract validation only; no database, API, authentication or model execution."
    }
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(record, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({key: value for key, value in record.items() if key != "results"}, ensure_ascii=False, indent=2))
    for result in results:
        if not result["passed"]:
            print(json.dumps(result, ensure_ascii=False))
    return 1 if record["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
