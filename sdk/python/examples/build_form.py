"""Example: build a form in code and print its schema.

Run:  python examples/build_form.py
"""

from supform_sdk import Form, fields

form = Form("household_survey", title="Household survey",
            description="A code-first example.")

form.add(
    fields.SingleChoice("region", label="Region", options=["North", "South"], required=True),
    fields.Integer("age", label="Your age", min=0, max=120, required=True),
    fields.SingleChoice(
        "is_head", label="Are you the head of household?",
        options=["Yes", "No"], visible_if="age >= 18",
    ),
    fields.Rating("satisfaction", label="How satisfied are you?", scale=5),
)

if __name__ == "__main__":
    print(form)
    print(form.to_json())
