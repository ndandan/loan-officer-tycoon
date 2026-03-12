// Global variables for game state
let revenue = 0;
let complianceScore = 100;
const MIN_COMPLIANCE_SCORE_GAME_OVER = 0;
let timeLeft = 60; // This will be set to INITIAL_TIME in startGame
const INITIAL_TIME = 90;
const TIME_BONUS_CORRECT_LOAN = 3; // Seconds to add for a perfectly processed loan
let gameInterval;
let questionsPerLoan = 1;
let currentLoan = {
    type: "Standard Purchase",
    description: "A standard loan application.",
    baseValue: 0,
    potentialRevenue: 0,
    numQuestions: 1,
    loanTypeTag: "General"
};
let currentQuestions = [];
let currentQuestionIndex = 0;
let currentLoanCorrectAnswers = 0;

let allQuestionsPool = [];
let usedQuestionIndices = new Set();
let missedQuestionsForReview = [];

let totalCorrectAnswersInGame = 0;
let totalRevenueEarnedInGame = 0;

// Pause feature variables removed:
// let isPaused = false;
// let isInterRoundPaused = false;
// let interRoundPauseTimeoutId = null;

let powerUpAvailable = false;
let powerUpUsedThisGame = false;
const POWER_UP_COST = 2500;
const REVENUE_THRESHOLD_FOR_HARDER_QUESTIONS = 12500;

let activeEvent = null;
let eventChance = 0.25;
let loansSinceLastEvent = 0;
const LOANS_BETWEEN_EVENT_CHECKS = 2;

// Sound effects
let correctSound, wrongSound, powerUpSound, penaltySound, eventSound;
try {
    correctSound = new Audio("correct.mp3");
    wrongSound = new Audio("wrong.mp3");
    powerUpSound = new Audio("powerup.mp3");
    penaltySound = new Audio("penalty.mp3");
    eventSound = new Audio("event.mp3");
} catch (e) {
    console.warn("Could not initialize audio files. Make sure they exist at the correct path.", e);
    const dummyAudio = { play: () => Promise.resolve().catch(err => console.warn("Dummy audio play error:", err)), pause: () => {}, currentTime: 0 };
    correctSound = correctSound || dummyAudio;
    wrongSound = wrongSound || dummyAudio;
    powerUpSound = powerUpSound || dummyAudio;
    penaltySound = penaltySound || dummyAudio;
    eventSound = eventSound || dummyAudio;
}


// DOM Elements
const revenueDisplay = document.getElementById("revenue");
const complianceScoreDisplay = document.getElementById("complianceScore");
const timeDisplay = document.getElementById("time");
const timerProgressBar = document.getElementById("timerProgressBar");
const loanBtn = document.getElementById("loanBtn"); // Text will be "Process Next Loan"
const loanDetailsDisplay = document.getElementById("loanDetails");
const clientProfileDetailsDisplay = document.getElementById("clientProfileDetails");
const loanScenarioDisplay = document.getElementById("loanScenarioDisplay");
const questionBox = document.getElementById("questionBox");
const loanQuestionDisplay = document.getElementById("loanQuestion");
const questionCounterDisplay = document.getElementById("questionCounter");
const answerOptionsDisplay = document.getElementById("answerOptions");
const feedbackArea = document.getElementById("feedbackArea");
const endScreen = document.getElementById("endScreen");
const finalRevenueDisplay = document.getElementById("finalRevenue");
const finalComplianceScoreDisplay = document.getElementById("finalComplianceScore");
const gameOverReasonDisplay = document.getElementById("gameOverReason");
const scoreForm = document.getElementById("scoreForm");
const playerNameInput = document.getElementById("playerName");
const submitBtn = document.getElementById("submitBtn");
const replayBtn = document.getElementById("replayBtn");
const startScreen = document.getElementById("startScreen");
const gameUILayout = document.getElementById("gameUILayout");
const historyPanel = document.getElementById("historyPanel");
const loanHistoryTableBody = document.getElementById("loanHistory");
const totalResultDisplay = document.getElementById("totalResult");
const totalCorrectDisplay = document.getElementById("totalCorrect");
const startBtn = document.getElementById("startBtn");
// const pauseBtn = document.getElementById("pauseBtn"); // Pause button removed
const powerUpBtn = document.getElementById("powerUpBtn");
const missedQuestionsReviewPanel = document.getElementById("missedQuestionsReviewPanel");
const missedQuestionsList = document.getElementById("missedQuestionsList");
const eventAnnouncementDisplay = document.getElementById("eventAnnouncement");

