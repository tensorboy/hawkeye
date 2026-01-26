from PIL import Image, ImageDraw, ImageOps, ImageEnhance, ImageFilter
import os

def process_soul_eye_image(image_path, size=1024):
    try:
        img = Image.open(image_path).convert("RGBA")
    except Exception as e:
        print(f"Error opening image: {e}")
        return None

    # 1. Precise Crop (Focus on EYES)
    # Based on the user image (puppy standing on grass), the head is top-rightish.
    # We want to zoom in on the EYES to get that "Soul Connection".
    # Previous simple center crop might have cut off the face or been too far.
    width, height = img.size
    
    # Heuristic: User's photo seems to have dog head in upper right quadrant?
    # Actually, let's stick to center but zoom LESS than before if we want context, 
    # OR zoom MORE on the face if we know where it is.
    # Without face detection, center crop is safest but might miss.
    # Let's do a center crop but slightly higher?
    # Let's Assume the dog is the main subject. The provided image shows a puppy.
    # Let's crop to a square centered on the image.
    min_dim = min(width, height)
    # Move crop up slightly to catch eyes (usually higher than center body)
    # Actually, crop 70% of min_dim to zoom in.
    crop_size = int(min_dim * 0.75)
    
    # Calculate crop box (Centered horizontally, slightly up vertically)
    left = (width - crop_size) / 2
    # Bias towards top (30% down from top vs 50%)
    top = (height - crop_size) * 0.3 
    
    img = img.crop((left, top, left + crop_size, top + crop_size))
    img = img.resize((size, size), Image.Resampling.LANCZOS)
    
    # 2. ENHANCE EYES (Local Contrast)
    # Since we can't detect eyes, we globally boost contrast and sharpness
    # to make the eyes "pop".
    enhancer = ImageEnhance.Sharpness(img)
    img = enhancer.enhance(2.0) # Sharpen details (fur, eyes)
    
    # 3. Style: "Ethereal Spirit"
    # Convert to grayscale first
    gray = img.convert("L")
    
    # BOOST CONTRAST heavily in midtones to make eyes shine
    contrast = ImageEnhance.Contrast(gray)
    gray = contrast.enhance(1.4)
    
    # 4. Color Grading: "Soul Gradient"
    # Deep Mystical Purple -> Bright Spiritual Light
    # Mapping:
    # Black -> Deep Void (5, 0, 20)
    # Mid -> Royal Purple
    # White -> Starlight (200, 220, 255)
    
    # Custom colorize via LUT (Simulated with 2-point for now)
    # To bring out the eyes (highlights), ensure White maps to something very bright.
    colored = ImageOps.colorize(gray, black=(10, 5, 25), white=(180, 230, 255))
    
    # 5. Eye Glow Trick (Simulated)
    # We can't know exactly where eyes are, but we can make the BRIGHTEST points (specular highlights in eyes) 
    # glow more.
    # Extract highlights
    threshold = 200
    highlights = gray.point(lambda p: p if p > threshold else 0)
    highlights = highlights.convert("RGBA")
    # Colorize highlights to Cyan/Electric
    # We need to map grayscale highlights to colored highlights.
    # Create a solid cyan layer and use highlights as mask.
    cyan_layer = Image.new('RGBA', (size, size), (0, 255, 255, 0))
    # We need an alpha mask from highlights
    mask = highlights.point(lambda p: 255 if p > 0 else 0)
    # Blur the mask for glow
    mask = mask.filter(ImageFilter.GaussianBlur(10))
    
    # Composite the glow
    # This adds a subtle glow to the brightest spots (likely eye reflections)
    glow_composite = Image.composite(cyan_layer, colored, mask)
    colored = Image.blend(colored, glow_composite, alpha=0.3)

    # --- COMPOSITION ---
    logo = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    center = size // 2
    
    # 1. Circular Soft Mask
    # Create a mask that is solid in center and fades at edges
    # But for "Soul", maybe we want the dog to fill the circle fully.
    mask = Image.new('L', (size, size), 0)
    draw = ImageDraw.Draw(mask)
    draw.ellipse((20, 20, size-20, size-20), fill=255) # Almost full fill
    # Feather edges
    mask = mask.filter(ImageFilter.GaussianBlur(5))
    
    logo.paste(colored, (0, 0), mask)
    
    # 2. The "Soul Ring" (Halo)
    # A distinct but soft ring framing the vision
    ring_layer = Image.new('RGBA', (size, size), (0,0,0,0))
    ring_draw = ImageDraw.Draw(ring_layer)
    ring_draw.ellipse((20, 20, size-20, size-20), outline=(150, 100, 255, 180), width=int(size*0.02))
    ring_layer = ring_layer.filter(ImageFilter.GaussianBlur(3))
    logo = Image.alpha_composite(logo, ring_layer)
    
    # 3. Bottom Gradient Overlay (for text readability if needed, or just style)
    # Skip for icon purity.

    return logo

def save_resized(img, path, size):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(path)
    print(f"Saved {path}")

def main():
    root = "/Users/wangpengan/Desktop/workforyou"
    dog_photo = "/Users/wangpengan/.gemini/antigravity/brain/d403aee2-4a5e-4ba6-bc29-659587d542c7/uploaded_image_1768978688515.jpg"
    
    print("Generating Soul Eye Edition...")
    master_logo = process_soul_eye_image(dog_photo, 1024)
    
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
