/**
 * ApplyOnce Phase 7 — Storage, Backup, Privacy and Local AI Tests
 *
 * Tests:
 *  - Profile persistence, retrieval and schema sanitization
 *  - Missing profile values handling (empty strings, undefined properties)
 *  - Full JSON backup export structure and signature
 *  - Backup validation (rejection of corrupted JSON, invalid signature, invalid shapes)
 *  - Backup restoration (re-populating profile and application tracker)
 *  - Confirmed wipe of all local data
 *  - Local AI evaluation: toggle defaults to false, rule-based fallback always works,
 *    and benchmark probe runs cleanly.
 *
 * Run with: node --test tests/storage.test.js
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

import {
  getProfile,
  saveProfile,
  resetProfile,
} from '../src/services/storage.js';

import {
  exportAllData,
  validateBackupPayload,
  importBackupData,
  wipeAllLocalData,
  BACKUP_SIGNATURE,
  BACKUP_SCHEMA_VERSION,
} from '../src/services/backup.js';

import {
  addApplication,
  getAllApplications,
} from '../src/services/applications.js';

import {
  isLocalAiEnabled,
  setLocalAiEnabled,
  semanticMatchField,
  runLocalAiBenchmark,
  LOCAL_AI_INVESTIGATION_REPORT,
} from '../src/services/localAi.js';

// Setup Mock Environment
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

global.window = global.window || {};
global.window.localStorage = new MockLocalStorage();

describe('Phase 7: Profile Persistence & Sanitization', () => {
  beforeEach(async () => {
    global.window.localStorage.clear();
    delete global.chrome;
  });

  it('loads default profile when storage is empty', async () => {
    const profile = await getProfile();
    assert.ok(profile);
    assert.equal(typeof profile.fullName, 'string');
    assert.equal(typeof profile.email, 'string');
    assert.deepEqual(profile.customLinks, []);
  });

  it('saves and retrieves updated profile fields', async () => {
    await saveProfile({
      fullName: 'Alex Morgan',
      email: 'alex@example.com',
      github: 'https://github.com/alexmorgan',
      skills: 'TypeScript, React, Rust',
    });

    const retrieved = await getProfile();
    assert.equal(retrieved.fullName, 'Alex Morgan');
    assert.equal(retrieved.email, 'alex@example.com');
    assert.equal(retrieved.github, 'https://github.com/alexmorgan');
    assert.equal(retrieved.skills, 'TypeScript, React, Rust');
  });

  it('handles corrupted storage data by falling back to defaults', async () => {
    global.window.localStorage.setItem('applyonce_profile', '{ corrupted json ...');
    const profile = await getProfile();
    assert.ok(profile);
    assert.equal(profile.fullName, '');
  });

  it('sanitizes missing profile values to empty strings', async () => {
    await saveProfile({ fullName: 'Only Name Given' });
    const profile = await getProfile();
    assert.equal(profile.fullName, 'Only Name Given');
    assert.equal(profile.email, '');
    assert.equal(profile.phone, '');
    assert.equal(profile.github, '');
  });

  it('resets profile to defaults', async () => {
    await saveProfile({ fullName: 'Temporary User' });
    assert.equal((await getProfile()).fullName, 'Temporary User');

    await resetProfile();
    assert.equal((await getProfile()).fullName, '');
  });
});

describe('Phase 7: Backup Export, Import & Wiping', () => {
  beforeEach(async () => {
    global.window.localStorage.clear();
    delete global.chrome;
  });

  it('generates a full backup snapshot with correct signature and schema', async () => {
    await saveProfile({ fullName: 'Dev User', email: 'dev@test.com' });
    await addApplication({ company: 'Acme AI', jobTitle: 'Lead SWE' });

    const snapshot = await exportAllData();
    assert.equal(snapshot.signature, BACKUP_SIGNATURE);
    assert.equal(snapshot.version, BACKUP_SCHEMA_VERSION);
    assert.ok(snapshot.exportedAt);
    assert.equal(snapshot.data.profile.fullName, 'Dev User');
    assert.equal(snapshot.data.applications.length, 1);
    assert.equal(snapshot.data.applications[0].company, 'Acme AI');
  });

  it('validates backup payload structure and rejects invalid formats', () => {
    // Invalid JSON syntax
    let res = validateBackupPayload('{ not valid json');
    assert.equal(res.valid, false);

    // Missing signature
    res = validateBackupPayload({ signature: 'wrong-sig', data: {} });
    assert.equal(res.valid, false);
    assert.ok(res.errors.some((e) => e.includes('Invalid backup signature')));

    // Missing data object
    res = validateBackupPayload({ signature: BACKUP_SIGNATURE });
    assert.equal(res.valid, false);

    // Missing profile
    res = validateBackupPayload({
      signature: BACKUP_SIGNATURE,
      data: { applications: [] },
    });
    assert.equal(res.valid, false);

    // Missing applications array
    res = validateBackupPayload({
      signature: BACKUP_SIGNATURE,
      data: { profile: {} },
    });
    assert.equal(res.valid, false);
  });

  it('imports valid backup and restores both profile and applications', async () => {
    const backupObj = {
      signature: BACKUP_SIGNATURE,
      version: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        profile: {
          fullName: 'Restored Candidate',
          email: 'restored@example.com',
          github: 'https://github.com/restored',
        },
        applications: [
          { company: 'Company 1', jobTitle: 'Job 1', status: 'Applied' },
          { company: 'Company 2', jobTitle: 'Job 2', status: 'Interview' },
        ],
      },
    };

    const importRes = await importBackupData(backupObj);
    assert.equal(importRes.success, true);
    assert.equal(importRes.appsCount, 2);

    const loadedProfile = await getProfile();
    assert.equal(loadedProfile.fullName, 'Restored Candidate');
    assert.equal(loadedProfile.github, 'https://github.com/restored');

    const loadedApps = await getAllApplications();
    assert.equal(loadedApps.length, 2);
    assert.equal(loadedApps[0].company, 'Company 1');
  });

  it('wipes all local data completely upon confirmed wipe', async () => {
    await saveProfile({ fullName: 'Data To Wipe' });
    await addApplication({ company: 'Company To Wipe', jobTitle: 'SWE' });
    await setLocalAiEnabled(true);

    assert.equal((await getProfile()).fullName, 'Data To Wipe');
    assert.equal((await getAllApplications()).length, 1);

    const wipeRes = await wipeAllLocalData();
    assert.equal(wipeRes.success, true);

    const clearedProfile = await getProfile();
    assert.equal(clearedProfile.fullName, '');

    const clearedApps = await getAllApplications();
    assert.equal(clearedApps.length, 0);

    const aiStatus = await isLocalAiEnabled();
    assert.equal(aiStatus, false);
  });
});

describe('Phase 7: Local AI Investigation & Safe Fallback', () => {
  beforeEach(async () => {
    global.window.localStorage.clear();
  });

  it('keeps Local AI disabled by default', async () => {
    const enabled = await isLocalAiEnabled();
    assert.equal(enabled, false, 'Local AI must be disabled by default');
  });

  it('persists AI toggle change', async () => {
    await setLocalAiEnabled(true);
    assert.equal(await isLocalAiEnabled(), true);

    await setLocalAiEnabled(false);
    assert.equal(await isLocalAiEnabled(), false);
  });

  it('semanticMatchField delegates seamlessly to rule-based matcher with AI disabled', async () => {
    const profile = { email: 'developer@example.com' };
    const field = { label: 'Email Address', type: 'email' };

    const match = await semanticMatchField(field, profile);
    assert.ok(match, 'Should return a match');
    assert.equal(match.profileKey, 'email');
    assert.equal(match.proposedValue, 'developer@example.com');
  });

  it('semanticMatchField preserves rule-based fallback even when AI is toggled on', async () => {
    await setLocalAiEnabled(true);
    const profile = { github: 'https://github.com/janedoe' };
    const field = { label: 'GitHub URL', type: 'text' };

    const match = await semanticMatchField(field, profile);
    assert.ok(match);
    assert.equal(match.profileKey, 'github');
    assert.equal(match.proposedValue, 'https://github.com/janedoe');
  });

  it('runLocalAiBenchmark executes and returns latency & capability report', async () => {
    const benchmark = await runLocalAiBenchmark();
    assert.ok(benchmark.timestamp);
    assert.equal(typeof benchmark.wasmSupported, 'boolean');
    assert.equal(typeof benchmark.ruleBasedAverageLatencyMs, 'number');
    assert.ok(benchmark.verdict);
    assert.ok(benchmark.recommendation.includes('Retain rule-based matcher'));
  });

  it('LOCAL_AI_INVESTIGATION_REPORT documents model impact and technical barriers', () => {
    assert.ok(LOCAL_AI_INVESTIGATION_REPORT.modelSizeMB > 20);
    assert.ok(LOCAL_AI_INVESTIGATION_REPORT.technicalBarriers.length >= 4);
    assert.equal(LOCAL_AI_INVESTIGATION_REPORT.feasibilityStatus, 'INVESTIGATED_RULE_BASED_RETAINED');
  });
});
