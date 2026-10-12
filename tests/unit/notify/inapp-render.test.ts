import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateGroup, renderInApp } from "../../../src/lib/notify/inapp.ts";
import { NOTIFICATION_TYPES, parsePayload } from "../../../src/lib/notify/types.ts";
import { SAMPLE_PAYLOADS } from "./samples.ts";

/** What each event looks like in the bell and on hub /notifications (reviewed copy and links). */
const EXPECTED = {
  "job_posted": {
    "title": "Your job is live: Build a Stripe webhook handler",
    "body": "Agents can now send bids.",
    "surface": "gigs",
    "url": "/jobs/job_1"
  },
  "bid_received": {
    "title": "New bid on Build a Stripe webhook handler",
    "body": "Atlas Agent bid $300.00",
    "surface": "gigs",
    "url": "/jobs/job_1"
  },
  "bid_accepted": {
    "title": "Your bid was accepted: Build a Stripe webhook handler",
    "body": "$300.00. Work starts once payment is confirmed.",
    "surface": "gigs",
    "url": "/contracts/c_1"
  },
  "contract_created": {
    "title": "Contract started: Build a Stripe webhook handler",
    "body": "With Atlas Agent, $360.00",
    "surface": "gigs",
    "url": "/contracts/c_1"
  },
  "payment_confirmed": {
    "title": "Payment confirmed: Build a Stripe webhook handler",
    "body": "$360.00 held until you accept the delivery",
    "surface": "gigs",
    "url": "/contracts/c_1"
  },
  "steering_awaiting_approval": {
    "title": "Approval needed: Build a Stripe webhook handler",
    "body": "Atlas Agent: Should failed events be retried with the same idempotency key?",
    "surface": "gigs",
    "url": "/contracts/c_1?tab=steering"
  },
  "scope_change_awaiting_approval": {
    "title": "Scope change to approve: Build a Stripe webhook handler",
    "body": "Atlas Agent: Add support for Connect account events.",
    "surface": "gigs",
    "url": "/contracts/c_1?tab=steering"
  },
  "submission_received": {
    "title": "Work submitted for QA: Build a Stripe webhook handler",
    "body": "From Atlas Agent",
    "surface": "gigs",
    "url": "/contracts/c_1?tab=qa"
  },
  "qa_verdict": {
    "title": "QA needs changes: Build a Stripe webhook handler",
    "body": "Two acceptance tests fail on duplicate events.",
    "surface": "gigs",
    "url": "/contracts/c_1?tab=qa"
  },
  "delivery_ready": {
    "title": "Delivery ready: Build a Stripe webhook handler",
    "body": "Review it and accept, or open a dispute.",
    "surface": "gigs",
    "url": "/contracts/c_1/delivery"
  },
  "auto_accept_reminder": {
    "title": "Delivery auto-accepts soon: Build a Stripe webhook handler",
    "body": null,
    "surface": "gigs",
    "url": "/contracts/c_1/delivery"
  },
  "dispute_opened": {
    "title": "Dispute opened: Build a Stripe webhook handler",
    "body": "By Dana Client",
    "surface": "gigs",
    "url": "/contracts/c_1/delivery"
  },
  "dispute_resolved": {
    "title": "Dispute resolved: Build a Stripe webhook handler",
    "body": "Partial refund of $100 to the client.",
    "surface": "gigs",
    "url": "/contracts/c_1/delivery"
  },
  "payout_sent": {
    "title": "Payout sent: $300.00",
    "body": "Build a Stripe webhook handler",
    "surface": "gigs",
    "url": "/contracts/c_1/delivery"
  },
  "review_received": {
    "title": "Dana Client rated you 5/5",
    "body": "Fast and clean work.",
    "surface": "gigs",
    "url": "/activity"
  },
  "review_requested": {
    "title": "How did it go? Review Agent Smith",
    "body": "Build a Stripe webhook handler",
    "surface": "gigs",
    "url": "/contracts/c_1/delivery"
  },
  "progress_update": {
    "title": "Progress on Build a Stripe webhook handler",
    "body": "Webhook signature checks are in; retries are next.",
    "surface": "gigs",
    "url": "/contracts/c_1?tab=status"
  },
  "milestone_completed": {
    "title": "Milestone done: Signature checks",
    "body": "Build a Stripe webhook handler",
    "surface": "gigs",
    "url": "/contracts/c_1?tab=milestones"
  },
  "package_installed": {
    "title": "New install of GitHub MCP",
    "body": "Installs are anonymous counts.",
    "surface": "marketplace",
    "url": "/publisher/activity"
  },
  "package_approved": {
    "title": "GitHub MCP is live in the marketplace",
    "body": null,
    "surface": "marketplace",
    "url": "/fx-github-mcp"
  },
  "package_rejected": {
    "title": "GitHub MCP wasn't approved",
    "body": "The README is missing install steps.",
    "surface": "marketplace",
    "url": "/publish"
  },
  "submission_awaiting_qa": {
    "title": "Submission awaiting QA: Build a Stripe webhook handler",
    "body": "From Atlas Agent",
    "surface": "hub",
    "url": "/admin/qa"
  }
} as const;

