#!/usr/bin/env python3
"""Read-only, bounded evidence crawl. Does not publish or submit applications."""
import argparse
import concurrent.futures
import datetime as dt
import hashlib
import heapq
import json
import re
import threading
import time
import urllib.error
import urllib.parse as up
import urllib.request as ur
import urllib.robotparser
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

AGENTS = ('GPTBot', 'ClaudeBot', 'anthropic-ai', 'Claude-User', 'OpportunityResearch')
UA = 'OpportunityResearch/1.0 (read-only arts opportunity research; robots respected)'
BAD_HOSTS = {'queenscouncilarts.org', 'nywift.org', 'etmonline.org'}
PAID_SOURCE_FILE = Path(__file__).resolve().parents[1] / 'data/seeds/paid-display-only-sources.json'
DISPLAY_ONLY_HOSTS = set()
if PAID_SOURCE_FILE.exists():
    for paid_source in json.loads(PAID_SOURCE_FILE.read_text()).get('sources', []):
        DISPLAY_ONLY_HOSTS.update(h.lower().removeprefix('www.') for h in paid_source.get('blocked_hosts', []))
KEY = re.compile(r'open.?call|apply|application|submi[st]|guideline|prospectus|residen|fellow|grant|opportunit|commission|proposal|deadline|artist.program', re.I)
TERMS = re.compile(r'terms|conditions|legal|robots', re.I)
SKIP = re.compile(r'/wp-json/|/feed/?$|/cart|/checkout|/donate|/login|/sign.?in|/register|/ticket|/shop|/product/|/tag/|/author/|/search|/calendar', re.I)
EVIDENCE = re.compile(r'deadline|applications? (?:open|close|due)|apply by|eligib|resid[eiy]|fee|stipend|honorari|compensation|housing|accommodat|tuition|budget|award|no open calls|applications are closed|no applications|rolling|Nassau|Suffolk|Long Island|New Jersey|Connecticut', re.I)
RESTRICTION = re.compile(r'(?:scrap|crawl|automated|robot|data mining).{0,160}(?:prohibit|not permitted|not allowed|unauthoriz)|(?:prohibit|may not|not permitted).{0,160}(?:scrap|crawl|automated|robot|data mining)', re.I)
CHALLENGE = re.compile(r'just a moment|verify you are human|enable javascript and cookies|checking your browser|access denied|attention required.*cloudflare', re.I)


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts, self.links, self.canonical = [], [], None
        self.hidden = 0
        self.title_parts, self.in_title, self.anchor = [], False, None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag in ('script', 'style', 'noscript', 'svg'):
            self.hidden += 1
        if tag == 'title':
            self.in_title = True
        if tag == 'a' and a.get('href'):
            self.anchor = [a['href'], []]
        if tag == 'link' and a.get('rel') == 'canonical':
            self.canonical = a.get('href')
        if tag in ('p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'br', 'section', 'tr'):
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'noscript', 'svg') and self.hidden:
            self.hidden -= 1
        if tag == 'title':
            self.in_title = False
        if tag == 'a' and self.anchor:
            self.links.append((self.anchor[0], ' '.join(self.anchor[1])))
            self.anchor = None
        if tag in ('p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'section', 'tr'):
            self.parts.append('\n')

    def handle_data(self, data):
        if self.in_title:
            self.title_parts.append(data)
        if not self.hidden:
            self.parts.append(data)
            if self.anchor:
                self.anchor[1].append(data.strip())

    def text(self):
        return '\n'.join(x for x in (re.sub(r'\s+', ' ', s).strip() for s in ''.join(self.parts).splitlines()) if x)


class NoRedirect(ur.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def canonical(url):
    try:
        p = up.urlsplit(url)
    except ValueError:
        return None
    if p.scheme not in ('https', 'http') or not p.netloc or p.username or p.password:
        return None
    query = up.parse_qsl(p.query, keep_blank_values=True)
    query = [(k, v) for k, v in query if not k.startswith('utm_') and k not in ('fbclid', 'gclid')]
    return up.urlunsplit((p.scheme, p.netloc.lower(), p.path or '/', up.urlencode(query), ''))


def host(url):
    return up.urlsplit(url).netloc.lower().removeprefix('www.')


class Crawler:
    def __init__(self, out, depth, per_source, per_host, max_bytes=1500000):
        self.out, self.depth = out, depth
        self.per_source, self.per_host = per_source, per_host
        self.max_bytes = max_bytes
        self.opener = ur.build_opener(NoRedirect())
        self.lock = threading.RLock()
        self.host_locks, self.last_request, self.counts = {}, {}, Counter()
        self.robots_cache, self.cache, self.blocked_hosts = {}, {}, set()
        self.logs = []
        (out / 'pages').mkdir(parents=True, exist_ok=True)

    def host_lock(self, domain):
        with self.lock:
            return self.host_locks.setdefault(domain, threading.RLock())

    def request(self, url, delay=2, limit=1500000):
        domain = host(url)
        with self.host_lock(domain):
            wait = self.last_request.get(domain, 0) + delay - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self.last_request[domain] = time.monotonic()
            try:
                req = ur.Request(url, headers={'User-Agent': UA, 'Accept': 'text/html,application/pdf,text/plain;q=0.9,*/*;q=0.2'})
                with self.opener.open(req, timeout=30) as resp:
                    data = resp.read(limit + 1)
                    return resp.status, dict(resp.headers), data[:limit], len(data) > limit
            except urllib.error.HTTPError as exc:
                return exc.code, dict(exc.headers), exc.read(12000), False
            except Exception as exc:
                return None, {}, str(exc).encode(), False

    def robots(self, url):
        p = up.urlsplit(url)
        origin = f'{p.scheme}://{p.netloc}'
        with self.host_lock(host(url)):
            if origin in self.robots_cache:
                return self.robots_cache[origin]
            robots_url = origin + '/robots.txt'
            status, headers, data, truncated = self.request(robots_url)
            # A same-site canonical redirect is permitted for the policy document.
            if status in (301, 302, 307, 308):
                nxt = canonical(up.urljoin(robots_url, headers.get('Location', headers.get('location', ''))))
                if nxt and host(nxt) == host(url) and up.urlsplit(nxt).path.rstrip('/') == '/robots.txt':
                    status, headers, data, truncated = self.request(nxt)
                    robots_url = nxt
            txt = data.decode('utf-8', errors='replace')
            parser = urllib.robotparser.RobotFileParser()
            parser.set_url(robots_url)
            if status == 200 and not CHALLENGE.search(txt[:3000]) and not txt.lstrip().startswith('<'):
                parser.parse(txt.splitlines())
                state = 'parsed'
            elif status in (404, 410):
                parser.parse([])
                state = 'not_found'
            else:
                state = 'unavailable_hold'
            delays = [parser.crawl_delay(a) or 0 for a in AGENTS] if state == 'parsed' else [0]
            policy = {'url': robots_url, 'http_status': status, 'state': state, 'delay': max(2, *delays), 'text': txt[:60000], 'parser': parser}
            self.robots_cache[origin] = policy
            return policy

    def fetch(self, url, redirects=0):
        url = canonical(url)
        if not url:
            return {'url': str(url), 'status': 'invalid_url'}
        domain = host(url)
        with self.host_lock(domain):
            if url in self.cache:
                return self.cache[url]
            result = {'url': url, 'fetched_at': dt.datetime.now(dt.timezone.utc).isoformat()}
            if any(domain == h or domain.endswith('.' + h) for h in DISPLAY_ONLY_HOSTS):
                return {**result, 'status': 'display_only_no_crawl'}
            if domain in BAD_HOSTS or domain in self.blocked_hosts:
                return {**result, 'status': 'blocked_domain'}
            policy = self.robots(url)
            result['robots_url'] = policy['url']
            if policy['state'] == 'unavailable_hold':
                return {**result, 'status': 'robots_unavailable_hold', 'robots_http_status': policy['http_status']}
            denied = [a for a in AGENTS if not policy['parser'].can_fetch(a, url)]
            if denied:
                return {**result, 'status': 'robots_disallowed', 'denied_agents': denied}
            if self.counts[domain] >= self.per_host:
                return {**result, 'status': 'host_budget_reached'}
            self.counts[domain] += 1
            status, headers, data, truncated = self.request(url, policy['delay'], self.max_bytes)
            result.update(http_status=status, content_type=headers.get('Content-Type', headers.get('content-type', '')), truncated=truncated)
            if status in (301, 302, 303, 307, 308):
                target = canonical(up.urljoin(url, headers.get('Location', headers.get('location', ''))))
                result.update(status='redirect', redirect_to=target)
                if target and target != url and redirects < 5:
                    result['target_result'] = self.fetch(target, redirects + 1)
            elif status != 200:
                result.update(status='http_error' if status else 'network_error', error=data.decode(errors='replace')[:350] if status is None else None)
            elif 'pdf' in result['content_type'].lower() or data[:4] == b'%PDF':
                key = hashlib.sha256(url.encode()).hexdigest()[:20]
                (self.out / 'pages' / f'{key}.pdf').write_bytes(data)
                result.update(status='pdf_saved_needs_extraction', artifact=f'pages/{key}.pdf', sha256=hashlib.sha256(data).hexdigest())
            else:
                html = data.decode('utf-8', errors='replace')
                parser = PageParser()
                parser.feed(html)
                txt = parser.text()
                title = ' '.join(parser.title_parts).strip()
                if CHALLENGE.search(title) or CHALLENGE.search(txt[:700]):
                    result['status'] = 'bot_challenge_hold'
                else:
                    key = hashlib.sha256(url.encode()).hexdigest()[:20]
                    (self.out / 'pages' / f'{key}.txt').write_text(txt)
                    links = []
                    for href, label in parser.links:
                        try:
                            target = canonical(up.urljoin(url, href))
                        except ValueError:
                            continue
                        if target:
                            links.append({'url': target, 'label': re.sub(r'\s+', ' ', label)[:180]})
                    evidence = []
                    lines = txt.splitlines()
                    for i, line in enumerate(lines):
                        if EVIDENCE.search(line):
                            evidence.append({'line': i + 1, 'text': line[:1800], 'context': '\n'.join(lines[max(0, i-1):i+2])[:2400]})
                    terms_issues = RESTRICTION.findall(txt)
                    result.update(status='fetched', title=title, canonical=parser.canonical, artifact=f'pages/{key}.txt', sha256=hashlib.sha256(data).hexdigest(), text_length=len(txt), links=links, evidence=evidence[:160], terms_restriction_detected=bool(terms_issues))
                    if terms_issues:
                        self.blocked_hosts.add(domain)
            self.cache[url] = result
            with self.lock:
                self.logs.append(result)
                with (self.out / 'pages.jsonl').open('a') as f:
                    f.write(json.dumps(result) + '\n')
            return result

    def crawl_source(self, source):
        seed = canonical(source['source_url'])
        if source.get('scrape_policy') == 'display_only_no_requests' or str(source.get('access', '')).startswith('paid') or source.get('tier') == 'paid':
            return {'source_id': source['id'], 'name': source['name'], 'seed_url': seed,
                    'pages': [{'depth': 0, 'url': seed, 'status': 'display_only_no_crawl'}],
                    'ingest': False, 'review_status': 'display_only'}
        queue, visited, collected, pending = [], set(), [], []
        heapq.heappush(queue, (-100, 0, seed))
        seq = 0
        while queue and len(collected) < self.per_source:
            _, depth, url = heapq.heappop(queue)
            if url in visited:
                continue
            visited.add(url)
            result = self.fetch(url)
            collected.append({'depth': depth, 'url': url, 'status': result['status']})
            while result.get('target_result'):
                result = result['target_result']
                visited.add(result['url'])
                collected[-1]['resolved_url'] = result['url']
                collected[-1]['resolved_status'] = result['status']
            if result['status'] != 'fetched' or depth >= self.depth or result.get('terms_restriction_detected'):
                continue
            links = result.get('links', [])
            ranked = []
            for link in links:
                target, label = link['url'], link['label']
                if target in visited or SKIP.search(up.urlsplit(target).path):
                    continue
                same_site = host(target) in (host(seed), host(result['url']))
                application_host = bool(re.search(r'(?:^|\.)(?:submittable\.com|slideroom\.com|smarterentry\.com|callforentry\.org|jotform\.com|jotform\.us|google\.com|forms\.gle|libcal\.com|libnet\.info|mylibrary\.digital|librarycalendar\.com|whofi\.com|viewcy\.com)$', host(target)))
                is_terms = same_site and TERMS.search(label + ' ' + up.urlsplit(target).path)
                if not (same_site or application_host):
                    if KEY.search(label):
                        pending.append(link)
                    continue
                value = label + ' ' + up.urlsplit(target).path
                if not KEY.search(value) and not is_terms:
                    continue
                # Terms first; current calls and application instructions before archives.
                score = 80 if is_terms else 0
                score += 25 * bool(re.search(r'apply|application|guideline|prospectus|open.?call|submit', value, re.I))
                score += 20 * bool(re.search(r'2027|2026', value))
                score += 10 * bool(re.search(r'residen|grant|fellow|opportunit|commission', value, re.I))
                score += 60 * bool(re.search(r'open.?mic|acoustic|jam.session|drum.circle|song.circle|papermak|recording|makerspace|makerlab|creative.writ|poetry|fiber.art|craft.help', label, re.I))
                score -= 20 * bool(re.search(r'20(?:0\d|1\d|2[0-4])', value))
                ranked.append((score, target))
            for score, target in sorted(set(ranked), reverse=True)[:18]:
                seq += 1
                heapq.heappush(queue, (-score, depth + 1, target))
        return {'source_id': source['id'], 'name': source['name'], 'state': source.get('state'), 'municipality_or_borough': source.get('municipality_or_borough'), 'seed_url': seed, 'pages': collected, 'unfollowed_external_discovery_links': list({l['url']: l for l in pending}.values())[:80], 'remaining_queue': len(queue), 'ingest': False, 'review_status': 'evidence_collected_not_published'}

    def save(self, sources):
        policies = [{k: v for k, v in p.items() if k != 'parser'} for p in list(self.robots_cache.values())]
        (self.out / 'robots.json').write_text(json.dumps(policies, indent=2))
        (self.out / 'sources.json').write_text(json.dumps(sources, indent=2))
        summary = {'source_count': len(sources), 'unique_pages_requested': len(self.logs), 'page_status_counts': dict(Counter(p['status'] for p in self.logs)), 'source_first_status_counts': dict(Counter(s['pages'][0].get('resolved_status', s['pages'][0]['status']) for s in sources)), 'robots_origins': len(policies), 'finished_at': dt.datetime.now(dt.timezone.utc).isoformat(), 'limits': {'depth': self.depth, 'per_source': self.per_source, 'per_host': self.per_host}, 'ingest': False}
        (self.out / 'manifest.json').write_text(json.dumps(summary, indent=2))
        return summary


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--input', required=True)
    ap.add_argument('--output', required=True)
    ap.add_argument('--depth', type=int, default=3)
    ap.add_argument('--per-source', type=int, default=10)
    ap.add_argument('--per-host', type=int, default=22)
    ap.add_argument('--workers', type=int, default=6)
    ap.add_argument('--ids', nargs='*')
    ap.add_argument('--community', action='store_true')
    ap.add_argument('--max-bytes', type=int, default=1500000)
    args = ap.parse_args()
    if args.community:
        global KEY, SKIP, EVIDENCE
        KEY = re.compile(KEY.pattern + r'|open.?mic|jam|drum|music|makerspace|makerlab|studio|workshop|craft|writ|poe[mt]|improv|dance|theat|sewing|knit|sing.?along|choir|calendar|events|programs|classes|terms|conditions', re.I)
        SKIP = re.compile(r'/wp-json/|/feed/?$|/cart|/checkout|/donate|/login|/sign.?in|/shop|/product/|/tag/|/author/', re.I)
        EVIDENCE = re.compile(EVIDENCE.pattern + r'|open.?mic|jam|drum|craft|makerspace|studio|writ|poe[mt]|registration|register|library.card|age[sd]?|instruments?|beginner|2026|2027', re.I)
    data = json.loads(Path(args.input).read_text())
    sources = data['results']
    if args.ids:
        sources = [s for s in sources if s['id'] in args.ids]
    out = Path(args.output)
    if (out / 'manifest.json').exists() or (out / 'pages.jsonl').exists():
        raise SystemExit('Use a new output folder; crawl evidence is immutable.')
    if not 10000 <= args.max_bytes <= 10000000:
        raise SystemExit('--max-bytes must be between 10000 and 10000000')
    c = Crawler(out, args.depth, args.per_source, args.per_host, args.max_bytes)
    completed = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures = {pool.submit(c.crawl_source, s): s for s in sources}
        for f in concurrent.futures.as_completed(futures):
            source = futures[f]
            try:
                record = f.result()
            except Exception as exc:
                record = {'source_id': source['id'], 'name': source['name'], 'pages': [{'status': 'worker_error', 'error': str(exc)}]}
            completed.append(record)
            first = record['pages'][0]
            print(json.dumps({'done': len(completed), 'total': len(sources), 'source': record['name'], 'pages': len(record['pages']), 'first_status': first.get('resolved_status', first['status'])}), flush=True)
            c.save(completed)
    print(json.dumps(c.save(completed)), flush=True)


if __name__ == '__main__':
    main()
