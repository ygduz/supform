/**
 * Single-submission token stored in localStorage.
 * Prevents anonymous respondents from submitting the same form twice
 * when allowMultipleSubmissions is false.
 *
 * Tokens expire after 24h so a respondent can legitimately re-submit the next day
 * if the form owner re-opens submissions.
 */

const TTL_MS = 86_400_000; // 24 hours

const key = (formId: string) => `supform.submitted.${formId}`;

export function markSubmitted(formId: string): void {
  try {
    localStorage.setItem(key(formId), Date.now().toString());
  } catch {
    // localStorage may be unavailable (private mode, quota exceeded) — fail silently
  }
}

export function hasSubmitted(formId: string): boolean {
  try {
    const stored = localStorage.getItem(key(formId));
    if (!stored) return false;
    return Date.now() - Number(stored) < TTL_MS;
  } catch {
    return false;
  }
}

export function clearSubmitted(formId: string): void {
  try {
    localStorage.removeItem(key(formId));
  } catch {
    // ignore
  }
}
