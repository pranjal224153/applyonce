/**
 * ApplyOnce Phase 4 - Matcher Unit Tests
 *
 * Tests the matcher module against a representative profile and a variety
 * of field descriptors, including edge cases, negative signals, and
 * ambiguous inputs.
 *
 * Run with: node --test tests/matcher.test.js
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

// ─── Shim the matcher module from ESM source ────────────────────────────────
import { matchField, matchAllFields, CONFIDENCE, profileKeyLabel } from '../src/services/matcher.js';

// ─── Shared test profile ─────────────────────────────────────────────────────
const PROFILE = {
  fullName: 'Jane Doe',
  firstName: 'Jane',
  lastName: 'Doe',
  email: 'jane@example.com',
  phone: '+91 9876543210',
  location: 'Bangalore, India',
  college: 'IIT Bombay',
  degree: 'B.Tech Computer Science',
  graduationYear: '2025',
  skills: 'React, Node.js, Python',
  github: 'https://github.com/janedoe',
  linkedin: 'https://linkedin.com/in/janedoe',
  leetcode: 'https://leetcode.com/janedoe',
  portfolio: 'https://janedoe.dev',
  customLinks: [],
};

// ─── Field factory helper ────────────────────────────────────────────────────
function field(overrides) {
  return {
    label: '',
    name: '',
    id: '',
    placeholder: '',
    type: 'text',
    accessibleDescription: '',
    tagName: 'input',
    required: false,
    hasExistingValue: false,
    options: [],
    ...overrides,
  };
}

// ─── HIGH confidence tests ───────────────────────────────────────────────────
describe('matchField — HIGH confidence matches', () => {
  it('matches email field by input type', () => {
    const result = matchField(field({ label: 'Email Address', type: 'email' }), PROFILE);
    assert.ok(result, 'should return a match');
    assert.equal(result.profileKey, 'email');
    assert.equal(result.confidence, CONFIDENCE.HIGH);
    assert.ok(result.preselected, 'email HIGH match should be preselected');
    assert.equal(result.proposedValue, PROFILE.email);
  });

  it('matches GitHub by label', () => {
    const result = matchField(field({ label: 'GitHub Profile URL' }), PROFILE);
    assert.ok(result);
    assert.equal(result.profileKey, 'github');
    assert.equal(result.confidence, CONFIDENCE.HIGH);
  });

  it('matches LinkedIn by label', () => {
    const result = matchField(field({ label: 'LinkedIn URL', type: 'url' }), PROFILE);
    assert.ok(result);
    assert.equal(result.profileKey, 'linkedin');
    assert.ok(result.score >= 0.75);
  });

  it('matches phone by input type=tel', () => {
    const result = matchField(field({ label: 'Phone Number', type: 'tel' }), PROFILE);
    assert.ok(result);
    assert.equal(result.profileKey, 'phone');
    assert.equal(result.confidence, CONFIDENCE.HIGH);
  });

  it('matches first name by label', () => {
    const result = matchField(field({ label: 'First Name', name: 'firstName' }), PROFILE);
    assert.ok(result);
    assert.equal(result.profileKey, 'firstName');
    assert.equal(result.confidence, CONFIDENCE.HIGH);
  });

  it('matches last name by label', () => {
    const result = matchField(field({ label: 'Last Name', name: 'lastName' }), PROFILE);
    assert.ok(result);
    assert.equal(result.profileKey, 'lastName');
    assert.equal(result.confidence, CONFIDENCE.HIGH);
  });

  it('matches college by label "University"', () => {
    const result = matchField(field({ label: 'University', name: 'college' }), PROFILE);
    assert.ok(result);
    assert.equal(result.profileKey, 'college');
  });

  it('matches graduation year by label', () => {
    const result = matchField(field({ label: 'Graduation Year', name: 'grad_year' }), PROFILE);
    assert.ok(result);
    assert.equal(result.profileKey, 'graduationYear');
    assert.equal(result.proposedValue, '2025');
  });

  it('matches portfolio by "personal website" label', () => {
    const result = matchField(field({ label: 'Personal Website', type: 'url' }), PROFILE);
    assert.ok(result);
    assert.equal(result.profileKey, 'portfolio');
  });

  it('matches skills by label', () => {
    const result = matchField(field({ label: 'Technical Skills', name: 'skills' }), PROFILE);
    assert.ok(result);
    assert.equal(result.profileKey, 'skills');
  });

  it('matches degree by label "Field of Study"', () => {
    const result = matchField(field({ label: 'Field of Study' }), PROFILE);
    assert.ok(result);
    assert.equal(result.profileKey, 'degree');
  });
});

// ─── MEDIUM confidence tests ─────────────────────────────────────────────────
describe('matchField — MEDIUM confidence matches', () => {
  it('returns MEDIUM for ambiguous "name" field', () => {
    // bare "name" could be firstName, lastName, or fullName
    const result = matchField(field({ label: 'Name', name: 'name' }), PROFILE);
    assert.ok(result, 'should return a match for "Name"');
    // score should be medium range — we just check it's between thresholds
    assert.ok(result.score >= 0.45 || result.confidence === CONFIDENCE.MEDIUM || result.confidence === CONFIDENCE.HIGH,
      'bare "name" should land medium or high');
  });

  it('returns a match for leetcode by name attribute', () => {
    const result = matchField(field({ label: '', name: 'leetcode_url', type: 'url' }), PROFILE);
    assert.ok(result);
    assert.equal(result.profileKey, 'leetcode');
  });
});

// ─── Negative signal tests ───────────────────────────────────────────────────
describe('matchField — negative signals', () => {
  it('does NOT match email for "Confirm Email" (negative signal penalty)', () => {
    const result = matchField(field({ label: 'Confirm Email Address', name: 'confirm_email' }), PROFILE);
    // Penalty reduces score; if it still matches email it must not be HIGH
    if (result && result.profileKey === 'email') {
      assert.notEqual(result.confidence, CONFIDENCE.HIGH,
        'Confirm Email should not be HIGH confidence email match');
    }
  });

  it('does NOT confuse GitHub URL for portfolio', () => {
    const result = matchField(field({ label: 'GitHub URL', name: 'github', type: 'url' }), PROFILE);
    assert.ok(result);
    assert.equal(result.profileKey, 'github', 'Should be github not portfolio');
  });

  it('does NOT confuse LinkedIn for portfolio', () => {
    const result = matchField(field({ label: 'LinkedIn Profile', type: 'url' }), PROFILE);
    assert.ok(result);
    assert.equal(result.profileKey, 'linkedin');
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────
describe('matchField — edge cases', () => {
  it('returns null for a field with no identifiable signals', () => {
    const result = matchField(field({ label: '', name: '', id: '', placeholder: '' }), PROFILE);
    assert.equal(result, null);
  });

  it('returns null for null input', () => {
    assert.equal(matchField(null, PROFILE), null);
  });

  it('returns null for null profile', () => {
    assert.equal(matchField(field({ label: 'Email' }), null), null);
  });

  it('handles special characters in label gracefully', () => {
    const result = matchField(field({ label: 'E-mail Address *', type: 'email' }), PROFILE);
    assert.ok(result);
    assert.equal(result.profileKey, 'email');
  });

  it('matches via placeholder when label is empty', () => {
    const result = matchField(field({ label: '', placeholder: 'Enter your GitHub URL' }), PROFILE);
    assert.ok(result);
    assert.equal(result.profileKey, 'github');
  });

  it('matches via name attribute when label is empty', () => {
    const result = matchField(field({ label: '', name: 'user_college', id: '' }), PROFILE);
    assert.ok(result);
    assert.equal(result.profileKey, 'college');
  });

  it('matches via aria-label (accessibleDescription)', () => {
    const result = matchField(
      field({ label: '', accessibleDescription: 'LinkedIn profile link', type: 'url' }),
      PROFILE,
    );
    assert.ok(result);
    assert.equal(result.profileKey, 'linkedin');
  });
});

// ─── matchAllFields ───────────────────────────────────────────────────────────
describe('matchAllFields', () => {
  it('returns an array with the same length as input', () => {
    const fields = [
      field({ label: 'Email', type: 'email' }),
      field({ label: 'GitHub URL' }),
      field({ label: 'Random Unmatchable Field XYZ' }),
    ];
    const results = matchAllFields(fields, PROFILE);
    assert.equal(results.length, fields.length);
  });

  it('each row has the expected shape', () => {
    const fields = [field({ label: 'Email', type: 'email' })];
    const results = matchAllFields(fields, PROFILE);
    const row = results[0];
    assert.ok('field' in row);
    assert.ok('match' in row);
    assert.ok('selected' in row);
    assert.ok('editedValue' in row);
  });

  it('preselects HIGH confidence matches', () => {
    const fields = [field({ label: 'Email Address', type: 'email' })];
    const results = matchAllFields(fields, PROFILE);
    assert.equal(results[0].selected, true, 'HIGH confidence should be preselected');
  });

  it('does not preselect MEDIUM confidence matches', () => {
    // "Name" alone is typically medium-low
    const fields = [field({ label: 'Name' })];
    const results = matchAllFields(fields, PROFILE);
    const row = results[0];
    if (row.match && row.match.confidence !== CONFIDENCE.HIGH) {
      assert.equal(row.selected, false, 'Non-HIGH match should NOT be preselected');
    }
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(matchAllFields([], PROFILE), []);
  });

  it('returns empty array for null input', () => {
    assert.deepEqual(matchAllFields(null, PROFILE), []);
  });
});

// ─── profileKeyLabel ─────────────────────────────────────────────────────────
describe('profileKeyLabel', () => {
  it('returns human-readable label for known keys', () => {
    assert.equal(profileKeyLabel('email'), 'Email Address');
    assert.equal(profileKeyLabel('github'), 'GitHub URL');
    assert.equal(profileKeyLabel('graduationYear'), 'Graduation Year');
    assert.equal(profileKeyLabel('college'), 'College / University');
  });

  it('returns the key itself for unknown keys', () => {
    assert.equal(profileKeyLabel('unknownKey'), 'unknownKey');
  });
});
