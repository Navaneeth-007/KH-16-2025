document.addEventListener('DOMContentLoaded', async () => {
    const toggleReader = document.getElementById('toggleReader');
    const toggleVoice = document.getElementById('toggleVoice');
    const describeImages = document.getElementById('describeImages');
    const status = document.getElementById('status');
    const readSpeed = document.getElementById('readSpeed');
    const speedValue = document.getElementById('speedValue');
    const voiceSelect = document.getElementById('voiceSelect');
    const listeningIndicator = document.getElementById('listening-indicator');

    let isReading = false;
    let isListening = false;

    // Initialize voice select
    function populateVoiceList() {
        const voices = speechSynthesis.getVoices();
        voiceSelect.innerHTML = '';
        voices.forEach((voice, i) => {
            const option = new Option(
                `${voice.name} (${voice.lang})${voice.default ? ' — Default' : ''}`,
                i
            );
            voiceSelect.options.add(option);
        });
    }

    populateVoiceList();
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = populateVoiceList;
    }

    // Ensure content script is injected
    async function ensureContentScriptInjected() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return false;

            // Try to send a test message
            try {
                await chrome.tabs.sendMessage(tab.id, { action: 'ping' });
                return true;
            } catch (error) {
                // If message fails, inject the content script
                await chrome.scripting.executeScript({
                    target: { tabId: tab.id },
                    files: ['content/content.js']
                });
                await chrome.scripting.insertCSS({
                    target: { tabId: tab.id },
                    files: ['content/content.css']
                });
                return true;
            }
        } catch (error) {
            console.error('Error ensuring content script:', error);
            return false;
        }
    }

    // Send message to content script
    async function sendMessage(action, data = {}) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id) {
            status.textContent = 'Error: No active tab found';
            return;
        }

        try {
            // Ensure content script is injected before sending message
            const isInjected = await ensureContentScriptInjected();
            if (!isInjected) {
                throw new Error('Could not inject content script');
            }

            const response = await chrome.tabs.sendMessage(tab.id, { action, ...data });
            if (!response?.success && action !== 'getState') {
                throw new Error(response?.error || 'Unknown error');
            }
            return response;
        } catch (error) {
            console.error('Error sending message:', error);
            status.textContent = `Error: ${error.message}`;
            throw error;
        }
    }

    // Update UI based on state
    function updateUI() {
        toggleReader.textContent = isReading ? 'Stop Reading' : 'Start Reading (Alt+R)';
        toggleVoice.textContent = isListening ? 'Disable Voice Control' : 'Enable Voice Control';
        listeningIndicator.classList.toggle('active', isListening);
    }

    // Button click handlers with error handling
    toggleReader.addEventListener('click', async () => {
        try {
            await sendMessage('toggleReader');
            isReading = !isReading;
            updateUI();
        } catch (error) {
            console.error('Toggle reader error:', error);
        }
    });

    toggleVoice.addEventListener('click', async () => {
        try {
            await sendMessage('toggleVoice');
            isListening = !isListening;
            updateUI();
        } catch (error) {
            console.error('Toggle voice error:', error);
        }
    });

    describeImages.addEventListener('click', async () => {
        try {
            await sendMessage('describeImages');
        } catch (error) {
            console.error('Describe images error:', error);
        }
    });

    // Speed control
    readSpeed.addEventListener('input', async () => {
        try {
            const speed = readSpeed.value;
            speedValue.textContent = `${speed}x`;
            await sendMessage('setSpeed', { speed: parseFloat(speed) });
        } catch (error) {
            console.error('Set speed error:', error);
        }
    });

    // Voice selection
    voiceSelect.addEventListener('change', async () => {
        try {
            const selectedIndex = voiceSelect.selectedIndex;
            const voices = speechSynthesis.getVoices();
            if (selectedIndex >= 0 && selectedIndex < voices.length) {
                await sendMessage('setVoice', { voiceIndex: selectedIndex });
            }
        } catch (error) {
            console.error('Set voice error:', error);
        }
    });

    // Listen for status updates from content script
    chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'updateStatus') {
            status.textContent = message.status;
            if (message.isReading !== undefined) {
                isReading = message.isReading;
            }
            if (message.isListening !== undefined) {
                isListening = message.isListening;
            }
            updateUI();
        }
    });

    // Initial setup
    try {
        await ensureContentScriptInjected();
        const state = await sendMessage('getState');
        if (state) {
            isReading = state.isReading;
            isListening = state.isListening;
            updateUI();
        }
    } catch (error) {
        console.error('Initial setup error:', error);
        status.textContent = 'Error: Could not initialize extension';
    }
});