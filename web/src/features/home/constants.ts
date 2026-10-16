/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
/**
 * Landing page constants — copy is i18n-driven; keys resolve through
 * locales with zh as the primary brand language (京西智库).
 */

// Layout - Main base classes
export const MAIN_BASE_CLASSES = 'bg-background text-foreground w-full'

// Hero terminal demo - model names cycled in the request preview
export const AI_MODELS = [
  'Qwen.Color',
  'DeepSeek.Color',
  'Doubao.Color',
  'OpenAI',
  'Claude.Color',
  'Gemini.Color',
] as const

// Selling points (qianwen-style three pillars)
export const SELLING_POINT_KEYS = [
  {
    titleKey: 'One API key, every modality',
    descriptionKey:
      'Text, image and audio models behind one unified endpoint — no separate vendor accounts needed',
    iconName: 'Layers',
  },
  {
    titleKey: 'Works with your favorite tools',
    descriptionKey:
      'Plug into Cherry Studio, Cline, Claude Code, Cursor, Codex and more with a compatible OpenAI-style API',
    iconName: 'Blocks',
  },
  {
    titleKey: 'Budget under control',
    descriptionKey:
      'Subscribe monthly / quarterly / yearly for the best rate, or pay-as-you-go with real-time usage tracking',
    iconName: 'Gauge',
  },
] as const

// Tools wall — lobe icon names shown in the compatibility grid
export const SUPPORTED_TOOLS = [
  { icon: 'CherryStudio', label: 'Cherry Studio' },
  { icon: 'LobeHub.Color', label: 'LobeHub' },
  { icon: 'Dify.Color', label: 'Dify' },
  { icon: 'OpenWebUI', label: 'Open WebUI' },
  { icon: 'Cline', label: 'Cline' },
  { icon: 'Claude.Color', label: 'Claude Code' },
  { icon: 'OpenAI', label: 'ChatGPT / Codex' },
  { icon: 'Cursor', label: 'Cursor' },
  { icon: 'Qwen.Color', label: 'Qwen Code' },
  { icon: 'DeepSeek.Color', label: 'DeepSeek' },
] as const

// FAQ entries — collapsed by default
export const FAQ_KEYS = [
  {
    questionKey: 'How do I get started?',
    answerKey:
      'Register an account, top up or subscribe to a plan in the wallet, create an API key, then point your tool at the API address shown on the token page.',
  },
  {
    questionKey: 'What is the difference between plans and pay-as-you-go?',
    answerKey:
      'Plans grant a fixed quota pool per cycle (monthly / quarterly / yearly) at a better rate, while pay-as-you-go charges per token from your wallet balance. Both are supported for personal and team usage.',
  },
  {
    questionKey: 'Do quarterly and yearly plans save money?',
    answerKey:
      'Yes — administrators can price each cycle independently, and longer cycles are typically discounted compared to paying month by month.',
  },
  {
    questionKey: 'How do team plans work?',
    answerKey:
      'Buy a team plan to create your team with the seat count you need. Invite members with the invite code, and team tokens draw from the shared team quota pool — strictly separated from personal keys.',
  },
  {
    questionKey: 'Which tools can I connect?',
    answerKey:
      'Any client that speaks the OpenAI-compatible API: Cherry Studio, Cline, Claude Code, Cursor, Codex, and hundreds more.',
  },
] as const
