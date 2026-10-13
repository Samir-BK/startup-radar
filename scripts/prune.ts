import { pruneMismatchedBoards } from "../src/lib/prune";

async function main() {
  const removed = await pruneMismatchedBoards();
  console.log(`Prune done. Removed ${removed} jobs.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});