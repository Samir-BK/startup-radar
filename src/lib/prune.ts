import { fetchText } from "./http";
import { boardSiteVerdict, cleanUrl, companyHostsInHtml, detectBoard } from "./parse";
import { readSnapshot, writeSnapshot } from "./snapshot";

export async function pruneMismatchedBoards(): Promise<number> {
  const snapshot = await readSnapshot();
  let removed = 0;
  for (const company of snapshot.companies) {
    if (company.careersUrl) company.careersUrl = cleanUrl(company.careersUrl);
    if (!company.jobSource || !company.careersUrl) continue;
    const board = detectBoard(company.careersUrl);
    const pageUrl = board?.pageUrl ?? company.careersUrl;
    const response = await fetchText(pageUrl, { timeout: 8000, maxBytes: 180_000 });
    if (!response || response.status !== 200) continue;
    const verdict = boardSiteVerdict(company.website, companyHostsInHtml(response.text));
    if (verdict !== "mismatch") continue;
    const before = snapshot.jobs.length;
    snapshot.jobs = snapshot.jobs.filter((job) => job.companySlug !== company.slug);
    removed += before - snapshot.jobs.length;
    company.jobSource = null;
    company.scanStatus = "no-board";
    company.careersUrl = null;
    company.detail =
      "A hiring board with a similar name belongs to a different website, so those roles were left out.";
    console.log(`Left out ${company.name}: the board belongs to a different website`);
  }
  for (const job of snapshot.jobs) job.url = cleanUrl(job.url);
  await writeSnapshot(snapshot);
  return removed;
}
