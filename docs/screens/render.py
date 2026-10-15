"""Turns the trees scenes.tsx printed into terminal-style PNGs.

usage: render.py <test output> <docs dir> <scratch dir>

The rows a frame shows around the mod's drawing (the prompt, the engine's
turn line, the prompt box) are set here, plain context; every timeline row
is the tree the mod's Timeline returned, cell for cell.
"""

import html
import json
import os
import subprocess
import sys

COLS = 165
CELL_W = 8.6
LINE_H = 20
FONT = 14
PAD = 18
BAR_H = 34
MARGIN = 28

FG = "#e6e3de"
DIM = "#7d7a75"
BG = "#17181b"
COLORS = {"claude": "#d97757", "success": "#4eba65", "error": "#ff6b80", "suggestion": "#b1b9f9"}
# Glyphs Menlo lacks: the fallback font draws them wider than a cell.
SMALL = set("◐◓◑◒⬡✦⚠✓✗")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"


def color(name):
    return COLORS.get(name, name)


def flatten(node, style, out):
    """A Text and its children as (text, style) runs."""
    if isinstance(node, str):
        out.append((node, style))
        return
    if not isinstance(node, dict):
        return
    props = node.get("props") or {}
    st = dict(style)
    if "color" in props:
        st["color"] = color(props["color"])
    for key in ("dimColor", "bold"):
        if props.get(key):
            st[key] = True
    for child in node.get("children") or []:
        flatten(child, st, out)


def rows_of(tree):
    """A column Box of Text rows, one row each."""
    rows = []
    for child in tree.get("children") or []:
        runs = []
        flatten(child, {}, runs)
        rows.append(runs)
    return rows


def plain(text, **style):
    return [(text, style)]


def truncate(runs, cols):
    out, used = [], 0
    for text, st in runs:
        if used + len(text) > cols:
            out.append((text[: max(0, cols - used - 1)] + "…", st))
            return out
        out.append((text, st))
        used += len(text)
    return out


def cell_html(runs):
    parts = []
    for text, st in truncate(runs, COLS):
        css = []
        fg = st.get("color")
        if st.get("dimColor") and not fg:
            fg = DIM
        if fg:
            css.append(f"color:{fg}")
        if st.get("dimColor") and st.get("color"):
            css.append("opacity:.6")
        if st.get("bold"):
            css.append("font-weight:700")
        style = f' style="{";".join(css)}"' if css else ""
        cells = "".join(
            f'<i class="s">{ch}</i>' if ch in SMALL else f"<i>{html.escape(ch) if ch != ' ' else '&nbsp;'}</i>"
            for ch in text
        )
        parts.append(f"<span{style}>{cells}</span>")
    return f'<div class="row">{"".join(parts) or "&nbsp;"}</div>'


def page(title, rows):
    w = COLS * CELL_W + 2 * PAD
    h = len(rows) * LINE_H + 2 * PAD + BAR_H
    body = "\n".join(cell_html(r) for r in rows)
    doc = f"""<!doctype html><meta charset="utf-8"><style>
html,body{{margin:0;background:linear-gradient(135deg,#2b2d33,#1d1e22);}}
.win{{position:absolute;left:{MARGIN}px;top:{MARGIN}px;width:{w}px;height:{h}px;background:{BG};
border-radius:10px;box-shadow:0 12px 36px rgba(0,0,0,.45),0 0 0 1px rgba(255,255,255,.07);overflow:hidden}}
.bar{{height:{BAR_H}px;display:flex;align-items:center;padding:0 14px;gap:8px;background:#232428;
font:12px -apple-system,system-ui,sans-serif;color:#8d8a85}}
.bar b{{width:12px;height:12px;border-radius:50%;display:inline-block}}
.bar span{{flex:1;text-align:center;margin-right:52px}}
.term{{padding:{PAD}px;font:{FONT}px/{LINE_H}px Menlo,"SF Mono",monospace;color:{FG}}}
.row{{height:{LINE_H}px;white-space:pre}}
i.s{{font-size:{FONT - 3}px}}
i{{font-style:normal;display:inline-block;width:{CELL_W}px;text-align:center;overflow:visible}}
</style><div class="win"><div class="bar"><b style="background:#ff5f57"></b><b style="background:#febc2e"></b>
<b style="background:#28c840"></b><span>{html.escape(title)}</span></div><div class="term">{body}</div></div>"""
    return doc, int(w + 2 * MARGIN), int(h + 2 * MARGIN)


