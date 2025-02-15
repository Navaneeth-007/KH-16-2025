from PIL import Image, ImageDraw
import math

def create_icon(size):
    # Create a new image with transparent background
    image = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    draw = ImageDraw.Draw(image)
    
    # Colors
    primary_color = (66, 133, 244)  # Google Blue
    
    # Center point
    center_x = size // 2
    center_y = size // 2
    
    # Draw sound waves (3 arcs)
    wave_counts = 3
    max_width = max(1, size // 32)  # Line width based on icon size
    
    for i in range(wave_counts):
        # Calculate arc size
        radius = (size // 4) * (i + 1) / wave_counts
        
        # Draw left side arc
        bbox = [
            center_x - radius,
            center_y - radius,
            center_x + radius,
            center_y + radius
        ]
        
        # Draw arcs with varying angles
        start_angle = 150  # Starting angle
        end_angle = 210   # Ending angle
        
        # Calculate coordinates for arc
        for t in range(start_angle, end_angle, 2):
            rad = math.radians(t)
            x1 = center_x + radius * math.cos(rad)
            y1 = center_y + radius * math.sin(rad)
            rad2 = math.radians(t + 2)
            x2 = center_x + radius * math.cos(rad2)
            y2 = center_y + radius * math.sin(rad2)
            draw.line([x1, y1, x2, y2], fill=primary_color, width=max_width)
    
    # Draw central circle (speaker point)
    circle_radius = size // 8
    draw.ellipse([
        center_x - circle_radius,
        center_y - circle_radius,
        center_x + circle_radius,
        center_y + circle_radius
    ], fill=primary_color)
    
    return image

# Generate icons in different sizes
sizes = [16, 48, 128]
for size in sizes:
    icon = create_icon(size)
    icon.save(f'kh16/icons/icon{size}.png') 