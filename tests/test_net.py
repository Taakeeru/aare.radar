import email.message
import unittest
import urllib.error
from unittest import mock

from collector import net


def http_error(code, retry_after=None):
    h = email.message.Message()
    if retry_after is not None:
        h["Retry-After"] = str(retry_after)
    return urllib.error.HTTPError("https://x", code, "err", h, None)


class Resp:
    def __init__(self, body=b"{}"):
        self.body, self.headers = body, {"X": "1"}

    def read(self):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class NetTest(unittest.TestCase):
    def test_retry_after_seconds_and_cap(self):
        self.assertEqual(net.retry_after({"Retry-After": "7"}, 0), 7)
        self.assertEqual(net.retry_after({"Retry-After": "99999"}, 0), net.MAX_WAIT)
        self.assertEqual(net.retry_after({}, 0), 2)
        self.assertEqual(net.retry_after(None, 2), 8)

    def test_429_waits_for_retry_after_then_succeeds(self):
        waits = []
        calls = [http_error(429, 11), Resp(b"ok")]

        def opener(req, timeout=0):
            r = calls.pop(0)
            if isinstance(r, Exception):
                raise r
            return r
        with mock.patch.object(net.urllib.request, "urlopen", side_effect=opener), mock.patch.object(net, "sleep", side_effect=waits.append):
            body, _ = net.fetch("https://rate.example/a", min_gap=0)
        self.assertEqual(body, b"ok")
        self.assertIn(11, waits)

    def test_404_is_not_retried(self):
        with mock.patch.object(net.urllib.request, "urlopen", side_effect=http_error(404)) as u, mock.patch.object(net, "sleep"):
            with self.assertRaises(urllib.error.HTTPError):
                net.fetch("https://x.example/a", min_gap=0)
        self.assertEqual(u.call_count, 1)

    def test_gives_up_after_tries(self):
        with mock.patch.object(net.urllib.request, "urlopen", side_effect=http_error(429, 1)) as u, mock.patch.object(net, "sleep"):
            with self.assertRaises(urllib.error.HTTPError):
                net.fetch("https://y.example/a", tries=3, min_gap=0)
        self.assertEqual(u.call_count, 3)

    def test_same_host_requests_are_spaced(self):
        waits = []
        net._last.clear()
        with mock.patch.object(net.urllib.request, "urlopen", return_value=Resp()), mock.patch.object(net, "sleep", side_effect=waits.append):
            net.fetch("https://polite.example/1", min_gap=5)
            net.fetch("https://polite.example/2", min_gap=5)
        self.assertEqual(len(waits), 1)
        self.assertGreater(waits[0], 4)


if __name__ == "__main__":
    unittest.main()
