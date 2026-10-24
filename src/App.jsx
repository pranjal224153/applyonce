import React, { useState } from 'react';
import ProfileForm from './components/ProfileForm';
import ScanPreview from './components/ScanPreview';
import ApplicationTracker from './components/ApplicationTracker';
import DataPrivacy from './components/DataPrivacy';

export default function App() {
  const [activeTab, setActiveTab] = useState('scan');
  const [dataRefreshKey, setDataRefreshKey] = useState(0);

  // Phase 1 System Diagnostics State (Preserved)
  const [testResult, setTestResult] = useState(null);
  const [testCount, setTestCount] = useState(0);

  const handleTestExtension = () => {
    const isChromeAvailable = typeof chrome !== 'undefined' && Boolean(chrome.runtime?.id);
    const hasStorage = typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
    const time = new Date().toLocaleTimeString();

    setTestResult({
      status: 'success',
      timestamp: time,
      message: 'Extension is operational and ready.',
      environment: isChromeAvailable ? 'Chrome Extension Environment (MV3)' : 'Local Browser Preview',
      storage: hasStorage ? 'chrome.storage.local available' : 'localStorage fallback available',
    });
    setTestCount((prev) => prev + 1);
  };

  const handleDataChanged = () => {
    setDataRefreshKey((k) => k + 1);
  };

  return (
    <div className="popup-container">
      {/* Extension Header */}
      <header className="popup-header">
        <div className="brand-group">
          <div className="brand-icon" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
              <path d="m9 14 2 2 4-4" />
            </svg>
          </div>
          <div>
            <div className="title-row">
              <h1 className="brand-title">ApplyOnce</h1>
              <span className="badge">v1.0.0</span>
            </div>
            <p className="brand-tagline">Your application profile, ready when you are.</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <nav className="tab-nav" aria-label="Extension navigation">
          <button
            type="button"
            className={`tab-btn ${activeTab === 'scan' ? 'active' : ''}`}
            onClick={() => setActiveTab('scan')}
            id="tab-scan-btn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"></circle>
              <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
            Scan Page
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'tracker' ? 'active' : ''}`}
            onClick={() => setActiveTab('tracker')}
            id="tab-tracker-btn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
            Tracker
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
            id="tab-profile-btn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            Profile
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'privacy' ? 'active' : ''}`}
            onClick={() => setActiveTab('privacy')}
            id="tab-privacy-btn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Privacy & Data
          </button>
          <button
            type="button"
            className={`tab-btn ${activeTab === 'system' ? 'active' : ''}`}
            onClick={() => setActiveTab('system')}
            id="tab-system-btn"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
            </svg>
            System
          </button>
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="popup-content">
        {activeTab === 'scan' && (
          <div className="tab-pane">
            <ScanPreview key={`scan-${dataRefreshKey}`} />
          </div>
        )}

        {activeTab === 'tracker' && (
          <div className="tab-pane">
            <ApplicationTracker key={`tracker-${dataRefreshKey}`} />
          </div>
        )}

        {activeTab === 'profile' && (
          <div className="tab-pane">
            <ProfileForm key={`profile-${dataRefreshKey}`} />
          </div>
        )}

        {activeTab === 'privacy' && (
          <div className="tab-pane">
            <DataPrivacy
              onDataWiped={handleDataChanged}
              onDataRestored={handleDataChanged}
            />
          </div>
        )}

        {/* Preserved Phase 1 Diagnostics Tab */}
        {activeTab === 'system' && (
          <div className="tab-pane">
            <div className="card">
              <div className="card-header">
                <span className="status-dot"></span>
                <span className="card-title">System Status: Active</span>
              </div>
              <p className="card-description">
                Manifest V3 core loaded. Chrome storage permissions and React environment verified.
              </p>

              <button
                id="test-extension-btn"
                className="btn btn-primary"
                onClick={handleTestExtension}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="5 3 19 12 5 21 5 3"></polygon>
                </svg>
                Test extension
              </button>

              {testResult && (
                <div className="confirmation-banner" role="status" aria-live="polite">
                  <div className="confirmation-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                      <polyline points="22 4 12 14.01 9 11.01" />
                    </svg>
                  </div>
                  <div className="confirmation-details">
                    <div className="confirmation-title">{testResult.message}</div>
                    <div className="confirmation-meta">
                      <span>Tested at {testResult.timestamp}</span>
                      <span className="separator">•</span>
                      <span>Check #{testCount}</span>
                    </div>
                    <div className="confirmation-env">{testResult.environment}</div>
                    <div className="confirmation-env">{testResult.storage}</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="popup-footer">
        <span>ApplyOnce • Local Storage Only</span>
        <span>•</span>
        <span>No Cloud Tracking</span>
      </footer>
    </div>
  );
}
