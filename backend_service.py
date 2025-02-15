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
import json
from gtts import gTTS
import logging

# Initialize FastAPI app
app = FastAPI(title="Voxel Backend")

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize YOLO model
class AIModels:
    def __init__(self):
        try:
            # Initialize YOLOv8
            self.yolo_model = YOLO('yolov8n.pt')
            logger.info("YOLOv8 model loaded successfully")
        except Exception as e:
            logger.error(f"Error initializing YOLO model: {str(e)}")
            raise

# Initialize AI models
ai_models = AIModels()

# Pydantic models for request/response
class ImageAnalysisRequest(BaseModel):
    image_data: str

class AnalysisResponse(BaseModel):
    objects: List[dict]
    description: str
    audio_base64: Optional[str] = None

@app.post("/analyze_image", response_model=AnalysisResponse)
async def analyze_image(request: ImageAnalysisRequest):
    try:
        # Decode base64 image
        image_data = base64.b64decode(request.image_data.split(',')[1])
        image = Image.open(io.BytesIO(image_data))
        
        # Convert to RGB if necessary
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # YOLOv8 object detection
        results = ai_models.yolo_model(image)
        objects_detected = []
        for r in results:
            boxes = r.boxes
            for box in boxes:
                obj = {
                    "class": r.names[int(box.cls[0])],
                    "confidence": float(box.conf[0]),
                    "bbox": box.xyxy[0].tolist()
                }
                objects_detected.append(obj)
        
        # Generate description
        if objects_detected:
            description = f"I detected {len(objects_detected)} objects in the image: "
            object_descriptions = []
            for obj in objects_detected:
                conf_percentage = round(obj['confidence'] * 100)
                object_descriptions.append(f"{obj['class']} ({conf_percentage}% confidence)")
            description += ", ".join(object_descriptions)
        else:
            description = "No objects were detected in this image."
        
        # Convert description to speech using gTTS
        tts = gTTS(text=description, lang='en')
        audio_io = io.BytesIO()
        tts.write_to_fp(audio_io)
        audio_io.seek(0)
        
        # Encode audio to base64
        audio_base64 = base64.b64encode(audio_io.read()).decode()
        
        return AnalysisResponse(
            objects=objects_detected,
            description=description,
            audio_base64=audio_base64
        )
        
    except Exception as e:
        logger.error(f"Error processing image: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    logger.info("Starting Voxel Backend...")
    uvicorn.run(app, host="0.0.0.0", port=8000) 