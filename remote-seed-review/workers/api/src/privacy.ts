export function renderPrivacyPolicyHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Privacy Policy · Mahiyanganaya Bus Timetable</title>
  <style>
    :root {
      --bg: #0b0f14;
      --card-bg: #141c24;
      --border: #22303e;
      --text-main: #f1f5f9;
      --text-muted: #94a3b8;
      --accent: #38bdf8;
      --accent-hover: #0284c7;
      --tag-bg: #0f2744;
      --tag-border: #1e4976;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      background-color: var(--bg);
      color: var(--text-main);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Helvetica Neue", Arial, sans-serif;
      line-height: 1.6;
      padding: 24px 16px 64px 16px;
      display: flex;
      justify-content: center;
    }
    .container {
      width: 100%;
      max-width: 760px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }
    header {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 24px 20px;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 700;
      color: #ffffff;
      margin-bottom: 6px;
    }
    .sinhala-sub {
      font-size: 1.05rem;
      color: #93c5fd;
      font-weight: 500;
      margin-bottom: 12px;
    }
    .meta-badges {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-top: 8px;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      background-color: var(--tag-bg);
      border: 1px solid var(--tag-border);
      color: #bae6fd;
      font-size: 0.8rem;
      padding: 4px 10px;
      border-radius: 9999px;
      font-weight: 500;
    }
    .badge code {
      font-family: monospace;
      font-size: 0.82rem;
      color: #7dd3fc;
    }
    section {
      background-color: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 22px 20px;
    }
    h2 {
      font-size: 1.15rem;
      color: #ffffff;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid var(--border);
      padding-bottom: 8px;
    }
    p {
      color: var(--text-muted);
      font-size: 0.95rem;
      margin-bottom: 12px;
    }
    p:last-child {
      margin-bottom: 0;
    }
    ul {
      list-style-type: none;
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 8px;
      margin-bottom: 8px;
    }
    li {
      position: relative;
      padding-left: 20px;
      color: var(--text-muted);
      font-size: 0.92rem;
    }
    li::before {
      content: "•";
      color: var(--accent);
      position: absolute;
      left: 4px;
      font-size: 1.2rem;
      line-height: 1;
      top: 0;
    }
    li strong {
      color: var(--text-main);
    }
    .highlight-box {
      background-color: #0d1e2e;
      border-left: 4px solid var(--accent);
      padding: 12px 16px;
      border-radius: 4px;
      margin: 12px 0;
      color: #e0f2fe;
      font-size: 0.92rem;
    }
    .contact-card {
      background-color: #0c1824;
      border: 1px solid #1e3a5f;
      border-radius: 8px;
      padding: 14px 16px;
      margin-top: 10px;
    }
    .contact-item {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      font-size: 0.92rem;
      color: var(--text-muted);
      margin-bottom: 4px;
    }
    .contact-item:last-child {
      margin-bottom: 0;
    }
    .contact-item strong {
      color: var(--text-main);
      min-width: 90px;
    }
    a {
      color: var(--accent);
      text-decoration: none;
      word-break: break-all;
    }
    a:hover {
      text-decoration: underline;
      color: var(--accent-hover);
    }
    footer {
      text-align: center;
      padding: 16px 0;
      font-size: 0.85rem;
      color: #64748b;
    }
    footer a {
      color: #94a3b8;
    }
    footer a:hover {
      color: #ffffff;
    }
  </style>
