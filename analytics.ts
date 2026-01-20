import { OLLAMA_CONFIG } from "./models";
import * as fs from "fs";
import * as path from "path";

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
  threadId?: string; // For forum posts - the thread ID
  threadName?: string; // For forum posts - the thread title
  messageId?: string; // Discord message ID for fetching reactions
  channelId?: string; // Discord channel ID for building URLs
}

// Persistence file path
const DATA_FILE = path.join(process.cwd(), 'analytics-data.json');
const CONVERSATIONS_FILE = path.join(process.cwd(), 'conversations-data.json');

// In-memory storage
let messages: TrackedMessage[] = [];
const topicCounts = new Map<string, Map<Topic, number>>();

// Conversation memory - stores full history per user
export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

const conversations = new Map<string, ConversationMessage[]>();
const MAX_CONVERSATION_AGE_HOURS = 24 * 7; // Clear conversations older than 7 days

/**
 * Load persisted data from disk
 */
export function loadPersistedData(): void {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      messages = data.messages.map((m: any) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      }));
      
      // Rebuild topic counts from messages
      for (const msg of messages) {
        if (!topicCounts.has(msg.channel)) {
          topicCounts.set(msg.channel, new Map());
        }
        const channelTopics = topicCounts.get(msg.channel)!;
        const currentCount = channelTopics.get(msg.topic) ?? 0;
        channelTopics.set(msg.topic, currentCount + 1);
      }
      
      console.log(`   📂 Loaded ${messages.length} messages from disk`);
    }
    
    // Load conversations
    if (fs.existsSync(CONVERSATIONS_FILE)) {
      const convData = JSON.parse(fs.readFileSync(CONVERSATIONS_FILE, 'utf-8'));
      for (const [userId, msgs] of Object.entries(convData.conversations || {})) {
        const parsedMsgs = (msgs as any[]).map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
        }));
        conversations.set(userId, parsedMsgs);
      }
      console.log(`   💬 Loaded ${conversations.size} conversation histories`);
    }
  } catch (error) {
    console.error('Failed to load persisted data:', error);
  }
}

/**
 * Check if we have persisted data (to skip historical loading)
 */
export function hasPersistedData(): boolean {
  return messages.length > 0;
}

/**
 * Save analytics data to disk
 */
function saveData(): void {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ messages }, null, 2));
  } catch (error) {
    console.error('Failed to save data:', error);
  }
}

/**
 * Save conversations to disk
 */
function saveConversations(): void {
  try {
    const convObj: Record<string, ConversationMessage[]> = {};
    conversations.forEach((msgs, oderId) => {
      convObj[oderId] = msgs;
    });
    fs.writeFileSync(CONVERSATIONS_FILE, JSON.stringify({ conversations: convObj }, null, 2));
  } catch (error) {
    console.error('Failed to save conversations:', error);
  }
}

// Debounce saves to avoid writing too frequently
let saveTimeout: NodeJS.Timeout | null = null;
function debouncedSave(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveData, 5000); // Save 5 seconds after last change
}

let convSaveTimeout: NodeJS.Timeout | null = null;
function debouncedSaveConversations(): void {
  if (convSaveTimeout) clearTimeout(convSaveTimeout);
  convSaveTimeout = setTimeout(saveConversations, 2000);
}

/**
 * Add a message to a user's conversation history
 */
export function addToConversation(userId: string, role: 'user' | 'assistant', content: string): void {
  if (!conversations.has(userId)) {
    conversations.set(userId, []);
  }
  
  const history = conversations.get(userId)!;
  
  // Clean up old messages (older than MAX_CONVERSATION_AGE_HOURS)
  const cutoff = new Date(Date.now() - MAX_CONVERSATION_AGE_HOURS * 60 * 60 * 1000);
  const filtered = history.filter(m => m.timestamp > cutoff);
  
  filtered.push({
    role,
    content,
    timestamp: new Date(),
  });
  
  conversations.set(userId, filtered);
  debouncedSaveConversations();
}

/**
 * Get a user's conversation history
 */
export function getConversationHistory(userId: string): ConversationMessage[] {
  const history = conversations.get(userId) || [];
  
  // Filter out old messages
  const cutoff = new Date(Date.now() - MAX_CONVERSATION_AGE_HOURS * 60 * 60 * 1000);
  return history.filter(m => m.timestamp > cutoff);
}

/**
 * Clear a user's conversation history
 */
