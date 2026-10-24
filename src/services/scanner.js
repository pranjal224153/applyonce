/**
 * ApplyOnce Phase 3 - Form Scanner Service
 *
 * Implements user-triggered on-demand DOM scanning using Chrome Scripting API
 * and activeTab permission. Strictly read-only: does not modify or fill fields.
 */

export const SCAN_PROTOCOL = 'APPLYONCE_SCAN_PROTOCOL';
export const SCAN_PROTOCOL_VERSION = '1.0';

export const MESSAGE_TYPES = {
  SUCCESS: 'APPLYONCE_SCAN_SUCCESS',
  ERROR: 'APPLYONCE_SCAN_ERROR',
};

/**
 * Validates whether an incoming message complies with the ApplyOnce Scan Protocol.
 * @param {any} message
 * @returns {boolean}
 */
export function validateScanMessage(message) {
  if (!message || typeof message !== 'object') {
    return false;
  }
  if (message.protocol !== SCAN_PROTOCOL) {
    return false;
  }
  if (message.version !== SCAN_PROTOCOL_VERSION) {
    return false;
  }
  if (message.type !== MESSAGE_TYPES.SUCCESS && message.type !== MESSAGE_TYPES.ERROR) {
    return false;
  }

  if (message.type === MESSAGE_TYPES.SUCCESS) {
    if (!message.payload || typeof message.payload !== 'object') {
      return false;
    }
    if (typeof message.payload.fieldCount !== 'number') {
      return false;
    }
    if (!Array.isArray(message.payload.fields)) {
      return false;
    }
    // Validate individual field shapes
    for (const field of message.payload.fields) {
      if (!field || typeof field !== 'object') return false;
      if (typeof field.type !== 'string' || typeof field.tagName !== 'string') return false;
      if (typeof field.label !== 'string') return false;
    }
  }

  return true;
}

/**
 * Self-contained DOM scanner function designed to be injected into the active tab
 * via chrome.scripting.executeScript(). Must not depend on outer scope closures.
 * Strictly read-only: detects visible, enabled, supported input elements without altering them.
 */
