class OpenAIAPI {
  static async makeRequest(endpoint, data, apiKey) {
    try {
      const response = await fetch(`https://api.openai.com/v1/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('OpenAI API Error:', error);
      throw error;
    }
  }

  static async summarizeText(text, apiKey) {
    const data = {
      model: "gpt-4",
      messages: [{
        role: "system",
        content: "Please provide a concise summary of the following text:"
      }, {
        role: "user",
        content: text
      }],
      max_tokens: 500
    };

    const result = await this.makeRequest('chat/completions', data, apiKey);
    return result.choices[0].message.content;
  }

  static async askQuestion(question, context, apiKey) {
    const data = {
      model: "gpt-4",
      messages: [{
        role: "system",
        content: "You are a helpful assistant answering questions about a webpage. Use the provided context to answer questions."
      }, {
        role: "user",
        content: `Context: ${context}\n\nQuestion: ${question}`
      }],
      max_tokens: 500
    };

    const result = await this.makeRequest('chat/completions', data, apiKey);
    return result.choices[0].message.content;
  }

  static async describeImage(imageUrl, apiKey) {
    const data = {
      model: "gpt-4-vision-preview",
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: "Please describe this image in detail"
          },
          {
            type: "image_url",
            image_url: imageUrl
          }
        ]
      }],
      max_tokens: 300
    };

    const result = await this.makeRequest('chat/completions', data, apiKey);
    return result.choices[0].message.content;
  }
}

class APIHandler {
    constructor() {
        this.baseURL = 'https://api.openai.com/v1';
    }

    async processMedia(element, type = 'image') {
        try {
            // Try OpenAI first
            const result = await this.processWithOpenAI(element, type);
            return result;
        } catch (error) {
            console.log('OpenAI processing failed, falling back to YOLO:', error);
            
            try {
                // Fallback to YOLO
                const yoloResults = await window.YOLOProcessor[
                    type === 'image' ? 'processImage' : 'processVideo'
                ](element);

                // Format YOLO results into natural language
                return this.formatYOLOResults(yoloResults);
            } catch (yoloError) {
                console.error('YOLO processing failed:', yoloError);
                throw new Error('Failed to process media with both OpenAI and YOLO');
            }
        }
    }

    formatYOLOResults(results) {
        if (!results || results.length === 0) {
            return "No objects detected in the image.";
        }

        // Group similar objects
        const counts = results.reduce((acc, curr) => {
            acc[curr.label] = (acc[curr.label] || 0) + 1;
            return acc;
        }, {});

        // Convert to natural language
        const descriptions = Object.entries(counts).map(([label, count]) => {
            return `${count} ${label}${count > 1 ? 's' : ''}`;
        });

        return `I can see ${descriptions.join(', ')} in the ${type}.`;
    }

    async processWithOpenAI(element, type) {
        try {
            const apiKey = await StorageManager.get('apiKey');
            if (!apiKey) {
                throw new Error('OpenAI API key not found');
            }

            if (type === 'image') {
                // Convert image element to base64 or get URL
                let imageUrl;
                if (element.src.startsWith('data:')) {
                    imageUrl = element.src;
                } else {
                    try {
                        // Create a canvas to get image data
                        const canvas = document.createElement('canvas');
                        canvas.width = element.width;
                        canvas.height = element.height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(element, 0, 0);
                        imageUrl = canvas.toDataURL('image/jpeg');
                    } catch (error) {
                        // If canvas fails, try using original URL
                        imageUrl = element.src;
                    }
                }

                return await OpenAIAPI.describeImage(imageUrl, apiKey);
            } else if (type === 'video') {
                // For video, capture current frame and process as image
                const canvas = document.createElement('canvas');
                canvas.width = element.videoWidth;
                canvas.height = element.videoHeight;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(element, 0, 0);
                const frameUrl = canvas.toDataURL('image/jpeg');
                
                return await OpenAIAPI.describeImage(frameUrl, apiKey);
            }
        } catch (error) {
            console.error('OpenAI processing error:', error);
            throw error;
        }
    }
}

window.APIHandler = new APIHandler();