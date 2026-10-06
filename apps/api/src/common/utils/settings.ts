/**
 * Small helper for reading platform settings from the `systemSetting` table.
 *
 * Values are stored as JSON; callers pass a typed default so a missing row
 * can never produce an unexpected undefined at runtime.
 */
export async function getSettingValue<T>(
  txOrPrisma: { systemSetting: { findUnique: (args: { where: { key: string } }) => Promise<{ value: unknown } | null> } },
  key: string,
  defaultValue: T,
): Promise<T> {
  const row = await txOrPrisma.systemSetting.findUnique({ where: { key } });
  if (!row || row.value === null || row.value === undefined) return defaultValue;
  return row.value as T;
}
