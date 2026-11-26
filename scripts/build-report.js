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

  .cover { height: 258mm; box-sizing: border-box; border: 3px solid #000; padding: 16mm 15mm;
    font-family: "Times New Roman", Times, serif; color: #000; break-after: page; }
  .cover img { border: 0; width: 125mm; margin: 0 auto; }
  .cover hr { border: 0; border-top: 1.5px solid #000; margin: 6mm 0 12mm; }
  .cover h1 { font-family: "Times New Roman", Times, serif; color: #000; border: 0; text-align: center;
    font-size: 24pt; margin: 0 0 2mm; letter-spacing: .5px; }
  .cover .sub { text-align: center; font-size: 13pt; margin: 0 0 12mm; }
  .cover table { border: 0; font-size: 12.5pt; margin: 0; break-inside: auto; }
  .cover td, .cover th { border: 0; padding: 0 0 7mm; background: none; }
  .cover td:first-child { font-weight: bold; width: 48%; }
  .cover .members td { padding-bottom: 2.5mm; }
  .cover .members td:first-child { font-weight: normal; width: 62%; }
`;

// Title page, only for the project report
const COVER = `
<section class="cover">
  <img src="docs/university-logo.png" alt="Abbottabad University of Science &amp; Technology">
  <hr>
  <h1>E-Commerce Assignment</h1>
  <p class="sub">Haven Goods – Online Shopping Website (Group Assignment)</p>
  <table>
    <tr><td>Group Members:</td><td>
      <table class="members">
        <tr><td>Ibtisam Awan</td><td>15477</td></tr>
        <tr><td>Allyan Khan</td><td>15472</td></tr>
        <tr><td>Afnan Khan</td><td>15511</td></tr>
      </table></td></tr>
    <tr><td>Department:</td><td>Software Engineering</td></tr>
    <tr><td>Class:</td><td>BSSE 6th Semester</td></tr>
    <tr><td>Subject:</td><td>E-Commerce</td></tr>
    <tr><td>Instructor:</td><td>Ma'am Maria Jadoon</td></tr>
    <tr><td>Submission Date:</td><td>26<sup>th</sup> November, 2026</td></tr>
  </table>
</section>`;

(async () => {
  const md = fs.readFileSync(path.join(ROOT, INPUT), 'utf8');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <base href="${pathToFileURL(ROOT + path.sep).href}"><style>${css}</style></head>
    <body>${INPUT === 'REPORT.md' ? COVER : ''}${marked.parse(md)}</body></html>`;
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
