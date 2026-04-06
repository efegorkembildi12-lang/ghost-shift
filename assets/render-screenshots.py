"""
Renders ghostshift CLI output as styled terminal PNG screenshots.
Uses rich for terminal rendering and cairosvg/inkscape/rsvg-convert for SVG→PNG.
"""
import subprocess
import sys
import os
import tempfile

OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "launch")
GS = ["node", os.path.join(os.path.dirname(__file__), "../apps/cli/src/index.js")]
WORKSPACE = "/tmp/gs-demo"

def run_gs(*args):
    result = subprocess.run(
        GS + list(args),
        capture_output=True, text=True,
        cwd=WORKSPACE
    )
    return (result.stdout + result.stderr).strip()

def get_session_ids():
    import json
    result = subprocess.run(
        GS + ["trace", "--json"],
        capture_output=True, text=True, cwd=WORKSPACE
    )
    sessions = json.loads(result.stdout)
    return sessions  # newest first

def render_svg(title, prompt, command, output_text, width=900):
    from rich.console import Console
    from rich.text import Text
    from rich.panel import Panel
    from rich import box

    console = Console(
        record=True,
        width=width // 9,  # approx char width at font size ~14
        highlight=False,
        markup=False,
    )

    # Prompt line
    console.print(f"[bold green]$[/bold green] [bold white]{command}[/bold white]", markup=True)

    # Output lines — colorize key parts
    for line in output_text.splitlines():
        if line.startswith("Path:") or line.startswith("Line:") or line.startswith("Precision:"):
            console.print(f"[cyan]{line}[/cyan]", markup=True)
        elif line.startswith("Latest") or line.startswith("Task:"):
            console.print(f"[yellow]{line}[/yellow]", markup=True)
        elif line.startswith("Decisions:") or line.startswith("Verification") or line.startswith("## ") or line.startswith("# "):
            console.print(f"[bold magenta]{line}[/bold magenta]", markup=True)
        elif line.startswith("  - ") or line.startswith("- "):
            console.print(f"[green]{line}[/green]", markup=True)
        elif line.startswith("- Base:") or line.startswith("- Head:") or line.startswith("- Task") or line.startswith("- Files"):
            console.print(f"[white]{line}[/white]", markup=True)
        elif line.startswith("No patch") or line.startswith("Files:"):
            console.print(f"[dim]{line}[/dim]", markup=True)
        else:
            console.print(line, markup=False)

    svg = console.export_svg(title=title)
    return svg

def svg_to_png(svg_content, output_path):
    """Convert SVG to PNG using best available tool."""
    # Try cairosvg
    try:
        import cairosvg
        cairosvg.svg2png(bytestring=svg_content.encode(), write_to=output_path, scale=2)
        return True
    except ImportError:
        pass

    # Try rsvg-convert
    if subprocess.run(["which", "rsvg-convert"], capture_output=True).returncode == 0:
        with tempfile.NamedTemporaryFile(suffix=".svg", delete=False) as f:
            f.write(svg_content.encode())
            svg_path = f.name
        subprocess.run(["rsvg-convert", "-o", output_path, svg_path])
        os.unlink(svg_path)
        return True

    # Try inkscape
    if subprocess.run(["which", "inkscape"], capture_output=True).returncode == 0:
        with tempfile.NamedTemporaryFile(suffix=".svg", delete=False) as f:
            f.write(svg_content.encode())
            svg_path = f.name
        subprocess.run(["inkscape", "--export-type=png", f"--export-filename={output_path}", svg_path])
        os.unlink(svg_path)
        return True

    # Fallback: save as SVG
    svg_out = output_path.replace(".png", ".svg")
    with open(svg_out, "w") as f:
        f.write(svg_content)
    print(f"  (no PNG converter found — saved as {svg_out})", file=sys.stderr)
    return False

def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    sessions = get_session_ids()
    if len(sessions) < 2:
        print("ERROR: need at least 2 sessions in /tmp/gs-demo", file=sys.stderr)
        sys.exit(1)

    # ── cli-blame-line ──────────────────────────────────────────────────────────
    print("Rendering cli-blame-line...")
    blame_out = run_gs("blame", "auth.ts", "--line", "1")
    svg = render_svg(
        title="ghostshift blame auth.ts --line 1",
        prompt="$",
        command="ghostshift blame auth.ts --line 1",
        output_text=blame_out,
        width=860,
    )
    out_path = os.path.join(OUTPUT_DIR, "cli-blame-line.png")
    ok = svg_to_png(svg, out_path)
    # Always save SVG too
    with open(out_path.replace(".png", ".svg"), "w") as f:
        f.write(svg)
    print(f"  → {out_path} ({'ok' if ok else 'svg only'})")

    # ── cli-pr-summary ─────────────────────────────────────────────────────────
    print("Rendering cli-pr-summary...")
    pr_out = run_gs("pr-summary")
    svg = render_svg(
        title="ghostshift pr-summary",
        prompt="$",
        command="ghostshift pr-summary",
        output_text=pr_out,
        width=860,
    )
    out_path = os.path.join(OUTPUT_DIR, "cli-pr-summary.png")
    ok = svg_to_png(svg, out_path)
    with open(out_path.replace(".png", ".svg"), "w") as f:
        f.write(svg)
    print(f"  → {out_path} ({'ok' if ok else 'svg only'})")

if __name__ == "__main__":
    main()
