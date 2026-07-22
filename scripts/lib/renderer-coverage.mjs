import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import istanbulCoverage from "istanbul-lib-coverage";
import v8ToIstanbul from "v8-to-istanbul";

const { createCoverageMap } = istanbulCoverage;
const RENDERER_SOURCE_PATHS = ["/src/renderer/", "/src/builtin-plugins/"];

export async function startRendererCoverage(page) {
  const session = await page.context().newCDPSession(page);
  await session.send("Debugger.enable");
  await session.send("Profiler.enable");
  await session.send("Profiler.startPreciseCoverage", {
    callCount: true,
    detailed: true
  });

  return {
    async writeTo(path) {
      const coverageMap = await collectRendererCoverage(session);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, `${JSON.stringify(coverageMap.toJSON())}\n`, "utf8");
      return coverageMap.getCoverageSummary();
    }
  };
}

async function collectRendererCoverage(session) {
  const { result } = await session.send("Profiler.takePreciseCoverage");
  const coverageMap = createCoverageMap({});
  try {
    for (const entry of result.filter(isRendererScript)) {
      const { scriptSource } = await session.send("Debugger.getScriptSource", {
        scriptId: entry.scriptId
      });
      const converter = v8ToIstanbul(new URL(entry.url).pathname, 0, {
        source: scriptSource
      });
      await converter.load();
      converter.applyCoverage(entry.functions);
      for (const fileCoverage of Object.values(converter.toIstanbul())) {
        const path = fileCoverage.path.startsWith("/src/")
          ? join(process.cwd(), fileCoverage.path)
          : fileCoverage.path;
        coverageMap.addFileCoverage({ ...fileCoverage, path });
      }
    }
  } finally {
    await session.send("Profiler.stopPreciseCoverage").catch(() => undefined);
    await session.send("Profiler.disable").catch(() => undefined);
    await session.send("Debugger.disable").catch(() => undefined);
    await session.detach().catch(() => undefined);
  }
  return coverageMap;
}

function isRendererScript(entry) {
  if (!entry.url || entry.url.endsWith(".css")) return false;
  return RENDERER_SOURCE_PATHS.some((sourcePath) => entry.url.includes(sourcePath));
}
