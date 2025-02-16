# Voxel Web Reader

A powerful Chrome extension that provides an accessible web reading experience with voice control and AI-powered image description capabilities.

## Features

- **Smart Content Reading**: Intelligently identifies and reads main content while filtering out clutter
- **Voice Control**: Hands-free operation with natural voice commands
- **AI Image Description**: YOLO-powered image analysis and description
- **Customizable Voice**: Adjustable speed, volume, and voice selection
- **Keyboard Shortcuts**: Quick access with Alt+R for reading
- **Cross-page Support**: Works on any webpage
- **Easy Controls**: Simple popup interface for all features

## Installation

### Prerequisites
- Python 3.8 or higher
- Node.js 14 or higher
- Chrome browser

### Backend Setup
1. Clone the repository:
```bash
git clone https://github.com/Navaneeth-007/kh16.git
cd kh16
```

2. Create and activate a virtual environment:
```bash
python -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Start the backend server:
```bash
cd backend
uvicorn backend_service:app --reload
```

### Extension Setup
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" in the top right
3. Click "Load unpacked" and select the `kh16/extension` directory
4. The Voxel icon should appear in your Chrome toolbar

## Usage

### Basic Controls
- Click the Voxel icon to open the control panel
- Use the buttons to:
  - Start/Stop reading (Alt+R)
  - Toggle voice control
  - Describe images
  - Adjust reading speed
  - Select voice

### Voice Commands
- "read" or "start reading": Begin reading the page
- "stop" or "pause": Stop reading
- "describe images": Analyze and describe images
- "read faster/slower": Adjust reading speed
- "volume up/down": Adjust volume
- "help": List available commands

## Architecture

### Frontend (Chrome Extension)
- **Popup**: User interface for controls
- **Content Script**: Handles webpage interaction and reading
- **Background Script**: Manages extension state and communication

### Backend (FastAPI)
- **Image Analysis**: YOLO-based object detection
- **API Endpoints**: Image processing services
- **Error Handling**: Robust error management

## Technical Details

### Extension Components
- `popup.js`: UI control logic
- `content.js`: Core reading functionality
- `background.js`: Extension management
- `manifest.json`: Extension configuration

### Backend Services
- `backend_service.py`: Main FastAPI application
- `yolov8n.pt`: Pre-trained YOLO model
- FastAPI with CORS support
- RESTful API endpoints

## Development

### Local Development
1. Start the backend server:
```bash
uvicorn backend_service:app --reload
```

2. Load the extension in Chrome:
- Navigate to `chrome://extensions/`
- Enable Developer mode
- Load unpacked extension

### Building
```bash
# Generate extension icons
python generate_icons.py
```

## Security

- CORS configured for local development
- Microphone access requires explicit user permission
- Image data processed locally before sending to backend
- No data storage or external service dependencies

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- YOLOv8 for image detection
- Chrome Extensions API
- Web Speech API
- FastAPI framework

## Support

For support, please open an issue in the GitHub repository or contact [NAVANEETH](mailto:nsnandanam@gmail.com)

## Roadmap

- [ ] Support for additional languages
- [ ] Offline mode support
- [ ] Custom voice models
- [ ] Enhanced image descriptions
- [ ] Browser support expansion 