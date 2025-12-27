import requests
import json
import os

BASE_URL = "http://localhost:8001/api"
LOGIN_URL = f"{BASE_URL}/auth/login"
SETTINGS_URL = f"{BASE_URL}/site-settings"
UPLOAD_URL = f"{BASE_URL}/upload-image"

def test_api():
    print("1. Logging in as admin...")
    try:
        response = requests.post(LOGIN_URL, json={"username": "admin", "password": "admin123"})
        response.raise_for_status()
        token = response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("   Success! Token received.\n")
    except Exception as e:
        print(f"   Failed to login: {e}")
        return

    print("2. Fetching current settings...")
    try:
        response = requests.get(SETTINGS_URL) # Public endpoint, no auth needed technically but checking defaults
        response.raise_for_status()
        settings = response.json()
        print(f"   Current Title: {settings.get('site_title')}")
        print("   Success!\n")
    except Exception as e:
        print(f"   Failed to fetch settings: {e}")
        return

    print("3. Updating Site Title and Primary Color...")
    new_title = f"MedTrack Verified {os.urandom(4).hex()}"
    update_payload = {
        "site_title": new_title,
        "primary_color": "#ff0000"
    }
    try:
        response = requests.put(SETTINGS_URL, json=update_payload, headers=headers)
        response.raise_for_status()
        updated_settings = response.json()
        print(f"   New Title in response: {updated_settings.get('site_title')}")
        assert updated_settings.get('site_title') == new_title
        print("   Success!\n")
    except Exception as e:
        print(f"   Failed to update settings: {e}")
        print(response.text)
        return

    print("4. Verifying persistence (Fetching again)...")
    try:
        response = requests.get(SETTINGS_URL)
        settings = response.json()
        print(f"   Persisted Title: {settings.get('site_title')}")
        assert settings.get('site_title') == new_title
        print("   Success! Data persisted.\n")
    except Exception as e:
        print(f"   Failed verification: {e}")
        return

    print("5. Testing Image Upload...")
    try:
        # Create a dummy image file
        with open("test_image.png", "wb") as f:
            f.write(os.urandom(1024))
        
        files = {"file": ("test_image.png", open("test_image.png", "rb"), "image/png")}
        response = requests.post(UPLOAD_URL, files=files, headers=headers)
        response.raise_for_status()
        result = response.json()
        print(f"   Upload URL: {result.get('url')}")
        assert result.get('url').startswith("/uploads/")
        print("   Success!\n")
        
        # Cleanup
        os.remove("test_image.png")
    except Exception as e:
        print(f"   Failed to upload: {e}")
        if 'response' in locals():
            print(response.text)

    print("\nALL BACKEND TESTS PASSED for Site Settings.")

if __name__ == "__main__":
    test_api()
