import re
with open("src/components/Navigation.tsx", "r") as f:
    text = f.read()

# Match the specified link block using regular expressions effectively. This structure corresponds exactly with the content pulled from cat output!
pattern = r"<Link[\s\S]*?/quant-v2[\s\S]*?</Link>"

# Cleanly sub out that link using re.sub! Note `count=1` just ensures we just strip the link block exactly matched without touching other hrefs.
new_text = re.sub(pattern, "", text, count=1) 

with open("src/components/Navigation.tsx", "w") as f:
    f.write(new_text)

