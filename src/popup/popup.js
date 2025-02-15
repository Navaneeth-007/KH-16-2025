document.addEventListener('DOMContentLoaded', async () => {
    const startReadingBtn = document.getElementById('startReading');
    const pauseReadingBtn = document.getElementById('pauseReading');
    const toggleVoiceControlBtn = document.getElementById('toggleVoiceControl');
    const readSpeedInput = document.getElementById('readSpeed');
    const speedValueSpan = document.getElementById('speedValue');
    const voiceSelect = document.getElementById('voiceSelect');
    const status = document.getElementById('status');
    const listeningIndicator = document.getElementById('listening-indicator');

    let isReading = false;
    let isVoiceControlEnabled = false;

    // Ensure content script is injected
    await ensureContentScriptInjected();

    // Initialize available voices
    function initVoices() {
        const voices = speechSynthesis.getVoices();
        voiceSelect.innerHTML = '';
        voices.forEach((voice, index) => {
            const option = document.createElement('option');
            option.value = index;
            option.textContent = `${voice.name} (${voice.lang})`;
            voiceSelect.appendChild(option);
        });
    }

    // Handle voice list changes
    speechSynthesis.onvoiceschanged = initVoices;
    initVoices();

    // Update speed value display
    readSpeedInput.addEventListener('input', () => {
        speedValueSpan.textContent = `${readSpeedInput.value}x`;
        chrome.storage.sync.set({ readSpeed: readSpeedInput.value });
    });

    // Load saved settings
    chrome.storage.sync.get(['readSpeed', 'selectedVoice', 'voiceControlEnabled'], (result) => {
        if (result.readSpeed) {
            readSpeedInput.value = result.readSpeed;
            speedValueSpan.textContent = `${result.readSpeed}x`;
        }
        if (result.selectedVoice) {
            voiceSelect.value = result.selectedVoice;
        }
        if (result.voiceControlEnabled) {
            isVoiceControlEnabled = result.voiceControlEnabled;
            updateVoiceControlUI();
        }
    });

    // Save voice selection
    voiceSelect.addEventListener('change', () => {
        chrome.storage.sync.set({ selectedVoice: voiceSelect.value });
    });

    // Ensure content script is injected before sending messages
    async function ensureContentScriptInjected() {
        try {
            const response = await chrome.runtime.sendMessage({ action: 'ensureInjected' });
            if (!response || !response.success) {
                status.textContent = 'Error: Could not initialize extension';
                disableControls();
            }
        } catch (error) {
            console.error('Error ensuring content script:', error);
            status.textContent = 'Error: Could not initialize extension';
            disableControls();
        }
    }

    function disableControls() {
        startReadingBtn.disabled = true;
        pauseReadingBtn.disabled = true;
        toggleVoiceControlBtn.disabled = true;
    }

    // Start reading
    startReadingBtn.addEventListener('click', async () => {
        await ensureContentScriptInjected();
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;
            chrome.tabs.sendMessage(tabs[0].id, { 
                action: 'startReading',
                settings: {
                    speed: readSpeedInput.value,
                    voiceIndex: voiceSelect.value
                }
            });
        });
        isReading = true;
        updateUI();
    });

    // Pause reading
    pauseReadingBtn.addEventListener('click', async () => {
        await ensureContentScriptInjected();
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (!tabs[0]) return;
            chrome.tabs.sendMessage(tabs[0].id, { action: 'pauseReading' });
        });
        isReading = false;
        updateUI();
    });

    // Toggle voice control
    toggleVoiceControlBtn.addEventListener('click', async () => {
        try {
            await ensureContentScriptInjected();
            
            // Request microphone permission if enabling voice control
            if (!isVoiceControlEnabled) {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                stream.getTracks().forEach(track => track.stop()); // Stop the stream after permission check
            }

            isVoiceControlEnabled = !isVoiceControlEnabled;
            chrome.storage.sync.set({ voiceControlEnabled: isVoiceControlEnabled });
            
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0]) return;
                chrome.tabs.sendMessage(tabs[0].id, { 
                    action: 'toggleVoiceControl',
                    enabled: isVoiceControlEnabled
                });
            });
            
            updateVoiceControlUI();
        } catch (error) {
            console.error('Microphone access denied:', error);
            status.textContent = 'Microphone access required for voice control';
            isVoiceControlEnabled = false;
            updateVoiceControlUI();
        }
    });

    function updateUI() {
        startReadingBtn.disabled = isReading;
        pauseReadingBtn.disabled = !isReading;
        status.textContent = isReading ? 'Reading page...' : 'Ready to assist';
    }

    function updateVoiceControlUI() {
        toggleVoiceControlBtn.textContent = isVoiceControlEnabled ? 'Disable Voice Control' : 'Enable Voice Control';
        listeningIndicator.classList.toggle('active', isVoiceControlEnabled);
    }

    // Listen for messages from content script
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'updateStatus') {
            status.textContent = message.status;
            if (message.status === 'Microphone access denied' || 
                message.status === 'Could not access microphone') {
                isVoiceControlEnabled = false;
                updateVoiceControlUI();
            }
        }
    });
}); 