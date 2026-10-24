// Builds src/data/bonus.txt: common 5–7 letter words (SCOWL sizes 10+20) that are also valid in ENABLE.
import fs from 'node:fs';
const enable = new Set(fs.readFileSync('src/data/enable1.txt', 'utf8').split(/\r?\n/));
const load = (n) => JSON.parse(fs.readFileSync(`node_modules/wordlist-english/english-words-${n}.json`, 'utf8'));
const block = new Set(['bitch','bastard','whore','pussy','penis','vagina','sexual','nigger','faggot','rapist','raped','kills','killer','murder','suicide','corpse','drugs','abuse']);
const out = [...new Set([...load(10), ...load(20)])]
  .filter((w) => /^[a-z]{5,7}$/.test(w) && enable.has(w) && !block.has(w) && !w.endsWith('s'))
  .sort();
fs.writeFileSync('src/data/bonus.txt', out.join('\n'));
console.log(out.length, 'bonus words');
