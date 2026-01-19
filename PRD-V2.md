# Product Requirements Document (PRD): Discord Intro Agent V2 with Community Analytics

## Document Information

- **Product Name:** Discord Intro Agent V2
- **Version:** 2.0
- **Author:** Marco Martinez (Community Manager, Coder)
- **Last Updated:** January 2025
- **Status:** In Production

---

## Executive Summary

The Discord Intro Agent V2 extends the original intro welcome bot with comprehensive community analytics capabilities. In addition to AI-powered welcome messages for new members, the agent now monitors 10 Discord channels, classifies messages by topic, tracks help request patterns, identifies trending discussion threads, and provides on-demand analytics via Slack. The system includes conversation memory for natural follow-up questions, data persistence across restarts, and direct Discord links to active help threads.

---

## Problem Statement

### Current Pain Points (Building on V1)

1. **Limited Visibility into Community Health:** The Community Manager lacks insight into what topics users are discussing, what problems they're encountering, and which help threads are most active.

2. **No Help Request Tracking:** When users post in #help, there's no systematic way to identify recurring issues, trending problems, or threads that need attention.

3. **Manual Analytics:** Understanding community patterns requires manually reading through channels—time-consuming and prone to missing important signals.

4. **Context Loss:** When asking questions about community data, each query is isolated with no ability to ask follow-up questions like "tell me more about the first one."

5. **Data Loss on Restart:** Any insights gathered are lost when the workspace restarts, requiring re-analysis each time.

### Impact

- Recurring issues go unnoticed until they become widespread
- Active help threads may not receive timely attention
- Community Manager cannot provide data-driven reports to leadership
- Valuable community insights are lost
- No way to identify trends or patterns over time

---

## Goals & Success Metrics

### Primary Goals

1. **Track community engagement** across 10 Discord channels in real-time
2. **Identify top help topics** and active discussion threads automatically
3. **Provide instant analytics** via Slack DM or @mention
4. **Support natural conversation** with follow-up questions and context memory
5. **Persist all data** across workspace restarts

### Success Metrics

| Metric | Target |
|--------|--------|
| Channels Monitored | 10 (up from 1 in V1) |
| Message Classification Accuracy | >85% correct categorization |
| Analytics Response Time | <5 seconds for pre-built reports |
| Data Persistence | 100% survival across restarts |
| Conversation Memory | 7 days of context retention |
| Top Threads Identified | Threads with 5+ replies surfaced |

### Non-Goals (V2)

- Auto-responding in channels other than #intros
- Automated issue escalation
- Integration with external ticketing systems
- Multi-server support
- Real-time alerting for specific keywords

---

## User Personas

### Primary User: Community Manager (Marco)

**Role:** Manages Coder's Discord community

**Pain Points:** Limited visibility into community patterns, manual effort to identify trending issues, no data for leadership reports

**Needs:**
- Quick access to top help topics and active threads
- Ability to ask natural questions about community data
- Direct links to Discord threads that need attention
- Data that persists and accumulates over time

**Technical Proficiency:** Non-developer; comfortable with Slack and basic terminal commands

### Secondary User: Coder CMO/Leadership

**Role:** Oversees community strategy

**Pain Points:** Limited visibility into community health and engagement patterns

**Needs:**
- Data on what topics users discuss most
- Insight into common problems and feature requests
- Trends over time

**Technical Proficiency:** Business user; receives reports via Slack

### Tertiary User: Support/Engineering Teams

**Role:** Address user issues and build product improvements

**Pain Points:** Unaware of common user struggles in Discord

**Needs:**
- Visibility into recurring technical issues
- Links to relevant discussion threads
- Understanding of user pain points

**Technical Proficiency:** Technical; can access Discord directly

---

## Solution Overview

### Architecture Overview