export function scanPageDOM() {
  const PROTOCOL = 'APPLYONCE_SCAN_PROTOCOL';
  const PROTOCOL_VERSION = '1.0';

  try {
    // 1. Collect candidate elements
    const candidates = Array.from(document.querySelectorAll('input, textarea, select'));

    const detectedFields = [];
    const unsupportedInputTypes = new Set([
      'hidden',
      'submit',
      'button',
      'reset',
      'image',
      'file',
    ]);

    // Helper: Safely clean and normalize whitespace
    const cleanText = (str) => (str ? str.replace(/\s+/g, ' ').trim() : '');

    // Helper: Verify element is rendered, visible, and enabled
    const isVisibleAndEnabled = (el) => {
      // Disabled check
      if (el.disabled || el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') {
        return false;
      }

      // Hidden attribute check
      if (el.hasAttribute('hidden') || el.closest('[hidden]')) {
        return false;
      }

      // Check input type
      if (el.tagName.toLowerCase() === 'input') {
        const type = (el.type || 'text').toLowerCase();
        if (unsupportedInputTypes.has(type)) {
          return false;
        }
      }

      // Computed style check
      try {
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false;
        }
      } catch {
        // Fallback if computed style is unavailable
      }

      // Ancestor visibility check (e.g. wrapper with display: none)
      let ancestor = el.parentElement;
      while (ancestor && ancestor !== document.body) {
        if (ancestor.hasAttribute && ancestor.hasAttribute('hidden')) {
          return false;
        }
        try {
          const parentStyle = window.getComputedStyle(ancestor);
          if (parentStyle && (parentStyle.display === 'none' || parentStyle.visibility === 'hidden')) {
            return false;
          }
        } catch {
          // Ignore
        }
        ancestor = ancestor.parentElement;
      }

      // Geometry check in browser environments with layout engines
      const isJSDOM = typeof window !== 'undefined' && Boolean(window.navigator?.userAgent?.includes('jsdom'));
      if (!isJSDOM && typeof el.getBoundingClientRect === 'function') {
        const rect = el.getBoundingClientRect();
        try {
          const style = window.getComputedStyle(el);
          const isFixedOrSticky = style.position === 'fixed' || style.position === 'sticky';
          if (rect.width === 0 && rect.height === 0 && !isFixedOrSticky && el.offsetParent === null) {
            return false;
          }
        } catch {
          // Ignore
        }
      }

      return true;
    };

    // Helper: Extract label text using standard HTML associations and ARIA attributes
    const resolveFieldLabel = (el) => {
      // Strategy 1: HTML5 standard el.labels collection
      if (el.labels && el.labels.length > 0) {
        for (let i = 0; i < el.labels.length; i++) {
          const text = cleanText(el.labels[i].textContent);
          if (text) return text;
        }
      }

      // Strategy 2: Explicit label[for="id"]
      if (el.id) {
        try {
          const escapedId = (window.CSS && CSS.escape) ? CSS.escape(el.id) : el.id.replace(/"/g, '\\"');
          const labelEl = document.querySelector(`label[for="${escapedId}"]`);
          if (labelEl) {
            const text = cleanText(labelEl.textContent);
            if (text) return text;
          }
        } catch {
          // Ignore invalid selector
        }
      }

      // Strategy 3: Wrapping <label> ancestor
      const parentLabel = el.closest('label');
      if (parentLabel) {
        // Clone label to remove nested input/select text content so it doesn't pollute label
        const clone = parentLabel.cloneNode(true);
        const nestedInputs = clone.querySelectorAll('input, select, textarea, button');
        nestedInputs.forEach((node) => node.remove());
        const text = cleanText(clone.textContent);
        if (text) return text;
      }

      // Strategy 4: aria-labelledby attribute
      const labelledBy = el.getAttribute('aria-labelledby');
      if (labelledBy) {
        const ids = labelledBy.split(/\s+/);
        const parts = [];
        ids.forEach((id) => {
          const ref = document.getElementById(id);
          if (ref) parts.push(cleanText(ref.textContent));
        });
        const combined = cleanText(parts.join(' '));
        if (combined) return combined;
      }

      // Strategy 5: aria-label attribute
      const ariaLabel = el.getAttribute('aria-label');
      if (ariaLabel && cleanText(ariaLabel)) {
        return cleanText(ariaLabel);
      }

      // Strategy 6: Placeholder fallback
      if (el.placeholder && cleanText(el.placeholder)) {
        return cleanText(el.placeholder);
      }

      // Strategy 7: Title attribute fallback
      if (el.title && cleanText(el.title)) {
        return cleanText(el.title);
      }

      // Strategy 8: Human-readable name or id fallback
      const fallback = el.name || el.id || '';
      return cleanText(fallback);
    };

    // Helper: Extract accessible descriptions (aria-describedby, aria-description, help-text)
    const resolveAccessibleDescription = (el) => {
      // Strategy 1: aria-describedby
      const describedBy = el.getAttribute('aria-describedby');
      if (describedBy) {
        const ids = describedBy.split(/\s+/);
        const parts = [];
        ids.forEach((id) => {
          const ref = document.getElementById(id);
          if (ref) parts.push(cleanText(ref.textContent));
        });
        const combined = cleanText(parts.join(' '));
        if (combined) return combined;
      }

      // Strategy 2: aria-description
      const ariaDesc = el.getAttribute('aria-description');
      if (ariaDesc && cleanText(ariaDesc)) {
        return cleanText(ariaDesc);
      }

      return '';
    };

    // 2. Iterate and inspect fields
    candidates.forEach((el, index) => {
      if (!isVisibleAndEnabled(el)) {
        return;
      }

      const tagName = el.tagName.toLowerCase();
      let type = tagName;
      if (tagName === 'input') {
        type = (el.type || 'text').toLowerCase();
      }

      const label = resolveFieldLabel(el);
      const placeholder = el.placeholder || '';
      const accessibleDescription = resolveAccessibleDescription(el);
      const isRequired = Boolean(el.required || el.getAttribute('aria-required') === 'true');

      // For select elements, gather visible options
      let options = [];
      if (tagName === 'select' && el.options) {
        options = Array.from(el.options).map((opt) => ({
          value: opt.value,
          label: cleanText(opt.text || opt.label),
        }));
      }

      detectedFields.push({
        index,
        id: el.id || '',
        name: el.name || '',
        tagName,
        type,
        label,
        placeholder,
        required: isRequired,
        accessibleDescription,
        options,
        // Mark if current field has existing value without exposing sensitive data
        hasExistingValue: Boolean(el.value && el.value.trim().length > 0),
      });
    });

    const protocolMessage = {
      protocol: PROTOCOL,
      version: PROTOCOL_VERSION,
      type: 'APPLYONCE_SCAN_SUCCESS',
      timestamp: Date.now(),
      payload: {
        url: window.location.href,
        title: document.title || 'Untitled Page',
        fieldCount: detectedFields.length,
        fields: detectedFields,
      },
    };

    // Send through Chrome message passing if running in extension content script context
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      try {
        chrome.runtime.sendMessage(protocolMessage);
      } catch {
        // Message listener might be closed or detached; result is also returned directly
      }
    }

    return protocolMessage;
  } catch (err) {
    const errorMessage = {
      protocol: PROTOCOL,
      version: PROTOCOL_VERSION,
      type: 'APPLYONCE_SCAN_ERROR',
      timestamp: Date.now(),
      payload: {
        message: err.message || 'Unknown error occurred during page scan',
      },
    };

    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      try {
        chrome.runtime.sendMessage(errorMessage);
      } catch {
        // Ignore
      }
    }

    return errorMessage;
  }
}

