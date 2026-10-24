// Background Service Worker for ApplyOnce (Manifest V3)
chrome.runtime.onInstalled.addListener(() => {
  console.log('[ApplyOnce] Extension installed and ready.');
});
