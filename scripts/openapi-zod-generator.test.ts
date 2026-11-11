import { describe, expect, it } from "vitest";

import { renderZodSchema } from "./openapi-zod-generator";

describe("renderZodSchema", () => {
  it("renders const, anyOf, oneOf, and allOf without weakening variants", () => {
    expect(renderZodSchema({ const: "committed", type: "string" })).toBe(
      'z.literal("committed")',
    );
    expect(
      renderZodSchema({
        anyOf: [{ type: "string" }, { type: "null" }],
      }),
    ).toBe("z.union([z.string(), z.null()])");
    expect(
      renderZodSchema({
        oneOf: [{ const: "left" }, { const: "right" }],
      }),
    ).toBe('z.union([z.literal("left"), z.literal("right")])');
    expect(
      renderZodSchema({
        allOf: [
          {
            additionalProperties: false,
            properties: { id: { type: "string" } },
            required: ["id"],
            type: "object",
          },
          {
            additionalProperties: false,
            properties: { version: { minimum: 1, type: "integer" } },
            required: ["version"],
            type: "object",
          },
        ],
      }),
    ).toBe(
      'z.strictObject({ "id": z.string() }).and(z.strictObject({ "version": z.int().min(1) }))',
    );
  });

  it("uses a discriminator only when the schema declares one", () => {
    const schema = {
      discriminator: { propertyName: "kind" },
      oneOf: [
        {
          additionalProperties: false,
          properties: { kind: { const: "text" }, text: { type: "string" } },
          required: ["kind", "text"],
          type: "object",
        },
        {
          additionalProperties: false,
          properties: { kind: { const: "report" }, date: { type: "string" } },
          required: ["kind", "date"],
          type: "object",
        },
      ],
    };

    expect(renderZodSchema(schema)).toBe(
      'z.discriminatedUnion("kind", [z.strictObject({ "kind": z.literal("text"), "text": z.string() }), z.strictObject({ "date": z.string(), "kind": z.literal("report") })])',
    );
  });

  it("allows a consumer override while keeping the shared recursive renderer", () => {
    const sequence = {
      pattern: "^(0|[1-9][0-9]{0,18})$",
      type: "string",
    };
    const rendered = renderZodSchema(
      {
        additionalProperties: false,
        properties: { eventSeq: sequence },
        required: ["eventSeq"],
        type: "object",
      },
      {
        override: (schema) =>
          schema.pattern === sequence.pattern ? "ConversationSequenceSchema" : undefined,
      },
    );

    expect(rendered).toBe(
      'z.strictObject({ "eventSeq": ConversationSequenceSchema })',
    );
  });
});
