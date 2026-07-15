#!/usr/bin/env node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { AppConfigService } from "../dist-electron/main/services/app-config-service.js";
import { DatabaseService } from "../dist-electron/main/services/database-service.js";
import { EntitiesDatabaseService } from "../dist-electron/main/services/entities-database-service.js";
import { PageService } from "../dist-electron/main/services/page-service.js";
import { WorkspaceService } from "../dist-electron/main/services/workspace-service.js";
import { fileService } from "../dist-electron/main/services/file-service.js";
import { ENTITIES_DATABASE_ID, PAGES_DATABASE_ID } from "../dist-electron/shared/constants.js";
import { pageBodyPath } from "../dist-electron/main/services/pages-database-service.js";

const args = parseArgs(process.argv.slice(2));
const coldThresholdMs = Number(process.env.LOTION_PAGE_OPEN_COLD_THRESHOLD_MS ?? 120);
const warmThresholdMs = Number(process.env.LOTION_PAGE_OPEN_WARM_THRESHOLD_MS ?? 25);
const backlinkBuildThresholdMs = Number(process.env.LOTION_BACKLINK_BUILD_THRESHOLD_MS ?? 1000);
const backlinkWarmThresholdMs = Number(process.env.LOTION_BACKLINK_WARM_THRESHOLD_MS ?? 60);
const backlinkWarmStatThreshold = Number(process.env.LOTION_BACKLINK_WARM_STAT_THRESHOLD ?? 0);
const iterations = Number(process.env.LOTION_PAGE_OPEN_ITERATIONS ?? 8);

const root = await mkdtemp(join(tmpdir(), "lotion-page-open-bench-"));
try {
  const config = new AppConfigService(join(root, "app-config.json"));
  const workspace = new WorkspaceService(config);
  await workspace.createAt(join(root, "workspace"), { name: "Page Open Bench" });
  const pages = new PageService(workspace);
  const databases = new DatabaseService(workspace);
  await databases.get(PAGES_DATABASE_ID);
  await databases.get(ENTITIES_DATABASE_ID);
  const page = await pages.create({ title: "Large Page" });
  const markdown = buildLargeMarkdown(args.lines);
  await pages.update(page.meta.id, { markdown });
  const backlinkFixture = await createBacklinkBenchFixture({ workspace, pages, databases, sourceCount: args.backlinkSources, relationRows: args.backlinkRelations });

  const cold = [];
  for (let index = 0; index < iterations; index += 1) {
    fileService.clearCache();
    cold.push(await timePageGet(pages, page.meta.id));
  }

  const warm = [];
  await pages.get(page.meta.id);
  for (let index = 0; index < iterations; index += 1) {
    warm.push(await timePageGet(pages, page.meta.id));
  }

  const summary = {
    lines: args.lines,
    bytes: Buffer.byteLength(markdown, "utf8"),
    iterations,
    coldMedianMs: median(cold),
    warmMedianMs: median(warm),
    coldMaxMs: Math.max(...cold),
    warmMaxMs: Math.max(...warm),
    backlinks: await benchBacklinks(backlinkFixture, iterations)
  };
  console.log(JSON.stringify(summary, null, 2));

  if (args.check) {
    if (summary.coldMedianMs > coldThresholdMs) {
      throw new Error(`Cold page open median ${summary.coldMedianMs}ms exceeds ${coldThresholdMs}ms`);
    }
    if (summary.warmMedianMs > warmThresholdMs) {
      throw new Error(`Warm page open median ${summary.warmMedianMs}ms exceeds ${warmThresholdMs}ms`);
    }
    if (summary.backlinks.firstMs > backlinkBuildThresholdMs) {
      throw new Error(`Backlink graph build ${summary.backlinks.firstMs}ms exceeds ${backlinkBuildThresholdMs}ms`);
    }
    if (summary.backlinks.warmMedianMs > backlinkWarmThresholdMs) {
      throw new Error(`Backlink warm lookup median ${summary.backlinks.warmMedianMs}ms exceeds ${backlinkWarmThresholdMs}ms`);
    }
    if (summary.backlinks.warmStatCalls > backlinkWarmStatThreshold) {
      throw new Error(`Backlink warm lookups made ${summary.backlinks.warmStatCalls} file stat calls, expected <= ${backlinkWarmStatThreshold}`);
    }
  }
} finally {
  await rm(root, { recursive: true, force: true });
}

