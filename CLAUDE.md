# Flavor text style rules

These conventions keep narration and dialogue consistent as more story/tutorial
content gets added. They live in `src/ui/tabs.js` (markup) and `styles.css`
(`.intro-panel` block) — extend both together.

## Narration vs. dialogue

- **Narration** (scene-setting, non-spoken description — "You feel as if you've
  just woken up...") stays plain default text color. No special class.
- **Spoken dialogue** from an identified character is quoted (`"..."`) and
  wrapped in `<p class="npc-speech">` — renders in `var(--accent)` (yellow/gold).
  One `<p class="npc-speech">` per line of speech.
- **An unidentified/mysterious voice** (before the speaker is named) uses
  `<em>"..."</em>` instead — same accent color, but italicized to mark it as
  not yet attributed to anyone. Once the speaker is named, switch to
  `.npc-speech` for their subsequent lines.

## Game-term callouts inside text

When dialogue or narration names a game concept that already has an
established UI color, wrap just that word/phrase in a span using that color,
even mid-sentence:

| Concept | Class | Color var |
|---|---|---|
| Lifestone | `.lifestone-glow` | `var(--mana)` (blue) |
| Pyreals | (none yet — use `.gold` if added inline) | `var(--gold)` |
| Hero Souls | (none yet — use `.soul` if added inline) | `var(--soul)` |

Add a new row + CSS rule here the first time a new concept needs an inline
glow, rather than reusing an unrelated color.

## Example

```html
<p style="margin-top:8px">A voice, unfamiliar, asks: <em>"...first time?"</em></p>
<p class="npc-speech">"Have you ever seen a <span class="lifestone-glow">Lifestone</span> before, Theron?"</p>
```
