import { useEffect, useRef, useState } from 'react';
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
    <article className="panel chat-panel" aria-label="Chat with Alejandro's assistant">
      <div className="chat-header">
        <h2 className="panel-title">Ask the assistant</h2>
        <p className="muted small">AI answers based on his CV. It can make mistakes.</p>
      </div>

      <ol className="chat-messages" ref={listRef} aria-live="polite">
        {messages.map((m, i) => (
          <li key={i} className={`message message-${m.role}`}>
            {/* Texto plano siempre: la respuesta del modelo nunca se interpreta como HTML. */}
            <p>{m.content}</p>
            {m.action === 'open_contact_form' && (
              <button type="button" className="button button-small" onClick={onOpenContact}>
                Open contact form
              </button>
            )}
          </li>
        ))}
        {sending && (
          <li className="message message-assistant message-pending">
            <p>Thinking…</p>
          </li>
        )}
      </ol>

      {!hasUserMessages && (
        <ul className="suggestions" aria-label="Suggested questions">
          {SUGGESTIONS.map((s) => (
            <li key={s}>
              <button type="button" className="chip" onClick={() => send(s)} disabled={sending}>
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label htmlFor="chat-input" className="visually-hidden">
          Your question
        </label>
        <input
          id="chat-input"
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about his experience…"
          maxLength={MAX_LENGTH}
          autoComplete="off"
          disabled={sending}
        />
        <button type="submit" className="button" disabled={sending || !input.trim()}>
          Send
        </button>
      </form>
    </article>
  );
}
