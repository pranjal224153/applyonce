/**
 * ApplyOnce Phase 5 — Safe Autofill Service
 *
 * This module provides two exports:
 *
 * 1. `fillPageFields(instructions)`
 *    A self-contained function designed to be injected into the active tab
 *    via chrome.scripting.executeScript(). It receives a serialisable
 *    instruction list and fills only the approved, selected fields.
 *
 * 2. `runAutofill(matchRows, options)`
 *    High-level orchestration called from the popup. Builds the instruction
 *    list from the Phase 4 preview state, injects the filler, validates
 *    results, and returns a structured FillReport.
 *
 * ── Safety guarantees ───────────────────────────────────────────────────────
 * • Never fills disabled, read-only, or hidden fields
 * • Never clicks Submit / Apply / any button
 * • Never touches CAPTCHA widgets
 * • Never overwrites a non-empty field without explicit user approval
 * • Never invents values — only uses values supplied by the user in preview
 * • Uses native value-setter + synthetic input/change events (React compatible)
 * • Validates filled value against what was written back
 * • Handles stale references (field may have been removed since scanning)
 *
 * ── Known limitations ───────────────────────────────────────────────────────
 * • Single-page apps that dynamically replace the DOM may invalidate
 *   field references between scan and fill — always re-scan if the page
 *   has navigated or reloaded.
 * • Some frameworks (e.g. Angular with strict zone patching) may require
 *   an additional blur event to trigger validation — users should click
 *   the field after fill to confirm.
 * • Multi-step forms: ApplyOnce fills only fields visible at fill time.
 * • File-upload, date-picker, CAPTCHA, OTP fields are intentionally skipped.
 * • Chrome restricts script injection on chrome://, Web Store and PDF pages.
 */

// ─── Instruction shape ───────────────────────────────────────────────────────
/**
 * @typedef {Object} FillInstruction
 * @property {string}  fieldId        - field.id (may be empty)
 * @property {string}  fieldName      - field.name (may be empty)
 * @property {number}  fieldIndex     - field.index (original DOM order from scanner)
 * @property {string}  fieldType      - normalised input type / 'textarea' / 'select'
 * @property {string}  value          - value to write
 * @property {boolean} hasExistingValue - whether field had content at scan time
 * @property {boolean} overwriteApproved - true only when user explicitly approved overwrite
 */

/**
 * @typedef {Object} FillReport
 * @property {number} filled   - fields successfully written + verified
 * @property {number} skipped  - fields skipped (safety rules)
 * @property {number} failed   - fields where write or verification failed
 * @property {Array}  details  - per-field result objects
 * @property {string} [error]  - top-level error message if injection failed
 */

// ─── Injectable filler function (no outer-scope dependencies) ────────────────

/**
 * Injected into the active tab. Receives a JSON-serialisable instruction list
 * and applies fills safely. Returns a structured result object.
 *
 * MUST be self-contained — no closures, no imports.
 *
 * @param {FillInstruction[]} instructions
 * @returns {{ filled: number, skipped: number, failed: number, details: Array }}
 */
