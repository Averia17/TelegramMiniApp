"""Create and deploy a local immutable release from the current working tree.

The default command is the local release flow. Use ``--dry-run`` when only a
preview is wanted. ``--push`` publishes the tag for the remote GitHub flow and
does not also deploy the local checkout.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from deploy.changed_services import affected_units
from deploy.versioning import next_release_tag

ROOT = Path(__file__).resolve().parents[1]
RELEASE_ENV = ROOT / "deploy" / "release.env"
ROLLBACK_DEPLOYMENT_FILES = (
    "docker-compose.prod.yml",
    "account/docker-compose.prod.yml",
    "battle/docker-compose.prod.yml",
    "bot/docker-compose.prod.yml",
    "leaderboard/docker-compose.prod.yml",
    "news/docker-compose.prod.yml",
    "party/docker-compose.prod.yml",
    "shop/docker-compose.prod.yml",
    "nginx/Dockerfile",
    "nginx/nginx.conf",
    "nginx/prod.conf",
    "nginx/proxy_params",
)
SECRET_VALUE = re.compile(
    r"(?:BOT_TOKEN|CLOUDFLARE_TUNNEL_TOKEN|APP_AUTH_SECRET|POSTGRES_PASSWORD|REDIS_PASSWORD|"
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


def load_dotenv(path: Path) -> dict[str, str]:
    """Read simple KEY=VALUE files without requiring python-dotenv."""

    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            continue
        values[key] = value.strip().strip("\"'")
    return values


def local_compose_environment(
    tag: str,
    env_file: Path | None = None,
    git_sha: str | None = None,
    compose_bind_root: Path | None = None,
) -> dict[str, str]:
    """Load the independent production env for Compose; shell vars dominate."""

    environment = load_dotenv(env_file or ROOT / ".env.prod")
    environment.update(os.environ)
    environment["APP_VERSION"] = tag
    environment.setdefault("GIT_SHA", git_sha or git("rev-parse", "HEAD").strip())
    # The Cloudflare service is behind an explicit Compose profile. Keep local
    # no-tunnel deploys valid even when the optional token is not configured.
    environment["COMPOSE_PROFILES"] = ""
    if compose_bind_root:
        environment["COMPOSE_BIND_ROOT"] = str(compose_bind_root).replace("\\", "/")
    environment.setdefault("CLOUDFLARE_TUNNEL_TOKEN", "disabled-for-local-deploy")
    return environment


def deploy_local(tag: str) -> None:
    """Build and run the production-like stack locally without a tunnel."""

    compose_file = ROOT / "docker-compose.prod.yml"
    command = [
        "docker",
        "compose",
        "--env-file",
        str(ROOT / ".env.prod"),
        "-f",
        str(compose_file),
        "up",
        "-d",
        "--build",
    ]
    print("Deploying local release", tag)
    result = subprocess.run(command, cwd=ROOT, env=local_compose_environment(tag))
    if result.returncode:
        diagnostics = [
            "docker",
            "compose",
            "--env-file",
            str(ROOT / ".env.prod"),
            "-f",
            str(compose_file),
        ]
        subprocess.run(
            [*diagnostics, "ps", "-a"], cwd=ROOT, env=os.environ.copy(), check=False
        )
        subprocess.run(
            [*diagnostics, "logs", "--no-color", "--tail=120"],
            cwd=ROOT,
            env=os.environ.copy(),
            check=False,
        )
        raise RuntimeError("local Docker Compose deployment failed")


def release_tag_at(commit: str) -> str | None:
    """Return the newest SemVer release tag pointing at a commit, if any."""

    tags = [
        value
        for value in git("tag", "--points-at", commit).splitlines()
        if re.fullmatch(r"v\d+\.\d+\.\d+", value)
    ]
    return sorted(tags)[-1] if tags else None


def rollback_local(previous_head: str, previous_tag: str | None) -> bool:
    """Rebuild the previous commit in a temporary worktree after local failure."""

    rollback_root = Path(tempfile.mkdtemp(prefix="telegramminiapp-rollback-"))
    worktree_added = False
    try:
        add = subprocess.run(
            ["git", "worktree", "add", "--detach", str(rollback_root), previous_head],
            cwd=ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        if add.returncode:
            print(
                f"local rollback worktree failed: {add.stderr.strip()}", file=sys.stderr
            )
            return False
        worktree_added = True

        # The previous commit can predate deployment-only safety fixes. Keep
        # application source at the previous commit, but reuse the current
        # Compose/Nginx contract so rollback itself is not blocked by an old
        # read-only or mount configuration bug.
        for relative in ROLLBACK_DEPLOYMENT_FILES:
            source = ROOT / relative
            target = rollback_root / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)

        production_env = ROOT / ".env.prod"
        if not production_env.exists():
            print("local rollback skipped: .env.prod is missing", file=sys.stderr)
            return False
        shutil.copy2(production_env, rollback_root / ".env.prod")

        rollback_tag = previous_tag or "previous"
        environment = local_compose_environment(
            rollback_tag,
            env_file=rollback_root / ".env.prod",
            git_sha=previous_head,
            compose_bind_root=ROOT,
        )
        command = [
            "docker",
            "compose",
            "--env-file",
            str(rollback_root / ".env.prod"),
            "-f",
            str(rollback_root / "docker-compose.prod.yml"),
            "up",
            "-d",
            "--build",
        ]
        print(f"Rolling back local stack to {rollback_tag}")
        result = subprocess.run(command, cwd=rollback_root, env=environment)
        if result.returncode:
            print("local rollback Compose deployment failed", file=sys.stderr)
            return False
        return True
    finally:
        if worktree_added:
            subprocess.run(
                ["git", "worktree", "remove", "--force", str(rollback_root)],
                cwd=ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
        elif rollback_root.exists():
            shutil.rmtree(rollback_root, ignore_errors=True)


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


def execute_release(tag: str, push: bool) -> str:
    previous_head = git("rev-parse", "HEAD").strip()
    commit_created = False
    tag_created = False
    commit_sha = ""
    if secret_scan(candidate_paths()):
        raise RuntimeError("secret scan failed; no commit or tag was created")
    try:
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
        commit_created = True
        commit_sha = git("rev-parse", "HEAD").strip()
        git("tag", "-a", tag, "-m", f"Release {tag}")
        tag_created = True
        if push:
            git("push", "origin", "HEAD")
            git("push", "origin", tag)
        return commit_sha
    except Exception:
        # Local releases have not been published yet, so restore the pre-release
        # branch state without deleting the user's working-tree changes. A
        # pushed commit/tag is immutable and is intentionally left for the
        # remote rollback path to handle.
        if not push:
            if tag_created:
                git("tag", "-d", tag)
            if commit_created and git("rev-parse", "HEAD").strip() == commit_sha:
                git("reset", "--mixed", previous_head)
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--dry-run", action="store_true", help="preview without commit or deployment"
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        help="explicitly execute the default local release flow",
    )
    parser.add_argument(
        "--push", action="store_true", help="push the new commit and tag to origin"
    )
    parser.add_argument(
        "--no-local-deploy",
        action="store_true",
        help="create the commit/tag without starting local Compose",
    )
    args = parser.parse_args()
    if args.dry_run and (args.execute or args.push or args.no_local_deploy):
        parser.error("--dry-run cannot be combined with execution options")

    tag, plan, findings = release_preview()
    print(json.dumps({"tag": tag, "plan": plan, "secret_findings": findings}, indent=2))
    if findings:
        print("Release blocked by secret scan", file=sys.stderr)
        return 2
    if args.dry_run:
        print("Dry-run only; no commit, tag, or deployment was created.")
        return 0
    if args.push:
        execute_release(tag, True)
        print(f"Created {tag} with {commit_message(tag)}")
        print("Tag pushed; the remote GitHub release workflow owns deployment.")
    elif args.no_local_deploy:
        execute_release(tag, False)
        print(f"Created {tag} with {commit_message(tag)}")
    else:
        previous_head = git("rev-parse", "HEAD").strip()
        previous_tag = release_tag_at(previous_head)
        try:
            deploy_local(tag)
        except Exception as exc:
            print(f"Local release failed before commit/tag: {exc}", file=sys.stderr)
            if not rollback_local(previous_head, previous_tag):
                print("Local rollback was not fully verified.", file=sys.stderr)
            return 1
        try:
            execute_release(tag, False)
        except Exception as exc:
            print(
                f"Release bookkeeping failed after deployment: {exc}", file=sys.stderr
            )
            if not rollback_local(previous_head, previous_tag):
                print("Local rollback was not fully verified.", file=sys.stderr)
            return 1
        print(f"Created {tag} with {commit_message(tag)}")
        print(f"Local release {tag} is running on http://127.0.0.1:8081")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
