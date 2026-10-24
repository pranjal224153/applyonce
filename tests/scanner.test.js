import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';
import {
  validateScanMessage,
  checkRestrictedUrl,
  scanPageDOM,
  SCAN_PROTOCOL,
  SCAN_PROTOCOL_VERSION,
  MESSAGE_TYPES,
} from '../src/services/scanner.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('Phase 3 Protocol: validateScanMessage correctly validates messages', () => {
  // Valid message
  const validMessage = {
    protocol: SCAN_PROTOCOL,
    version: SCAN_PROTOCOL_VERSION,
    type: MESSAGE_TYPES.SUCCESS,
    timestamp: Date.now(),
    payload: {
      url: 'https://example.com/jobs/apply',
      title: 'Apply Job',
      fieldCount: 2,
      fields: [
        {
          id: 'email',
          name: 'email',
          type: 'email',
          tagName: 'input',
          label: 'Email Address',
          placeholder: 'you@example.com',
          required: true,
          accessibleDescription: '',
        },
        {
          id: 'college',
          name: 'college',
          type: 'text',
          tagName: 'input',
          label: 'College / University',
          placeholder: 'Stanford',
          required: true,
          accessibleDescription: '',
        },
      ],
    },
  };
  assert.equal(validateScanMessage(validMessage), true);

  // Invalid protocol name
  assert.equal(
    validateScanMessage({ ...validMessage, protocol: 'UNKNOWN_PROTOCOL' }),
    false
  );

  // Invalid version
  assert.equal(
    validateScanMessage({ ...validMessage, version: '99.0' }),
    false
  );

  // Missing fields array
  assert.equal(
    validateScanMessage({
      ...validMessage,
      payload: { ...validMessage.payload, fields: null },
    }),
    false
  );

  // Missing fieldCount
  assert.equal(
    validateScanMessage({
      ...validMessage,
      payload: { ...validMessage.payload, fieldCount: undefined },
    }),
    false
  );

  // Malformed field
  assert.equal(
    validateScanMessage({
      ...validMessage,
      payload: { ...validMessage.payload, fields: [{ id: 123 }] },
    }),
    false
  );
});

test('Phase 3 Security: checkRestrictedUrl identifies internal & store pages', () => {
  // Internal Chrome pages must be restricted
  assert.equal(checkRestrictedUrl('chrome://extensions').restricted, true);
  assert.equal(checkRestrictedUrl('chrome://settings').restricted, true);
  assert.equal(checkRestrictedUrl('chrome-extension://abcdef/popup.html').restricted, true);
  assert.equal(checkRestrictedUrl('about:blank').restricted, true);
  assert.equal(checkRestrictedUrl('https://chromewebstore.google.com/detail/123').restricted, true);
  assert.equal(checkRestrictedUrl('https://chrome.google.com/webstore').restricted, true);

  // Standard web pages must NOT be restricted
  assert.equal(checkRestrictedUrl('https://boards.greenhouse.io/company/jobs/123').restricted, false);
  assert.equal(checkRestrictedUrl('https://jobs.lever.co/company/123').restricted, false);
  assert.equal(checkRestrictedUrl('http://localhost:5173/tests/test-form.html').restricted, false);
  assert.equal(checkRestrictedUrl('file:///C:/tests/test-form.html').restricted, false);
});

