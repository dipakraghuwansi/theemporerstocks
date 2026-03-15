fetch('https://api.kite.trade/instruments/NFO')
  .then(res => res.text())
  .then(text => {
    const lines = text.split('\n');
    const nfoOptions = lines.filter(l => l.includes('NIFTY') && (l.includes('CE') || l.includes('PE'))).slice(0, 50);
    console.log("Headers: " + lines[0]);
    nfoOptions.forEach(l => {
      const cols = l.split(',');
      if (cols.length > 11 && cols[2].includes('NIFTY25')) {
          console.log(cols[2], cols[5]); // tradingsymbol, expiry
      }
    });
  });
