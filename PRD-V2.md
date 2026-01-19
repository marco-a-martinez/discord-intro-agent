# Discord Intro Agent V2 - Product Requirements Document

## Overview

The Discord Intro Agent V2 is an intelligent community management bot that monitors the Coder Discord server, tracks community engagement patterns, and provides AI-powered analytics via Slack. It serves two primary functions:

1. **Welcome Automation**: AI-generated welcome responses for new member introductions
2. **Community Analytics**: Real-time tracking and analysis of help requests, feature requests, and community discussions

---

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Discord Server │────▶│   Agent (Node)  │────▶│  Slack Workspace│
│  (10 channels)  │     │   + Ollama AI   │     │  (DM/Mentions)  │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                               │
                               ▼
                        ┌─────────────────┐
                        │  Persistence    │
                        │  (JSON files)   │
                        └─────────────────┘
```

### Components

| File | Purpose |
|------|--------|
| `agent.ts` | Main bot logic - Discord/Slack connections, message handling, welcome flow |
| `analytics.ts` | Message classification, topic extraction, conversation memory, reporting |
| `channels.ts` | Channel configuration and routing |
| `models.ts` | Ollama AI configuration and prompts |

---

## Features

### 1. Multi-Channel Monitoring

The bot monitors **10 Discord channels**:

| Channel | Type | Behavior |
|---------|------|----------|
| `#intros` | Welcome | AI-generated welcome responses sent to Slack for approval |
| `#help` | Analytics (Forum) | Tracks threads, extracts help topics, counts replies |
| `#general` | Analytics | Message classification only |
| `#random` | Analytics | Message classification only |
| `#feedback` | Analytics | Message classification only |
| `#ai` | Analytics | Message classification only |
| `#blink` | Analytics | Message classification only |
| `#contributing` | Analytics | Message classification only |
| `#show-and-tell` | Analytics | Message classification only |
| `#education` | Analytics | Message classification only |

### 2. Welcome Flow (#intros)

When a new member posts in `#intros`:

1. Bot generates AI welcome response using Ollama (llama3.1:8b)
2. Sends to Slack with the intro message and AI suggestion
3. User can **Approve**, **Edit**, or **Skip** via Slack buttons
4. Approved/edited responses are posted back to Discord

**Slack Message Format:**
```
📬 New Discord Intro - AI Suggestion Ready

From: username (user#1234)
Channel: #intros

📝 Their Intro:
[User's introduction message]

🤖 AI Suggested Response:
[Generated welcome message]

[Approve ✓] [Edit ✏️] [Skip ✗]
```

### 3. Forum Channel Support (#help)

The `#help` channel is a **Discord Forum** (channel type 15). The bot:

- Fetches active threads (up to 124+)
- Fetches archived threads (up to 50)
- Extracts messages from each thread (up to 20 per thread)
- Tracks thread ID and thread name for each message
- Filters threads created in 2024 or later

### 4. Message Classification

Every message is classified into one of 6 categories using Ollama AI:

| Category | Description |
|----------|-------------|
| `support-request` | User needs help with setup, configuration, troubleshooting |
| `feature-request` | User suggesting new features or improvements |
| `bug-report` | User reporting something broken |
| `general-discussion` | Casual conversation, off-topic chat |
| `praise` | Positive feedback, appreciation |
| `question` | Non-support questions |

### 5. Help Topic Extraction

For `#help` channel messages, the bot extracts a specific topic (2-5 words) like:
- "VS Code setup"
- "SSH issues"
- "workspace crashes"
- "authentication issue"

**Topic Normalization:**
Similar topics are consolidated:
- "coder setup issue" / "coder setup issues" → `coder setup issue`
- "vs code setup" / "vscode issue" → `vs code issue`
- "unknown issue" / "no main topic" → `general help`

### 6. Top Threads Tracking

Tracks the most active forum threads (5+ replies) with:
- Thread title
- Reply count
- Direct Discord link

**Slack Output:**
```
🔥 Top Help Threads (5+ replies)

1.) "Thread title here" (15 replies)
2.) "Another thread" (12 replies)
3.) "Third thread" (8 replies)
4.) "Fourth thread" (7 replies)
5.) "Fifth thread" (5 replies)

_Click a thread title to view it in Discord_
```

### 7. Conversation Memory

The bot maintains conversation history per Slack user:

- **Duration**: 7 days
- **Storage**: Persisted to `conversations-data.json`
- **Usage**: Enables follow-up questions like "tell me more about the first one"
- **Clear command**: Say "forget", "clear history", "start over", or "new conversation"

