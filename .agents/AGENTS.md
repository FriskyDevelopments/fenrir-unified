### Telegram Bot Design & UX Standards (FENRIR BOT OS)

When building or modifying Telegram bots in this workspace, you MUST strictly adhere to the following design and routing standards:

1. **Inline Button Emojis**: Every keyboard button MUST include an illustrative, descriptive emoji for its action type (e.g., 📝, ⚙️, ✅, 🗑️, 📋).
   - **DO NOT** use plain colored circle emojis (🔵, 🟢, 🔴) as placeholders for color boxes.
   - For HTML/Webapp interfaces, you can use real inline color menus via CSS-styled DOM elements (e.g., `<span class="ico">`) to create colored icon circles inline with the text.
2. **Visual Palette**: Adhere to the Feb 2026 Telegram Dark palette. For HTML/Webapp interfaces, use `#0b141c` for backgrounds, `#2b7bd4` for primary buttons, `#2e7d32` for success, and `#ff5252` for danger.
3. **Webhook Routing Paradigm**: Bot commands (like `/setup`, `/plans`, `/status`) MUST be explicitly intercepted early in the webhook handler to serve deterministic, static modular menu text. They MUST NOT fall through to the AI/LLM fallback mind. The AI fallback should only handle natural language chat, not system commands.
