#!/usr/bin/env python3
import sys

def main():
    if len(sys.argv) < 2:
        sys.exit(1)

    url = sys.argv[1]
    timeout = int(sys.argv[2]) if len(sys.argv) > 2 else 15

    try:
        from curl_cffi import requests
        r = requests.get(
            url,
            impersonate="chrome124",
            timeout=timeout,
            headers={
                "Accept-Language": "en-US,en;q=0.9",
                "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
                "Sec-Ch-Ua-Mobile": "?0",
                "Sec-Ch-Ua-Platform": '"Windows"',
            }
        )
        if "Just a moment..." in r.text and len(r.text) < 8000:
            sys.exit(2)
        sys.stdout.write(r.text)
    except Exception as e:
        sys.stderr.write(str(e))
        sys.exit(1)

if __name__ == "__main__":
    main()
