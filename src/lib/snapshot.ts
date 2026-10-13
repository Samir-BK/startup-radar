import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Snapshot } from "./types";

export function snapshotPath(): string {
  return path.join(process.cwd(), "data", "snapshot.json");
}

export function emptySnapshot(): Snapshot {
  return {
    version: 1,
    generatedAt: null,
    directoryCount: 0,
    complete: false,
    companies: [],
    jobs: [],
  };
}

export async function readSnapshot(): Promise<Snapshot> {
  try {
    const raw = await readFile(snapshotPath(), "utf8");
    const data = JSON.parse(raw) as Snapshot;
    if (data.version !== 1 || !Array.isArray(data.companies) || !Array.isArray(data.jobs)) {
      return emptySnapshot();
    }
    return data;
  } catch {
    return emptySnapshot();
  }
}

let saveTail: Promise<void> = Promise.resolve();

export function writeSnapshot(snapshot: Snapshot): Promise<void> {
  const body = JSON.stringify(snapshot);
  const job = saveTail.then(() => writeSnapshotBody(body));
  saveTail = job.then(
    () => undefined,
    () => undefined,
  );
  return job;
}

async function writeSnapshotBody(body: string): Promise<void> {
  const destination = snapshotPath();
  const temporary = `${destination}.tmp`;
  await writeFile(temporary, body);
  await rename(temporary, destination);
}