// Loan Product Definitions
const loanProducts = [
    { type: "Std. Purchase", description: "Typical home purchase.", numQuestions: 1, baseRevenueMultiplier: 1.0, loanTypeTag: "Purchase" },
    { type: "Quick Refi", description: "Rate & term refinance.", numQuestions: 1, baseRevenueMultiplier: 0.9, loanTypeTag: "Refinance" },
    { type: "Jumbo Loan", description: "High-value property review.", numQuestions: 2, baseRevenueMultiplier: 1.5, loanTypeTag: "Jumbo" },
    { type: "FHA Buyer", description: "First-time FHA buyer.", numQuestions: 1, baseRevenueMultiplier: 1.1, loanTypeTag: "Purchase", regulationTagFocus: "FHALoan" },
    { type: "Construction", description: "Construction draw request.", numQuestions: 2, baseRevenueMultiplier: 1.3, loanTypeTag: "Construction" }
];

// Dynamic Event Definitions
const dynamicEvents = [
    { id: "InterestRateFluctuation_Up", message: "Market Boom! Revenues +25% for next 2 loans!", durationLoans: 2, effectType: "revenue", modifier: 1.25 },
    { id: "InterestRateFluctuation_Down", message: "Market Slump! Revenues -20% for next 2 loans!", durationLoans: 2, effectType: "revenue", modifier: 0.80 },
    { id: "InternalAuditWeek", message: "Internal Audit! Penalties & compliance hits DOUBLED for next 3 loans!", durationLoans: 3, effectType: "penalty", modifier: 2 },
    { id: "ComplianceFocus_TRID", message: "TRID Focus! Extra compliance scrutiny on TRID questions for next 3 loans!", durationLoans: 3, effectType: "regulationFocus", regulation: "TRID", compliancePenaltyModifier: 1.5 },
];


async function loadQuestions() {
  try {
    const response = await fetch('questions_difficulty_full.json');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const rawQuestionsData = await response.json();
    allQuestionsPool = [];
    for (const difficultyLevel of ['easy', 'medium', 'hard']) {
      if (rawQuestionsData[difficultyLevel] && Array.isArray(rawQuestionsData[difficultyLevel])) {
        rawQuestionsData[difficultyLevel].forEach(q => {
          const questionText = q.q || q.question || q.text;
          if (questionText) {
            allQuestionsPool.push({
              q: questionText, type: q.type, options: q.options || null,
              correct: q.correct, difficulty: difficultyLevel,
              explanation: q.explanation || `The correct answer is: ${q.correct}.`,
              loanTypeTag: q.loanTypeTag || "General",
              regulationTag: q.regulationTag || "General"
            });
          }
        });
      }
    }
    if (allQuestionsPool.length === 0) {
        console.error("Error: No questions could be loaded.");
        if(loanBtn) loanBtn.disabled = true;
        if(loanDetailsDisplay) loanDetailsDisplay.innerText = "No questions available to load.";
    }
  } catch (error) {
    console.error("Failed to load questions:", error);
    if(loanDetailsDisplay) loanDetailsDisplay.innerText = "Failed to load questions. Check console.";
    if(loanBtn) loanBtn.disabled = true;
  }
}

function generateLoanScenario() {
    const selectedProduct = loanProducts[Math.floor(Math.random() * loanProducts.length)];
    currentLoan.type = selectedProduct.type;
    currentLoan.description = selectedProduct.description;
    currentLoan.numQuestions = selectedProduct.numQuestions;
    currentLoan.loanTypeTag = selectedProduct.loanTypeTag;
    currentLoan.regulationTagFocus = selectedProduct.regulationTagFocus || null;
    const baseSizes = [257893, 458201, 189347, 762050, 298511, 150789, 123456, 555890, 201023, 999888, 275000, 333333, 150050, 678910, 211234, 250000, 100000, 888888, 234567, 110000, 176543, 432109, 265432, 789012, 198765, 222222, 135791, 654321, 287654, 101010, 160504, 500000, 240302, 850150, 112233, 200000, 144455, 700700, 222222, 300000, 181818, 600000, 200000, 950000, 125000, 400000, 290000, 175000, 155000, 825000];
    currentLoan.baseValue = baseSizes[Math.floor(Math.random() * baseSizes.length)] + Math.floor(Math.random() * 5000);
    let potentialRev = Math.floor(currentLoan.baseValue * (0.0025 + Math.random() * 0.005) * selectedProduct.baseRevenueMultiplier);
    if (activeEvent && activeEvent.effectType === "revenue" && activeEvent.loansAffected < activeEvent.durationLoans) {
        potentialRev = Math.floor(potentialRev * activeEvent.modifier);
    }
    currentLoan.potentialRevenue = potentialRev;
    if(loanDetailsDisplay) loanDetailsDisplay.innerText = `Loan Type: ${currentLoan.type} | Amount: $${currentLoan.baseValue.toLocaleString()}`;
    if(clientProfileDetailsDisplay) clientProfileDetailsDisplay.innerText = `${currentLoan.description} | Potential Revenue: $${currentLoan.potentialRevenue.toLocaleString()}`;
    if(loanScenarioDisplay) loanScenarioDisplay.style.display = 'block';
}

