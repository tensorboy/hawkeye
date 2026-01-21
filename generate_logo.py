import os
from PIL import Image, ImageDraw

def generate_logo(size=1024):
    # Create a transparent image
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    
    # Colors
    primary_blue = (0, 122, 255, 255)  # #007AFF
    dark_blue = (0, 50, 150, 255)
    white = (255, 255, 255, 255)
    
    # Outer Circle (optional, maybe just the eye)
    # Let's do a large circle background? No, let's do a shaped logo.
    # But for App Icon, a circle or rounded rect is standard.
    # Let's draw a rounded square background for Desktop/App, 
    # but for "logo", usually we want the shape.
    # I'll draw the SHAPE, and then we can put it on backgrounds if needed.
    # Actually, for Chrome Ext, transparent bg is good.
    
    # Scale factors
    center = size // 2
    radius = int(size * 0.45)
    
    # Draw Background Circle (Electric Blue)
    # This serves as the container
    draw.ellipse((center - radius, center - radius, center + radius, center + radius), fill=primary_blue)
    
    # Draw "Eye" Sclera (White)
    eye_width = int(radius * 1.5)
    eye_height = int(radius * 0.9)
    # Draw an eye shape using two arcs? Or just an ellipse for simplicity.
    # A stylized eye is often an ellipse with pointed corners.
    # Let's stick to a simple clean ellipse for the "ball" of the eye, or a techy circle.
    
    # Inner Circle (White ring)
    inner_radius = int(radius * 0.7)
    draw.ellipse((center - inner_radius, center - inner_radius, center + inner_radius, center + inner_radius), outline=white, width=int(size * 0.05))
    
    # Central Pupil (Solid White)
    pupil_radius = int(radius * 0.3)
    draw.ellipse((center - pupil_radius, center - pupil_radius, center + pupil_radius, center + pupil_radius), fill=white)
    
    # Crosshair (Tech feel) - 4 lines
    line_length = int(radius * 0.8)
    line_width = int(size * 0.04)
    # Vertical top
    draw.line((center, center - line_length, center, center - inner_radius), fill=white, width=line_width)
    # Vertical bottom
    draw.line((center, center + inner_radius, center, center + line_length), fill=white, width=line_width)
    # Horizontal left
    draw.line((center - line_length, center, center - inner_radius, center), fill=white, width=line_width)
    # Horizontal right
    draw.line((center + inner_radius, center, center + line_length, center), fill=white, width=line_width)
    
    return img

def save_resized(img, path, size):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(path)
    print(f"Saved {path}")

def main():
    root = "/Users/wangpengan/Desktop/workforyou"
    
    # 1. Generate Master Logo
    master_logo = generate_logo(1024)
    
    # 2. Chrome Extension
    chrome_base = f"{root}/hawkeye/packages/chrome-extension/public/icons"
    save_resized(master_logo, f"{chrome_base}/icon16.png", 16)
    save_resized(master_logo, f"{chrome_base}/icon48.png", 48)
    save_resized(master_logo, f"{chrome_base}/icon128.png", 128)
    
    # 3. VS Code Extension
    vscode_base = f"{root}/hawkeye/packages/vscode-extension/images"
    save_resized(master_logo, f"{vscode_base}/icon.png", 128)
    
    # 4. Desktop
    desktop_base = f"{root}/hawkeye/packages/desktop/resources"
    # Also save to build usually? Let's put in resources first.
    save_resized(master_logo, f"{desktop_base}/icon.png", 512)
    
    # 5. Web
    web_base = f"{root}/hawkiyi-web/public"
    save_resized(master_logo, f"{web_base}/logo.png", 512)
    save_resized(master_logo, f"{web_base}/favicon.ico", 32) # Pillow can save .ico, but let's check.
    # Force save as PNG for favicon if ICO fails, but usually .ico is just a format.
    # Let's save as .png for favicon and rename? No, let's try .ico.
    try:
        master_logo.resize((32, 32), Image.Resampling.LANCZOS).save(f"{web_base}/favicon.ico", format='ICO')
        print(f"Saved {web_base}/favicon.ico")
    except Exception as e:
        print(f"Error saving ICO: {e}")
        # Fallback
        save_resized(master_logo, f"{web_base}/favicon.png", 32)

if __name__ == "__main__":
    main()
