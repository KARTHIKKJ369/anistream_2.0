#!/usr/bin/env python3
import sys

def main():
    if len(sys.argv) < 2:
        sys.exit(1)

    url = sys.argv[1]
    timeout = int(sys.argv[2]) if len(sys.argv) > 2 else 15

    # 1. Try curl_cffi with chrome impersonation (bypasses Cloudflare on datacenter IPs)
    try:
        from curl_cffi import requests
        r = requests.get(
            url,
            impersonate="chrome124",
            timeout=timeout,
            headers={
                "Referer": "https://anidb.app/",
                "Origin": "https://anidb.app",
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
                "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
                "Sec-Ch-Ua-Mobile": "?0",
                "Sec-Ch-Ua-Platform": '"Windows"',
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-origin",
            }
        )
        if "Just a moment..." in r.text and len(r.text) < 8000:
            sys.exit(2)
        sys.stdout.write(r.text)
        return
    except ImportError:
        pass
    except Exception as e:
        sys.stderr.write(f"curl_cffi error: {e}\n")

    # 2. Fallback to standard urllib with realistic browser headers
    try:
        import urllib.request
        import ssl
        ctx = ssl.create_default_context()
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                "Referer": "https://anidb.app/",
                "Origin": "https://anidb.app",
                "Accept": "*/*",
                "Accept-Language": "en-US,en;q=0.9",
            }
        )
        with urllib.request.urlopen(req, context=ctx, timeout=timeout) as response:
            content = response.read().decode('utf-8', errors='ignore')
            if "Just a moment..." in content and len(content) < 8000:
                sys.exit(2)
            sys.stdout.write(content)
            return
    except Exception as e:
        sys.stderr.write(f"urllib error: {e}\n")
        sys.exit(1)

if __name__ == "__main__":
    main()
