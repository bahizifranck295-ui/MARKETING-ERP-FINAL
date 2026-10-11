import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initI18n } from './i18n';
import { useLang } from './i18n/useLang';
import { APP_INFO } from './app/edition';

// Nom de l'application (Gestion commerciale / Stock & Livraison) dans l'onglet du navigateur
document.title = `PREMIDIS · ${APP_INFO.name}`;

// Langue de l'interface (Français par défaut, English au choix)
initI18n();

// Nouveau rendu de l'application au changement de langue (dates, formats)
function Root() {
  useLang();
  return <App />;
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
