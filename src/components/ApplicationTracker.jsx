import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  STATUSES,
  STATUS_META,
  getAllApplications,
  addApplication,
  updateApplication,
  deleteApplication,
  clearAllApplications,
  computeStats,
  queryApplications,
  validateRecord,
  createRecord,
} from '../services/applications';

/**
 * ApplyOnce Phase 6 — Application Tracker Component
 *
 * Local-only job application pipeline tracker.
 * - Local persistence via chrome.storage.local (localStorage fallback)
 * - Full CRUD: Create, Read, Update, Delete
 * - Search, filter by status, and multiple sort options
 * - Dynamic pipeline statistics
 * - Privacy-respecting: no telemetry, no auto-tracking without user consent
 */

const DEFAULT_FORM = {
  company: '',
  jobTitle: '',
  jobUrl: '',
  status: 'Interested',
  appliedAt: '',
  notes: '',
};

export default function ApplicationTracker({ initialTabContext }) {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filter & Search & Sort states
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortBy, setSortBy] = useState('updatedAt');
  const [sortDir, setSortDir] = useState('desc');

  // Modal / Form state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null); // null = new, string = edit
  const [formData, setFormData] = useState(DEFAULT_FORM);
  const [formErrors, setFormErrors] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Delete confirmation modal state
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  // Load applications on mount
  const loadApps = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const list = await getAllApplications();
      setApplications(list);
    } catch (err) {
      console.error('Failed to load applications:', err);
      setError('Failed to load applications from local storage.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  // If initialTabContext provides company/jobUrl, prefill form
  useEffect(() => {
    if (initialTabContext?.company || initialTabContext?.jobUrl) {
      setFormData((prev) => ({
        ...prev,
        company: initialTabContext.company || prev.company,
        jobUrl: initialTabContext.jobUrl || prev.jobUrl,
        jobTitle: initialTabContext.jobTitle || prev.jobTitle,
        status: 'Applied',
        appliedAt: new Date().toISOString().slice(0, 10),
      }));
      setIsFormOpen(true);
    }
  }, [initialTabContext]);

  // Derived filtered & sorted list
  const filteredApps = useMemo(() => {
    return queryApplications(applications, {
      search,
      statusFilter,
      sortBy,
      sortDir,
    });
  }, [applications, search, statusFilter, sortBy, sortDir]);

  // Real-time statistics calculated from actual records
  const stats = useMemo(() => {
    return computeStats(applications);
  }, [applications]);

  // Handle open Add Form
  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({
      ...DEFAULT_FORM,
      appliedAt: new Date().toISOString().slice(0, 10),
    });
    setFormErrors([]);
    setIsFormOpen(true);
  };

  // Handle open Edit Form
  const handleOpenEdit = (app) => {
    setEditingId(app.id);
    setFormData({
      company: app.company,
      jobTitle: app.jobTitle,
      jobUrl: app.jobUrl || '',
      status: app.status,
      appliedAt: app.appliedAt || '',
      notes: app.notes || '',
    });
    setFormErrors([]);
    setIsFormOpen(true);
  };

  // Handle quick status change from row
  const handleQuickStatusChange = async (id, newStatus) => {
    try {
      const updated = await updateApplication(id, { status: newStatus });
      if (updated) {
        setApplications((prev) => prev.map((a) => (a.id === id ? updated : a)));
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  // Handle Form Save
  const handleSaveForm = async (e) => {
    if (e) e.preventDefault();

    const recordCandidate = createRecord({
      ...formData,
      id: editingId || undefined,
    });

    const { valid, errors } = validateRecord(recordCandidate);
    if (!valid) {
      setFormErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingId) {
        const updated = await updateApplication(editingId, formData);
        setApplications((prev) => prev.map((a) => (a.id === editingId ? updated : a)));
      } else {
        const created = await addApplication(formData);
        setApplications((prev) => [created, ...prev]);
      }
      setIsFormOpen(false);
      setEditingId(null);
      setFormData(DEFAULT_FORM);
      setFormErrors([]);
    } catch (err) {
      console.error('Failed to save application:', err);
      setFormErrors(['Error saving application to storage.']);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Delete
  const handleConfirmDelete = async () => {
    if (!deleteConfirmId) return;
    try {
      await deleteApplication(deleteConfirmId);
      setApplications((prev) => prev.filter((a) => a.id !== deleteConfirmId));
      setDeleteConfirmId(null);
    } catch (err) {
      console.error('Failed to delete application:', err);
    }
  };

  const handleClearFilters = () => {
    setSearch('');
    setStatusFilter('all');
  };

  return (
    <div className="tracker-container">
      {/* Tracker Header & Quick Stats */}
      <div className="tracker-top-card">
        <div className="tracker-header-row">
          <div>
            <h2 className="tracker-title">Application Tracker</h2>
            <p className="tracker-subtitle">
              Locally managed pipeline. No tracking or external syncing.
            </p>
          </div>
          <button
            id="add-application-btn"
            type="button"
            className="btn btn-primary btn-add-app"
            onClick={handleOpenAdd}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add application
          </button>
        </div>

        {/* Dynamic Statistics Bar */}
        <div className="tracker-stats-grid">
          <div
            className={`stat-card ${statusFilter === 'all' ? 'stat-card--active' : ''}`}
            onClick={() => setStatusFilter('all')}
            title="Click to show all"
          >
            <span className="stat-card-num" id="stat-total-apps">{stats.total}</span>
            <span className="stat-card-title">Total</span>
          </div>

          <div
            className={`stat-card ${statusFilter === 'Applied' ? 'stat-card--active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'Applied' ? 'all' : 'Applied')}
            title="Filter by Applied"
          >
            <span className="stat-card-num stat-applied">{stats.byStatus.Applied || 0}</span>
            <span className="stat-card-title">Applied</span>
          </div>

          <div
            className={`stat-card ${statusFilter === 'Interview' ? 'stat-card--active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'Interview' ? 'all' : 'Interview')}
            title="Filter by Interview"
          >
            <span className="stat-card-num stat-interview">{stats.byStatus.Interview || 0}</span>
            <span className="stat-card-title">Interview</span>
          </div>

          <div
            className={`stat-card ${statusFilter === 'Offer' ? 'stat-card--active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === 'Offer' ? 'all' : 'Offer')}
            title="Filter by Offer"
          >
            <span className="stat-card-num stat-offer">{stats.byStatus.Offer || 0}</span>
            <span className="stat-card-title">Offers</span>
          </div>
        </div>

        {/* Filter, Search & Sort Bar */}
        <div className="tracker-controls-bar">
          <div className="tracker-search-wrap">
            <svg className="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              id="tracker-search-input"
              type="text"
              className="tracker-search-input"
              placeholder="Search company, title, notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search applications"
            />
            {search && (
              <button
                type="button"
                className="search-clear-btn"
                onClick={() => setSearch('')}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <div className="tracker-filters-row">
            {/* Status Select */}
            <select
              id="tracker-status-filter"
              className="tracker-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="all">All Statuses ({stats.total})</option>
              {STATUSES.map((st) => (
                <option key={st} value={st}>
                  {STATUS_META[st]?.icon} {st} ({stats.byStatus[st] || 0})
                </option>
              ))}
            </select>

            {/* Sort Select */}
            <select
              id="tracker-sort-by"
              className="tracker-select"
              value={`${sortBy}:${sortDir}`}
              onChange={(e) => {
                const [sb, sd] = e.target.value.split(':');
                setSortBy(sb);
                setSortDir(sd);
              }}
              aria-label="Sort applications"
            >
              <option value="updatedAt:desc">Recently Updated</option>
              <option value="createdAt:desc">Newest Added</option>
              <option value="appliedAt:desc">Applied Date (Newest)</option>
              <option value="appliedAt:asc">Applied Date (Oldest)</option>
              <option value="company:asc">Company (A → Z)</option>
              <option value="status:asc">Status</option>
            </select>
          </div>
        </div>
      </div>

      {/* Safety Notice: explicitly clarifying no auto-submit */}
      <div className="tracker-safety-callout">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span>
          ApplyOnce autofill never automatically submits forms or logs history. Track your submitted applications manually here.
        </span>
      </div>

      {/* Applications List Area */}
      {loading ? (
        <div className="tracker-loading-state">
          <svg className="spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeLinecap="round" />
          </svg>
          <span>Loading applications…</span>
        </div>
      ) : error ? (
        <div className="alert alert-danger" role="alert">
          <div className="alert-body">
            <div className="alert-title">Storage Error</div>
            <p className="alert-message">{error}</p>
          </div>
        </div>
      ) : applications.length === 0 ? (
        /* Meaningful Empty State when 0 total records exist */
        <div className="tracker-empty-state" id="tracker-empty-initial">
          <div className="empty-icon-wrap">
            <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
          </div>
          <h3 className="empty-state-title">No applications tracked yet</h3>
          <p className="empty-state-desc">
            Keep all your job applications organized in one private, offline place.
            Your data is stored exclusively in this browser.
          </p>
          <button
            id="empty-add-btn"
            type="button"
            className="btn btn-primary"
            onClick={handleOpenAdd}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add your first application
          </button>
        </div>
      ) : filteredApps.length === 0 ? (
        /* Meaningful Empty State when Search/Filter yields 0 matches */
        <div className="tracker-empty-state" id="tracker-empty-filtered">
          <div className="empty-icon-wrap empty-icon-wrap--subtle">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <h3 className="empty-state-title">No matching applications</h3>
          <p className="empty-state-desc">
            No records matched &ldquo;{search}&rdquo; with the selected filters.
          </p>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={handleClearFilters}
          >
            Clear filters & search
          </button>
        </div>
      ) : (
        /* Render Application Cards */
        <div className="applications-list" id="applications-list">
          {filteredApps.map((app) => (
            <ApplicationCard
              key={app.id}
              app={app}
              onEdit={() => handleOpenEdit(app)}
              onDelete={() => setDeleteConfirmId(app.id)}
              onStatusChange={(newStatus) => handleQuickStatusChange(app.id, newStatus)}
            />
          ))}
        </div>
      )}

      {/* Add / Edit Modal Dialog */}
      {isFormOpen && (
        <div
          className="tracker-modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="tracker-modal-title"
        >
          <div className="tracker-modal-card">
            <div className="tracker-modal-header">
              <h3 id="tracker-modal-title" className="tracker-modal-title">
                {editingId ? 'Edit Application' : 'Add Application'}
              </h3>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setIsFormOpen(false)}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>

            {formErrors.length > 0 && (
              <div className="alert alert-danger form-error-alert" role="alert">
                <ul className="form-error-list">
                  {formErrors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <form onSubmit={handleSaveForm} className="tracker-form">
              {/* Company & Title */}
              <div className="form-group">
                <label className="form-label" htmlFor="app-company">
                  Company <span className="req-star">*</span>
                </label>
                <input
                  id="app-company"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Stripe, Google, Linear"
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="app-job-title">
                  Job Title <span className="req-star">*</span>
                </label>
                <input
                  id="app-job-title"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Senior Frontend Engineer"
                  value={formData.jobTitle}
                  onChange={(e) => setFormData({ ...formData, jobTitle: e.target.value })}
                  required
                />
              </div>

              {/* Status & Applied Date */}
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label" htmlFor="app-status">
                    Status
                  </label>
                  <select
                    id="app-status"
                    className="form-select"
                    value={formData.status}
                    onChange={(e) => {
                      const nextStatus = e.target.value;
                      setFormData({
                        ...formData,
                        status: nextStatus,
                        // auto-populate applied date if user switches to Applied and date is empty
                        appliedAt:
                          nextStatus === 'Applied' && !formData.appliedAt
                            ? new Date().toISOString().slice(0, 10)
                            : formData.appliedAt,
                      });
                    }}
                  >
                    {STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {STATUS_META[st]?.icon} {st}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="app-applied-at">
                    Date
                  </label>
                  <input
                    id="app-applied-at"
                    type="date"
                    className="form-input"
                    value={formData.appliedAt}
                    onChange={(e) => setFormData({ ...formData, appliedAt: e.target.value })}
                  />
                </div>
              </div>

              {/* Job URL */}
              <div className="form-group">
                <label className="form-label" htmlFor="app-job-url">
                  Job Posting URL
                </label>
                <input
                  id="app-job-url"
                  type="url"
                  className="form-input"
                  placeholder="https://..."
                  value={formData.jobUrl}
                  onChange={(e) => setFormData({ ...formData, jobUrl: e.target.value })}
                />
              </div>

              {/* Notes */}
              <div className="form-group">
                <label className="form-label" htmlFor="app-notes">
                  Notes
                </label>
                <textarea
                  id="app-notes"
                  className="form-textarea"
                  rows="3"
                  placeholder="Recruiter contact, interview stages, salary range, follow-up dates…"
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                />
              </div>

              {/* Form Actions */}
              <div className="tracker-modal-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setIsFormOpen(false)}
                >
                  Cancel
                </button>
                <button
                  id="save-application-btn"
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? 'Saving…' : editingId ? 'Update Record' : 'Save Record'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirmId && (
        <div className="tracker-modal-overlay" role="dialog" aria-modal="true">
          <div className="tracker-modal-card tracker-modal-card--sm">
            <div className="delete-modal-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <path d="M3 6h18" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                <line x1="10" y1="11" x2="10" y2="17" />
                <line x1="14" y1="11" x2="14" y2="17" />
              </svg>
            </div>
            <h3 className="delete-modal-title">Delete Application?</h3>
            <p className="delete-modal-desc">
              This application record will be permanently deleted from local storage.
            </p>
            <div className="tracker-modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteConfirmId(null)}
              >
                Cancel
              </button>
              <button
                id="confirm-delete-app-btn"
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmDelete}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Individual Application Card Component ───────────────────────────────────

function ApplicationCard({ app, onEdit, onDelete, onStatusChange }) {
  const [expanded, setExpanded] = useState(false);
  const meta = STATUS_META[app.status] || STATUS_META.Interested;

  return (
    <div className="app-card" id={`app-card-${app.id}`}>
      <div className="app-card-main">
        {/* Top Header: Company & Quick Status Dropdown */}
        <div className="app-card-header">
          <div className="app-card-titles">
            <h4 className="app-company-name">{app.company}</h4>
            <div className="app-job-title">{app.jobTitle}</div>
          </div>

          <div className="app-status-wrap">
            <span
              className="app-status-badge"
              style={{
                color: meta.color,
                backgroundColor: meta.bg,
                borderColor: `${meta.color}40`,
              }}
            >
              <span className="status-badge-icon">{meta.icon}</span>
              <select
                className="app-status-select"
                value={app.status}
                onChange={(e) => onStatusChange(e.target.value)}
                aria-label={`Status for ${app.company}`}
                id={`status-select-${app.id}`}
              >
                {STATUSES.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </span>
          </div>
        </div>

        {/* Metadata row: Applied date, link, notes indicator */}
        <div className="app-card-meta-row">
          {app.appliedAt && (
            <span className="app-meta-item" title="Application date">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {app.appliedAt}
            </span>
          )}

          {app.jobUrl && (
            <a
              href={app.jobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="app-meta-link"
              title={app.jobUrl}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Job Posting
            </a>
          )}

          {app.notes && (
            <button
              type="button"
              className="app-notes-toggle"
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
              title="Toggle notes"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              {expanded ? 'Hide notes' : 'Notes'}
            </button>
          )}

          <div className="app-card-actions">
            <button
              type="button"
              className="btn-icon-ghost"
              onClick={onEdit}
              title="Edit application"
              aria-label={`Edit ${app.company}`}
              id={`edit-app-${app.id}`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>

            <button
              type="button"
              className="btn-icon-ghost btn-icon-ghost--danger"
              onClick={onDelete}
              title="Delete application"
              aria-label={`Delete ${app.company}`}
              id={`delete-app-${app.id}`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>

        {/* Expandable Notes display */}
        {expanded && app.notes && (
          <div className="app-card-notes">
            <div className="notes-label">Notes:</div>
            <p className="notes-body">{app.notes}</p>
          </div>
        )}
      </div>
    </div>
  );
}
