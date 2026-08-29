"""Create an immutable release commit/tag from the current working tree.

The command is intentionally dry-run by default. Use ``--execute`` only after
reviewing the staged scope; use ``--push`` separately to publish to the remote.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from deploy.changed_services import affected_units
from deploy.versioning import next_release_tag

ROOT = Path(__file__).resolve().parents[1]
RELEASE_ENV = ROOT / "deploy" / "release.env"
SECRET_VALUE = re.compile(
    r"(?:BOT_TOKEN|NGROK_AUTHTOKEN|APP_AUTH_SECRET|POSTGRES_PASSWORD|REDIS_PASSWORD|"
    r"DEPLOY_ADMIN_TOKEN|GRAFANA_ADMIN_PASSWORD|GRAFANA_API_KEY)"
    r"\s*[:=]\s*([^\s#\"']+)"
)
PLACEHOLDER = re.compile(r"^(replace-with|change-me|example)", re.I)


def git(*args: str) -> str:
    result = subprocess.run(
        ["git", *args], cwd=ROOT, capture_output=True, text=True, check=False
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or f"git {' '.join(args)} failed")
    return result.stdout


def commit_message(tag: str) -> str:
    return f"deploy commit: {tag}"


def parse_release_settings(values: dict[str, str]) -> tuple[int, int]:
    try:
        major = int(values.get("RELEASE_MAJOR", "0"))
        minor = int(values.get("RELEASE_MINOR", "0"))
    except ValueError as exc:
        raise ValueError("RELEASE_MAJOR and RELEASE_MINOR must be integers") from exc
    if major < 0 or minor < 0:
        raise ValueError("RELEASE_MAJOR and RELEASE_MINOR must be non-negative")
    return major, minor


def load_release_settings() -> tuple[int, int]:
    values: dict[str, str] = {}
    if RELEASE_ENV.exists():
        for raw_line in RELEASE_ENV.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            values[key.strip()] = value.strip().strip("\"'")
    values.update(
        {key: value for key, value in os.environ.items() if key.startswith("RELEASE_")}
    )
    return parse_release_settings(values)


def candidate_paths() -> list[str]:
    tracked = git("diff", "--name-only", "HEAD").splitlines()
    untracked = git("ls-files", "--others", "--exclude-standard").splitlines()
    return sorted(set(tracked + untracked))


def secret_scan(paths: list[str]) -> list[str]:
    findings: list[str] = []
    for relative in paths:
        path = (ROOT / relative).resolve()
        basename = path.name.lower()
        if (
            basename in {".env", ".env.prod", ".env.local", ".env.test"}
            or basename.endswith(".pem")
            or basename in {"id_rsa", "id_ed25519"}
        ):
            findings.append(relative)
            continue
        if not path.is_file() or path.stat().st_size > 2_000_000:
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        is_test_fixture = path.name.startswith("test_") or "tests" in path.parts
        if re.search(r"-----BEGIN [A-Z ]+ PRIVATE KEY-----", text):
            findings.append(relative)
            continue
        for match in SECRET_VALUE.finditer(text):
            # Do not interpret the variable name inside Bash/Powershell
            # parameter expansion (`${SECRET:-}`) as a literal secret value.
            if text[max(0, match.start() - 2) : match.start()] == "${":
                continue
            value = match.group(1)
            if value in {"//p", "-}"}:
                continue
            if is_test_fixture:
                continue
            if not PLACEHOLDER.match(value) and not any(
                marker in value for marker in ("${", "?", "replace-with")
            ):
                findings.append(relative)
                break
    return sorted(set(findings))


def release_preview() -> tuple[str, dict[str, object], list[str]]:
    major, minor = load_release_settings()
    tags = git("tag", "--list").splitlines()
    tag = next_release_tag(tags, major=major, minor=minor)
    paths = candidate_paths()
    findings = secret_scan(paths)
    return tag, affected_units(paths), findings


def execute_release(tag: str, push: bool) -> None:
    if secret_scan(candidate_paths()):
        raise RuntimeError("secret scan failed; no commit or tag was created")
    git("add", ".")
    staged = git("diff", "--cached", "--name-only").splitlines()
    findings = secret_scan(staged)
    if findings:
        raise RuntimeError(
            "secret scan failed after git add; no commit or tag was created"
        )
    if not staged:
        raise RuntimeError("nothing is staged for release")
    git("commit", "-m", commit_message(tag))
    git("tag", "-a", tag, "-m", f"Release {tag}")
    if push:
        git("push", "origin", "HEAD")
        git("push", "origin", tag)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--execute", action="store_true", help="create commit and annotated tag"
    )
    parser.add_argument(
        "--push", action="store_true", help="push the new commit and tag to origin"
    )
    args = parser.parse_args()
    if args.push and not args.execute:
        parser.error("--push requires --execute")

    tag, plan, findings = release_preview()
    print(json.dumps({"tag": tag, "plan": plan, "secret_findings": findings}, indent=2))
    if findings:
        print("Release blocked by secret scan", file=sys.stderr)
        return 2
    if not args.execute:
        print("Dry-run only; no commit, tag, or push was created.")
        return 0
    execute_release(tag, args.push)
    print(f"Created {tag} with {commit_message(tag)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
