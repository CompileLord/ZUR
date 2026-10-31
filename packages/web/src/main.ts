import './styles/tokens.css';
import './styles/typography.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/shells.css';
import './styles/motion.css';
import './styles/settings-redesign.css';
import './styles/learner-redesign.css';
import './styles/public-redesign.css';
import './styles/admin-redesign.css';
import './styles/author-redesign.css';
import './styles/home-redesign.css';
import './styles/workspace-redesign.css';
import './styles/author-editors-redesign.css';
import './pages/public/landing-hero.css';
import { registerAppHandlers, renderApp, navigateTo } from './app/navigation.ts';
import { renderAppNow } from './app/render-app.ts';
import { loadS2PageNow } from './app/pages/s2-page-loader.ts';
import { installAdminDocumentHandlers } from './app/pages/admin-document-handlers.ts';
import { installGlobalClickHandlers } from './app/global-click-handler.ts';
import { installNavigationListeners } from './app/global-listeners.ts';

export { applyTheme } from './app/theme.ts';
export { navigateTo, renderApp };

registerAppHandlers(renderAppNow, loadS2PageNow);
installAdminDocumentHandlers();
installGlobalClickHandlers();
installNavigationListeners();

// Initial paint
renderApp();
