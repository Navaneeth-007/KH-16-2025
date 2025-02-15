const currentState = {
  enabled: false,
  apiKey: null
};

// Helper functions for storage
const storage = {
  get: (key) => {
    return new Promise((resolve) => {
      chrome.storage.local.get([key], (result) => {
        resolve(result[key]);
      });
    });
  },
  set: (key, value) => {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [key]: value }, resolve);
    });
  }
};

// Add this at the top of background.js
const contentScriptStatus = new Map();

// Add these functions
function setContentScriptStatus(tabId, status) {
  contentScriptStatus.set(tabId, status);
}

function getContentScriptStatus(tabId) {
  return contentScriptStatus.get(tabId) || false;
}

// Initialize extension state
chrome.runtime.onInstalled.addListener(async () => {
  try {
    await chrome.storage.local.set({ enabled: false, apiKey: null });
    console.log('Extension installed, initial state set');
  } catch (error) {
    console.error('Error setting initial state:', error);
  }
});

// Load initial state
chrome.storage.local.get(['enabled', 'apiKey'], (result) => {
  currentState.enabled = result.enabled || false;
  currentState.apiKey = result.apiKey || null;
  console.log('Initial state loaded:', currentState);
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in currentState) {
        currentState[key] = newValue;
        console.log(`State updated - ${key}:`, newValue);
      }
    }
  }
});

// Listen for tab updates and inject state
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    chrome.tabs.sendMessage(tabId, {
      type: 'setState',
      state: currentState
    }).catch(error => {
      console.log('Tab not ready for message:', error);
    });
  }
});

// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'toggleExtension':
      currentState.enabled = message.enabled;
      chrome.storage.local.set({ enabled: message.enabled });
      // Broadcast to all tabs
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            type: 'toggleExtension',
            enabled: message.enabled
          }).catch(() => {/* Ignore errors for inactive tabs */});
        });
      });
      break;
    
    case 'getState':
      sendResponse(currentState);
      break;
      
    case 'updateApiKey':
      currentState.apiKey = message.apiKey;
      chrome.storage.local.set({ apiKey: message.apiKey });
      break;

    case 'contentScriptReady':
      if (sender.tab) {
        setContentScriptStatus(sender.tab.id, true);
        console.log('Content script ready in tab:', sender.tab.id, message.url);
      }
      break;

    case 'checkContentScript':
      if (sender.tab) {
        sendResponse({ ready: getContentScriptStatus(sender.tab.id) });
      }
      break;
  }
  return true;
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  contentScriptStatus.delete(tabId);
});

// Reset status when navigating
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    setContentScriptStatus(tabId, false);
  }
});