test("every event renders its reviewed title, body, surface and link", () => {
  for (const type of NOTIFICATION_TYPES) {
    assert.deepEqual(renderInApp(type, parsePayload(type, SAMPLE_PAYLOADS[type])), EXPECTED[type], type);
  }
});

test("admin disputes quote the reason; without one they name only who opened it", () => {
  const base = { jobId: "j", jobTitle: "T", contractId: "c1", openedBy: "Cara", audience: "admin" as const };
  assert.equal(renderInApp("dispute_opened", parsePayload("dispute_opened", { ...base, reason: "Missing export" })).body, "By Cara: Missing export");
  assert.equal(renderInApp("dispute_opened", parsePayload("dispute_opened", base)).body, "By Cara");
  assert.equal(renderInApp("dispute_opened", parsePayload("dispute_opened", base)).title, "Dispute opened: T");
});

test("optional bodies fall back: QA without a summary, reviews without a comment, bid accepted without a contract", () => {
  assert.equal(renderInApp("qa_verdict", parsePayload("qa_verdict", { jobId: "j", jobTitle: "T", contractId: "c", verdict: "pass" })).body, null);
  assert.equal(renderInApp("review_received", parsePayload("review_received", { reviewerName: "C", rating: 3, jobTitle: "Relay" })).body, "Relay");
  assert.equal(renderInApp("review_received", parsePayload("review_received", { reviewerName: "C", rating: 3 })).body, null);
  assert.equal(renderInApp("bid_accepted", parsePayload("bid_accepted", { jobId: "j 1", jobTitle: "T", amountCents: 100, currency: "eur" })).url, "/jobs/j%201");
});

test("text is trimmed and clipped: exactly the limit stays, longer gets an ellipsis without trailing space", () => {
  const at200 = "a".repeat(200 - "Your job is live: ".length);
  assert.equal(renderInApp("job_posted", parsePayload("job_posted", { jobId: "j", jobTitle: at200 })).title.length, 200);
  assert.ok(!renderInApp("job_posted", parsePayload("job_posted", { jobId: "j", jobTitle: at200 })).title.endsWith("…"));
  const spaced = "Your job is live: ".length;
  const title = "b".repeat(198 - spaced) + "  " + "c".repeat(20);
  const clipped = renderInApp("job_posted", parsePayload("job_posted", { jobId: "j", jobTitle: title })).title;
  assert.equal(clipped, "Your job is live: " + "b".repeat(198 - spaced) + "…");
  const padded = renderInApp("progress_update", parsePayload("progress_update", { jobId: "j", jobTitle: "T", contractId: "c", summary: "  hi  " }));
  assert.equal(padded.body, "hi");
  const blank = renderInApp("progress_update", parsePayload("progress_update", { jobId: "j", jobTitle: "T", contractId: "c", summary: "   " }));
  assert.equal(blank.body, null);
  const long = renderInApp("progress_update", parsePayload("progress_update", { jobId: "j", jobTitle: "T", contractId: "c", summary: "x".repeat(900) }));
  assert.equal(long.body?.length, 500);
});

test("an install without a package id never aggregates", () => {
  assert.equal(aggregateGroup("package_installed", { packageId: 42 }), null);
  assert.equal(aggregateGroup("package_installed", {}), null);
});
