import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('Mobile App - Get the App Footer and Dedicated View', () => {
  const appTsx = fs.readFileSync(path.resolve(__dirname, '../App.tsx'), 'utf-8');
  const indexCss = fs.readFileSync(path.resolve(__dirname, '../index.css'), 'utf-8');

  it('renders single full-width "Get the App" sticky footer button with dismiss button', () => {
    // Single sticky button
    expect(appTsx).toContain('className="get-app-sticky-btn"');
    expect(appTsx).toContain('ඇප් එක ලබාගන්න');
    expect(appTsx).toContain('Get the App');
    expect(appTsx).toContain('onClick={() => setShowGetAppView(true)}');

    // Dismiss button
    expect(appTsx).toContain('className="banner-close"');
    expect(appTsx).toContain('onClick={handleDismissBanner}');
    expect(appTsx).toContain('sessionStorage.setItem(\'mahiyanganaya_install_dismissed\', \'1\')');

    // Dual side-by-side buttons removed
    expect(appTsx).not.toContain('className="install-actions"');
    expect(appTsx).not.toContain('ඇප් එක දාගන්න · Install App');
  });

  it('renders dedicated "Get the App" view with top navigation bar and back button', () => {
    expect(appTsx).toContain('className="get-app-view-overlay"');
    expect(appTsx).toContain('className="get-app-topbar"');
    expect(appTsx).toContain('className="get-app-back-btn"');
    expect(appTsx).toContain('← ආපසු · Back');
    expect(appTsx).toContain('className="get-app-title"');
    expect(appTsx).toContain('ඇප් එක ලබාගන්න · Get the App');
    expect(appTsx).toContain('className="get-app-subtitle"');
    expect(appTsx).toContain('ඔබගේ දුරකථනයට ගැළපෙන පහසුම ක්‍රමය තෝරන්න · Choose the best way to install on your phone');
  });

  it('renders Option 1 (Home Screen / PWA) card with required texts, instructions, and actions', () => {
    expect(appTsx).toContain('pwa-card');
    expect(appTsx).toContain('ක්‍රමය 1 · Option 1 (iPhone & Android)');
    expect(appTsx).toContain('මුල් තිරයට එක් කරගන්න');
    expect(appTsx).toContain('Add to Home Screen (Recommended for all devices)');
    expect(appTsx).toContain('මුල් තිරයට කෙටිමඟක් එක් කරන්න · Add Shortcut to Home Screen');

    // Step-by-step instructions for Android Chrome and iPhone Safari
    expect(appTsx).toContain('Android (Chrome)');
    expect(appTsx).toContain('Add to Home screen');
    expect(appTsx).toContain('iPhone / iPad (Safari)');
    expect(appTsx).toContain('Add to Home Screen');
  });

  it('renders Option 2 (Direct Android APK) card with required texts, direct link, and warning note', () => {
    expect(appTsx).toContain('apk-card');
    expect(appTsx).toContain('ක්‍රමය 2 · Option 2 (Android Devices Only)');
    expect(appTsx).toContain('Android ඇප් එක (APK) බාගන්න');
    expect(appTsx).toContain('Direct Android App Download');
    expect(appTsx).toContain('href="./mahiyanganaya-bus-mobile.apk"');
    expect(appTsx).toContain('download="mahiyanganaya-bus-mobile.apk"');
    expect(appTsx).toContain('Android දුරකථන සඳහා APK බාගන්න · Download APK for Android');

    // Warning note
    expect(appTsx).toContain('get-app-warning-note');
    expect(appTsx).toContain('Install unknown apps');
    expect(appTsx).toContain('Download anyway');
  });

  it('includes persistent footer button to re-open "Get the App" modal', () => {
    expect(appTsx).toContain('className="footer-get-app-btn"');
    expect(appTsx).toContain('onClick={() => setShowGetAppView(true)}');
  });

  it('has responsive CSS rules for sticky footer and dedicated overlay without horizontal overflow', () => {
    expect(indexCss).toContain('.get-app-sticky-btn');
    expect(indexCss).toContain('.get-app-view-overlay');
    expect(indexCss).toContain('.get-app-topbar');
    expect(indexCss).toContain('.get-app-back-btn');
    expect(indexCss).toContain('.get-app-card');
    expect(indexCss).toContain('.get-app-warning-note');
    expect(indexCss).toContain('.footer-get-app-btn');
  });
});
