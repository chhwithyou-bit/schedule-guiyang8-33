export const CHINA_TIME_ZONE = 'Asia/Shanghai';

const explicitTimeZonePattern = /(?:Z|[+-]\d{2}:?\d{2})$/i;
const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;
const timestampWithoutZonePattern = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?$/;

/**
 * D1/CURRENT_TIMESTAMP values are stored in UTC but often arrive without a
 * timezone suffix. Treat those strings as UTC before displaying them in China.
 *
 * @param {Date | string | number | null | undefined} value
 * @returns {Date | null}
 */
export function parseCommunityDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const text = String(value ?? '').trim();
  if (!text) return null;

  if (dateOnlyPattern.test(text)) {
    const date = new Date(`${text}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (timestampWithoutZonePattern.test(text) && !explicitTimeZonePattern.test(text)) {
    const date = new Date(`${text.replace(' ', 'T')}Z`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * @param {Date | string | number | null | undefined} value
 * @param {Intl.DateTimeFormatOptions} [options]
 */
export function formatChinaTime(value, options = {}) {
  const date = parseCommunityDate(value);
  if (!date) return String(value ?? '');

  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: CHINA_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...options
  }).format(date);
}

/**
 * @param {Date | string | number | null | undefined} value
 * @param {Intl.DateTimeFormatOptions} [options]
 */
export function formatChinaDate(value, options = {}) {
  const date = parseCommunityDate(value);
  if (!date) return String(value ?? '');

  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: CHINA_TIME_ZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    ...options
  }).format(date);
}
