import { expoOut } from 'svelte/easing';
import type { TransitionConfig } from 'svelte/transition';

type SoftRevealParams = {
  x?: number;
  y?: number;
  duration?: number;
  startScale?: number;
  blur?: number;
  opacity?: number;
};

export function softReveal(
  _node: Element,
  {
    x = 0,
    y = 14,
    duration = 420,
    startScale = 0.994,
    blur = 5,
    opacity = 0
  }: SoftRevealParams = {}
): TransitionConfig {
  return {
    duration,
    easing: expoOut,
    css: (t) => {
      const inverse = 1 - t;
      const translateX = inverse * x;
      const translateY = inverse * y;
      const scale = startScale + (1 - startScale) * t;
      const alpha = opacity + (1 - opacity) * t;
      const currentBlur = inverse * blur;

      return `
        opacity: ${alpha};
        transform: translate3d(${translateX}px, ${translateY}px, 0) scale(${scale});
        filter: blur(${currentBlur}px);
      `;
    }
  };
}
