import { OLLAMA_CONFIG } from "./models";

// Topic categories for message classification
export type Topic = 
  | 'support-request'
  | 'feature-request'
  | 'bug-report'
  | 'general-discussion'
  | 'praise'
  | 'question';

// Store detailed message info for better analytics
export interface TrackedMessage {
  content: string;
  author: string;
  channel: string;
  topic: Topic;
  helpTopic?: string; // More specific topic for #help channel
  timestamp: Date;
}

// In-memory storage
const messages: TrackedMessage[] = [];
const topicCounts = new Map<string, Map<Topic, number>>();

/**
 * Classify a message using Ollama AI
 */
export async function classifyMessage(content: string): Promise<Topic> {
  try {
    const response = await fetch(`${OLLAMA_CONFIG.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_CONFIG.model,
        prompt: `Classify the following message into exactly ONE of these categories:
- support-request: User needs help with setup, configuration, or troubleshooting
- feature-request: User is suggesting a new feature or improvement
- bug-report: User is reporting something broken or not working correctly
- general-discussion: Casual conversation, intros, or off-topic chat
- praise: User is expressing appreciation or positive feedback
- question: User is asking a question that isn't support-related

MESSAGE:
"${content}"

Respond with ONLY the category name, nothing else.`,
        stream: false,
      }),
    });

    const data = await response.json() as { response: string };
    const result = data.response?.trim().toLowerCase() as Topic;
    
    const validTopics: Topic[] = [
      'support-request',
      'feature-request', 
      'bug-report',
      'general-discussion',
      'praise',
      'question'
    ];
    
    if (validTopics.includes(result)) {
      return result;
    }
    
    console.warn(`AI returned invalid topic: "${result}", defaulting to general-discussion`);
    return 'general-discussion';
  } catch (error) {
    console.error('Ollama classification error:', error);
    return 'general-discussion';
  }
}

/**
 * Extract a specific help topic from a message (for #help channel)
 */
export async function extractHelpTopic(content: string): Promise<string> {
  try {
    const response = await fetch(`${OLLAMA_CONFIG.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_CONFIG.model,
        prompt: `Extract the main topic or issue from this help request. Summarize in 2-5 words.

Examples:
- "How do I set up VS Code with Coder?" -> "VS Code setup"
- "My workspace keeps crashing" -> "workspace crashes"
- "Can't connect to my dev environment" -> "connection issues"
- "How do templates work?" -> "templates"
- "SSH not working" -> "SSH issues"

MESSAGE:
"${content}"

Respond with ONLY the topic (2-5 words), nothing else.`,
        stream: false,
      }),
    });

    const data = await response.json() as { response: string };
    return data.response?.trim().toLowerCase() || 'general help';
  } catch (error) {
    console.error('Help topic extraction error:', error);
    return 'general help';
  }
}

/**
 * Record a message with full details
 */
export async function recordMessage(
  content: string,
  author: string,
  channel: string,
  topic: Topic
): Promise<void> {
  let helpTopic: string | undefined;
  
  // For help channel, extract specific topic
  if (channel === 'help') {
    helpTopic = await extractHelpTopic(content);
  }
  
  messages.push({
    content,
    author,
    channel,
    topic,
    helpTopic,
    timestamp: new Date(),
  });
  
  // Also update counts
  if (!topicCounts.has(channel)) {
    topicCounts.set(channel, new Map());
  }
  const channelTopics = topicCounts.get(channel)!;
  const currentCount = channelTopics.get(topic) ?? 0;
  channelTopics.set(topic, currentCount + 1);
}

/**
 * Record a topic (simple version for backward compatibility)
 */
export function recordTopic(channel: string, topic: Topic): void {
  if (!topicCounts.has(channel)) {
    topicCounts.set(channel, new Map());
  }
  const channelTopics = topicCounts.get(channel)!;
  const currentCount = channelTopics.get(topic) ?? 0;
  channelTopics.set(topic, currentCount + 1);
}

