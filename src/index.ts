import * as core from '@actions/core';
import { context } from '@actions/github';
import { NotificationService } from './services/notification-service.js';
import { CopilotService } from './services/copilot-service.js';
import { DMService } from './services/dm-service.js';

async function run(): Promise<void> {
  try {
    // Get inputs
    const githubToken = core.getInput('github-token', { required: true });
    const copilotToken = core.getInput('copilot-token', { required: true });
    const importanceThreshold = parseInt(core.getInput('importance-threshold') || '3', 10);
    const slackToken = core.getInput('slack-token') || undefined;
    const slackUserId = core.getInput('slack-user-id') || undefined;
    const currentUser = context.actor;

    core.info('Starting notification helper...');

    // Initialize services
    const notificationService = new NotificationService(githubToken);
    const copilotService = new CopilotService(copilotToken);
    const dmService = new DMService(slackToken, slackUserId);

    // Fetch notifications
    core.info('Fetching notifications...');
    const notifications = await notificationService.fetchNotifications();
    core.info(`Found ${notifications.length} notifications`);

    // Filter for mentions and unresponded items
    core.info('Filtering notifications for mentions...');
    const mentionNotifications = notificationService.filterMentions(notifications);
    core.info(`Found ${mentionNotifications.length} mention notifications`);

    if (mentionNotifications.length === 0) {
      core.info('No mention notifications found. Nothing to do.');
      return;
    }

    // Remove items you have already responded to
    core.info('Removing notifications you have already responded to...');
    const unrespondedNotifications = await notificationService.filterUnresponded(
      mentionNotifications,
      currentUser
    );
    core.info(`Remaining after response check: ${unrespondedNotifications.length}`);

    if (unrespondedNotifications.length === 0) {
      core.info('All mention notifications already handled.');
      return;
    }

    // Analyze importance using Copilot
    core.info('Analyzing notification importance with Copilot...');
    const analyzedNotifications = await copilotService.analyzeNotifications(
      unrespondedNotifications,
      importanceThreshold
    );
    
    const importantNotifications = analyzedNotifications.filter(
      (n) => n.importance >= importanceThreshold
    );
    core.info(`Found ${importantNotifications.length} important notifications`);

    if (importantNotifications.length === 0) {
      core.info('No important notifications to report.');
      return;
    }

    // Send DM with action items
    core.info('Sending DM with action items...');
    await dmService.sendActionItemsDM(currentUser, importantNotifications);
    
    // Clean up Copilot client
    await copilotService.cleanup();
    
    core.info('✅ Notification helper completed successfully!');
    core.setOutput('notifications-processed', notifications.length);
    core.setOutput('action-items-sent', importantNotifications.length);
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(`Action failed: ${error.message}`);
    } else {
      core.setFailed('Action failed with an unknown error');
    }
  }
}

run();
