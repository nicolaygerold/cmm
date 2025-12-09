# cmm

It's just a small CLI helper that generates commit messages based on your diff (unstaged and staged changes by default use `-s` for staged only and `-u` for unstaged only).

## Setup

```bash
bun run setup
```

This installs deps and links `cmm` globally. First run will ask for your [Google AI API key](https://aistudio.google.com/apikey) and save it to `~/.config/cmm/config.json`.

## Usage

```bash
cmm           # analyze both staged and unstaged
cmm -s        # staged only
cmm -u        # unstaged only
cmm -e        # creates a temp file with the generated commit message, requires staged changes
cmm -h        # help
```

Run it in any git repo with changes. Outputs a commit message following conventional commits format.

## Tailor to your needs

The prompt lives in `index.ts`. Tweak the commit types, rules, or style to match your project conventions.
