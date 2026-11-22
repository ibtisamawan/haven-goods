// Converts a Markdown file (with its screenshots) into a PDF using headless Chrome/Edge.
// Usage: npm run report                      -> REPORT.md to REPORT.pdf
//        node scripts/build-report.js DEMO_GUIDE.md   -> DEMO_GUIDE.pdf
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { marked } = require('marked');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const INPUT = process.argv[2] || 'REPORT.md';
const OUTPUT = INPUT.replace(/\.md$/i, '.pdf');
const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].filter(Boolean);

const css = `
  body { font-family: "Segoe UI", Arial, sans-serif; color: #1f2a2e; font-size: 11pt; line-height: 1.5; }
  h1 { color: #0f6b5c; font-size: 22pt; border-bottom: 3px solid #e8a33d; padding-bottom: 6px; }
  h2 { color: #0f6b5c; font-size: 15pt; margin-top: 22px; break-after: avoid; }
  h3 { font-size: 12pt; margin-top: 16px; break-after: avoid; }
  table { border-collapse: collapse; width: 100%; margin: 8px 0 14px; font-size: 9.5pt; break-inside: avoid; }
  th, td { border: 1px solid #d8d5ce; padding: 5px 8px; text-align: left; vertical-align: top; }
  th { background: #e3f1ed; }
  img { max-width: 100%; max-height: 225mm; display: block; margin: 8px auto 14px; border: 1px solid #d8d5ce; break-inside: avoid; }
  code { background: #f2f0ea; padding: 1px 4px; border-radius: 3px; font-size: 9.5pt; }
  p:has(img) { break-inside: avoid; }
`;

(async () => {
  const md = fs.readFileSync(path.join(ROOT, INPUT), 'utf8');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <base href="${pathToFileURL(ROOT + path.sep).href}"><style>${css}</style></head>
    <body>${marked.parse(md)}</body></html>`;
  const tmp = path.join(ROOT, 'report.tmp.html');
  fs.writeFileSync(tmp, html);

  const executablePath = CANDIDATES.find((p) => fs.existsSync(p));
  const browser = await puppeteer.launch({ executablePath, headless: true });
  const page = await browser.newPage();
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'networkidle0' });
  await page.pdf({
    path: path.join(ROOT, OUTPUT), format: 'A4', printBackground: true,
    margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' },
    displayHeaderFooter: true, headerTemplate: '<span></span>',
    footerTemplate: `<div style="font-size:8pt;width:100%;text-align:center;color:#888">Haven Goods – ${INPUT === 'REPORT.md' ? 'Project Report' : 'Demonstration Guide'} · Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>`,
  });
  await browser.close();
  fs.unlinkSync(tmp);
  console.log(`${OUTPUT} created`);
})().catch((err) => { console.error(err); process.exit(1); });
