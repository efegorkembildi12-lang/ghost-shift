# Ghostshift Demo Tape
# Run: vhs assets/demo.tape (from repo root)
# Produces: assets/launch/ghostshift-demo.gif

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

# ── Prepare demo env (hidden) ──────────────────────────────────────────────────
Hide
Type "cd /tmp && rm -rf gs-demo && mkdir gs-demo && cd gs-demo && git init -q"
Enter
Type "git config user.email demo@ghostshift.dev && git config user.name Demo"
Enter
Type "echo 'const token = read();' > auth.ts && git add auth.ts && git commit -q -m 'initial commit'"
Enter
Type "GS='node /Users/efegorkembildi/Code/ghostshift/apps/cli/src/index.js'"
Enter
Type "HELPER=/Users/efegorkembildi/Code/ghostshift/assets/gs-demo-helper.sh"
Enter
Type "alias ghostshift='node /Users/efegorkembildi/Code/ghostshift/apps/cli/src/index.js'"
Enter
Type "$GS init > /dev/null 2>&1"
Enter
Sleep 500ms
Show

# ── ghostshift init ────────────────────────────────────────────────────────────
Type "ghostshift init"
Enter
Sleep 1.2s

# ── ghostshift run (first session) ────────────────────────────────────────────
Sleep 400ms
Type "ghostshift run 'rename auth token' \\"
Enter
Type "  --files auth.ts \\"
Enter
Type "  --decision 'rationale:rename for clarity' \\"
Enter
Type "  --verify 'lint:passed'"
Enter
Sleep 1.5s

# ── simulate the file change ───────────────────────────────────────────────────
Hide
Type "sed -i 's/const token/const parsedToken/' auth.ts && git add auth.ts && git commit -q -m 'rename auth variable'"
Enter
Show

# ── ghostshift run (second session) ───────────────────────────────────────────
Sleep 400ms
Type "ghostshift run 'validate rename' \\"
Enter
Type "  --files auth.ts \\"
Enter
Type "  --verify 'unit-tests:passed'"
Enter
Sleep 1.5s

# ── ghostshift trace ───────────────────────────────────────────────────────────
Sleep 500ms
Type "ghostshift trace"
Enter
Sleep 1.5s

# ── ghostshift blame --line ────────────────────────────────────────────────────
Sleep 500ms
Type "ghostshift blame auth.ts --line 1"
Enter
Sleep 1.5s

# ── get session IDs via helper (hidden) ───────────────────────────────────────
Hide
Type "SID=$($HELPER 1) && SID2=$($HELPER 0)"
Enter
Show

# ── ghostshift explain ─────────────────────────────────────────────────────────
Sleep 400ms
Type "ghostshift explain $SID"
Enter
Sleep 2s

# ── ghostshift replay ─────────────────────────────────────────────────────────
Sleep 500ms
Type "ghostshift replay $SID --reason 'validate replay flow' --verify 'unit-tests:pending'"
Enter
Sleep 1.5s

# ── ghostshift compare ────────────────────────────────────────────────────────
Sleep 500ms
Type "ghostshift compare $SID $SID2"
Enter
Sleep 1.5s

# ── ghostshift pr-summary ─────────────────────────────────────────────────────
Sleep 500ms
Type "ghostshift pr-summary"
Enter
Sleep 2.5s

Sleep 1s