The V2 system extends the original architecture with analytics capabilities:

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│   Discord Server    │     │   Agent (Node.js)   │     │   Slack Workspace   │
│                     │────▶│                     │────▶│                     │
│   10 Channels:      │     │   - Welcome Flow    │     │   - Intro Approvals │
│   - #intros         │     │   - Analytics       │     │   - Analytics Chat  │
│   - #help (Forum)   │     │   - Classification  │     │   - Top Threads     │
│   - #general        │     │   - Ollama AI       │     │                     │
│   - #feedback       │     │                     │     │                     │
│   - #ai             │     └──────────┬──────────┘     └─────────────────────┘
│   - #blink          │                │
│   - #contributing   │                ▼
│   - #show-and-tell  │     ┌─────────────────────┐
│   - #education      │     │   Persistence       │
│   - #random         │     │   - analytics.json  │
│                     │     │   - conversations.json│
└─────────────────────┘     └─────────────────────┘
```

### Technology Stack

| Component | Technology |
|-----------|------------|
| Runtime | Node.js v22 |
| Language | TypeScript |
| Infrastructure | Coder cloud workspace (Docker-based) |
| AI Model | Ollama with llama3.1:8b |
| Process Manager | PM2 |
| Discord API | Discord.js v14 |
| Slack API | @slack/web-api, @slack/socket-mode |
| Data Storage | JSON files (analytics-data.json, conversations-data.json) |
| Version Control | GitHub (private repo) |

---

## User Flows

### Flow 1: Welcome Flow (Unchanged from V1)

1. New member posts intro in #intros
2. Agent generates AI welcome response using Ollama
3. Agent sends Slack DM with intro + AI suggestion + action buttons
4. Community Manager clicks Approve/Edit/Skip
5. If approved, response posted to Discord as threaded reply

### Flow 2: Analytics Query via Slack

1. User DMs the bot or @mentions it in Slack
2. Agent detects message type:
   - "threads", "top help", "active", "popular" → Returns Top 5 Threads report
   - "forget", "clear history" → Clears conversation memory
   - Any other message → Returns combined analytics report
3. Response sent to Slack with formatted data
4. User can ask follow-up questions (context remembered for 7 days)

### Flow 3: Background Message Classification

1. User posts message in any monitored channel
2. Agent classifies message into one of 6 categories using Ollama
3. For #help channel: extracts specific help topic (2-5 words)
4. For forum threads: tracks thread ID, name, and reply count
5. Data stored in memory and persisted to disk

### Flow 4: Historical Data Loading

1. Agent starts up
2. Checks for persisted analytics data
3. If exists: loads from disk, skips Discord fetch
4. If not: fetches last 100 messages from each channel
5. For #help forum: fetches active threads (124+) and archived threads (50)
6. Processes each message through AI classification
7. Saves to disk for future restarts

---

## Functional Requirements

### Core Features (V1 - Maintained)

**FR1: Discord #intros Monitoring**
- Detect new messages within 1 second
- Filter out bot messages
- Generate AI welcome responses
- Slack approval workflow with Approve/Edit/Skip buttons
- Post approved responses as threaded replies

### New Features (V2)

**FR2: Multi-Channel Monitoring**

Description: Monitor 10 Discord channels for community analytics

Channels:
| Channel | Type | Behavior |
|---------|------|----------|
| #intros | Welcome | AI responses sent to Slack for approval |
| #help | Analytics (Forum) | Track threads, extract topics, count replies |
| #general | Analytics | Message classification only |
| #random | Analytics | Message classification only |
| #feedback | Analytics | Message classification only |
| #ai | Analytics | Message classification only |
| #blink | Analytics | Message classification only |
| #contributing | Analytics | Message classification only |
| #show-and-tell | Analytics | Message classification only |
| #education | Analytics | Message classification only |

Requirements:
- Must detect messages in real-time via Discord.js
- Must handle both regular text channels and forum channels
- Must filter messages from 2024 onwards only
- Must skip bot messages

**FR3: Message Classification**

Description: Classify every message into topic categories using AI

Categories:
| Category | Description |
|----------|-------------|
| support-request | User needs help with setup, configuration, troubleshooting |
| feature-request | User suggesting new features or improvements |
| bug-report | User reporting something broken |
| general-discussion | Casual conversation, off-topic chat |
| praise | Positive feedback, appreciation |
| question | Non-support questions |

Requirements:
- Must use Ollama with llama3.1:8b model
- Must classify within 5 seconds per message
- Must default to "general-discussion" if classification fails
- Must log invalid classifications for debugging

**FR4: Help Topic Extraction**

Description: Extract specific topics from #help channel messages

Requirements:
- Must generate 2-5 word topic summaries (e.g., "VS Code setup", "SSH issues")
- Must normalize similar topics to canonical forms:
  - "coder setup issue" / "coder setup issues" → "coder setup issue"
  - "vs code setup" / "vscode issue" → "vs code issue"
  - "unknown issue" / "no main topic" → "general help"
- Must track topic frequency for reporting

**FR5: Forum Channel Support**

Description: Handle Discord Forum channels (like #help)

Requirements:
- Must detect forum channel type (Discord type 15)
- Must fetch active threads (up to 124+)
- Must fetch archived threads (up to 50)
- Must extract messages from each thread (up to 20 per thread)
- Must track thread ID and thread name for each message
- Must count replies per thread

**FR6: Top Threads Tracking**

Description: Identify most active forum threads

Requirements:
- Must identify threads with 5 or more replies
- Must sort by reply count (highest first)
- Must return top 5 threads
- Must include direct Discord links to each thread
- Must format for Slack display

Output Format:
```
🔥 Top Help Threads (5+ replies)