function resumeMainTimer() {
    clearInterval(gameInterval);
    // Removed isPaused and isInterRoundPaused checks as features are removed
    if (timeLeft > 0) {
        gameInterval = setInterval(updateTimer, 1000);
    }
}

function stopMainTimer() {
    clearInterval(gameInterval);
}

function newLoanQuestion() {
  // Removed interRoundPause logic
  // if (isPaused) return; // Pause feature removed

  if(feedbackArea) feedbackArea.style.display = 'none';
  if(loanBtn) loanBtn.disabled = true; // Grey out button immediately

  generateLoanScenario();
  questionsPerLoan = currentLoan.numQuestions;

  let allowedDifficulties = ['easy', 'medium'];
  if (revenue >= REVENUE_THRESHOLD_FOR_HARDER_QUESTIONS) {
    allowedDifficulties = ['medium', 'hard'];
  } else if (revenue >= REVENUE_THRESHOLD_FOR_HARDER_QUESTIONS / 2) {
    allowedDifficulties = ['easy', 'medium', 'hard'];
  }

  const availableQuestionIndicesThisRound = allQuestionsPool
    .map((question, index) => ({ question, index }))
    .filter(item =>
        (item.question.loanTypeTag === currentLoan.loanTypeTag ||
         (currentLoan.regulationTagFocus && item.question.regulationTag === currentLoan.regulationTagFocus) ||
         item.question.loanTypeTag === "General") &&
        allowedDifficulties.includes(item.question.difficulty) &&
        !usedQuestionIndices.has(item.index)
    )
    .map(item => item.index);

  if (availableQuestionIndicesThisRound.length < questionsPerLoan) {
    let message = `Not enough unique '${currentLoan.loanTypeTag}' or 'General' questions remaining`;
     if (revenue >= REVENUE_THRESHOLD_FOR_HARDER_QUESTIONS) message += " from Medium/Hard difficulties!";
     else message += "!";
    if(loanDetailsDisplay) loanDetailsDisplay.innerText = message;
    if(clientProfileDetailsDisplay) clientProfileDetailsDisplay.innerText = "Consider replaying to see all questions.";
    // loanBtn remains disabled
    stopMainTimer();
    return;
  }

  currentQuestions = [];
  let tempAvailableIndices = [...availableQuestionIndicesThisRound];
  for (let i = 0; i < questionsPerLoan; i++) {
    if (tempAvailableIndices.length === 0) break;
    const randomIndexFromArray = Math.floor(Math.random() * tempAvailableIndices.length);
    const actualQuestionPoolIndex = tempAvailableIndices.splice(randomIndexFromArray, 1)[0];
    usedQuestionIndices.add(actualQuestionPoolIndex);
    currentQuestions.push(allQuestionsPool[actualQuestionPoolIndex]);
  }

  if (currentQuestions.length < questionsPerLoan) {
      if(loanDetailsDisplay) loanDetailsDisplay.innerText = "Could not gather enough unique questions for this round.";
      if(clientProfileDetailsDisplay) clientProfileDetailsDisplay.innerText = "";
      // loanBtn remains disabled
      stopMainTimer();
      return;
  }

  currentQuestionIndex = 0;
  currentLoanCorrectAnswers = 0;

  showQuestion(); // This will keep loanBtn disabled
  resumeMainTimer();

  if (!powerUpUsedThisGame && totalCorrectAnswersInGame > 0 && totalCorrectAnswersInGame % 5 === 0 && revenue >= POWER_UP_COST) {
      powerUpAvailable = true;
      if(powerUpBtn) {
        powerUpBtn.innerHTML = `+10 Sec (Cost: $${POWER_UP_COST.toLocaleString()})`;
        powerUpBtn.style.display = 'block';
        powerUpBtn.disabled = false;
      }
  } else if (powerUpAvailable && revenue < POWER_UP_COST) {
      if(powerUpBtn) {
        powerUpBtn.disabled = true;
        powerUpBtn.innerHTML = `+10 Sec (Need $${POWER_UP_COST.toLocaleString()})`;
      }
  }

  loansSinceLastEvent++;
  tryTriggerDynamicEvent();
}