### 8. Slack Commands

| Trigger Words | Response |
|---------------|----------|
| "thread", "top help", "active", "popular" | Top 5 threads with Discord links |
| "forget", "clear history", "start over" | Clears conversation memory |
| Any other message | Combined analytics report |

### 9. Data Persistence

Two JSON files store data across restarts:

| File | Contents |
|------|----------|
| `analytics-data.json` | All tracked messages with classifications |
| `conversations-data.json` | Per-user conversation histories |

**On Startup:**
1. Load persisted data if exists
2. Skip historical Discord fetch if data exists
3. Otherwise, fetch last 100 messages from each channel

---

## Data Models

### TrackedMessage
```typescript
interface TrackedMessage {
  content: string;      // Message text
  author: string;       // Username
  channel: string;      // Channel name
  topic: Topic;         // Classification category
  helpTopic?: string;   // Specific help topic (for #help)
  timestamp: Date;      // When recorded
  threadId?: string;    // Forum thread ID
  threadName?: string;  // Forum thread title
}
```

### ConversationMessage
```typescript
interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}
```

### ChannelConfig
```typescript
interface ChannelConfig {
  name: string;
  channelId: string;
  responseType: 'welcome' | 'analytics-only';
  enabled: boolean;
}
```

---

## Environment Variables

```bash
# Discord
DISCORD_TOKEN=           # Bot token
DISCORD_GUILD_ID=        # Server ID (747933592273027093)

# Channel IDs
DISCORD_CHANNEL_INTROS=
DISCORD_CHANNEL_RANDOM=
DISCORD_CHANNEL_GENERAL=
DISCORD_CHANNEL_FEEDBACK=
DISCORD_CHANNEL_AI=
DISCORD_CHANNEL_BLINK=
DISCORD_CHANNEL_HELP=
DISCORD_CHANNEL_CONTRIBUTING=
DISCORD_CHANNEL_SHOW_AND_TELL=
DISCORD_CHANNEL_EDUCATION=

# Slack
SLACK_BOT_TOKEN=         # Bot OAuth token
SLACK_APP_TOKEN=         # Socket mode app token
YOUR_SLACK_USER_ID=      # User to receive intro notifications
```

---

## AI Configuration

**Model**: Ollama with `llama3.1:8b`
**Endpoint**: `http://localhost:11434`

### Prompts Used

1. **Welcome Response**: Generates friendly community manager responses for new member intros
2. **Message Classification**: Categorizes messages into 6 topic types
3. **Help Topic Extraction**: Summarizes help requests into 2-5 word topics
4. **Analytics Q&A**: Answers questions about community data with conversation context

---

## Deployment

### Coder Workspace
- **Workspace**: `marco/discord-agent-v2` on dev.coder.com
- **Process Manager**: PM2 (`pm2 restart discord-bot`)
- **Ollama**: Running separately on localhost:11434

### Commands
```bash
# Start/restart bot
pm2 restart discord-bot

# View logs
pm2 logs discord-bot --lines 100

# Update from git
git fetch origin && git reset --hard origin/main && pm2 restart discord-bot
```

---

## Metrics Tracked

| Metric | Description |
|--------|-------------|
| Total messages | All messages across monitored channels |
| Messages per channel | Breakdown by channel |
| Topic distribution | Count by classification category |
| Top help topics | Most common help request categories |
| Top active threads | Forum threads with 5+ replies |
| Reply counts | Number of messages per forum thread |

---

## Limitations & Known Issues

1. **Forum thread limit**: Only fetches 50 archived threads (Discord API limit)
2. **Message limit per thread**: Fetches up to 20 messages per thread
3. **Historical cutoff**: Only loads messages from 2024 onwards
4. **Slack events**: Some `app_mention` events may not trigger (requires proper Slack app scopes)
5. **AI response time**: Ollama classification can be slow with many messages

---

## Future Enhancements

- [ ] Scheduled daily/weekly analytics reports
- [ ] Trend analysis (week-over-week comparisons)
- [ ] Sentiment analysis for feedback channel
- [ ] Auto-tagging of threads based on topic
- [ ] Integration with GitHub issues for bug reports
- [ ] Dashboard UI for analytics visualization

---

## Version History

| Version | Date | Changes |
|---------|------|--------|
| V1 | - | Basic intro welcome bot |
| V2 | Jan 2025 | Multi-channel analytics, forum support, conversation memory, Slack integration, data persistence |
