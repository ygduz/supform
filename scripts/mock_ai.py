"""A tiny mock AI server for testing form generation locally — for free, no API key.

It speaks just enough of the Anthropic *and* OpenAI chat APIs to satisfy Supform's AI
client, returning a canned (valid) form schema. Point Supform at it:

    # Anthropic shape (default provider):
    SUPFORM_AI_API_KEY=anything
    SUPFORM_AI_BASE_URL=http://localhost:8088/v1/messages

    # OpenAI shape:
    SUPFORM_AI_PROVIDER=openai
    SUPFORM_AI_BASE_URL=http://localhost:8088/v1/chat/completions

Run it:  python scripts/mock_ai.py     (listens on :8088, stdlib only)
"""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, HTTPServer

# A valid Supform schema the mock always "generates".
FORM = {
    "schemaVersion": "1.0",
    "name": "mock_generated_form",
    "title": "Mock generated form",
    "description": "Returned by scripts/mock_ai.py — proof the AI flow works end to end.",
    "pages": [
        {
            "name": "page1",
            "elements": [
                {"type": "text", "name": "full_name", "label": "Your name", "required": True},
                {"type": "email", "name": "email", "label": "Email", "required": True},
                {
                    "type": "single_choice",
                    "name": "topic",
                    "label": "What's this about?",
                    "options": [
                        {"value": "support", "label": "Support"},
                        {"value": "sales", "label": "Sales"},
                    ],
                },
                {"type": "longtext", "name": "message", "label": "Message"},
            ],
        }
    ],
}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:  # noqa: N802 (http.server API)
        self.rfile.read(int(self.headers.get("Content-Length", 0)))
        text = json.dumps(FORM)
        if self.path.endswith("/chat/completions"):  # OpenAI shape
            payload = {"choices": [{"message": {"role": "assistant", "content": text}}]}
        else:  # Anthropic shape
            payload = {"content": [{"type": "text", "text": text}]}
        body = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args) -> None:  # keep the console quiet
        pass


if __name__ == "__main__":
    print("Mock AI server on http://localhost:8088  (Ctrl+C to stop)")
    HTTPServer(("0.0.0.0", 8088), Handler).serve_forever()
