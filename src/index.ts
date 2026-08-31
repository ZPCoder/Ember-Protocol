export * from "./generated/contracts.js";
export * from "./validation.js";
export * from "./version.js";

import { CONTRACT_SCHEMAS } from "./generated/contracts.js";

export const ERROR_CODES = CONTRACT_SCHEMAS.ErrorCode.enum;
