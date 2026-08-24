// Render every template × every brand to previews/*.html for eyeballing.
// Run: npm run previews   (uses tsx)
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { TEMPLATES } from "../src/templates/index.ts";
import { BRANDS } from "../src/brands/index.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "previews");
mkdirSync(outDir, { recursive: true });

const brandIds = Object.keys(BRANDS);
const cards: string[] = [];

for (const tpl of Object.values(TEMPLATES)) {
  for (const brandId of brandIds) {
    const brand = BRANDS[brandId];
    const { html, subject } = tpl.render(brand, tpl.sample);
    const file = `${tpl.id}--${brandId}.html`;
    writeFileSync(join(outDir, file), html, "utf8");
    cards.push(
      `<div class="card"><div class="meta"><b>${tpl.label}</b><span>${brandId}</span></div>` +
        `<div class="subj">${subject}</div>` +
        `<iframe src="./${file}" loading="lazy"></iframe>` +
        `<a href="./${file}" target="_blank">Abrir ${file} ↗</a></div>`,
    );
  }
}

const index = `<!doctype html><meta charset="utf-8"><title>MyFenrir Emails · Previews</title>
<style>
 body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#05060B;color:#ECEEFF;margin:0;padding:32px;}
 h1{letter-spacing:-.5px;} .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(340px,1fr));gap:22px;margin-top:24px;}
 .card{background:#0B0E1A;border:1px solid rgba(150,166,224,.16);border-radius:16px;padding:14px;}
 .meta{display:flex;justify-content:space-between;font-size:13px;color:#CFD3E8;margin-bottom:4px;}
 .meta span{background:#00E5FF;color:#04121A;padding:2px 10px;border-radius:999px;font-weight:800;font-size:11px;}
 .subj{font-size:12px;color:#858BA8;margin-bottom:10px;height:32px;overflow:hidden;}
 iframe{width:100%;height:560px;border:0;border-radius:10px;background:#05060B;}
 a{display:inline-block;margin-top:10px;color:#00E5FF;font-size:13px;text-decoration:none;font-weight:600;}
</style>
<div style="font-size:11px;font-weight:800;letter-spacing:3px;color:#4FD7E0;">MYFENRIR // THE PACK</div>
<h1>FENRIR<span style="color:#00E5FF;">.</span> · Email previews</h1>
<p style="color:#858BA8;">${Object.keys(TEMPLATES).length} plantillas × ${brandIds.length} marca(s) = ${cards.length} correos</p>
<div class="grid">${cards.join("")}</div>`;
writeFileSync(join(outDir, "index.html"), index, "utf8");

console.log(`Rendered ${cards.length} previews -> ${outDir}/index.html`);