function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function showQuestion() {
  if (currentQuestionIndex >= currentQuestions.length || !currentQuestions[currentQuestionIndex]) {
    processLoanRoundEnd();
    return;
  }
  const q = currentQuestions[currentQuestionIndex];
  const questionText = q.q || "Question text missing";
  const difficultyText = q.difficulty ? `(${q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1)})` : "";

  if(loanQuestionDisplay) loanQuestionDisplay.innerText = `${questionText} ${difficultyText}`;
  if(questionCounterDisplay) questionCounterDisplay.innerText = `Question ${currentQuestionIndex + 1} of ${questionsPerLoan}`;

  if(answerOptionsDisplay) {
    answerOptionsDisplay.innerHTML = "";

    if (q.type === "yesno") {
      const yesButton = document.createElement('button');
      yesButton.className = "btn btn-success shadow-sm";
      yesButton.textContent = "Yes";
      yesButton.addEventListener('click', () => answerLoan(true));
      answerOptionsDisplay.appendChild(yesButton);

      const noButton = document.createElement('button');
      noButton.className = "btn btn-danger shadow-sm";
      noButton.textContent = "No";
      noButton.addEventListener('click', () => answerLoan(false));
      answerOptionsDisplay.appendChild(noButton);

    } else if (q.type === "multi" && Array.isArray(q.options)) {
      const shuffledOptions = [...q.options];
      shuffleArray(shuffledOptions);
      shuffledOptions.forEach(option => {
        const button = document.createElement("button");
        button.className = "btn btn-outline-primary shadow-sm";
        button.textContent = option;
        button.addEventListener('click', () => answerLoan(option));
        answerOptionsDisplay.appendChild(button);
      });
    } else {
      if(loanQuestionDisplay) loanQuestionDisplay.innerText = "Error: Question type not supported or options missing.";
    }
  }
  if(loanBtn) loanBtn.disabled = true; // Keep "Process Next Loan" disabled while question is active
  if(questionBox) questionBox.style.display = "block";
}

function answerLoan(userAnswer) {
  // Removed pause checks
  const q = currentQuestions[currentQuestionIndex];
  if (!q) return;

  const correctAnswer = q.correct;
  const isThisQuestionCorrect = (userAnswer === correctAnswer);

  if(questionBox) {
    questionBox.classList.remove('question-feedback-correct', 'question-feedback-incorrect');
    void questionBox.offsetWidth;
    questionBox.classList.add(isThisQuestionCorrect ? 'question-feedback-correct' : 'question-feedback-incorrect');
  }

  let complianceChange = 0;
  if (isThisQuestionCorrect) {
    currentLoanCorrectAnswers++;
    complianceChange = 5; // Compliance improves for correct answer
    try { correctSound.play().catch(e => console.warn("Correct sound play failed", e)); } catch(e){}
    if(feedbackArea) {
        feedbackArea.className = 'mt-3 alert alert-success';
        feedbackArea.textContent = `Correct! ${q.explanation}`;
    }
  } else {
    let baseCompliancePenalty = 15; // Compliance penalty for incorrect answer
    if (activeEvent && activeEvent.effectType === "penalty" && activeEvent.loansAffected < activeEvent.durationLoans) {
        baseCompliancePenalty *= activeEvent.modifier;
    }
    if (activeEvent && activeEvent.effectType === "regulationFocus" && activeEvent.regulation === q.regulationTag && activeEvent.loansAffected < activeEvent.durationLoans) {
        baseCompliancePenalty *= (activeEvent.compliancePenaltyModifier || 1.5);
    }
    complianceChange = -baseCompliancePenalty;
    try { wrongSound.play().catch(e => console.warn("Wrong sound play failed", e)); } catch(e){}
    if(feedbackArea) {
        feedbackArea.className = 'mt-3 alert alert-danger';
        feedbackArea.textContent = `Incorrect. The correct answer was: ${correctAnswer}. ${q.explanation}`;
    }
    if (!missedQuestionsForReview.find(mq => mq.q === q.q)) {
        missedQuestionsForReview.push(q);
    }
  }
  // Apply compliance change immediately after each answer
  complianceScore = Math.max(0, Math.min(150, complianceScore + complianceChange));
  updateFooterTotals(); // Update display immediately

  if(feedbackArea) feedbackArea.style.display = 'block';
  if(answerOptionsDisplay) {
    Array.from(answerOptionsDisplay.children).forEach(button => button.disabled = true);
  }
  currentQuestionIndex++;

  // Shortened delay or direct progression
  const feedbackDisplayTime = 1000; // 1 second to show feedback
  setTimeout(() => {
    if(questionBox) {
        questionBox.classList.remove('question-feedback-correct', 'question-feedback-incorrect');
    }
    if (currentQuestionIndex < currentQuestions.length) {
      showQuestion(); // Show next question in the same loan
    } else {
      processLoanRoundEnd(); // All questions for this loan done
    }
  }, feedbackDisplayTime);
}

