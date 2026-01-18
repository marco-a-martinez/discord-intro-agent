export type ResponseType = "welcome" | "engage";

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
    responseType: "engage",
    enabled: false,
  },
  {
    name: "general",
    channelId: process.env.DISCORD_CHANNEL_GENERAL || "",
    responseType: "engage",
    enabled: false,
  },
  {
    name: "feedback",
    channelId: process.env.DISCORD_CHANNEL_FEEDBACK || "",
    responseType: "engage",
    enabled: false,
  },
  {
    name: "ai",
    channelId: process.env.DISCORD_CHANNEL_AI || "",
    responseType: "engage",
    enabled: false,
  },
  {
    name: "blink",
    channelId: process.env.DISCORD_CHANNEL_BLINK || "",
    responseType: "engage",
    enabled: false,
  },
  {
    name: "help",
    channelId: process.env.DISCORD_CHANNEL_HELP || "",
    responseType: "engage",
    enabled: false,
  },
  {
    name: "contributing",
    channelId: process.env.DISCORD_CHANNEL_CONTRIBUTING || "",
    responseType: "engage",
    enabled: false,
  },
  {
    name: "show-and-tell",
    channelId: process.env.DISCORD_CHANNEL_SHOW_AND_TELL || "",
    responseType: "engage",
    enabled: false,
  },
  {
    name: "education",
    channelId: process.env.DISCORD_CHANNEL_EDUCATION || "",
    responseType: "engage",
    enabled: false,
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
