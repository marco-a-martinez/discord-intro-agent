// Topic categories for message classification
export type Topic = 
  | 'support-request'
  | 'feature-request'
  | 'bug-report'
  | 'general-discussion'
  | 'praise'
  | 'question';

// In-memory storage for topic counts per channel
// Note: This resets when the process restarts
const topicCounts = new Map<string, Map<Topic, number>>();

/**
 * Classify a message using Ollama AI
 */
export async function classifyMessage(content: string): Promise<Topic> {
  try {
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'phi3.5',
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

    const data = await response.json();
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
    
    // Fallback if AI returns unexpected value
    console.warn(`AI returned invalid topic: "${result}", defaulting to general-discussion`);
    return 'general-discussion';
  } catch (error) {
    console.error('Ollama classification error:', error);
    return 'general-discussion';
  }
}

/**
 * Record a topic for a specific channel
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

  // Build totals section
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

  // Add per-channel breakdown if multiple channels
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
 * Reset all analytics data (useful for daily resets)
 */
export function resetAnalytics(): void {
  topicCounts.clear();
}
