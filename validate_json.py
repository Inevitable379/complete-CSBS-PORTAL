import json
import os

try:
    with open('courses.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
    print("SUCCESS: JSON is valid.")
    print(f"Loaded {len(data)} items.")
except Exception as e:
    print(f"ERROR: {e}")
