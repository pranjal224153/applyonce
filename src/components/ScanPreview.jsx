import React, { useState, useCallback } from 'react';
import { scanActiveTab } from '../services/scanner';
import { matchAllFields, profileKeyLabel, CONFIDENCE } from '../services/matcher';
import { getProfile } from '../services/storage';
import { runAutofill } from '../services/autofill';

/**
 * ApplyOnce Phase 4 + 5 — Scan, Match Preview and Autofill Component
 *
 * States:
 *  idle      → user hasn't scanned yet
 *  scanning  → injection in progress
 *  error     → scan failed (restricted page, etc.)
 *  preview   → matching results ready for review
 *  filling   → autofill injection in progress
 */

const VIEWS = { IDLE: 'idle', SCANNING: 'scanning', ERROR: 'error', PREVIEW: 'preview', FILLING: 'filling' };

// ─── Confidence badge helpers ────────────────────────────────────────────────
const CONFIDENCE_META = {
  [CONFIDENCE.HIGH]:   { label: 'High',   className: 'badge-high',   title: 'High confidence — preselected for review' },
  [CONFIDENCE.MEDIUM]: { label: 'Medium', className: 'badge-medium', title: 'Medium confidence — verify before filling' },
  [CONFIDENCE.LOW]:    { label: 'Low',    className: 'badge-low',    title: 'Low confidence — manual selection required' },
};

function ConfidenceBadge({ confidence }) {
  const meta = CONFIDENCE_META[confidence] || { label: confidence, className: 'badge-low', title: '' };
  return (
    <span className={`conf-badge ${meta.className}`} title={meta.title}>
      {meta.label}
    </span>
  );
}

// ─── Single match row ────────────────────────────────────────────────────────
function MatchRow({ row, rowIndex, onToggle, onValueChange, onKeyChange, profileKeys }) {
  const { field, match, selected, editedValue } = row;
  const fieldDisplayName = field.label || field.name || field.placeholder || `Field #${rowIndex + 1}`;

  return (
    <div className={`match-row ${selected ? 'match-row--selected' : ''} ${!match ? 'match-row--unmatched' : ''}`}>
      {/* Left: checkbox + field info */}
      <label className="match-row-check-area">
        <input
          type="checkbox"
          className="match-checkbox"
          checked={selected}
          disabled={!match}
          onChange={() => onToggle(rowIndex)}
          id={`match-check-${rowIndex}`}
          aria-label={`Select match for ${fieldDisplayName}`}
        />
        <div className="match-field-info">
          <span className="match-field-name">{fieldDisplayName}</span>
          <div className="match-field-meta">
            <span className="pill pill-type">{field.type}</span>
            {field.required && <span className="pill pill-required">Required</span>}
            {field.hasExistingValue && <span className="pill pill-has-value">Has value</span>}
          </div>
        </div>
      </label>

      {/* Right: match result */}
      {match ? (
        <div className="match-result-area">
          <div className="match-result-header">
            <select
              className="match-key-select"
              value={match.profileKey}
              onChange={(e) => onKeyChange(rowIndex, e.target.value)}
              title="Change the profile field to map to"
              aria-label={`Profile key for ${fieldDisplayName}`}
            >
              {profileKeys.map((k) => (
                <option key={k} value={k}>{profileKeyLabel(k)}</option>
              ))}
            </select>
            <ConfidenceBadge confidence={match.confidence} />
          </div>

          <div className="match-value-row">
            <input
              type="text"
              className="match-value-input"
              value={editedValue}
              onChange={(e) => onValueChange(rowIndex, e.target.value)}
              placeholder="(no value saved in profile)"
              aria-label={`Proposed value for ${fieldDisplayName}`}
              id={`match-value-${rowIndex}`}
            />
          </div>

          {match.reason && (
            <div className="match-reason" title={match.reason}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              {match.reason}
            </div>
          )}
        </div>
      ) : (
        <div className="match-result-area match-no-match">
          <span className="no-match-label">No profile match found</span>
        </div>
      )}
    </div>
  );
}

