# Working agreement

- Before starting implementation, check whether the request is sufficiently clear.
- If an important requirement, expected behavior, scope, or acceptance criterion is ambiguous, ask concise clarifying questions first and wait for the user's answers.
- Do not modify files, run project commands, or make other implementation changes while waiting for those answers.
- If the task is clear enough to proceed safely, make reasonable assumptions, state them briefly, and continue without unnecessary questions.

# Browser process hygiene

- Keep browser automation limited to the shortest flow needed for verification.
- Every named Playwright CLI session must be closed with `playwright-cli --session <name> close` immediately after the check, including when the check fails. Do not probe saved sessions after closing them. Reserve `kill-all` for a confirmed stale/zombie daemon so unrelated browser work is not interrupted.
- Do not leave a Playwright browser open between tasks. Before finishing browser work on Windows, verify that no task-owned `chrome-headless-shell.exe` or `chrome.exe` process with a Playwright temporary profile is still running. Never terminate the user's ordinary Chrome processes.
- Repository browser QA must use `tools/qa/playwright-runner.cjs`; do not call `chromium.launch()` directly from new scripts.
