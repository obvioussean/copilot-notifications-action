# Copilot Notifications Action

A GitHub Action that uses the GitHub Copilot SDK to intelligently filter your notifications and send you action items for the most important ones.

## Features

- 📬 Fetches your GitHub notifications automatically
- 🎯 Filters for mentions, assignments, and review requests
- 🤖 Uses Copilot AI to analyze importance and suggest actions
- 📊 Prioritizes notifications by importance level
- � **Sends beautifully formatted Slack DMs** with action items
- 📝 Falls back to console output if Slack is not configured

## How It Works

1. **Fetch Notifications**: Retrieves all unread notifications from your GitHub account
2. **Filter Mentions**: Identifies notifications where you were mentioned, assigned, or requested for review
3. **AI Analysis**: Uses GitHub Copilot SDK to analyze each notification and determine:
   - Importance level (1-5)
   - Brief summary of the issue/PR
   - Specific action required from you
4. **Generate Report**: Creates a formatted report with your most important action items
5. **Send Notification**: 
   - **With Slack**: Sends a beautifully formatted DM with interactive buttons
   - **Without Slack**: Outputs to action log (still useful for manual checks)

### Slack Message Format

When Slack is configured, you'll receive a DM with:
- 🔔 Header with notification count
- ⭐ Star ratings for importance (1-5 stars)
- 📝 Summary and required actions
- 🔘 "View" buttons linking directly to issues/PRs
- 🕐 Timestamp footer

**Example Slack message:**
```
🔔 Important GitHub Notifications

You have 3 important notification(s) requiring your attention:

─────────────────────────────

1. owner/repo
⭐⭐⭐⭐⭐ Importance: 5/5

Critical bug in production

📝 Security vulnerability needs immediate attention
✅ Action: Review PR and approve hotfix

[View Button]

─────────────────────────────
...
```

## Usage

### Prerequisites

#### GitHub Copilot Token

This action requires a GitHub Personal Access Token (fine-grained) with **Copilot Requests** permission enabled:

1. **Create a fine-grained PAT**:
   - Visit https://github.com/settings/personal-access-tokens/new
   - Under "Permissions," click "Add permissions" and select **"Copilot Requests"**
   - Also enable **"Notifications"** (read access)
   - Generate your token

2. **Store as GitHub Secret**:
   - In your repo: Settings → Secrets → Actions
   - Add `COPILOT_TOKEN` with your PAT value

> **Note:** This token needs the "Copilot Requests" permission to use the Copilot CLI for analyzing notifications. Regular GitHub tokens won't work.

#### Setting Up Slack (Optional but Recommended)

1. **Create a Slack App**:
   - Go to https://api.slack.com/apps
   - Click "Create New App" → "From scratch"
   - Name it (e.g., "Copilot Notifications Action") and select your workspace

2. **Add Bot Token Scopes**:
   - Go to "OAuth & Permissions"
   - Under "Bot Token Scopes", add:
     - `chat:write` - Send messages
     - `users:read` - Look up user info

3. **Install App to Workspace**:
   - Click "Install to Workspace"
   - Copy the "Bot User OAuth Token" (starts with `xoxb-`)

4. **Get Your Slack User ID**:
   - Click your profile picture in Slack → "Profile"
   - Click the three dots → "Copy member ID"
   - Or use: `U01234567` format

5. **Store as GitHub Secret**:
   - In your repo: Settings → Secrets → Actions
   - Add `SLACK_BOT_TOKEN` with your bot token
   - Add `SLACK_USER_ID` with your user ID

### Basic Workflow

Create a file `.github/workflows/copilot-notifications.yml`:

```yaml
name: Daily Notification Summary
on:
  schedule:
    # Run every day at 9 AM UTC
    - cron: '0 9 * * *'
  workflow_dispatch: # Allow manual triggering

jobs:
  check-notifications:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Filter Important Notifications
        uses: ./
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          copilot-token: ${{ secrets.GITHUB_TOKEN }}
          importance-threshold: '3'
          slack-token: ${{ secrets.SLACK_BOT_TOKEN }}
          slack-user-id: ${{ secrets.SLACK_USER_ID }}
```

