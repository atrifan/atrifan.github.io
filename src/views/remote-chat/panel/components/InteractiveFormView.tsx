import { useState } from "react"
import type { InteractiveForm, FormField, FormResponse } from "../../shared/types"

interface Props {
  form: InteractiveForm
  onSubmit: (formId: string, data: FormResponse) => void
  onDismiss?: () => void
}

// Sentinel a radio/checkbox holds when the user chose the freestyle "Other" option.
// Replaced with the typed text (otherText) at submit time.
const OTHER = "__other__"

export function InteractiveFormView({ form, onSubmit, onDismiss }: Props) {
  const [activeStep, setActiveStep] = useState(0)
  const [values, setValues] = useState<FormResponse>({})
  // Per-field freestyle text backing each field's inline "Other" option.
  const [otherText, setOtherText] = useState<Record<string, string>>({})

  // Defensive: an LLM-generated form may omit steps/fields. Never let a missing array
  // throw on .map and crash the whole panel.
  const steps = Array.isArray(form.steps) ? form.steps : []
  const step = steps[activeStep] ?? { title: form.title ?? "", fields: [] }
  const stepFields = Array.isArray(step.fields) ? step.fields : []
  const isLast = activeStep === steps.length - 1 || steps.length === 0

  function setValue(fieldId: string, value: string | string[]) {
    setValues((prev) => ({ ...prev, [fieldId]: value }))
  }

  function setOther(fieldId: string, text: string) {
    setOtherText((prev) => ({ ...prev, [fieldId]: text }))
  }

  function toggleCheckbox(fieldId: string, optionValue: string) {
    setValues((prev) => {
      const current = (prev[fieldId] as string[]) ?? []
      const next = current.includes(optionValue) ? current.filter((v) => v !== optionValue) : [...current, optionValue]
      return { ...prev, [fieldId]: next }
    })
  }

  // Replace any OTHER sentinel with the field's typed freestyle text so the model
  // receives real answers, never "__other__".
  function resolveOther(data: FormResponse): FormResponse {
    const out: FormResponse = {}
    for (const [k, v] of Object.entries(data)) {
      const typed = (otherText[k] ?? "").trim()
      if (Array.isArray(v)) {
        out[k] = v.map((item) => (item === OTHER ? typed : item)).filter((item) => item.length > 0)
      } else if (v === OTHER) {
        out[k] = typed
      } else {
        out[k] = v
      }
    }
    return out
  }

  function handleNext() {
    if (isLast) {
      onSubmit(form.id, resolveOther(values))
    } else {
      setActiveStep((s) => s + 1)
    }
  }

  function renderField(field: FormField) {
    switch (field.type) {
      case "text":
        return (
          <div key={field.id} className="form-field">
            <label htmlFor={field.id}>{field.label}</label>
            <input
              id={field.id}
              type="text"
              placeholder={field.placeholder}
              value={(values[field.id] as string) ?? field.default ?? ""}
              onChange={(e) => setValue(field.id, e.target.value)}
            />
          </div>
        )
      case "radio":
        return (
          <div key={field.id} className="form-field">
            <label>{field.label}</label>
            <div className="form-options">
              {(field.options ?? []).map((opt) => (
                <label key={opt.value} className="form-radio">
                  <input
                    type="radio"
                    name={field.id}
                    checked={(values[field.id] ?? field.default) === opt.value}
                    onChange={() => setValue(field.id, opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
              {/* Inline freestyle "Other": the radio + a text input on one row. Typing
                  auto-selects the radio; the typed value is submitted (not the sentinel). */}
              <label className="form-radio form-option-other">
                <input
                  type="radio"
                  name={field.id}
                  checked={values[field.id] === OTHER}
                  onChange={() => setValue(field.id, OTHER)}
                  aria-label={`Other value for ${field.label}`}
                />
                <input
                  type="text"
                  className="form-other-input"
                  placeholder="Other…"
                  value={otherText[field.id] ?? ""}
                  onFocus={() => setValue(field.id, OTHER)}
                  onChange={(e) => {
                    setOther(field.id, e.target.value)
                    setValue(field.id, OTHER)
                  }}
                />
              </label>
            </div>
          </div>
        )
      case "checkbox":
        return (
          <div key={field.id} className="form-field">
            <label>{field.label}</label>
            <div className="form-options">
              {(field.options ?? []).map((opt) => (
                <label key={opt.value} className="form-checkbox">
                  <input
                    type="checkbox"
                    checked={((values[field.id] as string[]) ?? field.default ?? []).includes(opt.value)}
                    onChange={() => toggleCheckbox(field.id, opt.value)}
                  />
                  {opt.label}
                </label>
              ))}
              {/* Inline freestyle "Other" for multi-select: ticking it (or typing) adds
                  the OTHER sentinel to the array, resolved to the typed text at submit. */}
              <label className="form-checkbox form-option-other">
                <input
                  type="checkbox"
                  checked={((values[field.id] as string[]) ?? []).includes(OTHER)}
                  onChange={() => toggleCheckbox(field.id, OTHER)}
                  aria-label={`Other value for ${field.label}`}
                />
                <input
                  type="text"
                  className="form-other-input"
                  placeholder="Other…"
                  value={otherText[field.id] ?? ""}
                  onFocus={() => {
                    if (!((values[field.id] as string[]) ?? []).includes(OTHER)) toggleCheckbox(field.id, OTHER)
                  }}
                  onChange={(e) => {
                    setOther(field.id, e.target.value)
                    if (!((values[field.id] as string[]) ?? []).includes(OTHER)) toggleCheckbox(field.id, OTHER)
                  }}
                />
              </label>
            </div>
          </div>
        )
      case "select":
        return (
          <div key={field.id} className="form-field">
            <label htmlFor={field.id}>{field.label}</label>
            <select
              id={field.id}
              multiple={field.multiple}
              value={(values[field.id] as string) ?? field.default ?? ""}
              onChange={(e) => {
                if (field.multiple) {
                  const selected = Array.from(e.target.selectedOptions).map((o) => o.value)
                  setValue(field.id, selected)
                } else {
                  setValue(field.id, e.target.value)
                }
              }}
            >
              {(field.options ?? []).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )
    }
  }

  return (
    <div className="interactive-form">
      <div className="form-header">{form.title}</div>
      {steps.length > 1 && (
        <div className="form-tabs">
          {steps.map((s, i) => (
            <button
              key={s.id}
              className={`form-tab ${i === activeStep ? "active" : ""} ${i < activeStep ? "done" : ""}`}
              onClick={() => setActiveStep(i)}
            >
              {s.title}
            </button>
          ))}
        </div>
      )}
      <div className="form-step">
        {step.description && <p className="form-step-desc">{step.description}</p>}
        {stepFields.map(renderField)}
      </div>
      <div className="form-actions">
        {onDismiss && (
          <button className="form-btn secondary" onClick={onDismiss} aria-label="Dismiss form and return to the agent">
            Dismiss
          </button>
        )}
        {activeStep > 0 && (
          <button className="form-btn secondary" onClick={() => setActiveStep((s) => s - 1)}>
            Back
          </button>
        )}
        <button className="form-btn primary" onClick={handleNext}>
          {isLast ? "Submit" : "Next"}
        </button>
      </div>
    </div>
  )
}
