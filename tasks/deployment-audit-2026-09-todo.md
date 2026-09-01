# Deployment audit and hardening checklist

- [x] Repair the CI heredoc and add deployment/Compose validation gates.
- [x] Add regression tests for the CI workflow contract.
- [x] Enforce immutable image refs and production config hash in manifests.
- [x] Validate manifest integrity before production drain.
- [x] Add readable PostgreSQL backup verification.
- [x] Verify remote tag resolves to the manifest commit on staging and production.
- [x] Prevent published manifests from being overwritten on workflow reruns.
- [x] Require manifest build/recreate plan consistency.
- [x] Run focused tests after each slice.
- [x] Run final deployment and Compose verification.
- [x] Review the final diff for unrelated changes.
