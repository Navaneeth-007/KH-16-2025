// Prevent duplicate initialization
if (window.voxelReader) {
    console.log('Voxel already initialized');
} else {
    class VoxelReader {
        constructor() {
            this.speech = null;
            this.isReading = false;
            this.currentNode = null;
            this.textQueue = [];
            this.imageQueue = [];
            this.setupMessageListener();
            this.setupKeyboardShortcuts();
            this.recognition = null;
            this.isVoiceControlEnabled = false;
            this.setupSpeechSynthesis();
        }

        setupSpeechSynthesis() {
            try {
                this.speech = new SpeechSynthesisUtterance();
                
                // Initialize speech synthesis
                this.speech.onend = () => {
                    if (this.isReading) {
                        setTimeout(() => this.processNextItem(), 100);
                    }
                };

                this.speech.onerror = (event) => {
                    console.error('Speech synthesis error:', event);
                    this.updateStatus('Error in speech synthesis. Retrying...');
                    
                    // Wait a bit before retrying
                    setTimeout(() => {
                        if (this.isReading) {
                            this.processNextItem();
                        }
                    }, 1000);
                };

                // Wait for voices to be loaded
                const loadVoices = () => {
                    const voices = window.speechSynthesis.getVoices();
                    if (voices.length > 0) {
                        this.speech.voice = voices[0]; // Set default voice
                        return true;
                    }
                    return false;
                };

                if (!loadVoices()) {
                    window.speechSynthesis.addEventListener('voiceschanged', () => {
                        loadVoices();
                    });
                }

                // Reset synthesis if it gets stuck
                setInterval(() => {
                    if (this.isReading && !window.speechSynthesis.speaking) {
                        this.processNextItem();
                    }
                }, 5000);

            } catch (error) {
                console.error('Error setting up speech synthesis:', error);
                this.updateStatus('Error initializing speech synthesis');
            }
        }

        async setupSpeechRecognition() {
            try {
                // Request microphone permission
                await navigator.mediaDevices.getUserMedia({ audio: true });
                
                // Initialize speech recognition
                this.recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
                this.recognition.continuous = true;
                this.recognition.interimResults = false;
                this.recognition.lang = 'en-US';

                this.recognition.onresult = (event) => {
                    const command = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
                    this.handleVoiceCommand(command);
                };

                this.recognition.onerror = (event) => {
                    console.error('Speech recognition error:', event.error);
                    this.updateStatus('Voice control error. Please try again.');
                    if (event.error === 'not-allowed') {
                        this.isVoiceControlEnabled = false;
                        this.updateStatus('Microphone access denied');
                    }
                };

                this.recognition.onend = () => {
                    if (this.isVoiceControlEnabled) {
                        this.recognition.start();
                    }
                };

                return true;
            } catch (error) {
                console.error('Error setting up speech recognition:', error);
                this.updateStatus('Could not access microphone');
                return false;
            }
        }

        setupMessageListener() {
            chrome.runtime.onMessage.addListener(async (message, sender, sendResponse) => {
                switch (message.action) {
                    case 'startReading':
                        await this.startReading(message.settings);
                        break;
                    case 'pauseReading':
                        this.pauseReading();
                        break;
                    case 'toggleVoiceControl':
                        await this.toggleVoiceControl(message.enabled);
                        break;
                }
            });
        }

        setupKeyboardShortcuts() {
            document.addEventListener('keydown', (e) => {
                if (e.altKey && e.key === 'r') {
                    this.startReading();
                } else if (e.altKey && e.key === 'p') {
                    this.pauseReading();
                }
            });
        }

        async startReading(settings = {}) {
            if (this.isReading) return;

            try {
                this.isReading = true;
                this.updateStatus('Reading page...');

                // Cancel any ongoing speech
                window.speechSynthesis.cancel();

                // Apply settings
                if (settings.speed) {
                    this.speech.rate = parseFloat(settings.speed);
                }
                if (settings.voiceIndex !== undefined) {
                    const voices = window.speechSynthesis.getVoices();
                    if (voices[settings.voiceIndex]) {
                        this.speech.voice = voices[settings.voiceIndex];
                    }
                }

                // Initialize queues
                this.textQueue = this.getTextNodes(document.body);
                this.imageQueue = Array.from(document.images);
                
                // Start reading
                await this.processNextItem();
            } catch (error) {
                console.error('Error starting reading:', error);
                this.updateStatus('Error starting reading');
                this.isReading = false;
            }
        }

        pauseReading() {
            this.isReading = false;
            window.speechSynthesis.cancel();
            this.updateStatus('Paused');
        }

        async toggleVoiceControl(enabled) {
            if (enabled) {
                if (!this.recognition) {
                    const success = await this.setupSpeechRecognition();
                    if (!success) {
                        this.isVoiceControlEnabled = false;
                        return;
                    }
                }
                this.isVoiceControlEnabled = true;
                this.recognition.start();
                this.updateStatus('Voice control enabled. Listening...');
            } else {
                this.isVoiceControlEnabled = false;
                if (this.recognition) {
                    this.recognition.stop();
                }
                this.updateStatus('Voice control disabled');
            }
        }

        async processNextItem() {
            if (!this.isReading) return;

            try {
                // Cancel any ongoing speech
                window.speechSynthesis.cancel();

                if (this.textQueue.length > 0) {
                    const textNode = this.textQueue.shift();
                    const text = textNode.textContent.trim();
                    
                    if (text) {
                        // Highlight current reading element
                        if (textNode.parentElement) {
                            textNode.parentElement.classList.add('voxel-reading');
                            setTimeout(() => {
                                textNode.parentElement.classList.remove('voxel-reading');
                            }, 100);
                        }

                        this.speech.text = text;
                        window.speechSynthesis.speak(this.speech);
                    } else {
                        this.processNextItem();
                    }
                } else if (this.imageQueue.length > 0) {
                    const image = this.imageQueue.shift();
                    await this.describeImage(image);
                } else {
                    this.isReading = false;
                    this.updateStatus('Finished reading page');
                }
            } catch (error) {
                console.error('Error processing item:', error);
                this.updateStatus('Error processing content');
                // Try to continue with next item
                setTimeout(() => this.processNextItem(), 1000);
            }
        }

        async describeImage(image) {
            try {
                // Convert image to base64
                const canvas = document.createElement('canvas');
                canvas.width = image.width;
                canvas.height = image.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(image, 0, 0);
                const base64Image = canvas.toDataURL('image/jpeg').split(',')[1];

                // Send to backend for analysis
                const response = await fetch('http://localhost:8000/analyze_image', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        image_data: base64Image
                    })
                });

                if (!response.ok) throw new Error('Failed to analyze image');

                const result = await response.json();
                
                // Read the description
                this.speech.text = result.description;
                window.speechSynthesis.speak(this.speech);

                return new Promise((resolve) => {
                    this.speech.onend = resolve;
                });
            } catch (error) {
                console.error('Error analyzing image:', error);
                return Promise.resolve(); // Continue with next item even if image analysis fails
            }
        }

        getTextNodes(node) {
            const textNodes = [];
            const walk = document.createTreeWalker(
                node,
                NodeFilter.SHOW_TEXT,
                {
                    acceptNode: function(node) {
                        // Filter out script and style contents
                        if (node.parentElement.tagName in {
                            'SCRIPT': 1,
                            'STYLE': 1,
                            'NOSCRIPT': 1
                        }) return NodeFilter.FILTER_REJECT;
                        
                        // Accept non-empty text nodes
                        return node.textContent.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
                    }
                }
            );

            let currentNode;
            while (currentNode = walk.nextNode()) {
                textNodes.push(currentNode);
            }
            return textNodes;
        }

        handleVoiceCommand(command) {
            switch (command) {
                case 'start reading':
                case 'read page':
                    this.startReading();
                    break;
                case 'stop reading':
                case 'pause':
                    this.pauseReading();
                    break;
                case 'describe images':
                    this.imageQueue = Array.from(document.images);
                    this.textQueue = [];
                    this.processNextItem();
                    break;
                default:
                    this.updateStatus('Unknown command: ' + command);
            }
        }

        updateStatus(status) {
            chrome.runtime.sendMessage({
                action: 'updateStatus',
                status: status
            });
        }
    }

    // Initialize Voxel only once
    window.voxelReader = new VoxelReader();

    // Notify that content script is ready
    chrome.runtime.sendMessage({
        action: 'updateStatus',
        status: 'Ready to assist'
    });
} 