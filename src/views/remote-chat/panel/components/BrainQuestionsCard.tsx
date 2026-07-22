import { useRef, useState } from "react"
import type { BrainQuestion } from "../../shared/types"

interface Props {
  questionId: string
  questions: BrainQuestion[]
  onSubmit: (questionId: string, answers: Record<string, string>) => void
  // Optional: user declines to answer via the structured card and wants to respond
  // freely instead. Should tell the loop the questions were cancelled (so it doesn't
  // hang) and let the user type in the composer.
  onCancel?: (questionId: string) => void
}

// Sentinel value a choice question's radio group holds when the user picks "Other…".
// The real answer is then read from the per-question freestyle text field.
const OTHER = "__other__"

export function BrainQuestionsCard({ questionId, questions, onSubmit, onCancel }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const q of questions) initial[q.id] = ""
    return initial
  })
  // Per-question freestyle text, used when a choice question's "Other…" is selected.
  const [otherText, setOtherText] = useState<Record<string, string>>({})
  // Refs to each question's inline "Other" input so selecting the radio focuses it.
  const otherInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // The effective answer for a question: for a choice on "Other…", it's the typed text.
  function effectiveAnswer(q: BrainQuestion): string {
    if (q.type === "choice" && answers[q.id] === OTHER) return (otherText[q.id] ?? "").trim()
    return (answers[q.id] ?? "").trim()
  }

  const allAnswered = questions.every((q) => effectiveAnswer(q).length > 0)

  function handleSubmit() {
    if (!allAnswered) return
    const resolved: Record<string, string> = {}
    for (const q of questions) resolved[q.id] = effectiveAnswer(q)
    onSubmit(questionId, resolved)
  }

  return (
    <div className="brain-questions-card">
      <div className="brain-questions-header">
        <span className="brain-questions-icon">🧠</span>
        <span className="brain-questions-title">Before I start, a few questions:</span>
      </div>

      <div className="brain-questions-list">
        {questions.map((q, i) => (
          <div key={q.id} className="brain-question-field">
            <label className="brain-question-label">
              {i + 1}. {q.question}
            </label>
            {q.type === "choice" && q.options ? (
              <div className="brain-question-options">
                {q.options.map((opt) => (
                  <label key={opt} className="brain-question-option">
                    <input
                      type="radio"
                      name={q.id}
                      value={opt}
                      checked={answers[q.id] === opt}
                      onChange={() => setAnswers((prev) => ({ ...prev, [q.id]: opt }))}
                    />
                    <span>{opt}</span>
                  </label>
                ))}
                {/* Freestyle escape hatch: the "Other" option IS an inline text input
                    on the same row as its radio. Two-way linked — clicking the radio
                    focuses the input, and typing in the input auto-selects the radio —
                    so the user does one gesture, not two. */}
                <label className="brain-question-option brain-question-option-other">
                  <input
                    type="radio"
                    name={q.id}
                    value={OTHER}
                    checked={answers[q.id] === OTHER}
                    onChange={() => {
                      setAnswers((prev) => ({ ...prev, [q.id]: OTHER }))
                      // Two-way link: selecting the radio focuses its inline input.
                      otherInputRefs.current[q.id]?.focus()
                    }}
                    aria-label={`Other answer for: ${q.question}`}
                  />
                  <input
                    type="text"
                    ref={(el) => {
                      otherInputRefs.current[q.id] = el
                    }}
                    className="brain-question-input brain-question-other-input"
                    value={otherText[q.id] ?? ""}
                    onFocus={() => setAnswers((prev) => ({ ...prev, [q.id]: OTHER }))}
                    onChange={(e) => {
                      const v = e.target.value
                      // Typing implies "Other" — auto-select the radio.
                      setOtherText((prev) => ({ ...prev, [q.id]: v }))
                      setAnswers((prev) => ({ ...prev, [q.id]: OTHER }))
                    }}
                    placeholder="Other…"
                  />
                </label>
              </div>
            ) : (
              <input
                type="text"
                className="brain-question-input"
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                placeholder="Type your answer..."
              />
            )}
          </div>
        ))}
      </div>

      <div className="brain-questions-actions">
        <button className="brain-questions-btn" onClick={handleSubmit} disabled={!allAnswered}>
          Submit Answers
        </button>
        {onCancel && (
          <button
            className="brain-questions-btn brain-questions-btn-cancel"
            onClick={() => onCancel(questionId)}
            title="Skip these questions and reply in your own words"
          >
            Cancel
          </button>
        )}
      </div>
    </div>
  )
}
