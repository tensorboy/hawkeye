import os
from PIL import Image, ImageDraw, ImageOps, ImageEnhance, ImageFilter

def create_radial_gradient(size, inner_color, outer_color):
    # inner_color, outer_color are tuples (r,g,b,a)
    img = Image.new('RGBA', (size, size), (0,0,0,0))
    center = size / 2
    max_dist = size / 2
    
    pixels = img.load()
    
    # Pre-calculate steps for speed (optimization)
    # Simple direct pixel access
    for y in range(size):
        for x in range(size):
            dx = x - center
            dy = y - center
            dist = (dx*dx + dy*dy) ** 0.5
            
            if dist > max_dist:
                pixels[x,y] = outer_color
                continue
                
            ratio = dist / max_dist
            # Interpolate
            r = int(inner_color[0] + (outer_color[0] - inner_color[0]) * ratio)
            g = int(inner_color[1] + (outer_color[1] - inner_color[1]) * ratio)
            b = int(inner_color[2] + (outer_color[2] - inner_color[2]) * ratio)
            a = int(inner_color[3] + (outer_color[3] - inner_color[3]) * ratio)
            pixels[x,y] = (r, g, b, a)
            
    return img

def process_soul_image(image_path, size=1024):
    try:
        img = Image.open(image_path).convert("RGBA")
    except Exception as e:
        print(f"Error opening image: {e}")
        return None

    # 1. Smart Crop (Focus on Face)
    # We want a close up for "Soul Connection"
    width, height = img.size
    min_dim = min(width, height)
    # Zoom in slightly more (10% crop) to catch facial expression if possible
    # Assuming dog is centered.
    crop_dim = int(min_dim * 0.8)
    left = (width - crop_dim) / 2
    top = (height - crop_dim) / 2
    img = img.crop((left, top, left + crop_dim, top + crop_dim))
    
    # Resize to working size
    inner_size = int(size * 0.95) 
    img = img.resize((inner_size, inner_size), Image.Resampling.LANCZOS)
    
    # --- STYLE: "Soul Link" ---
    # Soft, Ethereal, Purple/Pink/Gold Gradient Map
    
    gray = img.convert("L")
    # Soften features for "Dreamy" look
    gray = gray.filter(ImageFilter.GaussianBlur(1))
    enhancer = ImageEnhance.Contrast(gray)
    gray = enhancer.enhance(1.2) # Moderate contrast
    
    # Gradient Map Logic
    # We want to map luminosity to a color gradient.
    # Dark -> Deep Indigo (Spirit)
    # Mid -> Violet/Purple
    # Light -> Warm Pink/Gold (Soul)
    
    # PIL ImageOps.colorize only supports 2 points (Black/White).
    # We can do a multi-pass or just chose a rich 2-point gradient.
    # Let's try: Black -> Deep Purple, White -> Soft Gold
    # Deep Purple: (30, 0, 60)
    # Soft Gold: (255, 220, 180)
    # This might look too washed out.
    # Let's try: Black -> Indigo (10, 0, 50), White -> Neon Cyan/White for "Energy"
    # But user wants "Soul", not "Tech".
    # Let's try: Black -> Deep Warm Brown/Purple, White -> Ethereal Blue.
    # Let's stick to a monochromatic "Spirit" look:
    # Deep Violet (20, 0, 40) -> Luminous Lilac (200, 180, 255)
    soul_img = ImageOps.colorize(gray, black=(20, 0, 40), white=(220, 200, 255))
    
    # Add a "Soul Glow" overlay (Soft light blend)
    # Just standard alpha blend for now.
    
    # --- COMPOSITION ---
    logo = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    center = size // 2
    
    # 1. Background Aura (The Halo)
    # Radial Gradient: Bright Center -> Fade Out
    # No, we want an Outer Halo.
    # Let's draw a soft outer glow circle.
    halo_radius = int(size * 0.48)
    halo_color = (180, 100, 255, 200) # Purple Glow
    
    halo_layer = Image.new('RGBA', (size, size), (0,0,0,0))
    halo_draw = ImageDraw.Draw(halo_layer)
    halo_draw.ellipse((center-halo_radius, center-halo_radius, center+halo_radius, center+halo_radius), fill=halo_color)
    # Blur heavily to make it an aura
    halo_layer = halo_layer.filter(ImageFilter.GaussianBlur(radius=40))
    
    logo = Image.alpha_composite(logo, halo_layer)
    
    # 2. Paste the Soul Image (Circle Masked)
    mask = Image.new('L', (inner_size, inner_size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.ellipse((0, 0, inner_size, inner_size), fill=255)
    
    # Apply a "Feathered" mask edge for soft integration
    mask = mask.filter(ImageFilter.GaussianBlur(10))
    
    offset = (size - inner_size) // 2
    logo.paste(soul_img, (offset, offset), mask)
    
    # 3. "Connection" Elements
    # Instead of tech lines, let's add "Constellation" points or "Sparkles"
    # A single star/sparkle near the dog's eye (assuming eye is roughly top center-ish)
    # Or just a subtle orbiting ring that looks like light painting.
    
    draw = ImageDraw.Draw(logo)
    
    # Soft Orbit Ring (The Link)
    orbit_r = int(size * 0.45)
    orbit_bbox = (center-orbit_r, center-orbit_r, center+orbit_r, center+orbit_r)
    # Draw arc with variable width? Hard in PIL.
    # Draw simple white ring with blur.
    
    ring_layer = Image.new('RGBA', (size, size), (0,0,0,0))
    ring_draw = ImageDraw.Draw(ring_layer)
    ring_draw.ellipse(orbit_bbox, outline=(255, 255, 255, 180), width=int(size*0.01))
    ring_layer = ring_layer.filter(ImageFilter.GaussianBlur(2))
    logo = Image.alpha_composite(logo, ring_layer)
    
    # Slogan/Symbol: "Infinity" symbol? Or just clean.
    # User wants "Soul Communication".
    # Let's add a "Pulse" visual implies a heartbeat/signal.
    # A second smaller ring.
    orbit_r2 = int(size * 0.42)
    ring_draw.ellipse((center-orbit_r2, center-orbit_r2, center+orbit_r2, center+orbit_r2), outline=(255, 200, 255, 100), width=int(size*0.005))
    
    # Final cleanup
    return logo

def save_resized(img, path, size):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    resized = img.resize((size, size), Image.Resampling.LANCZOS)
    resized.save(path)
    print(f"Saved {path}")

def main():
    root = "/Users/wangpengan/Desktop/workforyou"
    dog_photo = "/Users/wangpengan/.gemini/antigravity/brain/d403aee2-4a5e-4ba6-bc29-659587d542c7/uploaded_image_1768978688515.jpg"
    
    print("Generating Soul Edition...")
    master_logo = process_soul_image(dog_photo, 1024)
    
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
