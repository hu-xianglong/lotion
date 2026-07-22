import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const outputDir = path.dirname(fileURLToPath(import.meta.url));

const drafts = [
  // 01-10: folded planes
  ["folded-planes", "folded-corner", `<path fill="currentColor" d="M176 72 L288 72 L316 136 L232 336 L160 424 L116 284 Z"/><path fill="currentColor" d="M176 424 L298 292 L396 424 Z"/>`],
  ["folded-planes", "wide-ribbon", `<path fill="currentColor" d="M132 80 H252 L280 112 L232 348 L180 424 H100 L144 348 Z"/><path fill="currentColor" d="M196 424 L276 326 H416 L380 424 Z"/>`],
  ["folded-planes", "leaning-shard", `<path fill="currentColor" d="M160 72 H280 L248 368 L176 424 H104 L148 360 Z"/><path fill="currentColor" d="M192 424 L316 324 L420 424 Z"/>`],
  ["folded-planes", "nib-fold", `<path fill="currentColor" fill-rule="evenodd" d="M120 80 H264 L300 116 L244 356 L184 424 H104 L148 356 Z M172 324 L216 336 L180 384 Z"/><path fill="currentColor" d="M200 424 L288 340 L424 376 L396 424 Z"/>`],
  ["folded-planes", "tall-sail", `<path fill="currentColor" d="M188 64 H288 L244 376 L190 424 H118 L154 376 Z"/><path fill="currentColor" d="M206 424 L302 360 H424 L396 424 Z"/>`],
  ["folded-planes", "block-fold", `<path fill="currentColor" d="M104 80 H280 V336 L192 424 H104 Z"/><path fill="currentColor" d="M208 424 L296 336 H424 V424 Z"/>`],
  ["folded-planes", "continuous-ribbon", `<path fill="currentColor" fill-rule="evenodd" d="M120 72 H288 L256 344 H424 V424 H144 L96 376 Z M176 136 H220 L200 304 L164 344 L148 328 Z"/>`],
  ["folded-planes", "three-plane", `<path fill="currentColor" d="M116 72 H244 L268 112 L220 328 L148 408 L96 280 Z"/><path fill="currentColor" d="M160 420 L232 340 L292 376 L252 424 Z"/><path fill="currentColor" d="M276 424 L316 356 L428 404 L416 424 Z"/>`],
  ["folded-planes", "split-depth", `<path fill="currentColor" d="M112 80 H224 V424 H112 Z"/><path fill="currentColor" d="M240 80 H304 L272 336 L240 368 Z"/><path fill="currentColor" d="M240 384 H424 V424 H240 Z"/>`],
  ["folded-planes", "compact-fold", `<path fill="currentColor" d="M148 96 H284 L300 128 L240 344 L180 416 H116 L156 336 Z"/><path fill="currentColor" d="M196 416 L286 336 H396 L376 416 Z"/>`],

  // 11-20: pages and negative space
  ["page-space", "page-cutout", `<path fill="currentColor" fill-rule="evenodd" d="M120 64 H304 L392 152 V440 H120 Z M184 160 H236 V340 H328 V392 H184 Z"/><path fill="currentColor" d="M320 80 V136 H376 Z"/>`],
  ["page-space", "soft-page", `<path fill="currentColor" fill-rule="evenodd" d="M132 72 H300 L380 152 V416 Q380 440 356 440 H132 Q108 440 108 416 V96 Q108 72 132 72 Z M176 156 H232 V344 H324 V396 H176 Z"/><path fill="currentColor" d="M316 88 V136 H364 Z"/>`],
  ["page-space", "stacked-page", `<path fill="currentColor" opacity=".38" d="M164 48 H356 V384 H164 Z"/><path fill="currentColor" fill-rule="evenodd" d="M108 104 H300 L372 176 V448 H108 Z M172 184 H228 V344 H320 V400 H172 Z"/><path fill="currentColor" d="M316 120 V160 H356 Z"/>`],
  ["page-space", "corner-window", `<path fill="currentColor" fill-rule="evenodd" d="M96 80 H320 L416 176 V432 H96 Z M168 152 H232 V336 H344 V400 H168 Z M336 96 V160 H400 Z"/>`],
  ["page-space", "two-pages", `<path fill="currentColor" d="M96 72 H256 V352 L184 424 H96 Z"/><path fill="currentColor" d="M272 120 H360 L416 176 V424 H208 L272 360 Z"/><path fill="currentColor" d="M376 136 V160 H400 Z"/>`],
  ["page-space", "folded-foot", `<path fill="currentColor" d="M112 64 H272 L320 112 V344 L240 424 H112 Z"/><path fill="currentColor" d="M256 424 L336 344 H424 V424 Z"/><path fill="currentColor" d="M288 80 V96 H304 Z"/>`],
  ["page-space", "nested-page", `<path fill="currentColor" fill-rule="evenodd" d="M96 64 H360 V448 H96 Z M148 116 H308 V396 H148 Z M196 164 H244 V320 H292 V368 H196 Z"/>`],
  ["page-space", "open-corner", `<path fill="currentColor" d="M96 80 H248 V424 H96 Z"/><path fill="currentColor" d="M264 80 H360 L416 136 V248 H264 Z"/><path fill="currentColor" d="M264 264 H416 V424 H200 L264 360 Z"/>`],
  ["page-space", "file-tab", `<path fill="currentColor" fill-rule="evenodd" d="M104 96 H184 L216 64 H344 Q368 64 368 88 V424 Q368 448 344 448 H104 Q80 448 80 424 V120 Q80 96 104 96 Z M152 160 H208 V336 H304 V392 H152 Z"/>`],
  ["page-space", "page-strips", `<path fill="currentColor" d="M112 72 H224 V424 H112 Z"/><path fill="currentColor" d="M240 72 H352 V184 H240 Z"/><path fill="currentColor" d="M240 200 H352 V312 H240 Z"/><path fill="currentColor" d="M240 328 H424 V424 H240 Z"/>`],

  // 21-30: links and modular connections
  ["linked-forms", "rounded-links", `<rect fill="currentColor" x="104" y="72" width="144" height="352" rx="48"/><rect fill="currentColor" x="200" y="328" width="224" height="96" rx="48"/>`],
  ["linked-forms", "chain-corner", `<path fill="none" stroke="currentColor" stroke-width="56" stroke-linecap="round" d="M176 104 V344 Q176 400 232 400 H408"/><path fill="none" stroke="currentColor" stroke-width="28" stroke-linecap="round" d="M176 144 V304"/>`],
  ["linked-forms", "three-tiles", `<rect fill="currentColor" x="104" y="64" width="128" height="168" rx="16"/><rect fill="currentColor" x="104" y="248" width="128" height="176" rx="16"/><rect fill="currentColor" x="248" y="296" width="176" height="128" rx="16"/>`],
  ["linked-forms", "corner-brackets", `<path fill="none" stroke="currentColor" stroke-width="48" stroke-linecap="square" d="M120 80 V424 H424"/><path fill="none" stroke="currentColor" stroke-width="32" d="M216 128 V328 H376"/>`],
  ["linked-forms", "node-path", `<path fill="none" stroke="currentColor" stroke-width="40" stroke-linecap="round" d="M152 104 V360 Q152 408 200 408 H392"/><circle fill="currentColor" cx="152" cy="104" r="56"/><circle fill="currentColor" cx="152" cy="296" r="56"/><circle fill="currentColor" cx="392" cy="408" r="56"/>`],
  ["linked-forms", "woven-strips", `<path fill="currentColor" d="M104 64 H208 V424 H104 Z"/><path fill="currentColor" d="M224 304 H424 V408 H224 Z"/><path fill="currentColor" d="M176 336 L256 256 L312 312 L232 392 Z"/>`],
  ["linked-forms", "pixel-l", `<path fill="currentColor" d="M96 64 H224 V320 H288 V384 H416 V448 H96 Z"/>`],
  ["linked-forms", "dovetail", `<path fill="currentColor" d="M104 64 H248 V272 L288 312 L248 352 V424 H104 Z"/><path fill="currentColor" d="M264 352 L304 312 L344 352 H424 V424 H264 Z"/>`],
  ["linked-forms", "hinged-l", `<rect fill="currentColor" x="104" y="64" width="120" height="360" rx="28"/><rect fill="currentColor" x="256" y="304" width="168" height="120" rx="28"/><circle fill="none" stroke="currentColor" stroke-width="32" cx="240" cy="408" r="36"/>`],
  ["linked-forms", "loop-l", `<path fill="none" stroke="currentColor" stroke-width="64" stroke-linecap="round" stroke-linejoin="round" d="M152 88 V352 Q152 424 224 424 H408"/><path fill="none" stroke="currentColor" stroke-width="28" stroke-linecap="round" d="M248 296 Q312 232 376 296"/>`],

  // 31-40: layers and history
  ["layers-history", "offset-layers", `<path fill="currentColor" opacity=".28" d="M168 48 H248 V336 H408 V416 H168 Z"/><path fill="currentColor" opacity=".55" d="M136 72 H216 V360 H376 V440 H136 Z"/><path fill="currentColor" d="M104 96 H184 V384 H344 V464 H104 Z"/>`],
  ["layers-history", "sheet-stack", `<path fill="currentColor" opacity=".3" d="M176 48 H368 V368 H176 Z"/><path fill="currentColor" opacity=".55" d="M144 80 H336 V400 H144 Z"/><path fill="currentColor" fill-rule="evenodd" d="M112 112 H304 V432 H112 Z M160 160 H208 V336 H272 V384 H160 Z"/>`],
  ["layers-history", "timeline-bars", `<path fill="currentColor" d="M104 64 H192 V424 H104 Z"/><path fill="currentColor" d="M216 104 H352 V160 H216 Z"/><path fill="currentColor" d="M216 208 H320 V264 H216 Z"/><path fill="currentColor" d="M216 312 H424 V368 H216 Z"/>`],
  ["layers-history", "hard-shadow", `<path fill="currentColor" opacity=".3" d="M152 112 H264 V352 H416 V464 H152 Z"/><path fill="currentColor" d="M96 56 H208 V296 H360 V408 H96 Z"/>`],
  ["layers-history", "nested-l", `<path fill="currentColor" fill-rule="evenodd" d="M96 64 H424 V448 H96 Z M160 128 H360 V384 H160 Z M224 192 H288 V320 H328 V344 H224 Z"/>`],
  ["layers-history", "sliced-l", `<path fill="currentColor" d="M104 64 H232 V144 H104 Z"/><path fill="currentColor" d="M104 160 H232 V240 H104 Z"/><path fill="currentColor" d="M104 256 H232 V336 H104 Z"/><path fill="currentColor" d="M104 352 H424 V432 H104 Z"/>`],
  ["layers-history", "ascending-records", `<path fill="currentColor" d="M96 64 H176 V424 H96 Z"/><path fill="currentColor" opacity=".35" d="M192 328 H424 V424 H192 Z"/><path fill="currentColor" opacity=".6" d="M192 272 H368 V352 H192 Z"/><path fill="currentColor" d="M192 216 H312 V296 H192 Z"/>`],
  ["layers-history", "corner-stack", `<path fill="none" stroke="currentColor" stroke-width="44" d="M112 64 V424 H424"/><path fill="none" stroke="currentColor" stroke-width="36" opacity=".65" d="M168 80 V368 H408"/><path fill="none" stroke="currentColor" stroke-width="28" opacity=".35" d="M224 96 V312 H392"/>`],
  ["layers-history", "history-turn", `<path fill="none" stroke="currentColor" stroke-width="64" stroke-linecap="round" d="M152 80 V336 Q152 424 240 424 H416"/><path fill="currentColor" d="M304 320 L416 424 L304 464 Z"/><circle fill="currentColor" cx="152" cy="80" r="32"/>`],
  ["layers-history", "layered-chevrons", `<path fill="currentColor" d="M104 64 H232 V296 L200 328 L168 296 V128 H104 Z"/><path fill="currentColor" opacity=".65" d="M184 344 L232 296 L280 344 H424 V392 H184 Z"/><path fill="currentColor" opacity=".35" d="M216 408 L264 360 L312 408 H424 V456 H216 Z"/>`],

  // 41-50: letterforms and gestures
  ["letter-gesture", "brush-l", `<path fill="currentColor" d="M148 64 C204 80 240 76 276 56 C244 152 224 264 216 344 C212 384 224 408 264 416 C312 424 360 408 424 376 C408 400 408 424 420 448 C336 464 264 464 208 448 C156 432 132 400 140 344 C152 256 168 152 148 64 Z"/>`],
  ["letter-gesture", "monoline-l", `<path fill="none" stroke="currentColor" stroke-width="72" stroke-linecap="round" stroke-linejoin="round" d="M168 80 V368 Q168 424 224 424 H408"/>`],
  ["letter-gesture", "serif-l", `<path fill="currentColor" d="M104 64 H288 V112 L240 128 V368 L376 352 L424 312 V448 H104 V400 L152 384 V128 L104 112 Z"/>`],
  ["letter-gesture", "chisel-l", `<path fill="currentColor" d="M152 64 H280 L240 352 L208 400 H424 L392 448 H112 L152 352 Z"/>`],
  ["letter-gesture", "italic-l", `<path fill="currentColor" d="M192 64 H304 L240 368 H416 L400 448 H112 L128 368 H176 Z"/>`],
  ["letter-gesture", "stencil-l", `<path fill="currentColor" d="M104 64 H248 V256 H200 V112 H152 V400 H312 V352 H360 V448 H104 Z"/><path fill="currentColor" d="M376 352 H424 V448 H376 Z"/>`],
  ["letter-gesture", "slash-cut", `<path fill="currentColor" fill-rule="evenodd" d="M104 64 H256 V352 H424 V448 H104 Z M184 160 L240 112 V336 L184 384 Z"/>`],
  ["letter-gesture", "lowercase-l", `<path fill="currentColor" d="M152 64 H264 V344 Q264 384 304 384 H424 V448 H272 Q152 448 152 336 Z"/>`],
  ["letter-gesture", "ribbon-loop", `<path fill="none" stroke="currentColor" stroke-width="64" stroke-linecap="square" stroke-linejoin="round" d="M176 80 V328 Q176 424 272 424 H416"/><path fill="none" stroke="currentColor" stroke-width="40" d="M176 232 Q272 160 336 232 Q384 288 320 328"/>`],
  ["letter-gesture", "essential-l", `<rect fill="currentColor" x="120" y="64" width="112" height="384"/><rect fill="currentColor" x="120" y="336" width="304" height="112"/>`],
];