def shoot(doc, width, height, html_path, png_path):
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(doc)
    subprocess.run(
        [
            CHROME,
            "--headless=new",
            "--disable-gpu",
            "--hide-scrollbars",
            "--force-device-scale-factor=2",
            f"--window-size={width},{height}",
            f"--screenshot={png_path}",
            f"file://{html_path}",
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )


def rule():
    return plain("─" * COLS, dimColor=True)


def prompt_box(hint="? for shortcuts"):
    return [rule(), plain("> ", bold=True), rule(), plain("  " + hint, dimColor=True)]


def user(text):
    return [("> ", {"dimColor": True}), (text, {})]


def main():
    log, docs, scratch = sys.argv[1:4]
    os.makedirs(scratch, exist_ok=True)
    scenes, commands = {}, []
    with open(log, encoding="utf-8") as f:
        for line in f:
            if line.startswith("@@SCENE "):
                _, name, payload = line.rstrip("\n").split(" ", 2)
                scenes[name] = rows_of(json.loads(payload))
            elif line.startswith("@@COMMANDS "):
                commands = json.loads(line[len("@@COMMANDS "):])

    blank = plain("")
    frames = {
        "live": [
            user("Wire the tracker issue into the migration plan and check the Figma frames"),
            blank,
            [("⏺ ", {"color": color("success")}), ("figma - get_design_context (MCP)", {"bold": True})],
            plain("  ⎿  Received 412 lines", dimColor=True),
            blank,
            [("✻ ", {"color": color("claude")}), ("Musing… ", {"color": color("claude")}),
             ("(52s · ↑ 48.2k tokens · esc to interrupt)", {"dimColor": True})],
            blank,
            *scenes["live"],
            *prompt_box(),
        ],
        "history": [
            user("Refactor the slash commands and plans loaders"),
            blank,
            [("⏺ ", {}), ("Both loaders now share one parser; tests pass.", {})],
            blank,
            plain("✻ Baked for 49s", dimColor=True),
            *scenes["answered"],
            blank,
            user("Run the full e2e suite"),
            blank,
            [("⏺ ", {}), ("Bash", {"bold": True}), ("(pnpm e2e)", {})],
            plain("  ⎿  Interrupted · What should Claude do instead?", color=color("error")),
            blank,
            plain("✻ Churned for 12s", dimColor=True),
            *scenes["aborted"],
            blank,
            *prompt_box(),
        ],
        "background": [
            user("Fan out: map the API, find dead exports, plan the cache rewrite, bump deps, run e2e"),
            blank,
            [("⏺ ", {}), ("Started six agents; the e2e run and the dependency bump continue in the background.", {})],
            blank,
            plain("✻ Baked for 31s", dimColor=True),
            blank,
            *scenes["background"],
            *prompt_box(),
        ],
        "axis": [
            user("Profile the dashboard page in Chrome and fix the slow render"),
            blank,
            [("⏺ ", {}), ("The list re-rendered on every scroll event; memoized it.", {})],
            blank,
            plain("✻ Cooked for 2m 8s", dimColor=True),
            *scenes["axis"],
        ],
    }

    cmd_rows = []
    for args, text in commands:
        cmd_rows.append(user(f"/pulse {args}".rstrip()))
        cmd_rows.append([("  ⎿  ", {"dimColor": True}), (text, {})])
        cmd_rows.append(blank)
    frames["commands"] = cmd_rows + prompt_box()

    os.makedirs(docs, exist_ok=True)
    for name, rows in frames.items():
        doc, w, h = page("claude — prompt-pulse", rows)
        png = os.path.join(docs, f"{name}.png")
        shoot(doc, w, h, os.path.join(scratch, f"{name}.html"), png)
        print(png)


if __name__ == "__main__":
    main()
