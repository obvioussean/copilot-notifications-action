import { CopilotClient } from '@github/copilot-sdk';
import { Notification, AnalyzedNotification } from '../types.js';

export class CopilotService {
  private client: CopilotClient;
  private token: string;

  constructor(token: string) {
    this.token = token;
    
    console.log('Initializing CopilotClient...');
    console.log('Token length:', token?.length || 0);
    console.log('Token prefix:', token?.slice(0, 10) + '...');
    
    // Use npx to resolve the locally installed copilot CLI from @github/copilot package
    // This works in both local development and GitHub Actions
    this.client = new CopilotClient({
      cliPath: 'npx',
      cliArgs: ['--yes', 'copilot'],
      logLevel: 'debug',  // Enable debug logging
      env: {
        ...process.env,
        GITHUB_TOKEN: token,
        GH_TOKEN: token,  // Copilot CLI accepts both
      },
    });
    console.log('CopilotClient initialized');
  }

  async analyzeNotifications(
    notifications: Notification[]
  ): Promise<AnalyzedNotification[]> {
    const analyzed: AnalyzedNotification[] = [];

    for (const notification of notifications) {
      try {
        const analysis = await this.analyzeNotification(notification);
        analyzed.push({
          ...notification,
          ...analysis,
        });
      } catch (error) {
        console.error(`Failed to analyze notification ${notification.id}:`, error);
        // Add with default values if analysis fails
        analyzed.push({
          ...notification,
          importance: 3,
          summary: notification.subject.title,
          actionRequired: 'Review and respond',
        });
      }
    }

    return analyzed;
  }

  private async analyzeNotification(notification: Notification): Promise<{
    importance: number;
    summary: string;
    actionRequired: string;
  }> {
    const prompt = `Analyze this GitHub notification and determine:
1. Importance level (1-5, where 5 is most important)
2. A brief summary
3. What action is required from the user

Notification details:
- Repository: ${notification.repository.full_name}
- Type: ${notification.subject.type}
- Title: ${notification.subject.title}
- Reason: ${notification.reason}

Respond in JSON format:
{
  "importance": <number>,
  "summary": "<brief summary>",
  "actionRequired": "<specific action needed>"
}`;

    // Create a fresh session for each notification
    console.log('Creating Copilot session...');
    const session = await this.client.createSession({
      systemMessage: {
        mode: 'replace',
        content: 'You are a helpful assistant that analyzes GitHub notifications to determine their importance and required actions. Always respond with valid JSON.',
      },
    });
    console.log('Session created:', session.sessionId);

    try {
      // Register event handler to log all events for debugging
      session.on((event) => {
        console.log('Copilot event:', event.type, JSON.stringify(event.data || {}).slice(0, 200));
      });
      
      console.log('Sending prompt to Copilot...');
      const response = await session.sendAndWait({ prompt }, 120000);
      console.log('Response received:', response ? 'yes' : 'no');
      
      if (!response || !response.data?.content) {
        throw new Error('No response from Copilot');
      }

      const parsed = JSON.parse(response.data.content);
      
      return {
        importance: Math.min(5, Math.max(1, parsed.importance || 3)),
        summary: parsed.summary || notification.subject.title,
        actionRequired: parsed.actionRequired || 'Review and respond',
      };
    } finally {
      await session.destroy();
    }
  }

  async cleanup() {
    await this.client.stop();
  }
}
