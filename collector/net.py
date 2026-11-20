"""All network access goes through fetch(): polite pacing per host, retry with backoff, Retry-After respected.

BFS PxWeb answers HTTP 429 when asked too fast; the server then sends a Retry-After header (seconds or a date).
We wait that long (capped), then try again, instead of hammering it.
"""
import email.utils
import json
import time
import urllib.error
import urllib.parse
import urllib.request

UA = "powercoders-radar/0.2 (hackathon prototype; aggregate public data only)"
MAX_WAIT = 300          # never sleep longer than this for one retry (seconds)
DEFAULT_GAP = 1.0       # seconds between two requests to the same host
HOST_GAP = {"www.job-room.ch": 0.4}   # job-room is paced separately (many small detail requests)

_last = {}              # host -> time of the last request
sleep = time.sleep      # indirection so tests can run without waiting


def retry_after(headers, attempt):
    """Seconds to wait before the next try: the server's Retry-After if it sent one, else 2, 4, 8 ... seconds."""
    v = (headers or {}).get("Retry-After")
    if v:
        try:
            return min(MAX_WAIT, max(1.0, float(v)))
        except ValueError:
            try:
                when = email.utils.parsedate_to_datetime(v).timestamp()
                return min(MAX_WAIT, max(1.0, when - time.time()))
            except Exception:
                pass
    return min(MAX_WAIT, 2.0 * (2 ** attempt))


_cache = {}


def fetch_cached(url, **kw):
    """fetch() for pages several entries read in one run (e.g. one SEM edition page lists six tables)."""
    if url not in _cache:
        _cache[url] = fetch(url, **kw)
    return _cache[url]


def fetch(url, data=None, headers=None, tries=5, min_gap=None, timeout=60):
    """GET (or POST with a JSON body when `data` is given). Returns (body bytes, response headers dict)."""
    body = json.dumps(data).encode() if data is not None else None
    h = {"User-Agent": UA, "Accept": "application/json"}
    h.update(headers or {})
    if body:
        h["Content-Type"] = "application/json"
    host = urllib.parse.urlsplit(url).netloc
    gap = min_gap if min_gap is not None else HOST_GAP.get(host, DEFAULT_GAP)
    for attempt in range(tries):
        wait = gap - (time.time() - _last.get(host, 0))
        if wait > 0:
            sleep(wait)
        _last[host] = time.time()
        try:
            req = urllib.request.Request(url, data=body, headers=h, method="POST" if body else "GET")
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read(), dict(r.headers)
        except urllib.error.HTTPError as e:
            retryable = e.code in (429, 500, 502, 503, 504)
            if not retryable or attempt == tries - 1:
                raise
            w = retry_after(e.headers, attempt)
            print(f"  HTTP {e.code} from {host}; waiting {w:.0f}s before retry {attempt + 2}/{tries}")
            sleep(w)
        except (urllib.error.URLError, TimeoutError, ConnectionError):
            if attempt == tries - 1:
                raise
            sleep(retry_after(None, attempt))
