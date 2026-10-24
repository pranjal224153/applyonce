import React from 'react';
import { isValidUrl } from '../utils/validators';

export default function LinksManager({ links, onChange, errors = {} }) {
  const handleAddLink = () => {
    const newLink = {
      id: `link_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
      label: '',
      url: '',
    };
    onChange([...links, newLink]);
  };

  const handleUpdateLink = (id, field, value) => {
    const updated = links.map((link) =>
      link.id === id ? { ...link, [field]: value } : link
    );
    onChange(updated);
  };

  const handleDeleteLink = (id) => {
    const updated = links.filter((link) => link.id !== id);
    onChange(updated);
  };

  return (
    <div className="custom-links-section">
      <div className="section-header-row">
        <div>
          <h3 className="section-subtitle">Custom & Platform Links</h3>
          <p className="section-hint">
            Add unlimited links (e.g., HackerRank, Twitter/X, Medium, Behance, Google Drive Resume).
          </p>
        </div>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={handleAddLink}
          id="add-custom-link-btn"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
          Add link
        </button>
      </div>

      {links.length === 0 ? (
        <div className="empty-links-box">
          <div className="empty-links-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
            </svg>
          </div>
          <p>No custom links added yet.</p>
          <button
            type="button"
            className="link-action-text"
            onClick={handleAddLink}
          >
            Click here to add your first custom link
          </button>
        </div>
      ) : (
        <div className="custom-links-list">
          {links.map((link, index) => {
            const errorKey = `customLink_${link.id}`;
            const hasError = Boolean(errors[errorKey]);

            return (
              <div key={link.id} className={`custom-link-card ${hasError ? 'card-has-error' : ''}`}>
                <div className="custom-link-inputs">
                  <div className="input-group">
                    <label htmlFor={`custom-label-${link.id}`} className="field-label-sm">
                      Label
                    </label>
                    <input
                      id={`custom-label-${link.id}`}
                      type="text"
                      className="form-input form-input-sm"
                      placeholder="e.g. HackerRank, Resume Drive"
                      value={link.label}
                      onChange={(e) => handleUpdateLink(link.id, 'label', e.target.value)}
                    />
                  </div>

                  <div className="input-group flex-1">
                    <label htmlFor={`custom-url-${link.id}`} className="field-label-sm">
                      URL
                    </label>
                    <input
                      id={`custom-url-${link.id}`}
                      type="text"
                      className={`form-input form-input-sm ${hasError ? 'input-error' : ''}`}
                      placeholder="https://..."
                      value={link.url}
                      onChange={(e) => handleUpdateLink(link.id, 'url', e.target.value)}
                    />
                  </div>

                  <button
                    type="button"
                    className="btn-icon-danger"
                    title="Remove link"
                    aria-label={`Remove ${link.label || 'link'}`}
                    onClick={() => handleDeleteLink(link.id)}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"></polyline>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                  </button>
                </div>

                {hasError && (
                  <span className="field-error-text">
                    {errors[errorKey]}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
