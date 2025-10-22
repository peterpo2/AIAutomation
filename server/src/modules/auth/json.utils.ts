export const serializeBigInt = <T extends Record<string, unknown> | Record<string, unknown>[]>(data: T): any => {
  return JSON.parse(
    JSON.stringify(data, (_key, value) => (typeof value === 'bigint' ? value.toString() : value)),
  );
};
