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

All game logic lives in `app.js` (~870 lines) as a single-file vanilla JS application. There are no modules, bundlers, or npm dependencies.

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
| `usedQuestionIndices` | Prevents the same question from appearing twice |
| `gameWon` | Whether the current/last game ended via win condition |
| `shownMidDifficultyToast` | Tracks whether the $6,250 difficulty milestone toast has fired |
| `shownHardDifficultyToast` | Tracks whether the $12,500 difficulty milestone toast has fired |

### Core Game Loop

```
DOMContentLoaded
  → fetch questions_difficulty_full.json → allQuestionsPool
  → [Player clicks Start]
  → generateLoanScenario() → currentLoan
  → newLoanQuestion() → selects question by loanTypeTag + difficulty
  → showQuestion() → renders to DOM
  → answerLoan() → validates, updates compliance/revenue, plays sound
  → processLoanRoundEnd() → awards revenue, logs history, checks win/game-over
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

| File | Status | Trigger |
|---|---|---|
| `correct.mp3` | ✅ present | Correct answer in `answerLoan()` |
| `wrong.mp3` | ✅ present | Wrong answer in `answerLoan()` |
| `powerup.mp3` | ✅ present | Power-up activation in `activatePowerUp()` |
| `penalty.mp3` | ✅ present | Revenue penalty (0 correct) in `processLoanRoundEnd()` |
| `event.mp3` | ❌ missing | Dynamic event trigger — silently falls back to dummy Audio |

All sounds are initialized at the top of `app.js` in a try/catch. Missing files do not throw; they fail silently on `.play()` via the Promise rejection handler.

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
Win condition:       $15,000 revenue → "Career Goal Achieved!" + Senior LO rank
Difficulty tier 1:   $6,250 → all difficulties unlocked (toast notification fires)
Difficulty tier 2:   $12,500 → medium + hard only (toast notification fires)
```

### Performance Tiers (end screen rank, `getPerformanceTier()`)

| Revenue | Title |
|---|---|
| < $5,000 | Loan Processor |
| $5,000–$9,999 | Associate LO |
| $10,000–$14,999 | Loan Officer |
| $15,000–$19,999 | Senior Loan Officer |
| ≥ $20,000 | VP of Lending |

### Leaderboard

Scores are saved to `localStorage` under the key `lotScores` (JSON array, max 10 entries, sorted by revenue descending). The start screen shows the top 5. Each entry includes: `name`, `revenue`, `compliance`, `correct`, `date`, `won`.

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

**Compliance meter**: `#complianceMeter` works the same way — `bg-success` / `bg-warning` / `bg-danger` driven by `updateFooterTotals()`. Thresholds: ≤25 = danger, ≤50 = warning, else success.

**Animate.css**: loaded from `cdn.jsdelivr.net` (already in CSP). Used for the event banner flash animation (`animate__animated animate__flash`).

## Deployment Notes

- The `htaccess` file configures Apache: forces HTTPS, sets Content Security Policy (allows Bootstrap CDN and Google Fonts), enables browser caching.
- CSP permits scripts only from `'self'` and `cdn.jsdelivr.net` — any new CDN scripts must be added to the CSP.
- Scores are saved to `localStorage` (key: `lotScores`) — no backend required. Top 5 shown on start screen.

## GitHub Workflow

Repository: `loan-officer-tycoon` on GitHub.

**After every meaningful update**, commit and push:
```bash
git add index.html style.css app.js CLAUDE.md
git commit -m "descriptive message"
git push
```
Do not commit `questions_difficulty_full.json` changes unless question content was intentionally edited — it is 103KB and rarely changes.

Sound files (`correct.mp3`, `wrong.mp3`, `powerup.mp3`, `penalty.mp3`) are committed to the repo. `event.mp3` is the only missing sound asset.
