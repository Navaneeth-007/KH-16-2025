from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import torch
from ultralytics import YOLO
import numpy as np
import cv2
import base64
from PIL import Image
import io
import logging

# Initialize FastAPI app
app = FastAPI(title="Voxel Backend")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configure CORS with more detailed settings
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
    expose_headers=["*"]
)

class AIModel:
    def __init__(self):
        try:
            self.yolo_model = YOLO('yolov8n.pt')
            logger.info("YOLOv8 model loaded successfully")
        except Exception as e:
            logger.error(f"Error initializing YOLO model: {str(e)}")
            raise

# Initialize AI model
ai_model = AIModel()

class ImageRequest(BaseModel):
    image_data: str

class ImageResponse(BaseModel):
    description: str

@app.post("/analyze_image", response_model=ImageResponse)
async def analyze_image(request: ImageRequest):
    try:
        logger.info("Received image analysis request")
        
        # Decode base64 image
        try:
            image_data = base64.b64decode(request.image_data.split(',')[1])
            image = Image.open(io.BytesIO(image_data))
        except Exception as e:
            logger.error(f"Error decoding image: {str(e)}")
            raise HTTPException(status_code=400, detail="Invalid image data")
        
        # Convert to RGB if necessary
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        logger.info("Running YOLO detection")
        # Run YOLO detection
        results = ai_model.yolo_model(image)
        
        # Process results
        detections = []
        for r in results:
            boxes = r.boxes
            for box in boxes:
                class_name = r.names[int(box.cls[0])]
                confidence = float(box.conf[0])
                if confidence > 0.5:  # Only include confident detections
                    detections.append(f"{class_name} ({int(confidence * 100)}% confidence)")
        
        # Generate description
        if detections:
            description = f"I see {len(detections)} objects in this image: {', '.join(detections)}"
        else:
            description = "I don't see any recognizable objects in this image."
        
        logger.info(f"Analysis complete: {description}")
        return ImageResponse(description=description)
        
    except Exception as e:
        logger.error(f"Error analyzing image: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    return {"status": "healthy", "model_loaded": hasattr(ai_model, 'yolo_model')}

if __name__ == "__main__":
    import uvicorn
    logger.info("Starting Voxel Backend...")
    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info") 