function parseArgs(argv) {
  const parsed = { check: false, lines: 20_000, backlinkSources: 120, backlinkRelations: 60 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];
    if (arg === "--check") {
      parsed.check = true;
    } else if (arg === "--lines") {
      parsed.lines = Number(value);
      index += 1;
    } else if (arg.startsWith("--lines=")) {
      parsed.lines = Number(arg.slice("--lines=".length));
    } else if (arg === "--backlink-sources") {
      parsed.backlinkSources = Number(value);
      index += 1;
    } else if (arg.startsWith("--backlink-sources=")) {
      parsed.backlinkSources = Number(arg.slice("--backlink-sources=".length));
    } else if (arg === "--backlink-relations") {
      parsed.backlinkRelations = Number(value);
      index += 1;
    } else if (arg.startsWith("--backlink-relations=")) {
      parsed.backlinkRelations = Number(arg.slice("--backlink-relations=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (!Number.isFinite(parsed.lines) || parsed.lines <= 0) {
    throw new Error(`Invalid --lines value: ${parsed.lines}`);
  }
  if (!Number.isFinite(parsed.backlinkSources) || parsed.backlinkSources < 0) {
    throw new Error(`Invalid --backlink-sources value: ${parsed.backlinkSources}`);
  }
  if (!Number.isFinite(parsed.backlinkRelations) || parsed.backlinkRelations < 0) {
    throw new Error(`Invalid --backlink-relations value: ${parsed.backlinkRelations}`);
  }
  return parsed;
}

function buildLargeMarkdown(lines) {
  const body = ["# Large Page", ""];
  for (let index = 0; index < lines; index += 1) {
    if (index % 2500 === 0) body.push(`## Section ${index / 2500 + 1}`);
    if (index % 997 === 0) {
      body.push(`![Image ${index}](attachments/images/image-${index}.png)`);
    } else if (index % 577 === 0) {
      body.push(`https://indify.co/widgets/live/countdown/example-${index}`);
    } else if (index % 389 === 0) {
      body.push("```lotion-view\n" + "database: db_rows_2k\n" + "view: view_default\n" + "```");
    } else {
      body.push(`Regular paragraph ${index} with enough content to simulate a large imported Notion page.`);
    }
  }
  return `${body.join("\n")}\n`;
}

async function timePageGet(pages, id) {
  const started = performance.now();
  await pages.get(id);
  return Number((performance.now() - started).toFixed(3));
}

async function createBacklinkBenchFixture({ workspace, pages, databases, sourceCount, relationRows }) {
  const target = await pages.create({ title: "Backlink Bench Target" });
  const light = await pages.create({ title: "Backlink Bench Light" });
  const targetBodyPath = pageBodyPath(target.meta.id, target.meta.title);
  for (let index = 0; index < sourceCount; index += 1) {
    const source = await pages.create({ title: `Backlink Bench Source ${index + 1}` });
    await pages.update(source.meta.id, {
      markdown: `# Backlink Bench Source ${index + 1}\n\nSource ${index + 1} references [Backlink Bench Target](${targetBodyPath}).\n`
    });
  }
  const relationValue = JSON.stringify([{
    entityId: target.meta.id,
    kind: "page",
    titleSnapshot: target.meta.title
  }]);
  if (relationRows > 0) {
    await databases.create({
      name: "Backlink Bench Relations",
      template: {
        fields: [{ id: "related", name: "Related", type: "entity_ref" }],
        rows: Array.from({ length: relationRows }, (_, index) => ({
          title: `Backlink relation ${index + 1}`,
          related: relationValue
        }))
      }
    });
  }
  return {
    workspace,
    targetId: target.meta.id,
    lightId: light.meta.id,
    sourceCount,
    relationRows
  };
}

async function benchBacklinks(fixture, iterations) {
  const entities = new EntitiesDatabaseService(fixture.workspace);
  fileService.clearCache();
  const firstMs = await timeBacklinks(entities, fixture.targetId);
  const targetCount = (await entities.backlinks(fixture.targetId)).length;
  const warm = [];
  const originalStat = fileService.stat.bind(fileService);
  let warmStatCalls = 0;
  fileService.stat = async (...statArgs) => {
    warmStatCalls += 1;
    return originalStat(...statArgs);
  };
  const lightWarm = [];
  try {
    for (let index = 0; index < iterations; index += 1) {
      warm.push(await timeBacklinks(entities, fixture.targetId));
    }
    for (let index = 0; index < Math.max(2, Math.floor(iterations / 2)); index += 1) {
      lightWarm.push(await timeBacklinks(entities, fixture.lightId));
    }
  } finally {
    fileService.stat = originalStat;
  }
  return {
    sourceCount: fixture.sourceCount,
    relationRows: fixture.relationRows,
    targetCount,
    firstMs,
    warmMedianMs: median(warm),
    warmMaxMs: Math.max(...warm),
    lightWarmMedianMs: median(lightWarm),
    lightWarmMaxMs: Math.max(...lightWarm),
    warmStatCalls,
    cacheStats: entities.backlinkCacheStats()
  };
}

async function timeBacklinks(entities, id) {
  const started = performance.now();
  await entities.backlinks(id);
  return Number((performance.now() - started).toFixed(3));
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return Number(((sorted[middle - 1] + sorted[middle]) / 2).toFixed(3));
}
