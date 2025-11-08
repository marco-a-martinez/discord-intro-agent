import { config } from 'dotenv';
config({ path: '.env.local' });

import { openai } from "@ai-sdk/openai";
import { streamText } from "ai";
import { Agent } from "blink";
import { Client, Events, GatewayIntentBits } from "discord.js";

const agent = new Agent();

// Discord client
const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Marco's style prompt
const SYSTEM_PROMPT = `You are Marco, welcoming new members to the Coder Discord community.

Your communication style:
- Warm, genuine, and conversational
- Show real curiosity about their projects and what they're building
- Keep responses SHORT (1-2 sentences typically, maybe 3 if there's a lot to respond to)
- Always thank them for joining
- Ask thoughtful follow-up questions about:
  * What they're building with Coder
  * Their team size and setup
  * Any challenges they're facing
  * Their experience level with Coder
  * Their location (if they mention it)
- If they just say "hi" or a simple greeting, warmly welcome them and ask what they're working on

Examples of your style:
- "Hi. Thanks for joining the server. Can you tell me more about your project?"
- "Thanks for using Coder for so long. How much of your team is using Coder?"
- "Hiii. Thanks for joining the community. What are you working on these days?"

Be natural, friendly, and genuinely interested. Match the energy of their intro.`;

// Generate response using GPT-4
async function generateResponse(introMessage: string) {
  const result = await streamText({
    model: openai("gpt-4o"),
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `Someone just posted this intro in the #intros channel:\n\n"${introMessage}"\n\nWrite a warm, personal response in Marco's style. Keep it to 1-2 sentences (maybe 3 if warranted) and include a follow-up question if appropriate.`,
      },
    ],
    temperature: 0.8,
    maxTokens: 150,
  });

  let response = "";
  for await (const textPart of result.textStream) {
    response += textPart;
  }
  return response.trim();
}

// Handle Discord messages
discordClient.on(Events.MessageCreate, async (message) => {
  console.log(`\n[DEBUG] Message detected!`);
  console.log(`  From: ${message.author.username}`);
  console.log(`  Channel: ${message.channelId}`);
  console.log(`  Guild: ${message.guildId}`);
  console.log(`  Content: "${message.content}"`);
  console.log(`  Is bot? ${message.author.bot}`);
  console.log(`  Checking channel: ${message.channelId} === ${process.env.DISCORD_CHANNEL_ID}?`);
  console.log(`  Checking guild: ${message.guildId} === ${process.env.DISCORD_GUILD_ID}?`);


  if (message.author.bot) return;
  if (message.channelId !== process.env.DISCORD_CHANNEL_ID) return;
  if (message.guildId !== process.env.DISCORD_GUILD_ID) return;

  console.log(`\n📨 New intro from ${message.author.username}:`);
  console.log(`   "${message.content}"`);
  console.log("\n🤖 Generating response with GPT-4...");

  try {
    const suggestedResponse = await generateResponse(message.content);

    console.log("\n✅ Response generated!");
    console.log(`   "${suggestedResponse}"`);
    console.log("\n📤 Posting response to Discord...");

    // Post the response directly (no approval for now)
    await message.reply(suggestedResponse);

    console.log("✅ Response posted!");
  } catch (error) {
    console.error("\n❌ Error processing intro:", error);
  }
});

// Start Discord
discordClient.once(Events.ClientReady, (readyClient) => {
  console.log("\n🎉 Discord connection ready!");
  console.log(`   Logged in as: ${readyClient.user.tag}`);
  console.log(`   Monitoring channel: #intros (${process.env.DISCORD_CHANNEL_ID})`);
  console.log("   Waiting for new intros...\n");
});

(async () => {
  console.log("🚀 Starting Discord Intro Agent (Test Mode)...");
  console.log("   Using OpenAI GPT-4 for response generation");
  console.log("   Responses will post AUTOMATICALLY (no approval)");
  console.log("   Connecting to Discord...");
  await discordClient.login(process.env.DISCORD_TOKEN);
})();

agent.serve();

