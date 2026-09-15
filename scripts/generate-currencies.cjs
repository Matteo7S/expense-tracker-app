// Regenerate the offline catalogue from SIX's ISO 4217 List One XML.
// Usage: node scripts/generate-currencies.cjs /path/to/list-one.xml
const fs = require('node:fs');
const path = require('node:path');
const xml = fs.readFileSync(process.argv[2], 'utf8');
const decode = value => value.replace(/&amp;/g, '&').replace(/&apos;/g, "'").replace(/&quot;/g, '"');
const records = new Map();
for (const match of xml.matchAll(/<CcyNtry>([\s\S]*?)<\/CcyNtry>/g)) {
  const code = match[1].match(/<Ccy>([A-Z]{3})<\/Ccy>/)?.[1];
  if (!code || ['XTS', 'XXX'].includes(code) || records.has(code)) continue;
  const english = decode(match[1].match(/<CcyNm[^>]*>([^<]+)<\/CcyNm>/)[1]);
  const names = Object.fromEntries(['it', 'en', 'de'].map(locale => {
    const name = new Intl.DisplayNames([locale], { type: 'currency' }).of(code);
    return [locale, name && name !== code ? name : english];
  }));
  const symbol = new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' })
    .formatToParts(0).find(part => part.type === 'currency').value;
  records.set(code, { code, names, symbol });
}
if (records.size < 150) throw new Error('Incomplete currency catalogue');
const data = {
  source: 'https://www.six-group.com/dam/download/financial-information/data-center/iso-currrency/lists/list-one.xml',
  published: xml.match(/Pblshd="([^"]+)"/)[1],
  currencies: [...records.values()].sort((a, b) => a.code.localeCompare(b.code)),
};
fs.writeFileSync(path.join(__dirname, '../utils/currencies.json'), JSON.stringify(data, null, 2) + '\n');
console.log(`Generated ${records.size} currency entries (ISO list ${data.published})`);
