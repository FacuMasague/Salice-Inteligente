import { VECTOR_KEYS } from '../shared/product-vectors.js';

const text = (maxLength: number, minLength = 1) => ({
  type: 'string',
  minLength,
  maxLength,
});

const evidenceIds = {
  type: 'array',
  items: text(160),
  maxItems: 12,
};

const statement = {
  type: 'object',
  additionalProperties: false,
  properties: {
    text: text(420),
    evidenceIds,
  },
  required: ['text', 'evidenceIds'],
};

const faq = {
  type: 'object',
  additionalProperties: false,
  properties: {
    question: text(180),
    answer: text(420),
    evidenceIds,
  },
  required: ['question', 'answer', 'evidenceIds'],
};

export const REPORT_NARRATIVE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    title: text(120),
    currentState: text(500),
    findings: { type: 'array', items: statement, minItems: 2, maxItems: 3 },
    drivers: { type: 'array', items: statement, minItems: 1, maxItems: 4 },
    reviewItems: { type: 'array', items: statement, maxItems: 4 },
    limitations: { type: 'array', items: text(360), minItems: 1, maxItems: 5 },
    faqs: { type: 'array', items: faq, minItems: 2, maxItems: 4 },
  },
  required: ['title', 'currentState', 'findings', 'drivers', 'reviewItems', 'limitations', 'faqs'],
} as const;

export const EXECUTIVE_BRIEF_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    currentState: text(520),
    keyIssues: { type: 'array', items: statement, minItems: 1, maxItems: 5 },
    favorableIndicators: { type: 'array', items: statement, minItems: 1, maxItems: 5 },
    reviewItems: { type: 'array', items: statement, minItems: 1, maxItems: 5 },
    limitations: { type: 'array', items: text(360), minItems: 1, maxItems: 6 },
    faqs: { type: 'array', items: faq, minItems: 2, maxItems: 4 },
  },
  required: ['currentState', 'keyIssues', 'favorableIndicators', 'reviewItems', 'limitations', 'faqs'],
} as const;

export const COMMERCIAL_EXPLANATION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          clientId: { type: 'integer' },
          primaryReason: text(280),
          secondaryReasons: { type: 'array', items: text(260), maxItems: 3 },
          explanation: text(700),
          evidenceIds,
          commercialOpportunity: text(440, 0),
          caution: text(380),
        },
        required: [
          'clientId',
          'primaryReason',
          'secondaryReasons',
          'explanation',
          'evidenceIds',
          'commercialOpportunity',
          'caution',
        ],
      },
    },
  },
  required: ['items'],
} as const;

export const SELLER_SUMMARY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    items: {
      type: 'array',
      minItems: 1,
      maxItems: 12,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          seller: text(160),
          summary: text(520),
          portfolioSignals: { type: 'array', items: statement, minItems: 1, maxItems: 5 },
          reviewItems: { type: 'array', items: statement, maxItems: 5 },
          limitations: { type: 'array', items: text(320), minItems: 1, maxItems: 4 },
        },
        required: ['seller', 'summary', 'portfolioSignals', 'reviewItems', 'limitations'],
      },
    },
  },
  required: ['items'],
} as const;

export const PRODUCT_VECTOR_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    vector: {
      type: 'object',
      additionalProperties: false,
      properties: Object.fromEntries(VECTOR_KEYS.map((key) => [key, {
        type: 'integer',
        minimum: 0,
        maximum: 100,
      }])),
      required: VECTOR_KEYS,
    },
    confidence: { type: 'integer', minimum: 0, maximum: 100 },
    evidence: {
      type: 'array',
      maxItems: 66,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          dimension: { type: 'string', enum: VECTOR_KEYS },
          source: text(120),
          explanation: text(260),
        },
        required: ['dimension', 'source', 'explanation'],
      },
    },
    warnings: { type: 'array', items: text(320), maxItems: 8 },
    declaredCombinations: {
      type: 'object',
      additionalProperties: false,
      properties: {
        species: text(240, 0),
        lifeStage: text(240, 0),
        petSize: text(240, 0),
      },
      required: ['species', 'lifeStage', 'petSize'],
    },
  },
  required: ['vector', 'confidence', 'evidence', 'warnings', 'declaredCombinations'],
} as const;
