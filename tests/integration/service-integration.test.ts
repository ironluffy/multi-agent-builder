import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { BudgetService } from '../../src/services/BudgetService.js';
import { SharedQueue } from '../../src/infrastructure/SharedQueue.js';
import { BudgetRepository } from '../../src/database/repositories/BudgetRepository.js';
import { MessageRepository } from '../../src/database/repositories/MessageRepository.js';
import { AgentRepository } from '../../src/database/repositories/AgentRepository.js';

describe('Service Integration Tests', () => {
  describe('BudgetService', () => {
    it('should be instantiable', () => {
      const service = new BudgetService();
      expect(service).toBeDefined();
    });
  });

  describe('SharedQueue', () => {
    it('should be instantiable', () => {
      const queue = new SharedQueue();
      expect(queue).toBeDefined();
      queue.stopCleanupScheduler();
    });
  });

  describe('Repositories', () => {
    it('should instantiate BudgetRepository', () => {
      const repo = new BudgetRepository();
      expect(repo).toBeDefined();
    });

    it('should instantiate MessageRepository', () => {
      const repo = new MessageRepository();
      expect(repo).toBeDefined();
    });

    it('should instantiate AgentRepository', () => {
      const repo = new AgentRepository();
      expect(repo).toBeDefined();
    });
  });
});
