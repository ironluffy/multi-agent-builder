# Interactive CLI Usage Guide

The Interactive CLI provides a terminal-based chat interface for conversing with the Multi-Agent Orchestrator system.

## Features

- **Real-time Chat**: Type messages to communicate with the root agent
- **Status Monitoring**: View agent status, budget usage, and system metrics
- **Color-coded Output**: Easy-to-read terminal interface with colored text
- **Command System**: Built-in commands for system control and information
- **Conversation History**: Track all messages exchanged during the session
- **Budget Tracking**: Monitor token usage and costs in real-time

## Prerequisites

1. PostgreSQL database running and migrated
2. Environment variables configured (see `.env.example`)
3. `ENABLE_INTERACTIVE_UI=true` in your `.env` file

## Starting the CLI

```bash
# Install dependencies
npm install

# Run database migrations
npm run migrate

# Start the interactive CLI
npm run dev
```

## Available Commands

### `/status`
Display detailed information about the root agent including:
- Agent ID
- Role
- Current status
- Depth level
- Task description
- Timestamps (created, updated)
- Budget usage with progress bar

**Example:**
```
> /status

┌─ Agent Status ─────────────────────────────────┐
│ ID:            abc123-def456-...
│ Role:          assistant
│ Status:        EXECUTING
│ Depth Level:   0
│ Task:          Interactive conversation with human user
│ Created:       11/22/2025, 2:30:00 PM
│ Updated:       11/22/2025, 2:45:00 PM
│ Budget:        [████████░░] 45.2% (4,520/10,000 tokens)
└────────────────────────────────────────────────┘
```

### `/budget`
Show detailed budget information including:
- Tokens used
- Token limit
- Remaining tokens
- Usage percentage
- Estimated cost
- Visual progress bar

**Example:**
```
> /budget

┌─ Budget Information ───────────────────────────┐
│ Tokens Used:   4,520
│ Token Limit:   10,000
│ Remaining:     5,480
│ Usage:         45.2%
│ Estimated Cost: $0.0136
│ Progress:      [████████████████████████░░░░░░░░]
└────────────────────────────────────────────────┘
```

### `/history`
Display the entire conversation history for the current session.

**Example:**
```
> /history

┌─ Conversation History ─────────────────────────┐
[1] You: Hello!
[2] Agent: Hello! I'm your assistant agent. How can I help you today?
[3] You: What's the weather like?
[4] Agent: I received your message: "What's the weather like?"...
└────────────────────────────────────────────────┘
```

### `/system`
Show system-wide statistics across all agents:
- Total agent count
- Agents by status (pending, executing, completed, etc.)
- Total tokens used
- Total estimated cost

**Example:**
```
> /system

┌─ System Summary ───────────────────────────────┐
│ Total Agents:      5
│ By Status:
│   pending:         1
│   executing:       2
│   completed:       2
│ Total Tokens Used: 15,432
│ Total Estimated Cost: $0.0463
└────────────────────────────────────────────────┘
```

### `/clear`
Clear the terminal screen while maintaining your session.

### `/help`
Display the list of available commands.

### `/quit` or `/exit`
Exit the CLI gracefully, showing final statistics:
- Final token usage
- Estimated cost
- Agent status updated to "completed"

**Example:**
```
> /quit

Shutting down...
Final token usage: 4,520 tokens
Estimated cost: $0.0136
Goodbye!
```

## Chat Interface

Simply type your message and press Enter to send it to the agent. The agent will process your message and respond conversationally.

**Example:**
```
> Hello!
Agent: Hello! I'm your assistant agent. How can I help you today?

> Can you help me with a coding task?
Agent: [Processing...]
Agent: I received your message: "Can you help me with a coding task?"...
```

## Color Coding

The CLI uses colors to improve readability:

- **Green**: User input prompt, success messages, "completed" status
- **Magenta**: Agent responses
- **Cyan**: Banners, command output borders, "executing" status
- **Yellow**: Warnings, "pending" status
- **Red**: Errors, "failed" status, budget warnings
- **Gray**: Timestamps, hints, dimmed text

## Budget Management

The CLI tracks token usage automatically:

- **Green Progress Bar**: Usage < 70%
- **Yellow Progress Bar**: Usage 70-90%
- **Red Progress Bar**: Usage > 90%

Each message exchanged contributes to the token count. The default budget is 100,000 tokens per agent.

## Current Limitations

- **Simulated Responses**: In the current implementation, agent responses are simulated. Full Claude API integration is planned for future releases.
- **Single Agent**: Only supports conversation with the root agent. Multi-agent orchestration through the CLI is planned.
- **No History Persistence**: Conversation history is lost when you exit the CLI. Database persistence is planned.

## Troubleshooting

### "Database not initialized" Error
Ensure PostgreSQL is running and migrations have been executed:
```bash
npm run migrate
```

### "Environment validation failed" Error
Check your `.env` file has all required variables from `.env.example`.

### CLI Not Starting
Verify `ENABLE_INTERACTIVE_UI=true` in your `.env` file.

### Agent Not Spawning
Check database connection and ensure the `agents` and `budgets` tables exist.

## Next Steps

After familiarizing yourself with the CLI:

1. Review the [Architecture Documentation](./architecture.md)
2. Learn about [Agent Orchestration](./orchestration.md)
3. Explore [API Integration](./api-integration.md)
4. Understand [Budget Management](./budget-management.md)

## Support

For issues or questions:
- Check the main [README.md](../README.md)
- Review [Troubleshooting Guide](./troubleshooting.md)
- Open an issue on GitHub
