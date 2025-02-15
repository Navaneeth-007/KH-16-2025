// src/popup/popup.js
document.addEventListener('DOMContentLoaded', async function() {
    const apiKeyInput = document.getElementById('apiKey');
    const saveButton = document.getElementById('saveKey');
    const toggle = document.getElementById('extensionToggle');
    const voiceButton = document.getElementById('toggleButton');
    const status = document.getElementById('status');
    let voiceAssistant = null;
  
    // Function to update voice button visibility
    function updateVoiceButtonVisibility() {
        const hasApiKey = apiKeyInput.value.trim() !== '';
        const isExtensionEnabled = toggle.checked;
        
        if (hasApiKey && isExtensionEnabled) {
            voiceButton.classList.add('visible');
        } else {
            voiceButton.classList.remove('visible');
            voiceButton.setAttribute('data-enabled', 'false');
            voiceButton.querySelector('.button-text').textContent = 'Enable Voice Assistant';
        }
    }
  
    // Load saved state
    const state = await chrome.runtime.sendMessage({ type: 'getState' });
    if (state.apiKey) {
      apiKeyInput.value = state.apiKey;
    }
    toggle.checked = state.enabled || false;
  
    // Initial visibility check
    updateVoiceButtonVisibility();
  
    function showStatus(message, isError = false) {
      status.textContent = message;
      status.className = `status ${isError ? 'error' : 'success'}`;
      status.style.display = 'block';
      setTimeout(() => {
        status.className = 'status';
        status.style.display = 'none';
      }, 3000);
    }
  
    async function validateApiKey(apiKey) {
      try {
        const response = await fetch('https://api.openai.com/v1/models', {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        });
  
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error?.message || 'Invalid API key');
        }
  
        return true;
      } catch (error) {
        console.error('API Validation Error:', error.message);
        throw new Error(error.message || 'Failed to validate API key');
      }
    }
  
    // Save API key
    saveButton.addEventListener('click', async function() {
      const apiKey = apiKeyInput.value.trim();
      
      if (!apiKey) {
        showStatus('Please enter an API key', true);
        return;
      }
  
      // Disable save button while validating
      saveButton.disabled = true;
      saveButton.textContent = 'Validating...';
      
      try {
        // Validate API key
        await validateApiKey(apiKey);
  
        // Save the valid API key
        await chrome.storage.local.set({ apiKey });
        chrome.runtime.sendMessage({ type: 'updateApiKey', apiKey });
        
        showStatus('API key saved successfully!');
        updateVoiceButtonVisibility();
      } catch (error) {
        let errorMessage = 'Invalid API key';
        
        if (error.message.includes('Request failed')) {
          errorMessage = 'Network error. Please check your internet connection.';
        } else if (error.message.includes('invalid_api_key')) {
          errorMessage = 'Invalid API key format';
        } else if (error.message.includes('insufficient_quota')) {
          errorMessage = 'API key has insufficient quota';
        }
        
        showStatus(errorMessage, true);
        apiKeyInput.value = ''; // Clear invalid API key
        updateVoiceButtonVisibility();
      } finally {
        // Re-enable save button
        saveButton.disabled = false;
        saveButton.textContent = 'Save Key';
      }
    });
  
    // Handle toggle
    toggle.addEventListener('change', async function() {
      const { apiKey } = await chrome.storage.local.get('apiKey');
      
      if (!apiKey && toggle.checked) {
        showStatus('Please save your API key first', true);
        toggle.checked = false;
        updateVoiceButtonVisibility();
        return;
      }
  
      const enabled = toggle.checked;
      
      try {
        await chrome.storage.local.set({ enabled });
        
        chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              type: 'toggleExtension',
              enabled
            }).catch(error => {
              console.log('Tab not ready:', error);
            });
          }
        });
        
        chrome.runtime.sendMessage({ type: 'toggleExtension', enabled });
        showStatus(`Extension ${enabled ? 'enabled' : 'disabled'}`);
        updateVoiceButtonVisibility();

        if (!enabled && voiceButton.getAttribute('data-enabled') === 'true') {
            // Disable voice assistant if extension is turned off
            voiceButton.click();
        }
      } catch (error) {
        console.error('Toggle error:', error);
        showStatus('Failed to toggle extension', true);
        toggle.checked = !enabled; // Revert toggle state
        updateVoiceButtonVisibility();
      }
    });
  
    // Replace the isContentScriptReady and waitForContentScript functions
    async function isContentScriptReady(tabId) {
      try {
        // First check with background script
        const bgResponse = await chrome.runtime.sendMessage({ 
          type: 'checkContentScript',
          tabId 
        });
        
        if (bgResponse.ready) {
          // Verify with content script
          const response = await chrome.tabs.sendMessage(tabId, { 
            type: 'isContentScriptReady' 
          });
          return response && response.ready;
        }
        return false;
      } catch (error) {
        return false;
      }
    }

    async function waitForContentScript(tabId) {
      showStatus('Initializing...'); // Show immediate feedback
      
      // Quick initial check (3 rapid attempts)
      for (let i = 0; i < 3; i++) {
        if (await isContentScriptReady(tabId)) {
          return true;
        }
        await new Promise(resolve => setTimeout(resolve, 200)); // Reduced to 200ms
      }

      // If not ready, show loading message
      showStatus('Setting up voice assistant...');
      
      // Final attempts without page refresh
      for (let i = 0; i < 3; i++) {
        if (await isContentScriptReady(tabId)) {
          return true;
        }
        await new Promise(resolve => setTimeout(resolve, 300)); // Reduced to 300ms
      }

      // If still not ready, show error
      showStatus('Voice assistant initialization failed. Please refresh the page.', true);
      return false;
    }

    // Add a timeout wrapper for message sending
    async function sendMessageWithTimeout(tabId, message, timeout = 5000) {
        return Promise.race([
            chrome.tabs.sendMessage(tabId, message),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Message timeout')), timeout)
            )
        ]);
    }

    // Update the voice button click handler
    voiceButton.addEventListener('click', async function() {
        if (!apiKeyInput.value.trim() || !toggle.checked) {
            showStatus('Please ensure API key is set and extension is enabled', true);
            return;
        }

        const currentlyEnabled = this.getAttribute('data-enabled') === 'true';
        
        try {
            const tabs = await chrome.tabs.query({active: true, currentWindow: true});
            if (tabs[0]) {
                this.disabled = true;
                showStatus('Initializing voice assistant...');
                
                try {
                    const response = await sendMessageWithTimeout(tabs[0].id, {
                        type: 'toggleVoiceAssistant',
                        enabled: !currentlyEnabled
                    });

                    if (response && response.success) {
                        this.setAttribute('data-enabled', (!currentlyEnabled).toString());
                        this.querySelector('.button-text').textContent = 
                            currentlyEnabled ? 'Enable Voice Assistant' : 'Disable Voice Assistant';
                        
                        showStatus(`Voice assistant ${!currentlyEnabled ? 'enabled' : 'disabled'}`);
                    } else {
                        throw new Error(response?.error || 'Failed to toggle voice assistant');
                    }
                } catch (error) {
                    if (error.message === 'Message timeout') {
                        showStatus('Voice assistant is taking too long to respond. Please refresh the page.', true);
                    } else {
                        showStatus(error.message || 'Failed to toggle voice assistant', true);
                    }
                }
            }
        } catch (error) {
            console.error('Error toggling voice assistant:', error);
            showStatus('Failed to toggle voice assistant. Please try again.', true);
        } finally {
            this.disabled = false;
        }
    });
  });