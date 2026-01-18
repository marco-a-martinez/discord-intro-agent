import { config } from 'dotenv';
config({ path: '.env.local' });

import { Client, Events, GatewayIntentBits } from "discord.js";
import { OLLAMA_CONFIG, COMMUNITY_RESPONSE_PROMPT } from "./models";
import { WebClient } from "@slack/web-api";
import { SocketModeClient } from "@slack/socket-mode";
import { getChannelConfig, channels } from "./channels";
import { classifyMessage, recordTopic, formatDailySummaryForSlack } from "./analytics";

// Discord client
const discordClient = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// Slack clients
const slackWeb = new WebClient(process.env.SLACK_BOT_TOKEN);
const slackSocket = new SocketModeClient({
  appToken: process.env.SLACK_APP_TOKEN!,
});

// Store pending responses
const pendingResponses = new Map();

// AI-powered response generator using Ollama
async function generateResponse(message: string): Promise<string | null> {
  try {
    const prompt = COMMUNITY_RESPONSE_PROMPT.replace('{message}', message);
    const response = await fetch(`${OLLAMA_CONFIG.baseUrl}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OLLAMA_CONFIG.model,
        prompt,
        stream: false,
      }),
    });

    const data = await response.json() as { response: string };
    return data.response.trim() || null;
  } catch (error) {
    console.error("Ollama error:", error);
    return null;
  }
}

// Handle Discord messages
discordClient.on(Events.MessageCreate, async (message) => {
  if (message.author.bot) return;
  
  // Check if this channel is configured and enabled
  const channelConfig = getChannelConfig(message.channelId);
  if (!channelConfig) return;
  
  if (message.guildId !== process.env.DISCORD_GUILD_ID) return;

  console.log(`\n📨 Message from ${message.author.username} in #${channelConfig.name}`);

  // For analytics-only channels, just track the topic and return
  if (channelConfig.responseType === "analytics-only") {
    try {
      const topic = await classifyMessage(message.content);
      recordTopic(channelConfig.name, topic);
      console.log(`   📊 Classified as: ${topic}`);
    } catch (error) {
      console.error("Analytics error:", error);
    }
    return;
  }

  // Welcome flow for #intros channel only
  console.log(`   "${message.content}"`);

  try {
    // Build Discord message URL
    const discordUrl = `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`;

    // Try to generate AI response
    console.log("\n🤖 Generating AI response with Ollama...");
    const aiResponse = await generateResponse(message.content);

    let suggestedResponse = "";
    let hasAiSuggestion = false;

    if (aiResponse) {
      suggestedResponse = aiResponse;
      hasAiSuggestion = true;
      console.log("✅ AI response generated!");
      console.log(`   "${suggestedResponse}"`);
    } else {
      console.log("⚠️  AI generation failed, will prompt for manual response");
    }

    // Store pending response
    pendingResponses.set(message.id, {
      discordMessage: message,
      suggestedResponse: suggestedResponse,
      introContent: message.content,
      discordUrl: discordUrl,
      channelConfig: channelConfig,
    });

    // Build Slack blocks
    const blocks: any[] = [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: hasAiSuggestion ? "📬 New Discord Intro - AI Suggestion Ready" : "📬 New Discord Intro",
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          {
            type: "mrkdwn",
            text: `*From:*\n${message.author.username} (${message.author.tag})`,
          },
          {
            type: "mrkdwn",
            text: `*Channel:*\n#intros`,
          },
        ],
      },
      { type: "divider" },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*📝 Their Intro:*\n${message.content}`,
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "View on Discord",
            emoji: true,
          },
          url: discordUrl,
          action_id: "view_discord",
        },
      },
    ];

    // Add AI suggestion if we have one
    if (hasAiSuggestion) {
      blocks.push({
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*🤖 AI Suggested Response:*\n_${suggestedResponse}_`,
        },
      });
    }

    // Add action buttons
    const actionButtons: any[] = [
      {
        type: "button",
        text: { type: "plain_text", text: "✏️ Write Response", emoji: true },
        value: message.id,
        action_id: `edit_${message.id}`,
      },
      {
        type: "button",
        text: { type: "plain_text", text: "❌ Skip", emoji: true },
        style: "danger",
        value: message.id,
        action_id: `reject_${message.id}`,
      },
    ];

    // Add "Send AI Response" button if we have an AI suggestion
    if (hasAiSuggestion) {
      actionButtons.unshift({
        type: "button",
        text: { type: "plain_text", text: "✅ Send AI Response", emoji: true },
        style: "primary",
        value: message.id,
        action_id: `approve_${message.id}`,
      });
    }

    blocks.push({
      type: "actions",
      elements: actionButtons,
    });

    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Message ID: ${message.id}${hasAiSuggestion ? " | AI Generated (Ollama)" : ""}`,
        },
      ],
    });

    // Send to Slack
    const result = await slackWeb.chat.postMessage({
      channel: process.env.YOUR_SLACK_USER_ID!,
      text: `New intro from ${message.author.username}`,
      blocks: blocks,
    });

    // Store Slack message info
    const pending = pendingResponses.get(message.id);
    if (pending) {
      pending.slackTs = result.ts;
      pending.slackChannel = result.channel;
    }

    console.log("\n📤 Sent to Slack!");
  } catch (error) {
    console.error("\n❌ Error processing intro:", error);
  }
});

// Handle Slack button interactions
slackSocket.on("interactive", async ({ body, ack }) => {
  await ack();

  if (body.type === "view_submission") {
    // Handle modal submission (your written response)
    const messageId = body.view.private_metadata;
    const yourResponse = body.view.state.values.response_block.response_input.value;
    const pending = pendingResponses.get(messageId);

    if (!pending) {
      return;
    }

    // Update the stored response
    pending.suggestedResponse = yourResponse;

    console.log(`\n✏️ Response written for ${pending.discordMessage.author.username}`);
    console.log(`   Response: "${yourResponse}"`);

    // Update the Slack message with your response and approval button
    await slackWeb.chat.update({
      channel: pending.slackChannel,
      ts: pending.slackTs,
      text: `Response ready for ${pending.discordMessage.author.username}`,
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: "📬 Discord Intro - Response Ready",
            emoji: true,
          },
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*From:*\n${pending.discordMessage.author.username}`,
            },
            {
              type: "mrkdwn",
              text: `*Channel:*\n#intros`,
            },
          ],
        },
        { type: "divider" },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*📝 Their Intro:*\n${pending.introContent}`,
          },
          accessory: {
            type: "button",
            text: {
              type: "plain_text",
              text: "View on Discord",
              emoji: true,
            },
            url: pending.discordUrl,
            action_id: "view_discord",
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*✏️ Your Response:*\n_${yourResponse}_`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: { type: "plain_text", text: "✅ Send", emoji: true },
              style: "primary",
              value: messageId,
              action_id: `approve_${messageId}`,
            },
            {
              type: "button",
              text: { type: "plain_text", text: "✏️ Edit", emoji: true },
              value: messageId,
              action_id: `edit_${messageId}`,
            },
            {
              type: "button",
              text: { type: "plain_text", text: "❌ Skip", emoji: true },
              style: "danger",
              value: messageId,
              action_id: `reject_${messageId}`,
            },
          ],
        },
      ],
    });

    return;
  }

  if (body.type !== "block_actions") return;

  const action = body.actions[0];
  const actionId = action.action_id;
  const messageId = action.value;
  
  // Ignore the "View on Discord" button clicks
  if (actionId === "view_discord") {
    return;
  }

  const pending = pendingResponses.get(messageId);

  if (!pending) {
    await slackWeb.chat.postMessage({
      channel: body.channel.id,
      text: "❌ This request has expired.",
      thread_ts: body.message.ts,
    });
    return;
  }

  try {
    if (actionId.startsWith("approve_")) {
      // Send response to Discord
      const thread = await pending.discordMessage.startThread({
        name: `Welcome ${pending.discordMessage.author.username}`,
        reason: 'Community welcome response'
      });
      await thread.send(pending.suggestedResponse);

      await slackWeb.chat.update({
        channel: pending.slackChannel,
        ts: pending.slackTs,
        text: `✅ Response sent to ${pending.discordMessage.author.username}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `✅ *Response Sent!*\n\nTo: ${pending.discordMessage.author.username}\nMessage: _"${pending.suggestedResponse}"_`,
            },
          },
        ],
      });

      pendingResponses.delete(messageId);
      console.log(`\n✅ Response sent to ${pending.discordMessage.author.username}`);
    } else if (actionId.startsWith("edit_")) {
      // Open modal for you to write a response
      console.log(`\n✏️ Opening response modal for ${pending.discordMessage.author.username}...`);

      await slackWeb.views.open({
        trigger_id: body.trigger_id,
        view: {
          type: "modal",
          callback_id: "edit_response_modal",
          private_metadata: messageId,
          title: {
            type: "plain_text",
            text: "Write Response",
          },
          submit: {
            type: "plain_text",
            text: "Save",
          },
          close: {
            type: "plain_text",
            text: "Cancel",
          },
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Responding to:* ${pending.discordMessage.author.username}\n\n*Their intro:*\n"${pending.introContent}"\n\n<${pending.discordUrl}|View on Discord>`,
              },
            },
            {
              type: "input",
              block_id: "response_block",
              element: {
                type: "plain_text_input",
                action_id: "response_input",
                multiline: true,
                initial_value: pending.suggestedResponse,
                placeholder: {
                  type: "plain_text",
                  text: "Write your response here...",
                },
              },
              label: {
                type: "plain_text",
                text: "Your Response",
              },
            },
          ],
        },
      });
    } else if (actionId.startsWith("reject_")) {
      await slackWeb.chat.update({
        channel: pending.slackChannel,
        ts: pending.slackTs,
        text: `❌ Skipped ${pending.discordMessage.author.username}`,
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `❌ *Skipped*\n\nFrom: ${pending.discordMessage.author.username}`,
            },
          },
        ],
      });

      pendingResponses.delete(messageId);
      console.log(`\n❌ Skipped ${pending.discordMessage.author.username}`);
    }
  } catch (error) {
    console.error("Error handling Slack interaction:", error);
  }
});

// Start everything
discordClient.once(Events.ClientReady, (readyClient) => {
  console.log("\n🎉 Discord connection ready!");
  console.log(`   Logged in as: ${readyClient.user.tag}`);
  
  const welcomeChannels = channels.filter(ch => ch.enabled && ch.responseType === "welcome");
  const analyticsChannels = channels.filter(ch => ch.enabled && ch.responseType === "analytics-only");
  
  console.log(`\n   📬 Welcome responses enabled for ${welcomeChannels.length} channel(s):`);
  welcomeChannels.forEach(ch => console.log(`      - #${ch.name}`));
  
  console.log(`\n   📊 Analytics tracking for ${analyticsChannels.length} channel(s):`);
  analyticsChannels.forEach(ch => console.log(`      - #${ch.name}`));
});

slackSocket.on("ready", () => {
  console.log("\n🎉 Slack connection ready!");
  console.log("   Waiting for messages...\n");
});

(async () => {
  console.log("🚀 Starting Discord Community Agent V2...");
  console.log("   Using Ollama for AI responses (local & private)");
  console.log("   Connecting to Discord...");
  await discordClient.login(process.env.DISCORD_TOKEN);

  console.log("   Connecting to Slack...");
  await slackSocket.start();
})();