export function clearConversation(userId: string): void {
  conversations.delete(userId);
  debouncedSaveConversations();
}

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
        prompt: `You are a message classifier. Classify the message into exactly ONE category.

VALID CATEGORIES (you MUST respond with one of these exact values):
- support-request
- feature-request
- bug-report
- general-discussion
- praise
- question

CATEGORY DEFINITIONS:
- support-request: Help with setup, configuration, installation, or troubleshooting
- feature-request: Suggesting new features, enhancements, or improvements
- bug-report: Reporting broken functionality, errors, or unexpected behavior
- general-discussion: Casual conversation, introductions, greetings, or off-topic
- praise: Expressing thanks, appreciation, or positive feedback
- question: Asking about how something works (not troubleshooting)

EXAMPLES:
"How do I install Coder?" -> support-request
"Can you add dark mode?" -> feature-request
"The login page crashes on Safari" -> bug-report
"Hey everyone, I'm new here!" -> general-discussion
"Thanks, this is amazing!" -> praise
"What does this feature do?" -> question
"Hi, I'm having trouble connecting" -> support-request
"Love the new update!" -> praise

MESSAGE TO CLASSIFY:
"${content}"

RESPOND WITH ONLY ONE OF: support-request, feature-request, bug-report, general-discussion, praise, question`,
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
  topic: Topic,
  threadId?: string,
  threadName?: string,
  messageId?: string,
  channelId?: string
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
    threadId,
    threadName,
    messageId,
    channelId,
  });
  
  // Also update counts
  if (!topicCounts.has(channel)) {
    topicCounts.set(channel, new Map());
  }
  const channelTopics = topicCounts.get(channel)!;
  const currentCount = channelTopics.get(topic) ?? 0;
  channelTopics.set(topic, currentCount + 1);
  
  // Persist to disk
  debouncedSave();
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
 * Normalize a help topic to consolidate similar topics
 */
function normalizeHelpTopic(topic: string): string {
  let normalized = topic
    .toLowerCase()
    .trim()
    .replace(/["']/g, '')           // Remove quotes
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .replace(/issues?$/i, 'issue')  // Normalize plural "issues" to "issue"
    .replace(/problems?$/i, 'issue') // "problem(s)" -> "issue"
    .replace(/errors?$/i, 'error')  // Normalize plural "errors"
    .replace(/questions?$/i, 'question'); // Normalize plural
  
  // Map common variations to canonical forms
  const mappings: Record<string, string> = {
    'coder setup': 'coder setup issue',
    'coder configuration': 'coder setup issue',
    'coder install': 'coder setup issue',
    'coder installation': 'coder setup issue',
    'vs code setup': 'vs code issue',
    'vscode setup': 'vs code issue',
    'vs code issue': 'vs code issue',
    'vscode issue': 'vs code issue',
    'vs code connection': 'vs code issue',
    'workspace issue': 'workspace issue',
    'workspace crash': 'workspace issue',
    'workspace connection': 'workspace issue',
    'ssh issue': 'ssh issue',
    'ssh connection': 'ssh issue',
    'ssh setup': 'ssh issue',
    'docker issue': 'docker issue',
    'docker setup': 'docker issue',
    'devcontainer issue': 'devcontainer issue',
    'devcontainer setup': 'devcontainer issue',
    'template issue': 'template issue',
    'template setup': 'template issue',
    'authentication issue': 'authentication issue',
    'auth issue': 'authentication issue',
    'login issue': 'authentication issue',
    'git issue': 'git issue',
    'git authentication': 'git issue',
    'github issue': 'git issue',
    'unknown issue': 'general help',
    'no main topic extracted': 'general help',
    'general help': 'general help',
  };
  
  // Check for mapping matches
  for (const [pattern, canonical] of Object.entries(mappings)) {
    if (normalized.includes(pattern)) {
      return canonical;
    }
  }
  
  return normalized;
}

/**
 * Get top help topics with counts
 */
export function getTopHelpTopics(limit: number = 5): { topic: string; count: number }[] {
  const helpMessages = messages.filter(m => m.channel === 'help' && m.helpTopic);
  
  // Count occurrences of each help topic (normalized)
  const topicCounts = new Map<string, number>();
  for (const msg of helpMessages) {
    const normalized = normalizeHelpTopic(msg.helpTopic!);
    const current = topicCounts.get(normalized) ?? 0;
    topicCounts.set(normalized, current + 1);
  }
  
  // Sort by count and return top N
  return Array.from(topicCounts.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Get top threads by reply count (threads with minReplies or more)
 */
export function getTopThreads(minReplies: number = 5, limit: number = 5): { threadId: string; threadName: string; replyCount: number }[] {
  // Count messages per thread
  const threadCounts = new Map<string, { name: string; count: number }>();
  
  for (const msg of messages) {
    if (msg.threadId && msg.threadName) {
      const current = threadCounts.get(msg.threadId);
      if (current) {
        current.count++;
      } else {
        threadCounts.set(msg.threadId, { name: msg.threadName, count: 1 });
      }
    }
  }
  
  // Filter by minReplies and sort by count
  return Array.from(threadCounts.entries())
    .filter(([_, data]) => data.count >= minReplies)
    .map(([threadId, data]) => ({ threadId, threadName: data.name, replyCount: data.count }))
    .sort((a, b) => b.replyCount - a.replyCount)
    .slice(0, limit);
}

/**
 * Format top threads for Slack with Discord links
 */
export function formatTopThreadsForSlack(guildId: string): { text: string; blocks: object[] } {
  const topThreads = getTopThreads(5, 5);
  
  if (topThreads.length === 0) {
    return {
      text: 'No threads with 5+ replies yet',
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: "📊 *Top Help Threads*\n\n_No threads with 5+ replies yet. Data will appear as discussions grow._" },
        },
      ],
    };
  }
  
  const threadList = topThreads
    .map((t, i) => {
      const discordLink = `https://discord.com/channels/${guildId}/${t.threadId}`;
      return `${i + 1}.) <${discordLink}|${t.threadName}> (${t.replyCount} replies)`;
    })
    .join('\n');
  
  return {
    text: `Top 5 Help Threads`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: '🔥 Top Help Threads (5+ replies)', emoji: true },
      },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: threadList },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: `_Click a thread title to view it in Discord_` },
        ],
      },
    ],
  };
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
 * Answer a question about analytics using AI (with conversation memory)
 */
