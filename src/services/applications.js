/**
 * ApplyOnce Phase 6 — Application Tracker Storage Service
 *
 * CRUD operations for application records, persisted in chrome.storage.local
 * (with localStorage fallback for dev/testing).
 *
 * No browsing history is collected. No data is transmitted externally.
 * Records are only created via explicit user action ("Add application").
 */

const APPS_STORAGE_KEY = 'applyonce_applications';

/** All supported application statuses, in pipeline order. */
export const STATUSES = [
  'Interested',
  'Preparing',
  'Applied',
  'Interview',
  'Offer',
  'Rejected',
  'Withdrawn',
];

/** Status → visual metadata for the UI. */
export const STATUS_META = {
  Interested: { color: '#94a3b8', icon: '⭐', bg: 'rgba(148,163,184,0.12)' },
  Preparing:  { color: '#60a5fa', icon: '📝', bg: 'rgba(96,165,250,0.12)' },
  Applied:    { color: '#a78bfa', icon: '📨', bg: 'rgba(167,139,250,0.12)' },
  Interview:  { color: '#fbbf24', icon: '🎤', bg: 'rgba(251,191,36,0.12)' },
  Offer:      { color: '#34d399', icon: '🎉', bg: 'rgba(52,211,153,0.12)' },
  Rejected:   { color: '#f87171', icon: '✗',  bg: 'rgba(248,113,113,0.12)' },
  Withdrawn:  { color: '#64748b', icon: '↩',  bg: 'rgba(100,116,139,0.12)' },
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isChromeStorageAvailable() {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

function generateId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function nowISO() {
  return new Date().toISOString();
}

// ─── Schema ──────────────────────────────────────────────────────────────────

/**
 * Create a fresh, valid application record with defaults.
 * @param {Partial<AppRecord>} data
 * @returns {AppRecord}
 */
export function createRecord(data = {}) {
  const now = nowISO();
  let url = typeof data.jobUrl === 'string' ? data.jobUrl.trim() : '';
  if (url && !/^https?:\/\//i.test(url)) {
    try {
      new URL(`https://${url}`);
      url = `https://${url}`;
    } catch {
      // keep original
    }
  }

  return {
    id:        data.id || generateId(),
    company:   typeof data.company === 'string' ? data.company.trim() : '',
    jobTitle:  typeof data.jobTitle === 'string' ? data.jobTitle.trim() : '',
    jobUrl:    url,
    status:    STATUSES.includes(data.status) ? data.status : 'Interested',
    notes:     typeof data.notes === 'string' ? data.notes : '',
    appliedAt: typeof data.appliedAt === 'string' ? data.appliedAt : (data.status === 'Applied' ? now.slice(0, 10) : ''),
    createdAt: data.createdAt || now,
    updatedAt: data.updatedAt || now,
  };
}

/**
 * Validate a record's required fields. Returns { valid, errors }.
 */
export function validateRecord(record) {
  const errors = [];
  if (!record.company || record.company.trim().length === 0) {
    errors.push('Company name is required.');
  }
  if (!record.jobTitle || record.jobTitle.trim().length === 0) {
    errors.push('Job title is required.');
  }
  if (record.jobUrl && record.jobUrl.trim().length > 0) {
    try {
      new URL(record.jobUrl);
    } catch {
      errors.push('Job URL is not a valid URL.');
    }
  }
  if (record.status && !STATUSES.includes(record.status)) {
    errors.push(`Invalid status "${record.status}".`);
  }
  return { valid: errors.length === 0, errors };
}

// ─── Storage operations ──────────────────────────────────────────────────────

/** Read all application records from storage. */
export async function getAllApplications() {
  return new Promise((resolve, reject) => {
    try {
      if (isChromeStorageAvailable()) {
        chrome.storage.local.get([APPS_STORAGE_KEY], (result) => {
          if (chrome.runtime?.lastError) return reject(new Error(chrome.runtime.lastError.message));
          const raw = result ? result[APPS_STORAGE_KEY] : null;
          resolve(Array.isArray(raw) ? raw.map(createRecord) : []);
        });
      } else {
        const raw = window.localStorage.getItem(APPS_STORAGE_KEY);
        let parsed = [];
        try {
          parsed = raw ? JSON.parse(raw) : [];
        } catch {
          parsed = [];
        }
        resolve(Array.isArray(parsed) ? parsed.map(createRecord) : []);
      }
    } catch (err) {
      reject(err);
    }
  });
}

/** Write the full application list to storage. */
async function saveAllApplications(apps) {
  return new Promise((resolve, reject) => {
    try {
      if (isChromeStorageAvailable()) {
        chrome.storage.local.set({ [APPS_STORAGE_KEY]: apps }, () => {
          if (chrome.runtime?.lastError) return reject(new Error(chrome.runtime.lastError.message));
          resolve(true);
        });
      } else {
        window.localStorage.setItem(APPS_STORAGE_KEY, JSON.stringify(apps));
        resolve(true);
      }
    } catch (err) {
      reject(err);
    }
  });
}

/** Add a new application record. Returns the created record. */
export async function addApplication(data) {
  const record = createRecord(data);
  const all = await getAllApplications();
  all.unshift(record); // newest first
  await saveAllApplications(all);
  return record;
}

/** Update an existing record by ID. Returns the updated record or null. */
export async function updateApplication(id, updates) {
  const all = await getAllApplications();
  const idx = all.findIndex((a) => a.id === id);
  if (idx === -1) return null;

  const updated = createRecord({ ...all[idx], ...updates, id, updatedAt: nowISO() });
  all[idx] = updated;
  await saveAllApplications(all);
  return updated;
}

/** Delete an application by ID. Returns true if found and deleted. */
export async function deleteApplication(id) {
  const all = await getAllApplications();
  const filtered = all.filter((a) => a.id !== id);
  if (filtered.length === all.length) return false;
  await saveAllApplications(filtered);
  return true;
}

/** Delete all application records. */
export async function clearAllApplications() {
  await saveAllApplications([]);
}

// ─── Query helpers ───────────────────────────────────────────────────────────

/**
 * Compute simple statistics from a list of records.
 * @param {AppRecord[]} apps
 */
export function computeStats(apps) {
  if (!Array.isArray(apps) || apps.length === 0) {
    return { total: 0, byStatus: {}, activeCount: 0, thisWeek: 0 };
  }

  const byStatus = {};
  for (const s of STATUSES) byStatus[s] = 0;
  apps.forEach((a) => { if (byStatus[a.status] !== undefined) byStatus[a.status]++; });

  const activeStatuses = new Set(['Interested', 'Preparing', 'Applied', 'Interview']);
  const activeCount = apps.filter((a) => activeStatuses.has(a.status)).length;

  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thisWeek = apps.filter((a) => a.createdAt >= oneWeekAgo).length;

  return { total: apps.length, byStatus, activeCount, thisWeek };
}

/**
 * Filter, search and sort a list of records.
 * @param {AppRecord[]} apps
 * @param {{ search?: string, statusFilter?: string, sortBy?: string, sortDir?: 'asc'|'desc' }} opts
 */
export function queryApplications(apps, opts = {}) {
  let result = [...apps];

  // Status filter
  if (opts.statusFilter && opts.statusFilter !== 'all') {
    result = result.filter((a) => a.status === opts.statusFilter);
  }

  // Text search (company, title, notes)
  if (opts.search && opts.search.trim()) {
    const q = opts.search.toLowerCase().trim();
    result = result.filter((a) =>
      (a.company || '').toLowerCase().includes(q) ||
      (a.jobTitle || '').toLowerCase().includes(q) ||
      (a.notes || '').toLowerCase().includes(q),
    );
  }

  // Sort
  const sortBy = opts.sortBy || 'updatedAt';
  const dir = opts.sortDir === 'asc' ? 1 : -1;

  result.sort((a, b) => {
    const valA = a[sortBy] || '';
    const valB = b[sortBy] || '';
    if (valA < valB) return -1 * dir;
    if (valA > valB) return 1 * dir;
    return 0;
  });

  return result;
}
