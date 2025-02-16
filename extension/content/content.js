// Prevent duplicate initialization
if (window.voxelReader) {
    console.log('Voxel already initialized');
} else {
    class WebReader {
        constructor() {
            this.speech = null;
            this.recognition = null;
            this.isListening = false;
            this.isReading = false;
            this.isConnected = false;
            this.initializeSpeech();
            this.setupControls();
            this.checkConnection();
        }

        // Add connection checking
        async checkConnection() {
            try {
                // Try to send a test message
                await this.sendStatusUpdate('Ready to assist');
                this.isConnected = true;
            } catch (error) {
                console.log('Extension connection not ready, retrying in 1 second...');
                setTimeout(() => this.checkConnection(), 1000);
            }
        }

        // Safe message sending
        async sendStatusUpdate(status) {
            try {
                await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage({
                        action: 'updateStatus',
                        status: status,
                        isReading: this.isReading,
                        isListening: this.isListening
                    }, response => {
                        if (chrome.runtime.lastError) {
                            reject(chrome.runtime.lastError);
                        } else {
                            resolve(response);
                        }
                    });
                });
            } catch (error) {
                console.log('Failed to send status update:', error);
                this.isConnected = false;
                this.checkConnection();
            }
        }

        async initializeSpeech() {
            // Initialize speech synthesis
            try {
                if (!window.speechSynthesis) {
                    throw new Error('Speech synthesis not supported in this browser');
                }

                this.speech = new SpeechSynthesisUtterance();
                this.speech.rate = 1.0;
                this.speech.pitch = 1.0;
                this.speech.volume = 1.0;
                this.speech.lang = 'en-US';

                // Cancel any existing speech and reset synthesis
                window.speechSynthesis.cancel();

                // Wait for voices to be loaded with timeout
                const voices = await Promise.race([
                    new Promise(resolve => {
                        if (speechSynthesis.getVoices().length > 0) {
                            resolve(speechSynthesis.getVoices());
                        } else {
                            speechSynthesis.addEventListener('voiceschanged', () => {
                                resolve(speechSynthesis.getVoices());
                            }, { once: true });
                        }
                    }),
                    new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Timeout waiting for voices')), 5000)
                    )
                ]);

                // Get English voice with more detailed logging
                const englishVoice = voices.find(voice => {
                    console.log(`Checking voice: ${voice.name}, lang: ${voice.lang}, local: ${voice.localService}`);
                    return voice.lang.startsWith('en-') && !voice.localService;
                }) || voices.find(voice => voice.lang.startsWith('en-')) || voices[0];

                if (englishVoice) {
                    this.speech.voice = englishVoice;
                    console.log('Selected voice:', {
                        name: englishVoice.name,
                        lang: englishVoice.lang,
                        local: englishVoice.localService
                    });
                } else {
                    console.warn('No English voice found, using default voice');
                }

                // Initialize speech recognition
                await this.initializeSpeechRecognition();

            } catch (error) {
                console.error('Error initializing speech:', error);
                alert('Error initializing speech synthesis. Please refresh the page.');
            }
        }

        async initializeSpeechRecognition() {
            if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
                console.warn('Speech recognition is not supported in this browser');
                return;
            }

            try {
                this.recognition = new (window.webkitSpeechRecognition || window.SpeechRecognition)();
                this.recognition.continuous = true;
                this.recognition.interimResults = false;
                this.recognition.lang = 'en-US';

                this.recognition.onstart = () => {
                    console.log('Voice recognition started');
                    this.isListening = true;
                    this.sendStatusUpdate('Listening for commands...');
                };

                this.recognition.onend = () => {
                    console.log('Voice recognition ended');
                    // Restart recognition if it was supposed to be listening
                    if (this.isListening) {
                        console.log('Restarting voice recognition...');
                        this.recognition.start();
                    }
                };

                this.recognition.onresult = (event) => {
                    const command = event.results[event.results.length - 1][0].transcript.toLowerCase();
                    console.log('Received voice command:', command);
                    this.handleVoiceCommand(command);
                };

                this.recognition.onerror = (event) => {
                    console.error('Speech recognition error:', event.error);
                    if (event.error === 'not-allowed') {
                        this.isListening = false;
                        alert('Please enable microphone access in your browser settings.');
                    } else if (event.error === 'network') {
                        // Attempt to restart on network errors
                        setTimeout(() => {
                            if (this.isListening) {
                                this.recognition.start();
                            }
                        }, 1000);
                    }
                };

            } catch (error) {
                console.error('Error initializing speech recognition:', error);
                this.recognition = null;
            }
        }

        setupControls() {
            // Listen for keyboard shortcuts
            document.addEventListener('keydown', (e) => {
                if (e.altKey && e.key === 'r') {
                    this.toggleReading();
                }
            });

            // Listen for extension messages
            chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
                console.log('Received message:', message);
                try {
                    if (!message.action) {
                        sendResponse({ success: false, error: 'No action specified' });
                        return true;
                    }

                    switch (message.action) {
                        case 'ping':
                            sendResponse({ success: true });
                            break;
                        case 'toggleReader':
                            this.toggleReading();
                            sendResponse({ success: true });
                            break;
                        case 'toggleVoice':
                            this.toggleVoiceControl();
                            sendResponse({ success: true });
                            break;
                        case 'describeImages':
                            this.describeImages();
                            sendResponse({ success: true });
                            break;
                        case 'setSpeed':
                            if (this.speech) {
                                this.speech.rate = parseFloat(message.speed);
                                console.log('Set speech rate to:', this.speech.rate);
                                sendResponse({ success: true });
                            }
                            break;
                        case 'setVoice':
                            if (this.speech) {
                                const voices = speechSynthesis.getVoices();
                                if (voices[message.voiceIndex]) {
                                    this.speech.voice = voices[message.voiceIndex];
                                    console.log('Set voice to:', this.speech.voice.name);
                                    sendResponse({ success: true });
                                }
                            }
                            break;
                        case 'getState':
                            const state = {
                                success: true,
                                isReading: this.isReading,
                                isListening: this.isListening
                            };
                            console.log('Sending state:', state);
                            sendResponse(state);
                            break;
                        default:
                            console.warn('Unknown action:', message.action);
                            sendResponse({ success: false, error: 'Unknown action' });
                    }
                } catch (error) {
                    console.error('Error handling message:', error);
                    sendResponse({ success: false, error: error.message });
                }
                return true; // Keep the message channel open for async response
            });
        }

        getStatus() {
            if (this.isReading) return 'Reading page...';
            if (this.isListening) return 'Listening for commands...';
            return 'Ready to assist';
        }

        async checkMicrophoneAccess() {
            try {
                // First check if we already have permission
                const result = await navigator.permissions.query({ name: 'microphone' });
                
                if (result.state === 'granted') {
                    return true;
                }
                
                if (result.state === 'prompt') {
                    // Request microphone access directly
                    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    // Stop the stream immediately after getting permission
                    stream.getTracks().forEach(track => track.stop());
                    return true;
                }
                
                if (result.state === 'denied') {
                    throw new Error('Microphone access is blocked. Please allow access in your browser settings.');
                }

                return false;
            } catch (error) {
                console.error('Microphone access error:', error);
                if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                    alert('Please enable microphone access in your browser settings and try again.');
                } else {
                    alert('Error accessing microphone: ' + error.message);
                }
                return false;
            }
        }

        async toggleVoiceControl() {
            console.log('Toggling voice control. Current state:', this.isListening);
            
            if (!this.recognition) {
                alert('Speech recognition is not supported in this browser');
                return;
            }

            try {
                if (this.isListening) {
                    console.log('Stopping voice recognition...');
                    this.recognition.stop();
                    this.isListening = false;
                    this.speak('Voice control disabled');
                    await this.sendStatusUpdate('Voice control disabled');
                } else {
                    const hasAccess = await this.checkMicrophoneAccess();
                    if (hasAccess) {
                        console.log('Starting voice recognition...');
                        this.recognition.start();
                        this.isListening = true;
                        this.speak('Voice control enabled');
                        await this.sendStatusUpdate('Listening for commands...');
                    }
                }
            } catch (error) {
                console.error('Error toggling voice control:', error);
                alert('Error with voice control. Please try again.');
                this.isListening = false;
                await this.sendStatusUpdate('Error with voice control');
            }
        }

        handleVoiceCommand(command) {
            console.log('Received voice command:', command);
            
            // Normalize the command
            command = command.toLowerCase().trim();

            // Reading commands
            if (command.includes('start reading') || command === 'read page' || command === 'read') {
                if (!this.isReading) {
                    this.speak('Starting to read the page');
                    this.startReading();
                }
            } else if (command.includes('stop reading') || command === 'stop' || command === 'pause') {
                if (this.isReading) {
                    this.stopReading();
                    this.speak('Stopped reading');
                }
            }
            
            // Image commands
            else if (command.includes('describe images') || command.includes('read images')) {
                this.speak('Starting image description');
                this.describeImages();
            }
            
            // Speed control commands
            else if (command.includes('read faster') || command.includes('increase speed')) {
                if (this.speech) {
                    this.speech.rate = Math.min(2, this.speech.rate + 0.2);
                    this.speak(`Reading speed set to ${this.speech.rate.toFixed(1)}`);
                }
            } else if (command.includes('read slower') || command.includes('decrease speed')) {
                if (this.speech) {
                    this.speech.rate = Math.max(0.5, this.speech.rate - 0.2);
                    this.speak(`Reading speed set to ${this.speech.rate.toFixed(1)}`);
                }
            } else if (command.includes('normal speed') || command.includes('reset speed')) {
                if (this.speech) {
                    this.speech.rate = 1.0;
                    this.speak('Reading speed reset to normal');
                }
            }
            
            // Volume control commands
            else if (command.includes('volume up') || command.includes('speak louder')) {
                if (this.speech) {
                    this.speech.volume = Math.min(1, this.speech.volume + 0.2);
                    this.speak('Volume increased');
                }
            } else if (command.includes('volume down') || command.includes('speak softer')) {
                if (this.speech) {
                    this.speech.volume = Math.max(0, this.speech.volume - 0.2);
                    this.speak('Volume decreased');
                }
            }
            
            // Help command
            else if (command.includes('help') || command.includes('what can you do')) {
                const helpText = `
                    Available commands:
                    For reading: 'start reading', 'stop reading', or 'pause'
                    For images: 'describe images' or 'read images'
                    For speed: 'read faster', 'read slower', or 'normal speed'
                    For volume: 'volume up', 'volume down'
                    For help: 'help' or 'what can you do'
                `.replace(/\s+/g, ' ').trim();
                this.speak(helpText);
            }
            
            // Command not recognized
            else {
                this.speak('Command not recognized. Say help for available commands.');
            }
        }

        toggleReading() {
            if (this.isReading) {
                this.stopReading();
            } else {
                this.startReading();
            }
        }

        async startReading() {
            try {
                this.isReading = true;
                const content = this.getPageContent();
                
                if (content.trim().length === 0) {
                    throw new Error('No readable content found on this page');
                }

                // Update status before starting to read
                await this.sendStatusUpdate('Reading page...');
                
                // Split content into manageable chunks
                const chunks = this.splitIntoChunks(content);
                await this.readChunks(chunks);
            } catch (error) {
                console.error('Error starting reading:', error);
                this.speak('Error starting page reading. Please try again.');
                this.isReading = false;
                await this.sendStatusUpdate('Error: ' + error.message);
            }
        }

        splitIntoChunks(text, maxChunkLength = 200) {
            const sentences = text.match(/[^.!?]+[.!?]+/g) || [];
            const chunks = [];
            let currentChunk = '';

            for (const sentence of sentences) {
                if (currentChunk.length + sentence.length > maxChunkLength) {
                    if (currentChunk) chunks.push(currentChunk.trim());
                    currentChunk = sentence;
                } else {
                    currentChunk += ' ' + sentence;
                }
            }
            if (currentChunk) chunks.push(currentChunk.trim());
            
            return chunks.length > 0 ? chunks : [text];
        }

        async readChunks(chunks) {
            for (let i = 0; i < chunks.length && this.isReading; i++) {
                const chunk = chunks[i];
                
                try {
                    await new Promise((resolve, reject) => {
                        this.speech.text = chunk;
                        
                        this.speech.onend = resolve;
                        this.speech.onerror = (event) => {
                            if (event.error === 'canceled' && !this.isReading) {
                                // Normal cancellation, don't treat as error
                                resolve();
                            } else {
                                console.warn('Speech error:', event.error);
                                // Continue to next chunk instead of stopping completely
                                resolve();
                            }
                        };

                        // Reset synthesis if needed
                        if (window.speechSynthesis.speaking) {
                            window.speechSynthesis.cancel();
                        }

                        window.speechSynthesis.speak(this.speech);
                    });

                    // Small pause between chunks
                    if (this.isReading) {
                        await new Promise(resolve => setTimeout(resolve, 300));
                    }
                } catch (error) {
                    console.error('Error reading chunk:', error);
                    // Continue to next chunk instead of stopping
                    continue;
                }
            }

            if (this.isReading) {
                this.isReading = false;
                await this.sendStatusUpdate('Finished reading');
            }
        }

        async stopReading() {
            this.isReading = false;
            window.speechSynthesis.cancel();
            await this.sendStatusUpdate('Ready to assist');
        }

        getPageContent() {
            try {
                // Focus on main content areas
                const mainSelectors = [
                    'article',
                    'main',
                    '.main-content',
                    '#main-content',
                    '.article-content',
                    '.post-content',
                    '[role="main"]'
                ];

                let mainContent = null;
                for (const selector of mainSelectors) {
                    mainContent = document.querySelector(selector);
                    if (mainContent) break;
                }

                // Fallback to body if no main content found
                if (!mainContent) {
                    mainContent = document.body;
                }

                // Elements to exclude
                const excludeSelectors = [
                    'header',
                    'footer',
                    'nav',
                    'aside',
                    'script',
                    'style',
                    'noscript',
                    '.sidebar',
                    '.navigation',
                    '.menu',
                    '.ads',
                    '.comments',
                    '[role="complementary"]'
                ].join(',');

                // Get all text nodes
                const walker = document.createTreeWalker(
                    mainContent,
                    NodeFilter.SHOW_TEXT,
                    {
                        acceptNode: function(node) {
                            // Skip if parent should be excluded
                            if (node.parentElement.matches && node.parentElement.matches(excludeSelectors)) {
                                return NodeFilter.FILTER_REJECT;
                            }
                            // Skip empty or whitespace-only text
                            if (!node.textContent.trim()) {
                                return NodeFilter.FILTER_REJECT;
                            }
                            // Skip hidden elements
                            const style = window.getComputedStyle(node.parentElement);
                            if (style.display === 'none' || style.visibility === 'hidden') {
                                return NodeFilter.FILTER_REJECT;
                            }
                            return NodeFilter.FILTER_ACCEPT;
                        }
                    }
                );

                let textContent = '';
                let node;
                while (node = walker.nextNode()) {
                    const text = node.textContent.trim();
                    if (text) {
                        textContent += text + ' ';
                    }
                }

                // Clean up the text
                textContent = textContent
                    .replace(/\s+/g, ' ')
                    .replace(/\.+/g, '.')
                    .trim();

                return textContent || 'No readable content found on this page.';
            } catch (error) {
                console.error('Error getting page content:', error);
                return 'Error reading page content.';
            }
        }

        async getImageDescription(image) {
            try {
                // Convert image to base64
                const canvas = document.createElement('canvas');
                canvas.width = image.width;
                canvas.height = image.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0);
                const base64Image = canvas.toDataURL('image/jpeg');

                console.log('Sending image to backend for analysis...');

                // Send to backend for YOLO analysis
                const response = await fetch('http://localhost:8000/analyze_image', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Accept': 'application/json'
                    },
                    body: JSON.stringify({ 
                        image_data: base64Image 
                    })
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    console.error('Backend error:', response.status, errorText);
                    throw new Error(`Backend error: ${response.status} ${errorText}`);
                }

                const result = await response.json();
                console.log('Received backend response:', result);

                if (!result.description) {
                    throw new Error('No description in backend response');
                }

                return result.description;
            } catch (error) {
                console.error('Error analyzing image:', error);
                return `Could not analyze this image: ${error.message}`;
            }
        }

        async describeImages() {
            const images = Array.from(document.images);
            console.log(`Found ${images.length} images on page`);
            
            if (images.length === 0) {
                this.speak('No images found on this page.');
                return;
            }

            for (const image of images) {
                if (image.width < 50 || image.height < 50) {
                    console.log('Skipping small image:', image.src);
                    continue;
                }

                try {
                    console.log('Processing image:', image.src);
                    const description = await this.getImageDescription(image);
                    this.speak(description);
                    
                    // Wait for current description to finish before processing next image
                    await new Promise(resolve => {
                        this.speech.onend = resolve;
                    });
                    
                    // Small pause between images
                    await new Promise(resolve => setTimeout(resolve, 500));
                } catch (error) {
                    console.error('Error describing image:', error);
                    this.speak('Error processing this image. Moving to next one.');
                    await new Promise(resolve => {
                        this.speech.onend = resolve;
                    });
                }
            }
            
            this.speak('Finished describing all images.');
        }

        speak(text) {
            if (!text || !this.speech) return;

            try {
                // Cancel any ongoing speech
                window.speechSynthesis.cancel();

                // Reset synthesis if it seems stuck
                if (window.speechSynthesis.speaking) {
                    window.speechSynthesis.pause();
                    window.speechSynthesis.resume();
                }

                // Split long text into chunks
                if (text.length > 200) {
                    const chunks = this.splitIntoChunks(text);
                    this.readChunks(chunks);
                    return;
                }

                this.speech.text = text;
                window.speechSynthesis.speak(this.speech);

                // Monitor speech synthesis
                const checkSpeaking = setInterval(() => {
                    if (!window.speechSynthesis.speaking) {
                        clearInterval(checkSpeaking);
                        return;
                    }
                    window.speechSynthesis.pause();
                    window.speechSynthesis.resume();
                }, 10000);
            } catch (error) {
                console.error('Error speaking:', error);
                // Try one more time after a short delay
                setTimeout(() => {
                    try {
                        window.speechSynthesis.cancel();
                        window.speechSynthesis.speak(this.speech);
                    } catch (retryError) {
                        console.error('Retry speaking failed:', retryError);
                    }
                }, 1000);
            }
        }
    }

    // Initialize the reader
    const reader = new WebReader();

    // Notify that content script is ready
    chrome.runtime.sendMessage({
        action: 'updateStatus',
        status: 'Ready to assist'
    });
} 