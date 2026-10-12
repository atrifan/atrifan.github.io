/**
 * chat. `/` for signed-out visitors: what remote chat is, sign in, and how to get the assistant.
 * Public and indexable; no ads (chat. never shows them, src/lib/ads-policy.ts).
 */
import { ChatIcon } from '@/src/components/brand/SurfaceIcons';
import { surfaceUrl } from '@/src/lib/surface-url';

const STEPS = [
  {
    title: 'Get the assistant',
    desc: 'Install Tex, the Chrome extension or the CLI, and connect it to your Tulzo account with a key from AI.',
  },
  {
    title: 'Sign in here',
    desc: 'Use the same Tulzo account on your phone, a tablet or any other browser.',
  },
  {
    title: 'Chat from anywhere',
    desc: 'Send a message and watch Tex work on your own machine. Approve its actions and answer its questions as they come.',
  },
];

export function ChatLanding() {
  const signIn = `${surfaceUrl('hub', '/sign-in')}?redirect_url=${encodeURIComponent(surfaceUrl('chat', '/'))}`;
  return (
    <div className="page surface-home">
      <section className="hero">
        <ChatIcon size={72} className="hero-mark" />
        <h1 className="hero-title">Talk to your assistant from anywhere</h1>
        <p className="hero-lede">
          Remote chat connects you to Tex, the assistant running on your own computer. Ask from your phone or another
          browser; the work happens on your machine, and you see the replies, tool calls and approvals as they stream in.
        </p>
        <div className="actions">
          <a href={signIn} className="btn btn-primary">
            Sign in to chat
          </a>
          <a href={surfaceUrl('hub', '/docs')} className="btn btn-secondary">
            Get the assistant
          </a>
        </div>
      </section>

      <section aria-labelledby="chat-how-title" className="section">
        <h2 id="chat-how-title" className="section-title">
          How it works
        </h2>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className="step">
              <span className="step-number" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <h3 className="card-title">{s.title}</h3>
                <p className="muted">{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
