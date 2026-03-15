const fs = require('fs');
const pos = [
  {
    "id": "e6f212f3-c28f-4ba0-bcf5-901c8ebccbf9",
    "assetName": "NFO:NIFTY26FEB25500CE",
    "optionType": "CE",
    "position": "BUY",
    "strikePrice": 25500,
    "lotSize": 65,
    "numLots": 1,
    "entryPrice": 40.40,
    "currentLTP": 40.40,
    "expiry": "2025-02-26",
    "status": "OPEN"
  },
  {
    "id": "23fa348d-b3ef-4eab-93cf-8c3fb9fbb24a",
    "assetName": "NFO:NIFTY26FEB25500PE",
    "optionType": "PE",
    "position": "BUY",
    "strikePrice": 25500,
    "lotSize": 65,
    "numLots": 1,
    "entryPrice": 50.50,
    "currentLTP": 50.50,
    "expiry": "2025-02-26",
    "status": "OPEN"
  }
];
fs.writeFileSync('active_positions.json', JSON.stringify(pos, null, 2));