// *** MODIFIED FUNCTION BELOW ***
function processLoanRoundEnd() {
    let roundRevenueChange = 0;

    if (currentLoanCorrectAnswers === questionsPerLoan) {
      // Case 1: All questions correct (Existing logic)
      roundRevenueChange = currentLoan.potentialRevenue;
      revenue += roundRevenueChange;
      totalCorrectAnswersInGame += questionsPerLoan; // Add all correct answers
      timeLeft += TIME_BONUS_CORRECT_LOAN;
      if (timeLeft > INITIAL_TIME) timeLeft = INITIAL_TIME;
      if(timeDisplay) timeDisplay.innerText = `${timeLeft} sec`;
      if(timerProgressBar) {
          const progressPercentage = Math.max(0, (timeLeft / INITIAL_TIME) * 100);
          timerProgressBar.style.width = `${progressPercentage}%`;
          timerProgressBar.setAttribute('aria-valuenow', timeLeft);
      }
    } else if (questionsPerLoan === 2 && currentLoanCorrectAnswers === 1) {
      // Case 2: NEW - Exactly 1 out of 2 questions correct
      roundRevenueChange = 500; // Award 500 points revenue
      revenue += roundRevenueChange;
      totalCorrectAnswersInGame += currentLoanCorrectAnswers; // Add the 1 correct answer to game total
      // Note: Compliance score was already penalized by answerLoan() for the incorrect answer
    } else {
      // Case 3: Other incorrect scenarios (0 out of 1, 0 out of 2) (Existing penalty logic)
      let penaltyAmount = 500;
       if (activeEvent && activeEvent.effectType === "penalty" && activeEvent.loansAffected < activeEvent.durationLoans) {
          penaltyAmount *= activeEvent.modifier;
      }
      roundRevenueChange = -penaltyAmount; // Revenue penalty
      revenue = Math.max(0, revenue - penaltyAmount);
      // Note: Compliance score was already penalized by answerLoan() for the incorrect answer(s)
      // Do not increment totalCorrectAnswersInGame here as 0 answers were correct in this round segment
    }

    // This calculation now correctly reflects the revenue outcome from any of the above cases
    totalRevenueEarnedInGame += roundRevenueChange;

    // Log history with the final outcome for this loan
    logHistory(currentLoan.baseValue, roundRevenueChange, currentLoanCorrectAnswers, complianceScore);
    updateFooterTotals(); // Update displays

    if(questionBox) questionBox.style.display = "none";
    if(feedbackArea) feedbackArea.style.display = 'none';

    // Handle active event duration
    if (activeEvent && activeEvent.durationLoans) {
        activeEvent.loansAffected = (activeEvent.loansAffected || 0) + 1;
        if (activeEvent.loansAffected >= activeEvent.durationLoans) {
            clearActiveEvent();
        }
    }

    // Check for game over conditions
    if (complianceScore <= MIN_COMPLIANCE_SCORE_GAME_OVER) {
        gameOver("Compliance Review Failed! Your license is under review.");
        return; // Stop further processing
    }

    if (timeLeft > 0) {
        if(loanBtn) loanBtn.disabled = false; // Enable "Process Next Loan" button
    } else {
        gameOver("Time's Up!");
        return; // Stop further processing if time ran out here
    }

    // Update power-up button status based on potentially changed revenue
    if (powerUpAvailable && revenue < POWER_UP_COST) {
        if(powerUpBtn) {
            powerUpBtn.disabled = true;
            powerUpBtn.innerHTML = `+10 Sec (Need $${POWER_UP_COST.toLocaleString()})`;
        }
    } else if (powerUpAvailable && revenue >= POWER_UP_COST && powerUpBtn) {
         powerUpBtn.disabled = false;
    }
}
// *** END OF MODIFIED FUNCTION ***

function logHistory(loanAmount, resultAmount, numCorrectInRound, currentCompliance) {
  if(!loanHistoryTableBody) return;
  const tr = document.createElement("tr");
  if (resultAmount > 0 && numCorrectInRound === questionsPerLoan) tr.classList.add("table-success"); // Only green if fully correct
  else if (resultAmount > 0 && numCorrectInRound !== questionsPerLoan) tr.classList.add("table-warning"); // Yellow for partial credit (1 of 2 case)
  else if (resultAmount < 0) tr.classList.add("table-danger"); // Red for penalty

  tr.insertCell().innerText = `${currentLoan.type} ($${loanAmount.toLocaleString()})`;
  tr.insertCell().innerText = (resultAmount >= 0 ? `+$${resultAmount.toLocaleString()}` : `-$${Math.abs(resultAmount).toLocaleString()}`);
  tr.insertCell().innerText = `${numCorrectInRound}/${questionsPerLoan}`;
  tr.insertCell().innerText = currentCompliance;
  loanHistoryTableBody.appendChild(tr);
  const historyContainer = document.querySelector('#historyPanel .table-responsive');
  if (historyContainer) historyContainer.scrollTop = historyContainer.scrollHeight;
}

