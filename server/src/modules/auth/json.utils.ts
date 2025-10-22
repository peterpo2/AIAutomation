export const serializeBigInt = <T extends Record<string, unknown> | Record<string, unknown>[]>(data: T): T => {
  return JSON.parse(
    JSON.stringify(data, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)),
  ) as T;
};
