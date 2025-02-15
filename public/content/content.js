// Global instance
let voxelAssistant = null;

class VoxelAssistant {
    constructor() {
        try {
            console.log('Initializing Voxel Assistant...');
            
            // Backend API URL
            this.apiUrl = 'http://localhost:8000';
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
            
            console.log('Voxel Assistant initialized successfully');
            
            // Notify background script of successful initialization
            chrome.runtime.sendMessage({ type: 'contentScriptLoaded' });
            
            // Announce extension is ready after a short delay
            setTimeout(() => {
                this.speak("Voxel AI Assistant is ready. Say 'help' for available commands.");
            }, 1000);
        } catch (error) {
            console.error('Error initializing Voxel Assistant:', error);
            throw error;
        }
    }

    setupKeyboardShortcuts() {
        document.addEventListener('keydown', (event) => {
            if (event.altKey && event.key === 'r') {
                if (this.isReading) {
                    this.pauseReading();
                } else {
                    this.startReading();
                }
            }
            if (event.altKey && event.key === 'l') {
                if (this.isListening) {
                    this.stopListening();
                } else {
                    this.startListening();
                }
            }
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

    async speak(text, rate = 1) {
        try {
            const response = await fetch(`${this.apiUrl}/text_to_speech`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: text,
                    language_code: 'en-US',
                    voice_name: 'en-US-Standard-C'
                })
            });

            if (!response.ok) {
                throw new Error('Failed to convert text to speech');
            }

            const data = await response.json();
            const audio = new Audio(`data:audio/mp3;base64,${data.audio_base64}`);
            
            if (this.currentUtterance) {
                this.currentUtterance.pause();
            }
            
            this.currentUtterance = audio;
            audio.playbackRate = rate;
            await audio.play();

            return new Promise((resolve) => {
                audio.onended = resolve;
            });
        } catch (error) {
            console.error('Error in speak:', error);
            // Fallback to browser's TTS if API fails
            if (this.currentUtterance) {
                speechSynthesis.cancel();
            }
            this.currentUtterance = new SpeechSynthesisUtterance(text);
            this.currentUtterance.rate = rate;
            speechSynthesis.speak(this.currentUtterance);
        }
    }

    async analyzeImage(imageElement) {
        try {
            // Create a canvas to convert image to base64
            const canvas = document.createElement('canvas');
            canvas.width = imageElement.naturalWidth;
            canvas.height = imageElement.naturalHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(imageElement, 0, 0);
            const imageData = canvas.toDataURL('image/jpeg');

            // Get surrounding context
            const context_text = this.getImageContext(imageElement);

            // Send to backend for analysis
            const response = await fetch(`${this.apiUrl}/analyze_image`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    image_data: imageData,
                    context_text: context_text
                })
            });

            if (!response.ok) {
                throw new Error('Failed to analyze image');
            }

            const result = await response.json();
            
            // Play the audio description
            const audio = new Audio(`data:audio/mp3;base64,${result.audio_base64}`);
            await audio.play();

            // Cache the description
            this.imageDescriptions.set(imageElement, result.description);
            
            // Add ARIA attributes
            imageElement.setAttribute('aria-label', result.description);
            
            return result.description;
        } catch (error) {
            console.error('Error analyzing image:', error);
            return 'Unable to analyze image';
        }
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

    setupImageClickHandlers() {
        document.addEventListener('click', async (event) => {
            if (event.target.tagName === 'IMG') {
                const description = await this.analyzeImage(event.target);
                await this.speak(description);
            }
        });
    }

    async describeImages() {
        const images = document.querySelectorAll('img');
        await this.speak(`Found ${images.length} images on the page.`);
        
        for (const image of images) {
            if (this.isReading) {
                const description = await this.analyzeImage(image);
                await this.speak(description);
            }
        }
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

    announceHelp() {
        const helpText = `
            Available commands:
            'Read page' - Start reading the page
            'Stop' or 'Pause' - Stop reading
            'Describe images' - Describe all images on the page using AI
            'Help' - List available commands
            
            Keyboard shortcuts:
            Alt + R - Start/Stop reading
            Alt + L - Start/Stop voice recognition
            Alt + H - Show help
            
            You can also click on any image to hear its AI-generated description.
        `;
        this.speak(helpText);
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

    async startReading(settings = {}) {
        if (this.isReading) return;
        
        this.isReading = true;
        const nodes = this.getReadableNodes();
        
        if (!this.currentNode) {
            this.currentNode = nodes[0];
        }

        await this.readNode(this.currentNode, settings);
    }

    async readNode(node, settings) {
        if (!node || !this.isReading) return;

        // Remove previous highlight
        document.querySelectorAll('.voxel-reading').forEach(el => {
            el.classList.remove('voxel-reading');
        });

        // Add highlight to current node
        node.parentElement.classList.add('voxel-reading');

        const text = node.textContent.trim();
        await this.speak(text, settings.rate || 1);

        // Move to next node
        if (this.isReading) {
            const nodes = this.getReadableNodes();
            const currentIndex = nodes.indexOf(node);
            if (currentIndex < nodes.length - 1) {
                this.currentNode = nodes[currentIndex + 1];
                await this.readNode(this.currentNode, settings);
            } else {
                this.isReading = false;
                this.currentNode = null;
                document.querySelectorAll('.voxel-reading').forEach(el => {
                    el.classList.remove('voxel-reading');
                });
                await this.speak('Finished reading page');
            }
        }
    }

    async pauseReading() {
        this.isReading = false;
        if (this.currentUtterance) {
            if (this.currentUtterance instanceof Audio) {
                this.currentUtterance.pause();
            } else {
                speechSynthesis.cancel();
            }
        }
        document.querySelectorAll('.voxel-reading').forEach(el => {
            el.classList.remove('voxel-reading');
        });
        await this.speak('Reading paused');
    }
}

// Initialize the assistant when the page is ready
function initializeAssistant() {
    try {
        if (!voxelAssistant) {
            console.log('Creating new Voxel Assistant instance...');
            voxelAssistant = new VoxelAssistant();
        }
    } catch (error) {
        console.error('Failed to initialize Voxel Assistant:', error);
    }
}

// Handle messages from popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Received message:', message);
    
    try {
        if (!voxelAssistant) {
            initializeAssistant();
        }

        if (!voxelAssistant) {
            throw new Error('Voxel Assistant not initialized');
        }

        switch (message.action) {
            case 'startReading':
                voxelAssistant.startReading(message.settings);
                break;
            case 'pauseReading':
                voxelAssistant.pauseReading();
                break;
            case 'describeImages':
                voxelAssistant.describeImages();
                break;
            case 'startListening':
                voxelAssistant.startListening();
                break;
            case 'stopListening':
                voxelAssistant.stopListening();
                break;
            case 'help':
                voxelAssistant.announceHelp();
                break;
        }
        
        sendResponse({ status: 'ok' });
    } catch (error) {
        console.error('Error handling message:', error);
        sendResponse({ status: 'error', error: error.message });
    }
    
    return true;
});

// Initialize when the page is fully loaded
if (document.readyState === 'complete') {
    initializeAssistant();
} else {
    document.addEventListener('DOMContentLoaded', initializeAssistant);
}

// Backup initialization for dynamic page loads
window.addEventListener('load', () => {
    if (!voxelAssistant) {
        initializeAssistant();
    }
}); 