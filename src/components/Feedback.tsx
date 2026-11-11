import { useState } from 'react';

const EMAIL = 'saadjunaidi@gmail.com';
const SITE = 'https://moneyinmypocket.web.app';
const KEY = 'bachat.feedbackHidden';
const MAIL = `mailto:${EMAIL}?subject=${encodeURIComponent('MoneyInMyPocket feedback')}`;

function readHidden(): boolean {
  try { return localStorage.getItem(KEY) === '1'; } catch { return false; }
}

/** Share the app link: the system share sheet where there is one, otherwise copy the link. */
async function shareApp(onCopied: () => void) {
  const text = 'MoneyInMyPocket shows what’s yours to spend each month, from your own bank statements.';
  try {
    if (navigator.share) { await navigator.share({ title: 'MoneyInMyPocket', text, url: SITE }); return; }
    await navigator.clipboard.writeText(SITE);
    onCopied();
  } catch { /* share cancelled */ }
}

function ShareButton({ className }: { className: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button className={className} onClick={() => shareApp(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })}>
      {copied ? 'Link copied' : 'Share the app'}
    </button>
  );
}

/** Dismissible strip asking for shares and feedback. */
export function FeedbackBar() {
  const [hidden, setHidden] = useState(readHidden);
  if (hidden) return null;
  const hide = () => { setHidden(true); try { localStorage.setItem(KEY, '1'); } catch { /* fine */ } };
  return (
    <div className="feedback" role="note">
      <p><b>Finding it useful?</b> Share it with someone who'd like it. Feedback and suggestions are welcome at <a href={MAIL}>{EMAIL}</a>.</p>
      <div className="feedback-actions">
        <ShareButton className="btn plain" />
        <a className="btn plain" href={MAIL}>Send feedback</a>
        <button className="gear" aria-label="Hide this message" title="Hide" onClick={hide}>
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
    </div>
  );
}

/** Always-there footer line, so feedback stays reachable after the strip is hidden. */
export function FeedbackFooter() {
  return (
    <footer className="wrap site-foot small muted">
      Like it? <ShareButton className="linkbtn small" /> · Ideas or problems? Email <a href={MAIL}>{EMAIL}</a>
    </footer>
  );
}
