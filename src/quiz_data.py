# ============================================================
# quiz_data.py — Mock quiz questions
# Replace with DB/API fetch when backend is ready
# ============================================================

QUIZ_QUESTIONS = [
    {
        "id": "q1",
        "concept": "Gradient Descent",
        "question": "What does the learning rate control in gradient descent?",
        "options": {
            "A": "The number of training epochs",
            "B": "The step size when updating weights",
            "C": "The initial value of the weights",
            "D": "The size of the training dataset",
        },
        "answer": "B",
        "explanation_correct": (
            "✅ Correct! The learning rate controls *how large each step* is when "
            "we move in the direction of the gradient. Too large → overshooting; "
            "too small → very slow convergence."
        ),
        "explanation_wrong": (
            "❌ Not quite. Think of gradient descent like walking down a hill — "
            "the *learning rate* decides how big each step you take is, "
            "not how many steps or where you start.\n\n"
            "🎯 The correct answer is **B — step size when updating weights**."
        ),
        "socratic_followup": (
            "🤔 Let me ask you this: if you set the learning rate *too high*, "
            "what do you think might happen to the loss during training?"
        ),
    },
    {
        "id": "q2",
        "concept": "Backpropagation",
        "question": "In backpropagation, gradients flow in which direction?",
        "options": {
            "A": "Input layer → Output layer",
            "B": "Output layer → Input layer",
            "C": "Randomly across layers",
            "D": "Only through the hidden layers",
        },
        "answer": "B",
        "explanation_correct": (
            "✅ Correct! Backpropagation propagates error signals *backwards* "
            "from the output layer through to the input layer using the chain rule."
        ),
        "explanation_wrong": (
            "❌ Not quite. The *forward pass* goes input → output, "
            "but *backpropagation* does the reverse — output → input — "
            "computing gradients at each layer.\n\n"
            "🎯 The correct answer is **B — Output layer → Input layer**."
        ),
        "socratic_followup": (
            "🤔 Here's something to think about: *why* do we need to go backwards? "
            "What information do we get from the output that we need at each layer?"
        ),
    },
    {
        "id": "q3",
        "concept": "Loss Functions",
        "question": "Which loss function is best for multi-class classification?",
        "options": {
            "A": "Mean Squared Error (MSE)",
            "B": "Binary Cross-Entropy",
            "C": "Categorical Cross-Entropy",
            "D": "Hinge Loss",
        },
        "answer": "C",
        "explanation_correct": (
            "✅ Correct! *Categorical Cross-Entropy* measures how well the "
            "predicted probability distribution matches the true class labels "
            "across multiple classes."
        ),
        "explanation_wrong": (
            "❌ Not quite. MSE is typically used for regression, Binary Cross-Entropy "
            "for *binary* classification (2 classes only).\n\n"
            "🎯 The correct answer is **C — Categorical Cross-Entropy**."
        ),
        "socratic_followup": (
            "🤔 Can you think of why MSE might be a poor choice for classification? "
            "What happens to the gradient when predictions are near 0 or 1?"
        ),
    },
    {
        "id": "q4",
        "concept": "Overfitting",
        "question": "Which of the following is a sign of overfitting?",
        "options": {
            "A": "High training loss, high validation loss",
            "B": "Low training loss, high validation loss",
            "C": "Low training loss, low validation loss",
            "D": "High training loss, low validation loss",
        },
        "answer": "B",
        "explanation_correct": (
            "✅ Exactly! Overfitting shows as *low training loss* (model memorised training data) "
            "but *high validation loss* (it fails to generalise to new data)."
        ),
        "explanation_wrong": (
            "❌ Not quite. Overfitting is when the model performs *well on training data* "
            "but *poorly on unseen data* — it has memorised instead of learned.\n\n"
            "🎯 The correct answer is **B — Low training loss, high validation loss**."
        ),
        "socratic_followup": (
            "🤔 If you noticed your model was overfitting, what are two things you could try to fix it?"
        ),
    },
]


def get_question_by_index(idx: int) -> dict | None:
    if 0 <= idx < len(QUIZ_QUESTIONS):
        return QUIZ_QUESTIONS[idx]
    return None


def get_all_questions() -> list:
    return QUIZ_QUESTIONS
