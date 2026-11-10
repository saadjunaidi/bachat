import type { ReactNode } from 'react';
import { getCurrency, money } from '../lib/format';
import { useStore, type View } from '../store';
import { Logo } from '../components/Logo';

/** An illustrative month, in whatever currency the viewer has chosen. Not the user's data. */
const FLOW: { label: string; amt: number; note: string }[] = [
  { label: 'Needs', amt: 45000, note: 'Rent, groceries, bills, transport' },
  { label: 'Debt payments', amt: 15000, note: 'Card minimums and loan EMIs, plus any extra' },
  { label: 'Giving', amt: 3000, note: 'Charity and gifts you plan to give' },
  { label: 'Freedom savings', amt: 20000, note: 'What your long-term goal needs this month' },
  { label: 'Short-term goals', amt: 7000, note: 'The phone, the trip, the car' }
];
const INCOME = 100000;
const POCKET = INCOME - FLOW.reduce((s, f) => s + f.amt, 0);

function Waterfall({ islamic }: { islamic: boolean }) {
  const cur = getCurrency();
  const note = (f: { label: string; note: string }) => (islamic && f.label === 'Giving' ? 'Sadaqah, charity and zakat' : f.note);
  const m = (n: number) => money(n, cur);
  return (
    <figure className="wf" aria-label={`Example: ${m(INCOME)} of income, ${m(POCKET)} left to spend guilt-free`}>
      <div className="wf-in"><span>Income this month</span><b>{m(INCOME)}</b></div>
      <ol className="wf-list">
        {FLOW.map((f, i) => (
          <li key={f.label} style={{ ['--w' as string]: `${(f.amt / INCOME) * 100}%`, ['--i' as string]: i }}>
            <div className="wf-row"><span>{f.label}</span><span className="num">−{m(f.amt)}</span></div>
            <div className="wf-bar" aria-hidden="true"><i /></div>
            <small>{note(f)}</small>
          </li>
        ))}
      </ol>
      <div className="wf-pocket" style={{ ['--i' as string]: FLOW.length }}>
        <Logo size={40} />
        <div><span>In your pocket</span><b>{m(POCKET)}</b><small>Yours to spend, guilt-free</small></div>
      </div>
      <figcaption className="small muted">An example month. Your own numbers come from your statements.</figcaption>
    </figure>
  );
}

const STEPS: { title: string; body: ReactNode; go: View; cta: string }[] = [
  {
    title: 'Import three months of statements',
    body: 'Download them from net banking as Excel or CSV and drop them in. Add your credit card and loan statements too, in any currency. Overlapping files are fine; repeats are skipped.',
    go: 'statements', cta: 'Import a statement'
  },
  {
    title: 'Sort needs from wants',
    body: 'Mark each spending category as a need or a want. Needs are covered first; wants are what your guilt-free amount replaces.',
    go: 'spending', cta: 'Open Spending'
  },
  {
    title: 'Clear expensive debt first',
    body: 'Add your cards and loans. The plan pays the highest interest first and shows how much an extra amount each month saves, and how much sooner you reach freedom.',
    go: 'debts', cta: 'Open Debts'
  },
  {
    title: 'Set the age you want to be free by',
    body: 'Pick financial freedom or retirement and a target age. The app works out what to put aside each month, in today’s money, after inflation.',
    go: 'goals', cta: 'Set your goal'
  },
  {
    title: 'Check big purchases before you buy',
    body: 'Add the phone, the trip or the car with a price and a date. Each one gets a verdict: a good deal, a stretch (wait a little, or slow your freedom date), or a bad deal.',
    go: 'goals', cta: 'Add a goal'
  },
  {
    title: 'Spend your guilt-free amount, then repeat monthly',
    body: 'Everything that matters is already covered, so what’s left is yours. Import each new month’s statement and watch your freedom date move.',
    go: 'overview', cta: 'See your month'
  }
];

