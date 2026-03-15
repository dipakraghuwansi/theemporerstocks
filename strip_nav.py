import re
with open('src/components/Navigation.tsx', 'r') as f:
    text = f.read()

# Safely remove the Link block pointing to /quant-v2
new_text = re.sub(r'<Link[\s\S]*?href="/quant-v2"[\s\S]*?</Link>', '', text)

with open('src/components/Navigation.tsx', 'w') as f:
    f.write(new_text)
