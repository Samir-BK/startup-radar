import { SOURCE_LABEL } from "@/lib/parse";

export function Guide() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 text-[15px] leading-relaxed">
      <section className="rounded-2xl bg-card p-6 ring-1 ring-foreground/10">
        <p className="font-heading text-2xl text-foreground">Yes — with limits.</p>
        <p className="mt-3 text-muted-foreground">
          You can collect the company list, and you can collect many of the jobs.
          Startup100 does not publish one job feed. Each company posts roles on its
          own site, or on a hiring system such as Teamtailor or Greenhouse. This
          app reads the public pages and the public job feeds, then puts the rows
          in one list.
        </p>
      </section>

      <section>
        <h2 className="font-heading text-xl">What works, and what does not</h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-muted-foreground">
          <li>
            The company directory is ordinary HTML, split by letter. There is no
            login. A program can read the name, city, category, and website.
          </li>
          <li>
            Job posts are reliable when the company uses a hiring system with a
            public feed. The feed includes the title, location, link, and often
            the date.
          </li>
          <li>
            Some career pages are drawn only in the browser, or the jobs live on
            LinkedIn. This app does not read those. You still get the careers link
            when one was found, so you can open it yourself.
          </li>
          <li>
            Companies marked deceased are listed, and their sites are not scanned.
            Acquired companies (Startup100 says “exited”) are still scanned,
            because many of them still hire. Pass{" "}
            <code className="text-foreground">--include-closed</code> to scan
            deceased companies too.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="font-heading text-xl">Step by step</h2>
        <ol className="mt-3 flex list-decimal flex-col gap-3 pl-5 text-muted-foreground">
          <li>
            Read the public letter pages on Startup100, from 0–9 through Ä. That
            is the company list: about 2,200 names and profile links.
          </li>
          <li>
            Open each company profile. Save the website, city, category, and a
            short description. Leave out email addresses.
          </li>
          <li>
            On the company website, look for a careers link. Also notice if the
            page points at Greenhouse, Lever, Ashby, Workable, Teamtailor,
            Recruitee, Personio, or SmartRecruiters.
          </li>
          <li>
            When a hiring system is found, read its public job feed. Those feeds
            are meant to be embedded on career sites. A guessed address is kept
            only when the board name matches the company, and it is dropped if
            that board’s own site points at a different company.
          </li>
          <li>
            Save one row per role: company, job title, location, link, date
            posted, and which system it came from.
          </li>
          <li>
            Show the rows here. Use search, the Finland filter, and Download CSV
            for a spreadsheet.
          </li>
          <li>
            Run the same command on a schedule. New posts appear, and roles that
            were taken down drop out, because each run replaces that company&apos;s
            old rows.
          </li>
        </ol>
      </section>

      <section>
        <h2 className="font-heading text-xl">Tools</h2>
        <p className="mt-3 text-muted-foreground">
          This project is a small Next.js site plus one Node script. Node is free.
          The script uses the built-in <code className="text-foreground">fetch</code>{" "}
          call, not a paid scraping service. Playwright (a real browser) is the
          usual next step for pages that only render jobs in JavaScript, but it is
          slower and heavier, so it is not included. n8n or Make can send a CSV to
          Google Sheets later. They are a poor fit for two thousand different
          websites.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-xl bg-[#1c241f] p-4 text-[13px] leading-6 text-[#f4f0e6]">
          <code>{`const response = await fetch(
  "https://boards-api.greenhouse.io/v1/boards/wolt/jobs"
);
const data = await response.json();

for (const job of data.jobs) {
  console.log(job.title, job.location?.name, job.absolute_url);
}`}</code>
        </pre>
        <p className="mt-3 text-muted-foreground">
          That is the same Greenhouse feed this app reads when a company uses
          Greenhouse. Run the full collector with{" "}
          <code className="text-foreground">npm run sync</code>.
        </p>
      </section>

      <section>
        <h2 className="font-heading text-xl">Where the jobs come from</h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-muted-foreground">
          {Object.entries(SOURCE_LABEL).map(([key, label]) => (
            <li key={key}>
              <span className="text-foreground">{label}</span>
              {key === "teamtailor"
                ? " — very common in Finland. The public feed is jobs.json on the career site."
                : key === "greenhouse"
                  ? " — public board API, for example Wolt."
                  : key === "ashby"
                    ? " — public posting API, for example Supercell."
                    : "."}
            </li>
          ))}
          <li>
            The company&apos;s own careers page, when it links to one of those
            systems. LinkedIn is skipped on purpose.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="font-heading text-xl">How it stays up to date</h2>
        <p className="mt-3 text-muted-foreground">
          The dashboard reads a saved file, <code className="text-foreground">data/snapshot.json</code>.
          It does not scrape on every page view. That would hammer a small
          non-profit directory. Refresh the file with{" "}
          <code className="text-foreground">npm run sync</code>. A partial run can
          continue later: companies that were already checked are skipped unless
          you pass <code className="text-foreground">--refresh</code>.
        </p>
        <p className="mt-3 text-muted-foreground">
          To run it every Monday for free, use the GitHub Action in{" "}
          <code className="text-foreground">.github/workflows/sync.yml</code>. It
          needs permission to commit the new snapshot back to the repository.
          After that, redeploy the site if you want the published dashboard to
          pick up the new file.
        </p>
      </section>

      <section>
        <h2 className="font-heading text-xl">Legal and practical limits</h2>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-muted-foreground">
          <li>
            Startup100 publishes no robots.txt. Its terms page is a privacy
            policy about data startups send them. It does not grant a license to
            copy the whole directory and resell it. This app links back to each
            profile and keeps descriptions short.
          </li>
          <li>
            Before reading a company website, the script checks robots.txt. If the
            site asks all bots to stay out, the homepage is skipped.
          </li>
          <li>
            Requests are slow, named, and cached in the snapshot. Startup100 is
            limited to a few requests per second. Hiring-system APIs are paced
            too.
          </li>
          <li>
            Only public job ads are stored: title, location, link, date, and
            department. Application forms, accounts, and personal email addresses
            are out of scope.
          </li>
          <li>
            Job ads are published so people can find them. Republishing the full
            text, or ignoring a site that says no, is a different and worse idea.
          </li>
        </ul>
      </section>
    </div>
  );
}
