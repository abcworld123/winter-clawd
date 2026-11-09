# winter-clawd

A Claude Code mod that lets it snow on the empty start screen, under the logo.

- **snow**: snow falls over the whole empty area.
- **scene**: snow piles up on the ground, and an ice-blue Clawd walks around in it, leaving footprints, blinking
  and collecting snow on its head.

Every session (and every `/clear`) gets its own random snowfall, wind and walk. The snow goes away as soon as you
send anything, and comes back after `/clear`.

## Requirements

- Claude Code 2.1.319 or later. The mod API is early access and may change between releases.
- The fullscreen terminal layout, where the conversation grows down from the logo and the empty space sits above the
  prompt. On the main-screen layout the snow still shows, but its height is not fitted to the screen.

## Install

### With Claude Code (easiest)

```
git clone https://github.com/abcworld123/winter-clawd
cd winter-clawd
claude
```

Then ask Claude to install it ("install this"). The repository ships a skill
([`.claude/skills/install-winter-clawd`](.claude/skills/install-winter-clawd/SKILL.md)) that installs the plugin from
the clone, adds the ice-blue logo theme and tells you what it changed. Keep the clone: it is the plugin's
marketplace. To update, `git pull` there, then `claude plugin update winter-clawd@winter-clawd` and start a new
session.

### By hand

At the Claude Code prompt:

```
/plugin install winter-clawd --marketplace abcworld123/winter-clawd
```

Answer `y` to add the marketplace and pick the user scope. From a shell:

```
claude plugin install winter-clawd --marketplace abcworld123/winter-clawd
```

The snow starts with the next session.

## Usage

```
/winter            show the snow again on the start screen
/winter snow       falling snow only
/winter scene      snow, a snow pile and a walking Clawd
/winter random     snow or scene, picked per session (the default)
/winter off        no snow
/winter debug      print the row measurements (see Tuning)
```

The choice is remembered across sessions. Typed in the middle of a conversation, it takes effect on the next start
screen.

## Ice-blue logo (optional)

The mod cannot recolor the logo itself, but a custom theme can. Copy [`extras/winter-ice.json`](extras/winter-ice.json)
to `~/.claude/themes/winter-ice.json`, then pick **Winter Ice** in `/theme` (or set `"theme": "custom:winter-ice"` in
`~/.claude/settings.json`). It is the dark theme with an ice-blue Clawd.

Keep the theme in `~/.claude/themes` rather than inside a plugin: Claude Code loads plugin themes after the first
frame, so a plugin theme shows the orange logo for a moment at startup.

## How it fits the screen

No API reports how tall the conversation is, so the snow row adds up the heights the transcript rows report and
subtracts them from the screen height, together with:

- the logo block, 5 rows (`HEADER_ROWS` in `hooks/register.tsx`);
- the bottom block (notice line, prompt, status line), measured at run time: Claude Code caps the band above the
  prompt at half the terminal with the prompt block included, so half the rows less the band's room is the bottom
  block's height, whatever your status line is. Until that is measured it assumes 10 rows (a six-line status line).

If the snow still pushes the logo off the top or leaves empty rows at the bottom, `/winter debug` prints every
number it used.

## Known limits

- On Enter, the screen scrolls up two or three rows for about 0.1 s before the snow goes away: Claude Code draws your
  message before any mod hears about it.
- A row Claude Code draws under the logo without reporting its height (possibly the "Updated to latest" notice after
  an update) scrolls the logo up by that many rows for that session.
- The notice line right above the prompt (`● high · /effort` and the like) belongs to Claude Code; the snow stops
  right above it.
