export const LICENSE_EXPIRY_DATE = new Date('2026-04-20T00:00:00.000Z');

export function getLicenseStatus(): 'valid' | 'expiring_soon' | 'expired' {
  const now = new Date();
  if (now >= LICENSE_EXPIRY_DATE) return 'expired';
  const daysLeft = Math.ceil((LICENSE_EXPIRY_DATE.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (daysLeft <= 30) return 'expiring_soon';
  return 'valid';
}

export function getDaysUntilExpiry(): number {
  const now = new Date();
  return Math.ceil((LICENSE_EXPIRY_DATE.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