export function Welcome() {
  const { go, data } = useStore();
  const cur = getCurrency();
  const yearly = 600000;
  return (
    <div className="welcome">
      <section className="w-hero">
        <div className="w-copy">
          <h1>Know exactly what’s yours to spend.</h1>
          <p className="w-lede">MoneyInMyPocket reads your bank, card and loan statements and turns them into one monthly plan: what your needs, debts, giving and goals take, and what’s left over for you. Then it shows the shortest path to financial freedom.</p>
          <div className="w-ctas">
            <button className="btn" onClick={() => go('statements')}>Import a statement</button>
            <button className="btn plain" onClick={() => go('overview')}>{data.sample ? 'Explore with sample data' : 'Go to my overview'}</button>
          </div>
          <p className="small muted">No sign-up. Your statements stay on this device.</p>
        </div>
        <Waterfall islamic={data.settings.islamic} />
      </section>

      <section className="w-sec w-why">
        <h2>Why it exists</h2>
        <div className="w-cols">
          <p><b>Prices rise every year.</b> Money that sits still quietly buys less, and a raise can vanish into inflation without anyone noticing.</p>
          <p><b>Most of us can’t answer simple questions.</b> How much do I save each month? What is my credit card really costing me? Can I afford that phone, or will it set me back?</p>
          <p><b>Budget apps ask too much.</b> Many want your bank password or every coffee logged by hand. This works from the statements you already download.</p>
        </div>
      </section>

      <section className="w-sec">
        <h2>Six steps to financial independence</h2>
        <ol className="w-steps">
          {STEPS.map((s, i) => (
            <li key={i}>
              <span className="w-num" aria-hidden="true">{i + 1}</span>
              <div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
                <button className="linkbtn" onClick={() => go(s.go)}>{s.cta}</button>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="w-sec w-devices">
        <h2>Use it on your phone and your laptop</h2>
        <p className="w-intro">There’s no account and no cloud copy. Your data lives in the browser on each device, so you move it yourself with a backup. It takes about a minute.</p>
        <ol className="w-steps">
          <li>
            <span className="w-num" aria-hidden="true">1</span>
            <div>
              <h3>Make a backup where your data is</h3>
              <p>Go to Statements, then “Back up or move to another device”. Choose “Download backup file”, “Share backup…” to send it to yourself on WhatsApp, email or Drive, or “Copy backup code”.</p>
              <button className="linkbtn" onClick={() => go('statements', 'bk')}>Open backup</button>
            </div>
          </li>
          <li>
            <span className="w-num" aria-hidden="true">2</span>
            <div>
              <h3>Open the app on the other device</h3>
              <p>Go to moneyinmypocket.web.app, open Statements, then “Choose backup file” or paste the backup code.</p>
            </div>
          </li>
          <li>
            <span className="w-num" aria-hidden="true">3</span>
            <div>
              <h3>Replace or combine</h3>
              <p>“Restore this backup” replaces what’s on that device. “Add to data on this device” combines the two and skips anything already there, so nothing is counted twice.</p>
            </div>
          </li>
        </ol>
        <ul className="w-tips">
          <li><b>Install it like an app.</b> In Chrome or Edge, use the install button in the address bar or on the Statements page. On iPhone, tap Share, then “Add to Home Screen”. It works offline once installed.</li>
          <li><b>Keep one main device.</b> Import new statements there, then send a fresh backup to your other devices. The app reminds you when your last backup is more than 30 days old.</li>
          <li><b>Keep backups private.</b> Anyone with your backup file or code can read your transactions.</li>
        </ul>
      </section>

      <section className="w-sec w-free">
        <div>
          <h2>What financial freedom means</h2>
          <p>You’re financially free when your investments can pay for your life, so work becomes a choice. A common rule of thumb is about 25 to 33 times what you spend in a year.</p>
          <p>If you spend {money(yearly, cur)} a year, your freedom number is around {money(yearly * 30, cur)}. Spend a little less or save a little more each month, and that date comes noticeably closer. The Goals tab shows exactly how close.</p>
        </div>
        <dl className="w-facts">
          <div><dt>Freedom number</dt><dd>Yearly spending × 25–33</dd></div>
          <div><dt>Monthly target</dt><dd>What gets you there by your chosen age</dd></div>
          <div><dt>Guilt-free amount</dt><dd>Income minus everything above</dd></div>
        </dl>
      </section>

      <section className="w-sec w-trust">
        <p><b>Private by design.</b> Statements are read and stored in your browser, never uploaded. The only thing the app ever fetches is exchange rates, and only when you use a second currency.</p>
        <p className="small muted">MoneyInMyPocket gives guidance from your own numbers and the assumptions you set. It isn’t financial or tax advice{data.settings.islamic ? '. Zakat figures are a guide; check with a scholar you trust' : ''}.</p>
      </section>
    </div>
  );
}
