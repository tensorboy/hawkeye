from PIL import Image
import os

def save_resized(img, path, size):
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        # Use simple resizing if image is already good quality
        # Master logo provided by user is likely high res.
        resized = img.resize((size, size), Image.Resampling.LANCZOS)
        resized.save(path)
        print(f"Updated {path}")
    except Exception as e:
        print(f"Error saving {path}: {e}")

def main():
    root = "/Users/wangpengan/Desktop/workforyou"
    # The user-approved master logo
    master_path = f"{root}/hawkeye/logo.png"
    
    if not os.path.exists(master_path):
        print("Master logo not found at specified path!")
        return

    try:
        master_img = Image.open(master_path).convert("RGBA")
        print(f"Loaded master logo from {master_path}")
    except Exception as e:
        print(f"Failed to open master logo: {e}")
        return

    # 1. Chrome Extension
    chrome_base = f"{root}/hawkeye/packages/chrome-extension/public/icons"
    save_resized(master_img, f"{chrome_base}/icon16.png", 16)
    save_resized(master_img, f"{chrome_base}/icon48.png", 48)
    save_resized(master_img, f"{chrome_base}/icon128.png", 128)
    
    # 2. VS Code Extension
    save_resized(master_img, f"{root}/hawkeye/packages/vscode-extension/images/icon.png", 128)
    
    # 3. Desktop
    save_resized(master_img, f"{root}/hawkeye/packages/desktop/resources/icon.png", 512)
    
    # 4. Web
    web_base = f"{root}/hawkiyi-web/public"
    save_resized(master_img, f"{web_base}/logo.png", 512)
    save_resized(master_img, f"{web_base}/favicon-16x16.png", 16)
    save_resized(master_img, f"{web_base}/favicon-32x32.png", 32)
    save_resized(master_img, f"{web_base}/apple-touch-icon.png", 180)
    
    try:
        master_img.resize((32, 32), Image.Resampling.LANCZOS).save(f"{web_base}/favicon.ico", format='ICO')
        print(f"Updated {web_base}/favicon.ico")
    except Exception as e:
        print(f"Error saving ICO: {e}")

    print("All logos synchronized successfully!")

if __name__ == "__main__":
    main()
