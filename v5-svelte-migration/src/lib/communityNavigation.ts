import { get } from 'svelte/store';
import { currentView, selectedPost, selectedProfile, type CurrentView } from '../stores/appState';
import {
  communityViewState,
  setCommunityViewState,
  type CommunitySection
} from '../stores/communityViewState';
import { applyAppRoute, navigateToAppRoute, navigateToCommunitySection as navigateToCommunitySectionRoute } from './appRouter';
import { normalizeCommunityMediaUrl } from './communityApi';

type CommunityHistoryState = {
  ycCommunityRoute: {
    view: CurrentView;
    section: CommunitySection;
    post: any | null;
    profile: any | null;
  };
};

let historyInstalled = false;
let applyingPopState = false;

function canUseHistory() {
  return typeof window !== 'undefined' && typeof window.history !== 'undefined';
}

function currentRoute(post: any | null = get(selectedPost), profile: any | null = get(selectedProfile)) {
  return {
    view: get(currentView),
    section: get(communityViewState).section,
    post,
    profile
  };
}

function pushCommunityState(post: any | null, profile: any | null) {
  if (!canUseHistory() || applyingPopState) return;
  const state: CommunityHistoryState = {
    ycCommunityRoute: currentRoute(post, profile)
  };
  window.history.pushState(state, '', window.location.href);
}

function replaceCommunityState(post: any | null = get(selectedPost), profile: any | null = get(selectedProfile)) {
  if (!canUseHistory()) return;
  const state: CommunityHistoryState = {
    ycCommunityRoute: currentRoute(post, profile)
  };
  window.history.replaceState(state, '', window.location.href);
}

function applyCommunityRoute(route?: CommunityHistoryState['ycCommunityRoute']) {
  applyingPopState = true;
  try {
    if (!route) {
      selectedPost.set(null);
      selectedProfile.set(null);
      return;
    }
    applyAppRoute({
      view: route.view || 'community',
      section: route.section || 'feed'
    });
    selectedPost.set(route.post || null);
    selectedProfile.set(route.profile || null);
  } finally {
    applyingPopState = false;
  }
}

export function installCommunityHistory() {
  if (!canUseHistory() || historyInstalled) return () => {};
  historyInstalled = true;

  if (!(window.history.state as CommunityHistoryState | null)?.ycCommunityRoute) {
    replaceCommunityState();
  }

  const handlePopState = (event: PopStateEvent) => {
    applyCommunityRoute((event.state as CommunityHistoryState | null)?.ycCommunityRoute);
  };

  window.addEventListener('popstate', handlePopState);
  return () => {
    window.removeEventListener('popstate', handlePopState);
    historyInstalled = false;
  };
}

export function navigateCommunitySection(section: CommunitySection) {
  navigateToCommunitySectionRoute(section);
}

export function openCommunityPost(post: any, mode: 'default' | 'comments' | 'report' = 'default') {
  navigateToAppRoute({
    view: 'community',
    section: get(communityViewState).section
  });
  selectedProfile.set(null);
  const nextPost = {
    ...post,
    __focusComments: mode === 'comments',
    __openReportComposer: mode === 'report'
  };
  selectedPost.set(nextPost);
  pushCommunityState(nextPost, null);
}

export function openCommunityProfile(profile: any) {
  const profileId = profile?.user_id || profile?.id;
  if (!profileId) return;

  if (get(currentView) !== 'community') {
    navigateToAppRoute({
      view: 'community',
      section: get(communityViewState).section
    });
  }

  selectedPost.set(null);
  const nextProfile = {
    id: profileId,
    username: profile.username,
    avatar_url: normalizeCommunityMediaUrl(profile.avatar_url),
    role: profile.role,
    signature: profile.signature,
    background_url: normalizeCommunityMediaUrl(profile.background_url),
    __openedAt: Date.now()
  };
  selectedProfile.set(nextProfile);
  pushCommunityState(null, nextProfile);
}

export function closeCommunitySurface(fallback: () => void) {
  if (!canUseHistory()) {
    fallback();
    return;
  }

  const route = (window.history.state as CommunityHistoryState | null)?.ycCommunityRoute;
  if (route?.post || route?.profile) {
    window.history.back();
    return;
  }

  fallback();
  replaceCommunityState(null, null);
}