function updateFooterTotals() {
  if (totalResultDisplay) totalResultDisplay.innerText = (totalRevenueEarnedInGame >= 0 ? `+$${totalRevenueEarnedInGame.toLocaleString()}` : `-$${Math.abs(totalRevenueEarnedInGame).toLocaleString()}`);
  if (totalCorrectDisplay) totalCorrectDisplay.innerText = totalCorrectAnswersInGame.toString();
  if (revenueDisplay) revenueDisplay.innerText = revenue.toLocaleString();
  if (complianceScoreDisplay) complianceScoreDisplay.innerText = complianceScore;
}

function updateTimer() {
  // Removed pause checks
  if (timeLeft <= 0) {
    // Ensure timer doesn't go below 0 visually and trigger game over just once
    if(timeDisplay) timeDisplay.innerText = `0 sec`;
     if(timerProgressBar) {
        timerProgressBar.style.width = `0%`;
        timerProgressBar.setAttribute('aria-valuenow', 0);
        timerProgressBar.classList.remove('bg-success', 'bg-warning');
        timerProgressBar.classList.add('bg-danger');
     }
    gameOver("Time's Up!");
    return;
  }
  timeLeft--;
  if(timeDisplay) timeDisplay.innerText = `${timeLeft} sec`;
  if(timerProgressBar) {
    const progressPercentage = Math.max(0, (timeLeft / INITIAL_TIME) * 100);
    timerProgressBar.style.width = `${progressPercentage}%`;
    timerProgressBar.setAttribute('aria-valuenow', timeLeft);
    if (timeLeft <= INITIAL_TIME / 4) {
        timerProgressBar.classList.remove('bg-success', 'bg-warning');
        timerProgressBar.classList.add('bg-danger');
    } else if (timeLeft <= INITIAL_TIME / 2) {
        timerProgressBar.classList.remove('bg-success', 'bg-danger');
        timerProgressBar.classList.add('bg-warning');
    } else {
        timerProgressBar.classList.remove('bg-warning', 'bg-danger');
        timerProgressBar.classList.add('bg-success');
    }
  }
   // Check moved to the top of the function to prevent negative time display
  // if (timeLeft <= 0) {
  //   stopMainTimer(); // Already stopped by gameOver
  //   gameOver("Time's Up!");
  // }
}

function displayMissedQuestions() {
    if(!missedQuestionsList || !missedQuestionsReviewPanel) return;
    missedQuestionsList.innerHTML = '';
    if (missedQuestionsForReview.length > 0) {
        missedQuestionsReviewPanel.style.display = 'block';
        missedQuestionsForReview.forEach(q_obj => {
            const questionCard = document.createElement('div');
            questionCard.classList.add('card', 'mb-3');
            let optionsString = '';
            if (q_obj.type === 'multi' && q_obj.options) {
                optionsString = q_obj.options.map(opt => `<li class="list-group-item disabled">${opt}</li>`).join('');
                optionsString = `<ul class="list-group mt-2">${optionsString}</ul>`;
            } else if (q_obj.type === 'yesno') {
                optionsString = '<p class="card-text mt-2"><em>Options: Yes / No</em></p>';
            }
            questionCard.innerHTML = `
                <div class="card-body">
                    <h6 class="card-subtitle mb-2 text-muted">Missed Question (Difficulty: ${q_obj.difficulty.charAt(0).toUpperCase() + q_obj.difficulty.slice(1)})</h6>
                    <p class="card-text mb-1"><strong>Question:</strong> ${q_obj.q}</p>
                    ${optionsString}
                    <p class="card-text mt-2 mb-1"><strong>Correct Answer:</strong> ${q_obj.correct}</p>
                    <div class="alert alert-info mt-2 mb-0">
                        <strong>Explanation:</strong> ${q_obj.explanation}
                    </div>
                </div>`;
            missedQuestionsList.appendChild(questionCard);
        });
    } else {
        missedQuestionsReviewPanel.style.display = 'none';
    }
}

