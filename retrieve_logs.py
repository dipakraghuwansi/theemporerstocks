import json
import os

log_dir = "/Users/dipakraghuwansi/.gemini/antigravity/brain/93538888-f9a9-4c7f-bf9c-4dfb6ced4af5/.system_generated/logs"
if not os.path.exists(log_dir):
    print("Log directory not found.")
else:
    for filename in sorted(os.listdir(log_dir)):
        if filename.endswith(".json"):
            with open(os.path.join(log_dir, filename), "r") as f:
                try:
                    data = json.load(f)
                    # Check if standard AI assistant markdown contains our search targets
                    content = str(data) 
                    if "master score" in content.lower() or "quant" in content.lower():
                        print(f"File {filename} matches!")
                except Exception as e:
                    pass
