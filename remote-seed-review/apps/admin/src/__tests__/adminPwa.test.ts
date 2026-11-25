import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('MTBA Admin PWA & Commuter Isolation', () => {
  const adminRoot = path.resolve(__dirname, '../../');
  const mobileRoot = path.resolve(__dirname, '../../../mobile');

  it('verifies apps/mobile has zero references, links, or routes to /admin', () => {
    const mobileAppTsx = fs.readFileSync(path.resolve(mobileRoot, 'src/App.tsx'), 'utf-8');
    const mobileHtml = fs.readFileSync(path.resolve(mobileRoot, 'index.html'), 'utf-8');

    expect(mobileAppTsx).not.toContain('/admin');
    expect(mobileHtml).not.toContain('/admin');
  });

  it('configures MTBA manifest.webmanifest with strictly scoped admin fields for PWABuilder', () => {
    const manifestPath = path.resolve(adminRoot, 'public/manifest.webmanifest');
    expect(fs.existsSync(manifestPath)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    expect(manifest.name).toBe('MTBA - Mahiyanganaya Bus Admin');
    expect(manifest.short_name).toBe('MTBA');
    expect(manifest.id).toBe('/admin/');
    expect(manifest.start_url).toBe('/admin/');
    expect(manifest.scope).toBe('/admin/');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#0B1120');
    expect(manifest.background_color).toBe('#0B1120');

    expect(manifest.icons).toHaveLength(2);
    expect(manifest.icons[0].src).toBe('/admin/icons/icon-192.png');
    expect(manifest.icons[0].sizes).toBe('192x192');
    expect(manifest.icons[1].src).toBe('/admin/icons/icon-512.png');
    expect(manifest.icons[1].sizes).toBe('512x512');
  });

  it('links manifest, theme-color, and apple-touch-icon in apps/admin/index.html', () => {
    const htmlPath = path.resolve(adminRoot, 'index.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    expect(html).toContain('<link rel="manifest" href="/admin/manifest.webmanifest" />');
    expect(html).toContain('<meta name="theme-color" content="#0B1120" />');
    expect(html).toContain('<link rel="apple-touch-icon" href="/admin/icons/icon-192.png" />');
    expect(html).toContain('MTBA');
  });

  it('provides scoped service worker in apps/admin/public/sw.js that bypasses /api/', () => {
    const swPath = path.resolve(adminRoot, 'public/sw.js');
    expect(fs.existsSync(swPath)).toBe(true);

    const swCode = fs.readFileSync(swPath, 'utf-8');
    expect(swCode).toContain('mtba-admin-v1');
    expect(swCode).toContain("url.pathname.startsWith('/api/')");
    expect(swCode).toContain("url.pathname.startsWith('/cdn-cgi/')");
    expect(swCode).toContain('caches.match');
  });

  it('verifies MTBA icons exist with non-zero sizes in apps/admin/public/icons/', () => {
    const icon192 = path.resolve(adminRoot, 'public/icons/icon-192.png');
    const icon512 = path.resolve(adminRoot, 'public/icons/icon-512.png');

    expect(fs.existsSync(icon192)).toBe(true);
    expect(fs.existsSync(icon512)).toBe(true);

    expect(fs.statSync(icon192).size).toBeGreaterThan(1000);
    expect(fs.statSync(icon512).size).toBeGreaterThan(5000);
  });

  it('ensures no links to fake mahiyanganaya-bus-admin.apk exist in App.tsx', () => {
    const appTsx = fs.readFileSync(path.resolve(adminRoot, 'src/App.tsx'), 'utf-8');
    expect(appTsx).not.toContain('mahiyanganaya-bus-admin.apk');
    expect(appTsx).toContain('mtba-admin.apk');
    expect(appTsx).toContain('MTBA Admin App');
  });
});
