# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Loan Officer Tycoon** is a browser-based educational game for training loan officers on mortgage lending regulations. Players process loan scenarios and answer compliance questions under a 90-second time limit.

## Running the Project

No build system — this is a static web application. Open directly in a browser or serve with any local HTTP server:

```bash
python -m http.server 8000
# then open http://localhost:8000
```

For production, deploy to an Apache server (the `htaccess` file enforces HTTPS and sets security headers).

## Architecture

All game logic lives in `app.js` (~762 lines) as a single-file vanilla JS application. There are no modules, bundlers, or npm dependencies.

### Game State (Global Variables in app.js)

| Variable | Purpose |
|---|---|
| `revenue` | Current player earnings in dollars |
| `complianceScore` | Player rating (0–150); hitting 0 ends the game |
| `timeLeft` | Countdown from 90 seconds |
| `currentLoan` | Active loan scenario object |
| `currentQuestions` | Questions queued for current loan |
| `allQuestionsPool` | All questions loaded from JSON, keyed by difficulty |
| `activeEvent` | Currently active market/compliance event (or null) |
| `usedQuestionIds` | Prevents the same question from appearing twice |

### Core Game Loop

```
DOMContentLoaded
  → fetch questions_difficulty_full.json → allQuestionsPool
  → [Player clicks Start]
  → generateLoanScenario() → currentLoan
  → newLoanQuestion() → selects question by loanTypeTag + difficulty
  → showQuestion() → renders to DOM
  → answerLoan() → validates, updates compliance/revenue, plays sound
  → processLoanRoundEnd() → awards revenue, logs history, checks game-over
  → loop back to generateLoanScenario()
```

### Difficulty Scaling (in `newLoanQuestion`)

Questions are filtered by revenue thresholds:
- `< $6,250`: easy + medium only
- `$6,250–$12,500`: all difficulties
- `> $12,500`: medium + hard only

### Question Data (`questions_difficulty_full.json`)

```json
{
  "easy": [
    {
      "q": "Question text",
      "type": "multi" | "yesno",
      "options": ["A", "B", "C"],
      "correct": "answer string",
      "explanation": "Why this is correct",
      "loanTypeTag": "General|Purchase|Refinance|Jumbo|Construction|FHALoan",
      "regulationTag": "General|TILA|TRID|PMI|ECOA|VA|Appraisal",
      "difficulty": "easy"
    }
  ],
  "medium": [...],
  "hard": [...]
}
```

Questions are matched to loan types using `loanTypeTag`. A question tagged "General" can appear for any loan type.

### Loan Types and Scoring

| Loan Type | Revenue Multiplier | Questions |
|---|---|---|
| Std. Purchase | 1.0× | 1 |
| Quick Refi | 0.9× | 1 |
| Jumbo Loan | 1.5× | 2 |
| FHA Buyer | 1.1× | 1 |
| Construction | 1.3× | 2 |

Revenue = random loan amount ($100K–$999K) × 0.25–0.75% × multiplier × event modifier.

### Dynamic Events System

After 2+ loans, there's a 25% chance of triggering one of four events that modify revenue or compliance penalties for 2–3 loans. Events are tracked in `activeEvent` and display a banner alert.

### Sound Assets

`correct.mp3` and `wrong.mp3` exist. The code references `powerup.mp3`, `penalty.mp3`, and `event.mp3` — these files are missing and silently fall back to a dummy Audio object.

## Key Game Constants (app.js)

```js
Initial timer:       90 seconds
Time bonus:          +3s per perfect loan
Compliance start:    100
Compliance range:    0–150
Correct answer:      +5 compliance
Wrong answer:        -15 compliance (doubled during Internal Audit event)
Power-up cost:       $2,500 revenue → +10 seconds (once per game)
Power-up trigger:    every 5 correct answers with revenue ≥ $2,500
```

## Frontend Design System

The UI uses a **"Dark Finance Terminal"** aesthetic — deep navy backgrounds, gold/emerald/crimson accents, glassmorphic cards.

**Typography** (loaded from Google Fonts):
- `Cinzel` — brand, headings, titles
- `Rajdhani` — all numbers, stats, buttons
- `DM Sans` — body copy

**CSS Variables** (defined in `:root` in `style.css`):
- `--gold: #c9a227` — revenue, accents, CTAs
- `--emerald: #00c896` — correct answers, positive states
- `--crimson: #e63946` — wrong answers, compliance warnings
- `--sky: #3a8fe8` — process loan button, multiple choice options
- `--bg-deep: #060a15` — page background
- `--bg-surface` — glassmorphic card background

**Layout**: CSS Grid (`game-grid`) with main panel + sticky history sidebar. Collapses to single column below 960px.

**Critical**: `app.js` generates buttons with Bootstrap class names (`btn-success`, `btn-danger`, `btn-outline-primary`, `alert-success`, `alert-danger`). These are overridden in `style.css` — do not remove the Bootstrap CDN link or those override rules.

**Timer bar**: `#timerProgressBar` receives `bg-success` / `bg-warning` / `bg-danger` classes from JS. All three are styled via `.timer-fill.bg-*` rules in CSS.

## Deployment Notes

- The `htaccess` file configures Apache: forces HTTPS, sets Content Security Policy (allows Bootstrap CDN and Google Fonts), enables browser caching.
- CSP permits scripts only from `'self'` and `cdn.jsdelivr.net` — any new CDN scripts must be added to the CSP.
- No backend — score submission currently only logs to the browser console.

## GitHub Workflow

Repository: `loan-officer-tycoon` on GitHub.

**After every meaningful update**, commit and push:
```bash
git add index.html style.css app.js CLAUDE.md
git commit -m "descriptive message"
git push
```
Do not commit `questions_difficulty_full.json` changes unless question content was intentionally edited — it is 103KB and rarely changes.
