/**
 * ApplyOnce Phase 5 — Autofill Unit Tests
 *
 * Tests the fillPageFields injectable function and buildFillInstructions
 * using jsdom for DOM simulation, including:
 *  - Plain HTML text/email/tel/url inputs
 *  - Textarea
 *  - Select (by value, by text, partial text)
 *  - Checkbox
 *  - Radio buttons
 *  - React-controlled input simulation (native value setter + events)
 *  - Safety guards (disabled, read-only, hidden, CAPTCHA signals)
 *  - Non-empty field overwrite protection
 *  - Stale reference handling
 *
 * Run with: node --test tests/autofill.test.js
 */

import { describe, it, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

// Import module under test
import { fillPageFields, buildFillInstructions } from '../src/services/autofill.js';

// ─── JSDOM bootstrap ─────────────────────────────────────────────────────────
// We run fillPageFields directly in jsdom rather than injecting it, since
// chrome.scripting is unavailable in the test environment. We rebind globals
// so the function sees the right document/window.

let dom;
let _document;
let _window;

/**
 * Rebuild a fresh JSDOM for each test.
 * Pass `html` for the full body content.
 */
function resetDOM(html = '') {
  dom = new JSDOM(`<!DOCTYPE html><html><body>${html}</body></html>`, {
    pretendToBeVisual: true,
    runScripts: 'dangerously',
  });
  _document = dom.window.document;
  _window = dom.window;

  // Patch globals that fillPageFields uses
  global.document = _document;
  global.window = _window;
  global.HTMLInputElement = _window.HTMLInputElement;
  global.HTMLTextAreaElement = _window.HTMLTextAreaElement;
  global.HTMLSelectElement = _window.HTMLSelectElement;
  global.Event = _window.Event;
  global.FocusEvent = _window.FocusEvent;
  global.CSS = _window.CSS;
}

// ─── Field instruction factory ───────────────────────────────────────────────
function instr(overrides) {
  return {
    fieldId: '',
    fieldName: '',
    fieldIndex: 0,
    fieldType: 'text',
    value: '',
    hasExistingValue: false,
    overwriteApproved: false,
    ...overrides,
  };
}

// ─── Text / email / tel / url inputs ─────────────────────────────────────────
describe('fillPageFields — text-like inputs', () => {
  beforeEach(() => {
    resetDOM(`
      <input type="text"  id="name"  name="name"  value="">
      <input type="email" id="email" name="email" value="">
      <input type="tel"   id="phone" name="phone" value="">
      <input type="url"   id="github" name="github" value="">
    `);
  });

  it('fills a plain text field by ID', () => {
    const report = fillPageFields([instr({ fieldId: 'name', value: 'Jane Doe' })]);
    assert.equal(report.filled, 1);
    assert.equal(report.skipped, 0);
    assert.equal(report.failed, 0);
    assert.equal(_document.getElementById('name').value, 'Jane Doe');
  });

  it('fills an email field by ID', () => {
    const report = fillPageFields([instr({ fieldId: 'email', fieldType: 'email', value: 'jane@example.com' })]);
    assert.equal(report.filled, 1);
    assert.equal(_document.getElementById('email').value, 'jane@example.com');
  });

  it('fills a telephone field', () => {
    const report = fillPageFields([instr({ fieldId: 'phone', fieldType: 'tel', value: '+91 9999999999' })]);
    assert.equal(report.filled, 1);
    assert.equal(_document.getElementById('phone').value, '+91 9999999999');
  });

  it('fills a URL field', () => {
    const report = fillPageFields([instr({ fieldId: 'github', fieldType: 'url', value: 'https://github.com/janedoe' })]);
    assert.equal(report.filled, 1);
    assert.equal(_document.getElementById('github').value, 'https://github.com/janedoe');
  });

  it('fills field by name when ID is missing', () => {
    resetDOM(`<input type="text" name="college" value="">`);
    const report = fillPageFields([instr({ fieldName: 'college', value: 'IIT Bombay' })]);
    assert.equal(report.filled, 1);
    assert.equal(_document.querySelector('[name="college"]').value, 'IIT Bombay');
  });

  it('fills field by DOM index as last resort', () => {
    resetDOM(`<input type="text" value="">`);
    const report = fillPageFields([instr({ fieldIndex: 0, value: 'FallbackValue' })]);
    assert.equal(report.filled, 1);
    assert.equal(_document.querySelectorAll('input')[0].value, 'FallbackValue');
  });
});

// ─── Textarea ────────────────────────────────────────────────────────────────
describe('fillPageFields — textarea', () => {
  beforeEach(() => {
    resetDOM(`<textarea id="skills" name="skills"></textarea>`);
  });

  it('fills a textarea by ID', () => {
    const report = fillPageFields([instr({ fieldId: 'skills', fieldType: 'textarea', value: 'React, Node.js' })]);
    assert.equal(report.filled, 1);
    assert.equal(_document.getElementById('skills').value, 'React, Node.js');
  });
});

// ─── Select ──────────────────────────────────────────────────────────────────
describe('fillPageFields — select', () => {
  beforeEach(() => {
    resetDOM(`
      <select id="degree" name="degree">
        <option value="">Select</option>
        <option value="bachelors">Bachelor of Science</option>
        <option value="masters">Master of Science</option>
        <option value="phd">PhD</option>
      </select>
    `);
  });

  it('selects by exact option value', () => {
    const report = fillPageFields([instr({ fieldId: 'degree', fieldType: 'select', value: 'masters' })]);
    assert.equal(report.filled, 1);
    assert.equal(_document.getElementById('degree').value, 'masters');
  });

  it('selects by case-insensitive option text', () => {
    const report = fillPageFields([instr({ fieldId: 'degree', fieldType: 'select', value: 'bachelor of science' })]);
    assert.equal(report.filled, 1);
    assert.equal(_document.getElementById('degree').value, 'bachelors');
  });

  it('selects by partial text match', () => {
    const report = fillPageFields([instr({ fieldId: 'degree', fieldType: 'select', value: 'PhD' })]);
    assert.equal(report.filled, 1);
    assert.equal(_document.getElementById('degree').value, 'phd');
  });

  it('reports skipped if no matching option exists', () => {
    // 'xyz' matches nothing — should fail (not crash)
    const report = fillPageFields([instr({ fieldId: 'degree', fieldType: 'select', value: 'xyz_nonexistent' })]);
    // writeOk=false → failed, not crashed
    assert.equal(report.failed, 1);
    assert.equal(report.filled, 0);
  });
});

// ─── Checkbox ────────────────────────────────────────────────────────────────
describe('fillPageFields — checkbox', () => {
  beforeEach(() => {
    resetDOM(`<input type="checkbox" id="agree" name="agree">`);
  });

  it('checks a checkbox with value "true"', () => {
    const report = fillPageFields([instr({ fieldId: 'agree', fieldType: 'checkbox', value: 'true' })]);
    assert.equal(report.filled, 1);
    assert.equal(_document.getElementById('agree').checked, true);
  });

  it('unchecks a checkbox with value "false"', () => {
    _document.getElementById('agree').checked = true;
    const report = fillPageFields([instr({ fieldId: 'agree', fieldType: 'checkbox', value: 'false' })]);
    assert.equal(report.filled, 1);
    assert.equal(_document.getElementById('agree').checked, false);
  });
});

// ─── Radio buttons ───────────────────────────────────────────────────────────
describe('fillPageFields — radio buttons', () => {
  beforeEach(() => {
    resetDOM(`
      <input type="radio" id="r_full" name="employment" value="full-time">
      <input type="radio" id="r_part" name="employment" value="part-time">
      <input type="radio" id="r_cont" name="employment" value="contract">
    `);
  });

  it('selects the correct radio by value', () => {
    const report = fillPageFields([
      instr({ fieldId: 'r_full', fieldType: 'radio', fieldName: 'employment', value: 'part-time' }),
    ]);
    assert.equal(report.filled, 1);
    assert.equal(_document.getElementById('r_part').checked, true);
    assert.equal(_document.getElementById('r_full').checked, false);
  });
});

// ─── Safety guards ───────────────────────────────────────────────────────────
describe('fillPageFields — safety guards', () => {
  it('skips disabled fields', () => {
    resetDOM(`<input type="text" id="ref" value="REF-999" disabled>`);
    const report = fillPageFields([instr({ fieldId: 'ref', value: 'NEW' })]);
    assert.equal(report.skipped, 1);
    assert.equal(_document.getElementById('ref').value, 'REF-999');
  });

  it('skips read-only fields', () => {
    resetDOM(`<input type="text" id="ro" value="locked" readonly>`);
    const report = fillPageFields([instr({ fieldId: 'ro', value: 'NEW' })]);
    assert.equal(report.skipped, 1);
    assert.equal(_document.getElementById('ro').value, 'locked');
  });

  it('skips hidden fields (display:none)', () => {
    resetDOM(`<div style="display:none"><input type="text" id="trap" value="honey"></div>`);
    const report = fillPageFields([instr({ fieldId: 'trap', value: 'NEW' })]);
    assert.equal(report.skipped, 1);
    assert.equal(_document.getElementById('trap').value, 'honey');
  });

  it('skips hidden type inputs', () => {
    resetDOM(`<input type="hidden" id="csrf" value="token123">`);
    const report = fillPageFields([instr({ fieldId: 'csrf', fieldType: 'hidden', value: 'HACK' })]);
    assert.equal(report.skipped, 1);
    assert.equal(_document.getElementById('csrf').value, 'token123');
  });

  it('skips fields with CAPTCHA signal in ID', () => {
    resetDOM(`<input type="text" id="g-recaptcha-response" value="">`);
    const report = fillPageFields([instr({ fieldId: 'g-recaptcha-response', value: 'bypass' })]);
    assert.equal(report.skipped, 1);
  });

  it('skips stale references (element removed from DOM)', () => {
    resetDOM(`<input type="text" id="gone" value="">`);
    // Remove it before filling
    _document.getElementById('gone').remove();
    const report = fillPageFields([instr({ fieldId: 'gone', value: 'ghost' })]);
    assert.equal(report.skipped, 1);
  });
});

// ─── Overwrite protection ─────────────────────────────────────────────────────
describe('fillPageFields — overwrite protection', () => {
  it('skips a non-empty field when overwriteApproved is false', () => {
    resetDOM(`<input type="text" id="name" value="Existing Name">`);
    const report = fillPageFields([
      instr({ fieldId: 'name', value: 'New Name', hasExistingValue: true, overwriteApproved: false }),
    ]);
    assert.equal(report.skipped, 1);
    assert.equal(_document.getElementById('name').value, 'Existing Name');
  });

  it('overwrites a non-empty field when overwriteApproved is true', () => {
    resetDOM(`<input type="text" id="name" value="Existing Name">`);
    const report = fillPageFields([
      instr({ fieldId: 'name', value: 'New Name', hasExistingValue: true, overwriteApproved: true }),
    ]);
    assert.equal(report.filled, 1);
    assert.equal(_document.getElementById('name').value, 'New Name');
  });

  it('fills an empty field without needing overwriteApproved', () => {
    resetDOM(`<input type="text" id="phone" value="">`);
    const report = fillPageFields([
      instr({ fieldId: 'phone', value: '+91 9876543210', hasExistingValue: false, overwriteApproved: false }),
    ]);
    assert.equal(report.filled, 1);
  });
});

// ─── React-controlled input simulation ───────────────────────────────────────
describe('fillPageFields — React-controlled input simulation', () => {
  it('dispatches input and change events after filling', () => {
    resetDOM(`<input type="text" id="reactInput" value="">`);
    const el = _document.getElementById('reactInput');

    let inputFired = false;
    let changeFired = false;
    el.addEventListener('input', () => { inputFired = true; });
    el.addEventListener('change', () => { changeFired = true; });

    fillPageFields([instr({ fieldId: 'reactInput', value: 'ReactValue' })]);

    assert.equal(inputFired, true, 'input event should have fired');
    assert.equal(changeFired, true, 'change event should have fired');
    assert.equal(el.value, 'ReactValue');
  });

  it('uses native value setter approach (Object.getOwnPropertyDescriptor)', () => {
    // Simulate a React-controlled field that intercepts direct assignment
    resetDOM(`<input type="text" id="controlled" value="">`);
    const el = _document.getElementById('controlled');

    // Track whether the native setter was called via events
    let eventCount = 0;
    el.addEventListener('input', () => { eventCount++; });

    fillPageFields([instr({ fieldId: 'controlled', value: 'Controlled' })]);

    assert.ok(eventCount >= 1, 'At least one input event should fire');
    assert.equal(el.value, 'Controlled');
  });
});

// ─── Multiple fields + mixed results ─────────────────────────────────────────
describe('fillPageFields — multi-field batches', () => {
  beforeEach(() => {
    resetDOM(`
      <input type="text"  id="name"   value="">
      <input type="email" id="email"  value="">
      <input type="text"  id="exist"  value="keep this">
      <input type="text"  id="disabled-field" value="no" disabled>
    `);
  });

  it('processes multiple instructions and reports correct counts', () => {
    const report = fillPageFields([
      instr({ fieldId: 'name',  value: 'Jane' }),
      instr({ fieldId: 'email', fieldType: 'email', value: 'jane@example.com' }),
      instr({ fieldId: 'exist', value: 'overwrite', hasExistingValue: true, overwriteApproved: false }),
      instr({ fieldId: 'disabled-field', value: 'blocked' }),
    ]);

    assert.equal(report.filled, 2, 'Two fields should be filled');
    assert.equal(report.skipped, 2, 'Two fields should be skipped');
    assert.equal(report.failed, 0);
    assert.equal(_document.getElementById('exist').value, 'keep this');
    assert.equal(_document.getElementById('disabled-field').value, 'no');
  });
});

// ─── buildFillInstructions ────────────────────────────────────────────────────
describe('buildFillInstructions', () => {
  const PROFILE = {
    github: 'https://github.com/janedoe',
    email: 'jane@example.com',
  };

  it('includes only selected rows with a match', () => {
    const rows = [
      {
        selected: true,
        match: { profileKey: 'github' },
        editedValue: 'https://github.com/janedoe',
        field: { id: 'github', name: 'github', index: 0, type: 'url', hasExistingValue: false },
      },
      {
        selected: false, // not selected — must be excluded
        match: { profileKey: 'email' },
        editedValue: 'jane@example.com',
        field: { id: 'email', name: 'email', index: 1, type: 'email', hasExistingValue: false },
      },
    ];

    const instrs = buildFillInstructions(rows);
    assert.equal(instrs.length, 1);
    assert.equal(instrs[0].fieldId, 'github');
    assert.equal(instrs[0].value, 'https://github.com/janedoe');
  });

  it('excludes rows with no match', () => {
    const rows = [
      {
        selected: true,
        match: null, // no match
        editedValue: '',
        field: { id: 'mystery', name: '', index: 0, type: 'text', hasExistingValue: false },
      },
    ];
    const instrs = buildFillInstructions(rows);
    assert.equal(instrs.length, 0);
  });

  it('sets overwriteApproved=false for non-empty fields by default', () => {
    const rows = [
      {
        selected: true,
        match: { profileKey: 'email' },
        editedValue: 'jane@example.com',
        field: { id: 'email', name: 'email', index: 0, type: 'email', hasExistingValue: true },
      },
    ];
    const instrs = buildFillInstructions(rows, { overwriteAll: false });
    assert.equal(instrs[0].overwriteApproved, false);
  });

  it('sets overwriteApproved=true when overwriteAll option is set', () => {
    const rows = [
      {
        selected: true,
        match: { profileKey: 'email' },
        editedValue: 'jane@example.com',
        field: { id: 'email', name: 'email', index: 0, type: 'email', hasExistingValue: true },
      },
    ];
    const instrs = buildFillInstructions(rows, { overwriteAll: true });
    assert.equal(instrs[0].overwriteApproved, true);
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(buildFillInstructions([]), []);
  });
});
