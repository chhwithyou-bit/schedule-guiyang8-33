const DEFAULT_VIEW = 'community';
const DEFAULT_SECTION = 'feed';
const KNOWN_VIEWS = new Set(['community', 'profile', 'admin']);
const KNOWN_SECTIONS = new Set(['feed', 'discovery', 'notifications', 'favorites']);

/**
 * @typedef {'community' | 'profile' | 'admin'} AppView
 */

/**
 * @typedef {'feed' | 'discovery' | 'notifications' | 'favorites'} CommunitySection
 */

/**
 * @typedef {{
 *   view?: AppView | string | null | undefined;
 *   section?: CommunitySection | string | null | undefined;
 * }} AppRouteInput
 */

/**
 * @param {unknown} value
 * @returns {AppView}
 */
export function normalizeCurrentView(value) {
  return typeof value === 'string' && KNOWN_VIEWS.has(value) ? /** @type {AppView} */ (value) : DEFAULT_VIEW;
}

/**
 * @param {unknown} value
 * @returns {CommunitySection}
 */
export function normalizeCommunitySection(value) {
  return typeof value === 'string' && KNOWN_SECTIONS.has(value)
    ? /** @type {CommunitySection} */ (value)
    : DEFAULT_SECTION;
}

/**
 * @param {string} [hash]
 * @returns {{ view: AppView; section: CommunitySection }}
 */
export function parseAppLocationHash(hash = '') {
  const cleaned = String(hash || '').trim().replace(/^#/, '');
  const segments = cleaned
    .split('/')
    .map((segment) => decodeURIComponent(segment))
    .filter(Boolean);

  const view = normalizeCurrentView(segments[0]);
  if (view !== 'community') {
    return {
      view,
      section: DEFAULT_SECTION
    };
  }

  return {
    view,
    section: normalizeCommunitySection(segments[1])
  };
}

/**
 * @param {AppRouteInput} [route]
 * @returns {string}
 */
export function buildAppLocationHash(route = {}) {
  const view = normalizeCurrentView(route.view);
  if (view === 'profile') return '#/profile';
  if (view === 'admin') return '#/admin';

  const section = normalizeCommunitySection(route.section);
  return section === DEFAULT_SECTION ? '#/community' : `#/community/${section}`;
}
