// Global instance
let visionAssistant = null;

class VisionAssistant {
    constructor() {
        try {
            console.log('Initializing Vision Assistant...');
            
            // Initialize speech synthesis
            this.speech = window.speechSynthesis;
            this.currentUtterance = null;
            this.isReading = false;
            this.currentNode = null;
            this.imageDescriptions = new Map();
            this.isListening = false;
            this.should_stop = false;
            
            // Initialize components
            this.setupVoiceRecognition();
            this.setupImageClickHandlers();
            this.setupKeyboardShortcuts();
            this.loadVoices();
            
            console.log('Vision Assistant initialized successfully');
            
            // Notify background script of successful initialization
            chrome.runtime.sendMessage({ type: 'contentScriptLoaded' });
            
            // Announce extension is ready after a short delay
            setTimeout(() => {
                this.speak("Vision assist is ready. Say 'help' for available commands.");
            }, 1000);
        } catch (error) {
            console.error('Error initializing Vision Assistant:', error);
            throw error;
        }
    }

    loadVoices() {
        // Load available voices
        this.voices = this.speech.getVoices();
        if (this.speech.onvoiceschanged !== undefined) {
            this.speech.onvoiceschanged = () => {
                this.voices = this.speech.getVoices();
            };
        }
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            // Alt + R to start/stop reading
            if (event.altKey && event.key === 'r') {
                if (this.isReading) {
                    this.pauseReading();
                } else {
                    this.startReading();
                }
            }
            // Alt + L to start/stop listening
            if (event.altKey && event.key === 'l') {
                if (this.isListening) {
                    this.stopListening();
                } else {
                    this.startListening();
                }
            }
            // Alt + H for help
            if (event.altKey && event.key === 'h') {
                this.announceHelp();
            }
        });
    }

    setupVoiceRecognition() {
        try {
            if (!('webkitSpeechRecognition' in window)) {
                console.error('Web Speech API is not supported in this browser');
                this.speak("Voice recognition is not supported in this browser. Please use Chrome.");
                return;
            }

            this.recognition = new webkitSpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = false;
            this.recognition.lang = 'en-US';
            
            this.recognition.onstart = () => {
                console.log('Voice recognition started');
                this.isListening = true;
                this.speak("Voice recognition started");
            };
            
            this.recognition.onend = () => {
                console.log('Voice recognition ended');
                this.isListening = false;
                if (!this.should_stop) {
                    setTimeout(() => {
                        try {
                            this.recognition.start();
                        } catch (error) {
                            console.error('Error restarting recognition:', error);
                        }
                    }, 1000);
                }
            };
            
            this.recognition.onerror = (event) => {
                console.error('Speech recognition error:', event.error);
                if (event.error === 'not-allowed') {
                    this.speak("Please allow microphone access to use voice commands.");
                } else {
                    this.speak("Voice recognition error. Please try again.");
                }
            };
            
            this.recognition.onresult = (event) => {
                try {
                    const command = event.results[event.results.length - 1][0].transcript.toLowerCase();
                    console.log('Recognized command:', command);
                    this.handleVoiceCommand(command);
                } catch (error) {
                    console.error('Error processing voice command:', error);
                }
            };
        } catch (error) {
            console.error('Error setting up voice recognition:', error);
        }
    }

    startListening() {
        if (!this.isListening && this.recognition) {
            this.should_stop = false;
            this.recognition.start();
        }
    }

    stopListening() {
        if (this.isListening && this.recognition) {
            this.should_stop = true;
            this.recognition.stop();
            this.speak("Voice recognition stopped");
        }
    }

    announceHelp() {
        const helpText = `
            Available commands:
            'Read page' - Start reading the page
            'Stop' or 'Pause' - Stop reading
            'Describe images' - Describe all images on the page
            'Help' - List available commands
            
            Keyboard shortcuts:
            Alt + R - Start/Stop reading
            Alt + L - Start/Stop voice recognition
            Alt + H - Show help
            
            You can also click on any image to hear its description.
        `;
        this.speak(helpText);
    }

    handleVoiceCommand(command) {
        console.log('Processing command:', command);
        if (command.includes('read page')) {
            this.startReading();
        } else if (command.includes('stop') || command.includes('pause')) {
            this.pauseReading();
        } else if (command.includes('describe images')) {
            this.describeImages();
        } else if (command.includes('help')) {
            this.announceHelp();
        }
    }

    setupImageClickHandlers() {
        document.addEventListener('click', async (event) => {
            if (event.target.tagName === 'IMG') {
                const description = await this.analyzeImage(event.target);
                this.speak(description);
            }
        });
    }

    speak(text, rate = 1) {
        if (this.currentUtterance) {
            this.speech.cancel();
        }

        this.currentUtterance = new SpeechSynthesisUtterance(text);
        this.currentUtterance.rate = rate;
        
        // Use a good voice if available
        if (this.voices && this.voices.length > 0) {
            // Prefer English voices
            const englishVoices = this.voices.filter(voice => voice.lang.startsWith('en-'));
            if (englishVoices.length > 0) {
                this.currentUtterance.voice = englishVoices[0];
            }
        }

        this.currentUtterance.onend = () => {
            this.currentUtterance = null;
        };

        this.speech.speak(this.currentUtterance);
    }

    async analyzeImage(imageElement) {
        try {
            // Get image data
            const canvas = document.createElement('canvas');
            canvas.width = imageElement.naturalWidth;
            canvas.height = imageElement.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imageElement, 0, 0);
            const imageData = canvas.toDataURL('image/jpeg');

            // Send to backend for YOLO analysis
            const response = await fetch('http://localhost:8000/analyze_image', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    image_data: imageData
                })
            });

            if (!response.ok) {
                throw new Error('Failed to analyze image');
            }

            const result = await response.json();
            
            // Play audio description if available
            if (result.audio_base64) {
                const audio = new Audio(`data:audio/mp3;base64,${result.audio_base64}`);
                await audio.play();
            }

            // Add visual indicators for detected objects
            this.highlightDetectedObjects(imageElement, result.objects);

            // Add ARIA label
            imageElement.setAttribute('aria-label', result.description);
            
            return result.description;
        } catch (error) {
            console.error('Error analyzing image:', error);
            return 'Unable to analyze image';
        }
    }

    highlightDetectedObjects(imageElement, objects) {
        // Remove any existing highlights
        const existingHighlights = document.querySelectorAll('.yolo-detection-box');
        existingHighlights.forEach(el => el.remove());

        // Get image position and dimensions
        const rect = imageElement.getBoundingClientRect();
        const scaleX = imageElement.naturalWidth / rect.width;
        const scaleY = imageElement.naturalHeight / rect.height;

        // Create container for highlights
        const container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.left = rect.left + 'px';
        container.style.top = rect.top + 'px';
        container.style.width = rect.width + 'px';
        container.style.height = rect.height + 'px';
        container.style.pointerEvents = 'none';

        // Add highlight boxes for each detected object
        objects.forEach(obj => {
            const [x1, y1, x2, y2] = obj.bbox;
            const box = document.createElement('div');
            box.className = 'yolo-detection-box';
            box.style.position = 'absolute';
            box.style.left = (x1 / scaleX) + 'px';
            box.style.top = (y1 / scaleY) + 'px';
            box.style.width = ((x2 - x1) / scaleX) + 'px';
            box.style.height = ((y2 - y1) / scaleY) + 'px';
            box.style.border = '2px solid #4CAF50';
            box.style.backgroundColor = 'rgba(76, 175, 80, 0.1)';
            box.style.pointerEvents = 'none';

            // Add label
            const label = document.createElement('div');
            label.className = 'yolo-detection-label';
            label.textContent = `${obj.class} (${Math.round(obj.confidence * 100)}%)`;
            label.style.position = 'absolute';
            label.style.top = '-20px';
            label.style.left = '0';
            label.style.backgroundColor = '#4CAF50';
            label.style.color = 'white';
            label.style.padding = '2px 4px';
            label.style.borderRadius = '2px';
            label.style.fontSize = '12px';

            box.appendChild(label);
            container.appendChild(box);
        });

        document.body.appendChild(container);

        // Remove highlights after 5 seconds
        setTimeout(() => {
            container.remove();
        }, 5000);
    }

    getImageContext(imageElement) {
        const parent = imageElement.parentElement;
        const siblings = Array.from(parent.childNodes)
            .filter(node => node.nodeType === Node.TEXT_NODE || 
                    (node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'IMG'));
        
        return siblings
            .map(node => node.textContent || '')
            .join(' ')
            .trim();
    }

    async describeImages() {
        const images = document.querySelectorAll('img');
        this.speak(`Found ${images.length} images on the page.`);
        
        for (const image of images) {
            if (this.isReading) {
                const description = await this.analyzeImage(image);
                this.speak(description);
                
                // Wait for current description to finish
                await new Promise(resolve => {
                    const checkInterval = setInterval(() => {
                        if (!this.currentUtterance) {
                            clearInterval(checkInterval);
                            resolve();
                        }
                    }, 100);
                });
            }
        }
    }

    getReadableNodes() {
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function(node) {
                    if (node.parentElement.offsetParent === null ||
                        node.textContent.trim().length === 0) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        const nodes = [];
        let node;
        while (node = walker.nextNode()) {
            nodes.push(node);
        }
        return nodes;
    }

    startReading(settings = {}) {
        if (this.isReading) return;
        
        this.isReading = true;
        const nodes = this.getReadableNodes();
        
        if (!this.currentNode) {
            this.currentNode = nodes[0];
        }

        this.readNode(this.currentNode, settings);
    }

    readNode(node, settings) {
        if (!node || !this.isReading) return;

        // Remove previous highlight
        document.querySelectorAll('.vision-assist-reading').forEach(el => {
            el.classList.remove('vision-assist-reading');
        });

        // Add highlight to current node
        node.parentElement.classList.add('vision-assist-reading');

        const text = node.textContent.trim();
        this.speak(text, settings.rate || 1);

        // Set up next node
        this.currentUtterance.onend = () => {
            if (this.isReading) {
                const nodes = this.getReadableNodes();
                const currentIndex = nodes.indexOf(node);
                if (currentIndex < nodes.length - 1) {
                    this.currentNode = nodes[currentIndex + 1];
                    this.readNode(this.currentNode, settings);
                } else {
                    this.isReading = false;
                    this.currentNode = null;
                    document.querySelectorAll('.vision-assist-reading').forEach(el => {
                        el.classList.remove('vision-assist-reading');
                    });
                    this.speak('Finished reading page');
                }
            }
        };
    }

    pauseReading() {
        this.isReading = false;
        if (this.currentUtterance) {
            this.speech.cancel();
        }
        document.querySelectorAll('.vision-assist-reading').forEach(el => {
            el.classList.remove('vision-assist-reading');
        });
        this.speak('Reading paused');
    }
}

