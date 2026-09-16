import { instagramActionIntent, instagramConversationContext } from '../src/ai-agent/integration-tool-context';

describe('Instagram AI-chat tool context', () => {
  const history = [
    { role: 'ASSISTANT', content: 'Oxirgi Instagram postda ikkita promt avtomatsiyasi bor.' },
    { role: 'USER', content: 'instagram avtomatsiyalarimni ko‘rsat' },
  ];

  it('carries Instagram context into short follow-up commands', () => {
    expect(instagramConversationContext('narxga almashtir', history)).toBe(true);
    expect(instagramConversationContext('hammasini o‘chir va bitta yangi qoida qil', history)).toBe(true);
    expect(instagramConversationContext('xa to‘g‘ri qil', history)).toBe(true);
  });

  it('requires an Instagram tool for a contextual mutation but not for capability questions', () => {
    expect(instagramActionIntent('narxga almashtir', history)).toBe(true);
    expect(instagramActionIntent('Instagram sotuv agentini yoq', [])).toBe(true);
    expect(instagramActionIntent('instagram uchun nimalar qila olasan?', [])).toBe(false);
  });

  it('does not leak stale Instagram context into unrelated work', () => {
    expect(instagramConversationContext('ertaga soat 10 ga eslatma yarat', history)).toBe(false);
    expect(instagramActionIntent('ertaga soat 10 ga eslatma yarat', history)).toBe(false);
  });

  it('drops Instagram context when Uzbek-suffixed Telegram or WhatsApp is named', () => {
    expect(instagramConversationContext('Telegramni yoq', history)).toBe(false);
    expect(instagramActionIntent('Telegramni yoq', history)).toBe(false);
    expect(instagramConversationContext('WhatsAppni yoq', history)).toBe(false);
    expect(instagramActionIntent('WhatsAppni yoq', history)).toBe(false);
  });
});
