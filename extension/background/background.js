// Track active connections
const connections = new Set();

// Handle connection lifecycle
chrome.runtime.onConnect.addListener(port => {
    connections.add(port);
    port.onDisconnect.addListener(() => {
        connections.delete(port);
    });
});

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    try {
        if (message.action === 'updateStatus') {
            // Broadcast status update to popup if it's open
            chrome.runtime.sendMessage(message).catch(() => {
                // Ignore errors when popup is closed
            });
            sendResponse({ success: true });
        } else if (message.action === 'requestMicrophonePermission') {
            chrome.permissions.request({
                permissions: ['microphone']
            }).then(granted => {
                sendResponse({ granted });
            });
        }
    } catch (error) {
        console.error('Error handling message:', error);
        sendResponse({ success: false, error: error.message });
    }
    return true; // Keep the message channel open for async response
});

// Listen for keyboard commands
chrome.commands.onCommand.addListener(async (command) => {
    if (command === 'toggle-reader') {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.id) {
            try {
                await chrome.tabs.sendMessage(tab.id, { action: 'toggleReader' });
            } catch (error) {
                console.error('Error sending toggle command:', error);
            }
        }
    }
});