/**
 * Checks whether a given tab URL is restricted by Chrome MV3 security policies.
 * @param {string} url
 * @returns {{ restricted: boolean, reason?: string }}
 */
export function checkRestrictedUrl(url) {
  if (!url) {
    return {
      restricted: true,
      reason: 'No tab URL available (page may still be loading).',
    };
  }

  const restrictedPrefixes = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'view-source:',
    'data:',
    'javascript:',
  ];

  for (const prefix of restrictedPrefixes) {
    if (url.startsWith(prefix)) {
      return {
        restricted: true,
        reason: `Chrome blocks extension scripts on internal pages (${prefix}*). Please navigate to a standard web page or local test form.`,
      };
    }
  }

  // Chrome Web Store restriction
  if (
    url.includes('chromewebstore.google.com') ||
    url.includes('chrome.google.com/webstore')
  ) {
    return {
      restricted: true,
      reason: 'Chrome policies prohibit injecting scripts into the Chrome Web Store.',
    };
  }

  return { restricted: false };
}

/**
 * High-level orchestration function to scan the currently active browser tab.
 * Uses chrome.tabs and chrome.scripting. Handles injection failures and restricted pages.
 *
 * @returns {Promise<{
 *   success: boolean,
 *   payload?: { url: string, title: string, fieldCount: number, fields: Array<any> },
 *   error?: string,
 *   isRestricted?: boolean
 * }>}
 */
export async function scanActiveTab() {
  const isExtensionEnv =
    typeof chrome !== 'undefined' &&
    Boolean(chrome.tabs) &&
    Boolean(chrome.scripting);

  // If outside Chrome extension runtime (e.g. previewing popup in browser dev server)
  if (!isExtensionEnv) {
    return {
      success: false,
      error: 'Chrome extension APIs (chrome.tabs / chrome.scripting) are only available when running as an installed Chrome extension.',
      isRestricted: false,
    };
  }

  try {
    // 1. Query the active tab in current window
    let tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    let activeTab = tabs && tabs[0];

    // If active tab is missing or is the extension popup itself (e.g. when opened as a tab during testing),
    // look for the open web page tab across all tabs
    if (!activeTab || (activeTab.url && (activeTab.url.startsWith('chrome-extension://') || activeTab.url.startsWith('extension://')))) {
      const allTabs = await chrome.tabs.query({});
      const webTab = allTabs.find((t) => t.id !== activeTab?.id && (!t.url || (!t.url.startsWith('chrome-extension://') && !t.url.startsWith('extension://'))));
      if (webTab) {
        activeTab = webTab;
      }
    }

    if (!activeTab || !activeTab.id) {
      return {
        success: false,
        error: 'Unable to locate an active browser tab. Please select a valid web page.',
      };
    }

    // 2. Check for restricted URLs (chrome://, webstore, etc.)
    if (activeTab.url) {
      const restriction = checkRestrictedUrl(activeTab.url);
      if (restriction.restricted) {
        return {
          success: false,
          isRestricted: true,
          error: restriction.reason,
          url: activeTab.url,
        };
      }
    }

    // 3. Inject the scanner function into the active tab
    const injectionResults = await chrome.scripting.executeScript({
      target: { tabId: activeTab.id },
      func: scanPageDOM,
    });

    if (!injectionResults || injectionResults.length === 0) {
      return {
        success: false,
        error: 'Script injection completed but returned no results from the active tab.',
      };
    }

    const rawResult = injectionResults[0].result;

    // 4. Validate result with the Scan Protocol
    if (!validateScanMessage(rawResult)) {
      return {
        success: false,
        error: 'Received invalid scan response protocol from content script.',
      };
    }

    if (rawResult.type === MESSAGE_TYPES.ERROR) {
      return {
        success: false,
        error: rawResult.payload?.message || 'Error occurred during content script execution.',
      };
    }

    return {
      success: true,
      payload: rawResult.payload,
    };
  } catch (err) {
    const message = err.message || String(err);

    // Provide friendly diagnostics for common Chrome scripting errors
    if (message.includes('Cannot access contents of url') || message.includes('Missing host permission')) {
      return {
        success: false,
        isRestricted: true,
        error: `Cannot inject script into this page: ${message}. Chrome restricts extension execution on this domain.`,
      };
    }

    return {
      success: false,
      error: `Failed to scan page: ${message}`,
    };
  }
}
