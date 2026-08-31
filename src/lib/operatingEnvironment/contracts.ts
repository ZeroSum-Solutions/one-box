import { isProxy } from "node:util/types";
import { verifySelfHash } from "./canonical";
import {
  failure,
  success,
  type ContractPath,
  type ContractReasonCode,
  type Result,
} from "./reasonCodes";

export type Validator<T> = (input: unknown, path?: ContractPath) => Result<T>;
export type InferValidator<TValidator> =
  TValidator extends Validator<infer TValue> ? TValue : never;

type ValidatorShape = Readonly<Record<string, Validator<unknown>>>;
type InferShape<TShape extends ValidatorShape> = Readonly<{
  [TKey in keyof TShape]: InferValidator<TShape[TKey]>;
}>;

function childPath(path: ContractPath, segment: string | number): ContractPath {
  return [...path, segment];
}

export function literalValue<const TValue extends null | boolean | string | number>(
  literal: TValue,
): Validator<TValue> {
  return (input, path = []) =>
    Object.is(input, literal) ? success(literal) : failure("INVALID_LITERAL", path);
}

export function closedEnum<const TValues extends readonly string[]>(
  values: TValues,
): Validator<TValues[number]> {
  const allowed = new Set<string>(values);
  return (input, path = []) =>
    typeof input === "string" && allowed.has(input)
      ? success(input as TValues[number])
      : failure("INVALID_ENUM", path);
}

export function nonEmptyString(): Validator<string> {
  return (input, path = []) => {
    if (typeof input !== "string") return failure("INVALID_TYPE", path);
    return input.length > 0 ? success(input) : failure("EMPTY_STRING", path);
  };
}

export function booleanValue(): Validator<boolean> {
  return (input, path = []) =>
    typeof input === "boolean" ? success(input) : failure("INVALID_TYPE", path);
}

export function safeInteger(): Validator<number> {
  return (input, path = []) =>
    typeof input === "number" && Number.isSafeInteger(input)
      ? success(input)
      : failure("INVALID_SAFE_INTEGER", path);
}

export function arrayOf<TValue>(itemValidator: Validator<TValue>): Validator<readonly TValue[]> {
  return (input, path = []) => {
    try {
      if (!Array.isArray(input)) return failure("INVALID_TYPE", path);
      if (isProxy(input)) return failure("UNSUPPORTED_VALUE", path);
      if (Object.getPrototypeOf(input) !== Array.prototype) {
        return failure("INVALID_RECORD", path);
      }
      const ownKeys = Reflect.ownKeys(input);
      const invalidKey = ownKeys.find(
        (key) =>
          typeof key === "symbol" ||
          (key !== "length" &&
            (!/^(0|[1-9][0-9]*)$/.test(key) || Number(key) >= input.length)),
      );
      if (invalidKey !== undefined) {
        return typeof invalidKey === "symbol"
          ? failure("UNKNOWN_FIELD", path)
          : failure("UNKNOWN_FIELD", childPath(path, invalidKey));
      }
      const numericKeys = (ownKeys as string[])
        .filter((key) => key !== "length")
        .map(Number)
        .sort((left, right) => left - right);
      if (numericKeys.length !== input.length) {
        let missingIndex = 0;
        for (const index of numericKeys) {
          if (index !== missingIndex) break;
          missingIndex += 1;
        }
        return failure("INVALID_RECORD", childPath(path, missingIndex));
      }

      const result: TValue[] = [];
      for (let index = 0; index < input.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(input, String(index));
        if (!descriptor) return failure("INVALID_RECORD", childPath(path, index));
        if (!descriptor.enumerable) return failure("INVALID_RECORD", childPath(path, index));
        if (!("value" in descriptor)) {
          return failure("UNSUPPORTED_VALUE", childPath(path, index));
        }
        const validated = itemValidator(descriptor.value, childPath(path, index));
        if (!validated.ok) return validated;
        result.push(validated.value);
      }
      return success(Object.freeze(result));
    } catch {
      return failure("UNSUPPORTED_VALUE", path);
    }
  };
}

export function closedRecord<const TShape extends ValidatorShape>(
  shape: TShape,
): Validator<InferShape<TShape>> {
  const expectedKeys = Object.freeze(Object.keys(shape));
  const expected = new Set(expectedKeys);

  return (input, path = []) => {
    try {
      if (input === null || typeof input !== "object" || Array.isArray(input)) {
        return failure("INVALID_RECORD", path);
      }
      if (isProxy(input)) return failure("UNSUPPORTED_VALUE", path);
      const prototype = Object.getPrototypeOf(input);
      if (prototype !== Object.prototype && prototype !== null) {
        return failure("INVALID_RECORD", path);
      }

      const ownKeys = Reflect.ownKeys(input);
      if (ownKeys.some((key) => typeof key === "symbol")) {
        return failure("UNKNOWN_FIELD", path);
      }
      const inputKeys = (ownKeys as string[]).sort();
      const unknownKey = inputKeys.find((key) => !expected.has(key));
      if (unknownKey) return failure("UNKNOWN_FIELD", childPath(path, unknownKey));

      for (const key of expectedKeys) {
        if (!Object.prototype.hasOwnProperty.call(input, key)) {
          return failure("MISSING_FIELD", childPath(path, key));
        }
      }

      const output = Object.create(null) as Record<string, unknown>;
      for (const key of expectedKeys) {
        const descriptor = Object.getOwnPropertyDescriptor(input, key);
        if (!descriptor || !descriptor.enumerable) {
          return failure("INVALID_RECORD", childPath(path, key));
        }
        if (!("value" in descriptor)) {
          return failure("UNSUPPORTED_VALUE", childPath(path, key));
        }
        const validated = shape[key](descriptor.value, childPath(path, key));
        if (!validated.ok) return validated;
        output[key] = validated.value;
      }
      return success(Object.freeze(output) as InferShape<TShape>);
    } catch {
      return failure("UNSUPPORTED_VALUE", path);
    }
  };
}

export function refine<TValue>(
  validator: Validator<TValue>,
  predicate: (value: TValue) => boolean,
  relativePath: ContractPath = [],
  reason: ContractReasonCode = "INVARIANT_VIOLATION",
): Validator<TValue> {
  return (input, path = []) => {
    const validated = validator(input, path);
    if (!validated.ok) return validated;
    try {
      return predicate(validated.value)
        ? validated
        : failure(reason, [...path, ...relativePath]);
    } catch {
      return failure(reason, [...path, ...relativePath]);
    }
  };
}

export function withSelfHash<
  TValue extends Readonly<Record<string, unknown>>,
  THashField extends keyof TValue & string,
>(validator: Validator<TValue>, hashField: THashField): Validator<TValue> {
  return (input, path = []) => {
    const validated = validator(input, path);
    if (!validated.ok) return validated;
    const verified = verifySelfHash(validated.value, hashField);
    return verified.ok
      ? validated
      : failure(verified.reason, [...path, ...verified.path]);
  };
}
