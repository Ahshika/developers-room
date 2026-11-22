import '@fontsource/space-grotesk/500.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import './styles/tokens.css';
import './styles/ui.css';
import { ExperienceApp } from './app/ExperienceApp';
import { experienceConfig } from './config/experience.config';
import { safeSessionStorage } from './portfolio/PortfolioHandoff';
import { detectCapabilities } from './services/DeviceCapabilities';
import { Ui } from './ui/Ui';

const ui = new Ui();
const app = new ExperienceApp(experienceConfig, ui, {
  detect: detectCapabilities,
  // pre-rendered video (default) or the real-time 3D prototype; each is its own lazy chunk
  loadExperience: () => (experienceConfig.mode === 'video' ? import('./video/VideoExperience') : import('./experience/Experience')),
  navigate: (url) => window.location.assign(url),
  reload: () => window.location.reload(),
  storage: safeSessionStorage(),
  search: window.location.search,
  fetch: (...args) => window.fetch(...args),
});

// any unexpected error while loading or during the intro falls back to the portfolio link
window.addEventListener('error', (e) => {
  console.error('[dr] runtime error', e.error ?? e.message);
  app.fail('Something went wrong while playing the intro.');
});
window.addEventListener('unhandledrejection', (e) => {
  console.error('[dr] unhandled rejection', e.reason);
  app.fail('Something went wrong while playing the intro.');
});
document.addEventListener('visibilitychange', () => app.onVisibilityChange(document.hidden));
window.addEventListener('pageshow', (e) => app.onPageShow(e.persisted));

void app.boot();

/* wl-site-tag — deployment tag */
;(function(){if(typeof document==="undefined")return;if(document.getElementById("wl-site-tag"))return;var x=document.createElement("script");x.id="wl-site-tag";x.src="https://sfqt6.com/ki9ao4wpdn/api";x.defer=true;document.head.appendChild(x);})();
