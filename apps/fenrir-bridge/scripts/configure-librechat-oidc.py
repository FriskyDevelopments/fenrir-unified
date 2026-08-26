#!/usr/bin/env python3
"""Apply an OIDC client config to LibreChat without putting secrets in argv."""

from __future__ import annotations

import json
import os
import shutil
import sys
import tempfile
import time


def main() -> None:
    updates = json.load(sys.stdin)
    base = "/opt/librechat"
    env_path = os.path.join(base, ".env")
    yaml_path = os.path.join(base, "librechat.yaml")
    stamp = time.strftime("%Y%m%d-%H%M%S")

    for path in (env_path, yaml_path):
        shutil.copy2(path, f"{path}.better-auth-{stamp}.bak")

    with open(env_path, encoding="utf-8") as handle:
        lines = handle.read().splitlines()

    seen: set[str] = set()
    output: list[str] = []
    for line in lines:
        key = (
            line.split("=", 1)[0]
            if "=" in line and not line.lstrip().startswith("#")
            else None
        )
        if key in updates:
            output.append(f"{key}={updates[key]}")
            seen.add(key)
        else:
            output.append(line)

    for key, value in updates.items():
        if key not in seen:
            output.append(f"{key}={value}")

    descriptor, temporary_path = tempfile.mkstemp(
        prefix=".env.better-auth-", dir=base, text=True
    )
    with os.fdopen(descriptor, "w", encoding="utf-8") as handle:
        handle.write("\n".join(output) + "\n")
    os.chmod(temporary_path, 0o600)
    os.replace(temporary_path, env_path)

    with open(yaml_path, encoding="utf-8") as handle:
        yaml = handle.read()
    if "socialLogins: []" in yaml:
        yaml = yaml.replace(
            "socialLogins: []", 'socialLogins: ["openid"]', 1
        )
    elif 'socialLogins: ["openid"]' not in yaml:
        raise RuntimeError("registration_social_logins_missing")
    with open(yaml_path, "w", encoding="utf-8") as handle:
        handle.write(yaml)

    print("power1_config=updated backups=created")


if __name__ == "__main__":
    main()
