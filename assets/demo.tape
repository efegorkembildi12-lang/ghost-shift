# Ghostshift Demo Tape
# Pre-requisites:
#   1. npm link  (once from repo root)
#   2. bash assets/demo-setup.sh  (creates /tmp/gs-demo)
# Run from repo root: vhs assets/demo.tape

Output assets/launch/ghostshift-demo.gif
Output assets/launch/ghostshift-demo.mp4

Set Theme "Catppuccin Mocha"
Set FontSize 14
Set Width 1000
Set Height 600
Set Padding 20
Set Shell "bash"
Set TypingSpeed 50ms
Set WaitTimeout 30s

# ── Move into the pre-created demo repo ──────────────────────────────────────
Hide
Type "cd /tmp/gs-demo"
Enter
Sleep 300ms
Show

Type "clear"
Enter
Sleep 300ms

# ── ghostshift init ───────────────────────────────────────────────────────────
Type "ghostshift init"
Enter
Sleep 1.2s

# ── ghostshift run ────────────────────────────────────────────────────────────
Sleep 400ms
Type "ghostshift run 'rename auth token' --files auth.ts --decision 'rationale:rename for clarity' --verify 'lint:passed'"
Enter
Sleep 1.5s

# ── ghostshift trace ──────────────────────────────────────────────────────────
Sleep 500ms
Type "ghostshift trace"
Enter
Sleep 1.5s

# ── ghostshift blame ──────────────────────────────────────────────────────────
Sleep 500ms
Type "ghostshift blame auth.ts --line 1"
Enter
Sleep 1.5s

# ── ghostshift pr-summary ─────────────────────────────────────────────────────
Sleep 500ms
Type "ghostshift pr-summary"
Enter
Sleep 2.5s

Sleep 1s
