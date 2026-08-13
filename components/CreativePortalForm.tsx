"use client";

import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  ASSET_TYPE_META,
  ASSET_TYPE_OPTIONS,
  CTA_LABEL_OPTIONS,
} from "@/config/creative-portal";
import { APPROVED_CREATIVE_TEMPLATES } from "@/config/canva-templates";
import { classifyCreativeRequest } from "@/lib/creative/classify";
import { selectCreativeTemplate } from "@/lib/creative/select-template";
import {
  ASSET_TYPE_LABELS,
  type CreativeRequest,
  type ImageTreatment,
} from "@/lib/creative/types";
import type { AssetType } from "@/config/canva-templates";

type FormState = {
  assetType: AssetType;
  intendedChannel: string;
  department: string;
  programName: string;
  headline: string;
  description: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  audience: string;
  additionalDetails: string;
  registrationDeadline: string;
  requiresRegistration: boolean;
  registrationUrl: string;
  ctaLabel: string;
  includeQr: boolean;
  showPricing: boolean;
  price: string;
  memberPrice: string;
  nonMemberPrice: string;
  pricingNotes: string;
  imageTreatment: ImageTreatment;
  imageAssetReference: string;
  showContactInfo: boolean;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  includePartner: boolean;
  partnerName: string;
  partnerLogoAssetReference: string;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

type BrandChecks = {
  approvedLayout: boolean;
  brandTreatment: boolean;
  qrGenerated: boolean;
  contentMapped: boolean;
};

type SuccessResult = {
  success: true;
  canvaDesignUrl: string;
  basecampMessageUrl: string;
  canvaDesignId?: string;
  basecampMessageId?: string;
  templateTitle?: string;
  brandChecks?: BrandChecks;
};

type ErrorResult = {
  success: false;
  message: string;
  code?: string;
  details?: {
    summary?: {
      asset?: string;
      content?: string;
      image?: string;
      contact?: string;
      partner?: string;
      registration?: string;
    };
  };
};

const INITIAL: FormState = {
  assetType: "flyer_full",
  intendedChannel: "",
  department: "",
  programName: "",
  headline: "",
  description: "",
  date: "",
  startTime: "",
  endTime: "",
  location: "",
  audience: "",
  additionalDetails: "",
  registrationDeadline: "",
  requiresRegistration: true,
  registrationUrl: "",
  ctaLabel: "Register",
  includeQr: true,
  showPricing: false,
  price: "",
  memberPrice: "",
  nonMemberPrice: "",
  pricingNotes: "",
  imageTreatment: "auto",
  imageAssetReference: "",
  showContactInfo: false,
  contactName: "",
  contactEmail: "",
  contactPhone: "",
  includePartner: false,
  partnerName: "",
  partnerLogoAssetReference: "",
};

function validate(form: FormState): FieldErrors {
  const errors: FieldErrors = {};
  if (!form.assetType) errors.assetType = "Asset type is required.";
  if (!form.programName.trim()) {
    errors.programName = "Program / Event Name is required.";
  }
  if (!form.description.trim()) {
    errors.description = "Description is required.";
  }
  if (form.requiresRegistration) {
    if (!form.registrationUrl.trim()) {
      errors.registrationUrl = "Registration URL is required.";
    } else {
      try {
        void new URL(form.registrationUrl.trim());
      } catch {
        errors.registrationUrl = "Enter a valid URL (https://…).";
      }
    }
  }
  if (form.includeQr && (!form.requiresRegistration || !form.registrationUrl.trim())) {
    errors.includeQr = "QR requires a valid registration URL.";
  }
  if (form.showContactInfo) {
    const useful =
      form.contactName.trim() ||
      form.contactEmail.trim() ||
      form.contactPhone.trim();
    if (!useful) {
      errors.contactName = "Provide at least one contact method.";
    }
  }
  if (form.includePartner && !form.partnerName.trim()) {
    errors.partnerName = "Partner name is required.";
  }
  if (form.imageTreatment === "supplied" && !form.imageAssetReference.trim()) {
    errors.imageAssetReference = "Add an image reference for a supplied image.";
  }
  return errors;
}

function toPreviewRequest(form: FormState): CreativeRequest {
  return {
    source: "creative_engine_portal",
    submittedAt: new Date().toISOString(),
    assetType: form.assetType,
    intendedChannel: form.intendedChannel || undefined,
    department: form.department || undefined,
    programName: form.programName.trim() || "Untitled",
    headline: form.headline.trim() || undefined,
    description: form.description.trim() || "",
    date: form.date || undefined,
    startTime: form.startTime || undefined,
    endTime: form.endTime || undefined,
    location: form.location || undefined,
    audience: form.audience || undefined,
    additionalDetails: form.additionalDetails || undefined,
    registrationDeadline: form.registrationDeadline || undefined,
    requiresRegistration: form.requiresRegistration,
    registrationUrl: form.registrationUrl.trim() || undefined,
    ctaLabel: form.ctaLabel || undefined,
    includeQr: form.includeQr && form.requiresRegistration,
    showPricing: form.showPricing,
    price: form.price || undefined,
    memberPrice: form.memberPrice || undefined,
    nonMemberPrice: form.nonMemberPrice || undefined,
    pricingNotes: form.pricingNotes || undefined,
    imageTreatment: form.imageTreatment,
    imageAssetReference: form.imageAssetReference || undefined,
    showContactInfo: form.showContactInfo,
    contactName: form.contactName || undefined,
    contactEmail: form.contactEmail || undefined,
    contactPhone: form.contactPhone || undefined,
    includePartner: form.includePartner,
    partnerName: form.partnerName || undefined,
    partnerLogoAssetReference: form.partnerLogoAssetReference || undefined,
  };
}

const DENSITY_LABELS = {
  minimal: "Minimal hierarchy",
  standard: "Standard hierarchy",
  dense: "Dense hierarchy",
} as const;

const IMAGE_LABELS: Record<ImageTreatment, string> = {
  auto: "Creative Engine choose",
  template: "Template imagery",
  supplied: "Supplied image",
  none: "No image",
};

const CONTACT_LABELS = {
  none: "None",
  compact: "Compact",
  full: "Full",
} as const;

export function CreativePortalForm() {
  const [form, setForm] = useState<FormState>(INITIAL);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SuccessResult | ErrorResult | null>(
    null,
  );

  const preview = useMemo(() => {
    const request = toPreviewRequest(form);
    const classification = classifyCreativeRequest(request);
    const selection = selectCreativeTemplate(
      request,
      classification,
      APPROVED_CREATIVE_TEMPLATES,
    );
    return { request, classification, selection };
  }, [form]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "assetType") {
        next.intendedChannel = "";
      }
      if (key === "requiresRegistration" && value === false) {
        next.includeQr = false;
      }
      if (key === "requiresRegistration" && value === true && next.registrationUrl) {
        next.includeQr = true;
      }
      return next;
    });
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
          assetType: form.assetType,
          intendedChannel: form.intendedChannel || undefined,
          department: form.department.trim() || undefined,
          programName: form.programName.trim(),
          headline: form.headline.trim() || undefined,
          description: form.description.trim(),
          date: form.date.trim() || undefined,
          startTime: form.startTime.trim() || undefined,
          endTime: form.endTime.trim() || undefined,
          location: form.location.trim() || undefined,
          audience: form.audience.trim() || undefined,
          additionalDetails: form.additionalDetails.trim() || undefined,
          registrationDeadline: form.registrationDeadline.trim() || undefined,
          requiresRegistration: form.requiresRegistration,
          registrationUrl: form.registrationUrl.trim() || undefined,
          ctaLabel: form.ctaLabel || undefined,
          includeQr: form.includeQr,
          showPricing: form.showPricing,
          price: form.price.trim() || undefined,
          memberPrice: form.memberPrice.trim() || undefined,
          nonMemberPrice: form.nonMemberPrice.trim() || undefined,
          pricingNotes: form.pricingNotes.trim() || undefined,
          imageTreatment: form.imageTreatment,
          imageAssetReference: form.imageAssetReference.trim() || undefined,
          showContactInfo: form.showContactInfo,
          contactName: form.contactName.trim() || undefined,
          contactEmail: form.contactEmail.trim() || undefined,
          contactPhone: form.contactPhone.trim() || undefined,
          includePartner: form.includePartner,
          partnerName: form.partnerName.trim() || undefined,
          partnerLogoAssetReference:
            form.partnerLogoAssetReference.trim() || undefined,
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
        setResult({
          success: false,
          message,
          code: typeof data.error === "string" ? data.error : undefined,
          details:
            data.details && typeof data.details === "object"
              ? (data.details as ErrorResult["details"])
              : undefined,
        });
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
        templateTitle:
          typeof data.templateTitle === "string"
            ? data.templateTitle
            : undefined,
        brandChecks:
          data.brandChecks && typeof data.brandChecks === "object"
            ? (data.brandChecks as BrandChecks)
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
    const checks = result.brandChecks;
    return (
      <section
        className="portal-result portal-result--success"
        aria-live="polite"
      >
        <p className="portal-eyebrow">Creative generated</p>
        <h2 className="portal-result-title">Creative generated</h2>
        <p className="portal-result-copy">
          An editable Canva design was created
          {result.templateTitle ? ` using ${result.templateTitle}` : ""} and
          posted to Marketing Project Requests.
        </p>
        {checks ? (
          <ul className="portal-checks">
            {checks.approvedLayout ? (
              <li>✓ Approved layout</li>
            ) : null}
            {checks.brandTreatment ? (
              <li>✓ SJJCC/UJA brand treatment</li>
            ) : null}
            {checks.qrGenerated ? <li>✓ QR generated</li> : null}
            {checks.contentMapped ? (
              <li>✓ Required content mapped</li>
            ) : null}
          </ul>
        ) : null}
        <div className="portal-result-actions">
          {result.canvaDesignUrl ? (
            <a
              className="portal-btn portal-btn--primary"
              href={result.canvaDesignUrl}
              target="_blank"
              rel="noreferrer"
            >
              Edit in Canva
            </a>
          ) : null}
          {result.basecampMessageUrl ? (
            <a
              className="portal-btn portal-btn--secondary"
              href={result.basecampMessageUrl}
              target="_blank"
              rel="noreferrer"
            >
              Basecamp request
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

  const channels = ASSET_TYPE_META[form.assetType].channels;
  const { classification, selection } = preview;
  const missingTemplate = !selection.ok;

  return (
    <form className="portal-form" onSubmit={onSubmit} noValidate>
      {result && !result.success ? (
        <div className="portal-alert" role="alert">
          {result.code === "NO_APPROVED_TEMPLATE" ? (
            <div className="portal-missing-template">
              <strong>No matching approved layout</strong>
              <pre className="portal-pre">{result.message}</pre>
            </div>
          ) : (
            result.message
          )}
        </div>
      ) : null}

      <Section title="What are we making?">
        <p className="portal-section-hint">Choose the asset family first.</p>
        <div className="portal-asset-grid" role="radiogroup" aria-label="Asset type">
          {ASSET_TYPE_OPTIONS.map((option) => {
            const selected = form.assetType === option.value;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={selected}
                className={`portal-asset-card${selected ? " is-selected" : ""}`}
                onClick={() => update("assetType", option.value)}
              >
                <span className="portal-asset-card-title">{option.label}</span>
                <span className="portal-asset-card-meta">
                  {option.dimensionsLabel}
                </span>
              </button>
            );
          })}
        </div>
        {errors.assetType ? (
          <span className="portal-field-error">{errors.assetType}</span>
        ) : null}

        <Field label="Intended channel">
          <select
            className="portal-input"
            value={form.intendedChannel}
            onChange={(e) => update("intendedChannel", e.target.value)}
          >
            <option value="">Select if helpful</option>
            {channels.map((channel) => (
              <option key={channel} value={channel}>
                {channel}
              </option>
            ))}
          </select>
        </Field>
      </Section>

      <Section title="Program / Event">
        <Field label="Department / Center">
          <input
            className="portal-input"
            value={form.department}
            onChange={(e) => update("department", e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Program / Event Name" error={errors.programName} required>
          <input
            className="portal-input"
            value={form.programName}
            onChange={(e) => update("programName", e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Headline">
          <input
            className="portal-input"
            value={form.headline}
            onChange={(e) => update("headline", e.target.value)}
            placeholder="Defaults to program name if empty"
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
          <Field label="Date">
            <input
              className="portal-input"
              value={form.date}
              onChange={(e) => update("date", e.target.value)}
              placeholder="e.g. September 12, 2026"
              autoComplete="off"
            />
          </Field>
          <Field label="Start time">
            <input
              className="portal-input"
              value={form.startTime}
              onChange={(e) => update("startTime", e.target.value)}
              placeholder="e.g. 7:00 PM"
              autoComplete="off"
            />
          </Field>
        </div>
        <div className="portal-row">
          <Field label="End time">
            <input
              className="portal-input"
              value={form.endTime}
              onChange={(e) => update("endTime", e.target.value)}
              autoComplete="off"
            />
          </Field>
          <Field label="Location">
            <input
              className="portal-input"
              value={form.location}
              onChange={(e) => update("location", e.target.value)}
              autoComplete="off"
            />
          </Field>
        </div>
        <Field label="Audience / Age range">
          <input
            className="portal-input"
            value={form.audience}
            onChange={(e) => update("audience", e.target.value)}
            autoComplete="off"
          />
        </Field>
        <Field label="Additional details">
          <textarea
            className="portal-input portal-textarea"
            value={form.additionalDetails}
            onChange={(e) => update("additionalDetails", e.target.value)}
            rows={3}
          />
        </Field>
        <Field label="Registration deadline">
          <input
            className="portal-input"
            value={form.registrationDeadline}
            onChange={(e) => update("registrationDeadline", e.target.value)}
            autoComplete="off"
          />
        </Field>
      </Section>

      <Section title="Registration / CTA">
        <Toggle
          label="Does this asset require registration?"
          checked={form.requiresRegistration}
          onChange={(v) => update("requiresRegistration", v)}
        />
        {form.requiresRegistration ? (
          <>
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
            <Field label="CTA label">
              <select
                className="portal-input"
                value={form.ctaLabel}
                onChange={(e) => update("ctaLabel", e.target.value)}
              >
                {CTA_LABEL_OPTIONS.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Toggle
              label="Include QR code"
              checked={form.includeQr}
              onChange={(v) => update("includeQr", v)}
            />
            {errors.includeQr ? (
              <span className="portal-field-error">{errors.includeQr}</span>
            ) : null}
          </>
        ) : null}
      </Section>

      <Section title="Pricing">
        <Toggle
          label="Does pricing need to appear?"
          checked={form.showPricing}
          onChange={(v) => update("showPricing", v)}
        />
        {form.showPricing ? (
          <>
            <div className="portal-row">
              <Field label="General price">
                <input
                  className="portal-input"
                  value={form.price}
                  onChange={(e) => update("price", e.target.value)}
                  autoComplete="off"
                />
              </Field>
              <Field label="Member price">
                <input
                  className="portal-input"
                  value={form.memberPrice}
                  onChange={(e) => update("memberPrice", e.target.value)}
                  autoComplete="off"
                />
              </Field>
            </div>
            <Field label="Non-member price">
              <input
                className="portal-input"
                value={form.nonMemberPrice}
                onChange={(e) => update("nonMemberPrice", e.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field label="Pricing notes">
              <input
                className="portal-input"
                value={form.pricingNotes}
                onChange={(e) => update("pricingNotes", e.target.value)}
                autoComplete="off"
              />
            </Field>
          </>
        ) : null}
      </Section>

      <Section title="Image">
        <Field label="Image treatment">
          <select
            className="portal-input"
            value={form.imageTreatment}
            onChange={(e) =>
              update("imageTreatment", e.target.value as ImageTreatment)
            }
          >
            <option value="auto">Let Creative Engine choose</option>
            <option value="template">Use template imagery</option>
            <option value="supplied">Use supplied image</option>
            <option value="none">No image</option>
          </select>
        </Field>
        {form.imageTreatment === "supplied" ? (
          <Field
            label="Image asset reference"
            error={errors.imageAssetReference}
          >
            <input
              className="portal-input"
              value={form.imageAssetReference}
              onChange={(e) => update("imageAssetReference", e.target.value)}
              placeholder="URL or asset id (upload to Canva in a later phase)"
              autoComplete="off"
            />
          </Field>
        ) : null}
      </Section>

      <Section title="Contact">
        <Toggle
          label="Show contact information?"
          checked={form.showContactInfo}
          onChange={(v) => update("showContactInfo", v)}
        />
        {form.showContactInfo ? (
          <>
            <Field label="Contact name" error={errors.contactName}>
              <input
                className="portal-input"
                value={form.contactName}
                onChange={(e) => update("contactName", e.target.value)}
                autoComplete="name"
              />
            </Field>
            <div className="portal-row">
              <Field label="Contact email">
                <input
                  className="portal-input"
                  type="email"
                  value={form.contactEmail}
                  onChange={(e) => update("contactEmail", e.target.value)}
                  autoComplete="email"
                />
              </Field>
              <Field label="Contact phone">
                <input
                  className="portal-input"
                  value={form.contactPhone}
                  onChange={(e) => update("contactPhone", e.target.value)}
                  autoComplete="tel"
                />
              </Field>
            </div>
          </>
        ) : null}
      </Section>

      <Section title="Brand / Partners">
        <p className="portal-section-hint">
          SJJCC branding is always present. UJA follows brand rules. Logo files
          are template-owned — not uploaded here.
        </p>
        <Toggle
          label="Additional partner?"
          checked={form.includePartner}
          onChange={(v) => update("includePartner", v)}
        />
        {form.includePartner ? (
          <>
            <Field label="Partner name" error={errors.partnerName} required>
              <input
                className="portal-input"
                value={form.partnerName}
                onChange={(e) => update("partnerName", e.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field label="Partner logo reference">
              <input
                className="portal-input"
                value={form.partnerLogoAssetReference}
                onChange={(e) =>
                  update("partnerLogoAssetReference", e.target.value)
                }
                placeholder="Optional asset reference"
                autoComplete="off"
              />
            </Field>
          </>
        ) : null}
      </Section>

      <Section title="Review">
        <dl className="portal-review">
          <div>
            <dt>Asset</dt>
            <dd>{ASSET_TYPE_LABELS[form.assetType]}</dd>
          </div>
          <div>
            <dt>Dimensions</dt>
            <dd>{ASSET_TYPE_META[form.assetType].dimensionsLabel}</dd>
          </div>
          <div>
            <dt>Content</dt>
            <dd>{DENSITY_LABELS[classification.density]}</dd>
          </div>
          <div>
            <dt>Image</dt>
            <dd>{IMAGE_LABELS[form.imageTreatment]}</dd>
          </div>
          <div>
            <dt>Contact</dt>
            <dd>{CONTACT_LABELS[classification.contactTreatment]}</dd>
          </div>
          <div>
            <dt>Registration</dt>
            <dd>
              {classification.requiresQr
                ? "QR enabled"
                : form.requiresRegistration
                  ? "URL only"
                  : "None"}
            </dd>
          </div>
          <div>
            <dt>Brand</dt>
            <dd>
              {classification.partnerTreatment === "sjjcc_uja_partner"
                ? "SJJCC + UJA + Partner"
                : "SJJCC + UJA"}
            </dd>
          </div>
          <div>
            <dt>Template</dt>
            <dd>
              {selection.ok
                ? "Matching approved layout"
                : "No matching layout"}
            </dd>
          </div>
        </dl>
        {missingTemplate ? (
          <p className="portal-review-warn">
            No approved Creative Engine layout matches this combination yet.
            Generating will explain what is missing instead of guessing a
            template.
          </p>
        ) : null}
      </Section>

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

function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="portal-section">
      <h2 className="portal-section-title">{title}</h2>
      <div className="portal-section-body">{children}</div>
    </section>
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

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="portal-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