1.) "Thread title here" (15 replies)
2.) "Another thread" (12 replies)
3.) "Third thread" (8 replies)
4.) "Fourth thread" (7 replies)
5.) "Fifth thread" (5 replies)

_Click a thread title to view it in Discord_
```

**FR7: Slack Analytics Interface**

Description: Respond to Slack messages with analytics data

Trigger Words:
| Words | Response |
|-------|----------|
| "thread", "top help", "active", "popular" | Top 5 Threads report with Discord links |
| "forget", "clear history", "start over", "new conversation" | Clear conversation memory |
| Any other message | Combined analytics summary |

Requirements:
- Must respond to DMs to the bot
- Must respond to @mentions
- Must respond within 5 seconds
- Must format responses using Slack Block Kit

**FR8: Conversation Memory**

Description: Remember conversation context for follow-up questions

Requirements:
- Must store conversation history per Slack user
- Must retain history for 7 days
- Must include conversation context in AI prompts
- Must support references like "tell me more about the first one"
- Must persist conversations to disk
- Must provide clear command to reset memory

**FR9: Data Persistence**

Description: Persist all analytics data across restarts

Files:
| File | Contents |
|------|----------|
| analytics-data.json | All tracked messages with classifications |
| conversations-data.json | Per-user conversation histories |

Requirements:
- Must save data within 5 seconds of changes (debounced)
- Must load data on startup before Discord fetch
- Must skip historical fetch if persisted data exists
- Must handle corrupted files gracefully

**FR10: Historical Data Loading**

Description: Load historical messages on first startup

Requirements:
- Must fetch last 100 messages from each text channel
- Must fetch threads from forum channels
- Must filter to 2024+ messages only
- Must process through AI classification
- Must display progress during loading
- Must skip if persisted data exists

---

## Configuration

### Environment Variables (.env.local)

```bash
# Discord
DISCORD_TOKEN=           # Bot authentication token
DISCORD_GUILD_ID=        # Server ID

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
SLACK_BOT_TOKEN=         # Bot OAuth token (xoxb-)
SLACK_APP_TOKEN=         # Socket mode app token (xapp-)
YOUR_SLACK_USER_ID=      # User to receive intro notifications
```

### Code Structure

```
discord-intro-agent/
├── agent.ts          # Main application - Discord/Slack handlers
├── analytics.ts      # Classification, tracking, reporting, persistence
├── channels.ts       # Channel configuration
├── models.ts         # Ollama AI configuration and prompts
├── package.json      # Dependencies
├── .env.local        # Environment variables (not in Git)
├── analytics-data.json      # Persisted message data (generated)
├── conversations-data.json  # Persisted conversations (generated)
└── PRD-V2.md         # This document
```

---

## Non-Functional Requirements

### Performance

| Metric | Requirement |
|--------|-------------|
| Message Classification | <5 seconds per message |
| Top Threads Report | <2 seconds |
| Slack Response | <5 seconds |
| Historical Load | <10 minutes for full load |
| Memory Usage | <500MB RAM |

### Reliability

| Metric | Requirement |
|--------|-------------|
| Uptime | 99%+ (excluding planned restarts) |
| Data Persistence | 100% survival across restarts |
| Error Recovery | Auto-reconnect for Discord/Slack |
| Graceful Degradation | Continue without Ollama (skip classification) |

### Security

- All tokens stored in .env.local (not committed to Git)
- Code stored in private GitHub repository
- All AI processing done locally via Ollama (no external API calls)
- Minimal Discord permissions (read messages, post replies)

### Maintainability

- PM2 for process management and restart
- Clear logging with timestamps
- All code in Git with descriptive commits
- Modular file structure (agent, analytics, channels, models)

---

## Data Models

### TrackedMessage

```typescript
interface TrackedMessage {
  content: string;      // Message text
  author: string;       // Username
  channel: string;      // Channel name (e.g., "help", "general")
  topic: Topic;         // Classification category
  helpTopic?: string;   // Specific help topic (for #help only)
  timestamp: Date;      // When recorded
  threadId?: string;    // Forum thread ID (for forum channels)
  threadName?: string;  // Forum thread title (for forum channels)
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

## Deployment

### Infrastructure

| Component | Details |
|-----------|--------|
| Platform | Coder cloud workspace |
| Workspace | [workspace-name] |
| Process Manager | PM2 |
| AI Service | Ollama (separate process on localhost:11434) |
| Model | llama3.1:8b |

### Commands

```bash
# Start/restart bot
pm2 restart discord-bot

# View logs
pm2 logs discord-bot --lines 100

# Update from git and restart
git fetch origin && git reset --hard origin/main && pm2 restart discord-bot

# Clear analytics data and reload
rm analytics-data.json && pm2 restart discord-bot
```

### Weekly Restart Process

1. Navigate to workspace in Coder
2. Click "Start" button
3. Open Terminal
4. Run: `pm2 restart discord-bot`
5. Verify with: `pm2 logs discord-bot --lines 20`

---

## Testing

### Manual Testing Checklist

**Analytics Features:**
- [ ] DM bot "threads" → Returns top 5 threads with links
- [ ] DM bot "hi" → Returns combined analytics report
- [ ] DM bot "forget" → Clears conversation, confirms
- [ ] Click thread link → Opens correct Discord thread
- [ ] Restart bot → Data persists, no historical reload
- [ ] Post in #help → Message classified and tracked
- [ ] Post in #general → Message classified and tracked

**Welcome Features (V1):**
- [ ] Post intro → Slack notification appears
- [ ] Click Approve → Response posted to Discord
- [ ] Click Edit → Modal opens, edited response posts
- [ ] Click Skip → No response posted

### Error Scenarios

| Scenario | Expected Behavior | Recovery |
|----------|-------------------|----------|
| Ollama down | Classification skipped, bot continues | Restart Ollama |
| Discord disconnects | Auto-reconnect attempted | Auto or manual restart |
| Slack disconnects | Intro monitoring continues, can't send | Auto or manual restart |
| Workspace restarts | Data persists, bot needs restart | `pm2 restart discord-bot` |
| Corrupted JSON | Error logged, starts fresh | Delete JSON files, restart |

---

## Risks & Mitigations

### Technical Risks

**Risk 1: Classification Quality**
- Impact: Incorrect categorization leads to misleading analytics
- Likelihood: Medium
- Mitigation: Topic normalization, default categories, periodic review

**Risk 2: Historical Load Time**
- Impact: Bot slow to start on fresh deployment
- Likelihood: Medium (10+ minutes for forum threads)
- Mitigation: Data persistence eliminates repeated loads

**Risk 3: Forum API Limits**
- Impact: Can't fetch all threads
- Likelihood: Low
- Mitigation: Fetch 50 archived + all active, covers most relevant

**Risk 4: Large Data Files**
- Impact: Slow saves, memory issues
- Likelihood: Low (currently ~1000 messages)
- Mitigation: Monitor file size, implement rotation if needed

### Business Risks

**Risk 1: Analytics Misinterpretation**
- Impact: Wrong conclusions from data
- Likelihood: Medium
- Mitigation: Show raw counts, link to source threads

**Risk 2: Privacy Concerns**
- Impact: Users uncomfortable with tracking
- Likelihood: Low (public Discord messages)
- Mitigation: All data stays local, no external APIs

---

## Future Enhancements

### Phase 3 Features (Next 3-6 months)

**Scheduled Reports**
- Daily/weekly analytics summaries to Slack
- Trend comparison (week-over-week)
- Automatic alerting for spike in issues

**Enhanced Analytics**
- Sentiment analysis for feedback channel
- User engagement tracking (who's most active)
- Response time tracking for #help threads

**Operational Improvements**
- Auto-start on workspace boot
- Health check pings
- Web dashboard for visualization

### Phase 4+ (6+ months)

**Integrations**
- GitHub issue creation from trending problems
- CRM integration for user tracking
- Export to Google Sheets for leadership

**Advanced AI**
- Larger models for complex analysis
- Fine-tuned classification
- Suggested responses for help threads

---

## Appendix

### A. Slack App Configuration

Required Bot Token Scopes:
- `chat:write` - Post messages
- `im:history` - Read DM history
- `app_mentions:read` - Receive @mentions
- `users:read` - Get user info

Required Event Subscriptions:
- `message.im` - DM messages
- `app_mention` - @mentions

### B. Discord Bot Permissions

Required Permissions:
- Read Messages/View Channels
- Send Messages
- Read Message History
- Use Slash Commands (future)

Required Intents:
- Guilds
- Guild Messages
- Message Content

### C. Troubleshooting Guide

**Problem: "No threads with 5+ replies"**
- Analytics data may need to reload
- Delete `analytics-data.json` and restart
- Wait for historical load to complete (~10 minutes)

**Problem: Bot not responding to Slack DMs**
- Check Slack app has `im:history` scope
- Check `message.im` event subscription
- Verify Socket Mode is enabled

**Problem: Classification always returns "general-discussion"**
- Check Ollama is running: `curl http://localhost:11434/api/tags`
- Check model is loaded: `ollama list`
- Review logs: `pm2 logs discord-bot --lines 50`

### D. Glossary

| Term | Definition |
|------|------------|
| Forum Channel | Discord channel type 15 that contains threads instead of messages |
| Thread | A discussion within a forum channel with its own title and replies |
| Topic | AI-extracted 2-5 word summary of a help request |
| Classification | Categorizing a message into one of 6 types |
| Conversation Memory | Stored chat history enabling follow-up questions |
| Persistence | Saving data to disk to survive restarts |

---

## Sign-Off

| Role | Name | Approval | Date |
|------|------|----------|------|
| Product Owner | Marco Martinez | ✅ Yes | January 2025 |
| Technical Advisor | Blink AI | ✅ Yes | January 2025 |
| Stakeholder (CMO) | [Name] | ⏳ Pending | |

---

## Document Version History

| Version | Date | Changes |
|---------|------|--------|
| 1.0 | 2024 | Initial PRD - #intros welcome bot |
| 2.0 | January 2025 | Multi-channel analytics, forum support, conversation memory, data persistence, top threads tracking |
