const EMOJI_ICON_PREFIX = "emoji:";

export function formatEmojiIcon(value: string): string | undefined {
  const emoji = value.trim();
  return emoji ? `${EMOJI_ICON_PREFIX}${emoji}` : undefined;
}

export function isEmojiIcon(value: string | undefined): value is string {
  return typeof value === "string" && value.startsWith(EMOJI_ICON_PREFIX);
}

export function emojiIconText(value: string): string {
  return isEmojiIcon(value) ? value.slice(EMOJI_ICON_PREFIX.length) : "";
}
