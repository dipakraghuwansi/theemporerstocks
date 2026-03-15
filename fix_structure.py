import re

with open("src/app/quant/page.tsx", "r") as f:
    text = f.read()

# Fix duplicate </main> or parsing hierarchy errors simply.
if text.count("</main>") > 1:
   parts = text.rsplit("</main>", 1)
   text = "".join(parts) # Remove the very last one, keep the one properly formatting component

# Fix missing closing tags if present inside the Volatility Section injection:
if "Volatility Skew (Fear)" in text:
    pass 
    
# Let's write it back cleaned
with open("src/app/quant/page.tsx", "w") as f:
    f.write(text)

