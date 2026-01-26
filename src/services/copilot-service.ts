import { CopilotClient } from '@github/copilot-sdk';
import { Notification, AnalyzedNotification } from '../types.js';

export class CopilotService {
  private client: CopilotClient;

  constructor(token: string) {
    // Pass the token to the Copilot CLI via environment variables
    // The CLI accepts GITHUB_TOKEN or GH_TOKEN for authentication
    // Requires a fine-grained PAT with "Copilot Requests" permission
    this.client = new CopilotClient({
      env: {
        ...process.env,
        GITHUB_TOKEN: token,
        GH_TOKEN: token,
      },
    });
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

    const session = await this.client.createSession({
      systemMessage: {
        mode: 'replace',
        content: 'You are a helpful assistant that analyzes GitHub notifications to determine their importance and required actions. Always respond with valid JSON.',
      },
    });

    try {
      const response = await session.sendAndWait({ prompt }, 120000);
      
      if (!response || !response.data?.content) {
        throw new Error('No response from Copilot');
      }

      // Extract JSON from response - Copilot may wrap it in markdown code blocks
      const content = response.data.content;
      let jsonStr = content;
      
      // Try to extract JSON from markdown code block
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      } else {
        // Try to find raw JSON object in the response
        const jsonObjectMatch = content.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          jsonStr = jsonObjectMatch[0];
        }
      }

      const parsed = JSON.parse(jsonStr);
      
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
