import type { FormSchema } from "@/types/form-schema";

/** A ready-made form a user can open in the builder and customize. */
export interface Template {
  id: string;
  name: string;
  description: string;
  icon: string;
  schema: FormSchema;
}

const contactForm: FormSchema = {
  schemaVersion: "1.0",
  name: "contact_form",
  title: "Contact us",
  description: "Tell us how we can help and we'll get back to you.",
  pages: [
    {
      name: "page1",
      elements: [
        { type: "text", name: "full_name", label: "Your name", required: true },
        { type: "email", name: "email", label: "Email address", required: true },
        {
          type: "single_choice",
          name: "topic",
          label: "What is this about?",
          options: [
            { value: "support", label: "Support" },
            { value: "sales", label: "Sales" },
            { value: "feedback", label: "Feedback" },
            { value: "other", label: "Other" },
          ],
        },
        {
          type: "longtext",
          name: "message",
          label: "Message",
          required: true,
          placeholder: "How can we help?",
        },
      ],
    },
  ],
};

const eventRsvp: FormSchema = {
  schemaVersion: "1.0",
  name: "event_rsvp",
  title: "Event RSVP",
  description: "Let us know if you can make it.",
  pages: [
    {
      name: "page1",
      elements: [
        { type: "text", name: "full_name", label: "Full name", required: true },
        { type: "email", name: "email", label: "Email", required: true },
        {
          type: "boolean",
          name: "attending",
          label: "Will you attend?",
          required: true,
        },
        {
          type: "number",
          name: "guests",
          label: "Number of guests",
          visibleIf: "attending == true",
          validation: { min: 0, max: 10 },
        },
        {
          type: "text",
          name: "dietary",
          label: "Dietary requirements",
          visibleIf: "attending == true",
          placeholder: "e.g. vegetarian, allergies",
        },
      ],
    },
  ],
};

const customerFeedback: FormSchema = {
  schemaVersion: "1.0",
  name: "customer_feedback",
  title: "Customer feedback",
  description: "We'd love to hear about your experience.",
  pages: [
    {
      name: "page1",
      elements: [
        {
          type: "rating",
          name: "satisfaction",
          label: "How satisfied are you overall?",
          required: true,
          options: [{ value: 1 }, { value: 2 }, { value: 3 }, { value: 4 }, { value: 5 }],
        },
        {
          type: "scale",
          name: "recommend",
          label: "How likely are you to recommend us? (0–10)",
          required: true,
          options: Array.from({ length: 11 }, (_, i) => ({ value: i, label: String(i) })),
        },
        {
          type: "longtext",
          name: "improve",
          label: "What could we do better?",
          placeholder: "Optional",
        },
      ],
    },
  ],
};

const jobApplication: FormSchema = {
  schemaVersion: "1.0",
  name: "job_application",
  title: "Job application",
  description: "Apply to join our team.",
  pages: [
    {
      name: "page1",
      elements: [
        { type: "text", name: "full_name", label: "Full name", required: true },
        { type: "email", name: "email", label: "Email", required: true },
        {
          type: "dropdown",
          name: "position",
          label: "Position",
          required: true,
          options: [
            { value: "engineering", label: "Engineering" },
            { value: "design", label: "Design" },
            { value: "product", label: "Product" },
            { value: "operations", label: "Operations" },
          ],
        },
        {
          type: "longtext",
          name: "cover_letter",
          label: "Why are you a good fit?",
          required: true,
        },
        { type: "file", name: "resume", label: "Upload your CV / resume" },
      ],
    },
  ],
};

export const TEMPLATES: Template[] = [
  {
    id: "contact",
    name: "Contact form",
    description: "A simple way for people to get in touch.",
    icon: "✉️",
    schema: contactForm,
  },
  {
    id: "rsvp",
    name: "Event RSVP",
    description: "Collect attendance, guests, and dietary needs with conditional logic.",
    icon: "🎉",
    schema: eventRsvp,
  },
  {
    id: "feedback",
    name: "Customer feedback",
    description: "A rating, an NPS-style scale, and an open comment.",
    icon: "⭐",
    schema: customerFeedback,
  },
  {
    id: "job",
    name: "Job application",
    description: "Applicant details, role, cover letter, and a CV upload.",
    icon: "💼",
    schema: jobApplication,
  },
];
