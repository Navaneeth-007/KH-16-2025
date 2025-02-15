let assistant = null;
let currentState = {
  enabled: false,
  apiKey: null
};
let processorInitialized = false;

// Function to initialize the content script
function initializeContentScript() {
  // Signal that content script is ready
  chrome.runtime.sendMessage({ 
    type: 'contentScriptReady', 
    url: window.location.href 
  });

  // Create UI elements if needed
  createVoiceAssistantUI();
}

// Initialize when document is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeContentScript);
} else {
  initializeContentScript();
}

// Initialize processor
async function initializeProcessor() {
    if (!processorInitialized) {
        try {
            await window.YOLOProcessor.initialize();
            processorInitialized = true;
            console.log('Processor initialized successfully');
        } catch (error) {
            console.error('Failed to initialize processor:', error);
        }
    }
}

// Initialize when needed
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'checkProcessor') {
        sendResponse({ initialized: processorInitialized });
        if (!processorInitialized) {
            initializeProcessor();
        }
        return true;
    }
    try {
        switch (message.type) {
            case 'isContentScriptReady':
                sendResponse({ ready: true });
                return false; // Synchronous response

            case 'toggleVoiceAssistant':
                // Handle async response properly
                (async () => {
                    try {
                        if (message.enabled) {
                            if (!assistant) {
                                assistant = new VoiceAssistant();
                            }
                            await assistant.start();
                            sendResponse({ success: true, isEnabled: true });
                        } else if (assistant) {
                            await assistant.stop();
                            sendResponse({ success: true, isEnabled: false });
                        } else {
                            sendResponse({ success: true, isEnabled: false });
                        }
                    } catch (error) {
                        console.error('Error handling voice assistant:', error);
                        sendResponse({ 
                            success: false, 
                            error: error.message || 'Failed to toggle voice assistant' 
                        });
                    }
                })();
                return true; // Will respond asynchronously

            case 'getAssistantState':
                sendResponse({
                    isEnabled: assistant && assistant.isListening
                });
                return false; // Synchronous response

            case 'toggleExtension':
                // Handle extension toggle
                (async () => {
                    try {
                        currentState.enabled = message.enabled;
                        if (message.enabled) {
                            if (!assistant) {
                                assistant = new VoiceAssistant();
                            }
                            await assistant.start();
                        } else if (assistant) {
                            await assistant.stop();
                        }
                        sendResponse({ success: true });
                    } catch (error) {
                        console.error('Error toggling extension:', error);
                        sendResponse({ success: false, error: error.message });
                    }
                })();
                return true; // Will respond asynchronously

            case 'setState':
                currentState = message.state;
                sendResponse({ success: true });
                return false; // Synchronous response

            default:
                sendResponse({ success: false, error: 'Unknown message type' });
                return false;
        }
    } catch (error) {
        console.error('Error handling message:', error);
        sendResponse({ success: false, error: error.message });
        return false;
    }
});

// Clean up on page unload
window.addEventListener('beforeunload', () => {
  if (assistant) {
    assistant.stop();
  }
});

// Initialize immediately if possible
if (document.readyState === 'complete') {
    initializeProcessor();
} else {
    window.addEventListener('load', initializeProcessor);
}