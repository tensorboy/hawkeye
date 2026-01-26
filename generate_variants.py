import os
from PIL import Image, ImageDraw, ImageOps, ImageEnhance, ImageFilter

def create_gradient_mask(w, h):
    mask = Image.new('L', (w, h), 0)
    center_x, center_y = w / 2, h / 2
    max_radius = min(w, h) / 2
    pixels = mask.load()
    for y in range(h):
        for x in range(w):
            dx = x - center_x
            dy = y - center_y
            dist = (dx*dx + dy*dy) ** 0.5
            if dist < max_radius * 0.7:
                pixels[x, y] = 255
            elif dist > max_radius:
                pixels[x, y] = 0
            else:
                ratio = (dist - (max_radius * 0.7)) / (max_radius * 0.3)
                pixels[x, y] = int(255 * (1 - ratio))
    return mask

def apply_scanlines(img, spacing=4, intensity=50):
    w, h = img.size
    overlay = Image.new('RGBA', (w, h), (0,0,0,0))
    draw = ImageDraw.Draw(overlay)
    for y in range(0, h, spacing):
        draw.line((0, y, w, y), fill=(0, 0, 0, intensity))
    return Image.alpha_composite(img.convert('RGBA'), overlay)

def generate_variant(image_path, color_name, primary_color, glow_color, size=512):
    try:
        img = Image.open(image_path).convert("RGBA")
    except:
        return

    # Crop Center
    width, height = img.size
    min_dim = min(width, height)
    left, top = (width - min_dim)/2, (height - min_dim)/2
    img = img.crop((left, top, left + min_dim, top + min_dim))
    
    inner_size = int(size * 0.9)
    img = img.resize((inner_size, inner_size), Image.Resampling.LANCZOS)
    
    # Stylize
    gray = img.convert("L")
    gray = ImageEnhance.Contrast(gray).enhance(1.8)
    
    # Color Map
    # Black -> Dark BG (10,10,15)
    # White -> Primary Color
    colored = ImageOps.colorize(gray, black=(5, 5, 10), white=primary_color)
    
    colored = apply_scanlines(colored, spacing=6, intensity=80)
    
    mask = create_gradient_mask(inner_size, inner_size)
    colored.putalpha(mask)
    
    # Composite
    logo = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    center = size // 2
    
    # Glow
    glow_radius = int(size * 0.48)
    glow_layer = Image.new('RGBA', (size, size), (0,0,0,0))
    glow_draw = ImageDraw.Draw(glow_layer)
    # Glow color with transparency
    g_col = glow_color + (60,)
    glow_draw.ellipse((center-glow_radius, center-glow_radius, center+glow_radius, center+glow_radius), fill=g_col)
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=20))
    logo = Image.alpha_composite(logo, glow_layer)
    
    # Paste Dog
    offset = (size - inner_size) // 2
    logo.paste(colored, (offset, offset), colored)
    
    # Rim
    draw = ImageDraw.Draw(logo)
    rim_width = int(size * 0.03)
    rim_rect = (center-glow_radius, center-glow_radius, center+glow_radius, center+glow_radius)
    draw.ellipse(rim_rect, outline=primary_color, width=rim_width)
    
    # HUD Arcs
    arc_rect = (center-glow_radius-15, center-glow_radius-15, center+glow_radius+15, center+glow_radius+15)
    draw.arc(arc_rect, start=180, end=270, fill=glow_color, width=int(rim_width/2))
    draw.arc(arc_rect, start=0, end=90, fill=glow_color, width=int(rim_width/2))
    
    filename = f"logo_variant_{color_name}.png"
    logo.save(filename)
    print(f"Generated {filename}")

def main():
    dog_photo = "/Users/wangpengan/.gemini/antigravity/brain/d403aee2-4a5e-4ba6-bc29-659587d542c7/uploaded_image_1768978688515.jpg"
    
    # 1. Purple (Mystery/Shadow)
    generate_variant(dog_photo, "purple", (180, 0, 255), (200, 100, 255))
    
    # 2. Red (Alert/Terminator)
    generate_variant(dog_photo, "red", (255, 20, 20), (255, 100, 100))
    
    # 3. Gold/Amber (Tactical)
    generate_variant(dog_photo, "gold", (255, 160, 0), (255, 220, 100))

    # 4. Cyan/Teal (Cyberpunk alternate)
    generate_variant(dog_photo, "teal", (0, 255, 180), (100, 255, 220))

if __name__ == "__main__":
    main()
