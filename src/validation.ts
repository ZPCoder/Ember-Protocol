import {
  CONTRACT_SCHEMAS,
  type ContractName,
  type ContractTypeMap,
} from "./generated/contracts.js";

type JsonSchema = Readonly<Record<string, unknown>>;

export interface ValidationIssue {
  readonly path: string;
  readonly keyword: string;
  readonly message: string;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

export class ContractValidationError extends Error {
  readonly issues: readonly ValidationIssue[];

  constructor(name: string, issues: readonly ValidationIssue[]) {
    super(`${name} contract validation failed: ${issues.map((issue) => `${issue.path} ${issue.message}`).join("; ")}`);
    this.name = "ContractValidationError";
    this.issues = issues;
  }
}

const schemas = CONTRACT_SCHEMAS as unknown as Readonly<Record<string, JsonSchema>>;

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function issue(
  issues: ValidationIssue[],
  path: string,
  keyword: string,
  message: string,
): void {
  issues.push({ path, keyword, message });
}

function resolveReference(reference: string): JsonSchema | undefined {
  const prefix = "#/$defs/";
  return reference.startsWith(prefix) ? schemas[reference.slice(prefix.length)] : undefined;
}

function validateNode(node: JsonSchema, value: unknown, path: string, issues: ValidationIssue[]): void {
  if (typeof node.$ref === "string") {
    const resolved = resolveReference(node.$ref);
    if (!resolved) issue(issues, path, "$ref", `has unresolved reference ${node.$ref}`);
    else validateNode(resolved, value, path, issues);
    return;
  }

  if (Object.hasOwn(node, "const") && !sameJson(value, node.const)) {
    issue(issues, path, "const", `must equal ${JSON.stringify(node.const)}`);
    return;
  }

  if (Array.isArray(node.enum) && !node.enum.some((candidate) => sameJson(candidate, value))) {
    issue(issues, path, "enum", "is not an allowed value");
    return;
  }

  for (const keyword of ["oneOf", "anyOf"] as const) {
    const choices = node[keyword];
    if (!Array.isArray(choices)) continue;
    const matches = choices.filter((choice) => {
      const nested: ValidationIssue[] = [];
      validateNode(choice as JsonSchema, value, path, nested);
      return nested.length === 0;
    }).length;
    const valid = keyword === "oneOf" ? matches === 1 : matches >= 1;
    if (!valid) issue(issues, path, keyword, `must match ${keyword === "oneOf" ? "exactly one" : "at least one"} variant`);
    return;
  }

  const expectedTypes = Array.isArray(node.type) ? node.type : node.type ? [node.type] : [];
  if (expectedTypes.length > 0) {
    const matches = expectedTypes.some((expected) => {
      if (expected === "null") return value === null;
      if (expected === "array") return Array.isArray(value);
      if (expected === "object") return typeof value === "object" && value !== null && !Array.isArray(value);
      if (expected === "integer") return typeof value === "number" && Number.isInteger(value);
      if (expected === "number") return typeof value === "number" && Number.isFinite(value);
      return typeof value === expected;
    });
    if (!matches) {
      issue(issues, path, "type", `must be ${expectedTypes.join(" or ")}`);
      return;
    }
  }

  if (typeof value === "string") {
    if (typeof node.minLength === "number" && value.length < node.minLength) issue(issues, path, "minLength", `must contain at least ${node.minLength} characters`);
    if (typeof node.maxLength === "number" && value.length > node.maxLength) issue(issues, path, "maxLength", `must contain at most ${node.maxLength} characters`);
    if (typeof node.pattern === "string" && !new RegExp(node.pattern).test(value)) issue(issues, path, "pattern", "has an invalid format");
    if (node.format === "date-time" && Number.isNaN(Date.parse(value))) issue(issues, path, "format", "must be an ISO date-time");
    if (node.format === "uri") {
      try {
        new URL(value);
      } catch {
        issue(issues, path, "format", "must be an absolute URI");
      }
    }
  }

  if (typeof value === "number") {
    if (typeof node.minimum === "number" && value < node.minimum) issue(issues, path, "minimum", `must be at least ${node.minimum}`);
    if (typeof node.maximum === "number" && value > node.maximum) issue(issues, path, "maximum", `must be at most ${node.maximum}`);
  }

  if (Array.isArray(value)) {
    if (typeof node.minItems === "number" && value.length < node.minItems) issue(issues, path, "minItems", `must contain at least ${node.minItems} items`);
    if (typeof node.maxItems === "number" && value.length > node.maxItems) issue(issues, path, "maxItems", `must contain at most ${node.maxItems} items`);
    if (node.uniqueItems === true) {
      const serialized = value.map((item) => JSON.stringify(item));
      if (new Set(serialized).size !== serialized.length) issue(issues, path, "uniqueItems", "must not contain duplicate items");
    }
    if (node.items && typeof node.items === "object") {
      value.forEach((item, index) => validateNode(node.items as JsonSchema, item, `${path}[${index}]`, issues));
    }
  }

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    if (typeof node.maxProperties === "number" && keys.length > node.maxProperties) issue(issues, path, "maxProperties", `must contain at most ${node.maxProperties} properties`);
    const required = Array.isArray(node.required) ? node.required : [];
    for (const key of required) {
      if (typeof key === "string" && !Object.hasOwn(record, key)) issue(issues, `${path}.${key}`, "required", "is required");
    }
    const properties = (node.properties ?? {}) as Record<string, JsonSchema>;
    for (const [key, child] of Object.entries(record)) {
      if (properties[key]) {
        validateNode(properties[key], child, `${path}.${key}`, issues);
      } else if (node.additionalProperties === false) {
        issue(issues, `${path}.${key}`, "additionalProperties", "is not allowed");
      } else if (node.additionalProperties && typeof node.additionalProperties === "object") {
        validateNode(node.additionalProperties as JsonSchema, child, `${path}.${key}`, issues);
      }
    }
  }
}

export function validateContract<K extends ContractName>(
  name: K,
  value: unknown,
): ValidationResult<ContractTypeMap[K]> {
  const issues: ValidationIssue[] = [];
  validateNode(schemas[name]!, value, "$", issues);
  return issues.length === 0
    ? { ok: true, value: value as ContractTypeMap[K] }
    : { ok: false, issues };
}

export function assertContract<K extends ContractName>(
  name: K,
  value: unknown,
): asserts value is ContractTypeMap[K] {
  const result = validateContract(name, value);
  if (!result.ok) throw new ContractValidationError(name, result.issues);
}
