# prompt-pulse

A Claude Code mod that draws a compact timeline of each turn: the main agent and every subagent on one shared time axis, with what each was busy with color-coded.

```
◑ main     ▕██━━█████━━███━━█━━█━━━━━━██████━━━━━━━━▏    49s 7× Bash×3 ⬡ figma yandex-tracker context7 ✦ caveman-help ⚠ 1 ↑48k ↓2.1k $0.31 ▸ Bash
├✓Explore  ▕  ━██━━█━━━                              ▏     9s 2× Bash×2 ↑24k ↓310 · Scan commands dir
├✓Explore  ▕   ━━███━━━━━━━━                         ▏    14s 1× Bash ↑23k ↓280 · Scan plans dir
└✓general  ▕    ━██━━████━━━━━━━██━━━                ▏    23s 3× Bash ⬡ yandex-tracker×2 ↑40k ↓520 · Tracker lookup via MCP
```

- **One lane per agent**, subagents as a tree under `main`, with ◐ running / ✓ done / ✗ failed.
- **Bar colors:** blue tool, magenta MCP, yellow skill, orange agent launch, red error; `━` is thinking.
- **Non-linear axis:** cut at every call's start and end, each piece as wide as log(its length), so a two-minute wait shrinks and an instant call still gets its own cell. Real durations are in the right-hand column.
- **Right-hand side:** call count, tools, `⬡` MCP servers, `✦` skills, `⚠` errors, tokens (↑ in incl. cache, ↓ out), the turn's cost, and the tool running now. Same colors as the bar.
- **Live above the prompt** while the turn (or a background agent it started) runs; **kept in the transcript** under the turn's closing line once it ends.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install prompt-pulse --marketplace PressureKun/claude-prompt-pulse
```

Answer `y` to add the marketplace, then pick a scope. From a shell:

```
claude plugin install prompt-pulse --marketplace PressureKun/claude-prompt-pulse
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `PressureKun/claude-prompt-pulse`, then Add plugin.

## Commands

| Command | Does |
| --- | --- |
| `/pulse` | toggle the live band above the prompt |
| `/pulse on` / `/pulse off` | show / hide the live band |
| `/pulse history on` / `off` | keep / drop the timeline under each turn in the transcript |
| `/pulse status` | show the current settings |

Settings persist across sessions. The band can also be collapsed with `ctrl+x ctrl+a`.

## Develop

```
claude --plugin-dir ./           # run a session with the mod loaded
claude plugin validate ./
claude plugin test ./
```

## License

MIT