export async function answerAnalyticsQuestion(question: string, userId?: string): Promise<string> {
  const topHelpTopics = getTopHelpTopics(10);
  const topThreads = getTopThreads(5, 5); // Threads with 5+ replies
  const summary = getTopicSummary();
  const totals = getTotalCounts();
  const totalMessages = messages.length;
  const helpMessages = messages.filter(m => m.channel === 'help');
  
  // Get conversation history if userId provided
  const conversationHistory = userId ? getConversationHistory(userId) : [];
  
  // Build conversation context
  const conversationContext = conversationHistory.length > 0
    ? `\nPREVIOUS CONVERSATION:\n${conversationHistory.map(m => 
        `${m.role.toUpperCase()}: ${m.content}`
      ).join('\n')}\n`
    : '';
  
  // Build data context for the AI
  const dataContext = `
You are an analytics assistant for a Discord community bot. Answer questions based on this data:

TOTAL MESSAGES TRACKED: ${totalMessages}
TOTAL HELP CHANNEL MESSAGES: ${helpMessages.length}

TOP 5 MOST ACTIVE THREADS (5+ replies - these are the hot discussions):
${topThreads.length > 0 
  ? topThreads.map((t, i) => `${i + 1}.) "${t.threadName}" (${t.replyCount} replies)`).join('\n')
  : 'No threads with 5+ replies yet'}

TOP HELP TOPICS BY CATEGORY:
${topHelpTopics.length > 0 
  ? topHelpTopics.slice(0, 5).map((t, i) => `${i + 1}.) ${t.topic} (${t.count} requests)`).join('\n')
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
`;

  // Store user's question in conversation history
  if (userId) {
    addToConversation(userId, 'user', question);
  }

  try {
    const response = await fetch(`${OLLAMA_CONFIG.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_CONFIG.model,
        prompt: `${dataContext}${conversationContext}
CURRENT USER QUESTION: ${question}

Provide a helpful answer based on the data above. Use the conversation history to understand context and follow-up questions.

FORMATTING RULES:
- Do NOT add any leading spaces before lines
- Start your response directly with "Summary:" (no space before it)
- Use numbered lists like: 1.) 2.) 3.)
- Do NOT use asterisks (*) for bullet points

Your response must follow this EXACT format:

Summary:
[Write 4-5 detailed sentences. Include: exact message counts, specific percentages, name the top issues explicitly, identify specific patterns like "authentication issues spike" or "VS Code problems are common", and note any actionable insights like "users struggle most with X"]

