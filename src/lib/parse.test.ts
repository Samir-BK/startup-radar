import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBoard } from "./boards";
import {
  boardSiteVerdict,
  careerLinks,
  detectBoard,
  namesMatch,
  parseCompanyPage,
  parseDirectory,
  parseRobotsDisallow,
  pathAllowed,
  siteLabel,
} from "./parse";
import type { BoardRef } from "./types";

const DIRECTORY = `
<ul>
  <li><a href="/company/aani">Aani</a></li>
  <li><a href="/company/cactos">Cactos</a></li>
</ul>`;

const PROFILE = `
<div class="col-lg-8">
<h1>Cactos</h1>
</div>
<div id="company-data">
  <p>
    Founded: <span class="bold">2021</span>
    Category: <span class="bold">Energy &amp; Power</span>
    City: <span class="bold">Helsinki</span>
  </p>
  <div > Batteries for Finnish buildings. Open roles: https://jobs.ashbyhq.com/cactos </div>
  <p class="website"><a href="https://www.cactos.fi/" rel="nofollow">https://www.cactos.fi/</a></p>
</div>
<footer id="colophon"></footer>`;

describe("directory and profile parsing", () => {
  it("reads company links from a letter page", () => {
    assert.deepEqual(parseDirectory(DIRECTORY), [
      { slug: "aani", name: "Aani" },
      { slug: "cactos", name: "Cactos" },
    ]);
  });

  it("reads the public profile fields", () => {
    const company = parseCompanyPage(PROFILE, { slug: "cactos", name: "Cactos" });
    assert.equal(company.name, "Cactos");
    assert.equal(company.city, "Helsinki");
    assert.equal(company.category, "Energy & Power");
    assert.equal(company.founded, "2021");
    assert.equal(company.website, "https://www.cactos.fi/");
    assert.match(company.blurb ?? "", /Batteries/);
  });
});

describe("hiring boards", () => {
  it("recognizes public board links", () => {
    assert.equal(detectBoard("https://boards.greenhouse.io/wolt")?.source, "greenhouse");
    assert.equal(
      detectBoard("https://boards.greenhouse.io/embed/job_board?for=wolt")?.token,
      "wolt",
    );
    assert.equal(detectBoard("https://jobs.lever.co/betterdoctor")?.source, "lever");
    assert.equal(detectBoard("https://jobs.ashbyhq.com/hoxhunt")?.token, "hoxhunt");
    assert.equal(detectBoard("https://apply.workable.com/varjo")?.source, "workable");
    assert.equal(detectBoard("https://upcloud.teamtailor.com/jobs/12")?.token, "upcloud");
    assert.equal(detectBoard("https://workable.com/assets"), null);
    assert.equal(detectBoard("https://images.teamtailor-cdn.com/logo.png"), null);
  });

  it("keeps career links and skips social profiles", () => {
    const html = `
      <a href="/about/careers">Careers</a>
      <a href="https://www.linkedin.com/company/cactos">LinkedIn</a>
      <a href="https://jobs.ashbyhq.com/cactos">Board</a>
    `;
    const links = careerLinks(html, "https://cactos.com/fi");
    assert.ok(links.includes("https://cactos.com/about/careers"));
    assert.ok(links.some((link) => link.includes("ashbyhq.com/cactos")));
    assert.equal(links.some((link) => link.includes("linkedin")), false);
  });

  it("reads a Greenhouse job list", () => {
    const ref: BoardRef = {
      source: "greenhouse",
      token: "wolt",
      jobsUrl: "https://boards-api.greenhouse.io/v1/boards/wolt/jobs",
      pageUrl: "https://job-boards.greenhouse.io/wolt",
    };
    const parsed = parseBoard(
      "greenhouse",
      JSON.stringify({
        jobs: [
          {
            id: 1,
            title: "Courier partner",
            absolute_url: "https://job-boards.greenhouse.io/wolt/jobs/1",
            location: { name: "Helsinki" },
            first_published: "2026-09-01T10:00:00.000Z",
            company_name: "Wolt",
          },
        ],
      }),
      ref,
    );
    assert.equal(parsed.recognized, true);
    assert.equal(parsed.boardName, "Wolt");
    assert.equal(parsed.jobs[0]?.title, "Courier partner");
    assert.equal(parsed.jobs[0]?.location, "Helsinki");
    assert.equal(parsed.jobs[0]?.postedAt, "2026-09-01T10:00:00.000Z");
  });

  it("reads a Teamtailor feed", () => {
    const ref: BoardRef = {
      source: "teamtailor",
      token: "upcloud",
      jobsUrl: "https://upcloud.teamtailor.com/jobs.json",
      pageUrl: "https://upcloud.teamtailor.com/jobs",
    };
    const parsed = parseBoard(
      "teamtailor",
      JSON.stringify({
        version: "https://jsonfeed.org/version/1.1",
        title: "UpCloud",
        items: [
          {
            id: "abc",
            title: "Support engineer",
            url: "https://upcloud.teamtailor.com/jobs/1",
            date_published: "2026-09-04T14:50:13+03:00",
            _jobposting: {
              jobLocation: [
                { address: { addressLocality: "Helsinki", addressRegion: "Finland" } },
              ],
            },
          },
        ],
      }),
      ref,
    );
    assert.equal(parsed.boardName, "UpCloud");
    assert.equal(parsed.jobs[0]?.location, "Helsinki, Finland");
    assert.ok(parsed.jobs[0]?.postedAt?.startsWith("2026-09-04"));
  });
});

describe("safety checks", () => {
  it("matches a board title to the company", () => {
    assert.equal(namesMatch("UpCloud", "UpCloud"), true);
    assert.equal(namesMatch("Wolt", "Wolt Enterprises Oy"), true);
    assert.equal(namesMatch("Cactos", "Someone Else"), false);
  });

  it("rejects a board that belongs to a different website", () => {
    assert.equal(siteLabel("https://www.alpha-sense.com/"), "alphasense");
    assert.equal(siteLabel("https://iceye.com"), siteLabel("http://iceye.fi/"));
    assert.equal(
      boardSiteVerdict("https://www.thecampus.fi/", ["campus.edu"]),
      "mismatch",
    );
    assert.equal(
      boardSiteVerdict("https://hoxhunt.com", ["hoxhunt.com"]),
      "match",
    );
    assert.equal(
      boardSiteVerdict("https://ouman.fi/", ["careers.oumangroup.com"]),
      "match",
    );
    assert.equal(
      boardSiteVerdict("http://www.vilant.com", ["turck-vilant.jobs.personio.com"]),
      "match",
    );
    assert.equal(siteLabel("https://turck-vilant.jobs.personio.com/job/1"), "turckvilant");
    assert.equal(boardSiteVerdict("https://www.alpha-sense.com/", []), "unknown");
  });

  it("honors a site-wide robots disallow", () => {
    const rules = parseRobotsDisallow("User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nDisallow:");
    assert.equal(pathAllowed(rules, "https://example.com/careers"), false);
    const open = parseRobotsDisallow("User-agent: *\nDisallow: /admin\nAllow: /");
    assert.equal(pathAllowed(open, "https://example.com/careers"), true);
    assert.equal(pathAllowed(open, "https://example.com/admin/secret"), false);
  });
});
