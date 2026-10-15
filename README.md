<div align="center">

# <img src="docs/icon.svg" width="40" height="38" alt=""> prompt-pulse

A live timeline of every turn above the prompt, as a Claude Code mod:<br>
the main agent and each subagent on one time axis, color-coded, with tokens and cost.

<a href="https://code.claude.com/docs/en/plugins/overview"><img alt="Claude Code plugin" src="https://img.shields.io/badge/Claude_Code-plugin-D97757?style=flat&logo=claude&logoColor=white"></a>
<a href=".claude-plugin/plugin.json"><img alt="Plugin version" src="https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2FPressureKun%2Fclaude-prompt-pulse%2Fmain%2F.claude-plugin%2Fplugin.json&query=%24.version&label=version&prefix=v&color=blue&style=flat"></a>
<a href="LICENSE"><img alt="License: MIT" src="https://img.shields.io/github/license/PressureKun/claude-prompt-pulse?style=flat"></a>
<a href="https://www.typescriptlang.org/"><img alt="TypeScript hooks module" src="https://img.shields.io/badge/TypeScript-hooks_module-3178C6?style=flat&logo=typescript&logoColor=white"></a>
<a href="tests"><img alt="Tested with claude plugin test" src="https://img.shields.io/badge/tests-claude_plugin_test-4EBA65?style=flat"></a>
<a href="https://github.com/PressureKun/claude-prompt-pulse"><img alt="GitHub stars" src="https://img.shields.io/github/stars/PressureKun/claude-prompt-pulse?style=flat"></a>

<img alt="Built-in tools in blue" src="https://img.shields.io/badge/tools-built--in-5FAFFF?style=flat-square">
<img alt="MCP servers in magenta" src="https://img.shields.io/badge/MCP-servers-D75FD7?style=flat-square">
<img alt="Skills in yellow" src="https://img.shields.io/badge/skills-loaded-FFD75F?style=flat-square">
<img alt="Subagents as lanes, launches in orange" src="https://img.shields.io/badge/subagents-lanes-D97757?style=flat-square">
<img alt="Errors in red" src="https://img.shields.io/badge/errors-flagged-FF6B80?style=flat-square">
<img alt="Tokens and cost per turn" src="https://img.shields.io/badge/tokens_%26_cost-per_turn-6E7681?style=flat-square">
<img alt="Slash command /pulse" src="https://img.shields.io/badge/command-%2Fpulse-6E7681?style=flat-square">

<p><img src="docs/live.png" alt="A turn in progress: main waits on an MCP call while three subagents run, finish or fail"></p>

</div>

## What you see

### The live band

While a turn runs, a band sits above the prompt box. One lane per agent: `main` first, then each subagent as a tree under it.

| Part | Means |
| --- | --- |
| `◐ ◓ ◑ ◒` | still running (spins once a second) |
| `✓` / `✗` | finished / failed or interrupted |
| `main`, `Explore`, `general`, `Plan` … | the lane: the main agent, or the subagent's type |
| `▕██━━██▏` | the timeline, oldest on the left (see colors below) |
| `52s` | how long the lane has run (real time, not the bar's scale) |
| `9×` | tool calls in the lane (engine plumbing like `ToolSearch` is not counted) |
| `Bash×2 Read Grep` | built-in tools, by name, most used first |
| `⬡ figma yandex-tracker` | MCP servers the lane called |
| `✦ graphify` | skills the lane loaded |
| `⚠ 1` | calls that failed or were denied |
| `↑48k ↓2.1k` | tokens in (cache reads and writes included) / out |
| `$0.31` | what this turn has cost so far (main lane only) |
| `▸ context7` | the call the main agent is waiting on now |
| `· Find hook registrations` | the subagent's task, as it was launched |

Bar colors:

| Color | Means |
| --- | --- |
| 🟦 blue | built-in tool (`Bash`, `Read`, `Edit` …) |
| 🟪 magenta | MCP tool |
| 🟨 yellow | skill |
| 🟧 orange | launching a subagent |
| 🟥 red | a call that failed |
| `━` dim | the lane is alive but thinking, no call open |
| blank | the lane had not started yet, or had already ended |

Where several things happen in one cell, the one that matters more wins: error, then MCP, skill, agent launch, tool.

### History in the transcript

When a turn ends, its timeline is kept under the turn's closing line (`✻ Baked for 49s`), so you can scroll back and see how any earlier turn went: which agents ran, what failed, what it cost. An interrupted turn shows `✗`.

![Two finished turns in the transcript: one answered with two subagents, one interrupted](docs/history.png)

### Background agents

Agents sent to the background outlive the turn that started them. The band stays above the prompt until the last of them finishes, with the main lane already settled and the rest still spinning. Up to five agent lanes are shown; the rest are counted (`+1 more agents`).

![The turn is over, two background agents still running, six agents in all](docs/background.png)

### A time axis that fits long waits

The bar is not linear. It is cut at every moment a call started or ended, and each piece is as wide as the logarithm of its length. A two-minute wait on a browser shrinks to a few cells, and a call that took a split second still gets a cell of its own, so nothing quick disappears next to something slow. Real durations are in the column on the right.

![A two-minute MCP wait shares the bar with sub-second calls](docs/axis.png)

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install prompt-pulse --marketplace PressureKun/claude-prompt-pulse
```

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session). From a shell:

```
claude plugin install prompt-pulse --marketplace PressureKun/claude-prompt-pulse
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `PressureKun/claude-prompt-pulse`, then Add plugin.

To update later: `claude plugin update prompt-pulse`, then `/reload-plugins` in a running session.

## Commands

| Command | Does |
| --- | --- |
| `/pulse` | toggle the live band above the prompt |
| `/pulse on` / `/pulse off` | show / hide the live band |
| `/pulse history on` / `off` | keep / drop the timeline under each turn in the transcript |
| `/pulse status` | show the current settings |

Settings persist across sessions. The band can also be collapsed with `ctrl+x ctrl+a`.

With history off, the band keeps showing the last finished turn until the next one starts.

![Each /pulse command and what it answers](docs/commands.png)

## Develop

```
claude --plugin-dir ./           # run a session with the mod loaded
claude plugin validate ./
claude plugin test ./
```

The screenshots in `docs/` are drawn by the mod itself: `docs/screens/build.sh` runs the scenes in `docs/screens/scenes.tsx` through `claude plugin test`, takes the trees the mod's `Timeline` returns, and renders them to PNG with headless Chrome (macOS). The prompt, the tool rows and the prompt box around each timeline are context added by the renderer.

## License

MIT