Top 5 Active Threads (5+ replies):
1.) "Thread title here" (X replies)
2.) "Thread title here" (X replies)
3.) "Thread title here" (X replies)
4.) "Thread title here" (X replies)
5.) "Thread title here" (X replies)

Be specific and data-driven. Don't be vague - cite actual numbers and thread names from the data.`,
        stream: false,
      }),
    });

    const data = await response.json() as { response: string };
    const answer = data.response?.trim() || "I couldn't generate a response. Try again later.";
    
    // Store assistant's response in conversation history
    if (userId) {
      addToConversation(userId, 'assistant', answer);
    }
    
    return answer;
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
 * Format a combined summary + top topics report for Slack (default response)
 */
export function formatCombinedReportForSlack(): { text: string; blocks: object[] } {
  const totals = getTotalCounts();
  const totalMessages = Object.values(totals).reduce((a, b) => a + b, 0);
  const topTopics = getTopHelpTopics(5);
  const helpMessages = messages.filter(m => m.channel === 'help').length;
  
  if (totalMessages === 0) {
    return {
      text: 'No analytics data yet',
      blocks: [
        {
          type: 'section',
          text: { type: 'mrkdwn', text: "📊 *Analytics Report*\n\n_No data tracked yet. Messages will be analyzed as they come in._" },
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

  // Summary section
  const summaryLines = (Object.keys(totals) as Topic[])
    .filter(topic => totals[topic] > 0)
    .sort((a, b) => totals[b] - totals[a])
    .map(topic => `${topicEmojis[topic]} ${topicLabels[topic]}: *${totals[topic]}*`)
    .join('\n');

  // Top help topics section
  const topicList = topTopics.length > 0
    ? topTopics.map((t, i) => `${i + 1}. *${t.topic}* — ${t.count} request${t.count > 1 ? 's' : ''}`).join('\n')
    : '_No help topics tracked yet_';

  const blocks: object[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '📊 Discord Analytics Report', emoji: true },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*Summary* (${totalMessages} total messages)\n\n${summaryLines}` },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*🔥 Top 5 Help Topics* (${helpMessages} help requests)\n\n${topicList}` },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `_Ask me anything about the community data!_` },
      ],
    },
  ];

  return {
    text: `Discord Analytics: ${totalMessages} messages, top topic: ${topTopics[0]?.topic || 'N/A'}`,
    blocks,
  };
}

/**
 * Get messages from the last N days that have messageId for reaction fetching
 */
export function getMessagesForRollup(days: number = 7): TrackedMessage[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  
  return messages.filter(m => {
    const msgDate = new Date(m.timestamp);
    return msgDate >= cutoff && m.messageId && m.channelId;
  });
}

/**
 * Format the weekly rollup for Slack
 */
export function formatWeeklyRollupForSlack(
  rankedMessages: Array<{ message: TrackedMessage; reactionCount: number }>,
  guildId: string
): { text: string; blocks: object[] } {
  if (rankedMessages.length === 0) {
    return {
      text: '📊 Weekly Rollup: No messages with 3+ reactions this week',
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: '📊 Weekly Community Rollup', emoji: true },
        },
        {
          type: 'section',
          text: { type: 'mrkdwn', text: '_No messages with 3+ reactions in the last 7 days._' },
        },
      ],
    };
  }

  const messageLines = rankedMessages.slice(0, 15).map((item, i) => {
    const m = item.message;
    const truncatedContent = m.content.length > 100 
      ? m.content.substring(0, 100) + '...' 
      : m.content;
    
    // Build Discord link
    const channelForLink = m.threadId || m.channelId;
    const discordUrl = `https://discord.com/channels/${guildId}/${channelForLink}/${m.messageId}`;
    
    return `${i + 1}. *${item.reactionCount} reactions* | #${m.channel} | _${m.topic}_\n     <${discordUrl}|"${truncatedContent.replace(/\n/g, ' ')}">`;
  });

  const blocks: object[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: '📊 Weekly Community Rollup', emoji: true },
    },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: `_Top ${rankedMessages.length} messages with 3+ reactions from the last 7 days_` },
      ],
    },
    { type: 'divider' },
  ];

  // Split into chunks to avoid Slack's block limits
  for (const line of messageLines) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: line },
    });
  }

  blocks.push(
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: '_Click any message to view it in Discord_' },
      ],
    }
  );

  return {
    text: `📊 Weekly Rollup: ${rankedMessages.length} popular messages`,
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