// ─── Fill result banner ──────────────────────────────────────────────────────
function FillResultBanner({ report, onDismiss }) {
  const hasError = Boolean(report.error);
  const allSkipped = !hasError && report.filled === 0 && report.skipped > 0;

  if (hasError) {
    return (
      <div className="alert alert-danger fill-result-banner" role="alert">
        <div className="alert-icon">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
          </svg>
        </div>
        <div className="alert-body">
          <div className="alert-title">Fill Failed</div>
          <p className="alert-message">{report.error}</p>
        </div>
        <button type="button" className="banner-dismiss" onClick={onDismiss} aria-label="Dismiss">×</button>
      </div>
    );
  }

  return (
    <div className={`fill-result-banner fill-result-banner--${report.filled > 0 ? 'success' : 'warn'}`} role="status" aria-live="polite">
      <div className="fill-result-stats">
        <span className="fill-stat fill-stat--filled">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
          {report.filled} filled
        </span>
        {report.skipped > 0 && (
          <span className="fill-stat fill-stat--skipped">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="8" y1="12" x2="16" y2="12" /></svg>
            {report.skipped} skipped
          </span>
        )}
        {report.failed > 0 && (
          <span className="fill-stat fill-stat--failed">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
            {report.failed} failed
          </span>
        )}
      </div>

      {allSkipped && (
        <p className="fill-result-note">
          All fields were skipped — they may already have values. Enable "Overwrite existing values" to replace them.
        </p>
      )}

      {report.details && report.details.length > 0 && (
        <details className="fill-result-details">
          <summary>Per-field details</summary>
          <ul className="fill-detail-list">
            {report.details.map((d, i) => (
              <li key={i} className={`fill-detail-item fill-detail-item--${d.status}`}>
                <span className="fill-detail-label">{d.label}</span>
                <span className="fill-detail-status">{d.status}</span>
                {d.reason && <span className="fill-detail-reason">{d.reason}</span>}
              </li>
            ))}
          </ul>
        </details>
      )}

      <button type="button" className="banner-dismiss" onClick={onDismiss} aria-label="Dismiss">×</button>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function ScanPreview() {
  const [view, setView]               = useState(VIEWS.IDLE);
  const [errorInfo, setErrorInfo]     = useState(null);
  const [scanMeta, setScanMeta]       = useState(null);
  const [matchRows, setMatchRows]     = useState([]);
  const [filterConf, setFilterConf]   = useState('all');
  const [fillReport, setFillReport]   = useState(null);
  const [overwriteAll, setOverwriteAll] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);

  // Profile keys for dropdown
  const profileKeys = [
    'fullName','firstName','lastName','email','phone','location',
    'college','degree','graduationYear','skills',
    'github','linkedin','leetcode','portfolio',
  ];

  // ── Scan + Match ─────────────────────────────────────────────────────────
  const handleScanClick = useCallback(async () => {
    setView(VIEWS.SCANNING);
    setErrorInfo(null);
    setMatchRows([]);
    setScanMeta(null);
    setFillReport(null);

    try {
      const [scanResult, profile] = await Promise.all([scanActiveTab(), getProfile()]);

      if (!scanResult.success || !scanResult.payload) {
        setErrorInfo({
          message: scanResult.error || 'Failed to scan the active tab.',
          isRestricted: Boolean(scanResult.isRestricted),
          url: scanResult.url || null,
        });
        setView(VIEWS.ERROR);
        return;
      }

      const { fields, url, title, fieldCount } = scanResult.payload;
      setScanMeta({ url, title, fieldCount });
      setMatchRows(matchAllFields(fields, profile));
      setView(VIEWS.PREVIEW);
    } catch (err) {
      setErrorInfo({ message: err.message || 'An unexpected error occurred.', isRestricted: false });
      setView(VIEWS.ERROR);
    }
  }, []);

  // ── Fill ─────────────────────────────────────────────────────────────────
  const executeFill = useCallback(async (opts = {}) => {
    setView(VIEWS.FILLING);
    setFillReport(null);

    try {
      const report = await runAutofill(matchRows, { overwriteAll: opts.overwriteAll ?? overwriteAll });
      setFillReport(report);
    } catch (err) {
      setFillReport({ filled: 0, skipped: 0, failed: 0, details: [], error: err.message });
    } finally {
      setView(VIEWS.PREVIEW);
    }
  }, [matchRows, overwriteAll]);

  const handleFillClick = useCallback(() => {
    // Check if any selected field has an existing value — if so, ask for confirmation
    const hasNonEmpty = matchRows.some((r) => r.selected && r.field.hasExistingValue);
    if (hasNonEmpty && !overwriteAll) {
      setShowOverwriteConfirm(true);
    } else {
      executeFill();
    }
  }, [matchRows, overwriteAll, executeFill]);

  // ── Row handlers ─────────────────────────────────────────────────────────
  const handleToggle = useCallback((idx) => {
    setMatchRows((prev) => prev.map((r, i) => i === idx ? { ...r, selected: !r.selected } : r));
  }, []);

  const handleValueChange = useCallback((idx, val) => {
    setMatchRows((prev) => prev.map((r, i) => i === idx ? { ...r, editedValue: val } : r));
  }, []);

  const handleKeyChange = useCallback((idx, newKey) => {
    setMatchRows((prev) => prev.map((r, i) => {
      if (i !== idx) return r;
      return { ...r, match: r.match ? { ...r.match, profileKey: newKey } : null };
    }));
  }, []);

  const handleSelectAll = useCallback(() => {
    setMatchRows((prev) => prev.map((r) => r.match ? { ...r, selected: true } : r));
  }, []);

  const handleDeselectAll = useCallback(() => {
    setMatchRows((prev) => prev.map((r) => ({ ...r, selected: false })));
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────
  const selectedCount = matchRows.filter((r) => r.selected).length;
  const matchedCount  = matchRows.filter((r) => r.match).length;
  const highCount     = matchRows.filter((r) => r.match?.confidence === CONFIDENCE.HIGH).length;
  const filling       = view === VIEWS.FILLING;

  const filteredRows = matchRows.filter((r) => {
    if (filterConf === 'all')      return true;
    if (filterConf === 'high')     return r.match?.confidence === CONFIDENCE.HIGH;
    if (filterConf === 'medium')   return r.match?.confidence === CONFIDENCE.MEDIUM;
    if (filterConf === 'low')      return r.match?.confidence === CONFIDENCE.LOW;
    if (filterConf === 'unmatched') return !r.match;
    return true;
  });

  // ── Shared scan button ───────────────────────────────────────────────────
  const ScanBtn = ({ compact = false }) => (
    <button
      id="scan-page-btn"
      type="button"
      className={`btn btn-primary ${view === VIEWS.SCANNING ? 'btn-loading' : ''} ${compact ? 'btn-sm' : ''}`}
      onClick={handleScanClick}
      disabled={view === VIEWS.SCANNING || filling}
    >
      {view === VIEWS.SCANNING ? (
        <>
          <svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeLinecap="round" />
          </svg>
          Scanning…
        </>
      ) : (
        <>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          {view === VIEWS.PREVIEW ? 'Re-scan' : 'Scan this page'}
        </>
      )}
    </button>
  );

  // ── IDLE / SCANNING ───────────────────────────────────────────────────────
  if (view === VIEWS.IDLE || view === VIEWS.SCANNING) {
    return (
      <div className="scan-container">
        <div className="scan-action-card">
          <div className="scan-card-header">
            <div>
              <h2 className="scan-title">On-Demand Page Scanner</h2>
              <p className="scan-subtitle">
                Inspect the active browser tab for application form fields. No data is modified during scanning.
              </p>
            </div>
            <ScanBtn />
          </div>
        </div>

        {view === VIEWS.IDLE && (
          <div className="initial-scan-placeholder">
            <div className="placeholder-art">
              <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <h3>Ready to Scan</h3>
            <p>
              Navigate to any job application page in Chrome, then click <strong>&quot;Scan this page&quot;</strong> to detect and match form fields with your saved profile — safely.
            </p>
          </div>
        )}
      </div>
    );
  }

  // ── ERROR ─────────────────────────────────────────────────────────────────
  if (view === VIEWS.ERROR) {
    return (
      <div className="scan-container">
        <div className="scan-action-card">
          <div className="scan-card-header">
            <div>
              <h2 className="scan-title">On-Demand Page Scanner</h2>
              <p className="scan-subtitle">Inspect the active tab for application form fields.</p>
            </div>
            <ScanBtn />
          </div>

          {errorInfo?.isRestricted ? (
            <div className="alert alert-warning" role="alert">
              <div className="alert-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                  <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                </svg>
              </div>
              <div className="alert-body">
                <div className="alert-title">Restricted Browser Page</div>
                <p className="alert-message">{errorInfo.message}</p>
                <div className="alert-hint">
                  Open a job application or <code>tests/test-form.html</code> and click <strong>Scan this page</strong> again.
                </div>
              </div>
            </div>
          ) : (
            <div className="alert alert-danger" role="alert">
              <div className="alert-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <div className="alert-body">
                <div className="alert-title">Scan Failed</div>
                <p className="alert-message">{errorInfo?.message}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── PREVIEW (+ FILLING) ───────────────────────────────────────────────────
  return (
    <div className="scan-container">
      {/* Header */}
      <div className="scan-action-card">
        <div className="scan-card-header">
          <div>
            <h2 className="scan-title">Match Preview</h2>
            <p className="scan-subtitle" title={scanMeta?.url}>
              {scanMeta?.title || 'Active Tab'} — {matchedCount} of {scanMeta?.fieldCount} fields matched
            </p>
          </div>
          <ScanBtn compact />
        </div>

        {/* Summary stats */}
        <div className="match-summary-bar">
          <span className="summary-stat">
            <span className="summary-stat-val" id="detected-field-count">{scanMeta?.fieldCount ?? 0}</span>
            <span className="summary-stat-label">Detected</span>
          </span>
          <span className="summary-stat">
            <span className="summary-stat-val stat-matched">{matchedCount}</span>
            <span className="summary-stat-label">Matched</span>
          </span>
          <span className="summary-stat">
            <span className="summary-stat-val stat-high">{highCount}</span>
            <span className="summary-stat-label">High Conf.</span>
          </span>
          <span className="summary-stat">
            <span className="summary-stat-val stat-selected">{selectedCount}</span>
            <span className="summary-stat-label">Selected</span>
          </span>
        </div>

        {/* Filter pills */}
        <div className="filter-pill-bar">
          {[
            ['all',       `All (${matchRows.length})`],
            ['high',      `High (${matchRows.filter((r) => r.match?.confidence === CONFIDENCE.HIGH).length})`],
            ['medium',    `Medium (${matchRows.filter((r) => r.match?.confidence === CONFIDENCE.MEDIUM).length})`],
            ['low',       `Low (${matchRows.filter((r) => r.match?.confidence === CONFIDENCE.LOW).length})`],
            ['unmatched', `Unmatched (${matchRows.filter((r) => !r.match).length})`],
          ].map(([val, label]) => (
            <button key={val} type="button"
              className={`filter-pill ${filterConf === val ? 'active' : ''}`}
              onClick={() => setFilterConf(val)}
            >{label}</button>
          ))}
        </div>

        {/* Bulk select + overwrite toggle */}
        <div className="bulk-select-bar">
          <div className="bulk-select-btns">
            <button type="button" className="btn-ghost-sm" onClick={handleSelectAll}>All matched</button>
            <button type="button" className="btn-ghost-sm" onClick={handleDeselectAll}>Deselect all</button>
          </div>
          <label className="overwrite-toggle" title="When enabled, fields that already have a value will also be overwritten">
            <input
              type="checkbox"
              checked={overwriteAll}
              onChange={(e) => setOverwriteAll(e.target.checked)}
              id="overwrite-toggle"
              style={{ accentColor: '#f59e0b' }}
            />
            <span>Overwrite existing</span>
          </label>
        </div>

        {/* Fill button */}
        <div className="fill-action-row">
          <button
            id="fill-fields-btn"
            type="button"
            className={`btn btn-fill ${filling ? 'btn-loading' : ''}`}
            disabled={selectedCount === 0 || filling}
            onClick={handleFillClick}
          >
            {filling ? (
              <>
                <svg className="spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeLinecap="round" />
                </svg>
                Filling…
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
                Fill {selectedCount} selected field{selectedCount !== 1 ? 's' : ''}
              </>
            )}
          </button>
          <p className="fill-action-note">
            Fields will be filled on the active tab. Always review before submitting.
          </p>
        </div>

        {/* Overwrite confirmation dialog */}
        {showOverwriteConfirm && (
          <div className="overwrite-confirm-dialog" role="dialog" aria-modal="true" aria-label="Overwrite confirmation">
            <div className="overwrite-confirm-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div className="overwrite-confirm-body">
              <div className="overwrite-confirm-title">Some selected fields already have values</div>
              <p className="overwrite-confirm-text">
                ApplyOnce will skip pre-filled fields by default to protect existing data.
                Do you want to overwrite them too?
              </p>
              <div className="overwrite-confirm-actions">
                <button
                  id="confirm-overwrite-btn"
                  type="button"
                  className="btn btn-warn"
                  onClick={() => { setShowOverwriteConfirm(false); executeFill({ overwriteAll: true }); }}
                >
                  Fill all (overwrite)
                </button>
                <button
                  id="confirm-skip-btn"
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => { setShowOverwriteConfirm(false); executeFill({ overwriteAll: false }); }}
                >
                  Fill empty only
                </button>
                <button type="button" className="btn-ghost-sm" onClick={() => setShowOverwriteConfirm(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Fill result banner */}
      {fillReport && (
        <FillResultBanner report={fillReport} onDismiss={() => setFillReport(null)} />
      )}

      {/* Match rows */}
      <div className="match-rows-list" id="match-rows-list">
        {filteredRows.length === 0 ? (
          <div className="empty-scan-state">
            <div className="empty-scan-icon">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </div>
            <h3>No fields in this filter</h3>
            <p>Try a different confidence filter above.</p>
          </div>
        ) : (
          filteredRows.map((row, i) => (
            <MatchRow
              key={`${row.field.id || row.field.name || i}_${i}`}
              row={row}
              rowIndex={matchRows.indexOf(row)}
              onToggle={handleToggle}
              onValueChange={handleValueChange}
              onKeyChange={handleKeyChange}
              profileKeys={profileKeys}
            />
          ))
        )}
      </div>

      {/* Limitations note */}
      <div className="limitations-note">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        Not all portals are compatible — see <strong>README</strong> for known limitations &amp; manual fallback.
      </div>

      {/* Protocol footer */}
      <div className="protocol-footer">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        Scan Protocol v1.0 · Read-only scan · No network requests
      </div>
    </div>
  );
}
