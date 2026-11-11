export type JsonObject = Record<string, unknown>;

export interface RenderZodSchemaOptions {
  override?(schema: JsonObject): string | undefined;
  transform?(schema: JsonObject, expression: string): string;
}

export function renderZodSchema(
  schema: JsonObject,
  options: RenderZodSchemaOptions = {},
): string {
  const overridden = options.override?.(schema);
  if (overridden !== undefined) return overridden;

  let expression: string;
  if (Object.keys(schema).length === 0) {
    expression = "z.unknown()";
  } else if (schema.$ref) {
    expression = renderReference(schema.$ref);
  } else if (Object.hasOwn(schema, "const")) {
    expression = `z.literal(${renderLiteral(schema.const)})`;
  } else if (Array.isArray(schema.enum)) {
    expression = renderEnum(schema.enum);
  } else if (Array.isArray(schema.oneOf)) {
    expression = renderUnion("oneOf", schema.oneOf, schema, options);
  } else if (Array.isArray(schema.anyOf)) {
    expression = renderUnion("anyOf", schema.anyOf, schema, options);
  } else if (Array.isArray(schema.allOf)) {
    expression = renderIntersection(schema.allOf, options);
  } else {
    expression = renderTypedSchema(schema, options);
  }
  return options.transform?.(schema, expression) ?? expression;
}

function renderEnum(values: unknown[]): string {
  if (values.length === 0) throw new Error("Schema enum must not be empty.");
  if (values.every((value) => typeof value === "string")) {
    return `z.enum(${JSON.stringify(values)})`;
  }
  const literals = values.map((value) => `z.literal(${renderLiteral(value)})`);
  return literals.length === 1 ? literals[0] : `z.union([${literals.join(", ")}])`;
}

function renderUnion(
  keyword: "anyOf" | "oneOf",
  rawVariants: unknown[],
  schema: JsonObject,
  options: RenderZodSchemaOptions,
): string {
  if (rawVariants.length === 0) {
    throw new Error(`Schema ${keyword} must not be empty.`);
  }
  const variants = rawVariants.map((value, index) =>
    renderZodSchema(asObject(value, `${keyword} variant ${index}`), options),
  );
  if (variants.length === 1) return variants[0];
  if (keyword === "oneOf" && schema.discriminator !== undefined) {
    const discriminator = asObject(schema.discriminator, "discriminator");
    const propertyName = requiredString(
      discriminator.propertyName,
      "discriminator propertyName",
    );
    return `z.discriminatedUnion(${JSON.stringify(propertyName)}, [${variants.join(", ")}])`;
  }
  return `z.union([${variants.join(", ")}])`;
}

function renderIntersection(
  rawVariants: unknown[],
  options: RenderZodSchemaOptions,
): string {
  if (rawVariants.length === 0) {
    throw new Error("Schema allOf must not be empty.");
  }
  const variants = rawVariants.map((value, index) =>
    renderZodSchema(asObject(value, `allOf variant ${index}`), options),
  );
  return variants.slice(1).reduce(
    (combined, variant) => `${combined}.and(${variant})`,
    variants[0],
  );
}

function renderTypedSchema(
  schema: JsonObject,
  options: RenderZodSchemaOptions,
): string {
  let expression: string;
  switch (schema.type) {
    case "string":
      expression = "z.string()";
      if (typeof schema.minLength === "number") expression += `.min(${schema.minLength})`;
      if (typeof schema.maxLength === "number") expression += `.max(${schema.maxLength})`;
      if (typeof schema.pattern === "string") {
        expression += `.regex(new RegExp(${JSON.stringify(schema.pattern)}))`;
      }
      if (schema.format === "date-time") expression += ".datetime({ offset: true })";
      break;
    case "integer":
      expression = renderNumberConstraints("z.int()", schema);
      break;
    case "number":
      expression = renderNumberConstraints("z.number()", schema);
      break;
    case "boolean":
      expression = "z.boolean()";
      break;
    case "null":
      expression = "z.null()";
      break;
    case "array": {
      const items = asObject(schema.items, "array items");
      expression = `z.array(${renderZodSchema(items, options)})`;
      if (typeof schema.minItems === "number") expression += `.min(${schema.minItems})`;
      if (typeof schema.maxItems === "number") expression += `.max(${schema.maxItems})`;
      break;
    }
    case "object":
      expression = renderZodObject(schema, options);
      break;
    default:
      throw new Error(`Unsupported JSON Schema type: ${String(schema.type)}`);
  }
  return expression;
}

function renderZodObject(
  schema: JsonObject,
  options: RenderZodSchemaOptions,
): string {
  const properties = schema.properties
    ? asObject(schema.properties, "object properties")
    : {};
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.map((value) => requiredString(value, "required property"))
      : [],
  );
  const entries = Object.keys(properties).sort().map((name) => {
    const property = asObject(properties[name], `property ${name}`);
    let expression = renderZodSchema(property, options);
    if (!required.has(name) && !Object.hasOwn(property, "default")) {
      expression += ".optional()";
    }
    return `${JSON.stringify(name)}: ${expression}`;
  });
  const additional = schema.additionalProperties;
  if (entries.length === 0 && additional && typeof additional === "object") {
    const keySchema = schema.propertyNames
      ? renderZodSchema(asObject(schema.propertyNames, "propertyNames"), options)
      : "z.string()";
    return `z.record(${keySchema}, ${renderZodSchema(asObject(additional, "additionalProperties"), options)})`;
  }
  const shape = `{ ${entries.join(", ")} }`;
  if (additional === false) return `z.strictObject(${shape})`;
  if (additional && typeof additional === "object") {
    return `z.object(${shape}).catchall(${renderZodSchema(asObject(additional, "additionalProperties"), options)})`;
  }
  return `z.looseObject(${shape})`;
}

function renderNumberConstraints(expression: string, schema: JsonObject): string {
  if (typeof schema.minimum === "number") expression += `.min(${schema.minimum})`;
  if (typeof schema.maximum === "number") expression += `.max(${schema.maximum})`;
  if (typeof schema.exclusiveMinimum === "number") {
    expression += `.gt(${schema.exclusiveMinimum})`;
  }
  if (typeof schema.exclusiveMaximum === "number") {
    expression += `.lt(${schema.exclusiveMaximum})`;
  }
  return expression;
}

function renderReference(value: unknown): string {
  if (typeof value === "string" && value.startsWith("#/components/schemas/")) {
    const name = requiredIdentifier(
      value.slice("#/components/schemas/".length),
      "component reference",
    );
    return `${name}Schema`;
  }
  throw new Error(`Unsupported JSON Schema reference: ${String(value)}`);
}

function renderLiteral(value: unknown): string {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("Schema literal must be JSON-serializable.");
  }
  return serialized;
}

export function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be a string.`);
  return value;
}

export function requiredIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value)) {
    throw new Error(`${label} is not a safe TypeScript identifier.`);
  }
  return value;
}

export function asObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as JsonObject;
}
