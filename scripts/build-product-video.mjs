#!/usr/bin/env node
import { mkdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = join(root, "marketing", "video");
const workDir = join(outputDir, ".build");
const outputFile = join(outputDir, "lotion-vs-notion-core-workflows.mp4");
const posterFile = join(outputDir, "lotion-vs-notion-poster.png");

const colors = {
  accent: "#6f86c3",
  canvas: "#f7f7f4",
  dark: "#181916",
  green: "#79c79b",
  muted: "#aeb4aa",
  paper: "#ffffff",
};

const scenes = [
  { id: "01-title", duration: 5 },
  { id: "02-pages", duration: 8 },
  { id: "03-databases", duration: 9 },
  { id: "04-navigation", duration: 9 },
  { id: "05-migration", duration: 8 },
  { id: "06-tradeoffs", duration: 8 },
  { id: "07-end", duration: 6 },
];

rmSync(workDir, { force: true, recursive: true });
mkdirSync(workDir, { recursive: true });
mkdirSync(outputDir, { recursive: true });

const logoBlack = join(workDir, "logo-black.png");
const logoWhite = join(workDir, "logo-white.png");
run("sips", ["-s", "format", "png", "-Z", "512", join(root, "design", "lotion-logo.svg"), "--out", logoBlack]);
run("magick", [logoBlack, "-channel", "RGB", "-negate", logoWhite]);

makeTitleScene(join(workDir, "01-title.png"), logoWhite);
makeComparisonScene({
  output: join(workDir, "02-pages.png"),
  screenshot: join(root, "website", "assets", "lotion-editor.png"),
  title: "01  Pages and blocks",
  notion: "Blocks / slash menu / toggles / callouts\nDrag and drop",
  lotion: "Core block workflow / Markdown source\nRaw source remains editable",
});
makeComparisonScene({
  output: join(workDir, "03-databases.png"),
  screenshot: join(root, "website", "assets", "lotion-database.png"),
  title: "02  Databases and views",
  notion: "Rich properties / filters / formulas\nMore views, including timeline and charts",
  lotion: "Table / board / calendar / list / gallery\nFormula / relation / rollup / CSV source",
});
makeComparisonScene({
  output: join(workDir, "04-navigation.png"),
  screenshot: join(root, "website", "assets", "lotion-home.png"),
  title: "03  Search and connected pages",
  notion: "Workspace search / links / backlinks\nNested pages",
  lotion: "Global search / links / backlinks\nTabs / page history / local index",
});
makeComparisonScene({
  output: join(workDir, "05-migration.png"),
  screenshot: join(root, "website", "assets", "lotion-home.png"),
  title: "04  Moving a workspace",
  notion: "Export pages and databases as HTML / CSV",
  lotion: "Import nested pages / databases / attachments\nAudit ambiguous conversions",
});
makeTradeoffScene(join(workDir, "06-tradeoffs.png"));
makeEndScene(join(workDir, "07-end.png"), logoWhite);

for (const scene of scenes) {
  run("ffmpeg", [
    "-y",
    "-loop", "1",
    "-framerate", "25",
    "-i", join(workDir, `${scene.id}.png`),
    "-vf", "format=yuv420p",
    "-t", String(scene.duration),
    "-r", "25",
    "-an",
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "18",
    join(workDir, `${scene.id}.mp4`),
  ]);
}

const transition = 0.7;
const offsets = [];
let timeline = scenes[0].duration - transition;
for (let index = 1; index < scenes.length; index += 1) {
  offsets.push(timeline);
  timeline += scenes[index].duration - transition;
}

const filter = [
  `[0:v][1:v]xfade=transition=fade:duration=${transition}:offset=${offsets[0]}[v1]`,
  `[v1][2:v]xfade=transition=fade:duration=${transition}:offset=${offsets[1]}[v2]`,
  `[v2][3:v]xfade=transition=fade:duration=${transition}:offset=${offsets[2]}[v3]`,
  `[v3][4:v]xfade=transition=fade:duration=${transition}:offset=${offsets[3]}[v4]`,
  `[v4][5:v]xfade=transition=fade:duration=${transition}:offset=${offsets[4]}[v5]`,
  `[v5][6:v]xfade=transition=fade:duration=${transition}:offset=${offsets[5]},format=yuv420p[outv]`,
].join(";");

const inputArgs = scenes.flatMap((scene) => ["-i", join(workDir, `${scene.id}.mp4`)]);
run("ffmpeg", [
  "-y",
  ...inputArgs,
  "-filter_complex", filter,
  "-map", "[outv]",
  "-an",
  "-c:v", "libx264",
  "-preset", "slow",
  "-crf", "19",
  "-movflags", "+faststart",
  outputFile,
]);

run("magick", [join(workDir, "01-title.png"), "-resize", "1200x675", posterFile]);

console.log(JSON.stringify({ outputFile, posterFile }, null, 2));

function makeTitleScene(output, logo) {
  run("magick", [
    "-size", "1920x1080", `canvas:${colors.dark}`,
    "(", logo, "-resize", "190x190", ")", "-gravity", "north", "-geometry", "+0+176", "-composite",
    "-fill", colors.paper, "-font", "Arial-Bold", "-pointsize", "88", "-gravity", "north", "-annotate", "+0+420", "Lotion vs Notion",
    "-fill", colors.green, "-font", "Arial-Bold", "-pointsize", "31", "-annotate", "+0+548", "A CORE WORKFLOW COMPARISON",
    "-fill", colors.muted, "-font", "Arial", "-pointsize", "28", "-annotate", "+0+626", "Pages / databases / search / migration / ownership",
    output,
  ]);
}

function makeComparisonScene({ output, screenshot, title, notion, lotion }) {
  const top = join(workDir, `${basenameWithoutExtension(output)}-top.png`);
  run("magick", [
    screenshot,
    "-resize", "1920x1200^",
    "-gravity", "north",
    "-crop", "1920x760+0+0",
    "+repage",
    top,
  ]);
  run("magick", [
    "-size", "1920x1080", `canvas:${colors.dark}`,
    top, "-gravity", "north", "-composite",
    "-fill", colors.dark, "-draw", "rectangle 0,760 1920,1080",
    "-fill", colors.paper, "-font", "Arial-Bold", "-pointsize", "45", "-gravity", "northwest", "-annotate", "+72+810", title,
    "-stroke", "#3b3d38", "-strokewidth", "2", "-draw", "line 960,855 960,1032",
    "-fill", colors.muted, "-stroke", "none", "-font", "Arial-Bold", "-pointsize", "22", "-annotate", "+72+884", "NOTION",
    "-fill", colors.paper, "-font", "Arial", "-pointsize", "28", "-interline-spacing", "10", "-annotate", "+72+930", notion,
    "-fill", colors.green, "-font", "Arial-Bold", "-pointsize", "22", "-annotate", "+1016+884", "LOTION",
    "-fill", colors.paper, "-font", "Arial", "-pointsize", "28", "-interline-spacing", "10", "-annotate", "+1016+930", lotion,
    output,
  ]);
}

function makeTradeoffScene(output) {
  run("magick", [
    "-size", "1920x1080", `canvas:${colors.canvas}`,
    "-fill", colors.dark, "-font", "Arial-Bold", "-pointsize", "66", "-gravity", "northwest", "-annotate", "+92+104", "The core overlaps. The tradeoffs do not.",
    "-stroke", "#d9ddd5", "-strokewidth", "2", "-draw", "line 960,250 960,830",
    "-fill", "#6c7169", "-stroke", "none", "-font", "Arial-Bold", "-pointsize", "25", "-annotate", "+96+292", "NOTION IS AHEAD IN",
    "-fill", colors.dark, "-font", "Arial", "-pointsize", "37", "-interline-spacing", "20", "-annotate", "+96+370", "Real-time collaboration\nComments and suggestions\nAI and connected apps\nBroader database views\nMature mobile apps",
    "-fill", "#356b50", "-font", "Arial-Bold", "-pointsize", "25", "-annotate", "+1032+292", "LOTION IS DIFFERENT BY DESIGN",
    "-fill", colors.dark, "-font", "Arial", "-pointsize", "37", "-interline-spacing", "20", "-annotate", "+1032+370", "Markdown and CSV source of truth\nLocal attachments\nGit history\nOpen source\nNo account required",
    "-fill", "#777d72", "-font", "Arial", "-pointsize", "23", "-annotate", "+96+980", "Core workflow coverage is not full feature parity. Comparison baseline: official Notion help docs, July 2026.",
    output,
  ]);
}

function makeEndScene(output, logo) {
  run("magick", [
    "-size", "1920x1080", `canvas:${colors.dark}`,
    "(", logo, "-resize", "164x164", ")", "-gravity", "north", "-geometry", "+0+178", "-composite",
    "-fill", colors.paper, "-font", "Arial-Bold", "-pointsize", "72", "-gravity", "north", "-annotate", "+0+404", "The core workspace experience.",
    "-fill", colors.green, "-font", "Arial-Bold", "-pointsize", "72", "-annotate", "+0+500", "On files you own.",
    "-fill", colors.muted, "-font", "Arial", "-pointsize", "29", "-annotate", "+0+650", "Markdown pages / CSV databases / local attachments / Git history",
    "-fill", colors.paper, "-font", "Arial-Bold", "-pointsize", "31", "-annotate", "+0+784", "github.com/hu-xianglong/lotion",
    output,
  ]);
}

function basenameWithoutExtension(file) {
  return file.split("/").at(-1).replace(/\.[^.]+$/, "");
}

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status})\n${result.stdout}\n${result.stderr}`);
  }
}
