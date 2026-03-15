with open("src/app/quant/page.tsx", "r") as f:
    text = f.read()

# Make sure all recharts components exist
old_import = "} from 'recharts';"
new_import = ", ReferenceLine, YAxis} from 'recharts';"

if "ReferenceLine," not in text and "YAxis," not in text:
    text = text.replace(old_import, new_import)

with open("src/app/quant/page.tsx", "w") as f:
    f.write(text)

