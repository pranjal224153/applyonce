/**
 * Validates an email address.
 * Empty or whitespace-only is valid (field is optional).
 */
export function isValidEmail(email) {
  if (!email || !email.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/**
 * Validates a URL.
 * Empty or whitespace-only is valid (field is optional).
 * Accepts URLs with or without http(s):// prefix.
 */
export function isValidUrl(url) {
  if (!url || !url.trim()) return true;
  const trimmed = url.trim();

  // Check if standard web URL
  try {
    const formatted = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(formatted);
    // Must have a valid hostname with at least one dot (e.g. github.com)
    return Boolean(
      parsed.hostname &&
      parsed.hostname.includes('.') &&
      !parsed.hostname.startsWith('.') &&
      !parsed.hostname.endsWith('.')
    );
  } catch {
    return false;
  }
}

/**
 * Validates the full profile and returns an object mapping field names to error messages.
 * If all valid, returns empty object {}.
 */
export function validateProfile(profile) {
  const errors = {};

  if (profile.email && !isValidEmail(profile.email)) {
    errors.email = 'Please enter a valid email address (e.g. name@domain.com)';
  }

  const urlFields = [
    { key: 'github', label: 'GitHub URL' },
    { key: 'linkedin', label: 'LinkedIn URL' },
    { key: 'leetcode', label: 'LeetCode URL' },
    { key: 'portfolio', label: 'Portfolio URL' },
  ];

  for (const { key, label } of urlFields) {
    if (profile[key] && !isValidUrl(profile[key])) {
      errors[key] = `Please enter a valid ${label} (e.g. https://${key}.com/...)`;
    }
  }

  if (profile.graduationYear) {
    const year = Number(profile.graduationYear);
    if (isNaN(year) || year < 1960 || year > 2040) {
      errors.graduationYear = 'Graduation year should be a 4-digit year (1960 - 2040)';
    }
  }

  // Validate custom links
  if (Array.isArray(profile.customLinks)) {
    profile.customLinks.forEach((link, idx) => {
      if (link.url && !isValidUrl(link.url)) {
        errors[`customLink_${link.id || idx}`] = `Invalid URL for "${link.label || 'Custom link'}"`;
      }
    });
  }

  return errors;
}