/**
 * Get top help topics with counts
 */
export function getTopHelpTopics(limit: number = 5): { topic: string; count: number }[] {
  const helpMessages = messages.filter(m => m.channel === 'help' && m.helpTopic);
  
  // Count occurrences of each help topic
  const topicCounts = new Map<string, number>();
  for (const msg of helpMessages) {
    const current = topicCounts.get(msg.helpTopic!) ?? 0;
    topicCounts.set(msg.helpTopic!, current + 1);
  }
  
  // Sort by count and return top N
  return Array.from(topicCounts.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Get recent messages from a channel
 */
export function getRecentMessages(channel: string, limit: number = 10): TrackedMessage[] {
  return messages
    .filter(m => m.channel === channel)
    .slice(-limit);
}

/**
 * Get all tracked messages
 */
export function getAllMessages(): TrackedMessage[] {
  return [...messages];
}

/**
 * Get topic summary across all channels
 */
export function getTopicSummary(): Record<string, Record<Topic, number>> {
  const summary: Record<string, Record<Topic, number>> = {};
  
  topicCounts.forEach((topics, channel) => {
    summary[channel] = {} as Record<Topic, number>;
    topics.forEach((count, topic) => {
      summary[channel][topic] = count;
    });
  });
  
  return summary;
}

/**
 * Get total counts across all channels
 */
export function getTotalCounts(): Record<Topic, number> {
  const totals: Record<Topic, number> = {
    'support-request': 0,
    'feature-request': 0,
    'bug-report': 0,
    'general-discussion': 0,
    'praise': 0,
    'question': 0,
  };
  
  topicCounts.forEach((topics) => {
    topics.forEach((count, topic) => {
      totals[topic] += count;
    });
  });
  
  return totals;
}

/**
 * Answer a question about analytics using AI
 */
export async function answerAnalyticsQuestion(question: string): Promise<string> {
  const topHelpTopics = getTopHelpTopics(10);
  const summary = getTopicSummary();
  const totals = getTotalCounts();
  const totalMessages = messages.length;
  const helpMessages = messages.filter(m => m.channel === 'help');
  
  // Build context for the AI
  const context = `
You are an analytics assistant for a Discord community bot. Answer questions based on this data:

TOTAL MESSAGES TRACKED: ${totalMessages}

TOP HELP TOPICS (what people ask for help with):
${topHelpTopics.length > 0 
  ? topHelpTopics.map((t, i) => `${i + 1}. ${t.topic} (${t.count} requests)`).join('\n')
  : 'No help topics tracked yet'}

MESSAGE TYPES ACROSS ALL CHANNELS:
- Support Requests: ${totals['support-request']}
- Feature Requests: ${totals['feature-request']}
- Bug Reports: ${totals['bug-report']}
- Questions: ${totals['question']}
- Praise: ${totals['praise']}
- General Discussion: ${totals['general-discussion']}

PER-CHANNEL BREAKDOWN:
${Object.entries(summary).map(([channel, topics]) => {
  const channelTotal = Object.values(topics).reduce((a, b) => a + b, 0);
  return `#${channel}: ${channelTotal} messages`;
}).join('\n')}

RECENT HELP REQUESTS (last 5):
${helpMessages.slice(-5).map(m => `- "${m.content.slice(0, 100)}${m.content.length > 100 ? '...' : ''}" (topic: ${m.helpTopic || 'unknown'})`).join('\n') || 'None yet'}
`;

  try {
    const response = await fetch(`${OLLAMA_CONFIG.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_CONFIG.model,
        prompt: `${context}

USER QUESTION: ${question}

Provide a helpful, concise answer based on the data above. If there's not enough data yet, say so. Keep your response under 200 words.`,
        stream: false,
      }),
    });

    const data = await response.json() as { response: string };
    return data.response?.trim() || "I couldn't generate a response. Try again later.";
  } catch (error) {
    console.error('Analytics question error:', error);
    return "Sorry, I'm having trouble connecting to the AI. Please try again later.";
  }
}

