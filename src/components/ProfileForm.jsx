import React, { useState, useEffect } from 'react';
import { getProfile, saveProfile, resetProfile } from '../services/storage';
import { validateProfile } from '../utils/validators';
import LinksManager from './LinksManager';

export default function ProfileForm() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [errors, setErrors] = useState({});
  const [statusMessage, setStatusMessage] = useState(null);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Load profile from storage on mount
  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      try {
        setLoading(true);
        const data = await getProfile();
        if (isMounted) {
          setProfile(data);
          setLoading(false);
        }
      } catch (err) {
        if (isMounted) {
          setStatusMessage({
            type: 'error',
            text: `Failed to load profile: ${err.message || 'Unknown error'}`,
          });
          setLoading(false);
        }
      }
    }
    loadData();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleChange = (field, value) => {
    setProfile((prev) => {
      const next = { ...prev, [field]: value };

      // Helpful helper: if user types full name, auto-split first and last if they were empty
      if (field === 'fullName' && (!prev.firstName || !prev.lastName)) {
        const parts = value.trim().split(/\s+/);
        if (parts.length > 0 && !prev.firstName) {
          next.firstName = parts[0] || '';
        }
        if (parts.length > 1 && !prev.lastName) {
          next.lastName = parts.slice(1).join(' ') || '';
        }
      }

      return next;
    });

    setHasUnsavedChanges(true);

    // Clear individual error for field on change
    if (errors[field]) {
      setErrors((prev) => {
        const copy = { ...prev };
        delete copy[field];
        return copy;
      });
    }
  };

  const handleCustomLinksChange = (updatedLinks) => {
    setProfile((prev) => ({
      ...prev,
      customLinks: updatedLinks,
    }));
    setHasUnsavedChanges(true);
  };

  const handleSave = async (e) => {
    if (e) e.preventDefault();

    // Validate fields (optional, but if filled must be valid)
    const validationErrors = validateProfile(profile);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      setStatusMessage({
        type: 'error',
        text: 'Please correct the highlighted fields before saving.',
      });
      return;
    }

    try {
      setSaving(true);
      setErrors({});
      await saveProfile(profile);
      setHasUnsavedChanges(false);
      setStatusMessage({
        type: 'success',
        text: 'Profile saved successfully! Data will persist across sessions.',
      });

      // Clear success notification after 4 seconds
      setTimeout(() => {
        setStatusMessage((current) => (current?.type === 'success' ? null : current));
      }, 4000);
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: `Failed to save profile: ${err.message || 'Unknown storage error'}`,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmReset = async () => {
    try {
      setResetting(true);
      const blankProfile = await resetProfile();
      setProfile(blankProfile);
      setErrors({});
      setHasUnsavedChanges(false);
      setShowResetConfirm(false);
      setStatusMessage({
        type: 'info',
        text: 'Profile has been reset to defaults.',
      });

      setTimeout(() => {
        setStatusMessage((current) => (current?.type === 'info' ? null : current));
      }, 3500);
    } catch (err) {
      setStatusMessage({
        type: 'error',
        text: `Failed to reset profile: ${err.message}`,
      });
    } finally {
      setResetting(false);
    }
  };

  if (loading) {
    return (
      <div className="state-card state-loading">
        <div className="spinner"></div>
        <p className="state-text">Loading saved profile from storage...</p>
      </div>
    );
  }

  return (
    <form className="profile-form" onSubmit={handleSave} noValidate>
      {/* Status Alert Banner */}
      {statusMessage && (
        <div className={`status-banner status-${statusMessage.type}`} role="alert">
          <div className="status-icon">
            {statusMessage.type === 'success' && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
            )}
            {statusMessage.type === 'error' && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            )}
            {statusMessage.type === 'info' && (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="16" x2="12" y2="12"></line>
                <line x1="12" y1="8" x2="12.01" y2="8"></line>
              </svg>
            )}
          </div>
          <span className="status-text">{statusMessage.text}</span>
          <button
            type="button"
            className="btn-close-banner"
            onClick={() => setStatusMessage(null)}
            aria-label="Dismiss alert"
          >
            ×
          </button>
        </div>
      )}

      {/* SECTION 1: Personal Details */}
      <section className="form-card">
        <div className="card-section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          <h4>Personal Information</h4>
        </div>

        <div className="form-grid">
          <div className="field-full">
            <label htmlFor="field-fullName" className="field-label">Full Name</label>
            <input
              id="field-fullName"
              type="text"
              className="form-input"
              placeholder="e.g. Jane Doe"
              value={profile.fullName}
              onChange={(e) => handleChange('fullName', e.target.value)}
            />
          </div>

          <div className="field-half">
            <label htmlFor="field-firstName" className="field-label">First Name</label>
            <input
              id="field-firstName"
              type="text"
              className="form-input"
              placeholder="Jane"
              value={profile.firstName}
              onChange={(e) => handleChange('firstName', e.target.value)}
            />
          </div>

          <div className="field-half">
            <label htmlFor="field-lastName" className="field-label">Last Name</label>
            <input
              id="field-lastName"
              type="text"
              className="form-input"
              placeholder="Doe"
              value={profile.lastName}
              onChange={(e) => handleChange('lastName', e.target.value)}
            />
          </div>

          <div className="field-full">
            <label htmlFor="field-email" className="field-label">Email Address</label>
            <input
              id="field-email"
              type="email"
              className={`form-input ${errors.email ? 'input-error' : ''}`}
              placeholder="jane.doe@example.com"
              value={profile.email}
              onChange={(e) => handleChange('email', e.target.value)}
            />
            {errors.email && <span className="field-error-text">{errors.email}</span>}
          </div>

          <div className="field-half">
            <label htmlFor="field-phone" className="field-label">Phone Number</label>
            <input
              id="field-phone"
              type="tel"
              className="form-input"
              placeholder="+1 (555) 000-1234"
              value={profile.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
            />
          </div>

          <div className="field-half">
            <label htmlFor="field-location" className="field-label">Location / City</label>
            <input
              id="field-location"
              type="text"
              className="form-input"
              placeholder="San Francisco, CA"
              value={profile.location}
              onChange={(e) => handleChange('location', e.target.value)}
            />
          </div>
        </div>
      </section>

      {/* SECTION 2: Education & Skills */}
      <section className="form-card">
        <div className="card-section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 10v6M2 10l10-5 10 5-10 5z"></path>
            <path d="M6 12v5c3 3 9 3 12 0v-5"></path>
          </svg>
          <h4>Education & Skills</h4>
        </div>

        <div className="form-grid">
          <div className="field-full">
            <label htmlFor="field-college" className="field-label">College / University</label>
            <input
              id="field-college"
              type="text"
              className="form-input"
              placeholder="Stanford University"
              value={profile.college}
              onChange={(e) => handleChange('college', e.target.value)}
            />
          </div>

          <div className="field-half">
            <label htmlFor="field-degree" className="field-label">Degree</label>
            <input
              id="field-degree"
              type="text"
              className="form-input"
              placeholder="B.S. in Computer Science"
              value={profile.degree}
              onChange={(e) => handleChange('degree', e.target.value)}
            />
          </div>

          <div className="field-half">
            <label htmlFor="field-graduationYear" className="field-label">Graduation Year</label>
            <input
              id="field-graduationYear"
              type="text"
              maxLength={4}
              className={`form-input ${errors.graduationYear ? 'input-error' : ''}`}
              placeholder="2025"
              value={profile.graduationYear}
              onChange={(e) => handleChange('graduationYear', e.target.value)}
            />
            {errors.graduationYear && (
              <span className="field-error-text">{errors.graduationYear}</span>
            )}
          </div>

          <div className="field-full">
            <label htmlFor="field-skills" className="field-label">Key Skills</label>
            <textarea
              id="field-skills"
              rows={2}
              className="form-input form-textarea"
              placeholder="JavaScript, React, Node.js, Python, TypeScript, SQL, Git..."
              value={profile.skills}
              onChange={(e) => handleChange('skills', e.target.value)}
            />
            <span className="field-hint">Comma-separated or list of top technologies.</span>
          </div>
        </div>
      </section>

      {/* SECTION 3: Standard Platforms */}
      <section className="form-card">
        <div className="card-section-title">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          <h4>Platform & Portfolio Links</h4>
        </div>

        <div className="form-grid">
          <div className="field-full">
            <label htmlFor="field-github" className="field-label">
              <span className="label-with-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
                </svg>
                GitHub Profile URL
              </span>
            </label>
            <input
              id="field-github"
              type="url"
              className={`form-input ${errors.github ? 'input-error' : ''}`}
              placeholder="https://github.com/username"
              value={profile.github}
              onChange={(e) => handleChange('github', e.target.value)}
            />
            {errors.github && <span className="field-error-text">{errors.github}</span>}
          </div>

          <div className="field-full">
            <label htmlFor="field-linkedin" className="field-label">
              <span className="label-with-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                </svg>
                LinkedIn Profile URL
              </span>
            </label>
            <input
              id="field-linkedin"
              type="url"
              className={`form-input ${errors.linkedin ? 'input-error' : ''}`}
              placeholder="https://linkedin.com/in/username"
              value={profile.linkedin}
              onChange={(e) => handleChange('linkedin', e.target.value)}
            />
            {errors.linkedin && <span className="field-error-text">{errors.linkedin}</span>}
          </div>

          <div className="field-full">
            <label htmlFor="field-leetcode" className="field-label">
              <span className="label-with-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m18 16 4-4-4-4"/>
                  <path d="m6 8-4 4 4 4"/>
                  <path d="m14.5 4-5 16"/>
                </svg>
                LeetCode Profile URL
              </span>
            </label>
            <input
              id="field-leetcode"
              type="url"
              className={`form-input ${errors.leetcode ? 'input-error' : ''}`}
              placeholder="https://leetcode.com/u/username"
              value={profile.leetcode}
              onChange={(e) => handleChange('leetcode', e.target.value)}
            />
            {errors.leetcode && <span className="field-error-text">{errors.leetcode}</span>}
          </div>

          <div className="field-full">
            <label htmlFor="field-portfolio" className="field-label">
              <span className="label-with-icon">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="2" y1="12" x2="22" y2="12"></line>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                </svg>
                Portfolio Website URL
              </span>
            </label>
            <input
              id="field-portfolio"
              type="url"
              className={`form-input ${errors.portfolio ? 'input-error' : ''}`}
              placeholder="https://yourportfolio.dev"
              value={profile.portfolio}
              onChange={(e) => handleChange('portfolio', e.target.value)}
            />
            {errors.portfolio && <span className="field-error-text">{errors.portfolio}</span>}
          </div>
        </div>
      </section>

      {/* SECTION 4: Custom Links Manager */}
      <section className="form-card">
        <LinksManager
          links={profile.customLinks}
          onChange={handleCustomLinksChange}
          errors={errors}
        />
      </section>

      {/* SECTION 5: Action Toolbar */}
      <div className="form-action-bar">
        <button
          type="button"
          className="btn btn-outline-danger"
          onClick={() => setShowResetConfirm(true)}
          disabled={saving || resetting}
          id="reset-profile-btn"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/>
            <path d="M21 3v5h-5"/>
            <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/>
            <path d="M3 21v-5h5"/>
          </svg>
          Reset Profile
        </button>

        <button
          type="submit"
          className="btn btn-primary"
          disabled={saving || resetting}
          id="save-profile-btn"
        >
          {saving ? (
            <>
              <span className="spinner-small"></span>
              Saving...
            </>
          ) : (
            <>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                <polyline points="17 21 17 13 7 13 7 21"></polyline>
                <polyline points="7 3 7 8 15 8"></polyline>
              </svg>
              Save Profile {hasUnsavedChanges && '•'}
            </>
          )}
        </button>
      </div>

      {/* Confirmation Modal for Reset */}
      {showResetConfirm && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <div className="modal-warning-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
              <h3 className="modal-title">Reset Profile?</h3>
            </div>
            <p className="modal-body">
              This will clear all personal details, URLs, and custom links from your local extension storage. This action cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowResetConfirm(false)}
                disabled={resetting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmReset}
                disabled={resetting}
                id="confirm-reset-btn"
              >
                {resetting ? 'Resetting...' : 'Yes, Reset Profile'}
              </button>
            </div>
          </div>
        </div>
      )}
    </form>
  );
}
