class VoiceAssistant {
  constructor() {
    // Check for browser compatibility
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      throw new Error('Speech recognition not supported in this browser');
    }

    // Use the appropriate speech recognition API
    this.recognition = new (window.webkitSpeechRecognition || window.SpeechRecognition)();
    this.synthesis = window.speechSynthesis;
    this.isListening = false;
    this.hasPermission = false;
    
    // Check for API key first
    StorageManager.get('apiKey').then(apiKey => {
      if (!apiKey) {
        console.warn('OpenAI API key not set');
        this.speak('Please set up your OpenAI API key in the extension settings.');
      }
    });

    // Initialize speech synthesis
    this.initializeSpeechSynthesis().then(voices => {
        console.log('Available voices:', voices);
    }).catch(error => {
        console.error('Error initializing speech synthesis:', error);
    });

    this.setupRecognition();
  }

  setupRecognition() {
    // Configure recognition settings
    this.recognition.continuous = true;
    this.recognition.interimResults = true; // Enable interim results for better responsiveness
    this.recognition.lang = 'en-US';

    // Handle recognition results
    this.recognition.onresult = async (event) => {
      const last = event.results.length - 1;
      const command = event.results[last][0].transcript.toLowerCase().trim();
      
      console.log('Heard:', command);
      
      // Only process if it's a final result and contains the wake word
      if (event.results[last].isFinal && command.includes('hey voxel')) {
        console.log('Processing command:', command);
        await this.processCommand(command);
      }
    };

    // Handle recognition end
    this.recognition.onend = () => {
      console.log('Recognition ended');
      // Restart if we're supposed to be listening
      if (this.isListening) {
        try {
          console.log('Restarting recognition...');
          this.recognition.start();
        } catch (error) {
          console.error('Error restarting recognition:', error);
          this.isListening = false;
          this.updateButtonState(false);
        }
      }
    };

    // Handle recognition errors
    this.recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      
      switch (event.error) {
        case 'not-allowed':
          this.hasPermission = false;
          this.isListening = false;
          this.updateButtonState(false);
          this.speak('Microphone access was denied. Please enable it in your browser settings.');
          break;
        case 'network':
          this.speak('Network error occurred. Please check your internet connection.');
          break;
        case 'no-speech':
          console.log('No speech detected');
          break;
        default:
          this.speak('An error occurred with the voice recognition.');
          break;
      }
    };
  }

  async checkPermission() {
      try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(track => track.stop());
          this.hasPermission = true;
          return true;
      } catch (error) {
          console.error('Microphone permission error:', error);
          this.hasPermission = false;
          return false;
      }
  }

  updateButtonState(enabled) {
      const button = document.getElementById("toggleButton");
      if (button) {
          button.setAttribute("data-enabled", enabled.toString());
          button.textContent = enabled ? "Disable Voice Assistant" : "Enable Voice Assistant";
      }
  }

  async processCommand(command) {
      try {
          const apiKey = await StorageManager.get('apiKey');
          if (!apiKey) {
              this.speak('Please set up your OpenAI API key in the extension settings.');
              return;
          }

          if (command.includes('read out')) {
              const content = this.getPageContent();
              this.speak(content);
          } 
          else if (command.includes('describe images')) {
              const images = document.querySelectorAll('img');
              let descriptions = [];

              for (let i = 0; i < Math.min(images.length, 5); i++) {
                  try {
                      const description = await window.APIHandler.processMedia(images[i], 'image');
                      descriptions.push(`Image ${i + 1}: ${description}`);
                  } catch (error) {
                      console.error(`Failed to process image ${i + 1}:`, error);
                      descriptions.push(`Image ${i + 1}: Unable to process this image.`);
                  }
              }

              this.speak(descriptions.join('. '));
          }
          else if (command.includes('summarize')) {
              await this.summarizePage(apiKey);
          }
          else {
              await this.handleGeneralQuery(command, apiKey);
          }
      } catch (error) {
          console.error('Error processing command:', error);
          this.speak('Sorry, I encountered an error processing your request.');
      }
  }

  getPageContent() {
      const mainContent = document.querySelector('main') || document.body;
      return mainContent.innerText.substring(0, 5000);
  }

  async summarizePage(apiKey) {
      this.speak('Analyzing page content...');
      const content = this.getPageContent();
      const summary = await OpenAIAPI.summarizeText(content, apiKey);
      this.speak(summary);
  }

  async handleGeneralQuery(command, apiKey) {
      const content = this.getPageContent();
      const response = await OpenAIAPI.askQuestion(command, content, apiKey);
      this.speak(response);
  }

  speak(text) {
    if (!text) return;
    
    // Cancel any ongoing speech
    this.synthesis.cancel();
    
    // Check if synthesis is available
    if (!this.synthesis || !window.speechSynthesis) {
        console.error('Speech synthesis not available');
        return;
    }

    try {
        // Split into sentences for more natural speech
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        
        sentences.forEach((sentence) => {
            const utterance = new SpeechSynthesisUtterance(sentence.trim());
            
            // Get available voices
            const voices = this.synthesis.getVoices();
            // Try to find an English voice
            const englishVoice = voices.find(voice => 
                voice.lang.includes('en') && voice.localService
            );
            
            // Configure speech properties
            utterance.voice = englishVoice || voices[0]; // Use found voice or default
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            utterance.lang = 'en-US';
            
            // Add error handling
            utterance.onerror = (event) => {
                console.error('Speech synthesis error:', event.error);
                // Try alternative speaking method if first fails
                if (event.error === 'synthesis-failed') {
                    const backupUtterance = new SpeechSynthesisUtterance(sentence.trim());
                    backupUtterance.rate = 0.9; // Slightly slower
                    backupUtterance.pitch = 1.1; // Slightly higher pitch
                    this.synthesis.speak(backupUtterance);
                }
            };

            // Add other event handlers for debugging
            utterance.onstart = () => console.log('Started speaking');
            utterance.onend = () => console.log('Finished speaking');
            utterance.onpause = () => console.log('Speech paused');
            utterance.onresume = () => console.log('Speech resumed');
            utterance.onmark = () => console.log('Speech mark hit');
            utterance.onboundary = () => console.log('Speech boundary hit');
            
            // Speak the text
            this.synthesis.speak(utterance);
        });

        // Ensure speech synthesis is not paused
        if (this.synthesis.paused) {
            this.synthesis.resume();
        }

    } catch (error) {
        console.error('Speech synthesis setup error:', error);
        // Fallback to alert if speech fails completely
        alert(text);
    }
  }

  async start() {
    if (!this.hasPermission) {
      const permitted = await this.checkPermission();
      if (!permitted) {
        this.speak("Please allow microphone access to use the voice assistant.");
        return false;
      }
    }

    if (!this.isListening) {
      try {
        await this.recognition.start();
        this.isListening = true;
        console.log('Voice recognition started');
        this.speak('Voice assistant activated. Say "Hey Voxel" followed by your command.');
        return true;
      } catch (error) {
        console.error('Error starting voice recognition:', error);
        if (error.name === 'NotAllowedError') {
          this.speak("Microphone access was denied. Please enable it in your browser settings.");
        }
        return false;
      }
    }
    return true;
  }

  stop() {
    try {
      this.isListening = false;
      this.recognition.stop();
      this.synthesis.cancel();
      console.log('Voice recognition stopped');
      this.speak('Voice assistant deactivated.');
    } catch (error) {
      console.error('Error stopping voice recognition:', error);
    }
  }

  // Add this method to initialize voices when the class is constructed
  initializeSpeechSynthesis() {
    // Load voices if they're not loaded yet
    if (this.synthesis.getVoices().length === 0) {
        return new Promise((resolve) => {
            this.synthesis.onvoiceschanged = () => {
                resolve(this.synthesis.getVoices());
            };
        });
    }
    return Promise.resolve(this.synthesis.getVoices());
  }
}

// Initialize voice assistant and handle button clicks
let voiceAssistant = null;

async function initializeVoiceAssistant() {
try {
    voiceAssistant = new VoiceAssistant();
    const button = document.getElementById("toggleButton");
    
    button.addEventListener("click", async function() {
        const currentlyEnabled = this.getAttribute("data-enabled") === "true";
        
        if (!currentlyEnabled) {
            const started = await voiceAssistant.start();
            if (started) {
                this.setAttribute("data-enabled", "true");
                this.textContent = "Disable Voice Assistant";
                console.log("Voice assistant enabled.");
            }
        } else {
            voiceAssistant.stop();
            this.setAttribute("data-enabled", "false");
            this.textContent = "Enable Voice Assistant";
            console.log("Voice assistant disabled.");
        }
    });
} catch (error) {
    console.error('Error initializing voice assistant:', error);
    alert('Speech recognition is not supported in this browser.');
}
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', initializeVoiceAssistant);

// Clean up on page unload
window.addEventListener('beforeunload', () => {
if (voiceAssistant) {
    voiceAssistant.stop();
}
});