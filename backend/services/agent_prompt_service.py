import json
import logging
import os

import google.generativeai as genai
from dotenv import load_dotenv
from jsonschema import ValidationError, validate

from models.all_models import Defect, Requirement, TestCase

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

logger = logging.getLogger(__name__)

GENERATION_MODEL = "gemini-3.5-flash"

_CONTRACT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "docs", "agent_contract.json"
)
with open(_CONTRACT_PATH, encoding="utf-8") as _f:
    AGENT_CONTRACT_SCHEMA = json.load(_f)


def _tc_summary(tc: TestCase) -> str:
    return (
        f"- [id={tc.id}] [{tc.code}] {tc.title}\n"
        f"  Steps: {tc.steps or 'n/a'}\n  Expected: {tc.expected_result}"
    )


def _defect_summary(defect: Defect) -> str:
    return f"- [{defect.code}] ({defect.severity}/{defect.status}) {defect.title}"


def build_prompt(context: dict) -> str:
    req_current: Requirement = context["req_current"]
    req_previous: Requirement | None = context["req_previous"]
    proposed_description: str | None = context.get("proposed_description")

    sections = [
        "You are a QA impact-analysis assistant. Analyse how a requirement change "
        "affects existing and missing test coverage. Respond with ONLY a JSON object "
        "matching exactly this JSON Schema (no markdown fences, no commentary):",
        json.dumps(AGENT_CONTRACT_SCHEMA, indent=2),
    ]
    if proposed_description:
        sections.append(
            f"\n## Saved requirement content ({req_current.req_id} v{req_current.version}, "
            "before the proposed change)"
        )
        sections.append(f"Title: {req_current.title}\nDescription: {req_current.description}")
        sections.append(
            "\n## Proposed new content (not yet saved — analyse impact of changing to this)"
        )
        sections.append(f"Description: {proposed_description}")
    else:
        sections.append(f"\n## Current requirement ({req_current.req_id} v{req_current.version})")
        sections.append(f"Title: {req_current.title}\nDescription: {req_current.description}")
        if req_previous is not None:
            sections.append(
                f"\n## Previous version (v{req_previous.version})\n"
                f"Title: {req_previous.title}\nDescription: {req_previous.description}"
            )
    sections.append("\n## Linked test cases (tc_linked)")
    sections.append("\n".join(_tc_summary(tc) for tc in context["tc_linked"]) or "(none)")
    sections.append("\n## Semantically related test cases (tc_related, top 10)")
    sections.append("\n".join(_tc_summary(tc) for tc in context["tc_related"]) or "(none)")
    sections.append("\n## Defect history")
    sections.append("\n".join(_defect_summary(d) for d in context["defect_history"]) or "(none)")
    sections.append(
        '\nFor every tc_updates entry, set "testcase_id" to the exact id= value shown '
        "for that test case above (e.g. id=57 means testcase_id: 57) — never invent or "
        "derive an id from the code."
    )
    sections.append(
        f'\nSet top-level "req_id" to "{req_current.req_id}" and "version" to '
        f'{req_current.version}. Set "summary.linked_tc_count" to '
        f'{len(context["tc_linked"])}, "summary.related_tc_count" to '
        f'{len(context["tc_related"])}, "summary.defect_count" to '
        f'{len(context["defect_history"])}.'
    )
    return "\n".join(sections)


def _extract_json(raw_text: str) -> dict:
    text = raw_text.strip()
    if text.startswith("```"):
        text = text.split("```")[1]
        if text.startswith("json"):
            text = text[len("json"):]
    return json.loads(text)


def call_gemini_analyse(prompt: str) -> dict:
    model = genai.GenerativeModel(GENERATION_MODEL)

    last_error: Exception | None = None
    for attempt in range(2):
        try:
            response = model.generate_content(prompt)
            parsed = _extract_json(response.text)
            validate(instance=parsed, schema=AGENT_CONTRACT_SCHEMA)
            return parsed
        except (json.JSONDecodeError, ValidationError) as exc:
            last_error = exc
            logger.warning("Gemini output failed validation on attempt %s: %s", attempt + 1, exc)
        except Exception as exc:
            last_error = exc
            logger.warning("Gemini call failed on attempt %s: %s", attempt + 1, exc)
    raise ValueError(f"Gemini call/output failed after retry: {last_error}")
