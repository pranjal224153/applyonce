/**
 * ApplyOnce Phase 7 — Data Backup, Export, Import and Confirmed Wipe Service
 *
 * Provides complete data portability and privacy controls:
 *  - Full JSON export (profile + custom links + application tracker)
 *  - Validated backup import with schema verification
 *  - Confirmed factory wipe of all local data
 *
 * Guarantees 100% local operation with zero network dependencies.
 */

import { getProfile, saveProfile, resetProfile } from './storage.js';
import { getAllApplications, clearAllApplications, createRecord } from './applications.js';

export const BACKUP_SCHEMA_VERSION = '1.0.0';
export const BACKUP_SIGNATURE = 'applyonce-full-backup';

/**
 * Generate a complete snapshot of all stored ApplyOnce data.
 * @returns {Promise<object>}
 */
export async function exportAllData() {
  const [profile, applications] = await Promise.all([
    getProfile(),
    getAllApplications(),
  ]);

  return {
    signature: BACKUP_SIGNATURE,
    version: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      profile,
      applications,
    },
  };
}

/**
 * Export data and trigger a file download in the browser.
 * @param {string} [filename]
 * @returns {Promise<string>} filename that was downloaded
 */
export async function downloadBackupFile(filename) {
  const payload = await exportAllData();
  const jsonString = JSON.stringify(payload, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });

  const dateStr = new Date().toISOString().slice(0, 10);
  const targetName = filename || `applyonce-backup-${dateStr}.json`;

  if (typeof window !== 'undefined' && window.document) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = targetName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return targetName;
}

/**
 * Validate an imported backup object or JSON string.
 * @param {string|object} raw
 * @returns {{ valid: boolean, errors: string[], parsed?: object }}
 */
export function validateBackupPayload(raw) {
  const errors = [];
  let parsed = null;

  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      return { valid: false, errors: ['File contains invalid JSON syntax.'] };
    }
  } else if (raw && typeof raw === 'object') {
    parsed = raw;
  } else {
    return { valid: false, errors: ['Backup payload is empty or not an object.'] };
  }

  if (parsed.signature !== BACKUP_SIGNATURE) {
    errors.push(`Invalid backup signature. Expected "${BACKUP_SIGNATURE}".`);
  }

  if (!parsed.data || typeof parsed.data !== 'object') {
    errors.push('Backup payload is missing the "data" object.');
    return { valid: false, errors, parsed };
  }

  // Validate profile sub-object
  if (!parsed.data.profile || typeof parsed.data.profile !== 'object') {
    errors.push('Backup data is missing a valid "profile" object.');
  }

  // Validate applications sub-array
  if (!Array.isArray(parsed.data.applications)) {
    errors.push('Backup data is missing a valid "applications" array.');
  }

  return {
    valid: errors.length === 0,
    errors,
    parsed: errors.length === 0 ? parsed : null,
  };
}

/**
 * Import a validated backup payload into local storage.
 * @param {string|object} rawPayload
 * @returns {Promise<{ success: boolean, profileRestored: boolean, appsCount: number }>}
 */
export async function importBackupData(rawPayload) {
  const { valid, errors, parsed } = validateBackupPayload(rawPayload);
  if (!valid) {
    throw new Error(`Import failed: ${errors.join(' ')}`);
  }

  const { profile, applications } = parsed.data;

  // Restore profile
  await saveProfile(profile);

  // Restore applications
  await clearAllApplications();
  const sanitizedApps = applications.map(createRecord);

  // Save sanitized applications
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await new Promise((resolve, reject) => {
      chrome.storage.local.set({ applyonce_applications: sanitizedApps }, () => {
        if (chrome.runtime?.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(true);
      });
    });
  } else if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem('applyonce_applications', JSON.stringify(sanitizedApps));
  }

  return {
    success: true,
    profileRestored: true,
    appsCount: sanitizedApps.length,
  };
}

/**
 * Completely wipe all ApplyOnce local data (profile, links, tracker).
 * Requires confirmed user action.
 * @returns {Promise<{ success: boolean }>}
 */
export async function wipeAllLocalData() {
  await Promise.all([
    resetProfile(),
    clearAllApplications(),
  ]);

  // Clean any remaining applyonce keys in localStorage or chrome.storage
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await new Promise((resolve) => {
      chrome.storage.local.remove([
        'applyonce_profile',
        'applyonce_applications',
        'applyonce_ai_enabled',
      ], () => resolve(true));
    });
  } else if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem('applyonce_profile');
    window.localStorage.removeItem('applyonce_applications');
    window.localStorage.removeItem('applyonce_ai_enabled');
  }

  return { success: true };
}