### Inputs

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `github-token` | GitHub token with `notifications` scope | Yes | N/A |
| `copilot-token` | Token for Copilot SDK API calls | Yes | N/A |
| `importance-threshold` | Minimum importance level (1-5) to include | No | `3` || `slack-token` | Slack Bot OAuth token (starts with `xoxb-`) | No | N/A |
| `slack-user-id` | Your Slack user ID (e.g., `U01234567`) | No | N/A |
### Outputs

| Output | Description |
|--------|-------------|
| `notifications-processed` | Total number of notifications processed |
| `action-items-sent` | Number of important notifications requiring action |

## Examples

### Daily Morning Summary

```yaml
name: Morning Notification Check
on:
  schedule:
    - cron: '0 9 * * 1-5' # Weekdays at 9 AM
  
jobs:
  morning-summary:
    runs-on: ubuntu-latest
    steps:
      - uses: your-username/copilot-notifications-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          copilot-token: ${{ secrets.GITHUB_TOKEN }}
          importance-threshold: '4' # Only very important items
```

### On-Demand Check

```yaml
name: Check Notifications Now
on:
  workflow_dispatch:
  
jobs:
  check-now:
    runs-on: ubuntu-latest
    steps:
      - uses: your-username/copilot-notifications-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
          copilot-token: ${{ secrets.GITHUB_TOKEN }}
```

## Development

### Prerequisites

- Node.js 20+
- npm or yarn
- GitHub Copilot CLI installed and authenticated

### Setup

```bash
# Install dependencies
npm install

# Run the action locally (requires env vars)
npm start

# Run linting
npm run lint

# Format code
npm run format
```

**Note**: This action uses `tsx` to run TypeScript directly - no build step required!

### Project Structure

```
copilot-notifications-action/
├── .github/
│   └── copilot-instructions.md  # Copilot workspace instructions
├── src/
│   ├── index.ts                  # Main entry point
│   ├── types.ts                  # TypeScript type definitions
│   └── services/
│       ├── notification-service.ts  # GitHub API notification handling
│       ├── copilot-service.ts       # Copilot AI analysis
│       └── dm-service.ts            # Slack integration & formatting
├── action.yml                    # Action metadata
├── package.json                  # Dependencies and scripts
└── tsconfig.json                 # TypeScript configuration
```

### Why tsx?

This action uses `tsx` to execute TypeScript directly without a compilation step:
- ✅ No build artifacts to commit
- ✅ Faster development iteration
- ✅ Simpler CI/CD pipeline
- ✅ Direct TypeScript execution in GitHub Actions

## How the AI Analysis Works

The Copilot SDK analyzes each notification considering:

- **Repository Context**: Project importance and your relationship to it
- **Notification Type**: Issue, PR, discussion, etc.
- **Reason**: Why you were notified (mention, assignment, review request)
- **Title/Content**: What the notification is about

It then provides:
- **Importance Score**: 1 (low) to 5 (critical)
- **Summary**: Quick overview of what's needed
- **Action Required**: Specific next steps

## Permissions

This action requires the following permissions:

```yaml
permissions:
  notifications: read  # To fetch notifications
```

## Limitations

- The Copilot SDK requires the GitHub Copilot CLI to be available in the runner
- Direct DM functionality is not supported by GitHub API; notifications are logged to action output
- Analysis is performed synchronously, so large notification volumes may take time

## Future Enhancements

- [ ] Add support for creating issues in a tracking repo
- [ ] Integration with Slack/Teams for DM functionality
- [ ] Caching to avoid re-analyzing the same notifications
- [ ] Support for custom importance criteria
- [ ] Batch processing for better performance

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see LICENSE file for details

## Acknowledgments

Built with:
- [@actions/core](https://github.com/actions/toolkit/tree/main/packages/core)
- [@actions/github](https://github.com/actions/toolkit/tree/main/packages/github)
- [@github/copilot-sdk](https://github.com/github/copilot-sdk)
