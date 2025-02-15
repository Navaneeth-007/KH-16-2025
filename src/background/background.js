// Handle installation and updates
chrome.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
        // Set default settings
        chrome.storage.sync.set({
            readSpeed: 1.0,
            selectedVoice: 0,
            voiceControlEnabled: false
        });
    }
});

// Inject content script when needed
async function injectContentScript(tabId) {
    try {
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['src/content/content.js']
        });
        await chrome.scripting.insertCSS({
            target: { tabId: tabId },
            files: ['src/content/content.css']
        });
        return true;
    } catch (error) {
        console.error('Error injecting content script:', error);
        return false;
    }
}

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'ensureInjected') {
        chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
            if (tabs[0]) {
                const success = await injectContentScript(tabs[0].id);
                sendResponse({ success });
            }
        });
        return true; // Keep the message channel open for async response
    }
    
    if (message.action === 'updateStatus') {
        // Update extension badge
        if (sender.tab) {
            chrome.action.setBadgeText({
                text: message.status === 'Reading page...' ? 'ON' : '',
                tabId: sender.tab.id
            });
            
            chrome.action.setBadgeBackgroundColor({
                color: '#34a853',
                tabId: sender.tab.id
            });
        }
    }
});

// Handle keyboard shortcuts
chrome.commands.onCommand.addListener(async (command) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    // Ensure content script is injected before sending command
    await injectContentScript(tab.id);
    
    switch (command) {
        case 'start-reading':
            chrome.tabs.sendMessage(tab.id, { action: 'startReading' });
            break;
        case 'pause-reading':
            chrome.tabs.sendMessage(tab.id, { action: 'pauseReading' });
            break;
    }
}); 