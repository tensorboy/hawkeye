from PIL import Image, ImageDraw, ImageOps, ImageEnhance, ImageFilter
import os

def process_soul_bright_image(image_path, size=1024):
    try:
        img = Image.open(image_path).convert("RGBA")
    except Exception as e:
        print(f"Error opening image: {e}")
        return None

    # 1. FIXED CROP (Eyes are bottom-rightish in the original wide shot?)
    # User said "Eyes are in the bottom right". 
    # Let's adjust the crop window to capture the bottom-right quadrant more effectively.
    width, height = img.size
    min_dim = min(width, height)
    
    # We want to target the bottom-right area.
    # Let's define a crop box that is 60% of the image size (zoom in), 
    # but positioned towards the bottom right.
    crop_size = int(min_dim * 0.60)
    
    # Anchor to Bottom-Right with some padding
    # Left = width - crop_size - padding
    # Top = height - crop_size - padding
    # Let's try 10% padding from edge
    padding = int(min_dim * 0.1)
    
    left = width - crop_size - padding
    top = height - crop_size - padding
    
    # Sanity check bounds
    if left < 0: left = 0
    if top < 0: top = 0
    
    img = img.crop((left, top, left + crop_size, top + crop_size))
    img = img.resize((size, size), Image.Resampling.LANCZOS)
    
    # 2. BRIGHTNESS & CLARITY BOOST (Same as before, affirmed good)
    enhancer = ImageEnhance.Brightness(img)
    img = enhancer.enhance(1.4) # Even brighter
    
    contrast = ImageEnhance.Contrast(img)
    img = contrast.enhance(1.2)
    
    # 3. Style: Luminous Spirit
    gray = img.convert("L")
    colored = ImageOps.colorize(gray, black=(30, 20, 60), white=(230, 245, 255))
    
    # 4. Eye Glow
    threshold = 210
    highlights = gray.point(lambda p: p if p > threshold else 0)
    highlights = highlights.filter(ImageFilter.GaussianBlur(3))
    highlights = highlights.convert("RGBA")
    light_layer = Image.new('RGBA', (size, size), (150, 200, 255, 0))
    mask = highlights.point(lambda p: p) 
    logo_base = Image.composite(light_layer, colored, mask)
    logo_base = Image.blend(colored, logo_base, alpha=0.5)

    # --- COMPOSITION ---
    logo = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    center = size // 2
    
    # 1. Background Aura
    bg_draw = ImageDraw.Draw(logo)
    bg_draw.ellipse((20, 20, size-20, size-20), fill=(20, 10, 40)) 
    
    # 2. Paste Face
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((20, 20, size-20, size-20), fill=255)
    logo.paste(logo_base, (0, 0), mask)
    
    # 3. Halo Rim
    rim_layer = Image.new('RGBA', (size, size), (0,0,0,0))
    rim_draw = ImageDraw.Draw(rim_layer)
    rim_bbox = (20, 20, size-20, size-20)
    rim_draw.ellipse(rim_bbox, outline=(100, 200, 255, 150), width=int(size*0.04))
    rim_layer = rim_layer.filter(ImageFilter.GaussianBlur(10))
    rim_sharp = Image.new('RGBA', (size, size), (0,0,0,0))
    rim_sharp_draw = ImageDraw.Draw(rim_sharp)
    rim_sharp_draw.ellipse(rim_bbox, outline=(200, 230, 255, 255), width=int(size*0.015))
    logo = Image.alpha_composite(logo, rim_layer)
    logo = Image.alpha_composite(logo, rim_sharp)

    return logo

def save_resized(img, path, size):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(path)
    print(f"Saved {path}")

def main():
    root = "/Users/wangpengan/Desktop/workforyou"
    dog_photo = "/Users/wangpengan/.gemini/antigravity/brain/d403aee2-4a5e-4ba6-bc29-659587d542c7/uploaded_image_1768978688515.jpg"
    
    print("Generating Bright Soul Edition (Fixed Crop)...")
    master_logo = process_soul_bright_image(dog_photo, 1024)
    
    if master_logo:
        # Chrome Ext
        base = f"{root}/hawkeye/packages/chrome-extension/public/icons"
        save_resized(master_logo, f"{base}/icon16.png", 16)
        save_resized(master_logo, f"{base}/icon48.png", 48)
        save_resized(master_logo, f"{base}/icon128.png", 128)
        
        # VS Code
        save_resized(master_logo, f"{root}/hawkeye/packages/vscode-extension/images/icon.png", 128)
        
        # Desktop
        save_resized(master_logo, f"{root}/hawkeye/packages/desktop/resources/icon.png", 512)
        
        # Web
        web = f"{root}/hawkiyi-web/public"
        save_resized(master_logo, f"{web}/logo.png", 512)
        save_resized(master_logo, f"{web}/favicon-16x16.png", 16)
        save_resized(master_logo, f"{web}/favicon-32x32.png", 32)
        save_resized(master_logo, f"{web}/apple-touch-icon.png", 180)
        try:
            master_logo.resize((32, 32), Image.Resampling.LANCZOS).save(f"{web}/favicon.ico", format='ICO')
        except:
            pass
            
        # Root
        save_resized(master_logo, f"{root}/hawkeye/logo.png", 512)
        
        print("Done!")

if __name__ == "__main__":
    main()