</head>
<body>
  <main class="container">
    <header>
      <h1>Privacy Policy</h1>
      <div class="sinhala-sub">රහස්‍යතා ප්‍රතිපත්තිය · මහියංගනය බස් කාලසටහන</div>
      <div class="meta-badges">
        <span class="badge">App: <strong>Mahiyanganaya Bus Timetable</strong></span>
        <span class="badge">Package: <code>lk.mahiyanganaya.busmobile</code></span>
        <span class="badge">Updated: November 2026</span>
      </div>
    </header>

    <section>
      <h2>1. Overview & Service Purpose</h2>
      <p>
        The <strong>Mahiyanganaya Bus Timetable</strong> mobile application and website provide a 24/7 public timetable of long-distance bus departures originating from or passing through the Mahiyanganaya Bus Stand in Sri Lanka.
      </p>
      <div class="highlight-box">
        <strong>Privacy Commitment:</strong> We respect commuter privacy. The app is completely free, does not collect personal data, requires no user accounts, and contains zero advertisements or analytics trackers.
      </div>
    </section>

    <section>
      <h2>2. Data Collection and Usage</h2>
      <p>
        We do not collect, process, or sell any personal data:
      </p>
      <ul>
        <li><strong>No Personal Information:</strong> We do not ask for or collect names, phone numbers, email addresses, contact lists, or physical addresses.</li>
        <li><strong>No Account Required:</strong> Commuters do not register or create accounts. Timetable data is publicly accessible immediately upon opening the app.</li>
        <li><strong>No Location Tracking (GPS):</strong> The app does not access your device's GPS, precise location, or background location.</li>
        <li><strong>No Advertising or Tracking SDKs:</strong> The app does not include third-party advertising SDKs, commercial ad banners, behavioral trackers, or analytics tools.</li>
      </ul>
    </section>

    <section>
      <h2>3. Device Storage & Offline Caching</h2>
      <p>
        The application operates offline-first so commuters can check departure times even when mobile connectivity is weak or unavailable:
      </p>
      <ul>
        <li><strong>Local Cache:</strong> The app saves a copy of the official public schedule document directly in your device's browser/application storage (<code>localStorage</code> and Cache Storage).</li>
        <li><strong>Strictly On-Device:</strong> This cached timetable data remains solely on your personal device and is never sent back to any tracking server.</li>
      </ul>
    </section>

    <section>
      <h2>4. Optional Passenger Suggestions</h2>
      <p>
        Commuters may optionally report a missing bus or incorrect time via the in-app suggestion feature.
      </p>
      <ul>
        <li>Submissions contain only the selected category (e.g. <em>Wrong Time</em> or <em>Missing Bus</em>), the optional destination route name, and the text description you enter.</li>
        <li>No personal identification, IP address log, or user identity is attached to the suggestion.</li>
      </ul>
    </section>

    <section>
      <h2>5. Children's Privacy</h2>
      <p>
        The application is safe for all age groups and does not knowingly collect any personally identifiable information from children under the age of 13 or any other users.
      </p>
    </section>

    <section>
      <h2>6. Security</h2>
      <p>
        All network communications between the mobile application and our servers are encrypted using modern Transport Layer Security (HTTPS / TLS 1.3).
      </p>
    </section>

    <section>
      <h2>7. Developer & Contact Information</h2>
      <p>
        If you have questions, feedback, or inquiries regarding this Privacy Policy, please contact the developer:
      </p>
      <div class="contact-card">
        <div class="contact-item">
          <strong>Developer:</strong>
          <span>Thimidu Pehesara</span>
        </div>
        <div class="contact-item">
          <strong>Email:</strong>
          <a href="mailto:pehesarathimidu130@gmail.com">pehesarathimidu130@gmail.com</a>
        </div>
        <div class="contact-item">
          <strong>Application:</strong>
          <span>Mahiyanganaya Bus Timetable</span>
        </div>
        <div class="contact-item">
          <strong>Package ID:</strong>
          <code>lk.mahiyanganaya.busmobile</code>
        </div>
        <div class="contact-item">
          <strong>Location:</strong>
          <span>Mahiyanganaya, Sri Lanka</span>
        </div>
      </div>
    </section>

    <footer>
      <p>
        <a href="/mobile/">← Return to Mahiyanganaya Bus Timetable</a>
      </p>
    </footer>
  </main>
</body>
</html>
`;
}

export function handlePrivacy(): Response {
  return new Response(renderPrivacyPolicyHtml(), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