function gameOver(reason = "Time's Up!") {
    stopMainTimer();
    // isInterRoundPaused = false; // Removed
    // clearTimeout(interRoundPauseTimeoutId); // Removed
    if(loanBtn) loanBtn.disabled = true;
    // if(pauseBtn) pauseBtn.disabled = true; // Removed
    if(powerUpBtn) powerUpBtn.style.display = 'none';
    if(questionBox) questionBox.style.display = "none";
    if(feedbackArea) feedbackArea.style.display = 'none';
    if(endScreen) endScreen.style.display = "block";
    if(finalRevenueDisplay) finalRevenueDisplay.innerText = revenue.toLocaleString();
    if(finalComplianceScoreDisplay) finalComplianceScoreDisplay.innerText = complianceScore;
    if(gameOverReasonDisplay) gameOverReasonDisplay.innerText = reason;
    if (gameOverReasonDisplay && reason !== "Time's Up!") {
        gameOverReasonDisplay.classList.add('text-danger', 'fw-bold');
    } else if (gameOverReasonDisplay) {
        gameOverReasonDisplay.classList.remove('text-danger', 'fw-bold');
    }
    if(playerNameInput) playerNameInput.value = "";
    if(submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerText = "Submit Score";
    }
    if(replayBtn) replayBtn.style.display = "inline-block";
    displayMissedQuestions();
    clearActiveEvent();
}

function submitScore(event) {
  event.preventDefault();
  if(!playerNameInput || !submitBtn) return;
  const name = playerNameInput.value.trim();
  if (!name) {
    playerNameInput.classList.add('is-invalid');
    playerNameInput.focus();
    return;
  }
  playerNameInput.classList.remove('is-invalid');
  const date = new Date().toISOString().split('T')[0];
  const scoreData = {
    "Name": name, "FinalScore": revenue, "NetResult": totalRevenueEarnedInGame,
    "CorrectAnswers": totalCorrectAnswersInGame, "ComplianceScore": complianceScore, "Date": date
  };
  console.log("Score Submitted (Locally):", scoreData);
  submitBtn.disabled = true;
  submitBtn.innerText = "Score Recorded";
}

// togglePause function removed

function activatePowerUp() {
    if (powerUpAvailable && !powerUpUsedThisGame && revenue >= POWER_UP_COST) {
        revenue -= POWER_UP_COST;
        updateFooterTotals();
        timeLeft += 10;
        if(timeDisplay) timeDisplay.innerText = `${timeLeft} sec`;
        if(timerProgressBar) {
            const progressPercentage = Math.max(0, (timeLeft / INITIAL_TIME) * 100);
            timerProgressBar.style.width = `${progressPercentage}%`;
            timerProgressBar.setAttribute('aria-valuenow', timeLeft);
            // Adjust color based on new time
             if (timeLeft <= INITIAL_TIME / 4) {
                timerProgressBar.classList.remove('bg-success', 'bg-warning');
                timerProgressBar.classList.add('bg-danger');
            } else if (timeLeft <= INITIAL_TIME / 2) {
                timerProgressBar.classList.remove('bg-success', 'bg-danger');
                timerProgressBar.classList.add('bg-warning');
            } else {
                timerProgressBar.classList.remove('bg-warning', 'bg-danger');
                timerProgressBar.classList.add('bg-success');
            }
        }
        powerUpAvailable = false;
        powerUpUsedThisGame = true;
        if(powerUpBtn) powerUpBtn.style.display = 'none';
        try { powerUpSound.play().catch(e => console.warn("Powerup sound play failed", e)); } catch(e){}
    } else if (revenue < POWER_UP_COST && powerUpAvailable) {
         /* User feedback if needed - maybe flash button red? */
         if(powerUpBtn){
             powerUpBtn.classList.add('btn-danger');
             setTimeout(() => powerUpBtn.classList.remove('btn-danger'), 500);
         }
    }
}

function tryTriggerDynamicEvent() {
    if (activeEvent && activeEvent.durationLoans && activeEvent.loansAffected >= activeEvent.durationLoans) {
        clearActiveEvent();
    }
    if (activeEvent) return; // Don't trigger a new event if one is already active
    if (loansSinceLastEvent >= LOANS_BETWEEN_EVENT_CHECKS) {
        if (Math.random() < eventChance) {
            const eventIndex = Math.floor(Math.random() * dynamicEvents.length);
            activeEvent = { ...dynamicEvents[eventIndex] }; // Create a copy
            activeEvent.loansAffected = 0; // Initialize counter
            if(eventAnnouncementDisplay) {
                eventAnnouncementDisplay.textContent = activeEvent.message;
                eventAnnouncementDisplay.style.display = 'block';
                // Optional: Add animation or highlight
                eventAnnouncementDisplay.classList.add('animate__animated', 'animate__flash');
                setTimeout(() => {
                    eventAnnouncementDisplay.classList.remove('animate__animated', 'animate__flash');
                }, 1000); // Remove animation class after 1s
            }
            try { eventSound.play().catch(e => console.warn("Event sound play failed", e)); } catch(e){}
        }
        loansSinceLastEvent = 0; // Reset counter whether event triggered or not
    }
}