if (drafts.length !== 50) {
  throw new Error(`Expected 50 drafts, received ${drafts.length}`);
}

const escapeXml = (value) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const pad = (value) => String(value).padStart(2, "0");

const standaloneSvg = (number, family, name, body) => `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-labelledby="title desc">
  <title id="title">Lotion logo draft ${pad(number)}: ${escapeXml(name)}</title>
  <desc id="desc">Black and white logo exploration in the ${escapeXml(family)} family.</desc>
  ${body}
</svg>
`;

drafts.forEach(([family, name, body], index) => {
  const number = index + 1;
  fs.writeFileSync(
    path.join(outputDir, `draft-${pad(number)}-${name}.svg`),
    standaloneSvg(number, family, name, body),
  );
});

const sheetSvg = ({ background, foreground, small = false }) => {
  const columns = 10;
  const rows = 5;
  const cellWidth = small ? 100 : 180;
  const cellHeight = small ? 100 : 190;
  const width = columns * cellWidth;
  const height = rows * cellHeight;
  const scale = small ? 0.0625 : 0.234375;
  const markSize = 512 * scale;

  const cells = drafts.map(([family, name, body], index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * cellWidth + (cellWidth - markSize) / 2;
    const y = row * cellHeight + (small ? 20 : 24);
    const labelY = row * cellHeight + cellHeight - (small ? 10 : 18);
    return `<g color="${foreground}">
      <g transform="translate(${x} ${y}) scale(${scale})">${body}</g>
      <text x="${column * cellWidth + cellWidth / 2}" y="${labelY}" text-anchor="middle" fill="${foreground}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="${small ? 11 : 16}">${pad(index + 1)}</text>
    </g>`;
  }).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <rect width="${width}" height="${height}" fill="${background}"/>
  ${cells}
</svg>
`;
};

fs.writeFileSync(path.join(outputDir, "contact-sheet-light.svg"), sheetSvg({ background: "#f7f7f4", foreground: "#20221f" }));
fs.writeFileSync(path.join(outputDir, "contact-sheet-dark.svg"), sheetSvg({ background: "#20221f", foreground: "#f7f7f4" }));
fs.writeFileSync(path.join(outputDir, "contact-sheet-32px.svg"), sheetSvg({ background: "#f7f7f4", foreground: "#20221f", small: true }));

const familyLabels = [
  ["01-10", "Folded planes", "Two- and three-plane L marks with folds and directional tension."],
  ["11-20", "Page and negative space", "Pages, cutouts, tabs, and document structures."],
  ["21-30", "Linked forms", "Connected modules, loops, hinges, and interlocking blocks."],
  ["31-40", "Layers and history", "Stacks, offsets, timelines, and visible revision depth."],
  ["41-50", "Letter and gesture", "Custom L letterforms, brush movement, and typographic reduction."],
];

const readme = `# Lotion Logo Exploration: 50 Drafts

All marks are monochrome SVGs using \`currentColor\`. Each draft is tested in the generated light, dark, and 32px contact sheets.

| Range | Family | Intent |
| --- | --- | --- |
${familyLabels.map(([range, family, intent]) => `| ${range} | ${family} | ${intent} |`).join("\n")}

## Files

${drafts.map(([family, name], index) => `- \`${pad(index + 1)}\` \`draft-${pad(index + 1)}-${name}.svg\` — ${family}`).join("\n")}
`;

fs.writeFileSync(path.join(outputDir, "README.md"), readme);
