import { createHash } from "node:crypto";
import { constants, createReadStream } from "node:fs";
import { copyFile, lstat, mkdir, mkdtemp, readFile, readdir, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";

export async function fingerprintWorkspace(root) {
  const resolvedRoot = await validateWorkspaceRoot(root);
  const files = [];
  const directories = [];
  await walkWorkspace(resolvedRoot, "", { directories, files });
  const hash = createHash("sha256");
  let totalBytes = 0;
  for (const directory of directories.sort()) hash.update(`D\0${directory}\0`);
  for (const file of files.sort((left, right) => left.relativePath.localeCompare(right.relativePath))) {
    hash.update(`F\0${file.relativePath}\0${file.size}\0`);
    totalBytes += file.size;
    await hashFileInto(hash, file.absolutePath);
    hash.update("\0");
  }
  const workspace = JSON.parse(await readFile(join(resolvedRoot, "lotion.json"), "utf8"));
  return {
    kind: "lotion-real-workspace-fingerprint",
    workspaceName: String(workspace.name || basename(resolvedRoot)),
    fileCount: files.length,
    directoryCount: directories.length,
    totalBytes,
    sha256: hash.digest("hex")
  };
}

export async function cloneRealWorkspaceForSmoke(sourceRoot, {
  tempParent = tmpdir(),
  prefix = "lotion-real-workspace-"
} = {}) {
  const resolvedSourceRoot = await validateWorkspaceRoot(sourceRoot);
  const sourceBefore = await fingerprintWorkspace(resolvedSourceRoot);
  const tempRoot = await mkdtemp(join(tempParent, prefix));
  const cloneRoot = join(tempRoot, "workspace");
  try {
    await cloneTree(resolvedSourceRoot, cloneRoot);
    const cloneFingerprint = await fingerprintWorkspace(cloneRoot);
    assertMatchingFingerprints(sourceBefore, cloneFingerprint, "Initial real-workspace clone");
    return {
      kind: "lotion-isolated-real-workspace-clone",
      sourceIdentity: {
        workspaceName: sourceBefore.workspaceName,
        directoryName: basename(resolvedSourceRoot)
      },
      sourceRoot: resolvedSourceRoot,
      cloneRoot,
      tempRoot,
      sourceBefore,
      cloneFingerprint,
      isolation: {
        mode: "COPYFILE_FICLONE with platform fallback",
        symlinksAllowed: false,
        byteIdenticalAtClone: true
      }
    };
  } catch (error) {
    await rm(tempRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function assertRealWorkspaceSourceUnchanged(clone) {
  if (clone?.kind !== "lotion-isolated-real-workspace-clone") {
    throw new Error(`Invalid isolated real-workspace clone evidence: ${clone?.kind ?? "missing"}`);
  }
  const sourceAfter = await fingerprintWorkspace(clone.sourceRoot);
  assertMatchingFingerprints(clone.sourceBefore, sourceAfter, "Real workspace source changed during isolated smoke");
  return {
    status: "passed",
    before: clone.sourceBefore,
    after: sourceAfter,
    unchanged: true
  };
}

export async function cleanupRealWorkspaceClone(clone) {
  if (clone?.tempRoot) await rm(clone.tempRoot, { recursive: true, force: true });
}

function assertMatchingFingerprints(expected, actual, label) {
  for (const key of ["workspaceName", "fileCount", "directoryCount", "totalBytes", "sha256"]) {
    if (expected?.[key] !== actual?.[key]) {
      throw new Error(`${label}: ${key} mismatch (${JSON.stringify({ expected: expected?.[key], actual: actual?.[key] })})`);
    }
  }
}

async function validateWorkspaceRoot(root) {
  if (!root) throw new Error("Real workspace clone requires sourceRoot.");
  const resolved = await realpath(root);
  const info = await lstat(resolved);
  if (!info.isDirectory()) throw new Error(`Real workspace source is not a directory: ${resolved}`);
  const manifest = join(resolved, "lotion.json");
  const manifestInfo = await lstat(manifest).catch(() => null);
  if (!manifestInfo?.isFile()) throw new Error(`Real workspace source is missing lotion.json: ${resolved}`);
  return resolved;
}

async function walkWorkspace(root, relativeDirectory, output) {
  const absoluteDirectory = relativeDirectory ? join(root, relativeDirectory) : root;
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  if (relativeDirectory) output.directories.push(relativeDirectory.replaceAll("\\", "/"));
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = relativeDirectory ? join(relativeDirectory, entry.name) : entry.name;
    const normalizedPath = relativePath.replaceAll("\\", "/");
    const absolutePath = join(root, relativePath);
    const info = await lstat(absolutePath);
    if (info.isSymbolicLink()) throw new Error(`Real workspace clone refuses symbolic link: ${normalizedPath}`);
    if (info.isDirectory()) {
      await walkWorkspace(root, relativePath, output);
    } else if (info.isFile()) {
      output.files.push({ relativePath: normalizedPath, absolutePath, size: info.size });
    } else {
      throw new Error(`Real workspace clone refuses non-regular entry: ${normalizedPath}`);
    }
  }
}

async function cloneTree(sourceRoot, destinationRoot) {
  await mkdir(destinationRoot, { recursive: true });
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const source = join(sourceRoot, entry.name);
    const destination = join(destinationRoot, entry.name);
    const info = await lstat(source);
    if (info.isSymbolicLink()) throw new Error(`Real workspace clone refuses symbolic link: ${relative(sourceRoot, source)}`);
    if (info.isDirectory()) {
      await cloneTree(source, destination);
    } else if (info.isFile()) {
      await copyFile(source, destination, constants.COPYFILE_FICLONE);
    } else {
      throw new Error(`Real workspace clone refuses non-regular entry: ${relative(sourceRoot, source)}`);
    }
  }
}

async function hashFileInto(hash, path) {
  for await (const chunk of createReadStream(path)) hash.update(chunk);
}
