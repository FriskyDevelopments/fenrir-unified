#!/usr/bin/env python3
"""
Automated white-label preview checklist.

For every brand in the registry it renders /, /login, the blog article and a
public gate with `?brand=<id>`, then asserts:
  * the resolved brand name appears (wordmark file or initials fallback)
  * the injected --primary theme token matches the brand config
  * exactly the brand's enabled SSO providers are offered, in order

Usage:  python3 scripts/brand-preview-check.py [base_url]
Exit code 0 = every brand passed.
"""

import asyncio
import json
import re
import subprocess
import sys
from pathlib import Path

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080"
ROOT = Path(__file__).resolve().parent.parent
SHOTS = Path("/tmp/browser/brand-check")
GATE_SLUG_FALLBACK = None  # discovered from the sitemap when available

PROVIDER_LABELS = {"apple": "Apple", "google": "Google", "microsoft": "Microsoft"}


def load_brands():
    """Reads the brand registry out of src/config/brands.ts (no TS runtime)."""
    src = (ROOT / "src/config/brands.ts").read_text()
    brands = []
    for block in re.findall(r"\{\s*id: \"([a-z0-9-]+)\",(.*?)\n  \},", src, re.S):
        bid, body = block
        name = re.search(r'name: "([^"]+)"', body)
        primary = re.search(r'"--primary": "([^"]+)"', body)
        providers = re.search(r"providers: (\[[^\]]*\]|BASE_PROVIDERS)", body)
        raw = providers.group(1) if providers else "BASE_PROVIDERS"
        if raw == "BASE_PROVIDERS":
            plist = ["apple", "google", "microsoft"]
        else:
            plist = re.findall(r'"([a-z]+)"', raw)
        brands.append(
            {
                "id": bid,
                "name": name.group(1) if name else bid,
                "primary": primary.group(1) if primary else None,
                "providers": plist,
            }
        )
    return brands


async def check(playwright, brand, gate_slug):
    from urllib.parse import urlencode

    browser = await playwright.chromium.launch(headless=True)
    context = await browser.new_context(viewport={"width": 1280, "height": 1800})
    page = await context.new_page()
    failures = []

    def url(path):
        return f"{BASE}{path}{'&' if '?' in path else '?'}{urlencode({'brand': brand['id']})}"

    routes = ["/", "/login", "/blog/telegram-role-management-guide"]
    if gate_slug:
        routes.append(f"/g/{gate_slug}")

    for path in routes:
        await page.goto(url(path), wait_until="networkidle")
        status_text = await page.inner_text("body")

        if "404" in (await page.title()):
            failures.append(f"{path}: route rendered a 404")

        # theme token actually applied to <html>
        if brand["primary"]:
            applied = await page.evaluate(
                "getComputedStyle(document.documentElement).getPropertyValue('--primary').trim()"
            )
            if applied and brand["primary"] not in applied:
                failures.append(
                    f"{path}: --primary is '{applied}', expected '{brand['primary']}'"
                )

        # brand identity is visible: wordmark image alt, or initials fallback
        logo_ok = await page.evaluate(
            """(name) => {
              // text-transform means innerText can be upper/lower-cased
              const needle = name.toLowerCase();
              const has = (v) => (v || '').toLowerCase().includes(needle);
              const imgs = [...document.images].some((i) => has(i.alt));
              const text = has(document.body.innerText);
              const initials = [...document.querySelectorAll('[role="img"]')]
                .some((n) => has(n.getAttribute('aria-label')));
              return imgs || text || initials;
            }""",
            brand["name"],
        )
        if not logo_ok:
            failures.append(f"{path}: brand name/logo for '{brand['name']}' not found")

        if path == "/login":
            labels = await page.evaluate(
                "[...document.querySelectorAll('button')].map((b) => b.innerText.trim())"
            )
            offered = [
                pid
                for pid in ("apple", "google", "microsoft")
                if any(PROVIDER_LABELS[pid] in l for l in labels)
            ]
            expected = brand["providers"]
            if offered != expected:
                failures.append(
                    f"/login: providers {offered} != expected {expected}"
                )
            if "misconfigured" in status_text.lower():
                failures.append("/login: redirect configuration error shown")

        SHOTS.mkdir(parents=True, exist_ok=True)
        slug = path.strip("/").replace("/", "_") or "home"
        await page.screenshot(path=str(SHOTS / f"{brand['id']}-{slug}.png"))

    await browser.close()
    return failures


async def main():
    from playwright.async_api import async_playwright

    gate_slug = None
    try:
        sitemap = subprocess.run(
            ["curl", "-sS", f"{BASE}/sitemap.xml"], capture_output=True, text=True, timeout=30
        ).stdout
        match = re.search(r"/g/([a-z0-9-]+)<", sitemap)
        gate_slug = match.group(1) if match else GATE_SLUG_FALLBACK
    except Exception:
        gate_slug = GATE_SLUG_FALLBACK

    brands = load_brands()
    report = {}
    async with async_playwright() as playwright:
        for brand in brands:
            report[brand["id"]] = await check(playwright, brand, gate_slug)

    print(json.dumps(report, indent=2))
    failed = {k: v for k, v in report.items() if v}
    print(
        f"\n{len(brands) - len(failed)}/{len(brands)} brands passed"
        f"{' — screenshots in ' + str(SHOTS) if brands else ''}"
    )
    sys.exit(1 if failed else 0)


asyncio.run(main())
