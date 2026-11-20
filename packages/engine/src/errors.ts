export type InputErrorCode =
  | "missing_field"
  | "invalid_number"
  | "out_of_range"
  | "invalid_date"
  | "payment_too_low"
  | "payment_too_high"
  | "no_solution";

/** Raised when the input cannot produce a valid loan. `field` names the input at fault, when there is one. */
export class TuakaInputError extends Error {
  readonly code: InputErrorCode;
  readonly field: string | undefined;

  constructor(code: InputErrorCode, message: string, field?: string) {
    super(message);
    this.name = "TuakaInputError";
    this.code = code;
    this.field = field;
  }
}