test('Phase 3 Scanner: detects email, GitHub, LinkedIn, and college on test-form.html without modifying them', () => {
  const htmlPath = path.join(__dirname, 'test-form.html');
  const htmlContent = fs.readFileSync(htmlPath, 'utf-8');

  const dom = new JSDOM(htmlContent, {
    url: 'http://localhost:5173/tests/test-form.html',
    runScripts: 'dangerously',
  });

  const { window } = dom;
  const { document } = window;

  // Snapshot initial values
  const emailBefore = document.getElementById('email').value;
  const githubBefore = document.getElementById('github').value;
  const linkedinBefore = document.getElementById('linkedin').value;
  const collegeBefore = document.getElementById('college').value;
  const fullNameBefore = document.getElementById('fullName').value;
  const notesBefore = document.getElementById('additionalNotes').value;
  const degreeBefore = document.getElementById('degree').value;

  assert.ok(emailBefore, 'Test form should have initial email value');
  assert.ok(githubBefore, 'Test form should have initial github value');
  assert.ok(linkedinBefore, 'Test form should have initial linkedin value');
  assert.ok(collegeBefore, 'Test form should have initial college value');

  // Bind scanner function to JSDOM window
  // Inject and execute scanPageDOM in JSDOM context
  const scanFn = new window.Function(
    `return (${scanPageDOM.toString()})();`
  );

  const response = scanFn();

  // Validate response message protocol
  assert.equal(validateScanMessage(response), true, 'Scan response should adhere to protocol');
  assert.equal(response.type, MESSAGE_TYPES.SUCCESS);

  const { fields, fieldCount } = response.payload;
  assert.ok(fieldCount >= 4, `Expected at least 4 fields detected, got ${fieldCount}`);

  // Find target fields
  const emailField = fields.find((f) => f.id === 'email' || f.name === 'email');
  const githubField = fields.find((f) => f.id === 'github' || f.name === 'github');
  const linkedinField = fields.find((f) => f.id === 'linkedin' || f.name === 'linkedin');
  const collegeField = fields.find((f) => f.id === 'college' || f.name === 'college');

  // Assert target field detection
  assert.ok(emailField, 'Scanner must detect email field');
  assert.equal(emailField.type, 'email');
  assert.ok(emailField.label.includes('Email Address'), 'Email field label should be extracted');
  assert.equal(emailField.required, true, 'Email field required flag should be detected');
  assert.ok(
    emailField.accessibleDescription.includes('confirmation notices'),
    'Email accessible description from aria-describedby should be captured'
  );

  assert.ok(githubField, 'Scanner must detect GitHub field');
  assert.equal(githubField.type, 'url');
  assert.ok(githubField.label.includes('GitHub Profile'), 'GitHub field label should be extracted');

  assert.ok(linkedinField, 'Scanner must detect LinkedIn field');
  assert.equal(linkedinField.type, 'url');
  assert.ok(linkedinField.label.includes('LinkedIn Profile'), 'LinkedIn field label should be extracted');

  assert.ok(collegeField, 'Scanner must detect college field');
  assert.ok(collegeField.label.includes('College / University'), 'College field label should be extracted');

  // Verify select and textarea detection
  const degreeField = fields.find((f) => f.id === 'degree');
  assert.ok(degreeField, 'Degree select field should be detected');
  assert.equal(degreeField.type, 'select');
  assert.ok(degreeField.options.length >= 4, 'Select options should be extracted');

  const notesField = fields.find((f) => f.id === 'additionalNotes');
  assert.ok(notesField, 'Textarea field should be detected');
  assert.equal(notesField.type, 'textarea');

  // Assert negative test cases: hidden and disabled inputs MUST be ignored
  const hiddenField = fields.find((f) => f.id === 'csrf_token');
  assert.equal(hiddenField, undefined, 'Hidden inputs (e.g., csrf_token) must be ignored');

  const disabledField = fields.find((f) => f.id === 'archived_reference');
  assert.equal(disabledField, undefined, 'Disabled inputs must be ignored');

  // CRITICAL SUCCESS CONDITION: values must NOT be modified or filled
  assert.equal(document.getElementById('email').value, emailBefore, 'Email value must be unchanged');
  assert.equal(document.getElementById('github').value, githubBefore, 'GitHub value must be unchanged');
  assert.equal(document.getElementById('linkedin').value, linkedinBefore, 'LinkedIn value must be unchanged');
  assert.equal(document.getElementById('college').value, collegeBefore, 'College value must be unchanged');
  assert.equal(document.getElementById('fullName').value, fullNameBefore, 'Full Name value must be unchanged');
  assert.equal(document.getElementById('additionalNotes').value, notesBefore, 'Notes value must be unchanged');
  assert.equal(document.getElementById('degree').value, degreeBefore, 'Degree value must be unchanged');
});
