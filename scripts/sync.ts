import { mkdir } from "node:fs/promises";
import path from "node:path";
import { syncDirectory } from "../src/lib/collect";
import { pruneMismatchedBoards } from "../src/lib/prune";

const args = process.argv.slice(2);

function option(name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

const slugOption = option("--slugs");
const limitOption = option("--limit");

async function main() {
  await mkdir(path.join(process.cwd(), "data"), { recursive: true });
  await syncDirectory({
    slugs: slugOption?.split(",").map((slug) => slug.trim()).filter(Boolean),
    limit: limitOption ? Number(limitOption) : undefined,
    refresh: args.includes("--refresh"),
    includeClosed: args.includes("--include-closed"),
  });
  const removed = await pruneMismatchedBoards();
  console.log(`Removed ${removed} roles from boards that belong to a different company.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
