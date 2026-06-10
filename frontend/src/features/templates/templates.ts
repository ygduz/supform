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

const npsSurvey: FormSchema = {
  schemaVersion: "1.0",
  name: "nps_survey",
  title: "How are we doing?",
  description: "A 30-second check-in.",
  settings: { displayMode: "oneQuestionPerScreen", showProgressBar: true },
  pages: [
    {
      name: "page1",
      elements: [
        {
          type: "scale",
          name: "nps",
          label: "How likely are you to recommend us to a friend or colleague?",
          required: true,
          options: Array.from({ length: 11 }, (_, i) => ({ value: i, label: String(i) })),
        },
        {
          type: "single_choice",
          name: "reason_group",
          label: "What best describes you?",
          options: [
            { value: "promoter", label: "I love it" },
            { value: "passive", label: "It's fine" },
            { value: "detractor", label: "I've had problems" },
          ],
        },
        { type: "longtext", name: "comment", label: "Anything you'd like to add?" },
      ],
    },
  ],
};

const eventRegistration: FormSchema = {
  schemaVersion: "1.0",
  name: "event_registration",
  title: "Event registration",
  description: "Reserve your spot.",
  settings: { displayMode: "paged", showProgressBar: true },
  pages: [
    {
      name: "you",
      title: "About you",
      elements: [
        { type: "text", name: "full_name", label: "Full name", required: true },
        { type: "email", name: "email", label: "Email", required: true },
        { type: "text", name: "organization", label: "Organization" },
      ],
    },
    {
      name: "details",
      title: "Your visit",
      elements: [
        {
          type: "single_choice",
          name: "ticket",
          label: "Ticket type",
          required: true,
          options: [
            { value: "standard", label: "Standard" },
            { value: "student", label: "Student" },
            { value: "vip", label: "VIP" },
          ],
        },
        {
          type: "multi_choice",
          name: "sessions",
          label: "Which sessions will you attend?",
          options: [
            { value: "keynote", label: "Keynote" },
            { value: "workshop", label: "Workshop" },
            { value: "panel", label: "Panel" },
          ],
        },
        { type: "longtext", name: "accessibility", label: "Accessibility needs" },
      ],
    },
  ],
};

const orderForm: FormSchema = {
  schemaVersion: "1.0",
  name: "order_form",
  title: "Place an order",
  pages: [
    {
      name: "page1",
      elements: [
        { type: "text", name: "full_name", label: "Name", required: true },
        { type: "email", name: "email", label: "Email", required: true },
        {
          type: "dropdown",
          name: "product",
          label: "Product",
          required: true,
          options: [
            { value: "tshirt", label: "T-shirt" },
            { value: "hoodie", label: "Hoodie" },
            { value: "mug", label: "Mug" },
          ],
        },
        {
          type: "integer",
          name: "quantity",
          label: "Quantity",
          required: true,
          defaultValue: 1,
          validation: { min: 1, max: 100 },
        },
        { type: "longtext", name: "shipping_address", label: "Shipping address", required: true },
        { type: "text", name: "notes", label: "Order notes" },
      ],
    },
  ],
};

const volunteerSignup: FormSchema = {
  schemaVersion: "1.0",
  name: "volunteer_signup",
  title: "Volunteer sign-up",
  description: "Join the team — thank you!",
  pages: [
    {
      name: "page1",
      elements: [
        { type: "text", name: "full_name", label: "Full name", required: true },
        { type: "email", name: "email", label: "Email", required: true },
        { type: "text", name: "phone", label: "Phone" },
        {
          type: "multi_choice",
          name: "interests",
          label: "Where would you like to help?",
          required: true,
          options: [
            { value: "events", label: "Events" },
            { value: "outreach", label: "Outreach" },
            { value: "admin", label: "Admin" },
            { value: "fundraising", label: "Fundraising" },
          ],
        },
        {
          type: "single_choice",
          name: "availability",
          label: "Availability",
          options: [
            { value: "weekdays", label: "Weekdays" },
            { value: "weekends", label: "Weekends" },
            { value: "either", label: "Either" },
          ],
        },
        { type: "longtext", name: "experience", label: "Relevant experience (optional)" },
      ],
    },
  ],
};

const courseEvaluation: FormSchema = {
  schemaVersion: "1.0",
  name: "course_evaluation",
  title: "Course evaluation",
  pages: [
    {
      name: "page1",
      elements: [
        {
          type: "matrix",
          name: "ratings",
          label: "Please rate the following",
          rows: [
            { value: "content", label: "Course content" },
            { value: "instructor", label: "Instructor" },
            { value: "materials", label: "Materials" },
            { value: "pace", label: "Pace" },
          ],
          columns: [
            { value: "1", label: "Poor" },
            { value: "2", label: "Fair" },
            { value: "3", label: "Good" },
            { value: "4", label: "Excellent" },
          ],
        },
        {
          type: "boolean",
          name: "would_recommend",
          label: "Would you recommend this course?",
          required: true,
        },
        { type: "longtext", name: "improvements", label: "What could be improved?" },
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
    id: "nps",
    name: "NPS survey",
    description: "A one-question-per-screen Net Promoter Score check-in.",
    icon: "📈",
    schema: npsSurvey,
  },
  {
    id: "event-registration",
    name: "Event registration",
    description: "A multi-page registration with ticket types and sessions.",
    icon: "🎫",
    schema: eventRegistration,
  },
  {
    id: "order",
    name: "Order form",
    description: "Take product orders with quantity and shipping.",
    icon: "🛍️",
    schema: orderForm,
  },
  {
    id: "volunteer",
    name: "Volunteer sign-up",
    description: "Recruit volunteers with interests and availability.",
    icon: "🙌",
    schema: volunteerSignup,
  },
  {
    id: "course-evaluation",
    name: "Course evaluation",
    description: "A matrix-rated evaluation for a class or training.",
    icon: "🎓",
    schema: courseEvaluation,
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
