"""Browser crawler. Starts at each seed site, follows links on the same site, renders every page in a real
browser (Playwright) so pages built with JavaScript have text, and saves each page's text to disk.

It does not read pages for opportunities. That is the Extractor's job: today a person or this Claude session
reads the saved pages; later the Claude API does. The crawler only decides which pages look worth reading.

It honors robots.txt, waits between requests, and gives up on a site that answers with a block page
(Access Denied, a Cloudflare challenge, 403). It does not try to get past a block.

Usage: python -m backfill.crawler [--seeds backfill/seeds.json] [--out data/pages] [--workers 4]
                                  [--max-pages 25] [--depth 2] [--budget 90]
"""
import argparse
import concurrent.futures as cf
import hashlib
import json
import os
import re
import time
import urllib.parse
import urllib.request
import urllib.robotparser
from collections import deque
from datetime import datetime, timezone

USER_AGENT = "creative-opportunities-finder-class-project"
BLOCK_MARKERS = ("access denied", "just a moment", "attention required", "verify you are human",
                 "403 forbidden", "request blocked", "enable javascript and cookies")
SKIP_LINK = re.compile(
    r"\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|mp3|mp4|css|js|ico|docx?|xlsx?)(\?|$)"
    r"|/(login|logout|cart|checkout|account|wp-admin|feed|tag|author|cdn-cgi)\b"
    r"|[?&](replytocom|share|print|add-to-cart)=", re.I)
SIGNAL = re.compile(
    r"deadline|due (?:by|on|date)|applications? (?:are |is )?(?:due|open|close|accepted)|apply (?:now|by|here)"
    r"|submit(?:ting)? (?:your|an?) |open call|call for (?:artists|entries|proposals|submissions|applications)"
    r"|eligib|rolling (?:basis|review)|accepting (?:applications|submissions)|auditions?\b|open mic", re.I)
DATE = re.compile(
    r"\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.? \d{1,2}(?:,? 20\d\d)?\b|\b\d{1,2}/\d{1,2}/(?:20)?\d\d\b", re.I)


def is_blocked(status, text):
    """True when the response is a block page rather than the site's own content."""
    if status in (401, 403, 429):
        return True
    head = (text or "")[:500].lower()
    return len(text or "") < 1500 and any(marker in head for marker in BLOCK_MARKERS)


def score_text(text):
    """(signal phrases, dates) found in a page's text; a page with neither is rarely worth reading."""
    return len(SIGNAL.findall(text)), len(DATE.findall(text))


def should_follow(url, host):
    parts = urllib.parse.urlparse(url)
    return (parts.scheme in ("http", "https") and parts.netloc.replace("www.", "") == host
            and not SKIP_LINK.search(url))


def load_robots(base):
    rules = urllib.robotparser.RobotFileParser()
    try:
        req = urllib.request.Request(urllib.parse.urljoin(base, "/robots.txt"), headers={"User-Agent": "Mozilla/5.0"})
        rules.parse(urllib.request.urlopen(req, timeout=10).read().decode("utf-8", "replace").splitlines())
    except Exception:  # an unreadable robots.txt means no rules, not "everything is forbidden"
        rules.parse([])
    return rules


def page_id(url):
    return hashlib.sha1(url.encode()).hexdigest()[:12]


def crawl_site(seed, max_pages=25, depth=2, budget=90, delay=0.7, headless=True):
    """Crawl one seed. Returns {'seed', 'pages': [...], 'blocked': bool, 'reason'}."""
    from playwright.sync_api import sync_playwright  # imported here so the pure functions need no browser

    start = seed["url"]
    follow = re.compile(seed["follow"]) if seed.get("follow") else None  # optional: only follow links matching this
    host = urllib.parse.urlparse(start).netloc.replace("www.", "")
    robots = load_robots(start)
    pages, seen, queue = [], {start: 0}, deque([start])
    t0, blocked = time.time(), False
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        ctx = browser.new_context(user_agent=None)
        page = ctx.new_page()
        while queue and len(pages) < max_pages and time.time() - t0 < budget:
            url = queue.popleft()
            if not robots.can_fetch("*", url):
                continue
            try:
                resp = page.goto(url, timeout=20000, wait_until="domcontentloaded")
                try:
                    page.wait_for_load_state("networkidle", timeout=4000)
                except Exception:
                    pass
                text = page.inner_text("body")
                status = resp.status if resp else 0
                title = page.title()
                links = page.eval_on_selector_all("a[href]", "els => els.map(e => e.href)")
            except Exception:
                continue
            if is_blocked(status, text):
                if not pages:
                    blocked = True
                    break
                continue
            signals, dates = score_text(text)
            pages.append({"url": page.url, "title": title.strip(), "status": status, "depth": seen.get(url, 0),
                          "signals": signals, "dates": dates, "text": text,
                          "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds")})
            if seen[url] < depth:
                for link in links:
                    link = link.split("#")[0]
                    if link not in seen and should_follow(link, host) and (follow is None or follow.search(link)):
                        seen[link] = seen[url] + 1
                        queue.append(link)
            time.sleep(delay)
        browser.close()
    return {"seed": seed, "pages": pages, "blocked": blocked}


def save_site(result, out_dir):
    host = urllib.parse.urlparse(result["seed"]["url"]).netloc.replace("www.", "")
    folder = os.path.join(out_dir, host)
    os.makedirs(folder, exist_ok=True)
    for old in os.listdir(folder):  # a fresh crawl replaces the old one
        os.remove(os.path.join(folder, old))
    index = []
    for pg in result["pages"]:
        with open(os.path.join(folder, page_id(pg["url"]) + ".json"), "w", encoding="utf-8") as f:
            json.dump(pg, f, ensure_ascii=False)
        index.append({k: pg[k] for k in ("url", "title", "depth", "signals", "dates")} | {"id": page_id(pg["url"])})
    with open(os.path.join(folder, "_index.json"), "w", encoding="utf-8") as f:
        json.dump({"seed": result["seed"], "blocked": result["blocked"], "pages": index}, f, ensure_ascii=False, indent=1)
    return folder


def run_one(args):
    seed, opts, out_dir = args
    try:
        result = crawl_site(seed, **opts)
    except Exception as e:  # one broken site must not stop the rest
        result = {"seed": seed, "pages": [], "blocked": False, "error": str(e)[:120]}
    save_site(result, out_dir)
    return seed["name"], len(result["pages"]), result["blocked"], result.get("error", "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seeds", default="backfill/seeds.json")
    ap.add_argument("--out", default="data/pages")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--max-pages", type=int, default=25)
    ap.add_argument("--depth", type=int, default=2)
    ap.add_argument("--budget", type=int, default=90)
    ap.add_argument("--only", help="comma-separated seed names to crawl")
    args = ap.parse_args()
    with open(args.seeds, encoding="utf-8") as f:
        seeds = json.load(f)
    if args.only:
        wanted = {n.strip().lower() for n in args.only.split(",")}
        seeds = [s for s in seeds if s["name"].lower() in wanted]
    opts = {"max_pages": args.max_pages, "depth": args.depth, "budget": args.budget}
    with cf.ProcessPoolExecutor(args.workers) as ex:
        for name, count, blocked, error in ex.map(run_one, [(s, opts, args.out) for s in seeds]):
            note = "BLOCKED" if blocked else error
            print(f"{name}: {count} pages {note}", flush=True)


if __name__ == "__main__":
    main()