function clearActiveEvent() {
    if (activeEvent) {
         if(eventAnnouncementDisplay) {
             // Optional: Fade out effect
             eventAnnouncementDisplay.style.opacity = '0';
             setTimeout(() => {
                eventAnnouncementDisplay.style.display = 'none';
                eventAnnouncementDisplay.style.opacity = '1'; // Reset opacity
                eventAnnouncementDisplay.textContent = ''; // Clear text
             }, 500); // Match transition time if added in CSS
         }
        activeEvent = null; // Clear the event object
    }
}

function startGame() {
  revenue = 0;
  complianceScore = 100;
  timeLeft = INITIAL_TIME;
  questionsPerLoan = 1;
  currentLoanCorrectAnswers = 0;
  totalCorrectAnswersInGame = 0;
  totalRevenueEarnedInGame = 0;
  usedQuestionIndices.clear();
  missedQuestionsForReview = [];
  // isPaused = false; // Removed
  // isInterRoundPaused = false; // Removed
  // clearTimeout(interRoundPauseTimeoutId); // Removed
  activeEvent = null;
  loansSinceLastEvent = 0;
  powerUpAvailable = false;
  powerUpUsedThisGame = false;

  updateFooterTotals();

  if(timeDisplay) timeDisplay.innerText = `${timeLeft} sec`;
  if(timerProgressBar) {
    timerProgressBar.style.width = '100%';
    timerProgressBar.setAttribute('aria-valuenow', timeLeft);
    timerProgressBar.classList.remove('bg-warning', 'bg-danger');
    timerProgressBar.classList.add('bg-success');
  }
  if(loanHistoryTableBody) loanHistoryTableBody.innerHTML = ''; // Clear history table
  if(feedbackArea) feedbackArea.style.display = 'none';
  if(missedQuestionsReviewPanel) missedQuestionsReviewPanel.style.display = 'none';
  if(missedQuestionsList) missedQuestionsList.innerHTML = '';
  if(eventAnnouncementDisplay) eventAnnouncementDisplay.style.display = 'none';
  if(gameOverReasonDisplay) {
    gameOverReasonDisplay.innerText = "";
    gameOverReasonDisplay.classList.remove('text-danger', 'fw-bold');
  }
  // Pause overlay logic removed
  // let overlay = document.getElementById('pauseOverlay');
  // if (overlay) overlay.style.display = 'none';

  if(startScreen) startScreen.style.display = "none";
  if(gameUILayout) gameUILayout.style.display = "block";
  if(historyPanel) historyPanel.style.display = "block";
  if(endScreen) endScreen.style.display = "none";

  // if(pauseBtn) { // Pause button logic removed
  //   pauseBtn.textContent = 'Pause';
  //   pauseBtn.disabled = false;
  // }
  if(powerUpBtn) {
    powerUpBtn.style.display = 'none'; // Hide initially
    powerUpBtn.innerHTML = `+10 Sec (Cost: $${POWER_UP_COST.toLocaleString()})`;
    powerUpBtn.disabled = true; // Start disabled
  }

  if(loanBtn) {
      loanBtn.disabled = true; // Start disabled, will be enabled by newLoanQuestion or processLoanRoundEnd
      loanBtn.textContent = "Process Next Loan"; // Ensure correct text
  }


  if (allQuestionsPool.length > 0) {
    newLoanQuestion(); // This will start the first loan and timer
  } else {
    if(loanDetailsDisplay) loanDetailsDisplay.innerText = "Waiting for questions to load or no questions available.";
    // Keep loanBtn disabled if no questions
    if(loanBtn) loanBtn.disabled = true;
  }
  // Timer is started within newLoanQuestion -> showQuestion -> resumeMainTimer
}

// Event Listeners
if(startBtn) startBtn.addEventListener("click", startGame);
if(loanBtn) loanBtn.addEventListener("click", newLoanQuestion);
if(scoreForm) scoreForm.addEventListener("submit", submitScore);
if(replayBtn) replayBtn.addEventListener("click", startGame);
// if(pauseBtn) pauseBtn.addEventListener("click", togglePause); // Removed
if(powerUpBtn) powerUpBtn.addEventListener("click", activatePowerUp);

// Initial Load
window.addEventListener("DOMContentLoaded", async () => {
  await loadQuestions();
  // Show start screen after questions are loaded (or attempted)
  if(startScreen) startScreen.style.display = "block";
  if(gameUILayout) gameUILayout.style.display = "none";
  if(endScreen) endScreen.style.display = "none";
});