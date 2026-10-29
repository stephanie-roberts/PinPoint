/**
 * PinPoint database models — single source of truth.
 *
 * Used by:
 * - CLI to generate Prisma schema (via prisma-ast)
 * - Adapter for Zod validation
 * - Type exports
 *
 * This is a TS representation, NOT a .prisma file.
 * The CLI generates the actual Prisma schema from this definition.
 */

import type { AssertEqual } from "./type-utils.js";
import type { AnnotationRecord, CommentRecord, FeedbackRecord } from "./types.js";

/** Prisma scalar types supported by PinPoint field definitions. */
export type PrismaScalarType =
  | "String"
  | "Boolean"
  | "Int"
  | "BigInt"
  | "Float"
  | "Decimal"
  | "DateTime"
  | "Json"
  | "Bytes";

/** Prisma native column hints applied via `@db.<NativeType>`. */
export type PrismaNativeType = "Text" | "VarChar" | "Char" | "MediumText" | "LongText" | (string & {});

/** Relation cardinality between two PinPoint models. */
export type RelationKind = "1-to-many" | "many-to-1";

/** Prisma `onDelete` referential action. */
export type RelationOnDelete = "Cascade" | "Restrict" | "NoAction" | "SetNull" | "SetDefault";

/**
 * Relation metadata attached to a {@link FieldDef}.
 *
 * - `1-to-many` fields point at the related model and require no inverse
 *   column on this side (`fields`/`references` are inferred by Prisma).
 * - `many-to-1` fields own the foreign key — Prisma needs `fields` and
 *   `references` to wire it up.
 */
export interface RelationDef {
  kind: RelationKind;
  model: string;
  fields?: readonly string[];
  references?: readonly string[];
  onDelete?: RelationOnDelete;
}

/**
 * Definition of a single field in a PinPoint database model.
 *
 * The interface intentionally keeps a wide structural shape so it stays
 * easy to extend, but consumers can narrow via {@link isRelationField} /
 * {@link isScalarField} when relation vs. scalar logic diverges.
 */
export interface FieldDef {
  /** Prisma type (e.g. "String", "Int") for scalars, model name for relations. */
  type: PrismaScalarType | (string & {});
  /** Default literal (`"open"`) or function call (`now()`, `cuid()`). */
  default?: string;
  /** Whether the column is nullable. */
  optional?: boolean;
  /** Set on relation fields — absent on scalars. */
  relation?: RelationDef;
  isId?: boolean;
  isUnique?: boolean;
  /** Prisma native type attribute (e.g. "Text" for @db.Text) — used for MySQL compatibility on long strings */
  nativeType?: PrismaNativeType;
  /** Prisma @updatedAt attribute */
  isUpdatedAt?: boolean;
}

/** Narrowing predicate: returns `true` when `field` declares a Prisma relation. */
export function isRelationField(field: FieldDef): field is FieldDef & { relation: RelationDef } {
  return field.relation !== undefined;
}

/** Narrowing predicate: returns `true` when `field` is a Prisma scalar (no relation metadata). */
export function isScalarField(field: FieldDef): field is FieldDef & { relation?: undefined } {
  return field.relation === undefined;
}

/** Definition of a composite index on a PinPoint database model. */
export interface IndexDef {
  fields: readonly string[];
}

/** Definition of a single PinPoint database model (fields + indexes). */
export interface ModelDef {
  fields: Record<string, FieldDef>;
  indexes?: readonly IndexDef[];
}

