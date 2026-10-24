// Turns dist-single/index.html into an Artifact page body (the host adds doctype/html/head/body).
import fs from 'node:fs';
const html = fs.readFileSync('dist-single/index.html', 'utf8');
const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
const keep = [
  ...head.matchAll(/<title>[\s\S]*?<\/title>|<meta name="(?:claude:[^"]+|theme-color)"[^>]*>|<link[^>]*>|<style[^>]*>[\s\S]*?<\/style>/g),
].map((m) => m[0]);
const scripts = [...head.matchAll(/<script[^>]*>[\s\S]*?<\/script>/g)].map((m) => m[0]);
fs.writeFileSync('dist-single/bookgoat.html', [...keep, body, ...scripts].join('\n'));
console.log('wrote dist-single/bookgoat.html', (fs.statSync('dist-single/bookgoat.html').size / 1024).toFixed(0), 'KB');
