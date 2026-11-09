---
name: install-winter-clawd
description: Install winter-clawd on this machine from this cloned repository, together with its ice-blue "Winter Ice" logo theme. Use when the user asks to install, apply, enable or set up this repository or mod, e.g. "install this", "set this up", "이거 적용해줘", "설치해줘".
---

# Install winter-clawd from this clone

This repository is a Claude Code mod (a plugin of function hooks) and a one-entry plugin marketplace at the same time.
Install it from this folder, so updates come from a `git pull` here. Then install
the optional "Winter Ice" theme, which recolors the logo. Do the steps in order and report what each one did.

## 1. Check what is there

- `claude --version` must be 2.1.319 or later: the mod API is early access. If it is older, tell the user to update
  Claude Code (`claude update`) and stop.
- Find the config directory Claude Code uses: `$CLAUDE_CONFIG_DIR` if set, else `~/.claude`. Call it CONFIG below.
- Check whether a launcher manages that directory: if `CLAUDE_CONFIG_DIR` is set to anything other than `~/.claude`
  (for example an Orca account profile, `.../orca/claude-profiles/<id>/home`), assume the launcher copies
  `~/.claude/settings.json` over CONFIG's on every launch. Then every settings change below goes to
  `~/.claude/settings.json` first, and is copied to CONFIG's `settings.json` too so this session's next start sees it.
  Tell the user you are doing this and why.
- `claude plugin list` shows whether `winter-clawd` is already installed; if it is, say so, and still check the theme.

## 2. Install the plugin

From the repository root (this folder, as an absolute path):

```
claude plugin marketplace add <absolute path of this folder>
claude plugin install winter-clawd@winter-clawd --scope user
```

- Because the marketplace is a folder and its entry is `"source": "./"`, Claude Code reads the mod from this folder
  itself. Do not move or delete the clone afterwards; tell the user so.
- When a launcher manages CONFIG (step 1), run both commands with `CLAUDE_CONFIG_DIR` set to `~/.claude` so they
  write `enabledPlugins` and `extraKnownMarketplaces` into the global settings. That run creates a stub
  `~/.claude/.claude.json` when none existed before (the real global state file is `~/.claude.json`, outside the
  folder): check with `ls` before the run, and delete the stub afterwards only if it was not there before.
- Run `claude plugin validate <this folder>` if anything fails; README, LICENSE and icon warnings do not matter.

## 3. Install the "Winter Ice" theme

- Copy `extras/winter-ice.json` to `~/.claude/themes/winter-ice.json` (create the folder if needed). It must not live
  inside the plugin: plugin themes load after the first frame and show the orange logo for a moment at startup.
- When a launcher manages CONFIG, also make `CONFIG/themes` a link to `~/.claude/themes` if CONFIG has no `themes`
  folder yet (Windows: a directory junction, e.g. `New-Item -ItemType Junction -Path <CONFIG>\themes -Target
  $HOME\.claude\themes` in PowerShell; `cmd /c mklink /J` can hang under Git Bash). If CONFIG already has a `themes`
  folder, copy the file into it instead.
- Read the current `"theme"` in the settings file(s) from step 1 and tell the user what it was. Set
  `"theme": "custom:winter-ice"`, editing the JSON as JSON so every other key stays as it was. "Winter Ice" is the
  dark theme with an ice-blue Clawd; if the user was on a light theme, say that this switches them to dark and offer
  to put their old value back.

## 4. Finish

Tell the user, in their language:

- Start a new Claude Code session to see it: snow falls on the empty start screen and goes away when they send
  anything; `/clear` brings it back.
- `/winter snow`, `/winter scene` (a walking Clawd), `/winter random` (the default), `/winter off`.
- The snow fits itself to the screen, the status line included. If it pushes the logo off the top or leaves empty
  rows at the bottom, `/winter debug` prints the numbers it used; send them to the repository's issues.
- To update later: `git pull` in this folder, then `claude plugin update winter-clawd@winter-clawd` and a new session
  (or `/reload-plugins`).
