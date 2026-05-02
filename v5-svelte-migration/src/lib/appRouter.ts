import { get } from 'svelte/store';

import { currentView, selectedPost, selectedProfile, type CurrentView } from '../stores/appState';
import { communityViewState, setCommunityViewState, type CommunitySection } from '../stores/communityViewState';
import { buildAppLocationHash, parseAppLocationHash } from './appRouteState.mjs';

type AppRoute = {
  view: CurrentView;
  section: CommunitySection;
};

let routerInstalled = false;
let ignoreNextHashChange = false;

function canUseWindow() {
  return typeof window !== 'undefined' && typeof window.location !== 'undefined';
}

function buildRouteUrl(hash: string) {
  return `${window.location.pathname}${window.location.search}${hash}`;
}

function normalizeRoute(route?: Partial<AppRoute>): AppRoute {
  return parseAppLocationHash(buildAppLocationHash(route || currentRoute()));
}

function currentRoute(): AppRoute {
  return {
    view: get(currentView),
    section: get(communityViewState).section
  };
}

export function applyAppRoute(routeInput: Partial<AppRoute>) {
  const route = normalizeRoute(routeInput);
  selectedPost.set(null);
  selectedProfile.set(null);
  currentView.set(route.view);

  if (route.view === 'community') {
    setCommunityViewState({ section: route.section });
  }

  return route;
}

function syncRouteFromLocation(options: { replaceInvalidHash?: boolean } = {}) {
  if (!canUseWindow()) {
    return normalizeRoute();
  }

  const route = parseAppLocationHash(window.location.hash);
  applyAppRoute(route);

  const normalizedHash = buildAppLocationHash(route);
  if (options.replaceInvalidHash && window.location.hash !== normalizedHash) {
    window.history.replaceState(window.history.state, '', buildRouteUrl(normalizedHash));
  }

  return route;
}

export function installAppRouter() {
  if (!canUseWindow() || routerInstalled) {
    return () => {};
  }

  routerInstalled = true;
  syncRouteFromLocation({ replaceInvalidHash: true });

  const handleHashChange = () => {
    if (ignoreNextHashChange) {
      ignoreNextHashChange = false;
      return;
    }

    syncRouteFromLocation({ replaceInvalidHash: true });
  };

  window.addEventListener('hashchange', handleHashChange);

  return () => {
    window.removeEventListener('hashchange', handleHashChange);
    routerInstalled = false;
    ignoreNextHashChange = false;
  };
}

export function navigateToAppRoute(routeInput: Partial<AppRoute>, options: { replace?: boolean } = {}) {
  const route = applyAppRoute(routeInput);
  if (!canUseWindow()) {
    return route;
  }

  const nextHash = buildAppLocationHash(route);
  if (window.location.hash === nextHash) {
    if (options.replace) {
      window.history.replaceState(window.history.state, '', buildRouteUrl(nextHash));
    }
    return route;
  }

  if (options.replace) {
    window.history.replaceState(window.history.state, '', buildRouteUrl(nextHash));
    return route;
  }

  ignoreNextHashChange = true;
  window.location.hash = nextHash;
  return route;
}

export function navigateToView(view: CurrentView, options: { replace?: boolean } = {}) {
  return navigateToAppRoute(
    {
      view,
      section: get(communityViewState).section
    },
    options
  );
}

export function navigateToCommunitySection(section: CommunitySection, options: { replace?: boolean } = {}) {
  return navigateToAppRoute(
    {
      view: 'community',
      section
    },
    options
  );
}