// Initialize the assistant when the page is ready
function initializeAssistant() {
    try {
        if (!visionAssistant) {
            console.log('Creating new Vision Assistant instance...');
            visionAssistant = new VisionAssistant();
        }
    } catch (error) {
        console.error('Failed to initialize Vision Assistant:', error);
    }
}

// Handle messages before initialization
function handlePreInitMessage(message) {
    if (message.type === 'ping') {
        return true; // Respond to ping
    }
    return false;
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Received message:', message);
    
    try {
        // Handle ping messages even before initialization
        if (handlePreInitMessage(message)) {
            sendResponse({ status: 'ok' });
            return;
        }

        // Initialize if not already done
        if (!visionAssistant) {
            initializeAssistant();
        }

        // Ensure initialization was successful
        if (!visionAssistant) {
            throw new Error('Vision Assistant not initialized');
        }

        // Handle the message
        switch (message.action) {
            case 'startReading':
                visionAssistant.startReading(message.settings);
                break;
            case 'pauseReading':
                visionAssistant.pauseReading();
                break;
            case 'describeImages':
                visionAssistant.describeImages();
                break;
            case 'startListening':
                visionAssistant.startListening();
                break;
            case 'stopListening':
                visionAssistant.stopListening();
                break;
            case 'help':
                visionAssistant.announceHelp();
                break;
        }
        
        sendResponse({ status: 'ok' });
    } catch (error) {
        console.error('Error handling message:', error);
        sendResponse({ status: 'error', error: error.message });
    }
    
    return true; // Keep the message channel open for async response
});

// Initialize when the page is fully loaded
if (document.readyState === 'complete') {
    initializeAssistant();
} else {
    document.addEventListener('DOMContentLoaded', initializeAssistant);
}

// Backup initialization for dynamic page loads
window.addEventListener('load', () => {
    if (!visionAssistant) {
        initializeAssistant();
    }
}); 