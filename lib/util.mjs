import { createHash, randomUUID } from 'node:crypto';

export class AppError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export const uid = () => randomUUID();
export const hash = value => createHash('sha256').update(value).digest('hex');
export const key = value => String(value ?? '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
export const now = () => new Date().toISOString();
export const clone = value => structuredClone(value);
export function text(value, label, max = 2000) {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw new AppError(`${label}为空或过长`);
  return value.trim();
}
export function array(value, label, max = 100) {
  if (!Array.isArray(value) || value.length > max) throw new AppError(`${label}格式不正确`);
  return value;
}
export function expectedRevision(state, revision) {
  if (!Number.isSafeInteger(revision) || revision !== state.revision) throw new AppError('内容已更新，请刷新后重试', 409);
}
