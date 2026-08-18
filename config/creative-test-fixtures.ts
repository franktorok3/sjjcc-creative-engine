/**
 * Deterministic Creative Engine portal test fixtures.
 * Safe labeled URLs only — do not use real active program data.
 */

import type { PortalCreativeRequestInput } from "@/lib/creative/creative-request";

const TEST_URL_FLYER =
  "https://example.com/sjjcc-creative-engine-test/flyer-fall-open-house";
const TEST_URL_HANDOUT =
  "https://example.com/sjjcc-creative-engine-test/handout-wellness-workshop";
const TEST_URL_SOCIAL =
  "https://example.com/sjjcc-creative-engine-test/social-community-celebration";

export type CreativeTestFixtureId = "flyer" | "handout" | "social";

export type CreativeTestFixture = {
  id: CreativeTestFixtureId;
  label: string;
  /** Portal POST body (source = creative_engine_portal). */
  request: PortalCreativeRequestInput;
};

export const CREATIVE_TEST_FIXTURES: Record<
  CreativeTestFixtureId,
  CreativeTestFixture
> = {
  flyer: {
    id: "flyer",
    label: "Flyer — Fall Open House (test)",
    request: {
      source: "creative_engine_portal",
      assetType: "flyer_full",
      programName: "Fall Open House",
      headline: "DISCOVER WHAT’S HAPPENING THIS FALL",
      description:
        "Join us for an evening of programs, community, and connection at Sid Jacobson JCC.",
      date: "September 15, 2026",
      startTime: "6:00 PM",
      endTime: "8:00 PM",
      location: "Sid Jacobson JCC",
      requiresRegistration: true,
      registrationUrl: TEST_URL_FLYER,
      ctaLabel: "Register",
      includeQr: true,
      showPricing: false,
      imageTreatment: "auto",
      showContactInfo: false,
      includePartner: false,
    },
  },
  handout: {
    id: "handout",
    label: "Handout — Wellness Workshop (test)",
    request: {
      source: "creative_engine_portal",
      assetType: "handout_half",
      programName: "Wellness Workshop",
      headline: "BUILD BETTER ENERGY",
      description:
        "Practical strategies for nutrition, movement, and everyday well-being.",
      date: "October 6, 2026",
      startTime: "10:00 AM",
      location: "Sid Jacobson JCC",
      requiresRegistration: true,
      registrationUrl: TEST_URL_HANDOUT,
      ctaLabel: "Learn More",
      includeQr: true,
      showPricing: false,
      imageTreatment: "auto",
      showContactInfo: false,
      includePartner: false,
    },
  },
  social: {
    id: "social",
    label: "Social — Community Celebration (test)",
    request: {
      source: "creative_engine_portal",
      assetType: "social_portrait",
      programName: "Community Celebration",
      headline: "JOIN US",
      description: "An afternoon of music, food, and community.",
      date: "October 18, 2026",
      startTime: "1:00 PM",
      location: "Sid Jacobson JCC",
      requiresRegistration: true,
      registrationUrl: TEST_URL_SOCIAL,
      ctaLabel: "RSVP",
      includeQr: true,
      showPricing: false,
      imageTreatment: "auto",
      showContactInfo: false,
      includePartner: false,
    },
  },
};

export const CREATIVE_TEST_FIXTURE_LIST = [
  CREATIVE_TEST_FIXTURES.flyer,
  CREATIVE_TEST_FIXTURES.handout,
  CREATIVE_TEST_FIXTURES.social,
] as const;
