/**
 * LinearApiClient
 * GraphQL client for Linear API to update issues and post comments.
 * Used for bidirectional sync - when agents complete, update Linear.
 */

import { logger } from '../utils/Logger.js';

const LINEAR_API_URL = 'https://api.linear.app/graphql';

export interface LinearApiConfig {
  apiToken: string;
}

export interface WorkflowState {
  id: string;
  name: string;
  type: string;
}

export interface IssueUpdateResult {
  success: boolean;
  issueId?: string;
  newState?: { id: string; name: string };
  error?: string;
}

export interface CommentCreateResult {
  success: boolean;
  commentId?: string;
  error?: string;
}

export class LinearApiClient {
  private apiToken: string;
  private clientLogger = logger.child({ component: 'LinearApiClient' });

  constructor(config: LinearApiConfig) {
    this.apiToken = config.apiToken;
  }

  /**
   * Update an issue's state (status)
   */
  async updateIssueState(issueId: string, stateId: string): Promise<IssueUpdateResult> {
    const mutation = `
      mutation IssueUpdate($issueId: String!, $stateId: String!) {
        issueUpdate(id: $issueId, input: { stateId: $stateId }) {
          success
          issue {
            id
            identifier
            state {
              id
              name
            }
          }
        }
      }
    `;

    try {
      const result = await this.executeQuery<{
        issueUpdate: {
          success: boolean;
          issue: { id: string; identifier: string; state: { id: string; name: string } };
        };
      }>(mutation, { issueId, stateId });

      if (result.issueUpdate?.success) {
        this.clientLogger.info(
          { issueId, stateId, newState: result.issueUpdate.issue.state.name },
          'Linear issue state updated'
        );
        return {
          success: true,
          issueId: result.issueUpdate.issue.id,
          newState: result.issueUpdate.issue.state,
        };
      }

      return { success: false, error: 'Update returned success: false' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.clientLogger.error({ error, issueId, stateId }, 'Failed to update Linear issue state');
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Create a comment on an issue
   */
  async createComment(issueId: string, body: string): Promise<CommentCreateResult> {
    const mutation = `
      mutation CommentCreate($issueId: String!, $body: String!) {
        commentCreate(input: { issueId: $issueId, body: $body }) {
          success
          comment {
            id
            body
          }
        }
      }
    `;

    try {
      const result = await this.executeQuery<{
        commentCreate: {
          success: boolean;
          comment: { id: string; body: string };
        };
      }>(mutation, { issueId, body });

      if (result.commentCreate?.success) {
        this.clientLogger.info(
          { issueId, commentId: result.commentCreate.comment.id },
          'Comment created on Linear issue'
        );
        return {
          success: true,
          commentId: result.commentCreate.comment.id,
        };
      }

      return { success: false, error: 'Comment creation returned success: false' };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.clientLogger.error({ error, issueId }, 'Failed to create Linear comment');
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Get workflow states for a team
   * Useful for resolving state names to IDs
   */
  async getWorkflowStates(teamId: string): Promise<WorkflowState[]> {
    const query = `
      query WorkflowStates($teamId: String!) {
        team(id: $teamId) {
          states {
            nodes {
              id
              name
              type
            }
          }
        }
      }
    `;

    try {
      const result = await this.executeQuery<{
        team: { states: { nodes: WorkflowState[] } };
      }>(query, { teamId });

      return result.team?.states?.nodes || [];
    } catch (error) {
      this.clientLogger.error({ error, teamId }, 'Failed to get workflow states');
      return [];
    }
  }

  /**
   * Get issue details
   */
  async getIssue(issueId: string): Promise<{
    id: string;
    identifier: string;
    title: string;
    state: { id: string; name: string };
    team: { id: string; name: string };
  } | null> {
    const query = `
      query Issue($issueId: String!) {
        issue(id: $issueId) {
          id
          identifier
          title
          state {
            id
            name
          }
          team {
            id
            name
          }
        }
      }
    `;

    try {
      const result = await this.executeQuery<{
        issue: {
          id: string;
          identifier: string;
          title: string;
          state: { id: string; name: string };
          team: { id: string; name: string };
        } | null;
      }>(query, { issueId });

      return result.issue;
    } catch (error) {
      this.clientLogger.error({ error, issueId }, 'Failed to get issue details');
      return null;
    }
  }

  /**
   * Execute a GraphQL query with retry logic
   */
  private async executeQuery<T>(
    query: string,
    variables: Record<string, unknown>
  ): Promise<T> {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const response = await fetch(LINEAR_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': this.apiToken, // Linear uses plain token, not Bearer
          },
          body: JSON.stringify({ query, variables }),
        });

        // Handle rate limiting
        if (response.status === 429) {
          const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10);
          const delay = retryAfter * 1000 * Math.pow(2, attempt);
          this.clientLogger.warn(
            { retryAfter, attempt },
            'Rate limited by Linear API, waiting before retry'
          );
          await this.sleep(delay);
          continue;
        }

        if (!response.ok) {
          throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json() as { data?: T; errors?: Array<{ message: string }> };

        if (data.errors && data.errors.length > 0) {
          throw new Error(`GraphQL errors: ${data.errors.map(e => e.message).join(', ')}`);
        }

        if (!data.data) {
          throw new Error('No data returned from Linear API');
        }

        return data.data;
      } catch (error) {
        lastError = error as Error;
        this.clientLogger.warn(
          { error, attempt, maxRetries },
          'Linear API request failed, may retry'
        );

        // Only retry on network errors or rate limits
        if (attempt < maxRetries - 1) {
          await this.sleep(1000 * Math.pow(2, attempt));
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
