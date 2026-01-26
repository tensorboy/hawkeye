from PIL import Image, ImageDraw, ImageOps, ImageEnhance, ImageFilter
import os

def process_clean_logo(image_path, size=1024):
    try:
        img = Image.open(image_path).convert("RGBA")
    except Exception as e:
        print(f"Error opening image: {e}")
        return None

    # 1. CROP (Bottom Right Focus - Eyes)
    width, height = img.size
    min_dim = min(width, height)
    crop_size = int(min_dim * 0.60)
    padding = int(min_dim * 0.1)
    left = width - crop_size - padding
    top = height - crop_size - padding
    if left < 0: left = 0
    if top < 0: top = 0
    
    img = img.crop((left, top, left + crop_size, top + crop_size))
    img = img.resize((size, size), Image.Resampling.LANCZOS)
    
    # 2. ENHANCE (Natural but Polished)
    # Brighten up
    enhancer = ImageEnhance.Brightness(img)
    img = enhancer.enhance(1.2)
    
    # Sharpness for eyes
    sharpness = ImageEnhance.Sharpness(img)
    img = sharpness.enhance(1.5)
    
    # 3. STYLE: "Crystal Soul"
    # Keep some color? Or stylized B&W?
    # User said "Blue not good". Maybe grayscale with warm tint?
    # Or just clean, high-contrast B&W which looks classy.
    # Let's do a tint: Deep Slate -> Silver -> White
    gray = img.convert("L")
    colored = ImageOps.colorize(gray, black=(20, 20, 25), white=(240, 240, 250))
    
    # 4. COMPOSITION
    logo = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    center = size // 2
    
    # Simple Background Circle
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((20, 20, size-20, size-20), fill=255)
    
    # Soften mask edge for elegance
    mask_soft = mask.filter(ImageFilter.GaussianBlur(3))
    
    logo.paste(colored, (0, 0), mask_soft)
    
    # 5. RIM: Minimalist Ring
    # Just one clean ring
    rim_layer = Image.new('RGBA', (size, size), (0,0,0,0))
    rim_draw = ImageDraw.Draw(rim_layer)
    rim_bbox = (20, 20, size-20, size-20)
    
    # White glowing ring
    rim_draw.ellipse(rim_bbox, outline=(255, 255, 255, 200), width=int(size*0.02))
    
    # Add a soft outer glow to the ring only
    rim_glow = rim_layer.filter(ImageFilter.GaussianBlur(15))
    
    logo = Image.alpha_composite(logo, rim_glow)
    logo = Image.alpha_composite(logo, rim_layer) # Sharp ring on top

    return logo

def save_resized(img, path, size):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(path)
    print(f"Saved {path}")

def main():
    root = "/Users/wangpengan/Desktop/workforyou"
    dog_photo = "/Users/wangpengan/.gemini/antigravity/brain/d403aee2-4a5e-4ba6-bc29-659587d542c7/uploaded_image_1768978688515.jpg"
    
    print("Generating Clean Edition...")
    master_logo = process_clean_logo(dog_photo, 1024)
    
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
