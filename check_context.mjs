import fs from 'fs';

const data = JSON.parse(fs.readFileSync('/app/eurusd_60.json', 'utf8'));
const candles = data.candles || data;
const target = candles.filter(c => c.time >= 1785196980 && c.time <= 1785197100);
const before = candles.filter(c => c.time >= 1785196800 && c.time < 1785196980);
const after = candles.filter(c => c.time > 1785197100 && c.time <= 1785197400);

console.log('EURUSD_OTC tf=60 — Context around the outliers:');
console.log('\nBefore (1785196800-1785196979):');
before.slice(-3).forEach(c => console.log(`  time=${c.time} open=${c.open} high=${c.high} low=${c.low} close=${c.close}`));

console.log('\nOUTLIERS (1785196980-1785197100):');
target.forEach(c => console.log(`  time=${c.time} open=${c.open} high=${c.high} low=${c.low} close=${c.close} ⚠️`));

console.log('\nAfter (1785197101-1785197400):');
after.slice(0, 3).forEach(c => console.log(`  time=${c.time} open=${c.open} high=${c.high} low=${c.low} close=${c.close}`));

const beforeMids = before.map(c => (c.open + c.close) / 2);
const afterMids = after.map(c => (c.open + c.close) / 2);
const targetMids = target.map(c => (c.open + c.close) / 2);

const avgBefore = beforeMids.reduce((a, b) => a + b, 0) / beforeMids.length;
const avgAfter = afterMids.reduce((a, b) => a + b, 0) / afterMids.length;
const avgTarget = targetMids.reduce((a, b) => a + b, 0) / targetMids.length;

console.log(`\nAverage midprice before: ${avgBefore.toFixed(5)}`);
console.log(`Average midprice of outliers: ${avgTarget.toFixed(5)} (${((avgTarget - avgBefore) / avgBefore * 100).toFixed(2)}% higher)`);
console.log(`Average midprice after: ${avgAfter.toFixed(5)}`);
