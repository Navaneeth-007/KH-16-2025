class YOLOProcessor {
    constructor() {
        this.model = null;
        this.initialized = false;
        this.loadingPromise = null;
    }

    async loadScripts() {
        if (this.loadingPromise) return this.loadingPromise;

        this.loadingPromise = new Promise(async (resolve, reject) => {
            try {
                // Load TensorFlow.js
                const tfScript = document.createElement('script');
                tfScript.src = chrome.runtime.getURL('lib/tensorflow.min.js');
                
                // Load COCO-SSD
                const cocoScript = document.createElement('script');
                cocoScript.src = chrome.runtime.getURL('lib/yolo.min.js');

                // Wait for scripts to load
                await new Promise((resolve) => {
                    tfScript.onload = () => {
                        cocoScript.onload = resolve;
                        document.head.appendChild(cocoScript);
                    };
                    document.head.appendChild(tfScript);
                });

                console.log('ML libraries loaded successfully');
                resolve();
            } catch (error) {
                console.error('Error loading ML libraries:', error);
                reject(error);
            }
        });

        return this.loadingPromise;
    }

    async initialize() {
        if (this.initialized) return;

        try {
            // Load required scripts first
            await this.loadScripts();

            // Initialize COCO-SSD
            this.model = await cocoSsd.load();
            this.initialized = true;
            console.log('COCO-SSD model loaded successfully');
        } catch (error) {
            console.error('Error initializing COCO-SSD:', error);
            throw new Error('Failed to initialize object detection model');
        }
    }

    async processImage(imageElement) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            // COCO-SSD detection
            const predictions = await this.model.detect(imageElement);
            
            // Format results
            return predictions.map(pred => ({
                label: pred.class,
                confidence: pred.score,
                bbox: pred.bbox
            }));
        } catch (error) {
            console.error('Object detection error:', error);
            throw new Error('Failed to process image with object detection');
        }
    }

    async processVideo(videoElement) {
        if (!this.initialized) {
            await this.initialize();
        }

        try {
            // Process current video frame
            const predictions = await this.model.detect(videoElement);

            return predictions.map(pred => ({
                label: pred.class,
                confidence: pred.score,
                bbox: pred.bbox
            }));
        } catch (error) {
            console.error('Video processing error:', error);
            throw new Error('Failed to process video with object detection');
        }
    }
}

// Initialize the processor
window.YOLOProcessor = new YOLOProcessor();

// Signal that the processor is ready
chrome.runtime.sendMessage({ 
    type: 'processorReady', 
    url: window.location.href 
}); 