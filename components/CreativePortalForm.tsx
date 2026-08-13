"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { ASSET_TYPE_OPTIONS } from "@/config/creative-portal";

type FormState = {
  programName: string;
  headline: string;
  description: string;
  date: string;
  time: string;
  location: string;
  registrationUrl: string;
  assetType: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

type SuccessResult = {
  success: true;
  canvaDesignUrl: string;
  basecampMessageUrl: string;
  canvaDesignId?: string;
  basecampMessageId?: string;
};

type ErrorResult = {
  success: false;
  message: string;
};

const INITIAL: FormState = {
  programName: "",
  headline: "",
  description: "",
  date: "",
  time: "",
  location: "",
  registrationUrl: "",
  assetType: "flyer",
};

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.programName.trim()) {
    errors.programName = "Program / Event Name is required.";
  }
  if (!form.headline.trim()) errors.headline = "Headline is required.";
  if (!form.description.trim()) {
    errors.description = "Description is required.";
  }
  if (!form.date.trim()) errors.date = "Date is required.";
  if (!form.time.trim()) errors.time = "Time is required.";
  if (!form.location.trim()) errors.location = "Location is required.";
  if (!form.registrationUrl.trim()) {
    errors.registrationUrl = "Registration URL is required.";
  } else {
    try {
      void new URL(form.registrationUrl.trim());
    } catch {
      errors.registrationUrl = "Enter a valid URL (https://…).";
    }
  }
  if (!form.assetType) errors.assetType = "Asset Type is required.";
  return errors;
}

export function CreativePortalForm() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SuccessResult | ErrorResult | null>(
    null,
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate(form);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setResult(null);
      return;
    }

    setSubmitting(true);
    setResult(null);

    try {
      const response = await fetch("/api/creative-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: "creative_engine_portal",
          programName: form.programName.trim(),
          headline: form.headline.trim(),
          description: form.description.trim(),
          date: form.date.trim(),
          time: form.time.trim(),
          location: form.location.trim(),
          registrationUrl: form.registrationUrl.trim(),
          assetType: form.assetType,
        }),
      });

      const data = (await response.json()) as Record<string, unknown>;
      if (!response.ok || data.success !== true) {
        const message =
          typeof data.message === "string"
            ? data.message
            : typeof data.error === "string"
              ? data.error
              : "Something went wrong. Please try again.";
        setResult({ success: false, message });
        return;
      }

      setResult({
        success: true,
        canvaDesignUrl: String(data.canvaDesignUrl ?? ""),
        basecampMessageUrl: String(data.basecampMessageUrl ?? ""),
        canvaDesignId:
          typeof data.canvaDesignId === "string"
            ? data.canvaDesignId
            : undefined,
        basecampMessageId:
          typeof data.basecampMessageId === "string"
            ? data.basecampMessageId
            : undefined,
      });
    } catch {
      setResult({
        success: false,
        message: "Network error. Please try again.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.success) {
    return (
      <section
        className="portal-result portal-result--success"
        aria-live="polite"
      >
        <p className="portal-eyebrow">Ready</p>
        <h2 className="portal-result-title">Your creative draft is ready</h2>
        <p className="portal-result-copy">
          An editable Canva design was created and posted to the Marketing
          Project Requests Message Board.
        </p>
        <div className="portal-result-actions">
          {result.canvaDesignUrl ? (
            <a
              className="portal-btn portal-btn--primary"
              href={result.canvaDesignUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open Canva design
            </a>
          ) : null}
          {result.basecampMessageUrl ? (
            <a
              className="portal-btn portal-btn--secondary"
              href={result.basecampMessageUrl}
              target="_blank"
              rel="noreferrer"
            >
              View Basecamp message
            </a>
          ) : null}
          <button
            type="button"
            className="portal-btn portal-btn--ghost"
            onClick={() => {
              setResult(null);
              setForm(INITIAL);
              setErrors({});
            }}
          >
            Create another
          </button>
        </div>
      </section>
    );
  }

  return (
    <form className="portal-form" onSubmit={onSubmit} noValidate>
      {result && !result.success ? (
        <div className="portal-alert" role="alert">
          {result.message}
        </div>
      ) : null}

      <Field
        label="Program / Event Name"
        error={errors.programName}
        required
      >
        <input
          className="portal-input"
          value={form.programName}
          onChange={(e) => update("programName", e.target.value)}
          autoComplete="off"
        />
      </Field>

      <Field label="Headline" error={errors.headline} required>
        <input
          className="portal-input"
          value={form.headline}
          onChange={(e) => update("headline", e.target.value)}
          autoComplete="off"
        />
      </Field>

      <Field label="Description" error={errors.description} required>
        <textarea
          className="portal-input portal-textarea"
          value={form.description}
          onChange={(e) => update("description", e.target.value)}
          rows={4}
        />
      </Field>

      <div className="portal-row">
        <Field label="Date" error={errors.date} required>
          <input
            className="portal-input"
            value={form.date}
            onChange={(e) => update("date", e.target.value)}
            placeholder="e.g. September 12, 2026"
            autoComplete="off"
          />
        </Field>
        <Field label="Time" error={errors.time} required>
          <input
            className="portal-input"
            value={form.time}
            onChange={(e) => update("time", e.target.value)}
            placeholder="e.g. 7:00 PM"
            autoComplete="off"
          />
        </Field>
      </div>

      <Field label="Location" error={errors.location} required>
        <input
          className="portal-input"
          value={form.location}
          onChange={(e) => update("location", e.target.value)}
          autoComplete="off"
        />
      </Field>

      <Field
        label="Registration URL"
        error={errors.registrationUrl}
        required
      >
        <input
          className="portal-input"
          type="url"
          value={form.registrationUrl}
          onChange={(e) => update("registrationUrl", e.target.value)}
          placeholder="https://"
          autoComplete="off"
        />
      </Field>

      <Field label="Asset Type" error={errors.assetType} required>
        <select
          className="portal-input"
          value={form.assetType}
          onChange={(e) => update("assetType", e.target.value)}
        >
          {ASSET_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>

      <button
        type="submit"
        className="portal-btn portal-btn--primary portal-submit"
        disabled={submitting}
      >
        {submitting ? "Generating…" : "Generate Creative"}
      </button>
    </form>
  );
}

function Field({
  label,
  error,
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="portal-field">
      <span className="portal-label">
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </span>
      {children}
      {error ? <span className="portal-field-error">{error}</span> : null}
    </label>
  );
}
