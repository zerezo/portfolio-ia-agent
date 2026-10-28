import { useEffect, useRef, useState } from 'react';
import { Bot, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { sendChatMessage } from '../api.js';

const GREETING =
  "Hi! I'm Alejandro's assistant. Ask me about his experience, certifications, projects or interests.";

const SUGGESTIONS = [
  'What does he do at IndraMind?',
  'Which certifications does he have?',
  'Tell me about his bachelor’s thesis',
  'What does he do in his free time?',
];

// El límite real lo aplica el backend; aquí evita escribir de más.
const MAX_LENGTH = 500;
const SESSION_KEY = 'chatSessionId';

// sessionStorage puede no estar disponible (modo privado, cookies bloqueadas): el chat
// funciona igual, solo que sin recordar la conversación al recargar.
const readSession = () => {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
};
const writeSession = (id) => {
  try {
    sessionStorage.setItem(SESSION_KEY, id);
  } catch {
    // Sin almacenamiento: se ignora.
  }
};

export default function Chat({ onOpenContact }) {
  const [messages, setMessages] = useState([{ role: 'assistant', content: GREETING }]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const sessionId = useRef(readSession());
  const listRef = useRef(null);

  // Baja al último mensaje dentro del panel, sin mover la página.
  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [messages, sending]);

  async function send(text) {
    const message = text.trim();
    if (!message || sending) return;

    setMessages((prev) => [...prev, { role: 'user', content: message }]);
    setInput('');
    setSending(true);
    try {
      const data = await sendChatMessage(message, sessionId.current);
      sessionId.current = data.sessionId;
      writeSession(data.sessionId);
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply, action: data.action }]);
      if (data.action === 'open_contact_form') onOpenContact();
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'error', content: err.message }]);
    } finally {
      setSending(false);
    }
  }

  const hasUserMessages = messages.some((m) => m.role === 'user');

  return (
    <article
      className="flex min-h-0 w-full flex-col rounded-lg border bg-card"
      aria-label="Chat with Alejandro's assistant"
    >
      <header className="flex items-center gap-3 border-b p-4">
        <span className="grid size-8 place-items-center rounded-full bg-accent text-accent-foreground" aria-hidden="true">
          <Bot className="size-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Ask the assistant</h2>
          <p className="text-xs text-muted-foreground">AI answers based on his CV. It can make mistakes.</p>
        </div>
      </header>

      <ol className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4" ref={listRef} aria-live="polite">
        {messages.map((m, i) => (
          <li
            key={i}
            className={cn(
              'flex max-w-[85%] flex-col items-start gap-2 rounded-lg px-3 py-2 text-sm leading-relaxed',
              m.role === 'user' && 'self-end bg-primary text-primary-foreground',
              m.role === 'assistant' && 'bg-muted',
              m.role === 'error' && 'bg-destructive/10 text-destructive',
            )}
          >
            {/* Texto plano siempre: la respuesta del modelo nunca se interpreta como HTML. */}
            <p className="whitespace-pre-line">{m.content}</p>
            {m.action === 'open_contact_form' && (
              <Button size="sm" onClick={onOpenContact}>
                Book a meeting
              </Button>
            )}
          </li>
        ))}
        {sending && <li className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">Thinking…</li>}
      </ol>

      {!hasUserMessages && (
        <ul className="flex flex-wrap gap-2 px-4 pb-3" aria-label="Suggested questions">
          {SUGGESTIONS.map((s) => (
            <li key={s}>
              <Button variant="outline" size="sm" className="h-auto py-1.5 whitespace-normal" onClick={() => send(s)} disabled={sending}>
                {s}
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex gap-2 border-t p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label htmlFor="chat-input" className="sr-only">
          Your question
        </label>
        <Input
          id="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about his experience…"
          maxLength={MAX_LENGTH}
          autoComplete="off"
          disabled={sending}
        />
        <Button type="submit" size="icon" disabled={sending || !input.trim()} aria-label="Send">
          <Send />
        </Button>
      </form>
    </article>
  );
}