/**
 * Format a Top 5 help topics report for Slack
 */
export function formatTopHelpTopicsForSlack(): { text: string; blocks: object[] } {
  const topTopics = getTopHelpTopics(5);
  const totalHelp = messages.filter(m => m.channel === 'help').length;
  
  if (topTopics.length === 0) {
    return {
      text: 'No help topics tracked yet',
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: "📊 *Top Help Topics*\n\n_No help requests tracked yet. Data will appear as people ask questions in #help._" },
        },
      ],
    };
  }
  
  const topicList = topTopics
    .map((t, i) => `${i + 1}. *${t.topic}* — ${t.count} request${t.count > 1 ? 's' : ''}`)
    .join('\n');
  
  return {
    text: `Top 5 Help Topics (${totalHelp} total requests)`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '📊 Top Help Topics', emoji: true },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `Based on *${totalHelp}* help requests:\n\n${topicList}` },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `_Data from #help channel since bot started_` },
        ],
      },
    ],
  };
}

/**
 * Format daily summary for Slack reporting
 */
export function formatDailySummaryForSlack(): { text: string; blocks: object[] } {
  const summary = getTopicSummary();
  const totals = getTotalCounts();
  const totalMessages = Object.values(totals).reduce((a, b) => a + b, 0);
  
  if (totalMessages === 0) {
    return {
      text: '📊 Daily Analytics Summary: No messages recorded today',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '📊 Daily Analytics Summary', emoji: true },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '_No messages recorded today._' },
        },
      ],
    };
  }

  const topicEmojis: Record<Topic, string> = {
    'support-request': '🆘',
    'feature-request': '💡',
    'bug-report': '🐛',
    'general-discussion': '💬',
    'praise': '🎉',
    'question': '❓',
  };

  const topicLabels: Record<Topic, string> = {
    'support-request': 'Support Requests',
    'feature-request': 'Feature Requests',
    'bug-report': 'Bug Reports',
    'general-discussion': 'General Discussion',
    'praise': 'Praise',
    'question': 'Questions',
  };

  const totalLines = (Object.keys(totals) as Topic[])
    .filter(topic => totals[topic] > 0)
    .sort((a, b) => totals[b] - totals[a])
    .map(topic => `${topicEmojis[topic]} ${topicLabels[topic]}: *${totals[topic]}*`)
    .join('\n');

  const blocks: object[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '📊 Daily Analytics Summary', emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Total Messages:* ${totalMessages}` },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Overall Breakdown:*\n${totalLines}` },
    },
  ];

  const channels = Object.keys(summary);
  if (channels.length > 1) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: '*Per-Channel Breakdown:*' },
    });

    for (const channel of channels) {
      const channelTopics = summary[channel];
      const channelTotal = Object.values(channelTopics).reduce((a, b) => a + b, 0);
      const channelLines = (Object.keys(channelTopics) as Topic[])
        .filter(topic => channelTopics[topic] > 0)
        .sort((a, b) => channelTopics[b] - channelTopics[a])
        .map(topic => `${topicEmojis[topic]} ${channelTopics[topic]}`)
        .join(' | ');

      blocks.push({
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `*#${channel}* (${channelTotal}): ${channelLines}` },
        ],
      });
    }
  }

  // Add top help topics if available
  const topHelp = getTopHelpTopics(3);
  if (topHelp.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: { 
        type: 'mrkdwn', 
        text: `*🔥 Trending Help Topics:*\n${topHelp.map(t => `• ${t.topic} (${t.count})`).join('\n')}` 
      },
    });
  }

  blocks.push(
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `_Generated at ${new Date().toISOString()}_` },
      ],
    }
  );

  return {
    text: `📊 Daily Analytics Summary: ${totalMessages} messages analyzed`,
    blocks,
  };
}

/**
 * Reset all analytics data
 */
export function resetAnalytics(): void {
  messages.length = 0;
  topicCounts.clear();
}
