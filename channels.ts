export type ResponseType = "welcome" | "analytics-only";

export interface ChannelConfig {
  name: string;
  channelId: string;
  responseType: ResponseType;
  enabled: boolean;
}

export const channels: ChannelConfig[] = [
  {
    name: "intros",
    channelId: process.env.DISCORD_CHANNEL_INTROS || "",
    responseType: "welcome",
    enabled: true,
  },
  {
    name: "random",
    channelId: process.env.DISCORD_CHANNEL_RANDOM || "",
    responseType: "analytics-only",
    enabled: true,
  },
  {
    name: "general",
    channelId: process.env.DISCORD_CHANNEL_GENERAL || "",
    responseType: "analytics-only",
    enabled: true,
  },
  {
    name: "feedback",
    channelId: process.env.DISCORD_CHANNEL_FEEDBACK || "",
    responseType: "analytics-only",
    enabled: true,
  },
  {
    name: "ai",
    channelId: process.env.DISCORD_CHANNEL_AI || "",
    responseType: "analytics-only",
    enabled: true,
  },
  {
    name: "blink",
    channelId: process.env.DISCORD_CHANNEL_BLINK || "",
    responseType: "analytics-only",
    enabled: true,
  },
  {
    name: "help",
    channelId: process.env.DISCORD_CHANNEL_HELP || "",
    responseType: "analytics-only",
    enabled: true,
  },
  {
    name: "contributing",
    channelId: process.env.DISCORD_CHANNEL_CONTRIBUTING || "",
    responseType: "analytics-only",
    enabled: true,
  },
  {
    name: "show-and-tell",
    channelId: process.env.DISCORD_CHANNEL_SHOW_AND_TELL || "",
    responseType: "analytics-only",
    enabled: true,
  },
  {
    name: "education",
    channelId: process.env.DISCORD_CHANNEL_EDUCATION || "",
    responseType: "analytics-only",
    enabled: true,
  },
];

export function getChannelConfig(channelId: string): ChannelConfig | undefined {
  return channels.find(
    (ch) => ch.enabled && ch.channelId && ch.channelId === channelId
  );
}

export function getEnabledChannelIds(): string[] {
  return channels
    .filter((ch) => ch.enabled && ch.channelId)
    .map((ch) => ch.channelId);
}