const _TC_PINPOINT_MODELS = {
  TcPinpointFeedback: {
    fields: {
      id: { type: "String", isId: true, default: "cuid()" },
      projectName: { type: "String" },
      type: { type: "String" },
      message: { type: "String", nativeType: "Text" },
      status: { type: "String", default: '"open"' },
      url: { type: "String" },
      urlPattern: { type: "String", optional: true },
      screenshotUrl: { type: "String", optional: true, nativeType: "Text" },
      screenshotRegion: { type: "Json", optional: true },
      diagnostics: { type: "Json", optional: true },
      viewport: { type: "String" },
      userAgent: { type: "String" },
      authorName: { type: "String" },
      authorEmail: { type: "String" },
      clientId: { type: "String", isUnique: true },
      resolvedAt: { type: "DateTime", optional: true },
      createdAt: { type: "DateTime", default: "now()" },
      updatedAt: { type: "DateTime", isUpdatedAt: true },
      annotations: {
        type: "TcPinpointAnnotation",
        relation: { kind: "1-to-many", model: "TcPinpointAnnotation" },
      },
      comments: {
        type: "TcPinpointComment",
        relation: { kind: "1-to-many", model: "TcPinpointComment" },
      },
    },
    indexes: [
      { fields: ["projectName"] },
      { fields: ["projectName", "status", "createdAt"] },
      { fields: ["projectName", "url"] },
    ],
  },
  TcPinpointAnnotation: {
    fields: {
      id: { type: "String", isId: true, default: "cuid()" },
      feedbackId: { type: "String" },
      feedback: {
        type: "TcPinpointFeedback",
        relation: {
          kind: "many-to-1",
          model: "TcPinpointFeedback",
          fields: ["feedbackId"],
          references: ["id"],
          onDelete: "Cascade",
        },
      },
      cssSelector: { type: "String", nativeType: "Text" },
      xpath: { type: "String", nativeType: "Text" },
      textSnippet: { type: "String", nativeType: "Text" },
      elementTag: { type: "String" },
      elementId: { type: "String", optional: true },
      textPrefix: { type: "String", nativeType: "Text" },
      textSuffix: { type: "String", nativeType: "Text" },
      fingerprint: { type: "String" },
      neighborText: { type: "String", nativeType: "Text" },
      anchorKey: { type: "String", optional: true },
      xPct: { type: "Float" },
      yPct: { type: "Float" },
      wPct: { type: "Float" },
      hPct: { type: "Float" },
      scrollX: { type: "Float" },
      scrollY: { type: "Float" },
      viewportW: { type: "Int" },
      viewportH: { type: "Int" },
      devicePixelRatio: { type: "Float", default: "1" },
      createdAt: { type: "DateTime", default: "now()" },
    },
    indexes: [{ fields: ["feedbackId"] }],
  },
  TcPinpointComment: {
    fields: {
      id: { type: "String", isId: true, default: "cuid()" },
      feedbackId: { type: "String" },
      feedback: {
        type: "TcPinpointFeedback",
        relation: {
          kind: "many-to-1",
          model: "TcPinpointFeedback",
          fields: ["feedbackId"],
          references: ["id"],
          onDelete: "Cascade",
        },
      },
      body: { type: "String", nativeType: "Text" },
      authorName: { type: "String" },
      authorEmail: { type: "String" },
      authorRole: { type: "String", default: '"client"' },
      clientId: { type: "String", isUnique: true },
      createdAt: { type: "DateTime", default: "now()" },
    },
    // A thread is read oldest first, one feedback at a time.
    indexes: [{ fields: ["feedbackId", "createdAt"] }],
  },
} as const satisfies Record<string, ModelDef>;

/** Map of PinPoint models keyed by model name — frozen at runtime. */
export const TC_PINPOINT_MODELS: typeof _TC_PINPOINT_MODELS = Object.freeze(_TC_PINPOINT_MODELS);

/** Union of every PinPoint model name as a string literal. */
export type TcPinpointModelName = keyof typeof TC_PINPOINT_MODELS;

/** Field names declared on a specific PinPoint model. */
export type TcPinpointModelFieldName<M extends TcPinpointModelName> = keyof (typeof TC_PINPOINT_MODELS)[M]["fields"];

// ---------------------------------------------------------------------------
// Compile-time locks — the Prisma model definitions and the store record
// interfaces describe the same columns. Adding a field to one side without
// the other is a compile error here (the CLI generates the actual Prisma
// schema from TC_PINPOINT_MODELS, so a missed column would otherwise only
// surface as a runtime Prisma error).
// ---------------------------------------------------------------------------

const _feedbackModelMatchesRecord: AssertEqual<
  TcPinpointModelFieldName<"TcPinpointFeedback">,
  keyof FeedbackRecord
> = true;
void _feedbackModelMatchesRecord;

// `feedback` is the relation back-reference — the only field with no record
// counterpart.
const _annotationModelMatchesRecord: AssertEqual<
  Exclude<TcPinpointModelFieldName<"TcPinpointAnnotation">, "feedback">,
  keyof AnnotationRecord
> = true;
void _annotationModelMatchesRecord;

const _commentModelMatchesRecord: AssertEqual<
  Exclude<TcPinpointModelFieldName<"TcPinpointComment">, "feedback">,
  keyof CommentRecord
> = true;
void _commentModelMatchesRecord;
