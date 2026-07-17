/** True when the email's domain is in the allowlist. Empty/unset allowlist allows all. */
export function isAllowedEmail(
  email: string | null | undefined,
  allowedDomainsCsv: string | undefined,
): boolean {
  const domains = (allowedDomainsCsv ?? "")
    .split(",")
    .map((d) => d.trim().toLowerCase())
    .filter(Boolean);
  if (domains.length === 0) return true;
  if (!email) return false;
  const domain = email.split("@").at(-1)?.toLowerCase();
  return domain != null && domains.includes(domain);
}
