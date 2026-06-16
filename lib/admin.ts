export const ADMIN_EMAILS = [
  "gmahajan@labelbox.com",
  "mbarros@labelbox.com",
  "rshori@labelbox.com",
  "hfell@labelbox.com"
] as const;

export function isAdminEmail(email: string | null | undefined) {
  return Boolean(email && ADMIN_EMAILS.includes(email.toLowerCase() as (typeof ADMIN_EMAILS)[number]));
}
