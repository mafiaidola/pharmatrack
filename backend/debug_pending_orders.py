import requests
import json
import os

BASE_URL = "http://localhost:8001/api"
LOGIN_URL = f"{BASE_URL}/auth/login"
PENDING_URL = f"{BASE_URL}/orders/pending-approval"

def test_pending_orders():
    print("1. Logging in as SUPER_ADMIN...")
    try:
        response = requests.post(LOGIN_URL, json={"username": "admin", "password": "admin123"})
        response.raise_for_status()
        token = response.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        print("   Success! Token received.\n")
    except Exception as e:
        print(f"   Failed to login: {e}")
        return

    print("2. Fetching pending orders...")
    try:
        response = requests.get(PENDING_URL, headers=headers)
        if response.status_code != 200:
             print(f"   FAILED: Status {response.status_code}")
             print(f"   Response: {response.text}")
             return
        
        orders = response.json()
        print(f"   Success! Received {len(orders)} orders.")
        print(json.dumps(orders[:1], indent=2)) # Print first order
    except Exception as e:
        print(f"   Failed to fetch pending orders: {e}")

if __name__ == "__main__":
    test_pending_orders()
