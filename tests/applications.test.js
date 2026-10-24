/**
 * ApplyOnce Phase 6 — Application Tracker Unit & Storage Tests
 *
 * Tests:
 *  - Record creation and normalization (URL auto-prefixing, default dates)
 *  - Schema validation (company, title, URL, status)
 *  - Status definitions and metadata
 *  - Statistics calculations (totals, pipeline stages, active applications)
 *  - Query, search, filter and sort logic
 *  - CRUD storage operations (localStorage fallback and chrome.storage.local)
 *
 * Run with: node --test tests/applications.test.js
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  STATUSES,
  STATUS_META,
  createRecord,
  validateRecord,
  computeStats,
  queryApplications,
  getAllApplications,
  addApplication,
  updateApplication,
  deleteApplication,
  clearAllApplications,
} from '../src/services/applications.js';

// Setup Mock Environment for Storage Tests
class MockLocalStorage {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

// Attach mock localStorage to global window
global.window = global.window || {};
global.window.localStorage = new MockLocalStorage();

describe('Phase 6: Schema & Statuses', () => {
  it('defines all 7 required pipeline statuses', () => {
    const required = [
      'Interested',
      'Preparing',
      'Applied',
      'Interview',
      'Offer',
      'Rejected',
      'Withdrawn',
    ];
    for (const status of required) {
      assert.ok(STATUSES.includes(status), `Status "${status}" should be in STATUSES`);
      assert.ok(STATUS_META[status], `STATUS_META should define metadata for "${status}"`);
      assert.ok(STATUS_META[status].color, `STATUS_META["${status}"] should define color`);
      assert.ok(STATUS_META[status].icon, `STATUS_META["${status}"] should define icon`);
    }
  });

  it('createRecord sets sensible defaults', () => {
    const record = createRecord({
      company: ' Acme Corp ',
      jobTitle: ' Software Engineer ',
    });

    assert.ok(record.id, 'Should generate an ID');
    assert.equal(record.company, 'Acme Corp', 'Should trim company');
    assert.equal(record.jobTitle, 'Software Engineer', 'Should trim title');
    assert.equal(record.status, 'Interested', 'Default status should be Interested');
    assert.equal(record.jobUrl, '');
    assert.equal(record.notes, '');
    assert.ok(record.createdAt, 'Should have createdAt ISO timestamp');
    assert.ok(record.updatedAt, 'Should have updatedAt ISO timestamp');
  });

  it('createRecord normalizes URL missing protocol', () => {
    const rec = createRecord({
      company: 'Google',
      jobTitle: 'SWE',
      jobUrl: 'careers.google.com/jobs/123',
    });
    assert.equal(rec.jobUrl, 'https://careers.google.com/jobs/123');
  });

  it('createRecord defaults appliedAt if status is Applied', () => {
    const rec = createRecord({
      company: 'Meta',
      jobTitle: 'SWE',
      status: 'Applied',
    });
    assert.ok(rec.appliedAt, 'appliedAt should default to current date when status is Applied');
    assert.match(rec.appliedAt, /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('Phase 6: Validation', () => {
  it('validates a complete, valid record', () => {
    const rec = createRecord({
      company: 'Stripe',
      jobTitle: 'Backend Engineer',
      jobUrl: 'https://stripe.com/jobs',
      status: 'Interview',
    });
    const result = validateRecord(rec);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it('fails validation when company is missing or empty', () => {
    const rec = createRecord({ company: '   ', jobTitle: 'Dev' });
    const result = validateRecord(rec);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Company name is required')));
  });

  it('fails validation when jobTitle is missing or empty', () => {
    const rec = createRecord({ company: 'Apple', jobTitle: '   ' });
    const result = validateRecord(rec);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Job title is required')));
  });

  it('fails validation on invalid URL', () => {
    const rec = createRecord({
      company: 'Apple',
      jobTitle: 'Engineer',
      jobUrl: 'http://',
    });
    const result = validateRecord(rec);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('valid URL')));
  });

  it('fails validation on unsupported status', () => {
    const rec = {
      company: 'Netflix',
      jobTitle: 'Engineer',
      status: 'UnknownStatus',
    };
    const result = validateRecord(rec);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes('Invalid status')));
  });
});

describe('Phase 6: Statistics Calculation', () => {
  it('computes correct statistics from records', () => {
    const apps = [
      createRecord({ company: 'A', jobTitle: 'T', status: 'Interested' }),
      createRecord({ company: 'B', jobTitle: 'T', status: 'Applied' }),
      createRecord({ company: 'C', jobTitle: 'T', status: 'Interview' }),
      createRecord({ company: 'D', jobTitle: 'T', status: 'Offer' }),
      createRecord({ company: 'E', jobTitle: 'T', status: 'Rejected' }),
    ];

    const stats = computeStats(apps);
    assert.equal(stats.total, 5);
    assert.equal(stats.byStatus.Interested, 1);
    assert.equal(stats.byStatus.Applied, 1);
    assert.equal(stats.byStatus.Interview, 1);
    assert.equal(stats.byStatus.Offer, 1);
    assert.equal(stats.byStatus.Rejected, 1);
    assert.equal(stats.byStatus.Withdrawn, 0);

    // activeCount = Interested + Preparing + Applied + Interview
    assert.equal(stats.activeCount, 3);
  });

  it('handles empty records cleanly in computeStats', () => {
    const stats = computeStats([]);
    assert.equal(stats.total, 0);
    assert.equal(stats.activeCount, 0);
  });
});

describe('Phase 6: Query, Search, Filter & Sort', () => {
  const dataset = [
    createRecord({ company: 'Vercel', jobTitle: 'Frontend Engineer', notes: 'Met recruiter on Twitter', status: 'Interview', appliedAt: '2026-03-01' }),
    createRecord({ company: 'Linear', jobTitle: 'Fullstack Engineer', notes: 'Fast response', status: 'Offer', appliedAt: '2026-03-10' }),
    createRecord({ company: 'GitHub', jobTitle: 'Security Analyst', notes: 'Referral from John', status: 'Applied', appliedAt: '2026-02-15' }),
    createRecord({ company: 'OpenAI', jobTitle: 'Prompt Engineer', notes: 'Take-home assignment', status: 'Preparing', appliedAt: '' }),
  ];

  it('filters by status', () => {
    const result = queryApplications(dataset, { statusFilter: 'Offer' });
    assert.equal(result.length, 1);
    assert.equal(result[0].company, 'Linear');
  });

  it('searches company, title, or notes case-insensitively', () => {
    // Search by company
    let result = queryApplications(dataset, { search: 'ver' });
    assert.equal(result.length, 1);
    assert.equal(result[0].company, 'Vercel');

    // Search by title
    result = queryApplications(dataset, { search: 'SECURITY' });
    assert.equal(result.length, 1);
    assert.equal(result[0].company, 'GitHub');

    // Search by notes
    result = queryApplications(dataset, { search: 'referral' });
    assert.equal(result.length, 1);
    assert.equal(result[0].company, 'GitHub');
  });

  it('sorts records ascending and descending', () => {
    const sortedAsc = queryApplications(dataset, { sortBy: 'company', sortDir: 'asc' });
    assert.equal(sortedAsc[0].company, 'GitHub');
    assert.equal(sortedAsc[sortedAsc.length - 1].company, 'Vercel');

    const sortedDesc = queryApplications(dataset, { sortBy: 'company', sortDir: 'desc' });
    assert.equal(sortedDesc[0].company, 'Vercel');
    assert.equal(sortedDesc[sortedDesc.length - 1].company, 'GitHub');
  });
});

describe('Phase 6: Storage CRUD Operations', () => {
  beforeEach(async () => {
    global.window.localStorage.clear();
    delete global.chrome;
  });

  it('starts with empty list and adds applications', async () => {
    const initial = await getAllApplications();
    assert.deepEqual(initial, []);

    const created = await addApplication({
      company: 'Figma',
      jobTitle: 'Product Engineer',
      status: 'Interested',
    });

    assert.ok(created.id);
    assert.equal(created.company, 'Figma');

    const all = await getAllApplications();
    assert.equal(all.length, 1);
    assert.equal(all[0].id, created.id);
  });

  it('updates an existing application', async () => {
    const created = await addApplication({
      company: 'Supabase',
      jobTitle: 'Developer Advocate',
      status: 'Applied',
    });

    const updated = await updateApplication(created.id, {
      status: 'Interview',
      notes: 'Passed first screening call',
    });

    assert.equal(updated.status, 'Interview');
    assert.equal(updated.notes, 'Passed first screening call');
    assert.equal(updated.id, created.id);

    const all = await getAllApplications();
    assert.equal(all.length, 1);
    assert.equal(all[0].status, 'Interview');
  });

  it('returns null when updating non-existent record', async () => {
    const res = await updateApplication('non-existent-id', { status: 'Offer' });
    assert.equal(res, null);
  });

  it('deletes an application by ID', async () => {
    const a1 = await addApplication({ company: 'Comp 1', jobTitle: 'Title 1' });
    const a2 = await addApplication({ company: 'Comp 2', jobTitle: 'Title 2' });

    assert.equal((await getAllApplications()).length, 2);

    const deleted = await deleteApplication(a1.id);
    assert.equal(deleted, true);

    const remaining = await getAllApplications();
    assert.equal(remaining.length, 1);
    assert.equal(remaining[0].id, a2.id);

    const notFound = await deleteApplication('random-id');
    assert.equal(notFound, false);
  });

  it('clears all applications', async () => {
    await addApplication({ company: 'A', jobTitle: 'A' });
    await addApplication({ company: 'B', jobTitle: 'B' });
    assert.equal((await getAllApplications()).length, 2);

    await clearAllApplications();
    assert.equal((await getAllApplications()).length, 0);
  });

  it('persists through chrome.storage.local mock when available', async () => {
    const mockStorage = {};
    global.chrome = {
      storage: {
        local: {
          get: (keys, cb) => {
            const res = {};
            for (const k of keys) res[k] = mockStorage[k];
            cb(res);
          },
          set: (obj, cb) => {
            Object.assign(mockStorage, obj);
            cb();
          },
        },
      },
    };

    const added = await addApplication({
      company: 'Vercel Chrome Storage',
      jobTitle: 'DevOps',
      status: 'Preparing',
    });

    const all = await getAllApplications();
    assert.equal(all.length, 1);
    assert.equal(all[0].company, 'Vercel Chrome Storage');
    assert.ok(mockStorage['applyonce_applications']);
  });
});
