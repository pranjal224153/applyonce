import { DEFAULT_PROFILE } from '../data/defaultProfile.js';

const STORAGE_KEY = 'applyonce_profile';

/**
 * Checks if the Chrome extension storage API is available.
 */
function isChromeStorageAvailable() {
  return (
    typeof chrome !== 'undefined' &&
    Boolean(chrome.storage) &&
    Boolean(chrome.storage.local)
  );
}

/**
 * Retrieves the saved profile from chrome.storage.local (or localStorage fallback).
 * Guarantees a valid object merged with DEFAULT_PROFILE.
 * @returns {Promise<typeof DEFAULT_PROFILE>}
 */
export async function getProfile() {
  return new Promise((resolve, reject) => {
    try {
      if (isChromeStorageAvailable()) {
        chrome.storage.local.get([STORAGE_KEY], (result) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          const stored = result[STORAGE_KEY];
          const merged = sanitizeProfile(stored);
          resolve(merged);
        });
      } else {
        // Fallback for local browser testing / development
        const raw = window.localStorage.getItem(STORAGE_KEY);
        let parsed = null;
        try {
          parsed = raw ? JSON.parse(raw) : null;
        } catch {
          parsed = null;
        }
        resolve(sanitizeProfile(parsed));
      }
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Saves the given profile object to chrome.storage.local (or localStorage fallback).
 * @param {typeof DEFAULT_PROFILE} profile
 * @returns {Promise<boolean>}
 */
export async function saveProfile(profile) {
  return new Promise((resolve, reject) => {
    try {
      const sanitized = sanitizeProfile(profile);

      if (isChromeStorageAvailable()) {
        chrome.storage.local.set({ [STORAGE_KEY]: sanitized }, () => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          resolve(true);
        });
      } else {
        // Fallback for local browser testing / development
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
        resolve(true);
      }
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Resets the profile back to defaults in chrome.storage.local.
 * @returns {Promise<typeof DEFAULT_PROFILE>}
 */
export async function resetProfile() {
  return new Promise((resolve, reject) => {
    try {
      if (isChromeStorageAvailable()) {
        chrome.storage.local.remove([STORAGE_KEY], () => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          resolve({ ...DEFAULT_PROFILE, customLinks: [] });
        });
      } else {
        window.localStorage.removeItem(STORAGE_KEY);
        resolve({ ...DEFAULT_PROFILE, customLinks: [] });
      }
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Ensures a loaded or stored profile matches the expected schema with defaults.
 */
function sanitizeProfile(data) {
  if (!data || typeof data !== 'object') {
    return { ...DEFAULT_PROFILE, customLinks: [] };
  }

  return {
    ...DEFAULT_PROFILE,
    ...data,
    customLinks: Array.isArray(data.customLinks)
      ? data.customLinks.map((link) => ({
          id: link.id || String(Date.now() + Math.random()),
          label: typeof link.label === 'string' ? link.label : '',
          url: typeof link.url === 'string' ? link.url : '',
        }))
      : [],
  };
}