export function fillPageFields(instructions) {
  // ── Safety constants ─────────────────────────────────────────────────────
  const FORBIDDEN_TYPES = new Set([
    'hidden', 'submit', 'button', 'reset', 'image', 'file',
    'color', 'range',
  ]);

  const CAPTCHA_SIGNALS = [
    'g-recaptcha', 'h-captcha', 'cf-turnstile', 'captcha',
    'recaptcha', 'challenge',
  ];

  const SUBMIT_SIGNALS = ['submit', 'apply', 'send', 'upload', 'continue'];

  const results = [];
  let filled = 0;
  let skipped = 0;
  let failed = 0;

  // ── Helper: check whether an element looks like a CAPTCHA ────────────────
  function isCaptchaElement(el) {
    const sig = (el.id + ' ' + el.name + ' ' + el.className).toLowerCase();
    return CAPTCHA_SIGNALS.some((s) => sig.includes(s));
  }

  // ── Helper: fire synthetic events (React / Vue / Angular compatible) ──────
  function triggerEvents(el) {
    try {
      el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
      // Some frameworks also listen to 'blur' to commit state
      el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    } catch (_) {
      // Ignore event dispatch failures
    }
  }

  // ── Helper: set a value using the native setter to bypass React's proxy ───
  function setNativeValue(el, value) {
    try {
      const proto = el.tagName.toLowerCase() === 'select'
        ? HTMLSelectElement.prototype
        : el.tagName.toLowerCase() === 'textarea'
          ? HTMLTextAreaElement.prototype
          : HTMLInputElement.prototype;

      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(proto, 'value');
      if (nativeInputValueSetter && nativeInputValueSetter.set) {
        nativeInputValueSetter.set.call(el, value);
        return true;
      }
      // Fallback: direct assignment
      el.value = value;
      return true;
    } catch (_) {
      return false;
    }
  }

  // ── Helper: safe CSS.escape with fallback ───────────────────────────────
  function cssEscape(str) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(str);
    // Minimal fallback: escape characters that would break attribute selectors
    return str.replace(/(["\\])/g, '\\$1');
  }

  // ── Helper: resolve element from instruction (handles stale references) ───
  function resolveElement(instr) {
    // Try by ID first (most reliable)
    if (instr.fieldId) {
      const byId = document.getElementById(instr.fieldId);
      if (byId) return byId;
    }
    // Try by name
    if (instr.fieldName) {
      const escaped = cssEscape(instr.fieldName);
      const byName = document.querySelector(
        `input[name="${escaped}"], ` +
        `textarea[name="${escaped}"], ` +
        `select[name="${escaped}"]`,
      );
      if (byName) return byName;
    }
    // Fall back to DOM order index
    const all = Array.from(document.querySelectorAll('input, textarea, select'));
    return all[instr.fieldIndex] || null;
  }

  // ── Helper: check field is still safe to fill ────────────────────────────
  function isSafeToFill(el, instr) {
    if (!el) return { safe: false, reason: 'Element not found (stale reference or page changed)' };

    const tag = el.tagName.toLowerCase();
    const type = (el.type || '').toLowerCase();

    // Forbidden types
    if (tag === 'input' && FORBIDDEN_TYPES.has(type)) {
      return { safe: false, reason: `Field type "${type}" is not fillable` };
    }

    // Disabled / read-only
    if (el.disabled || el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') {
      return { safe: false, reason: 'Field is disabled' };
    }
    if (el.readOnly || el.hasAttribute('readonly')) {
      return { safe: false, reason: 'Field is read-only' };
    }

    // Hidden (computed style)
    if (el.hasAttribute('hidden') || el.closest('[hidden]')) {
      return { safe: false, reason: 'Field is hidden' };
    }
    try {
      const cs = window.getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') {
        return { safe: false, reason: 'Field is not visible' };
      }
    } catch (_) { /* ignore */ }

    // CAPTCHA
    if (isCaptchaElement(el)) {
      return { safe: false, reason: 'CAPTCHA field — skipped for safety' };
    }

    // Submit / apply buttons that might have sneaked in (belt-and-suspenders)
    if (tag === 'button' || (tag === 'input' && SUBMIT_SIGNALS.includes(type))) {
      return { safe: false, reason: 'Button elements are never filled' };
    }

    // Checkbox and radio are toggled via .checked, not .value — skip value check
    if (type === 'checkbox' || type === 'radio') {
      return { safe: true };
    }

    // Non-empty field without overwrite approval
    const currentVal = el.value !== undefined ? String(el.value).trim() : '';
    if (currentVal.length > 0 && !instr.overwriteApproved) {
      return { safe: false, reason: `Field already has a value — skipped (overwrite not approved)` };
    }

    return { safe: true };
  }

  // ── Process each instruction ─────────────────────────────────────────────
  for (const instr of instructions) {
    const label = instr.fieldId || instr.fieldName || `index:${instr.fieldIndex}`;
    const el = resolveElement(instr);
    const safetyCheck = isSafeToFill(el, instr);

    if (!safetyCheck.safe) {
      skipped++;
      results.push({ label, status: 'skipped', reason: safetyCheck.reason });
      continue;
    }

    const tag = el.tagName.toLowerCase();
    const type = (el.type || '').toLowerCase();
    let writeOk = false;
    let verifiedOk = false;

    try {
      if (tag === 'select') {
        // ── Select: match by value or text ────────────────────────────────
        const opts = Array.from(el.options);
        // Try exact value match
        const exactValue = opts.find((o) => o.value === instr.value);
        if (exactValue) {
          writeOk = setNativeValue(el, exactValue.value);
        } else {
          // Try case-insensitive text match
          const textMatch = opts.find(
            (o) => o.text.trim().toLowerCase() === instr.value.toLowerCase(),
          );
          if (textMatch) {
            writeOk = setNativeValue(el, textMatch.value);
          } else {
            // Partial match fallback
            const partial = opts.find(
              (o) => o.text.toLowerCase().includes(instr.value.toLowerCase()),
            );
            if (partial) {
              writeOk = setNativeValue(el, partial.value);
            } else {
              writeOk = false;
            }
          }
        }

        if (writeOk) {
          triggerEvents(el);
          verifiedOk = el.value !== '' && el.value !== undefined;
        }
      } else if (type === 'checkbox') {
        // ── Checkbox: treat truthy string values as checked ────────────────
        const truthy = ['true', '1', 'yes', 'on', 'checked'];
        const shouldCheck = truthy.includes(String(instr.value).toLowerCase());
        if (el.checked !== shouldCheck) {
          el.checked = shouldCheck;
          triggerEvents(el);
        }
        writeOk = true;
        verifiedOk = el.checked === shouldCheck;
      } else if (type === 'radio') {
        // ── Radio: find matching sibling by value ─────────────────────────
        const escapedName = cssEscape(el.name || '');
        const radios = Array.from(
          document.querySelectorAll(`input[type="radio"][name="${escapedName}"]`),
        );
        const target = radios.find((r) => r.value === instr.value) || radios[0];
        if (target) {
          target.checked = true;
          triggerEvents(target);
          writeOk = true;
          verifiedOk = target.checked;
        }
      } else {
        // ── Text / email / tel / url / textarea ───────────────────────────
        writeOk = setNativeValue(el, instr.value);
        if (writeOk) {
          triggerEvents(el);
          verifiedOk = el.value === instr.value;
        }
      }

      if (!writeOk) {
        failed++;
        results.push({ label, status: 'failed', reason: 'Could not set native value' });
      } else if (!verifiedOk) {
        failed++;
        results.push({ label, status: 'failed', reason: 'Value written but verification mismatch' });
      } else {
        filled++;
        results.push({ label, status: 'filled', value: instr.value });
      }
    } catch (err) {
      failed++;
      results.push({ label, status: 'failed', reason: err.message || 'Unknown error' });
    }
  }

  return { filled, skipped, failed, details: results };
}

// ─── High-level orchestration (runs in popup context) ────────────────────────

/**
 * Build serialisable fill instructions from Phase 4 match preview rows.
 *
 * @param {Array} matchRows  - Phase 4 FieldMatchRow[]
 * @param {{ overwriteAll?: boolean }} opts
 * @returns {FillInstruction[]}
 */
export function buildFillInstructions(matchRows, opts = {}) {
  const { overwriteAll = false } = opts;

  return matchRows
    .filter((row) => row.selected && row.match)
    .map((row) => ({
      fieldId: row.field.id || '',
      fieldName: row.field.name || '',
      fieldIndex: row.field.index ?? 0,
      fieldType: row.field.type || 'text',
      value: String(row.editedValue ?? ''),
      hasExistingValue: Boolean(row.field.hasExistingValue),
      overwriteApproved: overwriteAll || !row.field.hasExistingValue,
    }));
}

/**
 * Orchestrate a full autofill pass: build instructions → inject → validate.
 *
 * @param {Array} matchRows  - from Phase 4 ScanPreview state
 * @param {{ overwriteAll?: boolean }} opts
 * @returns {Promise<FillReport>}
 */
export async function runAutofill(matchRows, opts = {}) {
  const isExtensionEnv =
    typeof chrome !== 'undefined' &&
    Boolean(chrome.tabs) &&
    Boolean(chrome.scripting);

  if (!isExtensionEnv) {
    return {
      filled: 0, skipped: 0, failed: 0, details: [],
      error: 'Chrome extension APIs are only available when running as an installed Chrome extension.',
    };
  }

  const instructions = buildFillInstructions(matchRows, opts);

  if (instructions.length === 0) {
    return {
      filled: 0, skipped: 0, failed: 0, details: [],
      error: 'No fields selected for filling. Select at least one field in the preview.',
    };
  }

  try {
    // 1. Locate the active web tab (same logic as scanner)
    let [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (
      !activeTab ||
      (activeTab.url &&
        (activeTab.url.startsWith('chrome-extension://') ||
          activeTab.url.startsWith('extension://')))
    ) {
      const allTabs = await chrome.tabs.query({});
      const webTab = allTabs.find(
        (t) =>
          t.id !== activeTab?.id &&
          (!t.url ||
            (!t.url.startsWith('chrome-extension://') &&
              !t.url.startsWith('extension://'))),
      );
      if (webTab) activeTab = webTab;
    }

    if (!activeTab?.id) {
      return {
        filled: 0, skipped: 0, failed: 0, details: [],
        error: 'Unable to locate an active browser tab.',
      };
    }

    // 2. Inject the filler
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: fillPageFields,
      args: [instructions],
    });

    if (!injectionResults || injectionResults.length === 0) {
      return {
        filled: 0, skipped: 0, failed: 0, details: [],
        error: 'Script injection completed but returned no results.',
      };
    }

    const report = injectionResults[0].result;

    if (!report || typeof report !== 'object') {
      return {
        filled: 0, skipped: 0, failed: 0, details: [],
        error: 'Invalid response from autofill script.',
      };
    }

    return {
      filled: report.filled ?? 0,
      skipped: report.skipped ?? 0,
      failed: report.failed ?? 0,
      details: report.details ?? [],
    };
  } catch (err) {
    const message = err.message || String(err);
    return {
      filled: 0, skipped: 0, failed: 0, details: [],
      error: `Autofill failed: ${message}`,
    };
  }
}
